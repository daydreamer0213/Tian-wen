import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeVerdict,
  RunAcceptanceContract,
  TianwenRunBindingV2,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  GovernedSkillCandidate,
  SkillVersionId,
} from './skill-governance.js'
import type {
  ControlledSkillEvalStopContract,
  ControlledSkillEvaluationPlan,
  ControlledSkillEvaluationResult,
} from './controlled-skill-evaluation.js'
import type {
  ControlledSkillShadowId,
  ControlledSkillShadowPlan,
  ControlledSkillShadowResult,
} from './controlled-skill-shadow.js'

export const CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1 = Object.freeze({
  authority: 'project-owner',
  scope: 'tianwen-controlled-skill-lifecycle-v0.1',
  requiredRecommendation: 'promote',
  requiredEvaluation: 'pass',
  requiredShadow: 'pass',
  allowedTransitions: Object.freeze(['promote', 'rollback', 'restore'] as const),
} as const)

export type ControlledSkillTransitionKind = 'promote' | 'rollback' | 'restore'
export type ControlledSkillTransitionId = `transition:${string}`

export interface ControlledSkillActivationSource {
  readonly evaluationId: ControlledSkillEvaluationPlan['evaluationId']
  readonly evaluationPlanDigest: Sha256Digest
  readonly evaluationResultDigest: Sha256Digest
  readonly shadowId: ControlledSkillShadowId
  readonly shadowPlanDigest: Sha256Digest
  readonly shadowResultDigest: Sha256Digest
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidateVersionId: SkillVersionId
  readonly candidatePayloadDigest: Sha256Digest
  readonly scopeKey: string
  readonly mode: ControlledSkillShadowPlan['mode']
  readonly promotionEligibility: ControlledSkillShadowResult['promotionEligibility']
}

export interface ControlledSkillPromotionRecommendation {
  readonly schemaVersion: 'tianwen.controlled-skill-promotion-recommendation.v2'
  readonly source: ControlledSkillActivationSource
  readonly decision: 'promote'
}

export interface ControlledSkillScopePointer {
  readonly schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2'
  readonly scopeKey: string
  readonly activeVersionId: SkillVersionId
  readonly payloadDigest: Sha256Digest
  readonly revision: number
}

export interface InitializeControlledSkillScopePointerInput {
  readonly shadowId: ControlledSkillShadowId
}

export interface ControlledSkillScopePointerReceipt {
  readonly scopeKey: string
  readonly revision: number
  readonly duplicate: boolean
}

export interface ControlledSkillPointerInitialization {
  readonly schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2'
  readonly shadowId: ControlledSkillShadowId
  readonly source: ControlledSkillActivationSource
  readonly authorizationDigest: Sha256Digest
  readonly recommendationDigest: Sha256Digest
  readonly pointer: ControlledSkillScopePointer
}

export interface ControlledSkillPointerInitializedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2'
  readonly type: 'controlled-skill-pointer-initialized'
  readonly at: string
  readonly initialization: ControlledSkillPointerInitialization
  readonly inputDigest: Sha256Digest
}

export interface ControlledSkillTransitionPostCheckInput {
  readonly goalDigest: Sha256Digest
  readonly inputDigest: Sha256Digest
  readonly workspaceSnapshotDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly authorizationDigest: Sha256Digest
  readonly verifierContractDigest: Sha256Digest
  readonly stopConditionDigest: Sha256Digest
  readonly acceptanceContract: RunAcceptanceContract
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly allowedTools: readonly string[]
  readonly stopContract: ControlledSkillEvalStopContract
  readonly sessionId: string
}

export interface BeginControlledSkillTransitionInput {
  readonly shadowId: ControlledSkillShadowId
  readonly kind: ControlledSkillTransitionKind
  readonly expectedRevision: number
  readonly postCheck: ControlledSkillTransitionPostCheckInput
}

export interface ControlledSkillTransitionPostCheck
  extends ControlledSkillTransitionPostCheckInput {
  readonly runId: TianwenRunId
}

export interface ControlledSkillTransition {
  readonly schemaVersion: 'tianwen.controlled-skill-transition.v2'
  readonly transitionId: ControlledSkillTransitionId
  readonly shadowId: ControlledSkillShadowId
  readonly kind: ControlledSkillTransitionKind
  readonly source: ControlledSkillActivationSource
  readonly authorizationDigest: Sha256Digest
  readonly recommendationDigest: Sha256Digest
  readonly previousPointer: ControlledSkillScopePointer
  readonly targetPointer: ControlledSkillScopePointer
  readonly postCheck: ControlledSkillTransitionPostCheck
  readonly runBinding: TianwenRunBindingV2
}

