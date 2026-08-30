import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentSetup, ModelSelection } from '@deepseek-ai/dsh-agent'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { SessionId } from '@deepseek-ai/dsh-session'

import type {
  AnyLongGoalRecord,
  AnyLongGoalStatusProjection,
  AnyLongGoalSummary,
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
  LongGoalSummary,
  LongGoalSummaryV2,
} from './long-goal-contract.js'
import {
  abandonGoalFirstTask,
  addGoalFirstGuidance,
  continueGoalFirstProgress,
  createGoalFirstProgress,
} from './goal-first-service.js'
import type { GoalFirstServiceDependencies } from './goal-first-service.js'
import {
  abandonBlockedLongGoalTask,
  appendLongGoalGuidance,
  bindGoalFirstLongGoalTask,
  bindLongGoalTask,
  createGoalFirstLongGoal,
  createLongGoal,
  listLongGoals,
  LongGoalIntegrityError,
  LongGoalRevisionConflictError,
  readLongGoal,
  readLongGoalStatus,
} from './long-goal.js'
import { runLongGoalPlannerTurn } from './long-goal-planner.js'
import type { LongGoalPlannerDependencies } from './long-goal-planner.js'
import {
  readGoalTaskFeedbackStatus,
  recordGoalTaskFeedback,
} from './goal-task-feedback.js'
import type {
  GoalTaskFeedbackDependencies,
  GoalTaskFeedbackRecordResult,
  GoalTaskFeedbackStatus,
} from './goal-task-feedback.js'
import {
  projectLearningClueStatus,
  type LearningClueStatus,
} from './learning-clue-status.js'
import { readGoalStatus } from './status.js'

type RpcResult<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: {
      readonly code: 'internal' | 'revision-conflict'
      readonly message: 'invalid-request' | 'revision-conflict'
      readonly details: Record<string, never> | {
        readonly expectedRevision: number
        readonly currentRevision: number
      }
    } }

type ConnectionRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>>

interface HostContext extends Context {
  readonly apiProxy: {
    readonly sessions: {
      list(input: { readonly rpcId: string; readonly payload: Record<string, never> }): Promise<{
        readonly result: RpcResult<{ readonly items: readonly {
          readonly sessionId: string
          readonly cwd?: string
          readonly agentPreset?: string
        }[] }>
      }>
      create(input: { readonly rpcId: string; readonly payload: {
        readonly cwd: string
        readonly sessionId?: ReturnType<typeof SessionId>
        readonly agentPreset?: string
      } }): Promise<{
        readonly result: RpcResult<{ readonly sessionId: string; readonly agentPreset?: string }>
      }>
    }
    readonly goals: {
      resume(input: {
        readonly rpcId: string
        readonly payload: {
          readonly sessionId: ReturnType<typeof SessionId>
          readonly ref: { readonly id: ReturnType<typeof GoalId>; readonly revision: number }
        }
      }): Promise<{
        readonly result: RpcResult<{
          readonly ref: { readonly id: string; readonly revision: number }
        }>
      }>
    }
  }
  readonly connection: {
    readonly rpc: {
      handle(
        channel: string,
        handler: ConnectionRpcHandler,
        options: { readonly authority: 'loopback' },
      ): unknown
    }
  }
  readonly agentDefaultModel: {
    currentSelection(): ModelSelection
  }
  readonly agentPresets: {
    mount(agentCtx: Context, agentPreset: string): Promise<void>
  }
}

