import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeVerdict,
  RunAcceptanceContract,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  GovernedSkillCandidate,
  SkillVersionId,
} from './skill-governance.js'
import type {
  ControlledSkillEvalEvidenceLabel,
  ControlledSkillEvalExecution,
  ControlledSkillEvalStopContract,
  ControlledSkillEvaluationEvidenceClaim,
  ControlledSkillEvaluationId,
  ControlledSkillEvaluationObjective,
  ControlledSkillEvaluationPlan,
  ControlledSkillEvaluationResult,
  ControlledSkillEvaluatorObservation,
  ControlledSkillEvaluatorDimensionScoresV3,
  ControlledSkillSourceFidelityHoldoutTask,
} from './controlled-skill-evaluation.js'
import {
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  resolveControlledSkillSourceFidelityFamily,
  CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS,
} from './controlled-skill-source-fidelity.js'

export type ControlledSkillShadowId = `shadow:${string}`
export type ControlledSkillShadowTaskId = `shadow-task:${string}`
export type ControlledSkillShadowMode = 'project' | 'isolated-test'

export interface ControlledSkillShadowTaskInput {
  readonly taskId: ControlledSkillShadowTaskId
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

export interface OpenControlledSkillShadowInputV2 {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly tasks: readonly ControlledSkillShadowTaskInput[]
}

export interface OpenControlledSkillShadowInputV3 {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly holdoutSessionId: string
  readonly reviewSessionId: string
}

export type OpenControlledSkillShadowInput =
  | OpenControlledSkillShadowInputV2
  | OpenControlledSkillShadowInputV3

export interface ControlledSkillShadowTaskPlan extends ControlledSkillShadowTaskInput {
  readonly runId: TianwenRunId
}

export interface ControlledSkillShadowTaskPlanV3
  extends ControlledSkillShadowTaskPlan {
  readonly evaluatorMaterialContractDigest: Sha256Digest
}

export interface ControlledSkillShadowReviewPlan {
  readonly sessionId: string
  readonly rubricDigest: Sha256Digest
  readonly configurationDigest: Sha256Digest
  readonly materialContractDigest: Sha256Digest
  readonly evidenceContractDigest: Sha256Digest
  readonly sourcePacketDigest: Sha256Digest
}

interface ControlledSkillShadowPlanCommon {
  readonly shadowId: ControlledSkillShadowId
  readonly evaluationId: ControlledSkillEvaluationId
  readonly evaluationPlanDigest: Sha256Digest
  readonly evaluationResultDigest: Sha256Digest
  readonly candidateId: GovernedSkillCandidate['candidateId']
  readonly parentVersionId: SkillVersionId
  readonly parentPayloadDigest: Sha256Digest
  readonly candidateVersionId: SkillVersionId
  readonly candidatePayloadDigest: Sha256Digest
  readonly sourceScopeKey: string
  readonly scopeKey: string
  readonly mode: ControlledSkillShadowMode
  readonly evidenceClaim: ControlledSkillEvaluationEvidenceClaim
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly naturalUserEvidence: 'not-claimed'
  readonly execution: ControlledSkillEvalExecution
  readonly tasks: readonly ControlledSkillShadowTaskPlan[]
}

export interface ControlledSkillShadowPlanV2
  extends ControlledSkillShadowPlanCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-plan.v2'
}

export interface ControlledSkillShadowPlanV3
  extends Omit<ControlledSkillShadowPlanCommon, 'tasks'> {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-plan.v3'
  readonly tasks: readonly [ControlledSkillShadowTaskPlanV3]
  readonly review: ControlledSkillShadowReviewPlan
}

export type ControlledSkillShadowPlan =
  | ControlledSkillShadowPlanV2
  | ControlledSkillShadowPlanV3

export interface ControlledSkillShadowReceipt {
  readonly shadowId: ControlledSkillShadowId
  readonly duplicate: boolean
}

export interface ControlledSkillShadowOpenedEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-shadow-plan.v2'
    | 'tianwen.controlled-skill-shadow-plan.v3'
  readonly type: 'controlled-skill-shadow-opened'
  readonly at: string
  readonly plan: ControlledSkillShadowPlan
  readonly inputDigest: Sha256Digest
}

export interface ControlledSkillShadowUsage {
  readonly modelRequests: number
  readonly toolCalls: number
  readonly elapsedMs: number
}

export interface ControlledSkillShadowRunV2 {
  readonly taskId: ControlledSkillShadowTaskId
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
  readonly usage: ControlledSkillShadowUsage
}

export interface ControlledSkillShadowRunV3 extends ControlledSkillShadowRunV2 {
  readonly evaluatorMaterialDigest: Sha256Digest
}

export type ControlledSkillShadowRun =
  | ControlledSkillShadowRunV2
  | ControlledSkillShadowRunV3

export interface RecordControlledSkillShadowResultInput {
  readonly shadowId: ControlledSkillShadowId
  readonly runs: readonly ControlledSkillShadowRun[]
}

export type ControlledSkillShadowReviewInconclusiveReasonCode =
  | 'material-missing'
  | 'identity-exposed'
  | 'provider-failed'
  | 'timeout'
  | 'score-not-submitted'
  | 'evidence-mismatch'

interface ControlledSkillShadowReviewObservationInputCommon {
  readonly shadowId: ControlledSkillShadowId
  readonly reviewerSessionId: string
  readonly requestDigest: Sha256Digest
  readonly evidenceId: Sha256Digest
  readonly acceptanceEvidenceId: Sha256Digest
  readonly acceptedMaterialDigest: Sha256Digest
  readonly reviewedRun: ControlledSkillShadowRunV3
}

export type RecordControlledSkillShadowReviewObservationInput =
  | (ControlledSkillShadowReviewObservationInputCommon & {
      readonly status: 'scored'
      readonly insufficientMaterial: false
      readonly reasonCode: 'score-submitted'
      readonly scores: ControlledSkillEvaluatorDimensionScoresV3
    })
  | (ControlledSkillShadowReviewObservationInputCommon & {
      readonly status: 'inconclusive'
      readonly insufficientMaterial: true
      readonly reasonCode: ControlledSkillShadowReviewInconclusiveReasonCode
    })

interface ControlledSkillShadowReviewObservationCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-review-observation.v1'
  readonly shadowId: ControlledSkillShadowId
  readonly planDigest: Sha256Digest
  readonly taskId: ControlledSkillShadowTaskId
  readonly runId: TianwenRunId
  readonly reviewerSessionId: string
  readonly rubricDigest: Sha256Digest
  readonly configurationDigest: Sha256Digest
  readonly materialContractDigest: Sha256Digest
  readonly evidenceContractDigest: Sha256Digest
  readonly sourcePacketDigest: Sha256Digest
  readonly requestDigest: Sha256Digest
  readonly evidenceId: Sha256Digest
  readonly acceptanceEvidenceId: Sha256Digest
  readonly acceptedMaterialDigest: Sha256Digest
  readonly reviewedRun: ControlledSkillShadowRunV3
  readonly reviewedRunDigest: Sha256Digest
}

export type ControlledSkillShadowReviewObservation =
  | (ControlledSkillShadowReviewObservationCommon & {
      readonly status: 'scored'
      readonly insufficientMaterial: false
      readonly reasonCode: 'score-submitted'
      readonly scores: ControlledSkillEvaluatorDimensionScoresV3
    })
  | (ControlledSkillShadowReviewObservationCommon & {
      readonly status: 'inconclusive'
      readonly insufficientMaterial: true
      readonly reasonCode: ControlledSkillShadowReviewInconclusiveReasonCode
    })

export interface ControlledSkillShadowReviewObservationReceipt {
  readonly shadowId: ControlledSkillShadowId
  readonly duplicate: boolean
}

export interface ControlledSkillShadowReviewObservationRecordedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-review-observation.v1'
  readonly type: 'controlled-skill-shadow-review-observation-recorded'
  readonly at: string
  readonly observation: ControlledSkillShadowReviewObservation
  readonly inputDigest: Sha256Digest
}

export type ControlledSkillShadowMechanismVerdict = 'pass' | 'rejected' | 'inconclusive'
export type ControlledSkillShadowResultReasonCode =
  | 'all-shadow-runs-qualified'
  | 'candidate-shadow-not-met'
  | 'candidate-shadow-inconclusive'
  | 'holdout-review-inconclusive'
  | 'holdout-quality-threshold-failed'
export type ControlledSkillShadowPromotionEligibility =
  | 'eligible-for-project-promotion'
  | 'eligible-for-isolated-test-promotion'
  | 'ineligible'

interface ControlledSkillShadowResultCommon {
  readonly shadowId: ControlledSkillShadowId
  readonly planDigest: Sha256Digest
  readonly evaluationId: ControlledSkillEvaluationId
  readonly evaluationPlanDigest: Sha256Digest
  readonly evaluationResultDigest: Sha256Digest
  readonly runs: readonly ControlledSkillShadowRun[]
  readonly mechanismVerdict: ControlledSkillShadowMechanismVerdict
  readonly reasonCode: ControlledSkillShadowResultReasonCode
  readonly evidenceClaim: ControlledSkillEvaluationEvidenceClaim
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly naturalUserEvidence: 'not-claimed'
  readonly promotionEligibility: ControlledSkillShadowPromotionEligibility
}

export interface ControlledSkillShadowResultV2
  extends ControlledSkillShadowResultCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-result.v2'
}

export interface ControlledSkillShadowResultV3
  extends ControlledSkillShadowResultCommon {
  readonly schemaVersion: 'tianwen.controlled-skill-shadow-result.v3'
  readonly reviewObservationDigest: Sha256Digest | null
}

export type ControlledSkillShadowResult =
  | ControlledSkillShadowResultV2
  | ControlledSkillShadowResultV3

export interface ControlledSkillShadowResultReceipt {
  readonly shadowId: ControlledSkillShadowId
  readonly duplicate: boolean
}

export interface ControlledSkillShadowResultRecordedEvent {
  readonly schemaVersion:
    | 'tianwen.controlled-skill-shadow-result.v2'
    | 'tianwen.controlled-skill-shadow-result.v3'
  readonly type: 'controlled-skill-shadow-result-recorded'
  readonly at: string
  readonly result: ControlledSkillShadowResult
  readonly inputDigest: Sha256Digest
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const EVALUATION_ID = /^evaluation:[a-f0-9]{64}$/u
const SHADOW_ID = /^shadow:[a-f0-9]{64}$/u
const TASK_ID = /^shadow-task:[a-z0-9][a-z0-9._-]{0,96}$/u
const RUN_ID = /^run:[a-f0-9]{64}$/u
const CANDIDATE_ID = /^candidate:[a-f0-9]{64}$/u
const SKILL_VERSION_ID = /^skill-version:[a-f0-9]{64}$/u
const SAFE_EXECUTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u
const SAFE_TOOL_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u

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
  ) throw new TypeError('controlled Skill Shadow sessionId is invalid')
  return value
}

function safeScopeKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 240) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function prepareAcceptanceContract(value: unknown): RunAcceptanceContract {
  if (!isRecord(value)) throw new TypeError('acceptanceContract must be an object')
  return prepareRunBinding({
    goalRef: 'goal:controlled-skill-shadow-validation',
    taskRef: 'task:controlled-skill-shadow-validation',
    sessionId: 'session:controlled-skill-shadow-validation',
    scopeKey: 'scope:controlled-skill-shadow-validation',
    acceptanceContract: value as unknown as RunAcceptanceContract,
  }).acceptanceContract
}

function prepareAllowedTools(value: unknown, acceptanceTool: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('controlled Skill Shadow allowedTools must be non-empty')
  }
  const tools = value.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('controlled Skill Shadow allowedTools are invalid')
    }
    return item
  })
  if (new Set(tools).size !== tools.length || !tools.includes(acceptanceTool)) {
    throw new TypeError('controlled Skill Shadow allowedTools must be unique and include acceptance')
  }
  return [...tools].sort((left, right) => left.localeCompare(right))
}

function prepareStopContract(value: unknown): ControlledSkillEvalStopContract {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow stopContract must be an object')
  exactKeys(value, ['maxToolCalls', 'maxElapsedMs'])
  return {
    maxToolCalls: boundedInteger(value.maxToolCalls, 'maxToolCalls', 1, 256),
    maxElapsedMs: boundedInteger(value.maxElapsedMs, 'maxElapsedMs', 1, 3_600_000),
  }
}

