import { expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult, ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { sha256, type ConversationTask } from '../../packages/tianwen-evolution/src/index.js'
import { ConversationFileAncillaryCapture } from '../../packages/tianwen-runtime-bundle/src/conversation-file-ancillary.js'

// Engineering mechanism controls; the real SDK rejection/body/cold paths are in the runtime suite.
function fixture() {
  const reason = 'Only declared files', producer = { id: 'reviewed-guard', digest: sha256('owned bytes') }, nativeTool = { package: '@deepseek-ai/dsh-tool-fs', version: '0.1.1-rc.2', adapter: 'tianwen.file-ancillary.v1' }
  const call = { type: 'tool/call', seq: 12, data: { name: 'read', callId: 'original', arguments: '{"file_path":"../outside"}', turn: 1, step: 2 } }
  const resultEvent = { type: 'tool/result', seq: 13, surfaceOp: 'append', sourceEventSeqs: [12], data: { turn: 1, step: 2,
    message: { role: 'user', source: { kind: 'tool', callId: 'original' }, content: [{ type: 'tool-result', toolCallId: 'original', isError: true, content: [{ type: 'text', text: 'Error: ' + reason }] }] } } }
  const task = { source: { taskId: 'task', sessionId: 'session', turn: 1, startSeq: 10 }, admission: { decision: { kind: 'task', evaluationMode: 'local-files', fileOutputKind: 'files' } } } as ConversationTask
  const agent = { session: { id: 'session', events: [call, resultEvent] } } as unknown as Agent
  let definition = { name: 'read' }
  const ctx = { tools: { get: () => definition, nativeRegistration: () => nativeTool } } as unknown as Context
  const controller = new AbortController(), execution = { name: 'read', agent, callId: 'original', rootCallId: 'original', arguments: { file_path: '../outside' }, token: Symbol('actual registry control'), signal: controller.signal } as unknown as ToolExecution
  const result = { isError: true, error: { message: reason }, content: [{ type: 'text', text: 'Error: ' + reason }] } as ToolExecutionResult
  const capture = new ConversationFileAncillaryCapture(ctx, task, 'D:/DevData/controlled-denial', { readDenialSources: [producer] })
  capture.captureReadDenial(execution, producer, reason)
  return { capture, task, agent, controller, execution, result, changeDefinition: () => { definition = { name: 'read' } } }
}

it('freezes a declared live denial without producing a captured input', async () => {
  const h = fixture(); h.capture.result(Object.freeze(h.execution), Object.freeze(h.result))
  expect((await h.capture.freeze(h.task, h.agent, 20))[0]!.payload.tool).toBe('read-denied')
  expect(h.task.fileInputs).toBeUndefined()
})

it('rejects dispatch counterevidence with the exact original opaque token', async () => {
  const h = fixture()
  await expect(h.capture.prepare(h.execution as ToolDispatchExecution)).rejects.toThrow()
  await expect(h.capture.freeze(h.task, h.agent, 20)).rejects.toThrow()
})

it.each(['token', 'arguments', 'root', 'parent', 'definition', 'cancelled', 'missing', 'duplicate', 'text'] as const)('rejects live %s drift rather than skipping an unprepared result', async kind => {
  const h = fixture()
  if (kind === 'definition') h.changeDefinition()
  if (kind === 'cancelled') h.controller.abort()
  const execution = { ...h.execution, ...(kind === 'token' ? { token: Symbol('different') } : {}), ...(kind === 'arguments' ? { arguments: { file_path: 'other' } } : {}),
    ...(kind === 'root' ? { rootCallId: 'different' as never } : {}), ...(kind === 'parent' ? { parent: Symbol('nested') } : {}) }
  const result = kind === 'text' ? { ...h.result, content: [{ type: 'text', text: 'Error: other' }] } as ToolExecutionResult : h.result
  if (kind !== 'missing') h.capture.result(Object.freeze(execution), Object.freeze(result))
  if (kind === 'duplicate') h.capture.result(Object.freeze(execution), Object.freeze(result))
  await expect(h.capture.freeze(h.task, h.agent, 20)).rejects.toThrow()
})
