import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import type {
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeVerdict,
  RunAcceptanceContract,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  GovernedSkillCandidate,
  LearningCase,
  SkillVersionId,
} from './skill-governance.js'
import type { SkillEvalProtocolId } from './skill-evaluation.js'
import {
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY,
  resolveControlledSkillSourceFidelityFamily,
  CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS,
} from './controlled-skill-source-fidelity.js'

export const CONTROLLED_SKILL_EVAL_TASK_TYPES = Object.freeze([
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const)

export const CONTROLLED_SKILL_EVAL_RUBRIC = Object.freeze({
  schemaVersion: 'tianwen.controlled-skill-eval-rubric.v1',
  scoreAnchors: Object.freeze({
    0: 'unusable, irrelevant, or seriously misleading',
    1: 'main goal not met; only limited value can be recovered',
    2: 'basically usable with clear gaps and substantial manual correction',
    3: 'good; goal clearly met with only minor correction',
    4: 'excellent; accurate, clear, restrained, and directly usable',
  }),
  dimensions: Object.freeze([
    'relevance',
    'correctness-reasoning',
    'clarity-usability',
    'scope-restraint',
  ] as const),
  candidatePassRules: Object.freeze([
    'candidate-all-objective-hard-gates-pass',
    'candidate-objectively-better-on-original-or-adjacent',
    'candidate-has-no-objective-regression',
    'candidate-subjective-total-not-lower',
    'candidate-no-dimension-lower-by-two',
    'evaluator-material-sufficient',
  ] as const),
})

export const CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST = sha256(
  CONTROLLED_SKILL_EVAL_RUBRIC,
)

export type ControlledSkillEvalTaskType =
  typeof CONTROLLED_SKILL_EVAL_TASK_TYPES[number]
export type ControlledSkillEvalEvidencePurpose =
  | 'controlled-product'
  | 'development-only-synthetic-defect'
export type ControlledSkillEvalEvidenceLabel =
  | 'development-only'
  | 'synthetic-defect'
export type ControlledSkillEvalProtocolProvenance =
  | 'pre-candidate'
  | 'retrospective'
export type ControlledSkillEvalTaskId = `eval-task:${string}`

export interface ControlledSkillEvalStopContract {
  readonly maxToolCalls: number
  readonly maxElapsedMs: number
}

export interface ControlledSkillEvalTask {
  readonly taskId: ControlledSkillEvalTaskId
  readonly taskType: ControlledSkillEvalTaskType
  readonly goalDigest: Sha256Digest
  readonly inputDigest: Sha256Digest
  readonly workspaceSnapshotDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly authorizationDigest: Sha256Digest
  readonly verifierContractDigest: Sha256Digest
  readonly stopConditionDigest: Sha256Digest
  readonly evaluatorMaterialContractDigest: Sha256Digest
  readonly acceptanceContract: RunAcceptanceContract
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly allowedTools: readonly string[]
  readonly stopContract: ControlledSkillEvalStopContract
}

export interface ControlledSkillEvalExecution {
  readonly dshVersion: '0.1.0-rc.7' | '0.1.1-rc.2'
  readonly providerId: string
  readonly modelId: string
  readonly callConfigDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly retryPolicyDigest: Sha256Digest
}

export interface ControlledSkillEvalProtocolV2 {
  readonly rubricDigest: Sha256Digest
  readonly tasks: readonly ControlledSkillEvalTask[]
  readonly execution: ControlledSkillEvalExecution
}

export interface ControlledSkillExplicitFeedbackSourceIdentity {
  readonly signalId: string
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly sessionLifecycleFingerprint: Sha256Digest
  readonly sessionDigest: Sha256Digest
  readonly evidenceSetDigest: Sha256Digest
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly packetDigest: Sha256Digest
}

export interface ControlledSkillOutcomeSourceIdentity {
  readonly source: 'outcome'
  readonly signalId: string
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly outcomeIngestionId: Sha256Digest
  readonly sessionLifecycleFingerprint: Sha256Digest
  readonly sessionDigest: Sha256Digest
  readonly evidenceSetDigest: Sha256Digest
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly packetDigest: Sha256Digest
  readonly semanticReviewDigest: Sha256Digest
}

export type ControlledSkillSourceIdentity =
  | ControlledSkillExplicitFeedbackSourceIdentity
  | ControlledSkillOutcomeSourceIdentity

export interface ControlledSkillSourceFidelityHoldoutTask
  extends Omit<ControlledSkillEvalTask, 'taskId' | 'taskType'> {
  readonly taskId: `shadow-task:${string}`
}

export interface ControlledSkillSourceFidelityReviewContract {
  readonly rubricDigest: Sha256Digest
  readonly configurationDigest: Sha256Digest
  readonly materialContractDigest: Sha256Digest
  readonly evidenceContractDigest: Sha256Digest
}

export interface ControlledSkillSourceFidelityContract {
  readonly policyVersion: typeof CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.schemaVersion
    | typeof CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY.schemaVersion
  readonly policyDigest: Sha256Digest
  readonly packetVersion: typeof CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion
  readonly source: ControlledSkillSourceIdentity
  readonly holdout: {
    readonly task: ControlledSkillSourceFidelityHoldoutTask
    readonly review: ControlledSkillSourceFidelityReviewContract
  }
}

export interface ControlledSkillEvalProtocolV3 {
  readonly rubricDigest: Sha256Digest
  readonly tasks: readonly ControlledSkillEvalTask[]
  readonly execution: ControlledSkillEvalExecution
  readonly sourceFidelity: ControlledSkillSourceFidelityContract
}

export type ControlledSkillEvalProtocol =
  | ControlledSkillEvalProtocolV2
  | ControlledSkillEvalProtocolV3

export interface FreezeControlledSkillEvalProtocolInput {
  readonly ticketId: LearningTicketId
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly protocol: ControlledSkillEvalProtocol
}

export interface ControlledSkillEvalProtocolRecordV2 {
  readonly schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2'
  readonly protocolId: SkillEvalProtocolId
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly provenance: ControlledSkillEvalProtocolProvenance
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly protocol: ControlledSkillEvalProtocolV2
}

export interface ControlledSkillEvalProtocolRecordV3 {
  readonly schemaVersion: 'tianwen.controlled-skill-eval-protocol.v3'
  readonly protocolId: SkillEvalProtocolId
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly provenance: ControlledSkillEvalProtocolProvenance
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly protocol: ControlledSkillEvalProtocolV3
}

export type ControlledSkillEvalProtocolRecord =
  | ControlledSkillEvalProtocolRecordV2
  | ControlledSkillEvalProtocolRecordV3

export interface ControlledSkillEvalProtocolReceipt {
  readonly protocolId: SkillEvalProtocolId
  readonly provenance: ControlledSkillEvalProtocolProvenance
  readonly duplicate: boolean
}

export interface ControlledSkillEvalProtocolFrozenEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-eval-protocol.v2'
    | 'tianwen.controlled-skill-eval-protocol.v3'
  readonly type: 'controlled-skill-eval-protocol-frozen'
  readonly at: string
  readonly protocol: ControlledSkillEvalProtocolRecord
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillEvaluationId = `evaluation:${string}`

export interface ControlledSkillEvalSessionAllocation {
  readonly taskId: ControlledSkillEvalTaskId
  readonly baselineSessionId: string
  readonly candidateSessionId: string
  readonly evaluatorSessionId: string
}

export interface OpenControlledSkillEvaluationInput {
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly protocolId: SkillEvalProtocolId
  readonly sessionAllocations: readonly ControlledSkillEvalSessionAllocation[]
}

export interface ControlledSkillEvalPlanArm {
  readonly role: 'baseline' | 'candidate'
  readonly runId: TianwenRunId
  readonly sessionId: string
}

export interface ControlledSkillEvalTaskPlan extends ControlledSkillEvalTask {
  readonly baseline: ControlledSkillEvalPlanArm
  readonly candidate: ControlledSkillEvalPlanArm
  readonly evaluatorSessionId: string
}

interface ControlledSkillEvaluationPlanCommon {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly protocolId: SkillEvalProtocolId
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidatePayloadDigest: Sha256Digest
  readonly scopeKey: string
  readonly protocolProvenance: ControlledSkillEvalProtocolProvenance
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly execution: ControlledSkillEvalExecution
  readonly tasks: readonly ControlledSkillEvalTaskPlan[]
}

export interface ControlledSkillEvaluationPlanV2
  extends ControlledSkillEvaluationPlanCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2'
}

export interface ControlledSkillEvaluationPlanV3
  extends ControlledSkillEvaluationPlanCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v3'
  readonly sourceFidelity: ControlledSkillSourceFidelityContract
}

export type ControlledSkillEvaluationPlan =
  | ControlledSkillEvaluationPlanV2
  | ControlledSkillEvaluationPlanV3

export interface ControlledSkillEvaluationReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluationOpenedEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-evaluation-plan.v2'
    | 'tianwen.controlled-skill-evaluation-plan.v3'
  readonly type: 'controlled-skill-evaluation-opened'
  readonly at: string
  readonly plan: ControlledSkillEvaluationPlan
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillEvaluationComparison =
  | 'candidate-better'
  | 'baseline-better'
  | 'tie'
  | 'not-comparable'
export type ControlledSkillEvaluationCandidateHardGate =
  | 'pass'
  | 'rejected'
  | 'inconclusive'
export type ControlledSkillEvaluationObjectiveVerdict =
  | 'pass'
  | 'rejected'
  | 'inconclusive'

export interface ControlledSkillEvaluationUsage {
  readonly modelRequests: number
  readonly toolCalls: number
  readonly elapsedMs: number
}

export interface ControlledSkillEvaluationObjectiveArm {
  readonly role: ControlledSkillEvalPlanArm['role']
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly skillVersionId: SkillVersionId
  readonly contentDigest: Sha256Digest
  readonly executionManifestDigest: Sha256Digest
  readonly normalizedFirstRequestDigest: Sha256Digest
  readonly outcome: OutcomeVerdict
  readonly evidenceIds: readonly Sha256Digest[]
  readonly acceptanceSubjectDigest: Sha256Digest
  readonly evaluatorMaterialDigest: Sha256Digest
  readonly usedToolNames: readonly string[]
  readonly usage: ControlledSkillEvaluationUsage
}

