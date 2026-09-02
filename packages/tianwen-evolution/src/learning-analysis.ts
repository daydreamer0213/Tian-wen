import { Buffer } from 'node:buffer'

import { sha256 } from './learning-intake.js'
import type { LearningTicketId } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'

export type LearningAnalysisId = `analysis:${string}`

export type LearningAnalysisPhase =
  | 'pending-parent'
  | 'running'
  | 'no-case'
  | 'insufficient-evidence'
  | 'candidate-ready'
  | 'protocol-unavailable'
  | 'candidate-rejected'
  | 'shadow-ready'
  | 'promoted'
  | 'rolled-back'
  | 'invalidated'
  | 'failed'

export interface LearningAnalysisBinding {
  readonly analysisId: LearningAnalysisId
  readonly ticketId: LearningTicketId
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly consentRevision: number
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly phase: LearningAnalysisPhase
}

export interface LearningAnalysisSubmission {
  readonly verdict: 'no-case' | 'insufficient-evidence' | 'skill-change'
  readonly hypothesis: string
  readonly lesson?: {
    readonly claim: string
    readonly when: string
    readonly notWhen: string
  }
  readonly candidatePatch?: {
    readonly description: string
    readonly whenToUse: string
    readonly content: string
  }
  readonly supportingEvidenceIds: readonly Sha256Digest[]
  readonly counterevidenceIds: readonly Sha256Digest[]
}

export interface LearningAnalysisEvidenceSignal {
  readonly sessionId: string
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
  readonly source: 'explicit-correction' | 'outcome'
  readonly active: boolean
}

export interface RequestLearningAnalysisInput {
  readonly ticketId: LearningTicketId
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly consentRevision: number
  readonly parentSessionId: string
}

export interface LearningAnalysisStatus extends LearningAnalysisBinding {
  readonly requestedAt: string
  readonly updatedAt: string
  readonly childStartedAt?: string
  readonly submittedAt?: string
  readonly submissionDigest?: Sha256Digest
  readonly submission?: LearningAnalysisSubmission
  readonly reportDelivery?: LearningAnalysisReportDelivery
}

export type LearningAnalysisReceipt = LearningAnalysisStatus & {
  readonly duplicate: boolean
}

export interface LearningAnalysisRequestedEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-request.v1'
  readonly type: 'learning-analysis-requested'
  readonly at: string
  readonly binding: LearningAnalysisBinding & { readonly phase: 'pending-parent' }
}

export interface LearningAnalysisChildStartedEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-child.v1'
  readonly type: 'learning-analysis-child-started'
  readonly at: string
  readonly analysisId: LearningAnalysisId
  readonly parentSessionId: string
  readonly childSessionId: string
}

export interface LearningAnalysisSubmittedEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-submission.v1'
  readonly type: 'learning-analysis-submitted'
  readonly at: string
  readonly analysisId: LearningAnalysisId
  readonly childSessionId: string
  readonly submission: LearningAnalysisSubmission
  readonly submissionDigest: Sha256Digest
}

export interface LearningAnalysisInvalidatedEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-invalidation.v1'
  readonly type: 'learning-analysis-invalidated'
  readonly at: string
  readonly analysisId: LearningAnalysisId
  readonly reason: 'support-withdrawn'
}

export interface LearningAnalysisReportBinding {
  readonly analysisId: LearningAnalysisId
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly reportDigest: Sha256Digest
}

export type LearningAnalysisReportDelivery = LearningAnalysisReportBinding & (
  | { readonly state: 'pending'; readonly intentRecordedAt: string }
  | {
      readonly state: 'delivered'
      readonly intentRecordedAt: string
      readonly deliveredAt: string
      readonly reportMessageId: string
    }
)

export interface LearningAnalysisReportIntentRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-report-intent.v1'
  readonly type: 'learning-analysis-report-intent-recorded'
  readonly at: string
  readonly report: LearningAnalysisReportBinding
}

