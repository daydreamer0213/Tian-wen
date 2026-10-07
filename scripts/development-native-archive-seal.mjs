import {createHash} from 'node:crypto'

// tianwen.development-native-archive-seal.v1
//
// Pure byte-level seal/verify for the development native archive manifest.
// The seal records only the real original byte length and the sha256 of the
// original bytes for each present archive file. It carries no task, success,
// failure or learning verdict: it does not parse JSON or the compressed
// root-native payload, and it never reconstructs SDK task/model identity.
//
// No filesystem, network or process I/O is performed; no command is executed
// and no dependency beyond the Node 22 standard library is used.

const SCHEMA_VERSION = 'tianwen.development-native-archive-seal.v1'

// The six legal archive paths, in the one fixed order used everywhere.
const ARCHIVE_PATHS = Object.freeze([
  'attempt-started.json',
  'task.json',
  'root-native.json.gz',
  'result.json',
  'failure.json',
  'cleanup.json'
])

// A complete archive carries these four plus at least one outcome file.
const REQUIRED_PATHS = Object.freeze([
  'attempt-started.json',
  'task.json',
  'root-native.json.gz',
  'cleanup.json'
])
const OUTCOME_PATHS = Object.freeze(['result.json', 'failure.json'])

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new TypeError('sessionId must be a non-blank string')
  }
}

// Turn one entry content into the exact original bytes. Strings must survive a
// UTF-8 round trip so a lone surrogate is rejected instead of being silently
// replaced. Binary values are read through their own real byteOffset/byteLength
// so bytes surrounding the view in the backing buffer are never included.
function toBytes(content) {
  if (typeof content === 'string') {
    const bytes = Buffer.from(content, 'utf8')
    if (bytes.toString('utf8') !== content) {
      throw new TypeError('content string must round-trip through UTF-8 without lone surrogates')
    }
    return bytes
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength)
  }
  throw new TypeError('content must be a string or a Uint8Array')
}

// Validate the caller entries and index them by path. Each item must be exactly
// {path, content}; the path must be a known archive path and appear only once.
function readEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('entries must be an array')
  }
  const byPath = new Map()
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError('each entry must be an object with exactly path and content')
    }
    if (
      Reflect.ownKeys(entry).length !== 2 ||
      !hasOwn(entry, 'path') ||
      !hasOwn(entry, 'content')
    ) {
      throw new TypeError('each entry must have exactly path and content')
    }
    const {path, content} = entry
    if (typeof path !== 'string' || !ARCHIVE_PATHS.includes(path)) {
      throw new TypeError('entry path is not a known archive path')
    }
    if (byPath.has(path)) {
      throw new TypeError('duplicate archive path')
    }
    byPath.set(path, toBytes(content))
  }
  return byPath
}

function digestOf(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex')
}

// Completeness is purely structural: the four base files plus at least one of
// result/failure. Both outcome files together are legal.
function isComplete(paths) {
  return (
    REQUIRED_PATHS.every(path => paths.has(path)) &&
    OUTCOME_PATHS.some(path => paths.has(path))
  )
}

export function sealDevelopmentNativeArchive(sessionId, entries) {
  assertSessionId(sessionId)
  const byPath = readEntries(entries)

  const files = []
  for (const path of ARCHIVE_PATHS) {
    const bytes = byPath.get(path)
    if (bytes === undefined) continue
    files.push({
      path,
      bytes: bytes.length,
      digest: digestOf(bytes)
    })
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    files,
    complete: isComplete(byPath)
  }
}

// Validate a seal exactly: closed top-level and per-file field sets, valid
// schema/session/complete types, fixed unique path order, non-negative safe
// integer byte lengths, well-formed digests, and a complete flag that agrees
// with the sealed file set. Any corruption is a TypeError.
function readSeal(seal) {
  if (seal === null || typeof seal !== 'object' || Array.isArray(seal)) {
    throw new TypeError('seal must be an object')
  }
  if (
    Reflect.ownKeys(seal).length !== 4 ||
    !hasOwn(seal, 'schemaVersion') ||
    !hasOwn(seal, 'sessionId') ||
    !hasOwn(seal, 'files') ||
    !hasOwn(seal, 'complete')
  ) {
    throw new TypeError('seal must have exactly schemaVersion, sessionId, files and complete')
  }
  if (seal.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('unsupported seal schemaVersion')
  }
  assertSessionId(seal.sessionId)
  if (typeof seal.complete !== 'boolean') {
    throw new TypeError('seal complete must be a boolean')
  }
  if (!Array.isArray(seal.files)) {
    throw new TypeError('seal files must be an array')
  }

  const sealed = new Map()
  let lastIndex = -1
  for (const file of seal.files) {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      throw new TypeError('each seal file must be an object')
    }
    if (
      Reflect.ownKeys(file).length !== 3 ||
      !hasOwn(file, 'path') ||
      !hasOwn(file, 'bytes') ||
      !hasOwn(file, 'digest')
    ) {
      throw new TypeError('each seal file must have exactly path, bytes and digest')
    }
    if (typeof file.path !== 'string') {
      throw new TypeError('seal file path must be a string')
    }
    const index = ARCHIVE_PATHS.indexOf(file.path)
    if (index === -1 || index <= lastIndex) {
      throw new TypeError('seal files must be unique known paths in the fixed order')
    }
    lastIndex = index
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new TypeError('seal file bytes must be a non-negative safe integer')
    }
    if (typeof file.digest !== 'string' || !DIGEST_PATTERN.test(file.digest)) {
      throw new TypeError('seal file digest is malformed')
    }
    sealed.set(file.path, {bytes: file.bytes, digest: file.digest})
  }

  if (seal.complete !== isComplete(sealed)) {
    throw new TypeError('seal complete does not match its sealed file set')
  }
  return sealed
}

export function verifyDevelopmentNativeArchiveSeal(seal, sessionId, entries) {
  assertSessionId(sessionId)
  const sealed = readSeal(seal)
  const current = readEntries(entries)

  // sessionMatches compares the original session text verbatim; it is
  // independent of whether the file sets agree.
  const sessionMatches = seal.sessionId === sessionId

  const missing = []
  const changed = []
  const added = []
  for (const path of ARCHIVE_PATHS) {
    const sealedFile = sealed.get(path)
    const currentBytes = current.get(path)
    if (sealedFile !== undefined && currentBytes === undefined) {
      missing.push(path)
    } else if (sealedFile === undefined && currentBytes !== undefined) {
      added.push(path)
    } else if (sealedFile !== undefined) {
      if (
        sealedFile.bytes !== currentBytes.length ||
        sealedFile.digest !== digestOf(currentBytes)
      ) {
        changed.push(path)
      }
    }
  }

  const filesMatch = missing.length === 0 && changed.length === 0 && added.length === 0

  return {
    sessionMatches,
    filesMatch,
    complete: sessionMatches && filesMatch && seal.complete,
    missing,
    changed,
    added
  }
}
