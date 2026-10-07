import { parseConversationReadDenialReceipt, verifyConversationReadDenialReceipt,
  type ConversationReadDenialReceipt, type ConversationReadDenialBinding } from './conversation-read-denial.js'

export interface ConversationFileMutationDenialReceipt extends Omit<ConversationReadDenialReceipt, 'schemaVersion'> {
  readonly schemaVersion: 'tianwen.native-file-mutation-denial.v1'
  readonly tool: 'write' | 'edit'
}

const receiptKeys = ['schemaVersion', 'tool', 'identity', 'callSeq', 'resultSeq', 'argumentsDigest',
  'resultDigest', 'producer', 'nativeTool', 'reason', 'dispatch'] as const
function closedObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('invalid closed file mutation denial object')
  }
  return value as Record<string, unknown>
}

/** Reuse the strict common binding; this receipt never represents a read. */
export function parseConversationFileMutationDenialReceipt(value: unknown): ConversationFileMutationDenialReceipt {
  const input = closedObject(value, receiptKeys)
  const { tool, schemaVersion } = input
  if (schemaVersion !== 'tianwen.native-file-mutation-denial.v1' || (tool !== 'write' && tool !== 'edit')) throw new TypeError('invalid file mutation denial tool or schema')
  const common = Object.fromEntries(receiptKeys.filter(key => key !== 'tool' && key !== 'schemaVersion').map(key => [key, input[key]]))
  const parsed = parseConversationReadDenialReceipt({ ...common, schemaVersion: 'tianwen.native-read-denial.v1' })
  return { ...parsed, schemaVersion: 'tianwen.native-file-mutation-denial.v1', tool }
}

export function verifyConversationFileMutationDenialReceipt(value: unknown, binding: ConversationReadDenialBinding): ConversationFileMutationDenialReceipt {
  const parsed = parseConversationFileMutationDenialReceipt(value)
  closedObject(binding, ['task', 'boundary', 'producerAdmissions', 'events'])
  if (!Array.isArray(binding.events)) throw new TypeError('invalid file mutation denial binding')
  const { tool, ...common } = parsed
  // Verify the actual native tool before applying the common structural read
  // verifier. Project only the bound original call; do not change any input,
  // result event/digest, parameters, native proof or stored task span.
  const events = binding.events.map(event => {
    if (event === null || typeof event !== 'object') return event
    const row = event as Record<string, any>
    if (row.type !== 'tool/call' || row.seq !== parsed.callSeq || row.data?.callId !== parsed.identity.callId) return event
    if (row.data.name !== tool) throw new TypeError('file mutation denial original tool changed')
    return { ...row, data: { ...row.data, name: 'read' } }
  })
  const verified = verifyConversationReadDenialReceipt({ ...common, schemaVersion: 'tianwen.native-read-denial.v1' }, {
    task: binding.task, boundary: binding.boundary, producerAdmissions: binding.producerAdmissions, events,
  })
  return { ...verified, schemaVersion: 'tianwen.native-file-mutation-denial.v1', tool }
}
