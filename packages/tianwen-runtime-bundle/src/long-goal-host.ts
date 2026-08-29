import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { SessionId } from '@deepseek-ai/dsh-session'

import type {
  LongGoalStatusProjection,
  LongGoalSummary,
} from './long-goal-contract.js'
import {
  bindLongGoalTask,
  createLongGoal,
  listLongGoals,
  readLongGoal,
  readLongGoalStatus,
} from './long-goal.js'
import { readGoalStatus } from './status.js'

type RpcResult<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: {
      readonly code: 'internal'
      readonly message: 'invalid-request'
      readonly details: Record<string, never>
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
        }[] }>
      }>
      create(input: { readonly rpcId: string; readonly payload: { readonly cwd: string } }): Promise<{
        readonly result: RpcResult<{ readonly sessionId: string }>
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

export interface TianwenLongGoalRunDependencies {
  readonly readLongGoal: typeof readLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
  readonly bindLongGoalTask: typeof bindLongGoalTask
  readonly listSessions: () => Promise<readonly {
    readonly sessionId: string
    readonly cwd?: string
  }[]>
  readonly createSession: (input: { readonly cwd: string }) => Promise<string>
  readonly attachedAgent: (sessionId: string) => Agent | undefined
  readonly createGoal: (agent: Agent, input: {
    readonly objective: string
    readonly maxGoalRounds: number
  }) => GoalView
  readonly readGoalRef: (sessionId: string, goalId: string) => Promise<{
    readonly id: string
    readonly revision: number
  }>
  readonly resumeColdGoal: (input: {
    readonly sessionId: string
    readonly goalId: string
    readonly revision: number
  }) => Promise<void>
  readonly flushSession: (agent: Agent) => Promise<void>
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

export async function runCurrentWebTask(input: {
  readonly roots: TianwenLongGoalHostRoots
  readonly longGoalId: string
  readonly initialCwd?: string
}, dependencies: TianwenLongGoalRunDependencies): Promise<RunCurrentTaskResult> {
  const readStatus = () => dependencies.readLongGoalStatus(statusInput(input))
  const status = await readStatus()
  if (status.currentTaskId === null) return { status, action: 'complete' }

  const projectedTask = status.tasks.find(task => task.id === status.currentTaskId)
  const record = dependencies.readLongGoal(input.roots.stateRoot, input.longGoalId)
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

  if (task.execution === null) {
    const firstBound = record.tasks.find(candidate => candidate.execution !== null)?.execution
    let cwd = input.initialCwd
    if (firstBound !== undefined && firstBound !== null) {
      const sessions = await dependencies.listSessions()
      cwd = sessions.find(session => session.sessionId === firstBound.sessionId)?.cwd
      if (cwd === undefined) throw new Error('Long Goal Task workspace Session mismatch')
    }
    if (cwd === undefined || cwd.length === 0) throw new Error('workspace-required')

    const sessionId = await dependencies.createSession({ cwd })
    const agent = dependencies.attachedAgent(sessionId)
    if (agent === undefined || String(agent.session.id) !== sessionId) {
      throw new Error('New Long Goal Task Session has no attached Agent')
    }
    const goal = dependencies.createGoal(agent, {
      objective: task.objective,
      maxGoalRounds: record.maxTaskRounds,
    })
    try {
      dependencies.bindLongGoalTask(input.roots.stateRoot, input.longGoalId, task.id, {
        sessionId,
        goalId: String(goal.id),
      })
    } catch (bindingCause) {
      let cleanupCause: unknown
      try {
        agent.ctx.goals.disarm(agent)
        await dependencies.flushSession(agent)
      } catch (error) {
        cleanupCause = error
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
    const ref = await dependencies.readGoalRef(sessionId, goalId)
    if (ref.id !== goalId || !Number.isSafeInteger(ref.revision) || ref.revision < 1) {
      throw new Error('Cold Long Goal Task Goal ref mismatch')
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
  if (goal.phase !== 'paused' && goal.activation !== 'disarmed') {
    throw new Error('Bound Long Goal Task Goal is not resumable')
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

function summary(status: LongGoalStatusProjection, updatedAt: number): LongGoalSummary {
  return {
    id: status.goal.id,
    objective: status.goal.objective,
    phase: status.goal.phase,
    completedTasks: status.goal.completedTasks,
    totalTasks: status.goal.totalTasks,
    currentTaskId: status.currentTaskId,
    updatedAt,
  }
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
    return invalidRequest()
  }
}

export function mountTianwenLongGoalHost(
  ctx: Context,
  config?: TianwenLongGoalHostConfig,
): void {
  ctx.inject(['connection', 'apiProxy', 'agents', 'goals', 'sessions'], injected => {
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
      listSessions: async () => unwrapRpc(await host.apiProxy.sessions.list({
        rpcId: randomUUID(),
        payload: {},
      })).items.map(item => ({
        sessionId: String(item.sessionId),
        ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
      })),
      createSession: async ({ cwd }) => String(unwrapRpc(await host.apiProxy.sessions.create({
        rpcId: randomUUID(),
        payload: { cwd },
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
        return { id: status.goal.id, revision: status.goal.revision }
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
    host.connection.rpc.handle('/tianwen', createTianwenLongGoalRpcHandler(
      roots,
      undefined,
      runDependencies,
    ), {
      authority: 'loopback',
    })
  })
}
