import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'
import { parseClaimAudit, type ClaimAudit } from './conversation-claim-audit.js'
import { parseConversationTaskFileAncillary, projectConversationFileAncillaryContext, type ConversationTaskFileAncillary } from './conversation-file-ancillary.js'
import { parseConversationFileEntries, parseConversationFileResult, type ConversationFileResult, type ConversationTaskFileInput, type ConversationTaskFileUnavailable } from './conversation-files.js'
import { CAPTURED_FILE_FACTS_TOOL } from './conversation-file-facts.js'
import { parseConversationExternalCheck, validateConversationExternalCheck, type ConversationExternalCheckPrepared, type ConversationExternalCheckFinished } from './conversation-external-check.js'

export const CONVERSATION_FAMILIES = ['summarization', 'writing', 'planning', 'code', 'other'] as const
export const CONVERSATION_FAILURES = ['source-fidelity', 'instruction-following', 'task-understanding', 'verification', 'tool-use', 'user-preference'] as const
export type ConversationFamily = typeof CONVERSATION_FAMILIES[number]
export type ConversationFailure = typeof CONVERSATION_FAILURES[number]
export type ConversationUnavailable = 'model-unavailable' | 'material-too-large' | 'cancelled' | 'invalid-judgment' | 'file-evidence-unavailable'