export interface LearningAnalysisReportDeliveredEvent {
  readonly schemaVersion: 'tianwen.learning-analysis-report-delivered.v1'
  readonly type: 'learning-analysis-report-delivered'
  readonly at: string
  readonly report: LearningAnalysisReportBinding & { readonly reportMessageId: string }
}

export type LearningAnalysisLedgerEvent =
  | LearningAnalysisRequestedEvent
  | LearningAnalysisChildStartedEvent
  | LearningAnalysisSubmittedEvent
  | LearningAnalysisInvalidatedEvent
  | LearningAnalysisReportIntentRecordedEvent
  | LearningAnalysisReportDeliveredEvent

const ANALYSIS_ID = /^analysis:[a-f0-9]{64}$/
const TICKET_ID = /^ticket:[a-f0-9]{64}$/
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const MAX_TEXT_BYTES = 16 * 1024
const MAX_PATCH_BYTES = 32 * 1024

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
    required.some(key => !(key in value))
    || keys.some(key => !allowed.has(key))
  ) throw new TypeError('learning analysis value has an invalid shape')
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function safeText(value: unknown, label: string): string {
  const text = nonEmpty(value, label)
  if (
    text.trim().length === 0
    || text.includes('\0')
    || !text.isWellFormed()
    || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES
  ) throw new TypeError(`${label} must be bounded well-formed UTF-8 text`)
  return text
}

