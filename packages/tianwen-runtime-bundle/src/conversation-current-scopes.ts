import type {
  ConversationTask,
  GoalTaskOutcomeObservation,
  GoalTaskResearchSource,
} from '@tianwen/evolution'

/**
 * Published scope keys for the current Session.
 *
 * Ordinary conversation tasks contribute their original `source.scopeKey` when
 * their `source.sessionId` is the current Session, including non-task
 * admissions. Native Goal results contribute the `input.scopeKey` of a
 * recorded research source only when that source is the original source of an
 * outcome whose control or executed child Session is the current Session, and
 * only when the source identity and digests match that original outcome.
 *
 * Pure: the inputs are never mutated. The result is deduplicated and sorted.
 */
export function collectSessionGuidanceScopes(
  sessionId: string,
  conversationTasks: readonly ConversationTask[],
  goalOutcomes: readonly GoalTaskOutcomeObservation[],
  nativeGoalSources: readonly GoalTaskResearchSource[],
): readonly string[] {
  const scopes = new Set<string>()
  for (const task of conversationTasks) {
    if (task.source.sessionId === sessionId) scopes.add(task.source.scopeKey)
  }
  const currentOutcomes = goalOutcomes.filter(outcome =>
    outcome.input.origin.sessionId === sessionId
    || outcome.input.childSessionId === sessionId)
  for (const source of nativeGoalSources) {
    const matchesCurrentOutcome = currentOutcomes.some(outcome =>
      source.sourceId === outcome.sourceId
      && source.input.sourceId === outcome.sourceId
      && source.input.outcomeInputDigest === outcome.inputDigest
      && source.outcome.sourceId === outcome.sourceId
      && source.outcome.inputDigest === outcome.inputDigest)
    if (matchesCurrentOutcome) scopes.add(source.input.scopeKey)
  }
  return [...scopes].sort()
}
