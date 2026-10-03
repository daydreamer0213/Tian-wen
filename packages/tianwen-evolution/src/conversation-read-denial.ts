import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'

export const CONVERSATION_READ_DENIAL_SCHEMA_VERSION = 'tianwen.native-read-denial.v1'
export const CONVERSATION_READ_DENIAL_DISPATCH = 'not-dispatched'

const READ_DENIAL_PACKAGE = '@deepseek-ai/dsh-tool-fs'
const READ_DENIAL_VERSION = '0.1.1-rc.2'
const READ_DENIAL_ADAPTER = 'tianwen.file-ancillary.v1'
const IDENTITY_MAX_BYTES = 512
const REASON_MAX_BYTES = 4096
const MAX_PRODUCER_ADMISSIONS = 16
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const ERROR_PREFIX = 'Error: '

export interface ConversationReadDenialIdentity {
  readonly taskId: string
  readonly sessionId: string
  readonly turn: number
  readonly callId: string
  readonly rootCallId: string
}

export interface ConversationReadDenialProducer {
  readonly id: string
  readonly digest: Sha256Digest
}

export interface ConversationReadDenialNativeTool {
  readonly package: '@deepseek-ai/dsh-tool-fs'
  readonly version: '0.1.1-rc.2'
  readonly adapter: 'tianwen.file-ancillary.v1'
}

/**
 * Closed structural binding between one denied native `read` call and its
 * captured native result event. It proves only that a denied read was bound to
 * a matching producer admission inside the caller's verified task window.
 */
export interface ConversationReadDenialReceipt {
  readonly schemaVersion: 'tianwen.native-read-denial.v1'
  readonly identity: ConversationReadDenialIdentity
  readonly callSeq: number
  readonly resultSeq: number
  readonly argumentsDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly producer: ConversationReadDenialProducer
  readonly nativeTool: ConversationReadDenialNativeTool
  readonly reason: string
  readonly dispatch: 'not-dispatched'
}

export interface ConversationReadDenialBinding {
  readonly task: {
    readonly taskId: string
    readonly sessionId: string
    readonly turn: number
    readonly startSeq: number
  }
  readonly boundary: number
  readonly producerAdmissions: readonly ConversationReadDenialProducer[]
  readonly events: readonly unknown[]
}

function fail(message: string): never {
  throw new TypeError(`conversation read denial ${message}`)
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a closed object`)
  }
  const own: readonly (string | symbol)[] = Reflect.ownKeys(value)
  if (own.length !== keys.length) fail(`${label} has invalid fields`)
  const record = value as Record<string, unknown>
  for (const key of keys) {
    if (!Object.hasOwn(record, key) || !own.includes(key)) fail(`${label} is missing ${key}`)
  }
  return record
}

function exactArray(value: unknown, max: number, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  const own: readonly (string | symbol)[] = Reflect.ownKeys(value)
  if (own.length !== value.length + 1 || value.length > max) fail(`${label} has invalid fields`)
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, String(index))) fail(`${label} must have every own index`)
  }
  return value
}

function sameCodeUnits(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (left.charCodeAt(index) !== right.charCodeAt(index)) return false
  }
  return true
}

function isExactUtf8(value: string): boolean {
  return sameCodeUnits(Buffer.from(value, 'utf8').toString('utf8'), value)
}

function requireUtf8Text(value: unknown, label: string, maxBytes: number): string {
  if (typeof value !== 'string' || value.includes('\0')) fail(`${label} must be exact UTF-8 text`)
  if (Buffer.byteLength(value, 'utf8') > maxBytes) fail(`${label} exceeds its byte limit`)
  if (!isExactUtf8(value)) fail(`${label} must be exact UTF-8 text`)
  return value
}

function identityText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    fail(`${label} must be a non-blank identity string`)
  }
  return requireUtf8Text(value, label, IDENTITY_MAX_BYTES)
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} must be a positive safe integer`)
  return value as number
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) fail(`${label} is not a sha256 digest`)
  return value as Sha256Digest
}

function parseIdentity(value: unknown): ConversationReadDenialIdentity {
  const input = exactObject(value, ['taskId', 'sessionId', 'turn', 'callId', 'rootCallId'], 'identity')
  const taskId = identityText(input.taskId, 'identity taskId')
  const sessionId = identityText(input.sessionId, 'identity sessionId')
  const turn = positiveInteger(input.turn, 'identity turn')
  const callId = identityText(input.callId, 'identity callId')
  const rootCallId = identityText(input.rootCallId, 'identity rootCallId')
  if (callId !== rootCallId) fail('identity callId must equal rootCallId')
  return { taskId, sessionId, turn, callId, rootCallId }
}

function parseProducer(value: unknown): ConversationReadDenialProducer {
  const input = exactObject(value, ['id', 'digest'], 'producer')
  return { id: identityText(input.id, 'producer id'), digest: digest(input.digest, 'producer digest') }
}