function prepareTask(value: unknown): ControlledSkillShadowTaskInput {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow task must be an object')
  exactKeys(value, [
    'taskId',
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
  if (typeof value.taskId !== 'string' || !TASK_ID.test(value.taskId)) {
    throw new TypeError('controlled Skill Shadow taskId is invalid')
  }
  const acceptanceContract = prepareAcceptanceContract(value.acceptanceContract)
  return {
    taskId: value.taskId as ControlledSkillShadowTaskId,
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

function prepareV3Task(
  task: ControlledSkillSourceFidelityHoldoutTask,
  sessionId: unknown,
): ControlledSkillShadowTaskInput & { readonly evaluatorMaterialContractDigest: Sha256Digest } {
  const prepared = prepareTask({
    taskId: task.taskId,
    goalDigest: task.goalDigest,
    inputDigest: task.inputDigest,
    workspaceSnapshotDigest: task.workspaceSnapshotDigest,
    toolSchemaDigest: task.toolSchemaDigest,
    authorizationDigest: task.authorizationDigest,
    verifierContractDigest: task.verifierContractDigest,
    stopConditionDigest: task.stopConditionDigest,
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    allowedTools: task.allowedTools,
    stopContract: task.stopContract,
    sessionId,
  })
  return {
    ...prepared,
    evaluatorMaterialContractDigest: digest(
      task.evaluatorMaterialContractDigest,
      'evaluatorMaterialContractDigest',
    ),
  }
}

function prepareTasks(
  value: unknown,
  evaluation: ControlledSkillEvaluationPlan,
): readonly ControlledSkillShadowTaskInput[] {
  const expectedCount = evaluation.evidencePurpose === 'controlled-product' ? 1 : 5
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new TypeError(`controlled Skill Shadow requires exactly ${expectedCount} tasks`)
  }
  const tasks = value.map(prepareTask)
  if (
    new Set(tasks.map(task => task.taskId)).size !== tasks.length
    || new Set(tasks.map(task => task.sessionId)).size !== tasks.length
    || new Set(tasks.map(task => task.inputDigest)).size !== tasks.length
    || new Set(tasks.map(task => task.workspaceSnapshotDigest)).size !== tasks.length
  ) throw new TypeError('controlled Skill Shadow tasks require distinct identities and material')
  const sourceInputs = new Set(evaluation.tasks.map(task => task.inputDigest))
  const sourceWorkspaces = new Set(evaluation.tasks.map(task => task.workspaceSnapshotDigest))
  const sourceSessions = new Set(evaluation.tasks.flatMap(task => [
    task.baseline.sessionId,
    task.candidate.sessionId,
    task.evaluatorSessionId,
  ]))
  if (tasks.some(task =>
    sourceInputs.has(task.inputDigest)
    || sourceWorkspaces.has(task.workspaceSnapshotDigest)
    || sourceSessions.has(task.sessionId))) {
    throw new TypeError('controlled Skill Shadow tasks must be isolated from source evaluation')
  }
  return tasks
}

function evidenceLabels(claim: ControlledSkillEvaluationEvidenceClaim) {
  return claim === 'controlled-synthetic-mechanism'
    ? ['development-only', 'synthetic-defect'] as const
    : [] as const
}

function derivedScope(
  claim: ControlledSkillEvaluationEvidenceClaim,
  evaluationId: ControlledSkillEvaluationId,
  sourceScopeKey: string,
): string {
  return claim === 'controlled-product'
    ? sourceScopeKey
    : `scope:controlled-skill-isolated:${sha256({ evaluationId, sourceScopeKey })}`
}

function prepareExecution(
  value: unknown,
  tasks: readonly ControlledSkillShadowTaskInput[],
): ControlledSkillEvalExecution {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow execution must be an object')
  exactKeys(value, [
    'dshVersion',
    'providerId',
    'modelId',
    'callConfigDigest',
    'toolSchemaDigest',
    'retryPolicyDigest',
  ])
  if (
    (value.dshVersion !== '0.1.0-rc.7' && value.dshVersion !== '0.1.1-rc.2')
    || typeof value.providerId !== 'string'
    || !SAFE_EXECUTION_ID.test(value.providerId)
    || typeof value.modelId !== 'string'
    || !SAFE_EXECUTION_ID.test(value.modelId)
  ) throw new TypeError('controlled Skill Shadow execution is invalid')
  const expectedTools = sha256(tasks.map(task => ({
    taskId: task.taskId,
    toolSchemaDigest: task.toolSchemaDigest,
  })))
  if (value.toolSchemaDigest !== expectedTools) {
    throw new TypeError('controlled Skill Shadow tool surface is invalid')
  }
  return {
    dshVersion: value.dshVersion,
    providerId: value.providerId,
    modelId: value.modelId,
    callConfigDigest: digest(value.callConfigDigest, 'callConfigDigest'),
    toolSchemaDigest: expectedTools,
    retryPolicyDigest: digest(value.retryPolicyDigest, 'retryPolicyDigest'),
  }
}

function preparePlanRecord(input: {
  readonly evaluationId: unknown
  readonly evaluationPlanDigest: unknown
  readonly evaluationResultDigest: unknown
  readonly candidateId: unknown
  readonly parentVersionId: unknown
  readonly parentPayloadDigest: unknown
  readonly candidateVersionId: unknown
  readonly candidatePayloadDigest: unknown
  readonly sourceScopeKey: unknown
  readonly evidenceClaim: unknown
  readonly evidenceLabels: unknown
  readonly execution: unknown
  readonly tasks: readonly (ControlledSkillShadowTaskInput & {
    readonly evaluatorMaterialContractDigest?: Sha256Digest
  })[]
  readonly review?: ControlledSkillShadowReviewPlan
}): ControlledSkillShadowPlan {
  if (typeof input.evaluationId !== 'string' || !EVALUATION_ID.test(input.evaluationId)) {
    throw new TypeError('controlled Skill Shadow evaluationId is invalid')
  }
  if (typeof input.candidateId !== 'string' || !CANDIDATE_ID.test(input.candidateId)) {
    throw new TypeError('controlled Skill Shadow candidateId is invalid')
  }
  if (typeof input.parentVersionId !== 'string' || !SKILL_VERSION_ID.test(input.parentVersionId)
    || typeof input.candidateVersionId !== 'string'
    || !SKILL_VERSION_ID.test(input.candidateVersionId)) {
    throw new TypeError('controlled Skill Shadow Skill version is invalid')
  }
  if (input.evidenceClaim !== 'controlled-product'
    && input.evidenceClaim !== 'controlled-synthetic-mechanism') {
    throw new TypeError('controlled Skill Shadow evidence claim is invalid')
  }
  const labels = evidenceLabels(input.evidenceClaim)
  if (canonicalJson(input.evidenceLabels) !== canonicalJson(labels)) {
    throw new TypeError('controlled Skill Shadow evidence labels are invalid')
  }
  const sourceScopeKey = safeScopeKey(input.sourceScopeKey, 'sourceScopeKey')
  const evaluationId = input.evaluationId as ControlledSkillEvaluationId
  const evaluationResultDigest = digest(input.evaluationResultDigest, 'evaluationResultDigest')
  const validatedTasks = input.tasks.map(task => structuredClone(task))
  const review = input.review === undefined
    ? undefined
    : {
        sessionId: safeSessionId(input.review.sessionId),
        rubricDigest: digest(input.review.rubricDigest, 'review rubricDigest'),
        configurationDigest: digest(
          input.review.configurationDigest,
          'review configurationDigest',
        ),
        materialContractDigest: digest(
          input.review.materialContractDigest,
          'review materialContractDigest',
        ),
        evidenceContractDigest: digest(
          input.review.evidenceContractDigest,
          'review evidenceContractDigest',
        ),
        sourcePacketDigest: digest(
          input.review.sourcePacketDigest,
          'review sourcePacketDigest',
        ),
      }
  const shadowId = `shadow:${sha256({
    evaluationId,
    evaluationResultDigest,
    validatedTasks,
    ...(review === undefined ? {} : { review }),
  }).slice('sha256:'.length)}` as ControlledSkillShadowId
  const scopeKey = derivedScope(input.evidenceClaim, evaluationId, sourceScopeKey)
  const mode: ControlledSkillShadowMode = input.evidenceClaim === 'controlled-product'
    ? 'project'
    : 'isolated-test'
  const execution = prepareExecution(input.execution, validatedTasks)
  const runIds = new Set<string>()
  const tasks = validatedTasks.map(task => {
    const binding = prepareRunBinding({
      goalRef: `goal:controlled-skill-shadow:${shadowId}`,
      taskRef: `task:${task.taskId}:candidate`,
      sessionId: task.sessionId,
      scopeKey,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    })
    if (!runIds.add(binding.runId)) {
      throw new TypeError('controlled Skill Shadow requires distinct Runs')
    }
    return { ...task, runId: binding.runId }
  })
  const common: ControlledSkillShadowPlanCommon = {
    shadowId,
    evaluationId,
    evaluationPlanDigest: digest(input.evaluationPlanDigest, 'evaluationPlanDigest'),
    evaluationResultDigest,
    candidateId: input.candidateId as GovernedSkillCandidate['candidateId'],
    parentVersionId: input.parentVersionId as SkillVersionId,
    parentPayloadDigest: digest(input.parentPayloadDigest, 'parentPayloadDigest'),
    candidateVersionId: input.candidateVersionId as SkillVersionId,
    candidatePayloadDigest: digest(input.candidatePayloadDigest, 'candidatePayloadDigest'),
    sourceScopeKey,
    scopeKey,
    mode,
    evidenceClaim: input.evidenceClaim as ControlledSkillEvaluationEvidenceClaim,
    evidenceLabels: labels,
    naturalUserEvidence: 'not-claimed',
    execution,
    tasks,
  }
  if (review === undefined) {
    return {
      schemaVersion: 'tianwen.controlled-skill-shadow-plan.v2',
      ...common,
    }
  }
  if (
    tasks.length !== 1
    || review.sessionId === tasks[0]!.sessionId
    || resolveControlledSkillSourceFidelityFamily(review.rubricDigest) === undefined
    || review.sourcePacketDigest !== tasks[0]!.inputDigest
    || !('evaluatorMaterialContractDigest' in tasks[0]!)
  ) throw new TypeError('controlled Skill Shadow v3 review contract is invalid')
  return {
    schemaVersion: 'tianwen.controlled-skill-shadow-plan.v3',
    ...common,
    tasks: tasks as unknown as readonly [ControlledSkillShadowTaskPlanV3],
    review,
  }
}

export function prepareControlledSkillShadowPlan(
  input: OpenControlledSkillShadowInput,
  evaluation: ControlledSkillEvaluationPlan,
  result: ControlledSkillEvaluationResult,
  candidate: GovernedSkillCandidate,
  parentPayloadDigest: Sha256Digest,
  objectives: readonly ControlledSkillEvaluationObjective[],
  observations: readonly ControlledSkillEvaluatorObservation[],
): ControlledSkillShadowPlan {
  if (!isRecord(input)) throw new TypeError('controlled Skill Shadow input must be an object')
  const sourceFidelity = evaluation.schemaVersion
    === 'tianwen.controlled-skill-evaluation-plan.v3'
  exactKeys(input, sourceFidelity
    ? ['evaluationId', 'holdoutSessionId', 'reviewSessionId']
    : ['evaluationId', 'tasks'])
  if (
    input.evaluationId !== evaluation.evaluationId
    || result.evaluationId !== evaluation.evaluationId
    || result.planDigest !== sha256(evaluation)
    || result.mechanismVerdict !== 'pass'
    || result.reasonCode !== 'all-gates-passed'
    || (sourceFidelity
      ? result.schemaVersion !== 'tianwen.controlled-skill-evaluation-result.v3'
      : result.schemaVersion !== 'tianwen.controlled-skill-evaluation-result.v2')
    || result.shadowEligibility === 'ineligible'
    || candidate.candidateId !== evaluation.candidateId
    || candidate.parentVersionId !== evaluation.parentVersionId
    || candidate.payloadDigest !== evaluation.candidatePayloadDigest
    || parentPayloadDigest !== evaluation.parentPayloadDigest
    || objectives.length !== evaluation.tasks.length
    || objectives.some((objective, index) =>
      objective.evaluationId !== evaluation.evaluationId
      || objective.taskId !== evaluation.tasks[index]?.taskId
      || objective.objectiveVerdict !== 'pass'
      || objective.candidate.contentDigest !== sha256(candidate.payload.content))
    || observations.length !== evaluation.tasks.length
    || observations.some((observation, index) =>
      observation.evaluationId !== evaluation.evaluationId
      || observation.taskId !== evaluation.tasks[index]?.taskId
      || observation.status !== 'scored')
  ) throw new TypeError('controlled Skill Shadow requires a complete passing evaluation')
  const candidateVersions = new Set(objectives.map(objective =>
    objective.candidate.skillVersionId))
  if (candidateVersions.size !== 1) {
    throw new TypeError('controlled Skill Shadow Candidate version is inconsistent')
  }
  const tasks = sourceFidelity
    ? [prepareV3Task(
        evaluation.sourceFidelity.holdout.task,
        (input as OpenControlledSkillShadowInputV3).holdoutSessionId,
      )]
    : prepareTasks((input as OpenControlledSkillShadowInputV2).tasks, evaluation)
  if (sourceFidelity) {
    const priorSessions = new Set(evaluation.tasks.flatMap(task => [
      task.baseline.sessionId,
      task.candidate.sessionId,
      task.evaluatorSessionId,
    ]))
    const holdoutSessionId = tasks[0]!.sessionId
    const reviewSessionId = safeSessionId(
      (input as OpenControlledSkillShadowInputV3).reviewSessionId,
    )
    if (priorSessions.has(holdoutSessionId) || priorSessions.has(reviewSessionId)) {
      throw new TypeError('controlled Skill Shadow requires independent holdout Sessions')
    }
  }
  return preparePlanRecord({
    evaluationId: evaluation.evaluationId,
    evaluationPlanDigest: sha256(evaluation),
    evaluationResultDigest: sha256(result),
    candidateId: evaluation.candidateId,
    parentVersionId: evaluation.parentVersionId,
    parentPayloadDigest: evaluation.parentPayloadDigest,
    candidateVersionId: [...candidateVersions][0]!,
    candidatePayloadDigest: evaluation.candidatePayloadDigest,
    sourceScopeKey: evaluation.scopeKey,
    evidenceClaim: result.evidenceClaim,
    evidenceLabels: evaluation.evidenceLabels,
    execution: {
      ...evaluation.execution,
      toolSchemaDigest: sha256(tasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
    },
    tasks,
    ...(sourceFidelity
      ? {
          review: {
            sessionId: safeSessionId(
              (input as OpenControlledSkillShadowInputV3).reviewSessionId,
            ),
            ...evaluation.sourceFidelity.holdout.review,
            sourcePacketDigest: evaluation.sourceFidelity.holdout.task.inputDigest,
          },
        }
      : {}),
  })
}

export function parseControlledSkillShadowPlan(value: unknown): ControlledSkillShadowPlan {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow plan must be an object')
  const isV3 = value.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3'
  exactKeys(value, [
    'schemaVersion',
    'shadowId',
    'evaluationId',
    'evaluationPlanDigest',
    'evaluationResultDigest',
    'candidateId',
    'parentVersionId',
    'parentPayloadDigest',
    'candidateVersionId',
    'candidatePayloadDigest',
    'sourceScopeKey',
    'scopeKey',
    'mode',
    'evidenceClaim',
    'evidenceLabels',
    'naturalUserEvidence',
    'execution',
    'tasks',
    ...(isV3 ? ['review'] : []),
  ])
  if (value.schemaVersion !== 'tianwen.controlled-skill-shadow-plan.v2'
    && !isV3
    || typeof value.shadowId !== 'string'
    || !SHADOW_ID.test(value.shadowId)
    || !Array.isArray(value.tasks)
    || value.naturalUserEvidence !== 'not-claimed') {
    throw new TypeError('controlled Skill Shadow plan is invalid')
  }
  const tasks = value.tasks.map(item => {
    if (!isRecord(item)) throw new TypeError('controlled Skill Shadow plan task is invalid')
    const {
      runId: _runId,
      evaluatorMaterialContractDigest,
      ...task
    } = item
    const prepared = prepareTask(task)
    return isV3
      ? {
          ...prepared,
          evaluatorMaterialContractDigest: digest(
            evaluatorMaterialContractDigest,
            'evaluatorMaterialContractDigest',
          ),
        }
      : prepared
  })
  const prepared = preparePlanRecord({
    evaluationId: value.evaluationId,
    evaluationPlanDigest: value.evaluationPlanDigest,
    evaluationResultDigest: value.evaluationResultDigest,
    candidateId: value.candidateId,
    parentVersionId: value.parentVersionId,
    parentPayloadDigest: value.parentPayloadDigest,
    candidateVersionId: value.candidateVersionId,
    candidatePayloadDigest: value.candidatePayloadDigest,
    sourceScopeKey: value.sourceScopeKey,
    evidenceClaim: value.evidenceClaim,
    evidenceLabels: value.evidenceLabels,
    execution: value.execution,
    tasks,
    ...(isV3
      ? { review: value.review as unknown as ControlledSkillShadowReviewPlan }
      : {}),
  })
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled Skill Shadow plan is not canonical')
  }
  return prepared
}

function prepareUsage(value: unknown): ControlledSkillShadowUsage {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow usage must be an object')
  exactKeys(value, ['modelRequests', 'toolCalls', 'elapsedMs'])
  return {
    modelRequests: boundedInteger(value.modelRequests, 'modelRequests', 1, Number.MAX_SAFE_INTEGER),
    toolCalls: boundedInteger(value.toolCalls, 'toolCalls', 0, Number.MAX_SAFE_INTEGER),
    elapsedMs: boundedInteger(value.elapsedMs, 'elapsedMs', 0, Number.MAX_SAFE_INTEGER),
  }
}

function prepareUsedToolNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError('controlled Skill Shadow usedToolNames must be an array')
  const tools = value.map(item => {
    if (typeof item !== 'string' || !SAFE_TOOL_ID.test(item)) {
      throw new TypeError('controlled Skill Shadow usedToolNames are invalid')
    }
    return item
  })
  const canonical = [...new Set(tools)].sort((left, right) => left.localeCompare(right))
  if (canonicalJson(tools) !== canonicalJson(canonical)) {
    throw new TypeError('controlled Skill Shadow usedToolNames must be sorted and unique')
  }
  return canonical
}

function prepareRun(
  value: unknown,
  task?: ControlledSkillShadowTaskPlan,
  plan?: ControlledSkillShadowPlan,
  requiresSourceFidelity = plan?.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3',
): ControlledSkillShadowRun {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow run must be an object')
  exactKeys(value, [
    'taskId',
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
    ...(requiresSourceFidelity ? ['evaluatorMaterialDigest'] : []),
  ])
  if (typeof value.taskId !== 'string' || !TASK_ID.test(value.taskId)
    || typeof value.runId !== 'string' || !RUN_ID.test(value.runId)
    || typeof value.skillVersionId !== 'string' || !SKILL_VERSION_ID.test(value.skillVersionId)
    || (value.outcome !== 'met' && value.outcome !== 'not-met' && value.outcome !== 'inconclusive')
    || !Array.isArray(value.evidenceIds) || value.evidenceIds.length === 0) {
    throw new TypeError('controlled Skill Shadow run is invalid')
  }
  const common: ControlledSkillShadowRunV2 = {
    taskId: value.taskId as ControlledSkillShadowTaskId,
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
    usedToolNames: prepareUsedToolNames(value.usedToolNames),
    usage: prepareUsage(value.usage),
  }
  const prepared: ControlledSkillShadowRun = requiresSourceFidelity
    ? {
        ...common,
        evaluatorMaterialDigest: digest(
          value.evaluatorMaterialDigest,
          'evaluatorMaterialDigest',
        ),
      }
    : common
  if (task !== undefined && plan !== undefined && (
    prepared.taskId !== task.taskId
    || prepared.runId !== task.runId
    || prepared.sessionId !== task.sessionId
    || prepared.skillVersionId !== plan.candidateVersionId
    || prepared.acceptanceSubjectDigest !== task.acceptanceSubjectDigest
    || prepared.executionManifestDigest !== controlledSkillShadowExecutionManifestDigest(plan, task)
    || prepared.usedToolNames.some(tool => !task.allowedTools.includes(tool))
    || !prepared.usedToolNames.includes('skill')
    || !prepared.usedToolNames.includes(task.acceptanceContract.toolName)
    || prepared.usage.toolCalls > task.stopContract.maxToolCalls
    || prepared.usage.elapsedMs > task.stopContract.maxElapsedMs
  )) throw new TypeError('controlled Skill Shadow run violates its plan')
  return prepared
}

export function controlledSkillShadowExecutionManifestDigest(
  plan: ControlledSkillShadowPlan,
  task: ControlledSkillShadowTaskPlan,
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
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    allowedTools: task.allowedTools,
    stopContract: task.stopContract,
    ...(plan.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3'
      ? {
          evaluatorMaterialContractDigest:
            (task as ControlledSkillShadowTaskPlanV3)
              .evaluatorMaterialContractDigest,
        }
      : {}),
  })
}

