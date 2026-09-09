import { isAbsolute } from 'node:path'
import type { ConversationJudgmentProof } from './conversation-learning.js'
import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'

export interface ConversationFileEntry {
  readonly path: string
  readonly content: string | null
}

export const CONVERSATION_FILE_MAX_COUNT = 8
export const CONVERSATION_FILE_MAX_BYTES = 32768

function pathSegments(path: string): string[] {
  if (path !== path.normalize('NFC') || path.includes('\\')) throw new Error('ambiguous conversation file path')
  const segments = path.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..'
    || segment.endsWith('.') || segment.endsWith(' ')
    || /[<>:"|?*\u0000-\u001f]/u.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) {
    throw new Error('reserved or ambiguous conversation file path')
  }
  return segments
}

export function parseConversationFileEntries(value: unknown): readonly ConversationFileEntry[] {
  if (!Array.isArray(value) || value.length > CONVERSATION_FILE_MAX_COUNT) throw new Error('conversation file material exceeds the file count limit')
  const paths = new Set<string>()
  const spellings = new Map<string, string>()
  let totalBytes = 0
  return value.map(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('invalid conversation file entry')
    const entry = item as Record<string, unknown>
    const keys = Object.keys(entry)
    if (keys.length !== 2 || !keys.includes('path') || !keys.includes('content')
      || typeof entry.path !== 'string' || (typeof entry.content !== 'string' && entry.content !== null)) throw new Error('invalid conversation file entry')
    const segments = pathSegments(entry.path)
    for (let length = 1; length <= segments.length; length++) {
      const spelling = segments.slice(0, length).join('/')
      const alias = spelling.toLowerCase()
      const previous = spellings.get(alias)
      if (previous !== undefined && previous !== spelling) throw new Error('case-aliased conversation file path')
      spellings.set(alias, spelling)
    }
    const alias = entry.path.toLowerCase()
    if (paths.has(alias)) throw new Error('duplicate conversation file path')
    if (segments.slice(0, -1).some((_, index) => paths.has(segments.slice(0, index + 1).join('/').toLowerCase()))
      || [...paths].some(path => path.startsWith(`${alias}/`))) throw new Error('conflicting conversation file path')
    paths.add(alias)
    if (entry.content !== null) {
      if (entry.content.includes('\0')) throw new Error('conversation file content contains NUL')
      const bytes = Buffer.from(entry.content, 'utf8')
      if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== entry.content) throw new Error('conversation file content is not exact UTF-8')
      totalBytes += bytes.byteLength
      if (totalBytes > CONVERSATION_FILE_MAX_BYTES) throw new Error('conversation file material exceeds the byte limit')
    }
    return { path: entry.path, content: entry.content }
  })
}

export interface ConversationTaskFileInput {
  readonly kind: 'task-file-input-captured'
  readonly taskId: string
  readonly callId: string
  readonly callSeq: number
  readonly path: string
  readonly content: string | null
}

export interface ConversationTaskFileUnavailable {
  readonly kind: 'task-file-evidence-unavailable'
  readonly taskId: string
  readonly reason: 'unsupported-tool' | 'unsafe-path' | 'material-unavailable' | 'capture-interrupted'
}

export interface ConversationFileResult {
  readonly schemaVersion: 'tianwen.conversation-file-result.v1'
  readonly outputKind: 'files' | 'chat'
  readonly inputsDigest: Sha256Digest
  readonly captureSeq: number
  readonly outputPaths: readonly string[]
  readonly entries: readonly ConversationFileEntry[]
}

export interface ConversationFileMaterial {
  readonly schemaVersion: 'tianwen.conversation-file-material.v1'
  readonly outputKind: 'files' | 'chat'
  readonly cwd: string
  readonly entries: readonly ConversationFileEntry[]
  readonly outputPaths: readonly string[]
}

export interface ConversationFileTrialOutput {
  readonly answer: string
  readonly files: readonly ConversationFileEntry[]
  readonly outputDigest: Sha256Digest
}

export interface ConversationFileTrialReceipt extends ConversationFileTrialOutput {
  readonly schemaVersion: 'tianwen.conversation-file-trial-receipt.v1'
  readonly outputKind: 'files' | 'chat'
  readonly workerMaterialDigest: Sha256Digest
  readonly executionProof: ConversationJudgmentProof
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('conversation file material has invalid fields')
  return value as Record<string, unknown>
}

function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('conversation file digest is invalid')
  return value as Sha256Digest
}

