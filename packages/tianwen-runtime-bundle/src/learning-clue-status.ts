import type { LearningTicket } from '@tianwen/evolution/learning-intake'

import type { AnyLongGoalStatusProjection } from './long-goal-contract.js'
import type { GoalTaskFeedbackStatus } from './goal-task-feedback.js'

export interface LearningClueSource {
  readonly longGoalId: string
  readonly goalObjective: string
  readonly taskId: string
  readonly taskObjective: string
  readonly recordedAt: string
}

export interface LearningClueItem {
  readonly ticketId: string
  readonly status: 'open'
  readonly occurrenceCount: number
  readonly sources: readonly LearningClueSource[]
}

export interface LearningClueStatus {
  readonly schemaVersion: 'tianwen.learning-clue-status.v1'
  readonly items: readonly LearningClueItem[]
}

export function projectLearningClueStatus(input: {
  readonly goals: readonly {
    readonly status: AnyLongGoalStatusProjection
    readonly feedback: GoalTaskFeedbackStatus
  }[]
  readonly tickets: readonly LearningTicket[]
}): LearningClueStatus {
  const sourcesByTicket = new Map<string, Map<string, LearningClueSource>>()
  for (const goal of input.goals) {
    if (goal.status.schemaVersion !== 'tianwen.long-goal-status.v2') continue
    for (const feedback of goal.feedback.items) {
      if (feedback.ticketId === undefined) continue
      const task = goal.status.tasks.find(candidate => candidate.id === feedback.taskId)
      if (task === undefined || (task.phase !== 'complete' && task.phase !== 'abandoned')) continue
      const sources = sourcesByTicket.get(feedback.ticketId) ?? new Map()
      const key = `${goal.status.goal.id}\0${task.id}`
      const source: LearningClueSource = {
        longGoalId: goal.status.goal.id,
        goalObjective: goal.status.goal.objective,
        taskId: task.id,
        taskObjective: task.objective,
        recordedAt: feedback.recordedAt,
      }
      const existing = sources.get(key)
      if (existing === undefined || source.recordedAt > existing.recordedAt) sources.set(key, source)
      sourcesByTicket.set(feedback.ticketId, sources)
    }
  }

  const items = input.tickets.flatMap(ticket => {
    const sources = [...(sourcesByTicket.get(ticket.ticketId)?.values() ?? [])]
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    return sources.length === 0 ? [] : [{
      ticketId: ticket.ticketId,
      status: ticket.status,
      occurrenceCount: ticket.signalIds.length,
      sources,
    } satisfies LearningClueItem]
  }).sort((left, right) =>
    right.sources[0]!.recordedAt.localeCompare(left.sources[0]!.recordedAt) ||
    left.ticketId.localeCompare(right.ticketId))

  return { schemaVersion: 'tianwen.learning-clue-status.v1', items }
}
