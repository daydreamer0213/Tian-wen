import { isAbsolute } from 'node:path'
import { parseConversationFileEntries, type ConversationFileEntry } from './conversation-files.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import { parseConversationReadDenialReceipt } from './conversation-read-denial.js'
import { CAPTURED_FILE_FACTS_TOOL, capturedFileFacts, type CapturedFileFacts } from './conversation-file-facts.js'
import type { Sha256Digest } from './ledger.js'
import {
  parseConversationSkillAdmission,
  parseConversationSkillDefinition,
  type ConversationSkillAdmission,
} from './conversation-skill-source.js'

const ANCILLARY_RECORD_MAX_COUNT = 16
const ANCILLARY_RECORD_MAX_BYTES = 65536
const ANCILLARY_RESULT_MAX_COUNT = 256
const ANCILLARY_CONTEXT_MAX_BYTES = 24576

export interface ConversationAncillaryProducer {
  readonly package: '@deepseek-ai/dsh-tool-fs-search' | '@deepseek-ai/dsh-tool-skill' | '@deepseek-ai/dsh-tool-pwsh' | '@deepseek-ai/dsh-tool-fs' | '@tianwen/runtime-bundle'
  readonly version: '0.1.1-rc.2' | '1'
  readonly adapter: 'tianwen.file-ancillary.v1' | 'tianwen.captured-file-facts.v1' | 'tianwen.pwsh-denial.v1'
}

export type ConversationAncillaryPayload =
  | { readonly tool: 'glob'; readonly root: string; readonly paths: readonly string[]; readonly nativeValueJson?: string }
  | { readonly tool: 'grep'; readonly matches: readonly { readonly path: string; readonly lineNumber: number; readonly line: string }[]; readonly nativeValueJson?: string }
  | { readonly tool: 'skill'; readonly reference: ConversationSkillAdmission; readonly definition: Readonly<Record<string, unknown>> }
  | { readonly tool: 'pwsh'; readonly nativeReceiptJson: string; readonly nativeValueJson: string }
  | { readonly tool: 'pwsh-denied'; readonly nativeDenialJson: string }
  | { readonly tool: 'read-denied'; readonly nativeDenialJson: string }
  | { readonly tool: typeof CAPTURED_FILE_FACTS_TOOL; readonly facts: CapturedFileFacts; readonly inputDigest: Sha256Digest }

export interface ConversationTaskFileAncillary {
  readonly kind: 'task-file-ancillary-captured'
  readonly taskId: string
  readonly callId: string
  readonly callSeq: number
  readonly resultSeq: number
  readonly argumentsDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly valueDigest: Sha256Digest
  readonly producer: ConversationAncillaryProducer
  readonly payload: ConversationAncillaryPayload
}

export interface ConversationFileAncillaryContext {
  readonly schemaVersion: 'tianwen.file-ancillary-context.v1' | 'tianwen.file-ancillary-context.v2'
  readonly methods: readonly {
    readonly reference: ConversationSkillAdmission
    readonly definition: Readonly<Record<string, unknown>>
  }[]
  readonly positiveLocations: readonly {
    readonly path: string
    readonly inputDigest: Sha256Digest
    readonly lines: readonly number[]
  }[]
  readonly facts?: readonly CapturedFileFacts[]
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('conversation file ancillary has invalid fields')
  }
  return value as Record<string, unknown>
}

function exactArray(value: unknown, max: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max
    || Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length) {
    throw new TypeError(`conversation file ancillary ${label} exceeds its count limit`)
  }
  return value
}

function exactUtf8(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.includes('\0')) {
    throw new TypeError(`conversation file ancillary ${label} text is invalid`)
  }
  const bytes = Buffer.from(value, 'utf8')
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== value) {
    throw new TypeError(`conversation file ancillary ${label} is not exact UTF-8`)
  }
  return value
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`conversation file ancillary ${label} sequence or line is invalid`)
  }
  return value as number
}

function identity(value: unknown, label: string): string {
  const parsed = exactUtf8(value, label)
  if (parsed.trim().length === 0 || Buffer.byteLength(parsed, 'utf8') > 512) {
    throw new TypeError(`conversation file ancillary ${label} is invalid or exceeds its text limit`)
  }
  return parsed
}