interface ControlledSkillTransitionStartedEventBase {
  readonly schemaVersion: 'tianwen.controlled-skill-transition.v2'
  readonly at: string
  readonly transition: ControlledSkillTransition
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillTransitionStartedEvent =
  ControlledSkillTransitionStartedEventBase & (
    | { readonly type: 'controlled-skill-promoted' }
    | { readonly type: 'controlled-skill-rolled-back' }
    | { readonly type: 'controlled-skill-restored' }
  )

export interface ControlledSkillTransitionStartReceipt {
  readonly transitionId: ControlledSkillTransitionId
  readonly duplicate: boolean
}

export interface ControlledSkillTransitionUsage {
  readonly modelRequests: number
  readonly toolCalls: number
  readonly elapsedMs: number
}

export interface ControlledSkillTransitionRun {
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly skillVersionId: SkillVersionId
  readonly contentDigest: Sha256Digest
  readonly executionManifestDigest: Sha256Digest
  readonly normalizedFirstRequestDigest: Sha256Digest
  readonly outcome: OutcomeVerdict
  readonly evidenceIds: readonly Sha256Digest[]
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly usedToolNames: readonly string[]
  readonly usage: ControlledSkillTransitionUsage
}

export interface CompleteControlledSkillTransitionInput {
  readonly transitionId: ControlledSkillTransitionId
  readonly run: ControlledSkillTransitionRun
}

export interface ControlledSkillTransitionVerification {
  readonly schemaVersion: 'tianwen.controlled-skill-transition-verification.v2'
  readonly transitionId: ControlledSkillTransitionId
  readonly run: ControlledSkillTransitionRun
}

export interface ControlledSkillTransitionVerifiedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-transition-verification.v2'
  readonly type: 'controlled-skill-transition-verified'
  readonly at: string
  readonly verification: ControlledSkillTransitionVerification
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillActivationFailureReasonCode =
  | 'agent-create-failed'
  | 'persistence-unavailable'
  | 'provider-failed'
  | 'timeout'
  | 'tool-limit-exceeded'
  | 'request-contract-mismatch'
  | 'skill-use-missing'
  | 'acceptance-subject-mismatch'
  | 'root-skill-drift'
  | 'pointer-drift'
  | 'run-fact-mismatch'
  | 'post-check-not-met'
  | 'post-check-inconclusive'

export interface RecordControlledSkillActivationFailedInput {
  readonly transitionId: ControlledSkillTransitionId
  readonly reasonCode: ControlledSkillActivationFailureReasonCode
}

export interface ControlledSkillActivationFailure {
  readonly schemaVersion: 'tianwen.controlled-skill-activation-failure.v2'
  readonly transitionId: ControlledSkillTransitionId
  readonly reasonCode: ControlledSkillActivationFailureReasonCode
  readonly failedPointer: ControlledSkillScopePointer
  readonly recoveredPointer: ControlledSkillScopePointer
}

export interface ControlledSkillActivationFailedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-activation-failure.v2'
  readonly type: 'controlled-skill-activation-failed'
  readonly at: string
  readonly failure: ControlledSkillActivationFailure
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillTransitionState =
  | 'pending-post-check'
  | 'verified'
  | 'recovered'

export interface ControlledSkillTransitionReceipt {
  readonly transitionId: ControlledSkillTransitionId
  readonly state: ControlledSkillTransitionState
  readonly pointer: ControlledSkillScopePointer
  readonly reasonCode: ControlledSkillActivationFailureReasonCode | null
}

export interface ControlledSkillTransitionCompletionReceipt {
  readonly transitionId: ControlledSkillTransitionId
  readonly state: 'verified'
  readonly duplicate: boolean
}

export interface ControlledSkillActivationFailureReceipt {
  readonly transitionId: ControlledSkillTransitionId
  readonly state: 'recovered'
  readonly duplicate: boolean
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const EVALUATION_ID = /^evaluation:[a-f0-9]{64}$/u
const SHADOW_ID = /^shadow:[a-f0-9]{64}$/u
const CANDIDATE_ID = /^candidate:[a-f0-9]{64}$/u
const SKILL_VERSION_ID = /^skill-version:[a-f0-9]{64}$/u
const TRANSITION_ID = /^transition:[a-f0-9]{64}$/u
const RUN_ID = /^run:[a-f0-9]{64}$/u
const SAFE_TOOL_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u

const FAILURE_REASONS = new Set<ControlledSkillActivationFailureReasonCode>([
  'agent-create-failed',
  'persistence-unavailable',
  'provider-failed',
  'timeout',
  'tool-limit-exceeded',
  'request-contract-mismatch',
  'skill-use-missing',
  'acceptance-subject-mismatch',
  'root-skill-drift',
  'pointer-drift',
  'run-fact-mismatch',
  'post-check-not-met',
  'post-check-inconclusive',
])

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  const unexpected = actual.filter(key => !wanted.includes(key))
  const missing = wanted.filter(key => !actual.includes(key))
  if (unexpected.length > 0) throw new TypeError(`unexpected field: ${unexpected.join(', ')}`)
  if (missing.length > 0) throw new TypeError(`missing field: ${missing.join(', ')}`)
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return value as Sha256Digest
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${label} must be a positive integer`)
  }
  return Number(value)
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return Number(value)
}

function safeSessionId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value.length > 256
    || /[\u0000-\u001f\u007f]/u.test(value)
    || /^[a-z]:[\\/]/iu.test(value)
    || value.startsWith('/')
    || value.includes('://')
  ) throw new TypeError('controlled Skill transition sessionId is invalid')
  return value
}

function safeScopeKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 240) {
    throw new TypeError('controlled Skill activation scopeKey is invalid')
  }
  return value
}

function prepareAcceptanceContract(value: unknown): RunAcceptanceContract {
  if (!isRecord(value)) throw new TypeError('acceptanceContract must be an object')
  return prepareRunBinding({
    goalRef: 'goal:controlled-skill-transition-validation',
    taskRef: 'task:controlled-skill-transition-validation',
    sessionId: 'session:controlled-skill-transition-validation',
    scopeKey: 'scope:controlled-skill-transition-validation',
    acceptanceContract: value as unknown as RunAcceptanceContract,
  }).acceptanceContract
}

function prepareAllowedTools(value: unknown, acceptanceTool: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('controlled Skill transition allowedTools must be non-empty')
  }
  const tools = value.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('controlled Skill transition allowedTools are invalid')
    }
    return item
  })
  const canonical = [...new Set(tools)].sort((left, right) => left.localeCompare(right))
  if (
    canonicalJson(tools) !== canonicalJson(canonical)
    || !canonical.includes('skill')
    || !canonical.includes(acceptanceTool)
  ) {
    throw new TypeError('controlled Skill transition tools must be sorted, unique, and complete')
  }
  return canonical
}

function prepareStopContract(value: unknown): ControlledSkillEvalStopContract {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition stopContract must be an object')
  exactKeys(value, ['maxToolCalls', 'maxElapsedMs'])
  return {
    maxToolCalls: boundedInteger(value.maxToolCalls, 'maxToolCalls', 2, 256),
    maxElapsedMs: boundedInteger(value.maxElapsedMs, 'maxElapsedMs', 1, 3_600_000),
  }
}

function preparePostCheckInput(value: unknown): ControlledSkillTransitionPostCheckInput {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition postCheck must be an object')
  exactKeys(value, [
    'goalDigest',
    'inputDigest',
    'workspaceSnapshotDigest',
    'toolSchemaDigest',
    'authorizationDigest',
    'verifierContractDigest',
    'stopConditionDigest',
    'acceptanceContract',
    'acceptanceSubjectDigest',
    'allowedTools',
    'stopContract',
    'sessionId',
  ])
  const acceptanceContract = prepareAcceptanceContract(value.acceptanceContract)
  return {
    goalDigest: digest(value.goalDigest, 'goalDigest'),
    inputDigest: digest(value.inputDigest, 'inputDigest'),
    workspaceSnapshotDigest: digest(value.workspaceSnapshotDigest, 'workspaceSnapshotDigest'),
    toolSchemaDigest: digest(value.toolSchemaDigest, 'toolSchemaDigest'),
    authorizationDigest: digest(value.authorizationDigest, 'authorizationDigest'),
    verifierContractDigest: digest(value.verifierContractDigest, 'verifierContractDigest'),
    stopConditionDigest: digest(value.stopConditionDigest, 'stopConditionDigest'),
    acceptanceContract,
    acceptanceSubjectDigest: digest(value.acceptanceSubjectDigest, 'acceptanceSubjectDigest'),
    allowedTools: prepareAllowedTools(value.allowedTools, acceptanceContract.toolName),
    stopContract: prepareStopContract(value.stopContract),
    sessionId: safeSessionId(value.sessionId),
  }
}

function prepareSource(value: unknown): ControlledSkillActivationSource {
  if (!isRecord(value)) throw new TypeError('controlled Skill activation source must be an object')
  exactKeys(value, [
    'evaluationId',
    'evaluationPlanDigest',
    'evaluationResultDigest',
    'shadowId',
    'shadowPlanDigest',
    'shadowResultDigest',
    'candidateId',
    'parentVersionId',
    'parentPayloadDigest',
    'candidateVersionId',
    'candidatePayloadDigest',
    'scopeKey',
    'mode',
    'promotionEligibility',
  ])
  if (
    typeof value.evaluationId !== 'string'
    || !EVALUATION_ID.test(value.evaluationId)
    || typeof value.shadowId !== 'string'
    || !SHADOW_ID.test(value.shadowId)
    || typeof value.candidateId !== 'string'
    || !CANDIDATE_ID.test(value.candidateId)
    || typeof value.parentVersionId !== 'string'
    || !SKILL_VERSION_ID.test(value.parentVersionId)
    || typeof value.candidateVersionId !== 'string'
    || !SKILL_VERSION_ID.test(value.candidateVersionId)
    || (value.mode !== 'project' && value.mode !== 'isolated-test')
    || (value.promotionEligibility !== 'eligible-for-project-promotion'
      && value.promotionEligibility !== 'eligible-for-isolated-test-promotion')
  ) throw new TypeError('controlled Skill activation source is invalid')
  if (
    (value.mode === 'project') !== (value.promotionEligibility === 'eligible-for-project-promotion')
  ) throw new TypeError('controlled Skill activation scope and eligibility disagree')
  return {
    evaluationId: value.evaluationId as ControlledSkillEvaluationPlan['evaluationId'],
    evaluationPlanDigest: digest(value.evaluationPlanDigest, 'evaluationPlanDigest'),
    evaluationResultDigest: digest(value.evaluationResultDigest, 'evaluationResultDigest'),
    shadowId: value.shadowId as ControlledSkillShadowId,
    shadowPlanDigest: digest(value.shadowPlanDigest, 'shadowPlanDigest'),
    shadowResultDigest: digest(value.shadowResultDigest, 'shadowResultDigest'),
    candidateId: value.candidateId as GovernedSkillCandidate['candidateId'],
    parentVersionId: value.parentVersionId as SkillVersionId,
    parentPayloadDigest: digest(value.parentPayloadDigest, 'parentPayloadDigest'),
    candidateVersionId: value.candidateVersionId as SkillVersionId,
    candidatePayloadDigest: digest(value.candidatePayloadDigest, 'candidatePayloadDigest'),
    scopeKey: safeScopeKey(value.scopeKey),
    mode: value.mode,
    promotionEligibility: value.promotionEligibility,
  }
}

function sourceFromFacts(
  evaluation: ControlledSkillEvaluationPlan,
  evaluationResult: ControlledSkillEvaluationResult,
  shadow: ControlledSkillShadowPlan,
  shadowResult: ControlledSkillShadowResult,
  candidate: GovernedSkillCandidate,
  parentPayloadDigest: Sha256Digest,
): ControlledSkillActivationSource {
  if (
    evaluationResult.evaluationId !== evaluation.evaluationId
    || evaluationResult.planDigest !== sha256(evaluation)
    || evaluationResult.mechanismVerdict !== 'pass'
    || evaluationResult.reasonCode !== 'all-gates-passed'
    || shadow.evaluationId !== evaluation.evaluationId
    || shadow.evaluationPlanDigest !== sha256(evaluation)
    || shadow.evaluationResultDigest !== sha256(evaluationResult)
    || shadowResult.shadowId !== shadow.shadowId
    || shadowResult.planDigest !== sha256(shadow)
    || shadowResult.evaluationPlanDigest !== shadow.evaluationPlanDigest
    || shadowResult.evaluationResultDigest !== shadow.evaluationResultDigest
    || shadowResult.mechanismVerdict !== 'pass'
    || shadowResult.reasonCode !== 'all-shadow-runs-qualified'
    || candidate.candidateId !== evaluation.candidateId
    || candidate.candidateId !== shadow.candidateId
    || candidate.parentVersionId !== shadow.parentVersionId
    || candidate.payloadDigest !== shadow.candidatePayloadDigest
    || parentPayloadDigest !== shadow.parentPayloadDigest
    || shadow.sourceScopeKey !== evaluation.scopeKey
    || (shadow.mode === 'project'
      ? shadow.scopeKey !== evaluation.scopeKey
        || evaluationResult.evidenceClaim !== 'controlled-product'
        || evaluationResult.shadowEligibility !== 'eligible-for-project-shadow'
        || shadowResult.promotionEligibility !== 'eligible-for-project-promotion'
      : !shadow.scopeKey.startsWith('scope:controlled-skill-isolated:sha256:')
        || evaluationResult.evidenceClaim !== 'controlled-synthetic-mechanism'
        || evaluationResult.shadowEligibility !== 'eligible-for-isolated-test-shadow'
        || shadowResult.promotionEligibility !== 'eligible-for-isolated-test-promotion')
  ) throw new TypeError('controlled Skill activation requires fresh passing evidence')
  return {
    evaluationId: evaluation.evaluationId,
    evaluationPlanDigest: sha256(evaluation),
    evaluationResultDigest: sha256(evaluationResult),
    shadowId: shadow.shadowId,
    shadowPlanDigest: sha256(shadow),
    shadowResultDigest: sha256(shadowResult),
    candidateId: candidate.candidateId,
    parentVersionId: shadow.parentVersionId,
    parentPayloadDigest,
    candidateVersionId: shadow.candidateVersionId,
    candidatePayloadDigest: shadow.candidatePayloadDigest,
    scopeKey: shadow.scopeKey,
    mode: shadow.mode,
    promotionEligibility: shadowResult.promotionEligibility,
  }
}

export function prepareControlledSkillPromotionRecommendation(
  evaluation: ControlledSkillEvaluationPlan,
  evaluationResult: ControlledSkillEvaluationResult,
  shadow: ControlledSkillShadowPlan,
  shadowResult: ControlledSkillShadowResult,
  candidate: GovernedSkillCandidate,
  parentPayloadDigest: Sha256Digest,
): ControlledSkillPromotionRecommendation {
  return {
    schemaVersion: 'tianwen.controlled-skill-promotion-recommendation.v2',
    source: sourceFromFacts(
      evaluation,
      evaluationResult,
      shadow,
      shadowResult,
      candidate,
      parentPayloadDigest,
    ),
    decision: 'promote',
  }
}

export function parseControlledSkillPromotionRecommendation(
  value: unknown,
): ControlledSkillPromotionRecommendation {
  if (!isRecord(value)) throw new TypeError('controlled Skill recommendation must be an object')
  exactKeys(value, ['schemaVersion', 'source', 'decision'])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-promotion-recommendation.v2'
    || value.decision !== 'promote'
  ) throw new TypeError('controlled Skill recommendation is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-promotion-recommendation.v2',
    source: prepareSource(value.source),
    decision: 'promote',
  }
}

export function prepareControlledSkillPointerInitialization(
  recommendation: ControlledSkillPromotionRecommendation,
): ControlledSkillPointerInitialization {
  const source = prepareSource(recommendation.source)
  const preparedRecommendation = parseControlledSkillPromotionRecommendation(recommendation)
  return {
    schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2',
    shadowId: source.shadowId,
    source,
    authorizationDigest: sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1),
    recommendationDigest: sha256(preparedRecommendation),
    pointer: {
      schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2',
      scopeKey: source.scopeKey,
      activeVersionId: source.parentVersionId,
      payloadDigest: source.parentPayloadDigest,
      revision: 1,
    },
  }
}

export function parseControlledSkillScopePointer(value: unknown): ControlledSkillScopePointer {
  if (!isRecord(value)) throw new TypeError('controlled Skill scope pointer must be an object')
  exactKeys(value, [
    'schemaVersion', 'scopeKey', 'activeVersionId', 'payloadDigest', 'revision',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-scope-pointer.v2'
    || typeof value.activeVersionId !== 'string'
    || !SKILL_VERSION_ID.test(value.activeVersionId)
  ) throw new TypeError('controlled Skill scope pointer is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2',
    scopeKey: safeScopeKey(value.scopeKey),
    activeVersionId: value.activeVersionId as SkillVersionId,
    payloadDigest: digest(value.payloadDigest, 'payloadDigest'),
    revision: positiveInteger(value.revision, 'revision'),
  }
}

export function parseControlledSkillPointerInitialization(
  value: unknown,
): ControlledSkillPointerInitialization {
  if (!isRecord(value)) throw new TypeError('controlled Skill pointer initialization must be an object')
  exactKeys(value, [
    'schemaVersion',
    'shadowId',
    'source',
    'authorizationDigest',
    'recommendationDigest',
    'pointer',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-pointer-initialization.v2'
    || typeof value.shadowId !== 'string'
    || !SHADOW_ID.test(value.shadowId)
  ) throw new TypeError('controlled Skill pointer initialization is invalid')
  const source = prepareSource(value.source)
  const pointer = parseControlledSkillScopePointer(value.pointer)
  const prepared: ControlledSkillPointerInitialization = {
    schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2',
    shadowId: value.shadowId as ControlledSkillShadowId,
    source,
    authorizationDigest: digest(value.authorizationDigest, 'authorizationDigest'),
    recommendationDigest: digest(value.recommendationDigest, 'recommendationDigest'),
    pointer,
  }
  if (
    prepared.shadowId !== source.shadowId
    || prepared.authorizationDigest !== sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1)
    || pointer.scopeKey !== source.scopeKey
    || pointer.activeVersionId !== source.parentVersionId
    || pointer.payloadDigest !== source.parentPayloadDigest
    || pointer.revision !== 1
  ) throw new TypeError('controlled Skill pointer initialization disagrees with source')
  return prepared
}

function transitionTarget(
  kind: ControlledSkillTransitionKind,
  source: ControlledSkillActivationSource,
  previousPointer: ControlledSkillScopePointer,
): ControlledSkillScopePointer {
  const candidate = kind === 'promote' || kind === 'restore'
  return {
    schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2',
    scopeKey: source.scopeKey,
    activeVersionId: candidate ? source.candidateVersionId : source.parentVersionId,
    payloadDigest: candidate ? source.candidatePayloadDigest : source.parentPayloadDigest,
    revision: previousPointer.revision + 1,
  }
}

export function prepareControlledSkillTransition(
  input: BeginControlledSkillTransitionInput,
  recommendation: ControlledSkillPromotionRecommendation,
  previousPointer: ControlledSkillScopePointer,
): ControlledSkillTransition {
  if (!isRecord(input)) throw new TypeError('controlled Skill transition input must be an object')
  exactKeys(input, ['shadowId', 'kind', 'expectedRevision', 'postCheck'])
  if (
    typeof input.shadowId !== 'string'
    || !SHADOW_ID.test(input.shadowId)
    || (input.kind !== 'promote' && input.kind !== 'rollback' && input.kind !== 'restore')
  ) throw new TypeError('controlled Skill transition identity is invalid')
  const expectedRevision = positiveInteger(input.expectedRevision, 'expectedRevision')
  const source = prepareSource(recommendation.source)
  const previous = parseControlledSkillScopePointer(previousPointer)
  const postCheckInput = preparePostCheckInput(input.postCheck)
  if (
    input.shadowId !== source.shadowId
    || previous.scopeKey !== source.scopeKey
    || expectedRevision !== previous.revision
  ) throw new TypeError('controlled Skill transition disagrees with its pointer')
  const transitionId = `transition:${sha256({
    shadowId: input.shadowId,
    kind: input.kind,
    previousPointer: previous,
    postCheck: postCheckInput,
  }).slice('sha256:'.length)}` as ControlledSkillTransitionId
  const runBinding = prepareRunBinding({
    goalRef: `goal:controlled-skill-transition:${transitionId}`,
    taskRef: `task:controlled-skill-transition:${input.kind}:post-check`,
    sessionId: postCheckInput.sessionId,
    scopeKey: source.scopeKey,
    acceptanceContract: postCheckInput.acceptanceContract,
    acceptanceSubjectDigest: postCheckInput.acceptanceSubjectDigest,
  })
  if (runBinding.schemaVersion !== 'tianwen.run-binding.v2') {
    throw new TypeError('controlled Skill transition requires RunBinding v2')
  }
  const targetPointer = transitionTarget(input.kind, source, previous)
  if (
    targetPointer.activeVersionId === previous.activeVersionId
    || targetPointer.payloadDigest === previous.payloadDigest
  ) throw new TypeError('controlled Skill transition cannot be a no-op')
  return {
    schemaVersion: 'tianwen.controlled-skill-transition.v2',
    transitionId,
    shadowId: source.shadowId,
    kind: input.kind,
    source,
    authorizationDigest: sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1),
    recommendationDigest: sha256(parseControlledSkillPromotionRecommendation(recommendation)),
    previousPointer: previous,
    targetPointer,
    postCheck: { ...postCheckInput, runId: runBinding.runId },
    runBinding,
  }
}

export function parseControlledSkillTransition(value: unknown): ControlledSkillTransition {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition must be an object')
  exactKeys(value, [
    'schemaVersion',
    'transitionId',
    'shadowId',
    'kind',
    'source',
    'authorizationDigest',
    'recommendationDigest',
    'previousPointer',
    'targetPointer',
    'postCheck',
    'runBinding',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-transition.v2'
    || typeof value.transitionId !== 'string'
    || !TRANSITION_ID.test(value.transitionId)
    || typeof value.shadowId !== 'string'
    || !SHADOW_ID.test(value.shadowId)
    || (value.kind !== 'promote' && value.kind !== 'rollback' && value.kind !== 'restore')
    || !isRecord(value.postCheck)
  ) throw new TypeError('controlled Skill transition is invalid')
  exactKeys(value.postCheck, [
    'goalDigest',
    'inputDigest',
    'workspaceSnapshotDigest',
    'toolSchemaDigest',
    'authorizationDigest',
    'verifierContractDigest',
    'stopConditionDigest',
    'acceptanceContract',
    'acceptanceSubjectDigest',
    'allowedTools',
    'stopContract',
    'sessionId',
    'runId',
  ])
  const { runId, ...rawPostCheck } = value.postCheck
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    throw new TypeError('controlled Skill transition Run identity is invalid')
  }
  const source = prepareSource(value.source)
  const previousPointer = parseControlledSkillScopePointer(value.previousPointer)
  const targetPointer = parseControlledSkillScopePointer(value.targetPointer)
  const postCheck = preparePostCheckInput(rawPostCheck)
  const expectedId = `transition:${sha256({
    shadowId: value.shadowId,
    kind: value.kind,
    previousPointer,
    postCheck,
  }).slice('sha256:'.length)}` as ControlledSkillTransitionId
  const expectedBinding = prepareRunBinding({
    goalRef: `goal:controlled-skill-transition:${expectedId}`,
    taskRef: `task:controlled-skill-transition:${value.kind}:post-check`,
    sessionId: postCheck.sessionId,
    scopeKey: source.scopeKey,
    acceptanceContract: postCheck.acceptanceContract,
    acceptanceSubjectDigest: postCheck.acceptanceSubjectDigest,
  })
  const expectedTarget = transitionTarget(value.kind, source, previousPointer)
  if (
    value.transitionId !== expectedId
    || value.shadowId !== source.shadowId
    || runId !== expectedBinding.runId
    || canonicalJson(value.runBinding) !== canonicalJson(expectedBinding)
    || canonicalJson(targetPointer) !== canonicalJson(expectedTarget)
    || value.authorizationDigest !== sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1)
  ) throw new TypeError('controlled Skill transition is not canonical')
  return {
    schemaVersion: 'tianwen.controlled-skill-transition.v2',
    transitionId: expectedId,
    shadowId: source.shadowId,
    kind: value.kind,
    source,
    authorizationDigest: value.authorizationDigest as Sha256Digest,
    recommendationDigest: digest(value.recommendationDigest, 'recommendationDigest'),
    previousPointer,
    targetPointer,
    postCheck: { ...postCheck, runId: expectedBinding.runId },
    runBinding: expectedBinding as TianwenRunBindingV2,
  }
}

export function controlledSkillTransitionExecutionManifestDigest(
  transition: ControlledSkillTransition,
): Sha256Digest {
  return sha256({
    transitionId: transition.transitionId,
    shadowId: transition.shadowId,
    kind: transition.kind,
    source: transition.source,
    authorizationDigest: transition.authorizationDigest,
    recommendationDigest: transition.recommendationDigest,
    previousPointer: transition.previousPointer,
    targetPointer: transition.targetPointer,
    postCheck: {
      goalDigest: transition.postCheck.goalDigest,
      inputDigest: transition.postCheck.inputDigest,
      workspaceSnapshotDigest: transition.postCheck.workspaceSnapshotDigest,
      toolSchemaDigest: transition.postCheck.toolSchemaDigest,
      authorizationDigest: transition.postCheck.authorizationDigest,
      verifierContractDigest: transition.postCheck.verifierContractDigest,
      stopConditionDigest: transition.postCheck.stopConditionDigest,
      acceptanceContract: transition.postCheck.acceptanceContract,
      acceptanceSubjectDigest: transition.postCheck.acceptanceSubjectDigest,
      allowedTools: transition.postCheck.allowedTools,
      stopContract: transition.postCheck.stopContract,
    },
  })
}

function prepareUsage(value: unknown): ControlledSkillTransitionUsage {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition usage must be an object')
  exactKeys(value, ['modelRequests', 'toolCalls', 'elapsedMs'])
  return {
    modelRequests: boundedInteger(value.modelRequests, 'modelRequests', 1, Number.MAX_SAFE_INTEGER),
    toolCalls: boundedInteger(value.toolCalls, 'toolCalls', 0, Number.MAX_SAFE_INTEGER),
    elapsedMs: boundedInteger(value.elapsedMs, 'elapsedMs', 0, Number.MAX_SAFE_INTEGER),
  }
}

export function prepareControlledSkillTransitionRun(
  value: unknown,
  transition?: ControlledSkillTransition,
): ControlledSkillTransitionRun {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition run must be an object')
  exactKeys(value, [
    'runId',
    'sessionId',
    'skillVersionId',
    'contentDigest',
    'executionManifestDigest',
    'normalizedFirstRequestDigest',
    'outcome',
    'evidenceIds',
    'acceptanceSubjectDigest',
    'usedToolNames',
    'usage',
  ])
  if (
    typeof value.runId !== 'string'
    || !RUN_ID.test(value.runId)
    || typeof value.skillVersionId !== 'string'
    || !SKILL_VERSION_ID.test(value.skillVersionId)
    || (value.outcome !== 'met' && value.outcome !== 'not-met' && value.outcome !== 'inconclusive')
    || !Array.isArray(value.evidenceIds)
    || !Array.isArray(value.usedToolNames)
  ) throw new TypeError('controlled Skill transition run is invalid')
  const usedToolNames = value.usedToolNames.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('controlled Skill transition usedToolNames are invalid')
    }
    return item
  })
  const canonicalTools = [...new Set(usedToolNames)]
    .sort((left, right) => left.localeCompare(right))
  if (canonicalJson(usedToolNames) !== canonicalJson(canonicalTools)) {
    throw new TypeError('controlled Skill transition usedToolNames must be sorted and unique')
  }
  const prepared: ControlledSkillTransitionRun = {
    runId: value.runId as TianwenRunId,
    sessionId: safeSessionId(value.sessionId),
    skillVersionId: value.skillVersionId as SkillVersionId,
    contentDigest: digest(value.contentDigest, 'contentDigest'),
    executionManifestDigest: digest(value.executionManifestDigest, 'executionManifestDigest'),
    normalizedFirstRequestDigest: digest(
      value.normalizedFirstRequestDigest,
      'normalizedFirstRequestDigest',
    ),
    outcome: value.outcome,
    evidenceIds: value.evidenceIds.map(item => digest(item, 'evidenceId')),
    acceptanceSubjectDigest: digest(value.acceptanceSubjectDigest, 'acceptanceSubjectDigest'),
    usedToolNames: canonicalTools,
    usage: prepareUsage(value.usage),
  }
  if (transition !== undefined && (
    prepared.runId !== transition.postCheck.runId
    || prepared.sessionId !== transition.postCheck.sessionId
    || prepared.skillVersionId !== transition.targetPointer.activeVersionId
    || prepared.executionManifestDigest !== controlledSkillTransitionExecutionManifestDigest(transition)
    || prepared.outcome !== 'met'
    || prepared.acceptanceSubjectDigest !== transition.postCheck.acceptanceSubjectDigest
    || prepared.usedToolNames.some(tool => !transition.postCheck.allowedTools.includes(tool))
    || !prepared.usedToolNames.includes('skill')
    || !prepared.usedToolNames.includes(transition.postCheck.acceptanceContract.toolName)
    || prepared.usage.toolCalls < prepared.usedToolNames.length
    || prepared.usage.toolCalls > transition.postCheck.stopContract.maxToolCalls
    || prepared.usage.elapsedMs > transition.postCheck.stopContract.maxElapsedMs
  )) throw new TypeError('controlled Skill transition run violates its frozen plan')
  return prepared
}

export function prepareControlledSkillTransitionVerification(
  input: CompleteControlledSkillTransitionInput,
  transition: ControlledSkillTransition,
): ControlledSkillTransitionVerification {
  if (!isRecord(input)) throw new TypeError('controlled Skill transition completion must be an object')
  exactKeys(input, ['transitionId', 'run'])
  if (input.transitionId !== transition.transitionId) {
    throw new TypeError('controlled Skill transition completion identity is invalid')
  }
  return {
    schemaVersion: 'tianwen.controlled-skill-transition-verification.v2',
    transitionId: transition.transitionId,
    run: prepareControlledSkillTransitionRun(input.run, transition),
  }
}

export function parseControlledSkillTransitionVerification(
  value: unknown,
): ControlledSkillTransitionVerification {
  if (!isRecord(value)) throw new TypeError('controlled Skill transition verification must be an object')
  exactKeys(value, ['schemaVersion', 'transitionId', 'run'])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-transition-verification.v2'
    || typeof value.transitionId !== 'string'
    || !TRANSITION_ID.test(value.transitionId)
  ) throw new TypeError('controlled Skill transition verification is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-transition-verification.v2',
    transitionId: value.transitionId as ControlledSkillTransitionId,
    run: prepareControlledSkillTransitionRun(value.run),
  }
}

export function prepareControlledSkillActivationFailure(
  input: RecordControlledSkillActivationFailedInput,
  transition: ControlledSkillTransition,
): ControlledSkillActivationFailure {
  if (!isRecord(input)) throw new TypeError('controlled Skill activation failure input must be an object')
  exactKeys(input, ['transitionId', 'reasonCode'])
  if (
    input.transitionId !== transition.transitionId
    || !FAILURE_REASONS.has(input.reasonCode)
  ) throw new TypeError('controlled Skill activation failure input is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-activation-failure.v2',
    transitionId: transition.transitionId,
    reasonCode: input.reasonCode,
    failedPointer: structuredClone(transition.targetPointer),
    recoveredPointer: {
      ...structuredClone(transition.previousPointer),
      revision: transition.targetPointer.revision + 1,
    },
  }
}

export function parseControlledSkillActivationFailure(
  value: unknown,
): ControlledSkillActivationFailure {
  if (!isRecord(value)) throw new TypeError('controlled Skill activation failure must be an object')
  exactKeys(value, [
    'schemaVersion', 'transitionId', 'reasonCode', 'failedPointer', 'recoveredPointer',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-activation-failure.v2'
    || typeof value.transitionId !== 'string'
    || !TRANSITION_ID.test(value.transitionId)
    || !FAILURE_REASONS.has(value.reasonCode as ControlledSkillActivationFailureReasonCode)
  ) throw new TypeError('controlled Skill activation failure is invalid')
  const failedPointer = parseControlledSkillScopePointer(value.failedPointer)
  const recoveredPointer = parseControlledSkillScopePointer(value.recoveredPointer)
  if (
    recoveredPointer.scopeKey !== failedPointer.scopeKey
    || recoveredPointer.revision !== failedPointer.revision + 1
  ) throw new TypeError('controlled Skill activation recovery pointer is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-activation-failure.v2',
    transitionId: value.transitionId as ControlledSkillTransitionId,
    reasonCode: value.reasonCode as ControlledSkillActivationFailureReasonCode,
    failedPointer,
    recoveredPointer,
  }
}