/** Host policy, not a model-authored criterion or a reinterpretation of old proof. */
export interface ConversationQualityContract {
  readonly schemaVersion: 'tianwen.conversation-quality.v1' | 'tianwen.conversation-quality.v2' | 'tianwen.conversation-quality.v3' | 'tianwen.conversation-quality.v4' | 'tianwen.conversation-quality.v5' | 'tianwen.conversation-quality.v6' | 'tianwen.conversation-quality.v7' | 'tianwen.conversation-quality.v8' | 'tianwen.conversation-quality.v9' | 'tianwen.conversation-quality.v10' | 'tianwen.conversation-quality.v11'
  readonly source: 'host'
  readonly criterion: string
}
function legacyConversationQualityContract(): ConversationQualityContract {
  return { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls.' }
}
function legacyDualConversationQualityContract(): ConversationQualityContract {
  return { schemaVersion: 'tianwen.conversation-quality.v2', source: 'host', criterion: `${legacyConversationQualityContract().criterion} The original direct-user instructions remain authoritative even if extracted criteria omit or weaken an explicit requirement. Preserve output-only restrictions, exclusions, conditions, uncertainty and who may decide or act. Distinguish the user's instructions from quoted source content. Evaluate the complete answer, including introductions, alternatives and closing offers. Two independent native checks must agree before a conclusive review; neither check may see the other's result.` }
}
function legacyV3ConversationQualityContract(): ConversationQualityContract {
  return { schemaVersion: 'tianwen.conversation-quality.v3', source: 'host', criterion: `${legacyDualConversationQualityContract().criterion} Original-result reviews use only requirements applicable when that task ran. For newly generated method-study answers, separately identified host-frozen feedback standards apply prospectively; they do not regrade the old answer or override an explicit instruction in the evaluated user request.` }
}
function legacyV4ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV3ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v4' }
}
function legacyV5ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV4ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v5' }
}
function legacyV6ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV5ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v6', criterion: `${legacyV5ConversationQualityContract().criterion} Apply source authority to the actor, time, scope, commitment and premise actually asserted. A labeled inference or courtesy does not establish an unverified current state, past event, external effect, decision or commitment; grounded fallible inference, optional advice, fiction and task-compatible courtesy remain permitted.` }
}
function legacyV7ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV6ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v7' }
}
function legacyV8ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV7ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v8', criterion: `${legacyV7ConversationQualityContract().criterion} Preserve whether a source reports a pending, unverified or not-yet-confirmed-passed result versus an explicitly judged failure; absence of a pass does not establish a failed verdict. Preserve the speaker's complete optional advice speech act, while checking any independent factual assertion in the same sentence against its source.` }
}
function legacyV9ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV8ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v9', criterion: `${legacyV8ConversationQualityContract().criterion} A source total number of items does not by itself establish completion of every check, task or outcome in that total. Distinguish a completed inspection from a completed underlying item only when the source supports that distinction; do not upgrade a total into a completed count. A declarative future decision procedure, plan or commitment attributed to an external actor requires source authority, even if it seems a plausible consequence of open items. Clearly optional advice and explicitly fallible task-compatible inference remain permitted only when the user's instructions allow them. Check an answer's own assurance that it uses only supplied records or makes no extrapolation against the entire answer; do not treat an unsupported or contradictory assurance as harmless courtesy.` }
}
function legacyV10ConversationQualityContract(): ConversationQualityContract {
  return { ...legacyV9ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v10', criterion: `${legacyV9ConversationQualityContract().criterion} Check the complete answer's requested output form separately from the factual claim audit. When the direct user requests a single paragraph as the deliverable, a heading, bullet list, divider or extra addendum can violate that form even if its individual units make no unsupported factual claim. Treat natural wording such as "write a paragraph" or "写一段" as a single-paragraph form when that is what the user asks to produce; do not infer that form merely from a request for short text, quoted source content, or an unrelated use of those words. Respect explicit permission for headings, lists or multiple sections. A non-factual or source-supported audit status does not itself establish instruction-following.` }
}
export function conversationQualityContract(): ConversationQualityContract {
  return { ...legacyV10ConversationQualityContract(), schemaVersion: 'tianwen.conversation-quality.v11' }
}
export function parseConversationQualityContract(value: unknown): ConversationQualityContract {
  const input = object(value, ['schemaVersion', 'source', 'criterion'])
  const contract = input.schemaVersion === 'tianwen.conversation-quality.v1' ? legacyConversationQualityContract()
    : input.schemaVersion === 'tianwen.conversation-quality.v2' ? legacyDualConversationQualityContract()
      : input.schemaVersion === 'tianwen.conversation-quality.v3' ? legacyV3ConversationQualityContract()
        : input.schemaVersion === 'tianwen.conversation-quality.v4' ? legacyV4ConversationQualityContract()
          : input.schemaVersion === 'tianwen.conversation-quality.v5' ? legacyV5ConversationQualityContract()
            : input.schemaVersion === 'tianwen.conversation-quality.v6' ? legacyV6ConversationQualityContract()
              : input.schemaVersion === 'tianwen.conversation-quality.v7' ? legacyV7ConversationQualityContract()
                : input.schemaVersion === 'tianwen.conversation-quality.v8' ? legacyV8ConversationQualityContract()
                  : input.schemaVersion === 'tianwen.conversation-quality.v9' ? legacyV9ConversationQualityContract()
                    : input.schemaVersion === 'tianwen.conversation-quality.v10' ? legacyV10ConversationQualityContract() : conversationQualityContract()
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

/** Full independent results are retained; the host, not a third model, combines them. */
export interface ConversationReviewCheck {
  readonly focus: 'requirements' | 'grounding'
  readonly verdict: 'met' | 'not-met' | 'inconclusive'
  readonly category: ConversationFailure | null
  readonly explanation: string
  readonly evidenceQuotes: readonly string[]
  readonly proof: ConversationJudgmentProof
}
export type ConversationReviewChecks = readonly [ConversationReviewCheck, ConversationReviewCheck]
export interface ConversationAuditedReviewCheck extends ConversationReviewCheck { readonly audit: ClaimAudit }
export type ConversationAuditedReviewChecks = readonly [ConversationAuditedReviewCheck, ConversationAuditedReviewCheck]
export type ConversationStoredReviewChecks = ConversationReviewChecks | ConversationAuditedReviewChecks

export function parseConversationReviewChecks(value: unknown): ConversationReviewChecks {
  const checks = list(value, item => {
    const input = object(item, ['focus', 'verdict', 'category', 'explanation', 'evidenceQuotes', 'proof'])
    const proof = nullableProof(input.proof)
    if (proof === null) throw new TypeError('review check requires native proof')
    const result: ConversationReviewCheck = { focus: oneOf(input.focus, ['requirements', 'grounding']),
      verdict: oneOf(input.verdict, ['met', 'not-met', 'inconclusive']), category: input.category === null ? null : oneOf(input.category, CONVERSATION_FAILURES),
      explanation: text(input.explanation), evidenceQuotes: list(input.evidenceQuotes, item => text(item, 2048), 6), proof }
    if (result.verdict !== 'inconclusive' && result.evidenceQuotes.length === 0) throw new TypeError('conclusive review check requires source evidence')
    if (result.verdict === 'not-met' && result.category === null) throw new TypeError('failed review check requires an attributable category')
    if (result.verdict === 'met' && result.category !== null) throw new TypeError('successful review check cannot assert a failure category')
    return result
  }, 2)
  if (checks.length !== 2 || checks[0]!.focus !== 'requirements' || checks[1]!.focus !== 'grounding'
    || checks[0]!.proof.sessionId === checks[1]!.proof.sessionId) throw new TypeError('review checks require two ordered independent native Sessions')
  return checks as unknown as ConversationReviewChecks
}

export function parseConversationAuditedReviewChecks(value: unknown): ConversationAuditedReviewChecks {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError('audited review checks require two checks')
  const summaries = value.map(item => {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 7 || !Object.hasOwn(item, 'audit')) throw new TypeError('audited review check is invalid')
    const { audit: _audit, ...summary } = item as Record<string, unknown>
    return summary
  })
  const parsed = parseConversationReviewChecks(summaries)
  const checks = parsed.map((check, index) => ({ ...check, audit: parseClaimAudit((value[index] as Record<string, unknown>).audit, check.verdict) })) as unknown as ConversationAuditedReviewChecks
  if (checks[0].audit.evidenceDigest !== checks[1].audit.evidenceDigest) throw new TypeError('audited review checks require matching evidence digests')
  if (checks[0].audit.schemaVersion !== checks[1].audit.schemaVersion) throw new TypeError('audited review checks require matching audit versions')
  return checks
}

