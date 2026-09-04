import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import type { Session } from '@deepseek-ai/dsh-session'

import type { ContinuousGoalAgentOperations } from './continuous-goal-agent.js'
import { LongGoalIntegrityError, readTianwenTaskAttemptProjection } from './long-goal.js'
import {
  createLongGoalLiveness,
  type DurableProgressFact,
} from './long-goal-liveness.js'
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
  readonly transition: 'complete' | 'block'
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
  readonly getGoal?: (agent: Agent) => GoalView | undefined
  readonly deliver?: (intent: ContinuousGoalDeliveryIntent) => Promise<void | boolean>
  readonly reportProgress?: (input: {
    readonly planner: Agent
    readonly facts: readonly DurableProgressFact[]
    readonly signal: AbortSignal
  }) => Promise<void | boolean>
  readonly recordTerminalAttempt?: (input: {
    readonly longGoalId: string
    readonly status: LongGoalStatusProjectionV3
    readonly mainInboxBoundarySeq?: number
    readonly terminalEventId?: string
  }) => Promise<boolean | void>
  readonly reportError: (error: unknown) => void
  readonly installCommand: (
    agent: Agent,
    operations: ContinuousGoalAgentOperations,
  ) => CommandRegistration
  readonly installBoundControls: (
    agent: Agent,
    operations: ContinuousGoalAgentOperations,
  ) => () => void | Promise<void>
  readonly handlePermissionEvent?: (input: {
    readonly longGoalId: string
    readonly session: Session
    readonly event: unknown
  }) => Promise<void>
  readonly reconcilePermissionAttempt?: (input: {
    readonly longGoalId: string
  }) => Promise<void>
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

function exactLiveRunningTask(
  ctx: HostContext,
  status: LongGoalStatusProjectionV3,
  getGoal?: ContinuousGoalHostDependencies['getGoal'],
): boolean {
  if (status.currentTaskId === null) return false
  const task = status.tasks.find(candidate => candidate.id === status.currentTaskId)
  if (task?.execution === null || task?.execution === undefined || task.phase !== 'active') return false
  const agent = ctx.agents.get(task.execution.sessionId as never)
  const goal = agent === undefined ? undefined : getGoal === undefined ? agent.ctx.goals.get(agent) : getGoal(agent)
  return goal !== undefined
    && String(goal.id) === task.execution.goalId
    && goal.phase === 'active'
    && (goal.activation === 'armed' || agent?.status === 'running')
}

function activeProgressTransition(
  status: LongGoalStatusProjectionV3,
): 'start' | 'advance' | undefined {
  if (status.goal.phase !== 'active' || status.currentTaskId === null) return undefined
  const currentIndex = status.tasks.findIndex(task => task.id === status.currentTaskId)
  const current = status.tasks[currentIndex]
  if (
    currentIndex < 0
    || current?.phase !== 'active'
    || current.execution === null
    || current.execution === undefined
  ) return undefined
  return currentIndex === 0 ? 'start' : 'advance'
}