export interface RecordControlledSkillEvaluationObjectiveInput {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly taskId: ControlledSkillEvalTaskId
  readonly baseline: ControlledSkillEvaluationObjectiveArm
  readonly candidate: ControlledSkillEvaluationObjectiveArm
}

export interface ControlledSkillEvaluationObjective
  extends RecordControlledSkillEvaluationObjectiveInput {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2'
  readonly comparison: ControlledSkillEvaluationComparison
  readonly candidateHardGate: ControlledSkillEvaluationCandidateHardGate
  readonly objectiveVerdict: ControlledSkillEvaluationObjectiveVerdict
}

export interface ControlledSkillEvaluationObjectiveReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly taskId: ControlledSkillEvalTaskId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluationObjectiveRecordedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2'
  readonly type: 'controlled-skill-evaluation-objective-recorded'
  readonly at: string
  readonly objective: ControlledSkillEvaluationObjective
  readonly inputDigest: Sha256Digest
}

export interface FreezeControlledSkillEvaluationBlindMapInput {
  readonly evaluationId: ControlledSkillEvaluationId
}

export interface ControlledSkillEvaluationBlindAssignment {
  readonly taskId: ControlledSkillEvalTaskId
  readonly xRole: ControlledSkillEvalPlanArm['role']
  readonly yRole: ControlledSkillEvalPlanArm['role']
  readonly evaluatorSessionId: string
  readonly envelopeDigest: Sha256Digest
}

interface ControlledSkillEvaluationBlindMapCommon {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly objectiveSetDigest: Sha256Digest
  readonly assignments: readonly ControlledSkillEvaluationBlindAssignment[]
}

export interface ControlledSkillEvaluationBlindMapV2
  extends ControlledSkillEvaluationBlindMapCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-blind-map.v2'
}

export interface ControlledSkillEvaluationBlindMapV3
  extends ControlledSkillEvaluationBlindMapCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-blind-map.v3'
}

export type ControlledSkillEvaluationBlindMap =
  | ControlledSkillEvaluationBlindMapV2
  | ControlledSkillEvaluationBlindMapV3

export interface ControlledSkillEvaluationBlindMapReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluationBlindMapFrozenEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-evaluation-blind-map.v2'
    | 'tianwen.controlled-skill-evaluation-blind-map.v3'
  readonly type: 'controlled-skill-evaluation-blind-map-frozen'
  readonly at: string
  readonly blindMap: ControlledSkillEvaluationBlindMap
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillEvaluationMechanismVerdict =
  | 'pass'
  | 'rejected'
  | 'inconclusive'
export type ControlledSkillEvaluationEvidenceClaim =
  | 'controlled-product'
  | 'controlled-synthetic-mechanism'
export type ControlledSkillEvaluationShadowEligibility =
  | 'eligible-for-project-shadow'
  | 'eligible-for-isolated-test-shadow'
  | 'ineligible'
export type ControlledSkillEvaluatorInconclusiveReasonCode =
  | 'material-missing'
  | 'identity-exposed'
  | 'objective-facts-incomplete'
  | 'provider-failed'
  | 'timeout'
  | 'score-not-submitted'
export type ControlledSkillEvaluationResultReasonCode =
  | 'candidate-objective-hard-gate-failed'
  | 'objective-inconclusive'
  | 'original-or-adjacent-not-improved'
  | ControlledSkillEvaluatorInconclusiveReasonCode
  | 'candidate-subjective-total-lower'
  | 'candidate-dimension-regression'
  | 'original-source-fidelity-not-improved'
  | 'paired-source-fidelity-regression'
  | 'all-gates-passed'

export interface ControlledSkillEvaluatorDimensionScoresV2 {
  readonly relevance: number
  readonly correctnessReasoning: number
  readonly clarityUsability: number
  readonly scopeRestraint: number
}

export interface ControlledSkillEvaluatorDimensionScoresV3
  extends ControlledSkillEvaluatorDimensionScoresV2 {
  readonly sourceFidelity: number
}

export type ControlledSkillEvaluatorDimensionScores =
  | ControlledSkillEvaluatorDimensionScoresV2
  | ControlledSkillEvaluatorDimensionScoresV3

export interface ControlledSkillEvaluatorScores {
  readonly x: ControlledSkillEvaluatorDimensionScores
  readonly y: ControlledSkillEvaluatorDimensionScores
}

interface ControlledSkillEvaluatorObservationCommon {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly taskId: ControlledSkillEvalTaskId
  readonly evaluatorSessionId: string
  readonly envelopeDigest: Sha256Digest
  readonly requestDigest: Sha256Digest
  readonly evidenceId: Sha256Digest
}

export type RecordControlledSkillEvaluatorObservationInput =
  | (ControlledSkillEvaluatorObservationCommon & {
      readonly status: 'scored'
      readonly insufficientMaterial: false
      readonly reasonCode: 'score-submitted'
      readonly scores: ControlledSkillEvaluatorScores
    })
  | (ControlledSkillEvaluatorObservationCommon & {
      readonly status: 'inconclusive'
      readonly insufficientMaterial: true
      readonly reasonCode: ControlledSkillEvaluatorInconclusiveReasonCode
    })

export type ControlledSkillEvaluatorObservation =
  RecordControlledSkillEvaluatorObservationInput & {
    readonly schemaVersion:
      | 'tianwen.controlled-skill-evaluator-observation.v2'
      | 'tianwen.controlled-skill-evaluator-observation.v3'
  }

export interface ControlledSkillEvaluatorObservationReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly taskId: ControlledSkillEvalTaskId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluatorObservationRecordedEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-evaluator-observation.v2'
    | 'tianwen.controlled-skill-evaluator-observation.v3'
  readonly type: 'controlled-skill-evaluator-observation-recorded'
  readonly at: string
  readonly observation: ControlledSkillEvaluatorObservation
  readonly inputDigest: Sha256Digest
}

export interface RecordControlledSkillEvaluationResultInput {
  readonly evaluationId: ControlledSkillEvaluationId
}

interface ControlledSkillEvaluationResultCommon {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly planDigest: Sha256Digest
  readonly objectiveSetDigest: Sha256Digest | null
  readonly blindMapDigest: Sha256Digest | null
  readonly evaluatorSetDigest: Sha256Digest | null
  readonly mechanismVerdict: ControlledSkillEvaluationMechanismVerdict
  readonly evidenceClaim: ControlledSkillEvaluationEvidenceClaim
  readonly naturalUserEvidence: 'not-claimed'
  readonly shadowEligibility: ControlledSkillEvaluationShadowEligibility
  readonly reasonCode: ControlledSkillEvaluationResultReasonCode
  readonly baselineTotal: number | null
  readonly candidateTotal: number | null
}

export interface ControlledSkillEvaluationResultV2
  extends ControlledSkillEvaluationResultCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-result.v2'
}

export interface ControlledSkillEvaluationResultV3
  extends ControlledSkillEvaluationResultCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-result.v3'
  readonly baselineSourceFidelityTotal: number | null
  readonly candidateSourceFidelityTotal: number | null
}

export type ControlledSkillEvaluationResult =
  | ControlledSkillEvaluationResultV2
  | ControlledSkillEvaluationResultV3

export interface ControlledSkillEvaluationResultReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluationResultRecordedEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-evaluation-result.v2'
    | 'tianwen.controlled-skill-evaluation-result.v3'
  readonly type: 'controlled-skill-evaluation-result-recorded'
  readonly at: string
  readonly result: ControlledSkillEvaluationResult
  readonly inputDigest: Sha256Digest
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const TICKET_ID = /^ticket:[a-zA-Z0-9._:-]+$/u
const TASK_ID = /^eval-task:[a-z0-9][a-z0-9._-]{0,96}$/u
const SAFE_EXECUTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u
const SAFE_TOOL_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u
const CANDIDATE_ID = /^candidate:[a-f0-9]{64}$/u
const SKILL_VERSION_ID = /^skill-version:[a-f0-9]{64}$/u
const EVALUATION_ID = /^evaluation:[a-f0-9]{64}$/u

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
  if (unexpected.length > 0) {
    throw new TypeError(`unexpected field: ${unexpected.join(', ')}`)
  }
  if (missing.length > 0) {
    throw new TypeError(`missing field: ${missing.join(', ')}`)
  }
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
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
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return Number(value)
}

function safeExecutionId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_EXECUTION_ID.test(value)) {
    throw new TypeError(`${label} must be a safe execution identifier`)
  }
  return value
}

function prepareAcceptanceContract(value: unknown): RunAcceptanceContract {
  if (!isRecord(value)) {
    throw new TypeError('acceptanceContract must be an object')
  }
  return prepareRunBinding({
    goalRef: 'goal:controlled-skill-evaluation-validation',
    taskRef: 'task:controlled-skill-evaluation-validation',
    sessionId: 'session:controlled-skill-evaluation-validation',
    scopeKey: 'evaluation:controlled-skill-evaluation-validation',
    acceptanceContract: value as unknown as RunAcceptanceContract,
  }).acceptanceContract
}

function prepareStopContract(value: unknown): ControlledSkillEvalStopContract {
  if (!isRecord(value)) throw new TypeError('task stopContract must be an object')
  exactKeys(value, ['maxToolCalls', 'maxElapsedMs'])
  return {
    maxToolCalls: boundedInteger(value.maxToolCalls, 'maxToolCalls', 1, 256),
    maxElapsedMs: boundedInteger(value.maxElapsedMs, 'maxElapsedMs', 1, 3_600_000),
  }
}

function prepareAllowedTools(value: unknown, acceptanceTool: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('allowed tools must be a non-empty array')
  }
  const tools = value.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('allowed tools must contain safe tool identifiers')
    }
    return item
  })
  if (new Set(tools).size !== tools.length || !tools.includes(acceptanceTool)) {
    throw new TypeError('allowed tools must be unique and include the verifier tool')
  }
  return [...tools].sort((left, right) => left.localeCompare(right))
}