export interface TianwenLongGoalHostRoots {
  readonly stateRoot: string
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

export interface TianwenLongGoalHostConfig {
  readonly stateRoot?: string
  readonly sessionsRoot?: string
  readonly evolutionRoot?: string
}

export interface TianwenLongGoalHostDependencies {
  readonly listLongGoals: typeof listLongGoals
  readonly createLongGoal: typeof createLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
}

export interface RunCurrentTaskResult {
  readonly status: LongGoalStatusProjection
  readonly sessionId?: string
  readonly action: 'started' | 'continued' | 'already-running' | 'complete'
}

export interface GoalFirstTaskRunResult {
  readonly status: LongGoalStatusProjectionV2
  readonly sessionId?: string
  readonly action: 'started' | 'continued' | 'already-running' | 'complete'
}

type AnyRunCurrentTaskResult = {
  readonly status: AnyLongGoalStatusProjection
  readonly sessionId?: string
  readonly action: 'started' | 'continued' | 'already-running' | 'complete'
}

export interface TianwenLongGoalRunDependencies {
  readonly readLongGoal: typeof readLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
  readonly bindLongGoalTask: typeof bindLongGoalTask
  readonly bindGoalFirstLongGoalTask: typeof bindGoalFirstLongGoalTask
  readonly listSessions: () => Promise<readonly {
    readonly sessionId: string
    readonly cwd?: string
    readonly agentPreset?: string
  }[]>
  readonly createSession: (input: {
    readonly cwd: string
    readonly agentPreset?: string
  }) => Promise<string>
  readonly attachedAgent: (sessionId: string) => Agent | undefined
  readonly createGoal: (agent: Agent, input: {
    readonly objective: string
    readonly maxGoalRounds: number
  }) => GoalView
  readonly readGoalRef: (sessionId: string, goalId: string) => Promise<{
    readonly id: string
    readonly revision: number
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly blockedReason?: {
      readonly code: string
      readonly message: string
    }
  }>
  readonly resumeColdGoal: (input: {
    readonly sessionId: string
    readonly goalId: string
    readonly revision: number
  }) => Promise<void>
  readonly flushSession: (agent: Agent) => Promise<void>
}

export interface TianwenGoalFirstOperations {
  readonly createGoalFirst: (input: {
    readonly objective: string
    readonly context: string | null
    readonly successCriteria: string | null
    readonly workspaceRoot: string
    readonly agentPreset: string
  }) => Promise<GoalFirstProgressResultV2>
  readonly addGuidance: (input: {
    readonly longGoalId: string
    readonly expectedRevision: number
    readonly text: string
  }) => Promise<LongGoalGuidanceResultV2>
  readonly continueProgress: (input: {
    readonly longGoalId: string
    readonly expectedRevision: number
  }) => Promise<GoalFirstProgressResultV2>
  readonly abandonCurrentTask: (input: {
    readonly longGoalId: string
    readonly expectedRevision: number
  }) => Promise<LongGoalAbandonResultV2>
}

export interface TianwenGoalTaskFeedbackOperations {
  readonly status: (input: {
    readonly longGoalId: string
  }) => Promise<GoalTaskFeedbackStatus>
  readonly record: (input: {
    readonly longGoalId: string
    readonly taskId: string
    readonly rating: 'positive' | 'negative'
    readonly note: string | null
  }) => Promise<GoalTaskFeedbackRecordResult>
}

export interface TianwenLearningClueOperations {
  readonly status: () => Promise<LearningClueStatus>
}

export class LongGoalTaskAdmissionError extends Error {
  constructor(
    message: string,
    readonly sessionId: string,
    readonly goalId: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'LongGoalTaskAdmissionError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value)
}

function unwrapRpc<T>(response: { readonly result: RpcResult<T> }): T {
  if (!response.result.ok) throw new Error(response.result.error.message)
  return response.result.value
}

function currentGoal(agent: Agent, sessionId: string, goalId: string): GoalView {
  if (String(agent.session.id) !== sessionId) {
    throw new Error('Long Goal Task bound Session mismatch')
  }
  const goal = agent.ctx.goals.get(agent)
  if (goal === undefined || String(goal.id) !== goalId) {
    throw new Error('Long Goal Task bound Goal mismatch')
  }
  return goal
}

function blockedTaskError(taskId: string, reason?: { readonly message: string }): Error {
  return new Error(`Long Goal Task ${taskId} is blocked${
    reason === undefined ? '' : `: ${reason.message}`
  }`)
}

function statusInput(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
}): Parameters<typeof readLongGoalStatus>[0] {
  return {
    stateRoot: input.roots.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: {
      sessionsRoot: input.roots.sessionsRoot,
      evolutionRoot: input.roots.evolutionRoot,
    },
  }
}

async function requireGoalFirstTaskSessionHeader(
  record: Extract<AnyLongGoalRecord, { readonly schemaVersion: 'tianwen.long-goal.v2' }>,
  sessionId: string,
  dependencies: TianwenLongGoalRunDependencies,
): Promise<void> {
  const matches = (await dependencies.listSessions())
    .filter(session => session.sessionId === sessionId)
  if (matches.length !== 1 || matches[0]!.cwd !== record.workspaceRoot) {
    throw new LongGoalIntegrityError('Goal-first Task Session workspace mismatch')
  }
  const persistedPreset = matches[0]!.agentPreset
  if (persistedPreset !== undefined && persistedPreset !== record.planner.agentPreset) {
    throw new LongGoalIntegrityError('Goal-first Task Session preset mismatch')
  }
}

export function runCurrentWebTask(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly initialCwd?: string
}, dependencies: TianwenLongGoalRunDependencies): Promise<GoalFirstTaskRunResult>
export function runCurrentWebTask(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
  readonly initialCwd?: string
}, dependencies: TianwenLongGoalRunDependencies): Promise<RunCurrentTaskResult>
export async function runCurrentWebTask(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
  readonly expectedRevision?: number
  readonly initialCwd?: string
}, dependencies: TianwenLongGoalRunDependencies): Promise<AnyRunCurrentTaskResult> {
  const readStatus = (): Promise<AnyLongGoalStatusProjection> =>
    dependencies.readLongGoalStatus(statusInput(input))
  const status = await readStatus()
  const record = dependencies.readLongGoal(input.roots.stateRoot, input.longGoalId)
  const isV2 = record.schemaVersion === 'tianwen.long-goal.v2'
  if (isV2 !== (status.schemaVersion === 'tianwen.long-goal-status.v2')) {
    throw new LongGoalIntegrityError('Long Goal Task record/status schema mismatch')
  }
  if (isV2) {
    if (input.expectedRevision === undefined) {
      throw new Error('Goal-first Long Goal requires goal-first service')
    }
    if (!isPositiveInteger(input.expectedRevision)) {
      throw new TypeError('Goal-first Task admission expected revision is invalid')
    }
    if (record.revision !== input.expectedRevision) {
      throw new LongGoalRevisionConflictError(input.expectedRevision, record.revision)
    }
  }
  if (status.currentTaskId === null) return { status, action: 'complete' }

  const projectedTask = status.tasks.find(task => task.id === status.currentTaskId)
  const taskIndex = record.tasks.findIndex(task => task.id === status.currentTaskId)
  const task = record.tasks[taskIndex]
  if (projectedTask === undefined || task === undefined) {
    throw new Error('Long Goal current Task is missing')
  }
  if (
    projectedTask.execution?.sessionId !== task.execution?.sessionId ||
    projectedTask.execution?.goalId !== task.execution?.goalId
  ) {
    throw new Error('Long Goal Task status binding mismatch')
  }
  if (projectedTask.phase === 'blocked' || status.goal.phase === 'blocked') {
    throw blockedTaskError(task.id, projectedTask.blockedReason)
  }

  if (task.execution === null) {
    if (
      status.schemaVersion === 'tianwen.long-goal-status.v2' &&
      (status.planner.phase !== 'ready' || status.goal.phase !== 'active')
    ) {
      throw new LongGoalIntegrityError('Goal-first Task admission requires an active ready state')
    }
    let cwd: string | undefined
    let agentPreset: string | undefined
    if (record.schemaVersion === 'tianwen.long-goal.v2') {
      cwd = record.workspaceRoot
      agentPreset = record.planner.agentPreset
    } else {
      const firstBound = record.tasks.find(candidate => candidate.execution !== null)?.execution
      cwd = input.initialCwd
      if (firstBound !== undefined && firstBound !== null) {
        const sessions = await dependencies.listSessions()
        cwd = sessions.find(session => session.sessionId === firstBound.sessionId)?.cwd
        if (cwd === undefined) throw new Error('Long Goal Task workspace Session mismatch')
      }
    }
    if (cwd === undefined || cwd.length === 0) throw new Error('workspace-required')

    const sessionId = await dependencies.createSession({
      cwd,
      ...(agentPreset === undefined ? {} : { agentPreset }),
    })
    const agent = dependencies.attachedAgent(sessionId)
    if (agent === undefined || String(agent.session.id) !== sessionId) {
      throw new Error('New Long Goal Task Session has no attached Agent')
    }
    if (
      record.schemaVersion === 'tianwen.long-goal.v2' &&
      (
        agent.session.header.cwd !== record.workspaceRoot ||
        agent.session.header.agentPreset !== record.planner.agentPreset
      )
    ) {
      throw new LongGoalIntegrityError('New Goal-first Task Session header mismatch')
    }
    const goal = dependencies.createGoal(agent, {
      objective: task.objective,
      maxGoalRounds: record.maxTaskRounds,
    })
    try {
      const execution = { sessionId, goalId: String(goal.id) }
      if (record.schemaVersion === 'tianwen.long-goal.v2') {
        dependencies.bindGoalFirstLongGoalTask({
          stateRoot: input.roots.stateRoot,
          longGoalId: input.longGoalId,
          expectedRevision: input.expectedRevision!,
          taskId: task.id,
          execution,
        })
      } else {
        dependencies.bindLongGoalTask(
          input.roots.stateRoot,
          input.longGoalId,
          task.id,
          execution,
        )
      }
    } catch (bindingCause) {
      let cleanupCause: unknown
      try {
        agent.ctx.goals.disarm(agent)
        await dependencies.flushSession(agent)
      } catch (error) {
        cleanupCause = error
      }
      if (cleanupCause === undefined && bindingCause instanceof LongGoalRevisionConflictError) {
        throw bindingCause
      }
      throw new LongGoalTaskAdmissionError(
        `Long Goal Task binding failed for Goal ${String(goal.id)} in Session ${sessionId}`,
        sessionId,
        String(goal.id),
        {
          cause: cleanupCause === undefined
            ? bindingCause
            : new AggregateError([bindingCause, cleanupCause], 'Long Goal Task binding cleanup failed'),
        },
      )
    }
    await dependencies.flushSession(agent)
    return { status: await readStatus(), sessionId, action: 'started' }
  }

  const { sessionId, goalId } = task.execution
  let agent = dependencies.attachedAgent(sessionId)
  if (agent === undefined) {
    if (record.schemaVersion === 'tianwen.long-goal.v2') {
      await requireGoalFirstTaskSessionHeader(record, sessionId, dependencies)
    }
    const ref = await dependencies.readGoalRef(sessionId, goalId)
    if (ref.id !== goalId || !Number.isSafeInteger(ref.revision) || ref.revision < 1) {
      throw new Error('Cold Long Goal Task Goal ref mismatch')
    }
    if (ref.phase === 'blocked') throw blockedTaskError(task.id, ref.blockedReason)
    if (ref.phase !== 'active' && ref.phase !== 'paused') {
      throw new Error('Cold Long Goal Task Goal is not resumable')
    }
    await dependencies.resumeColdGoal({ sessionId, goalId, revision: ref.revision })
    agent = dependencies.attachedAgent(sessionId)
    if (agent === undefined) throw new Error('Resumed Long Goal Task Session has no attached Agent')
    const resumed = currentGoal(agent, sessionId, goalId)
    if (resumed.phase !== 'active' || resumed.activation !== 'armed') {
      throw new Error('Resumed Long Goal Task Goal mismatch')
    }
    await dependencies.flushSession(agent)
    return { status: await readStatus(), sessionId, action: 'continued' }
  }

  const goal = currentGoal(agent, sessionId, goalId)
  if (goal.phase === 'active' && goal.activation === 'armed') {
    return { status, sessionId, action: 'already-running' }
  }
  if (goal.phase === 'blocked') throw blockedTaskError(task.id, goal.blockedReason)
  if ((goal.phase !== 'active' && goal.phase !== 'paused') || goal.activation !== 'disarmed') {
    throw new Error('Bound Long Goal Task Goal is not resumable')
  }
  if (record.schemaVersion === 'tianwen.long-goal.v2') {
    await requireGoalFirstTaskSessionHeader(record, sessionId, dependencies)
  }
  const resumed = agent.ctx.goals.resume(agent, { id: goal.id, revision: goal.revision })
  if (String(resumed.id) !== goalId || resumed.phase !== 'active' || resumed.activation !== 'armed') {
    throw new Error('Resumed Long Goal Task Goal mismatch')
  }
  await dependencies.flushSession(agent)
  return { status: await readStatus(), sessionId, action: 'continued' }
}

