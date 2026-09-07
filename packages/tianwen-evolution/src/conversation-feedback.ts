import { sha256 } from './learning-intake.js'
import { CONVERSATION_FAILURES, type ConversationFailure, type ConversationJudgmentProof, type ConversationTask, type ConversationUnavailable } from './conversation-learning.js'
import type { Sha256Digest } from './ledger.js'

export type ConversationFeedbackSource = {
  readonly kind: 'native'
  readonly sessionId: string
  readonly sessionLifecycleFingerprint: Sha256Digest
  readonly messageId: string
  readonly feedbackVersion: string
  readonly feedbackFingerprint: Sha256Digest
} | {
  readonly kind: 'natural'
  readonly sourceTaskId: string
  readonly sourceAdmissionDigest: Sha256Digest
}
export interface ConversationFeedbackStarted {
  readonly kind: 'feedback-assessment-started'
  readonly assessmentId: string
  readonly taskId: string
  readonly admissionDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly source: ConversationFeedbackSource
  readonly materialDigest: Sha256Digest
  readonly consentRevision: number
}
export interface ConversationFeedbackResult {
  readonly kind: 'feedback-assessed'
  readonly assessmentId: string
  readonly taskId: string
  readonly classification: 'attributable-problem' | 'positive' | 'requirement-change' | 'preference' | 'inconclusive'
  readonly category: ConversationFailure | null
  /** Frozen after feedback and before a candidate; never replaces original criteria. */
  readonly supplementalCriteria: readonly string[]
  readonly explanation: string
  readonly evidenceQuotes: readonly string[]
  readonly proof: ConversationJudgmentProof | null
  readonly unavailableReason: ConversationUnavailable | null
}
export type ConversationFeedbackRecord = ConversationFeedbackStarted | ConversationFeedbackResult
export interface ConversationFeedbackAssessment {
  readonly started: ConversationFeedbackStarted
  readonly startedAt: string
  readonly result?: ConversationFeedbackResult
  readonly resultAt?: string
}

export function conversationFeedbackAssessmentId(input: Pick<ConversationFeedbackStarted, 'taskId' | 'source'>): string {
  return `feedback-assessment:${sha256({ taskId: input.taskId, source: input.source }).slice(7)}`
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('feedback assessment fields are invalid')
  return value as Record<string, unknown>
}
function text(value: unknown, limit = 4096): string {
  if (typeof value !== 'string' || value.trim() === '' || Buffer.byteLength(value, 'utf8') > limit) throw new TypeError('feedback assessment text is invalid')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('feedback assessment digest is invalid')
  return value as Sha256Digest
}
function oneOf<const T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new TypeError('feedback assessment decision is invalid')
  return value as T
}
function texts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12) throw new TypeError('feedback assessment list is invalid')
  return value.map(item => text(item, 2048))
}
function source(value: unknown): ConversationFeedbackSource {
  if (value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'native') {
    const input = object(value, ['kind', 'sessionId', 'sessionLifecycleFingerprint', 'messageId', 'feedbackVersion', 'feedbackFingerprint'])
    return { kind: 'native', sessionId: text(input.sessionId, 512), sessionLifecycleFingerprint: digest(input.sessionLifecycleFingerprint),
      messageId: text(input.messageId, 512), feedbackVersion: text(input.feedbackVersion, 512), feedbackFingerprint: digest(input.feedbackFingerprint) }
  }
  const input = object(value, ['kind', 'sourceTaskId', 'sourceAdmissionDigest'])
  return { kind: oneOf(input.kind, ['natural']), sourceTaskId: text(input.sourceTaskId, 512), sourceAdmissionDigest: digest(input.sourceAdmissionDigest) }
}
function proof(value: unknown): ConversationJudgmentProof | null {
  if (value === null) return null
  const input = object(value, ['sessionId', 'sessionDigest', 'requestDigest'])
  return { sessionId: text(input.sessionId, 512), sessionDigest: digest(input.sessionDigest), requestDigest: digest(input.requestDigest) }
}