function prepareTask(value: unknown): ControlledSkillEvalTask {
  if (!isRecord(value)) throw new TypeError('controlled evaluation task must be an object')
  exactKeys(value, [
    'taskId',
    'taskType',
    'goalDigest',
    'inputDigest',
    'workspaceSnapshotDigest',
    'toolSchemaDigest',
    'authorizationDigest',
    'verifierContractDigest',
    'stopConditionDigest',
    'evaluatorMaterialContractDigest',
    'acceptanceContract',
    'acceptanceSubjectDigest',
    'allowedTools',
    'stopContract',
  ])
  if (typeof value.taskId !== 'string' || !TASK_ID.test(value.taskId)) {
    throw new TypeError('taskId must be a safe controlled evaluation task ID')
  }
  if (!(CONTROLLED_SKILL_EVAL_TASK_TYPES as readonly unknown[]).includes(value.taskType)) {
    throw new TypeError('taskType is not a controlled evaluation task type')
  }
  const acceptanceContract = prepareAcceptanceContract(value.acceptanceContract)
  return {
    taskId: value.taskId as ControlledSkillEvalTaskId,
    taskType: value.taskType as ControlledSkillEvalTaskType,
    goalDigest: digest(value.goalDigest, 'goalDigest'),
    inputDigest: digest(value.inputDigest, 'inputDigest'),
    workspaceSnapshotDigest: digest(value.workspaceSnapshotDigest, 'workspaceSnapshotDigest'),
    toolSchemaDigest: digest(value.toolSchemaDigest, 'toolSchemaDigest'),
    authorizationDigest: digest(value.authorizationDigest, 'authorizationDigest'),
    verifierContractDigest: digest(value.verifierContractDigest, 'verifierContractDigest'),
    stopConditionDigest: digest(value.stopConditionDigest, 'stopConditionDigest'),
    evaluatorMaterialContractDigest: digest(
      value.evaluatorMaterialContractDigest,
      'evaluatorMaterialContractDigest',
    ),
    acceptanceContract,
    acceptanceSubjectDigest: digest(value.acceptanceSubjectDigest, 'acceptanceSubjectDigest'),
    allowedTools: prepareAllowedTools(value.allowedTools, acceptanceContract.toolName),
    stopContract: prepareStopContract(value.stopContract),
  }
}

function nonEmptyString(value: unknown, label: string, maximum = 256): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) throw new TypeError(`${label} is invalid`)
  return value
}

function prepareHoldoutTask(value: unknown): ControlledSkillSourceFidelityHoldoutTask {
  if (!isRecord(value)) throw new TypeError('source-fidelity holdout task must be an object')
  const { taskId, ...task } = value
  if (typeof taskId !== 'string' || !/^shadow-task:[a-z0-9][a-z0-9._-]{0,96}$/u.test(taskId)) {
    throw new TypeError('source-fidelity holdout taskId is invalid')
  }
  const prepared = prepareTask({
    ...task,
    taskId: 'eval-task:source-fidelity-holdout',
    taskType: 'original-problem',
  })
  const { taskType: _taskType, taskId: _taskId, ...fields } = prepared
  return { taskId: taskId as `shadow-task:${string}`, ...fields }
}

function prepareSourceIdentity(value: unknown): ControlledSkillSourceIdentity {
  if (!isRecord(value)) throw new TypeError('source-fidelity source identity must be an object')
  if (value.source === 'outcome') {
    exactKeys(value, [
      'source',
      'signalId',
      'runId',
      'sessionId',
      'outcomeIngestionId',
      'sessionLifecycleFingerprint',
      'sessionDigest',
      'evidenceSetDigest',
      'acceptanceSubjectDigest',
      'packetDigest',
      'semanticReviewDigest',
    ])
    if (typeof value.runId !== 'string' || !/^run:[a-f0-9]{64}$/u.test(value.runId)) {
      throw new TypeError('source runId is invalid')
    }
    return {
      source: 'outcome',
      signalId: nonEmptyString(value.signalId, 'source signalId'),
      runId: value.runId as TianwenRunId,
      sessionId: safeSessionId(value.sessionId),
      outcomeIngestionId: digest(value.outcomeIngestionId, 'source outcomeIngestionId'),
      sessionLifecycleFingerprint: digest(value.sessionLifecycleFingerprint, 'source sessionLifecycleFingerprint'),
      sessionDigest: digest(value.sessionDigest, 'source sessionDigest'),
      evidenceSetDigest: digest(value.evidenceSetDigest, 'source evidenceSetDigest'),
      acceptanceSubjectDigest: digest(value.acceptanceSubjectDigest, 'source acceptanceSubjectDigest'),
      packetDigest: digest(value.packetDigest, 'source packetDigest'),
      semanticReviewDigest: digest(value.semanticReviewDigest, 'source semanticReviewDigest'),
    }
  }
  exactKeys(value, [
    'signalId',
    'sessionId',
    'messageId',
    'feedbackVersion',
    'sessionLifecycleFingerprint',
    'sessionDigest',
    'evidenceSetDigest',
    'acceptanceSubjectDigest',
    'packetDigest',
  ])
  return {
    signalId: nonEmptyString(value.signalId, 'source signalId'),
    sessionId: safeSessionId(value.sessionId),
    messageId: nonEmptyString(value.messageId, 'source messageId'),
    feedbackVersion: nonEmptyString(value.feedbackVersion, 'source feedbackVersion'),
    sessionLifecycleFingerprint: digest(
      value.sessionLifecycleFingerprint,
      'source sessionLifecycleFingerprint',
    ),
    sessionDigest: digest(value.sessionDigest, 'source sessionDigest'),
    evidenceSetDigest: digest(value.evidenceSetDigest, 'source evidenceSetDigest'),
    acceptanceSubjectDigest: digest(
      value.acceptanceSubjectDigest,
      'source acceptanceSubjectDigest',
    ),
    packetDigest: digest(value.packetDigest, 'source packetDigest'),
  }
}

function prepareSourceFidelityContract(
  value: unknown,
): ControlledSkillSourceFidelityContract {
  if (!isRecord(value)) throw new TypeError('source-fidelity contract must be an object')
  exactKeys(value, [
    'policyVersion',
    'policyDigest',
    'packetVersion',
    'source',
    'holdout',
  ])
  if (
    value.packetVersion !== CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion
    || !isRecord(value.holdout)
  ) throw new TypeError('source-fidelity policy identity is invalid')
  exactKeys(value.holdout, ['task', 'review'])
  if (!isRecord(value.holdout.review)) {
    throw new TypeError('source-fidelity holdout review contract must be an object')
  }
  exactKeys(value.holdout.review, [
    'rubricDigest',
    'configurationDigest',
    'materialContractDigest',
    'evidenceContractDigest',
  ])
  const family = resolveControlledSkillSourceFidelityFamily(
    digest(value.holdout.review.rubricDigest, 'source-fidelity holdout rubricDigest'),
  )
  if (family === undefined
    || value.policyVersion !== family.policy.schemaVersion
    || value.policyDigest !== family.policyDigest) {
    throw new TypeError('source-fidelity holdout review rubric is invalid')
  }
  return {
    policyVersion: family.policy.schemaVersion,
    policyDigest: family.policyDigest,
    packetVersion: family.policy.packetVersion,
    source: prepareSourceIdentity(value.source),
    holdout: {
      task: prepareHoldoutTask(value.holdout.task),
      review: {
        rubricDigest: family.rubricDigest,
        configurationDigest: digest(
          value.holdout.review.configurationDigest,
          'source-fidelity review configurationDigest',
        ),
        materialContractDigest: digest(
          value.holdout.review.materialContractDigest,
          'source-fidelity review materialContractDigest',
        ),
        evidenceContractDigest: digest(
          value.holdout.review.evidenceContractDigest,
          'source-fidelity review evidenceContractDigest',
        ),
      },
    },
  }
}

function prepareExecution(value: unknown): ControlledSkillEvalExecution {
  if (!isRecord(value)) throw new TypeError('controlled evaluation execution must be an object')
  exactKeys(value, [
    'dshVersion',
    'providerId',
    'modelId',
    'callConfigDigest',
    'toolSchemaDigest',
    'retryPolicyDigest',
  ])
  if (value.dshVersion !== '0.1.0-rc.7' && value.dshVersion !== '0.1.1-rc.2') {
    throw new TypeError('controlled evaluation DSH version is unsupported')
  }
  return {
    dshVersion: value.dshVersion,
    providerId: safeExecutionId(value.providerId, 'providerId'),
    modelId: safeExecutionId(value.modelId, 'modelId'),
    callConfigDigest: digest(value.callConfigDigest, 'callConfigDigest'),
    toolSchemaDigest: digest(value.toolSchemaDigest, 'toolSchemaDigest'),
    retryPolicyDigest: digest(value.retryPolicyDigest, 'retryPolicyDigest'),
  }
}

function prepareProtocol(value: unknown): ControlledSkillEvalProtocol {
  if (!isRecord(value)) throw new TypeError('controlled evaluation protocol must be an object')
  const sourceFidelity = 'sourceFidelity' in value
  exactKeys(value, [
    'rubricDigest',
    'tasks',
    'execution',
    ...(sourceFidelity ? ['sourceFidelity'] : []),
  ])
  const expectedRubric = sourceFidelity
    ? resolveControlledSkillSourceFidelityFamily(digest(value.rubricDigest, 'rubricDigest'))?.rubricDigest
    : CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST
  if (expectedRubric === undefined || value.rubricDigest !== expectedRubric) {
    throw new TypeError('controlled evaluation rubric is not the frozen rubric')
  }
  if (!Array.isArray(value.tasks) || value.tasks.length !== CONTROLLED_SKILL_EVAL_TASK_TYPES.length) {
    throw new TypeError('controlled evaluation protocol requires exactly five tasks')
  }
  const tasks = value.tasks.map(prepareTask)
  if (
    new Set(tasks.map(task => task.taskId)).size !== tasks.length
    || tasks.map(task => task.taskType).join(',') !== CONTROLLED_SKILL_EVAL_TASK_TYPES.join(',')
  ) {
    throw new TypeError('controlled evaluation five tasks must cover each task type once in order')
  }
  const common = {
    rubricDigest: expectedRubric,
    tasks,
    execution: prepareExecution(value.execution),
  }
  if (!sourceFidelity) return common
  const contract = prepareSourceFidelityContract(value.sourceFidelity)
  if (
    contract.holdout.review.rubricDigest !== expectedRubric
    || tasks[0]!.inputDigest !== contract.source.packetDigest
    || tasks[0]!.acceptanceSubjectDigest !== contract.source.acceptanceSubjectDigest
    || tasks.some(task => task.inputDigest === contract.holdout.task.inputDigest)
    || tasks.some(task =>
      task.workspaceSnapshotDigest === contract.holdout.task.workspaceSnapshotDigest)
    || tasks.some(task =>
      task.evaluatorMaterialContractDigest
        === contract.holdout.task.evaluatorMaterialContractDigest)
  ) throw new TypeError('source-fidelity source or holdout material is not independently frozen')
  return { ...common, sourceFidelity: contract }
}