function parseNativeTool(value: unknown): ConversationReadDenialNativeTool {
  const input = exactObject(value, ['package', 'version', 'adapter'], 'native tool')
  if (input.package !== READ_DENIAL_PACKAGE || input.version !== READ_DENIAL_VERSION
    || input.adapter !== READ_DENIAL_ADAPTER) {
    fail('native tool is not the bound file ancillary definition')
  }
  return { package: READ_DENIAL_PACKAGE, version: READ_DENIAL_VERSION, adapter: READ_DENIAL_ADAPTER }
}

export function parseConversationReadDenialReceipt(value: unknown): ConversationReadDenialReceipt {
  const input = exactObject(value, ['schemaVersion', 'identity', 'callSeq', 'resultSeq', 'argumentsDigest',
    'resultDigest', 'producer', 'nativeTool', 'reason', 'dispatch'], 'receipt')
  if (input.schemaVersion !== CONVERSATION_READ_DENIAL_SCHEMA_VERSION) fail('schema version is invalid')
  if (input.dispatch !== CONVERSATION_READ_DENIAL_DISPATCH) fail('dispatch must be not-dispatched')
  const identity = parseIdentity(input.identity)
  const callSeq = positiveInteger(input.callSeq, 'call sequence')
  const resultSeq = positiveInteger(input.resultSeq, 'result sequence')
  if (callSeq >= resultSeq) fail('call sequence must precede result sequence')
  const reason = requireUtf8Text(input.reason, 'reason', REASON_MAX_BYTES)
  if (reason.length === 0 || reason.trim().length === 0) fail('reason must be a non-blank string')
  return {
    schemaVersion: CONVERSATION_READ_DENIAL_SCHEMA_VERSION,
    identity,
    callSeq,
    resultSeq,
    argumentsDigest: digest(input.argumentsDigest, 'arguments digest'),
    resultDigest: digest(input.resultDigest, 'result digest'),
    producer: parseProducer(input.producer),
    nativeTool: parseNativeTool(input.nativeTool),
    reason,
    dispatch: CONVERSATION_READ_DENIAL_DISPATCH,
  }
}

interface ReadCallState {
  readonly callId: string
  readonly turn: number
  readonly step: number
}

interface ReadResultState {
  readonly turn: number
  readonly step: number
}

