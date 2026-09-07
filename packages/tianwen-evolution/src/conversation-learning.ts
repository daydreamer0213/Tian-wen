import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'

export const CONVERSATION_FAMILIES = ['summarization', 'writing', 'planning', 'code', 'other'] as const
export const CONVERSATION_FAILURES = ['source-fidelity', 'instruction-following', 'task-understanding', 'verification', 'tool-use', 'user-preference'] as const
export type ConversationFamily = typeof CONVERSATION_FAMILIES[number]
export type ConversationFailure = typeof CONVERSATION_FAILURES[number]
export type ConversationUnavailable = 'model-unavailable' | 'material-too-large' | 'cancelled' | 'invalid-judgment'

/** Host policy, not a model-authored criterion or a reinterpretation of old proof. */
export interface ConversationQualityContract {
  readonly schemaVersion: 'tianwen.conversation-quality.v1'
  readonly source: 'host'
  readonly criterion: string
}
export function conversationQualityContract(): ConversationQualityContract {
  return { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls.' }
}
export function parseConversationQualityContract(value: unknown): ConversationQualityContract {
  const input = object(value, ['schemaVersion', 'source', 'criterion'])
  const contract = conversationQualityContract()
  if (input.schemaVersion !== contract.schemaVersion || input.source !== contract.source || input.criterion !== contract.criterion) throw new TypeError('conversation quality contract is invalid')
  return contract
}
export function hasCurrentConversationQuality(value: ConversationQualityContract | undefined): boolean {
  return value !== undefined && sha256(value) === sha256(conversationQualityContract())
}

export interface ConversationJudgmentProof {
  readonly sessionId: string
  readonly sessionDigest: Sha256Digest
  readonly requestDigest: Sha256Digest
}

export interface ConversationTaskSource {
  readonly kind: 'task-started'
  readonly taskId: string
  readonly sessionId: string
  readonly sessionLifecycleFingerprint: Sha256Digest
  readonly turn: number
  readonly startSeq: number
  readonly userMessageIds: readonly string[]
  readonly requestDigest: Sha256Digest
  readonly contextDigest: Sha256Digest
  readonly scopeKey: string
  readonly consentRevision: number
  readonly behaviorVersion: Sha256Digest
}

export interface ConversationAdmissionDecision {
  readonly kind: 'task' | 'conversation'
  readonly objective: string
  readonly criteria: readonly string[]
  readonly family: ConversationFamily
  readonly evaluationMode: 'text' | 'external' | 'subjective'
  readonly relatedTaskId: string | null
  readonly feedback: null | {
    readonly kind: 'correction' | 'positive' | 'preference' | 'requirement-change'
    readonly quote: string
    readonly category: ConversationFailure | null
  }
}

export interface ConversationTaskAdmission {
  readonly kind: 'task-admitted'
  readonly taskId: string
  readonly decision: ConversationAdmissionDecision | null
  readonly proof: ConversationJudgmentProof | null
  readonly unavailableReason: ConversationUnavailable | null
  /** Absent on legacy records; never backfilled during replay or recovery. */
  readonly qualityContract?: ConversationQualityContract
}

export interface ConversationTaskCompletion {
  readonly kind: 'task-finished'
  readonly taskId: string
  readonly endSeq: number
  readonly status: 'completed' | 'interrupted' | 'failed'
  readonly assistantMessageIds: readonly string[]
  readonly resultDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface ConversationTaskModelObserved {
  readonly kind: 'task-model-observed'
  readonly taskId: string
  /** Native configuration epochs can begin before the task's own Turn. */
  readonly headerSeq: number
  readonly modelConfigDigest: Sha256Digest
}

export interface ConversationTaskReview {
  readonly kind: 'task-reviewed'
  readonly taskId: string
  readonly admissionDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly verdict: 'met' | 'not-met' | 'inconclusive'
  readonly category: ConversationFailure | null
  readonly explanation: string
  readonly evidenceQuotes: readonly string[]
  readonly proof: ConversationJudgmentProof | null
  readonly unavailableReason: ConversationUnavailable | null
}

export interface ConversationTaskReviewIntent {
  readonly kind: 'task-review-started'
  readonly taskId: string
  readonly materialDigest: Sha256Digest
}

export type ConversationLearningRecord = ConversationTaskSource | ConversationTaskAdmission | ConversationTaskCompletion | ConversationTaskReview | ConversationTaskReviewIntent | ConversationTaskModelObserved
export interface ConversationLearningEvent {
  readonly type: 'conversation-learning-recorded'
  readonly schemaVersion: 'tianwen.conversation-learning.v1'
  readonly at: string
  readonly record: ConversationLearningRecord
}
export interface ConversationTask {
  readonly source: ConversationTaskSource
  readonly recordedAt: string
  readonly admission?: ConversationTaskAdmission
  readonly completion?: ConversationTaskCompletion
  readonly review?: ConversationTaskReview
  readonly reviewIntent?: ConversationTaskReviewIntent
  readonly models?: readonly ConversationTaskModelObserved[]
}

export function conversationTaskId(source: Pick<ConversationTaskSource, 'sessionId' | 'sessionLifecycleFingerprint' | 'turn'>): string {
  return `conversation-task:${sha256({ sessionId: source.sessionId, lifecycle: source.sessionLifecycleFingerprint, turn: source.turn }).slice(7)}`
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('conversation learning record has invalid fields')
  }
  return value as Record<string, unknown>
}
function text(value: unknown, max = 4096, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || Buffer.byteLength(value, 'utf8') > max) throw new TypeError('conversation learning text is invalid')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('conversation learning digest is invalid')
  return value as Sha256Digest
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError('conversation learning boundary must be positive')
  return value as number
}
function oneOf<const T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new TypeError('conversation learning decision is invalid')
  return value as T
}
function list<T>(value: unknown, parse: (item: unknown) => T, limit = 64): T[] {
  if (!Array.isArray(value) || value.length > limit) throw new TypeError('conversation learning list is invalid')
  return value.map(parse)
}
function uniqueTextList(value: unknown): string[] {
  const values = list(value, item => text(item, 512))
  if (new Set(values).size !== values.length) throw new TypeError('conversation learning identities must be unique')
  return values
}
function nullableProof(value: unknown): ConversationJudgmentProof | null {
  if (value === null) return null
  const input = object(value, ['sessionId', 'sessionDigest', 'requestDigest'])
  return { sessionId: text(input.sessionId, 512), sessionDigest: digest(input.sessionDigest), requestDigest: digest(input.requestDigest) }
}
function unavailable(value: unknown): ConversationUnavailable | null {
  return value === null ? null : oneOf(value, ['model-unavailable', 'material-too-large', 'cancelled', 'invalid-judgment'])
}

