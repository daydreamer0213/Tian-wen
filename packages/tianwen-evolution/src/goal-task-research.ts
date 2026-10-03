import { CONVERSATION_FAMILIES, conversationReviewConsensus, parseConversationAuditedReviewChecks, parseConversationQualityContract, parseConversationQualityReviewChecks,
  type ConversationAuditedReviewChecks, type ConversationFamily, type ConversationQualityContract, type ConversationFailure } from './conversation-learning.js'
import type { GoalTaskOutcomeObservation } from './goal-task-outcome.js'
import { sha256 } from './learning-intake.js'
import type { LearningIntakeStatus } from './learning-intake.js'

/** Original Goal result support in the same ledger, never a ConversationTask or user feedback. */
export interface GoalTaskResearchSourceInput {
  readonly sourceKind: 'native-goal-task'
  readonly sourceId: string
  readonly outcomeInputDigest: ReturnType<typeof sha256>
  readonly scopeKey: string
  readonly family: ConversationFamily
  readonly evaluationMode: 'text' | 'local-files'
  readonly fileOutputKind?: 'files' | 'chat'
  readonly fileInputsDigest?: ReturnType<typeof sha256>
  readonly behaviorVersion: ReturnType<typeof sha256>
  readonly qualityContract: ConversationQualityContract
  readonly inputDigest: ReturnType<typeof sha256>
  readonly materialDigest: ReturnType<typeof sha256>
  readonly reviewMaterialDigest: ReturnType<typeof sha256>
  readonly sessionLifecycleFingerprint: ReturnType<typeof sha256>
  readonly assistantMessageIds: readonly string[]
  readonly checks: ConversationAuditedReviewChecks
}
export interface GoalTaskResearchSourceRecordedEvent {
  readonly type: 'goal-task-research-source-recorded'
  readonly schemaVersion: 'tianwen.goal-task-research-source.v1'
  readonly at: string
  readonly sourceId: string
  readonly inputDigest: ReturnType<typeof sha256>
  readonly input: GoalTaskResearchSourceInput
}
export interface GoalTaskResearchSource extends GoalTaskResearchSourceRecordedEvent { readonly outcome: GoalTaskOutcomeObservation }
export interface GoalTaskResearchReference { readonly sourceId: string; readonly inputDigest: ReturnType<typeof sha256> }
export type GuidanceNativeGoalSources = readonly [GoalTaskResearchReference, GoalTaskResearchReference, GoalTaskResearchReference]

export function parseGuidanceNativeGoalSources(value: unknown, ids: readonly string[]): GuidanceNativeGoalSources {
  if (!Array.isArray(value) || value.length !== 3 || ids.length !== 3 || new Set(ids).size !== 3) throw new TypeError('Goal study requires two sources and its separate counterexample')
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || Reflect.ownKeys(item).length !== 2
      || !Object.hasOwn(item, 'sourceId') || !Object.hasOwn(item, 'inputDigest') || item.sourceId !== ids[index]
      || !/^goal-task-result:[a-f0-9]{64}$/.test(item.sourceId)
      || typeof item.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(item.inputDigest)) throw new TypeError('Goal study reference differs from its original source')
    return structuredClone(item)
  }) as unknown as GuidanceNativeGoalSources
}

export function parseGoalTaskResearchSourceInput(value: unknown): GoalTaskResearchSourceInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid native Goal research source')
  const row = value as Record<string, unknown>
  const keys = ['sourceKind', 'sourceId', 'outcomeInputDigest', 'scopeKey', 'family', 'evaluationMode', 'behaviorVersion',
    'qualityContract', 'inputDigest', 'materialDigest', 'reviewMaterialDigest', 'sessionLifecycleFingerprint', 'assistantMessageIds', 'checks', ...(row.evaluationMode === 'local-files' ? ['fileOutputKind', 'fileInputsDigest'] : [])]
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))
    || row.sourceKind !== 'native-goal-task' || typeof row.sourceId !== 'string' || !/^goal-task-result:[a-f0-9]{64}$/.test(row.sourceId)
    || typeof row.scopeKey !== 'string' || !/^conversation:sha256:[a-f0-9]{64}$/.test(row.scopeKey)
    || !CONVERSATION_FAMILIES.includes(row.family as ConversationFamily) || !['text', 'local-files'].includes(String(row.evaluationMode))
    || row.evaluationMode === 'local-files' && !['files', 'chat'].includes(String(row.fileOutputKind))
    || !Array.isArray(row.assistantMessageIds) || row.assistantMessageIds.length === 0 || row.assistantMessageIds.length > 128
    || row.assistantMessageIds.some(id => typeof id !== 'string' || id.trim().length === 0) || new Set(row.assistantMessageIds).size !== row.assistantMessageIds.length
    || ['outcomeInputDigest', 'behaviorVersion', 'inputDigest', 'materialDigest', 'reviewMaterialDigest', 'sessionLifecycleFingerprint',
      ...(row.evaluationMode === 'local-files' ? ['fileInputsDigest'] : [])].some(key => typeof row[key] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row[key] as string))) {
    throw new TypeError('invalid native Goal research source identity or scope')
  }
  const checks = parseConversationAuditedReviewChecks(row.checks)
  const qualityContract = parseConversationQualityContract(row.qualityContract)
  parseConversationQualityReviewChecks(checks, qualityContract)
  if (new Set(checks.map(check => check.proof.sessionId)).size !== 2) throw new TypeError('original Goal research checks are not independent')
  return { ...structuredClone(row), checks, qualityContract } as unknown as GoalTaskResearchSourceInput
}

/** The original bounded check-failure branch is kept distinct from a failed semantic review. */
export function goalTaskResearchProblem(source: GoalTaskResearchSource): { category: ConversationFailure; checkedFailure: boolean } | undefined {
  const review = conversationReviewConsensus(source.input.checks)
  if (review.verdict === 'not-met' && review.category !== null) return { category: review.category, checkedFailure: false }
  return source.input.family === 'code' && source.input.evaluationMode === 'local-files' && source.input.fileOutputKind === 'files'
    && review.verdict === 'met' && source.outcome.classification === 'checked-failure'
    ? { category: 'instruction-following', checkedFailure: true } : undefined
}
export function goalTaskResearchSuccess(source: GoalTaskResearchSource): boolean {
  return conversationReviewConsensus(source.input.checks).verdict === 'met' && source.outcome.classification === 'checked-success'
}

/** The existing native message feedback veto, not a model inference or invented attribution. */
export function goalTaskResearchFeedbackContradicts(source: GoalTaskResearchSource, statuses: readonly LearningIntakeStatus[], counterexample: boolean): boolean {
  return statuses.some(status => status.state === 'active' && status.sessionId === source.outcome.input.childSessionId
    && status.sessionLifecycleFingerprint === source.input.sessionLifecycleFingerprint && source.input.assistantMessageIds.includes(status.messageId)
    && status.rating === (counterexample ? 'negative' : 'positive'))
}
