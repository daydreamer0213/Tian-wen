import { Buffer } from 'node:buffer'
import { sha256 } from './learning-intake.js'
import type { LearningAnalysisId } from './learning-analysis.js'
import type { GuidanceProof, GuidanceStudyId } from './conversation-guidance.js'
import type { Sha256Digest } from './ledger.js'
import type { TianwenRunId } from './outcome-intake.js'
import type { SkillVersionId } from './skill-governance.js'

type CoverageVerdict = 'met' | 'not-met'
export interface ExplorationPrediction {
  readonly control: CoverageVerdict
  readonly treatment: CoverageVerdict
}

export interface LearningExplorationProposal {
  readonly sourceRunId: TianwenRunId
  readonly hypothesis: string
  readonly alternative: string
  readonly temporaryInstruction: string
  readonly expectedIfHypothesis: ExplorationPrediction
  readonly expectedIfAlternative: ExplorationPrediction
}

export interface ConversationLearningExplorationProposal {
  readonly sourceTaskId: `conversation-task:${string}`
  readonly hypothesis: string
  readonly alternative: string
  readonly temporaryInstruction: string
  readonly expectedIfHypothesis: ExplorationPrediction
  readonly expectedIfAlternative: ExplorationPrediction
}

/** Host-frozen conversation inputs; preparation never authorizes execution. */
export interface ConversationLearningExplorationContext {
  readonly studyId: GuidanceStudyId
  readonly sourceTaskId: `conversation-task:${string}`
  readonly parentVersion: Sha256Digest
  readonly sourceMaterialDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly qualityContractDigest: Sha256Digest
  readonly proposalProof: GuidanceProof
}

export interface ConversationLearningExplorationRequest extends ConversationLearningExplorationContext {
  readonly schemaVersion: 'tianwen.learning-exploration-request.v2'
  readonly sourceKind: 'conversation-task'
  readonly metric: 'conversation-task-quality.v1'
  readonly proposal: ConversationLearningExplorationProposal
  readonly explorationId: `exploration:${string}`
  readonly requestDigest: Sha256Digest
}

/** Values supplied by the host from the eligible analysis and frozen source. */
export interface LearningExplorationContext {
  readonly analysisId: LearningAnalysisId
  readonly sourceRunId: TianwenRunId
  readonly parentVersionId: SkillVersionId
  readonly sourceSubjectDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly metric?: LearningExplorationMetric
}

export type LearningExplorationMetric =
  | 'research-summary-required-id-coverage.v1'
  | 'research-summary-source-fidelity.v1'
  | 'research-summary-source-fidelity.v2'

export interface LearningExplorationRequest extends LearningExplorationContext {
  readonly explorationId: `exploration:${string}`
  readonly requestDigest: Sha256Digest
  readonly metric: LearningExplorationMetric
  readonly proposal: LearningExplorationProposal
  readonly controlSessionId: string
  readonly treatmentSessionId: string
}

export interface LearningExplorationStatus extends LearningExplorationRequest {
  readonly requestedAt: string
  readonly updatedAt: string
  readonly arms: Readonly<Partial<Record<LearningExplorationArm, LearningExplorationArmReceipt>>>
  readonly result?: LearningExplorationResult
}

export interface LearningExplorationReceipt {
  readonly exploration: LearningExplorationStatus
  readonly duplicate: boolean
}

export interface LearningExplorationIntentRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-exploration-intent.v1'
  readonly type: 'learning-exploration-intent-recorded'
  readonly at: string
  readonly request: LearningExplorationRequest
}

export type LearningExplorationArm = 'control' | 'treatment'

export type LearningExplorationInconclusiveReason =
  | 'no-product-output'
  | 'infrastructure-failure'

interface LearningExplorationArmReceiptIdentity {
  readonly arm: LearningExplorationArm
  readonly sessionId: string
  readonly parentVersionId: SkillVersionId
}

interface LearningExplorationRunArmReceiptBase
  extends LearningExplorationArmReceiptIdentity {
  readonly runId: TianwenRunId
  readonly sessionDigest: Sha256Digest
}