export function parseConversationAdmission(value: unknown): ConversationAdmissionDecision {
  const input = object(value, ['kind', 'objective', 'criteria', 'family', 'evaluationMode', 'relatedTaskId', 'feedback'])
  let feedback: ConversationAdmissionDecision['feedback'] = null
  if (input.feedback !== null) {
    const item = object(input.feedback, ['kind', 'quote', 'category'])
    feedback = {
      kind: oneOf(item.kind, ['correction', 'positive', 'preference', 'requirement-change']),
      quote: text(item.quote, 2048), category: item.category === null ? null : oneOf(item.category, CONVERSATION_FAILURES),
    }
  }
  const result: ConversationAdmissionDecision = {
    kind: oneOf(input.kind, ['task', 'conversation']), objective: text(input.objective, 4096, true),
    criteria: list(input.criteria, item => text(item, 2048), 12),
    family: oneOf(input.family, CONVERSATION_FAMILIES), evaluationMode: oneOf(input.evaluationMode, ['text', 'external', 'subjective']),
    relatedTaskId: input.relatedTaskId === null ? null : text(input.relatedTaskId, 512), feedback,
  }
  if (result.kind === 'task' && (result.objective.trim() === '' || result.criteria.length === 0)) throw new TypeError('task admission requires an objective and criteria')
  if (feedback?.kind === 'correction' && (feedback.category === null || result.relatedTaskId === null)) throw new TypeError('a correction requires a target and problem category')
  return result
}

