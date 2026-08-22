import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { GoalId } from '@deepseek-ai/dsh-goal'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

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
import {
  createNaturalRunTrialFailure,
  readNaturalRunTrialManifest,
} from './natural-run-trial.js'
import type {
  NaturalRunTrialFailureCode,
  NaturalRunTrialReceipt,
  NaturalRunTrialSettledReceipt,
} from './natural-run-trial.js'

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

export interface NaturalRunTrialResumeConfig extends ResumeConfig {
  readonly trialManifestDigest: `sha256:${string}`
  readonly trialManifestPath: string
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

type ResumeReceipt = Receipt | GoalLiveSmokeReceipt | NaturalRunTrialReceipt

const RUN_SKILL_BINDING_FAILURE_CODES = [
  'run-binding-precondition-failed',
  'skill-unavailable',
  'skill-not-model-invocable',
  'run-binding-persistence-failed',
] as const

type NaturalParentSnapshotFailureCode = Extract<
  typeof RUN_SKILL_BINDING_FAILURE_CODES[number],
  'run-binding-precondition-failed' | 'skill-unavailable' | 'skill-not-model-invocable'
>

class NaturalParentSnapshotError extends Error {
  readonly code: NaturalParentSnapshotFailureCode

  constructor(code: NaturalParentSnapshotFailureCode) {
    super('Natural Run parent snapshot precondition failed')
    this.code = code
  }
}

interface SnapshotFilesystemTarget {
  readonly targetKey: unknown
}

interface SnapshotFilesystemEntry {
  readonly name: string
  readonly target: SnapshotFilesystemTarget
  readonly type: 'directory' | 'file' | 'other'
}

interface SnapshotFilesystem {
  resolve(path: string, options: { readonly cwd?: string }): Promise<SnapshotFilesystemTarget>
  listDir(target: SnapshotFilesystemTarget): Promise<readonly SnapshotFilesystemEntry[]>
}

type ResolvedSkill = NonNullable<Awaited<ReturnType<Context['skills']['get']>>>

function snapshotFilesystem(value: unknown): SnapshotFilesystem {
  if (typeof value !== 'object' || value === null) throw new Error('filesystem unavailable')
  const candidate = value as Partial<SnapshotFilesystem>
  if (typeof candidate.resolve !== 'function' || typeof candidate.listDir !== 'function') {
    throw new Error('filesystem unavailable')
  }
  return candidate as SnapshotFilesystem
}

async function registerNaturalParentSnapshot(
  raw: ResolvedSkill | undefined,
  skills: Pick<Context['skills'], 'register'>,
  filesystemValue: unknown,
  cwd: string | undefined,
): Promise<void> {
  if (raw === undefined) throw new NaturalParentSnapshotError('skill-unavailable')
  if (!raw.invocation.modelInvocable) {
    throw new NaturalParentSnapshotError('skill-not-model-invocable')
  }
  if (raw.provider !== 'filesystem') {
    return
  }
  if (
    raw.resourceBase?.kind !== 'directory'
    || typeof raw.resourceBase.path !== 'string'
    || typeof raw.path !== 'string'
  ) {
    throw new NaturalParentSnapshotError('run-binding-precondition-failed')
  }
  const filesystem = snapshotFilesystem(filesystemValue)
  const resolveOptions = cwd === undefined ? {} : { cwd }
  const [resourceBase, skillPath] = await Promise.all([
    filesystem.resolve(raw.resourceBase.path, resolveOptions),
    filesystem.resolve(raw.path, resolveOptions),
  ])
  const entries = await filesystem.listDir(resourceBase)
  if (
    entries.length !== 1
    || entries[0]?.name !== 'SKILL.md'
    || entries[0]?.type !== 'file'
    || entries[0].target.targetKey !== skillPath.targetKey
  ) {
    throw new NaturalParentSnapshotError('run-binding-precondition-failed')
  }
  skills.register({
    name: raw.name,
    description: raw.description,
    ...(raw.whenToUse === undefined ? {} : { whenToUse: raw.whenToUse }),
    invocation: raw.invocation,
    source: raw.source,
    provider: raw.provider,
    content: raw.content,
  })
}

function runSkillBindingFailureCode(error: unknown): NaturalRunTrialFailureCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { readonly code?: unknown }).code
  return typeof code === 'string'
    && (RUN_SKILL_BINDING_FAILURE_CODES as readonly string[]).includes(code)
    ? code as NaturalRunTrialFailureCode
    : undefined
}

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

