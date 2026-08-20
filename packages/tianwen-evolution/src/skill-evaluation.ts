import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import type {
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeLearningSignal,
  RunAcceptanceContract,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  GovernedSkillCandidate,
  LearningCase,
  SkillVersionId,
} from './skill-governance.js'

export type SkillEvalProtocolId = `eval-protocol:${string}`
export type SkillEvalCaseId = `eval-case:${string}`
export type SkillEvalCaseCategory =
  | 'problem'
  | 'regression'
  | 'counterexample'
  | 'safety'
export type SkillEvalArmOrder = 'baseline-then-candidate'
export type SkillEvalAttemptReducer = 'all-attempts-must-pass'
export type SkillEvalMetric = 'model-requests' | 'tool-calls'
export type SkillEvalProtocolReasonCode =
  | 'scripted-model-output'
  | 'fairness-mismatch'
  | 'missing-evidence'
  | 'validator-subject-mismatch'
  | 'baseline-resolution-mismatch'
  | 'arm-budget-exhausted'
  | 'policy-authorization-unobservable'
  | 'unbound-dependency'

export interface SkillEvalProtocolCase {
  readonly caseId: SkillEvalCaseId
  readonly category: SkillEvalCaseCategory
  readonly inputDigest: Sha256Digest
  readonly dataSnapshotDigest: Sha256Digest
  readonly acceptanceContract: RunAcceptanceContract
}

export interface SkillEvalProtocol {
  readonly cases: readonly SkillEvalProtocolCase[]
  readonly armOrder: SkillEvalArmOrder
  readonly repetition: {
    readonly attempts: number
    readonly reducer: SkillEvalAttemptReducer
  }
  readonly hardGates: readonly SkillEvalCaseCategory[]
  readonly softMetrics: readonly SkillEvalMetric[]
  readonly thresholds: { readonly requiredCasePasses: number }
  readonly budget: {
    readonly maxModelRequestsPerArm: number
    readonly maxTokensPerArm: number
    readonly maxToolCallsPerArm: number
    readonly maxElapsedMsPerArm: number
    readonly maxCnyMilliPerArm: number
    readonly maxTotalModelRequests: number
    readonly maxTotalTokens: number
    readonly maxTotalToolCalls: number
    readonly maxTotalElapsedMs: number
    readonly maxTotalCnyMilli: number
  }
  readonly execution: {
    readonly providerId: string
    readonly modelId: string
    readonly toolSchemaDigest: Sha256Digest
    readonly validatorContractDigest: Sha256Digest
  }
}

export interface FreezeSkillEvalProtocolInput {
  readonly ticketId: LearningTicketId
  readonly protocol: SkillEvalProtocol
}

export interface SkillEvalProtocolRecord {
  readonly schemaVersion: 'tianwen.skill-eval-protocol.v1'
  readonly protocolId: SkillEvalProtocolId
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly provenance: 'pre-candidate' | 'retrospective'
  readonly protocol: SkillEvalProtocol
}

export interface SkillEvalProtocolReceipt {
  readonly protocolId: SkillEvalProtocolId
  readonly provenance: SkillEvalProtocolRecord['provenance']
  readonly duplicate: boolean
}

export interface SkillEvalProtocolFrozenEvent {
  readonly schemaVersion: 'tianwen.skill-eval-protocol.v1'
  readonly type: 'skill-eval-protocol-frozen'
  readonly at: string
  readonly protocol: SkillEvalProtocolRecord
  readonly inputDigest: Sha256Digest
}

export type SkillEvaluationId = `evaluation:${string}`
export type SkillEvaluationVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE'
export type SkillComparison =
  | 'candidate-better'
  | 'baseline-better'
  | 'tie'
  | 'not-comparable'
export type SkillEvaluationDecision =
  | 'eligible-for-shadow-review'
  | 'retain-baseline'
  | 'candidate-hard-gate-failed'
  | 'needs-evidence'
export type SkillEvaluationEvidenceClass =
  | 'scripted-mechanism'
  | 'objective-screening'
  | 'independent-objective'
export type SkillEvaluationReasonCode = SkillEvalProtocolReasonCode
export type SkillEvaluationPolicyAuthorization = 'unobservable'
export type SkillEvaluationDependencyBinding = 'unbound'

export interface SkillEvaluationEnvironment {
  readonly dshVersion: '0.1.0-rc.7'
  readonly providerId: string
  readonly modelId: string
  readonly callConfigDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly workspaceSnapshotDigest: Sha256Digest
  readonly validatorContractDigest: Sha256Digest
  /** The rc.7 public surface exposes no authoritative Policy/authorization fact. */
  readonly policyAuthorization: SkillEvaluationPolicyAuthorization
  /** Stage 4 records these frozen references but cannot attest their independent binding. */
  readonly workspaceBinding: SkillEvaluationDependencyBinding
  readonly validatorBinding: SkillEvaluationDependencyBinding
  readonly dataBinding: SkillEvaluationDependencyBinding
  readonly budget: SkillEvalProtocol['budget']
}

export interface SkillEvaluationArmInput {
  readonly caseId: SkillEvalCaseId
  readonly attempt: number
  readonly baseline: { readonly runId: TianwenRunId; readonly sessionId: string }
  readonly candidate: { readonly runId: TianwenRunId; readonly sessionId: string }
}

export interface OpenSkillEvaluationInput {
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly protocolId: SkillEvalProtocolId
  readonly environment: SkillEvaluationEnvironment
  readonly arms: readonly SkillEvaluationArmInput[]
}

export interface SkillEvaluationArmPlan {
  readonly role: 'baseline' | 'candidate'
  readonly runId: TianwenRunId
  readonly sessionId: string
}

export interface SkillEvaluationCasePlan {
  readonly caseId: SkillEvalCaseId
  readonly category: SkillEvalCaseCategory
  readonly attempt: number
  readonly inputDigest: Sha256Digest
  readonly dataSnapshotDigest: Sha256Digest
  readonly acceptanceContract: RunAcceptanceContract
  readonly baseline: SkillEvaluationArmPlan
  readonly candidate: SkillEvaluationArmPlan
}

export interface SkillEvaluationPlan {
  readonly schemaVersion: 'tianwen.skill-evaluation-plan.v1'
  readonly evaluationId: SkillEvaluationId
  readonly protocolId: SkillEvalProtocolId
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidatePayloadDigest: Sha256Digest
  readonly scopeKey: string
  readonly protocolProvenance: SkillEvalProtocolRecord['provenance']
  readonly environment: SkillEvaluationEnvironment
  readonly cases: readonly SkillEvaluationCasePlan[]
}