function prepareReviewScores(
  value: unknown,
): ControlledSkillEvaluatorDimensionScoresV3 {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow review scores must be an object')
  exactKeys(value, CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS)
  return {
    relevance: boundedInteger(value.relevance, 'relevance', 0, 4),
    correctnessReasoning: boundedInteger(
      value.correctnessReasoning,
      'correctnessReasoning',
      0,
      4,
    ),
    clarityUsability: boundedInteger(value.clarityUsability, 'clarityUsability', 0, 4),
    scopeRestraint: boundedInteger(value.scopeRestraint, 'scopeRestraint', 0, 4),
    sourceFidelity: boundedInteger(value.sourceFidelity, 'sourceFidelity', 0, 4),
  }
}

export function prepareControlledSkillShadowReviewObservation(
  input: RecordControlledSkillShadowReviewObservationInput,
  plan: ControlledSkillShadowPlan,
): ControlledSkillShadowReviewObservation {
  if (!isRecord(input) || plan.schemaVersion !== 'tianwen.controlled-skill-shadow-plan.v3') {
    throw new TypeError('controlled Skill Shadow review requires a v3 plan')
  }
  const commonKeys = [
    'shadowId',
    'reviewerSessionId',
    'requestDigest',
    'evidenceId',
    'acceptanceEvidenceId',
    'acceptedMaterialDigest',
    'reviewedRun',
    'status',
    'insufficientMaterial',
    'reasonCode',
  ]
  exactKeys(input, input.status === 'scored'
    ? [...commonKeys, 'scores']
    : commonKeys)
  const run = prepareRun(input.reviewedRun, plan.tasks[0], plan, true) as ControlledSkillShadowRunV3
  const acceptedMaterialDigest = digest(
    input.acceptedMaterialDigest,
    'acceptedMaterialDigest',
  )
  const acceptanceEvidenceId = digest(
    input.acceptanceEvidenceId,
    'acceptanceEvidenceId',
  )
  if (
    input.shadowId !== plan.shadowId
    || safeSessionId(input.reviewerSessionId) !== plan.review.sessionId
    || run.outcome !== 'met'
    || run.evaluatorMaterialDigest !== acceptedMaterialDigest
    || !run.evidenceIds.includes(acceptanceEvidenceId)
  ) throw new TypeError('controlled Skill Shadow observation disagrees with frozen review or accepted material')
  const common: ControlledSkillShadowReviewObservationCommon = {
    schemaVersion: 'tianwen.controlled-skill-shadow-review-observation.v1' as const,
    shadowId: plan.shadowId,
    planDigest: sha256(plan),
    taskId: run.taskId,
    runId: run.runId,
    reviewerSessionId: plan.review.sessionId,
    rubricDigest: plan.review.rubricDigest,
    configurationDigest: plan.review.configurationDigest,
    materialContractDigest: plan.review.materialContractDigest,
    evidenceContractDigest: plan.review.evidenceContractDigest,
    sourcePacketDigest: plan.review.sourcePacketDigest,
    requestDigest: digest(input.requestDigest, 'review requestDigest'),
    evidenceId: digest(input.evidenceId, 'review evidenceId'),
    acceptanceEvidenceId,
    acceptedMaterialDigest,
    reviewedRun: run,
    reviewedRunDigest: sha256(run),
  }
  if (input.status === 'scored') {
    if (input.insufficientMaterial !== false || input.reasonCode !== 'score-submitted') {
      throw new TypeError('controlled Skill Shadow scored review is invalid')
    }
    return {
      ...common,
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: prepareReviewScores(input.scores),
    }
  }
  if (
    input.status !== 'inconclusive'
    || input.insufficientMaterial !== true
    || ![
      'material-missing',
      'identity-exposed',
      'provider-failed',
      'timeout',
      'score-not-submitted',
      'evidence-mismatch',
    ].includes(input.reasonCode)
  ) throw new TypeError('controlled Skill Shadow inconclusive review is invalid')
  return {
    ...common,
    status: 'inconclusive',
    insufficientMaterial: true,
    reasonCode: input.reasonCode,
  }
}