function invalidRequest(): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message: 'invalid-request', details: {} } }
}

async function goalFirstRpc<T>(operation: () => Promise<T>): Promise<RpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    if (error instanceof LongGoalRevisionConflictError) {
      return {
        ok: false,
        error: {
          code: 'revision-conflict',
          message: 'revision-conflict',
          details: {
            expectedRevision: error.expectedRevision,
            currentRevision: error.currentRevision,
          },
        },
      }
    }
    throw error
  }
}

function summary(status: AnyLongGoalStatusProjection, updatedAt: number): AnyLongGoalSummary {
  if (status.schemaVersion === 'tianwen.long-goal-status.v2') {
    const result: LongGoalSummaryV2 = {
      schemaVersion: 'tianwen.long-goal-summary.v2',
      id: status.goal.id,
      objective: status.goal.objective,
      phase: status.goal.phase,
      revision: status.goal.revision,
      completedTasks: status.goal.completedTasks,
      abandonedTasks: status.goal.abandonedTasks,
      totalTasks: status.goal.totalTasks,
      currentTaskId: status.currentTaskId,
      updatedAt,
    }
    return result
  }
  const result: LongGoalSummary = {
    id: status.goal.id,
    objective: status.goal.objective,
    phase: status.goal.phase,
    completedTasks: status.goal.completedTasks,
    totalTasks: status.goal.totalTasks,
    currentTaskId: status.currentTaskId,
    updatedAt,
  }
  return result
}

