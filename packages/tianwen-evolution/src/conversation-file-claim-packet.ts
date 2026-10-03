import { parseConversationFileEntries, parseConversationFileMaterial } from './conversation-files.js'
import { canonicalJson, sha256 } from './learning-intake.js'

export type ClaimRole = 'user' | 'assistant' | 'tool' | 'answer' | 'host'
export type ClaimOrigin = 'context' | 'request' | 'tool' | 'answer'
export type ClaimStage = 'initial' | 'final'
export type ClaimToolStatus = 'success' | 'error'

export interface ConversationFileClaimEvidenceItem {
  readonly id: string
  readonly role: ClaimRole
  readonly origin: ClaimOrigin
  readonly text: string
  readonly toolStatus?: ClaimToolStatus
  readonly filePath?: string
  readonly fileStage?: ClaimStage
}
export interface ConversationFileClaimEvidence {
  readonly schemaVersion: 'tianwen.claim-evidence.v2'
  readonly items: readonly ConversationFileClaimEvidenceItem[]
  readonly evidenceDigest: string
}
export interface ConversationFileClaimReference {
  readonly evidenceIds: readonly string[]
}
export interface ConversationFileClaimPacket {
  readonly schemaVersion: 'tianwen.file-claim-review-packet.v1'
  readonly original: Readonly<Record<string, unknown>>
  readonly claimEvidence: ConversationFileClaimEvidence
  readonly originalDigest: string
}
export interface ConversationFileClaimRecovery {
  readonly original: Readonly<Record<string, unknown>>
  readonly claimEvidence: ConversationFileClaimEvidence
}

/** Pure data codec: stores and restores JSON only. It does not authenticate
 * evidence provenance, grant tool permissions, judge source authority, or
 * assign task success or learning. */
const MAX = 512 * 1024
const PACKET = 'tianwen.file-claim-review-packet.v1'
const EVIDENCE = 'tianwen.claim-evidence.v2'
const DIGEST = /^sha256:[a-f0-9]{64}$/
const ITEM_ID = /^(context|request|tool|answer)-([1-9][0-9]*)$/
const ROLES = new Set(['user', 'assistant', 'tool', 'answer', 'host'])
const ORIGINS = new Set(['context', 'request', 'tool', 'answer'])
const ITEM_KEYS = new Set(['id', 'role', 'origin', 'text', 'toolStatus', 'filePath', 'fileStage'])
const REQUIRED = ['id', 'role', 'origin', 'text']

type Entry = { readonly path: string; readonly content: string | null }
interface Index {
  readonly evidence: ConversationFileClaimEvidence
  readonly initial: ReadonlyMap<string, readonly ConversationFileClaimEvidenceItem[]>
  readonly final: ReadonlyMap<string, readonly ConversationFileClaimEvidenceItem[]>
}

const fail = (message: string): never => { throw new TypeError(message) }
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')
const bound = (value: unknown, label: string): void => { if (bytes(value) > MAX) fail(`${label} exceeds 512KiB`) }

function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (i + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

function keyIndex(key: string): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return undefined
  const index = Number(key)
  return Number.isSafeInteger(index) && index >= 0 && index < 2 ** 32 - 1 ? index : undefined
}

/** Reject anything JSON cannot carry losslessly, then clone the accepted graph. */
function clone(value: unknown, label: string, seen: Set<object>): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return wellFormed(value) ? value : fail(`${label} is not well-formed UTF-16`)
  if (typeof value === 'number') return Number.isFinite(value) ? value : fail(`${label} is not finite`)
  if (typeof value !== 'object') return fail(`${label} is not JSON data`)
  if (seen.has(value)) return fail(`${label} contains a cycle`)
  seen.add(value)
  try { return Array.isArray(value) ? cloneArray(value, label, seen) : cloneObject(value, label, seen) }
  finally { seen.delete(value) }
}

function cloneArray(value: readonly unknown[], label: string, seen: Set<object>): unknown[] {
  const length = value.length, slots = new Map<number, unknown>()
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || key === 'length') continue
    if (typeof key === 'symbol') return fail(`${label} has a symbol key`)
    if (!wellFormed(key)) return fail(`${label} has a malformed UTF-16 key`)
    if (descriptor.get !== undefined || descriptor.set !== undefined) return fail(`${label} has an accessor`)
    if (!descriptor.enumerable) return fail(`${label} has a hidden property`)
    const index = keyIndex(key)
    if (index === undefined || index >= length) return fail(`${label} has an unexpected key`)
    slots.set(index, descriptor.value)
  }
  const result: unknown[] = new Array(length)
  for (let i = 0; i < length; i++) {
    if (!slots.has(i)) return fail(`${label} is sparse`)
    result[i] = clone(slots.get(i), `${label}[${i}]`, seen)
  }
  return result
}

