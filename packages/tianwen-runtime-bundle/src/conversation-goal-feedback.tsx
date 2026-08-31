import type {
  AnyLongGoalSummary,
  LongGoalStatusProjectionV3,
  LongGoalSummaryV3,
} from './long-goal-contract.js'

export interface ConversationGoalFeedbackUnavailable {
  readonly phase: 'unavailable'
  readonly needsAttention: false
  readonly message: 'Goal status is currently unavailable.'
}

export interface ConversationGoalFeedbackAvailable {
  readonly phase: 'planning' | 'running' | 'paused' | 'blocked' | 'complete'
  readonly objective: string
  readonly completedTasks: number
  readonly totalTasks: number
  readonly currentTaskObjective?: string
  readonly latestSettledTaskObjective?: string
  readonly blockedReason?: 'A task needs attention.'
  readonly needsAttention: boolean
  readonly message: string
}

export type ConversationGoalFeedback =
  | ConversationGoalFeedbackUnavailable
  | ConversationGoalFeedbackAvailable

function newest(
  selected: LongGoalSummaryV3 | undefined,
  candidate: LongGoalSummaryV3,
): LongGoalSummaryV3 {
  if (selected === undefined || candidate.updatedAt > selected.updatedAt ||
    (candidate.updatedAt === selected.updatedAt && candidate.id < selected.id)) {
    return candidate
  }
  return selected
}

function isV3Summary(summary: AnyLongGoalSummary): summary is LongGoalSummaryV3 {
  return 'schemaVersion' in summary && summary.schemaVersion === 'tianwen.long-goal-summary.v3'
}

function isSettledTask(task: LongGoalStatusProjectionV3['tasks'][number]): boolean {
  return task.phase === 'complete' || task.phase === 'abandoned'
}

export function selectConversationGoalSummary(
  summaries: readonly AnyLongGoalSummary[],
  controlSessionId: string,
): LongGoalSummaryV3 | undefined {
  let current: LongGoalSummaryV3 | undefined
  let complete: LongGoalSummaryV3 | undefined
  for (const summary of summaries) {
    if (!isV3Summary(summary) || summary.control.sessionId !== controlSessionId) continue
    if (summary.phase === 'complete') complete = newest(complete, summary)
    else current = newest(current, summary)
  }
  return current ?? complete
}

export function projectConversationGoalFeedback(
  status: LongGoalStatusProjectionV3 | undefined,
): ConversationGoalFeedback {
  if (status === undefined) {
    return {
      phase: 'unavailable',
      needsAttention: false,
      message: 'Goal status is currently unavailable.',
    }
  }

  const currentTaskIndex = status.tasks.findIndex(task => task.id === status.currentTaskId)
  const currentTask = currentTaskIndex < 0 ? undefined : status.tasks[currentTaskIndex]
  const settledCandidates = status.goal.phase === 'complete'
    ? status.tasks
    : status.currentTaskId === null
      ? status.tasks
      : currentTaskIndex < 0 ? [] : status.tasks.slice(0, currentTaskIndex)
  const firstUnsettled = settledCandidates.findIndex(task => !isSettledTask(task))
  const settledPrefix = firstUnsettled < 0
    ? settledCandidates
    : settledCandidates.slice(0, firstUnsettled)
  const latestSettledTask = settledPrefix.at(-1)
  const phase = status.goal.phase === 'blocked' ? 'blocked'
    : status.goal.phase === 'complete' ? 'complete'
      : status.control.autoProgress === 'paused' ? 'paused'
        : status.goal.phase === 'planning' ? 'planning'
          : 'running'
  const needsAttention = phase === 'paused' || phase === 'blocked'
  const message = phase === 'planning' ? 'Planning the next useful step.'
    : phase === 'running' ? 'Work is in progress.'
      : phase === 'paused' ? 'Progress is paused. Resume or redirect in the composer.'
        : phase === 'blocked' ? 'A task needs attention. Review or redirect in the composer.'
          : 'Execution is complete. Ready for review.'

  return {
    phase,
    objective: status.goal.objective,
    completedTasks: status.goal.completedTasks,
    totalTasks: status.goal.totalTasks,
    ...(currentTask === undefined ? {} : { currentTaskObjective: currentTask.objective }),
    ...(latestSettledTask === undefined
      ? {}
      : { latestSettledTaskObjective: latestSettledTask.objective }),
    ...(phase === 'blocked' ? { blockedReason: 'A task needs attention.' as const } : {}),
    needsAttention,
    message,
  }
}
