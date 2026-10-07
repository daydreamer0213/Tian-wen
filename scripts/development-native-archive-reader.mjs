/**
 * Bounded reader for the six whitelisted development-native archive records.
 *
 * Pure module: no file/network/process I/O, no commands, no third-party
 * dependencies and no directory traversal. All byte access happens through the
 * caller-owned `readRecord` callback. The module never interprets record
 * content: it does not parse JSON or gzip, and it makes no success,
 * eligibility or learning judgement.
 */

/** Whitelisted records, in the fixed reading order. */
const ARCHIVE_RECORD_PATHS = Object.freeze([
  'attempt-started.json',
  'task.json',
  'root-native.json.gz',
  'result.json',
  'failure.json',
  'cleanup.json',
])

const utf8Encoder = new TextEncoder()

/**
 * True when the string contains no unpaired UTF-16 surrogate, i.e. when it can
 * be encoded to UTF-8 and decoded back to exactly the same string.
 */
function isWellFormedUnicode(text) {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false
    }
  }
  return true
}

/**
 * Converts one returned record into an independent byte copy, or rejects
 * unsupported content with TypeError. The input view is never mutated and the
 * result never shares mutable bytes with the input.
 */
function copyRecordContent(value) {
  if (typeof value === 'string') {
    if (!isWellFormedUnicode(value)) {
      throw new TypeError('archive record string must round-trip as UTF-8')
    }
    return utf8Encoder.encode(value)
  }
  if (value instanceof Uint8Array) {
    // Copies exactly the visible byteOffset/byteLength view of the input.
    return new Uint8Array(value)
  }
  throw new TypeError('archive record content must be a string or Uint8Array')
}

/** Validates all options before any callback can run. */
function assertReadOptions(signal, maxBytes) {
  if (!(signal instanceof AbortSignal)) {
    throw new TypeError('signal must be an AbortSignal')
  }
  if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer')
  }
}

/**
 * Reads the six whitelisted archive records in order through `readRecord`.
 *
 * @param {(path: string) => Promise<string | Uint8Array | null>} readRecord
 *   Caller-owned async callback; `null` means the record is missing.
 * @param {{signal: AbortSignal, maxBytes: number}} options
 * @returns {Promise<Array<{path: string, content: Uint8Array}>>}
 */
export async function readDevelopmentNativeArchiveEntries(readRecord, { signal, maxBytes } = {}) {
  if (typeof readRecord !== 'function') {
    throw new TypeError('readRecord must be an async callback')
  }
  assertReadOptions(signal, maxBytes)

  const entries = []
  let totalBytes = 0

  for (const path of ARCHIVE_RECORD_PATHS) {
    if (signal.aborted) {
      throw signal.reason
    }

    // Callback errors are real and propagate as-is without touching later files.
    const record = await readRecord(path)

    if (signal.aborted) {
      throw signal.reason
    }
    if (record === null) {
      continue
    }

    const content = copyRecordContent(record)
    if (totalBytes + content.length > maxBytes) {
      throw new RangeError(`archive records exceed maxBytes (${maxBytes})`)
    }
    totalBytes += content.length
    entries.push({ path, content })
  }

  return entries
}