function sessionDigest(events: readonly SessionEvent[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

function naturalUsage(events: readonly SessionEvent[]): NaturalRunTrialSettledReceipt['usage'] {
  const assistantMessages = events.filter(event => event.type === 'assistant/message')
  const toolCalls = events.filter(event => event.type === 'tool/call').length
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let reasoningTokens = 0
  let hasUsage = false
  for (const event of assistantMessages) {
    const usage = event.data.usage
    if (usage === undefined) continue
    hasUsage = true
    inputTokens += usage.inputTokens ?? 0
    outputTokens += usage.outputTokens ?? 0
    cacheReadTokens += usage.cacheReadTokens ?? 0
    cacheWriteTokens += usage.cacheWriteTokens ?? 0
    reasoningTokens += usage.reasoningTokens ?? 0
  }
  return {
    modelRequests: assistantMessages.length,
    toolCalls,
    ...(hasUsage ? {
      tokens: {
        inputTokens,
        outputTokens,
        ...(cacheReadTokens === 0 ? {} : { cacheReadTokens }),
        ...(cacheWriteTokens === 0 ? {} : { cacheWriteTokens }),
        ...(reasoningTokens === 0 ? {} : { reasoningTokens }),
      },
    } : {}),
    exactCny: 'unavailable',
  }
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

function isNaturalRunTrial(
  config: ResumeConfig | LiveSmokeResumeConfig | NaturalRunTrialResumeConfig,
): config is NaturalRunTrialResumeConfig {
  return 'trialManifestPath' in config
    && typeof config.trialManifestPath === 'string'
    && typeof config.trialManifestDigest === 'string'
}

function hasPartialNaturalRunTrial(
  config: ResumeConfig | LiveSmokeResumeConfig | NaturalRunTrialResumeConfig,
): boolean {
  return !isNaturalRunTrial(config) && (
    ('trialManifestPath' in config && config.trialManifestPath !== undefined)
    || ('trialManifestDigest' in config && config.trialManifestDigest !== undefined)
  )
}

function settledTrialGoal(goal: ReturnType<Context['goals']['get']>) {
  if (
    goal === undefined ||
    !['paused', 'blocked', 'complete'].includes(goal.phase)
  ) {
    throw new Error('Natural Run trial Goal did not settle')
  }
  return {
    id: String(goal.id),
    revision: goal.revision,
    phase: goal.phase as 'paused' | 'blocked' | 'complete',
  }
}

async function runNaturalRunTrial(
  ctx: Context,
  config: NaturalRunTrialResumeConfig,
  dependencies: LiveGoalResumeDependencies = {},
): Promise<NaturalRunTrialReceipt> {
  let failureCode: NaturalRunTrialFailureCode = 'manifest-revalidation-failed'
  let preTurn = true
  try {
    const trial = readNaturalRunTrialManifest(
      config.trialManifestPath,
      config.trialManifestDigest,
    )
    delete process.env.TIANWEN_RESUME_TRIAL_MANIFEST_PATH
    delete process.env.TIANWEN_RESUME_TRIAL_MANIFEST_DIGEST
    if (trial.manifest.goalId !== config.goalId) {
      throw new Error('Natural Run trial manifest Goal does not match')
    }
    failureCode = 'services-unavailable'
    const defaultModel = ctx.get('agentDefaultModel') as {
      currentSelection(): ModelSelection
    } | undefined
    const evidence = ctx.get('tianwenEvidence') as {
      project(session: Session): readonly {
        readonly evidenceId: `sha256:${string}`
        readonly source: { readonly callSeq: number }
        readonly action: {
          readonly argumentsDigest: `sha256:${string}`
          readonly toolName: string
        }
      }[]
    } | undefined
    const learning = ctx.get('tianwenLearningIntake') as {
      bindRunWithSkill(
        agent: unknown,
        input: {
          readonly acceptanceContract: typeof trial.manifest.acceptanceContract
          readonly acceptanceSubjectDigest: `sha256:${string}`
          readonly goalRef: string
          readonly scopeKey: string
          readonly taskRef: string
        },
        skillName: string,
        skills: Pick<Context['skills'], 'get'>,
      ): Promise<{ readonly runId: `run:${string}` }>
      consumeOutcome(session: Session, runId: `run:${string}`): {
        readonly acceptanceEvidenceId?: `sha256:${string}`
        readonly decision: NaturalRunTrialSettledReceipt['learning']['decision']
        readonly ticketId?: string
      }
      recordSkillUse(session: Session, runId: `run:${string}`): {
      readonly decision: 'recorded' | 'no-use-proof'
    }
    } | undefined
    if (defaultModel === undefined || evidence === undefined || learning === undefined) {
      throw new Error('Tianwen natural Run services are unavailable')
    }
    const selection = defaultModel.currentSelection()
    failureCode = 'agent-resume-failed'
    const handle = await ctx.agents.resume({
      resumeSessionId: SessionId(config.sessionId),
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: agentCtx => {
        installModelSelection(agentCtx, { current: selection, assembled: undefined })
      },
    })
    try {
      failureCode = 'session-goal-preflight-failed'
      await new Promise<void>(resolve => setImmediate(resolve))
      if (String(handle.agent.id) !== config.sessionId) {
        throw new Error('Session changed after trial preflight')
      }
      const current = validateGoal(config, ctx.goals.get(handle.agent))
      if (handle.agent.session.events.some(event => event.type === 'turn/start')) {
        throw new Error('Natural Run trial requires the first DSH Turn')
      }
      failureCode = 'verifier-unavailable'
      if (!handle.agent.ctx.tools.schemas(handle.agent).some(tool =>
        tool.name === trial.manifest.acceptanceContract.toolName)) {
        throw new Error('Natural Run trial verifier is unavailable')
      }
      failureCode = 'run-binding-precondition-failed'
      const beforeBinding = sessionDigest(handle.agent.session.events)
      let binding: { readonly runId: `run:${string}` } | undefined
      try {
        await handle.agent.ctx.inject(['skills'], async injectedCtx => {
          const raw = await injectedCtx.skills.get(trial.manifest.parentSkillName, {
            cwd: handle.agent.session.header.cwd,
            scope: handle.agent,
          })
          const bind = async (filesystemValue: unknown) => {
            await registerNaturalParentSnapshot(
              raw,
              injectedCtx.skills,
              filesystemValue,
              handle.agent.session.header.cwd,
            )
            binding = await learning.bindRunWithSkill(handle.agent, {
              goalRef: `dsh-goal:${String(current.id)}@${current.revision}`,
              taskRef: trial.manifest.taskRef,
              scopeKey: trial.manifest.scopeKey,
              acceptanceContract: trial.manifest.acceptanceContract,
              acceptanceSubjectDigest: trial.acceptanceSubjectDigest,
            }, trial.manifest.parentSkillName, injectedCtx.skills)
          }
          if (raw?.provider === 'filesystem') {
            await handle.agent.ctx.inject(['fs'], filesystemCtx => bind(filesystemCtx.get('fs')))
            return
          }
          await bind(undefined)
        })
      } catch (error) {
        failureCode = runSkillBindingFailureCode(error) ?? 'pre-turn-internal-error'
        throw error
      }
      if (binding === undefined || sessionDigest(handle.agent.session.events) !== beforeBinding) {
        throw new Error('Natural Run trial binding changed the DSH Session')
      }
      const bound = binding
      const eventCountBefore = handle.agent.session.events.length
      preTurn = false
      ctx.goals.resume(handle.agent, {
        id: GoalId(String(current.id)), revision: current.revision,
      })
      const settled = settledTrialGoal(await waitForDisarmed(ctx, handle.agent))
      const receipt = (
        status: NaturalRunTrialSettledReceipt['status'],
        learningResult: NaturalRunTrialSettledReceipt['learning'],
        acceptanceEvidenceId?: `sha256:${string}`,
        governanceDigest = sessionDigest(handle.agent.session.events),
      ): NaturalRunTrialSettledReceipt => ({
      schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
      status,
      goal: settled,
      session: {
        id: String(handle.agent.id),
        eventCountDelta: handle.agent.session.events.length - eventCountBefore,
        unchangedByGovernance:
          sessionDigest(handle.agent.session.events) === governanceDigest,
      },
      run: {
        runId: bound.runId,
        acceptanceSubjectDigest: trial.acceptanceSubjectDigest,
        ...(acceptanceEvidenceId === undefined ? {} : { acceptanceEvidenceId }),
      },
      learning: learningResult,
      usage: naturalUsage(handle.agent.session.events.slice(eventCountBefore)),
    })
      const flush = dependencies.flush ?? (session => ctx.sessions.flush(session))
      try {
      if (!await flush(handle.agent.session)) {
        return receipt('settled-with-learning-error', {
          decision: 'not-recorded', reason: 'persistence-unavailable',
          skillUse: 'not-attempted',
        })
      }
      } catch {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'persistence-unavailable',
        skillUse: 'not-attempted',
      })
      }
      const flushedDigest = sessionDigest(handle.agent.session.events)
    let finalEvidence: ReturnType<typeof evidence.project>[number] | undefined
    try {
      finalEvidence = evidence.project(handle.agent.session)
        .filter(item => item.action.toolName === trial.manifest.acceptanceContract.toolName)
        .sort((left, right) => left.source.callSeq - right.source.callSeq)
        .at(-1)
    } catch {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'evidence-projection-failed',
        skillUse: 'not-attempted',
      }, undefined, flushedDigest)
    }
    if (sessionDigest(handle.agent.session.events) !== flushedDigest) {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'governance-session-changed',
        skillUse: 'not-attempted',
      }, undefined, flushedDigest)
    }
    if (finalEvidence === undefined) {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'verifier-evidence-missing',
        skillUse: 'not-attempted',
      }, undefined, flushedDigest)
    }
    if (finalEvidence.action.argumentsDigest !== trial.acceptanceSubjectDigest) {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'verifier-call-mismatch',
        skillUse: 'not-attempted',
      }, finalEvidence.evidenceId, flushedDigest)
    }
    let outcome: ReturnType<typeof learning.consumeOutcome>
    try {
      outcome = learning.consumeOutcome(handle.agent.session, bound.runId)
    } catch {
      return receipt('settled-with-learning-error', {
        decision: 'not-recorded', reason: 'outcome-intake-failed',
        skillUse: 'not-attempted',
      }, finalEvidence.evidenceId, flushedDigest)
    }
    if (sessionDigest(handle.agent.session.events) !== flushedDigest) {
      return receipt('settled-with-learning-error', {
        decision: outcome.decision, reason: 'governance-session-changed',
        skillUse: 'not-attempted',
        ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      }, finalEvidence.evidenceId, flushedDigest)
    }
    if (outcome.acceptanceEvidenceId !== finalEvidence.evidenceId) {
      return receipt('settled-with-learning-error', {
        decision: outcome.decision, reason: 'outcome-evidence-mismatch',
        skillUse: 'not-attempted',
        ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      }, finalEvidence.evidenceId, flushedDigest)
    }
    let skillUse: ReturnType<typeof learning.recordSkillUse>
    try {
      skillUse = learning.recordSkillUse(handle.agent.session, bound.runId)
    } catch {
      return receipt('settled-with-learning-error', {
        decision: outcome.decision, reason: 'skill-use-intake-failed',
        skillUse: 'not-attempted',
        ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      }, finalEvidence.evidenceId, flushedDigest)
    }
    if (sessionDigest(handle.agent.session.events) !== flushedDigest) {
      return receipt('settled-with-learning-error', {
        decision: outcome.decision, reason: 'governance-session-changed',
        skillUse: 'not-attempted',
        ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      }, finalEvidence.evidenceId, flushedDigest)
    }
      return receipt('settled', {
      decision: outcome.decision,
      skillUse: skillUse.decision,
      ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      }, finalEvidence.evidenceId, flushedDigest)
    } finally {
      await handle.dispose()
    }
  } catch (error) {
    if (preTurn) return createNaturalRunTrialFailure(failureCode, config)
    throw error
  }
}

