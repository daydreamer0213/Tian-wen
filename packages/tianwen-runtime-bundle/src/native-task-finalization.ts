import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from './long-goal-contract.js'
import { readTianwenTaskAttemptProjection } from './long-goal.js'
import type { PermissionSnapshot } from './permission-attempt.js'

export const TASK_FINALIZATION_MARKER = 'tianwen.native-task-finalization.v1:'

export interface NativeTaskFinalizationInput {
  readonly longGoalId: string
  readonly sessionId: string
  readonly completedTurnSeq: number
  readonly taskId: string
  readonly goalId: string
  readonly epoch: number
  readonly signal: AbortSignal
}

export interface NativeTaskFinalizationDependencies {
  readonly readRecord: (id: string) => LongGoalRecordV3
  readonly readStatus: (id: string) => Promise<LongGoalStatusProjectionV3>
  readonly inspectSession: (id: string) => Promise<{
    readonly meta?: Partial<SessionHeader>
    readonly events: readonly SessionEvent[]
  }>
  readonly attachedAgent: (id: string) => Agent | undefined
  readonly getGoal: (agent: Agent) => GoalView | undefined
  readonly readGoalRef: (sessionId: string, goalId: string) => Promise<{ readonly id: string, readonly phase: string }>
  readonly readPermissionSnapshot: (id: string) => PermissionSnapshot
  readonly reconcilePermissionAttempt: (input: { readonly longGoalId: string, readonly resume: false }) => Promise<void>
  readonly recoverParent: (record: LongGoalRecordV3, authorization: {
    readonly signal: AbortSignal, readonly assertAuthority: () => void,
  }) => Promise<{ readonly parent: Agent, readonly release: () => void } | undefined>
  readonly followupTask: (
    parent: Agent, childId: string, prompt: { readonly type: 'text', readonly text: string }[],
    signal: AbortSignal, assertAuthority: () => void,
  ) => Promise<unknown>
  readonly stopTask: (record: LongGoalRecordV3, reason: { readonly code: string, readonly message: string }) => Promise<void>
}

// Count same-parent coordinator continuations (including ordinary cold Task
// recovery) and native Goal rounds, excluding the initial
// Task opening turn just as the original maxGoalRounds contract does. Coordinator
// messages do not advance GoalView.roundsStarted. Session facts survive unloading.
function finalizationHistory(events: readonly SessionEvent[], parentId: string, marker: string) {
  const binding = JSON.parse(marker.slice(TASK_FINALIZATION_MARKER.length)) as {
    longGoalId: string, taskId: string, epoch: number, goalId: string,
  }
  const accepted = new Map<string, { marker?: string, pending: boolean }>()
  const inbox: Record<'next-turn' | 'next-step', string[]> = { 'next-turn': [], 'next-step': [] }
  const goalRounds = new Set<number>()
  const createdAt = events.findLast(event => event.type === 'goal/change'
    && event.data.operation === 'create' && String(event.data.goal.id) === binding.goalId)?.seq ?? -1
  let openTurn: number | undefined
  for (const event of events) {
    if (event.seq < createdAt) continue
    if (event.type === 'turn/start') {
      openTurn = event.data.turn
    } else if (event.type === 'turn/end' && event.data.turn === openTurn) {
      openTurn = undefined
    } else if (event.type === 'agent/inbox/spliced') {
      const queue = inbox[event.data.target]
      for (const id of queue.slice(event.data.start, event.data.start + (event.data.removedCount ?? 0))) {
        const entry = accepted.get(id)
        if (entry !== undefined && (event.data.outcome === 'canceled' || openTurn !== undefined)) entry.pending = false
      }
      const ids = event.data.inserted.map(message => {
        const id = String(message.id)
        const source = message.source as { readonly kind?: string, readonly senderSessionId?: string }
        const text = message.content.find(block => block.type === 'text')
        if (source.kind === 'coordinator' && String(source.senderSessionId) === parentId
          && text?.type === 'text' && !text.text.startsWith(TASK_FINALIZATION_MARKER)) {
          accepted.set(id, { pending: true })
        } else if (source.kind === 'coordinator' && String(source.senderSessionId) === parentId
          && text?.type === 'text' && text.text.startsWith(TASK_FINALIZATION_MARKER)) {
          const line = text.text.split('\n')[0]!
          try {
            const value = JSON.parse(line.slice(TASK_FINALIZATION_MARKER.length)) as typeof binding
            if (value.longGoalId === binding.longGoalId && value.taskId === binding.taskId
              && value.epoch === binding.epoch && value.goalId === binding.goalId) {
              accepted.set(id, { marker: line, pending: true })
            }
          } catch { /* Unrelated text is not a host finalization admission. */ }
        }
        return id
      })
      queue.splice(event.data.start, event.data.removedCount ?? 0, ...ids)
    } else if (event.type === 'user/message' && openTurn !== undefined) {
      const source = event.data.source as { readonly kind?: string, readonly goalId?: string, readonly round?: number }
      if (source.kind === 'goal' && source.goalId === binding.goalId
        && typeof source.round === 'number') goalRounds.add(source.round)
      const entry = accepted.get(String(event.data.id))
      if (entry !== undefined) entry.pending = false
    }
  }
  return {
    alreadyAccepted: [...accepted.values()].some(entry => entry.marker === marker),
    pending: [...accepted.values()].some(entry => entry.pending),
    rounds: goalRounds.size + accepted.size,
  }
}

