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
    readonly permissionDigest: Sha256Digest
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

const DIGEST = /^sha256:[a-f0-9]{64}$/u
const TICKET_ID = /^ticket:[a-f0-9]{64}$/u
const CASE_ID = /^eval-case:[a-z0-9][a-z0-9-]{0,63}$/u
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
    'permissionDigest',
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
      permissionDigest: digest(value.execution.permissionDigest, 'permissionDigest'),
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
