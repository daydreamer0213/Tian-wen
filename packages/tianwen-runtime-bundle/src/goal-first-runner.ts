import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isAbsolute, parse, resolve } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentSetup, ModelSelection } from '@deepseek-ai/dsh-agent'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

import {
  abandonGoalFirstTask,
  addGoalFirstGuidance,
  continueGoalFirstProgress,
  createGoalFirstProgress,
} from './goal-first-service.js'
import type { GoalFirstServiceDependencies } from './goal-first-service.js'
import type { LongGoalRecordV2 } from './long-goal-contract.js'
import {
  abandonBlockedLongGoalTask,
  appendLongGoalGuidance,
  bindGoalFirstLongGoalTask,
  bindLongGoalTask,
  createGoalFirstLongGoal,
  LongGoalIntegrityError,
  LongGoalRevisionConflictError,
  readLongGoal,
  readLongGoalStatus,
} from './long-goal.js'
import { runCurrentWebTask } from './long-goal-host.js'
import type {
  TianwenLongGoalRunDependencies,
  TianwenLongGoalHostRoots,
} from './long-goal-host.js'
import { runLongGoalPlannerTurn } from './long-goal-planner.js'
import type { LongGoalPlannerDependencies } from './long-goal-planner.js'
import { readGoalStatus } from './status.js'
import { readSettledTaskResult } from './settled-task-result.js'

export interface GoalFirstRunnerConfig {
  readonly context?: string
  readonly evolutionRoot: string
  readonly goalId?: string
  readonly json: boolean
  readonly objective?: string
  readonly operation: 'start' | 'continue' | 'guide' | 'abandon'
  readonly revision?: number
  readonly sessionsRoot: string
  readonly stateRoot: string
  readonly successCriteria?: string
  readonly text?: string
  readonly workspaceRoot: string
}

type AgentPresetService = {
  readonly defaultId: string
  mount(agentCtx: Context, agentPreset?: string): Promise<unknown>
}

type SessionPersistence = {
  list(): Promise<readonly {
    readonly id: unknown
    readonly cwd?: string
    readonly agentPreset?: string
  }[]>
  inspect(id: SessionId): Promise<{
    readonly meta: { readonly id: unknown }
    readonly events: readonly SessionEvent[]
  }>
}

export function requireLegacyV2GoalFirstRecord(record: ReturnType<typeof readLongGoal>): LongGoalRecordV2 {
  if (record.schemaVersion !== 'tianwen.long-goal.v2') {
    throw new LongGoalIntegrityError('Goal-first runner supports only v2 records')
  }
  return record
}

interface RunnerServices {
  readonly agentDefaultModel: { currentSelection(): ModelSelection }
  readonly agentPresets: AgentPresetService
  readonly sessionPersistence: SessionPersistence
}

function requireText(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`${name} is required`)
  return value
}

function requireRevision(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('revision must be a positive safe integer')
  }
  return value
}

function requireRoot(value: string, name: string): string {
  const resolved = resolve(value)
  if (!isAbsolute(value) || resolved === parse(resolved).root) {
    throw new Error(`${name} must be an absolute non-root path`)
  }
  return resolved
}

function requireConfig(config: GoalFirstRunnerConfig): void {
  const start = config.operation === 'start'
  const guide = config.operation === 'guide'
  if (!['start', 'continue', 'guide', 'abandon'].includes(config.operation)) {
    throw new Error('invalid goal-first operation')
  }
  requireRoot(config.stateRoot, 'stateRoot')
  requireRoot(config.sessionsRoot, 'sessionsRoot')
  requireRoot(config.evolutionRoot, 'evolutionRoot')
  const workspaceRoot = requireRoot(config.workspaceRoot, 'workspaceRoot')
  if (workspaceRoot !== realpathSync(process.cwd())) {
    throw new Error('workspaceRoot must match the canonical runner workspace')
  }
  if (start) {
    requireText(config.objective, 'objective')
    if (config.context !== undefined) requireText(config.context, 'context')
    if (config.successCriteria !== undefined) requireText(config.successCriteria, 'successCriteria')
    if (config.goalId !== undefined || config.revision !== undefined || config.text !== undefined) {
      throw new Error('invalid goal-first start invocation')
    }
    return
  }
  requireText(config.goalId, 'goalId')
  requireRevision(config.revision)
  if (config.objective !== undefined || config.context !== undefined || config.successCriteria !== undefined) {
    throw new Error('invalid goal-first mutation invocation')
  }
  if ((guide && config.text === undefined) || (!guide && config.text !== undefined)) {
    throw new Error('invalid goal-first guidance invocation')
  }
  if (guide) requireText(config.text, 'text')
}