/** Only a live completed-turn notification calls this; loading old logs never does. */
export async function finalizeNativeLongGoalTask(
  input: NativeTaskFinalizationInput,
  dependencies: NativeTaskFinalizationDependencies,
): Promise<void> {
  if (input.signal.aborted) return
  await dependencies.reconcilePermissionAttempt({ longGoalId: input.longGoalId, resume: false })
  const original = dependencies.readRecord(input.longGoalId)
  const task = original.tasks.find(candidate => candidate.execution?.sessionId === input.sessionId)
  if (task?.execution === undefined || task.execution === null) return
  const attempt = readTianwenTaskAttemptProjection(original, task.id).attempts.at(-1)
  if (attempt?.status !== 'running' || attempt.childSessionId !== input.sessionId
    || attempt.parentSessionId !== original.planner.sessionId
    || task.id !== input.taskId || task.execution.goalId !== input.goalId
    || attempt.epoch !== input.epoch) return
  const identity = JSON.stringify({
    main: original.control.sessionId, planner: original.planner, task,
    epoch: attempt.epoch, permission: attempt.permissionFingerprint, mode: attempt.permissionMode,
  })
  const originalMain = dependencies.attachedAgent(original.control.sessionId)
  const marker = TASK_FINALIZATION_MARKER + JSON.stringify({
    longGoalId: original.id, taskId: task.id, epoch: attempt.epoch,
    goalId: task.execution.goalId, completedTurnSeq: input.completedTurnSeq,
  })
  const authorized = (): boolean => {
    if (input.signal.aborted) return false
    const latest = dependencies.readRecord(input.longGoalId)
    const current = latest.tasks.find(candidate => candidate.id === task.id)
    const activeAttempt = readTianwenTaskAttemptProjection(latest, task.id).attempts.at(-1)
    if (latest.control.autoProgress !== 'running' || latest.planner.phase === 'complete'
      || activeAttempt?.status !== 'running'
      || originalMain === undefined
      || dependencies.attachedAgent(original.control.sessionId) !== originalMain) return false
    const permission = dependencies.readPermissionSnapshot(latest.control.sessionId)
    return permission.fingerprint === attempt.permissionFingerprint
      && permission.mode === attempt.permissionMode
      && JSON.stringify({
        main: latest.control.sessionId, planner: latest.planner, task: current,
        epoch: activeAttempt.epoch, permission: activeAttempt.permissionFingerprint, mode: activeAttempt.permissionMode,
      }) === identity
  }
  const inspect = async () => {
    if (!authorized()) return undefined
    const persisted = await dependencies.inspectSession(input.sessionId)
    const lastTurn = persisted.events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
    const start = lastTurn?.type === 'turn/end'
      ? persisted.events.find(event => event.type === 'turn/start' && event.data.turn === lastTurn.data.turn)
      : undefined
    if (String(persisted.meta?.id) !== input.sessionId
      || String(persisted.meta?.parentSession) !== original.planner.sessionId
      || lastTurn?.type !== 'turn/end' || lastTurn.seq !== input.completedTurnSeq
      || lastTurn.data.reason.kind !== 'completed' || start === undefined) return undefined
    const status = await dependencies.readStatus(input.longGoalId)
    const current = status.tasks.find(candidate => candidate.id === status.currentTaskId)
    if (status.goal.phase !== 'active' || current?.id !== task.id || current.phase !== 'active'
      || current.execution?.sessionId !== input.sessionId || current.execution.goalId !== task.execution!.goalId) return undefined
    const goal = await dependencies.readGoalRef(input.sessionId, task.execution!.goalId)
    if (goal.id !== task.execution!.goalId || goal.phase !== 'active' || !authorized()) return undefined
    return finalizationHistory(persisted.events, original.planner.sessionId, marker)
  }
  const history = await inspect()
  if (history === undefined || history.alreadyAccepted || history.pending) return
  if (history.rounds >= original.maxTaskRounds) {
    if (authorized()) await dependencies.stopTask(dependencies.readRecord(original.id), {
      code: 'max-task-rounds',
      message: `Original Task ${task.id} remains unfinished after its configured limit of ${original.maxTaskRounds} continuation rounds; automatic finalization stopped.`,
    })
    return
  }
  // An existing report turn can dispose across either inspection or public
  // followup admission. Recover once from that absent credential; the cold lease
  // then holds its recovery tool turn until Task admission finishes.
  for (let recovery = 0; recovery < 2; recovery++) {
    const parentAtRecovery = dependencies.attachedAgent(original.planner.sessionId)
    const lease = await dependencies.recoverParent(original, {
      signal: input.signal,
      assertAuthority: () => { if (!authorized()) throw new Error('Native Task finalization authority changed') },
    })
    if (lease === undefined) return
    try {
      const parent = lease.parent
      const assertAuthority = () => {
        const child = dependencies.attachedAgent(input.sessionId)
        const goal = child === undefined ? undefined : dependencies.getGoal(child)
        if (!authorized() || dependencies.attachedAgent(original.planner.sessionId) !== parent
          || (parentAtRecovery !== undefined && parent !== parentAtRecovery)
          || (child !== undefined && (goal?.id !== task.execution!.goalId || goal.phase !== 'active'))
          || String(parent.session.id) !== original.planner.sessionId
          || String(parent.session.header.parentSession) !== original.control.sessionId
          || parent.session.header.cwd !== original.workspaceRoot
          || parent.session.header.agentPreset !== original.planner.agentPreset) {
          throw new Error('Native Task finalization authority changed')
        }
      }
      const latest = await inspect()
      if (latest === undefined || latest.alreadyAccepted || latest.pending) return
      assertAuthority()
      await dependencies.followupTask(parent, input.sessionId, [{
        type: 'text',
        text: `${marker}\nRead the existing Task with get_goal. Verify the delivery already produced and finish only this original Task lifecycle with complete_long_goal_task using the exact goal_id and revision if complete, or the existing block operation if genuinely blocked. Keep the delivered answer unchanged. Do not repair, repeat, optimize, or expand the answer; do not create another Goal or Task.`,
      }], input.signal, assertAuthority)
      // An accepted inbox id is not completion. Goal events retain settlement ownership.
      return
    } catch (error) {
      if (recovery !== 0 || !authorized()
        || dependencies.attachedAgent(original.planner.sessionId) !== undefined) throw error
    } finally {
      lease.release()
    }
  }
}
