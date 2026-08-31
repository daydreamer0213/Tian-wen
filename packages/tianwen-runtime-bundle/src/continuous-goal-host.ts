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

type CommandRegistration = {
  dispose(): void | Promise<void>
}

export interface ContinuousGoalDeliveryIntent {
  readonly longGoalId: string
  readonly transition: 'start' | 'advance' | 'complete' | 'block'
  readonly status: LongGoalStatusProjectionV3
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
  }) => Promise<ContinuousGoalControlResult>
  readonly control: (input: GoalProgressInput & {
    readonly action: ContinuousGoalControlAction
  }) => Promise<unknown>
  readonly continueProgress: (input: GoalProgressInput) => Promise<unknown>
  /** Persist only the v3 control mode; cancellation is owned by this Host. */
  readonly pause: (input: GoalProgressInput) => unknown
  readonly flushSession: (agent: Agent) => Promise<void | boolean>
  readonly deliver?: (intent: ContinuousGoalDeliveryIntent) => Promise<void>
  readonly reportError: (error: unknown) => void
  readonly installCommand: (
    agent: Agent,
    operations: ContinuousGoalAgentOperations,
  ) => CommandRegistration
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

function allControlRecords(
  records: readonly AnyLongGoalRecord[],
  sessionId: string,
): LongGoalRecordV3[] {
  return records.filter((record): record is LongGoalRecordV3 =>
    isV3(record) && record.control.sessionId === sessionId)
}

function controlRecords(
  records: readonly AnyLongGoalRecord[],
  sessionId: string,
): LongGoalRecordV3[] {
  return allControlRecords(records, sessionId).filter(record => record.planner.phase !== 'complete')
}