function services(ctx: Context): RunnerServices {
  const agentDefaultModel = ctx.get('agentDefaultModel') as RunnerServices['agentDefaultModel'] | undefined
  const agentPresets = ctx.get('agentPresets') as AgentPresetService | undefined
  const sessionPersistence = ctx.get('sessionPersistence') as SessionPersistence | undefined
  if (agentDefaultModel === undefined || agentPresets === undefined || sessionPersistence === undefined) {
    throw new Error('Tianwen Goal-first Profile services are unavailable')
  }
  if (agentPresets.defaultId.trim().length === 0) {
    throw new Error('Tianwen Goal-first Profile has no configured Agent preset')
  }
  return { agentDefaultModel, agentPresets, sessionPersistence }
}

export function formatGoalFirstText(result: unknown): string {
  const value = result as {
    readonly action?: string
    readonly planning?: string
    readonly status: {
      readonly goal: {
        readonly id: string
        readonly phase: string
        readonly revision: number
        readonly objective: string
      }
    }
  }
  const goal = value.status.goal
  const action = value.action ?? value.planning ?? 'updated'
  const next = goal.phase === 'complete'
    ? 'Next: complete'
    : `Next: tianwen goal ${goal.phase === 'blocked' ? 'abandon' : 'continue'} --goal ${goal.id} --revision ${goal.revision}`
  return `${action}: Goal ${goal.id} [${goal.phase}] ${goal.objective}\n${next}\n`
}

async function flush(ctx: Context, agent: Agent): Promise<void> {
  if (!await ctx.sessions.flush(agent.session)) throw new Error('Session persistence is unavailable')
}

function plannerSetup(
  services: RunnerServices,
  selection: ModelSelection,
  agentPreset: string | undefined,
  setup: AgentSetup,
): AgentSetup {
  return async agentCtx => {
    const selectedPreset = agentPreset ?? agentCtx.agent?.session.header.agentPreset
    if (typeof selectedPreset !== 'string' || selectedPreset.trim().length === 0) {
      throw new LongGoalIntegrityError('Long Goal planner Session preset mismatch')
    }
    installModelSelection(agentCtx, { current: selection, assembled: undefined })
    await services.agentPresets.mount(agentCtx, selectedPreset)
    return setup(agentCtx)
  }
}

