import type { Sha256Digest } from './ledger.js'
import { sha256 } from './learning-intake.js'
import type {
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'
import { prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeLearningSignal,
  RunAcceptanceContract,
} from './outcome-intake.js'
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

export interface ControlledSkillEvalLimits {
  readonly maxModelRequests: number
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
  readonly limits: ControlledSkillEvalLimits
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

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const TICKET_ID = /^ticket:[a-zA-Z0-9._:-]+$/u
const TASK_ID = /^eval-task:[a-z0-9][a-z0-9._-]{0,96}$/u
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

function prepareLimits(value: unknown): ControlledSkillEvalLimits {
  if (!isRecord(value)) throw new TypeError('task limits must be an object')
  exactKeys(value, ['maxModelRequests', 'maxToolCalls', 'maxElapsedMs'])
  return {
    maxModelRequests: boundedInteger(value.maxModelRequests, 'maxModelRequests', 1, 64),
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
    'limits',
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
    limits: prepareLimits(value.limits),
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

export function prepareControlledSkillEvalProtocol(
  input: FreezeControlledSkillEvalProtocolInput,
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
  provenance: ControlledSkillEvalProtocolProvenance,
): ControlledSkillEvalProtocolRecord {
  if (!isRecord(input)) throw new TypeError('controlled evaluation protocol input must be an object')
  exactKeys(input, ['ticketId', 'evidencePurpose', 'protocol'])
  if (typeof input.ticketId !== 'string' || !TICKET_ID.test(input.ticketId)) {
    throw new TypeError('ticketId must be a Learning Ticket ID')
  }
  if (input.ticketId !== ticket.ticketId) {
    throw new TypeError('controlled evaluation protocol references another Ticket')
  }
  if (
    input.evidencePurpose !== 'controlled-product'
    && input.evidencePurpose !== 'development-only-synthetic-defect'
  ) {
    throw new TypeError('controlled evaluation evidence purpose is invalid')
  }
  if (provenance !== 'pre-candidate' && provenance !== 'retrospective') {
    throw new TypeError('controlled evaluation protocol provenance is invalid')
  }
  const scopeKey = deriveScope(ticket, signals)
  const protocol = prepareProtocol(input.protocol)
  const labels = evidenceLabels(input.evidencePurpose)
  const identity = sha256({
    ticketId: ticket.ticketId,
    scopeKey,
    evidencePurpose: input.evidencePurpose,
    evidenceLabels: labels,
    protocol,
  })
  return {
    schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
    protocolId: `eval-protocol:${identity.slice('sha256:'.length)}`,
    ticketId: ticket.ticketId,
    scopeKey,
    provenance,
    evidencePurpose: input.evidencePurpose,
    evidenceLabels: labels,
    protocol,
  }
}