function digest(value: unknown, label: string): Sha256Digest {
  const result = nonEmpty(value, label)
  if (!SHA256_DIGEST.test(result)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return result as Sha256Digest
}

function evidenceList(value: unknown, label: string): readonly Sha256Digest[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  const result = value.map((item, index) => digest(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${label} must not contain duplicates`)
  }
  return result
}

function ticketId(value: unknown): LearningTicketId {
  const result = nonEmpty(value, 'ticketId')
  if (!TICKET_ID.test(result)) throw new TypeError('invalid LearningTicketId')
  return result as LearningTicketId
}

export function learningAnalysisId(value: unknown): LearningAnalysisId {
  const result = nonEmpty(value, 'analysisId')
  if (!ANALYSIS_ID.test(result)) throw new TypeError('invalid LearningAnalysisId')
  return result as LearningAnalysisId
}

export function prepareLearningAnalysisRequest(
  input: RequestLearningAnalysisInput,
): LearningAnalysisBinding & { readonly phase: 'pending-parent' } {
  const parsed = {
    ticketId: ticketId(input.ticketId),
    sessionId: nonEmpty(input.sessionId, 'sessionId'),
    messageId: nonEmpty(input.messageId, 'messageId'),
    feedbackVersion: nonEmpty(input.feedbackVersion, 'feedbackVersion'),
    parentSessionId: nonEmpty(input.parentSessionId, 'parentSessionId'),
  }
  if (!Number.isSafeInteger(input.consentRevision) || input.consentRevision < 1) {
    throw new TypeError('consentRevision must be a positive safe integer')
  }
  if (parsed.parentSessionId !== parsed.sessionId) {
    throw new TypeError('analysis parent must be the feedback main Session')
  }
  const identity = sha256({
    ticketId: parsed.ticketId,
    feedbackVersion: parsed.feedbackVersion,
    kind: 'tianwen.learning-analysis.v1',
  }).slice('sha256:'.length)
  return {
    analysisId: `analysis:${identity}`,
    ...parsed,
    consentRevision: input.consentRevision,
    childSessionId: `tianwen-analysis-${identity}`,
    phase: 'pending-parent',
  }
}

function parseLesson(value: unknown): NonNullable<LearningAnalysisSubmission['lesson']> {
  if (!isRecord(value)) throw new TypeError('lesson must be an object')
  exactKeys(value, ['claim', 'when', 'notWhen'])
  return {
    claim: safeText(value.claim, 'lesson.claim'),
    when: safeText(value.when, 'lesson.when'),
    notWhen: safeText(value.notWhen, 'lesson.notWhen'),
  }
}

function parseCandidatePatch(
  value: unknown,
): NonNullable<LearningAnalysisSubmission['candidatePatch']> {
  if (!isRecord(value)) throw new TypeError('candidatePatch must be an object')
  exactKeys(value, ['description', 'whenToUse', 'content'])
  const result = {
    description: safeText(value.description, 'candidatePatch.description'),
    whenToUse: safeText(value.whenToUse, 'candidatePatch.whenToUse'),
    content: safeText(value.content, 'candidatePatch.content'),
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PATCH_BYTES) {
    throw new TypeError('candidatePatch exceeds its UTF-8 limit')
  }
  return result
}

export function parseLearningAnalysisSubmission(
  value: unknown,
): LearningAnalysisSubmission {
  if (!isRecord(value)) throw new TypeError('submission must be an object')
  exactKeys(
    value,
    [
      'verdict',
      'hypothesis',
      'supportingEvidenceIds',
      'counterevidenceIds',
    ],
    ['lesson', 'candidatePatch'],
  )
  if (
    value.verdict !== 'no-case'
    && value.verdict !== 'insufficient-evidence'
    && value.verdict !== 'skill-change'
  ) throw new TypeError('invalid learning analysis verdict')
  const supportingEvidenceIds = evidenceList(
    value.supportingEvidenceIds,
    'supportingEvidenceIds',
  )
  const counterevidenceIds = evidenceList(
    value.counterevidenceIds,
    'counterevidenceIds',
  )
  if (supportingEvidenceIds.some(id => counterevidenceIds.includes(id))) {
    throw new TypeError('supporting Evidence and counterevidence must be disjoint')
  }
  const lesson = value.lesson === undefined ? undefined : parseLesson(value.lesson)
  const candidatePatch = value.candidatePatch === undefined
    ? undefined
    : parseCandidatePatch(value.candidatePatch)
  if (
    value.verdict === 'skill-change'
      ? lesson === undefined
        || candidatePatch === undefined
        || supportingEvidenceIds.length === 0
      : lesson !== undefined || candidatePatch !== undefined
  ) throw new TypeError('learning analysis fields disagree with its verdict')
  return {
    verdict: value.verdict,
    hypothesis: safeText(value.hypothesis, 'hypothesis'),
    ...(lesson === undefined ? {} : { lesson }),
    ...(candidatePatch === undefined ? {} : { candidatePatch }),
    supportingEvidenceIds,
    counterevidenceIds,
  }
}

export function assertLearningAnalysisEvidenceClosure(
  submission: LearningAnalysisSubmission,
  allowedEvidenceIds: ReadonlySet<Sha256Digest>,
): void {
  if (
    [...submission.supportingEvidenceIds, ...submission.counterevidenceIds]
      .some(id => !allowedEvidenceIds.has(id))
  ) throw new TypeError('learning analysis Evidence closure was exceeded')
}

export function learningAnalysisEvidenceClosure(
  sessionId: string,
  signals: readonly LearningAnalysisEvidenceSignal[],
): ReadonlySet<Sha256Digest> {
  const evidenceIds = new Set<Sha256Digest>()
  for (const signal of signals) {
    if (
      signal.source !== 'explicit-correction'
      || !signal.active
      || signal.sessionId !== sessionId
    ) continue
    for (const evidenceId of signal.evidenceIds) {
      if (evidenceId === signal.sessionDigest) continue
      evidenceIds.add(evidenceId)
    }
  }
  return evidenceIds
}

export function learningAnalysisSubmissionPhase(
  submission: LearningAnalysisSubmission,
): 'running' | 'no-case' | 'insufficient-evidence' {
  return submission.verdict === 'skill-change' ? 'running' : submission.verdict
}
