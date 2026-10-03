import { expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult, ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { sha256, type ConversationTask } from '../../packages/tianwen-evolution/src/index.js'
import { parseConversationFileMutationDenialReceipt, verifyConversationFileMutationDenialReceipt } from '../../packages/tianwen-evolution/src/conversation-file-mutation-denial.js'
import { parseConversationReadDenialReceipt } from '../../packages/tianwen-evolution/src/conversation-read-denial.js'
import { ConversationFileAncillaryCapture } from '../../packages/tianwen-runtime-bundle/src/conversation-file-ancillary.js'
import { parseFileExecutionEvidence } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'

// Mechanism controls only; actual SDK dispatch/capture is covered separately.
function fixture(tool: 'write' | 'edit') {
  const reason = 'Original file policy refused', producer = { id: 'owned-file-policy.v1', digest: sha256('original policy bytes') }
  const args = tool === 'write' ? { file_path: 'output.md', content: 'refused' } : { file_path: 'output.md', old_string: 'old', new_string: 'refused' }
  const call = { type: 'tool/call', seq: 12, data: { name: tool, callId: 'native-call', turn: 1, step: 2, arguments: JSON.stringify(args) } }
  const resultEvent = { type: 'tool/result', seq: 13, surfaceOp: 'append', sourceEventSeqs: [12], data: { turn: 1, step: 2,
    message: { role: 'user', source: { kind: 'tool', callId: 'native-call' }, content: [{ type: 'tool-result', toolCallId: 'native-call', isError: true, content: [{ type: 'text', text: 'Error: ' + reason }] }] } } }
  const nativeTool = { package: '@deepseek-ai/dsh-tool-fs' as const, version: '0.1.1-rc.2' as const, adapter: 'tianwen.file-ancillary.v1' as const }
  const receipt = { schemaVersion: 'tianwen.native-file-mutation-denial.v1' as const, tool, identity: { taskId: 'task', sessionId: 'session', turn: 1, callId: 'native-call', rootCallId: 'native-call' },
    callSeq: 12, resultSeq: 13, argumentsDigest: sha256(args), resultDigest: sha256(resultEvent), producer, nativeTool, reason, dispatch: 'not-dispatched' as const }
  const binding = { task: { taskId: 'task', sessionId: 'session', turn: 1, startSeq: 10 }, boundary: 20, producerAdmissions: [producer], events: [call, resultEvent] }
  const task = { source: binding.task, admission: { decision: { kind: 'task', evaluationMode: 'local-files', fileOutputKind: 'files' } } } as ConversationTask
  const agent = { session: { id: 'session', events: binding.events } } as unknown as Agent
  let definition = { name: tool }
  const ctx = { tools: { get: () => definition, nativeRegistration: () => nativeTool } } as unknown as Context
  const controller = new AbortController()
  const execution = { name: tool, agent, callId: 'native-call', rootCallId: 'native-call', arguments: args, token: Symbol('original registry token'), signal: controller.signal } as unknown as ToolExecution
  const result = { isError: true, error: { message: reason }, content: [{ type: 'text', text: 'Error: ' + reason }] } as ToolExecutionResult
  const capture = new ConversationFileAncillaryCapture(ctx, task, 'D:/DevData/controlled-mutation-denial', { mutationDenialSources: [producer] })
  capture.captureFileMutationDenial(execution, producer, reason)
  return { receipt, binding, call, resultEvent, capture, task, agent, controller, execution, result, changeDefinition: () => { definition = { name: tool } } }
}

it.each(['write', 'edit'] as const)('authenticates actual %s without mutating native events or producing a read receipt', async tool => {
  const h = fixture(tool), original = structuredClone({ receipt: h.receipt, binding: h.binding })
  expect(verifyConversationFileMutationDenialReceipt(h.receipt, h.binding)).toEqual(h.receipt)
  expect({ receipt: h.receipt, binding: h.binding }).toEqual(original)
  expect(() => parseConversationReadDenialReceipt(h.receipt)).toThrow()
  h.capture.result(Object.freeze(h.execution), Object.freeze(h.result))
  expect((await h.capture.freeze(h.task, h.agent, 20))[0]!.payload.tool).toBe('file-mutation-denied')
  expect(h.task.fileInputs).toBeUndefined()
})

it.each(['receipt', 'binding'] as const)('rejects a hidden extra property on the closed %s', kind => {
  const h = fixture('write');Object.defineProperty(h[kind], 'hidden', { value: 'extra', enumerable: false })
  expect(() => verifyConversationFileMutationDenialReceipt(h.receipt, h.binding)).toThrow()
})

it.each(['read', 'edit', 'unknown'] as const)('rejects changing an original write call into %s', name => {
  const h = fixture('write');h.call.data.name = name as 'write'
  expect(() => verifyConversationFileMutationDenialReceipt(h.receipt, h.binding)).toThrow()
})

it.each(['call', 'result', 'arguments', 'result-digest', 'session', 'producer', 'reason', 'range', 'schema', 'tool', 'symbol'] as const)('rejects %s tampering even with the new envelope', kind => {
  const h = fixture('edit')
  if (kind === 'call' || kind === 'result') h.binding.events.push({ ...structuredClone(kind === 'call' ? h.call : h.resultEvent), seq: 14 })
  if (kind === 'arguments') h.call.data.arguments = JSON.stringify({ file_path: 'other' })
  if (kind === 'result-digest') h.receipt.resultDigest = sha256('other')
  if (kind === 'session') h.binding.task.sessionId = 'other'
  if (kind === 'producer') h.binding.producerAdmissions = []
  if (kind === 'reason') h.receipt.reason = 'other'
  if (kind === 'range') h.binding.boundary = 12
  if (kind === 'schema') h.receipt.schemaVersion = 'tianwen.native-read-denial.v1' as never
  if (kind === 'tool') h.receipt.tool = 'read' as never
  if (kind === 'symbol') Object.assign(h.receipt, { [Symbol('extra')]: true })
  expect(() => verifyConversationFileMutationDenialReceipt(h.receipt, h.binding)).toThrow()
})

it.each(['write', 'edit'] as const)('rejects actual %s dispatch counterevidence', async tool => {
  const h = fixture(tool)
  await expect(h.capture.prepare(h.execution as ToolDispatchExecution)).rejects.toThrow()
  await expect(h.capture.freeze(h.task, h.agent, 20)).rejects.toThrow()
})

it.each(['token', 'arguments', 'root', 'parent', 'definition', 'cancelled', 'missing', 'duplicate', 'text', 'tool'] as const)('rejects live mutation %s drift', async kind => {
  const h = fixture('write')
  if (kind === 'definition') h.changeDefinition()
  if (kind === 'cancelled') h.controller.abort()
  const execution = { ...h.execution, ...(kind === 'token' ? { token: Symbol('other') } : {}), ...(kind === 'arguments' ? { arguments: { file_path: 'other' } } : {}),
    ...(kind === 'root' ? { rootCallId: 'other' as never } : {}), ...(kind === 'parent' ? { parent: Symbol('nested') } : {}), ...(kind === 'tool' ? { name: 'edit' } : {}) }
  const result = kind === 'text' ? { ...h.result, content: [{ type: 'text', text: 'Error: other' }] } as ToolExecutionResult : h.result
  if (kind !== 'missing') h.capture.result(Object.freeze(execution), Object.freeze(result))
  if (kind === 'duplicate') h.capture.result(Object.freeze(execution), Object.freeze(result))
  await expect(h.capture.freeze(h.task, h.agent, 20)).rejects.toThrow()
})

it('limits new denied actions to native files with null paths; legacy v3 remains read-only', () => {
  const action = { tool: 'write', path: null, callSeq: 12, resultSeq: 13, status: 'denied', reason: 'Original refusal' }
  const value = { schemaVersion: 'tianwen.file-execution-evidence.v4', actions: [action], directoryObservations: [] }
  expect(parseFileExecutionEvidence(value)).toEqual(value)
  for (const changed of [{ ...value, schemaVersion: 'tianwen.file-execution-evidence.v3' },
    { ...value, actions: [{ ...action, tool: 'pwsh' }] }, { ...value, actions: [{ ...action, path: 'output.md' }] }]) expect(() => parseFileExecutionEvidence(changed)).toThrow()
})