function assertAbsoluteConfiguredRoot(name: string, value: string | undefined): void {
  if (value !== undefined && (!isAbsolute(value) || value.length === 0)) {
    throw new Error(`${name} must be an absolute path`)
  }
}

export function resolveTianwenLongGoalHostRoots(input: {
  readonly profileBaseUrl: URL
  readonly dshHome?: string
  readonly config?: TianwenLongGoalHostConfig
}): TianwenLongGoalHostRoots {
  assertAbsoluteConfiguredRoot('stateRoot', input.config?.stateRoot)
  assertAbsoluteConfiguredRoot('sessionsRoot', input.config?.sessionsRoot)
  assertAbsoluteConfiguredRoot('evolutionRoot', input.config?.evolutionRoot)
  const profileRoot = resolve(fileURLToPath(input.profileBaseUrl))
  const stateRoot = input.config?.stateRoot ?? resolve(profileRoot, 'state')
  const evolutionRoot = input.config?.evolutionRoot ?? resolve(stateRoot, 'evolution')
  const dshHome = input.dshHome === undefined ? undefined : resolve(input.dshHome)
  const sessionsRoot = input.config?.sessionsRoot ??
    (dshHome === undefined ? undefined : resolve(dshHome, 'sessions'))
  if (sessionsRoot === undefined || (input.config?.sessionsRoot === undefined &&
    (input.dshHome === undefined || !isAbsolute(input.dshHome)))) {
    throw new Error('sessionsRoot requires an explicit root or absolute DSH_HOME')
  }
  return { stateRoot, sessionsRoot, evolutionRoot }
}