function cloneObject(value: object, label: string, seen: Set<object>): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return fail(`${label} has an unexpected prototype`)
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) continue
    if (typeof key === 'symbol') return fail(`${label} has a symbol key`)
    if (!wellFormed(key)) return fail(`${label} has a malformed UTF-16 key`)
    if (descriptor.get !== undefined || descriptor.set !== undefined) return fail(`${label} has an accessor`)
    if (!descriptor.enumerable) return fail(`${label} has a hidden property`)
    Object.defineProperty(result, key, { value: clone(descriptor.value, `${label}.${key}`, seen), enumerable: true, writable: true, configurable: true })
  }
  return result
}

/** The existing conversation-files parser stays authoritative for file rules. */
function readOriginal(original: unknown): { ownerKey: 'source' | 'task'; materialEntries: readonly Entry[]; outputPaths: readonly string[]; resultFiles: readonly Entry[] } {
  if (!plain(original)) return fail('original must be a JSON object')
  const hasSource = Object.hasOwn(original, 'source'), hasTask = Object.hasOwn(original, 'task')
  if (hasSource === hasTask) return fail('original must declare exactly one of source or task')
  const ownerKey = hasSource ? 'source' as const : 'task' as const
  const owner = original[ownerKey]
  if (!plain(owner)) return fail('review data must be a JSON object')
  const material = parseConversationFileMaterial(owner.files)
  if (material.outputKind !== 'files') return fail('material must use the files output kind')
  if (owner.hostProject !== undefined && (!plain(owner.hostProject) || !exact(owner.hostProject, ['observedPaths'])
    || !Array.isArray(owner.hostProject.observedPaths) || owner.hostProject.observedPaths.length === 0
    || new Set(owner.hostProject.observedPaths).size !== owner.hostProject.observedPaths.length
    || owner.hostProject.observedPaths.some(path => !material.entries.some(entry => entry.path === path)))) return fail('host project provenance is invalid')
  const result = original.fileResult
  if (!plain(result) || !exact(result, ['answer', 'files', 'outputDigest'])) return fail('fileResult must be exactly answer/files/outputDigest')
  const answer = result.answer
  if (typeof answer !== 'string') return fail('fileResult answer must be a string')
  const resultFiles = parseConversationFileEntries(result.files)
  const digest = result.outputDigest
  if (typeof digest !== 'string' || !DIGEST.test(digest) || digest !== sha256({ answer, files: resultFiles })) return fail('fileResult outputDigest is invalid')
  if (resultFiles.length !== material.entries.length) return fail('fileResult paths must match the initial material')
  resultFiles.forEach((entry, i) => { if (entry.path !== material.entries[i]!.path) return fail('fileResult paths must keep initial order') })
  const byPath = new Map(resultFiles.map(entry => [entry.path, entry]))
  for (const path of material.outputPaths) {
    const entry = byPath.get(path)
    if (entry === undefined || entry.content === null) return fail('every declared output must be present')
  }
  return { ownerKey, materialEntries: material.entries, outputPaths: material.outputPaths, resultFiles }
}

