import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentSetup, ModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { WIDER_MODES } from '@deepseek-ai/dsh-sandbox'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { SubagentError } from '@deepseek-ai/dsh-subagent'
import { GoalId } from '@deepseek-ai/dsh-goal'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
import type { EvidenceRecord } from '@tianwen/evidence'
import { projectEvidence as projectPersistedEvidence } from '@tianwen/evidence/projector'
import type { LearningIntakeStatus } from '@tianwen/evolution/learning-intake'

import type {
  AnyLongGoalRecord,
  AnyLongGoalStatusProjection,
  AnyLongGoalSummary,
  GoalFirstLongGoalRecord,
  GoalFirstLongGoalStatusProjection,
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
  LongGoalRecordV3,
  LongGoalSummary,
  LongGoalSummaryV2,
  LongGoalSummaryV3,
  LongGoalStatusProjectionV3,
  ReadLongGoalStatusProjection,
} from './long-goal-contract.js'
import {
  abandonGoalFirstTask,
  addGoalFirstGuidance,
  continueGoalFirstProgress,
  createGoalFirstProgress,
} from './goal-first-service.js'
import type { GoalFirstProgressResult, GoalFirstServiceDependencies } from './goal-first-service.js'
import {
  abandonBlockedLongGoalTask,
  abandonContinuousGoalTask,
  appendLongGoalGuidance,
  appendContinuousGoalGuidance,
  appendTianwenAttemptSettled,
  appendTianwenTerminalDeliveryBoundary,
  appendTianwenTerminalDeliveryObserved,
  appendTianwenAttemptProvisioningFailed,
  appendTianwenAttemptStarted,
  bindGoalFirstLongGoalTask,
  bindLongGoalTask,
  createContinuousLongGoal,
  createGoalFirstLongGoal,
  createLongGoal,
  listLongGoals,
  LongGoalIntegrityError,
  LongGoalRevisionConflictError,
  markTianwenAttemptPermissionLimited,
  observeTianwenAttemptPermissionMode,
  readLongGoal,
  readLongGoalStatus,
  readTianwenTaskAttemptProjection,
  rebaseTianwenPermissionReservation,
  redirectContinuousGoal,
  reserveTianwenPermissionRenewal,
  setContinuousGoalMode,
} from './long-goal.js'
import { NATIVE_LONG_GOAL_PLANNER_SCOPE, runLongGoalPlannerTurn } from './long-goal-planner.js'
import type { LongGoalPlannerDependencies } from './long-goal-planner.js'
import {
  controlContinuousGoal,
  createContinuousGoalProgress,
} from './continuous-goal-service.js'
import type { ContinuousGoalServiceDependencies } from './continuous-goal-service.js'
import { installBoundContinuousGoalControls, installContinuousGoalCommand } from './continuous-goal-agent.js'
import { mountContinuousGoalHost, type ContinuousGoalDeliveryIntent } from './continuous-goal-host.js'
import {
  buildLongGoalProgressReport,
  buildContinuousGoalSettlementNotice,
} from './continuous-goal-feedback.js'
import type { DurableProgressFact } from './long-goal-liveness.js'
import { readSettledTaskResult } from './settled-task-result.js'
import {
  projectLearningAudit,
  type LearningAudit,
} from './learning-clue-status.js'
import { readGoalStatus } from './status.js'
import { NativeLongGoalChild } from './native-long-goal-child.js'
import {
  permissionLimitedEvidence,
  permissionSnapshot,
  sandboxModeFromEvents,
  type PermissionSnapshot,
} from './permission-attempt.js'

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
  readonly sandboxPolicy: {
    readonly defaultMode: SandboxMode
    overrideOf(session: Session): SandboxMode | undefined
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
  readonly status: GoalFirstLongGoalStatusProjection
  readonly sessionId?: string
  readonly action: 'started' | 'continued' | 'already-running' | 'complete'
}

type AnyRunCurrentTaskResult = {
  readonly status: ReadLongGoalStatusProjection
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
    readonly parentSessionId?: string
    readonly label?: string
  }) => Promise<string>
  readonly reserveTaskSessionId?: () => string
  readonly installNativeTaskSetup?: (sessionId: string, setup: AgentSetup) => void
  readonly startNativeTaskChild?: (input: {
    readonly parent: Agent
    readonly childId: string
    readonly label: string
    readonly prompt: { readonly type: 'text', readonly text: string }[]
    readonly agentOptions: AgentOptions
    readonly signal: AbortSignal
  }) => Promise<{ readonly childId: unknown }>
  readonly followupNativeTaskChild?: (
    parent: Agent,
    childId: string,
    prompt: { readonly type: 'text', readonly text: string }[],
    signal: AbortSignal,
  ) => Promise<unknown>
  readonly nativeAgentOptions?: AgentOptions
  readonly attachedAgent: (sessionId: string) => Agent | undefined
  readonly recoverNativeTaskParent?: (
    record: GoalFirstLongGoalRecord,
  ) => Promise<NativePlannerRecoveryLease | undefined>
  readonly getGoal?: (agent: Agent) => GoalView | undefined
  readonly nativeGoalService?: Pick<Context['goals'], 'resume' | 'disarm'>
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
  readonly readPermissionSnapshot?: (controlSessionId: string) => PermissionSnapshot
}

export interface NativePlannerRecoveryDependencies {
  readonly listSessions: TianwenLongGoalRunDependencies['listSessions']
  readonly attachedAgent: TianwenLongGoalRunDependencies['attachedAgent']
  readonly installNativeSetup: (sessionId: string, setup: AgentSetup) => void
  readonly followupNativeChild: NonNullable<TianwenLongGoalRunDependencies['followupNativeTaskChild']>
}

export interface NativePlannerRecoveryLease {
  readonly parent: Agent
  readonly release: () => void
}

export async function recoverNativeLongGoalPlannerParent(
  record: GoalFirstLongGoalRecord,
  dependencies: NativePlannerRecoveryDependencies,
): Promise<NativePlannerRecoveryLease | undefined> {
  if (record.schemaVersion !== 'tianwen.long-goal.v3') return undefined
  const existing = dependencies.attachedAgent(record.planner.sessionId)
  if (existing !== undefined) return { parent: existing, release: () => undefined }
  const main = dependencies.attachedAgent(record.control.sessionId)
  if (main === undefined || String(main.session.id) !== record.control.sessionId) return undefined
  const matches = (await dependencies.listSessions())
    .filter(session => session.sessionId === record.planner.sessionId)
  if (
    matches.length !== 1
    || matches[0]!.cwd !== record.workspaceRoot
    || matches[0]!.agentPreset !== record.planner.agentPreset
  ) {
    throw new LongGoalIntegrityError('Continuous Goal Planner recovery Session mismatch')
  }
  const claimed = Promise.withResolvers<Agent>()
  const released = Promise.withResolvers<void>()
  let claimedOnce = false
  dependencies.installNativeSetup(record.planner.sessionId, agentCtx => {
    const planner = agentCtx.agent
    if (planner === undefined) {
      throw new LongGoalIntegrityError('Continuous Goal Planner recovery Agent is unavailable')
    }
    agentCtx.tools.register(defineTool({
      name: 'recover_long_goal_task',
      description: 'Hold this recovered Planner turn while Tianwen reconnects its already-started Task. Call exactly once.',
      parameters: {},
      output: {
        schema: { type: 'string', const: 'task-recovery-admitted' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(_args, exec) {
        if (claimedOnce) throw new LongGoalIntegrityError('Continuous Goal Planner recovery was already claimed')
        claimedOnce = true
        claimed.resolve(planner)
        await released.promise
        exec.concludeTurn()
        return 'task-recovery-admitted'
      },
    }))
  })
  try {
    await dependencies.followupNativeChild(
      main,
      record.planner.sessionId,
      [{
        type: 'text',
        text: 'Recover only as the existing Long Goal Planner parent so Tianwen can continue the already-started Task after Host restart. Call recover_long_goal_task exactly once. Do not replan, start another Task, or modify the workspace.',
      }],
      AbortSignal.timeout(30_000),
    )
  } catch (error) {
    released.resolve()
    throw error
  }
  let recovered: Agent
  try {
    recovered = await Promise.race([
      claimed.promise,
      new Promise<never>((_resolve, reject) => {
        const signal = AbortSignal.timeout(30_000)
        signal.addEventListener('abort', () => {
          reject(new LongGoalIntegrityError('Continuous Goal Planner recovery was not claimed'))
        }, { once: true })
      }),
    ])
  } catch (error) {
    released.resolve()
    throw error
  }
  if (
    String(recovered.id) !== record.planner.sessionId
    || String(recovered.session.id) !== record.planner.sessionId
    || recovered.session.header.parentSession !== record.control.sessionId
    || recovered.session.header.cwd !== record.workspaceRoot
    || recovered.session.header.agentPreset !== record.planner.agentPreset
  ) {
    released.resolve()
    throw new LongGoalIntegrityError('Continuous Goal Planner recovery identity mismatch')
  }
  return { parent: recovered, release: released.resolve }
}

type PermissionAttemptSessionView = {
  readonly meta?: Partial<Pick<SessionHeader, 'id' | 'parentSession' | 'seedLength'>>
  readonly events: readonly SessionEvent[]
}

export interface PermissionAttemptHostDependencies {
  readonly roots: TianwenLongGoalHostRoots
  readonly readLongGoal: typeof readLongGoal
  readonly projectEvidence: (sessionId: string, events: readonly SessionEvent[]) => readonly EvidenceRecord[]
  readonly inspectSession: (sessionId: string) => Promise<PermissionAttemptSessionView | undefined>
  readonly flushSession: (session: Session) => Promise<boolean>
  readonly quiesceNativeAttempt: (input: {
    readonly controlSessionId: string
    readonly plannerSessionId: string
    readonly childSessionId: string
  }) => Promise<void>
  readonly attachedAgent: (sessionId: string) => Agent | undefined
  readonly reserveSessionId: () => string
  readonly startNativeChild: (input: {
    readonly parent: Agent
    readonly childId: string
    readonly label: string
    readonly prompt: { readonly type: 'text', readonly text: string }[]
    readonly agentOptions: AgentOptions
    readonly persona?: string
    readonly toolFilter?: ToolRestriction
    readonly signal: AbortSignal
  }) => Promise<{ readonly childId: unknown }>
  readonly followupNativeChild: (
    parent: Agent,
    childId: string,
    prompt: { readonly type: 'text', readonly text: string }[],
    signal: AbortSignal,
  ) => Promise<unknown>
  readonly nativeAgentOptions: AgentOptions
  readonly runCurrentTask: (input: {
    readonly roots: TianwenLongGoalHostRoots
    readonly longGoalId: string
    readonly expectedRevision: number
  }) => Promise<AnyRunCurrentTaskResult>
  readonly notifyMain: (agent: Agent, message: ReturnType<typeof createUserMessage>) => void
  readonly now?: () => string
}

function delegatedSandboxObservation(
  view: PermissionAttemptSessionView,
): {
  readonly mode: SandboxMode
  readonly seq: number
} | undefined {
  const seedLength = view.meta?.seedLength ?? 0
  if (!Number.isSafeInteger(seedLength) || (seedLength as number) < 0) return undefined
  for (let index = view.events.length - 1; index >= 0; index -= 1) {
    const event = view.events[index] as unknown as {
      readonly type?: unknown
      readonly seq?: unknown
      readonly data?: { readonly mode?: unknown, readonly source?: unknown }
    } | undefined
    if (
      event?.type !== 'sandbox/mode'
      || event.data?.source !== 'delegation'
      || !Number.isSafeInteger(event.seq)
      || (event.seq as number) < (seedLength as number)
    ) continue
    const mode = event.data.mode
    if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
      return { mode, seq: event.seq as number }
    }
  }
  return undefined
}

function assertPermissionAttemptAuthority(
  childSessionId: string,
  parentSessionId: string,
  actual: { readonly id?: unknown, readonly parentSession?: unknown } | undefined,
): void {
  if (
    actual === undefined
    || String(actual.id) !== childSessionId
    || String(actual.parentSession) !== parentSessionId
  ) throw new LongGoalIntegrityError('Permission-limited Task lineage is not live and exact')
}

function explicitSandboxModeFromEvents(events: readonly SessionEvent[]): {
  readonly mode: SandboxMode
  readonly seq: number
} | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as unknown as {
      readonly type?: unknown
      readonly seq?: unknown
      readonly data?: { readonly mode?: unknown, readonly source?: unknown }
    } | undefined
    if (event?.type !== 'sandbox/mode' || !Number.isSafeInteger(event.seq)) continue
    if (event.data?.source === 'delegation' || event.data?.source === 'default') continue
    const mode = event.data?.mode
    if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
      return { mode, seq: event.seq as number }
    }
  }
  return undefined
}