function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError('conversation file ancillary digest is invalid')
  }
  return value as Sha256Digest
}

function parseMetadataPath(value: unknown): string {
  const path = exactUtf8(value, 'path')
  parseConversationFileEntries([{ path, content: null }])
  return path
}

function assertConsistentPaths(paths: readonly string[], duplicateAllowed = false): void {
  const spellings = new Map<string, string>()
  const complete = new Set<string>()
  for (const path of paths) {
    const segments = path.split('/')
    for (let length = 1; length <= segments.length; length++) {
      const spelling = segments.slice(0, length).join('/')
      const alias = spelling.toLowerCase()
      const previous = spellings.get(alias)
      if (previous !== undefined && previous !== spelling) throw new TypeError('case-aliased conversation ancillary path')
      spellings.set(alias, spelling)
    }
    const alias = path.toLowerCase()
    if ((!duplicateAllowed && complete.has(alias))
      || segments.slice(0, -1).some((_, index) => complete.has(segments.slice(0, index + 1).join('/').toLowerCase()))
      || [...complete].some(previous => previous.startsWith(`${alias}/`))) {
      throw new TypeError('duplicate or conflicting conversation ancillary path')
    }
    complete.add(alias)
  }
}

function parseProducer(value: unknown): ConversationAncillaryProducer {
  const input = exactObject(value, ['package', 'version', 'adapter'])
  if (input.package === '@tianwen/runtime-bundle' && input.version === '1'
    && (input.adapter === 'tianwen.captured-file-facts.v1' || input.adapter === 'tianwen.pwsh-denial.v1')) {
    return { package: input.package, version: input.version, adapter: input.adapter }
  }
  if ((input.package !== '@deepseek-ai/dsh-tool-fs-search' && input.package !== '@deepseek-ai/dsh-tool-skill'
      && input.package !== '@deepseek-ai/dsh-tool-pwsh' && input.package !== '@deepseek-ai/dsh-tool-fs')
    || input.version !== '0.1.1-rc.2' || input.adapter !== 'tianwen.file-ancillary.v1') {
    throw new TypeError('conversation file ancillary producer is invalid')
  }
  return { package: input.package, version: input.version, adapter: input.adapter }
}