export interface ControlledSkillEvalScopeFact {
  readonly signalId: string
  readonly scopeKey: string
  readonly sessionId?: string
  readonly messageId?: string
  readonly feedbackVersion?: string
  readonly sessionLifecycleFingerprint?: Sha256Digest
  readonly sessionDigest?: Sha256Digest
  readonly evidenceSetDigest?: Sha256Digest
  readonly acceptanceSubjectDigest?: Sha256Digest
  readonly source?: 'outcome'
  readonly runId?: TianwenRunId
  readonly outcomeIngestionId?: Sha256Digest
  readonly semanticReviewDigest?: Sha256Digest
  readonly selectedOutcomeSource?: true
}

function deriveScope(
  ticket: LearningTicket,
  signals: readonly ControlledSkillEvalScopeFact[],
): string {
  const byId = new Map(signals.map(signal => [signal.signalId, signal]))
  const selected = ticket.signalIds.map(signalId => byId.get(signalId))
  if (selected.length === 0 || selected.some(signal => signal === undefined)) {
    throw new TypeError('controlled evaluation protocol requires all Ticket Outcome signals')
  }
  const scopeKey = selected[0]!.scopeKey
  if (
    typeof scopeKey !== 'string'
    || scopeKey.trim().length === 0
    || scopeKey.length > 240
    || selected.some(signal => signal!.scopeKey !== scopeKey)
  ) {
    throw new TypeError('controlled evaluation Ticket signals disagree on scope')
  }
  return scopeKey
}

function evidenceLabels(
  purpose: ControlledSkillEvalEvidencePurpose,
): readonly ControlledSkillEvalEvidenceLabel[] {
  return purpose === 'development-only-synthetic-defect'
    ? ['development-only', 'synthetic-defect']
    : []
}

function prepareRecord(
  ticketId: unknown,
  scopeKey: unknown,
  provenance: unknown,
  purpose: unknown,
  protocolValue: unknown,
): ControlledSkillEvalProtocolRecord {
  if (typeof ticketId !== 'string' || !TICKET_ID.test(ticketId)) {
    throw new TypeError('ticketId must be a Learning Ticket ID')
  }
  if (
    typeof scopeKey !== 'string'
    || scopeKey.trim().length === 0
    || scopeKey.length > 240
  ) {
    throw new TypeError('controlled evaluation scopeKey is invalid')
  }
  if (
    purpose !== 'controlled-product'
    && purpose !== 'development-only-synthetic-defect'
  ) {
    throw new TypeError('controlled evaluation evidence purpose is invalid')
  }
  if (provenance !== 'pre-candidate' && provenance !== 'retrospective') {
    throw new TypeError('controlled evaluation protocol provenance is invalid')
  }
  const protocol = prepareProtocol(protocolValue)
  const labels = evidenceLabels(purpose)
  const identity = sha256({
    ticketId,
    scopeKey,
    evidencePurpose: purpose,
    evidenceLabels: labels,
    protocol,
  })
  const common: Omit<ControlledSkillEvalProtocolRecordV2, 'schemaVersion' | 'protocol'> = {
    protocolId: `eval-protocol:${identity.slice('sha256:'.length)}`,
    ticketId: ticketId as LearningTicketId,
    scopeKey,
    provenance,
    evidencePurpose: purpose,
    evidenceLabels: labels,
  }
  return 'sourceFidelity' in protocol
    ? {
        schemaVersion: 'tianwen.controlled-skill-eval-protocol.v3',
        ...common,
        protocol,
      }
    : {
        schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
        ...common,
        protocol,
      }
}

function assertSourceIdentity(
  protocol: ControlledSkillEvalProtocol,
  signals: readonly ControlledSkillEvalScopeFact[],
): void {
  if (!('sourceFidelity' in protocol)) return
  const source = protocol.sourceFidelity.source
  const fact = signals.find(signal => signal.signalId === source.signalId)
  if ('source' in source) {
    if (
      fact === undefined
      || fact.source !== 'outcome'
      || fact.selectedOutcomeSource !== true
      || fact.runId !== source.runId
      || fact.sessionId !== source.sessionId
      || fact.outcomeIngestionId !== source.outcomeIngestionId
      || fact.sessionLifecycleFingerprint !== source.sessionLifecycleFingerprint
      || fact.sessionDigest !== source.sessionDigest
      || fact.evidenceSetDigest !== source.evidenceSetDigest
      || fact.acceptanceSubjectDigest !== source.acceptanceSubjectDigest
      || fact.semanticReviewDigest !== source.semanticReviewDigest
    ) throw new TypeError('source-fidelity source identity disagrees with Ticket history')
    return
  }
  if (
    fact === undefined
    || fact.sessionId !== source.sessionId
    || fact.messageId !== source.messageId
    || fact.feedbackVersion !== source.feedbackVersion
    || fact.sessionLifecycleFingerprint !== source.sessionLifecycleFingerprint
    || fact.sessionDigest !== source.sessionDigest
    || fact.evidenceSetDigest !== source.evidenceSetDigest
    || fact.acceptanceSubjectDigest !== source.acceptanceSubjectDigest
  ) throw new TypeError('source-fidelity source identity disagrees with Ticket history')
}

export function prepareControlledSkillEvalProtocol(
  input: FreezeControlledSkillEvalProtocolInput,
  ticket: LearningTicket,
  signals: readonly ControlledSkillEvalScopeFact[],
  provenance: ControlledSkillEvalProtocolProvenance,
): ControlledSkillEvalProtocolRecord {
  if (!isRecord(input)) throw new TypeError('controlled evaluation protocol input must be an object')
  exactKeys(input, ['ticketId', 'evidencePurpose', 'protocol'])
  if (input.ticketId !== ticket.ticketId) {
    throw new TypeError('controlled evaluation protocol references another Ticket')
  }
  const scopeKey = deriveScope(ticket, signals)
  const protocol = prepareProtocol(input.protocol)
  if ('sourceFidelity' in protocol && provenance !== 'pre-candidate') {
    throw new TypeError('source-fidelity protocol must be frozen before Candidate creation')
  }
  assertSourceIdentity(protocol, signals)
  return prepareRecord(
    input.ticketId,
    scopeKey,
    provenance,
    input.evidencePurpose,
    protocol,
  )
}

export function parseControlledSkillEvalProtocol(
  value: unknown,
): ControlledSkillEvalProtocolRecord {
  if (!isRecord(value)) throw new TypeError('controlled evaluation protocol record must be an object')
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'ticketId',
    'scopeKey',
    'provenance',
    'evidencePurpose',
    'evidenceLabels',
    'protocol',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-eval-protocol.v2'
    && value.schemaVersion !== 'tianwen.controlled-skill-eval-protocol.v3'
  ) {
    throw new TypeError('controlled evaluation protocol has an invalid schema version')
  }
  const prepared = prepareRecord(
    value.ticketId,
    value.scopeKey,
    value.provenance,
    value.evidencePurpose,
    value.protocol,
  )
  if (
    prepared.schemaVersion !== value.schemaVersion
    || canonicalJson(prepared) !== canonicalJson(value)
  ) {
    throw new TypeError('controlled evaluation protocol identity or labels are not canonical')
  }
  return prepared
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
  ) {
    throw new TypeError('controlled evaluation sessionId is invalid')
  }
  return value
}

function preparePlanArm(
  role: ControlledSkillEvalPlanArm['role'],
  task: ControlledSkillEvalTask,
  protocolId: SkillEvalProtocolId,
  scopeKey: string,
  sessionValue: unknown,
  runIds: Set<string>,
  sessionIds: Set<string>,
): ControlledSkillEvalPlanArm {
  const sessionId = safeSessionId(sessionValue)
  const binding = prepareRunBinding({
    goalRef: `goal:controlled-skill-evaluation:${protocolId}`,
    taskRef: `task:${task.taskId}:${role}`,
    sessionId,
    scopeKey,
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
  })
  if (!runIds.add(binding.runId) || !sessionIds.add(sessionId)) {
    throw new TypeError('controlled evaluation requires distinct Runs and Sessions')
  }
  return { role, runId: binding.runId, sessionId }
}

function preparePlanTasks(
  value: unknown,
  protocol: ControlledSkillEvalProtocol,
  protocolId: SkillEvalProtocolId,
  scopeKey: string,
): readonly ControlledSkillEvalTaskPlan[] {
  if (!Array.isArray(value) || value.length !== protocol.tasks.length) {
    throw new TypeError('controlled evaluation Session allocations must cover the frozen five tasks')
  }
  const runIds = new Set<string>()
  const sessionIds = new Set<string>()
  const tasks = value.map((row, index) => {
    if (!isRecord(row)) throw new TypeError('controlled evaluation Session allocation must be an object')
    exactKeys(row, [
      'taskId',
      'baselineSessionId',
      'candidateSessionId',
      'evaluatorSessionId',
    ])
    const task = protocol.tasks[index]!
    if (row.taskId !== task.taskId) {
      throw new TypeError('controlled evaluation Session allocations disagree with the frozen task order')
    }
    const baseline = preparePlanArm(
      'baseline',
      task,
      protocolId,
      scopeKey,
      row.baselineSessionId,
      runIds,
      sessionIds,
    )
    const candidate = preparePlanArm(
      'candidate',
      task,
      protocolId,
      scopeKey,
      row.candidateSessionId,
      runIds,
      sessionIds,
    )
    const evaluatorSessionId = safeSessionId(row.evaluatorSessionId)
    if (sessionIds.has(evaluatorSessionId)) {
      throw new TypeError('controlled evaluation requires distinct execution and evaluator Sessions')
    }
    return {
      ...structuredClone(task),
      baseline,
      candidate,
      evaluatorSessionId,
    }
  })
  const evaluatorSessionIds = tasks.map(task => task.evaluatorSessionId)
  const distinctEvaluatorSessionIds = new Set(evaluatorSessionIds)
  if ([...distinctEvaluatorSessionIds].some(sessionId => sessionIds.has(sessionId))
    || (distinctEvaluatorSessionIds.size !== 1
      && distinctEvaluatorSessionIds.size !== tasks.length)) {
    throw new TypeError('controlled evaluation evaluator Sessions must be shared or task-distinct')
  }
  return tasks
}