function currentAttemptTask(record: LongGoalRecordV3) {
  let active: {
    readonly task: LongGoalRecordV3['tasks'][number]
    readonly attempts: ReturnType<typeof readTianwenTaskAttemptProjection>['attempts']
    readonly current: ReturnType<typeof readTianwenTaskAttemptProjection>['attempts'][number]
  } | undefined
  for (const task of record.tasks) {
    const attempts = readTianwenTaskAttemptProjection(record, task.id).attempts
    const current = attempts.at(-1)
    if (current?.status !== 'running' && current?.status !== 'permission-limited') continue
    if (active !== undefined) {
      throw new LongGoalIntegrityError('Continuous Goal has multiple current Task attempts')
    }
    active = { task, attempts, current }
  }
  return active
}

export function createPermissionAttemptHost(
  dependencies: PermissionAttemptHostDependencies,
): {
  readonly handlePermissionEvent: (input: {
    readonly longGoalId: string
    readonly session: Session
    readonly event: unknown
  }) => Promise<void>
  readonly reconcilePermissionAttempt: (input: { readonly longGoalId: string }) => Promise<void>
} {
  const now = dependencies.now ?? (() => new Date().toISOString())
  const notifyPermissionLimit = (record: LongGoalRecordV3): void => {
    const main = dependencies.attachedAgent(record.control.sessionId)
    if (main === undefined || String(main.session.id) !== record.control.sessionId) return
    const attempt = currentAttemptTask(record)?.current
    const permissionMode = attempt?.permissionMode
    const text = permissionMode === undefined
      ? 'A Task attempt reached a sandbox limit, but Tianwen cannot verify the old permission mode. Changing this main Session to Full access will not automatically create a new attempt. Read goal_control status before explaining the current state in this main Session.'
      : (WIDER_MODES[permissionMode] ?? []).length === 0
        ? 'A Task attempt reached the highest available sandbox permission. There is no wider permission mode, so changing this main Session to Full access will not automatically create a new attempt. Read goal_control status before explaining the current state in this main Session.'
        : 'An earlier Task attempt reached its sandbox limit. Read goal_control status first. Ask the user to change this main Session to Full access only if the latest status includes requiredUserAction; explain that native setting without creating a separate approval question. Otherwise report the current state instead of repeating the old permission request.'
    dependencies.notifyMain(main, createUserMessage({
      content: [{
        type: 'text',
        text,
      }],
      source: { kind: 'plugin', plugin: 'tianwen', form: 'notice', summary: 'Task permission status changed' },
    }))
  }

  const quiesceAttempt = (
    record: LongGoalRecordV3,
    attempt: NonNullable<ReturnType<typeof currentAttemptTask>>['current'],
  ): Promise<void> => {
    const liveTask = dependencies.attachedAgent(attempt.childSessionId)
    if (liveTask !== undefined) assertPermissionAttemptAuthority(
      attempt.childSessionId,
      attempt.parentSessionId,
      { id: liveTask.session.id, parentSession: liveTask.session.header.parentSession },
    )
    return dependencies.quiesceNativeAttempt({
      controlSessionId: record.control.sessionId,
      plannerSessionId: attempt.parentSessionId,
      childSessionId: attempt.childSessionId,
    })
  }

  const observeCurrentAttemptMode = async (record: LongGoalRecordV3): Promise<LongGoalRecordV3> => {
    const attemptTask = currentAttemptTask(record)
    if (attemptTask === undefined) return record
    const oldChild = await dependencies.inspectSession(attemptTask.current.childSessionId)
    if (oldChild !== undefined) assertPermissionAttemptAuthority(
      attemptTask.current.childSessionId,
      attemptTask.current.parentSessionId,
      oldChild.meta,
    )
    if (oldChild === undefined || attemptTask.current.permissionMode !== undefined) return record
    const observation = delegatedSandboxObservation(oldChild)
    if (observation === undefined) return record
    return observeTianwenAttemptPermissionMode({
      stateRoot: dependencies.roots.stateRoot,
      longGoalId: record.id,
      expectedRevision: record.revision,
      taskId: attemptTask.task.id,
      epoch: attemptTask.current.epoch,
      childSessionId: attemptTask.current.childSessionId,
      permissionMode: observation.mode,
      permissionEventSeq: observation.seq,
    })
  }

  const consumePersistedPermissionLimit = async (
    record: LongGoalRecordV3,
    quiescedChildSessionId?: string,
  ): Promise<LongGoalRecordV3> => {
    const attemptTask = currentAttemptTask(record)
    if (
      attemptTask?.current.status !== 'running'
      || attemptTask.task.execution?.sessionId !== attemptTask.current.childSessionId
      || attemptTask.task.resolution !== null
    ) return record
    const persisted = await dependencies.inspectSession(attemptTask.current.childSessionId)
    if (persisted === undefined) return record
    assertPermissionAttemptAuthority(
      attemptTask.current.childSessionId,
      attemptTask.current.parentSessionId,
      persisted.meta,
    )
    const snapshot = {
      ...(attemptTask.current.permissionMode === undefined ? {} : { mode: attemptTask.current.permissionMode }),
      eventSeq: null,
      fingerprint: attemptTask.current.permissionFingerprint,
    } as const
    const evidence = permissionLimitedEvidence(
      persisted.events,
      dependencies.projectEvidence(attemptTask.current.childSessionId, persisted.events),
      snapshot,
    )
    if (evidence === undefined) return record
    if (quiescedChildSessionId !== attemptTask.current.childSessionId) {
      await quiesceAttempt(record, attemptTask.current)
    }
    const frozen = await dependencies.inspectSession(attemptTask.current.childSessionId)
    if (frozen === undefined) return record
    assertPermissionAttemptAuthority(
      attemptTask.current.childSessionId,
      attemptTask.current.parentSessionId,
      frozen.meta,
    )
    if (permissionLimitedEvidence(
      frozen.events,
      dependencies.projectEvidence(attemptTask.current.childSessionId, frozen.events),
      snapshot,
    )?.evidenceId !== evidence.evidenceId) return record
    const limited = markTianwenAttemptPermissionLimited({
      stateRoot: dependencies.roots.stateRoot,
      longGoalId: record.id,
      expectedRevision: record.revision,
      taskId: attemptTask.task.id,
      epoch: attemptTask.current.epoch,
      childSessionId: attemptTask.current.childSessionId,
      terminalEventId: `permission-limited:${evidence.evidenceId}`,
    })
    notifyPermissionLimit(limited)
    return limited
  }

  const reconcilePermissionAttemptInternal = async (
    input: { readonly longGoalId: string },
    quiescedChildSessionId?: string,
  ): Promise<void> => {
    let record = dependencies.readLongGoal(dependencies.roots.stateRoot, input.longGoalId)
    if (record.schemaVersion !== 'tianwen.long-goal.v3') return
    record = await observeCurrentAttemptMode(record)
    record = await consumePersistedPermissionLimit(record, quiescedChildSessionId)
    let attemptTask = currentAttemptTask(record)
    if (
      attemptTask?.current.status === 'permission-limited'
      && attemptTask.task.execution === null
      && attemptTask.task.resolution === null
      && attemptTask.current.permissionMode !== undefined
    ) {
      const persistedMain = await dependencies.inspectSession(record.control.sessionId)
      const explicit = persistedMain === undefined
        ? undefined
        : explicitSandboxModeFromEvents(persistedMain.events)
      if (explicit === undefined || !(WIDER_MODES[attemptTask.current.permissionMode] ?? []).includes(explicit.mode)) return
      const snapshot = permissionSnapshot(persistedMain!.events, explicit.mode)
      record = reserveTianwenPermissionRenewal({
        stateRoot: dependencies.roots.stateRoot,
        longGoalId: record.id,
        expectedRevision: record.revision,
        taskId: attemptTask.task.id,
        plannerSessionId: dependencies.reserveSessionId(),
        childSessionId: dependencies.reserveSessionId(),
        permissionFingerprint: snapshot.fingerprint,
        permissionMode: explicit.mode,
        startedAt: now(),
      })
      attemptTask = currentAttemptTask(record)
    }
    if (
      attemptTask?.current.status !== 'running'
      || attemptTask.task.execution !== null
      || attemptTask.task.resolution !== null
      || attemptTask.current.parentSessionId !== record.planner.sessionId
    ) return
    const previous = attemptTask.attempts.at(-2)
    if (previous?.status !== 'permission-limited' || previous.permissionMode === undefined) return
    const main = dependencies.attachedAgent(record.control.sessionId)
    if (main === undefined || String(main.session.id) !== record.control.sessionId) return
    let planner = dependencies.attachedAgent(record.planner.sessionId)
    if (
      planner !== undefined
      && sandboxModeFromEvents(planner.session.events, true) !== attemptTask.current.permissionMode
    ) return
    if (planner === undefined) {
      const prompt = [{
        type: 'text' as const,
        text: `Coordinate the already-reserved retry for Task: ${attemptTask.task.objective}`,
      }]
      const inspection = await dependencies.inspectSession(record.planner.sessionId)
      if (inspection === undefined) {
        const finalExplicit = explicitSandboxModeFromEvents(main.session.events)
        if (
          finalExplicit === undefined
          || !(WIDER_MODES[previous.permissionMode] ?? []).includes(finalExplicit.mode)
        ) return
        const finalSnapshot = permissionSnapshot(main.session.events, finalExplicit.mode)
        if (
          attemptTask.current.permissionMode !== finalSnapshot.mode
          || attemptTask.current.permissionFingerprint !== finalSnapshot.fingerprint
        ) {
          record = rebaseTianwenPermissionReservation({
            stateRoot: dependencies.roots.stateRoot,
            longGoalId: record.id,
            expectedRevision: record.revision,
            taskId: attemptTask.task.id,
            epoch: attemptTask.current.epoch,
            plannerSessionId: attemptTask.current.parentSessionId,
            childSessionId: attemptTask.current.childSessionId,
            oldPermissionFingerprint: attemptTask.current.permissionFingerprint,
            permissionFingerprint: finalSnapshot.fingerprint,
            permissionMode: finalSnapshot.mode,
            permissionEventSeq: finalExplicit.seq,
          })
          attemptTask = currentAttemptTask(record)
          if (attemptTask?.current.status !== 'running') return
        }
        const starting = dependencies.startNativeChild({
          parent: main,
          childId: record.planner.sessionId,
          label: 'Long Goal Planner permission renewal',
          prompt,
          agentOptions: dependencies.nativeAgentOptions,
          ...NATIVE_LONG_GOAL_PLANNER_SCOPE,
          signal: AbortSignal.timeout(30_000),
        })
        const started = await starting
        if (String(started.childId) !== record.planner.sessionId) {
          throw new LongGoalIntegrityError('Renewed Long Goal Planner Session identity mismatch')
        }
      } else {
        const delegatedMode = sandboxModeFromEvents(inspection.events, true)
        if (delegatedMode !== attemptTask.current.permissionMode) return
        const following = dependencies.followupNativeChild(
          main,
          record.planner.sessionId,
          prompt,
          AbortSignal.timeout(30_000),
        )
        await following
      }
      planner = dependencies.attachedAgent(record.planner.sessionId)
    }
    if (
      planner === undefined
      || String(planner.session.id) !== record.planner.sessionId
      || String(planner.session.header.parentSession) !== record.control.sessionId
    ) return
    const latest = dependencies.readLongGoal(dependencies.roots.stateRoot, input.longGoalId)
    if (latest.schemaVersion !== 'tianwen.long-goal.v3') return
    await dependencies.runCurrentTask({
      roots: dependencies.roots,
      longGoalId: latest.id,
      expectedRevision: latest.revision,
    })
  }

  const handlePermissionEvent = async (input: {
    readonly longGoalId: string
    readonly session: Session
    readonly event: unknown
  }): Promise<void> => {
    let record = dependencies.readLongGoal(dependencies.roots.stateRoot, input.longGoalId)
    if (record.schemaVersion !== 'tianwen.long-goal.v3') return
    record = await observeCurrentAttemptMode(record)
    const attemptTask = currentAttemptTask(record)
    const typedEvent = input.event as { readonly type?: unknown, readonly seq?: unknown }
    const relevantTaskResult = typedEvent.type === 'tool/result'
      && attemptTask?.current.status === 'running'
      && attemptTask.current.childSessionId === String(input.session.id)
      && attemptTask.task.execution?.sessionId === String(input.session.id)
    const relevantMainMode = typedEvent.type === 'sandbox/mode'
      && record.control.sessionId === String(input.session.id)
    if (!relevantTaskResult && !relevantMainMode) return
    if (relevantTaskResult) {
      assertPermissionAttemptAuthority(
        attemptTask!.current.childSessionId,
        attemptTask!.current.parentSessionId,
        { id: input.session.id, parentSession: input.session.header.parentSession },
      )
      const evidence = permissionLimitedEvidence(
        input.session.events,
        dependencies.projectEvidence(String(input.session.id), input.session.events),
        {
          ...(attemptTask!.current.permissionMode === undefined ? {} : { mode: attemptTask!.current.permissionMode }),
          eventSeq: null,
          fingerprint: attemptTask!.current.permissionFingerprint,
        },
      )
      if (evidence?.source.resultSeq !== typedEvent.seq) return
      await quiesceAttempt(record, attemptTask!.current)
      await reconcilePermissionAttemptInternal(
        { longGoalId: record.id },
        attemptTask!.current.childSessionId,
      )
      return
    }
    if (!await dependencies.flushSession(input.session)) return
    await reconcilePermissionAttemptInternal({ longGoalId: record.id })
  }

  return {
    handlePermissionEvent,
    reconcilePermissionAttempt: input => reconcilePermissionAttemptInternal(input),
  }
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

function requireLegacyV2GoalFirstProgress(result: GoalFirstProgressResult): GoalFirstProgressResultV2 {
  if (result.status.schemaVersion !== 'tianwen.long-goal-status.v2') {
    throw new LongGoalIntegrityError('Tianwen Goal-first Host supports only v2 status')
  }
  return {
    schemaVersion: result.schemaVersion,
    action: result.action,
    status: result.status,
    sessionId: result.sessionId,
  }
}

export interface TianwenLearningAuditOperations {
  readonly status: (sessionId?: string) => Promise<LearningAudit>
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

function currentGoal(
  agent: Agent,
  sessionId: string,
  goalId: string,
  getGoal?: TianwenLongGoalRunDependencies['getGoal'],
): GoalView {
  if (String(agent.session.id) !== sessionId) {
    throw new Error('Long Goal Task bound Session mismatch')
  }
  const goal = getGoal === undefined ? agent.ctx.goals.get(agent) : getGoal(agent)
  if (goal === undefined || String(goal.id) !== goalId) {
    throw new Error('Long Goal Task bound Goal mismatch')
  }
  return goal
}

function nativeTaskPrompt(objective: string, continuation?: string): string {
  return [
    'Execute exactly one Tianwen Long Goal Task.',
    `Task objective: ${objective}`,
    'Future steps mentioned in the objective are context, not additional work for this Task.',
    'Do not create status-marker files merely to claim completion.',
    'A native DSH Goal is already active in this Task Session.',
    continuation,
    continuation === undefined
      ? 'Before your final report, call get_goal, then call update_goal with its exact goal_id and revision and action complete only after the Task objective is achieved.'
      : 'Before your final report, call get_goal, then complete_long_goal_task with its exact goal_id and revision only after the Task objective is achieved. This recovered Task has a scoped completion tool; do not use update_goal to complete or resume it.',
    'Do not create another Goal, replan the Long Goal, or ask the control chat to execute this Task.',
    'Report the verified Task result to your parent after the Goal update succeeds.',
  ].filter((line): line is string => line !== undefined).join('\n')
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
  record: GoalFirstLongGoalRecord,
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
  const readStatus = async (): Promise<ReadLongGoalStatusProjection> =>
    dependencies.readLongGoalStatus(statusInput(input))
  const status = await readStatus()
  const record = dependencies.readLongGoal(input.roots.stateRoot, input.longGoalId)
  const goalFirstRecord = record.schemaVersion === 'tianwen.long-goal.v2' || record.schemaVersion === 'tianwen.long-goal.v3'
    ? record
    : undefined
  const expectedStatusSchema = record.schemaVersion === 'tianwen.long-goal.v1'
    ? 'tianwen.long-goal-status.v1'
    : record.schemaVersion === 'tianwen.long-goal.v2'
      ? 'tianwen.long-goal-status.v2'
      : 'tianwen.long-goal-status.v3'
  if (status.schemaVersion !== expectedStatusSchema) {
    throw new LongGoalIntegrityError('Long Goal Task record/status schema mismatch')
  }
  if (goalFirstRecord !== undefined) {
    if (input.expectedRevision === undefined) {
      throw new Error('Goal-first Long Goal requires goal-first service')
    }
    if (!isPositiveInteger(input.expectedRevision)) {
      throw new TypeError('Goal-first Task admission expected revision is invalid')
    }
    if (goalFirstRecord.revision !== input.expectedRevision) {
      throw new LongGoalRevisionConflictError(input.expectedRevision, goalFirstRecord.revision)
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
    if (goalFirstRecord !== undefined && (
      (status as GoalFirstLongGoalStatusProjection).planner.phase !== 'ready' ||
      status.goal.phase !== 'active'
    )) {
      throw new LongGoalIntegrityError('Goal-first Task admission requires an active ready state')
    }
    if (goalFirstRecord?.schemaVersion === 'tianwen.long-goal.v3') {
      const reserveTaskSessionId = dependencies.reserveTaskSessionId
      const startNativeTaskChild = dependencies.startNativeTaskChild
      const nativeAgentOptions = dependencies.nativeAgentOptions
      if (reserveTaskSessionId === undefined || startNativeTaskChild === undefined || nativeAgentOptions === undefined) {
        throw new LongGoalIntegrityError('Continuous Goal native Task services are unavailable')
      }
      const attempts = readTianwenTaskAttemptProjection(goalFirstRecord, task.id).attempts
      const reserved = attempts.at(-1)?.status === 'running' ? attempts.at(-1) : undefined
      if (reserved !== undefined && reserved.parentSessionId !== goalFirstRecord.planner.sessionId) {
        throw new LongGoalIntegrityError('Reserved native Long Goal Task Planner identity mismatch')
      }
      const epoch = reserved?.epoch ?? attempts.length + 1
      const sessionId = reserved?.childSessionId ?? reserveTaskSessionId()
      const permissionSnapshotAtStart = reserved === undefined
        ? dependencies.readPermissionSnapshot?.(goalFirstRecord.control.sessionId)
        : undefined
      const permissionFingerprint = reserved?.permissionFingerprint
        ?? permissionSnapshotAtStart?.fingerprint
        ?? `sha256:unclassified:${goalFirstRecord.control.sessionId}` as const
      const permissionMode = reserved?.permissionMode
        ?? permissionSnapshotAtStart?.mode
        ?? 'read-only'
      const attemptRevision = input.expectedRevision! + (reserved === undefined ? 1 : 0)
      if (reserved === undefined) {
        appendTianwenAttemptStarted({
          stateRoot: input.roots.stateRoot,
          longGoalId: input.longGoalId,
          expectedRevision: input.expectedRevision!,
          taskId: task.id,
          epoch,
          parentSessionId: goalFirstRecord.planner.sessionId,
          childSessionId: sessionId,
          permissionFingerprint,
          permissionMode,
          startedAt: new Date().toISOString(),
        })
      }
      const liveParent = dependencies.attachedAgent(goalFirstRecord.planner.sessionId)
      const recoveredParent = liveParent === undefined
        ? await dependencies.recoverNativeTaskParent?.(goalFirstRecord)
        : undefined
      const parent = liveParent ?? recoveredParent?.parent
      if (parent === undefined || String(parent.session.id) !== goalFirstRecord.planner.sessionId) {
        recoveredParent?.release()
        throw new LongGoalIntegrityError('Continuous Goal Planner parent Agent is not live')
      }
      let agent = dependencies.attachedAgent(sessionId)
      let setupAgent: Agent | undefined
      const admitNativeTaskAgent = (candidate: Agent): void => {
        if (String(candidate.session.id) !== sessionId) {
          throw new LongGoalIntegrityError('Native Long Goal Task Session identity mismatch')
        }
        if (
          candidate.session.header.cwd !== goalFirstRecord.workspaceRoot ||
          candidate.session.header.agentPreset !== goalFirstRecord.planner.agentPreset
        ) {
          throw new LongGoalIntegrityError('New Goal-first Task Session header mismatch')
        }
        const durableGoal = dependencies.getGoal === undefined
          ? candidate.ctx.goals.get(candidate)
          : dependencies.getGoal(candidate)
        if (
          durableGoal !== undefined
          && (durableGoal.objective !== task.objective || durableGoal.maxGoalRounds !== record.maxTaskRounds)
        ) throw new LongGoalIntegrityError('Accepted native Long Goal Task Goal mismatch')
        const goal = durableGoal ?? dependencies.createGoal(candidate, {
          objective: task.objective,
          maxGoalRounds: record.maxTaskRounds,
        })
        const latest = dependencies.readLongGoal(input.roots.stateRoot, input.longGoalId)
        if (latest.schemaVersion !== 'tianwen.long-goal.v3') {
          throw new LongGoalIntegrityError('Continuous Goal Task record schema changed during admission')
        }
        const latestTask = latest.tasks.find(candidateTask => candidateTask.id === task.id)
        if (latestTask === undefined) {
          throw new LongGoalIntegrityError('Continuous Goal Task disappeared during admission')
        }
        if (latestTask.execution === null) {
          dependencies.bindGoalFirstLongGoalTask({
            stateRoot: input.roots.stateRoot,
            longGoalId: input.longGoalId,
            expectedRevision: attemptRevision,
            taskId: task.id,
            execution: { sessionId, goalId: String(goal.id) },
          })
        } else if (
          latestTask.execution.sessionId !== sessionId ||
          latestTask.execution.goalId !== String(goal.id)
        ) {
          throw new LongGoalIntegrityError('Continuous Goal Task execution changed during native admission')
        }
        setupAgent = candidate
      }
      dependencies.installNativeTaskSetup?.(sessionId, childCtx => {
        const candidate = childCtx.agent
        if (candidate === undefined) {
          throw new LongGoalIntegrityError('Continuous Goal native Task Agent is unavailable during setup')
        }
        childCtx.on('agent/created', ({ agent: created }) => {
          if (created === candidate) admitNativeTaskAgent(candidate)
        })
      })
      try {
        if (agent === undefined) {
          let started: { readonly childId: unknown }
          try {
            started = await startNativeTaskChild({
              parent,
              childId: sessionId,
              label: `Task ${taskIndex + 1}: ${task.objective}`,
              prompt: [{ type: 'text', text: nativeTaskPrompt(task.objective) }],
              agentOptions: nativeAgentOptions,
              signal: AbortSignal.timeout(30_000),
            })
          } catch (cause) {
            if (setupAgent !== undefined) {
              throw cause
            } else if (cause instanceof SubagentError && cause.code === 'DUPLICATE_CHILD') {
              if (dependencies.followupNativeTaskChild === undefined) {
                throw new LongGoalIntegrityError('Continuous Goal native Task services are unavailable')
              }
              await dependencies.followupNativeTaskChild(
                parent,
                sessionId,
                [{
                  type: 'text',
                  text: nativeTaskPrompt(
                    task.objective,
                    'Cold-adopt the already accepted Task. Do not repeat completed work; continue only unfinished work from durable Session state.',
                  ),
                }],
                AbortSignal.timeout(30_000),
              )
              started = { childId: sessionId }
            } else {
              appendTianwenAttemptProvisioningFailed({
                stateRoot: input.roots.stateRoot,
                longGoalId: input.longGoalId,
                expectedRevision: attemptRevision,
                taskId: task.id,
                epoch,
                terminalEventId: `provisioning-failed:${sessionId}:${randomUUID()}`,
              })
              throw cause
            }
          }
          if (String(started.childId) !== sessionId) {
            throw new LongGoalIntegrityError('Native Long Goal Task Session identity mismatch')
          }
          agent = dependencies.attachedAgent(sessionId) ?? setupAgent
        }
      } finally {
        recoveredParent?.release()
      }
      if (agent === undefined || String(agent.session.id) !== sessionId) {
        throw new LongGoalIntegrityError('New native Long Goal Task Session has no exact Agent')
      }
      admitNativeTaskAgent(agent)
      await dependencies.flushSession(agent)
      return { status: await readStatus(), sessionId, action: 'started' }
    }

    let cwd: string | undefined
    let agentPreset: string | undefined
    if (goalFirstRecord !== undefined) {
      cwd = goalFirstRecord.workspaceRoot
      agentPreset = goalFirstRecord.planner.agentPreset
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
      goalFirstRecord !== undefined &&
      (
        agent.session.header.cwd !== goalFirstRecord.workspaceRoot ||
        agent.session.header.agentPreset !== goalFirstRecord.planner.agentPreset
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
      if (goalFirstRecord !== undefined) {
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
    if (goalFirstRecord !== undefined) {
      await requireGoalFirstTaskSessionHeader(goalFirstRecord, sessionId, dependencies)
    }
    const ref = await dependencies.readGoalRef(sessionId, goalId)
    if (ref.id !== goalId || !Number.isSafeInteger(ref.revision) || ref.revision < 1) {
      throw new Error('Cold Long Goal Task Goal ref mismatch')
    }
    if (ref.phase === 'blocked') throw blockedTaskError(task.id, ref.blockedReason)
    if (ref.phase !== 'active' && ref.phase !== 'paused') {
      throw new Error('Cold Long Goal Task Goal is not resumable')
    }
    if (goalFirstRecord?.schemaVersion === 'tianwen.long-goal.v3') {
      if (dependencies.followupNativeTaskChild === undefined) {
        throw new LongGoalIntegrityError('Continuous Goal native Task services are unavailable')
      }
      const liveParent = dependencies.attachedAgent(goalFirstRecord.planner.sessionId)
      const recoveredParent = liveParent === undefined
        ? await dependencies.recoverNativeTaskParent?.(goalFirstRecord)
        : undefined
      const parent = liveParent ?? recoveredParent?.parent
      if (parent === undefined || String(parent.session.id) !== goalFirstRecord.planner.sessionId) {
        recoveredParent?.release()
        throw new LongGoalIntegrityError('Continuous Goal Planner parent Agent is not live')
      }
      try {
        await dependencies.followupNativeTaskChild(
          parent,
          sessionId,
          [{ type: 'text', text: nativeTaskPrompt(task.objective, 'Continue only unfinished work from durable Session state.') }],
          AbortSignal.timeout(30_000),
        )
      } finally {
        recoveredParent?.release()
      }
    } else {
      await dependencies.resumeColdGoal({ sessionId, goalId, revision: ref.revision })
    }
    agent = dependencies.attachedAgent(sessionId)
    if (agent === undefined) throw new Error('Resumed Long Goal Task Session has no attached Agent')
    const resumed = currentGoal(agent, sessionId, goalId, dependencies.getGoal)
    // Native followup owns this turn; it need not arm the separate Goal-round driver.
    // The turn may also finish before native admission returns to this caller.
    const nativeFollowup = goalFirstRecord?.schemaVersion === 'tianwen.long-goal.v3'
    if (nativeFollowup && resumed.phase === 'blocked') throw blockedTaskError(task.id, resumed.blockedReason)
    if (nativeFollowup
      ? resumed.phase !== 'active' && resumed.phase !== 'complete'
      : resumed.phase !== 'active' || resumed.activation !== 'armed') {
      throw new Error('Resumed Long Goal Task Goal mismatch')
    }
    await dependencies.flushSession(agent)
    return { status: await readStatus(), sessionId, action: 'continued' }
  }

  const goal = currentGoal(agent, sessionId, goalId, dependencies.getGoal)
  if (goal.phase === 'active' && (
    goal.activation === 'armed'
    || (goalFirstRecord?.schemaVersion === 'tianwen.long-goal.v3' && agent.status === 'running')
  )) {
    return { status, sessionId, action: 'already-running' }
  }
  if (goal.phase === 'blocked') throw blockedTaskError(task.id, goal.blockedReason)
  if ((goal.phase !== 'active' && goal.phase !== 'paused') || goal.activation !== 'disarmed') {
    throw new Error('Bound Long Goal Task Goal is not resumable')
  }
  if (goalFirstRecord !== undefined) {
    await requireGoalFirstTaskSessionHeader(goalFirstRecord, sessionId, dependencies)
  }
  if (goalFirstRecord?.schemaVersion === 'tianwen.long-goal.v3') {
    if (dependencies.followupNativeTaskChild === undefined) {
      throw new LongGoalIntegrityError('Continuous Goal native Task services are unavailable')
    }
    const liveParent = dependencies.attachedAgent(goalFirstRecord.planner.sessionId)
    const recoveredParent = liveParent === undefined
      ? await dependencies.recoverNativeTaskParent?.(goalFirstRecord)
      : undefined
    const nativeParent = liveParent ?? recoveredParent?.parent
    if (nativeParent === undefined || String(nativeParent.session.id) !== goalFirstRecord.planner.sessionId) {
      recoveredParent?.release()
      throw new LongGoalIntegrityError('Continuous Goal Planner parent Agent is not live')
    }
    try {
      const nativeGoals = dependencies.nativeGoalService ?? agent.ctx.goals
      const resumed = nativeGoals.resume(agent, { id: goal.id, revision: goal.revision })
      if (String(resumed.id) !== goalId || resumed.phase !== 'active' || resumed.activation !== 'armed') {
        throw new Error('Resumed Long Goal Task Goal mismatch')
      }
      // The native child followup owns execution, not a second Goal-round driver.
      nativeGoals.disarm(agent)
      try {
        await dependencies.followupNativeTaskChild!(
          nativeParent,
          sessionId,
          [{ type: 'text', text: nativeTaskPrompt(task.objective, 'Continue only unfinished work from durable Session state.') }],
          AbortSignal.timeout(30_000),
        )
      } catch (cause) {
        let cleanupCause: unknown
        try {
          nativeGoals.disarm(agent)
          await dependencies.flushSession(agent)
        } catch (error) {
          cleanupCause = error
        }
        if (cleanupCause !== undefined) {
          throw new AggregateError([cause, cleanupCause], 'Native Long Goal Task followup cleanup failed')
        }
        throw cause
      }
    } finally {
      recoveredParent?.release()
    }
    await dependencies.flushSession(agent)
    return { status: await readStatus(), sessionId, action: 'continued' }
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

function summary(status: ReadLongGoalStatusProjection, updatedAt: number): AnyLongGoalSummary {
  if (status.schemaVersion === 'tianwen.long-goal-status.v3') {
    const result: LongGoalSummaryV3 = {
      schemaVersion: 'tianwen.long-goal-summary.v3',
      id: status.goal.id,
      objective: status.goal.objective,
      phase: status.goal.phase,
      revision: status.goal.revision,
      completedTasks: status.goal.completedTasks,
      abandonedTasks: status.goal.abandonedTasks,
      totalTasks: status.goal.totalTasks,
      currentTaskId: status.currentTaskId,
      updatedAt,
      control: status.control,
    }
    return result
  }
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
  learningAuditOperations?: TianwenLearningAuditOperations,
): ConnectionRpcHandler {
  const readStatus = async (longGoalId: string): Promise<AnyLongGoalStatusProjection> =>
    dependencies.readLongGoalStatus({
      stateRoot: roots.stateRoot,
      longGoalId,
      dshStatusTarget: {
        sessionsRoot: roots.sessionsRoot,
        evolutionRoot: roots.evolutionRoot,
      },
    })
  const legacyGoalFirstMutation = <T>(
    longGoalId: string,
    operation: () => Promise<T>,
  ): Promise<RpcResult<T>> => goalFirstRpc(async () => {
    if ((await readStatus(longGoalId)).schemaVersion !== 'tianwen.long-goal-status.v2') {
      throw new LongGoalIntegrityError('Tianwen Goal-first Host supports only v2 records')
    }
    return operation()
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
      return legacyGoalFirstMutation(longGoalId, () => goalFirstOperations.addGuidance({
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
      return legacyGoalFirstMutation(longGoalId, () => goalFirstOperations.continueProgress({
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
      return legacyGoalFirstMutation(longGoalId, () => goalFirstOperations.abandonCurrentTask({
        longGoalId,
        expectedRevision,
      }))
    }
    if (
      endpoint === 'learning-audit' &&
      learningAuditOperations !== undefined &&
      isRecord(payload) &&
      (hasExactKeys(payload, []) || (hasExactKeys(payload, ['sessionId']) && isNonEmptyString(payload.sessionId)))
    ) {
      return { ok: true, value: await learningAuditOperations.status(payload.sessionId as string | undefined) }
    }
    return invalidRequest()
  }
}


export interface ContinuousGoalSettlementDeliveryDependencies {
  readonly stateRoot: string
  readonly getAgent: (sessionId: string) => Agent | undefined
  readonly readStatus: (longGoalId: string) => Promise<LongGoalStatusProjectionV3>
  readonly inspectSession: (sessionId: string) => Promise<{
    readonly meta: { readonly id: unknown, readonly parentSession?: unknown }
    readonly events: readonly SessionEvent[]
  }>
  readonly flushSession: (agent: Agent) => Promise<void | boolean>
}

const continuousGoalSettlementFlights = new Map<string, Promise<boolean>>()

export async function recordContinuousGoalTerminalAttempt(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly status: LongGoalStatusProjectionV3
  readonly mainInboxBoundarySeq?: number
  readonly terminalEventId?: string
}, dependencies: {
  readonly inspectSession: (sessionId: string) => Promise<{
    readonly meta: { readonly id?: unknown, readonly parentSession?: unknown }
    readonly events: readonly SessionEvent[]
  }>
}): Promise<boolean> {
  const record = readLongGoal(input.stateRoot, input.longGoalId)
  if (record.schemaVersion !== 'tianwen.long-goal.v3') return false
  const terminalTask = input.status.goal.phase === 'blocked'
    ? input.status.tasks.find(task => task.id === input.status.currentTaskId && task.phase === 'blocked')
    : input.status.tasks.findLast(task => task.phase === 'complete' || task.phase === 'abandoned')
  if (terminalTask?.execution === null || terminalTask?.execution === undefined) return false
  const durableTask = record.tasks.find(task => task.id === terminalTask.id)
  if (
    durableTask?.execution?.sessionId !== terminalTask.execution.sessionId
    || durableTask.execution.goalId !== terminalTask.execution.goalId
  ) throw new LongGoalIntegrityError('Continuous Goal terminal Task binding mismatch')
  const projection = readTianwenTaskAttemptProjection(record, durableTask.id)
  const attempt = projection.attempts.at(-1)
  if (attempt?.status === 'settled') return true
  if (attempt?.status !== 'running') return false
  if (
    attempt.childSessionId !== durableTask.execution.sessionId
    || attempt.parentSessionId !== record.planner.sessionId
  ) throw new LongGoalIntegrityError('Continuous Goal terminal attempt identity mismatch')

  const persisted = await dependencies.inspectSession(durableTask.execution.sessionId)
  assertPermissionAttemptAuthority(
    durableTask.execution.sessionId,
    attempt.parentSessionId,
    persisted.meta,
  )
  const operation = terminalTask.phase === 'complete' ? 'complete' : 'block'
  const terminalEvent = [...persisted.events].reverse().find(event => {
    if (event.type !== 'goal/change') return false
    const data = event.data as unknown as {
      readonly operation?: unknown
      readonly ref?: { readonly id?: unknown }
      readonly goal?: { readonly id?: unknown }
    }
    const matchesTerminal = data.operation === operation
      && String(data.ref?.id ?? data.goal?.id) === durableTask.execution!.goalId
      && Number.isSafeInteger(event.seq)
    return matchesTerminal && (
      input.terminalEventId === undefined
      || input.terminalEventId === `goal-change:${durableTask.execution!.sessionId}:${event.seq}:${operation}`
    )
  })
  if (terminalEvent === undefined) return false
  const terminalEventId = `goal-change:${durableTask.execution.sessionId}:${terminalEvent.seq}:${operation}`
  const persistedMain = await dependencies.inspectSession(record.control.sessionId)
  if (String(persistedMain.meta.id) !== record.control.sessionId) {
    throw new LongGoalIntegrityError('Continuous Goal main Session identity mismatch')
  }
  const persistedMainTail = persistedMain.events.at(-1)?.seq ?? -1
  const existingBoundary = projection.terminalDeliveryBoundary
  if (
    existingBoundary !== undefined
    && (
      existingBoundary.terminalEventId !== terminalEventId
      || existingBoundary.parentSessionId !== attempt.parentSessionId
      || persistedMainTail < existingBoundary.mainInboxBoundarySeq
    )
  ) return false
  let currentRecord = record
  if (existingBoundary === undefined) {
    const boundarySeq = input.mainInboxBoundarySeq ?? persistedMainTail
    if (persistedMainTail < boundarySeq) return false
    const ambiguousSettlement = input.mainInboxBoundarySeq === undefined
      && persistedMain.events.some(event => event.type === 'user/message'
        ? isExactPlannerSettlementMessage(event.data, attempt.parentSessionId)
        : event.type === 'agent/inbox/spliced'
          && event.data.inserted.some(message => isExactPlannerSettlementMessage(message, attempt.parentSessionId)))
    if (ambiguousSettlement) return false
    currentRecord = appendTianwenTerminalDeliveryBoundary({
      stateRoot: input.stateRoot,
      longGoalId: record.id,
      expectedRevision: record.revision,
      taskId: durableTask.id,
      epoch: attempt.epoch,
      terminalEventId,
      parentSessionId: attempt.parentSessionId,
      mainInboxBoundarySeq: boundarySeq,
    })
  }
  appendTianwenAttemptSettled({
    stateRoot: input.stateRoot,
    longGoalId: record.id,
    expectedRevision: currentRecord.revision,
    taskId: durableTask.id,
    epoch: attempt.epoch,
    terminalEventId,
  })
  return true
}

export function reportLongGoalProgress(
  ctx: Pick<Context, 'subagents'>,
  input: {
    readonly planner: Agent
    readonly facts: readonly DurableProgressFact[]
    readonly signal: AbortSignal
  },
) {
  return ctx.subagents.reportFrom(input.planner, buildLongGoalProgressReport(input.facts), {
    delivery: 'next-step',
    signal: input.signal,
  })
}

function isExactPlannerSettlementMessage(
  message: { readonly source?: unknown },
  parentSessionId: string,
): boolean {
  const source = message.source as {
    readonly kind?: unknown
    readonly senderSessionId?: unknown
  } | undefined
  return source?.kind === 'subagent-settled'
    && String(source.senderSessionId) === parentSessionId
}

type PlannerSettlementLifecycle = {
  readonly id: string
  readonly admissionSeq: number
  state: 'pending' | 'claimed' | 'canceled'
  turn?: number
  claimObserved?: true
  visibleReply?: true
  endReason?: string
}

function plannerSettlementLifecycles(
  events: readonly SessionEvent[],
  parentSessionId: string,
  afterSeq: number,
): PlannerSettlementLifecycle[] {
  type Pending = {
    readonly id: string
    readonly admissionSeq: number
    readonly lifecycle?: PlannerSettlementLifecycle
  }
  const inbox: Record<'next-turn' | 'next-step', Pending[]> = {
    'next-turn': [],
    'next-step': [],
  }
  const lifecycles: PlannerSettlementLifecycle[] = []
  let openTurn: number | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      openTurn = event.data.turn
      continue
    }
    if (event.type === 'agent/inbox/spliced') {
      const target = inbox[event.data.target]
      const removed = target.slice(event.data.start, event.data.start + (event.data.removedCount ?? 0))
      for (const message of removed) {
        const current = message.lifecycle
        if (current === undefined) continue
        if (event.data.outcome === 'canceled' || openTurn === undefined) {
          current.state = 'canceled'
        } else {
          current.state = 'claimed'
          current.turn = openTurn
        }
      }
      const inserted: Pending[] = event.data.inserted.map(message => {
        const id = String(message.id)
        let lifecycle: PlannerSettlementLifecycle | undefined
        if (event.seq > afterSeq && isExactPlannerSettlementMessage(message, parentSessionId)) {
          lifecycle = { id, admissionSeq: event.seq, state: 'pending' }
          lifecycles.push(lifecycle)
        }
        return lifecycle === undefined
          ? { id, admissionSeq: event.seq }
          : { id, admissionSeq: event.seq, lifecycle }
      })
      target.splice(event.data.start, event.data.removedCount ?? 0, ...inserted)
      continue
    }
    if (event.type === 'user/message') {
      const lifecycle = lifecycles.findLast(candidate =>
        candidate.id === String(event.data.id)
        && candidate.state === 'claimed'
        && candidate.turn === openTurn
        && candidate.claimObserved !== true)
      if (
        lifecycle !== undefined
        && event.seq > lifecycle.admissionSeq
        && isExactPlannerSettlementMessage(event.data, parentSessionId)
      ) lifecycle.claimObserved = true
      continue
    }
    if (event.type === 'assistant/message') {
      for (const lifecycle of lifecycles) {
        if (
          lifecycle.state === 'claimed'
          && lifecycle.turn === event.data.turn
          && event.data.message.content.some(block => block.type === 'text' && block.text.trim().length > 0)
        ) lifecycle.visibleReply = true
      }
      continue
    }
    if (event.type === 'turn/end') {
      for (const lifecycle of lifecycles) {
        if (lifecycle.state === 'claimed' && lifecycle.turn === event.data.turn) {
          lifecycle.endReason = event.data.reason.kind
        }
      }
      if (openTurn === event.data.turn) openTurn = undefined
    }
  }
  return lifecycles
}

function plannerSettlementDecision(
  events: readonly SessionEvent[],
  parentSessionId: string,
  afterSeq: number,
): 'none' | 'wait' | 'fallback' | 'complete' {
  const lifecycles = plannerSettlementLifecycles(events, parentSessionId, afterSeq)
  if (lifecycles.some(lifecycle => lifecycle.state === 'claimed'
    && lifecycle.claimObserved
    && lifecycle.visibleReply
    && (lifecycle.endReason === 'completed' || lifecycle.endReason === 'max-tokens'))) return 'complete'
  if (lifecycles.some(lifecycle => lifecycle.state === 'pending'
    || (lifecycle.state === 'claimed' && lifecycle.endReason === undefined))) return 'wait'
  return lifecycles.length === 0 ? 'none' : 'fallback'
}

function sameDeliveryState(
  expected: LongGoalStatusProjectionV3,
  actual: LongGoalStatusProjectionV3,
  transition?: ContinuousGoalDeliveryIntent['transition'],
): boolean {
  if (
    actual.goal.id !== expected.goal.id
    || actual.goal.revision !== expected.goal.revision
    || actual.goal.phase !== expected.goal.phase
    || actual.control.sessionId !== expected.control.sessionId
    || actual.currentTaskId !== expected.currentTaskId
  ) return false
  if (actual.goal.phase === 'complete') return true
  const current = actual.tasks.find(task => task.id === actual.currentTaskId)
  const expectedCurrent = expected.tasks.find(task => task.id === expected.currentTaskId)
  const expectedPhase = actual.goal.phase === 'blocked' ? 'blocked' : 'active'
  return current?.phase === expectedPhase
    && expectedCurrent?.phase === expectedPhase
    && current.execution?.sessionId === expectedCurrent.execution?.sessionId
    && current.execution?.goalId === expectedCurrent.execution?.goalId
}

function hasDurableNoticeReply(
  events: readonly SessionEvent[],
  notice: ReturnType<typeof buildContinuousGoalSettlementNotice>,
  matchNoticeId = false,
): boolean {
  const expectedSource = JSON.stringify(notice.source)
  const expectedContent = JSON.stringify(notice.content)
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (
      event?.type !== 'user/message'
      || (matchNoticeId && String(event.data.id) !== String(notice.id))
      || JSON.stringify(event.data.source) !== expectedSource
      || JSON.stringify(event.data.content) !== expectedContent
    ) continue
    let turn: number | undefined
    for (let before = index - 1; before >= 0; before--) {
      const candidate = events[before]
      if (candidate?.type === 'turn/start') {
        turn = candidate.data.turn
        break
      }
    }
    if (turn === undefined) continue
    let hasReply = false
    for (let after = index + 1; after < events.length; after++) {
      const candidate = events[after]
      if (candidate?.type === 'assistant/message' && candidate.data.turn === turn) {
        hasReply ||= candidate.data.message.content.some(block =>
          block.type === 'text' && block.text.trim().length > 0)
      }
      if (candidate?.type === 'turn/end' && candidate.data.turn === turn) {
        if (
          hasReply
          && (candidate.data.reason.kind === 'completed' || candidate.data.reason.kind === 'max-tokens')
        ) return true
        break
      }
    }
  }
  return false
}

async function runGuardedSettlementTurn(
  agent: Agent,
  notice: ReturnType<typeof buildContinuousGoalSettlementNotice>,
  flushSession: (agent: Agent) => Promise<void | boolean>,
  claimAgent: () => boolean,
): Promise<boolean> {
  let noticeTurn: number | undefined
  let active = false
  let ended = false
  let resolveEnded!: () => void
  const turnEnded = new Promise<void>(resolve => { resolveEnded = resolve })
  const offPreStep = agent.ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (
      noticeTurn === undefined
      && decision.kind === 'enter'
      && decision.messages.some(message => String(message.id) === String(notice.id))
    ) {
      noticeTurn = payload.turn
      active = true
    }
    return decision
  })
  const offSession = agent.ctx.on('session/event', (session, event) => {
    if (
      active
      && String(session.id) === String(agent.session.id)
      && event.type === 'turn/end'
      && event.data.turn === noticeTurn
    ) {
      active = false
      ended = true
      resolveEnded()
    }
  })
  const offGuard = agent.ctx.tools.guard(() => active
    ? 'Continuous Goal feedback notices are read-only; tools are disabled for this Turn.'
    : undefined)
  try {
    if (!claimAgent()) return false
    agent.followup(notice)
    const becameIdle = agent.whenIdle().then(() => {
      if (!ended) throw new Error('Continuous Goal feedback notice Turn was not observed')
    })
    await Promise.race([turnEnded, becameIdle])
    if (await flushSession(agent) === false) throw new Error('Session persistence is unavailable')
    return true
  } finally {
    active = false
    offGuard()
    offSession()
    offPreStep()
  }
}

async function deliverContinuousGoalSettlementOnce(
  intent: ContinuousGoalDeliveryIntent,
  dependencies: ContinuousGoalSettlementDeliveryDependencies,
): Promise<boolean> {
  if (
    (intent.transition !== 'complete' && intent.transition !== 'block')
    || (intent.transition === 'complete' && intent.status.goal.phase !== 'complete')
    || (intent.transition === 'block' && intent.status.goal.phase !== 'blocked')
  ) return false

  const readTerminal = () => {
    const record = readLongGoal(dependencies.stateRoot, intent.longGoalId)
    if (record.schemaVersion !== 'tianwen.long-goal.v3') return undefined
    const terminalTask = intent.transition === 'block'
      ? intent.status.tasks.find(task => task.id === intent.status.currentTaskId && task.phase === 'blocked')
      : intent.status.tasks.findLast(task => task.phase === 'complete' || task.phase === 'abandoned')
    if (terminalTask === undefined) return undefined
    const projection = readTianwenTaskAttemptProjection(record, terminalTask.id)
    const attempt = projection.attempts.at(-1)
    if (attempt?.terminalEventId === undefined || attempt.status !== 'settled') return undefined
    return { record, terminalTask, attempt, projection }
  }
  const terminal = readTerminal()
  if (terminal === undefined) return false
  const terminalDelivery = terminal.projection.terminalDelivery
  if (
    terminalDelivery !== undefined
    && terminalDelivery.terminalEventId === terminal.attempt.terminalEventId
    && terminalDelivery.completionTurnObserved
  ) return true

  const mainSessionId = terminal.record.control.sessionId
  const inspectedMain = await dependencies.inspectSession(mainSessionId)
  if (String(inspectedMain.meta.id) !== mainSessionId) {
    throw new LongGoalIntegrityError('Continuous Goal main Session identity mismatch')
  }
  const settledTaskResults = new Map<string, string>()
  for (const task of intent.status.tasks) {
    const representable = task.phase === 'complete'
      || task.phase === 'abandoned'
      || (task.id === intent.status.currentTaskId && task.phase === 'blocked')
    if (!representable || task.execution === null) continue
    const inspected = await dependencies.inspectSession(task.execution.sessionId)
    const result = await readSettledTaskResult({
      sessionId: task.execution.sessionId,
      goalId: task.execution.goalId,
      phase: task.phase === 'complete' ? 'complete' : 'abandoned',
    }, async () => inspected)
    if (result !== undefined) settledTaskResults.set(task.id, result)
  }
  const notice = freezeMessage({
    ...buildContinuousGoalSettlementNotice({ status: intent.status, settledTaskResults }),
    id: MessageId(`tianwen-terminal:${terminal.attempt.terminalEventId}`),
  })
  const boundary = terminal.projection.terminalDeliveryBoundary
  const hasExactBoundary = boundary !== undefined
    && boundary.terminalEventId === terminal.attempt.terminalEventId
    && boundary.parentSessionId === terminal.attempt.parentSessionId
  const nativeDecision = (events: readonly SessionEvent[]) => hasExactBoundary
    ? plannerSettlementDecision(
        events,
        terminal.attempt.parentSessionId,
        boundary.mainInboxBoundarySeq,
      )
    : 'none'
  const hasNativeCompletion = (events: readonly SessionEvent[]): boolean => nativeDecision(events) === 'complete'
  const hasUncorrelatedPlannerSettlement = (events: readonly SessionEvent[]): boolean =>
    !hasExactBoundary && events.some(event => event.type === 'user/message'
      ? isExactPlannerSettlementMessage(event.data, terminal.attempt.parentSessionId)
      : event.type === 'agent/inbox/spliced'
        && event.data.inserted.some(message =>
          isExactPlannerSettlementMessage(message, terminal.attempt.parentSessionId))
    )
  const hasCorrelatedPlannerAdmission = (events: readonly SessionEvent[]): boolean =>
    nativeDecision(events) === 'wait'
  const acknowledge = (): boolean => {
    const latest = readTerminal()
    if (latest === undefined || latest.attempt.terminalEventId !== terminal.attempt.terminalEventId) return false
    if (latest.projection.terminalDelivery?.completionTurnObserved === true) return true
    const terminalEventId = latest.attempt.terminalEventId
    if (terminalEventId === undefined) return false
    appendTianwenTerminalDeliveryObserved({
      stateRoot: dependencies.stateRoot,
      longGoalId: latest.record.id,
      expectedRevision: latest.record.revision,
      taskId: latest.terminalTask.id,
      terminalEventId,
      parentSessionId: latest.attempt.parentSessionId,
      completionTurnObserved: true,
    })
    return true
  }
  if (hasDurableNoticeReply(inspectedMain.events, notice, true) || hasNativeCompletion(inspectedMain.events)) {
    return acknowledge()
  }
  if (hasUncorrelatedPlannerSettlement(inspectedMain.events)) return false
  if (hasCorrelatedPlannerAdmission(inspectedMain.events)) return false

  const agent = dependencies.getAgent(mainSessionId)
  if (agent === undefined || String(agent.session.id) !== mainSessionId) return false
  await agent.whenIdle()
  if (dependencies.getAgent(mainSessionId) !== agent) return false
  const status = await dependencies.readStatus(intent.longGoalId)
  if (!sameDeliveryState(intent.status, status, intent.transition)) return false
  const recheckedMain = await dependencies.inspectSession(mainSessionId)
  if (
    hasDurableNoticeReply(recheckedMain.events, notice, true)
    || hasNativeCompletion(recheckedMain.events)
  ) return acknowledge()
  if (hasUncorrelatedPlannerSettlement(recheckedMain.events)) return false
  if (hasCorrelatedPlannerAdmission(recheckedMain.events)) return false

  const delivered = await runGuardedSettlementTurn(
    agent,
    notice,
    dependencies.flushSession,
    () => dependencies.getAgent(mainSessionId) === agent && String(agent.session.id) === mainSessionId,
  )
  if (!delivered) return false
  const persistedMain = await dependencies.inspectSession(mainSessionId)
  if (!hasDurableNoticeReply(persistedMain.events, notice, true)) {
    throw new Error('Continuous Goal offline settlement Turn was not persisted')
  }
  return acknowledge()
}

export function deliverContinuousGoalSettlement(
  intent: ContinuousGoalDeliveryIntent,
  dependencies: ContinuousGoalSettlementDeliveryDependencies,
): Promise<boolean> {
  const key = [
    dependencies.stateRoot,
    intent.longGoalId,
    intent.transition,
    intent.status.goal.revision,
    intent.status.currentTaskId ?? 'no-current-task',
  ].join('\u0000')
  const existing = continuousGoalSettlementFlights.get(key)
  if (existing !== undefined) return existing
  const flight = deliverContinuousGoalSettlementOnce(intent, dependencies)
  continuousGoalSettlementFlights.set(key, flight)
  void flight.finally(() => {
    if (continuousGoalSettlementFlights.get(key) === flight) {
      continuousGoalSettlementFlights.delete(key)
    }
  }).catch(() => undefined)
  return flight
}

export function mountTianwenLongGoalHost(
  ctx: Context,
  config?: TianwenLongGoalHostConfig,
): void {
  ctx.inject([
    'connection', 'apiProxy', 'agents', 'goals', 'sessions', 'subagents',
    'agentDefaultModel', 'agentPresets', 'sessionPersistence',
    'sandboxPolicy', 'tianwenEvidence', 'tianwenLearningIntake', 'tianwenEvolution',
  ], injected => {
    if (injected.baseUrl === undefined) throw new Error('Tianwen Long Goal Web host requires a Profile base URL')
    const roots = resolveTianwenLongGoalHostRoots({
      profileBaseUrl: new URL(injected.baseUrl),
      ...(process.env.DSH_HOME === undefined ? {} : { dshHome: process.env.DSH_HOME }),
      ...(config === undefined ? {} : { config }),
    })
    const host = injected as HostContext
    const nativeChild = new NativeLongGoalChild(injected)
    const nativeSetups = new Map<string, AgentSetup>()
    const disposeNativeSetup = injected.subagents.registerContinuableSetup(childCtx => {
      const sessionId = childCtx.agent === undefined ? undefined : String(childCtx.agent.session.id)
      const setup = sessionId === undefined ? undefined : nativeSetups.get(sessionId)
      if (setup !== undefined) {
        const prepared = setup(childCtx)
        if (prepared instanceof Promise) {
          throw new LongGoalIntegrityError('Native Long Goal child setup must be synchronous')
        }
        prepared?.commit()
      }
      return () => undefined
    })
    if (typeof injected.effect === 'function') {
      injected.effect(function* () {
        yield () => {
          nativeSetups.clear()
          disposeNativeSetup()
        }
      })
    }
    const agentSetup = (
      selection: ModelSelection,
      agentPreset: string | undefined,
      setup: AgentSetup,
    ): AgentSetup => async agentCtx => {
      const selectedPreset = agentPreset ?? agentCtx.agent?.session.header.agentPreset
      if (!isNonEmptyString(selectedPreset)) {
        throw new LongGoalIntegrityError('Long Goal Session preset mismatch')
      }
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
      await host.agentPresets.mount(agentCtx, selectedPreset)
      return setup(agentCtx)
    }
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
      reserveTaskSessionId: () => `session-${randomUUID()}`,
      installNativeTaskSetup: (sessionId, setup) => { nativeSetups.set(sessionId, setup) },
      startNativeTaskChild: input => nativeChild.start({
        ...input,
        childId: SessionId(input.childId),
      }),
      followupNativeTaskChild: (parent, childId, prompt, signal) =>
        nativeChild.followupTask(parent, SessionId(childId), prompt, signal),
      nativeAgentOptions: host.agentDefaultModel.currentSelection(),
      attachedAgent: sessionId => injected.agents.get(SessionId(sessionId)),
      recoverNativeTaskParent: record => recoverNativeLongGoalPlannerParent(record, {
        listSessions: runDependencies.listSessions,
        attachedAgent: sessionId => injected.agents.get(SessionId(sessionId)),
        installNativeSetup: (sessionId, setup) => { nativeSetups.set(sessionId, setup) },
        followupNativeChild: (parent, childId, prompt, signal) =>
          nativeChild.followup(parent, SessionId(childId), prompt, signal),
      }),
      getGoal: agent => injected.goals.get(agent),
      nativeGoalService: injected.goals,
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
      readPermissionSnapshot: controlSessionId => {
        const control = injected.agents.get(SessionId(controlSessionId))
        if (control === undefined || String(control.session.id) !== controlSessionId) {
          throw new LongGoalIntegrityError('Continuous Goal main permission Session is not live')
        }
        return permissionSnapshot(
          control.session.events,
          host.sandboxPolicy.overrideOf(control.session) ?? host.sandboxPolicy.defaultMode,
        )
      },
    }
    const permissionAttemptHost = createPermissionAttemptHost({
      roots,
      readLongGoal,
      projectEvidence: (sessionId, events) => projectPersistedEvidence(SessionId(sessionId), events),
      inspectSession: async sessionId => {
        const matches = (await runDependencies.listSessions())
          .filter(candidate => candidate.sessionId === sessionId)
        if (matches.length === 0) return undefined
        if (matches.length !== 1) {
          throw new LongGoalIntegrityError('Permission attempt Session identity is ambiguous')
        }
        return host.sessionPersistence.inspect(SessionId(sessionId))
      },
      flushSession: session => injected.sessions.flush(session),
      quiesceNativeAttempt: async ({ controlSessionId, plannerSessionId, childSessionId }) => {
        const main = injected.agents.get(SessionId(controlSessionId))
        const planner = injected.agents.get(SessionId(plannerSessionId))
        const task = injected.agents.get(SessionId(childSessionId))
        if (planner === undefined && task === undefined) {
          await Promise.all([
            host.sessionPersistence.inspect(SessionId(plannerSessionId)),
            host.sessionPersistence.inspect(SessionId(childSessionId)),
          ])
          return
        }
        if (
          main === undefined
          || String(main.session.id) !== controlSessionId
          || planner === undefined
          || String(planner.session.header.parentSession) !== controlSessionId
        ) throw new LongGoalIntegrityError('Permission-limited Planner lineage is not live and exact')
        if (task !== undefined) assertPermissionAttemptAuthority(
          childSessionId,
          plannerSessionId,
          { id: task.session.id, parentSession: task.session.header.parentSession },
        )
        const flushes = [planner, task]
          .filter((agent): agent is Agent => agent !== undefined)
          .map(agent => injected.sessions.flush(agent.session))
        await injected.subagents.drainContinuableDescendants([planner])
        await injected.subagents.drainContinuableChildren(main, [SessionId(plannerSessionId)])
        if ((await Promise.all(flushes)).some(flushed => !flushed)) {
          throw new LongGoalIntegrityError('Permission-limited attempt Session persistence is unavailable')
        }
        await Promise.all([
          host.sessionPersistence.inspect(SessionId(plannerSessionId)),
          host.sessionPersistence.inspect(SessionId(childSessionId)),
        ])
      },
      attachedAgent: sessionId => injected.agents.get(SessionId(sessionId)),
      reserveSessionId: () => `session-${randomUUID()}`,
      startNativeChild: input => nativeChild.start({
        ...input,
        childId: SessionId(input.childId),
      }),
      followupNativeChild: (parent, childId, prompt, signal) =>
        nativeChild.followup(parent, SessionId(childId), prompt, signal),
      nativeAgentOptions: host.agentDefaultModel.currentSelection(),
      runCurrentTask: input => runCurrentWebTask(input, runDependencies),
      notifyMain: (agent, message) => { agent.steer(message) },
    })
    const dshStatusTarget = {
      sessionsRoot: roots.sessionsRoot,
      evolutionRoot: roots.evolutionRoot,
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
          setup: agentSetup(selection, input.agentPreset, input.setup),
        })
      },
      resumeAgent: async input => {
        const selection = host.agentDefaultModel.currentSelection()
        return injected.agents.resume({
          resumeSessionId: SessionId(input.sessionId),
          agentOptions: { provider: selection.provider, model: selection.model },
          setup: agentSetup(selection, undefined, input.setup),
        })
      },
      getAgent: sessionId => injected.agents.get(SessionId(sessionId)),
      installNativeSetup: (sessionId, setup) => { nativeSetups.set(sessionId, setup) },
      startNativeChild: input => nativeChild.start({
        ...input,
        childId: SessionId(input.childId),
      }),
      followupNativeChild: (parent, childId, prompt, signal) =>
        nativeChild.followup(parent, SessionId(childId), prompt, signal),
      nativeAgentOptions: host.agentDefaultModel.currentSelection(),
      admitTaskFromPlanner: async ({ record, parent }) => {
        if (injected.agents.get(SessionId(record.planner.sessionId)) !== parent) {
          throw new LongGoalIntegrityError('Continuous Goal Planner parent Agent is not live')
        }
        await runCurrentWebTask({
          roots,
          longGoalId: record.id,
          expectedRevision: record.revision,
        }, runDependencies)
      },
      flushSession: async agent => {
        if (!await injected.sessions.flush(agent.session)) {
          throw new Error('Session persistence is unavailable')
        }
      },
      readSettledTaskResult: async input => {
        await injected.agents.get(SessionId(input.sessionId))?.whenIdle()
        return readSettledTaskResult(
          input,
          async sessionId => host.sessionPersistence.inspect(SessionId(sessionId)),
        )
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
      createGoalFirst: async input => requireLegacyV2GoalFirstProgress(await createGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies)),
      addGuidance: input => addGoalFirstGuidance({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
      continueProgress: async input => requireLegacyV2GoalFirstProgress(await continueGoalFirstProgress({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies)),
      abandonCurrentTask: input => abandonGoalFirstTask({
        stateRoot: roots.stateRoot,
        dshStatusTarget,
        ...input,
      }, serviceDependencies),
    }
    const continuousServiceDependencies: ContinuousGoalServiceDependencies = {
      ...serviceDependencies,
      createContinuousRecord: createContinuousLongGoal,
      setMode: setContinuousGoalMode,
      appendGuidanceOnly: appendContinuousGoalGuidance,
      redirect: redirectContinuousGoal,
      abandonRedirectedTask: abandonContinuousGoalTask,
      cancelTaskAndReadStatus: async execution => {
        const taskAgent = injected.agents.get(SessionId(execution.sessionId))
        if (taskAgent === undefined) {
          throw new LongGoalIntegrityError('Continuous Goal Task Session is not live')
        }
        const goal = injected.goals.get(taskAgent)
        if (goal === undefined || String(goal.id) !== execution.goalId) {
          throw new LongGoalIntegrityError('Continuous Goal Task binding does not match live Goal')
        }
        taskAgent.cancel({ kind: 'parent' })
        await taskAgent.whenIdle()
        if (!await injected.sessions.flush(taskAgent.session)) {
          throw new Error('Session persistence is unavailable')
        }
        const latest = await readGoalStatus({
          goalId: execution.goalId,
          sessionsRoot: roots.sessionsRoot,
          evolutionRoot: roots.evolutionRoot,
        })
        if (latest.session.id !== execution.sessionId || latest.goal.id !== execution.goalId) {
          throw new LongGoalIntegrityError('Continuous Goal Task cancellation binding mismatch')
        }
        if (latest.goal.phase === 'complete') return 'complete'
        if (latest.goal.phase !== 'paused') {
          throw new LongGoalIntegrityError('Continuous Goal Task did not pause after parent cancellation')
        }
        return 'paused'
      },
    }
    const readContinuousStatus = async (longGoalId: string): Promise<LongGoalStatusProjectionV3> => {
      const status = await readLongGoalStatus({
        stateRoot: roots.stateRoot,
        longGoalId,
        dshStatusTarget,
      })
      if (status.schemaVersion !== 'tianwen.long-goal-status.v3') {
        throw new LongGoalIntegrityError('Continuous Goal Host requires a v3 status')
      }
      return status
    }
    const disposeContinuousGoalHost = mountContinuousGoalHost(injected as unknown as Context & {
      readonly agents: {
        list(): Agent[]
        get(id: never): Agent | undefined
      }
    }, {
      roots,
      listLongGoals: () => listLongGoals(roots.stateRoot),
      readLongGoal,
      readStatus: input => readContinuousStatus(input.longGoalId),
      createProgress: async input => createContinuousGoalProgress({
        stateRoot: roots.stateRoot, dshStatusTarget, ...input,
      }, continuousServiceDependencies),
      control: async input => controlContinuousGoal({
        stateRoot: roots.stateRoot, dshStatusTarget, ...input,
      }, continuousServiceDependencies),
      continueProgress: async input => continueGoalFirstProgress({
        stateRoot: roots.stateRoot, dshStatusTarget, ...input,
      }, continuousServiceDependencies),
      pause: input => setContinuousGoalMode({
        stateRoot: roots.stateRoot, longGoalId: input.longGoalId,
        expectedRevision: input.expectedRevision, mode: 'paused',
      }),
      flushSession: async agent => injected.sessions.flush(agent.session),
      getGoal: agent => injected.goals.get(agent),
      reportProgress: async input => { await reportLongGoalProgress(injected, input) },
      recordTerminalAttempt: input => recordContinuousGoalTerminalAttempt({
        stateRoot: roots.stateRoot,
        ...input,
      }, {
        inspectSession: sessionId => host.sessionPersistence.inspect(SessionId(sessionId)),
      }),
      deliver: intent => deliverContinuousGoalSettlement(intent, {
        stateRoot: roots.stateRoot,
        getAgent: sessionId => injected.agents.get(SessionId(sessionId)),
        readStatus: readContinuousStatus,
        inspectSession: sessionId => host.sessionPersistence.inspect(SessionId(sessionId)),
        flushSession: async agent => injected.sessions.flush(agent.session),
      }),
      reportError: error => host.logger('tianwen-continuous-goal').error(error),
      installCommand: installContinuousGoalCommand,
      installBoundControls: installBoundContinuousGoalControls,
      handlePermissionEvent: permissionAttemptHost.handlePermissionEvent,
      reconcilePermissionAttempt: permissionAttemptHost.reconcilePermissionAttempt,
    })
    if (typeof injected.effect === 'function') {
      injected.effect(function* () {
        yield disposeContinuousGoalHost
      })
    }
    const learningAuditOperations: TianwenLearningAuditOperations = {
      status: async sessionId => projectLearningAudit({
        analyses: host.tianwenEvolution.listLearningAnalyses(),
        ...(sessionId === undefined ? {} : { sessionId }),
      }),
    }
    host.connection.rpc.handle('/tianwen', createTianwenLongGoalRpcHandler(
      roots,
      undefined,
      runDependencies,
      goalFirstOperations,
      learningAuditOperations,
    ), {
      authority: 'loopback',
    })
  })
}