export function createTianwenLongGoalRpcHandler(
  roots: TianwenLongGoalHostRoots,
  dependencies: TianwenLongGoalHostDependencies = {
    listLongGoals,
    createLongGoal,
    readLongGoalStatus,
  },
  runDependencies?: TianwenLongGoalRunDependencies,
  goalFirstOperations?: TianwenGoalFirstOperations,
  taskFeedbackOperations?: TianwenGoalTaskFeedbackOperations,
  learningClueOperations?: TianwenLearningClueOperations,
): ConnectionRpcHandler {
  const readStatus = (longGoalId: string) => dependencies.readLongGoalStatus({
    stateRoot: roots.stateRoot,
    longGoalId,
    dshStatusTarget: {
      sessionsRoot: roots.sessionsRoot,
      evolutionRoot: roots.evolutionRoot,
    },
  })
  return async (endpoint, payload) => {
    if (endpoint === 'list' && isRecord(payload) && hasExactKeys(payload, [])) {
      const goals = await Promise.all(dependencies.listLongGoals(roots.stateRoot).map(async record =>
        summary(await readStatus(record.id), record.updatedAt)))
      return { ok: true, value: { goals } }
    }
    if (
      endpoint === 'create' &&
      isRecord(payload) &&
      hasExactKeys(payload, ['objective', 'tasks', 'maxTaskRounds']) &&
      isNonEmptyString(payload.objective) &&
      Array.isArray(payload.tasks) &&
      payload.tasks.length > 0 &&
      payload.tasks.every(isNonEmptyString) &&
      isPositiveInteger(payload.maxTaskRounds)
    ) {
      const record = dependencies.createLongGoal({
        stateRoot: roots.stateRoot,
        objective: payload.objective,
        tasks: payload.tasks,
        maxTaskRounds: payload.maxTaskRounds,
      })
      return { ok: true, value: { status: await readStatus(record.id) } }
    }
    if (
      endpoint === 'status' &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId']) &&
      isNonEmptyString(payload.longGoalId)
    ) {
      return { ok: true, value: { status: await readStatus(payload.longGoalId) } }
    }
    if (
      endpoint === 'run-current-task' &&
      runDependencies !== undefined &&
      isRecord(payload) &&
      Object.keys(payload).every(key => key === 'longGoalId' || key === 'initialCwd') &&
      isNonEmptyString(payload.longGoalId) &&
      (payload.initialCwd === undefined || isNonEmptyString(payload.initialCwd))
    ) {
      return {
        ok: true,
        value: await runCurrentWebTask({
          roots,
          longGoalId: payload.longGoalId,
          ...(payload.initialCwd === undefined ? {} : { initialCwd: payload.initialCwd }),
        }, runDependencies),
      }
    }
    if (
      endpoint === 'create-goal-first' &&
      goalFirstOperations !== undefined &&
      runDependencies !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['objective', 'context', 'successCriteria', 'workspaceSessionId']) &&
      isNonEmptyString(payload.objective) &&
      isNullableNonEmptyString(payload.context) &&
      isNullableNonEmptyString(payload.successCriteria) &&
      isNonEmptyString(payload.workspaceSessionId)
    ) {
      const matches = (await runDependencies.listSessions())
        .filter(session => session.sessionId === payload.workspaceSessionId)
      const selected = matches.length === 1 ? matches[0] : undefined
      if (
        selected === undefined ||
        !isNonEmptyString(selected.cwd) ||
        !isNonEmptyString(selected.agentPreset)
      ) return invalidRequest()
      const objective = payload.objective
      const context = payload.context
      const successCriteria = payload.successCriteria
      const workspaceRoot = selected.cwd
      const agentPreset = selected.agentPreset
      return goalFirstRpc(() => goalFirstOperations.createGoalFirst({
        objective,
        context,
        successCriteria,
        workspaceRoot,
        agentPreset,
      }))
    }
    if (
      endpoint === 'add-guidance' &&
      goalFirstOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId', 'expectedRevision', 'text']) &&
      isNonEmptyString(payload.longGoalId) &&
      isPositiveInteger(payload.expectedRevision) &&
      isNonEmptyString(payload.text)
    ) {
      const longGoalId = payload.longGoalId
      const expectedRevision = payload.expectedRevision
      const text = payload.text
      return goalFirstRpc(() => goalFirstOperations.addGuidance({
        longGoalId,
        expectedRevision,
        text,
      }))
    }
    if (
      endpoint === 'continue-progress' &&
      goalFirstOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId', 'expectedRevision']) &&
      isNonEmptyString(payload.longGoalId) &&
      isPositiveInteger(payload.expectedRevision)
    ) {
      const longGoalId = payload.longGoalId
      const expectedRevision = payload.expectedRevision
      return goalFirstRpc(() => goalFirstOperations.continueProgress({
        longGoalId,
        expectedRevision,
      }))
    }
    if (
      endpoint === 'abandon-current-task' &&
      goalFirstOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId', 'expectedRevision']) &&
      isNonEmptyString(payload.longGoalId) &&
      isPositiveInteger(payload.expectedRevision)
    ) {
      const longGoalId = payload.longGoalId
      const expectedRevision = payload.expectedRevision
      return goalFirstRpc(() => goalFirstOperations.abandonCurrentTask({
        longGoalId,
        expectedRevision,
      }))
    }
    if (
      endpoint === 'feedback-status' &&
      taskFeedbackOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId']) &&
      isNonEmptyString(payload.longGoalId)
    ) {
      return {
        ok: true,
        value: await taskFeedbackOperations.status({ longGoalId: payload.longGoalId }),
      }
    }
    if (
      endpoint === 'record-task-feedback' &&
      taskFeedbackOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId', 'taskId', 'rating', 'note']) &&
      isNonEmptyString(payload.longGoalId) &&
      isNonEmptyString(payload.taskId) &&
      (payload.rating === 'positive' || payload.rating === 'negative') &&
      isNullableNonEmptyString(payload.note) &&
      (payload.rating === 'negative' || payload.note === null)
    ) {
      return {
        ok: true,
        value: await taskFeedbackOperations.record({
          longGoalId: payload.longGoalId,
          taskId: payload.taskId,
          rating: payload.rating,
          note: payload.note,
        }),
      }
    }
    if (
      endpoint === 'learning-clues' &&
      learningClueOperations !== undefined &&
      isRecord(payload) &&
      hasExactKeys(payload, [])
    ) {
      return { ok: true, value: await learningClueOperations.status() }
    }
    return invalidRequest()
  }
}