function preparePlanRecord(input: {
  readonly protocolId: unknown
  readonly candidateId: unknown
  readonly parentVersionId: unknown
  readonly parentPayloadDigest: unknown
  readonly candidatePayloadDigest: unknown
  readonly scopeKey: unknown
  readonly protocolProvenance: unknown
  readonly evidencePurpose: unknown
  readonly evidenceLabels: unknown
  readonly protocol: ControlledSkillEvalProtocol
  readonly sessionAllocations: unknown
}): ControlledSkillEvaluationPlan {
  if (typeof input.protocolId !== 'string' || !/^eval-protocol:[a-f0-9]{64}$/u.test(input.protocolId)) {
    throw new TypeError('controlled evaluation protocolId is invalid')
  }
  if (typeof input.candidateId !== 'string' || !CANDIDATE_ID.test(input.candidateId)) {
    throw new TypeError('controlled evaluation candidateId is invalid')
  }
  if (typeof input.parentVersionId !== 'string' || !SKILL_VERSION_ID.test(input.parentVersionId)) {
    throw new TypeError('controlled evaluation parentVersionId is invalid')
  }
  if (typeof input.parentPayloadDigest !== 'string' || !SHA256_DIGEST.test(input.parentPayloadDigest)) {
    throw new TypeError('controlled evaluation parent payload digest is invalid')
  }
  if (typeof input.candidatePayloadDigest !== 'string' || !SHA256_DIGEST.test(input.candidatePayloadDigest)) {
    throw new TypeError('controlled evaluation Candidate payload digest is invalid')
  }
  if (
    typeof input.scopeKey !== 'string'
    || input.scopeKey.trim().length === 0
    || input.scopeKey.length > 240
  ) {
    throw new TypeError('controlled evaluation scopeKey is invalid')
  }
  if (input.protocolProvenance !== 'pre-candidate' && input.protocolProvenance !== 'retrospective') {
    throw new TypeError('controlled evaluation protocol provenance is invalid')
  }
  if (
    input.evidencePurpose !== 'controlled-product'
    && input.evidencePurpose !== 'development-only-synthetic-defect'
  ) {
    throw new TypeError('controlled evaluation evidence purpose is invalid')
  }
  const labels = evidenceLabels(input.evidencePurpose)
  if (canonicalJson(input.evidenceLabels) !== canonicalJson(labels)) {
    throw new TypeError('controlled evaluation evidence labels are not canonical')
  }
  const protocol = prepareProtocol(input.protocol)
  const tasks = preparePlanTasks(
    input.sessionAllocations,
    protocol,
    input.protocolId as SkillEvalProtocolId,
    input.scopeKey,
  )
  const common = {
    protocolId: input.protocolId as SkillEvalProtocolId,
    candidateId: input.candidateId as GovernedSkillCandidate['candidateId'],
    parentVersionId: input.parentVersionId as SkillVersionId,
    parentPayloadDigest: input.parentPayloadDigest as Sha256Digest,
    candidatePayloadDigest: input.candidatePayloadDigest as Sha256Digest,
    scopeKey: input.scopeKey,
    protocolProvenance: input.protocolProvenance,
    evidencePurpose: input.evidencePurpose,
    evidenceLabels: labels,
    execution: protocol.execution,
    tasks,
  } as const
  if ('sourceFidelity' in protocol) {
    const body = { ...common, sourceFidelity: protocol.sourceFidelity }
    const identity = sha256(body)
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v3',
      evaluationId: `evaluation:${identity.slice('sha256:'.length)}`,
      ...body,
    }
  }
  const identity = sha256(common)
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2',
    evaluationId: `evaluation:${identity.slice('sha256:'.length)}`,
    ...common,
  }
}

export function prepareControlledSkillEvaluationPlan(
  input: OpenControlledSkillEvaluationInput,
  candidate: GovernedSkillCandidate,
  learningCase: LearningCase,
  protocolRecord: ControlledSkillEvalProtocolRecord,
  parentPayloadDigest: Sha256Digest,
): ControlledSkillEvaluationPlan {
  if (!isRecord(input)) throw new TypeError('controlled evaluation input must be an object')
  exactKeys(input, ['candidateId', 'protocolId', 'sessionAllocations'])
  if (protocolRecord.provenance !== 'pre-candidate') {
    throw new TypeError('controlled evaluation requires a pre-candidate protocol')
  }
  if (
    input.candidateId !== candidate.candidateId
    || input.protocolId !== protocolRecord.protocolId
    || candidate.ticketId !== protocolRecord.ticketId
    || candidate.caseId !== learningCase.caseId
    || candidate.parentVersionId !== learningCase.parentVersionId
    || candidate.targetScope !== learningCase.scopeKey
    || protocolRecord.scopeKey !== learningCase.scopeKey
  ) {
    throw new TypeError('controlled evaluation Candidate chain disagrees with its protocol')
  }
  return preparePlanRecord({
    protocolId: protocolRecord.protocolId,
    candidateId: candidate.candidateId,
    parentVersionId: candidate.parentVersionId,
    parentPayloadDigest,
    candidatePayloadDigest: candidate.payloadDigest,
    scopeKey: learningCase.scopeKey,
    protocolProvenance: protocolRecord.provenance,
    evidencePurpose: protocolRecord.evidencePurpose,
    evidenceLabels: protocolRecord.evidenceLabels,
    protocol: protocolRecord.protocol,
    sessionAllocations: input.sessionAllocations,
  })
}

export function parseControlledSkillEvaluationPlan(
  value: unknown,
): ControlledSkillEvaluationPlan {
  if (!isRecord(value)) throw new TypeError('controlled evaluation plan must be an object')
  const isV3 = value.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
  exactKeys(value, [
    'schemaVersion',
    'evaluationId',
    'protocolId',
    'candidateId',
    'parentVersionId',
    'parentPayloadDigest',
    'candidatePayloadDigest',
    'scopeKey',
    'protocolProvenance',
    'evidencePurpose',
    'evidenceLabels',
    'execution',
    'tasks',
    ...(isV3 ? ['sourceFidelity'] : []),
  ])
  if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-plan.v2' && !isV3) {
    throw new TypeError('controlled evaluation plan has an invalid schema version')
  }
  if (typeof value.evaluationId !== 'string' || !EVALUATION_ID.test(value.evaluationId)) {
    throw new TypeError('controlled evaluation plan has an invalid identity')
  }
  if (!Array.isArray(value.tasks)) throw new TypeError('controlled evaluation plan tasks must be an array')
  const protocol = prepareProtocol({
    rubricDigest: isV3
      ? prepareSourceFidelityContract(value.sourceFidelity).holdout.review.rubricDigest
      : CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: value.tasks.map(task => {
      if (!isRecord(task)) throw new TypeError('controlled evaluation plan task must be an object')
      const copy = { ...task }
      delete copy.baseline
      delete copy.candidate
      delete copy.evaluatorSessionId
      return copy
    }),
    execution: value.execution,
    ...(isV3 ? { sourceFidelity: value.sourceFidelity } : {}),
  })
  const prepared = preparePlanRecord({
    protocolId: value.protocolId,
    candidateId: value.candidateId,
    parentVersionId: value.parentVersionId,
    parentPayloadDigest: value.parentPayloadDigest,
    candidatePayloadDigest: value.candidatePayloadDigest,
    scopeKey: value.scopeKey,
    protocolProvenance: value.protocolProvenance,
    evidencePurpose: value.evidencePurpose,
    evidenceLabels: value.evidenceLabels,
    protocol,
    sessionAllocations: value.tasks.map(task => {
      const item = task as Readonly<Record<string, unknown>>
      return {
        taskId: item.taskId,
        baselineSessionId: isRecord(item.baseline)
          ? item.baseline.sessionId
          : item.baseline,
        candidateSessionId: isRecord(item.candidate)
          ? item.candidate.sessionId
          : item.candidate,
        evaluatorSessionId: item.evaluatorSessionId,
      }
    }),
  })
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled evaluation plan identity or fields are not canonical')
  }
  return prepared
}

function prepareObjectiveUsage(value: unknown): ControlledSkillEvaluationUsage {
  if (!isRecord(value)) throw new TypeError('controlled evaluation usage must be an object')
  exactKeys(value, ['modelRequests', 'toolCalls', 'elapsedMs'])
  return {
    modelRequests: boundedInteger(
      value.modelRequests,
      'modelRequests',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    toolCalls: boundedInteger(value.toolCalls, 'toolCalls', 0, Number.MAX_SAFE_INTEGER),
    elapsedMs: boundedInteger(value.elapsedMs, 'elapsedMs', 0, Number.MAX_SAFE_INTEGER),
  }
}

function prepareUsedToolNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new TypeError('controlled evaluation usedToolNames must be an array')
  }
  const tools = value.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('controlled evaluation usedToolNames are invalid')
    }
    return item
  })
  const canonical = [...new Set(tools)].sort((left, right) => left.localeCompare(right))
  if (canonicalJson(tools) !== canonicalJson(canonical)) {
    throw new TypeError('controlled evaluation usedToolNames must be sorted and unique')
  }
  return canonical
}

function objectiveExecutionManifestDigest(
  plan: ControlledSkillEvaluationPlan,
  task: ControlledSkillEvalTaskPlan,
): Sha256Digest {
  return sha256({
    execution: plan.execution,
    goalDigest: task.goalDigest,
    inputDigest: task.inputDigest,
    workspaceSnapshotDigest: task.workspaceSnapshotDigest,
    toolSchemaDigest: task.toolSchemaDigest,
    authorizationDigest: task.authorizationDigest,
    verifierContractDigest: task.verifierContractDigest,
    stopConditionDigest: task.stopConditionDigest,
    evaluatorMaterialContractDigest: task.evaluatorMaterialContractDigest,
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    allowedTools: task.allowedTools,
    stopContract: task.stopContract,
  })
}