export function parseStoredConversationReviewChecks(value: unknown): ConversationStoredReviewChecks {
  const audited = Array.isArray(value) && value.some(item => item !== null && typeof item === 'object' && Object.hasOwn(item, 'audit'))
  return audited ? parseConversationAuditedReviewChecks(value) : parseConversationReviewChecks(value)
}

export function parseConversationQualityReviewChecks(value: unknown, quality: ConversationQualityContract | undefined): ConversationStoredReviewChecks {
  if (quality?.schemaVersion !== 'tianwen.conversation-quality.v4' && quality?.schemaVersion !== 'tianwen.conversation-quality.v5' && quality?.schemaVersion !== 'tianwen.conversation-quality.v6' && quality?.schemaVersion !== 'tianwen.conversation-quality.v7' && quality?.schemaVersion !== 'tianwen.conversation-quality.v8' && quality?.schemaVersion !== 'tianwen.conversation-quality.v9' && quality?.schemaVersion !== 'tianwen.conversation-quality.v10' && quality?.schemaVersion !== 'tianwen.conversation-quality.v11') return parseConversationReviewChecks(value)
  const checks = parseConversationAuditedReviewChecks(value)
  const version = quality.schemaVersion === 'tianwen.conversation-quality.v4' ? 'tianwen.claim-audit.v1' : 'tianwen.claim-audit.v2'
  if (checks.some(check => check.audit.schemaVersion !== version)) throw new TypeError('review audit version does not match its quality contract')
  return checks
}

export function conversationReviewConsensus(checks: ConversationStoredReviewChecks) {
  const [first, second] = parseStoredConversationReviewChecks(checks)
  const verdict = first.verdict === second.verdict ? first.verdict : 'inconclusive'
  const firstPrefix = `Requirements check (${first.verdict}): `
  const secondPrefix = `\nGrounding check (${second.verdict}): `
  const available = 4096 - Buffer.byteLength(firstPrefix + secondPrefix, 'utf8')
  const firstBytes = Buffer.byteLength(first.explanation, 'utf8')
  const secondBytes = Buffer.byteLength(second.explanation, 'utf8')
  const firstBudget = Math.min(firstBytes, available - Math.min(secondBytes, Math.floor(available / 2)))
  return { verdict, category: verdict === 'not-met' ? first.category : null,
    explanation: `${firstPrefix}${reviewSummaryExcerpt(first.explanation, firstBudget)}${secondPrefix}${reviewSummaryExcerpt(second.explanation, available - firstBudget)}`,
    evidenceQuotes: [...new Set([...first.evidenceQuotes, ...second.evidenceQuotes])], proof: first.proof }
}

function reviewSummaryExcerpt(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let excerpt = '', bytes = 0
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8')
    if (bytes + size > maxBytes - 3) break
    excerpt += character
    bytes += size
  }
  return `${excerpt}…`
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
  /** Omission is the historical native-content projection. */
  readonly materialProjection?: 'surface-text.v1'
  /** Omission is historical and is never recruited as a feedback proposal clue. */
  readonly proposalCluePolicy?: 'feedback.v1' | 'feedback.v2'
  /** Omission preserves the historical single-admission family route. */
  readonly admissionPolicy?: 'tianwen.family-verification.v1'
}

export interface ConversationAdmissionDecision {
  readonly kind: 'task' | 'conversation'
  readonly objective: string
  readonly criteria: readonly string[]
  readonly family: ConversationFamily
  readonly evaluationMode: 'text' | 'external' | 'subjective' | 'local-files'
  readonly fileOutputKind?: 'files' | 'chat'
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
  readonly unavailableReason: Exclude<ConversationUnavailable, 'file-evidence-unavailable'> | null
  /** Absent on legacy records; never backfilled during replay or recovery. */
  readonly qualityContract?: ConversationQualityContract
  /** Keeps the initial decision/proof intact while verifying prospective text-task family routing. */
  readonly familyVerification?: ConversationFamilyVerification
}

