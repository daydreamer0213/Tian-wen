import type { LearningIntakeStatus, LearningTicket } from '@tianwen/evolution/learning-intake'

import type { AnyLongGoalStatusProjection } from './long-goal-contract.js'

export interface LearningClueSource {
  readonly longGoalId: string
  readonly goalObjective: string
  readonly taskId: string
  readonly taskObjective: string
  readonly recordedAt: string
}

export interface LearningClueItem {
  readonly ticketId: string
  readonly status: 'open' | 'unsupported'
  readonly occurrenceCount: number
  readonly analysis: null | {
    readonly phase: 'running' | 'complete' | 'failed'
    readonly sessionId: string
    readonly startedAt: string
    readonly finishedAt?: string
  }
  readonly review: null | {
    readonly reviewedAt: string
    readonly occurrenceCount: number
  }
  readonly sources: readonly LearningClueSource[]
}

export interface LearningClueStatus {
  readonly schemaVersion: 'tianwen.learning-clue-status.v1'
  readonly items: readonly LearningClueItem[]
}

export function projectLearningClueStatus(input: {
  readonly goals: readonly {
    readonly status: AnyLongGoalStatusProjection
    readonly intakeStatuses: readonly LearningIntakeStatus[]
  }[]
  readonly tickets: readonly LearningTicket[]
}): LearningClueStatus {
  const sourcesByTicket = new Map<string, Map<string, LearningClueSource>>()
  for (const goal of input.goals) {
    if (goal.status.schemaVersion !== 'tianwen.long-goal-status.v2' &&
      goal.status.schemaVersion !== 'tianwen.long-goal-status.v3') continue
    for (const task of goal.status.tasks) {
      if (task.execution === null ||
        (task.phase !== 'complete' && task.phase !== 'abandoned')) continue
      for (const intake of goal.intakeStatuses) {
        if (intake.state !== 'active' ||
          intake.sessionId !== task.execution.sessionId || intake.ticketId === undefined) continue
        const sources = sourcesByTicket.get(intake.ticketId) ?? new Map()
        const key = `${goal.status.goal.id}\0${task.id}`
        const source: LearningClueSource = {
          longGoalId: goal.status.goal.id,
          goalObjective: goal.status.goal.objective,
          taskId: task.id,
          taskObjective: task.objective,
          recordedAt: intake.recordedAt,
        }
        const existing = sources.get(key)
        if (existing === undefined || source.recordedAt > existing.recordedAt) sources.set(key, source)
        sourcesByTicket.set(intake.ticketId, sources)
      }
    }
  }

  const items = input.tickets.flatMap(ticket => {
    const sources = [...(sourcesByTicket.get(ticket.ticketId)?.values() ?? [])]
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    return sources.length === 0 ? [] : [{
      ticketId: ticket.ticketId,
      status: ticket.status,
      occurrenceCount: ticket.signalIds.length,
      analysis: null,
      review: null,
      sources,
    } satisfies LearningClueItem]
  }).sort((left, right) =>
    right.sources[0]!.recordedAt.localeCompare(left.sources[0]!.recordedAt) ||
    left.ticketId.localeCompare(right.ticketId))

  return { schemaVersion: 'tianwen.learning-clue-status.v1', items }
}