function proof(value: unknown): ConversationJudgmentProof {
  const input = exactObject(value, ['sessionId', 'sessionDigest', 'requestDigest'])
  if (typeof input.sessionId !== 'string' || input.sessionId.length === 0 || input.sessionId.length > 512) {
    throw new TypeError('conversation file trial proof is invalid')
  }
  return { sessionId: input.sessionId, sessionDigest: digest(input.sessionDigest), requestDigest: digest(input.requestDigest) }
}

export function parseConversationFileTrialReceipt(value: unknown): ConversationFileTrialReceipt {
  const input = exactObject(value, ['schemaVersion', 'outputKind', 'answer', 'files', 'outputDigest', 'workerMaterialDigest', 'executionProof'])
  if (input.schemaVersion !== 'tianwen.conversation-file-trial-receipt.v1'
    || (input.outputKind !== 'files' && input.outputKind !== 'chat')
    || typeof input.answer !== 'string' || Buffer.byteLength(input.answer, 'utf8') > CONVERSATION_FILE_MAX_BYTES
    || (input.outputKind === 'chat' && input.answer.trim().length === 0)) {
    throw new TypeError('conversation file trial receipt is invalid')
  }
  const files = parseConversationFileEntries(input.files)
  const outputDigest = digest(input.outputDigest)
  if (outputDigest !== sha256({ answer: input.answer, files })) throw new TypeError('conversation file trial output digest is invalid')
  return { schemaVersion: input.schemaVersion, outputKind: input.outputKind, answer: input.answer, files,
    outputDigest, workerMaterialDigest: digest(input.workerMaterialDigest), executionProof: proof(input.executionProof) }
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError('conversation file capture boundary is invalid')
  return value as number
}

function outputPaths(value: unknown, entries: readonly ConversationFileEntry[], outputKind: 'files' | 'chat'): readonly string[] {
  if (!Array.isArray(value) || value.length > CONVERSATION_FILE_MAX_COUNT || (outputKind === 'files' && value.length === 0)) throw new TypeError('conversation file outputs are invalid')
  const paths = value.map(path => {
    if (typeof path !== 'string' || !entries.some(entry => entry.path === path)) throw new TypeError('conversation file output is not in the captured material')
    return path
  })
  if (new Set(paths.map(path => path.toLowerCase())).size !== paths.length) throw new TypeError('conversation file outputs must be unique')
  if (outputKind === 'chat' && (paths.length !== 0 || entries.length === 0 || entries.every(entry => entry.content === null))) throw new TypeError('conversation chat file material requires readable inputs and no outputs')
  return paths
}

export function parseConversationFileResult(value: unknown): ConversationFileResult {
  const input = exactObject(value, ['schemaVersion', 'outputKind', 'inputsDigest', 'captureSeq', 'outputPaths', 'entries'])
  const entries = parseConversationFileEntries(input.entries)
  if (input.schemaVersion !== 'tianwen.conversation-file-result.v1') throw new TypeError('conversation file result schema is invalid')
  if (input.outputKind !== 'files' && input.outputKind !== 'chat') throw new TypeError('conversation file output kind is invalid')
  const outputs = outputPaths(input.outputPaths, entries, input.outputKind)
  if (input.outputKind === 'files' && outputs.some(path => entries.find(entry => entry.path === path)?.content === null)) throw new TypeError('conversation file result is missing an output')
  return { schemaVersion: input.schemaVersion, outputKind: input.outputKind, inputsDigest: digest(input.inputsDigest), captureSeq: positiveInteger(input.captureSeq),
    outputPaths: outputs, entries }
}

export function parseConversationFileMaterial(value: unknown): ConversationFileMaterial {
  const input = exactObject(value, ['schemaVersion', 'outputKind', 'cwd', 'entries', 'outputPaths'])
  const entries = parseConversationFileEntries(input.entries)
  if (input.schemaVersion !== 'tianwen.conversation-file-material.v1' || typeof input.cwd !== 'string'
    || input.cwd.trim() === '' || !isAbsolute(input.cwd)) throw new TypeError('conversation file material identity is invalid')
  if (input.outputKind !== 'files' && input.outputKind !== 'chat') throw new TypeError('conversation file output kind is invalid')
  return { schemaVersion: input.schemaVersion, outputKind: input.outputKind, cwd: input.cwd, entries, outputPaths: outputPaths(input.outputPaths, entries, input.outputKind) }
}