export function parseConversationFeedbackRecord(value: unknown): ConversationFeedbackRecord {
  if (value === null || typeof value !== 'object' || !('kind' in value)) throw new TypeError('feedback assessment record is invalid')
  if (value.kind === 'feedback-assessment-started') {
    const input = object(value, ['kind', 'assessmentId', 'taskId', 'admissionDigest', 'resultDigest', 'source', 'materialDigest', 'consentRevision'])
    if (!Number.isSafeInteger(input.consentRevision) || (input.consentRevision as number) < 1) throw new TypeError('feedback assessment consent is invalid')
    const record: ConversationFeedbackStarted = { kind: 'feedback-assessment-started', assessmentId: text(input.assessmentId, 512), taskId: text(input.taskId, 512),
      admissionDigest: digest(input.admissionDigest), resultDigest: digest(input.resultDigest), source: source(input.source),
      materialDigest: digest(input.materialDigest), consentRevision: input.consentRevision as number }
    if (record.assessmentId !== conversationFeedbackAssessmentId(record)) throw new TypeError('feedback assessment identity does not match its source')
    return record
  }
  if (value.kind !== 'feedback-assessed') throw new TypeError('unknown feedback assessment record')
  const input = object(value, ['kind', 'assessmentId', 'taskId', 'classification', 'category', 'supplementalCriteria', 'explanation', 'evidenceQuotes', 'proof', 'unavailableReason'])
  const record: ConversationFeedbackResult = { kind: 'feedback-assessed', assessmentId: text(input.assessmentId, 512), taskId: text(input.taskId, 512),
    classification: oneOf(input.classification, ['attributable-problem', 'positive', 'requirement-change', 'preference', 'inconclusive']),
    category: input.category === null ? null : oneOf(input.category, CONVERSATION_FAILURES), supplementalCriteria: texts(input.supplementalCriteria),
    explanation: text(input.explanation), evidenceQuotes: texts(input.evidenceQuotes), proof: proof(input.proof),
    unavailableReason: input.unavailableReason === null ? null : oneOf(input.unavailableReason, ['model-unavailable', 'material-too-large', 'cancelled', 'invalid-judgment']) }
  if (record.classification !== 'inconclusive' && (record.proof === null || record.unavailableReason !== null)) throw new TypeError('conclusive feedback assessment requires native proof')
  if (record.classification === 'attributable-problem' && (record.category === null || record.supplementalCriteria.length === 0 || record.evidenceQuotes.length === 0)) throw new TypeError('attributable feedback requires a category, criteria and evidence')
  if (record.classification === 'preference' && record.supplementalCriteria.length > 0
    && (record.category !== 'user-preference' || record.evidenceQuotes.length === 0)) throw new TypeError('durable preference criteria require explicit preference evidence')
  if (!['attributable-problem', 'preference'].includes(record.classification)
    && (record.supplementalCriteria.length > 0 || record.category !== null)) throw new TypeError('non-learning feedback cannot add failure criteria')
  if (record.proof === null && record.unavailableReason === null) throw new TypeError('feedback assessment requires native proof or an unavailable reason')
  return record
}

/** Pure projection; the ledger checks current native feedback versions and consent. */
export class ConversationFeedbackState {
  private readonly assessments = new Map<string, ConversationFeedbackAssessment>()

  list(taskId?: string): readonly ConversationFeedbackAssessment[] {
    return structuredClone([...this.assessments.values()].filter(item => taskId === undefined || item.started.taskId === taskId))
  }
  existing(record: ConversationFeedbackRecord): ConversationFeedbackRecord | undefined {
    const item = this.assessments.get(record.assessmentId)
    const existing = record.kind === 'feedback-assessment-started' ? item?.started : item?.result
    return existing === undefined ? undefined : structuredClone(existing)
  }
  validate(input: ConversationFeedbackRecord, tasks: readonly ConversationTask[]): void {
    const record = parseConversationFeedbackRecord(input)
    if (this.existing(record) !== undefined) throw new Error('feedback assessment conflicts with immutable history')
    const start = record.kind === 'feedback-assessment-started' ? record : this.assessments.get(record.assessmentId)?.started
    if (start === undefined || start.taskId !== record.taskId) throw new Error('feedback assessment must have its exact started record')
    const target = tasks.find(task => task.source.taskId === record.taskId)
    if (target?.completion?.status !== 'completed' || target.admission?.decision?.kind !== 'task'
      || sha256(target.admission) !== start.admissionDigest || target.completion.resultDigest !== start.resultDigest
      || target.source.consentRevision !== start.consentRevision) throw new Error('feedback target answer, criteria or consent does not match')
    const feedback = start.source
    let natural: ConversationTask | undefined
    if (feedback.kind === 'native') {
      if (target.source.sessionId !== feedback.sessionId || target.source.sessionLifecycleFingerprint !== feedback.sessionLifecycleFingerprint
        || !target.completion.assistantMessageIds.includes(feedback.messageId)) throw new Error('native feedback is not bound to the target answer lifecycle')
    } else {
      natural = tasks.find(task => task.source.taskId === feedback.sourceTaskId)
      if (natural === undefined || natural.source.sessionId !== target.source.sessionId
        || natural.source.sessionLifecycleFingerprint !== target.source.sessionLifecycleFingerprint
        || natural.source.turn <= target.source.turn || natural.source.startSeq <= target.completion.endSeq
        || natural.source.consentRevision !== start.consentRevision
        || natural.admission?.decision?.relatedTaskId !== record.taskId || natural.admission.decision.feedback === null
        || natural.admission.proof === null || sha256(natural.admission) !== feedback.sourceAdmissionDigest) throw new Error('natural feedback must bind an exact later user source to the completed target')
    }
    if (record.kind === 'feedback-assessed' && record.proof !== null) {
      const earlierSessions = [target.source.sessionId, target.admission.proof?.sessionId, target.review?.proof?.sessionId, natural?.admission?.proof?.sessionId]
      if (earlierSessions.includes(record.proof.sessionId)) throw new Error('feedback assessment requires an independent native judgment')
    }
  }
  apply(input: ConversationFeedbackRecord, at: string): void {
    const record = structuredClone(input)
    if (record.kind === 'feedback-assessment-started') this.assessments.set(record.assessmentId, { started: record, startedAt: at })
    else this.assessments.set(record.assessmentId, { ...this.assessments.get(record.assessmentId)!, result: record, resultAt: at })
  }
}