function prepareObjectiveArm(
  value: unknown,
  role: ControlledSkillEvalPlanArm['role'],
  plan?: ControlledSkillEvalPlanArm,
  evaluationPlan?: ControlledSkillEvaluationPlan,
  task?: ControlledSkillEvalTaskPlan,
): ControlledSkillEvaluationObjectiveArm {
  if (!isRecord(value)) throw new TypeError('controlled evaluation objective arm must be an object')
  exactKeys(value, [
    'role',
    'runId',
    'sessionId',
    'skillVersionId',
    'contentDigest',
    'executionManifestDigest',
    'normalizedFirstRequestDigest',
    'outcome',
    'evidenceIds',
    'acceptanceSubjectDigest',
    'evaluatorMaterialDigest',
    'usedToolNames',
    'usage',
  ])
  if (
    value.role !== role
    || typeof value.runId !== 'string'
    || !/^run:[a-f0-9]{64}$/u.test(value.runId)
    || typeof value.skillVersionId !== 'string'
    || !SKILL_VERSION_ID.test(value.skillVersionId)
    || (value.outcome !== 'met'
      && value.outcome !== 'not-met'
      && value.outcome !== 'inconclusive')
    || !Array.isArray(value.evidenceIds)
  ) {
    throw new TypeError('controlled evaluation objective arm is invalid')
  }
  const sessionId = safeSessionId(value.sessionId)
  if (
    plan !== undefined
    && (value.runId !== plan.runId || sessionId !== plan.sessionId || role !== plan.role)
  ) {
    throw new TypeError('controlled evaluation objective arm disagrees with its plan')
  }
  const usage = prepareObjectiveUsage(value.usage)
  const usedToolNames = prepareUsedToolNames(value.usedToolNames)
  const executionManifestDigest = digest(
    value.executionManifestDigest,
    'executionManifestDigest',
  )
  const acceptanceSubjectDigest = digest(
    value.acceptanceSubjectDigest,
    'acceptanceSubjectDigest',
  )
  if (task !== undefined && evaluationPlan !== undefined) {
    if (
      executionManifestDigest !== objectiveExecutionManifestDigest(evaluationPlan, task)
      || acceptanceSubjectDigest !== task.acceptanceSubjectDigest
      || usedToolNames.some(tool => !task.allowedTools.includes(tool))
      || !usedToolNames.includes('skill')
      || !usedToolNames.includes(task.acceptanceContract.toolName)
      || usage.toolCalls > task.stopContract.maxToolCalls
      || usage.elapsedMs > task.stopContract.maxElapsedMs
    ) {
      throw new TypeError('controlled evaluation objective arm violates its frozen task')
    }
  }
  return {
    role,
    runId: value.runId as TianwenRunId,
    sessionId,
    skillVersionId: value.skillVersionId as SkillVersionId,
    contentDigest: digest(value.contentDigest, 'contentDigest'),
    executionManifestDigest,
    normalizedFirstRequestDigest: digest(
      value.normalizedFirstRequestDigest,
      'normalizedFirstRequestDigest',
    ),
    outcome: value.outcome,
    evidenceIds: value.evidenceIds.map(item => digest(item, 'evidenceId')),
    acceptanceSubjectDigest,
    evaluatorMaterialDigest: digest(
      value.evaluatorMaterialDigest,
      'evaluatorMaterialDigest',
    ),
    usedToolNames,
    usage,
  }
}

function reduceObjectiveOutcomes(
  baseline: ControlledSkillEvaluationObjectiveArm,
  candidate: ControlledSkillEvaluationObjectiveArm,
): Pick<
  ControlledSkillEvaluationObjective,
  'comparison' | 'candidateHardGate' | 'objectiveVerdict'
> {
  const inconclusive = baseline.outcome === 'inconclusive'
    || candidate.outcome === 'inconclusive'
  const comparison: ControlledSkillEvaluationComparison = inconclusive
    ? 'not-comparable'
    : baseline.outcome === candidate.outcome
      ? 'tie'
      : baseline.outcome === 'not-met'
        ? 'candidate-better'
        : 'baseline-better'
  const candidateHardGate: ControlledSkillEvaluationCandidateHardGate =
    candidate.outcome === 'met'
      ? 'pass'
      : candidate.outcome === 'not-met'
        ? 'rejected'
        : 'inconclusive'
  const objectiveVerdict: ControlledSkillEvaluationObjectiveVerdict =
    candidate.outcome === 'not-met'
      ? 'rejected'
      : inconclusive
        ? 'inconclusive'
        : 'pass'
  return { comparison, candidateHardGate, objectiveVerdict }
}

export function prepareControlledSkillEvaluationObjective(
  input: RecordControlledSkillEvaluationObjectiveInput,
  plan: ControlledSkillEvaluationPlan,
): ControlledSkillEvaluationObjective {
  if (!isRecord(input)) throw new TypeError('controlled evaluation objective input must be an object')
  exactKeys(input, ['evaluationId', 'taskId', 'baseline', 'candidate'])
  const task = plan.tasks.find(item => item.taskId === input.taskId)
  if (input.evaluationId !== plan.evaluationId || task === undefined) {
    throw new TypeError('controlled evaluation objective disagrees with its plan')
  }
  const baseline = prepareObjectiveArm(input.baseline, 'baseline', task.baseline, plan, task)
  const candidate = prepareObjectiveArm(input.candidate, 'candidate', task.candidate, plan, task)
  if (
    baseline.executionManifestDigest !== candidate.executionManifestDigest
    || baseline.normalizedFirstRequestDigest !== candidate.normalizedFirstRequestDigest
  ) {
    throw new TypeError('controlled evaluation objective arms are not symmetric')
  }
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2',
    evaluationId: plan.evaluationId,
    taskId: task.taskId,
    baseline,
    candidate,
    ...reduceObjectiveOutcomes(baseline, candidate),
  }
}

export function parseControlledSkillEvaluationObjective(
  value: unknown,
): ControlledSkillEvaluationObjective {
  if (!isRecord(value)) throw new TypeError('controlled evaluation objective must be an object')
  exactKeys(value, [
    'schemaVersion',
    'evaluationId',
    'taskId',
    'baseline',
    'candidate',
    'comparison',
    'candidateHardGate',
    'objectiveVerdict',
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-evaluation-objective.v2'
    || typeof value.evaluationId !== 'string'
    || !EVALUATION_ID.test(value.evaluationId)
    || typeof value.taskId !== 'string'
    || !TASK_ID.test(value.taskId)
  ) {
    throw new TypeError('controlled evaluation objective has an invalid identity')
  }
  const baseline = prepareObjectiveArm(value.baseline, 'baseline')
  const candidate = prepareObjectiveArm(value.candidate, 'candidate')
  const prepared: ControlledSkillEvaluationObjective = {
    schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2',
    evaluationId: value.evaluationId as ControlledSkillEvaluationId,
    taskId: value.taskId as ControlledSkillEvalTaskId,
    baseline,
    candidate,
    ...reduceObjectiveOutcomes(baseline, candidate),
  }
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled evaluation objective is not canonical')
  }
  return prepared
}

function blindEnvelopeArm(arm: ControlledSkillEvaluationObjectiveArm) {
  return {
    evaluatorMaterialDigest: arm.evaluatorMaterialDigest,
    outcome: arm.outcome,
    evidenceSetDigest: sha256(arm.evidenceIds),
  }
}

export function prepareControlledSkillEvaluationBlindMap(
  input: FreezeControlledSkillEvaluationBlindMapInput,
  plan: ControlledSkillEvaluationPlan,
  objectives: readonly ControlledSkillEvaluationObjective[],
): ControlledSkillEvaluationBlindMap {
  if (!isRecord(input)) throw new TypeError('controlled evaluation blind map input must be an object')
  exactKeys(input, ['evaluationId'])
  if (input.evaluationId !== plan.evaluationId) {
    throw new TypeError('controlled evaluation blind map disagrees with its plan')
  }
  if (
    objectives.length !== plan.tasks.length
    || objectives.some((objective, index) =>
      objective.evaluationId !== plan.evaluationId
      || objective.taskId !== plan.tasks[index]?.taskId)
  ) {
    throw new TypeError('controlled evaluation incomplete')
  }
  const complete = objectives
  if (
    complete.some(objective => objective.objectiveVerdict !== 'pass')
    || (plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v2'
      && complete.slice(0, 2).every(objective =>
        objective.comparison !== 'candidate-better'))
  ) {
    throw new TypeError('controlled evaluation objective aggregate did not pass')
  }
  const objectiveSetDigest = sha256(complete)
  return {
    schemaVersion: plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
      ? 'tianwen.controlled-skill-evaluation-blind-map.v3'
      : 'tianwen.controlled-skill-evaluation-blind-map.v2',
    evaluationId: plan.evaluationId,
    objectiveSetDigest,
    assignments: plan.tasks.map((task, index) => {
      const objective = complete[index]!
      const assignmentDigest = sha256({
        domain: plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
          ? 'tianwen.controlled-blind-map.v2'
          : 'tianwen.controlled-blind-map.v1',
        evaluationId: plan.evaluationId,
        objectiveSetDigest,
        taskId: task.taskId,
      })
      const xRole: ControlledSkillEvalPlanArm['role'] =
        Number.parseInt(assignmentDigest.at(-1)!, 16) % 2 === 0
          ? 'baseline'
          : 'candidate'
      const yRole = xRole === 'baseline' ? 'candidate' : 'baseline'
      return {
        taskId: task.taskId,
        xRole,
        yRole,
        evaluatorSessionId: task.evaluatorSessionId,
        envelopeDigest: sha256({
          domain: plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
            ? 'tianwen.controlled-blind-envelope.v2'
            : 'tianwen.controlled-blind-envelope.v1',
          taskId: task.taskId,
          rubricDigest: plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
            ? plan.sourceFidelity.holdout.review.rubricDigest
            : CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
          x: blindEnvelopeArm(objective[xRole]),
          y: blindEnvelopeArm(objective[yRole]),
        }),
      }
    }),
  }
}

export function parseControlledSkillEvaluationBlindMap(
  value: unknown,
): ControlledSkillEvaluationBlindMap {
  if (!isRecord(value)) throw new TypeError('controlled evaluation blind map must be an object')
  exactKeys(value, ['schemaVersion', 'evaluationId', 'objectiveSetDigest', 'assignments'])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v2'
    && value.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v3'
    || typeof value.evaluationId !== 'string'
    || !EVALUATION_ID.test(value.evaluationId)
    || !Array.isArray(value.assignments)
  ) {
    throw new TypeError('controlled evaluation blind map is invalid')
  }
  const prepared: ControlledSkillEvaluationBlindMap = {
    schemaVersion: value.schemaVersion,
    evaluationId: value.evaluationId as ControlledSkillEvaluationId,
    objectiveSetDigest: digest(value.objectiveSetDigest, 'objectiveSetDigest'),
    assignments: value.assignments.map(item => {
      if (!isRecord(item)) throw new TypeError('controlled evaluation blind assignment must be an object')
      exactKeys(item, [
        'taskId',
        'xRole',
        'yRole',
        'evaluatorSessionId',
        'envelopeDigest',
      ])
      if (
        typeof item.taskId !== 'string'
        || !TASK_ID.test(item.taskId)
        || (item.xRole !== 'baseline' && item.xRole !== 'candidate')
        || (item.yRole !== 'baseline' && item.yRole !== 'candidate')
        || item.xRole === item.yRole
      ) {
        throw new TypeError('controlled evaluation blind assignment is invalid')
      }
      return {
        taskId: item.taskId as ControlledSkillEvalTaskId,
        xRole: item.xRole,
        yRole: item.yRole,
        evaluatorSessionId: safeSessionId(item.evaluatorSessionId),
        envelopeDigest: digest(item.envelopeDigest, 'envelopeDigest'),
      }
    }),
  }
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled evaluation blind map is not canonical')
  }
  return prepared
}