function readEvidence(value: unknown): Index {
  if (!plain(value) || !exact(value, ['schemaVersion', 'items', 'evidenceDigest'])) return fail('evidence must be exactly schemaVersion/items/evidenceDigest')
  if (value.schemaVersion !== EVIDENCE) return fail('evidence schema is invalid')
  const items = value.items
  if (!Array.isArray(items)) return fail('evidence items must be an array')
  const ids = new Set<string>()
  const initial = new Map<string, ConversationFileClaimEvidenceItem[]>(), final = new Map<string, ConversationFileClaimEvidenceItem[]>()
  for (const raw of items) {
    if (!plain(raw)) return fail('evidence item must be a JSON object')
    for (const key of Object.keys(raw)) if (!ITEM_KEYS.has(key)) return fail('evidence item has an unknown field')
    for (const key of REQUIRED) if (!Object.hasOwn(raw, key)) return fail('evidence item is missing a required field')
    const item = raw as { id: unknown; role: unknown; origin: unknown; text: unknown; filePath?: unknown; fileStage?: unknown; toolStatus?: unknown }
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.role !== 'string' || typeof item.origin !== 'string') return fail('evidence item scalars are invalid')
    const match = ITEM_ID.exec(item.id)
    if (match === null || match[1] !== item.origin || !ROLES.has(item.role) || !ORIGINS.has(item.origin)) return fail('evidence item identity is invalid')
    if (ids.has(item.id)) return fail('evidence item ids must be unique')
    ids.add(item.id)
    if (Object.hasOwn(raw, 'toolStatus') && item.toolStatus !== 'success' && item.toolStatus !== 'error') return fail('evidence toolStatus is invalid')
    const hasPath = Object.hasOwn(raw, 'filePath'), hasStage = Object.hasOwn(raw, 'fileStage')
    if (item.role === 'host' && (!hasPath || item.fileStage !== 'initial' || item.origin !== 'context' || Object.hasOwn(raw, 'toolStatus'))) return fail('host file provenance is invalid')
    if (hasPath !== hasStage) return fail('filePath and fileStage must be present together')
    if (hasPath) {
      if (typeof item.filePath !== 'string') return fail('evidence filePath must be a string')
      if (item.fileStage !== 'initial' && item.fileStage !== 'final') return fail('evidence fileStage is invalid')
      if (item.fileStage === 'initial' ? !(item.role === 'tool' && item.origin === 'tool' || item.role === 'host' && item.origin === 'context' && item.toolStatus === undefined)
        : (item.role !== 'answer' || item.origin !== 'answer')) return fail('file evidence role/origin is invalid')
      const target = item.fileStage === 'initial' ? initial : final
      const list = target.get(item.filePath)
      if (list === undefined) target.set(item.filePath, [raw as unknown as ConversationFileClaimEvidenceItem]); else list.push(raw as unknown as ConversationFileClaimEvidenceItem)
    }
  }
  const digest = value.evidenceDigest
  if (typeof digest !== 'string' || !DIGEST.test(digest)) return fail('evidence digest must be a SHA-256 digest')
  if (digest !== sha256(items)) return fail('evidence digest does not match its items')
  return { evidence: { schemaVersion: EVIDENCE, items: items as ConversationFileClaimEvidenceItem[], evidenceDigest: digest }, initial, final }
}

function requireGroup(source: ReadonlyMap<string, readonly ConversationFileClaimEvidenceItem[]>, path: string, content: string, stage: string): string[] {
  const group = source.get(path)
  if (group === undefined || group.length === 0) return fail(`missing ${stage} file evidence for ${path}`)
  if (group.map(item => item.text).join('') !== content) return fail(`${stage} file evidence does not match the exact content`)
  return group.map(item => item.id)
}

function expand(content: unknown, stage: ClaimStage, path: string, index: Index): string | null {
  if (content === null || typeof content === 'string') return content
  if (!plain(content) || !exact(content, ['evidenceIds'])) return fail('file content slot must be a string, null or a reference')
  const ids = content.evidenceIds
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return fail('evidence reference ids must be strings')
  const group = (stage === 'initial' ? index.initial : index.final).get(path)
  if (group === undefined || group.length === 0 || group.length !== ids.length) return fail('reference must name a complete file group')
  for (let i = 0; i < group.length; i++) if (ids[i] !== group[i]!.id) return fail('reference ids must keep original order')
  return group.map(item => item.text).join('')
}

function canonicalPacket(original: unknown, evidenceValue: unknown): ConversationFileClaimPacket {
  bound(original, 'original')
  bound(evidenceValue, 'claimEvidence')
  bound({ original, claimEvidence: evidenceValue }, 'original and claimEvidence combined')
  const info = readOriginal(original)
  const index = readEvidence(evidenceValue)
  const skeleton = clone(original, 'original', new Set()) as Record<string, unknown>
  const entries = ((skeleton[info.ownerKey] as Record<string, unknown>).files as Record<string, unknown>).entries as Record<string, unknown>[]
  const used = new Set<string>()
  info.materialEntries.forEach((entry, i) => {
    if (entry.content === null) return
    const owner = (original as Record<string, Record<string, unknown>>)[info.ownerKey]!
    const host = owner.hostProject !== undefined
    if (index.initial.get(entry.path)?.some(item => host ? item.role !== 'host' : item.role !== 'tool')) return fail('initial file provenance does not match its original material')
    const ids = requireGroup(index.initial, entry.path, entry.content, 'initial')
    ids.forEach(id => used.add(id))
    entries[i]!.content = { evidenceIds: [...ids] }
  })
  const files = (skeleton.fileResult as Record<string, unknown>).files as Record<string, unknown>[]
  info.resultFiles.forEach((file, i) => {
    if (info.outputPaths.includes(file.path)) {
      if (file.content === null) return fail('a declared output must not be null')
      const ids = requireGroup(index.final, file.path, file.content, 'final')
      ids.forEach(id => used.add(id))
      files[i]!.content = { evidenceIds: [...ids] }
      return
    }
    const initial = info.materialEntries.find(candidate => candidate.path === file.path)
    if (file.content !== null && initial !== undefined && initial.content !== null && initial.content === file.content) {
      const ids = requireGroup(index.initial, file.path, file.content, 'initial')
      ids.forEach(id => used.add(id))
      files[i]!.content = { evidenceIds: [...ids] }
    }
  })
  for (const item of index.evidence.items) if (item.fileStage !== undefined && !used.has(item.id)) return fail('evidence contains an unbound file item')
  const packet: ConversationFileClaimPacket = { schemaVersion: PACKET, original: skeleton, claimEvidence: index.evidence, originalDigest: sha256(original) }
  bound(packet, 'packet')
  return packet
}

