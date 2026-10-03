/** Bounded selection facts only; no task content, source references or errors. */
export type ConversationSourceReadinessDiagnostics = {
  readonly schemaVersion: 'tianwen.source-readiness-diagnostics.v1'
  readonly observedTasks: number
  readonly eligibleTasks: number
  readonly problemSources: number
  /** Initial successful candidates; compatibility with a problem pair is separate. */
  readonly successfulCandidates: number
  readonly hasCompatibleProblemPair: boolean
  readonly hasUnattemptedProblemPair: boolean
  /** Mutually exclusive: the first unmet condition in the original scan order. */
  readonly exclusions: Record<ConversationSourceExclusion, number>
}
export const SOURCE_EXCLUSION_KEYS = ['consentRevision', 'behaviorVersion', 'qualityContract', 'feedbackTurn', 'family',
  'evaluationMode', 'completion', 'modelConfiguration', 'fileMaterial'] as const
export type ConversationSourceExclusion = typeof SOURCE_EXCLUSION_KEYS[number]

const countKeys = ['observedTasks', 'eligibleTasks', 'problemSources', 'successfulCandidates'] as const
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key))

/** Status boundary: reject malformed structures and copy only public scalars. */
export function projectConversationSourceReadinessDiagnostics(value: unknown): ConversationSourceReadinessDiagnostics | undefined {
  if (!exact(value, ['schemaVersion', ...countKeys, 'hasCompatibleProblemPair', 'hasUnattemptedProblemPair', 'exclusions'])
    || value.schemaVersion !== 'tianwen.source-readiness-diagnostics.v1'
    || countKeys.some(key => !Number.isSafeInteger(value[key]) || (value[key] as number) < 0)
    || typeof value.hasCompatibleProblemPair !== 'boolean' || typeof value.hasUnattemptedProblemPair !== 'boolean'
    || !exact(value.exclusions, SOURCE_EXCLUSION_KEYS)) return
  const rawExclusions = value.exclusions
  if (SOURCE_EXCLUSION_KEYS.some(key => !Number.isSafeInteger(rawExclusions[key]) || (rawExclusions[key] as number) < 0)) return
  const exclusions = Object.fromEntries(SOURCE_EXCLUSION_KEYS.map(key => [key, rawExclusions[key]])) as Record<ConversationSourceExclusion, number>
  const observedTasks = value.observedTasks as number, eligibleTasks = value.eligibleTasks as number
  const problemSources = value.problemSources as number, successfulCandidates = value.successfulCandidates as number
  if (eligibleTasks > observedTasks || problemSources + successfulCandidates > eligibleTasks
    || Object.values(exclusions).reduce((sum, count) => sum + count, 0) !== observedTasks - eligibleTasks
    || value.hasCompatibleProblemPair && problemSources < 2
    || value.hasUnattemptedProblemPair && !value.hasCompatibleProblemPair) return
  return { schemaVersion: 'tianwen.source-readiness-diagnostics.v1', observedTasks, eligibleTasks, problemSources,
    successfulCandidates, hasCompatibleProblemPair: value.hasCompatibleProblemPair, hasUnattemptedProblemPair: value.hasUnattemptedProblemPair, exclusions }
}