function prepareDimensionScores(
  value: unknown,
  requiresSourceFidelity: boolean,
): ControlledSkillEvaluatorDimensionScores {
  if (!isRecord(value)) throw new TypeError('controlled evaluator dimension scores must be an object')
  exactKeys(value, [
    'relevance',
    'correctnessReasoning',
    'clarityUsability',
    'scopeRestraint',
    ...(requiresSourceFidelity ? ['sourceFidelity'] : []),
  ])
  const common = {
    relevance: boundedInteger(value.relevance, 'relevance', 0, 4),
    correctnessReasoning: boundedInteger(
      value.correctnessReasoning,
      'correctnessReasoning',
      0,
      4,
    ),
    clarityUsability: boundedInteger(value.clarityUsability, 'clarityUsability', 0, 4),
    scopeRestraint: boundedInteger(value.scopeRestraint, 'scopeRestraint', 0, 4),
  }
  return requiresSourceFidelity
    ? {
        ...common,
        sourceFidelity: boundedInteger(value.sourceFidelity, 'sourceFidelity', 0, 4),
      }
    : common
}

function prepareEvaluatorScores(
  value: unknown,
  requiresSourceFidelity: boolean,
): ControlledSkillEvaluatorScores {
  if (!isRecord(value)) throw new TypeError('controlled evaluator scores must be an object')
  exactKeys(value, ['x', 'y'])
  return {
    x: prepareDimensionScores(value.x, requiresSourceFidelity),
    y: prepareDimensionScores(value.y, requiresSourceFidelity),
  }
}

function prepareObservationInput(
  value: unknown,
  requiresSourceFidelity: boolean,
): RecordControlledSkillEvaluatorObservationInput {
  if (!isRecord(value)) throw new TypeError('controlled evaluator observation input must be an object')
  const commonKeys = [
    'evaluationId',
    'taskId',
    'evaluatorSessionId',
    'envelopeDigest',
    'requestDigest',
    'evidenceId',
    'status',
    'insufficientMaterial',
    'reasonCode',
  ]
  if (value.status === 'scored') {
    exactKeys(value, [...commonKeys, 'scores'])
  } else if (value.status === 'inconclusive') {
    exactKeys(value, commonKeys)
  } else {
    throw new TypeError('controlled evaluator observation status is invalid')
  }
  if (
    typeof value.evaluationId !== 'string'
    || !EVALUATION_ID.test(value.evaluationId)
    || typeof value.taskId !== 'string'
    || !TASK_ID.test(value.taskId)
  ) {
    throw new TypeError('controlled evaluator observation identity is invalid')
  }
  const common: ControlledSkillEvaluatorObservationCommon = {
    evaluationId: value.evaluationId as ControlledSkillEvaluationId,
    taskId: value.taskId as ControlledSkillEvalTaskId,
    evaluatorSessionId: safeSessionId(value.evaluatorSessionId),
    envelopeDigest: digest(value.envelopeDigest, 'envelopeDigest'),
    requestDigest: digest(value.requestDigest, 'requestDigest'),
    evidenceId: digest(value.evidenceId, 'evidenceId'),
  }
  if (value.status === 'scored') {
    if (value.insufficientMaterial !== false || value.reasonCode !== 'score-submitted') {
      throw new TypeError('scored controlled evaluator observation is invalid')
    }
    return {
      ...common,
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: prepareEvaluatorScores(value.scores, requiresSourceFidelity),
    }
  }
  if (
    value.insufficientMaterial !== true
    || ![
      'material-missing',
      'identity-exposed',
      'objective-facts-incomplete',
      'provider-failed',
      'timeout',
      'score-not-submitted',
    ].includes(value.reasonCode as string)
  ) {
    throw new TypeError('inconclusive controlled evaluator observation is invalid')
  }
  return {
    ...common,
    status: 'inconclusive',
    insufficientMaterial: true,
    reasonCode: value.reasonCode as ControlledSkillEvaluatorInconclusiveReasonCode,
  }
}

export function prepareControlledSkillEvaluatorObservation(
  input: RecordControlledSkillEvaluatorObservationInput,
  plan: ControlledSkillEvaluationPlan,
  blindMap: ControlledSkillEvaluationBlindMap,
): ControlledSkillEvaluatorObservation {
  const requiresSourceFidelity =
    plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
  const prepared = prepareObservationInput(input, requiresSourceFidelity)
  const taskIndex = plan.tasks.findIndex(task => task.taskId === prepared.taskId)
  const task = plan.tasks[taskIndex]
  const assignment = blindMap.assignments[taskIndex]
  if (
    prepared.evaluationId !== plan.evaluationId
    || blindMap.evaluationId !== plan.evaluationId
    || (requiresSourceFidelity
      ? blindMap.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v3'
      : blindMap.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v2')
    || task === undefined
    || assignment?.taskId !== task.taskId
    || prepared.evaluatorSessionId !== task.evaluatorSessionId
    || prepared.evaluatorSessionId !== assignment.evaluatorSessionId
    || prepared.envelopeDigest !== assignment.envelopeDigest
  ) {
    throw new TypeError('controlled evaluator observation disagrees with frozen facts')
  }
  return {
    schemaVersion: requiresSourceFidelity
      ? 'tianwen.controlled-skill-evaluator-observation.v3'
      : 'tianwen.controlled-skill-evaluator-observation.v2',
    ...prepared,
  }
}

export function parseControlledSkillEvaluatorObservation(
  value: unknown,
): ControlledSkillEvaluatorObservation {
  if (!isRecord(value)) throw new TypeError('controlled evaluator observation must be an object')
  const { schemaVersion, ...input } = value
  if (
    schemaVersion !== 'tianwen.controlled-skill-evaluator-observation.v2'
    && schemaVersion !== 'tianwen.controlled-skill-evaluator-observation.v3'
  ) {
    throw new TypeError('controlled evaluator observation schema version is invalid')
  }
  const prepared: ControlledSkillEvaluatorObservation = {
    schemaVersion,
    ...prepareObservationInput(
      input as unknown as RecordControlledSkillEvaluatorObservationInput,
      schemaVersion === 'tianwen.controlled-skill-evaluator-observation.v3',
    ),
  }
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled evaluator observation is not canonical')
  }
  return prepared
}

function resultEvidenceClaim(
  plan: ControlledSkillEvaluationPlan,
): ControlledSkillEvaluationEvidenceClaim {
  return plan.evidencePurpose === 'controlled-product'
    ? 'controlled-product'
    : 'controlled-synthetic-mechanism'
}

function prepareResultRecord(
  plan: ControlledSkillEvaluationPlan,
  fields: Pick<
    ControlledSkillEvaluationResultV2,
    | 'objectiveSetDigest'
    | 'blindMapDigest'
    | 'evaluatorSetDigest'
    | 'mechanismVerdict'
    | 'reasonCode'
    | 'baselineTotal'
    | 'candidateTotal'
  > & {
    readonly baselineSourceFidelityTotal?: number | null
    readonly candidateSourceFidelityTotal?: number | null
  },
): ControlledSkillEvaluationResult {
  const {
    baselineSourceFidelityTotal,
    candidateSourceFidelityTotal,
    ...serializedFields
  } = fields
  const shadowEligibility: ControlledSkillEvaluationShadowEligibility =
    fields.mechanismVerdict !== 'pass'
      ? 'ineligible'
      : plan.evidencePurpose === 'controlled-product'
        ? 'eligible-for-project-shadow'
        : 'eligible-for-isolated-test-shadow'
  const common: ControlledSkillEvaluationResultCommon = {
    evaluationId: plan.evaluationId,
    planDigest: sha256(plan),
    ...serializedFields,
    evidenceClaim: resultEvidenceClaim(plan),
    naturalUserEvidence: 'not-claimed',
    shadowEligibility,
  }
  return plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
    ? {
        schemaVersion: 'tianwen.controlled-skill-evaluation-result.v3',
        ...common,
        baselineSourceFidelityTotal: baselineSourceFidelityTotal ?? null,
        candidateSourceFidelityTotal: candidateSourceFidelityTotal ?? null,
      }
    : {
        schemaVersion: 'tianwen.controlled-skill-evaluation-result.v2',
        ...common,
      }
}

const EVALUATOR_SCORE_DIMENSIONS = [
  'relevance',
  'correctnessReasoning',
  'clarityUsability',
  'scopeRestraint',
] as const

