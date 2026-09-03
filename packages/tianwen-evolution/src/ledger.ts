import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { TextDecoder } from 'node:util'

import {
  canonicalJson,
  learningFeedbackFingerprint,
  prepareLearningIntake,
  sha256,
} from './learning-intake.js'
import type {
  LearningAnalysisConsent,
  LearningAnalysisConsentInput,
  LearningAnalysisConsentReceipt,
  LearningAnalysisConsentRecordedEvent,
  LearningConsentNoticeBinding,
  LearningConsentNoticeDeliveredEvent,
  LearningConsentNoticeIntentRecordedEvent,
  LearningConsentNoticeReceipt,
  LearningConsentNoticeStatus,
  LearningFeedbackRetractedEvent,
  LearningIntakeInput,
  LearningIntakeLedgerEvent,
  LearningIntakeReceipt,
  LearningIntakeStatus,
  LearningSignal,
  LearningSignalId,
  LearningSignalStatus,
  LearningTicket,
  LearningTicketFeedback,
  LearningTicketId,
} from './learning-intake.js'
import {
  assertLearningAnalysisEvidenceClosure,
  learningAnalysisEvidenceClosure,
  learningAnalysisId,
  learningAnalysisSubmissionPhase,
  parseLearningAnalysisSubmission,
  prepareLearningAnalysisRequest,
} from './learning-analysis.js'
import type {
  LearningAnalysisChildStartedEvent,
  LearningAnalysisCandidateReadyEvent,
  LearningAnalysisGovernedOutcome,
  LearningAnalysisGovernedOutcomeRecordedEvent,
  LearningAnalysisFailedEvent,
  LearningAnalysisId,
  LearningAnalysisInvalidatedEvent,
  LearningAnalysisLedgerEvent,
  LearningAnalysisProtocolUnavailableEvent,
  LearningAnalysisReportBinding,
  LearningAnalysisReportDeliveredEvent,
  LearningAnalysisReportIntentRecordedEvent,
  LearningAnalysisTerminalReportDeliveredEvent,
  LearningAnalysisTerminalReportIntentRecordedEvent,
  LearningAnalysisReceipt,
  LearningAnalysisResumedEvent,
  LearningAnalysisRetryPhase,
  LearningAnalysisRequestedEvent,
  LearningAnalysisStatus,
  LearningAnalysisSubmittedEvent,
  LearningAnalysisSubmission,
  RequestLearningAnalysisInput,
} from './learning-analysis.js'
import { prepareOutcomeIntake, prepareRunBinding } from './outcome-intake.js'
import type {
  OutcomeIntakeInput,
  OutcomeIntakeReceipt,
  OutcomeIntakeRecordedEvent,
  OutcomeLearningSignal,
  OutcomeSeverity,
  OutcomeVerdict,
  RunAcceptanceContract,
  RunBindingInput,
  RunBindingReceipt,
  RunBindingRecordedEvent,
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'
import {
  parseRunSkillManifest,
  parseRunSkillUse,
  parseAttribution,
  parseAcceptedLesson,
  parseLearningCase,
  parseSkillCandidate,
  prepareAcceptedLesson,
  prepareAttribution,
  prepareExplicitCorrectionLearningCase,
  prepareLearningCase,
  prepareSkillCandidate,
  prepareInitialRunSkillBinding,
  prepareRunSkillManifest,
  prepareRunSkillUse,
} from './skill-governance.js'
import type {
  InitialRunSkillBindingInput,
  InitialRunSkillBindingReceipt,
  InitialRunSkillBindingRecordedEvent,
  RunSkillManifest,
  RunSkillManifestInput,
  RunSkillManifestReceipt,
  RunSkillManifestRecordedEvent,
  RunSkillUse,
  RunSkillUseInput,
  RunSkillUseReceipt,
  RunSkillUseRecordedEvent,
  AttributionId,
  AttributionInput,
  AttributionReceipt,
  AttributionRecord,
  LearningAttributionRecordedEvent,
  LearningCase,
  LearningCaseId,
  LearningCaseOpenedEvent,
  LearningCaseReceipt,
  OpenLearningCaseInput,
  AcceptedLesson,
  AcceptedLessonInput,
  AcceptedLessonReceipt,
  GovernedSkillCandidate,
  GovernedSkillCandidateId,
  LearningCandidateRecordedEvent,
  LearningLessonRecordedEvent,
  LessonId,
  SkillCandidateInput,
  SkillCandidateReceipt,
} from './skill-governance.js'
import {
  parseSkillEvaluationResult,
  parseSkillEvaluationPlan,
  prepareSkillEvaluationResult,
  parseSkillEvalProtocol,
  prepareSkillEvaluationPlan,
  prepareSkillEvalProtocol,
} from './skill-evaluation.js'
import type {
  FreezeSkillEvalProtocolInput,
  OpenSkillEvaluationInput,
  RecordSkillEvaluationResultInput,
  SkillEvaluationId,
  SkillEvaluationOpenedEvent,
  SkillEvaluationPlan,
  SkillEvaluationResult,
  SkillEvaluationResultReceipt,
  SkillEvaluationResultRecordedEvent,
  SkillEvaluationReceipt,
  SkillEvalProtocolFrozenEvent,
  SkillEvalProtocolId,
  SkillEvalProtocolReceipt,
  SkillEvalProtocolRecord,
} from './skill-evaluation.js'
import {
  parseControlledSkillEvaluationBlindMap,
  parseControlledSkillEvaluationObjective,
  parseControlledSkillEvaluationPlan,
  parseControlledSkillEvaluationResult,
  parseControlledSkillEvaluatorObservation,
  parseControlledSkillEvalProtocol,
  prepareControlledSkillEvaluationBlindMap,
  prepareControlledSkillEvaluationObjective,
  prepareControlledSkillEvaluationPlan,
  prepareControlledSkillEvaluationResult,
  prepareControlledSkillEvaluatorObservation,
  prepareControlledSkillEvalProtocol,
} from './controlled-skill-evaluation.js'
import {
  parseControlledSkillShadowPlan,
  parseControlledSkillShadowResult,
  prepareControlledSkillShadowPlan,
  prepareControlledSkillShadowResult,
} from './controlled-skill-shadow.js'
import type {
  ControlledSkillShadowId,
  ControlledSkillShadowOpenedEvent,
  ControlledSkillShadowPlan,
  ControlledSkillShadowReceipt,
  ControlledSkillShadowResult,
  ControlledSkillShadowResultReceipt,
  ControlledSkillShadowResultRecordedEvent,
  OpenControlledSkillShadowInput,
  RecordControlledSkillShadowResultInput,
} from './controlled-skill-shadow.js'
import type {
  ControlledSkillEvaluationId,
  ControlledSkillEvaluationBlindMap,
  ControlledSkillEvaluationBlindMapFrozenEvent,
  ControlledSkillEvaluationBlindMapReceipt,
  ControlledSkillEvaluationObjective,
  ControlledSkillEvaluationObjectiveReceipt,
  ControlledSkillEvaluationObjectiveRecordedEvent,
  ControlledSkillEvaluationOpenedEvent,
  ControlledSkillEvaluationPlan,
  ControlledSkillEvaluationReceipt,
  ControlledSkillEvaluationResult,
  ControlledSkillEvaluationResultReceipt,
  ControlledSkillEvaluationResultRecordedEvent,
  ControlledSkillEvaluatorObservation,
  ControlledSkillEvaluatorObservationReceipt,
  ControlledSkillEvaluatorObservationRecordedEvent,
  ControlledSkillEvalTaskId,
  ControlledSkillEvalProtocolFrozenEvent,
  ControlledSkillEvalProtocolReceipt,
  ControlledSkillEvalProtocolRecord,
  FreezeControlledSkillEvalProtocolInput,
  FreezeControlledSkillEvaluationBlindMapInput,
  OpenControlledSkillEvaluationInput,
  RecordControlledSkillEvaluationObjectiveInput,
  RecordControlledSkillEvaluationResultInput,
  RecordControlledSkillEvaluatorObservationInput,
} from './controlled-skill-evaluation.js'
import {
  CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1,
  parseControlledSkillActivationFailure,
  parseControlledSkillPointerInitialization,
  parseControlledSkillTransition,
  parseControlledSkillTransitionVerification,
  prepareControlledSkillActivationFailure,
  prepareControlledSkillPointerInitialization,
  prepareControlledSkillPromotionRecommendation,
  prepareControlledSkillTransition,
  prepareControlledSkillTransitionVerification,
} from './controlled-skill-activation.js'
import type {
  BeginControlledSkillTransitionInput,
  CompleteControlledSkillTransitionInput,
  ControlledSkillActivationFailedEvent,
  ControlledSkillActivationFailure,
  ControlledSkillActivationFailureReceipt,
  ControlledSkillPointerInitializedEvent,
  ControlledSkillPointerInitialization,
  ControlledSkillScopePointer,
  ControlledSkillScopePointerReceipt,
  ControlledSkillTransition,
  ControlledSkillTransitionCompletionReceipt,
  ControlledSkillTransitionId,
  ControlledSkillTransitionReceipt,
  ControlledSkillTransitionStartReceipt,
  ControlledSkillTransitionStartedEvent,
  ControlledSkillTransitionVerifiedEvent,
  ControlledSkillTransitionVerification,
  InitializeControlledSkillScopePointerInput,
  RecordControlledSkillActivationFailedInput,
} from './controlled-skill-activation.js'

export type ArtifactId = `artifact:${string}`
export type Sha256Digest = `sha256:${string}`

export interface ArtifactVersion {
  readonly artifactId: ArtifactId
  readonly parentArtifactId?: ArtifactId
  readonly sourceDigest: Sha256Digest
  readonly createdAt: string
}

export interface EvaluationRecord {
  readonly artifactId: ArtifactId
  readonly receiptDigest: Sha256Digest
  readonly verdict: 'met' | 'not_met' | 'inconclusive'
}

export interface ApprovalRecord {
  readonly artifactId: ArtifactId
  readonly authority: 'human'
  readonly approvalId: string
}

export interface ChampionPointer {
  readonly artifactId: ArtifactId
  readonly revision: number
}

interface ArtifactRecordedEvent {
  readonly type: 'artifact-recorded'
  readonly at: string
  readonly artifact: ArtifactVersion
}

interface EvaluationRecordedEvent {
  readonly type: 'evaluation-recorded'
  readonly at: string
  readonly evaluation: EvaluationRecord
}

interface ApprovalRecordedEvent {
  readonly type: 'approval-recorded'
  readonly at: string
  readonly approval: ApprovalRecord
}

interface TransitionEvent {
  readonly type: 'promoted' | 'rolled-back'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly revision: number
  readonly receiptDigest: Sha256Digest
  readonly approvalId: string
}

export interface RuntimeBoundEvent {
  readonly type: 'runtime-bound'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly pluginId: string
  readonly packageId: string
}

export interface ActivationFailedEvent {
  readonly type: 'activation-failed'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly phase: 'promotion' | 'rollback' | 'rehydrate'
  readonly message: string
  readonly receiptDigest?: Sha256Digest
  readonly approvalId?: string
  readonly pluginId?: string
  readonly packageId?: string
}

export interface RecoveryFailedEvent {
  readonly type: 'recovery-failed'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly previousArtifactId: ArtifactId
  readonly message: string
}

export type LedgerEvent =
  | LearningIntakeLedgerEvent
  | LearningFeedbackRetractedEvent
  | LearningAnalysisLedgerEvent
  | LearningAnalysisConsentRecordedEvent
  | LearningConsentNoticeIntentRecordedEvent
  | LearningConsentNoticeDeliveredEvent
  | RunBindingRecordedEvent
  | InitialRunSkillBindingRecordedEvent
  | OutcomeIntakeRecordedEvent
  | RunSkillManifestRecordedEvent
  | RunSkillUseRecordedEvent
  | LearningCaseOpenedEvent
  | LearningAttributionRecordedEvent
  | LearningLessonRecordedEvent
  | LearningCandidateRecordedEvent
  | SkillEvalProtocolFrozenEvent
  | SkillEvaluationOpenedEvent
  | SkillEvaluationResultRecordedEvent
  | ControlledSkillEvalProtocolFrozenEvent
  | ControlledSkillEvaluationOpenedEvent
  | ControlledSkillEvaluationObjectiveRecordedEvent
  | ControlledSkillEvaluationBlindMapFrozenEvent
  | ControlledSkillEvaluatorObservationRecordedEvent
  | ControlledSkillEvaluationResultRecordedEvent
  | ControlledSkillShadowOpenedEvent
  | ControlledSkillShadowResultRecordedEvent
  | ControlledSkillPointerInitializedEvent
  | ControlledSkillTransitionStartedEvent
  | ControlledSkillTransitionVerifiedEvent
  | ControlledSkillActivationFailedEvent
  | ArtifactRecordedEvent
  | EvaluationRecordedEvent
  | ApprovalRecordedEvent
  | TransitionEvent
  | RuntimeBoundEvent
  | ActivationFailedEvent
  | RecoveryFailedEvent

export type RunBindingObservation = TianwenRunBinding & {
  readonly recordedAt: string
}

export const PUBLIC_LEDGER_EVENT_TYPES = Object.freeze([
  'artifact-recorded',
  'evaluation-recorded',
  'approval-recorded',
  'promoted',
  'rolled-back',
  'runtime-bound',
  'activation-failed',
  'recovery-failed',
] as const) satisfies readonly LedgerEvent['type'][]

export type PublicLedgerEventType =
  typeof PUBLIC_LEDGER_EVENT_TYPES[number]

export type PublicLedgerEvent = Extract<
  LedgerEvent,
  { readonly type: PublicLedgerEventType }
>

export function isPublicLedgerEvent(
  event: LedgerEvent,
): event is PublicLedgerEvent {
  return (PUBLIC_LEDGER_EVENT_TYPES as readonly string[])
    .includes(event.type)
}

export type GovernanceErrorCode =
  | 'artifact-missing'
  | 'evaluation-required'
  | 'evaluation-not-met'
  | 'human-approval-required'
  | 'already-champion'
  | 'rollback-required'
  | 'rollback-target-required'

export class LedgerIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LedgerIntegrityError'
  }
}

export class LedgerCommitUnknownError extends LedgerIntegrityError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LedgerCommitUnknownError'
  }
}

export class LedgerAppendNotCommittedError extends LedgerIntegrityError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LedgerAppendNotCommittedError'
  }
}

export class EvolutionGovernanceError extends Error {
  constructor(
    readonly code: GovernanceErrorCode,
    readonly artifactId: ArtifactId,
    message: string,
  ) {
    super(message)
    this.name = 'EvolutionGovernanceError'
  }
}

export interface TransitionAuthority {
  readonly artifact: ArtifactVersion
  readonly evaluation: EvaluationRecord
  readonly approval: ApprovalRecord
}

export interface EvolutionLedgerOptions {
  readonly clock?: () => string
}

type EvolutionLedgerMode = 'mutation' | 'inspection'

type StoredLearningConsentNotice = LearningConsentNoticeBinding & (
  | {
      readonly state: 'pending'
      readonly intentRecordedAt: string
    }
  | {
      readonly state: 'delivered'
      readonly intentRecordedAt: string
      readonly deliveredAt: string
    }
)

export interface ActivationFailure {
  readonly artifactId: ArtifactId
  readonly phase: ActivationFailedEvent['phase']
  readonly message: string
  readonly authority?: TransitionAuthority
  readonly binding?: {
    readonly pluginId: string
    readonly packageId: string
  }
}

const ARTIFACT_ID = /^artifact:[a-f0-9]{64}$/
const LEARNING_SIGNAL_ID = /^signal:[a-f0-9]{64}$/
const LEARNING_TICKET_ID = /^ticket:[a-f0-9]{64}$/
const GOVERNED_SKILL_CANDIDATE_ID = /^candidate:[a-f0-9]{64}$/
const CONTROLLED_SKILL_EVALUATION_ID = /^evaluation:[a-f0-9]{64}$/
const CONTROLLED_SKILL_SHADOW_ID = /^shadow:[a-f0-9]{64}$/
const CONTROLLED_SKILL_TRANSITION_ID = /^transition:[a-f0-9]{64}$/
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  if (
    required.some(key => !(key in value)) ||
    keys.some(key => !allowed.has(key))
  ) {
    throw new LedgerIntegrityError('ledger event has an invalid shape')
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LedgerIntegrityError(`${label} must be a non-empty string`)
  }
  return value
}

function requireArtifactId(value: unknown): ArtifactId {
  const id = requireString(value, 'artifactId')
  if (!ARTIFACT_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid ArtifactId: ${id}`)
  }
  return id as ArtifactId
}

function requireDigest(value: unknown): Sha256Digest {
  const digest = requireString(value, 'digest')
  if (!SHA256_DIGEST.test(digest)) {
    throw new LedgerIntegrityError(`invalid SHA-256 digest: ${digest}`)
  }
  return digest as Sha256Digest
}

function requireSignalId(value: unknown): LearningSignalId {
  const id = requireString(value, 'signalId')
  if (!LEARNING_SIGNAL_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid LearningSignalId: ${id}`)
  }
  return id as LearningSignalId
}

function requireTicketId(value: unknown): LearningTicketId {
  const id = requireString(value, 'ticketId')
  if (!LEARNING_TICKET_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid LearningTicketId: ${id}`)
  }
  return id as LearningTicketId
}

function requireGovernedSkillCandidateId(value: unknown): GovernedSkillCandidateId {
  const id = requireString(value, 'candidateId')
  if (!GOVERNED_SKILL_CANDIDATE_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid GovernedSkillCandidateId: ${id}`)
  }
  return id as GovernedSkillCandidateId
}

function requireControlledSkillEvaluationId(value: unknown): ControlledSkillEvaluationId {
  const id = requireString(value, 'evaluationId')
  if (!CONTROLLED_SKILL_EVALUATION_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid ControlledSkillEvaluationId: ${id}`)
  }
  return id as ControlledSkillEvaluationId
}

function requireControlledSkillShadowId(value: unknown): ControlledSkillShadowId {
  const id = requireString(value, 'shadowId')
  if (!CONTROLLED_SKILL_SHADOW_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid ControlledSkillShadowId: ${id}`)
  }
  return id as ControlledSkillShadowId
}

