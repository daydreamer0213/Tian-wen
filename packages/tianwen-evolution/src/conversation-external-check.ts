import { parseConversationFileEntries, type ConversationFileEntry } from './conversation-files.js'
import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'
import type { ConversationAdmissionDecision, ConversationTask } from './conversation-learning.js'

export interface ConversationExternalCheckPrepared {
  readonly kind: 'task-external-check-prepared'
  readonly taskId: string
  readonly preparedSeq: number
  readonly requestDigest: Sha256Digest
  readonly contextDigest: Sha256Digest
  readonly admissionDigest: Sha256Digest
  readonly modelConfigDigest: Sha256Digest
  readonly checkerId: string
  readonly checkerDigest: Sha256Digest
  readonly contractDigest: Sha256Digest
  readonly inputsDigest: Sha256Digest
}

export interface ConversationExternalCheckOutcome {
  /** Result of this specific check, never an automatic task/learning permission. */
  readonly status: 'verified' | 'rejected' | 'unverifiable'
  readonly detail: string
}

export interface ConversationExternalCheckFinished extends ConversationExternalCheckOutcome {
  readonly kind: 'task-external-check-finished'
  readonly taskId: string
  readonly preparationDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly fileResultDigest: Sha256Digest | null
}

/** Host-check applicability only; never a task verdict or learning permission. */
export function supportsConversationCodeCheck(decision: ConversationAdmissionDecision | null | undefined): boolean {
  return decision?.kind === 'task' && decision.family === 'code'
    && (decision.evaluationMode === 'external' || decision.evaluationMode === 'local-files' && decision.fileOutputKind === 'files')
}

/** A configured check may not contradict new successful counterevidence.
 * This does not establish a task verdict; unconfigured tasks keep their rules. */
export function hasSatisfiedConversationCodeCheck(task: ConversationTask | undefined): boolean {
  return task !== undefined && (task.externalCheckPrepared === undefined || task.externalCheckFinished?.status === 'verified')
}

function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('invalid external check fields')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > max) throw new TypeError('invalid external check text')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('invalid external check digest')
  return value as Sha256Digest
}
export function conversationExternalInputsDigest(value: readonly ConversationFileEntry[]): Sha256Digest {
  const entries = parseConversationFileEntries(value)
  if (entries.length === 0) throw new TypeError('external check requires frozen target inputs')
  return sha256([...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
export function parseConversationExternalCheckOutcome(value: unknown): ConversationExternalCheckOutcome {
  const row = fields(value, ['status', 'detail'])
  if (typeof row.status !== 'string' || !['verified', 'rejected', 'unverifiable'].includes(row.status)) throw new TypeError('invalid external check status')
  return { status: row.status as ConversationExternalCheckOutcome['status'], detail: text(row.detail, 4096) }
}
export function parseConversationExternalCheck(value: unknown): ConversationExternalCheckPrepared | ConversationExternalCheckFinished {
  const kind = (value as { kind?: unknown } | null)?.kind
  if (kind === 'task-external-check-prepared') {
    const row = fields(value, ['kind', 'taskId', 'preparedSeq', 'requestDigest', 'contextDigest', 'admissionDigest', 'modelConfigDigest', 'checkerId', 'checkerDigest', 'contractDigest', 'inputsDigest'])
    if (!Number.isSafeInteger(row.preparedSeq) || (row.preparedSeq as number) < 1) throw new TypeError('invalid external check boundary')
    return { kind, taskId: text(row.taskId, 512), preparedSeq: row.preparedSeq as number,
      requestDigest: digest(row.requestDigest), contextDigest: digest(row.contextDigest), admissionDigest: digest(row.admissionDigest),
      modelConfigDigest: digest(row.modelConfigDigest), checkerId: text(row.checkerId, 512), checkerDigest: digest(row.checkerDigest),
      contractDigest: digest(row.contractDigest), inputsDigest: digest(row.inputsDigest) }
  }
  if (kind !== 'task-external-check-finished') throw new TypeError('invalid external check kind')
  const row = fields(value, ['kind', 'taskId', 'preparationDigest', 'resultDigest', 'fileResultDigest', 'status', 'detail'])
  return { kind, taskId: text(row.taskId, 512), preparationDigest: digest(row.preparationDigest), resultDigest: digest(row.resultDigest),
    fileResultDigest: row.fileResultDigest === null ? null : digest(row.fileResultDigest),
    ...parseConversationExternalCheckOutcome({ status: row.status, detail: row.detail }) }
}

export function validateConversationExternalCheck(record: ConversationExternalCheckPrepared | ConversationExternalCheckFinished, task: ConversationTask): void {
  const decision = task.admission?.decision
  if (!supportsConversationCodeCheck(decision)) throw new Error('external check requires file code admission')
  if (record.kind === 'task-external-check-prepared') {
    if (task.completion !== undefined || (task.models?.length ?? 0) > 0 || (task.fileInputs?.length ?? 0) > 0
      || task.fileUnavailable !== undefined || (task.fileAncillary?.length ?? 0) > 0) throw new Error('external check must be prepared before the candidate or file execution')
    if (record.preparedSeq < task.source.startSeq || record.requestDigest !== task.source.requestDigest
      || record.contextDigest !== task.source.contextDigest || record.admissionDigest !== sha256(task.admission)) throw new Error('external check preparation does not match the original task')
    return
  }
  const prepared = task.externalCheckPrepared, completion = task.completion
  if (prepared === undefined || completion === undefined || record.preparationDigest !== sha256(prepared)
    || record.resultDigest !== completion.resultDigest || record.fileResultDigest !== (completion.files === undefined ? null : sha256(completion.files))) {
    throw new Error('external check result does not match its preparation and task result')
  }
  if (record.status === 'unverifiable') return
  if (completion.status !== 'completed' || completion.files?.outputKind !== 'files' || task.fileUnavailable !== undefined
    || (task.models?.length ?? 0) === 0 || task.models!.some(model => model.modelConfigDigest !== prepared.modelConfigDigest)
    || (task.fileInputs?.length ?? 0) === 0 || task.fileInputs!.some(input => input.callSeq <= prepared.preparedSeq)
    || prepared.preparedSeq >= completion.endSeq
    || conversationExternalInputsDigest(task.fileInputs!.map(({ path, content }) => ({ path, content }))) !== prepared.inputsDigest) throw new Error('external check cannot conclude from changed or missing task evidence')
}