function readEvent(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed`)
  return value as Record<string, unknown>
}

function parseCallEvent(event: unknown, receipt: ConversationReadDenialReceipt): ReadCallState {
  const row = readEvent(event, 'native tool call')
  if (row.type !== 'tool/call' || row.seq !== receipt.callSeq) fail('native tool call identity is invalid')
  const data = readEvent(row.data, 'native tool call data')
  if (data.name !== 'read') fail('native tool call is not a read')
  if (data.turn !== receipt.identity.turn) fail('native tool call turn is invalid')
  const step = data.step
  if (!Number.isSafeInteger(step) || (step as number) < 0) fail('native tool call step is invalid')
  if (data.callId !== receipt.identity.callId) fail('native tool call id is invalid')
  if (typeof data.arguments !== 'string') fail('native tool call arguments must be a JSON string')
  let parsedArguments: unknown
  try {
    parsedArguments = JSON.parse(data.arguments)
  } catch {
    fail('native tool call arguments must be valid JSON')
  }
  if (parsedArguments === null || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
    fail('native tool call arguments must be a JSON object')
  }
  const argumentsValue = parsedArguments as Record<string, unknown>
  if (typeof argumentsValue.file_path !== 'string') {
    fail('native tool call file_path must be a string')
  }
  if (sha256(argumentsValue) !== receipt.argumentsDigest) fail('native tool call arguments digest drifted')
  return { callId: data.callId, turn: data.turn as number, step: step as number }
}

function parseResultEvent(event: unknown, receipt: ConversationReadDenialReceipt, call: ReadCallState): ReadResultState {
  const row = readEvent(event, 'native tool result')
  if (row.type !== 'tool/result' || row.seq !== receipt.resultSeq || row.surfaceOp !== 'append') {
    fail('native tool result identity is invalid')
  }
  const sourceEventSeqs = exactArray(row.sourceEventSeqs, 1, 'native tool result source event sequences')
  if (sourceEventSeqs.length !== 1 || sourceEventSeqs[0] !== receipt.callSeq) {
    fail('native tool result source sequence is invalid')
  }
  const data = readEvent(row.data, 'native tool result data')
  if (data.turn !== call.turn || data.step !== call.step) fail('native tool result turn or step drifted')
  if (data.error !== undefined || data.meta !== undefined) fail('native tool result carries an unexpected error or meta')
  const message = readEvent(data.message, 'native tool result message')
  if (message.role !== 'user') fail('native tool result message role is invalid')
  const source = readEvent(message.source, 'native tool result source')
  if (source.kind !== 'tool' || source.callId !== call.callId) fail('native tool result source binding is invalid')
  const content = exactArray(message.content, 1, 'native tool result content')
  if (content.length !== 1) fail('native tool result content must be a single item')
  const item = readEvent(content[0], 'native tool result item')
  if (item.type !== 'tool-result' || item.toolCallId !== call.callId || item.isError !== true) {
    fail('native tool result item binding is invalid')
  }
  const itemContent = exactArray(item.content, 1, 'native tool result item content')
  if (itemContent.length !== 1) fail('native tool result item content must be a single item')
  const text = readEvent(itemContent[0], 'native tool result text')
  if (text.type !== 'text' || text.text !== `${ERROR_PREFIX}${receipt.reason}`) {
    fail('native tool result text does not match the denial reason')
  }
  if (sha256(row) !== receipt.resultDigest) fail('native tool result digest drifted')
  return { turn: data.turn as number, step: data.step as number }
}

function parseAdmissions(value: unknown): readonly ConversationReadDenialProducer[] {
  const list = exactArray(value, MAX_PRODUCER_ADMISSIONS, 'producer admissions')
  const seen = new Set<string>()
  return list.map(entry => {
    const admission = parseProducer(entry)
    if (seen.has(admission.id)) fail('producer admissions must not repeat an id')
    seen.add(admission.id)
    return admission
  })
}

export function verifyConversationReadDenialReceipt(
  value: unknown,
  binding: ConversationReadDenialBinding,
): ConversationReadDenialReceipt {
  const parsed = parseConversationReadDenialReceipt(value)
  if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) fail('binding is malformed')
  const input = exactObject(binding, ['task', 'boundary', 'producerAdmissions', 'events'], 'binding')
  const task = exactObject(input.task, ['taskId', 'sessionId', 'turn', 'startSeq'], 'binding task')
  const taskId = identityText(task.taskId, 'binding taskId')
  const sessionId = identityText(task.sessionId, 'binding sessionId')
  const turn = positiveInteger(task.turn, 'binding turn')
  const startSeq = positiveInteger(task.startSeq, 'binding start sequence')
  const boundary = positiveInteger(input.boundary, 'binding boundary')
  if (startSeq > boundary) fail('binding sequence range is invalid')
  if (!Array.isArray(input.events)) fail('binding events must be an array')
  const events = input.events

  if (parsed.identity.taskId !== taskId || parsed.identity.sessionId !== sessionId
    || parsed.identity.turn !== turn) {
    fail('receipt identity does not match the binding task')
  }
  if (parsed.callSeq < startSeq || parsed.resultSeq > boundary) {
    fail('receipt sequences fall outside the binding range')
  }
  const admissions = parseAdmissions(input.producerAdmissions)
  if (!admissions.some(admission => admission.id === parsed.producer.id
    && admission.digest === parsed.producer.digest)) {
    fail('receipt producer is not admitted for this task')
  }

  const inRange = (row: Record<string, unknown>): boolean => {
    const seq = row.seq
    return Number.isSafeInteger(seq) && (seq as number) >= startSeq && (seq as number) <= boundary
  }
  let call: ReadCallState | undefined
  let result: ReadResultState | undefined
  for (const event of events) {
    const row = readEvent(event, 'native event')
    if (!inRange(row)) continue
    if (row.type === 'tool/call') {
      const data = readEvent(row.data, 'native tool call data')
      if (data.callId !== parsed.identity.callId) continue
      if (call !== undefined) fail('native tool call appears more than once in range')
      call = parseCallEvent(row, parsed)
    } else if (row.type === 'tool/result') {
      const data = readEvent(row.data, 'native tool result data')
      const message = data.message === undefined ? undefined : readEvent(data.message, 'native tool result message')
      const source = message === undefined || message.source === undefined ? undefined
        : readEvent(message.source, 'native tool result source')
      if (source === undefined || source.callId !== parsed.identity.callId) continue
      if (result !== undefined) fail('native tool result appears more than once in range')
      if (call === undefined) fail('native tool result has no preceding native tool call in range')
      result = parseResultEvent(row, parsed, call)
    }
  }
  if (call === undefined || result === undefined) fail('native read call or result is missing from the binding')

  const verified: ConversationReadDenialReceipt = {
    schemaVersion: parsed.schemaVersion,
    identity: { ...parsed.identity },
    callSeq: parsed.callSeq,
    resultSeq: parsed.resultSeq,
    argumentsDigest: parsed.argumentsDigest,
    resultDigest: parsed.resultDigest,
    producer: { ...parsed.producer },
    nativeTool: { ...parsed.nativeTool },
    reason: parsed.reason,
    dispatch: parsed.dispatch,
  }
  return verified
}
