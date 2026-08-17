import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { GoalId } from '@deepseek-ai/dsh-goal'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'

import {
  LIVE_GOAL_LIMITS,
  LIVE_GOAL_MARKER,
  LIVE_GOAL_MODEL,
  LIVE_GOAL_PROVIDER,
  LIVE_GOAL_TOOLS,
  assessLiveGoalEvents,
  createGoalLiveSmokeFailure,
} from './goal-live-smoke.js'
import type { GoalLiveSmokeReceipt, GoalLiveSmokeSuccessReceipt } from './goal-live-smoke.js'

interface ResumeConfig {
  readonly goalId: string
  readonly json: boolean
  readonly nonce: string
  readonly revision: number
  readonly sessionId: string
}

export interface LiveSmokeResumeConfig extends ResumeConfig {
  readonly liveSmoke: true
  readonly evolutionRoot: string
  readonly startedAtMs: number
}

export interface LiveGoalResumeDependencies {
  readonly flush?: (session: Session) => Promise<boolean>
}

interface Receipt {
  readonly schemaVersion: 'tianwen.goal-resume.v1'
  readonly goal: { readonly id: string, readonly revision: number, readonly phase: string, readonly roundsStarted: number }
  readonly session: {
    readonly id: string
    readonly eventCountAfter: number
    readonly eventCountBefore: number
    readonly eventCountDelta: number
    readonly modelRequestsDelta: number
  }
}

type ResumeReceipt = Receipt | GoalLiveSmokeReceipt

function requireConfig(config: ResumeConfig): void {
  if (!config.goalId || !config.sessionId || !config.nonce ||
    !Number.isSafeInteger(config.revision) || config.revision < 1) {
    throw new Error('invalid Tianwen resume invocation')
  }
}

function validateGoal(config: ResumeConfig, goal: ReturnType<Context['goals']['get']>): NonNullable<typeof goal> {
  if (goal === undefined || String(goal.id) !== config.goalId || goal.revision !== config.revision) {
    throw new Error('Goal changed after preflight')
  }
  if (!['active', 'paused', 'blocked'].includes(goal.phase) ||
    goal.roundsStarted >= goal.maxGoalRounds || goal.activation !== 'disarmed') {
    throw new Error('Goal is no longer resumable')
  }
  return goal
}

function ordinaryReceipt(goal: NonNullable<ReturnType<Context['goals']['get']>>, sessionId: string,
  eventCountBefore: number, eventCountAfter: number, modelRequestsDelta: number): Receipt {
  return {
    schemaVersion: 'tianwen.goal-resume.v1',
    goal: { id: String(goal.id), revision: goal.revision, phase: goal.phase, roundsStarted: goal.roundsStarted },
    session: { id: sessionId, eventCountAfter, eventCountBefore,
      eventCountDelta: eventCountAfter - eventCountBefore, modelRequestsDelta },
  }
}

async function waitForDisarmed(ctx: Context, agent: Parameters<Context['goals']['get']>[0]) {
  while (true) {
    await agent.whenIdle()
    const goal = ctx.goals.get(agent)
    if (goal !== undefined && goal.activation === 'disarmed') return goal
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

function requestCount(events: readonly { readonly type: string }[]): number {
  return events.filter(event => event.type === 'step/start').length
}

function snapshotTree(root: string): Map<string, string> {
  const snapshot = new Map<string, string>()
  const visit = (directory: string) => {
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' }) } catch { return }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        snapshot.set(`${relative(root, path).replaceAll('\\', '/')}/`, '')
        visit(path)
      }
      else if (entry.isFile()) snapshot.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path).toString('base64'))
    }
  }
  visit(root)
  return snapshot
}

function treesEqual(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size && [...left].every(([path, bytes]) => right.get(path) === bytes)
}

function fileBytes(path: string): string | undefined {
  try { return readFileSync(path).toString('base64') } catch { return undefined }
}

function exactEmptyObject(value: unknown): value is Record<string, never> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

function renderLiveGoalAuthority(goal: ReturnType<Context['goals']['get']>): string {
  if (goal === undefined) throw new Error('live Goal authority is unavailable')
  return [
    `Current Goal ${String(goal.id)} revision ${goal.revision}.`,
    'Call tianwen_smoke_action with {} exactly once.',
    'After its successful result, call update_goal with this exact id and revision and action complete.',
    `Then reply exactly ${LIVE_GOAL_MARKER}.`,
  ].join('\n')
}

interface StrictState { actionStarted: boolean, actionSucceeded: boolean, updateStarted: boolean }

