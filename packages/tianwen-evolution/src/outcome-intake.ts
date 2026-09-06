import type { Sha256Digest } from './ledger.js'
import { normalizeLearningText, sha256 } from './learning-intake.js'
import type {
  LearningSignalId,
  LearningTicketId,
} from './learning-intake.js'
import type { ControlledSkillEvaluatorDimensionScoresV3 } from './controlled-skill-evaluation.js'
import { CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST } from './controlled-skill-source-fidelity.js'

export type TianwenRunId = `run:${string}`
export type OutcomeSeverity = 1 | 2 | 3 | 4 | 5

interface ToolAcceptanceBase {
  readonly source: 'dsh-tool-result'
  readonly toolName: string
  readonly notMetErrorCode: string
  readonly qualityContract?: ResearchSummaryQualityContract
}

export interface ResearchSummaryQualityContract {
  readonly schemaVersion: 'tianwen.research-summary-semantic-contract.v1'
  readonly rubricDigest: Sha256Digest
}

export type ResearchSummarySemanticReview =
  | {
      readonly schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      readonly status: 'completed'
      readonly acceptanceSubjectDigest: Sha256Digest
      readonly submissionDigest: Sha256Digest
      readonly rubricDigest: Sha256Digest
      readonly reviewerSessionId: string
      readonly reviewerSessionDigest: Sha256Digest
      readonly requestDigest: Sha256Digest
      readonly reviewEvidenceId: Sha256Digest
      readonly idGateVerdict: 'met' | 'not-met'
      readonly scores: ControlledSkillEvaluatorDimensionScoresV3
    }
  | {
      readonly schemaVersion: 'tianwen.research-summary-semantic-review.v1'
      readonly status: 'inconclusive'
      readonly reasonCode:
        | 'no-canonical-submission'
        | 'review-not-completed'
        | 'review-invalid'
      readonly attempt: null | {
        readonly acceptanceSubjectDigest: Sha256Digest
        readonly submissionDigest: Sha256Digest
        readonly rubricDigest: Sha256Digest
        readonly reviewerSessionId: string
        readonly requestDigest: Sha256Digest
        readonly reviewerSessionDigest: Sha256Digest | null
      }
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

export interface RunBindingInputV3 extends RunBindingInputV1 {
  readonly acceptanceSubjectDigest?: Sha256Digest
  readonly sessionLifecycleFingerprint: Sha256Digest
}

export type RunBindingInput =
  | RunBindingInputV1
  | RunBindingInputV2
  | RunBindingInputV3

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

export interface TianwenRunBindingV3 extends RunBindingInputV3 {
  readonly schemaVersion: 'tianwen.run-binding.v3'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export type TianwenRunBinding =
  | TianwenRunBindingV1
  | TianwenRunBindingV2
  | TianwenRunBindingV3

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

interface OutcomeIntakeBase {
  readonly runId: TianwenRunId
  readonly verdict: OutcomeVerdict
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export type LegacyOutcomeIntakeInput = OutcomeIntakeBase

export interface SemanticOutcomeIntakeInput extends OutcomeIntakeBase {
  readonly semanticReview: ResearchSummarySemanticReview
}

export type OutcomeIntakeInput =
  | LegacyOutcomeIntakeInput
  | SemanticOutcomeIntakeInput

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

interface OutcomeIntakeRecordedEventBase {
  readonly type: 'outcome-intake-recorded'
  readonly at: string
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<OutcomeIntakeReceipt, 'duplicate'>
  readonly signal?: OutcomeLearningSignal
}

export interface LegacyOutcomeIntakeRecordedEvent
  extends OutcomeIntakeRecordedEventBase {
  readonly schemaVersion: 'tianwen.outcome-intake.v1'
  readonly input: LegacyOutcomeIntakeInput
}

export interface SemanticOutcomeIntakeRecordedEvent
  extends OutcomeIntakeRecordedEventBase {
  readonly schemaVersion: 'tianwen.outcome-intake.v2'
  readonly input: SemanticOutcomeIntakeInput
}

export type OutcomeIntakeRecordedEvent =
  | LegacyOutcomeIntakeRecordedEvent
  | SemanticOutcomeIntakeRecordedEvent

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

function prepareResearchSummaryQualityContract(
  value: unknown,
): ResearchSummaryQualityContract {
  if (!isRecord(value)) {
    throw new TypeError('qualityContract must be an object')
  }
  exactKeys(value, ['schemaVersion', 'rubricDigest'])
  if (value.schemaVersion !== 'tianwen.research-summary-semantic-contract.v1') {
    throw new TypeError('qualityContract has an invalid schema version')
  }
  if (value.rubricDigest !== CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST) {
    throw new TypeError('qualityContract rubric is not the frozen rubric')
  }
  return {
    schemaVersion: 'tianwen.research-summary-semantic-contract.v1',
    rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  }
}

function prepareResearchSummaryScores(
  value: unknown,
): ControlledSkillEvaluatorDimensionScoresV3 {
  if (!isRecord(value)) {
    throw new TypeError('semantic review scores must be an object')
  }
  exactKeys(value, [
    'relevance',
    'correctnessReasoning',
    'clarityUsability',
    'scopeRestraint',
    'sourceFidelity',
  ])
  const score = (item: unknown, label: string): number => {
    if (!Number.isInteger(item) || (item as number) < 0 || (item as number) > 4) {
      throw new TypeError(`${label} must be an integer from 0 to 4`)
    }
    return item as number
  }
  return {
    relevance: score(value.relevance, 'relevance'),
    correctnessReasoning: score(value.correctnessReasoning, 'correctnessReasoning'),
    clarityUsability: score(value.clarityUsability, 'clarityUsability'),
    scopeRestraint: score(value.scopeRestraint, 'scopeRestraint'),
    sourceFidelity: score(value.sourceFidelity, 'sourceFidelity'),
  }
}

export function prepareResearchSummarySemanticReview(
  value: unknown,
): ResearchSummarySemanticReview {
  if (!isRecord(value)) {
    throw new TypeError('semanticReview must be an object')
  }
  if (value.schemaVersion !== 'tianwen.research-summary-semantic-review.v1') {
    throw new TypeError('semanticReview has an invalid schema version')
  }
  if (value.status === 'completed') {
    exactKeys(value, [
      'schemaVersion',
      'status',
      'acceptanceSubjectDigest',
      'submissionDigest',
      'rubricDigest',
      'reviewerSessionId',
      'reviewerSessionDigest',
      'requestDigest',
      'reviewEvidenceId',
      'idGateVerdict',
      'scores',
    ])
    if (value.idGateVerdict !== 'met' && value.idGateVerdict !== 'not-met') {
      throw new TypeError('semanticReview idGateVerdict is invalid')
    }
    return {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1',
      status: 'completed',
      acceptanceSubjectDigest: requireDigest(
        value.acceptanceSubjectDigest,
        'semanticReview acceptanceSubjectDigest',
      ),
      submissionDigest: requireDigest(
        value.submissionDigest,
        'semanticReview submissionDigest',
      ),
      rubricDigest: requireDigest(value.rubricDigest, 'semanticReview rubricDigest'),
      reviewerSessionId: nonBlank(value.reviewerSessionId, 'reviewerSessionId'),
      reviewerSessionDigest: requireDigest(
        value.reviewerSessionDigest,
        'semanticReview reviewerSessionDigest',
      ),
      requestDigest: requireDigest(value.requestDigest, 'semanticReview requestDigest'),
      reviewEvidenceId: requireDigest(
        value.reviewEvidenceId,
        'semanticReview reviewEvidenceId',
      ),
      idGateVerdict: value.idGateVerdict,
      scores: prepareResearchSummaryScores(value.scores),
    }
  }
  if (value.status !== 'inconclusive') {
    throw new TypeError('semanticReview status is invalid')
  }
  exactKeys(value, ['schemaVersion', 'status', 'reasonCode', 'attempt'])
  if (
    value.reasonCode !== 'no-canonical-submission'
    && value.reasonCode !== 'review-not-completed'
    && value.reasonCode !== 'review-invalid'
  ) {
    throw new TypeError('semanticReview inconclusive reasonCode is invalid')
  }
  let attempt: Extract<
    ResearchSummarySemanticReview,
    { readonly status: 'inconclusive' }
  >['attempt'] = null
  if (value.attempt !== null) {
    if (!isRecord(value.attempt)) {
      throw new TypeError('semanticReview attempt must be an object or null')
    }
    exactKeys(value.attempt, [
      'acceptanceSubjectDigest',
      'submissionDigest',
      'rubricDigest',
      'reviewerSessionId',
      'requestDigest',
      'reviewerSessionDigest',
    ])
    attempt = {
      acceptanceSubjectDigest: requireDigest(
        value.attempt.acceptanceSubjectDigest,
        'semanticReview attempt acceptanceSubjectDigest',
      ),
      submissionDigest: requireDigest(
        value.attempt.submissionDigest,
        'semanticReview attempt submissionDigest',
      ),
      rubricDigest: requireDigest(
        value.attempt.rubricDigest,
        'semanticReview attempt rubricDigest',
      ),
      reviewerSessionId: nonBlank(
        value.attempt.reviewerSessionId,
        'semanticReview attempt reviewerSessionId',
      ),
      requestDigest: requireDigest(
        value.attempt.requestDigest,
        'semanticReview attempt requestDigest',
      ),
      reviewerSessionDigest: value.attempt.reviewerSessionDigest === null
        ? null
        : requireDigest(
            value.attempt.reviewerSessionDigest,
            'semanticReview attempt reviewerSessionDigest',
          ),
    }
  }
  return {
    schemaVersion: 'tianwen.research-summary-semantic-review.v1',
    status: 'inconclusive',
    reasonCode: value.reasonCode,
    attempt,
  }
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
  const qualityContract = 'qualityContract' in value
    ? prepareResearchSummaryQualityContract(value.qualityContract)
    : undefined
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
      ...(qualityContract === undefined ? [] : ['qualityContract']),
    ])
    acceptanceContract = {
      source: 'dsh-tool-result',
      toolName,
      notMetErrorCode,
      gapDisposition,
      ...(qualityContract === undefined ? {} : { qualityContract }),
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
      ...(qualityContract === undefined ? [] : ['qualityContract']),
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
      ...(qualityContract === undefined ? {} : { qualityContract }),
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
  const isV3 = 'sessionLifecycleFingerprint' in input
  const hasAcceptanceSubject = 'acceptanceSubjectDigest' in input
  exactKeys(input, [
    'goalRef',
    'taskRef',
    'sessionId',
    'scopeKey',
    'acceptanceContract',
    ...(hasAcceptanceSubject ? ['acceptanceSubjectDigest'] : []),
    ...(isV3 ? ['sessionLifecycleFingerprint'] : []),
  ])
  const acceptanceContract = prepareRunAcceptanceContract(input.acceptanceContract)
  if (acceptanceContract.qualityContract !== undefined && !hasAcceptanceSubject) {
    throw new TypeError('semantic acceptanceContract requires acceptanceSubjectDigest')
  }
  const common: RunBindingInputV1 = {
    goalRef: nonBlank(input.goalRef, 'goalRef'),
    taskRef: nonBlank(input.taskRef, 'taskRef'),
    sessionId: nonBlank(input.sessionId, 'sessionId'),
    scopeKey: nonBlank(input.scopeKey, 'scopeKey'),
    acceptanceContract,
  }
  const acceptanceSubject = hasAcceptanceSubject
    ? {
        acceptanceSubjectDigest: requireDigest(
          input.acceptanceSubjectDigest,
          'acceptanceSubjectDigest',
        ),
      }
    : {}
  return isV3
    ? {
        ...common,
        ...acceptanceSubject,
        sessionLifecycleFingerprint: requireDigest(
          input.sessionLifecycleFingerprint,
          'sessionLifecycleFingerprint',
        ),
      }
    : hasAcceptanceSubject
      ? { ...common, ...acceptanceSubject } as RunBindingInputV2
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
  return 'sessionLifecycleFingerprint' in validated
    ? {
        schemaVersion: 'tianwen.run-binding.v3',
        runId,
        ...validated,
        acceptanceContractDigest,
      }
    : 'acceptanceSubjectDigest' in validated
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

function validateOutcomeInput(
  input: OutcomeIntakeInput,
  semantic: boolean,
): OutcomeIntakeInput {
  if (!isRecord(input)) {
    throw new TypeError('Outcome intake input must be an object')
  }
  exactKeys(input, [
    'runId',
    'verdict',
    'sessionDigest',
    'evidenceIds',
    ...(semantic ? ['semanticReview'] : []),
  ])
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
  const common: LegacyOutcomeIntakeInput = {
    runId: input.runId,
    verdict: input.verdict,
    sessionDigest: requireDigest(input.sessionDigest, 'sessionDigest'),
    evidenceIds,
  }
  return semantic
    ? {
        ...common,
        semanticReview: prepareResearchSummarySemanticReview(
          input.semanticReview,
        ),
      }
    : common
}

export function prepareOutcomeIntake(
  binding: TianwenRunBinding,
  candidate: OutcomeIntakeInput,
): PreparedOutcomeIntake {
  const qualityContract = binding.acceptanceContract.qualityContract
  const input = validateOutcomeInput(candidate, qualityContract !== undefined)
  if (input.runId !== binding.runId) {
    throw new TypeError('Outcome Run does not match the binding')
  }
  if (qualityContract !== undefined) {
    if (!('semanticReview' in input)) {
      throw new TypeError('semantic Outcome requires semanticReview')
    }
    const review = input.semanticReview
    const subjectDigest = 'acceptanceSubjectDigest' in binding
      ? binding.acceptanceSubjectDigest
      : undefined
    const attempted = review.status === 'completed' ? review : review.attempt
    if (
      subjectDigest === undefined
      || (
        attempted !== null
        && (
          attempted.acceptanceSubjectDigest !== subjectDigest
          || attempted.rubricDigest !== qualityContract.rubricDigest
          || attempted.reviewerSessionId === binding.sessionId
          || (
            attempted.reviewerSessionDigest !== null
            && attempted.reviewerSessionDigest === input.sessionDigest
          )
        )
      )
    ) {
      throw new TypeError('semanticReview disagrees with frozen Run facts')
    }
    if (review.status === 'inconclusive') {
      if (input.verdict !== 'inconclusive') {
        throw new TypeError('inconclusive semanticReview requires inconclusive Outcome')
      }
    } else {
      if (input.evidenceIds.includes(review.reviewEvidenceId)) {
        throw new TypeError('semantic review Evidence cannot replace source Evidence')
      }
      const fixedVerdict = review.idGateVerdict === 'met'
        && review.scores.sourceFidelity >= 3
        ? 'met'
        : 'not-met'
      if (input.verdict !== fixedVerdict && input.verdict !== 'inconclusive') {
        throw new TypeError('Outcome verdict disagrees with semanticReview')
      }
    }
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