export function parseConversationLearningRecord(value: unknown): ConversationLearningRecord {
  if (value === null || typeof value !== 'object' || !('kind' in value)) throw new TypeError('conversation learning record is invalid')
  if (value.kind === 'task-started') {
    const input = object(value, ['kind', 'taskId', 'sessionId', 'sessionLifecycleFingerprint', 'turn', 'startSeq', 'userMessageIds', 'requestDigest', 'contextDigest', 'scopeKey', 'consentRevision', 'behaviorVersion'])
    const source: ConversationTaskSource = {
      kind: 'task-started', taskId: text(input.taskId, 512), sessionId: text(input.sessionId, 512),
      sessionLifecycleFingerprint: digest(input.sessionLifecycleFingerprint), turn: integer(input.turn), startSeq: integer(input.startSeq),
      userMessageIds: uniqueTextList(input.userMessageIds), requestDigest: digest(input.requestDigest), contextDigest: digest(input.contextDigest),
      scopeKey: text(input.scopeKey, 512), consentRevision: integer(input.consentRevision), behaviorVersion: digest(input.behaviorVersion),
    }
    if (source.taskId !== conversationTaskId(source) || source.userMessageIds.length === 0) throw new TypeError('conversation task identity does not match its source')
    return source
  }
  if (value.kind === 'task-admitted') {
    const input = object(value, ['kind', 'taskId', 'decision', 'proof', 'unavailableReason', ...(Object.hasOwn(value, 'qualityContract') ? ['qualityContract'] : [])])
    const decision = input.decision === null ? null : parseConversationAdmission(input.decision)
    const proof = nullableProof(input.proof)
    const reason = unavailable(input.unavailableReason)
    if ((decision !== null) !== (proof !== null && reason === null) || (decision === null && reason === null)) throw new TypeError('admission requires a judgment or an unavailable reason')
    return { kind: 'task-admitted', taskId: text(input.taskId, 512), decision, proof, unavailableReason: reason,
      ...(Object.hasOwn(input, 'qualityContract') ? { qualityContract: parseConversationQualityContract(input.qualityContract) } : {}) }
  }
  if (value.kind === 'task-finished') {
    const input = object(value, ['kind', 'taskId', 'endSeq', 'status', 'assistantMessageIds', 'resultDigest', 'evidenceIds'])
    return { kind: 'task-finished', taskId: text(input.taskId, 512), endSeq: integer(input.endSeq), status: oneOf(input.status, ['completed', 'interrupted', 'failed']), assistantMessageIds: uniqueTextList(input.assistantMessageIds), resultDigest: digest(input.resultDigest), evidenceIds: list(input.evidenceIds, digest, 256) }
  }
  if (value.kind === 'task-model-observed') {
    const input = object(value, ['kind', 'taskId', 'headerSeq', 'modelConfigDigest'])
    return { kind: 'task-model-observed', taskId: text(input.taskId, 512), headerSeq: integer(input.headerSeq), modelConfigDigest: digest(input.modelConfigDigest) }
  }
  if (value.kind === 'task-reviewed') {
    const input = object(value, ['kind', 'taskId', 'admissionDigest', 'resultDigest', 'verdict', 'category', 'explanation', 'evidenceQuotes', 'proof', 'unavailableReason'])
    const review: ConversationTaskReview = {
      kind: 'task-reviewed', taskId: text(input.taskId, 512), admissionDigest: digest(input.admissionDigest), resultDigest: digest(input.resultDigest),
      verdict: oneOf(input.verdict, ['met', 'not-met', 'inconclusive']), category: input.category === null ? null : oneOf(input.category, CONVERSATION_FAILURES),
      explanation: text(input.explanation), evidenceQuotes: list(input.evidenceQuotes, item => text(item, 2048), 12), proof: nullableProof(input.proof), unavailableReason: unavailable(input.unavailableReason),
    }
    if (review.verdict !== 'inconclusive' && (review.proof === null || review.unavailableReason !== null)) throw new TypeError('a conclusive review requires completed native proof')
    if (review.verdict === 'not-met' && (review.category === null || review.evidenceQuotes.length === 0)) throw new TypeError('a failed task requires attributable evidence')
    return review
  }
  if (value.kind === 'task-review-started') {
    const input = object(value, ['kind', 'taskId', 'materialDigest'])
    return { kind: 'task-review-started', taskId: text(input.taskId, 512), materialDigest: digest(input.materialDigest) }
  }
  throw new TypeError('unknown conversation learning record')
}