export async function runGoalFirst(
  ctx: Context,
  config: GoalFirstRunnerConfig,
): Promise<unknown> {
  requireConfig(config)
  const runnerServices = services(ctx)
  const roots: TianwenLongGoalHostRoots = {
    stateRoot: resolve(config.stateRoot),
    sessionsRoot: resolve(config.sessionsRoot),
    evolutionRoot: resolve(config.evolutionRoot),
  }
  const dshStatusTarget = {
    sessionsRoot: roots.sessionsRoot,
    evolutionRoot: roots.evolutionRoot,
  }
  const ownedTaskHandles = new Map<string, AgentHandle>()
  const listSessions = async () => (await runnerServices.sessionPersistence.list()).map(session => ({
    sessionId: String(session.id),
    ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
    ...(session.agentPreset === undefined ? {} : { agentPreset: session.agentPreset }),
  }))
  const createTaskAgent = async (cwd: string, agentPreset: string | undefined): Promise<AgentHandle> => {
    const selection = runnerServices.agentDefaultModel.currentSelection()
    const handle = await ctx.agents.create({
      sessionId: SessionId(randomUUID()),
      meta: { cwd, ...(agentPreset === undefined ? {} : { agentPreset }) },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: plannerSetup(runnerServices, selection, agentPreset, () => undefined),
    })
    ownedTaskHandles.set(String(handle.agent.session.id), handle)
    return handle
  }
  const runDependencies: TianwenLongGoalRunDependencies = {
    readLongGoal,
    readLongGoalStatus,
    bindLongGoalTask,
    bindGoalFirstLongGoalTask,
    listSessions,
    createSession: async ({ cwd, agentPreset }) => String((await createTaskAgent(cwd, agentPreset)).agent.session.id),
    attachedAgent: sessionId => ctx.agents.get(SessionId(sessionId)),
    createGoal: (agent, input): GoalView => ctx.goals.create(agent, input),
    readGoalRef: async (sessionId, goalId) => {
      const status = await readGoalStatus({
        goalId,
        sessionsRoot: roots.sessionsRoot,
        evolutionRoot: roots.evolutionRoot,
      })
      if (status.session.id !== sessionId || status.goal.id !== goalId) {
        throw new Error('Cold Long Goal Task Goal ref mismatch')
      }
      return {
        id: status.goal.id,
        revision: status.goal.revision,
        phase: status.goal.phase,
        ...(status.goal.blockedReason === undefined ? {} : { blockedReason: status.goal.blockedReason }),
      }
    },
    resumeColdGoal: async ({ sessionId, goalId, revision }) => {
      const selection = runnerServices.agentDefaultModel.currentSelection()
      const handle = await ctx.agents.resume({
        resumeSessionId: SessionId(sessionId),
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: plannerSetup(runnerServices, selection, undefined, () => undefined),
      })
      if (String(handle.agent.session.id) !== sessionId || String(ctx.goals.get(handle.agent)?.id) !== goalId ||
        ctx.goals.get(handle.agent)?.revision !== revision) {
        await handle.dispose()
        throw new Error('Resumed Long Goal Task Goal mismatch')
      }
      ownedTaskHandles.set(sessionId, handle)
    },
    flushSession: agent => flush(ctx, agent),
  }
  const plannerDependencies: LongGoalPlannerDependencies = {
    inspectSession: async sessionId => {
      const matches = (await listSessions()).filter(session => session.sessionId === sessionId)
      if (matches.length === 0) return { exists: false }
      if (matches.length !== 1) throw new LongGoalIntegrityError('Long Goal planner Session identity mismatch')
      return {
        exists: true,
        ...(matches[0]!.cwd === undefined ? {} : { cwd: matches[0]!.cwd }),
        ...(matches[0]!.agentPreset === undefined ? {} : { agentPreset: matches[0]!.agentPreset }),
      }
    },
    createAgent: async input => {
      const selection = runnerServices.agentDefaultModel.currentSelection()
      return await ctx.agents.create({
        sessionId: SessionId(input.sessionId),
        meta: { cwd: input.cwd, agentPreset: input.agentPreset },
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: plannerSetup(runnerServices, selection, input.agentPreset, input.setup),
      })
    },
    resumeAgent: async input => {
      const selection = runnerServices.agentDefaultModel.currentSelection()
      return await ctx.agents.resume({
        resumeSessionId: SessionId(input.sessionId),
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: plannerSetup(runnerServices, selection, undefined, input.setup),
      })
    },
    flushSession: agent => flush(ctx, agent),
    readSettledTaskResult: async input => {
      await ctx.agents.get(SessionId(input.sessionId))?.whenIdle()
      return readSettledTaskResult(
        input,
        async sessionId => runnerServices.sessionPersistence.inspect(SessionId(sessionId)),
      )
    },
  }
  const serviceDependencies: GoalFirstServiceDependencies = {
    createRecord: createGoalFirstLongGoal,
    readRecord: (stateRoot, longGoalId) => requireLegacyV2GoalFirstRecord(readLongGoal(stateRoot, longGoalId)),
    readStatus: readLongGoalStatus,
    appendGuidance: appendLongGoalGuidance,
    abandonBlockedTask: abandonBlockedLongGoalTask,
    runPlannerTurn: ({ record, reason }) => runLongGoalPlannerTurn({
      stateRoot: roots.stateRoot,
      dshStatusTarget,
      record: requireLegacyV2GoalFirstRecord(record),
      reason,
    }, plannerDependencies),
    runTask: async input => {
      const result = await runCurrentWebTask({
        roots,
        longGoalId: input.longGoalId,
        expectedRevision: input.expectedRevision,
      }, runDependencies)
      if (result.action === 'complete' || result.sessionId === undefined) {
        throw new LongGoalIntegrityError('Goal-first Task admission returned no Session')
      }
      return { action: result.action, sessionId: result.sessionId }
    },
  }
  try {
    if (config.operation === 'start') {
      return await createGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        objective: config.objective!,
        context: config.context ?? null,
        successCriteria: config.successCriteria ?? null,
        workspaceRoot: resolve(config.workspaceRoot),
        agentPreset: runnerServices.agentPresets.defaultId,
      }, serviceDependencies)
    }
    if (config.operation === 'continue') {
      return await continueGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        longGoalId: config.goalId!,
        expectedRevision: config.revision!,
      }, serviceDependencies)
    }
    if (config.operation === 'guide') {
      return await addGoalFirstGuidance({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        longGoalId: config.goalId!,
        expectedRevision: config.revision!,
        text: config.text!,
      }, serviceDependencies)
    }
    return await abandonGoalFirstTask({
      stateRoot: roots.stateRoot,
      dshStatusTarget,
      longGoalId: config.goalId!,
      expectedRevision: config.revision!,
    }, serviceDependencies)
  } finally {
    for (const handle of ownedTaskHandles.values()) {
      try {
        await flush(ctx, handle.agent)
      } finally {
        await handle.dispose()
      }
    }
  }
}

export const name = 'tianwen-goal-first-runner'
export const inject = ['agentDefaultModel', 'agentPresets', 'agents', 'goals', 'sessionPersistence', 'sessions'] as const

export function apply(ctx: Context, config: GoalFirstRunnerConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) throw new Error('tianwen-goal-first-runner: appExit is unavailable')
  void (async () => {
    await ctx.get('loader')?.await()
    return await runGoalFirst(ctx, config)
  })().then(result => {
    process.stdout.write(config.json
      ? `${JSON.stringify(result)}\n`
      : formatGoalFirstText(result))
    exit(0)
  }, error => {
    if (error instanceof LongGoalRevisionConflictError) {
      process.stderr.write(`tianwen goal: revision-conflict expectedRevision=${error.expectedRevision} currentRevision=${error.currentRevision}\n`)
    } else {
      process.stderr.write(`tianwen goal: ${error instanceof Error ? error.message : 'failed'}\n`)
    }
    exit(1)
  })
}