/** File artifacts alone do not establish an external code task's success. */
export function conversationFileCaptureOutputKind(decision: ConversationAdmissionDecision | null | undefined): 'files' | 'chat' | undefined {
  if (decision?.kind !== 'task') return
  if (decision.evaluationMode === 'local-files') return decision.fileOutputKind
  if (decision.evaluationMode === 'external' && decision.family === 'code') return 'files'
}

export interface ConversationFamilyCheck {
  readonly family: ConversationFamily
  readonly quote: string
  readonly proof: ConversationJudgmentProof
}
export interface ConversationFamilyVerification {
  readonly schemaVersion: 'tianwen.family-verification.v1'
  readonly checks: readonly ConversationFamilyCheck[]
  readonly resolvedFamily: ConversationFamily | null
  readonly unavailableReason: Exclude<ConversationUnavailable, 'file-evidence-unavailable'> | null
}

export interface ConversationTaskCompletion {
  readonly kind: 'task-finished'
  readonly taskId: string
  readonly endSeq: number
  readonly status: 'completed' | 'interrupted' | 'failed'
  readonly assistantMessageIds: readonly string[]
  readonly resultDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
  readonly files?: ConversationFileResult
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
  /** Absent on historical single-judge reviews. */
  readonly reviewChecks?: ConversationStoredReviewChecks
}

export interface ConversationTaskReviewIntent {
  readonly kind: 'task-review-started'
  readonly taskId: string
  readonly materialDigest: Sha256Digest
}

export type ConversationLearningRecord = ConversationTaskSource | ConversationTaskAdmission | ConversationTaskCompletion | ConversationTaskReview | ConversationTaskReviewIntent | ConversationTaskModelObserved | ConversationTaskFileInput | ConversationTaskFileUnavailable | ConversationTaskFileAncillary | ConversationExternalCheckPrepared | ConversationExternalCheckFinished
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
  readonly fileInputs?: readonly ConversationTaskFileInput[]
  readonly fileAncillary?: readonly ConversationTaskFileAncillary[]
  readonly fileUnavailable?: ConversationTaskFileUnavailable
  readonly externalCheckPrepared?: ConversationExternalCheckPrepared
  readonly externalCheckFinished?: ConversationExternalCheckFinished
}

export function effectiveConversationFamily(task: ConversationTask): ConversationFamily | null {
  const decision = task.admission?.decision
  if (decision?.kind !== 'task') return null
  if (task.source.admissionPolicy !== 'tianwen.family-verification.v1' || decision.evaluationMode !== 'text') return decision.family
  const family = task.admission?.familyVerification?.resolvedFamily
  return family === 'other' ? null : family ?? null
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
  return value === null ? null : oneOf(value, ['model-unavailable', 'material-too-large', 'cancelled', 'invalid-judgment', 'file-evidence-unavailable'])
}

export function parseConversationFamilyVerification(value: unknown, initialFamily: ConversationFamily,
  initialProof: ConversationJudgmentProof): ConversationFamilyVerification {
  const input = object(value, ['schemaVersion', 'checks', 'resolvedFamily', 'unavailableReason'])
  if (input.schemaVersion !== 'tianwen.family-verification.v1') throw new TypeError('family verification version is invalid')
  const checks = list(input.checks, item => {
    const check = object(item, ['family', 'quote', 'proof'])
    const proof = nullableProof(check.proof)
    if (proof === null) throw new TypeError('family verification requires native proof')
    return { family: oneOf(check.family, CONVERSATION_FAMILIES), quote: text(check.quote, 2048), proof }
  }, 2)
  const reason = unavailable(input.unavailableReason)
  if (reason === 'file-evidence-unavailable') throw new TypeError('family verification cannot cite file evidence')
  const ids = [initialProof.sessionId, ...checks.map(check => check.proof.sessionId)]
  if (new Set(ids).size !== ids.length) throw new TypeError('family checks require independent native Sessions')
  let resolvedFamily: ConversationFamily | null = null
  if (checks.length === 0) {
    if (reason === null) throw new TypeError('missing family check needs an unavailable reason')
  } else if (checks[0]!.family === initialFamily) {
    if (checks.length !== 1 || reason !== null) throw new TypeError('agreeing family check needs no tie-break')
    resolvedFamily = initialFamily
  } else if (checks.length === 1) {
    if (reason === null) throw new TypeError('disagreeing family check needs a tie-break or unavailable reason')
  } else {
    if (reason !== null) throw new TypeError('completed family checks cannot be unavailable')
    resolvedFamily = checks[1]!.family === initialFamily ? initialFamily
      : checks[1]!.family === checks[0]!.family ? checks[0]!.family : null
  }
  if (input.resolvedFamily !== resolvedFamily) throw new TypeError('family verification disagrees with native votes')
  return { schemaVersion: 'tianwen.family-verification.v1', checks, resolvedFamily, unavailableReason: reason }
}