export function parseControlledSkillShadowReviewObservation(
  value: unknown,
): ControlledSkillShadowReviewObservation {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow review observation must be an object')
  const commonKeys = [
    'schemaVersion',
    'shadowId',
    'planDigest',
    'taskId',
    'runId',
    'reviewerSessionId',
    'rubricDigest',
    'configurationDigest',
    'materialContractDigest',
    'evidenceContractDigest',
    'sourcePacketDigest',
    'requestDigest',
    'evidenceId',
    'acceptanceEvidenceId',
    'acceptedMaterialDigest',
    'reviewedRun',
    'reviewedRunDigest',
    'status',
    'insufficientMaterial',
    'reasonCode',
  ]
  exactKeys(value, value.status === 'scored' ? [...commonKeys, 'scores'] : commonKeys)
  if (
    value.schemaVersion !== 'tianwen.controlled-skill-shadow-review-observation.v1'
    || typeof value.shadowId !== 'string'
    || !SHADOW_ID.test(value.shadowId)
    || typeof value.taskId !== 'string'
    || !TASK_ID.test(value.taskId)
    || typeof value.runId !== 'string'
    || !RUN_ID.test(value.runId)
  ) throw new TypeError('controlled Skill Shadow review observation is invalid')
  const run = prepareRun(value.reviewedRun, undefined, undefined, true) as ControlledSkillShadowRunV3
  const common: ControlledSkillShadowReviewObservationCommon = {
    schemaVersion: 'tianwen.controlled-skill-shadow-review-observation.v1' as const,
    shadowId: value.shadowId as ControlledSkillShadowId,
    planDigest: digest(value.planDigest, 'planDigest'),
    taskId: value.taskId as ControlledSkillShadowTaskId,
    runId: value.runId as TianwenRunId,
    reviewerSessionId: safeSessionId(value.reviewerSessionId),
    rubricDigest: digest(value.rubricDigest, 'rubricDigest'),
    configurationDigest: digest(value.configurationDigest, 'configurationDigest'),
    materialContractDigest: digest(value.materialContractDigest, 'materialContractDigest'),
    evidenceContractDigest: digest(value.evidenceContractDigest, 'evidenceContractDigest'),
    sourcePacketDigest: digest(value.sourcePacketDigest, 'sourcePacketDigest'),
    requestDigest: digest(value.requestDigest, 'requestDigest'),
    evidenceId: digest(value.evidenceId, 'evidenceId'),
    acceptanceEvidenceId: digest(value.acceptanceEvidenceId, 'acceptanceEvidenceId'),
    acceptedMaterialDigest: digest(value.acceptedMaterialDigest, 'acceptedMaterialDigest'),
    reviewedRun: run,
    reviewedRunDigest: digest(value.reviewedRunDigest, 'reviewedRunDigest'),
  }
  if (
    common.taskId !== run.taskId
    || common.runId !== run.runId
    || common.acceptedMaterialDigest !== run.evaluatorMaterialDigest
    || common.reviewedRunDigest !== sha256(run)
    || !run.evidenceIds.includes(common.acceptanceEvidenceId)
  ) throw new TypeError('controlled Skill Shadow review observation binding is invalid')
  if (value.status !== 'scored' && (
    value.status !== 'inconclusive'
    || value.insufficientMaterial !== true
    || ![
      'material-missing',
      'identity-exposed',
      'provider-failed',
      'timeout',
      'score-not-submitted',
      'evidence-mismatch',
    ].includes(value.reasonCode as string)
  )) throw new TypeError('controlled Skill Shadow review observation status is invalid')
  if (value.status === 'scored' && (
    value.insufficientMaterial !== false
    || value.reasonCode !== 'score-submitted'
  )) throw new TypeError('controlled Skill Shadow scored review is invalid')
  const prepared: ControlledSkillShadowReviewObservation = value.status === 'scored'
    ? {
        ...common,
        status: 'scored',
        insufficientMaterial: false,
        reasonCode: 'score-submitted',
        scores: prepareReviewScores(value.scores),
      }
    : {
        ...common,
        status: 'inconclusive',
        insufficientMaterial: true,
        reasonCode: value.reasonCode as ControlledSkillShadowReviewInconclusiveReasonCode,
      }
  if (canonicalJson(prepared) !== canonicalJson(value)) {
    throw new TypeError('controlled Skill Shadow review observation is not canonical')
  }
  return prepared
}