function canonicalObjectJson(value: unknown, label: string): string {
  const json = exactUtf8(value, label)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new TypeError(`conversation file ancillary ${label} is not valid canonical JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || canonicalJson(parsed) !== json) {
    throw new TypeError(`conversation file ancillary ${label} must be a canonical JSON object`)
  }
  return json
}

function parsePayload(value: unknown): ConversationAncillaryPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'tool')) {
    throw new TypeError('conversation file ancillary payload has invalid fields')
  }
  const tool = (value as Record<string, unknown>).tool
  const nativeKeys = Object.hasOwn(value, 'nativeValueJson') ? ['nativeValueJson'] : []
  if (tool === 'glob') {
    const input = exactObject(value, ['tool', 'root', 'paths', ...nativeKeys])
    const root = exactUtf8(input.root, 'root')
    if (!isAbsolute(root)) throw new TypeError('conversation file ancillary glob root must be absolute')
    const paths = exactArray(input.paths, ANCILLARY_RESULT_MAX_COUNT, 'glob path').map(parseMetadataPath)
    assertConsistentPaths(paths)
    return { tool, root, paths, ...(nativeKeys.length === 0 ? {} : { nativeValueJson: canonicalObjectJson(input.nativeValueJson, 'native value JSON') }) }
  }
  if (tool === 'grep') {
    const input = exactObject(value, ['tool', 'matches', ...nativeKeys])
    const matches = exactArray(input.matches, ANCILLARY_RESULT_MAX_COUNT, 'grep match').map(value => {
      const match = exactObject(value, ['path', 'lineNumber', 'line'])
      return { path: parseMetadataPath(match.path), lineNumber: positiveInteger(match.lineNumber, 'line'),
        line: exactUtf8(match.line, 'line', true) }
    })
    assertConsistentPaths([...new Set(matches.map(match => match.path))])
    return { tool, matches, ...(nativeKeys.length === 0 ? {} : { nativeValueJson: canonicalObjectJson(input.nativeValueJson, 'native value JSON') }) }
  }
  if (tool === 'skill') {
    const input = exactObject(value, ['tool', 'reference', 'definition'])
    const reference = parseConversationSkillAdmission(input.reference)
    return { tool, reference, definition: parseConversationSkillDefinition(input.definition, reference) }
  }
  if (tool === 'pwsh') {
    const input = exactObject(value, ['tool', 'nativeReceiptJson', 'nativeValueJson'])
    return { tool, nativeReceiptJson: canonicalObjectJson(input.nativeReceiptJson, 'native receipt JSON'),
      nativeValueJson: canonicalObjectJson(input.nativeValueJson, 'native value JSON') }
  }
  if (tool === 'pwsh-denied') {
    const input = exactObject(value, ['tool', 'nativeDenialJson'])
    return { tool, nativeDenialJson: canonicalObjectJson(input.nativeDenialJson, 'native denial JSON') }
  }
  if (tool === 'read-denied') {
    const input = exactObject(value, ['tool', 'nativeDenialJson'])
    const nativeDenialJson = canonicalObjectJson(input.nativeDenialJson, 'native read denial JSON')
    parseConversationReadDenialReceipt(JSON.parse(nativeDenialJson))
    return { tool, nativeDenialJson }
  }
  if (tool === CAPTURED_FILE_FACTS_TOOL) {
    const input = exactObject(value, ['tool', 'facts', 'inputDigest'])
    const facts = exactObject(input.facts, ['path', 'bytes', 'lines', 'sha256'])
    const path = parseMetadataPath(facts.path)
    if (!Number.isSafeInteger(facts.bytes) || (facts.bytes as number) < 0 || !Number.isSafeInteger(facts.lines) || (facts.lines as number) < 0
      || typeof facts.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(facts.sha256)) throw new TypeError('conversation file facts are invalid')
    return { tool, facts: { path, bytes: facts.bytes as number, lines: facts.lines as number, sha256: facts.sha256 }, inputDigest: digest(input.inputDigest) }
  }
  throw new TypeError('conversation file ancillary payload tool is invalid')
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8')
}

export function parseConversationTaskFileAncillary(value: unknown): ConversationTaskFileAncillary {
  const input = exactObject(value, ['kind', 'taskId', 'callId', 'callSeq', 'resultSeq', 'argumentsDigest', 'resultDigest', 'valueDigest', 'producer', 'payload'])
  if (input.kind !== 'task-file-ancillary-captured') throw new TypeError('conversation file ancillary kind is invalid')
  const producer = parseProducer(input.producer)
  const payload = parsePayload(input.payload)
  const expectedPackage = payload.tool === 'skill' ? '@deepseek-ai/dsh-tool-skill'
    : payload.tool === 'pwsh' ? '@deepseek-ai/dsh-tool-pwsh' : payload.tool === 'read-denied' ? '@deepseek-ai/dsh-tool-fs'
      : payload.tool === CAPTURED_FILE_FACTS_TOOL || payload.tool === 'pwsh-denied' ? '@tianwen/runtime-bundle' : '@deepseek-ai/dsh-tool-fs-search'
  if (producer.package !== expectedPackage) throw new TypeError('conversation file ancillary producer does not match its tool')
  if (payload.tool === 'pwsh-denied' && producer.adapter !== 'tianwen.pwsh-denial.v1') throw new TypeError('conversation file denial producer is invalid')
  if (payload.tool === CAPTURED_FILE_FACTS_TOOL && producer.adapter !== 'tianwen.captured-file-facts.v1') throw new TypeError('conversation file facts producer is invalid')
  const result: ConversationTaskFileAncillary = {
    kind: input.kind, taskId: identity(input.taskId, 'task identity'), callId: identity(input.callId, 'call identity'),
    callSeq: positiveInteger(input.callSeq, 'call'), resultSeq: positiveInteger(input.resultSeq, 'result'),
    argumentsDigest: digest(input.argumentsDigest), resultDigest: digest(input.resultDigest), valueDigest: digest(input.valueDigest),
    producer, payload,
  }
  if (result.callSeq >= result.resultSeq) throw new TypeError('conversation file ancillary call/result sequence is invalid')
  if (payload.tool === 'read-denied') {
    const receipt = parseConversationReadDenialReceipt(JSON.parse(payload.nativeDenialJson))
    if (receipt.identity.taskId !== result.taskId || receipt.identity.callId !== result.callId
      || receipt.callSeq !== result.callSeq || receipt.resultSeq !== result.resultSeq
      || receipt.argumentsDigest !== result.argumentsDigest || receipt.resultDigest !== result.resultDigest
      || sha256(receipt) !== result.valueDigest || sha256(receipt.nativeTool) !== sha256(producer)) {
      throw new TypeError('conversation native read denial record binding is invalid')
    }
  }
  if (serializedBytes(result) > ANCILLARY_RECORD_MAX_BYTES) throw new TypeError('conversation file ancillary record exceeds the byte limit')
  return result
}

function splitNativeLines(content: string): readonly string[] {
  // ripgrep removes only a file-leading UTF-8 BOM before returning match lines.
  // This comparison view never replaces captured content or its input digest.
  return (content.startsWith('\uFEFF') ? content.slice(1) : content).split(/\r\n|\n/u)
}

export function parseConversationFileAncillaryContext(
  value: unknown,
  entries: readonly ConversationFileEntry[],
): ConversationFileAncillaryContext {
  const captured = parseConversationFileEntries(entries)
  const row = value as Record<string, unknown>
  const version = row?.schemaVersion
  const input = exactObject(value, version === 'tianwen.file-ancillary-context.v2'
    ? ['schemaVersion', 'methods', 'positiveLocations', 'facts'] : ['schemaVersion', 'methods', 'positiveLocations'])
  if (input.schemaVersion !== 'tianwen.file-ancillary-context.v1' && input.schemaVersion !== 'tianwen.file-ancillary-context.v2') throw new TypeError('conversation file ancillary context version is invalid')
  const methodKeys = new Set<string>()
  const methods = exactArray(input.methods, ANCILLARY_RECORD_MAX_COUNT, 'context method').map(value => {
    const method = exactObject(value, ['reference', 'definition'])
    const reference = parseConversationSkillAdmission(method.reference)
    const parsed = { reference, definition: parseConversationSkillDefinition(method.definition, reference) }
    const key = canonicalJson(parsed.reference)
    if (methodKeys.has(key)) throw new TypeError('conversation file ancillary context methods must be unique')
    methodKeys.add(key)
    return parsed
  })
  const locationPaths: string[] = []
  const positiveLocations = exactArray(input.positiveLocations, 4096, 'positive location').map(value => {
    const location = exactObject(value, ['path', 'inputDigest', 'lines'])
    const path = parseMetadataPath(location.path)
    const entry = captured.find(item => item.path === path)
    if (entry?.content === null || entry === undefined) throw new TypeError('conversation file ancillary positive location requires readable captured input')
    const content = entry.content
    const inputDigest = digest(location.inputDigest)
    if (inputDigest !== sha256({ path, content })) throw new TypeError('conversation file ancillary positive location input digest is invalid')
    const lines = exactArray(location.lines, 4096, 'positive line').map(item => positiveInteger(item, 'line'))
    if (lines.length === 0 || new Set(lines).size !== lines.length
      || lines.some((line, index) => index > 0 && lines[index - 1]! >= line)
      || lines.some(line => line > splitNativeLines(content).length)) {
      throw new TypeError('conversation file ancillary positive lines are not canonical')
    }
    locationPaths.push(path)
    return { path, inputDigest, lines }
  })
  assertConsistentPaths(locationPaths)
  const facts = input.schemaVersion === 'tianwen.file-ancillary-context.v2'
    ? exactArray(input.facts, ANCILLARY_RECORD_MAX_COUNT, 'facts').map(value => {
      const row = exactObject(value, ['path', 'bytes', 'lines', 'sha256'])
      const path = parseMetadataPath(row.path)
      const entry = captured.find(item => item.path === path)
      if (entry?.content === null || entry === undefined || sha256(row) !== sha256(capturedFileFacts(entry))) throw new TypeError('conversation file facts do not match captured input')
      return capturedFileFacts(entry)
    }) : []
  if (new Set(facts.map(item => item.path.toLowerCase())).size !== facts.length) throw new TypeError('duplicate conversation file facts')
  if (methods.length === 0 && positiveLocations.length === 0 && facts.length === 0) throw new TypeError('conversation file ancillary context cannot be blank')
  const context: ConversationFileAncillaryContext = { schemaVersion: input.schemaVersion, methods, positiveLocations,
    ...(input.schemaVersion === 'tianwen.file-ancillary-context.v2' ? { facts } : {}) }
  if (serializedBytes(context) > ANCILLARY_CONTEXT_MAX_BYTES) throw new TypeError('conversation file ancillary context exceeds the byte limit')
  return context
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function projectConversationFileAncillaryContext(
  records: readonly ConversationTaskFileAncillary[],
  entries: readonly ConversationFileEntry[],
): ConversationFileAncillaryContext | undefined {
  const captured = parseConversationFileEntries(entries)
  const parsed = exactArray(records, ANCILLARY_RECORD_MAX_COUNT, 'record').map(parseConversationTaskFileAncillary)
  const callIds = new Set<string>()
  const eventSequences = new Set<number>()
  const taskIds = new Set<string>()
  for (const record of parsed) {
    if (callIds.has(record.callId) || eventSequences.has(record.callSeq) || eventSequences.has(record.resultSeq)) {
      throw new TypeError('conversation file ancillary record identity is not unique')
    }
    callIds.add(record.callId); eventSequences.add(record.callSeq); eventSequences.add(record.resultSeq); taskIds.add(record.taskId)
  }
  if (taskIds.size > 1) throw new TypeError('conversation file ancillary records must belong to one task')

  const methodsByReference = new Map<string, { readonly reference: ConversationSkillAdmission; readonly definition: Readonly<Record<string, unknown>> }>()
  const positiveLines = new Map<string, Set<number>>()
  const factsByPath = new Map<string, CapturedFileFacts>()
  for (const record of parsed) {
    if (record.payload.tool === 'skill') {
      methodsByReference.set(canonicalJson(record.payload.reference), { reference: record.payload.reference, definition: record.payload.definition })
      continue
    }
    if (record.payload.tool === CAPTURED_FILE_FACTS_TOOL) {
      const path = record.payload.facts.path
      const entry = captured.find(item => item.path === path)
      if (entry?.content === null || entry === undefined || record.payload.inputDigest !== sha256(entry)
        || sha256(record.payload.facts) !== sha256(capturedFileFacts(entry))) throw new TypeError('conversation file facts do not match preimage')
      factsByPath.set(path, capturedFileFacts(entry))
      continue
    }
    if (record.payload.tool !== 'grep') continue
    for (const match of record.payload.matches) {
      const entry = captured.find(item => item.path === match.path)
      if (entry?.content === null || entry === undefined) throw new TypeError('conversation ancillary grep match requires readable captured input')
      if (splitNativeLines(entry.content)[match.lineNumber - 1] !== match.line) {
        throw new TypeError('conversation ancillary grep line does not match the complete captured input')
      }
      const lines = positiveLines.get(match.path) ?? new Set<number>()
      lines.add(match.lineNumber); positiveLines.set(match.path, lines)
    }
  }
  const methods = [...methodsByReference.values()].sort((left, right) => compareText(canonicalJson(left.reference), canonicalJson(right.reference)))
  const positiveLocations = [...positiveLines].sort(([left], [right]) => compareText(left, right)).map(([path, lines]) => {
    const content = captured.find(entry => entry.path === path)!.content!
    return { path, inputDigest: sha256({ path, content }), lines: [...lines].sort((left, right) => left - right) }
  })
  if (methods.length === 0 && positiveLocations.length === 0 && factsByPath.size === 0) return undefined
  const facts = [...factsByPath.values()].sort((left, right) => compareText(left.path, right.path))
  return parseConversationFileAncillaryContext({ schemaVersion: facts.length === 0 ? 'tianwen.file-ancillary-context.v1' : 'tianwen.file-ancillary-context.v2',
    methods, positiveLocations, ...(facts.length === 0 ? {} : { facts }) }, captured)
}