export function parseConversationAdmission(value: unknown): ConversationAdmissionDecision {
  const input = object(value, ['kind', 'objective', 'criteria', 'family', 'evaluationMode', 'relatedTaskId', 'feedback', ...(Object.hasOwn(value as object, 'fileOutputKind') ? ['fileOutputKind'] : [])])
  let feedback: ConversationAdmissionDecision['feedback'] = null
  if (input.feedback !== null) {
    const item = object(input.feedback, ['kind', 'quote', 'category'])
    feedback = {
      kind: oneOf(item.kind, ['correction', 'positive', 'preference', 'requirement-change']),
      quote: text(item.quote, 2048), category: item.category === null ? null : oneOf(item.category, CONVERSATION_FAILURES),
    }
  }
  const evaluationMode = oneOf(input.evaluationMode, ['text', 'external', 'subjective', 'local-files'])
  const result: ConversationAdmissionDecision = {
    kind: oneOf(input.kind, ['task', 'conversation']), objective: text(input.objective, 4096, true),
    criteria: list(input.criteria, item => text(item, 2048), 12),
    family: oneOf(input.family, CONVERSATION_FAMILIES), evaluationMode,
    relatedTaskId: input.relatedTaskId === null ? null : text(input.relatedTaskId, 512), feedback,
    ...(Object.hasOwn(input, 'fileOutputKind') ? { fileOutputKind: oneOf(input.fileOutputKind, ['files', 'chat']) } : {}),
  }
  if ((evaluationMode === 'local-files') !== (result.fileOutputKind !== undefined)) throw new TypeError('local-files admission requires an exclusive file output kind')
  if (result.kind === 'task' && (result.objective.trim() === '' || result.criteria.length === 0)) throw new TypeError('task admission requires an objective and criteria')
  if (feedback?.kind === 'correction' && (feedback.category === null || result.relatedTaskId === null)) throw new TypeError('a correction requires a target and problem category')
  return result
}