export function prepareControlledSkillShadowResult(
  input: RecordControlledSkillShadowResultInput,
  plan: ControlledSkillShadowPlan,
  reviewObservation?: ControlledSkillShadowReviewObservation,
): ControlledSkillShadowResult {
  if (!isRecord(input)) throw new TypeError('controlled Skill Shadow result input must be an object')
  exactKeys(input, ['shadowId', 'runs'])
  if (input.shadowId !== plan.shadowId || !Array.isArray(input.runs)
    || input.runs.length === 0 || input.runs.length > plan.tasks.length) {
    throw new TypeError('controlled Skill Shadow result disagrees with its plan')
  }
  const runs = input.runs.map((run, index) => prepareRun(run, plan.tasks[index], plan))
  const terminalIndex = runs.findIndex(run => run.outcome !== 'met')
  if (terminalIndex >= 0 && terminalIndex !== runs.length - 1) {
    throw new TypeError('controlled Skill Shadow terminal run must end the prefix')
  }
  let mechanismVerdict: ControlledSkillShadowMechanismVerdict
  let reasonCode: ControlledSkillShadowResultReasonCode
  if (terminalIndex >= 0) {
    const terminal = runs[terminalIndex]!
    mechanismVerdict = terminal.outcome === 'not-met' ? 'rejected' : 'inconclusive'
    reasonCode = terminal.outcome === 'not-met'
      ? 'candidate-shadow-not-met'
      : 'candidate-shadow-inconclusive'
  } else {
    if (runs.length !== plan.tasks.length) {
      throw new TypeError('controlled Skill Shadow result is incomplete')
    }
    if (plan.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3') {
      if (reviewObservation === undefined) {
        throw new TypeError('controlled Skill Shadow review observation is required')
      }
      if (
        reviewObservation.shadowId !== plan.shadowId
        || reviewObservation.planDigest !== sha256(plan)
        || reviewObservation.reviewedRunDigest !== sha256(runs[0])
        || reviewObservation.reviewedRun.evaluatorMaterialDigest
          !== (runs[0] as ControlledSkillShadowRunV3).evaluatorMaterialDigest
      ) throw new TypeError('controlled Skill Shadow result disagrees with its reviewed Run')
      if (reviewObservation.status === 'inconclusive') {
        mechanismVerdict = 'inconclusive'
        reasonCode = 'holdout-review-inconclusive'
      } else if (CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS.some(key =>
        reviewObservation.scores[key]
          < CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.holdoutMinimumDimensionScore)) {
        mechanismVerdict = 'rejected'
        reasonCode = 'holdout-quality-threshold-failed'
      } else {
        mechanismVerdict = 'pass'
        reasonCode = 'all-shadow-runs-qualified'
      }
    } else {
      mechanismVerdict = 'pass'
      reasonCode = 'all-shadow-runs-qualified'
    }
  }
  const promotionEligibility: ControlledSkillShadowPromotionEligibility =
    mechanismVerdict !== 'pass'
      ? 'ineligible'
      : plan.mode === 'project'
        ? 'eligible-for-project-promotion'
        : 'eligible-for-isolated-test-promotion'
  const common: ControlledSkillShadowResultCommon = {
    shadowId: plan.shadowId,
    planDigest: sha256(plan),
    evaluationId: plan.evaluationId,
    evaluationPlanDigest: plan.evaluationPlanDigest,
    evaluationResultDigest: plan.evaluationResultDigest,
    runs,
    mechanismVerdict,
    reasonCode,
    evidenceClaim: plan.evidenceClaim,
    evidenceLabels: plan.evidenceLabels,
    naturalUserEvidence: 'not-claimed',
    promotionEligibility,
  }
  return plan.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3'
    ? {
        schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
        ...common,
        reviewObservationDigest: reviewObservation === undefined
          ? null
          : sha256(reviewObservation),
      }
    : {
        schemaVersion: 'tianwen.controlled-skill-shadow-result.v2',
        ...common,
      }
}

