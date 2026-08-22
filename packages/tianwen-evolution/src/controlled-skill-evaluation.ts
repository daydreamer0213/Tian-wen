import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import type {
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeLearningSignal,
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
  readonly dshVersion: '0.1.0-rc.7'
  readonly providerId: string
  readonly modelId: string
  readonly callConfigDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  readonly retryPolicyDigest: Sha256Digest
}

export interface ControlledSkillEvalProtocol {
  readonly rubricDigest: Sha256Digest
  readonly tasks: readonly ControlledSkillEvalTask[]
  readonly execution: ControlledSkillEvalExecution
}

export interface FreezeControlledSkillEvalProtocolInput {
  readonly ticketId: LearningTicketId
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly protocol: ControlledSkillEvalProtocol
}

export interface ControlledSkillEvalProtocolRecord {
  readonly schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2'
  readonly protocolId: SkillEvalProtocolId
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly provenance: ControlledSkillEvalProtocolProvenance
  readonly evidencePurpose: ControlledSkillEvalEvidencePurpose
  readonly evidenceLabels: readonly ControlledSkillEvalEvidenceLabel[]
  readonly protocol: ControlledSkillEvalProtocol
}

export interface ControlledSkillEvalProtocolReceipt {
  readonly protocolId: SkillEvalProtocolId
  readonly provenance: ControlledSkillEvalProtocolProvenance
  readonly duplicate: boolean
}

export interface ControlledSkillEvalProtocolFrozenEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2'
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

export interface ControlledSkillEvaluationPlan {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2'
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

export interface ControlledSkillEvaluationReceipt {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly duplicate: boolean
}

export interface ControlledSkillEvaluationOpenedEvent {
  readonly schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2'
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
  if (value.dshVersion !== '0.1.0-rc.7') {
    throw new TypeError('controlled evaluation requires DSH 0.1.0-rc.7')
  }
  return {
    dshVersion: '0.1.0-rc.7',
    providerId: safeExecutionId(value.providerId, 'providerId'),
    modelId: safeExecutionId(value.modelId, 'modelId'),
    callConfigDigest: digest(value.callConfigDigest, 'callConfigDigest'),
    toolSchemaDigest: digest(value.toolSchemaDigest, 'toolSchemaDigest'),
    retryPolicyDigest: digest(value.retryPolicyDigest, 'retryPolicyDigest'),
  }
}

function prepareProtocol(value: unknown): ControlledSkillEvalProtocol {
  if (!isRecord(value)) throw new TypeError('controlled evaluation protocol must be an object')
  exactKeys(value, ['rubricDigest', 'tasks', 'execution'])
  if (value.rubricDigest !== CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST) {
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
  return {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks,
    execution: prepareExecution(value.execution),
  }
}

function deriveScope(
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
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
  return {
    schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    protocolId: `eval-protocol:${identity.slice('sha256:'.length)}`,
    ticketId: ticketId as LearningTicketId,
    scopeKey,
    provenance,
    evidencePurpose: purpose,
    evidenceLabels: labels,
    protocol,
  }
}

export function prepareControlledSkillEvalProtocol(
  input: FreezeControlledSkillEvalProtocolInput,
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
  provenance: ControlledSkillEvalProtocolProvenance,
): ControlledSkillEvalProtocolRecord {
  if (!isRecord(input)) throw new TypeError('controlled evaluation protocol input must be an object')
  exactKeys(input, ['ticketId', 'evidencePurpose', 'protocol'])
  if (input.ticketId !== ticket.ticketId) {
    throw new TypeError('controlled evaluation protocol references another Ticket')
  }
  const scopeKey = deriveScope(ticket, signals)
  return prepareRecord(
    input.ticketId,
    scopeKey,
    provenance,
    input.evidencePurpose,
    input.protocol,
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
  if (value.schemaVersion !== 'tianwen.controlled-skill-eval-protocol.v2') {
    throw new TypeError('controlled evaluation protocol has an invalid schema version')
  }
  const prepared = prepareRecord(
    value.ticketId,
    value.scopeKey,
    value.provenance,
    value.evidencePurpose,
    value.protocol,
  )
  if (canonicalJson(prepared) !== canonicalJson(value)) {
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
  return value.map((row, index) => {
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
    if (!sessionIds.add(evaluatorSessionId)) {
      throw new TypeError('controlled evaluation requires distinct execution and evaluator Sessions')
    }
    return {
      ...structuredClone(task),
      baseline,
      candidate,
      evaluatorSessionId,
    }
  })
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
  const body = {
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
  const identity = sha256(body)
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2',
    evaluationId: `evaluation:${identity.slice('sha256:'.length)}`,
    ...body,
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
  ])
  if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-plan.v2') {
    throw new TypeError('controlled evaluation plan has an invalid schema version')
  }
  if (typeof value.evaluationId !== 'string' || !EVALUATION_ID.test(value.evaluationId)) {
    throw new TypeError('controlled evaluation plan has an invalid identity')
  }
  if (!Array.isArray(value.tasks)) throw new TypeError('controlled evaluation plan tasks must be an array')
  const protocol = prepareProtocol({
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: value.tasks.map(task => {
      if (!isRecord(task)) throw new TypeError('controlled evaluation plan task must be an object')
      const copy = { ...task }
      delete copy.baseline
      delete copy.candidate
      delete copy.evaluatorSessionId
      return copy
    }),
    execution: value.execution,
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
