import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const admission = { kind: 'task', objective: 'Rewrite input.md', criteria: ['The requested file contains the new text'], family: 'writing',
  evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
const structured = (value: Record<string, unknown>) => toolCallResponse('judgment', 'structured_output', value)
const review = { verdict: 'met', category: null, explanation: 'The claimed result is present.', evidenceQuotes: ['saved'] }
const reviewPair = () => [auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
const parallelCalls = (calls: readonly { readonly id: string, readonly name: string, readonly arguments: Record<string, unknown> }[]): StreamChunk[] => [
  ...calls.flatMap((call, index) => [{ type: 'block-start' as const, index, blockType: 'tool-call' as const }, {
    type: 'block-end' as const, index, block: { type: 'tool-call' as const, id: call.id as never, name: call.name, arguments: JSON.stringify(call.arguments) },
  }]),
  { type: 'finish', reason: { kind: 'tool-calls' } },
]

async function mount(script: Parameters<typeof mountPersistentHarness>[1]) {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'file-observer-')); roots.push(root)
  const harness = await mountPersistentHarness(join(root, 'sessions'), script)
  await harness.ctx.plugin(localFs.default, { cwd: root })
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await harness.ctx.plugin(fileTools, {})
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationFileObserverService)
  await harness.ctx.plugin(TianwenConversationObserverService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('file-chat'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  return { ...harness, handle, root }
}

type TerminalCaptureState = { native: { pending: Map<string, unknown>, invalid: boolean } }
function captureStates(harness: Awaited<ReturnType<typeof mount>>): Map<string, TerminalCaptureState> {
  return (harness.ctx.tianwenConversationFileObserver as unknown as { states: Map<string, TerminalCaptureState> }).states
}

it('keeps the first bytes while an actual approved native write changes the file', async () => {
  const responses = [structured(admission), toolCallResponse('write-1', 'write', { file_path: 'input.md', content: 'rewritten\r\n' }), textResponse('saved'),
    ...reviewPair()]
  const harness = await mount(responses)
  writeFileSync(join(harness.root, 'input.md'), 'original\r\n')
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  let terminalState: TerminalCaptureState | undefined
  const offTerminal = harness.ctx.on('agent/turn-stopping', ({ agent }) => {
    if (agent === harness.handle.agent) terminalState = [...captureStates(harness).values()][0]
  })
  try {
    harness.handle.agent.followup(direct('Rewrite input.md with the requested new text.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(readFileSync(join(harness.root, 'input.md'), 'utf8')).toBe('rewritten\r\n')
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.fileInputs?.map(({ path, content }) => ({ path, content }))).toEqual([{ path: 'input.md', content: 'original\r\n' }])
    expect(task.completion?.files).toMatchObject({ outputKind: 'files', outputPaths: ['input.md'], entries: [{ path: 'input.md', content: 'rewritten\r\n' }] })
    expect(captureStates(harness).has(task.source.taskId)).toBe(false)
    expect(terminalState?.native.invalid).toBe(true)
    expect(terminalState?.native.pending.size).toBe(0)
    expect(task.review?.verdict).toBe('met')
    writeFileSync(join(harness.root, 'input.md'), 'later bytes')
    await harness.handle.dispose()
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('file-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect((await recoverConversationTaskMaterial(harness.ctx, harness.ctx.tianwenEvolution.listConversationTasks()[0]!)).files).toEqual({
      schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: harness.root,
      entries: [{ path: 'input.md', content: 'original\r\n' }], outputPaths: ['input.md'],
    })
  } finally { offTerminal(); await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('omits file replay when the native span, completion summary or terminal no longer binds', async () => {
  const harness = await mount([structured(admission), toolCallResponse('bound-write', 'write', { file_path: 'input.md', content: 'saved result' }),
    textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'input.md'), 'original')
  try {
    harness.handle.agent.followup(direct('Rewrite input.md.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId('file-chat'))
    const inspect = vi.spyOn(harness.ctx.sessionPersistence, 'inspect')
    const recoverWithoutFiles = async (inspection: typeof saved, candidate = task) => {
      inspect.mockResolvedValueOnce(inspection)
      const material = await recoverConversationTaskMaterial(harness.ctx, candidate)
      expect(material.request).toHaveLength(1)
      expect(material.files).toBeUndefined()
    }

    const changedCall = { ...saved, events: saved.events.map(event => event.type === 'tool/call' && String(event.data.callId) === 'bound-write'
      ? { ...event, data: { ...event.data, arguments: JSON.stringify({ file_path: 'input.md', content: 'changed after completion' }) } }
      : event) } as typeof saved
    await recoverWithoutFiles(changedCall)

    await recoverWithoutFiles(saved, { ...task, completion: { ...task.completion!, assistantMessageIds: ['different-answer'] } })

    const wrongTurn = { ...saved, events: saved.events.map(event => event.type === 'turn/end' && event.seq === task.completion!.endSeq
      ? { ...event, data: { ...event.data, turn: event.data.turn + 1 } }
      : event) } as typeof saved
    const wrongTurnSpan = wrongTurn.events.filter(event => event.seq >= task.source.startSeq && event.seq <= task.completion!.endSeq)
    await recoverWithoutFiles(wrongTurn, { ...task, completion: { ...task.completion!, resultDigest: sha256(wrongTurnSpan) } })

    await recoverWithoutFiles(saved, { ...task, completion: { ...task.completion!, status: 'failed' } })
    inspect.mockRestore()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not replace a preimage after read, write and reread in the same turn', async () => {
  const harness = await mount([structured(admission),
    toolCallResponse('read-before', 'read', { file_path: 'input.md' }),
    toolCallResponse('write-after', 'write', { file_path: 'input.md', content: 'changed' }),
    toolCallResponse('read-after', 'read', { file_path: 'input.md' }), textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'input.md'), 'first')
  try {
    harness.handle.agent.followup(direct('Read and update input.md.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.md'), 'utf8')).toBe('changed')
    expect(task.fileInputs).toHaveLength(1)
    expect(task.fileInputs?.[0]).toMatchObject({ callId: 'read-before', path: 'input.md', content: 'first' })
    expect(task.completion?.files?.entries).toEqual([{ path: 'input.md', content: 'changed' }])
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('shares one immutable capture across concurrent reads of the same path', async () => {
  const chat = { ...admission, objective: 'Answer from input.md', fileOutputKind: 'chat' }
  const harness = await mount([structured(chat), parallelCalls([
    { id: 'read-a', name: 'read', arguments: { file_path: 'input.md' } },
    { id: 'read-b', name: 'read', arguments: { file_path: 'input.md' } },
  ]), textResponse('source answer'), ...reviewPair()])
  writeFileSync(join(harness.root, 'input.md'), 'source')
  try {
    harness.handle.agent.followup(direct('Read input.md and answer here.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.fileInputs).toHaveLength(1)
    expect(task.fileInputs?.[0]).toMatchObject({ callId: 'read-a', path: 'input.md', content: 'source' })
    expect(task.completion?.files).toMatchObject({ outputKind: 'chat', outputPaths: [], entries: [{ path: 'input.md', content: 'source' }] })
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('requires a successful read for chat evidence and excludes chat tasks that write', async () => {
  const chat = { ...admission, objective: 'Answer from a local file', fileOutputKind: 'chat' }
  const failed = await mount([structured(chat), toolCallResponse('missing-read', 'read', { file_path: 'missing.md' }), textResponse('still answered'), ...reviewPair()])
  try {
    failed.handle.agent.followup(direct('Read missing.md and answer here.'))
    await failed.handle.agent.whenIdle(); await failed.ctx.tianwenConversationObserver.whenIdle()
    const task = failed.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.fileInputs?.[0]?.content).toBeNull()
    expect(task.fileUnavailable?.reason).toBe('capture-interrupted')
    expect(task.completion?.status).toBe('completed')
    expect(task.completion?.files).toBeUndefined()
    expect((await recoverConversationTaskMaterial(failed.ctx, task)).files).toBeUndefined()
  } finally { await failed.handle.dispose(); await failed.ctx.fiber.dispose() }

  const writing = await mount([structured(chat), toolCallResponse('chat-read', 'read', { file_path: 'input.md' }),
    toolCallResponse('chat-write', 'write', { file_path: 'created.md', content: 'created' }), textResponse('done'), ...reviewPair()])
  writeFileSync(join(writing.root, 'input.md'), 'source')
  try {
    writing.handle.agent.followup(direct('Read input.md, answer here, and also write created.md.'))
    await writing.handle.agent.whenIdle(); await writing.ctx.tianwenConversationObserver.whenIdle()
    const task = writing.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(writing.root, 'created.md'), 'utf8')).toBe('created')
    expect(task.fileInputs?.[0]).toMatchObject({ callId: 'chat-read', path: 'input.md', content: 'source' })
    expect(task.fileUnavailable?.reason).toBe('unsupported-tool')
    expect(task.completion?.files).toBeUndefined()
  } finally { await writing.handle.dispose(); await writing.ctx.fiber.dispose() }
})

it('rejects an out-of-root capture without blocking the approved native write', async () => {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
  mkdirSync(base, { recursive: true })
  const outside = mkdtempSync(join(base, 'file-observer-outside-')); roots.push(outside)
  const target = join(outside, 'outside.md')
  const harness = await mount([structured(admission), toolCallResponse('outside-write', 'write', { file_path: target, content: 'ordinary work completed' }),
    textResponse('saved'), ...reviewPair()])
  const warning = vi.spyOn(harness.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    harness.handle.agent.followup(direct('Write the requested outside file.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(target, 'utf8')).toBe('ordinary work completed')
    expect(task.fileUnavailable?.reason).toBe('unsafe-path')
    expect(task.completion?.files).toBeUndefined()
    expect(warning).toHaveBeenCalledWith('Conversation file observation failed: %s', expect.stringMatching(/escapes root/i))
  } finally { warning.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('keeps missing output and unavailable capture ineligible without blocking ordinary work', async () => {
  const missingOutput = await mount([structured(admission), textResponse('saved'), ...reviewPair()])
  try {
    missingOutput.handle.agent.followup(direct('Save output.md.'))
    await missingOutput.handle.agent.whenIdle(); await missingOutput.ctx.tianwenConversationObserver.whenIdle()
    const task = missingOutput.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.completion?.files).toBeUndefined()
    writeFileSync(join(missingOutput.root, 'output.md'), 'created after completion')
    expect((await recoverConversationTaskMaterial(missingOutput.ctx, task)).files).toBeUndefined()
  } finally { await missingOutput.handle.dispose(); await missingOutput.ctx.fiber.dispose() }

  const unavailable = await mount([structured(admission), toolCallResponse('large-write', 'write', { file_path: 'large.md', content: 'actual result' }), textResponse('saved'), ...reviewPair()])
  writeFileSync(join(unavailable.root, 'large.md'), 'x'.repeat(32769))
  const warning = vi.spyOn(unavailable.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    unavailable.handle.agent.followup(direct('Replace large.md.'))
    await unavailable.handle.agent.whenIdle(); await unavailable.ctx.tianwenConversationObserver.whenIdle()
    const task = unavailable.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(unavailable.root, 'large.md'), 'utf8')).toBe('actual result')
    expect(task.fileUnavailable?.reason).toBe('material-unavailable')
    expect(task.completion?.files).toBeUndefined()
    expect(warning).toHaveBeenCalledWith('Conversation file observation failed: %s', expect.stringMatching(/too large/i))
  } finally { warning.mockRestore(); await unavailable.handle.dispose(); await unavailable.ctx.fiber.dispose() }
})

it('records ordinary completion when a successful write disappears before final capture', async () => {
  const harness = await mount([structured(admission), toolCallResponse('vanishing-write', 'write', { file_path: 'input.md', content: 'written before removal' }),
    textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'input.md'), 'original')
  let writeCompleted = false
  const off = harness.ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (exec.name === 'write' && !result.isError) {
      writeCompleted = true
      rmSync(join(harness.root, 'input.md'))
    }
    return decision
  })
  const warning = vi.spyOn(harness.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    harness.handle.agent.followup(direct('Rewrite input.md.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(writeCompleted).toBe(true)
    expect(task.completion?.status).toBe('completed')
    expect(task.completion?.files).toBeUndefined()
    expect(task.fileUnavailable?.reason).toBe('material-unavailable')
    expect(warning).toHaveBeenCalledWith('Conversation file observation failed: %s', expect.stringMatching(/missing an output/i))
  } finally { off(); warning.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('contains a durable capture append failure without changing the allowed write', async () => {
  const harness = await mount([structured(admission), toolCallResponse('write-after-capture-fault', 'write', { file_path: 'input.md', content: 'completed work' }), textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'input.md'), 'original')
  const original = harness.ctx.tianwenEvolution.recordConversationLearning.bind(harness.ctx.tianwenEvolution)
  const append = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationLearning').mockImplementation(record => {
    if (record.kind === 'task-file-input-captured') throw new Error('simulated durable capture failure')
    return original(record)
  })
  const warning = vi.spyOn(harness.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    harness.handle.agent.followup(direct('Rewrite input.md.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.md'), 'utf8')).toBe('completed work')
    expect(task.fileUnavailable?.reason).toBe('material-unavailable')
    expect(task.completion?.status).toBe('completed')
    expect(task.completion?.files).toBeUndefined()
    expect(warning).toHaveBeenCalledWith('Conversation file observation failed: %s', 'simulated durable capture failure')
  } finally { append.mockRestore(); warning.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('never binds an interrupted turn even when its native write already ran', async () => {
  const harness = await mount([structured(admission), toolCallResponse('interrupted-write', 'write', { file_path: 'input.md', content: 'write reached disk' })])
  writeFileSync(join(harness.root, 'input.md'), 'original')
  let terminalState: TerminalCaptureState | undefined
  const off = harness.ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (exec.name === 'write' && !result.isError) {
      terminalState = [...captureStates(harness).values()][0]
      exec.agent?.cancel({ kind: 'user' })
    }
    return decision
  })
  try {
    harness.handle.agent.followup(direct('Rewrite input.md.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.md'), 'utf8')).toBe('write reached disk')
    expect(task.completion?.status).toBe('interrupted')
    expect(task.completion?.files).toBeUndefined()
    expect(captureStates(harness).has(task.source.taskId)).toBe(false)
    expect(terminalState?.native.invalid).toBe(true)
    expect(terminalState?.native.pending.size).toBe(0)
  } finally { off(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not attach revoked capture and never contaminates an earlier final snapshot', async () => {
  let revoked: Awaited<ReturnType<typeof mount>>
  revoked = await mount([structured(admission), () => {
    revoked.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    return toolCallResponse('revoked-write', 'write', { file_path: 'input.md', content: 'revoked result' })
  }, textResponse('done')])
  writeFileSync(join(revoked.root, 'input.md'), 'before')
  try {
    revoked.handle.agent.followup(direct('Rewrite input.md.'))
    await revoked.handle.agent.whenIdle(); await revoked.ctx.tianwenConversationObserver.whenIdle()
    expect(readFileSync(join(revoked.root, 'input.md'), 'utf8')).toBe('revoked result')
    expect(revoked.ctx.tianwenEvolution.listConversationTasks()[0]?.completion?.files).toBeUndefined()
  } finally { await revoked.handle.dispose(); await revoked.ctx.fiber.dispose() }

  const sequential = await mount([
    structured(admission), toolCallResponse('first-write', 'write', { file_path: 'input.md', content: 'first result' }), textResponse('saved'), ...reviewPair(),
    structured(admission), toolCallResponse('second-write', 'write', { file_path: 'input.md', content: 'second result' }), textResponse('saved'), ...reviewPair(),
  ])
  writeFileSync(join(sequential.root, 'input.md'), 'original')
  try {
    sequential.handle.agent.followup(direct('First rewrite.'))
    await sequential.handle.agent.whenIdle(); await sequential.ctx.tianwenConversationObserver.whenIdle()
    const first = structuredClone(sequential.ctx.tianwenEvolution.listConversationTasks()[0]!)
    sequential.handle.agent.followup(direct('Second rewrite.'))
    await sequential.handle.agent.whenIdle(); await sequential.ctx.tianwenConversationObserver.whenIdle()
    const tasks = sequential.ctx.tianwenEvolution.listConversationTasks()
    expect(tasks[0]?.completion?.files).toEqual(first.completion?.files)
    expect(tasks[0]?.completion?.files?.entries[0]?.content).toBe('first result')
    expect(tasks[1]?.fileInputs?.[0]?.content).toBe('first result')
    expect(tasks[1]?.completion?.files?.entries[0]?.content).toBe('second result')
  } finally { await sequential.handle.dispose(); await sequential.ctx.fiber.dispose() }
})