export function parseControlledSkillShadowResult(value: unknown): ControlledSkillShadowResult {
  if (!isRecord(value)) throw new TypeError('controlled Skill Shadow result must be an object')
  const isV3 = value.schemaVersion === 'tianwen.controlled-skill-shadow-result.v3'
  exactKeys(value, [
    'schemaVersion',
    'shadowId',
    'planDigest',
    'evaluationId',
    'evaluationPlanDigest',
    'evaluationResultDigest',
    'runs',
    'mechanismVerdict',
    'reasonCode',
    'evidenceClaim',
    'evidenceLabels',
    'naturalUserEvidence',
    'promotionEligibility',
    ...(isV3 ? ['reviewObservationDigest'] : []),
  ])
  if (value.schemaVersion !== 'tianwen.controlled-skill-shadow-result.v2'
    && !isV3
    || typeof value.shadowId !== 'string' || !SHADOW_ID.test(value.shadowId)
    || typeof value.evaluationId !== 'string' || !EVALUATION_ID.test(value.evaluationId)
    || !Array.isArray(value.runs) || value.runs.length === 0 || value.runs.length > 5
    || value.naturalUserEvidence !== 'not-claimed'
    || (value.evidenceClaim !== 'controlled-product'
      && value.evidenceClaim !== 'controlled-synthetic-mechanism')) {
    throw new TypeError('controlled Skill Shadow result is invalid')
  }
  const runs = value.runs.map(item => prepareRun(item, undefined, undefined, isV3))
  const expectedCount = isV3
    ? 1
    : value.evidenceClaim === 'controlled-product' ? 1 : 5
  const terminalIndex = runs.findIndex(run => run.outcome !== 'met')
  const derivedTerminalVerdict = terminalIndex < 0
    ? undefined
    : runs[terminalIndex]!.outcome === 'not-met' ? 'rejected' : 'inconclusive'
  const derivedTerminalReason = derivedTerminalVerdict === 'rejected'
      ? 'candidate-shadow-not-met'
      : derivedTerminalVerdict === 'inconclusive'
        ? 'candidate-shadow-inconclusive'
        : undefined
  const completedV3Review = isV3
    && terminalIndex < 0
    && runs.length === expectedCount
    && value.reviewObservationDigest !== null
    && (
      value.mechanismVerdict === 'pass'
        && value.reasonCode === 'all-shadow-runs-qualified'
      || value.mechanismVerdict === 'rejected'
        && value.reasonCode === 'holdout-quality-threshold-failed'
      || value.mechanismVerdict === 'inconclusive'
        && value.reasonCode === 'holdout-review-inconclusive'
    )
  const verdict = derivedTerminalVerdict
    ?? (isV3
      ? completedV3Review ? value.mechanismVerdict : undefined
      : runs.length === expectedCount ? 'pass' : undefined)
  const reason = derivedTerminalReason
    ?? (isV3
      ? completedV3Review ? value.reasonCode : undefined
      : verdict === 'pass' ? 'all-shadow-runs-qualified' : undefined)
  const eligibility = verdict !== 'pass'
    ? 'ineligible'
    : value.evidenceClaim === 'controlled-product'
      ? 'eligible-for-project-promotion'
      : 'eligible-for-isolated-test-promotion'
  if (
    (terminalIndex >= 0 && terminalIndex !== runs.length - 1)
    || verdict === undefined
    || reason === undefined
    || value.mechanismVerdict !== verdict
    || value.reasonCode !== reason
    || value.promotionEligibility !== eligibility
    || (isV3 && terminalIndex >= 0 && value.reviewObservationDigest !== null)
    || canonicalJson(value.evidenceLabels) !== canonicalJson(evidenceLabels(value.evidenceClaim))
  ) throw new TypeError('controlled Skill Shadow result is not canonical')
  const common: ControlledSkillShadowResultCommon = {
    shadowId: value.shadowId as ControlledSkillShadowId,
    planDigest: digest(value.planDigest, 'planDigest'),
    evaluationId: value.evaluationId as ControlledSkillEvaluationId,
    evaluationPlanDigest: digest(value.evaluationPlanDigest, 'evaluationPlanDigest'),
    evaluationResultDigest: digest(value.evaluationResultDigest, 'evaluationResultDigest'),
    runs,
    mechanismVerdict: verdict as ControlledSkillShadowMechanismVerdict,
    reasonCode: reason as ControlledSkillShadowResultReasonCode,
    evidenceClaim: value.evidenceClaim as ControlledSkillEvaluationEvidenceClaim,
    evidenceLabels: evidenceLabels(value.evidenceClaim),
    naturalUserEvidence: 'not-claimed',
    promotionEligibility: eligibility,
  }
  return isV3
    ? {
        schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
        ...common,
        reviewObservationDigest: value.reviewObservationDigest === null
          ? null
          : digest(value.reviewObservationDigest, 'reviewObservationDigest'),
      }
    : {
        schemaVersion: 'tianwen.controlled-skill-shadow-result.v2',
        ...common,
      }
}