function validateLiveToolExecution(execution: {
  readonly name: string
  readonly arguments: unknown
  readonly agent?: Parameters<Context['goals']['get']>[0]
}, ctx: Context, state: StrictState): string | undefined {
  if (execution.name === LIVE_GOAL_TOOLS[0]) {
    if (state.actionStarted || !exactEmptyObject(execution.arguments)) return 'live Goal action contract rejected'
    state.actionStarted = true
    return undefined
  }
  if (execution.name !== LIVE_GOAL_TOOLS[1] || !state.actionSucceeded || state.updateStarted || execution.agent === undefined) {
    return 'live Goal tool order rejected'
  }
  const goal = ctx.goals.get(execution.agent)
  const args = execution.arguments
  if (goal === undefined || args === null || typeof args !== 'object' || Array.isArray(args) ||
    !Object.keys(args).every(key => ['goal_id', 'revision', 'action'].includes(key)) ||
    (args as Record<string, unknown>).goal_id !== String(goal.id) ||
    (args as Record<string, unknown>).revision !== goal.revision ||
    (args as Record<string, unknown>).action !== 'complete') return 'live Goal update contract rejected'
  state.updateStarted = true
  return undefined
}

function expectedToolNames(names: readonly string[]): boolean {
  const expected = LIVE_GOAL_TOOLS.toSorted()
  return names.length === expected.length && names.every((name, index) => name === expected[index])
}

function liveServices(ctx: Context) {
  const defaultModel = ctx.get('agentDefaultModel') as { currentSelection(): ModelSelection } | undefined
  const credentials = ctx.get('credentials') as {
    describe(reference: ReturnType<typeof credentialRef>): Promise<{ configured: boolean, writable: boolean }>
  } | undefined
  return defaultModel === undefined || credentials === undefined ? undefined : { defaultModel, credentials }
}

