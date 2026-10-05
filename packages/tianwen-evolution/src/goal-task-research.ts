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
  /** Prospective canonical input identity; never filled into old saved sources. */
  readonly inputIdentityDigest?: ReturnType<typeof sha256>
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

/** New sources compare original canonical inputs; old pairs keep their saved policy. */
export function sameGoalTaskResearchInput(first: GoalTaskResearchSource, second: GoalTaskResearchSource): boolean {
  if (first.input.inputIdentityDigest !== undefined && second.input.inputIdentityDigest !== undefined) {
    return first.input.inputIdentityDigest === second.input.inputIdentityDigest
  }
  return first.input.inputDigest === second.input.inputDigest
}
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
    'qualityContract', 'inputDigest', 'materialDigest', 'reviewMaterialDigest', 'sessionLifecycleFingerprint', 'assistantMessageIds', 'checks',
    ...(Object.hasOwn(row,'inputIdentityDigest') ? ['inputIdentityDigest'] : []), ...(row.evaluationMode === 'local-files' ? ['fileOutputKind', 'fileInputsDigest'] : [])]
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))
    || row.sourceKind !== 'native-goal-task' || typeof row.sourceId !== 'string' || !/^goal-task-result:[a-f0-9]{64}$/.test(row.sourceId)
    || typeof row.scopeKey !== 'string' || !/^conversation:sha256:[a-f0-9]{64}$/.test(row.scopeKey)
    || !CONVERSATION_FAMILIES.includes(row.family as ConversationFamily) || !['text', 'local-files'].includes(String(row.evaluationMode))
    || row.evaluationMode === 'local-files' && !['files', 'chat'].includes(String(row.fileOutputKind))
    || !Array.isArray(row.assistantMessageIds) || row.assistantMessageIds.length === 0 || row.assistantMessageIds.length > 128
    || row.assistantMessageIds.some(id => typeof id !== 'string' || id.trim().length === 0) || new Set(row.assistantMessageIds).size !== row.assistantMessageIds.length
    || ['outcomeInputDigest', 'behaviorVersion', 'inputDigest', 'materialDigest', 'reviewMaterialDigest', 'sessionLifecycleFingerprint',
      ...(Object.hasOwn(row,'inputIdentityDigest') ? ['inputIdentityDigest'] : []),
      ...(row.evaluationMode === 'local-files' ? ['fileInputsDigest'] : [])].some(key => typeof row[key] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row[key] as string))) {
    throw new TypeError('invalid native Goal research source identity or scope')
  }
  const checks = parseConversationAuditedReviewChecks(row.checks)
  const qualityContract = parseConversationQualityContract(row.qualityContract)
  parseConversationQualityReviewChecks(checks, qualityContract)
  if (new Set(checks.map(check => check.proof.sessionId)).size !== 2) throw new TypeError('original Goal research checks are not independent')
  return { ...structuredClone(row), checks, qualityContract } as unknown as GoalTaskResearchSourceInput
}

export function parseGoalTaskRegressionEvidence(value: unknown, ids: readonly string[]): readonly GoalTaskResearchReference[] {
  if (!Array.isArray(value) || value.length !== ids.length || ids.length < 2 || ids.length > 64) throw new TypeError('native Goal regression requires distinct later sources')
  return value.map((item,index)=>{
    if (item === null || typeof item !== 'object' || Array.isArray(item) || Reflect.ownKeys(item).length !== 2
      || !Object.hasOwn(item,'sourceId') || !Object.hasOwn(item,'inputDigest') || item.sourceId !== ids[index]
      || typeof item.sourceId !== 'string' || !/^goal-task-result:[a-f0-9]{64}$/.test(item.sourceId)
      || typeof item.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(item.inputDigest)) throw new TypeError('native Goal regression reference differs from its original source')
    return structuredClone(item)
  })
}

export interface GoalTaskRegressionScope {
  readonly scopeKey: string
  readonly family: ConversationFamily
  readonly evaluationMode?: string
  readonly fileOutputKind?: 'files' | 'chat'
  readonly qualityContract?: ConversationQualityContract
  readonly consentRevision: number
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly expectedVersion: ReturnType<typeof sha256>
  readonly activatedAt: string
}
/** Same original rollback threshold; this predicate never authorizes activation. */
export function isGoalTaskGuidanceRegression(source: GoalTaskResearchSource, scope: GoalTaskRegressionScope): boolean {
  const input=source.input, problem=goalTaskResearchProblem(source)
  return input.inputIdentityDigest !== undefined && source.outcome.at > scope.activatedAt && source.at > scope.activatedAt
    && input.scopeKey === scope.scopeKey && input.behaviorVersion === scope.expectedVersion && input.family === scope.family
    && input.evaluationMode === (scope.evaluationMode ?? 'text') && input.fileOutputKind === scope.fileOutputKind
    && source.outcome.input.consentRevision === scope.consentRevision && source.outcome.input.modelConfigDigest === scope.modelConfigDigest
    && sha256(input.qualityContract) === sha256(scope.qualityContract ?? null) && problem !== undefined
    && (!problem.checkedFailure || goalTaskResearchCheckInputsMatch(source))
}

/** Original answer checks bind complete material; existing code checks bind frozen files. */
export function goalTaskResearchCheckInputsMatch(source: GoalTaskResearchSource): boolean {
  if (source.outcome.input.checkerId === 'tianwen.isolated-python-answer.v1'
    && (source.input.evaluationMode === 'text'
      || source.input.evaluationMode === 'local-files' && source.input.fileOutputKind === 'chat')) {
    return source.input.materialDigest === source.outcome.input.inputsDigest
  }
  return source.input.family === 'code' && source.input.evaluationMode === 'local-files' && source.input.fileOutputKind === 'files'
    && source.input.fileInputsDigest === source.outcome.input.inputsDigest
}

/** The original bounded check-failure branch is kept distinct from a failed semantic review. */
export function goalTaskResearchProblem(source: GoalTaskResearchSource): { category: ConversationFailure; checkedFailure: boolean } | undefined {
  const review = conversationReviewConsensus(source.input.checks)
  if (review.verdict === 'not-met' && review.category !== null) return { category: review.category, checkedFailure: false }
  const checkedCode = source.input.family === 'code' && source.input.evaluationMode === 'local-files' && source.input.fileOutputKind === 'files'
  const checkedAnswer = source.outcome.input.checkerId === 'tianwen.isolated-python-answer.v1'
    && goalTaskResearchCheckInputsMatch(source)
  return (checkedCode || checkedAnswer) && review.verdict === 'met' && source.outcome.classification === 'checked-failure'
    ? { category: 'instruction-following', checkedFailure: true } : undefined
}

/** Pair only categories actually recorded by the conclusive original checks.
 * Consensus and its historical primary category remain unchanged. */
export function goalTaskResearchCommonCategory(first: GoalTaskResearchSource, second: GoalTaskResearchSource,
  preferred?: ConversationFailure): ConversationFailure | undefined {
  const a = goalTaskResearchProblem(first), b = goalTaskResearchProblem(second)
  if (a === undefined || b === undefined || a.checkedFailure !== b.checkedFailure) return undefined
  const categories = (source: GoalTaskResearchSource, problem: NonNullable<ReturnType<typeof goalTaskResearchProblem>>) =>
    [...new Set([problem.category, ...(problem.checkedFailure ? [] : source.input.checks.flatMap(check =>
      check.verdict === 'not-met' && check.category !== null ? [check.category] : []))])]
  const other = categories(second, b), shared = categories(first, a).filter(category => other.includes(category))
  return preferred === undefined ? shared[0] : shared.includes(preferred) ? preferred : undefined
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