export function prepareControlledSkillEvaluationResult(
  input: RecordControlledSkillEvaluationResultInput,
  plan: ControlledSkillEvaluationPlan,
  objectives: readonly ControlledSkillEvaluationObjective[],
  blindMap?: ControlledSkillEvaluationBlindMap,
  observations: readonly ControlledSkillEvaluatorObservation[] = [],
): ControlledSkillEvaluationResult {
  if (!isRecord(input)) throw new TypeError('controlled evaluation result input must be an object')
  exactKeys(input, ['evaluationId'])
  if (input.evaluationId !== plan.evaluationId) {
    throw new TypeError('controlled evaluation result disagrees with its plan')
  }
  if (objectives.some((objective, index) =>
    objective.evaluationId !== plan.evaluationId
    || objective.taskId !== plan.tasks[index]?.taskId)) {
    throw new TypeError('controlled evaluation result has unknown objectives')
  }
  const objectiveSetDigest = objectives.length === plan.tasks.length
    ? sha256(objectives)
    : null
  if (objectives.some(objective => objective.candidateHardGate === 'rejected')) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest: null,
      evaluatorSetDigest: null,
      mechanismVerdict: 'rejected',
      reasonCode: 'candidate-objective-hard-gate-failed',
      baselineTotal: null,
      candidateTotal: null,
    })
  }
  if (objectives.some(objective => objective.objectiveVerdict === 'inconclusive')) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest: null,
      evaluatorSetDigest: null,
      mechanismVerdict: 'inconclusive',
      reasonCode: 'objective-inconclusive',
      baselineTotal: null,
      candidateTotal: null,
    })
  }
  if (objectiveSetDigest === null) {
    throw new TypeError('controlled evaluation incomplete')
  }
  const complete = objectives
  if (
    plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v2'
    && complete.slice(0, 2).every(objective =>
      objective.comparison !== 'candidate-better')
  ) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest: null,
      evaluatorSetDigest: null,
      mechanismVerdict: 'rejected',
      reasonCode: 'original-or-adjacent-not-improved',
      baselineTotal: null,
      candidateTotal: null,
    })
  }
  if (
    blindMap === undefined
    || blindMap.evaluationId !== plan.evaluationId
    || blindMap.objectiveSetDigest !== objectiveSetDigest
    || (plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
      ? blindMap.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v3'
      : blindMap.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v2')
  ) {
    throw new TypeError('controlled evaluation incomplete')
  }
  if (observations.some((observation, index) =>
    observation.evaluationId !== plan.evaluationId
    || observation.taskId !== plan.tasks[index]?.taskId)) {
    throw new TypeError('controlled evaluation result has unknown observations')
  }
  const blindMapDigest = sha256(blindMap)
  const inconclusive = observations.find(observation =>
    observation.status === 'inconclusive')
  if (inconclusive !== undefined) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest,
      evaluatorSetDigest: sha256(observations),
      mechanismVerdict: 'inconclusive',
      reasonCode: inconclusive.reasonCode,
      baselineTotal: null,
      candidateTotal: null,
    })
  }
  if (
    observations.length !== plan.tasks.length
    || observations.some(observation => observation.status !== 'scored')
    || observations.some(observation =>
      plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
        ? observation.schemaVersion !== 'tianwen.controlled-skill-evaluator-observation.v3'
        : observation.schemaVersion !== 'tianwen.controlled-skill-evaluator-observation.v2')
  ) {
    throw new TypeError('controlled evaluation incomplete')
  }
  const scored = observations as readonly (ControlledSkillEvaluatorObservation & {
    readonly status: 'scored'
    readonly scores: ControlledSkillEvaluatorScores
  })[]
  let baselineTotal = 0
  let candidateTotal = 0
  let baselineSourceFidelityTotal = 0
  let candidateSourceFidelityTotal = 0
  let dimensionRegression = false
  let pairedSourceFidelityRegression = false
  let originalSourceFidelityImprovement = 0
  for (const [index, observation] of scored.entries()) {
    const assignment = blindMap.assignments[index]!
    const baseline = assignment.xRole === 'baseline'
      ? observation.scores.x
      : observation.scores.y
    const candidate = assignment.xRole === 'candidate'
      ? observation.scores.x
      : observation.scores.y
    for (const dimension of EVALUATOR_SCORE_DIMENSIONS) {
      baselineTotal += baseline[dimension]
      candidateTotal += candidate[dimension]
      dimensionRegression ||= candidate[dimension] - baseline[dimension] <= -2
    }
    if (plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3') {
      const baselineFidelity = (baseline as ControlledSkillEvaluatorDimensionScoresV3)
        .sourceFidelity
      const candidateFidelity = (candidate as ControlledSkillEvaluatorDimensionScoresV3)
        .sourceFidelity
      baselineSourceFidelityTotal += baselineFidelity
      candidateSourceFidelityTotal += candidateFidelity
      if (index === 0) {
        originalSourceFidelityImprovement = candidateFidelity - baselineFidelity
      } else {
        pairedSourceFidelityRegression ||= candidateFidelity < baselineFidelity
      }
    }
  }
  const evaluatorSetDigest = sha256(scored)
  if (candidateTotal < baselineTotal) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest,
      evaluatorSetDigest,
      mechanismVerdict: 'rejected',
      reasonCode: 'candidate-subjective-total-lower',
      baselineTotal,
      candidateTotal,
      baselineSourceFidelityTotal,
      candidateSourceFidelityTotal,
    })
  }
  if (dimensionRegression) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest,
      evaluatorSetDigest,
      mechanismVerdict: 'rejected',
      reasonCode: 'candidate-dimension-regression',
      baselineTotal,
      candidateTotal,
      baselineSourceFidelityTotal,
      candidateSourceFidelityTotal,
    })
  }
  if (
    plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
    && originalSourceFidelityImprovement
      < CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.originalTaskMinimumImprovement
  ) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest,
      evaluatorSetDigest,
      mechanismVerdict: 'rejected',
      reasonCode: 'original-source-fidelity-not-improved',
      baselineTotal,
      candidateTotal,
      baselineSourceFidelityTotal,
      candidateSourceFidelityTotal,
    })
  }
  if (
    plan.schemaVersion === 'tianwen.controlled-skill-evaluation-plan.v3'
    && pairedSourceFidelityRegression
  ) {
    return prepareResultRecord(plan, {
      objectiveSetDigest,
      blindMapDigest,
      evaluatorSetDigest,
      mechanismVerdict: 'rejected',
      reasonCode: 'paired-source-fidelity-regression',
      baselineTotal,
      candidateTotal,
      baselineSourceFidelityTotal,
      candidateSourceFidelityTotal,
    })
  }
  return prepareResultRecord(plan, {
    objectiveSetDigest,
    blindMapDigest,
    evaluatorSetDigest,
    mechanismVerdict: 'pass',
    reasonCode: 'all-gates-passed',
    baselineTotal,
    candidateTotal,
    baselineSourceFidelityTotal,
    candidateSourceFidelityTotal,
  })
}

export function parseControlledSkillEvaluationResult(
  value: unknown,
): ControlledSkillEvaluationResult {
  if (!isRecord(value)) throw new TypeError('controlled evaluation result must be an object')
  const isV3 = value.schemaVersion === 'tianwen.controlled-skill-evaluation-result.v3'
  exactKeys(value, [
    'schemaVersion',
    'evaluationId',
    'planDigest',
    'objectiveSetDigest',
    'blindMapDigest',
    'evaluatorSetDigest',
    'mechanismVerdict',
    'evidenceClaim',
    'naturalUserEvidence',
    'shadowEligibility',
    'reasonCode',
    'baselineTotal',
    'candidateTotal',
    ...(isV3
      ? ['baselineSourceFidelityTotal', 'candidateSourceFidelityTotal']
      : []),
  ])
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-evaluation-result.v2'
    && !isV3
    || typeof value.evaluationId !== 'string'
    || !EVALUATION_ID.test(value.evaluationId)
    || (value.mechanismVerdict !== 'pass'
      && value.mechanismVerdict !== 'rejected'
      && value.mechanismVerdict !== 'inconclusive')
    || (value.evidenceClaim !== 'controlled-product'
      && value.evidenceClaim !== 'controlled-synthetic-mechanism')
    || value.naturalUserEvidence !== 'not-claimed'
    || (value.shadowEligibility !== 'eligible-for-project-shadow'
      && value.shadowEligibility !== 'eligible-for-isolated-test-shadow'
      && value.shadowEligibility !== 'ineligible')
    || ![
      'candidate-objective-hard-gate-failed',
      'objective-inconclusive',
      'original-or-adjacent-not-improved',
      'material-missing',
      'identity-exposed',
      'objective-facts-incomplete',
      'provider-failed',
      'timeout',
      'score-not-submitted',
      'candidate-subjective-total-lower',
      'candidate-dimension-regression',
      'original-source-fidelity-not-improved',
      'paired-source-fidelity-regression',
      'all-gates-passed',
    ].includes(value.reasonCode as string)
  ) {
    throw new TypeError('controlled evaluation result is invalid')
  }
  const nullableDigest = (item: unknown, label: string) =>
    item === null ? null : digest(item, label)
  const total = (item: unknown, label: string) =>
    item === null ? null : boundedInteger(item, label, 0, 80)
  const baselineTotal = total(value.baselineTotal, 'baselineTotal')
  const candidateTotal = total(value.candidateTotal, 'candidateTotal')
  if ((baselineTotal === null) !== (candidateTotal === null)) {
    throw new TypeError('controlled evaluation result totals must both be present or absent')
  }
  const sourceTotal = (item: unknown, label: string) =>
    item === null ? null : boundedInteger(item, label, 0, 20)
  const baselineSourceFidelityTotal = isV3
    ? sourceTotal(value.baselineSourceFidelityTotal, 'baselineSourceFidelityTotal')
    : undefined
  const candidateSourceFidelityTotal = isV3
    ? sourceTotal(value.candidateSourceFidelityTotal, 'candidateSourceFidelityTotal')
    : undefined
  if (
    isV3
    && ((baselineSourceFidelityTotal === null) !==
      (candidateSourceFidelityTotal === null))
  ) throw new TypeError('controlled evaluation source-fidelity totals must both be present or absent')
  const common: ControlledSkillEvaluationResultCommon = {
    evaluationId: value.evaluationId as ControlledSkillEvaluationId,
    planDigest: digest(value.planDigest, 'planDigest'),
    objectiveSetDigest: nullableDigest(value.objectiveSetDigest, 'objectiveSetDigest'),
    blindMapDigest: nullableDigest(value.blindMapDigest, 'blindMapDigest'),
    evaluatorSetDigest: nullableDigest(value.evaluatorSetDigest, 'evaluatorSetDigest'),
    mechanismVerdict: value.mechanismVerdict as ControlledSkillEvaluationMechanismVerdict,
    evidenceClaim: value.evidenceClaim as ControlledSkillEvaluationEvidenceClaim,
    naturalUserEvidence: 'not-claimed',
    shadowEligibility: value.shadowEligibility as ControlledSkillEvaluationShadowEligibility,
    reasonCode: value.reasonCode as ControlledSkillEvaluationResultReasonCode,
    baselineTotal,
    candidateTotal,
  }
  return isV3
    ? {
        schemaVersion: 'tianwen.controlled-skill-evaluation-result.v3',
        ...common,
        baselineSourceFidelityTotal: baselineSourceFidelityTotal!,
        candidateSourceFidelityTotal: candidateSourceFidelityTotal!,
      }
    : {
        schemaVersion: 'tianwen.controlled-skill-evaluation-result.v2',
        ...common,
      }
}