async function runLiveGoalResume(ctx: Context, config: LiveSmokeResumeConfig,
  dependencies: LiveGoalResumeDependencies = {}): Promise<GoalLiveSmokeReceipt> {
  const fail = (failureCode: Parameters<typeof createGoalLiveSmokeFailure>[0], requestCountValue = 0) =>
    createGoalLiveSmokeFailure(failureCode, { now: new Date(config.startedAtMs), requestCount: requestCountValue, retryCount: 0 })
  if (!Number.isSafeInteger(config.startedAtMs) || config.startedAtMs < 0) return fail('preflight-rejected')
  const deadlineMs = config.startedAtMs + LIVE_GOAL_LIMITS.timeoutMs
  const services = liveServices(ctx)
  if (services === undefined) return fail('preflight-rejected')
  const selection = services.defaultModel.currentSelection()
  if (selection.provider !== LIVE_GOAL_PROVIDER || selection.model !== LIVE_GOAL_MODEL) return fail('selection-mismatch')
  try {
    if (!(await services.credentials.describe(credentialRef('DEEPSEEK_API_KEY'))).configured) return fail('credential-missing')
  } catch { return fail('credential-missing') }
  try {
    const resolved = await ctx.llm.resolveCallConfig({ provider: LIVE_GOAL_PROVIDER, model: LIVE_GOAL_MODEL,
      reasoningEffort: ReasoningEffortId('off'), maxTokens: LIVE_GOAL_LIMITS.maxOutputTokensPerRequest })
    if (resolved.provider !== LIVE_GOAL_PROVIDER || resolved.model !== LIVE_GOAL_MODEL ||
      resolved.reasoningEffort !== ReasoningEffortId('off') || resolved.maxTokens !== LIVE_GOAL_LIMITS.maxOutputTokensPerRequest) {
      return fail('selection-mismatch')
    }
  } catch { return fail('selection-mismatch') }

  const evolutionBefore = snapshotTree(config.evolutionRoot)
  const championBefore = fileBytes(join(config.evolutionRoot, 'champion.json'))
  const flush = dependencies.flush ?? (session => ctx.sessions.flush(session))
  let requestCountValue = 0
  let requestLimitExceeded = false
  let timedOut = false
  let providerFailed = false
  const state: StrictState = { actionStarted: false, actionSucceeded: false, updateStarted: false }
  let handle: Awaited<ReturnType<Context['agents']['resume']>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    handle = await ctx.agents.resume({
      resumeSessionId: SessionId(config.sessionId),
      agentOptions: { provider: LIVE_GOAL_PROVIDER, model: LIVE_GOAL_MODEL, maxTokens: LIVE_GOAL_LIMITS.maxOutputTokensPerRequest },
      setup: agentCtx => {
        installModelSelection(agentCtx, { current: { provider: LIVE_GOAL_PROVIDER, model: LIVE_GOAL_MODEL,
          reasoningEffort: ReasoningEffortId('off') }, assembled: undefined })
        agentCtx.tools.presentAs('native')
        agentCtx.tools.restrict({ allow: [...LIVE_GOAL_TOOLS] })
        agentCtx.tools.guard(execution => validateLiveToolExecution(execution, ctx, state))
        agentCtx.on('tools/result', (execution, result) => {
          if (execution.name === LIVE_GOAL_TOOLS[0] && !result.isError) state.actionSucceeded = true
        })
        agentCtx.systemPrompt.section({ name: 'tianwen:live-goal-authority', order: 99,
          text: context => renderLiveGoalAuthority(context.agent === undefined ? undefined : ctx.goals.get(context.agent)) })
        agentCtx.on('agent/request', async (_payload, next) => {
          if (Date.now() >= deadlineMs) {
            timedOut = true
            throw new Error('live Goal deadline elapsed')
          }
          if (requestCountValue >= LIVE_GOAL_LIMITS.maxRequests) {
            requestLimitExceeded = true
            throw new Error('live Goal request limit')
          }
          requestCountValue += 1
          const resolved = await next()
          return { ...resolved, provider: LIVE_GOAL_PROVIDER, model: LIVE_GOAL_MODEL,
            reasoningEffort: ReasoningEffortId('off'), maxTokens: LIVE_GOAL_LIMITS.maxOutputTokensPerRequest }
        }, { prepend: true })
        agentCtx.on('agent/request-error', async () => undefined, { prepend: true })
        agentCtx.on('agent/error', () => { providerFailed = true })
      },
    })
    const activeHandle = handle
    await new Promise<void>(resolve => setImmediate(resolve))
    if (String(activeHandle.agent.id) !== config.sessionId) return fail('preflight-rejected', requestCountValue)
    if (!expectedToolNames(activeHandle.agent.ctx.tools.schemas(activeHandle.agent).map(tool => tool.name).toSorted())) {
      return fail('tool-contract-violated', requestCountValue)
    }
    if (Date.now() >= deadlineMs) {
      timedOut = true
      return fail('timeout', requestCountValue)
    }
    const before = activeHandle.agent.session.events.length
    const current = validateGoal(config, ctx.goals.get(activeHandle.agent))
    timer = setTimeout(() => {
      timedOut = true
      handle?.agent.cancel({ kind: 'hook', reason: 'tianwen-live-goal-timeout' })
    }, Math.max(0, deadlineMs - Date.now()))
    const resumed = ctx.goals.resume(activeHandle.agent, { id: GoalId(String(current.id)), revision: current.revision })
    const settled = await waitForDisarmed(ctx, activeHandle.agent)
    let flushed: boolean
    try { flushed = await flush(activeHandle.agent.session) } catch {
      return fail('persistence-unavailable', requestCountValue)
    }
    if (!flushed) return fail('persistence-unavailable', requestCountValue)
    if (timedOut) return fail('timeout', requestCountValue)
    if (requestLimitExceeded) return fail('request-limit-exceeded', requestCountValue)
    if (providerFailed) return fail('provider-error', requestCountValue)
    const assessed = assessLiveGoalEvents(String(activeHandle.agent.id), activeHandle.agent.session.events.slice(before), resumed)
    if (!assessed.ok) return fail(assessed.failureCode, requestCountValue)
    if (settled.phase !== 'complete') return fail('goal-not-complete', requestCountValue)
    const evidence = (ctx.get('tianwenEvidence') as { project(session: typeof activeHandle.agent.session): readonly {
      evidenceId: string, action: { toolName: string }, outcome: { status: string }
    }[] } | undefined)?.project(activeHandle.agent.session)
      .filter(item => LIVE_GOAL_TOOLS.includes(item.action.toolName as typeof LIVE_GOAL_TOOLS[number]) && item.outcome.status === 'complete')
      .map(item => ({ evidenceId: item.evidenceId, toolName: item.action.toolName as typeof LIVE_GOAL_TOOLS[number], outcome: 'complete' as const }))
    if (evidence === undefined || evidence.length !== 2) return fail('tool-contract-violated', requestCountValue)
    const evolutionUnchanged = treesEqual(evolutionBefore, snapshotTree(config.evolutionRoot))
    const championUnchanged = championBefore === fileBytes(join(config.evolutionRoot, 'champion.json'))
    if (!evolutionUnchanged || !championUnchanged) return fail('internal-error', requestCountValue)
    const result: GoalLiveSmokeSuccessReceipt = {
      schemaVersion: 'tianwen.goal-live-smoke.v1', status: 'passed', timestamp: new Date(config.startedAtMs).toISOString(),
      provider: LIVE_GOAL_PROVIDER, model: LIVE_GOAL_MODEL, limits: LIVE_GOAL_LIMITS,
      requestCount: requestCountValue, retryCount: 0, markerMatched: true,
      goal: { id: String(settled.id), revision: settled.revision, phase: 'complete', roundsStarted: settled.roundsStarted },
      session: { id: String(activeHandle.agent.id), eventCountDelta: activeHandle.agent.session.events.length - before },
      usage: assessed.usage, evidence,
      governance: { evolutionUnchanged: true, championUnchanged: true },
    }
    return result
  } catch {
    return fail(timedOut ? 'timeout' : requestLimitExceeded
      ? 'request-limit-exceeded' : 'provider-error', requestCountValue)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (handle !== undefined) {
      try {
        if (ctx.goals.get(handle.agent)?.activation === 'armed') ctx.goals.disarm(handle.agent)
      } catch {}
      try { await handle.agent.whenIdle() } catch {}
      try { await flush(handle.agent.session) } catch {}
      try { await handle.dispose() } catch {}
    }
  }
}

