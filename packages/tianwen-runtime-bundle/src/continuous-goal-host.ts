import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import type { ContinuousGoalAgentOperations } from './continuous-goal-agent.js'
import { LongGoalIntegrityError } from './long-goal.js'
import type {
  ContinuousGoalControlAction,
  ContinuousGoalControlResult,
} from './continuous-goal-service.js'
import type {
  AnyLongGoalRecord,
  LongGoalRecordV3,
  LongGoalStatusProjectionV3,
} from './long-goal-contract.js'

export interface ContinuousGoalHostRoots {
  readonly stateRoot: string
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

type GoalProgressInput = {
  readonly longGoalId: string
  readonly expectedRevision: number
}

export interface ContinuousGoalHostDependencies {
  readonly roots: ContinuousGoalHostRoots
  readonly listLongGoals: () => readonly AnyLongGoalRecord[]
  readonly readLongGoal: (stateRoot: string, longGoalId: string) => AnyLongGoalRecord
  readonly readStatus: (input: {
    readonly stateRoot: string
    readonly longGoalId: string
    readonly dshStatusTarget: { readonly sessionsRoot: string, readonly evolutionRoot: string }
  }) => Promise<LongGoalStatusProjectionV3>
  readonly createProgress: (input: {
    readonly objective: string
    readonly context: null
    readonly successCriteria: null
    readonly workspaceRoot: string
    readonly agentPreset: string
    readonly controlSessionId: string
  }) => Promise<unknown>
  readonly control: (input: GoalProgressInput & {
    readonly action: ContinuousGoalControlAction
  }) => Promise<unknown>
  readonly continueProgress: (input: GoalProgressInput) => Promise<unknown>
  /** Persist only the v3 control mode; cancellation is owned by this Host. */
  readonly pause: (input: GoalProgressInput) => unknown
  readonly flushSession: (agent: Agent) => Promise<void | boolean>
  readonly reportError: (error: unknown) => void
  readonly installCommand: (
    agent: Agent,
    operations: ContinuousGoalAgentOperations,
  ) => () => void
  readonly installBoundControls: (
    agent: Agent,
    operations: ContinuousGoalAgentOperations,
  ) => () => void | Promise<void>
}

type HostContext = Context & {
  readonly agents: {
    list(): Agent[]
    get(id: never): Agent | undefined
  }
}

function isV3(record: AnyLongGoalRecord): record is LongGoalRecordV3 {
  return record.schemaVersion === 'tianwen.long-goal.v3'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function boundTask(record: LongGoalRecordV3, sessionId: string, goalId?: string) {
  return record.tasks.find(task => task.execution?.sessionId === sessionId
    && (goalId === undefined || task.execution.goalId === goalId))
}

function controlRecords(
  records: readonly AnyLongGoalRecord[],
  sessionId: string,
): LongGoalRecordV3[] {
  return records.filter((record): record is LongGoalRecordV3 =>
    isV3(record) && record.control.sessionId === sessionId && record.planner.phase !== 'complete')
}

function uniqueControlRecord(
  records: readonly AnyLongGoalRecord[],
  sessionId: string,
): LongGoalRecordV3 | undefined {
  const matches = controlRecords(records, sessionId)
  return matches.length === 1 ? matches[0] : undefined
}

function controlSessionCollides(records: readonly AnyLongGoalRecord[], sessionId: string): boolean {
  return records.some(record => {
    if (record.schemaVersion === 'tianwen.long-goal.v1') {
      return record.tasks.some(task => task.execution?.sessionId === sessionId)
    }
    return record.planner.sessionId === sessionId
      || record.tasks.some(task => task.execution?.sessionId === sessionId)
  })
}

function settledTasks(status: LongGoalStatusProjectionV3): number {
  return status.tasks.filter(task => task.phase === 'complete' || task.phase === 'abandoned').length
}

function exactLiveArmedTask(ctx: HostContext, record: LongGoalRecordV3, status: LongGoalStatusProjectionV3): boolean {
  if (status.currentTaskId === null) return false
  const task = status.tasks.find(candidate => candidate.id === status.currentTaskId)
  if (task?.execution === null || task?.execution === undefined || task.phase !== 'active') return false
  const agent = ctx.agents.get(task.execution.sessionId as never)
  const goal = agent?.ctx.goals.get(agent)
  return goal !== undefined
    && String(goal.id) === task.execution.goalId
    && goal.phase === 'active'
    && goal.activation === 'armed'
}

function isUserAbort(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false
  const typed = event as {
    type?: unknown
    data?: { reason?: { kind?: unknown, reason?: { kind?: unknown } } }
  }
  return typed.type === 'turn/end'
    && typed.data?.reason?.kind === 'aborted'
    && typed.data.reason.reason?.kind === 'user'
}

async function disposeRegistration(dispose: (() => void | Promise<void>) | undefined): Promise<void> {
  await dispose?.()
}

/**
 * Bridges public DSH lifecycle notifications to durable continuous Goal state.
 * It deliberately keeps no durable binding cache: every action rereads state.
 */
export function mountContinuousGoalHost(
  ctx: HostContext,
  dependencies: ContinuousGoalHostDependencies,
): () => Promise<void> {
  const target = {
    sessionsRoot: dependencies.roots.sessionsRoot,
    evolutionRoot: dependencies.roots.evolutionRoot,
  }
  type Lane = Promise<void> & { completion?: { readonly sessionId: string, readonly goalId: string } }
  const lanes = new Map<string, Lane>()
  const failures: unknown[] = []
  const installed = new Map<Agent, { command: () => void, controls?: () => void | Promise<void> }>()
  const creatingControlSessions = new Set<string>()

  const readStatus = (longGoalId: string) => dependencies.readStatus({
    stateRoot: dependencies.roots.stateRoot,
    longGoalId,
    dshStatusTarget: target,
  })
  const readV3 = (longGoalId: string): LongGoalRecordV3 | undefined => {
    const record = dependencies.readLongGoal(dependencies.roots.stateRoot, longGoalId)
    return isV3(record) ? record : undefined
  }
  const rememberLane = (
    longGoalId: string,
    task: Promise<void>,
    completion?: { readonly sessionId: string, readonly goalId: string },
  ): Lane => {
    const lane = task as Lane
    if (completion !== undefined) lane.completion = completion
    lanes.set(longGoalId, lane)
    void task.catch(error => {
      failures.push(error)
      try { dependencies.reportError(error) } catch {}
    })
    void task.finally(() => {
      if (lanes.get(longGoalId) === lane) lanes.delete(longGoalId)
    }).catch(() => undefined)
    return lane
  }
  const joinOrStart = (longGoalId: string, work: () => Promise<void>): Promise<void> => {
    const existing = lanes.get(longGoalId)
    if (existing !== undefined) return existing
    return rememberLane(longGoalId, Promise.resolve().then(work))
  }
  const append = (longGoalId: string, work: () => Promise<void>): Promise<void> => {
    const previous = lanes.get(longGoalId) ?? Promise.resolve()
    const task = previous.then(work, work)
    return rememberLane(longGoalId, task)
  }
  const appendCompletion = (
    longGoalId: string,
    execution: { readonly sessionId: string, readonly goalId: string },
  ): Promise<void> => {
    const previous = lanes.get(longGoalId)
    if (
      previous?.completion?.sessionId === execution.sessionId
      && previous.completion.goalId === execution.goalId
    ) return previous
    const task = (previous ?? Promise.resolve()).then(
      () => continueAfterCompletion(longGoalId, execution),
      () => continueAfterCompletion(longGoalId, execution),
    )
    return rememberLane(longGoalId, task, execution)
  }
  const flush = async (agent: Agent): Promise<void> => {
    if (await dependencies.flushSession(agent) === false) throw new Error('Session persistence is unavailable')
  }

  const operations: ContinuousGoalAgentOperations = {
    create: async (agent, objective) => {
      const controlSessionId = String(agent.session.id)
      const workspaceRoot = agent.session.header.cwd
      const agentPreset = agent.session.header.agentPreset
      if (!isNonEmptyString(workspaceRoot) || !isNonEmptyString(agentPreset)) {
        throw new Error('Continuous Goal control Agent requires workspace and preset headers')
      }
      if (creatingControlSessions.has(controlSessionId)) {
        throw new Error('A continuous Goal is already being created for this Session')
      }
      creatingControlSessions.add(controlSessionId)
      try {
        const records = dependencies.listLongGoals()
        const bindings = controlRecords(records, controlSessionId)
        if (bindings.length > 1) {
          throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
        }
        if (bindings.length === 1) {
          throw new Error('A continuous Goal is already bound to this Session')
        }
        if (controlSessionCollides(records, controlSessionId)) {
          throw new Error('A Planner or Task Session cannot control a continuous Goal')
        }
        const result = await dependencies.createProgress({
          objective, context: null, successCriteria: null, workspaceRoot, agentPreset, controlSessionId,
        }) as Pick<ContinuousGoalControlResult, 'action'>
        const createdBindings = controlRecords(dependencies.listLongGoals(), controlSessionId)
        if (createdBindings.length !== 1) {
          throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
        }
        installBoundControls(agent)
        return result
      } finally {
        creatingControlSessions.delete(controlSessionId)
      }
    },
    control: async (agent, action) => {
      const bindings = controlRecords(dependencies.listLongGoals(), String(agent.session.id))
      if (bindings.length > 1) {
        throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
      }
      const record = bindings[0]
      if (record === undefined) throw new Error('No active continuous Goal is bound to this Agent.')
      return await dependencies.control({
        longGoalId: record.id, expectedRevision: record.revision, action,
      }) as Pick<ContinuousGoalControlResult, 'action'>
    },
  }

  const installBoundControls = (agent: Agent): void => {
    const registration = installed.get(agent)
    if (registration === undefined || registration.controls !== undefined) return
    if (uniqueControlRecord(dependencies.listLongGoals(), String(agent.session.id)) === undefined) return
    registration.controls = dependencies.installBoundControls(agent, operations)
  }
  const install = (agent: Agent): void => {
    if (installed.has(agent)) return
    const command = dependencies.installCommand(agent, operations)
    installed.set(agent, { command })
    installBoundControls(agent)
  }

  const continueAfterCompletion = async (longGoalId: string, execution: { sessionId: string, goalId: string }): Promise<void> => {
    const taskAgent = ctx.agents.get(execution.sessionId as never)
    if (taskAgent !== undefined) {
      await taskAgent.whenIdle()
      await flush(taskAgent)
    }
    const record = readV3(longGoalId)
    if (
      record === undefined
      || record.control.autoProgress !== 'running'
      || record.planner.phase === 'complete'
    ) return
    const task = boundTask(record, execution.sessionId, execution.goalId)
    if (task === undefined) return
    const status = await readStatus(longGoalId)
    const projected = status.tasks.find(candidate => candidate.id === task.id)
    if (projected?.phase !== 'complete' || settledTasks(status) <= record.planner.consideredSettledTasks) return
    await dependencies.continueProgress({ longGoalId, expectedRevision: record.revision })
  }

  const reconcile = async (longGoalId: string): Promise<void> => {
    const record = readV3(longGoalId)
    if (
      record === undefined
      || record.control.autoProgress !== 'running'
      || record.planner.phase === 'complete'
    ) return
    const status = await readStatus(longGoalId)
    if (status.goal.phase === 'blocked' || status.goal.phase === 'complete') return
    if (lanes.get(longGoalId)?.completion !== undefined) return
    const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
    const requiresContinue = record.planner.phase === 'unplanned'
      || record.planner.phase === 'needs-replan'
      || status.goal.phase === 'planning'
      || current?.execution === null
      || settledTasks(status) > record.planner.consideredSettledTasks
      || !exactLiveArmedTask(ctx, record, status)
    if (requiresContinue) await dependencies.continueProgress({ longGoalId, expectedRevision: record.revision })
  }

  const pauseForControlStop = async (longGoalId: string): Promise<void> => {
    const record = readV3(longGoalId)
    if (
      record === undefined
      || record.control.autoProgress !== 'running'
      || record.planner.phase === 'complete'
    ) return
    dependencies.pause({ longGoalId, expectedRevision: record.revision })
    const paused = readV3(longGoalId)
    if (paused === undefined) return
    const status = await readStatus(longGoalId)
    const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
    const execution = current?.execution
    if (execution === null || execution === undefined) return
    const exact = boundTask(paused, execution.sessionId, execution.goalId)
    const taskAgent = ctx.agents.get(execution.sessionId as never)
    if (exact === undefined || taskAgent === undefined) {
      throw new LongGoalIntegrityError('Continuous Goal active Task cancellation could not be confirmed')
    }
    const goal = taskAgent.ctx.goals.get(taskAgent)
    if (goal === undefined || String(goal.id) !== execution.goalId) {
      throw new LongGoalIntegrityError('Continuous Goal active Task cancellation could not be confirmed')
    }
    taskAgent.cancel({ kind: 'parent' })
    await taskAgent.whenIdle()
    await flush(taskAgent)
    await readStatus(longGoalId)
  }

  const pauseForTaskStop = async (longGoalId: string, sessionId: string): Promise<void> => {
    const record = readV3(longGoalId)
    if (
      record === undefined
      || record.control.autoProgress !== 'running'
      || record.planner.phase === 'complete'
    ) return
    const status = await readStatus(longGoalId)
    const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
    const execution = current?.execution
    if (execution === null || execution === undefined || execution.sessionId !== sessionId) return
    const exact = boundTask(record, execution.sessionId, execution.goalId)
    const taskAgent = ctx.agents.get(sessionId as never)
    if (taskAgent === undefined) return
    const goal = taskAgent.ctx.goals.get(taskAgent)
    if (
      exact === undefined
      || exact.id !== current?.id
      || goal === undefined
      || String(goal.id) !== execution.goalId
    ) return
    dependencies.pause({ longGoalId, expectedRevision: record.revision })
    await taskAgent.whenIdle()
    await flush(taskAgent)
    await readStatus(longGoalId)
  }

  for (const agent of ctx.agents.list()) install(agent)
  for (const record of dependencies.listLongGoals()) {
    if (isV3(record)) void joinOrStart(record.id, () => reconcile(record.id)).catch(() => undefined)
  }

  const offGoal = ctx.on('goal/changed', ({ agent, change }) => {
    if (change.operation !== 'complete') return
    const sessionId = String(agent.session.id)
    const goalId = String(change.ref.id)
    for (const record of dependencies.listLongGoals()) {
      if (
        !isV3(record)
        || record.control.autoProgress !== 'running'
        || record.planner.phase === 'complete'
      ) continue
      if (boundTask(record, sessionId, goalId) !== undefined) {
        void appendCompletion(record.id, { sessionId, goalId }).catch(() => undefined)
      }
    }
  })
  const offSession = ctx.on('session/event', (session, event) => {
    if (!isUserAbort(event)) return
    const sessionId = String(session.id)
    for (const record of dependencies.listLongGoals()) {
      if (
        !isV3(record)
        || record.control.autoProgress !== 'running'
        || record.planner.phase === 'complete'
      ) continue
      if (record.control.sessionId === sessionId) {
        void append(record.id, () => pauseForControlStop(record.id)).catch(() => undefined)
      } else if (boundTask(record, sessionId) !== undefined) {
        void append(record.id, () => pauseForTaskStop(record.id, sessionId)).catch(() => undefined)
      }
    }
  })
  const offAgent = ctx.on('agent/created', ({ agent }) => { install(agent) })

  return async () => {
    offGoal()
    offSession()
    offAgent()
    const registrations = [...installed.values()]
    installed.clear()
    for (const registration of registrations) {
      await disposeRegistration(registration.controls)
      registration.command()
    }
    await Promise.allSettled([...lanes.values()])
    if (failures.length > 0) throw new AggregateError(failures, 'Continuous Goal Host lane failures')
  }
}