export function parseConversationLearningRecord(value: unknown): ConversationLearningRecord {
  if (value === null || typeof value !== 'object' || !('kind' in value)) throw new TypeError('conversation learning record is invalid')
  if (value.kind === 'task-started') {
    const input = object(value, ['kind', 'taskId', 'sessionId', 'sessionLifecycleFingerprint', 'turn', 'startSeq', 'userMessageIds', 'requestDigest', 'contextDigest', 'scopeKey', 'consentRevision', 'behaviorVersion', ...(Object.hasOwn(value, 'materialProjection') ? ['materialProjection'] : []), ...(Object.hasOwn(value, 'proposalCluePolicy') ? ['proposalCluePolicy'] : []), ...(Object.hasOwn(value, 'admissionPolicy') ? ['admissionPolicy'] : [])])
    const source: ConversationTaskSource = {
      kind: 'task-started', taskId: text(input.taskId, 512), sessionId: text(input.sessionId, 512),
      sessionLifecycleFingerprint: digest(input.sessionLifecycleFingerprint), turn: integer(input.turn), startSeq: integer(input.startSeq),
      userMessageIds: uniqueTextList(input.userMessageIds), requestDigest: digest(input.requestDigest), contextDigest: digest(input.contextDigest),
      scopeKey: text(input.scopeKey, 512), consentRevision: integer(input.consentRevision), behaviorVersion: digest(input.behaviorVersion),
      ...(Object.hasOwn(input, 'materialProjection') ? { materialProjection: oneOf(input.materialProjection, ['surface-text.v1']) } : {}),
      ...(Object.hasOwn(input, 'proposalCluePolicy') ? { proposalCluePolicy: oneOf(input.proposalCluePolicy, ['feedback.v1', 'feedback.v2']) } : {}),
      ...(Object.hasOwn(input, 'admissionPolicy') ? { admissionPolicy: oneOf(input.admissionPolicy, ['tianwen.family-verification.v1']) } : {}),
    }
    if (source.taskId !== conversationTaskId(source) || source.userMessageIds.length === 0) throw new TypeError('conversation task identity does not match its source')
    return source
  }
  if (value.kind === 'task-admitted') {
    const input = object(value, ['kind', 'taskId', 'decision', 'proof', 'unavailableReason', ...(Object.hasOwn(value, 'qualityContract') ? ['qualityContract'] : []), ...(Object.hasOwn(value, 'familyVerification') ? ['familyVerification'] : [])])
    const decision = input.decision === null ? null : parseConversationAdmission(input.decision)
    const proof = nullableProof(input.proof)
    const reason = unavailable(input.unavailableReason)
    if (reason === 'file-evidence-unavailable') throw new TypeError('admission cannot cite unavailable result-file evidence')
    if ((decision !== null) !== (proof !== null && reason === null) || (decision === null && reason === null)) throw new TypeError('admission requires a judgment or an unavailable reason')
    if (Object.hasOwn(input, 'familyVerification') && (decision?.kind !== 'task' || proof === null)) throw new TypeError('family verification requires an admitted task')
    return { kind: 'task-admitted', taskId: text(input.taskId, 512), decision, proof, unavailableReason: reason,
      ...(Object.hasOwn(input, 'qualityContract') ? { qualityContract: parseConversationQualityContract(input.qualityContract) } : {}),
      ...(Object.hasOwn(input, 'familyVerification') ? {
        familyVerification: parseConversationFamilyVerification(input.familyVerification, decision!.family, proof!),
      } : {}) }
  }
  if (value.kind === 'task-finished') {
    const input = object(value, ['kind', 'taskId', 'endSeq', 'status', 'assistantMessageIds', 'resultDigest', 'evidenceIds', ...(Object.hasOwn(value, 'files') ? ['files'] : [])])
    return { kind: 'task-finished', taskId: text(input.taskId, 512), endSeq: integer(input.endSeq), status: oneOf(input.status, ['completed', 'interrupted', 'failed']), assistantMessageIds: uniqueTextList(input.assistantMessageIds), resultDigest: digest(input.resultDigest), evidenceIds: list(input.evidenceIds, digest, 256),
      ...(Object.hasOwn(input, 'files') ? { files: parseConversationFileResult(input.files) } : {}) }
  }
  if (value.kind === 'task-model-observed') {
    const input = object(value, ['kind', 'taskId', 'headerSeq', 'modelConfigDigest'])
    return { kind: 'task-model-observed', taskId: text(input.taskId, 512), headerSeq: integer(input.headerSeq), modelConfigDigest: digest(input.modelConfigDigest) }
  }
  if (value.kind === 'task-file-input-captured') {
    const input = object(value, ['kind', 'taskId', 'callId', 'callSeq', 'path', 'content'])
    const [entry] = parseConversationFileEntries([{ path: input.path, content: input.content }])
    return { kind: 'task-file-input-captured', taskId: text(input.taskId, 512), callId: text(input.callId, 512), callSeq: integer(input.callSeq), ...entry! }
  }
  if (value.kind === 'task-file-ancillary-captured') return parseConversationTaskFileAncillary(value)
  if (value.kind === 'task-file-evidence-unavailable') {
    const input = object(value, ['kind', 'taskId', 'reason'])
    return { kind: 'task-file-evidence-unavailable', taskId: text(input.taskId, 512), reason: oneOf(input.reason, ['unsupported-tool', 'unsafe-path', 'material-unavailable', 'capture-interrupted']) }
  }
  if (value.kind === 'task-reviewed') {
    const input = object(value, ['kind', 'taskId', 'admissionDigest', 'resultDigest', 'verdict', 'category', 'explanation', 'evidenceQuotes', 'proof', 'unavailableReason', ...(Object.hasOwn(value, 'reviewChecks') ? ['reviewChecks'] : [])])
    const review: ConversationTaskReview = {
      kind: 'task-reviewed', taskId: text(input.taskId, 512), admissionDigest: digest(input.admissionDigest), resultDigest: digest(input.resultDigest),
      verdict: oneOf(input.verdict, ['met', 'not-met', 'inconclusive']), category: input.category === null ? null : oneOf(input.category, CONVERSATION_FAILURES),
      explanation: text(input.explanation), evidenceQuotes: list(input.evidenceQuotes, item => text(item, 2048), 12), proof: nullableProof(input.proof), unavailableReason: unavailable(input.unavailableReason),
      ...(Object.hasOwn(input, 'reviewChecks') ? { reviewChecks: parseStoredConversationReviewChecks(input.reviewChecks) } : {}),
    }
    if (review.verdict !== 'inconclusive' && (review.proof === null || review.unavailableReason !== null)) throw new TypeError('a conclusive review requires completed native proof')
    if (review.verdict === 'not-met' && (review.category === null || review.evidenceQuotes.length === 0)) throw new TypeError('a failed task requires attributable evidence')
    return review
  }
  if (value.kind === 'task-review-started') {
    const input = object(value, ['kind', 'taskId', 'materialDigest'])
    return { kind: 'task-review-started', taskId: text(input.taskId, 512), materialDigest: digest(input.materialDigest) }
  }
  if (value.kind === 'task-external-check-prepared' || value.kind === 'task-external-check-finished') return parseConversationExternalCheck(value)
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
    if (record.kind === 'task-file-input-captured') {
      return task?.fileInputs?.find(input => input.callId === record.callId || input.callSeq === record.callSeq || input.path.toLowerCase() === record.path.toLowerCase())
        ?? task?.fileAncillary?.find(item => item.callId === record.callId || item.callSeq === record.callSeq || item.resultSeq === record.callSeq)
    }
    if (record.kind === 'task-file-ancillary-captured') {
      return task?.fileAncillary?.find(item => item.callId === record.callId || item.callSeq === record.callSeq || item.resultSeq === record.resultSeq
        || item.callSeq === record.resultSeq || item.resultSeq === record.callSeq)
        ?? task?.fileInputs?.find(input => !(record.payload.tool === CAPTURED_FILE_FACTS_TOOL
          && input.callId === record.callId && input.callSeq === record.callSeq && input.path === record.payload.facts.path)
          && (input.callId === record.callId || input.callSeq === record.callSeq || input.callSeq === record.resultSeq))
    }
    if (record.kind === 'task-file-evidence-unavailable') return task?.fileUnavailable
    if (record.kind === 'task-external-check-prepared') return task?.externalCheckPrepared
    if (record.kind === 'task-external-check-finished') return task?.externalCheckFinished
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
    if (record.kind === 'task-external-check-prepared' || record.kind === 'task-external-check-finished') {
      validateConversationExternalCheck(record, task)
      return
    }
    if (record.kind === 'task-admitted') {
      if (task.completion !== undefined) throw new Error('task criteria must be frozen before the completed result')
      const needsFamily = task.source.admissionPolicy === 'tianwen.family-verification.v1'
        && record.decision?.kind === 'task' && record.decision.evaluationMode === 'text'
      if (needsFamily !== (record.familyVerification !== undefined)) throw new Error('family verification does not match its source admission policy')
      const targetId = record.decision?.relatedTaskId
      if (targetId !== null && targetId !== undefined) {
        const target = this.tasks.get(targetId)
        if (target?.completion === undefined || target.source.sessionId !== task.source.sessionId || target.source.sessionLifecycleFingerprint !== task.source.sessionLifecycleFingerprint || target.source.turn >= task.source.turn) throw new Error('feedback target must be an earlier completed task in the source conversation')
      }
      return
    }
    if (record.kind === 'task-finished') {
      if (record.endSeq <= task.source.startSeq) throw new Error('task result must follow its source boundary')
      if (record.files !== undefined) {
        const inputs = task.fileInputs?.map(input => ({ path: input.path, content: input.content })) ?? []
        if (conversationFileCaptureOutputKind(task.admission?.decision) !== record.files.outputKind || record.status !== 'completed' || task.fileUnavailable !== undefined
          || inputs.length === 0 || record.files.inputsDigest !== sha256(inputs)
          || record.files.captureSeq >= record.endSeq || task.fileInputs!.some(input => input.callSeq >= record.files!.captureSeq)
          || (task.fileAncillary ?? []).some(item => item.resultSeq > record.files!.captureSeq)
          || sha256(record.files.entries.map(entry => entry.path)) !== sha256(inputs.map(entry => entry.path))) {
          throw new Error('task file result does not match its immutable captured inputs and completion')
        }
      }
      return
    }
    if (record.kind === 'task-model-observed') {
      if (task.admission === undefined || task.completion !== undefined) throw new Error('task model observation requires admission and must precede the completed result')
      return
    }
    if (record.kind === 'task-file-input-captured') {
      if (conversationFileCaptureOutputKind(task.admission?.decision) === undefined || task.completion !== undefined) throw new Error('task file capture requires local-files or external code admission and must precede the completed result')
      if (task.fileUnavailable !== undefined || record.callSeq <= task.source.startSeq) throw new Error('task file capture is unavailable or outside the task boundary')
      parseConversationFileEntries([...(task.fileInputs ?? []).map(input => ({ path: input.path, content: input.content })), { path: record.path, content: record.content }])
      return
    }
    if (record.kind === 'task-file-ancillary-captured') {
      if (task.admission?.decision?.kind !== 'task' || task.admission.decision.evaluationMode !== 'local-files' || task.completion !== undefined) {
        throw new Error('task file ancillary capture requires local-files admission and must precede the completed result')
      }
      if (task.fileUnavailable !== undefined) throw new Error('task file ancillary capture is unavailable')
      if (record.callSeq <= task.source.startSeq || record.callSeq >= record.resultSeq) throw new Error('task file ancillary sequence is outside the task boundary')
      if ((task.fileAncillary?.length ?? 0) >= 16) throw new Error('task file ancillary record count exceeds the 16-record limit')
      if (record.payload.tool === 'skill' && record.payload.reference.scopeKey !== task.source.scopeKey) {
        throw new Error('task file ancillary Skill reference does not match the task scope')
      }
      if (record.payload.tool === 'grep') {
        for (const match of record.payload.matches) {
          const input = task.fileInputs?.find(item => item.path === match.path)
          if (input?.content === null || input === undefined) throw new Error('task file ancillary grep requires a readable captured input')
          if (input.callSeq >= record.callSeq) throw new Error('task file ancillary grep requires an earlier captured input')
        }
      }
      const entries = task.fileInputs?.map(input => ({ path: input.path, content: input.content })) ?? []
      projectConversationFileAncillaryContext([...(task.fileAncillary ?? []), record], entries)
      return
    }
    if (record.kind === 'task-file-evidence-unavailable') {
      if (conversationFileCaptureOutputKind(task.admission?.decision) === undefined || task.completion !== undefined) throw new Error('task file evidence status requires local-files or external code admission and must precede the completed result')
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
    if (['tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(task.admission.qualityContract?.schemaVersion ?? '') && task.admission.decision?.kind === 'task'
      && task.completion.status === 'completed' && record.proof === null && record.unavailableReason === null) throw new Error('a completed audited task review requires proof or an explicit unavailable reason')
    if (['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(task.admission.qualityContract?.schemaVersion ?? '') && record.proof !== null && record.reviewChecks === undefined) throw new Error('versioned task reviews require two independent review checks')
    if (record.reviewChecks !== undefined) {
      parseConversationQualityReviewChecks(record.reviewChecks, task.admission.qualityContract)
      const expected = conversationReviewConsensus(record.reviewChecks)
      const mode = task.admission.decision?.evaluationMode
      const fileCapture = mode === 'local-files' && task.completion.files !== undefined && task.fileUnavailable === undefined
      const verdict = expected.verdict === 'met' && mode !== 'text' && !fileCapture ? 'inconclusive' : expected.verdict
      if (record.verdict !== verdict || record.category !== expected.category || sha256(record.proof) !== sha256(expected.proof)
        || sha256(record.evidenceQuotes) !== sha256(expected.evidenceQuotes) || record.explanation !== expected.explanation || record.unavailableReason !== null) throw new Error('task review disagrees with its independent check consensus')
      const used = [...this.tasks.values()].flatMap(item => [item.source.sessionId, item.admission?.proof?.sessionId,
        ...(item.review?.reviewChecks?.map(check => check.proof.sessionId) ?? [])])
      if (record.reviewChecks.some(check => used.includes(check.proof.sessionId))) throw new Error('task review checks require distinct independent native Sessions')
    }
  }

  apply(record: ConversationLearningRecord, at: string): void {
    if (record.kind === 'task-started') this.tasks.set(record.taskId, { source: record, recordedAt: at })
    else {
      const previous = this.tasks.get(record.taskId)!
      if (record.kind === 'task-model-observed') {
        this.tasks.set(record.taskId, { ...previous, models: [...(previous.models ?? []), record] })
        return
      }
      if (record.kind === 'task-file-input-captured') {
        this.tasks.set(record.taskId, { ...previous, fileInputs: [...(previous.fileInputs ?? []), record] })
        return
      }
      if (record.kind === 'task-file-ancillary-captured') {
        this.tasks.set(record.taskId, { ...previous, fileAncillary: [...(previous.fileAncillary ?? []), record] })
        return
      }
      if (record.kind === 'task-file-evidence-unavailable') {
        this.tasks.set(record.taskId, { ...previous, fileUnavailable: record })
        return
      }
      const key = record.kind === 'task-external-check-prepared' ? 'externalCheckPrepared' : record.kind === 'task-external-check-finished' ? 'externalCheckFinished'
        : record.kind === 'task-admitted' ? 'admission' : record.kind === 'task-finished' ? 'completion' : record.kind === 'task-review-started' ? 'reviewIntent' : 'review'
      this.tasks.set(record.taskId, { ...previous, [key]: record })
    }
  }
}
