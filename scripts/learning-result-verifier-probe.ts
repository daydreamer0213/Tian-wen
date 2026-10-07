import { capturedFileFacts } from '../packages/tianwen-evolution/src/conversation-file-facts.js'
import type { ConversationFileEntry } from '../packages/tianwen-evolution/src/conversation-files.js'

export type FileFactVerification =
  | { readonly status: 'verified' }
  | { readonly status: 'rejected' | 'unverifiable'; readonly reason: string }

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))

/** Experimental structured-value check only. Not a task verdict or activation permit.
 * Inputs must come from recovered frozen material, not model-provided expectations. */
export function verifyCapturedFileFactTable(value: unknown, inputs: readonly ConversationFileEntry[]): FileFactVerification {
  if (inputs.length === 0 || inputs.some(entry => typeof entry.path !== 'string' || entry.path.trim().length === 0
    || typeof entry.content !== 'string') || new Set(inputs.map(entry => entry.path)).size !== inputs.length) {
    return { status: 'unverifiable', reason: 'complete-distinct-frozen-inputs-required' }
  }
  if (typeof value === 'string') return { status: 'unverifiable', reason: 'structured-value-required' }
  if (!object(value) || !keys(value, ['files']) || !Array.isArray(value.files)) {
    return { status: 'rejected', reason: 'invalid-table-shape' }
  }
  if (value.files.length !== inputs.length) return { status: 'rejected', reason: 'file-set-mismatch' }
  const expected = new Map(inputs.map(entry => [entry.path, capturedFileFacts(entry)]))
  const seen = new Set<string>()
  for (const row of value.files) {
    if (!object(row) || !keys(row, ['path', 'bytes', 'lines', 'sha256']) || typeof row.path !== 'string') {
      return { status: 'rejected', reason: 'invalid-row-shape' }
    }
    const fact = expected.get(row.path)
    if (fact === undefined || seen.has(row.path)) return { status: 'rejected', reason: 'file-set-mismatch' }
    if (row.bytes !== fact.bytes || row.lines !== fact.lines || row.sha256 !== fact.sha256) {
      return { status: 'rejected', reason: 'frozen-file-facts-mismatch' }
    }
    seen.add(row.path)
  }
  return { status: 'verified' }
}
