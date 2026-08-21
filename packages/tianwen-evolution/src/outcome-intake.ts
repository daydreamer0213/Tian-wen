import type { Sha256Digest } from './ledger.js'
import { normalizeLearningText, sha256 } from './learning-intake.js'
import type {
  LearningSignalId,
  LearningTicketId,
} from './learning-intake.js'

export type TianwenRunId = `run:${string}`
export type OutcomeSeverity = 1 | 2 | 3 | 4 | 5

interface ToolAcceptanceBase {
  readonly source: 'dsh-tool-result'
  readonly toolName: string
  readonly notMetErrorCode: string
}

export type RunAcceptanceContract =
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'observe' | 'ordinary-correction'
    })
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'reusable'
      readonly problemCategory: string
      readonly severity: OutcomeSeverity
      readonly blocksGoal: boolean
    })

export interface RunBindingInputV1 {
  readonly goalRef: string
  readonly taskRef: string
  readonly sessionId: string
  readonly scopeKey: string
  readonly acceptanceContract: RunAcceptanceContract
}

export interface RunBindingInputV2 extends RunBindingInputV1 {
  readonly acceptanceSubjectDigest: Sha256Digest
}

export type RunBindingInput = RunBindingInputV1 | RunBindingInputV2

export interface TianwenRunBindingV1 extends RunBindingInputV1 {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export interface TianwenRunBindingV2 extends RunBindingInputV2 {
  readonly schemaVersion: 'tianwen.run-binding.v2'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export type TianwenRunBinding = TianwenRunBindingV1 | TianwenRunBindingV2

export interface RunBindingReceipt {
  readonly runId: TianwenRunId
  readonly duplicate: boolean
}

export interface RunBindingRecordedEvent {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly type: 'run-binding-recorded'
  readonly at: string
  readonly binding: TianwenRunBinding
  readonly inputDigest: Sha256Digest
}

export type OutcomeVerdict = 'met' | 'not-met' | 'inconclusive'

export interface OutcomeIntakeInput {
  readonly runId: TianwenRunId
  readonly verdict: OutcomeVerdict
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface OutcomeLearningSignal {
  readonly signalId: LearningSignalId
  readonly ingestionId: Sha256Digest
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly scopeKey: string
  readonly problemFingerprint: Sha256Digest
  readonly problemCategory: string
  readonly failureSignature: Sha256Digest
  readonly severity: OutcomeSeverity
  readonly blocksGoal: boolean
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface OutcomeIntakeReceipt {
  readonly decision:
    | 'no-case'
    | 'continue-observing'
    | 'ordinary-correction'
    | 'signal-recorded'
    | 'ticket-created'
    | 'ticket-merged'
  readonly ingestionId: Sha256Digest
  readonly signalId?: LearningSignalId
  readonly ticketId?: LearningTicketId
  readonly duplicate: boolean
}

export interface OutcomeIntakeRecordedEvent {
  readonly schemaVersion: 'tianwen.outcome-intake.v1'
  readonly type: 'outcome-intake-recorded'
  readonly at: string
  readonly input: OutcomeIntakeInput
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<OutcomeIntakeReceipt, 'duplicate'>
  readonly signal?: OutcomeLearningSignal
}

export type PreparedOutcomeIntake =
  | {
      readonly kind: 'no-signal'
      readonly decision:
        | 'no-case'
        | 'continue-observing'
        | 'ordinary-correction'
      readonly ingestionId: Sha256Digest
      readonly inputDigest: Sha256Digest
    }
  | {
      readonly kind: 'reusable'
      readonly ingestionId: Sha256Digest
      readonly inputDigest: Sha256Digest
      readonly signalId: LearningSignalId
      readonly ticketId: LearningTicketId
      readonly problemFingerprint: Sha256Digest
      readonly failureSignature: Sha256Digest
      readonly problemCategory: string
      readonly severity: OutcomeSeverity
      readonly blocksGoal: boolean
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value)
  if (
    keys.length !== expected.length ||
    expected.some(key => !(key in value)) ||
    keys.some(key => !expected.includes(key))
  ) {
    throw new TypeError('Run binding input has an invalid shape')
  }
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`)
  }
  return value.trim()
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u

function requireDigest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return value as Sha256Digest
}

export function prepareRunAcceptanceContract(
  value: unknown,
): RunAcceptanceContract {
  if (!isRecord(value)) {
    throw new TypeError('acceptanceContract must be an object')
  }
  if (value.source !== 'dsh-tool-result') {
    throw new TypeError('acceptanceContract source must be dsh-tool-result')
  }
  const toolName = nonBlank(value.toolName, 'toolName')
  const notMetErrorCode = nonBlank(
    value.notMetErrorCode,
    'notMetErrorCode',
  )
  const gapDisposition = value.gapDisposition
  let acceptanceContract: RunAcceptanceContract
  if (
    gapDisposition === 'observe' ||
    gapDisposition === 'ordinary-correction'
  ) {
    exactKeys(value, [
      'source',
      'toolName',
      'notMetErrorCode',
      'gapDisposition',
    ])
    acceptanceContract = {
      source: 'dsh-tool-result',
      toolName,
      notMetErrorCode,
      gapDisposition,
    }
  } else if (gapDisposition === 'reusable') {
    exactKeys(value, [
      'source',
      'toolName',
      'notMetErrorCode',
      'gapDisposition',
      'problemCategory',
      'severity',
      'blocksGoal',
    ])
    const problemCategory = normalizeLearningText(
      nonBlank(value.problemCategory, 'problemCategory'),
    )
    if (
      !Number.isInteger(value.severity) ||
      (value.severity as number) < 1 ||
      (value.severity as number) > 5
    ) {
      throw new TypeError('severity must be an integer from 1 to 5')
    }
    if (typeof value.blocksGoal !== 'boolean') {
      throw new TypeError('blocksGoal must be a boolean')
    }
    acceptanceContract = {
      source: 'dsh-tool-result',
      toolName,
      notMetErrorCode,
      gapDisposition,
      problemCategory,
      severity: value.severity as OutcomeSeverity,
      blocksGoal: value.blocksGoal,
    }
  } else {
    throw new TypeError('acceptanceContract has an invalid gapDisposition')
  }
  return acceptanceContract
}

function validateRunBindingInput(input: RunBindingInput): RunBindingInput {
  if (!isRecord(input)) {
    throw new TypeError('Run binding input must be an object')
  }
  const isV2 = 'acceptanceSubjectDigest' in input
  exactKeys(input, [
    'goalRef',
    'taskRef',
    'sessionId',
    'scopeKey',
    'acceptanceContract',
    ...(isV2 ? ['acceptanceSubjectDigest'] : []),
  ])
  const common: RunBindingInputV1 = {
    goalRef: nonBlank(input.goalRef, 'goalRef'),
    taskRef: nonBlank(input.taskRef, 'taskRef'),
    sessionId: nonBlank(input.sessionId, 'sessionId'),
    scopeKey: nonBlank(input.scopeKey, 'scopeKey'),
    acceptanceContract: prepareRunAcceptanceContract(input.acceptanceContract),
  }
  return isV2
    ? {
        ...common,
        acceptanceSubjectDigest: requireDigest(
          input.acceptanceSubjectDigest,
          'acceptanceSubjectDigest',
        ),
      }
    : common
}

export function prepareRunBinding(input: RunBindingInput): TianwenRunBinding {
  const validated = validateRunBindingInput(input)
  const acceptanceContractDigest = sha256(validated.acceptanceContract)
  const runDigest = sha256({
    goalRef: validated.goalRef,
    taskRef: validated.taskRef,
    sessionId: validated.sessionId,
    scopeKey: validated.scopeKey,
    acceptanceContractDigest,
    ...('acceptanceSubjectDigest' in validated ? {
      acceptanceSubjectDigest: validated.acceptanceSubjectDigest,
    } : {}),
  })
  const runId = `run:${runDigest.slice('sha256:'.length)}` as TianwenRunId
  return 'acceptanceSubjectDigest' in validated
    ? {
        schemaVersion: 'tianwen.run-binding.v2',
        runId,
        ...validated,
        acceptanceContractDigest,
      }
    : {
        schemaVersion: 'tianwen.run-binding.v1',
        runId,
        ...validated,
        acceptanceContractDigest,
      }
}

function validateOutcomeInput(input: OutcomeIntakeInput): OutcomeIntakeInput {
  if (!isRecord(input)) {
    throw new TypeError('Outcome intake input must be an object')
  }
  exactKeys(input, ['runId', 'verdict', 'sessionDigest', 'evidenceIds'])
  if (typeof input.runId !== 'string' || !/^run:[a-f0-9]{64}$/u.test(input.runId)) {
    throw new TypeError('runId must be a Tianwen Run ID')
  }
  if (
    input.verdict !== 'met'
    && input.verdict !== 'not-met'
    && input.verdict !== 'inconclusive'
  ) {
    throw new TypeError('verdict must be met, not-met, or inconclusive')
  }
  if (!Array.isArray(input.evidenceIds)) {
    throw new TypeError('evidenceIds must be an array')
  }
  const evidenceIds = input.evidenceIds.map((item, index) =>
    requireDigest(item, `evidenceIds[${index}]`))
  const allowedEvidence = input.verdict === 'inconclusive'
    ? evidenceIds.length <= 1
    : evidenceIds.length === 1
  if (!allowedEvidence) {
    throw new TypeError(
      `${input.verdict} Outcome has invalid Evidence cardinality`,
    )
  }
  return {
    runId: input.runId,
    verdict: input.verdict,
    sessionDigest: requireDigest(input.sessionDigest, 'sessionDigest'),
    evidenceIds,
  }
}

export function prepareOutcomeIntake(
  binding: TianwenRunBinding,
  candidate: OutcomeIntakeInput,
): PreparedOutcomeIntake {
  const input = validateOutcomeInput(candidate)
  if (input.runId !== binding.runId) {
    throw new TypeError('Outcome Run does not match the binding')
  }
  const ingestionId = sha256({
    runId: binding.runId,
    acceptanceContractDigest: binding.acceptanceContractDigest,
  })
  const inputDigest = sha256(input)

  if (input.verdict === 'met') {
    return { kind: 'no-signal', decision: 'no-case', ingestionId, inputDigest }
  }
  if (input.verdict === 'inconclusive') {
    return {
      kind: 'no-signal',
      decision: 'continue-observing',
      ingestionId,
      inputDigest,
    }
  }
  if (binding.acceptanceContract.gapDisposition !== 'reusable') {
    return {
      kind: 'no-signal',
      decision: binding.acceptanceContract.gapDisposition === 'observe'
        ? 'continue-observing'
        : 'ordinary-correction',
      ingestionId,
      inputDigest,
    }
  }

  const failureSignature = sha256({
    source: binding.acceptanceContract.source,
    toolName: binding.acceptanceContract.toolName,
    notMetErrorCode: binding.acceptanceContract.notMetErrorCode,
    acceptanceContractDigest: binding.acceptanceContractDigest,
  })
  const problemCategory = normalizeLearningText(
    binding.acceptanceContract.problemCategory,
  )
  const problemFingerprint = sha256({
    scopeKey: binding.scopeKey,
    problemCategory,
    failureSignature,
  })
  const relevantEvidenceId = input.evidenceIds[0]!
  const signalDigest = sha256({
    runId: binding.runId,
    problemFingerprint,
    relevantEvidenceId,
  })
  return {
    kind: 'reusable',
    ingestionId,
    inputDigest,
    signalId: `signal:${signalDigest.slice('sha256:'.length)}`,
    ticketId: `ticket:${problemFingerprint.slice('sha256:'.length)}`,
    problemFingerprint,
    failureSignature,
    problemCategory,
    severity: binding.acceptanceContract.severity,
    blocksGoal: binding.acceptanceContract.blocksGoal,
  }
}