export type LearningExplorationArmReceipt =
  | LearningExplorationRunArmReceiptBase & {
      readonly skillEvidenceId: Sha256Digest
      readonly acceptanceEvidenceId: Sha256Digest
      readonly verdict: CoverageVerdict
    }
  | LearningExplorationRunArmReceiptBase & {
      readonly skillEvidenceId?: Sha256Digest
      readonly acceptanceEvidenceId?: Sha256Digest
      readonly verdict: 'inconclusive'
      readonly inconclusiveReason: LearningExplorationInconclusiveReason
    }
  | LearningExplorationArmReceiptIdentity & {
      readonly verdict: 'inconclusive'
      readonly inconclusiveReason: 'infrastructure-failure'
    }

export interface LearningExplorationResult {
  readonly observation: LearningExplorationObservation
  readonly classification: LearningExplorationClassification
}

export interface LearningExplorationArmRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-exploration-arm.v1'
  readonly type: 'learning-exploration-arm-recorded'
  readonly at: string
  readonly analysisId: LearningAnalysisId
  readonly receipt: LearningExplorationArmReceipt
}

export type LearningExplorationLedgerEvent =
  | LearningExplorationIntentRecordedEvent
  | LearningExplorationArmRecordedEvent

export interface LearningExplorationObservation {
  readonly control: CoverageVerdict | 'inconclusive'
  readonly treatment: CoverageVerdict | 'inconclusive'
}

export type LearningExplorationClassification =
  | 'matches-hypothesis-prediction'
  | 'matches-alternative-prediction'
  | 'not-distinguished'
  | 'inconclusive'

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError(`exploration requires exactly: ${keys.join(', ')}`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0
    || Buffer.byteLength(value, 'utf8') > 4096) {
    throw new TypeError(`exploration ${label} must be nonblank and at most 4096 UTF-8 bytes`)
  }
  return value.trim()
}