export async function runGoalResume(ctx: Context, config: ResumeConfig | LiveSmokeResumeConfig,
  dependencies?: LiveGoalResumeDependencies): Promise<ResumeReceipt> {
  requireConfig(config)
  if ('liveSmoke' in config && config.liveSmoke) return runLiveGoalResume(ctx, config, dependencies)
  const defaultModel = ctx.get('agentDefaultModel') as { currentSelection(): ModelSelection } | undefined
  if (defaultModel === undefined) throw new Error('Tianwen Profile has no default model')
  const selection = defaultModel.currentSelection()
  const handle = await ctx.agents.resume({
    resumeSessionId: SessionId(config.sessionId), agentOptions: { provider: selection.provider, model: selection.model },
    setup: agentCtx => { installModelSelection(agentCtx, { current: selection, assembled: undefined }) },
  })
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    if (String(handle.agent.id) !== config.sessionId) throw new Error('Session changed after preflight')
    const eventCountBefore = handle.agent.session.events.length
    const requestCountBefore = requestCount(handle.agent.session.events)
    const current = validateGoal(config, ctx.goals.get(handle.agent))
    ctx.goals.resume(handle.agent, { id: GoalId(String(current.id)), revision: current.revision })
    const settled = await waitForDisarmed(ctx, handle.agent)
    await ctx.sessions.flush(handle.agent.session)
    if (settled.phase === 'active') throw new Error('Goal resume did not settle')
    return ordinaryReceipt(settled, config.sessionId, eventCountBefore, handle.agent.session.events.length,
      requestCount(handle.agent.session.events) - requestCountBefore)
  } finally { await handle.dispose() }
}

export const name = 'tianwen-resume-runner'
export const inject = ['agentDefaultModel', 'agents', 'credentials', 'goals', 'llm', 'sessions', 'tianwenEvidence'] as const

export function apply(ctx: Context, config: ResumeConfig | LiveSmokeResumeConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) throw new Error('tianwen-resume-runner: appExit is unavailable')
  runGoalResume(ctx, config).then(receipt => {
    const liveSmoke = 'liveSmoke' in config && config.liveSmoke
    if (liveSmoke) {
      const strictReceipt = receipt as GoalLiveSmokeReceipt
      process.stdout.write(`${JSON.stringify(strictReceipt)}\n`)
      exit(strictReceipt.status === 'passed' ? 0 : 1)
      return
    }
    const ordinary = receipt as Receipt
    process.stdout.write(config.json ? `${JSON.stringify(ordinary)}\n`
      : `Resumed Goal ${ordinary.goal.id} (${ordinary.session.eventCountDelta} events)\n`)
    exit(0)
  }, error => {
    if ('liveSmoke' in config && config.liveSmoke) {
      process.stdout.write(`${JSON.stringify(createGoalLiveSmokeFailure('internal-error'))}\n`)
      exit(1)
      return
    }
    process.stderr.write(`tianwen resume: ${error instanceof Error ? error.message : 'failed'}\n`)
    exit(1)
  })
}
