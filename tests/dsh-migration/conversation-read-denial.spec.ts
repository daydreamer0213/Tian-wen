import { expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { verifyConversationReadDenialReceipt } from '../../packages/tianwen-evolution/src/conversation-read-denial.js'

function original() {
  const producer = { id: 'owned-file-guard.v1', digest: sha256('original guard') }
  const call = { type: 'tool/call', seq: 12, data: { name: 'read', callId: 'native-call', turn: 1, step: 2, arguments: JSON.stringify({ file_path: 'scripts' }) } }
  const result = { type: 'tool/result', seq: 13, surfaceOp: 'append', sourceEventSeqs: [12], data: { turn: 1, step: 2,
    message: { role: 'user', source: { kind: 'tool', callId: 'native-call' }, content: [{ type: 'tool-result', toolCallId: 'native-call', isError: true, content: [{ type: 'text', text: 'Error: Declared files only' }] }] } } }
  const receipt = { schemaVersion: 'tianwen.native-read-denial.v1' as const, identity: { taskId: 'task', sessionId: 'session', turn: 1, callId: 'native-call', rootCallId: 'native-call' }, callSeq: 12, resultSeq: 13,
    argumentsDigest: sha256(JSON.parse(call.data.arguments)), resultDigest: sha256(result), producer, nativeTool: { package: '@deepseek-ai/dsh-tool-fs' as const, version: '0.1.1-rc.2' as const, adapter: 'tianwen.file-ancillary.v1' as const }, reason: 'Declared files only', dispatch: 'not-dispatched' as const }
  const binding = { task: { taskId: 'task', sessionId: 'session', turn: 1, startSeq: 10 }, boundary: 20, producerAdmissions: [producer], events: [call, result] }
  return { receipt, binding, call, result }
}

it.each(['call', 'result'] as const)('rejects another in-range native %s with the same callId and different sequence', kind => {
  const { receipt, binding, call, result } = original()
  binding.events.push({ ...structuredClone(kind === 'call' ? call : result), seq: 14 })
  expect(() => verifyConversationReadDenialReceipt(receipt, binding)).toThrow(TypeError)
})

it.each(['', ' \t'] as const)('binds a guard denial of any original string path %j', file_path => {
  const { receipt, binding, call } = original()
  call.data.arguments = JSON.stringify({ file_path })
  receipt.argumentsDigest = sha256({ file_path })
  expect(verifyConversationReadDenialReceipt(receipt, binding)).toEqual(receipt)
})

it('rejects sparse producer admissions even when an extra key balances the key count', () => {
  const { receipt, binding } = original()
  binding.producerAdmissions.length = 2
  Object.assign(binding.producerAdmissions, { extra: 'not an index' })
  expect(() => verifyConversationReadDenialReceipt(receipt, binding)).toThrow(TypeError)
})