function identity(value: unknown, prefix: string, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}:[a-f0-9]{64}$`).test(value)) {
    throw new TypeError(`invalid exploration ${label}`)
  }
  return value
}

function prediction(value: unknown): ExplorationPrediction {
  const pair = object(value, ['control', 'treatment'])
  if ((pair.control !== 'met' && pair.control !== 'not-met')
    || (pair.treatment !== 'met' && pair.treatment !== 'not-met')) {
    throw new TypeError('exploration predictions require met/not-met for each arm')
  }
  return Object.freeze({ control: pair.control, treatment: pair.treatment })
}

interface ValidatedExplorationProposal {
  readonly source: unknown
  readonly hypothesis: string
  readonly alternative: string
  readonly temporaryInstruction: string
  readonly expectedIfHypothesis: ExplorationPrediction
  readonly expectedIfAlternative: ExplorationPrediction
}

function explorationProposalInput(value: unknown, sourceField: string): Record<string, unknown> {
  return object(value, [sourceField, 'hypothesis', 'alternative', 'temporaryInstruction', 'expectedIfHypothesis', 'expectedIfAlternative'])
}

function validateExplorationProposal(proposal: Record<string, unknown>, sourceField: string): ValidatedExplorationProposal {
  const expectedIfHypothesis = prediction(proposal.expectedIfHypothesis)
  const expectedIfAlternative = prediction(proposal.expectedIfAlternative)
  if (samePair(expectedIfHypothesis, expectedIfAlternative)) {
    throw new TypeError('exploration predictions do not distinguish the explanations')
  }
  const hypothesis = text(proposal.hypothesis, 'hypothesis')
  const alternative = text(proposal.alternative, 'alternative')
  if (hypothesis === alternative) throw new TypeError('exploration alternative must differ from its hypothesis')
  return {
    source: proposal[sourceField], hypothesis, alternative,
    temporaryInstruction: text(proposal.temporaryInstruction, 'temporaryInstruction'),
    expectedIfHypothesis, expectedIfAlternative,
  }
}

function conversationProof(value: unknown): GuidanceProof {
  const proof = object(value, ['sessionId', 'sessionDigest', 'requestDigest'])
  if (typeof proof.sessionId !== 'string' || proof.sessionId.trim().length === 0
    || proof.sessionId.includes('\0') || Buffer.byteLength(proof.sessionId, 'utf8') > 512) {
    throw new TypeError('invalid exploration proposalProof sessionId')
  }
  return Object.freeze({
    sessionId: proof.sessionId,
    sessionDigest: identity(proof.sessionDigest, 'sha256', 'proposalProof sessionDigest') as Sha256Digest,
    requestDigest: identity(proof.requestDigest, 'sha256', 'proposalProof requestDigest') as Sha256Digest,
  })
}

function samePair(left: LearningExplorationObservation, right: ExplorationPrediction): boolean {
  return left.control === right.control && left.treatment === right.treatment
}

/** Pure contract preparation; this does not authorize or execute an experiment. */
export function prepareLearningExploration(
  input: unknown,
  context: LearningExplorationContext,
): LearningExplorationRequest {
  const value = explorationProposalInput(input, 'sourceRunId')
  const sourceRunId = identity(value.sourceRunId, 'run', 'sourceRunId') as TianwenRunId
  if (sourceRunId !== context.sourceRunId) throw new TypeError('exploration source differs from the frozen source')
  const values = validateExplorationProposal(value, 'sourceRunId')
  const proposal = Object.freeze({
    sourceRunId, hypothesis: values.hypothesis, alternative: values.alternative,
    temporaryInstruction: values.temporaryInstruction,
    expectedIfHypothesis: values.expectedIfHypothesis, expectedIfAlternative: values.expectedIfAlternative,
  })
  const metric = context.metric ?? 'research-summary-required-id-coverage.v1'
  if (metric !== 'research-summary-required-id-coverage.v1'
    && metric !== 'research-summary-source-fidelity.v1'
    && metric !== 'research-summary-source-fidelity.v2') {
    throw new TypeError('invalid exploration metric')
  }
  const body = {
    analysisId: identity(context.analysisId, 'analysis', 'analysisId') as LearningAnalysisId,
    sourceRunId,
    parentVersionId: identity(context.parentVersionId, 'skill-version', 'parentVersionId') as SkillVersionId,
    sourceSubjectDigest: identity(context.sourceSubjectDigest, 'sha256', 'sourceSubjectDigest') as Sha256Digest,
    environmentDigest: identity(context.environmentDigest, 'sha256', 'environmentDigest') as Sha256Digest,
    metric,
    proposal,
  }
  // One pair per analysis in this slice; a changed proposal changes its digest,
  // not its child identities. The ledger owner must reject replacement intent.
  const id = sha256({ kind: 'tianwen.learning-exploration.v1', analysisId: body.analysisId }).slice('sha256:'.length)
  return Object.freeze({
    ...body,
    explorationId: `exploration:${id}`,
    requestDigest: sha256(body),
    controlSessionId: `tianwen-exploration-${id}-control`,
    treatmentSessionId: `tianwen-exploration-${id}-treatment`,
  })
}

/** Pure preparation for a natural conversation task; this does not execute an experiment. */
export function prepareConversationLearningExploration(
  input: unknown,
  context: ConversationLearningExplorationContext,
): ConversationLearningExplorationRequest {
  const value = explorationProposalInput(input, 'sourceTaskId')
  const sourceTaskId = identity(value.sourceTaskId, 'conversation-task', 'sourceTaskId') as ConversationLearningExplorationProposal['sourceTaskId']
  const contextSourceTaskId = identity(context.sourceTaskId, 'conversation-task', 'sourceTaskId') as ConversationLearningExplorationContext['sourceTaskId']
  if (sourceTaskId !== contextSourceTaskId) throw new TypeError('exploration source differs from the frozen source')
  const values = validateExplorationProposal(value, 'sourceTaskId')
  const proposal = Object.freeze({
    sourceTaskId,
    hypothesis: values.hypothesis,
    alternative: values.alternative,
    temporaryInstruction: values.temporaryInstruction,
    expectedIfHypothesis: values.expectedIfHypothesis,
    expectedIfAlternative: values.expectedIfAlternative,
  })
  const body = {
    schemaVersion: 'tianwen.learning-exploration-request.v2' as const,
    sourceKind: 'conversation-task' as const,
    metric: 'conversation-task-quality.v1' as const,
    studyId: identity(context.studyId, 'guidance-study', 'studyId') as GuidanceStudyId,
    sourceTaskId,
    parentVersion: identity(context.parentVersion, 'sha256', 'parentVersion') as Sha256Digest,
    sourceMaterialDigest: identity(context.sourceMaterialDigest, 'sha256', 'sourceMaterialDigest') as Sha256Digest,
    environmentDigest: identity(context.environmentDigest, 'sha256', 'environmentDigest') as Sha256Digest,
    qualityContractDigest: identity(context.qualityContractDigest, 'sha256', 'qualityContractDigest') as Sha256Digest,
    proposalProof: conversationProof(context.proposalProof),
    proposal,
  }
  const id = sha256({ kind: 'tianwen.learning-exploration.v2', studyId: body.studyId }).slice('sha256:'.length)
  return Object.freeze({
    ...body,
    explorationId: `exploration:${id}`,
    requestDigest: sha256(body),
  })
}

/** Matching a frozen prediction is an observation, not proof of causation. */
export function classifyLearningExploration(
  request: { readonly proposal: Pick<LearningExplorationProposal, 'expectedIfHypothesis' | 'expectedIfAlternative'> },
  observed: LearningExplorationObservation,
): LearningExplorationClassification {
  if (observed.control === 'inconclusive' || observed.treatment === 'inconclusive') return 'inconclusive'
  if (samePair(observed, request.proposal.expectedIfHypothesis)) return 'matches-hypothesis-prediction'
  if (samePair(observed, request.proposal.expectedIfAlternative)) return 'matches-alternative-prediction'
  return 'not-distinguished'
}

/** Rebuild a persisted request through the same exact input boundary. */
export function parseLearningExplorationRequest(value: unknown): LearningExplorationRequest {
  const request = object(value, [
    'analysisId', 'sourceRunId', 'parentVersionId', 'sourceSubjectDigest',
    'environmentDigest', 'metric', 'proposal', 'explorationId', 'requestDigest',
    'controlSessionId', 'treatmentSessionId',
  ])
  const parsed = prepareLearningExploration(request.proposal, {
    analysisId: request.analysisId as LearningAnalysisId,
    sourceRunId: request.sourceRunId as TianwenRunId,
    parentVersionId: request.parentVersionId as SkillVersionId,
    sourceSubjectDigest: request.sourceSubjectDigest as Sha256Digest,
    environmentDigest: request.environmentDigest as Sha256Digest,
    metric: request.metric as LearningExplorationMetric,
  })
  if (sha256(request) !== sha256(parsed)) {
    throw new TypeError('persisted learning exploration request changed')
  }
  return parsed
}

/** Rebuild a persisted natural request through the same exact input boundary. */
export function parseConversationLearningExplorationRequest(value: unknown): ConversationLearningExplorationRequest {
  const request = object(value, [
    'schemaVersion', 'sourceKind', 'metric', 'studyId', 'sourceTaskId', 'parentVersion',
    'sourceMaterialDigest', 'environmentDigest', 'qualityContractDigest', 'proposalProof',
    'proposal', 'explorationId', 'requestDigest',
  ])
  const parsed = prepareConversationLearningExploration(request.proposal, {
    studyId: request.studyId as GuidanceStudyId,
    sourceTaskId: request.sourceTaskId as ConversationLearningExplorationContext['sourceTaskId'],
    parentVersion: request.parentVersion as Sha256Digest,
    sourceMaterialDigest: request.sourceMaterialDigest as Sha256Digest,
    environmentDigest: request.environmentDigest as Sha256Digest,
    qualityContractDigest: request.qualityContractDigest as Sha256Digest,
    proposalProof: request.proposalProof as GuidanceProof,
  })
  if (sha256(request) !== sha256(parsed)) {
    throw new TypeError('persisted conversation learning exploration request changed')
  }
  return parsed
}

export function parseLearningExplorationArmReceipt(value: unknown): LearningExplorationArmReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('learning exploration arm receipt must be an object')
  }
  const receipt = value as Record<string, unknown>
  const allowed = new Set([
    'arm', 'runId', 'sessionId', 'parentVersionId', 'sessionDigest',
    'skillEvidenceId', 'acceptanceEvidenceId', 'verdict', 'inconclusiveReason',
  ])
  const required = ['arm', 'sessionId', 'parentVersionId', 'verdict']
  if (Object.keys(receipt).some(key => !allowed.has(key))
    || required.some(key => !Object.hasOwn(receipt, key))) {
    throw new TypeError('learning exploration arm receipt has unsupported or missing fields')
  }
  if (receipt.arm !== 'control' && receipt.arm !== 'treatment') {
    throw new TypeError('invalid learning exploration arm')
  }
  if (receipt.verdict !== 'met' && receipt.verdict !== 'not-met'
    && receipt.verdict !== 'inconclusive') {
    throw new TypeError('invalid learning exploration verdict')
  }
  const identityBase: LearningExplorationArmReceiptIdentity = {
    arm: receipt.arm,
    sessionId: text(receipt.sessionId, 'sessionId'),
    parentVersionId: identity(receipt.parentVersionId, 'skill-version', 'parentVersionId') as SkillVersionId,
  }
  const hasRun = Object.hasOwn(receipt, 'runId')
    || Object.hasOwn(receipt, 'sessionDigest')
  if (!hasRun) {
    if (receipt.verdict !== 'inconclusive'
      || receipt.inconclusiveReason !== 'infrastructure-failure'
      || Object.hasOwn(receipt, 'skillEvidenceId')
      || Object.hasOwn(receipt, 'acceptanceEvidenceId')) {
      throw new TypeError('pre-Run learning exploration arm requires an infrastructure failure')
    }
    return Object.freeze({
      ...identityBase,
      verdict: 'inconclusive',
      inconclusiveReason: 'infrastructure-failure',
    })
  }
  if (!Object.hasOwn(receipt, 'runId') || !Object.hasOwn(receipt, 'sessionDigest')) {
    throw new TypeError('learning exploration Run identity is incomplete')
  }
  const base: LearningExplorationRunArmReceiptBase = {
    ...identityBase,
    runId: identity(receipt.runId, 'run', 'runId') as TianwenRunId,
    sessionDigest: identity(receipt.sessionDigest, 'sha256', 'sessionDigest') as Sha256Digest,
  }
  if (receipt.verdict === 'met' || receipt.verdict === 'not-met') {
    if (Object.hasOwn(receipt, 'inconclusiveReason')) {
      throw new TypeError('conclusive learning exploration arm cannot have an inconclusive reason')
    }
    const parsed: LearningExplorationArmReceipt = Object.freeze({
      ...base,
      skillEvidenceId: identity(receipt.skillEvidenceId, 'sha256', 'skillEvidenceId') as Sha256Digest,
      acceptanceEvidenceId: identity(receipt.acceptanceEvidenceId, 'sha256', 'acceptanceEvidenceId') as Sha256Digest,
      verdict: receipt.verdict,
    })
    return parsed
  }
  if (receipt.inconclusiveReason !== 'no-product-output'
    && receipt.inconclusiveReason !== 'infrastructure-failure') {
    throw new TypeError('invalid learning exploration inconclusive reason')
  }
  if (Object.hasOwn(receipt, 'skillEvidenceId')
    && !Object.hasOwn(receipt, 'acceptanceEvidenceId')) {
    throw new TypeError('inconclusive Skill Evidence requires acceptance Evidence')
  }
  const parsed: LearningExplorationArmReceipt = Object.freeze({
    ...base,
    ...(Object.hasOwn(receipt, 'skillEvidenceId')
      ? { skillEvidenceId: identity(receipt.skillEvidenceId, 'sha256', 'skillEvidenceId') as Sha256Digest }
      : {}),
    ...(Object.hasOwn(receipt, 'acceptanceEvidenceId')
      ? { acceptanceEvidenceId: identity(receipt.acceptanceEvidenceId, 'sha256', 'acceptanceEvidenceId') as Sha256Digest }
      : {}),
    verdict: 'inconclusive',
    inconclusiveReason: receipt.inconclusiveReason,
  })
  return parsed
}