export interface SkillEvaluationReceipt {
  readonly evaluationId: SkillEvaluationId
  readonly duplicate: boolean
}

export interface SkillEvaluationOpenedEvent {
  readonly schemaVersion: 'tianwen.skill-evaluation-plan.v1'
  readonly type: 'skill-evaluation-opened'
  readonly at: string
  readonly plan: SkillEvaluationPlan
  readonly inputDigest: Sha256Digest
}

export interface SkillEvaluationUsage {
  readonly modelRequests: number
  readonly tokens: number
  readonly toolCalls: number
  readonly elapsedMs: number
  readonly cnyMilli: number
}

export interface SkillEvaluationArmObservation {
  readonly role: SkillEvaluationArmPlan['role']
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly skillVersionId: SkillVersionId
  readonly contentDigest: Sha256Digest
  readonly executionManifestDigest: Sha256Digest
  readonly fullRequestDigest: Sha256Digest
  readonly normalizedFirstRequestDigest: Sha256Digest
  readonly injectionProofDigest: Sha256Digest
  readonly outcome: 'met' | 'not-met' | 'inconclusive'
  readonly evidenceIds: readonly Sha256Digest[]
  readonly validatorReceiptDigest: Sha256Digest
  readonly validatorSubjectDigest: Sha256Digest
  readonly evaluatedSubjectDigest: Sha256Digest
  readonly usage: SkillEvaluationUsage
  readonly reasonCode?: SkillEvaluationReasonCode
}

export interface SkillEvaluationCaseObservation {
  readonly caseId: SkillEvalCaseId
  readonly attempt: number
  readonly baseline: SkillEvaluationArmObservation
  readonly candidate: SkillEvaluationArmObservation
}

export interface SkillEvaluationCaseResult extends SkillEvaluationCaseObservation {
  readonly category: SkillEvalCaseCategory
  readonly verdict: SkillEvaluationVerdict
  readonly comparison: SkillComparison
}

export interface RecordSkillEvaluationResultInput {
  readonly evaluationId: SkillEvaluationId
  readonly cases: readonly SkillEvaluationCaseObservation[]
  readonly baselineResolutionMatched: boolean
}

export interface SkillEvaluationResult {
  readonly schemaVersion: 'tianwen.skill-evaluation-result.v1'
  readonly evaluationId: SkillEvaluationId
  readonly protocolId: SkillEvalProtocolId
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly parentVersionId: SkillVersionId
  /** Binds this immutable aggregate result to the complete frozen Evaluation plan. */
  readonly planDigest: Sha256Digest
  readonly verdict: SkillEvaluationVerdict
  readonly comparison: SkillComparison
  readonly decision: SkillEvaluationDecision
  readonly reasonCodes: readonly SkillEvaluationReasonCode[]
  readonly cases: readonly SkillEvaluationCaseResult[]
  readonly baselineResolutionMatched: boolean
  readonly evidenceClass: SkillEvaluationEvidenceClass
  readonly protocolProvenance: SkillEvaluationPlan['protocolProvenance']
}

export interface SkillEvaluationResultReceipt {
  readonly evaluationId: SkillEvaluationId
  readonly duplicate: boolean
}

export interface SkillEvaluationDecisionInput {
  readonly verdict: SkillEvaluationVerdict
  readonly comparison: SkillComparison
  readonly evidenceClass: SkillEvaluationEvidenceClass
  readonly baselineResolutionMatched: boolean
  readonly protocolProvenance: SkillEvaluationPlan['protocolProvenance']
}

export type SkillEvaluationFreshnessReason =
  | 'evaluation-plan-mismatch'
  | 'parent-changed'
  | 'candidate-changed'
  | 'protocol-changed'
  | 'runtime-changed'
  | 'provider-or-model-changed'
  | 'call-config-changed'
  | 'tool-surface-changed'
  | 'workspace-changed'
  | 'validator-changed'
  | 'data-changed'
  | 'policy-authorization-unobservable'
  | 'unbound-dependency'

export type SkillEvaluationFreshness =
  | { readonly state: 'fresh'; readonly reason: 'fresh' }
  | { readonly state: 'stale'; readonly reason: SkillEvaluationFreshnessReason }

/**
 * Current facts are deliberately supplied separately from the immutable
 * recorded plan/result. This is a pure Stage 5 decision seam: it neither
 * appends an event nor changes the historic result.
 */
export interface SkillEvaluationCurrentDependencies {
  readonly recordedPlan: SkillEvaluationPlan
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly candidatePayloadDigest: Sha256Digest
  readonly protocolId: SkillEvalProtocolId
  readonly protocolProvenance: SkillEvalProtocolRecord['provenance']
  readonly dshVersion: string
  readonly providerId: string
  readonly modelId: string
  readonly callConfigDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly workspaceSnapshotDigest: Sha256Digest
  readonly validatorContractDigest: Sha256Digest
  readonly policyAuthorization: SkillEvaluationPolicyAuthorization
  readonly workspaceBinding: SkillEvaluationDependencyBinding
  readonly validatorBinding: SkillEvaluationDependencyBinding
  readonly dataBinding: SkillEvaluationDependencyBinding
  readonly dataSnapshotDigests: readonly {
    readonly caseId: SkillEvalCaseId
    readonly attempt: number
    readonly dataSnapshotDigest: Sha256Digest
  }[]
}