function probeEntry(entry: unknown): { path: unknown; content: unknown } {
  if (!plain(entry)) return fail('file entry must be a JSON object')
  const content = entry.content
  return { path: entry.path, content: content !== null && typeof content === 'object' ? '' : content }
}

function reconstruct(skeleton: Record<string, unknown>, index: Index): Record<string, unknown> {
  const hasSource = Object.hasOwn(skeleton, 'source'), hasTask = Object.hasOwn(skeleton, 'task')
  if (hasSource === hasTask) return fail('packet original must declare exactly one of source or task')
  const ownerKey = hasSource ? 'source' as const : 'task' as const
  const owner = skeleton[ownerKey]
  if (!plain(owner)) return fail('packet review data must be a JSON object')
  const material = owner.files
  if (!plain(material) || !Array.isArray(material.entries)) return fail('packet file material is invalid')
  const parsed = parseConversationFileMaterial({ schemaVersion: material.schemaVersion, outputKind: material.outputKind, cwd: material.cwd, entries: material.entries.map(probeEntry), outputPaths: material.outputPaths })
  const result = skeleton.fileResult
  if (!plain(result) || !Array.isArray(result.files)) return fail('packet fileResult is invalid')
  const parsedFiles = parseConversationFileEntries(result.files.map(probeEntry))
  const rebuilt = clone(skeleton, 'packet original', new Set()) as Record<string, unknown>
  const rebuiltEntries = ((rebuilt[ownerKey] as Record<string, unknown>).files as Record<string, unknown>).entries as Record<string, unknown>[]
  parsed.entries.forEach((entry, i) => { rebuiltEntries[i]!.content = expand(rebuiltEntries[i]!.content, 'initial', entry.path, index) })
  const rebuiltFiles = (rebuilt.fileResult as Record<string, unknown>).files as Record<string, unknown>[]
  parsedFiles.forEach((entry, i) => { rebuiltFiles[i]!.content = expand(rebuiltFiles[i]!.content, parsed.outputPaths.includes(entry.path) ? 'final' : 'initial', entry.path, index) })
  return rebuilt
}

export function packConversationFileClaimPacket(original: unknown, claimEvidence: unknown): ConversationFileClaimPacket {
  return canonicalPacket(clone(original, 'original', new Set()), clone(claimEvidence, 'claimEvidence', new Set()))
}

export function unpackConversationFileClaimPacket(packet: unknown): ConversationFileClaimRecovery {
  const clean = clone(packet, 'packet', new Set())
  if (!plain(clean) || !exact(clean, ['schemaVersion', 'original', 'claimEvidence', 'originalDigest'])) return fail('packet must be exactly schemaVersion/original/claimEvidence/originalDigest')
  if (clean.schemaVersion !== PACKET) return fail('packet schema is invalid')
  const digest = clean.originalDigest
  if (typeof digest !== 'string' || !DIGEST.test(digest)) return fail('packet originalDigest must be a SHA-256 digest')
  if (!plain(clean.original)) return fail('packet original must be a JSON object')
  bound(clean, 'packet')
  const index = readEvidence(clean.claimEvidence)
  bound(clean.claimEvidence, 'claimEvidence')
  const rebuilt = reconstruct(clean.original, index)
  const repacked = canonicalPacket(rebuilt, index.evidence)
  if (canonicalJson(repacked) !== canonicalJson(clean)) return fail('packet is not the canonical encoding of its original')
  return { original: rebuilt, claimEvidence: index.evidence }
}
