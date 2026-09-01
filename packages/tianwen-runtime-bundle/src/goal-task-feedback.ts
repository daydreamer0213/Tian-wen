import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import {
  learningFeedbackFingerprint,
  sha256,
  type LearningIntakeStatus,
} from '@tianwen/evolution/learning-intake'
import type {
  FeedbackSnapshot,
  RuntimeLearningIntakeReceipt,
} from '@tianwen/runtime'

import type {
  AnyLongGoalRecord,
  AnyLongGoalStatusProjection,
  GoalFirstLongGoalRecord,
  GoalFirstLongGoalStatusProjection,
  LongGoalStatusProjectionV2,
} from './long-goal-contract.js'

type StatusTarget = {
  readonly dataDir: string
} | {
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

export interface GoalTaskFeedbackItem {
  readonly taskId: string
  readonly rating: 'positive' | 'negative'
  readonly decision: LearningIntakeStatus['decision']
  readonly recordedAt: string
  readonly ticketId?: LearningIntakeStatus['ticketId']
}

export interface GoalTaskFeedbackStatus {
  readonly schemaVersion: 'tianwen.goal-task-feedback-status.v1'
  readonly items: readonly GoalTaskFeedbackItem[]
}

export interface GoalTaskFeedbackRecordResult {
  readonly schemaVersion: 'tianwen.goal-task-feedback-record.v1'
  readonly duplicate: boolean
  readonly item: GoalTaskFeedbackItem
}

interface SessionLease {
  readonly session: Session
  readonly release: () => void
}

export interface GoalTaskFeedbackDependencies {
  readonly readLongGoal: (stateRoot: string, longGoalId: string) => AnyLongGoalRecord
  readonly readLongGoalStatus: (input: {
    readonly stateRoot: string
    readonly longGoalId: string
    readonly dshStatusTarget: StatusTarget
  }) => Promise<AnyLongGoalStatusProjection>
  readonly awaitSessionIdle: (sessionId: string) => Promise<void>
  readonly openSession: (sessionId: string) => Promise<SessionLease>
  readonly consume: (
    session: Session,
    scopeKey: string,
    feedback: FeedbackSnapshot,
  ) => RuntimeLearningIntakeReceipt
  readonly getLearningIntakeStatus: (
    sessionId: string,
    messageId: string,
  ) => LearningIntakeStatus | undefined
}

interface FeedbackTarget {
  readonly task: LongGoalStatusProjectionV2['tasks'][number]
  readonly scopeKey: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function goalFirstHistoryPair(
  record: AnyLongGoalRecord,
  status: AnyLongGoalStatusProjection,
): {
  readonly record: GoalFirstLongGoalRecord
  readonly status: GoalFirstLongGoalStatusProjection
} | undefined {
  if (
    (record.schemaVersion === 'tianwen.long-goal.v2' &&
      status.schemaVersion === 'tianwen.long-goal-status.v2') ||
    (record.schemaVersion === 'tianwen.long-goal.v3' &&
      status.schemaVersion === 'tianwen.long-goal-status.v3')
  ) return { record, status }
  return undefined
}

async function settledTarget(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: StatusTarget
  readonly longGoalId: string
  readonly taskId: string
}, dependencies: GoalTaskFeedbackDependencies): Promise<FeedbackTarget> {
  if (!isNonEmptyString(input.taskId)) throw new TypeError('Task id is invalid')
  const [record, status] = await Promise.all([
    Promise.resolve(dependencies.readLongGoal(input.stateRoot, input.longGoalId)),
    dependencies.readLongGoalStatus({
      stateRoot: input.stateRoot,
      longGoalId: input.longGoalId,
      dshStatusTarget: input.dshStatusTarget,
    }),
  ])
  const history = goalFirstHistoryPair(record, status)
  if (history === undefined) throw new Error('Task feedback requires a Goal-first Goal')
  const task = history.status.tasks.find(candidate => candidate.id === input.taskId)
  const stored = history.record.tasks.find(candidate => candidate.id === input.taskId)
  if (
    task === undefined ||
    stored === undefined ||
    (task.phase !== 'complete' && task.phase !== 'abandoned') ||
    task.execution === null ||
    stored.execution === null ||
    task.execution.sessionId !== stored.execution.sessionId ||
    task.execution.goalId !== stored.execution.goalId
  ) {
    throw new Error('Task feedback requires a settled Goal-first Task')
  }
  return {
    task,
    scopeKey: `workspace:${history.record.workspaceRoot}`,
  }
}

function finalAssistantMessageId(
  events: readonly SessionEvent[],
  goalId: string,
  terminalPhase: 'complete' | 'blocked',
): string | undefined {
  const goalChange = events.findLast(candidate =>
    candidate.type === 'goal/change' &&
    candidate.data.operation === (terminalPhase === 'complete' ? 'complete' : 'block') &&
    'goal' in candidate.data &&
    String(candidate.data.goal.id) === goalId &&
    candidate.data.goal.phase === terminalPhase)
  if (goalChange?.type !== 'goal/change') return undefined
  const goalInput = events.findLast(candidate =>
    candidate.type === 'user/message' &&
    candidate.seq < goalChange.seq &&
    candidate.data.source.kind === 'goal' &&
    String(candidate.data.source.goalId) === goalId)
  if (goalInput?.type !== 'user/message') return undefined
  const turnStart = events.findLast(candidate =>
    candidate.type === 'turn/start' && candidate.seq < goalInput.seq)
  const turnEnd = events.find(candidate =>
    candidate.type === 'turn/end' && candidate.seq > goalInput.seq)
  if (
    turnStart?.type !== 'turn/start' ||
    turnEnd?.type !== 'turn/end' ||
    turnStart.data.turn !== turnEnd.data.turn ||
    turnEnd.data.reason.kind !== 'completed' ||
    events.some(candidate =>
      candidate.type === 'turn/start' &&
      candidate.seq > turnEnd.seq &&
      candidate.seq < goalChange.seq)
  ) {
    return undefined
  }
  const event = events.findLast(candidate =>
    candidate.type === 'assistant/message' &&
    candidate.surfaceOp === 'append' &&
    candidate.seq > goalInput.seq &&
    candidate.data.turn === turnStart.data.turn &&
    candidate.seq < turnEnd.seq &&
    candidate.data.message.content.length > 0)
  return event?.type === 'assistant/message'
    ? String(event.data.message.id)
    : undefined
}

function projectItem(
  taskId: string,
  status: LearningIntakeStatus,
): GoalTaskFeedbackItem {
  return {
    taskId,
    rating: status.rating,
    decision: status.decision,
    recordedAt: status.recordedAt,
    ...(status.ticketId === undefined ? {} : { ticketId: status.ticketId }),
  }
}

export async function readGoalTaskFeedbackStatus(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: StatusTarget
  readonly longGoalId: string
}, dependencies: GoalTaskFeedbackDependencies): Promise<GoalTaskFeedbackStatus> {
  const [record, status] = await Promise.all([
    Promise.resolve(dependencies.readLongGoal(input.stateRoot, input.longGoalId)),
    dependencies.readLongGoalStatus({
      stateRoot: input.stateRoot,
      longGoalId: input.longGoalId,
      dshStatusTarget: input.dshStatusTarget,
    }),
  ])
  const history = goalFirstHistoryPair(record, status)
  if (history === undefined) {
    return { schemaVersion: 'tianwen.goal-task-feedback-status.v1', items: [] }
  }
  const scopeKey = `workspace:${history.record.workspaceRoot}`
  const projected = await Promise.all(history.status.tasks.map(async task => {
    if (
      task.execution === null ||
      (task.phase !== 'complete' && task.phase !== 'abandoned')
    ) return undefined
    const lease = await dependencies.openSession(task.execution.sessionId)
    try {
      const messageId = finalAssistantMessageId(
        lease.session.events,
        task.execution.goalId,
        task.phase === 'complete' ? 'complete' : 'blocked',
      )
      if (messageId === undefined) return undefined
      const intake = dependencies.getLearningIntakeStatus(
        task.execution.sessionId,
        messageId,
      )
      return intake === undefined || intake.scopeKey !== scopeKey
        ? undefined
        : projectItem(task.id, intake)
    } finally {
      lease.release()
    }
  }))
  const items = projected.filter(item => item !== undefined)
  return { schemaVersion: 'tianwen.goal-task-feedback-status.v1', items }
}