export interface SkillEvaluationResultRecordedEvent {
  readonly schemaVersion: 'tianwen.skill-evaluation-result.v1'
  readonly type: 'skill-evaluation-result-recorded'
  readonly at: string
  readonly result: SkillEvaluationResult
  readonly inputDigest: Sha256Digest
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u
const TICKET_ID = /^ticket:[a-f0-9]{64}$/u
const CASE_ID = /^eval-case:[a-z0-9][a-z0-9-]{0,63}$/u
const RUN_ID = /^run:[a-f0-9]{64}$/u
const CATEGORIES = [
  'problem',
  'regression',
  'counterexample',
  'safety',
] as const satisfies readonly SkillEvalCaseCategory[]
const METRICS = ['model-requests', 'tool-calls'] as const
const MAX_ATTEMPTS = 3
const MAX_MODEL_REQUESTS = 10
const MAX_TOKENS = 100_000
const MAX_TOOL_CALLS = 100
const MAX_ELAPSED_MS = 3_600_000
const MAX_CNY_MILLI = 60_000
const ARMS_PER_CASE = 2
const MAX_EVALUATION_ARMS = CATEGORIES.length * MAX_ATTEMPTS * ARMS_PER_CASE
const MAX_TOTAL_MODEL_REQUESTS = MAX_MODEL_REQUESTS * MAX_EVALUATION_ARMS
const MAX_TOTAL_TOKENS = MAX_TOKENS * MAX_EVALUATION_ARMS
const MAX_TOTAL_TOOL_CALLS = MAX_TOOL_CALLS * MAX_EVALUATION_ARMS
const MAX_TOTAL_ELAPSED_MS = MAX_ELAPSED_MS * MAX_EVALUATION_ARMS
const MAX_TOTAL_CNY_MILLI = MAX_CNY_MILLI

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value)
  if (
    keys.length !== expected.length
    || expected.some(key => !(key in value))
    || keys.some(key => !expected.includes(key))
  ) {
    throw new TypeError('Skill evaluation input has an invalid shape')
  }
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`)
  }
  return value.trim()
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return value as Sha256Digest
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return value as number
}

function safeIdentifier(value: unknown, label: string): string {
  const identifier = nonblank(value, label)
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(identifier)) {
    throw new TypeError(`${label} must be a safe identifier`)
  }
  return identifier
}

function safeScope(value: unknown): string {
  const scope = nonblank(value, 'scopeKey')
  if (
    scope.length > 256
    || /[\u0000-\u001f\u007f]/u.test(scope)
    || /^[a-z]:[\\/]/iu.test(scope)
    || scope.startsWith('/')
    || scope.includes('://')
  ) {
    throw new TypeError('scopeKey must be a governed scope identifier')
  }
  return scope
}

function safeSessionId(value: unknown): string {
  const sessionId = nonblank(value, 'sessionId')
  if (
    sessionId.length > 256
    || /[\u0000-\u001f\u007f]/u.test(sessionId)
    || /^[a-z]:[\\/]/iu.test(sessionId)
    || sessionId.startsWith('/')
    || sessionId.includes('://')
  ) {
    throw new TypeError('sessionId must be a governed session identifier')
  }
  return sessionId
}

function category(value: unknown): SkillEvalCaseCategory {
  if (!(CATEGORIES as readonly string[]).includes(value as string)) {
    throw new TypeError('evaluation case category is invalid')
  }
  return value as SkillEvalCaseCategory
}

function acceptanceContract(value: unknown, caseId: SkillEvalCaseId): RunAcceptanceContract {
  return prepareRunBinding({
    goalRef: 'goal:skill-evaluation',
    taskRef: `task:${caseId}`,
    sessionId: `session:${caseId}`,
    scopeKey: 'evaluation:validation',
    acceptanceContract: value as RunAcceptanceContract,
  }).acceptanceContract
}

function prepareCase(value: unknown): SkillEvalProtocolCase {
  if (!isRecord(value)) {
    throw new TypeError('evaluation case must be an object')
  }
  exactKeys(value, [
    'caseId',
    'category',
    'inputDigest',
    'dataSnapshotDigest',
    'acceptanceContract',
  ])
  const caseId = nonblank(value.caseId, 'caseId')
  if (!CASE_ID.test(caseId)) {
    throw new TypeError('caseId must be a safe evaluation case ID')
  }
  return {
    caseId: caseId as SkillEvalCaseId,
    category: category(value.category),
    inputDigest: digest(value.inputDigest, 'inputDigest'),
    dataSnapshotDigest: digest(value.dataSnapshotDigest, 'dataSnapshotDigest'),
    acceptanceContract: acceptanceContract(value.acceptanceContract, caseId as SkillEvalCaseId),
  }
}

function prepareProtocol(value: unknown): SkillEvalProtocol {
  if (!isRecord(value)) {
    throw new TypeError('Skill evaluation protocol must be an object')
  }
  exactKeys(value, [
    'cases',
    'armOrder',
    'repetition',
    'hardGates',
    'softMetrics',
    'thresholds',
    'budget',
    'execution',
  ])
  if (!Array.isArray(value.cases) || value.cases.length !== CATEGORIES.length) {
    throw new TypeError('Skill evaluation protocol requires four cases')
  }
  const cases = value.cases.map(prepareCase)
  if (
    new Set(cases.map(item => item.caseId)).size !== cases.length
    || cases.map(item => item.category).join(',') !== CATEGORIES.join(',')
  ) {
    throw new TypeError('Skill evaluation cases must cover each category once')
  }
  if (value.armOrder !== 'baseline-then-candidate') {
    throw new TypeError('Skill evaluation arm order is invalid')
  }
  if (!isRecord(value.repetition)) {
    throw new TypeError('Skill evaluation repetition must be an object')
  }
  exactKeys(value.repetition, ['attempts', 'reducer'])
  const repetition = {
    attempts: boundedInteger(value.repetition.attempts, 'attempts', 1, MAX_ATTEMPTS),
    reducer: value.repetition.reducer,
  }
  if (repetition.reducer !== 'all-attempts-must-pass') {
    throw new TypeError('Skill evaluation attempt reducer is invalid')
  }
  if (
    !Array.isArray(value.hardGates)
    || value.hardGates.join(',') !== CATEGORIES.join(',')
  ) {
    throw new TypeError('Skill evaluation hard gates are invalid')
  }
  if (
    !Array.isArray(value.softMetrics)
    || value.softMetrics.some(metric => !(METRICS as readonly string[]).includes(metric))
    || new Set(value.softMetrics).size !== value.softMetrics.length
  ) {
    throw new TypeError('Skill evaluation soft metrics are invalid')
  }
  if (!isRecord(value.thresholds)) {
    throw new TypeError('Skill evaluation thresholds must be an object')
  }
  exactKeys(value.thresholds, ['requiredCasePasses'])
  const thresholds = {
    requiredCasePasses: boundedInteger(
      value.thresholds.requiredCasePasses,
      'requiredCasePasses',
      1,
      cases.length,
    ),
  }
  if (thresholds.requiredCasePasses !== cases.length) {
    throw new TypeError('every Stage 4 case must remain a hard gate')
  }
  if (!isRecord(value.budget)) {
    throw new TypeError('Skill evaluation budget must be an object')
  }
  exactKeys(value.budget, [
    'maxModelRequestsPerArm',
    'maxTokensPerArm',
    'maxToolCallsPerArm',
    'maxElapsedMsPerArm',
    'maxCnyMilliPerArm',
    'maxTotalModelRequests',
    'maxTotalTokens',
    'maxTotalToolCalls',
    'maxTotalElapsedMs',
    'maxTotalCnyMilli',
  ])
  const budget = {
    maxModelRequestsPerArm: boundedInteger(
      value.budget.maxModelRequestsPerArm,
      'maxModelRequestsPerArm',
      1,
      MAX_MODEL_REQUESTS,
    ),
    maxTokensPerArm: boundedInteger(
      value.budget.maxTokensPerArm,
      'maxTokensPerArm',
      1,
      MAX_TOKENS,
    ),
    maxToolCallsPerArm: boundedInteger(
      value.budget.maxToolCallsPerArm,
      'maxToolCallsPerArm',
      0,
      MAX_TOOL_CALLS,
    ),
    maxElapsedMsPerArm: boundedInteger(
      value.budget.maxElapsedMsPerArm,
      'maxElapsedMsPerArm',
      1,
      MAX_ELAPSED_MS,
    ),
    maxCnyMilliPerArm: boundedInteger(
      value.budget.maxCnyMilliPerArm,
      'maxCnyMilliPerArm',
      0,
      MAX_CNY_MILLI,
    ),
    maxTotalModelRequests: boundedInteger(
      value.budget.maxTotalModelRequests,
      'maxTotalModelRequests',
      1,
      MAX_TOTAL_MODEL_REQUESTS,
    ),
    maxTotalTokens: boundedInteger(
      value.budget.maxTotalTokens,
      'maxTotalTokens',
      1,
      MAX_TOTAL_TOKENS,
    ),
    maxTotalToolCalls: boundedInteger(
      value.budget.maxTotalToolCalls,
      'maxTotalToolCalls',
      0,
      MAX_TOTAL_TOOL_CALLS,
    ),
    maxTotalElapsedMs: boundedInteger(
      value.budget.maxTotalElapsedMs,
      'maxTotalElapsedMs',
      1,
      MAX_TOTAL_ELAPSED_MS,
    ),
    maxTotalCnyMilli: boundedInteger(
      value.budget.maxTotalCnyMilli,
      'maxTotalCnyMilli',
      0,
      MAX_TOTAL_CNY_MILLI,
    ),
  }
  const armCount = cases.length * repetition.attempts * ARMS_PER_CASE
  const aggregateMinimums = [
    ['maxTotalModelRequests', budget.maxTotalModelRequests, budget.maxModelRequestsPerArm * armCount],
    ['maxTotalTokens', budget.maxTotalTokens, budget.maxTokensPerArm * armCount],
    ['maxTotalToolCalls', budget.maxTotalToolCalls, budget.maxToolCallsPerArm * armCount],
    ['maxTotalElapsedMs', budget.maxTotalElapsedMs, budget.maxElapsedMsPerArm * armCount],
    ['maxTotalCnyMilli', budget.maxTotalCnyMilli, budget.maxCnyMilliPerArm * armCount],
  ] as const
  for (const [label, total, minimum] of aggregateMinimums) {
    if (total < minimum) {
      throw new TypeError(`${label} cannot be lower than the fixed matrix budget`)
    }
  }
  if (!isRecord(value.execution)) {
    throw new TypeError('Skill evaluation execution contract must be an object')
  }
  exactKeys(value.execution, [
    'providerId',
    'modelId',
    'toolSchemaDigest',
    'validatorContractDigest',
  ])
  return {
    cases,
    armOrder: 'baseline-then-candidate',
    repetition: {
      attempts: repetition.attempts,
      reducer: 'all-attempts-must-pass',
    },
    hardGates: [...CATEGORIES],
    softMetrics: value.softMetrics.map(metric => metric as SkillEvalMetric),
    thresholds,
    budget,
    execution: {
      providerId: safeIdentifier(value.execution.providerId, 'providerId'),
      modelId: safeIdentifier(value.execution.modelId, 'modelId'),
      toolSchemaDigest: digest(value.execution.toolSchemaDigest, 'toolSchemaDigest'),
      validatorContractDigest: digest(
        value.execution.validatorContractDigest,
        'validatorContractDigest',
      ),
    },
  }
}

function deriveScope(
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
): string {
  if (ticket.status !== 'open') {
    throw new TypeError('Skill evaluation protocol requires an open Ticket')
  }
  const selected = ticket.signalIds.map(signalId =>
    signals.find(signal => signal.signalId === signalId))
  if (selected.length === 0 || selected.some(signal => signal === undefined)) {
    throw new TypeError('Skill evaluation protocol requires Outcome Ticket signals')
  }
  const scopeKey = safeScope(selected[0]!.scopeKey)
  if (!selected.every(signal => safeScope(signal!.scopeKey) === scopeKey)) {
    throw new TypeError('Skill evaluation Ticket signals disagree on scope')
  }
  return scopeKey
}

export function prepareSkillEvalProtocol(
  input: FreezeSkillEvalProtocolInput,
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
  provenance: SkillEvalProtocolRecord['provenance'],
): SkillEvalProtocolRecord {
  if (!isRecord(input)) {
    throw new TypeError('Skill evaluation protocol input must be an object')
  }
  exactKeys(input, ['ticketId', 'protocol'])
  if (typeof input.ticketId !== 'string' || !TICKET_ID.test(input.ticketId)) {
    throw new TypeError('ticketId must be a Learning Ticket ID')
  }
  if (input.ticketId !== ticket.ticketId) {
    throw new TypeError('Skill evaluation protocol references another Ticket')
  }
  if (provenance !== 'pre-candidate' && provenance !== 'retrospective') {
    throw new TypeError('Skill evaluation protocol provenance is invalid')
  }
  const scopeKey = deriveScope(ticket, signals)
  const protocol = prepareProtocol(input.protocol)
  const identity = sha256({
    ticketId: ticket.ticketId,
    scopeKey,
    protocol,
  })
  return {
    schemaVersion: 'tianwen.skill-eval-protocol.v1',
    protocolId: `eval-protocol:${identity.slice('sha256:'.length)}`,
    ticketId: ticket.ticketId,
    scopeKey,
    provenance,
    protocol,
  }
}

export function parseSkillEvalProtocol(
  value: unknown,
): SkillEvalProtocolRecord {
  if (!isRecord(value)) {
    throw new TypeError('Skill evaluation protocol record must be an object')
  }
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'ticketId',
    'scopeKey',
    'provenance',
    'protocol',
  ])
  if (value.schemaVersion !== 'tianwen.skill-eval-protocol.v1') {
    throw new TypeError('invalid Skill evaluation protocol schema version')
  }
  if (typeof value.ticketId !== 'string' || !TICKET_ID.test(value.ticketId)) {
    throw new TypeError('invalid Skill evaluation protocol Ticket ID')
  }
  const scopeKey = safeScope(value.scopeKey)
  if (value.provenance !== 'pre-candidate' && value.provenance !== 'retrospective') {
    throw new TypeError('invalid Skill evaluation protocol provenance')
  }
  const protocol = prepareProtocol(value.protocol)
  const protocolId = `eval-protocol:${sha256({
    ticketId: value.ticketId,
    scopeKey,
    protocol,
  }).slice('sha256:'.length)}` as SkillEvalProtocolId
  if (value.protocolId !== protocolId) {
    throw new TypeError('Skill evaluation protocol identity is not canonical')
  }
  return {
    schemaVersion: 'tianwen.skill-eval-protocol.v1',
    protocolId,
    ticketId: value.ticketId as LearningTicketId,
    scopeKey,
    provenance: value.provenance,
    protocol,
  }
}

function prepareEnvironment(
  value: unknown,
  protocol: SkillEvalProtocol,
): SkillEvaluationEnvironment {
  if (!isRecord(value)) {
    throw new TypeError('Skill evaluation environment must be an object')
  }
  exactKeys(value, [
    'dshVersion',
    'providerId',
    'modelId',
    'callConfigDigest',
    'toolSchemaDigest',
    'workspaceSnapshotDigest',
    'validatorContractDigest',
    'policyAuthorization',
    'workspaceBinding',
    'validatorBinding',
    'dataBinding',
    'budget',
  ])
  if (value.dshVersion !== '0.1.0-rc.7' || canonicalJson(value.budget) !== canonicalJson(protocol.budget)) {
    throw new TypeError('Skill evaluation environment disagrees with the frozen protocol')
  }
  if (
    value.providerId !== protocol.execution.providerId
    || value.modelId !== protocol.execution.modelId
    || value.toolSchemaDigest !== protocol.execution.toolSchemaDigest
    || value.validatorContractDigest !== protocol.execution.validatorContractDigest
  ) {
    throw new TypeError('Skill evaluation environment disagrees with the execution contract')
  }
  if (
    value.policyAuthorization !== 'unobservable'
    || value.workspaceBinding !== 'unbound'
    || value.validatorBinding !== 'unbound'
    || value.dataBinding !== 'unbound'
  ) {
    throw new TypeError('Stage 4 only supports explicitly unbound external dependencies')
  }
  return {
    dshVersion: '0.1.0-rc.7',
    providerId: safeIdentifier(value.providerId, 'providerId'),
    modelId: safeIdentifier(value.modelId, 'modelId'),
    callConfigDigest: digest(value.callConfigDigest, 'callConfigDigest'),
    toolSchemaDigest: digest(value.toolSchemaDigest, 'toolSchemaDigest'),
    workspaceSnapshotDigest: digest(value.workspaceSnapshotDigest, 'workspaceSnapshotDigest'),
    validatorContractDigest: digest(value.validatorContractDigest, 'validatorContractDigest'),
    policyAuthorization: 'unobservable',
    workspaceBinding: 'unbound',
    validatorBinding: 'unbound',
    dataBinding: 'unbound',
    budget: structuredClone(protocol.budget),
  }
}

function preparePlanArms(
  value: unknown,
  protocol: SkillEvalProtocol,
): readonly SkillEvaluationCasePlan[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Skill evaluation arms must be an array')
  }
  const expected = protocol.cases.flatMap(item =>
    Array.from({ length: protocol.repetition.attempts }, (_, index) => ({
      caseId: item.caseId,
      attempt: index + 1,
    })))
  if (value.length !== expected.length) {
    throw new TypeError('Skill evaluation arms must cover the frozen matrix')
  }
  const protocolCases = new Map(protocol.cases.map(item => [item.caseId, item]))
  const seen = new Set<string>()
  const runIds = new Set<string>()
  const sessionIds = new Set<string>()
  const cases = value.map(item => {
    if (!isRecord(item)) throw new TypeError('Skill evaluation arm row must be an object')
    exactKeys(item, ['caseId', 'attempt', 'baseline', 'candidate'])
    const caseId = nonblank(item.caseId, 'caseId') as SkillEvalCaseId
    const attempt = boundedInteger(item.attempt, 'attempt', 1, protocol.repetition.attempts)
    const protocolCase = protocolCases.get(caseId)
    if (protocolCase === undefined || !seen.add(`${caseId}:${attempt}`)) {
      throw new TypeError('Skill evaluation arm row is duplicate or outside the protocol')
    }
    const arm = (role: 'baseline' | 'candidate'): SkillEvaluationArmPlan => {
      const valueArm = item[role]
      if (!isRecord(valueArm)) throw new TypeError(`${role} arm must be an object`)
      exactKeys(valueArm, ['runId', 'sessionId'])
      if (typeof valueArm.runId !== 'string' || !RUN_ID.test(valueArm.runId)) {
        throw new TypeError(`${role} runId must be a Tianwen Run ID`)
      }
      const sessionId = safeSessionId(valueArm.sessionId)
      if (!runIds.add(valueArm.runId) || !sessionIds.add(sessionId)) {
        throw new TypeError('Skill evaluation arms must use distinct Runs and Sessions')
      }
      return { role, runId: valueArm.runId as TianwenRunId, sessionId }
    }
    return {
      caseId,
      category: protocolCase.category,
      attempt,
      inputDigest: protocolCase.inputDigest,
      dataSnapshotDigest: protocolCase.dataSnapshotDigest,
      acceptanceContract: structuredClone(protocolCase.acceptanceContract),
      baseline: arm('baseline'),
      candidate: arm('candidate'),
    }
  })
  if (expected.some(item => !seen.has(`${item.caseId}:${item.attempt}`))) {
    throw new TypeError('Skill evaluation arms omit a frozen row')
  }
  return cases
}

export function prepareSkillEvaluationPlan(
  input: OpenSkillEvaluationInput,
  candidate: GovernedSkillCandidate,
  learningCase: LearningCase,
  protocolRecord: SkillEvalProtocolRecord,
  parentPayloadDigest: Sha256Digest,
): SkillEvaluationPlan {
  if (!isRecord(input)) throw new TypeError('Skill evaluation input must be an object')
  exactKeys(input, ['candidateId', 'protocolId', 'environment', 'arms'])
  if (
    input.candidateId !== candidate.candidateId
    || input.protocolId !== protocolRecord.protocolId
    || candidate.ticketId !== protocolRecord.ticketId
    || candidate.caseId !== learningCase.caseId
    || candidate.parentVersionId !== learningCase.parentVersionId
    || candidate.parentVersionId !== learningCase.parentVersionId
    || candidate.targetScope !== learningCase.scopeKey
    || protocolRecord.scopeKey !== learningCase.scopeKey
  ) {
    throw new TypeError('Skill evaluation Candidate chain disagrees with its protocol')
  }
  const environment = prepareEnvironment(input.environment, protocolRecord.protocol)
  const cases = preparePlanArms(input.arms, protocolRecord.protocol)
  const identity = sha256({
    candidateId: candidate.candidateId,
    parentVersionId: candidate.parentVersionId,
    protocolId: protocolRecord.protocolId,
    environment,
    arms: cases.map(item => ({
      caseId: item.caseId,
      attempt: item.attempt,
      baseline: item.baseline,
      candidate: item.candidate,
    })),
  })
  return {
    schemaVersion: 'tianwen.skill-evaluation-plan.v1',
    evaluationId: `evaluation:${identity.slice('sha256:'.length)}`,
    protocolId: protocolRecord.protocolId,
    candidateId: candidate.candidateId,
    parentVersionId: candidate.parentVersionId,
    parentPayloadDigest,
    candidatePayloadDigest: candidate.payloadDigest,
    scopeKey: learningCase.scopeKey,
    protocolProvenance: protocolRecord.provenance,
    environment,
    cases,
  }
}

export function parseSkillEvaluationPlan(value: unknown): SkillEvaluationPlan {
  if (!isRecord(value)) throw new TypeError('Skill evaluation plan must be an object')
  exactKeys(value, [
    'schemaVersion', 'evaluationId', 'protocolId', 'candidateId', 'parentVersionId',
    'parentPayloadDigest', 'candidatePayloadDigest', 'scopeKey', 'protocolProvenance',
    'environment', 'cases',
  ])
  if (
    value.schemaVersion !== 'tianwen.skill-evaluation-plan.v1'
    || typeof value.evaluationId !== 'string'
    || !/^evaluation:[a-f0-9]{64}$/u.test(value.evaluationId)
  ) {
    throw new TypeError('Skill evaluation plan has an invalid identity')
  }
  return structuredClone(value) as unknown as SkillEvaluationPlan
}

function prepareUsage(value: unknown): SkillEvaluationUsage {
  if (!isRecord(value)) throw new TypeError('Skill evaluation usage must be an object')
  exactKeys(value, ['modelRequests', 'tokens', 'toolCalls', 'elapsedMs', 'cnyMilli'])
  return {
    modelRequests: boundedInteger(value.modelRequests, 'modelRequests', 0, MAX_TOTAL_MODEL_REQUESTS),
    tokens: boundedInteger(value.tokens, 'tokens', 0, MAX_TOTAL_TOKENS),
    toolCalls: boundedInteger(value.toolCalls, 'toolCalls', 0, MAX_TOTAL_TOOL_CALLS),
    elapsedMs: boundedInteger(value.elapsedMs, 'elapsedMs', 0, MAX_TOTAL_ELAPSED_MS),
    cnyMilli: boundedInteger(value.cnyMilli, 'cnyMilli', 0, MAX_TOTAL_CNY_MILLI),
  }
}

function prepareObservation(
  value: unknown,
  plan: SkillEvaluationArmPlan,
  budget: SkillEvalProtocol['budget'],
): SkillEvaluationArmObservation {
  if (!isRecord(value)) throw new TypeError('Skill evaluation arm observation must be an object')
  const keys = [
    'role', 'runId', 'sessionId', 'skillVersionId', 'contentDigest',
    'executionManifestDigest', 'fullRequestDigest', 'normalizedFirstRequestDigest',
    'injectionProofDigest', 'outcome', 'evidenceIds', 'validatorReceiptDigest',
    'validatorSubjectDigest', 'evaluatedSubjectDigest', 'usage',
  ]
  if (value.reasonCode !== undefined) keys.push('reasonCode')
  exactKeys(value, keys)
  if (
    value.role !== plan.role
    || value.runId !== plan.runId
    || value.sessionId !== plan.sessionId
    || typeof value.skillVersionId !== 'string'
    || !/^skill-version:[a-f0-9]{64}$/u.test(value.skillVersionId)
    || (value.outcome !== 'met' && value.outcome !== 'not-met' && value.outcome !== 'inconclusive')
    || !Array.isArray(value.evidenceIds)
  ) {
    throw new TypeError('Skill evaluation arm observation disagrees with its plan')
  }
  if (
    value.reasonCode !== undefined
    && !(Object.values({
      scripted: 'scripted-model-output', fairness: 'fairness-mismatch', missing: 'missing-evidence',
      subject: 'validator-subject-mismatch', baseline: 'baseline-resolution-mismatch', budget: 'arm-budget-exhausted',
      policy: 'policy-authorization-unobservable', unbound: 'unbound-dependency',
    }) as readonly string[]).includes(value.reasonCode as string)
  ) {
    throw new TypeError('Skill evaluation reason code is invalid')
  }
  const usage = prepareUsage(value.usage)
  const exceedsArmBudget =
    usage.modelRequests > budget.maxModelRequestsPerArm
    || usage.tokens > budget.maxTokensPerArm
    || usage.toolCalls > budget.maxToolCallsPerArm
    || usage.elapsedMs > budget.maxElapsedMsPerArm
    || usage.cnyMilli > budget.maxCnyMilliPerArm
  if (exceedsArmBudget && (
    value.outcome !== 'inconclusive' || value.reasonCode !== 'arm-budget-exhausted'
  )) {
    throw new TypeError('Skill evaluation arm exceeds its frozen budget')
  }
  const evidenceIds = value.evidenceIds.map(item => digest(item, 'evidenceId'))
  const validatorSubjectDigest = digest(value.validatorSubjectDigest, 'validatorSubjectDigest')
  const evaluatedSubjectDigest = digest(value.evaluatedSubjectDigest, 'evaluatedSubjectDigest')
  const validatorReceiptDigest = digest(value.validatorReceiptDigest, 'validatorReceiptDigest')
  if (validatorReceiptDigest !== sha256({
    evidenceId: evidenceIds.at(-1) ?? null,
    subjectDigest: validatorSubjectDigest,
  })) {
    throw new TypeError('Skill evaluation validator receipt is not bound to its Evidence and subject')
  }
  if (
    validatorSubjectDigest !== evaluatedSubjectDigest
    && (value.outcome !== 'inconclusive' || value.reasonCode !== 'validator-subject-mismatch')
  ) {
    throw new TypeError('Skill evaluation validator subject disagrees with the evaluated subject')
  }
  return {
    role: plan.role,
    runId: plan.runId,
    sessionId: plan.sessionId,
    skillVersionId: value.skillVersionId as SkillVersionId,
    contentDigest: digest(value.contentDigest, 'contentDigest'),
    executionManifestDigest: digest(value.executionManifestDigest, 'executionManifestDigest'),
    fullRequestDigest: digest(value.fullRequestDigest, 'fullRequestDigest'),
    normalizedFirstRequestDigest: digest(value.normalizedFirstRequestDigest, 'normalizedFirstRequestDigest'),
    injectionProofDigest: digest(value.injectionProofDigest, 'injectionProofDigest'),
    outcome: value.outcome,
    evidenceIds,
    validatorReceiptDigest,
    validatorSubjectDigest,
    evaluatedSubjectDigest,
    usage,
    ...(value.reasonCode === undefined
      ? {}
      : { reasonCode: value.reasonCode as SkillEvaluationReasonCode }),
  }
}

function reduceCase(
  plan: SkillEvaluationCasePlan,
  value: unknown,
  budget: SkillEvalProtocol['budget'],
): SkillEvaluationCaseResult {
  if (!isRecord(value)) throw new TypeError('Skill evaluation case result must be an object')
  exactKeys(value, ['caseId', 'attempt', 'baseline', 'candidate'])
  if (value.caseId !== plan.caseId || value.attempt !== plan.attempt) {
    throw new TypeError('Skill evaluation case result disagrees with its plan')
  }
  const baseline = prepareObservation(value.baseline, plan.baseline, budget)
  const candidate = prepareObservation(value.candidate, plan.candidate, budget)
  const unreliable = baseline.outcome === 'inconclusive'
    || candidate.outcome === 'inconclusive'
    || baseline.normalizedFirstRequestDigest !== candidate.normalizedFirstRequestDigest
    || baseline.executionManifestDigest !== candidate.executionManifestDigest
  const verdict = unreliable
    ? 'INCONCLUSIVE'
    : candidate.outcome === 'met' ? 'PASS' : 'FAIL'
  const comparison: SkillComparison = unreliable
    ? 'not-comparable'
    : baseline.outcome === candidate.outcome ? 'tie'
      : baseline.outcome === 'not-met' ? 'candidate-better' : 'baseline-better'
  return {
    caseId: plan.caseId,
    category: plan.category,
    attempt: plan.attempt,
    baseline,
    candidate,
    verdict,
    comparison,
  }
}

/** Pure policy reduction; Stage 4's runtime never supplies independent evidence. */
export function decideSkillEvaluation(input: SkillEvaluationDecisionInput): SkillEvaluationDecision {
  if (input.verdict === 'FAIL') return 'candidate-hard-gate-failed'
  if (input.verdict === 'PASS' && input.comparison === 'tie') return 'retain-baseline'
  if (
    input.verdict === 'PASS'
    && input.comparison === 'candidate-better'
    && input.evidenceClass === 'independent-objective'
    && input.baselineResolutionMatched
    && input.protocolProvenance === 'pre-candidate'
  ) {
    return 'eligible-for-shadow-review'
  }
  return 'needs-evidence'
}

/**
 * Pure freshness check for a historic result. A completed result is never
 * implicitly current: Stage 4's deliberately unobservable Policy and unbound
 * workspace/validator/data references keep it stale for any future Stage 5 use.
 */
export function assessSkillEvaluationFreshness(
  current: SkillEvaluationCurrentDependencies,
  result: SkillEvaluationResult,
): SkillEvaluationFreshness {
  const plan = current.recordedPlan
  if (
    result.evaluationId !== plan.evaluationId
    || result.protocolId !== plan.protocolId
    || result.candidateId !== plan.candidateId
    || result.parentVersionId !== plan.parentVersionId
    || result.planDigest !== sha256(plan)
  ) {
    return { state: 'stale', reason: 'evaluation-plan-mismatch' }
  }
  if (
    current.parentVersionId !== plan.parentVersionId
    || current.parentPayloadDigest !== plan.parentPayloadDigest
  ) return { state: 'stale', reason: 'parent-changed' }
  if (
    current.candidateId !== plan.candidateId
    || current.candidatePayloadDigest !== plan.candidatePayloadDigest
  ) return { state: 'stale', reason: 'candidate-changed' }
  if (
    current.protocolId !== plan.protocolId
    || current.protocolProvenance !== plan.protocolProvenance
  ) return { state: 'stale', reason: 'protocol-changed' }
  if (current.dshVersion !== plan.environment.dshVersion) {
    return { state: 'stale', reason: 'runtime-changed' }
  }
  if (
    current.providerId !== plan.environment.providerId
    || current.modelId !== plan.environment.modelId
  ) return { state: 'stale', reason: 'provider-or-model-changed' }
  if (current.callConfigDigest !== plan.environment.callConfigDigest) {
    return { state: 'stale', reason: 'call-config-changed' }
  }
  if (current.toolSchemaDigest !== plan.environment.toolSchemaDigest) {
    return { state: 'stale', reason: 'tool-surface-changed' }
  }
  if (current.workspaceSnapshotDigest !== plan.environment.workspaceSnapshotDigest) {
    return { state: 'stale', reason: 'workspace-changed' }
  }
  if (current.validatorContractDigest !== plan.environment.validatorContractDigest) {
    return { state: 'stale', reason: 'validator-changed' }
  }
  const plannedData = plan.cases.map(item => ({
    caseId: item.caseId,
    attempt: item.attempt,
    dataSnapshotDigest: item.dataSnapshotDigest,
  }))
  if (canonicalJson(current.dataSnapshotDigests) !== canonicalJson(plannedData)) {
    return { state: 'stale', reason: 'data-changed' }
  }
  if (
    current.policyAuthorization !== plan.environment.policyAuthorization
    || plan.environment.policyAuthorization === 'unobservable'
  ) {
    return { state: 'stale', reason: 'policy-authorization-unobservable' }
  }
  if (
    current.workspaceBinding !== plan.environment.workspaceBinding
    || current.validatorBinding !== plan.environment.validatorBinding
    || current.dataBinding !== plan.environment.dataBinding
    || plan.environment.workspaceBinding === 'unbound'
    || plan.environment.validatorBinding === 'unbound'
    || plan.environment.dataBinding === 'unbound'
  ) return { state: 'stale', reason: 'unbound-dependency' }
  return { state: 'fresh', reason: 'fresh' }
}

export function prepareSkillEvaluationResult(
  input: RecordSkillEvaluationResultInput,
  plan: SkillEvaluationPlan,
): SkillEvaluationResult {
  if (!isRecord(input)) throw new TypeError('Skill evaluation result input must be an object')
  exactKeys(input, ['evaluationId', 'cases', 'baselineResolutionMatched'])
  if (
    input.evaluationId !== plan.evaluationId
    || !Array.isArray(input.cases)
    || typeof input.baselineResolutionMatched !== 'boolean'
    || input.cases.length !== plan.cases.length
  ) {
    throw new TypeError('Skill evaluation result disagrees with its plan')
  }
  const planned = new Map(plan.cases.map(item => [`${item.caseId}:${item.attempt}`, item]))
  const results = input.cases.map(value => {
    if (!isRecord(value)) throw new TypeError('Skill evaluation case result must be an object')
    const planCase = planned.get(`${value.caseId}:${value.attempt}`)
    if (planCase === undefined) throw new TypeError('Skill evaluation result has an unknown case')
    return reduceCase(planCase, value, plan.environment.budget)
  })
  if (new Set(results.map(item => `${item.caseId}:${item.attempt}`)).size !== results.length) {
    throw new TypeError('Skill evaluation result has duplicate cases')
  }
  const evidenceClass: SkillEvaluationEvidenceClass = plan.environment.providerId === 'scripted-adapter'
    ? 'scripted-mechanism'
    : 'objective-screening'
  const unavailableDependencies = plan.environment.policyAuthorization === 'unobservable'
    || plan.environment.workspaceBinding === 'unbound'
    || plan.environment.validatorBinding === 'unbound'
    || plan.environment.dataBinding === 'unbound'
  const usage = results.reduce((total, item) => ({
    modelRequests: total.modelRequests + item.baseline.usage.modelRequests + item.candidate.usage.modelRequests,
    tokens: total.tokens + item.baseline.usage.tokens + item.candidate.usage.tokens,
    toolCalls: total.toolCalls + item.baseline.usage.toolCalls + item.candidate.usage.toolCalls,
    elapsedMs: total.elapsedMs + item.baseline.usage.elapsedMs + item.candidate.usage.elapsedMs,
    cnyMilli: total.cnyMilli + item.baseline.usage.cnyMilli + item.candidate.usage.cnyMilli,
  }), { modelRequests: 0, tokens: 0, toolCalls: 0, elapsedMs: 0, cnyMilli: 0 })
  const exceedsTotalBudget =
    usage.modelRequests > plan.environment.budget.maxTotalModelRequests
    || usage.tokens > plan.environment.budget.maxTotalTokens
    || usage.toolCalls > plan.environment.budget.maxTotalToolCalls
    || usage.elapsedMs > plan.environment.budget.maxTotalElapsedMs
    || usage.cnyMilli > plan.environment.budget.maxTotalCnyMilli
  if (exceedsTotalBudget && !results.some(item =>
    item.baseline.reasonCode === 'arm-budget-exhausted'
    || item.candidate.reasonCode === 'arm-budget-exhausted')) {
    throw new TypeError('Skill evaluation result exceeds its frozen total budget')
  }
  const verdict: SkillEvaluationVerdict = evidenceClass === 'scripted-mechanism'
    || unavailableDependencies
    || !input.baselineResolutionMatched
    ? 'INCONCLUSIVE'
    : results.some(item => item.verdict === 'FAIL')
      ? 'FAIL'
      : results.some(item => item.verdict === 'INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS'
  const comparison: SkillComparison = evidenceClass === 'scripted-mechanism'
    || unavailableDependencies
    || !input.baselineResolutionMatched
    ? 'not-comparable'
    : results.some(item => item.comparison === 'not-comparable')
      ? 'not-comparable'
      : results.some(item => item.comparison === 'baseline-better') ? 'baseline-better'
        : results.some(item => item.comparison === 'candidate-better') ? 'candidate-better' : 'tie'
  const decision = decideSkillEvaluation({
    verdict,
    comparison,
    evidenceClass,
    baselineResolutionMatched: input.baselineResolutionMatched,
    protocolProvenance: plan.protocolProvenance,
  })
  const reasonCodes = [...new Set(results.flatMap(item => [
    item.baseline.reasonCode,
    item.candidate.reasonCode,
  ].filter((reason): reason is SkillEvaluationReasonCode => reason !== undefined)))]
  if (evidenceClass === 'scripted-mechanism') reasonCodes.push('scripted-model-output')
  if (plan.environment.policyAuthorization === 'unobservable') {
    reasonCodes.push('policy-authorization-unobservable')
  }
  if (
    plan.environment.workspaceBinding === 'unbound'
    || plan.environment.validatorBinding === 'unbound'
    || plan.environment.dataBinding === 'unbound'
  ) reasonCodes.push('unbound-dependency')
  if (!input.baselineResolutionMatched) reasonCodes.push('baseline-resolution-mismatch')
  return {
    schemaVersion: 'tianwen.skill-evaluation-result.v1',
    evaluationId: plan.evaluationId,
    protocolId: plan.protocolId,
    candidateId: plan.candidateId,
    parentVersionId: plan.parentVersionId,
    planDigest: sha256(plan),
    verdict,
    comparison,
    decision,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    cases: results,
    baselineResolutionMatched: input.baselineResolutionMatched,
    evidenceClass,
    protocolProvenance: plan.protocolProvenance,
  }
}

export function parseSkillEvaluationResult(value: unknown): SkillEvaluationResult {
  if (!isRecord(value)) throw new TypeError('Skill evaluation result must be an object')
  const keys = [
    'schemaVersion', 'evaluationId', 'protocolId', 'candidateId', 'parentVersionId',
    'planDigest', 'verdict', 'comparison', 'decision', 'reasonCodes', 'cases',
    'baselineResolutionMatched', 'evidenceClass', 'protocolProvenance',
  ]
  exactKeys(value, keys)
  if (value.schemaVersion !== 'tianwen.skill-evaluation-result.v1') {
    throw new TypeError('Skill evaluation result has an invalid schema version')
  }
  digest(value.planDigest, 'planDigest')
  return structuredClone(value) as unknown as SkillEvaluationResult
}