export function mountTianwenLongGoalHost(
  ctx: Context,
  config?: TianwenLongGoalHostConfig,
): void {
  ctx.inject([
    'connection', 'apiProxy', 'agents', 'goals', 'sessions',
    'agentDefaultModel', 'agentPresets', 'sessionPersistence',
    'tianwenLearningIntake', 'tianwenEvolution',
  ], injected => {
    if (injected.baseUrl === undefined) throw new Error('Tianwen Long Goal Web host requires a Profile base URL')
    const roots = resolveTianwenLongGoalHostRoots({
      profileBaseUrl: new URL(injected.baseUrl),
      ...(process.env.DSH_HOME === undefined ? {} : { dshHome: process.env.DSH_HOME }),
      ...(config === undefined ? {} : { config }),
    })
    const host = injected as HostContext
    const runDependencies: TianwenLongGoalRunDependencies = {
      readLongGoal,
      readLongGoalStatus,
      bindLongGoalTask,
      bindGoalFirstLongGoalTask,
      listSessions: async () => unwrapRpc(await host.apiProxy.sessions.list({
        rpcId: randomUUID(),
        payload: {},
      })).items.map(item => ({
        sessionId: String(item.sessionId),
        ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
        ...(item.agentPreset === undefined ? {} : { agentPreset: item.agentPreset }),
      })),
      createSession: async ({ cwd, agentPreset }) => String(unwrapRpc(await host.apiProxy.sessions.create({
        rpcId: randomUUID(),
        payload: { cwd, ...(agentPreset === undefined ? {} : { agentPreset }) },
      })).sessionId),
      attachedAgent: sessionId => injected.agents.get(SessionId(sessionId)),
      createGoal: (agent, goalInput) => injected.goals.create(agent, goalInput),
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
          ...(status.goal.blockedReason === undefined
            ? {}
            : { blockedReason: status.goal.blockedReason }),
        }
      },
      resumeColdGoal: async ({ sessionId, goalId, revision }) => {
        const result = unwrapRpc(await host.apiProxy.goals.resume({
          rpcId: randomUUID(),
          payload: {
            sessionId: SessionId(sessionId),
            ref: { id: GoalId(goalId), revision },
          },
        }))
        if (String(result.ref.id) !== goalId) throw new Error('Resumed Long Goal Task Goal mismatch')
      },
      flushSession: async agent => {
        await injected.sessions.flush(agent.session)
      },
    }
    const dshStatusTarget = {
      sessionsRoot: roots.sessionsRoot,
      evolutionRoot: roots.evolutionRoot,
    }
    const plannerSetup = (
      selection: ModelSelection,
      agentPreset: string | undefined,
      setup: AgentSetup,
    ): AgentSetup => async agentCtx => {
      const selectedPreset = agentPreset ?? agentCtx.agent?.session.header.agentPreset
      if (!isNonEmptyString(selectedPreset)) {
        throw new LongGoalIntegrityError('Long Goal planner Session preset mismatch')
      }
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
      await host.agentPresets.mount(agentCtx, selectedPreset)
      return setup(agentCtx)
    }
    const plannerDependencies: LongGoalPlannerDependencies = {
      inspectSession: async sessionId => {
        const matches = (await runDependencies.listSessions())
          .filter(session => session.sessionId === sessionId)
        if (matches.length === 0) return { exists: false }
        if (matches.length !== 1) {
          throw new LongGoalIntegrityError('Long Goal planner Session identity mismatch')
        }
        return {
          exists: true,
          ...(matches[0]!.cwd === undefined ? {} : { cwd: matches[0]!.cwd }),
          ...(matches[0]!.agentPreset === undefined
            ? {}
            : { agentPreset: matches[0]!.agentPreset }),
        }
      },
      createAgent: async input => {
        const selection = host.agentDefaultModel.currentSelection()
        return injected.agents.create({
          sessionId: SessionId(input.sessionId),
          meta: {
            cwd: input.cwd,
            agentPreset: input.agentPreset,
          },
          agentOptions: { provider: selection.provider, model: selection.model },
          setup: plannerSetup(selection, input.agentPreset, input.setup),
        })
      },
      resumeAgent: async input => {
        const selection = host.agentDefaultModel.currentSelection()
        return injected.agents.resume({
          resumeSessionId: SessionId(input.sessionId),
          agentOptions: { provider: selection.provider, model: selection.model },
          setup: plannerSetup(selection, undefined, input.setup),
        })
      },
      flushSession: async agent => {
        if (!await injected.sessions.flush(agent.session)) {
          throw new Error('Session persistence is unavailable')
        }
      },
    }
    const serviceDependencies: GoalFirstServiceDependencies = {
      createRecord: createGoalFirstLongGoal,
      readRecord: readLongGoal,
      readStatus: readLongGoalStatus,
      appendGuidance: appendLongGoalGuidance,
      abandonBlockedTask: abandonBlockedLongGoalTask,
      runPlannerTurn: ({ record, reason }) => runLongGoalPlannerTurn({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        record,
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
    const goalFirstOperations: TianwenGoalFirstOperations = {
      createGoalFirst: input => createGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
      addGuidance: input => addGoalFirstGuidance({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
      continueProgress: input => continueGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
      abandonCurrentTask: input => abandonGoalFirstTask({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
    }
    const taskFeedbackDependencies: GoalTaskFeedbackDependencies = {
      readLongGoal,
      readLongGoalStatus,
      awaitSessionIdle: async sessionId => {
        await injected.agents.get(SessionId(sessionId))?.whenIdle()
      },
      openSession: async sessionId => {
        const live = injected.agents.get(SessionId(sessionId))
        if (live !== undefined) {
          if (!await injected.sessions.flush(live.session)) {
            throw new Error('Session persistence is unavailable')
          }
          return { session: live.session, release: () => undefined }
        }
        const preparation = await host.sessionPersistence.prepare(SessionId(sessionId))
        return {
          session: preparation.session,
          release: () => preparation[Symbol.dispose](),
        }
      },
      consume: (session, scopeKey, feedback) =>
        host.tianwenLearningIntake.consume(session, scopeKey, feedback),
      getLearningIntakeStatus: sessionId =>
        host.tianwenEvolution.getLearningIntakeStatus(sessionId),
    }
    const taskFeedbackOperations: TianwenGoalTaskFeedbackOperations = {
      status: input => readGoalTaskFeedbackStatus({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, taskFeedbackDependencies),
      record: input => recordGoalTaskFeedback({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, taskFeedbackDependencies),
    }
    const learningClueOperations: TianwenLearningClueOperations = {
      status: async () => projectLearningClueStatus({
        goals: await Promise.all(listLongGoals(roots.stateRoot).map(async record => ({
          status: await readLongGoalStatus({
            stateRoot: roots.stateRoot,
            longGoalId: record.id,
            dshStatusTarget,
          }),
          feedback: await taskFeedbackOperations.status({ longGoalId: record.id }),
        }))),
        tickets: host.tianwenEvolution.listLearningTickets(),
      }),
    }
    host.connection.rpc.handle('/tianwen', createTianwenLongGoalRpcHandler(
      roots,
      undefined,
      runDependencies,
      goalFirstOperations,
      taskFeedbackOperations,
      learningClueOperations,
    ), {
      authority: 'loopback',
    })
  })
}