export async function recordGoalTaskFeedback(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: StatusTarget
  readonly longGoalId: string
  readonly taskId: string
  readonly rating: 'positive' | 'negative'
  readonly note: string | null
}, dependencies: GoalTaskFeedbackDependencies): Promise<GoalTaskFeedbackRecordResult> {
  if (input.rating !== 'positive' && input.rating !== 'negative') {
    throw new TypeError('Task feedback rating is invalid')
  }
  if (input.note !== null && !isNonEmptyString(input.note)) {
    throw new TypeError('Task feedback note is invalid')
  }
  if (input.rating === 'positive' && input.note !== null) {
    throw new TypeError('Positive Task feedback cannot include a note')
  }
  const target = await settledTarget(input, dependencies)
  const sessionId = target.task.execution!.sessionId
  await dependencies.awaitSessionIdle(sessionId)
  const lease = await dependencies.openSession(sessionId)
  try {
    const messageId = finalAssistantMessageId(
      lease.session.events,
      target.task.execution!.goalId,
      target.task.phase === 'complete' ? 'complete' : 'blocked',
    )
    if (messageId === undefined) {
      throw new Error('Settled Task Session has no anchored final assistant message')
    }
    const requestedFingerprint = learningFeedbackFingerprint(
      input.rating,
      input.note ?? undefined,
    )
    const current = dependencies.getLearningIntakeStatus(sessionId, messageId)
    if (
      current !== undefined &&
      (
        current.state !== 'active' ||
        current.sessionId !== sessionId ||
        current.messageId !== messageId ||
        current.scopeKey !== target.scopeKey ||
        !isNonEmptyString(current.feedbackVersion)
      )
    ) {
      throw new Error('Current Task feedback revision is not an active exact match')
    }
    if (
      current !== undefined &&
      current.rating === input.rating &&
      current.feedbackFingerprint === requestedFingerprint
    ) {
      return {
        schemaVersion: 'tianwen.goal-task-feedback-record.v1',
        duplicate: true,
        item: projectItem(input.taskId, current),
      }
    }
    const receipt = dependencies.consume(lease.session, target.scopeKey, {
      messageId,
      rating: input.rating,
      ...(input.note === null ? {} : { note: input.note }),
      version: `goal-task:${sha256({
        taskId: input.taskId,
        previousIngestionId: current?.ingestionId ?? null,
        feedbackFingerprint: requestedFingerprint,
      })}`,
      ...(current === undefined
        ? {}
        : { supersedesFeedbackVersion: current.feedbackVersion }),
    })
    const persisted = dependencies.getLearningIntakeStatus(sessionId, messageId)
    if (
      persisted === undefined ||
      persisted.ingestionId !== receipt.ingestionId ||
      persisted.scopeKey !== target.scopeKey ||
      persisted.messageId !== messageId ||
      persisted.rating !== input.rating ||
      persisted.feedbackFingerprint !== requestedFingerprint
    ) {
      throw new Error('Task feedback receipt was not persisted')
    }
    return {
      schemaVersion: 'tianwen.goal-task-feedback-record.v1',
      duplicate: receipt.duplicate,
      item: projectItem(input.taskId, persisted),
    }
  } finally {
    lease.release()
  }
}