/** Domain projection; the existing Evolution ledger alone owns persistence. */
export class ConversationLearningState {
  private readonly tasks = new Map<string, ConversationTask>()

  list(sessionId?: string): readonly ConversationTask[] {
    return structuredClone([...this.tasks.values()].filter(task => sessionId === undefined || task.source.sessionId === sessionId))
  }

  existing(record: ConversationLearningRecord): ConversationLearningRecord | undefined {
    const task = this.tasks.get(record.taskId)
    if (record.kind === 'task-started') return task?.source
    if (record.kind === 'task-admitted') return task?.admission
    if (record.kind === 'task-finished') return task?.completion
    if (record.kind === 'task-review-started') return task?.reviewIntent
    if (record.kind === 'task-model-observed') return task?.models?.find(model => model.headerSeq === record.headerSeq)
    return task?.review
  }

  validate(record: ConversationLearningRecord): void {
    if (this.existing(record) !== undefined) throw new Error('conversation learning record conflicts with completed history')
    if (record.kind === 'task-started') {
      const last = [...this.tasks.values()].filter(task => task.source.sessionId === record.sessionId).at(-1)
      if (last !== undefined && (last.source.sessionLifecycleFingerprint !== record.sessionLifecycleFingerprint || last.source.turn >= record.turn || last.source.startSeq >= record.startSeq)) throw new Error('conversation task source conflicts with its earlier lifecycle')
      return
    }
    const task = this.tasks.get(record.taskId)
    if (task === undefined) throw new Error('unknown conversation task source')
    if (record.kind === 'task-admitted') {
      if (task.completion !== undefined) throw new Error('task criteria must be frozen before the completed result')
      const targetId = record.decision?.relatedTaskId
      if (targetId !== null && targetId !== undefined) {
        const target = this.tasks.get(targetId)
        if (target?.completion === undefined || target.source.sessionId !== task.source.sessionId || target.source.sessionLifecycleFingerprint !== task.source.sessionLifecycleFingerprint || target.source.turn >= task.source.turn) throw new Error('feedback target must be an earlier completed task in the source conversation')
      }
      return
    }
    if (record.kind === 'task-finished') {
      if (record.endSeq <= task.source.startSeq) throw new Error('task result must follow its source boundary')
      return
    }
    if (record.kind === 'task-model-observed') {
      if (task.admission === undefined || task.completion !== undefined) throw new Error('task model observation requires admission and must precede the completed result')
      return
    }
    if (record.kind === 'task-review-started') {
      if (task.admission === undefined || task.completion === undefined || task.review !== undefined) throw new Error('review attempt requires a completed admitted task with no prior review')
      return
    }
    if (task.admission === undefined || task.completion === undefined || record.admissionDigest !== sha256(task.admission) || record.resultDigest !== task.completion.resultDigest) throw new Error('task review does not match the admitted criteria and answer result')
    if (record.verdict !== 'inconclusive' && (task.admission.decision?.kind !== 'task' || task.completion.status !== 'completed')) throw new Error('incomplete task cannot establish a conclusive review')
    if (record.verdict === 'met' && task.admission.decision?.evaluationMode === 'subjective') throw new Error('a subjective review cannot establish user satisfaction')
    if (record.verdict === 'met' && task.admission.decision?.evaluationMode === 'external') throw new Error('external effects require an independent external evaluator, not a text judgment')
  }

  apply(record: ConversationLearningRecord, at: string): void {
    if (record.kind === 'task-started') this.tasks.set(record.taskId, { source: record, recordedAt: at })
    else {
      const previous = this.tasks.get(record.taskId)!
      if (record.kind === 'task-model-observed') {
        this.tasks.set(record.taskId, { ...previous, models: [...(previous.models ?? []), record] })
        return
      }
      const key = record.kind === 'task-admitted' ? 'admission' : record.kind === 'task-finished' ? 'completion' : record.kind === 'task-review-started' ? 'reviewIntent' : 'review'
      this.tasks.set(record.taskId, { ...previous, [key]: record })
    }
  }
}