function uniqueControlRecord(
  records: readonly AnyLongGoalRecord[],
  sessionId: string,
): LongGoalRecordV3 | undefined {
  const matches = controlRecords(records, sessionId)
  if (matches.length > 1) return undefined
  return matches[0] ?? allControlRecords(records, sessionId)[0]
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
  type TaskTransition = {
    readonly operation: 'complete' | 'block'
    readonly sessionId: string
    readonly goalId: string
    readonly revision: number
  }
  type Lane = Promise<unknown> & { transition?: TaskTransition }
  const lanes = new Map<string, Lane>()
  const pendingDeliveries = new Map<string, ContinuousGoalDeliveryIntent[]>()
  const deliveryKeys = new Set<string>()
  const observedTaskTransitions = new Set<string>()
  const deliveryTasks = new Set<Promise<void>>()
  const failures: unknown[] = []
  const installed = new Map<Agent, {
    command: CommandRegistration
    controls?: () => void | Promise<void>
  }>()
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
  const startPendingDeliveries = (longGoalId: string): void => {
    const intents = pendingDeliveries.get(longGoalId)
    pendingDeliveries.delete(longGoalId)
    if (dependencies.deliver === undefined || intents === undefined) return
    for (const intent of intents) {
      const task = Promise.resolve().then(() => dependencies.deliver!(intent)).catch(error => {
        try { dependencies.reportError(error) } catch {}
      })
      deliveryTasks.add(task)
      void task.finally(() => { deliveryTasks.delete(task) }).catch(() => undefined)
    }
  }
  const recordDelivery = (intent: ContinuousGoalDeliveryIntent): void => {
    const key = [
      intent.longGoalId,
      intent.transition,
      intent.status.goal.revision,
      intent.status.currentTaskId ?? 'no-current-task',
    ].join(':')
    if (deliveryKeys.has(key)) return
    deliveryKeys.add(key)
    const intents = pendingDeliveries.get(intent.longGoalId) ?? []
    intents.push(intent)
    pendingDeliveries.set(intent.longGoalId, intents)
  }
  const rememberLane = <T>(
    longGoalId: string,
    task: Promise<T>,
    transition?: TaskTransition,
    reportFailure = true,
  ): Promise<T> => {
    const lane = task as Promise<T> & { transition?: TaskTransition }
    if (transition !== undefined) lane.transition = transition
    lanes.set(longGoalId, lane)
    if (reportFailure) {
      void task.catch(error => {
        failures.push(error)
        try { dependencies.reportError(error) } catch {}
      })
    }
    void task.finally(() => {
      if (lanes.get(longGoalId) === lane) {
        lanes.delete(longGoalId)
        startPendingDeliveries(longGoalId)
      }
    }).catch(() => undefined)
    return lane
  }
  const joinOrStart = (longGoalId: string, work: () => Promise<void>): Promise<void> => {
    const existing = lanes.get(longGoalId)
    if (existing !== undefined) return existing.then(() => undefined)
    return rememberLane(longGoalId, Promise.resolve().then(work))
  }
  const append = <T>(longGoalId: string, work: () => Promise<T>, reportFailure = true): Promise<T> => {
    const previous = lanes.get(longGoalId)
    const task = (previous ?? Promise.resolve()).then(work, work)
    return rememberLane(longGoalId, task, previous?.transition, reportFailure)
  }
  const appendTaskTransition = (
    longGoalId: string,
    transition: TaskTransition,
  ): Promise<void> => {
    const previous = lanes.get(longGoalId)
    if (
      previous?.transition?.operation === transition.operation
      && previous.transition.sessionId === transition.sessionId
      && previous.transition.goalId === transition.goalId
      && previous.transition.revision === transition.revision
    ) return previous.then(() => undefined)
    const task = (previous ?? Promise.resolve()).then(
      () => transition.operation === 'complete'
        ? continueAfterCompletion(longGoalId, transition)
        : recordAfterBlock(longGoalId, transition),
      () => transition.operation === 'complete'
        ? continueAfterCompletion(longGoalId, transition)
        : recordAfterBlock(longGoalId, transition),
    )
    return rememberLane(longGoalId, task, transition)
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
        const existingGoalIds = new Set(records.map(record => record.id))
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
        })
        const createdBindings = allControlRecords(dependencies.listLongGoals(), controlSessionId)
          .filter(record => !existingGoalIds.has(record.id))
        if (createdBindings.length !== 1) {
          throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
        }
        const created = createdBindings[0]!
        if (result.status.goal.id !== created.id) {
          throw new LongGoalIntegrityError('Continuous Goal creation returned a different durable Goal')
        }
        const current = result.status.currentTaskId === null
          ? undefined
          : result.status.tasks.find(task => task.id === result.status.currentTaskId)
        const transition = result.status.goal.phase === 'complete'
          ? 'complete'
          : result.status.goal.phase === 'blocked'
            ? 'block'
            : result.status.goal.phase === 'active' && current?.phase === 'active'
              ? 'start'
              : undefined
        if (transition !== undefined) {
          recordDelivery({ longGoalId: created.id, transition, status: result.status })
          startPendingDeliveries(created.id)
        }
        installBoundControls(agent)
        return { action: result.action }
      } finally {
        creatingControlSessions.delete(controlSessionId)
      }
    },
    control: async (agent, action) => {
      const controlSessionId = String(agent.session.id)
      const records = dependencies.listLongGoals()
      const bindings = controlRecords(records, controlSessionId)
      if (bindings.length > 1) {
        throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
      }
      const record = bindings[0] ?? allControlRecords(records, controlSessionId)[0]
      if (record === undefined) throw new Error('No active continuous Goal is bound to this Agent.')
      return await append(record.id, async () => {
        const latest = readV3(record.id)
        if (latest === undefined || latest.control.sessionId !== controlSessionId) {
          throw new Error('No active continuous Goal is bound to this Agent.')
        }
        return await dependencies.control({
          longGoalId: latest.id, expectedRevision: latest.revision,
          action: latest.planner.phase === 'complete' ? { action: 'status' } : action,
        }) as Pick<ContinuousGoalControlResult, 'action'>
      }, false)
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

  const continueAfterCompletion = async (longGoalId: string, execution: { sessionId: string, goalId: string, revision: number }): Promise<void> => {
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
    const finalStatus = await readStatus(longGoalId)
    const current = finalStatus.currentTaskId === null
      ? undefined
      : finalStatus.tasks.find(candidate => candidate.id === finalStatus.currentTaskId)
    const transition = finalStatus.goal.phase === 'complete'
      ? 'complete'
      : finalStatus.goal.phase === 'blocked'
        ? 'block'
        : finalStatus.goal.phase === 'active' && current?.phase === 'active'
          ? 'advance'
          : undefined
    if (transition !== undefined) recordDelivery({ longGoalId, transition, status: finalStatus })
  }

  const recordAfterBlock = async (longGoalId: string, execution: { sessionId: string, goalId: string, revision: number }): Promise<void> => {
    const taskAgent = ctx.agents.get(execution.sessionId as never)
    if (taskAgent === undefined) return
    await taskAgent.whenIdle()
    await flush(taskAgent)
    const record = readV3(longGoalId)
    if (record === undefined || record.control.autoProgress !== 'running' || record.planner.phase === 'complete') return
    const task = boundTask(record, execution.sessionId, execution.goalId)
    if (task === undefined) return
    const blocked = await readStatus(longGoalId)
    const current = blocked.currentTaskId === null
      ? undefined
      : blocked.tasks.find(candidate => candidate.id === blocked.currentTaskId)
    if (
      blocked.goal.phase !== 'blocked'
      || current?.id !== task.id
      || current.phase !== 'blocked'
      || current.execution?.sessionId !== execution.sessionId
      || current.execution.goalId !== execution.goalId
    ) return
    recordDelivery({
      longGoalId,
      transition: 'block',
      status: blocked,
    })
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
    if (lanes.get(longGoalId)?.transition !== undefined) return
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
    if (change.operation !== 'complete' && change.operation !== 'block') return
    const sessionId = String(agent.session.id)
    const goalId = String(change.ref.id)
    for (const record of dependencies.listLongGoals()) {
      if (
        !isV3(record)
        || record.control.autoProgress !== 'running'
        || record.planner.phase === 'complete'
      ) continue
      if (boundTask(record, sessionId, goalId) !== undefined) {
        const transitionKey = `${record.id}:${change.operation}:${sessionId}:${goalId}:${change.ref.revision}`
        if (observedTaskTransitions.has(transitionKey)) continue
        observedTaskTransitions.add(transitionKey)
        void appendTaskTransition(record.id, {
          operation: change.operation,
          sessionId,
          goalId,
          revision: change.ref.revision,
        }).catch(() => undefined)
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
      await registration.command.dispose()
    }
    await Promise.allSettled([...lanes.values()])
    await Promise.allSettled([...deliveryTasks])
    if (failures.length > 0) throw new AggregateError(failures, 'Continuous Goal Host lane failures')
  }
}