function durableProgressFact(
  record: LongGoalRecordV3,
  status: LongGoalStatusProjectionV3,
): DurableProgressFact {
  const currentIndex = status.tasks.findIndex(task => task.id === status.currentTaskId)
  const current = currentIndex < 0 ? undefined : status.tasks[currentIndex]
  const settled = (currentIndex < 0 ? status.tasks : status.tasks.slice(0, currentIndex))
    .findLast(task => task.phase === 'complete' || task.phase === 'abandoned')
  const next = status.tasks
    .slice(Math.max(0, currentIndex + 1))
    .find(task => task.phase === 'pending')
  return {
    stage: current === undefined
      ? status.goal.phase
      : `${status.goal.phase}: Task ${currentIndex + 1} of ${status.tasks.length}`,
    ...(settled === undefined ? {} : { lastCompletedAction: settled.objective }),
    ...(current?.phase === 'active' ? { waitingFor: `Task result: ${current.objective}` } : {}),
    ...(next === undefined ? {} : { nextAction: next.objective }),
    changedAt: new Date(record.updatedAt).toISOString(),
  }
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
  const terminalEvidence = new Map<string, Promise<{
    readonly mainInboxBoundarySeq: number
    readonly terminalEventId: string
  } | undefined>>()
  const deliveryTasks = new Set<Promise<void>>()
  const failures: unknown[] = []
  const installed = new Map<Agent, {
    command: CommandRegistration
    controls?: () => void | Promise<void>
  }>()
  const creatingControlSessions = new Set<string>()
  const liveness = createLongGoalLiveness<Agent>({
    report: async report => {
      await dependencies.reportProgress?.({
        planner: report.reporter,
        facts: report.facts,
        signal: AbortSignal.timeout(30_000),
      })
    },
    reportError: dependencies.reportError,
  })

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
      const task = Promise.resolve().then(() => dependencies.deliver!(intent)).then(delivered => {
        if (delivered === false) deliveryKeys.delete(deliveryKey(intent))
      }, error => {
        deliveryKeys.delete(deliveryKey(intent))
        try { dependencies.reportError(error) } catch {}
      })
      deliveryTasks.add(task)
      void task.finally(() => { deliveryTasks.delete(task) }).catch(() => undefined)
    }
  }
  const deliveryKey = (intent: ContinuousGoalDeliveryIntent): string => [
    intent.longGoalId,
    intent.transition,
    intent.status.goal.revision,
    intent.status.currentTaskId ?? 'no-current-task',
  ].join(':')
  const recordDelivery = (intent: ContinuousGoalDeliveryIntent): void => {
    const key = deliveryKey(intent)
    if (deliveryKeys.has(key)) return
    deliveryKeys.add(key)
    const intents = pendingDeliveries.get(intent.longGoalId) ?? []
    intents.push(intent)
    pendingDeliveries.set(intent.longGoalId, intents)
  }
  const recordProgressDelivery = (
    longGoalId: string,
    status: LongGoalStatusProjectionV3,
    offlineRecovery = false,
  ): void => {
    const record = readV3(longGoalId)
    if (record === undefined) return
    const transition = status.goal.phase === 'complete'
      ? 'complete'
      : status.goal.phase === 'blocked'
        ? 'block'
        : activeProgressTransition(status)
    if (transition === 'complete' || transition === 'block') {
      liveness.observe({
        parentKey: record.control.sessionId,
        sourceKey: record.id,
        state: transition === 'block' ? 'blocked' : 'terminal',
      })
      if (offlineRecovery) recordDelivery({ longGoalId, transition, status })
      return
    }
    if (transition !== 'start' && transition !== 'advance') return
    const planner = ctx.agents.get(record.planner.sessionId as never)
    if (planner === undefined || String(planner.session.id) !== record.planner.sessionId) return
    liveness.observe({
      parentKey: record.control.sessionId,
      sourceKey: record.id,
      reporter: planner,
      state: 'active',
      fact: durableProgressFact(record, status),
    })
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
  const transitionKey = (transition: TaskTransition): string =>
    `${transition.operation}:${transition.sessionId}:${transition.goalId}:${transition.revision}`
  const capturedBoundary = async (transition: TaskTransition): Promise<{
    readonly captured: boolean
    readonly evidence?: { readonly mainInboxBoundarySeq: number, readonly terminalEventId: string }
  }> => {
    const evidence = terminalEvidence.get(transitionKey(transition))
    if (evidence === undefined) return { captured: false }
    const persisted = await evidence
    return persisted === undefined ? { captured: true } : { captured: true, evidence: persisted }
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
        const progress = dependencies.createProgress({
          objective, context: null, successCriteria: null, workspaceRoot, agentPreset, controlSessionId,
        })
        let createdBindings = allControlRecords(dependencies.listLongGoals(), controlSessionId)
          .filter(record => !existingGoalIds.has(record.id))
        if (createdBindings.length !== 1) {
          await progress
          createdBindings = allControlRecords(dependencies.listLongGoals(), controlSessionId)
            .filter(record => !existingGoalIds.has(record.id))
        }
        if (createdBindings.length !== 1) {
          throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
        }
        const created = createdBindings[0]!
        installBoundControls(agent)
        rememberLane(created.id, progress.then(result => {
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
          if (transition !== undefined) recordProgressDelivery(created.id, result.status)
        }, error => {
          throw error
        }))
        return { action: 'started' }
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
    const boundary = await capturedBoundary({ operation: 'complete', ...execution })
    if (boundary.captured && boundary.evidence === undefined) return
    const taskAgent = ctx.agents.get(execution.sessionId as never)
    if (!boundary.captured && taskAgent !== undefined) {
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
    const folded = await dependencies.recordTerminalAttempt?.({
      longGoalId,
      status,
      ...(boundary.evidence ?? {}),
    })
    if (folded === false) return
    const terminalRecord = readV3(longGoalId)
    if (terminalRecord === undefined) return
    await dependencies.continueProgress({ longGoalId, expectedRevision: terminalRecord.revision })
    recordProgressDelivery(longGoalId, await readStatus(longGoalId))
  }

  const recordAfterBlock = async (longGoalId: string, execution: { sessionId: string, goalId: string, revision: number }): Promise<void> => {
    const boundary = await capturedBoundary({ operation: 'block', ...execution })
    if (boundary.captured && boundary.evidence === undefined) return
    const taskAgent = ctx.agents.get(execution.sessionId as never)
    if (!boundary.captured) {
      if (taskAgent === undefined) return
      await taskAgent.whenIdle()
      await flush(taskAgent)
    }
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
    const folded = await dependencies.recordTerminalAttempt?.({
      longGoalId,
      status: blocked,
      ...(boundary.evidence ?? {}),
    })
    if (folded === false) return
    recordProgressDelivery(longGoalId, blocked)
  }

  const reconcile = async (longGoalId: string): Promise<void> => {
    await dependencies.reconcilePermissionAttempt?.({ longGoalId })
    const record = readV3(longGoalId)
    if (record === undefined) return
    const status = await readStatus(longGoalId)
    if (status.goal.phase === 'blocked' || status.goal.phase === 'complete') {
      const folded = await dependencies.recordTerminalAttempt?.({ longGoalId, status })
      if (folded === false) return
      recordProgressDelivery(longGoalId, await readStatus(longGoalId), true)
      return
    }
    const pendingTerminalBoundary = record.tasks.some(task => {
      const projection = readTianwenTaskAttemptProjection(record, task.id)
      return projection.attempts.at(-1)?.status === 'running'
        && projection.terminalDeliveryBoundary !== undefined
    })
    if (pendingTerminalBoundary) {
      await dependencies.recordTerminalAttempt?.({ longGoalId, status })
      return
    }
    if (record.control.autoProgress !== 'running' || record.planner.phase === 'complete') return
    if (lanes.get(longGoalId)?.transition !== undefined) return
    const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
    const hasNewSettledTask = settledTasks(status) > record.planner.consideredSettledTasks
    const requiresContinue = record.planner.phase === 'unplanned'
      || record.planner.phase === 'needs-replan'
      || status.goal.phase === 'planning'
      || current?.execution === null
      || hasNewSettledTask
      || !exactLiveRunningTask(ctx, status, dependencies.getGoal)
    if (requiresContinue) {
      if (hasNewSettledTask) {
        const folded = await dependencies.recordTerminalAttempt?.({ longGoalId, status })
        if (folded === false) return
      }
      const currentRecord = readV3(longGoalId)
      if (currentRecord === undefined) return
      await dependencies.continueProgress({ longGoalId, expectedRevision: currentRecord.revision })
      const recovered = await readStatus(longGoalId)
      if (recovered.goal.phase === 'complete' || recovered.goal.phase === 'blocked' || hasNewSettledTask) {
        if (recovered.goal.phase === 'complete' || recovered.goal.phase === 'blocked') {
          const folded = await dependencies.recordTerminalAttempt?.({ longGoalId, status: recovered })
          if (folded === false) return
        }
        recordProgressDelivery(
          longGoalId,
          recovered.goal.phase === 'complete' || recovered.goal.phase === 'blocked'
            ? await readStatus(longGoalId)
            : recovered,
          true,
        )
      } else {
        const transition = activeProgressTransition(recovered)
        if (transition !== undefined) recordProgressDelivery(longGoalId, recovered)
      }
    } else {
      const transition = activeProgressTransition(status)
      if (transition !== undefined) recordProgressDelivery(longGoalId, status)
    }
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
    const goal = dependencies.getGoal === undefined ? taskAgent.ctx.goals.get(taskAgent) : dependencies.getGoal(taskAgent)
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
    const goal = dependencies.getGoal === undefined ? taskAgent.ctx.goals.get(taskAgent) : dependencies.getGoal(taskAgent)
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
    const userAbort = isUserAbort(event)
    const eventType = typeof event === 'object' && event !== null
      ? (event as { readonly type?: unknown }).type
      : undefined
    const permissionEvent = eventType === 'tool/result' || eventType === 'sandbox/mode'
    const terminal = eventType === 'goal/change'
      ? event as unknown as {
          readonly seq: number
          readonly data: {
            readonly operation?: unknown
            readonly ref?: { readonly id?: unknown, readonly revision?: unknown }
            readonly goal?: { readonly id?: unknown, readonly revision?: unknown }
          }
        }
      : undefined
    const terminalOperation = terminal?.data.operation === 'complete' || terminal?.data.operation === 'block'
      ? terminal.data.operation
      : undefined
    if (!userAbort && !permissionEvent && terminalOperation === undefined) return
    const sessionId = String(session.id)
    for (const record of dependencies.listLongGoals()) {
      if (
        !isV3(record)
        || record.control.autoProgress !== 'running'
        || record.planner.phase === 'complete'
      ) continue
      if (terminalOperation !== undefined) {
        const goalId = String(terminal!.data.ref?.id ?? terminal!.data.goal?.id)
        const task = boundTask(record, sessionId, goalId)
        const attempt = task === undefined
          ? undefined
          : readTianwenTaskAttemptProjection(record, task.id).attempts.at(-1)
        const main = ctx.agents.get(record.control.sessionId as never)
        const taskAgent = ctx.agents.get(sessionId as never)
        if (
          task !== undefined
          && attempt?.status === 'running'
          && attempt.parentSessionId === record.planner.sessionId
          && attempt.childSessionId === sessionId
          && taskAgent !== undefined
          && String(taskAgent.session.id) === sessionId
          && main !== undefined
          && String(main.session.id) === record.control.sessionId
          && Number.isSafeInteger(terminal!.seq)
        ) {
          const key = transitionKey({
            operation: terminalOperation,
            sessionId,
            goalId,
            revision: Number(terminal!.data.ref?.revision ?? terminal!.data.goal?.revision),
          })
          if (!terminalEvidence.has(key)) {
            const mainInboxBoundarySeq = main.session.events.at(-1)?.seq ?? -1
            const terminalEventId = `goal-change:${sessionId}:${terminal!.seq}:${terminalOperation}`
            const checkpoint = Promise.all([flush(taskAgent), flush(main)])
            void checkpoint.catch(() => undefined)
            terminalEvidence.set(key, append(record.id, async () => {
              try {
                await taskAgent.whenIdle()
                await checkpoint
                return { mainInboxBoundarySeq, terminalEventId }
              } catch (error) {
                try { dependencies.reportError(error) } catch {}
                return undefined
              }
            }, false))
          }
        }
      }
      const routePermissionEvent = dependencies.handlePermissionEvent !== undefined && (
        (eventType === 'sandbox/mode' && record.control.sessionId === sessionId)
        || (eventType === 'tool/result' && boundTask(record, sessionId) !== undefined)
      )
      if (routePermissionEvent) {
        void append(record.id, () => dependencies.handlePermissionEvent!({
          longGoalId: record.id,
          session,
          event,
        })).catch(() => undefined)
      } else if (userAbort && record.control.sessionId === sessionId) {
        void append(record.id, () => pauseForControlStop(record.id)).catch(() => undefined)
      } else if (userAbort && boundTask(record, sessionId) !== undefined) {
        void append(record.id, () => pauseForTaskStop(record.id, sessionId)).catch(() => undefined)
      }
    }
  })
  const offAgent = ctx.on('agent/created', ({ agent }) => {
    install(agent)
    const sessionId = String(agent.session.id)
    for (const record of dependencies.listLongGoals()) {
      if (
        isV3(record)
        && (record.control.sessionId === sessionId || record.planner.sessionId === sessionId)
      ) {
        const recovery = dependencies.reconcilePermissionAttempt === undefined
          ? joinOrStart(record.id, () => reconcile(record.id))
          : append(record.id, () => reconcile(record.id))
        void recovery.catch(() => undefined)
      }
    }
  })

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
    await liveness.dispose()
    if (failures.length > 0) throw new AggregateError(failures, 'Continuous Goal Host lane failures')
  }
}