function requireControlledSkillTransitionId(value: unknown): ControlledSkillTransitionId {
  const id = requireString(value, 'transitionId')
  if (!CONTROLLED_SKILL_TRANSITION_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid ControlledSkillTransitionId: ${id}`)
  }
  return id as ControlledSkillTransitionId
}

function requireTimestamp(value: unknown): string {
  const timestamp = requireString(value, 'timestamp')
  if (
    Number.isNaN(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) {
    throw new LedgerIntegrityError(`invalid timestamp: ${timestamp}`)
  }
  return timestamp
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new LedgerIntegrityError('revision must be a positive integer')
  }
  return value as number
}

function parseArtifact(value: unknown): ArtifactVersion {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('artifact must be an object')
  }
  exactKeys(
    value,
    ['artifactId', 'sourceDigest', 'createdAt'],
    ['parentArtifactId'],
  )
  const artifactId = requireArtifactId(value.artifactId)
  const sourceDigest = requireDigest(value.sourceDigest)
  if (artifactId.slice('artifact:'.length) !== sourceDigest.slice('sha256:'.length)) {
    throw new LedgerIntegrityError('ArtifactId must equal the source digest')
  }
  const parentArtifactId = value.parentArtifactId === undefined
    ? undefined
    : requireArtifactId(value.parentArtifactId)
  return {
    artifactId,
    ...(parentArtifactId === undefined ? {} : { parentArtifactId }),
    sourceDigest,
    createdAt: requireTimestamp(value.createdAt),
  }
}

function parseEvaluation(value: unknown): EvaluationRecord {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('evaluation must be an object')
  }
  exactKeys(value, ['artifactId', 'receiptDigest', 'verdict'])
  if (
    value.verdict !== 'met' &&
    value.verdict !== 'not_met' &&
    value.verdict !== 'inconclusive'
  ) {
    throw new LedgerIntegrityError('invalid evaluation verdict')
  }
  return {
    artifactId: requireArtifactId(value.artifactId),
    receiptDigest: requireDigest(value.receiptDigest),
    verdict: value.verdict,
  }
}

function parseApproval(value: unknown): ApprovalRecord {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('approval must be an object')
  }
  exactKeys(value, ['artifactId', 'authority', 'approvalId'])
  if (value.authority !== 'human') {
    throw new LedgerIntegrityError('approval authority must be human')
  }
  return {
    artifactId: requireArtifactId(value.artifactId),
    authority: 'human',
    approvalId: requireString(value.approvalId, 'approvalId'),
  }
}

function parseLearningInput(value: unknown): LearningIntakeInput {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning input must be an object')
  }
  exactKeys(
    value,
    [
      'sessionId',
      'messageId',
      'feedbackVersion',
      'rating',
      'scopeKey',
      'sessionDigest',
      'evidenceIds',
    ],
    ['note'],
  )
  if (value.rating !== 'positive' && value.rating !== 'negative') {
    throw new LedgerIntegrityError('invalid learning feedback rating')
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new LedgerIntegrityError('learning note must be a string')
  }
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('learning evidenceIds must be an array')
  }
  const input: LearningIntakeInput = {
    sessionId: requireString(value.sessionId, 'sessionId'),
    messageId: requireString(value.messageId, 'messageId'),
    feedbackVersion: requireString(value.feedbackVersion, 'feedbackVersion'),
    rating: value.rating,
    ...(value.note === undefined ? {} : { note: value.note }),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
  try {
    prepareLearningIntake(input)
  } catch (error) {
    throw new LedgerIntegrityError('learning input is invalid', {
      cause: error,
    })
  }
  return input
}

function parseLearningReceipt(
  value: unknown,
): Omit<LearningIntakeReceipt, 'duplicate'> {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning receipt must be an object')
  }
  exactKeys(value, ['decision', 'ingestionId'], ['signalId', 'ticketId'])
  if (
    value.decision !== 'no-case' &&
    value.decision !== 'observed-gap' &&
    value.decision !== 'ticket-created' &&
    value.decision !== 'ticket-merged'
  ) {
    throw new LedgerIntegrityError('invalid learning intake decision')
  }
  const signalId = value.signalId === undefined
    ? undefined
    : requireSignalId(value.signalId)
  const ticketId = value.ticketId === undefined
    ? undefined
    : requireTicketId(value.ticketId)
  const ticketDecision =
    value.decision === 'ticket-created' || value.decision === 'ticket-merged'
  if (
    ticketDecision
      ? signalId === undefined || ticketId === undefined
      : signalId !== undefined || ticketId !== undefined
  ) {
    throw new LedgerIntegrityError(
      'learning receipt identifiers disagree with its decision',
    )
  }
  return {
    decision: value.decision,
    ingestionId: requireDigest(value.ingestionId),
    ...(signalId === undefined ? {} : { signalId }),
    ...(ticketId === undefined ? {} : { ticketId }),
  }
}

function parseLearningSignal(value: unknown): LearningSignal {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning signal must be an object')
  }
  exactKeys(value, [
    'signalId',
    'ingestionId',
    'sessionId',
    'messageId',
    'feedbackVersion',
    'scopeKey',
    'problemFingerprint',
    'noteDigest',
    'sessionDigest',
    'evidenceIds',
  ])
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('learning signal evidenceIds must be an array')
  }
  return {
    signalId: requireSignalId(value.signalId),
    ingestionId: requireDigest(value.ingestionId),
    sessionId: requireString(value.sessionId, 'sessionId'),
    messageId: requireString(value.messageId, 'messageId'),
    feedbackVersion: requireString(value.feedbackVersion, 'feedbackVersion'),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    problemFingerprint: requireDigest(value.problemFingerprint),
    noteDigest: requireDigest(value.noteDigest),
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
}

function parseLearningEvent(
  value: Record<string, unknown>,
  at: string,
): LearningIntakeLedgerEvent {
  const v2 = value.schemaVersion === 'tianwen.learning-intake.v2'
  exactKeys(
    value,
    ['schemaVersion', 'type', 'at', 'input', 'inputDigest', 'receipt'],
    v2
      ? [
          'sessionLifecycleFingerprint',
          'supersedesFeedbackVersion',
          'analysisConsentRevision',
          'signal',
        ]
      : ['signal'],
  )
  if (!v2 && value.schemaVersion !== 'tianwen.learning-intake.v1') {
    throw new LedgerIntegrityError('invalid learning intake schema version')
  }
  const input = parseLearningInput(value.input)
  const prepared = prepareLearningIntake(input)
  const inputDigest = requireDigest(value.inputDigest)
  const receipt = parseLearningReceipt(value.receipt)
  const signal = value.signal === undefined
    ? undefined
    : parseLearningSignal(value.signal)

  if (
    inputDigest !== prepared.inputDigest ||
    receipt.ingestionId !== prepared.ingestionId
  ) {
    throw new LedgerIntegrityError('learning event disagrees with its input')
  }
  if (prepared.kind !== 'explicit-correction') {
    if (receipt.decision !== prepared.kind || signal !== undefined) {
      throw new LedgerIntegrityError('learning observation has invalid output')
    }
  } else {
    if (
      (receipt.decision !== 'ticket-created' &&
        receipt.decision !== 'ticket-merged') ||
      receipt.signalId !== prepared.signalId ||
      receipt.ticketId !== prepared.ticketId ||
      signal === undefined ||
      signal.signalId !== prepared.signalId ||
      signal.ingestionId !== prepared.ingestionId ||
      signal.sessionId !== input.sessionId ||
      signal.messageId !== input.messageId ||
      signal.feedbackVersion !== input.feedbackVersion ||
      signal.scopeKey !== input.scopeKey ||
      signal.problemFingerprint !== prepared.problemFingerprint ||
      signal.noteDigest !== prepared.noteDigest ||
      signal.sessionDigest !== input.sessionDigest ||
      JSON.stringify(signal.evidenceIds) !== JSON.stringify(input.evidenceIds)
    ) {
      throw new LedgerIntegrityError('learning Signal disagrees with its input')
    }
  }

  const base = {
    type: 'learning-intake-recorded' as const,
    at,
    input,
    inputDigest,
    receipt,
    ...(signal === undefined ? {} : { signal }),
  }
  if (!v2) {
    return {
      schemaVersion: 'tianwen.learning-intake.v1',
      ...base,
    }
  }
  const supersedesFeedbackVersion = value.supersedesFeedbackVersion === undefined
    ? undefined
    : requireString(
        value.supersedesFeedbackVersion,
        'supersedesFeedbackVersion',
      )
  const analysisConsentRevision = value.analysisConsentRevision
  if (
    analysisConsentRevision !== undefined
    && (
      typeof analysisConsentRevision !== 'number'
      || !Number.isInteger(analysisConsentRevision)
      || analysisConsentRevision < 1
    )
  ) {
    throw new LedgerIntegrityError(
      'analysisConsentRevision must be a positive integer',
    )
  }
  const sessionLifecycleFingerprint =
    value.sessionLifecycleFingerprint === undefined
      ? undefined
      : requireDigest(value.sessionLifecycleFingerprint)
  return {
    schemaVersion: 'tianwen.learning-intake.v2',
    ...base,
    ...(sessionLifecycleFingerprint === undefined
      ? {}
      : { sessionLifecycleFingerprint }),
    ...(supersedesFeedbackVersion === undefined
      ? {}
      : { supersedesFeedbackVersion }),
    ...(analysisConsentRevision === undefined
      ? {}
      : { analysisConsentRevision }),
  }
}

function parseLearningFeedbackRetractionEvent(
  value: Record<string, unknown>,
  at: string,
): LearningFeedbackRetractedEvent {
  const v2 = value.schemaVersion === 'tianwen.learning-feedback-retracted.v2'
  exactKeys(value, [
    'schemaVersion',
    'type',
    'at',
    'sessionId',
    'messageId',
    'retractedFeedbackVersion',
    ...(v2 ? ['sessionLifecycleFingerprint'] : []),
  ])
  if (!v2 && value.schemaVersion !== 'tianwen.learning-feedback-retracted.v1') {
    throw new LedgerIntegrityError('invalid learning retraction schema version')
  }
  const common = {
    type: 'learning-feedback-retracted' as const,
    at,
    sessionId: requireString(value.sessionId, 'sessionId'),
    messageId: requireString(value.messageId, 'messageId'),
    retractedFeedbackVersion: requireString(
      value.retractedFeedbackVersion,
      'retractedFeedbackVersion',
    ),
  }
  return v2
    ? {
        schemaVersion: 'tianwen.learning-feedback-retracted.v2',
        ...common,
        sessionLifecycleFingerprint: requireDigest(
          value.sessionLifecycleFingerprint,
        ),
      }
    : {
        schemaVersion: 'tianwen.learning-feedback-retracted.v1',
        ...common,
      }
}

function parseLearningAnalysisRequestedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisRequestedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'binding'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-request.v1') {
    throw new LedgerIntegrityError('invalid learning analysis request schema')
  }
  if (!isRecord(value.binding)) {
    throw new LedgerIntegrityError('learning analysis binding must be an object')
  }
  exactKeys(value.binding, [
    'analysisId',
    'ticketId',
    'sessionId',
    'messageId',
    'feedbackVersion',
    'consentRevision',
    'parentSessionId',
    'childSessionId',
    'phase',
  ])
  let binding
  try {
    binding = prepareLearningAnalysisRequest({
      ticketId: requireTicketId(value.binding.ticketId),
      sessionId: requireString(value.binding.sessionId, 'sessionId'),
      messageId: requireString(value.binding.messageId, 'messageId'),
      feedbackVersion: requireString(
        value.binding.feedbackVersion,
        'feedbackVersion',
      ),
      consentRevision: requireRevision(value.binding.consentRevision),
      parentSessionId: requireString(
        value.binding.parentSessionId,
        'parentSessionId',
      ),
    })
  } catch (error) {
    throw new LedgerIntegrityError('learning analysis request is invalid', {
      cause: error,
    })
  }
  if (
    value.binding.analysisId !== binding.analysisId
    || value.binding.childSessionId !== binding.childSessionId
    || value.binding.phase !== 'pending-parent'
  ) throw new LedgerIntegrityError('learning analysis identity is invalid')
  return {
    schemaVersion: 'tianwen.learning-analysis-request.v1',
    type: 'learning-analysis-requested',
    at,
    binding,
  }
}

function parseLearningAnalysisChildStartedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisChildStartedEvent {
  exactKeys(value, [
    'schemaVersion',
    'type',
    'at',
    'analysisId',
    'parentSessionId',
    'childSessionId',
  ])
  if (value.schemaVersion !== 'tianwen.learning-analysis-child.v1') {
    throw new LedgerIntegrityError('invalid learning analysis child schema')
  }
  try {
    return {
      schemaVersion: 'tianwen.learning-analysis-child.v1',
      type: 'learning-analysis-child-started',
      at,
      analysisId: learningAnalysisId(value.analysisId),
      parentSessionId: requireString(
        value.parentSessionId,
        'parentSessionId',
      ),
      childSessionId: requireString(value.childSessionId, 'childSessionId'),
    }
  } catch (error) {
    throw new LedgerIntegrityError('learning analysis child binding is invalid', {
      cause: error,
    })
  }
}

function parseLearningAnalysisSubmittedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisSubmittedEvent {
  exactKeys(value, [
    'schemaVersion',
    'type',
    'at',
    'analysisId',
    'childSessionId',
    'submission',
    'submissionDigest',
  ])
  if (value.schemaVersion !== 'tianwen.learning-analysis-submission.v1') {
    throw new LedgerIntegrityError('invalid learning analysis submission schema')
  }
  try {
    const submission = parseLearningAnalysisSubmission(value.submission)
    const submissionDigest = requireDigest(value.submissionDigest)
    if (submissionDigest !== sha256(submission)) {
      throw new TypeError('learning analysis submission digest changed')
    }
    return {
      schemaVersion: 'tianwen.learning-analysis-submission.v1',
      type: 'learning-analysis-submitted',
      at,
      analysisId: learningAnalysisId(value.analysisId),
      childSessionId: requireString(value.childSessionId, 'childSessionId'),
      submission,
      submissionDigest,
    }
  } catch (error) {
    throw new LedgerIntegrityError('learning analysis submission is invalid', {
      cause: error,
    })
  }
}

function parseLearningAnalysisInvalidatedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisInvalidatedEvent {
  exactKeys(value, [
    'schemaVersion',
    'type',
    'at',
    'analysisId',
    'reason',
  ])
  if (
    value.schemaVersion !== 'tianwen.learning-analysis-invalidation.v1'
    || value.reason !== 'support-withdrawn'
  ) throw new LedgerIntegrityError('invalid learning analysis invalidation')
  try {
    return {
      schemaVersion: 'tianwen.learning-analysis-invalidation.v1',
      type: 'learning-analysis-invalidated',
      at,
      analysisId: learningAnalysisId(value.analysisId),
      reason: 'support-withdrawn',
    }
  } catch (error) {
    throw new LedgerIntegrityError('learning analysis invalidation is invalid', {
      cause: error,
    })
  }
}

function parseLearningAnalysisCandidateReadyEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisCandidateReadyEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'analysisId', 'candidateId'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-candidate-ready.v1') {
    throw new LedgerIntegrityError('invalid learning analysis Candidate-ready schema')
  }
  return {
    schemaVersion: 'tianwen.learning-analysis-candidate-ready.v1',
    type: 'learning-analysis-candidate-ready',
    at,
    analysisId: learningAnalysisId(value.analysisId),
    candidateId: requireGovernedSkillCandidateId(value.candidateId),
  }
}

function parseLearningAnalysisProtocolUnavailableEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisProtocolUnavailableEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'analysisId'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-protocol-unavailable.v1') {
    throw new LedgerIntegrityError('invalid learning analysis protocol-unavailable schema')
  }
  return {
    schemaVersion: 'tianwen.learning-analysis-protocol-unavailable.v1',
    type: 'learning-analysis-protocol-unavailable',
    at,
    analysisId: learningAnalysisId(value.analysisId),
  }
}

function parseLearningAnalysisGovernedOutcomeEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisGovernedOutcomeRecordedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'analysisId', 'outcome'])
  if (
    value.schemaVersion !== 'tianwen.learning-analysis-governed-outcome.v1'
    || !isRecord(value.outcome)
  ) throw new LedgerIntegrityError('invalid learning analysis governed outcome schema')
  const outcome = value.outcome
  let parsed: LearningAnalysisGovernedOutcome
  if (outcome.phase === 'candidate-rejected') {
    exactKeys(outcome, [
      'phase', 'candidateId', 'evaluationId', 'evaluationResultDigest',
    ], ['shadowId', 'shadowResultDigest'])
    if ((outcome.shadowId === undefined) !== (outcome.shadowResultDigest === undefined)) {
      throw new LedgerIntegrityError('invalid learning analysis rejected outcome')
    }
    parsed = {
      phase: outcome.phase,
      candidateId: requireGovernedSkillCandidateId(outcome.candidateId),
      evaluationId: requireControlledSkillEvaluationId(outcome.evaluationId),
      evaluationResultDigest: requireDigest(outcome.evaluationResultDigest),
      ...(outcome.shadowId === undefined ? {} : {
        shadowId: requireControlledSkillShadowId(outcome.shadowId),
        shadowResultDigest: requireDigest(outcome.shadowResultDigest),
      }),
    }
  } else if (outcome.phase === 'shadow-ready') {
    exactKeys(outcome, [
      'phase', 'candidateId', 'evaluationId', 'evaluationResultDigest',
      'shadowId', 'shadowResultDigest', 'promotionRecommendationDigest',
    ])
    parsed = {
      phase: outcome.phase,
      candidateId: requireGovernedSkillCandidateId(outcome.candidateId),
      evaluationId: requireControlledSkillEvaluationId(outcome.evaluationId),
      evaluationResultDigest: requireDigest(outcome.evaluationResultDigest),
      shadowId: requireControlledSkillShadowId(outcome.shadowId),
      shadowResultDigest: requireDigest(outcome.shadowResultDigest),
      promotionRecommendationDigest: requireDigest(outcome.promotionRecommendationDigest),
    }
  } else if (outcome.phase === 'promoted'
    || outcome.phase === 'rolled-back'
    || outcome.phase === 'transition-recovered') {
    exactKeys(outcome, ['phase', 'transitionId', 'transitionReceiptDigest'])
    parsed = {
      phase: outcome.phase,
      transitionId: requireControlledSkillTransitionId(outcome.transitionId),
      transitionReceiptDigest: requireDigest(outcome.transitionReceiptDigest),
    }
  } else {
    throw new LedgerIntegrityError('invalid learning analysis governed outcome phase')
  }
  return {
    schemaVersion: 'tianwen.learning-analysis-governed-outcome.v1',
    type: 'learning-analysis-governed-outcome-recorded',
    at,
    analysisId: learningAnalysisId(value.analysisId),
    outcome: parsed,
  }
}

function parseLearningAnalysisFailedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisFailedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'analysisId', 'resumePhase'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-failed.v1') {
    throw new LedgerIntegrityError('invalid learning analysis failed schema')
  }
  if (
    value.resumePhase !== 'pending-parent'
    && value.resumePhase !== 'running'
    && value.resumePhase !== 'candidate-ready'
    && value.resumePhase !== 'shadow-ready'
    && value.resumePhase !== 'promoted'
  ) throw new LedgerIntegrityError('invalid learning analysis retry phase')
  return {
    schemaVersion: 'tianwen.learning-analysis-failed.v1',
    type: 'learning-analysis-failed',
    at,
    analysisId: learningAnalysisId(value.analysisId),
    resumePhase: value.resumePhase,
  }
}

function parseLearningAnalysisResumedEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisResumedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'analysisId', 'resumePhase'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-resumed.v1') {
    throw new LedgerIntegrityError('invalid learning analysis resumed schema')
  }
  if (
    value.resumePhase !== 'pending-parent'
    && value.resumePhase !== 'running'
    && value.resumePhase !== 'candidate-ready'
    && value.resumePhase !== 'shadow-ready'
    && value.resumePhase !== 'promoted'
  ) throw new LedgerIntegrityError('invalid learning analysis retry phase')
  return {
    schemaVersion: 'tianwen.learning-analysis-resumed.v1',
    type: 'learning-analysis-resumed',
    at,
    analysisId: learningAnalysisId(value.analysisId),
    resumePhase: value.resumePhase,
  }
}

function parseLearningAnalysisReport(
  value: unknown,
  delivered: boolean,
): LearningAnalysisReportBinding & { readonly reportMessageId?: string } {
  if (!isRecord(value)) throw new LedgerIntegrityError('learning analysis report must be an object')
  exactKeys(value,
    ['analysisId', 'parentSessionId', 'childSessionId', 'reportDigest'],
    delivered ? ['reportMessageId'] : [],
  )
  return {
    analysisId: learningAnalysisId(value.analysisId),
    parentSessionId: requireString(value.parentSessionId, 'parentSessionId'),
    childSessionId: requireString(value.childSessionId, 'childSessionId'),
    reportDigest: requireDigest(value.reportDigest),
    ...(delivered ? { reportMessageId: requireString(value.reportMessageId, 'reportMessageId') } : {}),
  }
}

function sameLearningAnalysisReportBinding(
  left: LearningAnalysisReportBinding,
  right: LearningAnalysisReportBinding,
): boolean {
  return left.analysisId === right.analysisId
    && left.parentSessionId === right.parentSessionId
    && left.childSessionId === right.childSessionId
    && left.reportDigest === right.reportDigest
}

function parseLearningAnalysisReportIntentEvent(
  value: Record<string, unknown>, at: string,
): LearningAnalysisReportIntentRecordedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'report'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-report-intent.v1') {
    throw new LedgerIntegrityError('invalid learning analysis report intent schema')
  }
  return {
    schemaVersion: 'tianwen.learning-analysis-report-intent.v1',
    type: 'learning-analysis-report-intent-recorded', at,
    report: parseLearningAnalysisReport(value.report, false),
  }
}

function parseLearningAnalysisReportDeliveredEvent(
  value: Record<string, unknown>, at: string,
): LearningAnalysisReportDeliveredEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'report'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-report-delivered.v1') {
    throw new LedgerIntegrityError('invalid learning analysis report delivery schema')
  }
  const report = parseLearningAnalysisReport(value.report, true)
  if (report.reportMessageId === undefined) throw new LedgerIntegrityError('learning analysis report message is missing')
  return {
    schemaVersion: 'tianwen.learning-analysis-report-delivered.v1',
    type: 'learning-analysis-report-delivered', at,
    report: { ...report, reportMessageId: report.reportMessageId },
  }
}

function parseLearningAnalysisTerminalReportIntentEvent(value: Record<string, unknown>, at: string): LearningAnalysisTerminalReportIntentRecordedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'report'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-terminal-report-intent.v1') throw new LedgerIntegrityError('invalid terminal report intent schema')
  return { schemaVersion: 'tianwen.learning-analysis-terminal-report-intent.v1', type: 'learning-analysis-terminal-report-intent-recorded', at, report: parseLearningAnalysisReport(value.report, false) }
}

function parseLearningAnalysisTerminalReportDeliveredEvent(value: Record<string, unknown>, at: string): LearningAnalysisTerminalReportDeliveredEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'report'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-terminal-report-delivered.v1') throw new LedgerIntegrityError('invalid terminal report delivery schema')
  const report = parseLearningAnalysisReport(value.report, true)
  if (report.reportMessageId === undefined) throw new LedgerIntegrityError('terminal report message is missing')
  return { schemaVersion: 'tianwen.learning-analysis-terminal-report-delivered.v1', type: 'learning-analysis-terminal-report-delivered', at, report: { ...report, reportMessageId: report.reportMessageId } }
}

function parseLearningAnalysisConsent(
  value: unknown,
): LearningAnalysisConsent {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning analysis consent must be an object')
  }
  exactKeys(value, [
    'revision',
    'enabled',
    'policyVersion',
    'recordedAt',
  ])
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
    throw new LedgerIntegrityError('consent revision must be a positive integer')
  }
  if (typeof value.enabled !== 'boolean') {
    throw new LedgerIntegrityError('consent enabled must be a boolean')
  }
  if (value.policyVersion !== 'tianwen-auto-analysis.v1') {
    throw new LedgerIntegrityError('invalid learning analysis consent policy')
  }
  return {
    revision: Number(value.revision),
    enabled: value.enabled,
    policyVersion: 'tianwen-auto-analysis.v1',
    recordedAt: requireTimestamp(value.recordedAt),
  }
}

function parseLearningAnalysisConsentEvent(
  value: Record<string, unknown>,
  at: string,
): LearningAnalysisConsentRecordedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'consent'])
  if (value.schemaVersion !== 'tianwen.learning-analysis-consent.v1') {
    throw new LedgerIntegrityError('invalid learning analysis consent schema')
  }
  const consent = parseLearningAnalysisConsent(value.consent)
  if (consent.recordedAt !== at) {
    throw new LedgerIntegrityError(
      'learning analysis consent timestamp disagrees with its event',
    )
  }
  return {
    schemaVersion: 'tianwen.learning-analysis-consent.v1',
    type: 'learning-analysis-consent-recorded',
    at,
    consent,
  }
}

function parseLearningConsentNoticeBinding(
  value: unknown,
): LearningConsentNoticeBinding {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning consent notice must be an object')
  }
  exactKeys(value, [
    'policyVersion',
    'mainSessionId',
    'noticeSourceMessageId',
    'deliveryId',
  ])
  if (value.policyVersion !== 'tianwen-auto-analysis.v1') {
    throw new LedgerIntegrityError('invalid learning consent notice policy')
  }
  return {
    policyVersion: 'tianwen-auto-analysis.v1',
    mainSessionId: requireString(value.mainSessionId, 'mainSessionId'),
    noticeSourceMessageId: requireString(
      value.noticeSourceMessageId,
      'noticeSourceMessageId',
    ),
    deliveryId: requireString(value.deliveryId, 'deliveryId'),
  }
}

function parseLearningConsentNoticeIntentEvent(
  value: Record<string, unknown>,
  at: string,
): LearningConsentNoticeIntentRecordedEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'notice'])
  if (value.schemaVersion !== 'tianwen.learning-consent-notice-intent.v1') {
    throw new LedgerIntegrityError('invalid learning consent notice intent schema')
  }
  return {
    schemaVersion: 'tianwen.learning-consent-notice-intent.v1',
    type: 'learning-consent-notice-intent-recorded',
    at,
    notice: parseLearningConsentNoticeBinding(value.notice),
  }
}

function parseLearningConsentNoticeDeliveredEvent(
  value: Record<string, unknown>,
  at: string,
): LearningConsentNoticeDeliveredEvent {
  exactKeys(value, ['schemaVersion', 'type', 'at', 'notice'])
  if (value.schemaVersion !== 'tianwen.learning-consent-notice-delivered.v1') {
    throw new LedgerIntegrityError('invalid learning consent notice delivery schema')
  }
  return {
    schemaVersion: 'tianwen.learning-consent-notice-delivered.v1',
    type: 'learning-consent-notice-delivered',
    at,
    notice: parseLearningConsentNoticeBinding(value.notice),
  }
}

function parseOutcomeInput(value: unknown): OutcomeIntakeInput {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('Outcome input must be an object')
  }
  exactKeys(value, ['runId', 'verdict', 'sessionDigest', 'evidenceIds'])
  if (
    value.verdict !== 'met'
    && value.verdict !== 'not-met'
    && value.verdict !== 'inconclusive'
  ) {
    throw new LedgerIntegrityError('invalid Outcome verdict')
  }
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('Outcome evidenceIds must be an array')
  }
  return {
    runId: requireString(value.runId, 'runId') as TianwenRunId,
    verdict: value.verdict as OutcomeVerdict,
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
}

function parseOutcomeReceipt(
  value: unknown,
): Omit<OutcomeIntakeReceipt, 'duplicate'> {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('Outcome receipt must be an object')
  }
  exactKeys(value, ['decision', 'ingestionId'], ['signalId', 'ticketId'])
  if (
    value.decision !== 'no-case'
    && value.decision !== 'continue-observing'
    && value.decision !== 'ordinary-correction'
    && value.decision !== 'signal-recorded'
    && value.decision !== 'ticket-created'
    && value.decision !== 'ticket-merged'
  ) {
    throw new LedgerIntegrityError('invalid Outcome intake decision')
  }
  const signalId = value.signalId === undefined
    ? undefined
    : requireSignalId(value.signalId)
  const ticketId = value.ticketId === undefined
    ? undefined
    : requireTicketId(value.ticketId)
  const hasSignal = value.decision === 'signal-recorded'
    || value.decision === 'ticket-created'
    || value.decision === 'ticket-merged'
  const hasTicket = value.decision === 'ticket-created'
    || value.decision === 'ticket-merged'
  if (
    (hasSignal ? signalId === undefined : signalId !== undefined)
    || (hasTicket ? ticketId === undefined : ticketId !== undefined)
  ) {
    throw new LedgerIntegrityError(
      'Outcome receipt identifiers disagree with its decision',
    )
  }
  return {
    decision: value.decision,
    ingestionId: requireDigest(value.ingestionId),
    ...(signalId === undefined ? {} : { signalId }),
    ...(ticketId === undefined ? {} : { ticketId }),
  }
}

function parseOutcomeSignal(value: unknown): OutcomeLearningSignal {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('Outcome Signal must be an object')
  }
  exactKeys(value, [
    'signalId',
    'ingestionId',
    'runId',
    'sessionId',
    'scopeKey',
    'problemFingerprint',
    'problemCategory',
    'failureSignature',
    'severity',
    'blocksGoal',
    'sessionDigest',
    'evidenceIds',
  ])
  if (
    !Number.isInteger(value.severity)
    || (value.severity as number) < 1
    || (value.severity as number) > 5
  ) {
    throw new LedgerIntegrityError('invalid Outcome severity')
  }
  if (typeof value.blocksGoal !== 'boolean') {
    throw new LedgerIntegrityError('invalid Outcome blocksGoal')
  }
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('Outcome Signal evidenceIds must be an array')
  }
  return {
    signalId: requireSignalId(value.signalId),
    ingestionId: requireDigest(value.ingestionId),
    runId: requireString(value.runId, 'runId') as TianwenRunId,
    sessionId: requireString(value.sessionId, 'sessionId'),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    problemFingerprint: requireDigest(value.problemFingerprint),
    problemCategory: requireString(value.problemCategory, 'problemCategory'),
    failureSignature: requireDigest(value.failureSignature),
    severity: value.severity as OutcomeSeverity,
    blocksGoal: value.blocksGoal,
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
}

function parseOutcomeEvent(
  value: Record<string, unknown>,
  at: string,
): OutcomeIntakeRecordedEvent {
  exactKeys(
    value,
    ['schemaVersion', 'type', 'at', 'input', 'inputDigest', 'receipt'],
    ['signal'],
  )
  if (value.schemaVersion !== 'tianwen.outcome-intake.v1') {
    throw new LedgerIntegrityError('invalid Outcome intake schema version')
  }
  const input = parseOutcomeInput(value.input)
  const receipt = parseOutcomeReceipt(value.receipt)
  const signal = value.signal === undefined
    ? undefined
    : parseOutcomeSignal(value.signal)
  return {
    schemaVersion: 'tianwen.outcome-intake.v1',
    type: 'outcome-intake-recorded',
    at,
    input,
    inputDigest: requireDigest(value.inputDigest),
    receipt,
    ...(signal === undefined ? {} : { signal }),
  }
}

function parseStoredRunBinding(value: unknown): TianwenRunBinding {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('Run binding must be an object')
  }
  const isV2 = value.schemaVersion === 'tianwen.run-binding.v2'
  const isV3 = value.schemaVersion === 'tianwen.run-binding.v3'
  const hasAcceptanceSubject = isV2 || (
    isV3 && 'acceptanceSubjectDigest' in value
  )
  exactKeys(value, [
    'schemaVersion',
    'runId',
    'goalRef',
    'taskRef',
    'sessionId',
    'scopeKey',
    'acceptanceContract',
    'acceptanceContractDigest',
    ...(hasAcceptanceSubject ? ['acceptanceSubjectDigest'] : []),
    ...(isV3 ? ['sessionLifecycleFingerprint'] : []),
  ])
  if (
    value.schemaVersion !== 'tianwen.run-binding.v1'
    && !isV2
    && !isV3
  ) {
    throw new LedgerIntegrityError('invalid stored Run binding version')
  }
  const binding = prepareRunBinding({
    goalRef: requireString(value.goalRef, 'goalRef'),
    taskRef: requireString(value.taskRef, 'taskRef'),
    sessionId: requireString(value.sessionId, 'sessionId'),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    acceptanceContract: value.acceptanceContract as RunAcceptanceContract,
    ...(hasAcceptanceSubject ? {
      acceptanceSubjectDigest: requireDigest(value.acceptanceSubjectDigest),
    } : {}),
    ...(isV3 ? {
      sessionLifecycleFingerprint: requireDigest(
        value.sessionLifecycleFingerprint,
      ),
    } : {}),
  })
  if (
    value.runId !== binding.runId
    || value.acceptanceContractDigest !== binding.acceptanceContractDigest
  ) {
    throw new LedgerIntegrityError('Run binding event disagrees with input')
  }
  return binding
}

function parseEvent(value: unknown): LedgerEvent {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('ledger event must be an object')
  }
  const type = requireString(value.type, 'event type')
  const at = requireTimestamp(value.at)
  if (type === 'learning-intake-recorded') {
    return parseLearningEvent(value, at)
  }
  if (type === 'learning-feedback-retracted') {
    return parseLearningFeedbackRetractionEvent(value, at)
  }
  if (type === 'learning-analysis-requested') {
    return parseLearningAnalysisRequestedEvent(value, at)
  }
  if (type === 'learning-analysis-child-started') {
    return parseLearningAnalysisChildStartedEvent(value, at)
  }
  if (type === 'learning-analysis-submitted') {
    return parseLearningAnalysisSubmittedEvent(value, at)
  }
  if (type === 'learning-analysis-invalidated') {
    return parseLearningAnalysisInvalidatedEvent(value, at)
  }
  if (type === 'learning-analysis-candidate-ready') {
    return parseLearningAnalysisCandidateReadyEvent(value, at)
  }
  if (type === 'learning-analysis-protocol-unavailable') {
    return parseLearningAnalysisProtocolUnavailableEvent(value, at)
  }
  if (type === 'learning-analysis-governed-outcome-recorded') {
    return parseLearningAnalysisGovernedOutcomeEvent(value, at)
  }
  if (type === 'learning-analysis-failed') {
    return parseLearningAnalysisFailedEvent(value, at)
  }
  if (type === 'learning-analysis-resumed') {
    return parseLearningAnalysisResumedEvent(value, at)
  }
  if (type === 'learning-analysis-report-intent-recorded') {
    return parseLearningAnalysisReportIntentEvent(value, at)
  }
  if (type === 'learning-analysis-report-delivered') {
    return parseLearningAnalysisReportDeliveredEvent(value, at)
  }
  if (type === 'learning-analysis-terminal-report-intent-recorded') return parseLearningAnalysisTerminalReportIntentEvent(value, at)
  if (type === 'learning-analysis-terminal-report-delivered') return parseLearningAnalysisTerminalReportDeliveredEvent(value, at)
  if (type === 'learning-analysis-consent-recorded') {
    return parseLearningAnalysisConsentEvent(value, at)
  }
  if (type === 'learning-consent-notice-intent-recorded') {
    return parseLearningConsentNoticeIntentEvent(value, at)
  }
  if (type === 'learning-consent-notice-delivered') {
    return parseLearningConsentNoticeDeliveredEvent(value, at)
  }
  if (type === 'run-binding-recorded') {
    exactKeys(value, [
      'schemaVersion',
      'type',
      'at',
      'binding',
      'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.run-binding.v1') {
      throw new LedgerIntegrityError('invalid Run binding schema version')
    }
    const binding = parseStoredRunBinding(value.binding)
    if (
      requireDigest(value.inputDigest) !== sha256(binding)
    ) {
      throw new LedgerIntegrityError('Run binding event disagrees with input')
    }
    return {
      schemaVersion: 'tianwen.run-binding.v1',
      type,
      at,
      binding,
      inputDigest: sha256(binding),
    }
  }
  if (type === 'initial-run-skill-binding-recorded') {
    exactKeys(value, [
      'schemaVersion',
      'type',
      'at',
      'binding',
      'manifest',
      'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.initial-run-skill-binding.v1') {
      throw new LedgerIntegrityError('invalid initial Run Skill binding version')
    }
    const binding = parseStoredRunBinding(value.binding)
    if (binding.schemaVersion !== 'tianwen.run-binding.v3') {
      throw new LedgerIntegrityError('initial Run Skill binding requires v3')
    }
    let manifest
    try {
      manifest = parseRunSkillManifest(value.manifest)
    } catch (error) {
      throw new LedgerIntegrityError('invalid initial Run Skill manifest', {
        cause: error,
      })
    }
    const pair = { binding, manifest }
    if (
      binding.runId !== manifest.runId
      || requireDigest(value.inputDigest) !== sha256(pair)
    ) throw new LedgerIntegrityError('initial Run Skill binding pair disagrees')
    return {
      schemaVersion: 'tianwen.initial-run-skill-binding.v1',
      type,
      at,
      ...pair,
      inputDigest: sha256(pair),
    }
  }
  if (type === 'outcome-intake-recorded') {
    return parseOutcomeEvent(value, at)
  }
  if (type === 'controlled-skill-eval-protocol-frozen') {
    exactKeys(value, [
      'schemaVersion', 'type', 'at', 'protocol', 'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.controlled-skill-eval-protocol.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation protocol event version')
    }
    let protocol
    try {
      protocol = parseControlledSkillEvalProtocol(value.protocol)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation protocol event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(protocol)) {
      throw new LedgerIntegrityError('controlled Skill evaluation protocol digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
      type,
      at,
      protocol,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-evaluation-opened') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'plan', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-plan.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation plan event version')
    }
    let plan
    try {
      plan = parseControlledSkillEvaluationPlan(value.plan)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation plan event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(plan)) {
      throw new LedgerIntegrityError('controlled Skill evaluation plan digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2',
      type,
      at,
      plan,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-evaluation-objective-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'objective', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-objective.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation objective event version')
    }
    let objective
    try {
      objective = parseControlledSkillEvaluationObjective(value.objective)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation objective event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(objective)) {
      throw new LedgerIntegrityError('controlled Skill evaluation objective digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2',
      type,
      at,
      objective,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-evaluation-blind-map-frozen') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'blindMap', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-blind-map.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation blind map event version')
    }
    let blindMap
    try {
      blindMap = parseControlledSkillEvaluationBlindMap(value.blindMap)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation blind map event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(blindMap)) {
      throw new LedgerIntegrityError('controlled Skill evaluation blind map digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-blind-map.v2',
      type,
      at,
      blindMap,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-evaluator-observation-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'observation', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-evaluator-observation.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluator observation event version')
    }
    let observation
    try {
      observation = parseControlledSkillEvaluatorObservation(value.observation)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluator observation event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(observation)) {
      throw new LedgerIntegrityError('controlled Skill evaluator observation digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluator-observation.v2',
      type,
      at,
      observation,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-evaluation-result-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'result', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-evaluation-result.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation result event version')
    }
    let result
    try {
      result = parseControlledSkillEvaluationResult(value.result)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill evaluation result event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(result)) {
      throw new LedgerIntegrityError('controlled Skill evaluation result digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-result.v2',
      type,
      at,
      result,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-shadow-opened') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'plan', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-shadow-plan.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill Shadow plan event version')
    }
    let plan
    try {
      plan = parseControlledSkillShadowPlan(value.plan)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill Shadow plan event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(plan)) {
      throw new LedgerIntegrityError('controlled Skill Shadow plan digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-shadow-plan.v2',
      type,
      at,
      plan,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-shadow-result-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'result', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-shadow-result.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill Shadow result event version')
    }
    let result
    try {
      result = parseControlledSkillShadowResult(value.result)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill Shadow result event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(result)) {
      throw new LedgerIntegrityError('controlled Skill Shadow result digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-shadow-result.v2',
      type,
      at,
      result,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-pointer-initialized') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'initialization', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-pointer-initialization.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill pointer event version')
    }
    let initialization
    try {
      initialization = parseControlledSkillPointerInitialization(value.initialization)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill pointer event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(initialization)) {
      throw new LedgerIntegrityError('controlled Skill pointer digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2',
      type,
      at,
      initialization,
      inputDigest,
    }
  }
  if (
    type === 'controlled-skill-promoted'
    || type === 'controlled-skill-rolled-back'
    || type === 'controlled-skill-restored'
  ) {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'transition', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-transition.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill transition event version')
    }
    let transition
    try {
      transition = parseControlledSkillTransition(value.transition)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill transition event', { cause: error })
    }
    const expectedType = transition.kind === 'promote'
      ? 'controlled-skill-promoted'
      : transition.kind === 'rollback'
        ? 'controlled-skill-rolled-back'
        : 'controlled-skill-restored'
    const inputDigest = requireDigest(value.inputDigest)
    if (type !== expectedType || inputDigest !== sha256(transition)) {
      throw new LedgerIntegrityError('controlled Skill transition digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-transition.v2',
      type,
      at,
      transition,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-transition-verified') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'verification', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-transition-verification.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill transition verification event version')
    }
    let verification
    try {
      verification = parseControlledSkillTransitionVerification(value.verification)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill transition verification event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(verification)) {
      throw new LedgerIntegrityError('controlled Skill transition verification digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-transition-verification.v2',
      type,
      at,
      verification,
      inputDigest,
    }
  }
  if (type === 'controlled-skill-activation-failed') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'failure', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.controlled-skill-activation-failure.v2') {
      throw new LedgerIntegrityError('invalid controlled Skill activation failure event version')
    }
    let failure
    try {
      failure = parseControlledSkillActivationFailure(value.failure)
    } catch (error) {
      throw new LedgerIntegrityError('invalid controlled Skill activation failure event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(failure)) {
      throw new LedgerIntegrityError('controlled Skill activation failure digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.controlled-skill-activation-failure.v2',
      type,
      at,
      failure,
      inputDigest,
    }
  }
  if (type === 'skill-eval-protocol-frozen') {
    exactKeys(value, [
      'schemaVersion', 'type', 'at', 'protocol', 'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.skill-eval-protocol.v1') {
      throw new LedgerIntegrityError('invalid Skill evaluation protocol event version')
    }
    let protocol
    try {
      protocol = parseSkillEvalProtocol(value.protocol)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Skill evaluation protocol event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(protocol)) {
      throw new LedgerIntegrityError('Skill evaluation protocol digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.skill-eval-protocol.v1',
      type,
      at,
      protocol,
      inputDigest,
    }
  }
  if (type === 'skill-evaluation-opened') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'plan', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.skill-evaluation-plan.v1') {
      throw new LedgerIntegrityError('invalid Skill evaluation plan event version')
    }
    let plan
    try {
      plan = parseSkillEvaluationPlan(value.plan)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Skill evaluation plan event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(plan)) {
      throw new LedgerIntegrityError('Skill evaluation plan digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.skill-evaluation-plan.v1',
      type,
      at,
      plan,
      inputDigest,
    }
  }
  if (type === 'skill-evaluation-result-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'result', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.skill-evaluation-result.v1') {
      throw new LedgerIntegrityError('invalid Skill evaluation result event version')
    }
    let result
    try {
      result = parseSkillEvaluationResult(value.result)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Skill evaluation result event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(result)) {
      throw new LedgerIntegrityError('Skill evaluation result digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.skill-evaluation-result.v1',
      type,
      at,
      result,
      inputDigest,
    }
  }
  if (type === 'run-skill-manifest-recorded') {
    exactKeys(value, [
      'schemaVersion',
      'type',
      'at',
      'manifest',
      'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.run-skill-manifest.v1') {
      throw new LedgerIntegrityError('invalid Run Skill manifest event version')
    }
    let manifest
    try {
      manifest = parseRunSkillManifest(value.manifest)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Run Skill manifest event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(manifest)) {
      throw new LedgerIntegrityError('Run Skill manifest digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.run-skill-manifest.v1',
      type,
      at,
      manifest,
      inputDigest,
    }
  }
  if (type === 'run-skill-use-recorded') {
    exactKeys(value, [
      'schemaVersion',
      'type',
      'at',
      'use',
      'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.run-skill-use.v1') {
      throw new LedgerIntegrityError('invalid Run Skill use event version')
    }
    let use
    try {
      use = parseRunSkillUse(value.use)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Run Skill use event', {
        cause: error,
      })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(use)) {
      throw new LedgerIntegrityError('Run Skill use digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.run-skill-use.v1',
      type,
      at,
      use,
      inputDigest,
    }
  }
  if (type === 'learning-case-opened') {
    exactKeys(value, [
      'schemaVersion', 'type', 'at', 'case', 'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.learning-case.v1') {
      throw new LedgerIntegrityError('invalid Learning Case event version')
    }
    let learningCase
    try {
      learningCase = parseLearningCase(value.case)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Learning Case event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(learningCase)) {
      throw new LedgerIntegrityError('Learning Case digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.learning-case.v1',
      type,
      at,
      case: learningCase,
      inputDigest,
    }
  }
  if (type === 'learning-attribution-recorded') {
    exactKeys(value, [
      'schemaVersion', 'type', 'at', 'attribution', 'inputDigest',
    ])
    if (value.schemaVersion !== 'tianwen.learning-attribution.v1') {
      throw new LedgerIntegrityError('invalid Attribution event version')
    }
    let attribution
    try {
      attribution = parseAttribution(value.attribution)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Attribution event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(attribution)) {
      throw new LedgerIntegrityError('Attribution digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.learning-attribution.v1',
      type,
      at,
      attribution,
      inputDigest,
    }
  }
  if (type === 'learning-lesson-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'lesson', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.learning-lesson.v1') {
      throw new LedgerIntegrityError('invalid Accepted Lesson event version')
    }
    let lesson
    try {
      lesson = parseAcceptedLesson(value.lesson)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Accepted Lesson event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(lesson)) {
      throw new LedgerIntegrityError('Accepted Lesson digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.learning-lesson.v1',
      type,
      at,
      lesson,
      inputDigest,
    }
  }
  if (type === 'learning-candidate-recorded') {
    exactKeys(value, ['schemaVersion', 'type', 'at', 'candidate', 'inputDigest'])
    if (value.schemaVersion !== 'tianwen.learning-candidate.v1') {
      throw new LedgerIntegrityError('invalid Skill Candidate event version')
    }
    let candidate
    try {
      candidate = parseSkillCandidate(value.candidate)
    } catch (error) {
      throw new LedgerIntegrityError('invalid Skill Candidate event', { cause: error })
    }
    const inputDigest = requireDigest(value.inputDigest)
    if (inputDigest !== sha256(candidate)) {
      throw new LedgerIntegrityError('Skill Candidate digest mismatch')
    }
    return {
      schemaVersion: 'tianwen.learning-candidate.v1',
      type,
      at,
      candidate,
      inputDigest,
    }
  }
  if (type === 'artifact-recorded') {
    exactKeys(value, ['type', 'at', 'artifact'])
    const artifact = parseArtifact(value.artifact)
    if (artifact.createdAt !== at) {
      throw new LedgerIntegrityError('artifact timestamp disagrees with event')
    }
    return { type, at, artifact }
  }
  if (type === 'evaluation-recorded') {
    exactKeys(value, ['type', 'at', 'evaluation'])
    return {
      type,
      at,
      evaluation: parseEvaluation(value.evaluation),
    }
  }
  if (type === 'approval-recorded') {
    exactKeys(value, ['type', 'at', 'approval'])
    return {
      type,
      at,
      approval: parseApproval(value.approval),
    }
  }
  if (type === 'promoted' || type === 'rolled-back') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'revision', 'receiptDigest', 'approvalId'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      revision: requireRevision(value.revision),
      receiptDigest: requireDigest(value.receiptDigest),
      approvalId: requireString(value.approvalId, 'approvalId'),
    }
  }
  if (type === 'runtime-bound') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'pluginId', 'packageId'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      pluginId: requireString(value.pluginId, 'pluginId'),
      packageId: requireString(value.packageId, 'packageId'),
    }
  }
  if (type === 'activation-failed') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'phase', 'message'],
      ['receiptDigest', 'approvalId', 'pluginId', 'packageId'],
    )
    if (
      value.phase !== 'promotion' &&
      value.phase !== 'rollback' &&
      value.phase !== 'rehydrate'
    ) {
      throw new LedgerIntegrityError('invalid activation failure phase')
    }
    const receiptDigest = value.receiptDigest === undefined
      ? undefined
      : requireDigest(value.receiptDigest)
    const approvalId = value.approvalId === undefined
      ? undefined
      : requireString(value.approvalId, 'approvalId')
    const pluginId = value.pluginId === undefined
      ? undefined
      : requireString(value.pluginId, 'pluginId')
    const packageId = value.packageId === undefined
      ? undefined
      : requireString(value.packageId, 'packageId')
    if ((receiptDigest === undefined) !== (approvalId === undefined)) {
      throw new LedgerIntegrityError(
        'activation authority digest and approval must appear together',
      )
    }
    if ((pluginId === undefined) !== (packageId === undefined)) {
      throw new LedgerIntegrityError(
        'activation plugin and package IDs must appear together',
      )
    }
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      phase: value.phase,
      message: requireString(value.message, 'activation failure message'),
      ...(receiptDigest === undefined ? {} : { receiptDigest }),
      ...(approvalId === undefined ? {} : { approvalId }),
      ...(pluginId === undefined ? {} : { pluginId }),
      ...(packageId === undefined ? {} : { packageId }),
    }
  }
  if (type === 'recovery-failed') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'previousArtifactId', 'message'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      previousArtifactId: requireArtifactId(value.previousArtifactId),
      message: requireString(value.message, 'recovery failure message'),
    }
  }
  throw new LedgerIntegrityError(`unknown ledger event type: ${type}`)
}

function canonicalLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

function writeAllSync(descriptor: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  let offset = 0
  while (offset < bytes.length) {
    const written = writeSync(
      descriptor,
      bytes,
      offset,
      bytes.length - offset,
    )
    if (written <= 0) {
      throw new Error('file write made no progress')
    }
    offset += written
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isOutcomeSignal(
  signal: LearningSignal | OutcomeLearningSignal,
): signal is OutcomeLearningSignal {
  return 'runId' in signal
}

function learningRetractionKey(input: {
  readonly sessionId: string
  readonly messageId: string
  readonly retractedFeedbackVersion: string
}): Sha256Digest {
  return sha256({
    sessionId: input.sessionId,
    messageId: input.messageId,
    retractedFeedbackVersion: input.retractedFeedbackVersion,
  })
}

type LearningRevisionWrite =
  | { readonly schemaVersion: 'tianwen.learning-intake.v1' }
  | {
    readonly schemaVersion: 'tianwen.learning-intake.v2'
    readonly sessionLifecycleFingerprint: Sha256Digest
    readonly supersedesFeedbackVersion?: string
    readonly analysisConsentRevision?: number
  }

export class EvolutionLedger {
  readonly #root: string
  readonly #artifactsRoot: string
  readonly #ledgerPath: string
  readonly #pointerPath: string
  readonly #clock: () => string
  readonly #events: LedgerEvent[] = []
  readonly #runBindings = new Map<TianwenRunId, TianwenRunBinding>()
  readonly #runIdBySession = new Map<string, TianwenRunId>()
  readonly #runBindingRecordedAt = new Map<TianwenRunId, string>()
  readonly #learningIntakes = new Map<
    Sha256Digest,
    LearningIntakeLedgerEvent
  >()
  readonly #learningIntakeStatuses = new Map<
    string,
    Map<string, LearningIntakeStatus>
  >()
  readonly #learningRetractions = new Map<
    Sha256Digest,
    LearningFeedbackRetractedEvent
  >()
  readonly #learningAnalyses = new Map<
    LearningAnalysisId,
    LearningAnalysisStatus
  >()
  readonly #learningAnalysisIdByChildSession = new Map<
    string,
    LearningAnalysisId
  >()
  readonly #learningAnalysisConsents = new Map<
    number,
    LearningAnalysisConsent
  >()
  #learningAnalysisConsent: LearningAnalysisConsent | undefined
  readonly #learningConsentNotices = new Map<
    LearningConsentNoticeBinding['policyVersion'],
    StoredLearningConsentNotice
  >()
  readonly #outcomeIntakes = new Map<
    Sha256Digest,
    OutcomeIntakeRecordedEvent
  >()
  readonly #runSkillManifests = new Map<TianwenRunId, RunSkillManifest>()
  readonly #runSkillUses = new Map<TianwenRunId, RunSkillUse>()
  readonly #learningCases = new Map<LearningCaseId, LearningCase>()
  readonly #caseIdByTicket = new Map<LearningTicketId, LearningCaseId>()
  readonly #attributions = new Map<AttributionId, AttributionRecord>()
  readonly #attributionIdByCase = new Map<LearningCaseId, AttributionId>()
  readonly #acceptedLessons = new Map<LessonId, AcceptedLesson>()
  readonly #lessonIdByAttribution = new Map<AttributionId, LessonId>()
  readonly #skillCandidates = new Map<
    GovernedSkillCandidateId,
    GovernedSkillCandidate
  >()
  readonly #candidateIdByCase = new Map<
    LearningCaseId,
    GovernedSkillCandidateId
  >()
  readonly #skillEvalProtocols = new Map<
    SkillEvalProtocolId,
    SkillEvalProtocolRecord
  >()
  readonly #skillEvalProtocolIdsByTicket = new Map<
    LearningTicketId,
    SkillEvalProtocolId[]
  >()
  readonly #controlledSkillEvalProtocols = new Map<
    SkillEvalProtocolId,
    ControlledSkillEvalProtocolRecord
  >()
  readonly #controlledSkillEvalProtocolIdsByTicket = new Map<
    LearningTicketId,
    SkillEvalProtocolId[]
  >()
  readonly #controlledSkillEvaluationPlans = new Map<
    ControlledSkillEvaluationId,
    ControlledSkillEvaluationPlan
  >()
  readonly #controlledSkillEvaluationObjectives = new Map<
    ControlledSkillEvaluationId,
    Map<ControlledSkillEvalTaskId, ControlledSkillEvaluationObjective>
  >()
  readonly #controlledSkillEvaluationBlindMaps = new Map<
    ControlledSkillEvaluationId,
    ControlledSkillEvaluationBlindMap
  >()
  readonly #controlledSkillEvaluatorObservations = new Map<
    ControlledSkillEvaluationId,
    Map<ControlledSkillEvalTaskId, ControlledSkillEvaluatorObservation>
  >()
  readonly #controlledSkillEvaluationResults = new Map<
    ControlledSkillEvaluationId,
    ControlledSkillEvaluationResult
  >()
  readonly #controlledSkillShadowPlans = new Map<
    ControlledSkillShadowId,
    ControlledSkillShadowPlan
  >()
  readonly #controlledSkillShadowIdByEvaluation = new Map<
    ControlledSkillEvaluationId,
    ControlledSkillShadowId
  >()
  readonly #controlledSkillShadowResults = new Map<
    ControlledSkillShadowId,
    ControlledSkillShadowResult
  >()
  readonly #controlledSkillPointerInitializations = new Map<
    ControlledSkillShadowId,
    ControlledSkillPointerInitialization
  >()
  readonly #controlledSkillPointerInitializationByScope = new Map<
    string,
    ControlledSkillPointerInitialization
  >()
  readonly #controlledSkillScopePointers = new Map<
    string,
    ControlledSkillScopePointer
  >()
  readonly #controlledSkillTransitions = new Map<
    ControlledSkillTransitionId,
    ControlledSkillTransition
  >()
  readonly #controlledSkillTransitionIdsByLogicalKey = new Map<
    string,
    ControlledSkillTransitionId
  >()
  readonly #controlledSkillTransitionIdsByShadow = new Map<
    ControlledSkillShadowId,
    ControlledSkillTransitionId[]
  >()
  readonly #controlledSkillTransitionVerifications = new Map<
    ControlledSkillTransitionId,
    ControlledSkillTransitionVerification
  >()
  readonly #controlledSkillActivationFailures = new Map<
    ControlledSkillTransitionId,
    ControlledSkillActivationFailure
  >()
  readonly #skillEvaluationPlans = new Map<
    SkillEvaluationId,
    SkillEvaluationPlan
  >()
  readonly #skillEvaluationResults = new Map<
    SkillEvaluationId,
    SkillEvaluationResult
  >()
  readonly #learningSignals = new Map<
    LearningSignalId,
    LearningSignal | OutcomeLearningSignal
  >()
  readonly #inactiveLearningSignals = new Set<LearningSignalId>()
  readonly #learningTickets = new Map<LearningTicketId, LearningTicket>()
  readonly #artifacts = new Map<ArtifactId, ArtifactVersion>()
  readonly #evaluations = new Map<ArtifactId, EvaluationRecord>()
  readonly #approvals = new Map<ArtifactId, ApprovalRecord[]>()
  readonly #approvalIds = new Set<string>()
  readonly #usedApprovals = new Set<string>()
  readonly #promoted = new Set<ArtifactId>()
  #champion: ChampionPointer | undefined
  #appendBlocked = false

  constructor(
    root: string,
    options: EvolutionLedgerOptions = {},
    mode: EvolutionLedgerMode = 'mutation',
  ) {
    this.#root = root
    this.#artifactsRoot = join(root, 'artifacts')
    this.#ledgerPath = join(root, 'ledger.jsonl')
    this.#pointerPath = join(root, 'champion.json')
    this.#clock = options.clock ?? (() => new Date().toISOString())
    if (mode === 'mutation') {
      mkdirSync(this.#artifactsRoot, { recursive: true })
    }
    this.#replay()
    if (mode === 'mutation') {
      for (const artifact of this.#artifacts.values()) {
        this.#verifySource(artifact)
      }
    }
    this.#verifyPointer(mode === 'mutation')
    if (mode === 'mutation') this.#invalidateUnsupportedLearningAnalyses()
  }

  recordRunBinding(input: RunBindingInput): RunBindingReceipt {
    const prepared = prepareRunBinding(input)
    const sessionRunId = this.#runIdBySession.get(prepared.sessionId)
    if (sessionRunId !== undefined) {
      const existing = this.#runBindings.get(sessionRunId)
      if (existing !== undefined) {
        if (
          sessionRunId !== prepared.runId
          || canonicalJson(existing) !== canonicalJson(prepared)
        ) {
          throw new LedgerIntegrityError(
            `DSH Session is already bound to another Tianwen Run: ${prepared.sessionId}`,
          )
        }
        return { runId: prepared.runId, duplicate: true }
      }
      if (
        sessionRunId !== prepared.runId
        || !this.#matchesControlledTransitionReservation(prepared)
      ) {
        throw new LedgerIntegrityError(
          `DSH Session is already bound to another Tianwen Run: ${prepared.sessionId}`,
        )
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.run-binding.v1',
      type: 'run-binding-recorded',
      at: this.#now(),
      binding: prepared,
      inputDigest: sha256(prepared),
    })
    return { runId: prepared.runId, duplicate: false }
  }

  recordInitialRunSkillBinding(
    input: InitialRunSkillBindingInput,
  ): InitialRunSkillBindingReceipt {
    let pair
    try {
      pair = prepareInitialRunSkillBinding(input)
    } catch (error) {
      throw new LedgerIntegrityError(
        'Initial Run Skill binding input is invalid',
        { cause: error },
      )
    }
    const existingRunId = this.#runIdBySession.get(pair.binding.sessionId)
    const existingBinding = existingRunId === undefined
      ? undefined
      : this.#runBindings.get(existingRunId)
    const existingManifest = existingRunId === undefined
      ? undefined
      : this.#runSkillManifests.get(existingRunId)
    if (existingBinding !== undefined || existingManifest !== undefined) {
      if (
        existingRunId !== pair.binding.runId
        || existingBinding === undefined
        || existingManifest === undefined
        || canonicalJson(existingBinding) !== canonicalJson(pair.binding)
        || canonicalJson(existingManifest) !== canonicalJson(pair.manifest)
      ) {
        throw new LedgerIntegrityError(
          `Initial Run Skill binding changed after freeze: ${pair.binding.sessionId}`,
        )
      }
      return {
        runId: pair.binding.runId,
        parentVersionId: pair.manifest.parentVersionId,
        duplicate: true,
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.initial-run-skill-binding.v1',
      type: 'initial-run-skill-binding-recorded',
      at: this.#now(),
      ...pair,
      inputDigest: sha256(pair),
    })
    return {
      runId: pair.binding.runId,
      parentVersionId: pair.manifest.parentVersionId,
      duplicate: false,
    }
  }

  #matchesControlledTransitionReservation(
    binding: TianwenRunBinding,
  ): boolean {
    if (binding.schemaVersion !== 'tianwen.run-binding.v3') return false
    const transition = [...this.#controlledSkillTransitions.values()]
      .find(item => item.runBinding.runId === binding.runId)
    if (transition === undefined) return false
    const planned = transition.runBinding
    const expected = prepareRunBinding({
      goalRef: planned.goalRef,
      taskRef: planned.taskRef,
      sessionId: planned.sessionId,
      scopeKey: planned.scopeKey,
      acceptanceContract: planned.acceptanceContract,
      acceptanceSubjectDigest: planned.acceptanceSubjectDigest,
      sessionLifecycleFingerprint: binding.sessionLifecycleFingerprint,
    })
    return canonicalJson(binding) === canonicalJson(expected)
  }

  getRunBinding(runId: TianwenRunId): TianwenRunBinding | undefined {
    const binding = this.#runBindings.get(runId)
    return binding === undefined ? undefined : clone(binding)
  }

  getRunBindingBySessionId(sessionId: string): RunBindingObservation | undefined {
    const runId = this.#runIdBySession.get(sessionId)
    if (runId === undefined) return undefined
    const binding = this.#runBindings.get(runId)
    const recordedAt = this.#runBindingRecordedAt.get(runId)
    return binding === undefined || recordedAt === undefined
      ? undefined
      : clone({ ...binding, recordedAt })
  }

  recordRunSkillManifest(
    input: RunSkillManifestInput,
  ): RunSkillManifestReceipt {
    if (!this.#runBindings.has(input.runId)) {
      throw new LedgerIntegrityError(`unknown Tianwen Run: ${input.runId}`)
    }
    let manifest
    try {
      manifest = prepareRunSkillManifest(input)
    } catch (error) {
      throw new LedgerIntegrityError('Run Skill manifest input is invalid', {
        cause: error,
      })
    }
    const existing = this.#runSkillManifests.get(manifest.runId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(manifest)) {
        throw new LedgerIntegrityError(
          `Run Skill manifest changed after freeze: ${manifest.runId}`,
        )
      }
      return { parentVersionId: manifest.parentVersionId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.run-skill-manifest.v1',
      type: 'run-skill-manifest-recorded',
      at: this.#now(),
      manifest,
      inputDigest: sha256(manifest),
    })
    return { parentVersionId: manifest.parentVersionId, duplicate: false }
  }

  getRunSkillManifest(runId: TianwenRunId): RunSkillManifest | undefined {
    const manifest = this.#runSkillManifests.get(runId)
    return manifest === undefined ? undefined : clone(manifest)
  }

  listRunSkillManifests(): readonly RunSkillManifest[] {
    return clone([...this.#runSkillManifests.values()])
  }

  recordRunSkillUse(input: RunSkillUseInput): RunSkillUseReceipt {
    const binding = this.#runBindings.get(input.runId)
    const manifest = this.#runSkillManifests.get(input.runId)
    const outcome = [...this.#outcomeIntakes.values()]
      .find(event => event.input.runId === input.runId)?.input
    if (binding === undefined || manifest === undefined || outcome === undefined) {
      throw new LedgerIntegrityError(
        `Run Skill use lacks frozen Run facts: ${input.runId}`,
      )
    }
    let use
    try {
      use = prepareRunSkillUse(input, manifest, binding, outcome)
    } catch (error) {
      throw new LedgerIntegrityError('Run Skill use input is invalid', {
        cause: error,
      })
    }
    const existing = this.#runSkillUses.get(use.runId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(use)) {
        throw new LedgerIntegrityError(
          `Run Skill use changed after freeze: ${use.runId}`,
        )
      }
      return { parentVersionId: use.parentVersionId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.run-skill-use.v1',
      type: 'run-skill-use-recorded',
      at: this.#now(),
      use,
      inputDigest: sha256(use),
    })
    return { parentVersionId: use.parentVersionId, duplicate: false }
  }

  getRunSkillUse(runId: TianwenRunId): RunSkillUse | undefined {
    const use = this.#runSkillUses.get(runId)
    return use === undefined ? undefined : clone(use)
  }

  listRunSkillUses(): readonly RunSkillUse[] {
    return clone([...this.#runSkillUses.values()])
  }

  freezeControlledSkillEvalProtocol(
    input: FreezeControlledSkillEvalProtocolInput,
  ): ControlledSkillEvalProtocolReceipt {
    const ticket = this.#learningTickets.get(input.ticketId)
    if (ticket === undefined) {
      throw new LedgerIntegrityError(`unknown LearningTicket: ${input.ticketId}`)
    }
    // A scope fact is admitted only from an Outcome signal, or from the exact
    // still-active explicit correction that owns this Ticket. Unknown/mixed or
    // retracted history intentionally leaves a ticket signal unresolved.
    const signals = this.#controlledSkillEvalScopeFacts(ticket)
    const provenance = this.#caseIdByTicket.has(ticket.ticketId)
      || (this.#controlledSkillEvalProtocolIdsByTicket.get(ticket.ticketId)?.length ?? 0) > 0
      ? 'retrospective'
      : 'pre-candidate'
    let protocol
    try {
      protocol = prepareControlledSkillEvalProtocol(input, ticket, signals, provenance)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill evaluation protocol input is invalid', {
        cause: error,
      })
    }
    const existing = this.#controlledSkillEvalProtocols.get(protocol.protocolId)
    if (existing !== undefined) {
      return {
        protocolId: existing.protocolId,
        provenance: existing.provenance,
        duplicate: true,
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
      type: 'controlled-skill-eval-protocol-frozen',
      at: this.#now(),
      protocol,
      inputDigest: sha256(protocol),
    })
    return {
      protocolId: protocol.protocolId,
      provenance: protocol.provenance,
      duplicate: false,
    }
  }

  getControlledSkillEvalProtocol(
    protocolId: SkillEvalProtocolId,
  ): ControlledSkillEvalProtocolRecord | undefined {
    const protocol = this.#controlledSkillEvalProtocols.get(protocolId)
    return protocol === undefined ? undefined : clone(protocol)
  }

  listControlledSkillEvalProtocols(): readonly ControlledSkillEvalProtocolRecord[] {
    return clone([...this.#controlledSkillEvalProtocols.values()])
  }

  openControlledSkillEvaluation(
    input: OpenControlledSkillEvaluationInput,
  ): ControlledSkillEvaluationReceipt {
    const candidate = this.#skillCandidates.get(input.candidateId)
    const protocol = this.#controlledSkillEvalProtocols.get(input.protocolId)
    if (candidate === undefined || protocol === undefined) {
      throw new LedgerIntegrityError(
        'controlled Skill evaluation requires its Candidate and protocol',
      )
    }
    const learningCase = this.#learningCases.get(candidate.caseId)
    const lesson = this.#acceptedLessons.get(candidate.lessonId)
    const attribution = this.#attributions.get(candidate.attributionId)
    const parent = [...this.#runSkillManifests.values()]
      .find(value => value.parentVersionId === candidate.parentVersionId)?.parent
    if (
      learningCase === undefined
      || lesson?.caseId !== learningCase.caseId
      || attribution?.caseId !== learningCase.caseId
      || parent === undefined
    ) {
      throw new LedgerIntegrityError(
        'controlled Skill evaluation Candidate chain is incomplete',
      )
    }
    let plan
    try {
      plan = prepareControlledSkillEvaluationPlan(
        input,
        candidate,
        learningCase,
        protocol,
        sha256(parent),
      )
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill evaluation input is invalid', {
        cause: error,
      })
    }
    const existing = this.#controlledSkillEvaluationPlans.get(plan.evaluationId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(plan)) {
        throw new LedgerIntegrityError(
          `controlled Skill evaluation changed: ${plan.evaluationId}`,
        )
      }
      return { evaluationId: existing.evaluationId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2',
      type: 'controlled-skill-evaluation-opened',
      at: this.#now(),
      plan,
      inputDigest: sha256(plan),
    })
    return { evaluationId: plan.evaluationId, duplicate: false }
  }

  getControlledSkillEvaluation(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationPlan | undefined {
    const plan = this.#controlledSkillEvaluationPlans.get(evaluationId)
    return plan === undefined ? undefined : clone(plan)
  }

  listControlledSkillEvaluations(): readonly ControlledSkillEvaluationPlan[] {
    return clone([...this.#controlledSkillEvaluationPlans.values()])
  }

  recordControlledSkillEvaluationObjective(
    input: RecordControlledSkillEvaluationObjectiveInput,
  ): ControlledSkillEvaluationObjectiveReceipt {
    const plan = this.#controlledSkillEvaluationPlans.get(input.evaluationId)
    if (plan === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill evaluation: ${input.evaluationId}`)
    }
    let objective
    try {
      objective = prepareControlledSkillEvaluationObjective(input, plan)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill evaluation objective input is invalid', {
        cause: error,
      })
    }
    this.#validateControlledSkillEvaluationObjectiveRunFacts(objective)
    const existing = this.#controlledSkillEvaluationObjectives
      .get(objective.evaluationId)?.get(objective.taskId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(objective)) {
        throw new LedgerIntegrityError(
          `controlled Skill evaluation objective changed: ${objective.taskId}`,
        )
      }
      return {
        evaluationId: objective.evaluationId,
        taskId: objective.taskId,
        duplicate: true,
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2',
      type: 'controlled-skill-evaluation-objective-recorded',
      at: this.#now(),
      objective,
      inputDigest: sha256(objective),
    })
    return {
      evaluationId: objective.evaluationId,
      taskId: objective.taskId,
      duplicate: false,
    }
  }

  getControlledSkillEvaluationObjective(
    evaluationId: ControlledSkillEvaluationId,
    taskId: ControlledSkillEvalTaskId,
  ): ControlledSkillEvaluationObjective | undefined {
    const objective = this.#controlledSkillEvaluationObjectives.get(evaluationId)?.get(taskId)
    return objective === undefined ? undefined : clone(objective)
  }

  listControlledSkillEvaluationObjectives(
    evaluationId: ControlledSkillEvaluationId,
  ): readonly ControlledSkillEvaluationObjective[] {
    return clone([
      ...(this.#controlledSkillEvaluationObjectives.get(evaluationId)?.values() ?? []),
    ])
  }

  freezeControlledSkillEvaluationBlindMap(
    input: FreezeControlledSkillEvaluationBlindMapInput,
  ): ControlledSkillEvaluationBlindMapReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill evaluation blind map input is invalid')
    }
    exactKeys(input, ['evaluationId'])
    const evaluationId = requireString(
      input.evaluationId,
      'evaluationId',
    ) as ControlledSkillEvaluationId
    const plan = this.#controlledSkillEvaluationPlans.get(evaluationId)
    if (plan === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill evaluation: ${evaluationId}`)
    }
    if (this.#controlledSkillEvaluationBlindMaps.has(evaluationId)) {
      return { evaluationId, duplicate: true }
    }
    if (this.#controlledSkillEvaluationResults.has(evaluationId)) {
      throw new LedgerIntegrityError('controlled Skill evaluation is already terminal')
    }
    const objectives = [
      ...(this.#controlledSkillEvaluationObjectives.get(evaluationId)?.values() ?? []),
    ]
    let blindMap
    try {
      blindMap = prepareControlledSkillEvaluationBlindMap(input, plan, objectives)
    } catch (error) {
      throw new LedgerIntegrityError(
        error instanceof Error ? error.message : 'controlled evaluation blind map input is invalid',
        { cause: error },
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-evaluation-blind-map.v2',
      type: 'controlled-skill-evaluation-blind-map-frozen',
      at: this.#now(),
      blindMap,
      inputDigest: sha256(blindMap),
    })
    return { evaluationId, duplicate: false }
  }

  getControlledSkillEvaluationBlindMap(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationBlindMap | undefined {
    const blindMap = this.#controlledSkillEvaluationBlindMaps.get(evaluationId)
    return blindMap === undefined ? undefined : clone(blindMap)
  }

  recordControlledSkillEvaluatorObservation(
    input: RecordControlledSkillEvaluatorObservationInput,
  ): ControlledSkillEvaluatorObservationReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill evaluator observation input is invalid')
    }
    const evaluationId = requireString(
      input.evaluationId,
      'evaluationId',
    ) as ControlledSkillEvaluationId
    const taskId = requireString(input.taskId, 'taskId') as ControlledSkillEvalTaskId
    const plan = this.#controlledSkillEvaluationPlans.get(evaluationId)
    const blindMap = this.#controlledSkillEvaluationBlindMaps.get(evaluationId)
    if (plan === undefined || blindMap === undefined) {
      throw new LedgerIntegrityError('controlled Skill evaluator observation lacks prerequisites')
    }
    let observation
    try {
      observation = prepareControlledSkillEvaluatorObservation(input, plan, blindMap)
    } catch (error) {
      throw new LedgerIntegrityError(
        error instanceof Error ? error.message : 'controlled evaluator observation input is invalid',
        { cause: error },
      )
    }
    const existing = this.#controlledSkillEvaluatorObservations
      .get(evaluationId)?.get(taskId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(observation)) {
        throw new LedgerIntegrityError(
          `controlled Skill evaluator observation changed: ${taskId}`,
        )
      }
      return { evaluationId, taskId, duplicate: true }
    }
    if (this.#controlledSkillEvaluationResults.has(evaluationId)) {
      throw new LedgerIntegrityError('controlled Skill evaluation is already terminal')
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-evaluator-observation.v2',
      type: 'controlled-skill-evaluator-observation-recorded',
      at: this.#now(),
      observation,
      inputDigest: sha256(observation),
    })
    return { evaluationId, taskId, duplicate: false }
  }

  listControlledSkillEvaluatorObservations(
    evaluationId: ControlledSkillEvaluationId,
  ): readonly ControlledSkillEvaluatorObservation[] {
    return clone([
      ...(this.#controlledSkillEvaluatorObservations.get(evaluationId)?.values() ?? []),
    ])
  }

  recordControlledSkillEvaluationResult(
    input: RecordControlledSkillEvaluationResultInput,
  ): ControlledSkillEvaluationResultReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill evaluation result input is invalid')
    }
    exactKeys(input, ['evaluationId'])
    const evaluationId = requireString(
      input.evaluationId,
      'evaluationId',
    ) as ControlledSkillEvaluationId
    const plan = this.#controlledSkillEvaluationPlans.get(evaluationId)
    if (plan === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill evaluation: ${evaluationId}`)
    }
    if (this.#controlledSkillEvaluationResults.has(evaluationId)) {
      return { evaluationId, duplicate: true }
    }
    const objectives = [
      ...(this.#controlledSkillEvaluationObjectives.get(evaluationId)?.values() ?? []),
    ]
    const blindMap = this.#controlledSkillEvaluationBlindMaps.get(evaluationId)
    const observations = [
      ...(this.#controlledSkillEvaluatorObservations.get(evaluationId)?.values() ?? []),
    ]
    let result
    try {
      result = prepareControlledSkillEvaluationResult(
        input,
        plan,
        objectives,
        blindMap,
        observations,
      )
    } catch (error) {
      throw new LedgerIntegrityError(
        error instanceof Error ? error.message : 'controlled evaluation result input is invalid',
        { cause: error },
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-evaluation-result.v2',
      type: 'controlled-skill-evaluation-result-recorded',
      at: this.#now(),
      result,
      inputDigest: sha256(result),
    })
    return { evaluationId, duplicate: false }
  }

  getControlledSkillEvaluationResult(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationResult | undefined {
    const result = this.#controlledSkillEvaluationResults.get(evaluationId)
    return result === undefined ? undefined : clone(result)
  }

  openControlledSkillShadow(
    input: OpenControlledSkillShadowInput,
  ): ControlledSkillShadowReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill Shadow input is invalid')
    }
    exactKeys(input, ['evaluationId', 'tasks'])
    const evaluationId = requireString(
      input.evaluationId,
      'evaluationId',
    ) as ControlledSkillEvaluationId
    const evaluation = this.#controlledSkillEvaluationPlans.get(evaluationId)
    const result = this.#controlledSkillEvaluationResults.get(evaluationId)
    const candidate = evaluation === undefined
      ? undefined
      : this.#skillCandidates.get(evaluation.candidateId)
    const parent = evaluation === undefined
      ? undefined
      : [...this.#runSkillManifests.values()]
        .find(manifest => manifest.parentVersionId === evaluation.parentVersionId)
    if (evaluation === undefined || result === undefined
      || candidate === undefined || parent === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill evaluation: ${evaluationId}`)
    }
    const objectives = [
      ...(this.#controlledSkillEvaluationObjectives.get(evaluationId)?.values() ?? []),
    ]
    const observations = [
      ...(this.#controlledSkillEvaluatorObservations.get(evaluationId)?.values() ?? []),
    ]
    let plan
    try {
      plan = prepareControlledSkillShadowPlan(
        input,
        evaluation,
        result,
        candidate,
        sha256(parent.parent),
        objectives,
        observations,
      )
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill Shadow input is invalid', {
        cause: error,
      })
    }
    const existingId = this.#controlledSkillShadowIdByEvaluation.get(evaluationId)
    if (existingId !== undefined) {
      const existing = this.#controlledSkillShadowPlans.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(plan)) {
        throw new LedgerIntegrityError(`controlled Skill Shadow changed: ${existingId}`)
      }
      return { shadowId: existingId, duplicate: true }
    }
    if (plan.tasks.some(task => this.#runIdBySession.has(task.sessionId))) {
      throw new LedgerIntegrityError('controlled Skill Shadow requires fresh Sessions')
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-shadow-plan.v2',
      type: 'controlled-skill-shadow-opened',
      at: this.#now(),
      plan,
      inputDigest: sha256(plan),
    })
    return { shadowId: plan.shadowId, duplicate: false }
  }

  getControlledSkillShadow(
    shadowId: ControlledSkillShadowId,
  ): ControlledSkillShadowPlan | undefined {
    const plan = this.#controlledSkillShadowPlans.get(shadowId)
    return plan === undefined ? undefined : clone(plan)
  }

  listControlledSkillShadows(): readonly ControlledSkillShadowPlan[] {
    return clone([...this.#controlledSkillShadowPlans.values()])
  }

  recordControlledSkillShadowResult(
    input: RecordControlledSkillShadowResultInput,
  ): ControlledSkillShadowResultReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill Shadow result input is invalid')
    }
    exactKeys(input, ['shadowId', 'runs'])
    const shadowId = requireString(input.shadowId, 'shadowId') as ControlledSkillShadowId
    const plan = this.#controlledSkillShadowPlans.get(shadowId)
    if (plan === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill Shadow: ${shadowId}`)
    }
    let result
    try {
      result = prepareControlledSkillShadowResult(input, plan)
    } catch (error) {
      throw new LedgerIntegrityError(
        error instanceof Error ? error.message : 'controlled Skill Shadow result input is invalid',
        { cause: error },
      )
    }
    const existing = this.#controlledSkillShadowResults.get(shadowId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(result)) {
        throw new LedgerIntegrityError(`controlled Skill Shadow result changed: ${shadowId}`)
      }
      return { shadowId, duplicate: true }
    }
    this.#validateControlledSkillShadowRunFacts(plan, result)
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-shadow-result.v2',
      type: 'controlled-skill-shadow-result-recorded',
      at: this.#now(),
      result,
      inputDigest: sha256(result),
    })
    return { shadowId, duplicate: false }
  }

  getControlledSkillShadowResult(
    shadowId: ControlledSkillShadowId,
  ): ControlledSkillShadowResult | undefined {
    const result = this.#controlledSkillShadowResults.get(shadowId)
    return result === undefined ? undefined : clone(result)
  }

  listControlledSkillShadowResults(): readonly ControlledSkillShadowResult[] {
    return clone([...this.#controlledSkillShadowResults.values()])
  }

  initializeControlledSkillScopePointer(
    input: InitializeControlledSkillScopePointerInput,
  ): ControlledSkillScopePointerReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill pointer input is invalid')
    }
    exactKeys(input, ['shadowId'])
    const shadowId = requireString(input.shadowId, 'shadowId') as ControlledSkillShadowId
    const recommendation = this.#controlledSkillPromotionRecommendation(shadowId)
    let initialization
    try {
      initialization = prepareControlledSkillPointerInitialization(recommendation)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill pointer input is invalid', { cause: error })
    }
    const existing = this.#controlledSkillPointerInitializations.get(shadowId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(initialization)) {
        throw new LedgerIntegrityError(`controlled Skill pointer changed: ${shadowId}`)
      }
      return {
        scopeKey: existing.pointer.scopeKey,
        revision: existing.pointer.revision,
        duplicate: true,
      }
    }
    if (this.#controlledSkillPointerInitializationByScope.has(initialization.pointer.scopeKey)) {
      throw new LedgerIntegrityError(
        `controlled Skill scope already has a governed pointer: ${initialization.pointer.scopeKey}`,
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-pointer-initialization.v2',
      type: 'controlled-skill-pointer-initialized',
      at: this.#now(),
      initialization,
      inputDigest: sha256(initialization),
    })
    return {
      scopeKey: initialization.pointer.scopeKey,
      revision: initialization.pointer.revision,
      duplicate: false,
    }
  }

  getControlledSkillScopePointer(
    scopeKey: string,
  ): ControlledSkillScopePointer | undefined {
    const pointer = this.#controlledSkillScopePointers.get(scopeKey)
    return pointer === undefined ? undefined : clone(pointer)
  }

  listControlledSkillScopePointers(): readonly ControlledSkillScopePointer[] {
    return clone([...this.#controlledSkillScopePointers.values()])
  }

  beginControlledSkillTransition(
    input: BeginControlledSkillTransitionInput,
  ): ControlledSkillTransitionStartReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill transition input is invalid')
    }
    exactKeys(input, ['shadowId', 'kind', 'expectedRevision', 'postCheck'])
    const shadowId = requireString(input.shadowId, 'shadowId') as ControlledSkillShadowId
    const kind = requireString(input.kind, 'kind')
    if (!Number.isSafeInteger(input.expectedRevision)) {
      throw new LedgerIntegrityError('controlled Skill transition expectedRevision is invalid')
    }
    const logicalKey = `${shadowId}:${kind}:${input.expectedRevision}`
    const existingId = this.#controlledSkillTransitionIdsByLogicalKey.get(logicalKey)
    const recommendation = this.#controlledSkillPromotionRecommendation(shadowId)
    if (existingId !== undefined) {
      const existing = this.#controlledSkillTransitions.get(existingId)!
      let replay
      try {
        replay = prepareControlledSkillTransition(
          input,
          recommendation,
          existing.previousPointer,
        )
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill transition replay is invalid', {
          cause: error,
        })
      }
      if (canonicalJson(existing) !== canonicalJson(replay)) {
        throw new LedgerIntegrityError(`controlled Skill transition changed: ${existingId}`)
      }
      return { transitionId: existingId, duplicate: true }
    }
    const initialization = this.#controlledSkillPointerInitializations.get(shadowId)
    const previousPointer = this.#controlledSkillScopePointers.get(
      initialization?.pointer.scopeKey ?? recommendation.source.scopeKey,
    )
    if (previousPointer === undefined) {
      throw new LedgerIntegrityError('controlled Skill scope pointer is unavailable')
    }
    let transition
    try {
      transition = prepareControlledSkillTransition(input, recommendation, previousPointer)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill transition input is invalid', { cause: error })
    }
    this.#validateControlledSkillTransitionOrder(transition)
    if (this.#runIdBySession.has(transition.postCheck.sessionId)) {
      throw new LedgerIntegrityError('controlled Skill transition requires a fresh Session')
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-transition.v2',
      type: transition.kind === 'promote'
        ? 'controlled-skill-promoted'
        : transition.kind === 'rollback'
          ? 'controlled-skill-rolled-back'
          : 'controlled-skill-restored',
      at: this.#now(),
      transition,
      inputDigest: sha256(transition),
    })
    return { transitionId: transition.transitionId, duplicate: false }
  }

  getControlledSkillTransition(
    transitionId: ControlledSkillTransitionId,
  ): ControlledSkillTransition | undefined {
    const transition = this.#controlledSkillTransitions.get(transitionId)
    return transition === undefined ? undefined : clone(transition)
  }

  listControlledSkillTransitions(): readonly ControlledSkillTransition[] {
    return clone([...this.#controlledSkillTransitions.values()])
  }

  completeControlledSkillTransition(
    input: CompleteControlledSkillTransitionInput,
  ): ControlledSkillTransitionCompletionReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill transition completion is invalid')
    }
    exactKeys(input, ['transitionId', 'run'])
    const transitionId = requireString(
      input.transitionId,
      'transitionId',
    ) as ControlledSkillTransitionId
    const transition = this.#controlledSkillTransitions.get(transitionId)
    if (transition === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill transition: ${transitionId}`)
    }
    let verification
    try {
      verification = prepareControlledSkillTransitionVerification(input, transition)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill transition completion is invalid', {
        cause: error,
      })
    }
    const existing = this.#controlledSkillTransitionVerifications.get(transitionId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(verification)) {
        throw new LedgerIntegrityError(
          `controlled Skill transition verification changed: ${transitionId}`,
        )
      }
      return { transitionId, state: 'verified', duplicate: true }
    }
    if (this.#controlledSkillActivationFailures.has(transitionId)) {
      throw new LedgerIntegrityError('controlled Skill transition was recovered')
    }
    const pointer = this.#controlledSkillScopePointers.get(transition.targetPointer.scopeKey)
    if (canonicalJson(pointer) !== canonicalJson(transition.targetPointer)) {
      throw new LedgerIntegrityError('controlled Skill transition pointer drifted')
    }
    this.#validateControlledSkillTransitionRunFacts(transition, verification)
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-transition-verification.v2',
      type: 'controlled-skill-transition-verified',
      at: this.#now(),
      verification,
      inputDigest: sha256(verification),
    })
    return { transitionId, state: 'verified', duplicate: false }
  }

  getControlledSkillTransitionReceipt(
    transitionId: ControlledSkillTransitionId,
  ): ControlledSkillTransitionReceipt | undefined {
    const transition = this.#controlledSkillTransitions.get(transitionId)
    if (transition === undefined) return undefined
    const failure = this.#controlledSkillActivationFailures.get(transitionId)
    if (failure !== undefined) {
      return {
        transitionId,
        state: 'recovered',
        pointer: clone(failure.recoveredPointer),
        reasonCode: failure.reasonCode,
      }
    }
    return {
      transitionId,
      state: this.#controlledSkillTransitionVerifications.has(transitionId)
        ? 'verified'
        : 'pending-post-check',
      pointer: clone(transition.targetPointer),
      reasonCode: null,
    }
  }

  recordControlledSkillActivationFailed(
    input: RecordControlledSkillActivationFailedInput,
  ): ControlledSkillActivationFailureReceipt {
    if (!isRecord(input)) {
      throw new LedgerIntegrityError('controlled Skill activation failure input is invalid')
    }
    exactKeys(input, ['transitionId', 'reasonCode'])
    const transitionId = requireString(
      input.transitionId,
      'transitionId',
    ) as ControlledSkillTransitionId
    const transition = this.#controlledSkillTransitions.get(transitionId)
    if (transition === undefined) {
      throw new LedgerIntegrityError(`unknown controlled Skill transition: ${transitionId}`)
    }
    let failure
    try {
      failure = prepareControlledSkillActivationFailure(input, transition)
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill activation failure input is invalid', {
        cause: error,
      })
    }
    const existing = this.#controlledSkillActivationFailures.get(transitionId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(failure)) {
        throw new LedgerIntegrityError(`controlled Skill activation failure changed: ${transitionId}`)
      }
      return { transitionId, state: 'recovered', duplicate: true }
    }
    if (this.#controlledSkillTransitionVerifications.has(transitionId)) {
      throw new LedgerIntegrityError('verified controlled Skill transition cannot be recovered')
    }
    const pointer = this.#controlledSkillScopePointers.get(transition.targetPointer.scopeKey)
    if (canonicalJson(pointer) !== canonicalJson(transition.targetPointer)) {
      throw new LedgerIntegrityError('controlled Skill activation failure pointer drifted')
    }
    this.#accept({
      schemaVersion: 'tianwen.controlled-skill-activation-failure.v2',
      type: 'controlled-skill-activation-failed',
      at: this.#now(),
      failure,
      inputDigest: sha256(failure),
    })
    return { transitionId, state: 'recovered', duplicate: false }
  }

  freezeSkillEvalProtocol(
    input: FreezeSkillEvalProtocolInput,
  ): SkillEvalProtocolReceipt {
    const ticket = this.#learningTickets.get(input.ticketId)
    if (ticket === undefined) {
      throw new LedgerIntegrityError(`unknown LearningTicket: ${input.ticketId}`)
    }
    const signals = ticket.signalIds.map(id => this.#learningSignals.get(id))
      .filter((signal): signal is OutcomeLearningSignal =>
        signal !== undefined && isOutcomeSignal(signal))
    const provenance = this.#caseIdByTicket.has(ticket.ticketId)
      || (this.#skillEvalProtocolIdsByTicket.get(ticket.ticketId)?.length ?? 0) > 0
      ? 'retrospective'
      : 'pre-candidate'
    let protocol
    try {
      protocol = prepareSkillEvalProtocol(input, ticket, signals, provenance)
    } catch (error) {
      throw new LedgerIntegrityError('Skill evaluation protocol input is invalid', {
        cause: error,
      })
    }
    const existing = this.#skillEvalProtocols.get(protocol.protocolId)
    if (existing !== undefined) {
      return {
        protocolId: existing.protocolId,
        provenance: existing.provenance,
        duplicate: true,
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.skill-eval-protocol.v1',
      type: 'skill-eval-protocol-frozen',
      at: this.#now(),
      protocol,
      inputDigest: sha256(protocol),
    })
    return {
      protocolId: protocol.protocolId,
      provenance: protocol.provenance,
      duplicate: false,
    }
  }

  getSkillEvalProtocol(
    protocolId: SkillEvalProtocolId,
  ): SkillEvalProtocolRecord | undefined {
    const protocol = this.#skillEvalProtocols.get(protocolId)
    return protocol === undefined ? undefined : clone(protocol)
  }

  listSkillEvalProtocols(): readonly SkillEvalProtocolRecord[] {
    return clone([...this.#skillEvalProtocols.values()])
  }

  openSkillEvaluation(input: OpenSkillEvaluationInput): SkillEvaluationReceipt {
    const candidate = this.#skillCandidates.get(input.candidateId)
    const protocol = this.#skillEvalProtocols.get(input.protocolId)
    if (candidate === undefined || protocol === undefined) {
      throw new LedgerIntegrityError('Skill evaluation requires its Candidate and protocol')
    }
    const learningCase = this.#learningCases.get(candidate.caseId)
    const lesson = this.#acceptedLessons.get(candidate.lessonId)
    const attribution = this.#attributions.get(candidate.attributionId)
    const parent = [...this.#runSkillManifests.values()]
      .find(value => value.parentVersionId === candidate.parentVersionId)?.parent
    if (
      learningCase === undefined
      || lesson?.caseId !== learningCase.caseId
      || attribution?.caseId !== learningCase.caseId
      || parent === undefined
    ) {
      throw new LedgerIntegrityError('Skill evaluation Candidate chain is incomplete')
    }
    let plan
    try {
      plan = prepareSkillEvaluationPlan(
        input,
        candidate,
        learningCase,
        protocol,
        sha256(parent),
      )
    } catch (error) {
      throw new LedgerIntegrityError('Skill evaluation input is invalid', { cause: error })
    }
    const existing = this.#skillEvaluationPlans.get(plan.evaluationId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(plan)) {
        throw new LedgerIntegrityError(`Skill evaluation changed: ${plan.evaluationId}`)
      }
      return { evaluationId: existing.evaluationId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.skill-evaluation-plan.v1',
      type: 'skill-evaluation-opened',
      at: this.#now(),
      plan,
      inputDigest: sha256(plan),
    })
    return { evaluationId: plan.evaluationId, duplicate: false }
  }

  getSkillEvaluation(evaluationId: SkillEvaluationId): SkillEvaluationPlan | undefined {
    const plan = this.#skillEvaluationPlans.get(evaluationId)
    return plan === undefined ? undefined : clone(plan)
  }

  listSkillEvaluations(): readonly SkillEvaluationPlan[] {
    return clone([...this.#skillEvaluationPlans.values()])
  }

  recordSkillEvaluationResult(
    input: RecordSkillEvaluationResultInput,
  ): SkillEvaluationResultReceipt {
    const plan = this.#skillEvaluationPlans.get(input.evaluationId)
    if (plan === undefined) {
      throw new LedgerIntegrityError(`unknown Skill evaluation: ${input.evaluationId}`)
    }
    let result
    try {
      result = prepareSkillEvaluationResult(input, plan)
    } catch (error) {
      throw new LedgerIntegrityError('Skill evaluation result input is invalid', { cause: error })
    }
    this.#validateSkillEvaluationRunFacts(result)
    const existing = this.#skillEvaluationResults.get(result.evaluationId)
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(result)) {
        throw new LedgerIntegrityError(`Skill evaluation result changed: ${result.evaluationId}`)
      }
      return { evaluationId: existing.evaluationId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.skill-evaluation-result.v1',
      type: 'skill-evaluation-result-recorded',
      at: this.#now(),
      result,
      inputDigest: sha256(result),
    })
    return { evaluationId: result.evaluationId, duplicate: false }
  }

  getSkillEvaluationResult(
    evaluationId: SkillEvaluationId,
  ): SkillEvaluationResult | undefined {
    const result = this.#skillEvaluationResults.get(evaluationId)
    return result === undefined ? undefined : clone(result)
  }

  openLearningCase(input: OpenLearningCaseInput): LearningCaseReceipt {
    const ticket = this.#learningTickets.get(input.ticketId)
    if (ticket === undefined) {
      throw new LedgerIntegrityError(`unknown LearningTicket: ${input.ticketId}`)
    }
    const signals = ticket.signalIds.map(id => this.#learningSignals.get(id))
      .filter((signal): signal is OutcomeLearningSignal =>
        signal !== undefined && isOutcomeSignal(signal))
    let learningCase
    try {
      learningCase = prepareLearningCase(input, ticket, signals, {
        bindings: [...this.#runBindings.values()],
        manifests: [...this.#runSkillManifests.values()],
        uses: [...this.#runSkillUses.values()],
        outcomes: [...this.#outcomeIntakes.values()].map(event => event.input),
      })
    } catch (error) {
      throw new LedgerIntegrityError('Learning Case input is invalid', {
        cause: error,
      })
    }
    const existingId = this.#caseIdByTicket.get(ticket.ticketId)
    if (existingId !== undefined) {
      const existing = this.#learningCases.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(learningCase)) {
        throw new LedgerIntegrityError(
          `Learning Case changed after open: ${existingId}`,
        )
      }
      return { caseId: existingId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-case.v1',
      type: 'learning-case-opened',
      at: this.#now(),
      case: learningCase,
      inputDigest: sha256(learningCase),
    })
    return { caseId: learningCase.caseId, duplicate: false }
  }

  getLearningCase(caseId: LearningCaseId): LearningCase | undefined {
    const value = this.#learningCases.get(caseId)
    return value === undefined ? undefined : clone(value)
  }

  listLearningCases(): readonly LearningCase[] {
    return clone([...this.#learningCases.values()])
  }

  openLearningAnalysisCase(analysisId: LearningAnalysisId): LearningCaseReceipt {
    const status = this.#learningAnalyses.get(analysisId)
    if (
      status?.phase !== 'running'
      || status.submission?.verdict !== 'skill-change'
      || !this.#learningAnalysisHasActiveSupport(status)
    ) throw new LedgerIntegrityError('learning analysis Case is not materializable')
    const ticket = this.#learningTickets.get(status.ticketId)
    const intake = this.#learningIntakeStatuses.get(status.sessionId)
      ?.get(status.messageId)
    const runId = this.#runIdBySession.get(status.sessionId)
    const binding = runId === undefined ? undefined : this.#runBindings.get(runId)
    const manifest = runId === undefined ? undefined : this.#runSkillManifests.get(runId)
    const skillUse = runId === undefined ? undefined : this.#runSkillUses.get(runId)
    const signals = (ticket?.signalIds ?? [])
      .map(signalId => this.#learningSignals.get(signalId))
      .filter((signal): signal is LearningSignal =>
        signal !== undefined
        && !isOutcomeSignal(signal)
        && !this.#inactiveLearningSignals.has(signal.signalId)
        && signal.sessionId === status.sessionId
        && signal.messageId === status.messageId
        && signal.feedbackVersion === status.feedbackVersion)
    if (
      ticket === undefined
      || intake?.state !== 'active'
      || intake.rating !== 'negative'
      || intake.ticketId !== status.ticketId
      || intake.feedbackVersion !== status.feedbackVersion
      || intake.analysisConsentRevision !== status.consentRevision
      || this.#learningAnalysisConsents.get(status.consentRevision)?.enabled !== true
      || binding === undefined
      || manifest === undefined
      || skillUse === undefined
      || binding.sessionId !== status.sessionId
      || signals.length === 0
    ) throw new LedgerIntegrityError('learning analysis parent Skill protocol is unavailable')
    let learningCase: LearningCase
    try {
      learningCase = prepareExplicitCorrectionLearningCase({
        ticket,
        signals,
        evidenceIds: [
          ...status.submission.supportingEvidenceIds,
          ...status.submission.counterevidenceIds,
        ],
        binding,
        manifest,
        uses: [...this.#runSkillUses.values()],
      })
    } catch (error) {
      throw new LedgerIntegrityError('learning analysis explicit correction Case is invalid', {
        cause: error,
      })
    }
    const existingId = this.#caseIdByTicket.get(ticket.ticketId)
    if (existingId !== undefined) {
      const existing = this.#learningCases.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(learningCase)) {
        throw new LedgerIntegrityError(`Learning Case changed after open: ${existingId}`)
      }
      return { caseId: existingId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-case.v1',
      type: 'learning-case-opened',
      at: this.#now(),
      case: learningCase,
      inputDigest: sha256(learningCase),
    })
    return { caseId: learningCase.caseId, duplicate: false }
  }

  recordAttribution(input: AttributionInput): AttributionReceipt {
    const learningCase = this.#learningCases.get(input.caseId)
    if (learningCase === undefined) {
      throw new LedgerIntegrityError(`unknown Learning Case: ${input.caseId}`)
    }
    let attribution
    try {
      attribution = prepareAttribution(input, learningCase)
    } catch (error) {
      throw new LedgerIntegrityError('Attribution input is invalid', {
        cause: error,
      })
    }
    const existingId = this.#attributionIdByCase.get(input.caseId)
    if (existingId !== undefined) {
      const existing = this.#attributions.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(attribution)) {
        throw new LedgerIntegrityError(
          `Attribution changed after record: ${existingId}`,
        )
      }
      return {
        attributionId: existingId,
        decision: existing.resolution === 'dsh-skill' ? 'resolved' : 'no-lesson',
        duplicate: true,
      }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-attribution.v1',
      type: 'learning-attribution-recorded',
      at: this.#now(),
      attribution,
      inputDigest: sha256(attribution),
    })
    return {
      attributionId: attribution.attributionId,
      decision: attribution.resolution === 'dsh-skill' ? 'resolved' : 'no-lesson',
      duplicate: false,
    }
  }

  getAttribution(attributionId: AttributionId): AttributionRecord | undefined {
    const value = this.#attributions.get(attributionId)
    return value === undefined ? undefined : clone(value)
  }

  listAttributions(): readonly AttributionRecord[] {
    return clone([...this.#attributions.values()])
  }

  recordAcceptedLesson(input: AcceptedLessonInput): AcceptedLessonReceipt {
    const learningCase = this.#learningCases.get(input.caseId)
    const attribution = this.#attributions.get(input.attributionId)
    if (learningCase === undefined || attribution === undefined) {
      throw new LedgerIntegrityError('Accepted Lesson lacks Case or Attribution')
    }
    let lesson
    try {
      lesson = prepareAcceptedLesson(input, learningCase, attribution)
    } catch (error) {
      throw new LedgerIntegrityError('Accepted Lesson input is invalid', {
        cause: error,
      })
    }
    const existingId = this.#lessonIdByAttribution.get(input.attributionId)
    if (existingId !== undefined) {
      const existing = this.#acceptedLessons.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(lesson)) {
        throw new LedgerIntegrityError(`Accepted Lesson changed: ${existingId}`)
      }
      return { lessonId: existingId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-lesson.v1',
      type: 'learning-lesson-recorded',
      at: this.#now(),
      lesson,
      inputDigest: sha256(lesson),
    })
    return { lessonId: lesson.lessonId, duplicate: false }
  }

  getAcceptedLesson(lessonId: LessonId): AcceptedLesson | undefined {
    const value = this.#acceptedLessons.get(lessonId)
    return value === undefined ? undefined : clone(value)
  }

  listAcceptedLessons(): readonly AcceptedLesson[] {
    return clone([...this.#acceptedLessons.values()])
  }

  recordSkillCandidate(input: SkillCandidateInput): SkillCandidateReceipt {
    const lesson = this.#acceptedLessons.get(input.lessonId)
    if (lesson === undefined) {
      throw new LedgerIntegrityError(`unknown Accepted Lesson: ${input.lessonId}`)
    }
    const learningCase = this.#learningCases.get(lesson.caseId)!
    const attribution = this.#attributions.get(lesson.attributionId)!
    const parent = [...this.#runSkillManifests.values()]
      .find(value => value.parentVersionId === learningCase.parentVersionId)?.parent
    if (parent === undefined) {
      throw new LedgerIntegrityError('Skill Candidate parent manifest is missing')
    }
    let candidate
    try {
      candidate = prepareSkillCandidate(
        input,
        lesson,
        learningCase,
        attribution,
        parent,
      )
    } catch (error) {
      throw new LedgerIntegrityError('Skill Candidate input is invalid', {
        cause: error,
      })
    }
    const existingId = this.#candidateIdByCase.get(learningCase.caseId)
    if (existingId !== undefined) {
      const existing = this.#skillCandidates.get(existingId)!
      if (canonicalJson(existing) !== canonicalJson(candidate)) {
        throw new LedgerIntegrityError(`Skill Candidate changed: ${existingId}`)
      }
      return { candidateId: existingId, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-candidate.v1',
      type: 'learning-candidate-recorded',
      at: this.#now(),
      candidate,
      inputDigest: sha256(candidate),
    })
    return { candidateId: candidate.candidateId, duplicate: false }
  }

  getSkillCandidate(
    candidateId: GovernedSkillCandidateId,
  ): GovernedSkillCandidate | undefined {
    const value = this.#skillCandidates.get(candidateId)
    return value === undefined ? undefined : clone(value)
  }

  listSkillCandidates(): readonly GovernedSkillCandidate[] {
    return clone([...this.#skillCandidates.values()])
  }

  recordOutcomeIntake(input: OutcomeIntakeInput): OutcomeIntakeReceipt {
    const binding = this.#runBindings.get(input.runId)
    if (binding === undefined) {
      throw new LedgerIntegrityError(`unknown Tianwen Run: ${input.runId}`)
    }
    let prepared
    try {
      prepared = prepareOutcomeIntake(binding, input)
    } catch (error) {
      throw new LedgerIntegrityError('Outcome intake input is invalid', {
        cause: error,
      })
    }
    const existing = this.#outcomeIntakes.get(prepared.ingestionId)
    if (existing !== undefined) {
      if (existing.inputDigest !== prepared.inputDigest) {
        throw new LedgerIntegrityError(
          `Outcome ingestion replay changed content: ${prepared.ingestionId}`,
        )
      }
      return { ...existing.receipt, duplicate: true }
    }

    const prior = prepared.kind === 'reusable'
      ? [...this.#learningSignals.values()].filter(isOutcomeSignal)
        .filter(signal =>
          signal.problemFingerprint === prepared.problemFingerprint)
      : []
    const ticketExists = prepared.kind === 'reusable'
      && this.#learningTickets.has(prepared.ticketId)
    const createImmediately = prepared.kind === 'reusable'
      && (prepared.blocksGoal || prepared.severity >= 4)
    const recurredInAnotherRun = prepared.kind === 'reusable'
      && prior.some(signal => signal.runId !== input.runId)
    const decision = prepared.kind !== 'reusable'
      ? prepared.decision
      : ticketExists
        ? 'ticket-merged'
        : createImmediately || recurredInAnotherRun
          ? 'ticket-created'
          : 'signal-recorded'

    const signal: OutcomeLearningSignal | undefined =
      prepared.kind === 'reusable'
        ? {
            signalId: prepared.signalId,
            ingestionId: prepared.ingestionId,
            runId: input.runId,
            sessionId: binding.sessionId,
            scopeKey: binding.scopeKey,
            problemFingerprint: prepared.problemFingerprint,
            problemCategory: prepared.problemCategory,
            failureSignature: prepared.failureSignature,
            severity: prepared.severity,
            blocksGoal: prepared.blocksGoal,
            sessionDigest: input.sessionDigest,
            evidenceIds: [...input.evidenceIds],
          }
        : undefined
    const receipt: Omit<OutcomeIntakeReceipt, 'duplicate'> = {
      decision,
      ingestionId: prepared.ingestionId,
      ...(prepared.kind === 'reusable'
        ? {
            signalId: prepared.signalId,
            ...(decision === 'signal-recorded'
              ? {}
              : { ticketId: prepared.ticketId }),
          }
        : {}),
    }
    this.#accept({
      schemaVersion: 'tianwen.outcome-intake.v1',
      type: 'outcome-intake-recorded',
      at: this.#now(),
      input: clone(input),
      inputDigest: prepared.inputDigest,
      receipt,
      ...(signal === undefined ? {} : { signal }),
    })
    return { ...receipt, duplicate: false }
  }

  recordLearningIntake(input: LearningIntakeInput): LearningIntakeReceipt {
    return this.#recordLearningRevision(input, {
      schemaVersion: 'tianwen.learning-intake.v1',
    })
  }

  recordLearningFeedbackRevision(input: {
    readonly intake: LearningIntakeInput
    readonly sessionLifecycleFingerprint: Sha256Digest
    readonly supersedesFeedbackVersion?: string
    readonly analysisConsentRevision?: number
  }): LearningIntakeReceipt {
    return this.#recordLearningRevision(input.intake, {
      schemaVersion: 'tianwen.learning-intake.v2',
      sessionLifecycleFingerprint: requireDigest(
        input.sessionLifecycleFingerprint,
      ),
      ...(input.supersedesFeedbackVersion === undefined
        ? {}
        : { supersedesFeedbackVersion: input.supersedesFeedbackVersion }),
      ...(input.analysisConsentRevision === undefined
        ? {}
        : { analysisConsentRevision: input.analysisConsentRevision }),
    })
  }

  #recordLearningRevision(
    input: LearningIntakeInput,
    revision: LearningRevisionWrite,
  ): LearningIntakeReceipt {
    const parsedInput = parseLearningInput(input)
    const prepared = prepareLearningIntake(parsedInput)
    const existing = this.#learningIntakes.get(prepared.ingestionId)
    if (existing !== undefined) {
      if (
        existing.schemaVersion !== revision.schemaVersion
        || existing.inputDigest !== prepared.inputDigest
        || (
          revision.schemaVersion === 'tianwen.learning-intake.v2'
          && existing.schemaVersion === 'tianwen.learning-intake.v2'
          && (
            existing.supersedesFeedbackVersion
              !== revision.supersedesFeedbackVersion
            || existing.analysisConsentRevision
              !== revision.analysisConsentRevision
            || existing.sessionLifecycleFingerprint
              !== revision.sessionLifecycleFingerprint
          )
        )
      ) {
        throw new LedgerIntegrityError(
          `learning ingestion replay changed content: ${prepared.ingestionId}`,
        )
      }
      this.#invalidateUnsupportedLearningAnalyses()
      return { ...existing.receipt, duplicate: true }
    }

    const decision: LearningIntakeReceipt['decision'] =
      prepared.kind === 'explicit-correction'
        ? this.#learningTickets.has(prepared.ticketId)
          ? 'ticket-merged'
          : 'ticket-created'
        : prepared.kind
    const signal: LearningSignal | undefined =
      prepared.kind === 'explicit-correction'
        ? {
            signalId: prepared.signalId,
            ingestionId: prepared.ingestionId,
            sessionId: parsedInput.sessionId,
            messageId: parsedInput.messageId,
            feedbackVersion: parsedInput.feedbackVersion,
            scopeKey: parsedInput.scopeKey,
            problemFingerprint: prepared.problemFingerprint,
            noteDigest: prepared.noteDigest,
            sessionDigest: parsedInput.sessionDigest,
            evidenceIds: parsedInput.evidenceIds,
          }
        : undefined
    const receipt: Omit<LearningIntakeReceipt, 'duplicate'> = {
      decision,
      ingestionId: prepared.ingestionId,
      ...(prepared.kind === 'explicit-correction'
        ? {
            signalId: prepared.signalId,
            ticketId: prepared.ticketId,
          }
        : {}),
    }
    const event = {
      type: 'learning-intake-recorded' as const,
      at: this.#now(),
      input: parsedInput,
      inputDigest: prepared.inputDigest,
      receipt,
      ...(signal === undefined ? {} : { signal }),
    }
    this.#accept(revision.schemaVersion === 'tianwen.learning-intake.v1'
      ? { schemaVersion: revision.schemaVersion, ...event }
      : {
          schemaVersion: revision.schemaVersion,
          ...event,
          sessionLifecycleFingerprint: revision.sessionLifecycleFingerprint,
          ...(revision.supersedesFeedbackVersion === undefined
            ? {}
            : {
                supersedesFeedbackVersion:
                  revision.supersedesFeedbackVersion,
              }),
          ...(revision.analysisConsentRevision === undefined
            ? {}
            : { analysisConsentRevision: revision.analysisConsentRevision }),
        })
    this.#invalidateUnsupportedLearningAnalyses()
    return { ...receipt, duplicate: false }
  }

  recordLearningFeedbackRetraction(input: {
    readonly sessionId: string
    readonly messageId: string
    readonly retractedFeedbackVersion: string
    readonly sessionLifecycleFingerprint: Sha256Digest
  }): { readonly duplicate: boolean } {
    const parsed = {
      sessionId: requireString(input.sessionId, 'sessionId'),
      messageId: requireString(input.messageId, 'messageId'),
      retractedFeedbackVersion: requireString(
        input.retractedFeedbackVersion,
        'retractedFeedbackVersion',
      ),
      sessionLifecycleFingerprint: requireDigest(
        input.sessionLifecycleFingerprint,
      ),
    }
    const key = learningRetractionKey(parsed)
    const existing = this.#learningRetractions.get(key)
    if (existing !== undefined) {
      if (
        existing.schemaVersion !== 'tianwen.learning-feedback-retracted.v2'
        || existing.sessionLifecycleFingerprint
          !== parsed.sessionLifecycleFingerprint
      ) {
        throw new LedgerIntegrityError(
          'learning feedback retraction lifecycle is unknown or changed',
        )
      }
      this.#invalidateUnsupportedLearningAnalyses()
      return { duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-feedback-retracted.v2',
      type: 'learning-feedback-retracted',
      at: this.#now(),
      ...parsed,
    })
    this.#invalidateUnsupportedLearningAnalyses()
    return { duplicate: false }
  }

  requestLearningAnalysis(
    input: RequestLearningAnalysisInput,
  ): LearningAnalysisReceipt {
    let binding
    try {
      binding = prepareLearningAnalysisRequest(input)
    } catch (error) {
      throw new LedgerIntegrityError('learning analysis request is invalid', {
        cause: error,
      })
    }
    const existing = this.#learningAnalyses.get(binding.analysisId)
    if (existing !== undefined) {
      const { phase: _phase, ...expected } = binding
      const {
        phase: _existingPhase,
        requestedAt: _requestedAt,
        updatedAt: _updatedAt,
        childStartedAt: _childStartedAt,
        submittedAt: _submittedAt,
        submissionDigest: _submissionDigest,
        submission: _submission,
        ...actual
      } = existing
      if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new LedgerIntegrityError(
          `learning analysis replay changed content: ${binding.analysisId}`,
        )
      }
      return { ...clone(existing), duplicate: true }
    }

    const intake = this.#learningIntakeStatuses
      .get(binding.sessionId)
      ?.get(binding.messageId)
    const consent = this.#learningAnalysisConsents.get(binding.consentRevision)
    if (
      intake?.state !== 'active'
      || intake.ticketId !== binding.ticketId
      || intake.feedbackVersion !== binding.feedbackVersion
      || intake.analysisConsentRevision !== binding.consentRevision
      || consent?.enabled !== true
      || this.#learningTickets.get(binding.ticketId)?.status !== 'open'
    ) {
      throw new LedgerIntegrityError(
        'learning analysis request disagrees with active consented feedback',
      )
    }
    const signal = intake.signalId === undefined
      ? undefined
      : this.#learningSignals.get(intake.signalId)
    const ticket = this.#learningTickets.get(binding.ticketId)!
    if (
      intake.signalId === undefined
      || !ticket.signalIds.includes(intake.signalId)
      || signal === undefined
      || isOutcomeSignal(signal)
      || this.#inactiveLearningSignals.has(signal.signalId)
      || signal.sessionId !== binding.sessionId
      || signal.messageId !== binding.messageId
      || signal.feedbackVersion !== binding.feedbackVersion
    ) {
      throw new LedgerIntegrityError(
        'learning analysis request has no exact active Signal support',
      )
    }
    const childOwner = this.#learningAnalysisIdByChildSession
      .get(binding.childSessionId)
    if (childOwner !== undefined && childOwner !== binding.analysisId) {
      throw new LedgerIntegrityError(
        `learning analysis child Session is already reserved: ${binding.childSessionId}`,
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-request.v1',
      type: 'learning-analysis-requested',
      at: this.#now(),
      binding,
    })
    return { ...clone(this.#learningAnalyses.get(binding.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisChildStarted(input: {
    readonly analysisId: LearningAnalysisId
    readonly parentSessionId: string
    readonly childSessionId: string
  }): LearningAnalysisReceipt {
    let analysisId: LearningAnalysisId
    try {
      analysisId = learningAnalysisId(input.analysisId)
    } catch (error) {
      throw new LedgerIntegrityError('learning analysis identity is invalid', {
        cause: error,
      })
    }
    const status = this.#learningAnalyses.get(analysisId)
    if (status === undefined) {
      throw new LedgerIntegrityError(`unknown learning analysis: ${analysisId}`)
    }
    if (
      input.parentSessionId !== status.parentSessionId
      || input.childSessionId !== status.childSessionId
    ) throw new LedgerIntegrityError('learning analysis child binding changed')
    if (status.childStartedAt !== undefined) {
      return { ...clone(status), duplicate: true }
    }
    if (status.phase !== 'pending-parent') {
      throw new LedgerIntegrityError(
        'learning analysis child can start only from pending-parent',
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-child.v1',
      type: 'learning-analysis-child-started',
      at: this.#now(),
      analysisId,
      parentSessionId: status.parentSessionId,
      childSessionId: status.childSessionId,
    })
    return { ...clone(this.#learningAnalyses.get(analysisId)!), duplicate: false }
  }

  recordLearningAnalysisSubmission(input: {
    readonly analysisId: LearningAnalysisId
    readonly childSessionId: string
    readonly submission: LearningAnalysisSubmission
  }): LearningAnalysisReceipt {
    let analysisId: LearningAnalysisId
    let submission: LearningAnalysisSubmission
    try {
      analysisId = learningAnalysisId(input.analysisId)
      submission = parseLearningAnalysisSubmission(input.submission)
    } catch (error) {
      throw new LedgerIntegrityError('learning analysis submission is invalid', {
        cause: error,
      })
    }
    const status = this.#learningAnalyses.get(analysisId)
    if (status === undefined) {
      throw new LedgerIntegrityError(`unknown learning analysis: ${analysisId}`)
    }
    if (input.childSessionId !== status.childSessionId) {
      throw new LedgerIntegrityError('learning analysis submission child changed')
    }
    const submissionDigest = sha256(submission)
    if (status.submission !== undefined) {
      if (status.submissionDigest !== submissionDigest) {
        throw new LedgerIntegrityError('learning analysis submission changed')
      }
      return { ...clone(status), duplicate: true }
    }
    if (status.phase !== 'running' || status.childStartedAt === undefined) {
      throw new LedgerIntegrityError(
        'learning analysis submission requires a running child',
      )
    }
    try {
      assertLearningAnalysisEvidenceClosure(
        submission,
        this.#learningAnalysisEvidenceClosure(status),
      )
    } catch (error) {
      throw new LedgerIntegrityError(
        'learning analysis exceeded its Ticket/Session Evidence closure',
        { cause: error },
      )
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-submission.v1',
      type: 'learning-analysis-submitted',
      at: this.#now(),
      analysisId,
      childSessionId: status.childSessionId,
      submission,
      submissionDigest,
    })
    return { ...clone(this.#learningAnalyses.get(analysisId)!), duplicate: false }
  }

  recordLearningAnalysisCandidateReady(input: {
    readonly analysisId: LearningAnalysisId
    readonly candidateId: GovernedSkillCandidateId
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    const candidate = this.#skillCandidates.get(input.candidateId)
    const patch = status?.submission?.candidatePatch
    const requiredEvidence = status === undefined
      ? []
      : [...new Set([
          ...(status.submission?.supportingEvidenceIds ?? []),
          ...(status.submission?.counterevidenceIds ?? []),
        ])]
    if (
      status === undefined
      || candidate === undefined
      || patch === undefined
      || (status.phase === 'candidate-ready'
        && status.candidateId !== input.candidateId)
    ) throw new LedgerIntegrityError('learning analysis Candidate-ready binding is invalid')
    if (status.phase === 'candidate-ready') return { ...clone(status), duplicate: true }
    if (
      status.phase !== 'running'
      || status.submission?.verdict !== 'skill-change'
      || candidate.ticketId !== status.ticketId
      || candidate.payload.description !== patch.description
      || candidate.payload.whenToUse !== patch.whenToUse
      || candidate.payload.content !== patch.content
      || candidate.evidenceIds.length !== requiredEvidence.length
      || requiredEvidence.some(id => !candidate.evidenceIds.includes(id))
      || !this.#learningAnalysisHasActiveSupport(status)
    ) throw new LedgerIntegrityError('learning analysis Candidate is not durable or no longer supported')
    try {
      assertLearningAnalysisEvidenceClosure(
        status.submission,
        this.#learningAnalysisEvidenceClosure(status),
      )
    } catch (error) {
      throw new LedgerIntegrityError('learning analysis Candidate exceeds active Evidence closure', {
        cause: error,
      })
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-candidate-ready.v1',
      type: 'learning-analysis-candidate-ready',
      at: this.#now(),
      analysisId: status.analysisId,
      candidateId: candidate.candidateId,
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisProtocolUnavailable(
    analysisId: LearningAnalysisId,
  ): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(analysisId)
    if (status === undefined) throw new LedgerIntegrityError(`unknown learning analysis: ${analysisId}`)
    if (status.phase === 'protocol-unavailable') return { ...clone(status), duplicate: true }
    if (
      status.phase !== 'running'
      || status.submission?.verdict !== 'skill-change'
      || !this.#learningAnalysisHasActiveSupport(status)
      || this.#hasExactExplicitCorrectionParent(status)
    ) throw new LedgerIntegrityError('learning analysis protocol is available or no longer eligible')
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-protocol-unavailable.v1',
      type: 'learning-analysis-protocol-unavailable',
      at: this.#now(),
      analysisId,
    })
    return { ...clone(this.#learningAnalyses.get(analysisId)!), duplicate: false }
  }

  recordLearningAnalysisCandidateRejected(input: {
    readonly analysisId: LearningAnalysisId
    readonly evaluationId: ControlledSkillEvaluationId
    readonly shadowId?: ControlledSkillShadowId
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status?.phase === 'candidate-rejected') {
      if (
        status.evaluationId !== input.evaluationId
        || status.shadowId !== input.shadowId
      ) throw new LedgerIntegrityError('learning analysis rejection binding changed')
      return { ...clone(status), duplicate: true }
    }
    const evaluation = this.#controlledSkillEvaluationPlans.get(input.evaluationId)
    const evaluationResult = this.#controlledSkillEvaluationResults.get(input.evaluationId)
    const shadow = input.shadowId === undefined
      ? undefined
      : this.#controlledSkillShadowPlans.get(input.shadowId)
    const shadowResult = input.shadowId === undefined
      ? undefined
      : this.#controlledSkillShadowResults.get(input.shadowId)
    if (
      status?.phase !== 'candidate-ready'
      || status.candidateId === undefined
      || evaluation?.candidateId !== status.candidateId
      || evaluationResult?.evaluationId !== evaluation.evaluationId
      || (input.shadowId === undefined
        ? evaluationResult.mechanismVerdict === 'pass'
          && evaluationResult.shadowEligibility !== 'ineligible'
        : shadow?.candidateId !== status.candidateId
          || shadow.evaluationId !== evaluation.evaluationId
          || shadowResult?.shadowId !== shadow.shadowId
          || shadowResult.promotionEligibility !== 'ineligible')
    ) throw new LedgerIntegrityError('learning analysis rejection lacks an exact failed governed result')
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-governed-outcome.v1',
      type: 'learning-analysis-governed-outcome-recorded',
      at: this.#now(),
      analysisId: status.analysisId,
      outcome: {
        phase: 'candidate-rejected',
        candidateId: status.candidateId,
        evaluationId: evaluation.evaluationId,
        evaluationResultDigest: sha256(evaluationResult),
        ...(shadow === undefined || shadowResult === undefined ? {} : {
          shadowId: shadow.shadowId,
          shadowResultDigest: sha256(shadowResult),
        }),
      },
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisShadowReady(input: {
    readonly analysisId: LearningAnalysisId
    readonly evaluationId: ControlledSkillEvaluationId
    readonly shadowId: ControlledSkillShadowId
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status?.phase === 'shadow-ready') {
      if (
        status.evaluationId !== input.evaluationId
        || status.shadowId !== input.shadowId
      ) throw new LedgerIntegrityError('learning analysis Shadow-ready binding changed')
      return { ...clone(status), duplicate: true }
    }
    const evaluation = this.#controlledSkillEvaluationPlans.get(input.evaluationId)
    const evaluationResult = this.#controlledSkillEvaluationResults.get(input.evaluationId)
    const shadow = this.#controlledSkillShadowPlans.get(input.shadowId)
    const shadowResult = this.#controlledSkillShadowResults.get(input.shadowId)
    if (
      status?.phase !== 'candidate-ready'
      || status.candidateId === undefined
      || evaluation?.candidateId !== status.candidateId
      || evaluationResult?.evaluationId !== evaluation.evaluationId
      || evaluationResult.mechanismVerdict !== 'pass'
      || evaluationResult.shadowEligibility === 'ineligible'
      || shadow?.candidateId !== status.candidateId
      || shadow.evaluationId !== evaluation.evaluationId
      || shadowResult?.shadowId !== shadow.shadowId
      || shadowResult.mechanismVerdict !== 'pass'
      || shadowResult.promotionEligibility === 'ineligible'
    ) throw new LedgerIntegrityError('learning analysis Shadow-ready lacks exact passing governed results')
    const recommendation = this.#controlledSkillPromotionRecommendation(shadow.shadowId)
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-governed-outcome.v1',
      type: 'learning-analysis-governed-outcome-recorded',
      at: this.#now(),
      analysisId: status.analysisId,
      outcome: {
        phase: 'shadow-ready',
        candidateId: status.candidateId,
        evaluationId: evaluation.evaluationId,
        evaluationResultDigest: sha256(evaluationResult),
        shadowId: shadow.shadowId,
        shadowResultDigest: sha256(shadowResult),
        promotionRecommendationDigest: sha256(recommendation),
      },
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisPromoted(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    return this.#recordLearningAnalysisTransitionOutcome(input, 'promote')
  }

  recordLearningAnalysisRolledBack(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    return this.#recordLearningAnalysisTransitionOutcome(input, 'rollback')
  }

  recordLearningAnalysisTransitionRecovered(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status?.phase === 'transition-recovered') {
      if (status.recoveredTransitionId !== input.transitionId) {
        throw new LedgerIntegrityError('learning analysis recovered transition binding changed')
      }
      return { ...clone(status), duplicate: true }
    }
    const transition = this.#controlledSkillTransitions.get(input.transitionId)
    const receipt = this.getControlledSkillTransitionReceipt(input.transitionId)
    const expectedPhase = transition?.kind === 'promote'
      ? 'shadow-ready'
      : transition?.kind === 'rollback'
        ? 'promoted'
        : undefined
    if (
      status === undefined
      || status.shadowId === undefined
      || status.phase !== expectedPhase
      || transition?.shadowId !== status.shadowId
      || receipt?.state !== 'recovered'
    ) throw new LedgerIntegrityError(
      'learning analysis recovered outcome lacks an exact recovered transition',
    )
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-governed-outcome.v1',
      type: 'learning-analysis-governed-outcome-recorded',
      at: this.#now(),
      analysisId: status.analysisId,
      outcome: {
        phase: 'transition-recovered',
        transitionId: transition.transitionId,
        transitionReceiptDigest: sha256(receipt),
      },
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  /** Records withdrawal explicitly when a live lane observes it between writes. */
  recordLearningAnalysisInvalidated(input: {
    readonly analysisId: LearningAnalysisId
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status === undefined) throw new LedgerIntegrityError(`unknown learning analysis: ${input.analysisId}`)
    if (status.phase === 'invalidated') return { ...clone(status), duplicate: true }
    if (status.phase === 'promoted' || status.phase === 'rolled-back'
      || status.phase === 'transition-recovered'
      || (status.phase === 'failed' && status.resumePhase === 'promoted')) {
      throw new LedgerIntegrityError('a promoted analysis must use verified rollback, not invalidation')
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-invalidation.v1',
      type: 'learning-analysis-invalidated',
      at: this.#now(),
      analysisId: status.analysisId,
      reason: 'support-withdrawn',
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisFailed(input: {
    readonly analysisId: LearningAnalysisId
    readonly resumePhase: LearningAnalysisRetryPhase
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status === undefined) throw new LedgerIntegrityError(`unknown learning analysis: ${input.analysisId}`)
    if (status.phase === 'failed') {
      if (status.resumePhase !== input.resumePhase) {
        throw new LedgerIntegrityError('learning analysis retry phase changed')
      }
      return { ...clone(status), duplicate: true }
    }
    if (status.phase !== input.resumePhase) {
      throw new LedgerIntegrityError('learning analysis failure does not name its current durable phase')
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-failed.v1',
      type: 'learning-analysis-failed',
      at: this.#now(),
      analysisId: status.analysisId,
      resumePhase: input.resumePhase,
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisResumed(input: {
    readonly analysisId: LearningAnalysisId
    readonly resumePhase: LearningAnalysisRetryPhase
  }): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    if (status === undefined) {
      throw new LedgerIntegrityError(`unknown learning analysis: ${input.analysisId}`)
    }
    if (
      status.phase === input.resumePhase
      && status.resumePhase === undefined
      && status.resumedAt !== undefined
    ) return { ...clone(status), duplicate: true }
    if (status.phase !== 'failed' || status.resumePhase !== input.resumePhase) {
      throw new LedgerIntegrityError('learning analysis resume changed its retry phase')
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-resumed.v1',
      type: 'learning-analysis-resumed',
      at: this.#now(),
      analysisId: status.analysisId,
      resumePhase: input.resumePhase,
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisReportIntent(input: LearningAnalysisReportBinding): LearningAnalysisReceipt {
    const report = parseLearningAnalysisReport(input, false)
    const status = this.#learningAnalyses.get(report.analysisId)
    if (
      status === undefined
      || status.submission === undefined
      || status.parentSessionId !== report.parentSessionId
      || status.childSessionId !== report.childSessionId
    ) throw new LedgerIntegrityError('learning analysis report intent disagrees with analysis')
    const existing = status.reportDelivery
    if (existing !== undefined) {
      if (!sameLearningAnalysisReportBinding(existing, report)) {
        throw new LedgerIntegrityError('learning analysis report intent changed')
      }
      return { ...clone(status), duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-report-intent.v1',
      type: 'learning-analysis-report-intent-recorded', at: this.#now(), report,
    })
    return { ...clone(this.#learningAnalyses.get(report.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisReportDelivered(input: LearningAnalysisReportBinding & {
    readonly reportMessageId: string
  }): LearningAnalysisReceipt {
    const report = parseLearningAnalysisReport(input, true)
    const status = this.#learningAnalyses.get(report.analysisId)
    const existing = status?.reportDelivery
    if (
      status === undefined
      || existing === undefined
      || existing.analysisId !== report.analysisId
      || existing.parentSessionId !== report.parentSessionId
      || existing.childSessionId !== report.childSessionId
      || existing.reportDigest !== report.reportDigest
    ) throw new LedgerIntegrityError('learning analysis report delivery disagrees with intent')
    if (existing.state === 'delivered') {
      if (existing.reportMessageId !== report.reportMessageId) {
        throw new LedgerIntegrityError('learning analysis report delivery changed')
      }
      return { ...clone(status), duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-report-delivered.v1',
      type: 'learning-analysis-report-delivered', at: this.#now(),
      report: { ...report, reportMessageId: report.reportMessageId! },
    })
    return { ...clone(this.#learningAnalyses.get(report.analysisId)!), duplicate: false }
  }

  getLearningAnalysis(
    analysisId: LearningAnalysisId,
  ): LearningAnalysisStatus | undefined {
    const status = this.#learningAnalyses.get(analysisId)
    return status === undefined ? undefined : clone(status)
  }

  hasLearningAnalysisActiveSupport(analysisId: LearningAnalysisId): boolean {
    const status = this.#learningAnalyses.get(analysisId)
    return status !== undefined && this.#learningAnalysisHasActiveSupport(status)
  }

  getLearningAnalysisByChildSessionId(
    childSessionId: string,
  ): LearningAnalysisStatus | undefined {
    const analysisId = this.#learningAnalysisIdByChildSession.get(childSessionId)
    return analysisId === undefined ? undefined : this.getLearningAnalysis(analysisId)
  }

  listLearningAnalyses(): readonly LearningAnalysisStatus[] {
    return clone([...this.#learningAnalyses.values()])
  }

  recordLearningAnalysisConsent(
    input: LearningAnalysisConsentInput,
  ): LearningAnalysisConsentReceipt {
    const existing = this.#learningAnalysisConsents.get(input.revision)
    if (existing !== undefined) {
      if (
        existing.enabled !== input.enabled
        || existing.policyVersion !== input.policyVersion
      ) {
        throw new LedgerIntegrityError(
          `learning analysis consent revision changed content: ${input.revision}`,
        )
      }
      return { ...existing, duplicate: true }
    }
    const recordedAt = this.#now()
    const consent = parseLearningAnalysisConsent({ ...input, recordedAt })
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-consent.v1',
      type: 'learning-analysis-consent-recorded',
      at: recordedAt,
      consent,
    })
    this.#invalidateUnsupportedLearningAnalyses()
    return { ...consent, duplicate: false }
  }

  getLearningAnalysisConsent(): LearningAnalysisConsent | undefined {
    return this.#learningAnalysisConsent === undefined
      ? undefined
      : clone(this.#learningAnalysisConsent)
  }

  getLearningAnalysisConsentBefore(
    timestamp: number,
  ): LearningAnalysisConsent | undefined {
    if (!Number.isFinite(timestamp)) {
      throw new TypeError('learning analysis consent timestamp must be finite')
    }
    let latest: LearningAnalysisConsent | undefined
    for (const consent of this.#learningAnalysisConsents.values()) {
      if (
        Date.parse(consent.recordedAt) < timestamp
        && (latest === undefined || consent.revision > latest.revision)
      ) latest = consent
    }
    return latest === undefined ? undefined : clone(latest)
  }

  recordLearningConsentNoticeIntent(
    input: LearningConsentNoticeBinding,
  ): LearningConsentNoticeReceipt {
    const notice = parseLearningConsentNoticeBinding(input)
    const existing = this.#learningConsentNotices.get(notice.policyVersion)
    if (existing !== undefined) {
      const { state: _state, intentRecordedAt: _intentAt, ...binding } = existing
      const { deliveredAt: _deliveredAt, ...comparable } = binding as typeof binding & {
        readonly deliveredAt?: string
      }
      if (canonicalJson(comparable) !== canonicalJson(notice)) {
        throw new LedgerIntegrityError('learning consent notice intent changed')
      }
      return { ...existing, duplicate: true }
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-consent-notice-intent.v1',
      type: 'learning-consent-notice-intent-recorded',
      at: this.#now(),
      notice,
    })
    return { ...this.#learningConsentNotices.get(notice.policyVersion)!, duplicate: false }
  }

  recordLearningConsentNoticeDelivered(
    input: LearningConsentNoticeBinding,
  ): LearningConsentNoticeReceipt {
    const notice = parseLearningConsentNoticeBinding(input)
    const existing = this.#learningConsentNotices.get(notice.policyVersion)
    if (existing === undefined) {
      throw new LedgerIntegrityError('learning consent notice intent is missing')
    }
    const { state: _state, intentRecordedAt: _intentAt, ...binding } = existing
    const { deliveredAt: _deliveredAt, ...comparable } = binding as typeof binding & {
      readonly deliveredAt?: string
    }
    if (canonicalJson(comparable) !== canonicalJson(notice)) {
      throw new LedgerIntegrityError('learning consent notice delivery changed')
    }
    if (existing.state === 'delivered') return { ...existing, duplicate: true }
    this.#accept({
      schemaVersion: 'tianwen.learning-consent-notice-delivered.v1',
      type: 'learning-consent-notice-delivered',
      at: this.#now(),
      notice,
    })
    return { ...this.#learningConsentNotices.get(notice.policyVersion)!, duplicate: false }
  }

  getLearningConsentNoticeStatus(
    policyVersion: LearningConsentNoticeBinding['policyVersion'],
  ): LearningConsentNoticeStatus | undefined {
    const status = this.#learningConsentNotices.get(policyVersion)
    if (status === undefined) return undefined
    const publicBinding = {
      policyVersion: status.policyVersion,
      mainSessionId: status.mainSessionId,
      noticeSourceMessageId: status.noticeSourceMessageId,
    }
    return status.state === 'pending'
      ? clone({
          ...publicBinding,
          state: status.state,
          intentRecordedAt: status.intentRecordedAt,
        })
      : clone({
          ...publicBinding,
          state: status.state,
          intentRecordedAt: status.intentRecordedAt,
          deliveredAt: status.deliveredAt,
        })
  }

  getLearningIntakeStatus(
    sessionId: string,
    messageId: string,
  ): LearningIntakeStatus | undefined {
    const status = this.#learningIntakeStatuses.get(sessionId)?.get(messageId)
    return status === undefined ? undefined : clone(status)
  }

  /** Returns copied statuses in each message's first-recorded order. */
  listLearningIntakeStatuses(
    sessionId: string,
  ): readonly LearningIntakeStatus[] {
    return [...(this.#learningIntakeStatuses.get(sessionId)?.values() ?? [])]
      .map(clone)
  }

  getLearningTicketFeedback(
    ticketId: LearningTicketId,
  ): LearningTicketFeedback | undefined {
    const ticket = this.#learningTickets.get(ticketId)
    if (ticket === undefined) return undefined

    let scopeKey: string | undefined
    let latest: LearningTicketFeedback['latest'] | undefined
    for (const signalId of ticket.signalIds) {
      const signal = this.#learningSignals.get(signalId)
      if (signal === undefined || signal.problemFingerprint !== ticket.problemFingerprint) {
        throw new LedgerIntegrityError(`Learning Ticket Signal is invalid: ${signalId}`)
      }
      if (isOutcomeSignal(signal)) continue
      if (this.#inactiveLearningSignals.has(signal.signalId)) continue

      const event = this.#learningIntakes.get(signal.ingestionId)
      const prepared = event === undefined ? undefined : prepareLearningIntake(event.input)
      if (
        event === undefined ||
        prepared?.kind !== 'explicit-correction' ||
        event.signal?.signalId !== signal.signalId ||
        event.receipt.ticketId !== ticket.ticketId ||
        event.input.note === undefined ||
        sha256(event.input.note) !== signal.noteDigest ||
        prepared.noteDigest !== signal.noteDigest ||
        prepared.problemFingerprint !== ticket.problemFingerprint ||
        prepared.ticketId !== ticket.ticketId ||
        prepared.signalId !== signal.signalId
      ) {
        throw new LedgerIntegrityError(`Learning Ticket feedback is invalid: ${signalId}`)
      }
      if (scopeKey !== undefined && scopeKey !== signal.scopeKey) {
        throw new LedgerIntegrityError(`Learning Ticket feedback scope is invalid: ${ticketId}`)
      }
      scopeKey = signal.scopeKey
      if (latest === undefined || event.at >= latest.recordedAt) {
        latest = {
          note: event.input.note,
          recordedAt: event.at,
          sessionId: signal.sessionId,
          messageId: signal.messageId,
        }
      }
    }

    return scopeKey === undefined || latest === undefined
      ? undefined
      : clone({ ticketId: ticket.ticketId, scopeKey, latest })
  }

  listLearningSignals(): readonly (
    LearningSignalStatus | OutcomeLearningSignal
  )[] {
    return clone([...this.#learningSignals.values()].map(signal =>
      isOutcomeSignal(signal)
        ? signal
        : {
            ...signal,
            active: !this.#inactiveLearningSignals.has(signal.signalId),
          }))
  }

  listLearningTickets(): readonly LearningTicket[] {
    return clone([...this.#learningTickets.values()])
  }

  recordArtifact(
    source: string,
    parentArtifactId?: ArtifactId,
  ): ArtifactVersion {
    if (parentArtifactId !== undefined && !this.#artifacts.has(parentArtifactId)) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        parentArtifactId,
        `parent Artifact is not recorded: ${parentArtifactId}`,
      )
    }
    const bytes = Buffer.from(source, 'utf8')
    const hex = createHash('sha256').update(bytes).digest('hex')
    const artifactId = `artifact:${hex}` as ArtifactId
    const sourceDigest = `sha256:${hex}` as Sha256Digest
    const existing = this.#artifacts.get(artifactId)
    if (existing !== undefined) {
      this.#verifySource(existing, bytes)
      if (existing.parentArtifactId !== parentArtifactId) {
        throw new LedgerIntegrityError(
          `Artifact replay changed parent metadata: ${artifactId}`,
        )
      }
      return clone(existing)
    }

    const sourcePath = this.#sourcePath(sourceDigest)
    let descriptor: number | undefined
    let created = false
    try {
      descriptor = openSync(sourcePath, 'wx')
      created = true
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor)
        descriptor = undefined
      }
      if (created) {
        if (existsSync(sourcePath)) {
          unlinkSync(sourcePath)
        }
        throw error
      }
      if (
        !isRecord(error) ||
        error.code !== 'EEXIST'
      ) {
        throw error
      }
      const stored = readFileSync(sourcePath)
      if (!stored.equals(bytes)) {
        throw new LedgerIntegrityError(
          `immutable source differs at ${sourceDigest}`,
          { cause: error },
        )
      }
    }

    const createdAt = this.#now()
    const artifact: ArtifactVersion = {
      artifactId,
      ...(parentArtifactId === undefined ? {} : { parentArtifactId }),
      sourceDigest,
      createdAt,
    }
    this.#accept({
      type: 'artifact-recorded',
      at: createdAt,
      artifact,
    })
    return clone(artifact)
  }

  recordEvaluation(record: EvaluationRecord): void {
    const evaluation = parseEvaluation(record)
    this.#accept({
      type: 'evaluation-recorded',
      at: this.#now(),
      evaluation,
    })
  }

  recordApproval(record: ApprovalRecord): void {
    const approval = parseApproval(record)
    this.#accept({
      type: 'approval-recorded',
      at: this.#now(),
      approval,
    })
  }

  prepareTransition(
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): TransitionAuthority {
    const artifact = this.#artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        artifactId,
        `Artifact is not recorded: ${artifactId}`,
      )
    }
    if (this.#champion?.artifactId === artifactId) {
      throw new EvolutionGovernanceError(
        'already-champion',
        artifactId,
        `Artifact is already Champion: ${artifactId}`,
      )
    }
    if (kind === 'promotion' && this.#promoted.has(artifactId)) {
      throw new EvolutionGovernanceError(
        'rollback-required',
        artifactId,
        `previously promoted Artifact requires rollback: ${artifactId}`,
      )
    }
    if (
      kind === 'rollback' &&
      (this.#champion === undefined || !this.#promoted.has(artifactId))
    ) {
      throw new EvolutionGovernanceError(
        'rollback-target-required',
        artifactId,
        `Artifact is not a prior Champion: ${artifactId}`,
      )
    }

    const evaluation = this.#evaluations.get(artifactId)
    if (evaluation === undefined) {
      throw new EvolutionGovernanceError(
        'evaluation-required',
        artifactId,
        `Artifact has no evaluation: ${artifactId}`,
      )
    }
    if (evaluation.verdict !== 'met') {
      throw new EvolutionGovernanceError(
        'evaluation-not-met',
        artifactId,
        `Artifact evaluation is ${evaluation.verdict}: ${artifactId}`,
      )
    }
    const approval = this.#unusedApproval(artifactId)
    if (approval === undefined) {
      throw new EvolutionGovernanceError(
        'human-approval-required',
        artifactId,
        `Artifact has no unused human approval: ${artifactId}`,
      )
    }
    return {
      artifact: clone(artifact),
      evaluation: clone(evaluation),
      approval: clone(approval),
    }
  }

  promote(artifactId: ArtifactId): ChampionPointer {
    return this.#transition(artifactId, 'promotion')
  }

  rollback(artifactId: ArtifactId): ChampionPointer {
    return this.#transition(artifactId, 'rollback')
  }

  recordRuntimeBinding(
    artifactId: ArtifactId,
    pluginId: string,
    packageId: string,
  ): void {
    this.#accept({
      type: 'runtime-bound',
      at: this.#now(),
      artifactId,
      pluginId,
      packageId,
    })
  }

  recordActivationFailed(failure: ActivationFailure): void {
    const authority = failure.authority
    const binding = failure.binding
    this.#accept({
      type: 'activation-failed',
      at: this.#now(),
      artifactId: failure.artifactId,
      phase: failure.phase,
      message: failure.message,
      ...(authority === undefined
        ? {}
        : {
            receiptDigest: authority.evaluation.receiptDigest,
            approvalId: authority.approval.approvalId,
          }),
      ...(binding === undefined
        ? {}
        : {
            pluginId: binding.pluginId,
            packageId: binding.packageId,
          }),
    })
  }

  recordRecoveryFailed(
    artifactId: ArtifactId,
    previousArtifactId: ArtifactId,
    message: string,
  ): void {
    this.#accept({
      type: 'recovery-failed',
      at: this.#now(),
      artifactId,
      previousArtifactId,
      message,
    })
  }

  readSource(artifactId: ArtifactId): string {
    const artifact = this.#artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        artifactId,
        `Artifact is not recorded: ${artifactId}`,
      )
    }
    const bytes = this.#verifySource(artifact)
    try {
      return UTF8.decode(bytes)
    } catch (error) {
      throw new LedgerIntegrityError(
        `Artifact source is not valid UTF-8: ${artifactId}`,
        { cause: error },
      )
    }
  }

  getChampion(): ChampionPointer | undefined {
    return this.#champion === undefined
      ? undefined
      : clone(this.#champion)
  }

  listEvents(): readonly LedgerEvent[] {
    return clone(this.#events)
  }

  hasRecoveryFailure(): boolean {
    return this.#events.some(event => event.type === 'recovery-failed')
  }

  #transition(
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): ChampionPointer {
    const authority = this.prepareTransition(artifactId, kind)
    const pointer: ChampionPointer = {
      artifactId,
      revision: (this.#champion?.revision ?? 0) + 1,
    }
    this.#accept({
      type: kind === 'promotion' ? 'promoted' : 'rolled-back',
      at: this.#now(),
      artifactId,
      revision: pointer.revision,
      receiptDigest: authority.evaluation.receiptDigest,
      approvalId: authority.approval.approvalId,
    })
    this.#writePointer(pointer)
    return clone(pointer)
  }

  #now(): string {
    return requireTimestamp(this.#clock())
  }

  #refreshLearningTicket(ticketId: LearningTicketId | undefined): void {
    if (ticketId === undefined) return
    const ticket = this.#learningTickets.get(ticketId)
    if (ticket === undefined) return
    const supported = ticket.signalIds.some(signalId => {
      const signal = this.#learningSignals.get(signalId)
      return signal !== undefined
        && (isOutcomeSignal(signal)
          || !this.#inactiveLearningSignals.has(signal.signalId))
    })
    this.#learningTickets.set(ticketId, {
      ...ticket,
      status: supported ? 'open' : 'unsupported',
    })
  }

  #learningAnalysisEvidenceClosure(
    status: LearningAnalysisStatus,
  ): ReadonlySet<Sha256Digest> {
    const ticket = this.#learningTickets.get(status.ticketId)
    return learningAnalysisEvidenceClosure(status.sessionId, (ticket?.signalIds ?? [])
      .map(signalId => this.#learningSignals.get(signalId))
      .filter((signal): signal is LearningSignal | OutcomeLearningSignal =>
        signal !== undefined)
      .map(signal => ({
        sessionId: signal.sessionId,
        ...(!isOutcomeSignal(signal)
          ? {
              messageId: signal.messageId,
              feedbackVersion: signal.feedbackVersion,
            }
          : {}),
        sessionDigest: signal.sessionDigest,
        evidenceIds: signal.evidenceIds,
        source: isOutcomeSignal(signal)
          ? 'outcome' as const
          : 'explicit-correction' as const,
        active: !isOutcomeSignal(signal)
          && !this.#inactiveLearningSignals.has(signal.signalId),
      })), status.messageId, status.feedbackVersion)
  }

  #learningAnalysisHasActiveSupport(status: LearningAnalysisStatus): boolean {
    const ticket = this.#learningTickets.get(status.ticketId)
    return ticket?.signalIds.some(signalId => {
      const signal = this.#learningSignals.get(signalId)
      if (signal === undefined) return false
      if (isOutcomeSignal(signal)) return false
      if (this.#inactiveLearningSignals.has(signal.signalId)) return false
      return signal.sessionId !== status.sessionId
        || signal.messageId !== status.messageId
        || signal.feedbackVersion === status.feedbackVersion
    }) === true
  }

  #controlledSkillEvalScopeFacts(ticket: LearningTicket): readonly {
    readonly signalId: string
    readonly scopeKey: string
  }[] {
    return ticket.signalIds.flatMap(signalId => {
      const signal = this.#learningSignals.get(signalId)
      if (signal === undefined) return []
      if (isOutcomeSignal(signal)) return [{ signalId: signal.signalId, scopeKey: signal.scopeKey }]
      const intake = this.#learningIntakeStatuses.get(signal.sessionId)
        ?.get(signal.messageId)
      if (
        this.#inactiveLearningSignals.has(signal.signalId)
        || intake?.state !== 'active'
        || intake.ticketId !== ticket.ticketId
        || intake.feedbackVersion !== signal.feedbackVersion
        || intake.scopeKey !== signal.scopeKey
        || intake.analysisConsentRevision === undefined
        || this.#learningAnalysisConsents.get(intake.analysisConsentRevision)?.enabled !== true
        || this.#learningAnalysisConsent?.enabled !== true
      ) return []
      return [{ signalId: signal.signalId, scopeKey: signal.scopeKey }]
    })
  }

  #hasExactExplicitCorrectionParent(status: LearningAnalysisStatus): boolean {
    const runId = this.#runIdBySession.get(status.sessionId)
    const binding = runId === undefined ? undefined : this.#runBindings.get(runId)
    const manifest = runId === undefined ? undefined : this.#runSkillManifests.get(runId)
    const skillUse = runId === undefined ? undefined : this.#runSkillUses.get(runId)
    const intake = this.#learningIntakeStatuses.get(status.sessionId)
      ?.get(status.messageId)
    const ticket = this.#learningTickets.get(status.ticketId)
    const hasExactSignal = (ticket?.signalIds ?? []).some(signalId => {
      const signal = this.#learningSignals.get(signalId)
      return signal !== undefined
        && !isOutcomeSignal(signal)
        && !this.#inactiveLearningSignals.has(signal.signalId)
        && signal.sessionId === status.sessionId
        && signal.messageId === status.messageId
        && signal.feedbackVersion === status.feedbackVersion
        && signal.scopeKey === binding?.scopeKey
    })
    return binding?.sessionId === status.sessionId
      && manifest?.runId === runId
      && skillUse !== undefined
      && skillUse.runId === runId
      && skillUse.parentVersionId === manifest?.parentVersionId
      && skillUse.sessionId === status.sessionId
      && skillUse.skillName === manifest?.parent.name
      && skillUse.contentDigest === manifest?.contentDigest
      && hasExactSignal
      && intake?.state === 'active'
      && intake.rating === 'negative'
      && intake.ticketId === status.ticketId
      && intake.feedbackVersion === status.feedbackVersion
      && intake.analysisConsentRevision === status.consentRevision
      && this.#learningAnalysisConsents.get(status.consentRevision)?.enabled === true
  }

  #assertLearningAnalysisTimestamp(
    status: LearningAnalysisStatus,
    timestamp: string,
  ): void {
    const latest = status.updatedAt
    if (Date.parse(timestamp) < Date.parse(latest)) {
      throw new LedgerIntegrityError(
        'learning analysis lifecycle timestamp goes backwards',
      )
    }
  }

  #recordLearningAnalysisTransitionOutcome(
    input: {
      readonly analysisId: LearningAnalysisId
      readonly transitionId: ControlledSkillTransitionId
    },
    kind: 'promote' | 'rollback',
  ): LearningAnalysisReceipt {
    const status = this.#learningAnalyses.get(input.analysisId)
    const finalPhase = kind === 'promote' ? 'promoted' : 'rolled-back'
    const existingId = kind === 'promote'
      ? status?.promotionTransitionId
      : status?.rollbackTransitionId
    if (status?.phase === finalPhase) {
      if (existingId !== input.transitionId) {
        throw new LedgerIntegrityError(`learning analysis ${finalPhase} binding changed`)
      }
      return { ...clone(status), duplicate: true }
    }
    const transition = this.#controlledSkillTransitions.get(input.transitionId)
    const receipt = this.getControlledSkillTransitionReceipt(input.transitionId)
    if (
      status === undefined
      || status.shadowId === undefined
      || status.phase !== (kind === 'promote' ? 'shadow-ready' : 'promoted')
      || transition?.shadowId !== status.shadowId
      || transition.kind !== kind
      || receipt?.state !== 'verified'
    ) throw new LedgerIntegrityError(`learning analysis ${finalPhase} lacks an exact verified transition`)
    this.#accept({
      schemaVersion: 'tianwen.learning-analysis-governed-outcome.v1',
      type: 'learning-analysis-governed-outcome-recorded',
      at: this.#now(),
      analysisId: status.analysisId,
      outcome: {
        phase: finalPhase,
        transitionId: transition.transitionId,
        transitionReceiptDigest: sha256(receipt),
      },
    })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisTerminalReportIntent(input: LearningAnalysisReportBinding): LearningAnalysisReceipt {
    const report = parseLearningAnalysisReport(input, false)
    const status = this.#learningAnalyses.get(report.analysisId)
    if (status === undefined || status.submission === undefined
      || status.parentSessionId !== report.parentSessionId || status.childSessionId !== report.childSessionId) {
      throw new LedgerIntegrityError('learning analysis terminal report intent disagrees with analysis')
    }
    const existing = status.terminalReportDelivery
    if (existing !== undefined) {
      if (sameLearningAnalysisReportBinding(existing, report)) return { ...clone(status), duplicate: true }
      const laterOutcome = status.phase === 'rolled-back'
        || (status.phase === 'transition-recovered'
          && status.promotionTransitionId !== undefined)
      if (!laterOutcome || (status.terminalReportHistory?.length ?? 0) !== 0) {
        throw new LedgerIntegrityError('learning analysis terminal report intent changed')
      }
    }
    this.#accept({ schemaVersion: 'tianwen.learning-analysis-terminal-report-intent.v1', type: 'learning-analysis-terminal-report-intent-recorded', at: this.#now(), report })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  recordLearningAnalysisTerminalReportDelivered(input: LearningAnalysisReportBinding & { readonly reportMessageId: string }): LearningAnalysisReceipt {
    const report = parseLearningAnalysisReport(input, true)
    const status = this.#learningAnalyses.get(report.analysisId)
    const existing = status?.terminalReportDelivery
    if (status === undefined || existing === undefined
      || !sameLearningAnalysisReportBinding(existing, report)) {
      throw new LedgerIntegrityError('learning analysis terminal report delivery disagrees with intent')
    }
    if (existing.state === 'delivered') {
      if (existing.reportMessageId !== report.reportMessageId) throw new LedgerIntegrityError('learning analysis terminal report delivery changed')
      return { ...clone(status), duplicate: true }
    }
    this.#accept({ schemaVersion: 'tianwen.learning-analysis-terminal-report-delivered.v1', type: 'learning-analysis-terminal-report-delivered', at: this.#now(), report: { ...report, reportMessageId: report.reportMessageId! } })
    return { ...clone(this.#learningAnalyses.get(status.analysisId)!), duplicate: false }
  }

  #assertLearningAnalysisGovernedOutcome(
    status: LearningAnalysisStatus,
    outcome: LearningAnalysisGovernedOutcome,
  ): void {
    if (outcome.phase === 'candidate-rejected' || outcome.phase === 'shadow-ready') {
      const evaluation = this.#controlledSkillEvaluationPlans.get(outcome.evaluationId)
      const result = this.#controlledSkillEvaluationResults.get(outcome.evaluationId)
      const shadow = outcome.shadowId === undefined
        ? undefined
        : this.#controlledSkillShadowPlans.get(outcome.shadowId)
      const shadowResult = outcome.shadowId === undefined
        ? undefined
        : this.#controlledSkillShadowResults.get(outcome.shadowId)
      const exact = status.phase === 'candidate-ready'
        && status.candidateId === outcome.candidateId
        && evaluation?.candidateId === outcome.candidateId
        && result?.evaluationId === outcome.evaluationId
        && sha256(result) === outcome.evaluationResultDigest
        && (outcome.shadowId === undefined || (
          shadow?.candidateId === outcome.candidateId
          && shadow.evaluationId === outcome.evaluationId
          && shadowResult?.shadowId === outcome.shadowId
          && sha256(shadowResult) === outcome.shadowResultDigest
        ))
      const rejected = outcome.phase === 'candidate-rejected'
        && (outcome.shadowId === undefined
          ? result?.mechanismVerdict !== 'pass' || result.shadowEligibility === 'ineligible'
          : shadowResult?.promotionEligibility === 'ineligible')
      const ready = outcome.phase === 'shadow-ready'
        && result?.mechanismVerdict === 'pass'
        && result.shadowEligibility !== 'ineligible'
        && shadowResult?.mechanismVerdict === 'pass'
        && shadowResult.promotionEligibility !== 'ineligible'
        && sha256(this.#controlledSkillPromotionRecommendation(outcome.shadowId))
          === outcome.promotionRecommendationDigest
      if (!exact || (!rejected && !ready)) {
        throw new LedgerIntegrityError(`learning analysis ${outcome.phase} disagrees with governed results`)
      }
      return
    }
    const recovered = outcome.phase === 'transition-recovered'
    const promoted = outcome.phase === 'promoted'
    const transition = this.#controlledSkillTransitions.get(outcome.transitionId)
    const receipt = this.getControlledSkillTransitionReceipt(outcome.transitionId)
    const expectedKind = recovered
      ? transition?.kind
      : promoted ? 'promote' : 'rollback'
    const expectedPhase = expectedKind === 'promote' ? 'shadow-ready' : 'promoted'
    if (
      status.shadowId === undefined
      || (expectedKind !== 'promote' && expectedKind !== 'rollback')
      || status.phase !== expectedPhase
      || transition?.shadowId !== status.shadowId
      || transition.kind !== expectedKind
      || receipt?.state !== (recovered ? 'recovered' : 'verified')
      || sha256(receipt) !== outcome.transitionReceiptDigest
    ) throw new LedgerIntegrityError(
      `learning analysis ${outcome.phase} disagrees with controlled transition`,
    )
  }

  #invalidateUnsupportedLearningAnalyses(): void {
    for (const status of this.#learningAnalyses.values()) {
      if (
        (this.#learningAnalysisConsent?.enabled === true
          && this.#learningAnalysisHasActiveSupport(status))
        || status.phase === 'invalidated'
        || status.phase === 'promoted'
        || status.phase === 'rolled-back'
        || status.phase === 'transition-recovered'
        || (status.phase === 'failed' && status.resumePhase === 'promoted')
      ) continue
      this.#accept({
        schemaVersion: 'tianwen.learning-analysis-invalidation.v1',
        type: 'learning-analysis-invalidated',
        at: this.#now(),
        analysisId: status.analysisId,
        reason: 'support-withdrawn',
      })
    }
  }

  #sourcePath(digest: Sha256Digest): string {
    return join(
      this.#artifactsRoot,
      `sha256-${digest.slice('sha256:'.length)}.mjs`,
    )
  }

  #verifySource(
    artifact: ArtifactVersion,
    expectedBytes?: Buffer,
  ): Buffer {
    let bytes: Buffer
    try {
      bytes = readFileSync(this.#sourcePath(artifact.sourceDigest))
    } catch (error) {
      throw new LedgerIntegrityError(
        `immutable source is unavailable: ${artifact.sourceDigest}`,
        { cause: error },
      )
    }
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (`sha256:${actual}` !== artifact.sourceDigest) {
      throw new LedgerIntegrityError(
        `immutable source digest mismatch: ${artifact.sourceDigest}`,
      )
    }
    if (expectedBytes !== undefined && !bytes.equals(expectedBytes)) {
      throw new LedgerIntegrityError(
        `immutable source differs at ${artifact.sourceDigest}`,
      )
    }
    return bytes
  }

  #unusedApproval(artifactId: ArtifactId): ApprovalRecord | undefined {
    return this.#approvals.get(artifactId)
      ?.findLast(record => !this.#usedApprovals.has(record.approvalId))
  }

  #controlledSkillPromotionRecommendation(
    shadowId: ControlledSkillShadowId,
  ): ReturnType<typeof prepareControlledSkillPromotionRecommendation> {
    const shadow = this.#controlledSkillShadowPlans.get(shadowId)
    const shadowResult = this.#controlledSkillShadowResults.get(shadowId)
    const evaluation = shadow === undefined
      ? undefined
      : this.#controlledSkillEvaluationPlans.get(shadow.evaluationId)
    const evaluationResult = shadow === undefined
      ? undefined
      : this.#controlledSkillEvaluationResults.get(shadow.evaluationId)
    const candidate = shadow === undefined
      ? undefined
      : this.#skillCandidates.get(shadow.candidateId)
    const parent = shadow === undefined
      ? undefined
      : [...this.#runSkillManifests.values()]
        .find(manifest => manifest.parentVersionId === shadow.parentVersionId)
    if (
      shadow === undefined
      || shadowResult === undefined
      || evaluation === undefined
      || evaluationResult === undefined
      || candidate === undefined
      || parent === undefined
    ) {
      throw new LedgerIntegrityError(`controlled Skill activation lacks evidence: ${shadowId}`)
    }
    try {
      return prepareControlledSkillPromotionRecommendation(
        evaluation,
        evaluationResult,
        shadow,
        shadowResult,
        candidate,
        sha256(parent.parent),
      )
    } catch (error) {
      throw new LedgerIntegrityError('controlled Skill activation evidence is not fresh', {
        cause: error,
      })
    }
  }

  #validateControlledSkillTransitionOrder(
    transition: ControlledSkillTransition,
  ): void {
    const pointer = this.#controlledSkillScopePointers.get(transition.source.scopeKey)
    const recommendation = this.#controlledSkillPromotionRecommendation(
      transition.shadowId,
    )
    const anotherPendingTransition = [...this.#controlledSkillTransitions.values()]
      .some(item => item.source.scopeKey === transition.source.scopeKey
        && item.transitionId !== transition.transitionId
        && item.shadowId !== transition.shadowId
        && !this.#controlledSkillTransitionVerifications.has(item.transitionId)
        && !this.#controlledSkillActivationFailures.has(item.transitionId))
    if (
      pointer === undefined
      || anotherPendingTransition
      || canonicalJson(pointer) !== canonicalJson(transition.previousPointer)
      || transition.recommendationDigest !== sha256(recommendation)
      || transition.authorizationDigest
        !== sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1)
    ) {
      throw new LedgerIntegrityError('controlled Skill transition failed compare-and-set')
    }
    const priorIds = this.#controlledSkillTransitionIdsByShadow.get(transition.shadowId) ?? []
    const prior = priorIds.map(id => this.#controlledSkillTransitions.get(id)!)
    if (
      prior.some(item => this.#controlledSkillActivationFailures.has(item.transitionId))
    ) {
      throw new LedgerIntegrityError('controlled Skill activation stopped after recovery')
    }
    if (transition.kind === 'promote') {
      if (
        prior.length !== 0
        || pointer.activeVersionId !== transition.source.parentVersionId
        || pointer.payloadDigest !== transition.source.parentPayloadDigest
      ) throw new LedgerIntegrityError('controlled Skill promote is out of order')
      return
    }
    const previous = prior.at(-1)
    if (
      previous === undefined
      || !this.#controlledSkillTransitionVerifications.has(previous.transitionId)
      || canonicalJson(pointer) !== canonicalJson(previous.targetPointer)
    ) throw new LedgerIntegrityError('prior controlled Skill post-check is not verified')
    if (transition.kind === 'rollback') {
      if (
        prior.length !== 1
        || previous.kind !== 'promote'
      ) throw new LedgerIntegrityError('controlled Skill rollback is out of order')
      return
    }
    if (
      prior.length !== 2
      || previous.kind !== 'rollback'
    ) throw new LedgerIntegrityError('controlled Skill restore is out of order')
  }

  #validateControlledSkillTransitionRunFacts(
    transition: ControlledSkillTransition,
    verification: ControlledSkillTransitionVerification,
  ): void {
    const run = verification.run
    const binding = this.#runBindings.get(run.runId)
    const manifest = this.#runSkillManifests.get(run.runId)
    const use = this.#runSkillUses.get(run.runId)
    const outcome = [...this.#outcomeIntakes.values()]
      .find(event => event.input.runId === run.runId)?.input
    const candidate = this.#skillCandidates.get(transition.source.candidateId)
    const parent = [...this.#runSkillManifests.values()]
      .find(item => item.parentVersionId === transition.source.parentVersionId)
    const candidateActive = transition.targetPointer.activeVersionId
      === transition.source.candidateVersionId
    const expectedContentDigest = candidateActive
      ? candidate === undefined ? undefined : sha256(candidate.payload.content)
      : parent?.contentDigest
    const expectedBinding = binding?.schemaVersion === 'tianwen.run-binding.v3'
      ? prepareRunBinding({
          goalRef: transition.runBinding.goalRef,
          taskRef: transition.runBinding.taskRef,
          sessionId: transition.runBinding.sessionId,
          scopeKey: transition.runBinding.scopeKey,
          acceptanceContract: transition.runBinding.acceptanceContract,
          acceptanceSubjectDigest:
            transition.runBinding.acceptanceSubjectDigest,
          sessionLifecycleFingerprint: binding.sessionLifecycleFingerprint,
        })
      : undefined
    if (
      expectedBinding === undefined
      || canonicalJson(binding) !== canonicalJson(expectedBinding)
      || manifest === undefined
      || use === undefined
      || outcome === undefined
      || candidate === undefined
      || parent === undefined
      || run.runId !== transition.postCheck.runId
      || run.sessionId !== transition.postCheck.sessionId
      || run.skillVersionId !== transition.targetPointer.activeVersionId
      || run.skillVersionId !== manifest.parentVersionId
      || run.contentDigest !== expectedContentDigest
      || run.contentDigest !== manifest.contentDigest
      || use.runId !== run.runId
      || use.parentVersionId !== manifest.parentVersionId
      || use.sessionId !== run.sessionId
      || use.skillName !== candidate.payload.name
      || use.contentDigest !== run.contentDigest
      || use.sessionDigest !== outcome.sessionDigest
      || !run.evidenceIds.includes(use.acceptanceEvidenceId)
      || run.acceptanceSubjectDigest !== transition.postCheck.acceptanceSubjectDigest
      || outcome.verdict !== 'met'
      || outcome.verdict !== run.outcome
      || canonicalJson(outcome.evidenceIds) !== canonicalJson(run.evidenceIds)
    ) {
      throw new LedgerIntegrityError(
        'controlled Skill transition verification disagrees with Run facts',
      )
    }
    const expectedManifest = prepareRunSkillManifest({
      runId: run.runId,
      skill: candidateActive
        ? { ...candidate.payload, provider: manifest.resolvedProvider }
        : { ...parent.parent, provider: parent.resolvedProvider },
    })
    if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
      throw new LedgerIntegrityError(
        'controlled Skill transition verification disagrees with active Skill content',
      )
    }
  }

  #validateSkillEvaluationRunFacts(result: SkillEvaluationResult): void {
    const plan = this.#skillEvaluationPlans.get(result.evaluationId)
    if (plan === undefined) {
      throw new LedgerIntegrityError('Skill evaluation result lacks its plan')
    }
    const candidate = this.#skillCandidates.get(plan.candidateId)
    const parent = [...this.#runSkillManifests.values()]
      .find(manifest => manifest.parentVersionId === plan.parentVersionId)
    if (
      candidate === undefined
      || parent === undefined
      || candidate.parentVersionId !== plan.parentVersionId
      || candidate.payloadDigest !== plan.candidatePayloadDigest
      || sha256(parent.parent) !== plan.parentPayloadDigest
    ) {
      throw new LedgerIntegrityError('Skill evaluation result lacks its governed Skill identities')
    }
    const candidateVersionId = prepareRunSkillManifest({
      runId: result.cases[0]!.candidate.runId,
      skill: { ...candidate.payload, provider: parent.resolvedProvider },
    }).parentVersionId
    for (const evaluationCase of result.cases) {
      const planCase = plan.cases.find(item =>
        item.caseId === evaluationCase.caseId && item.attempt === evaluationCase.attempt)
      if (planCase === undefined) {
        throw new LedgerIntegrityError('Skill evaluation result has an unknown plan row')
      }
      for (const [arm, armPlan] of [
        [evaluationCase.baseline, planCase.baseline],
        [evaluationCase.candidate, planCase.candidate],
      ] as const) {
        const binding = this.#runBindings.get(arm.runId)
        const outcome = [...this.#outcomeIntakes.values()]
          .find(value => value.input.runId === arm.runId)?.input
        if (
          binding === undefined
          || outcome === undefined
          || binding.sessionId !== armPlan.sessionId
          || binding.scopeKey !== plan.scopeKey
          || canonicalJson(binding.acceptanceContract) !== canonicalJson(planCase.acceptanceContract)
          || outcome.verdict !== arm.outcome
          || canonicalJson(outcome.evidenceIds) !== canonicalJson(arm.evidenceIds)
        ) {
          throw new LedgerIntegrityError('Skill evaluation result disagrees with Run facts')
        }
        const expectedVersionId = arm.role === 'baseline'
          ? plan.parentVersionId
          : candidateVersionId
        const expectedContentDigest = arm.role === 'baseline'
          ? parent.contentDigest
          : sha256(candidate.payload.content)
        if (
          arm.skillVersionId !== expectedVersionId
          || arm.contentDigest !== expectedContentDigest
        ) {
          throw new LedgerIntegrityError('Skill evaluation result disagrees with governed Skill content')
        }
      }
    }
  }

  #validateControlledSkillEvaluationObjectiveRunFacts(
    objective: ControlledSkillEvaluationObjective,
  ): void {
    const plan = this.#controlledSkillEvaluationPlans.get(objective.evaluationId)
    const task = plan?.tasks.find(item => item.taskId === objective.taskId)
    const candidate = plan === undefined
      ? undefined
      : this.#skillCandidates.get(plan.candidateId)
    const parent = plan === undefined
      ? undefined
      : [...this.#runSkillManifests.values()]
        .find(manifest => manifest.parentVersionId === plan.parentVersionId)
    if (
      plan === undefined
      || task === undefined
      || candidate === undefined
      || parent === undefined
      || candidate.parentVersionId !== plan.parentVersionId
      || candidate.payloadDigest !== plan.candidatePayloadDigest
      || sha256(parent.parent) !== plan.parentPayloadDigest
    ) {
      throw new LedgerIntegrityError(
        'controlled Skill evaluation objective lacks its governed Skill identities',
      )
    }
    for (const [arm, armPlan] of [
      [objective.baseline, task.baseline],
      [objective.candidate, task.candidate],
    ] as const) {
      const binding = this.#runBindings.get(arm.runId)
      const manifest = this.#runSkillManifests.get(arm.runId)
      const use = this.#runSkillUses.get(arm.runId)
      const outcome = [...this.#outcomeIntakes.values()]
        .find(value => value.input.runId === arm.runId)?.input
      const expectedBinding = binding?.schemaVersion === 'tianwen.run-binding.v3'
        ? prepareRunBinding({
            goalRef: `goal:controlled-skill-evaluation:${plan.protocolId}`,
            taskRef: `task:${task.taskId}:${arm.role}`,
            sessionId: armPlan.sessionId,
            scopeKey: plan.scopeKey,
            acceptanceContract: task.acceptanceContract,
            acceptanceSubjectDigest: task.acceptanceSubjectDigest,
            sessionLifecycleFingerprint: binding.sessionLifecycleFingerprint,
          })
        : undefined
      if (
        expectedBinding === undefined
        || canonicalJson(binding) !== canonicalJson(expectedBinding)
        || manifest === undefined
        || use === undefined
        || outcome === undefined
        || outcome.verdict !== arm.outcome
        || canonicalJson(outcome.evidenceIds) !== canonicalJson(arm.evidenceIds)
        || use.runId !== arm.runId
        || use.parentVersionId !== manifest.parentVersionId
        || use.sessionId !== arm.sessionId
        || use.contentDigest !== manifest.contentDigest
        || !arm.evidenceIds.includes(use.acceptanceEvidenceId)
        || arm.skillVersionId !== manifest.parentVersionId
        || arm.contentDigest !== manifest.contentDigest
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objective disagrees with Run facts',
        )
      }
      const expectedManifest = prepareRunSkillManifest({
        runId: arm.runId,
        skill: arm.role === 'baseline'
          ? { ...parent.parent, provider: parent.resolvedProvider }
          : { ...candidate.payload, provider: manifest.resolvedProvider },
      })
      if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objective disagrees with governed Skill content',
        )
      }
    }
  }

  #validateControlledSkillShadowRunFacts(
    plan: ControlledSkillShadowPlan,
    result: ControlledSkillShadowResult,
  ): void {
    const evaluation = this.#controlledSkillEvaluationPlans.get(plan.evaluationId)
    const evaluationResult = this.#controlledSkillEvaluationResults.get(plan.evaluationId)
    const candidate = this.#skillCandidates.get(plan.candidateId)
    const parent = [...this.#runSkillManifests.values()]
      .find(manifest => manifest.parentVersionId === plan.parentVersionId)
    if (
      evaluation === undefined
      || evaluationResult === undefined
      || candidate === undefined
      || parent === undefined
      || plan.evaluationPlanDigest !== sha256(evaluation)
      || plan.evaluationResultDigest !== sha256(evaluationResult)
      || candidate.candidateId !== evaluation.candidateId
      || candidate.parentVersionId !== plan.parentVersionId
      || candidate.payloadDigest !== plan.candidatePayloadDigest
      || sha256(parent.parent) !== plan.parentPayloadDigest
      || result.planDigest !== sha256(plan)
      || result.evaluationPlanDigest !== plan.evaluationPlanDigest
      || result.evaluationResultDigest !== plan.evaluationResultDigest
    ) {
      throw new LedgerIntegrityError(
        'controlled Skill Shadow result lacks its governed Skill identities',
      )
    }
    for (const [index, run] of result.runs.entries()) {
      const task = plan.tasks[index]!
      const binding = this.#runBindings.get(run.runId)
      const manifest = this.#runSkillManifests.get(run.runId)
      const use = this.#runSkillUses.get(run.runId)
      const outcome = [...this.#outcomeIntakes.values()]
        .find(event => event.input.runId === run.runId)?.input
      const expectedBinding = binding?.schemaVersion === 'tianwen.run-binding.v3'
        ? prepareRunBinding({
            goalRef: `goal:controlled-skill-shadow:${plan.shadowId}`,
            taskRef: `task:${task.taskId}:candidate`,
            sessionId: task.sessionId,
            scopeKey: plan.scopeKey,
            acceptanceContract: task.acceptanceContract,
            acceptanceSubjectDigest: task.acceptanceSubjectDigest,
            sessionLifecycleFingerprint: binding.sessionLifecycleFingerprint,
          })
        : undefined
      if (
        expectedBinding === undefined
        || canonicalJson(binding) !== canonicalJson(expectedBinding)
        || manifest === undefined
        || use === undefined
        || outcome === undefined
        || run.taskId !== task.taskId
        || run.runId !== task.runId
        || run.sessionId !== task.sessionId
        || run.skillVersionId !== plan.candidateVersionId
        || run.skillVersionId !== manifest.parentVersionId
        || run.contentDigest !== manifest.contentDigest
        || run.contentDigest !== sha256(candidate.payload.content)
        || use.runId !== run.runId
        || use.parentVersionId !== manifest.parentVersionId
        || use.sessionId !== run.sessionId
        || use.skillName !== candidate.payload.name
        || use.contentDigest !== run.contentDigest
        || use.sessionDigest !== outcome.sessionDigest
        || !run.evidenceIds.includes(use.acceptanceEvidenceId)
        || run.acceptanceSubjectDigest !== task.acceptanceSubjectDigest
        || outcome.verdict !== run.outcome
        || canonicalJson(outcome.evidenceIds) !== canonicalJson(run.evidenceIds)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill Shadow result disagrees with Run facts',
        )
      }
      const expectedManifest = prepareRunSkillManifest({
        runId: run.runId,
        skill: { ...candidate.payload, provider: manifest.resolvedProvider },
      })
      if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
        throw new LedgerIntegrityError(
          'controlled Skill Shadow result disagrees with governed Candidate content',
        )
      }
    }
  }

  #accept(event: LedgerEvent): void {
    const parsed = parseEvent(event)
    if (this.#appendBlocked) {
      throw new LedgerCommitUnknownError(
        'ledger append state is unknown; fresh replay is required',
      )
    }
    this.#validateAgainstState(parsed)
    const line = canonicalLine(parsed)
    const descriptor = openSync(this.#ledgerPath, 'a')
    const appendOffset = fstatSync(descriptor).size
    let commitError: unknown
    try {
      writeAllSync(descriptor, line)
      fsyncSync(descriptor)
    } catch (error) {
      commitError = error
    }
    try {
      closeSync(descriptor)
    } catch (error) {
      commitError ??= error
    }
    if (commitError !== undefined) {
      if (
        parsed.type === 'initial-run-skill-binding-recorded'
        || parsed.type === 'learning-intake-recorded'
        || parsed.type === 'learning-feedback-retracted'
        || parsed.type === 'learning-analysis-requested'
        || parsed.type === 'learning-analysis-child-started'
        || parsed.type === 'learning-analysis-submitted'
        || parsed.type === 'learning-analysis-invalidated'
        || parsed.type === 'learning-analysis-candidate-ready'
        || parsed.type === 'learning-analysis-protocol-unavailable'
        || parsed.type === 'learning-analysis-failed'
        || parsed.type === 'learning-analysis-resumed'
        || parsed.type === 'learning-analysis-report-intent-recorded'
        || parsed.type === 'learning-analysis-report-delivered'
      ) {
        const recovery = this.#recoverLearningAppend(line, appendOffset)
        if (recovery === 'committed') {
          this.#apply(parsed)
          return
        }
        if (recovery === 'not-written') {
          throw new LedgerAppendNotCommittedError(
            'ledger append wrote no bytes; retry may proceed',
            { cause: commitError },
          )
        }
        this.#appendBlocked = recovery === 'unknown'
      }
      throw new LedgerCommitUnknownError(
        'ledger append started but its durable commit is unknown',
        { cause: commitError },
      )
    }
    this.#apply(parsed)
  }

  #recoverLearningAppend(
    line: string,
    appendOffset: number,
  ): 'committed' | 'not-written' | 'unknown' {
    const expected = Buffer.from(line, 'utf8')
    let persisted: Buffer
    try {
      persisted = readFileSync(this.#ledgerPath)
    } catch {
      return 'unknown'
    }
    if (persisted.length === appendOffset) return 'not-written'
    if (
      persisted.length !== appendOffset + expected.length
      || !persisted.subarray(appendOffset).equals(expected)
    ) {
      return 'unknown'
    }

    let descriptor: number | undefined
    let durable = false
    try {
      descriptor = openSync(this.#ledgerPath, 'r+')
      if (fstatSync(descriptor).size !== persisted.length) return 'unknown'
      fsyncSync(descriptor)
      durable = true
    } catch {
      return 'unknown'
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor)
        } catch {
          durable = false
        }
      }
    }
    return durable ? 'committed' : 'unknown'
  }

  #validateAgainstState(event: LedgerEvent): void {
    if (event.type === 'initial-run-skill-binding-recorded') {
      if (
        event.binding.runId !== event.manifest.runId
        || this.#runBindings.has(event.binding.runId)
        || this.#runSkillManifests.has(event.binding.runId)
        || this.#runIdBySession.has(event.binding.sessionId)
        || event.inputDigest !== sha256({
          binding: event.binding,
          manifest: event.manifest,
        })
      ) {
        throw new LedgerIntegrityError(
          'Initial Run Skill binding disagrees with history',
        )
      }
      return
    }
    if (event.type === 'run-binding-recorded') {
      if (this.#runBindings.has(event.binding.runId)) {
        throw new LedgerIntegrityError(
          `duplicate Tianwen Run: ${event.binding.runId}`,
        )
      }
      const sessionRunId = this.#runIdBySession.get(event.binding.sessionId)
      if (
        sessionRunId !== undefined
        && (
          sessionRunId !== event.binding.runId
          || !this.#matchesControlledTransitionReservation(event.binding)
        )
      ) {
        throw new LedgerIntegrityError(
          `duplicate DSH Session binding: ${event.binding.sessionId}`,
        )
      }
      return
    }
    if (event.type === 'run-skill-manifest-recorded') {
      if (!this.#runBindings.has(event.manifest.runId)) {
        throw new LedgerIntegrityError(
          `Run Skill manifest references unknown Run: ${event.manifest.runId}`,
        )
      }
      if (
        this.#runSkillManifests.has(event.manifest.runId)
        || event.inputDigest !== sha256(event.manifest)
      ) {
        throw new LedgerIntegrityError('Run Skill manifest disagrees with history')
      }
      return
    }
    if (event.type === 'run-skill-use-recorded') {
      const binding = this.#runBindings.get(event.use.runId)
      const manifest = this.#runSkillManifests.get(event.use.runId)
      const outcome = [...this.#outcomeIntakes.values()]
        .find(stored => stored.input.runId === event.use.runId)?.input
      if (
        binding === undefined
        || manifest === undefined
        || outcome === undefined
        || this.#runSkillUses.has(event.use.runId)
      ) {
        throw new LedgerIntegrityError('Run Skill use disagrees with history')
      }
      let prepared
      try {
        const { schemaVersion: _schemaVersion, ...input } = event.use
        prepared = prepareRunSkillUse(input, manifest, binding, outcome)
      } catch (error) {
        throw new LedgerIntegrityError('Run Skill use event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.use)
        || event.inputDigest !== sha256(event.use)
      ) {
        throw new LedgerIntegrityError('Run Skill use disagrees with frozen facts')
      }
      return
    }
    if (event.type === 'controlled-skill-eval-protocol-frozen') {
      const ticket = this.#learningTickets.get(event.protocol.ticketId)
      if (
        ticket === undefined
        || this.#controlledSkillEvalProtocols.has(event.protocol.protocolId)
      ) {
        throw new LedgerIntegrityError('controlled Skill evaluation protocol disagrees with history')
      }
      const signals = this.#controlledSkillEvalScopeFacts(ticket)
      const provenance = this.#caseIdByTicket.has(ticket.ticketId)
        || (this.#controlledSkillEvalProtocolIdsByTicket.get(ticket.ticketId)?.length ?? 0) > 0
        ? 'retrospective'
        : 'pre-candidate'
      let prepared
      try {
        prepared = prepareControlledSkillEvalProtocol({
          ticketId: ticket.ticketId,
          evidencePurpose: event.protocol.evidencePurpose,
          protocol: event.protocol.protocol,
        }, ticket, signals, provenance)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill evaluation protocol event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.protocol)
        || event.inputDigest !== sha256(event.protocol)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation protocol disagrees with Ticket history',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-evaluation-opened') {
      const candidate = this.#skillCandidates.get(event.plan.candidateId)
      const protocol = this.#controlledSkillEvalProtocols.get(event.plan.protocolId)
      const learningCase = candidate === undefined
        ? undefined
        : this.#learningCases.get(candidate.caseId)
      const parent = candidate === undefined
        ? undefined
        : [...this.#runSkillManifests.values()]
          .find(value => value.parentVersionId === candidate.parentVersionId)?.parent
      if (
        candidate === undefined
        || protocol === undefined
        || learningCase === undefined
        || parent === undefined
        || this.#controlledSkillEvaluationPlans.has(event.plan.evaluationId)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation plan disagrees with history',
        )
      }
      let prepared
      try {
        prepared = prepareControlledSkillEvaluationPlan({
          candidateId: event.plan.candidateId,
          protocolId: event.plan.protocolId,
          sessionAllocations: event.plan.tasks.map(task => ({
            taskId: task.taskId,
            baselineSessionId: task.baseline.sessionId,
            candidateSessionId: task.candidate.sessionId,
            evaluatorSessionId: task.evaluatorSessionId,
          })),
        }, candidate, learningCase, protocol, sha256(parent))
      } catch (error) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation plan event is invalid',
          { cause: error },
        )
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.plan)
        || event.inputDigest !== sha256(event.plan)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation plan disagrees with history',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-evaluation-objective-recorded') {
      const plan = this.#controlledSkillEvaluationPlans.get(event.objective.evaluationId)
      const stored = this.#controlledSkillEvaluationObjectives.get(event.objective.evaluationId)
      if (
        plan === undefined
        || stored?.has(event.objective.taskId) === true
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objective disagrees with history',
        )
      }
      let prepared
      try {
        const { schemaVersion: _schemaVersion, ...input } = event.objective
        const {
          comparison: _comparison,
          candidateHardGate: _candidateHardGate,
          objectiveVerdict: _objectiveVerdict,
          ...recordInput
        } = input
        prepared = prepareControlledSkillEvaluationObjective(recordInput, plan)
      } catch (error) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objective event is invalid',
          { cause: error },
        )
      }
      const previous = stored === undefined ? [] : [...stored.values()]
      const expectedTask = plan.tasks[previous.length]
      if (
        expectedTask?.taskId !== prepared.taskId
        || previous.at(-1)?.objectiveVerdict !== undefined
          && previous.at(-1)?.objectiveVerdict !== 'pass'
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objectives must follow the protocol task order',
        )
      }
      this.#validateControlledSkillEvaluationObjectiveRunFacts(prepared)
      if (
        canonicalJson(prepared) !== canonicalJson(event.objective)
        || event.inputDigest !== sha256(event.objective)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation objective disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-evaluation-blind-map-frozen') {
      const plan = this.#controlledSkillEvaluationPlans.get(event.blindMap.evaluationId)
      if (
        plan === undefined
        || this.#controlledSkillEvaluationBlindMaps.has(event.blindMap.evaluationId)
        || this.#controlledSkillEvaluationResults.has(event.blindMap.evaluationId)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation blind map disagrees with history',
        )
      }
      const objectives = [
        ...(this.#controlledSkillEvaluationObjectives
          .get(event.blindMap.evaluationId)?.values() ?? []),
      ]
      let prepared
      try {
        prepared = prepareControlledSkillEvaluationBlindMap(
          { evaluationId: event.blindMap.evaluationId },
          plan,
          objectives,
        )
      } catch (error) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation blind map event is invalid',
          { cause: error },
        )
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.blindMap)
        || event.inputDigest !== sha256(event.blindMap)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation blind map disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-evaluator-observation-recorded') {
      const plan = this.#controlledSkillEvaluationPlans.get(event.observation.evaluationId)
      const blindMap = this.#controlledSkillEvaluationBlindMaps
        .get(event.observation.evaluationId)
      const stored = this.#controlledSkillEvaluatorObservations
        .get(event.observation.evaluationId)
      if (
        plan === undefined
        || blindMap === undefined
        || stored?.has(event.observation.taskId) === true
        || this.#controlledSkillEvaluationResults.has(event.observation.evaluationId)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluator observation disagrees with history',
        )
      }
      let prepared
      try {
        const { schemaVersion: _schemaVersion, ...input } = event.observation
        prepared = prepareControlledSkillEvaluatorObservation(input, plan, blindMap)
      } catch (error) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluator observation event is invalid',
          { cause: error },
        )
      }
      const previous = stored === undefined ? [] : [...stored.values()]
      if (
        plan.tasks[previous.length]?.taskId !== prepared.taskId
        || previous.at(-1)?.status === 'inconclusive'
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluator observations must follow the protocol task order',
        )
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.observation)
        || event.inputDigest !== sha256(event.observation)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluator observation disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-evaluation-result-recorded') {
      const plan = this.#controlledSkillEvaluationPlans.get(event.result.evaluationId)
      if (
        plan === undefined
        || this.#controlledSkillEvaluationResults.has(event.result.evaluationId)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation result disagrees with history',
        )
      }
      const objectives = [
        ...(this.#controlledSkillEvaluationObjectives
          .get(event.result.evaluationId)?.values() ?? []),
      ]
      const blindMap = this.#controlledSkillEvaluationBlindMaps
        .get(event.result.evaluationId)
      const observations = [
        ...(this.#controlledSkillEvaluatorObservations
          .get(event.result.evaluationId)?.values() ?? []),
      ]
      let prepared
      try {
        prepared = prepareControlledSkillEvaluationResult(
          { evaluationId: event.result.evaluationId },
          plan,
          objectives,
          blindMap,
          observations,
        )
      } catch (error) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation result event is invalid',
          { cause: error },
        )
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.result)
        || event.inputDigest !== sha256(event.result)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill evaluation result disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-shadow-opened') {
      const evaluation = this.#controlledSkillEvaluationPlans.get(event.plan.evaluationId)
      const result = this.#controlledSkillEvaluationResults.get(event.plan.evaluationId)
      const candidate = evaluation === undefined
        ? undefined
        : this.#skillCandidates.get(evaluation.candidateId)
      const parent = evaluation === undefined
        ? undefined
        : [...this.#runSkillManifests.values()]
          .find(manifest => manifest.parentVersionId === evaluation.parentVersionId)
      if (
        evaluation === undefined
        || result === undefined
        || candidate === undefined
        || parent === undefined
        || this.#controlledSkillShadowPlans.has(event.plan.shadowId)
        || this.#controlledSkillShadowIdByEvaluation.has(event.plan.evaluationId)
        || event.plan.tasks.some(task => this.#runIdBySession.has(task.sessionId))
      ) {
        throw new LedgerIntegrityError('controlled Skill Shadow plan disagrees with history')
      }
      const objectives = [
        ...(this.#controlledSkillEvaluationObjectives
          .get(event.plan.evaluationId)?.values() ?? []),
      ]
      const observations = [
        ...(this.#controlledSkillEvaluatorObservations
          .get(event.plan.evaluationId)?.values() ?? []),
      ]
      let prepared
      try {
        prepared = prepareControlledSkillShadowPlan({
          evaluationId: event.plan.evaluationId,
          tasks: event.plan.tasks.map(task => {
            const { runId: _runId, ...input } = task
            return input
          }),
        }, evaluation, result, candidate, sha256(parent.parent), objectives, observations)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill Shadow plan event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.plan)
        || event.inputDigest !== sha256(event.plan)
      ) {
        throw new LedgerIntegrityError('controlled Skill Shadow plan disagrees with frozen facts')
      }
      return
    }
    if (event.type === 'controlled-skill-shadow-result-recorded') {
      const plan = this.#controlledSkillShadowPlans.get(event.result.shadowId)
      if (plan === undefined || this.#controlledSkillShadowResults.has(event.result.shadowId)) {
        throw new LedgerIntegrityError('controlled Skill Shadow result disagrees with history')
      }
      let prepared
      try {
        prepared = prepareControlledSkillShadowResult({
          shadowId: event.result.shadowId,
          runs: event.result.runs,
        }, plan)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill Shadow result event is invalid', {
          cause: error,
        })
      }
      this.#validateControlledSkillShadowRunFacts(plan, prepared)
      if (
        canonicalJson(prepared) !== canonicalJson(event.result)
        || event.inputDigest !== sha256(event.result)
      ) {
        throw new LedgerIntegrityError('controlled Skill Shadow result disagrees with frozen facts')
      }
      return
    }
    if (event.type === 'controlled-skill-pointer-initialized') {
      const recommendation = this.#controlledSkillPromotionRecommendation(
        event.initialization.shadowId,
      )
      const prepared = prepareControlledSkillPointerInitialization(recommendation)
      if (
        this.#controlledSkillPointerInitializations.has(event.initialization.shadowId)
        || this.#controlledSkillPointerInitializationByScope.has(
          event.initialization.pointer.scopeKey,
        )
        || canonicalJson(prepared) !== canonicalJson(event.initialization)
        || event.inputDigest !== sha256(event.initialization)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill pointer initialization disagrees with history',
        )
      }
      return
    }
    if (
      event.type === 'controlled-skill-promoted'
      || event.type === 'controlled-skill-rolled-back'
      || event.type === 'controlled-skill-restored'
    ) {
      const transition = event.transition
      if (
        this.#controlledSkillTransitions.has(transition.transitionId)
        || this.#controlledSkillTransitionIdsByLogicalKey.has(
          `${transition.shadowId}:${transition.kind}:${transition.previousPointer.revision}`,
        )
        || this.#runBindings.has(transition.runBinding.runId)
        || this.#runIdBySession.has(transition.runBinding.sessionId)
      ) {
        throw new LedgerIntegrityError('controlled Skill transition disagrees with history')
      }
      const recommendation = this.#controlledSkillPromotionRecommendation(transition.shadowId)
      let prepared
      try {
        prepared = prepareControlledSkillTransition({
          shadowId: transition.shadowId,
          kind: transition.kind,
          expectedRevision: transition.previousPointer.revision,
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
            sessionId: transition.postCheck.sessionId,
          },
        }, recommendation, transition.previousPointer)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill transition event is invalid', {
          cause: error,
        })
      }
      this.#validateControlledSkillTransitionOrder(prepared)
      if (
        canonicalJson(prepared) !== canonicalJson(transition)
        || event.inputDigest !== sha256(transition)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill transition disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-transition-verified') {
      const transition = this.#controlledSkillTransitions.get(
        event.verification.transitionId,
      )
      if (
        transition === undefined
        || this.#controlledSkillTransitionVerifications.has(transition.transitionId)
        || this.#controlledSkillActivationFailures.has(transition.transitionId)
        || canonicalJson(this.#controlledSkillScopePointers.get(
          transition.targetPointer.scopeKey,
        )) !== canonicalJson(transition.targetPointer)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill transition verification disagrees with history',
        )
      }
      let prepared
      try {
        prepared = prepareControlledSkillTransitionVerification({
          transitionId: transition.transitionId,
          run: event.verification.run,
        }, transition)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill transition verification is invalid', {
          cause: error,
        })
      }
      this.#validateControlledSkillTransitionRunFacts(transition, prepared)
      if (
        canonicalJson(prepared) !== canonicalJson(event.verification)
        || event.inputDigest !== sha256(event.verification)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill transition verification disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'controlled-skill-activation-failed') {
      const transition = this.#controlledSkillTransitions.get(event.failure.transitionId)
      if (
        transition === undefined
        || this.#controlledSkillActivationFailures.has(transition.transitionId)
        || this.#controlledSkillTransitionVerifications.has(transition.transitionId)
        || canonicalJson(this.#controlledSkillScopePointers.get(
          transition.targetPointer.scopeKey,
        )) !== canonicalJson(transition.targetPointer)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill activation failure disagrees with history',
        )
      }
      let prepared
      try {
        prepared = prepareControlledSkillActivationFailure({
          transitionId: transition.transitionId,
          reasonCode: event.failure.reasonCode,
        }, transition)
      } catch (error) {
        throw new LedgerIntegrityError('controlled Skill activation failure is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.failure)
        || event.inputDigest !== sha256(event.failure)
      ) {
        throw new LedgerIntegrityError(
          'controlled Skill activation failure disagrees with frozen facts',
        )
      }
      return
    }
    if (event.type === 'skill-eval-protocol-frozen') {
      const ticket = this.#learningTickets.get(event.protocol.ticketId)
      if (
        ticket === undefined
        || this.#skillEvalProtocols.has(event.protocol.protocolId)
      ) {
        throw new LedgerIntegrityError('Skill evaluation protocol disagrees with history')
      }
      const signals = ticket.signalIds.map(id => this.#learningSignals.get(id))
        .filter((signal): signal is OutcomeLearningSignal =>
          signal !== undefined && isOutcomeSignal(signal))
      const provenance = this.#caseIdByTicket.has(ticket.ticketId)
        || (this.#skillEvalProtocolIdsByTicket.get(ticket.ticketId)?.length ?? 0) > 0
        ? 'retrospective'
        : 'pre-candidate'
      let prepared
      try {
        prepared = prepareSkillEvalProtocol({
          ticketId: ticket.ticketId,
          protocol: event.protocol.protocol,
        }, ticket, signals, provenance)
      } catch (error) {
        throw new LedgerIntegrityError('Skill evaluation protocol event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.protocol)
        || event.inputDigest !== sha256(event.protocol)
      ) {
        throw new LedgerIntegrityError('Skill evaluation protocol disagrees with Ticket history')
      }
      return
    }
    if (event.type === 'skill-evaluation-opened') {
      const candidate = this.#skillCandidates.get(event.plan.candidateId)
      const protocol = this.#skillEvalProtocols.get(event.plan.protocolId)
      const learningCase = candidate === undefined
        ? undefined
        : this.#learningCases.get(candidate.caseId)
      const parent = candidate === undefined
        ? undefined
        : [...this.#runSkillManifests.values()]
          .find(value => value.parentVersionId === candidate.parentVersionId)?.parent
      if (
        candidate === undefined
        || protocol === undefined
        || learningCase === undefined
        || parent === undefined
        || this.#skillEvaluationPlans.has(event.plan.evaluationId)
      ) {
        throw new LedgerIntegrityError('Skill evaluation plan disagrees with history')
      }
      let prepared
      try {
        prepared = prepareSkillEvaluationPlan({
          candidateId: event.plan.candidateId,
          protocolId: event.plan.protocolId,
          environment: event.plan.environment,
          arms: event.plan.cases.map(item => ({
            caseId: item.caseId,
            attempt: item.attempt,
            baseline: {
              runId: item.baseline.runId,
              sessionId: item.baseline.sessionId,
            },
            candidate: {
              runId: item.candidate.runId,
              sessionId: item.candidate.sessionId,
            },
          })),
        }, candidate, learningCase, protocol, sha256(parent))
      } catch (error) {
        throw new LedgerIntegrityError('Skill evaluation plan event is invalid', { cause: error })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.plan)
        || event.inputDigest !== sha256(event.plan)
      ) {
        throw new LedgerIntegrityError('Skill evaluation plan disagrees with history')
      }
      return
    }
    if (event.type === 'skill-evaluation-result-recorded') {
      const plan = this.#skillEvaluationPlans.get(event.result.evaluationId)
      if (
        plan === undefined
        || this.#skillEvaluationResults.has(event.result.evaluationId)
      ) {
        throw new LedgerIntegrityError('Skill evaluation result disagrees with history')
      }
      let prepared
      try {
        prepared = prepareSkillEvaluationResult({
          evaluationId: event.result.evaluationId,
          cases: event.result.cases.map(item => ({
            caseId: item.caseId,
            attempt: item.attempt,
            baseline: item.baseline,
            candidate: item.candidate,
          })),
          baselineResolutionMatched: event.result.baselineResolutionMatched,
        }, plan)
      } catch (error) {
        throw new LedgerIntegrityError('Skill evaluation result event is invalid', { cause: error })
      }
      this.#validateSkillEvaluationRunFacts(prepared)
      if (
        canonicalJson(prepared) !== canonicalJson(event.result)
        || event.inputDigest !== sha256(event.result)
      ) {
        throw new LedgerIntegrityError('Skill evaluation result disagrees with history')
      }
      return
    }
    if (event.type === 'learning-case-opened') {
      const ticket = this.#learningTickets.get(event.case.ticketId)
      if (ticket === undefined || this.#caseIdByTicket.has(ticket.ticketId)) {
        throw new LedgerIntegrityError('Learning Case disagrees with history')
      }
      let prepared
      try {
        if (event.case.evidenceSource === 'explicit-correction') {
          const status = [...this.#learningAnalyses.values()].find(value =>
            value.ticketId === ticket.ticketId
            && value.submission?.verdict === 'skill-change'
            && value.sessionId === value.parentSessionId)
          const runId = status === undefined
            ? undefined
            : this.#runIdBySession.get(status.sessionId)
          const binding = runId === undefined ? undefined : this.#runBindings.get(runId)
          const manifest = runId === undefined ? undefined : this.#runSkillManifests.get(runId)
          if (status === undefined || binding === undefined || manifest === undefined) {
            throw new TypeError('explicit correction Case has no exact parent')
          }
          const signals = ticket.signalIds.map(id => this.#learningSignals.get(id))
            .filter((signal): signal is LearningSignal =>
              signal !== undefined
              && !isOutcomeSignal(signal)
              && !this.#inactiveLearningSignals.has(signal.signalId)
              && signal.sessionId === status.sessionId
              && signal.messageId === status.messageId
              && signal.feedbackVersion === status.feedbackVersion)
          prepared = prepareExplicitCorrectionLearningCase({
            ticket,
            signals,
            evidenceIds: event.case.supportingEvidenceIds,
            binding,
            manifest,
            uses: [...this.#runSkillUses.values()],
          })
        } else {
          const signals = ticket.signalIds.map(id => this.#learningSignals.get(id))
            .filter((signal): signal is OutcomeLearningSignal =>
              signal !== undefined && isOutcomeSignal(signal))
          prepared = prepareLearningCase({
            ticketId: ticket.ticketId,
            counterevidenceRunIds: event.case.counterevidence.map(item => item.runId),
          }, ticket, signals, {
            bindings: [...this.#runBindings.values()],
            manifests: [...this.#runSkillManifests.values()],
            uses: [...this.#runSkillUses.values()],
            outcomes: [...this.#outcomeIntakes.values()].map(value => value.input),
          })
        }
      } catch (error) {
        throw new LedgerIntegrityError('Learning Case event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.case)
        || event.inputDigest !== sha256(event.case)
      ) {
        throw new LedgerIntegrityError('Learning Case disagrees with frozen facts')
      }
      return
    }
    if (event.type === 'learning-attribution-recorded') {
      const learningCase = this.#learningCases.get(event.attribution.caseId)
      if (
        learningCase === undefined
        || this.#attributionIdByCase.has(learningCase.caseId)
      ) {
        throw new LedgerIntegrityError('Attribution disagrees with history')
      }
      const { attributionId: _attributionId, ...input } = event.attribution
      let prepared
      try {
        prepared = prepareAttribution(input, learningCase)
      } catch (error) {
        throw new LedgerIntegrityError('Attribution event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.attribution)
        || event.inputDigest !== sha256(event.attribution)
      ) {
        throw new LedgerIntegrityError('Attribution disagrees with its Case')
      }
      return
    }
    if (event.type === 'learning-lesson-recorded') {
      const learningCase = this.#learningCases.get(event.lesson.caseId)
      const attribution = this.#attributions.get(event.lesson.attributionId)
      if (
        learningCase === undefined
        || attribution === undefined
        || this.#lessonIdByAttribution.has(attribution.attributionId)
      ) {
        throw new LedgerIntegrityError('Accepted Lesson disagrees with history')
      }
      const {
        lessonId: _lessonId,
        ticketId: _ticketId,
        status: _status,
        ...input
      } = event.lesson
      let prepared
      try {
        prepared = prepareAcceptedLesson(input, learningCase, attribution)
      } catch (error) {
        throw new LedgerIntegrityError('Accepted Lesson event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.lesson)
        || event.inputDigest !== sha256(event.lesson)
      ) {
        throw new LedgerIntegrityError('Accepted Lesson disagrees with Attribution')
      }
      return
    }
    if (event.type === 'learning-candidate-recorded') {
      const lesson = this.#acceptedLessons.get(event.candidate.lessonId)
      const learningCase = this.#learningCases.get(event.candidate.caseId)
      const attribution = this.#attributions.get(event.candidate.attributionId)
      const parent = [...this.#runSkillManifests.values()]
        .find(value =>
          value.parentVersionId === event.candidate.parentVersionId)?.parent
      if (
        lesson === undefined
        || learningCase === undefined
        || attribution === undefined
        || parent === undefined
        || this.#candidateIdByCase.has(learningCase.caseId)
      ) {
        throw new LedgerIntegrityError('Skill Candidate disagrees with history')
      }
      let prepared
      try {
        prepared = prepareSkillCandidate({
          lessonId: lesson.lessonId,
          payload: event.candidate.payload,
          evidenceIds: event.candidate.evidenceIds,
        }, lesson, learningCase, attribution, parent)
      } catch (error) {
        throw new LedgerIntegrityError('Skill Candidate event is invalid', {
          cause: error,
        })
      }
      if (
        canonicalJson(prepared) !== canonicalJson(event.candidate)
        || event.inputDigest !== sha256(event.candidate)
      ) {
        throw new LedgerIntegrityError('Skill Candidate disagrees with Lesson')
      }
      return
    }
    if (event.type === 'outcome-intake-recorded') {
      const binding = this.#runBindings.get(event.input.runId)
      if (binding === undefined) {
        throw new LedgerIntegrityError(
          `Outcome references unknown Tianwen Run: ${event.input.runId}`,
        )
      }
      let prepared
      try {
        prepared = prepareOutcomeIntake(binding, event.input)
      } catch (error) {
        throw new LedgerIntegrityError('Outcome event input is invalid', {
          cause: error,
        })
      }
      if (
        event.inputDigest !== prepared.inputDigest
        || event.receipt.ingestionId !== prepared.ingestionId
        || this.#outcomeIntakes.has(prepared.ingestionId)
      ) {
        throw new LedgerIntegrityError('Outcome event disagrees with its input')
      }
      if (prepared.kind !== 'reusable') {
        if (
          event.receipt.decision !== prepared.decision
          || event.signal !== undefined
        ) {
          throw new LedgerIntegrityError('Outcome observation has invalid output')
        }
        return
      }
      const prior = [...this.#learningSignals.values()]
        .filter(isOutcomeSignal)
        .filter(signal =>
          signal.problemFingerprint === prepared.problemFingerprint)
      const ticket = this.#learningTickets.get(prepared.ticketId)
      const expectedDecision = ticket !== undefined
        ? 'ticket-merged'
        : prepared.blocksGoal
          || prepared.severity >= 4
          || prior.some(signal => signal.runId !== event.input.runId)
          ? 'ticket-created'
          : 'signal-recorded'
      const signal = event.signal
      if (
        event.receipt.decision !== expectedDecision
        || event.receipt.signalId !== prepared.signalId
        || event.receipt.ticketId !== (
          expectedDecision === 'signal-recorded'
            ? undefined
            : prepared.ticketId
        )
        || signal === undefined
        || signal.signalId !== prepared.signalId
        || signal.ingestionId !== prepared.ingestionId
        || signal.runId !== event.input.runId
        || signal.sessionId !== binding.sessionId
        || signal.scopeKey !== binding.scopeKey
        || signal.problemFingerprint !== prepared.problemFingerprint
        || signal.problemCategory !== prepared.problemCategory
        || signal.failureSignature !== prepared.failureSignature
        || signal.severity !== prepared.severity
        || signal.blocksGoal !== prepared.blocksGoal
        || signal.sessionDigest !== event.input.sessionDigest
        || JSON.stringify(signal.evidenceIds)
          !== JSON.stringify(event.input.evidenceIds)
      ) {
        throw new LedgerIntegrityError('Outcome Signal disagrees with its input')
      }
      if (this.#learningSignals.has(signal.signalId)) {
        throw new LedgerIntegrityError(
          `duplicate LearningSignal: ${signal.signalId}`,
        )
      }
      if (
        ticket !== undefined
        && ticket.problemFingerprint !== signal.problemFingerprint
      ) {
        throw new LedgerIntegrityError(
          `LearningTicket merge disagrees with history: ${prepared.ticketId}`,
        )
      }
      return
    }
    if (event.type === 'learning-intake-recorded') {
      if (this.#learningIntakes.has(event.receipt.ingestionId)) {
        throw new LedgerIntegrityError(
          `duplicate learning ingestion: ${event.receipt.ingestionId}`,
        )
      }
      if (event.schemaVersion === 'tianwen.learning-intake.v2') {
        const current = this.#learningIntakeStatuses
          .get(event.input.sessionId)
          ?.get(event.input.messageId)
        if (
          event.sessionLifecycleFingerprint !== undefined
          && current !== undefined
          && current.sessionLifecycleFingerprint
            !== event.sessionLifecycleFingerprint
        ) {
          throw new LedgerIntegrityError(
            'learning feedback Session lifecycle disagrees with current revision',
          )
        }
        const expectedPredecessor = current?.state === 'active'
          ? current.feedbackVersion
          : undefined
        if (event.supersedesFeedbackVersion !== expectedPredecessor) {
          throw new LedgerIntegrityError(
            'learning feedback supersession disagrees with current revision',
          )
        }
        if (
          event.analysisConsentRevision !== undefined
          && (
            this.#learningAnalysisConsents
              .get(event.analysisConsentRevision)?.enabled !== true
          )
        ) {
          throw new LedgerIntegrityError(
            'learning feedback references consent that was not enabled',
          )
        }
      }
      if (event.signal === undefined) {
        return
      }
      if (this.#learningSignals.has(event.signal.signalId)) {
        throw new LedgerIntegrityError(
          `duplicate LearningSignal: ${event.signal.signalId}`,
        )
      }
      const ticketId = event.receipt.ticketId!
      const ticket = this.#learningTickets.get(ticketId)
      if (ticket === undefined) {
        if (event.receipt.decision !== 'ticket-created') {
          throw new LedgerIntegrityError(
            `new LearningTicket must use ticket-created: ${ticketId}`,
          )
        }
      } else if (
        event.receipt.decision !== 'ticket-merged' ||
        ticket.problemFingerprint !== event.signal.problemFingerprint
      ) {
        throw new LedgerIntegrityError(
          `LearningTicket merge disagrees with history: ${ticketId}`,
        )
      }
      return
    }
    if (event.type === 'learning-feedback-retracted') {
      const key = learningRetractionKey(event)
      const current = this.#learningIntakeStatuses
        .get(event.sessionId)
        ?.get(event.messageId)
      if (this.#learningRetractions.has(key)) {
        throw new LedgerIntegrityError(
          `duplicate learning feedback retraction: ${key}`,
        )
      }
      if (
        current?.state !== 'active'
        || current.feedbackVersion !== event.retractedFeedbackVersion
        || (
          event.schemaVersion === 'tianwen.learning-feedback-retracted.v2'
          && current.sessionLifecycleFingerprint
            !== event.sessionLifecycleFingerprint
        )
      ) {
        throw new LedgerIntegrityError(
          'learning feedback retraction disagrees with current revision',
        )
      }
      return
    }
    if (event.type === 'learning-analysis-requested') {
      const binding = event.binding
      const intake = this.#learningIntakeStatuses
        .get(binding.sessionId)
        ?.get(binding.messageId)
      const ticket = this.#learningTickets.get(binding.ticketId)
      const signal = intake?.signalId === undefined
        ? undefined
        : this.#learningSignals.get(intake.signalId)
      if (
        this.#learningAnalyses.has(binding.analysisId)
        || this.#learningAnalysisIdByChildSession.has(binding.childSessionId)
        || intake?.state !== 'active'
        || intake.ticketId !== binding.ticketId
        || intake.feedbackVersion !== binding.feedbackVersion
        || intake.analysisConsentRevision !== binding.consentRevision
        || this.#learningAnalysisConsents.get(binding.consentRevision)?.enabled
          !== true
        || ticket?.status !== 'open'
        || intake.signalId === undefined
        || !ticket.signalIds.includes(intake.signalId)
        || signal === undefined
        || isOutcomeSignal(signal)
        || this.#inactiveLearningSignals.has(signal.signalId)
        || signal.sessionId !== binding.sessionId
        || signal.messageId !== binding.messageId
        || signal.feedbackVersion !== binding.feedbackVersion
      ) {
        throw new LedgerIntegrityError(
          'learning analysis request disagrees with active consented feedback',
        )
      }
      return
    }
    if (event.type === 'learning-analysis-child-started') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (
        status?.phase !== 'pending-parent'
        || status.childStartedAt !== undefined
        || event.parentSessionId !== status.parentSessionId
        || event.childSessionId !== status.childSessionId
      ) throw new LedgerIntegrityError('learning analysis child start disagrees with history')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-submitted') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (
        status?.phase !== 'running'
        || status.childStartedAt === undefined
        || status.submission !== undefined
        || event.childSessionId !== status.childSessionId
      ) throw new LedgerIntegrityError('learning analysis submission disagrees with history')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      try {
        assertLearningAnalysisEvidenceClosure(
          event.submission,
          this.#learningAnalysisEvidenceClosure(status),
        )
      } catch (error) {
        throw new LedgerIntegrityError(
          'learning analysis submission exceeds its Evidence closure',
          { cause: error },
        )
      }
      return
    }
    if (event.type === 'learning-analysis-invalidated') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (
        status === undefined
        || (this.#learningAnalysisConsent?.enabled === true
          && this.#learningAnalysisHasActiveSupport(status))
        || status.phase === 'invalidated'
        || status.phase === 'promoted'
        || status.phase === 'rolled-back'
        || status.phase === 'transition-recovered'
        || (status.phase === 'failed' && status.resumePhase === 'promoted')
      ) throw new LedgerIntegrityError('learning analysis invalidation disagrees with support')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-candidate-ready') {
      const status = this.#learningAnalyses.get(event.analysisId)
      const candidate = this.#skillCandidates.get(event.candidateId)
      const patch = status?.submission?.candidatePatch
      const requiredEvidence = status === undefined
        ? []
        : [...new Set([
            ...(status.submission?.supportingEvidenceIds ?? []),
            ...(status.submission?.counterevidenceIds ?? []),
          ])]
      if (
        status?.phase !== 'running'
        || status.submission?.verdict !== 'skill-change'
        || patch === undefined
        || candidate === undefined
        || candidate.ticketId !== status.ticketId
        || candidate.payload.description !== patch.description
        || candidate.payload.whenToUse !== patch.whenToUse
        || candidate.payload.content !== patch.content
        || candidate.evidenceIds.length !== requiredEvidence.length
        || requiredEvidence.some(id => !candidate.evidenceIds.includes(id))
        || !this.#learningAnalysisHasActiveSupport(status)
      ) throw new LedgerIntegrityError('learning analysis Candidate-ready event disagrees with history')
      try {
        assertLearningAnalysisEvidenceClosure(
          status.submission,
          this.#learningAnalysisEvidenceClosure(status),
        )
      } catch (error) {
        throw new LedgerIntegrityError('learning analysis Candidate-ready Evidence changed', {
          cause: error,
        })
      }
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-protocol-unavailable') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (
        status?.phase !== 'running'
        || status.submission?.verdict !== 'skill-change'
        || !this.#learningAnalysisHasActiveSupport(status)
        || this.#hasExactExplicitCorrectionParent(status)
      ) throw new LedgerIntegrityError('learning analysis protocol-unavailable disagrees with history')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-governed-outcome-recorded') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (status === undefined) {
        throw new LedgerIntegrityError('learning analysis governed outcome has no analysis')
      }
      this.#assertLearningAnalysisGovernedOutcome(status, event.outcome)
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-failed') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (status === undefined || status.phase !== event.resumePhase) {
        throw new LedgerIntegrityError('learning analysis failure disagrees with history')
      }
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-resumed') {
      const status = this.#learningAnalyses.get(event.analysisId)
      if (
        status?.phase !== 'failed'
        || status.resumePhase !== event.resumePhase
      ) throw new LedgerIntegrityError('learning analysis resume disagrees with history')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-report-intent-recorded') {
      const status = this.#learningAnalyses.get(event.report.analysisId)
      if (
        status?.submission === undefined
        || status.reportDelivery !== undefined
        || status.parentSessionId !== event.report.parentSessionId
        || status.childSessionId !== event.report.childSessionId
      ) throw new LedgerIntegrityError('learning analysis report intent disagrees with history')
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-report-delivered') {
      const status = this.#learningAnalyses.get(event.report.analysisId)
      const report = status?.reportDelivery
      if (
        report?.state !== 'pending'
        || report.parentSessionId !== event.report.parentSessionId
        || report.childSessionId !== event.report.childSessionId
        || report.reportDigest !== event.report.reportDigest
      ) throw new LedgerIntegrityError('learning analysis report delivery disagrees with history')
      this.#assertLearningAnalysisTimestamp(status!, event.at)
      return
    }
    if (event.type === 'learning-analysis-terminal-report-intent-recorded') {
      const status = this.#learningAnalyses.get(event.report.analysisId)
      const existing = status?.terminalReportDelivery
      const firstReport = existing === undefined
      const rollbackReport = existing !== undefined
        && (status?.phase === 'rolled-back'
          || (status?.phase === 'transition-recovered'
            && status.promotionTransitionId !== undefined))
        && (status.terminalReportHistory?.length ?? 0) === 0
        && !sameLearningAnalysisReportBinding(existing, event.report)
      if (status?.submission === undefined || (!firstReport && !rollbackReport)
        || status.parentSessionId !== event.report.parentSessionId || status.childSessionId !== event.report.childSessionId) {
        throw new LedgerIntegrityError('learning analysis terminal report intent disagrees with history')
      }
      this.#assertLearningAnalysisTimestamp(status, event.at)
      return
    }
    if (event.type === 'learning-analysis-terminal-report-delivered') {
      const status = this.#learningAnalyses.get(event.report.analysisId)
      const report = status?.terminalReportDelivery
      if (report?.state !== 'pending' || !sameLearningAnalysisReportBinding(report, event.report)) {
        throw new LedgerIntegrityError('learning analysis terminal report delivery disagrees with history')
      }
      this.#assertLearningAnalysisTimestamp(status!, event.at)
      return
    }
    if (event.type === 'learning-analysis-consent-recorded') {
      if (this.#learningAnalysisConsents.has(event.consent.revision)) {
        throw new LedgerIntegrityError(
          `duplicate learning analysis consent revision: ${event.consent.revision}`,
        )
      }
      if (
        event.consent.revision
          !== (this.#learningAnalysisConsent?.revision ?? 0) + 1
      ) {
        throw new LedgerIntegrityError(
          'learning analysis consent revision must increment by one',
        )
      }
      return
    }
    if (event.type === 'learning-consent-notice-intent-recorded') {
      if (this.#learningConsentNotices.has(event.notice.policyVersion)) {
        throw new LedgerIntegrityError('duplicate learning consent notice intent')
      }
      return
    }
    if (event.type === 'learning-consent-notice-delivered') {
      const status = this.#learningConsentNotices.get(event.notice.policyVersion)
      if (status === undefined || status.state !== 'pending') {
        throw new LedgerIntegrityError('learning consent notice delivery disagrees with history')
      }
      const { state: _state, intentRecordedAt: _intentAt, ...binding } = status
      if (canonicalJson(binding) !== canonicalJson(event.notice)) {
        throw new LedgerIntegrityError('learning consent notice delivery changed')
      }
      return
    }
    if (event.type === 'artifact-recorded') {
      if (this.#artifacts.has(event.artifact.artifactId)) {
        throw new LedgerIntegrityError(
          `duplicate Artifact event: ${event.artifact.artifactId}`,
        )
      }
      if (
        event.artifact.parentArtifactId !== undefined &&
        !this.#artifacts.has(event.artifact.parentArtifactId)
      ) {
        throw new LedgerIntegrityError(
          `Artifact parent is not recorded: ${event.artifact.parentArtifactId}`,
        )
      }
      return
    }
    const artifactId = event.type === 'evaluation-recorded'
      ? event.evaluation.artifactId
      : event.type === 'approval-recorded'
        ? event.approval.artifactId
        : event.artifactId
    if (!this.#artifacts.has(artifactId)) {
      throw new LedgerIntegrityError(
        `event references unknown Artifact: ${artifactId}`,
      )
    }
    if (event.type === 'evaluation-recorded' || event.type === 'runtime-bound') {
      return
    }
    if (event.type === 'approval-recorded') {
      if (this.#approvalIds.has(event.approval.approvalId)) {
        throw new LedgerIntegrityError(
          `duplicate approvalId: ${event.approval.approvalId}`,
        )
      }
      return
    }
    if (event.type === 'promoted' || event.type === 'rolled-back') {
      const expectedRevision = (this.#champion?.revision ?? 0) + 1
      if (event.revision !== expectedRevision) {
        throw new LedgerIntegrityError(
          `Champion revision must be ${expectedRevision}`,
        )
      }
      if (this.#champion?.artifactId === event.artifactId) {
        throw new LedgerIntegrityError('Champion transition is a no-op')
      }
      if (
        event.type === 'promoted' &&
        this.#promoted.has(event.artifactId)
      ) {
        throw new LedgerIntegrityError(
          'previously promoted Artifact must use rollback',
        )
      }
      if (
        event.type === 'rolled-back' &&
        (this.#champion === undefined || !this.#promoted.has(event.artifactId))
      ) {
        throw new LedgerIntegrityError('rollback target was never Champion')
      }
      this.#validateAuthority(
        event.artifactId,
        event.receiptDigest,
        event.approvalId,
      )
      return
    }
    if (event.type === 'activation-failed') {
      if (event.approvalId !== undefined && event.receiptDigest !== undefined) {
        this.#validateAuthority(
          event.artifactId,
          event.receiptDigest,
          event.approvalId,
        )
      }
      return
    }
    if (event.type !== 'recovery-failed') {
      throw new LedgerIntegrityError(
        `unhandled ledger event type: ${event.type}`,
      )
    }
    if (!this.#artifacts.has(event.previousArtifactId)) {
      throw new LedgerIntegrityError(
        `recovery references unknown Champion: ${event.previousArtifactId}`,
      )
    }
  }

  #validateAuthority(
    artifactId: ArtifactId,
    receiptDigest: Sha256Digest,
    approvalId: string,
  ): void {
    const evaluation = this.#evaluations.get(artifactId)
    if (
      evaluation?.verdict !== 'met' ||
      evaluation.receiptDigest !== receiptDigest
    ) {
      throw new LedgerIntegrityError(
        `transition lacks matching met evaluation: ${artifactId}`,
      )
    }
    const approval = this.#approvals.get(artifactId)
      ?.find(record => record.approvalId === approvalId)
    if (approval === undefined || this.#usedApprovals.has(approvalId)) {
      throw new LedgerIntegrityError(
        `transition lacks unused human approval: ${artifactId}`,
      )
    }
  }

  #apply(event: LedgerEvent): void {
    this.#events.push(event)
    if (event.type === 'run-binding-recorded') {
      this.#runBindings.set(event.binding.runId, event.binding)
      this.#runIdBySession.set(event.binding.sessionId, event.binding.runId)
      this.#runBindingRecordedAt.set(event.binding.runId, event.at)
      return
    }
    if (event.type === 'initial-run-skill-binding-recorded') {
      this.#runBindings.set(event.binding.runId, event.binding)
      this.#runIdBySession.set(event.binding.sessionId, event.binding.runId)
      this.#runBindingRecordedAt.set(event.binding.runId, event.at)
      this.#runSkillManifests.set(event.manifest.runId, event.manifest)
      return
    }
    if (event.type === 'run-skill-manifest-recorded') {
      this.#runSkillManifests.set(event.manifest.runId, event.manifest)
      return
    }
    if (event.type === 'run-skill-use-recorded') {
      this.#runSkillUses.set(event.use.runId, event.use)
      return
    }
    if (event.type === 'controlled-skill-eval-protocol-frozen') {
      this.#controlledSkillEvalProtocols.set(event.protocol.protocolId, event.protocol)
      const ids = this.#controlledSkillEvalProtocolIdsByTicket.get(event.protocol.ticketId)
        ?? []
      ids.push(event.protocol.protocolId)
      this.#controlledSkillEvalProtocolIdsByTicket.set(event.protocol.ticketId, ids)
      return
    }
    if (event.type === 'controlled-skill-evaluation-opened') {
      this.#controlledSkillEvaluationPlans.set(event.plan.evaluationId, event.plan)
      return
    }
    if (event.type === 'controlled-skill-evaluation-objective-recorded') {
      const objectives = this.#controlledSkillEvaluationObjectives
        .get(event.objective.evaluationId) ?? new Map()
      objectives.set(event.objective.taskId, event.objective)
      this.#controlledSkillEvaluationObjectives.set(event.objective.evaluationId, objectives)
      return
    }
    if (event.type === 'controlled-skill-evaluation-blind-map-frozen') {
      this.#controlledSkillEvaluationBlindMaps.set(
        event.blindMap.evaluationId,
        event.blindMap,
      )
      return
    }
    if (event.type === 'controlled-skill-evaluator-observation-recorded') {
      const observations = this.#controlledSkillEvaluatorObservations
        .get(event.observation.evaluationId) ?? new Map()
      observations.set(event.observation.taskId, event.observation)
      this.#controlledSkillEvaluatorObservations.set(
        event.observation.evaluationId,
        observations,
      )
      return
    }
    if (event.type === 'controlled-skill-evaluation-result-recorded') {
      this.#controlledSkillEvaluationResults.set(event.result.evaluationId, event.result)
      return
    }
    if (event.type === 'controlled-skill-shadow-opened') {
      this.#controlledSkillShadowPlans.set(event.plan.shadowId, event.plan)
      this.#controlledSkillShadowIdByEvaluation.set(
        event.plan.evaluationId,
        event.plan.shadowId,
      )
      return
    }
    if (event.type === 'controlled-skill-shadow-result-recorded') {
      this.#controlledSkillShadowResults.set(event.result.shadowId, event.result)
      return
    }
    if (event.type === 'controlled-skill-pointer-initialized') {
      const initialization = event.initialization
      this.#controlledSkillPointerInitializations.set(
        initialization.shadowId,
        initialization,
      )
      this.#controlledSkillPointerInitializationByScope.set(
        initialization.pointer.scopeKey,
        initialization,
      )
      this.#controlledSkillScopePointers.set(
        initialization.pointer.scopeKey,
        initialization.pointer,
      )
      return
    }
    if (
      event.type === 'controlled-skill-promoted'
      || event.type === 'controlled-skill-rolled-back'
      || event.type === 'controlled-skill-restored'
    ) {
      const transition = event.transition
      this.#controlledSkillTransitions.set(transition.transitionId, transition)
      this.#controlledSkillTransitionIdsByLogicalKey.set(
        `${transition.shadowId}:${transition.kind}:${transition.previousPointer.revision}`,
        transition.transitionId,
      )
      const ids = this.#controlledSkillTransitionIdsByShadow.get(transition.shadowId) ?? []
      ids.push(transition.transitionId)
      this.#controlledSkillTransitionIdsByShadow.set(transition.shadowId, ids)
      this.#controlledSkillScopePointers.set(
        transition.targetPointer.scopeKey,
        transition.targetPointer,
      )
      this.#runIdBySession.set(
        transition.runBinding.sessionId,
        transition.runBinding.runId,
      )
      return
    }
    if (event.type === 'controlled-skill-transition-verified') {
      this.#controlledSkillTransitionVerifications.set(
        event.verification.transitionId,
        event.verification,
      )
      return
    }
    if (event.type === 'controlled-skill-activation-failed') {
      this.#controlledSkillActivationFailures.set(
        event.failure.transitionId,
        event.failure,
      )
      this.#controlledSkillScopePointers.set(
        event.failure.recoveredPointer.scopeKey,
        event.failure.recoveredPointer,
      )
      return
    }
    if (event.type === 'skill-eval-protocol-frozen') {
      this.#skillEvalProtocols.set(event.protocol.protocolId, event.protocol)
      const ids = this.#skillEvalProtocolIdsByTicket.get(event.protocol.ticketId)
        ?? []
      ids.push(event.protocol.protocolId)
      this.#skillEvalProtocolIdsByTicket.set(event.protocol.ticketId, ids)
      return
    }
    if (event.type === 'skill-evaluation-opened') {
      this.#skillEvaluationPlans.set(event.plan.evaluationId, event.plan)
      return
    }
    if (event.type === 'skill-evaluation-result-recorded') {
      this.#skillEvaluationResults.set(event.result.evaluationId, event.result)
      return
    }
    if (event.type === 'learning-case-opened') {
      this.#learningCases.set(event.case.caseId, event.case)
      this.#caseIdByTicket.set(event.case.ticketId, event.case.caseId)
      return
    }
    if (event.type === 'learning-attribution-recorded') {
      this.#attributions.set(event.attribution.attributionId, event.attribution)
      this.#attributionIdByCase.set(
        event.attribution.caseId,
        event.attribution.attributionId,
      )
      return
    }
    if (event.type === 'learning-lesson-recorded') {
      this.#acceptedLessons.set(event.lesson.lessonId, event.lesson)
      this.#lessonIdByAttribution.set(
        event.lesson.attributionId,
        event.lesson.lessonId,
      )
      return
    }
    if (event.type === 'learning-candidate-recorded') {
      this.#skillCandidates.set(event.candidate.candidateId, event.candidate)
      this.#candidateIdByCase.set(
        event.candidate.caseId,
        event.candidate.candidateId,
      )
      return
    }
    if (event.type === 'outcome-intake-recorded') {
      this.#outcomeIntakes.set(event.receipt.ingestionId, event)
      if (event.signal === undefined) {
        return
      }
      this.#learningSignals.set(event.signal.signalId, event.signal)
      if (event.receipt.decision === 'signal-recorded') {
        return
      }
      const ticketId = event.receipt.ticketId!
      const ticket = this.#learningTickets.get(ticketId)
      if (event.receipt.decision === 'ticket-created') {
        const signalIds = [...this.#learningSignals.values()]
          .filter(isOutcomeSignal)
          .filter(signal =>
            signal.problemFingerprint === event.signal!.problemFingerprint)
          .map(signal => signal.signalId)
        this.#learningTickets.set(ticketId, {
          ticketId,
          problemFingerprint: event.signal.problemFingerprint,
          status: 'open',
          signalIds,
        })
        this.#refreshLearningTicket(ticketId)
        return
      }
      this.#learningTickets.set(ticketId, {
        ...ticket!,
        signalIds: [...ticket!.signalIds, event.signal.signalId],
      })
      this.#refreshLearningTicket(ticketId)
      return
    }
    if (event.type === 'learning-intake-recorded') {
      const previous = this.#learningIntakeStatuses
        .get(event.input.sessionId)
        ?.get(event.input.messageId)
      if (previous?.state === 'active' && previous.signalId !== undefined) {
        this.#inactiveLearningSignals.add(previous.signalId)
      }
      this.#learningIntakes.set(event.receipt.ingestionId, event)
      let statuses = this.#learningIntakeStatuses.get(event.input.sessionId)
      if (statuses === undefined) {
        statuses = new Map()
        this.#learningIntakeStatuses.set(event.input.sessionId, statuses)
      }
      statuses.set(event.input.messageId, {
        state: 'active',
        sessionId: event.input.sessionId,
        messageId: event.input.messageId,
        feedbackVersion: event.input.feedbackVersion,
        scopeKey: event.input.scopeKey,
        rating: event.input.rating,
        feedbackFingerprint: learningFeedbackFingerprint(
          event.input.rating,
          event.input.note,
        ),
        ...(event.schemaVersion === 'tianwen.learning-intake.v2'
          && event.sessionLifecycleFingerprint !== undefined
          ? {
              sessionLifecycleFingerprint:
                event.sessionLifecycleFingerprint,
            }
          : {}),
        ...(event.schemaVersion === 'tianwen.learning-intake.v2'
          && event.analysisConsentRevision !== undefined
          ? { analysisConsentRevision: event.analysisConsentRevision }
          : {}),
        recordedAt: event.at,
        ...event.receipt,
      })
      if (event.signal === undefined) {
        this.#refreshLearningTicket(previous?.ticketId)
        return
      }
      this.#learningSignals.set(event.signal.signalId, event.signal)
      this.#inactiveLearningSignals.delete(event.signal.signalId)
      const ticketId = event.receipt.ticketId!
      const ticket = this.#learningTickets.get(ticketId)
      this.#learningTickets.set(ticketId, ticket === undefined
        ? {
            ticketId,
            problemFingerprint: event.signal.problemFingerprint,
            status: 'open',
            signalIds: [event.signal.signalId],
          }
        : {
            ...ticket,
            signalIds: [...ticket.signalIds, event.signal.signalId],
          })
      this.#refreshLearningTicket(previous?.ticketId)
      this.#refreshLearningTicket(ticketId)
      return
    }
    if (event.type === 'learning-feedback-retracted') {
      this.#learningRetractions.set(learningRetractionKey(event), event)
      const statuses = this.#learningIntakeStatuses.get(event.sessionId)!
      const current = statuses.get(event.messageId)!
      statuses.set(event.messageId, { ...current, state: 'retracted' })
      if (current.signalId !== undefined) {
        this.#inactiveLearningSignals.add(current.signalId)
      }
      this.#refreshLearningTicket(current.ticketId)
      return
    }
    if (event.type === 'learning-analysis-requested') {
      const status: LearningAnalysisStatus = {
        ...event.binding,
        requestedAt: event.at,
        updatedAt: event.at,
      }
      this.#learningAnalyses.set(status.analysisId, status)
      this.#learningAnalysisIdByChildSession.set(
        status.childSessionId,
        status.analysisId,
      )
      return
    }
    if (event.type === 'learning-analysis-child-started') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: 'running',
        childStartedAt: event.at,
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-submitted') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: learningAnalysisSubmissionPhase(event.submission),
        submittedAt: event.at,
        submissionDigest: event.submissionDigest,
        submission: event.submission,
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-invalidated') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: 'invalidated',
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-candidate-ready') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: 'candidate-ready',
        candidateId: event.candidateId,
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-protocol-unavailable') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: 'protocol-unavailable',
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-governed-outcome-recorded') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      const outcome = event.outcome
      this.#learningAnalyses.set(event.analysisId, outcome.phase === 'candidate-rejected'
        || outcome.phase === 'shadow-ready'
        ? { ...status, ...outcome, updatedAt: event.at }
        : outcome.phase === 'promoted'
          ? {
              ...status,
              phase: outcome.phase,
              promotionTransitionId: outcome.transitionId,
              promotionTransitionReceiptDigest: outcome.transitionReceiptDigest,
              updatedAt: event.at,
            }
          : outcome.phase === 'rolled-back'
            ? {
              ...status,
              phase: outcome.phase,
              rollbackTransitionId: outcome.transitionId,
              rollbackTransitionReceiptDigest: outcome.transitionReceiptDigest,
              updatedAt: event.at,
            }
            : {
                ...status,
                phase: outcome.phase,
                recoveredTransitionId: outcome.transitionId,
                recoveredTransitionReceiptDigest: outcome.transitionReceiptDigest,
                updatedAt: event.at,
              })
      return
    }
    if (event.type === 'learning-analysis-failed') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      this.#learningAnalyses.set(event.analysisId, {
        ...status,
        phase: 'failed',
        resumePhase: event.resumePhase,
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-resumed') {
      const status = this.#learningAnalyses.get(event.analysisId)!
      const { resumePhase: _resumePhase, ...rest } = status
      this.#learningAnalyses.set(event.analysisId, {
        ...rest,
        phase: event.resumePhase,
        resumedAt: event.at,
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-report-intent-recorded') {
      const status = this.#learningAnalyses.get(event.report.analysisId)!
      this.#learningAnalyses.set(event.report.analysisId, {
        ...status,
        reportDelivery: {
          ...event.report,
          state: 'pending',
          intentRecordedAt: event.at,
        },
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-report-delivered') {
      const status = this.#learningAnalyses.get(event.report.analysisId)!
      const delivery = status.reportDelivery!
      this.#learningAnalyses.set(event.report.analysisId, {
        ...status,
        reportDelivery: {
          ...delivery,
          state: 'delivered',
          deliveredAt: event.at,
          reportMessageId: event.report.reportMessageId,
        },
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-terminal-report-intent-recorded') {
      const status = this.#learningAnalyses.get(event.report.analysisId)!
      const existing = status.terminalReportDelivery
      this.#learningAnalyses.set(event.report.analysisId, {
        ...status,
        ...(existing === undefined ? {} : {
          terminalReportHistory: [...(status.terminalReportHistory ?? []), existing],
        }),
        terminalReportDelivery: { ...event.report, state: 'pending', intentRecordedAt: event.at },
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-terminal-report-delivered') {
      const status = this.#learningAnalyses.get(event.report.analysisId)!
      const delivery = status.terminalReportDelivery!
      this.#learningAnalyses.set(event.report.analysisId, {
        ...status,
        terminalReportDelivery: { ...delivery, state: 'delivered', deliveredAt: event.at, reportMessageId: event.report.reportMessageId },
        updatedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-analysis-consent-recorded') {
      this.#learningAnalysisConsents.set(
        event.consent.revision,
        event.consent,
      )
      this.#learningAnalysisConsent = event.consent
      return
    }
    if (event.type === 'learning-consent-notice-intent-recorded') {
      this.#learningConsentNotices.set(event.notice.policyVersion, {
        ...event.notice,
        state: 'pending',
        intentRecordedAt: event.at,
      })
      return
    }
    if (event.type === 'learning-consent-notice-delivered') {
      const intent = this.#learningConsentNotices.get(event.notice.policyVersion)!
      this.#learningConsentNotices.set(event.notice.policyVersion, {
        ...event.notice,
        state: 'delivered',
        intentRecordedAt: intent.intentRecordedAt,
        deliveredAt: event.at,
      })
      return
    }
    if (event.type === 'artifact-recorded') {
      this.#artifacts.set(event.artifact.artifactId, event.artifact)
      return
    }
    if (event.type === 'evaluation-recorded') {
      this.#evaluations.set(event.evaluation.artifactId, event.evaluation)
      return
    }
    if (event.type === 'approval-recorded') {
      const records = this.#approvals.get(event.approval.artifactId) ?? []
      records.push(event.approval)
      this.#approvals.set(event.approval.artifactId, records)
      this.#approvalIds.add(event.approval.approvalId)
      return
    }
    if (event.type === 'promoted' || event.type === 'rolled-back') {
      this.#usedApprovals.add(event.approvalId)
      this.#promoted.add(event.artifactId)
      this.#champion = {
        artifactId: event.artifactId,
        revision: event.revision,
      }
      return
    }
    if (
      event.type === 'activation-failed' &&
      event.approvalId !== undefined
    ) {
      this.#usedApprovals.add(event.approvalId)
    }
  }

  #replay(): void {
    if (!existsSync(this.#ledgerPath)) {
      return
    }
    let serialized: string
    try {
      serialized = UTF8.decode(readFileSync(this.#ledgerPath))
    } catch (error) {
      throw new LedgerIntegrityError('ledger.jsonl is not valid UTF-8', {
        cause: error,
      })
    }
    if (serialized.length === 0) {
      return
    }
    if (!serialized.endsWith('\n') || serialized.includes('\r')) {
      throw new LedgerIntegrityError(
        'ledger.jsonl must use one canonical JSON object plus LF per event',
      )
    }
    for (const line of serialized.slice(0, -1).split('\n')) {
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch (error) {
        throw new LedgerIntegrityError('ledger.jsonl contains invalid JSON', {
          cause: error,
        })
      }
      if (JSON.stringify(value) !== line) {
        throw new LedgerIntegrityError('ledger event is not canonical JSON')
      }
      const event = parseEvent(value)
      this.#validateAgainstState(event)
      this.#apply(event)
    }
  }

  #verifyPointer(repair: boolean): void {
    if (this.#champion === undefined) {
      if (existsSync(this.#pointerPath)) {
        throw new LedgerIntegrityError(
          'champion.json exists without a ledger Champion',
        )
      }
      return
    }
    if (!existsSync(this.#pointerPath)) {
      if (repair && this.#champion.revision === 1) {
        this.#writePointer(this.#champion)
        return
      }
      throw new LedgerIntegrityError(
        'champion.json is missing for the ledger Champion',
      )
    }
    let serialized: string
    let value: unknown
    try {
      serialized = UTF8.decode(readFileSync(this.#pointerPath))
      value = JSON.parse(serialized)
    } catch (error) {
      throw new LedgerIntegrityError('champion.json is invalid', {
        cause: error,
      })
    }
    if (serialized !== canonicalLine(value) || !isRecord(value)) {
      throw new LedgerIntegrityError('champion.json is not canonical JSON')
    }
    exactKeys(value, ['artifactId', 'revision'])
    const pointer: ChampionPointer = {
      artifactId: requireArtifactId(value.artifactId),
      revision: requireRevision(value.revision),
    }
    if (
      pointer.artifactId !== this.#champion.artifactId ||
      pointer.revision !== this.#champion.revision
    ) {
      const previous = this.#previousChampion()
      if (
        repair &&
        previous !== undefined &&
        pointer.artifactId === previous.artifactId &&
        pointer.revision === previous.revision &&
        this.#champion.revision === previous.revision + 1
      ) {
        this.#writePointer(this.#champion)
        return
      }
      throw new LedgerIntegrityError(
        'champion.json disagrees with ledger replay',
      )
    }
  }

  #previousChampion(): ChampionPointer | undefined {
    const transitions = this.#events.filter(
      (event): event is TransitionEvent =>
        event.type === 'promoted' || event.type === 'rolled-back',
    )
    const previous = transitions.at(-2)
    if (previous === undefined) {
      return undefined
    }
    return {
      artifactId: previous.artifactId,
      revision: previous.revision,
    }
  }

  #writePointer(pointer: ChampionPointer): void {
    const temporary = join(
      this.#root,
      `.champion-${randomUUID()}.tmp`,
    )
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporary, 'wx')
      writeAllSync(descriptor, canonicalLine(pointer))
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
      renameSync(temporary, this.#pointerPath)
    } finally {
      if (descriptor !== undefined) {
        closeSync(descriptor)
      }
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
}

export function inspectEvolutionChampion(
  root: string,
): ChampionPointer | undefined {
  return new EvolutionLedger(root, {}, 'inspection').getChampion()
}