export async function runGoalResume(ctx: Context,
  config: ResumeConfig | LiveSmokeResumeConfig | NaturalRunTrialResumeConfig,
  dependencies?: LiveGoalResumeDependencies): Promise<ResumeReceipt> {
  requireConfig(config)
  if (hasPartialNaturalRunTrial(config)) {
    throw new Error('Natural Run trial manifest handoff is incomplete')
  }
  if ('liveSmoke' in config && config.liveSmoke) return runLiveGoalResume(ctx, config, dependencies)
  if (isNaturalRunTrial(config)) return runNaturalRunTrial(ctx, config, dependencies)
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
export const inject = ['agentDefaultModel', 'agents', 'credentials', 'goals', 'llm', 'sessions', 'tianwenEvidence', 'tianwenLearningIntake'] as const

export function apply(ctx: Context,
  config: ResumeConfig | LiveSmokeResumeConfig | NaturalRunTrialResumeConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) throw new Error('tianwen-resume-runner: appExit is unavailable')
  runGoalResume(ctx, config).then(receipt => {
    const liveSmoke = 'liveSmoke' in config && config.liveSmoke
    const naturalTrial = isNaturalRunTrial(config)
    if (liveSmoke) {
      const strictReceipt = receipt as GoalLiveSmokeReceipt
      process.stdout.write(`${JSON.stringify(strictReceipt)}\n`)
      exit(strictReceipt.status === 'passed' ? 0 : 1)
      return
    }
    if (naturalTrial) {
      const naturalReceipt = receipt as NaturalRunTrialReceipt
      process.stdout.write(`${JSON.stringify(naturalReceipt)}\n`)
      exit(naturalReceipt.status === 'pre-turn-failed' ? 1 : 0)
      return
    }
    const ordinary = receipt as Receipt
    process.stdout.write(config.json ? `${JSON.stringify(ordinary)}\n`
      : `Resumed Goal ${ordinary.goal.id} (${ordinary.session.eventCountDelta} events)\n`)
    exit(0)
  }, error => {
    if (hasPartialNaturalRunTrial(config)) {
      process.stderr.write('tianwen resume: natural Run trial failed\n')
      exit(1)
      return
    }
    if ('liveSmoke' in config && config.liveSmoke) {
      process.stdout.write(`${JSON.stringify(createGoalLiveSmokeFailure('internal-error'))}\n`)
      exit(1)
      return
    }
    if (isNaturalRunTrial(config)) {
      process.stderr.write('tianwen resume: natural Run trial failed\n')
      exit(1)
      return
    }
    process.stderr.write(`tianwen resume: ${error instanceof Error ? error.message : 'failed'}\n`)
    exit(1)
  })
}
