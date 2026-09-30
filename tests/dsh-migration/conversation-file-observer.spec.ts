import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { ConversationExternalCodeChecks, type ConversationExternalCodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import ts from 'typescript'
import { createConversationTypeScriptCheck } from '../../scripts/conversation-typescript-check.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const admission = { kind: 'task', objective: 'Rewrite input.md', criteria: ['The requested file contains the new text'], family: 'writing',
  evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null }
const structured = (value: Record<string, unknown>) => toolCallResponse('judgment', 'structured_output',
  'kind' in value && 'evaluationMode' in value ? { decision: value } : value)
const review = { verdict: 'met', category: null, explanation: 'The claimed result is present.', evidenceQuotes: ['saved'] }
const reviewPair = () => [auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
const parallelCalls = (calls: readonly { readonly id: string, readonly name: string, readonly arguments: Record<string, unknown> }[]): StreamChunk[] => [
  ...calls.flatMap((call, index) => [{ type: 'block-start' as const, index, blockType: 'tool-call' as const }, {
    type: 'block-end' as const, index, block: { type: 'tool-call' as const, id: call.id as never, name: call.name, arguments: JSON.stringify(call.arguments) },
  }]),
  { type: 'finish', reason: { kind: 'tool-calls' } },
]

async function mount(script: Parameters<typeof mountPersistentHarness>[1], externalCodeArtifacts = false, externalCodeCheck?: ConversationExternalCodeCheck, existingRoot?: string) {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
  mkdirSync(base, { recursive: true })
  const root = existingRoot ?? mkdtempSync(join(base, 'file-observer-'))
  if (existingRoot === undefined) roots.push(root)
  const harness = await mountPersistentHarness(join(root, 'sessions'), script)
  await harness.ctx.plugin(localFs.default, { cwd: root })
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await harness.ctx.plugin(fileTools, {})
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationFileObserverService, { externalCodeArtifacts })
  await harness.ctx.plugin(TianwenConversationObserverService, externalCodeArtifacts && externalCodeCheck !== undefined ? { externalCodeCheck } : {})
  const handle = existingRoot === undefined
    ? await harness.ctx.agents.create({ sessionId: SessionId('file-chat'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    : await harness.ctx.agents.resume({ resumeSessionId: SessionId('file-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  return { ...harness, handle, root }
}

type TerminalCaptureState = { native: { pending: Map<string, unknown>, invalid: boolean } }
function captureStates(harness: Awaited<ReturnType<typeof mount>>): Map<string, TerminalCaptureState> {
  return (harness.ctx.tianwenConversationFileObserver as unknown as { states: Map<string, TerminalCaptureState> }).states
}

const externalCode = { kind: 'task', objective: 'Implement the requested change', criteria: ['The change compiles'], family: 'code',
  evaluationMode: 'external', relatedTaskId: null, feedback: null }

it('retains a verified independent result but classifies full-file review overflow before any reviewer call', async () => {
  const code = { ...externalCode, evaluationMode: 'local-files', fileOutputKind: 'files' }
  const content = 'x'.repeat(32_765)
  let evaluations = 0
  const check: ConversationExternalCodeCheck = { async prepare() {
    return { checkerId: 'frozen-file-equality-probe', checkerDigest: sha256('probe'), contractDigest: sha256(content),
      inputs: [{ path: 'input.ts', content: 'before' }], async evaluate(candidate) {
        evaluations++
        return candidate.outputs[0]?.content === content ? { status: 'verified', detail: 'Only the declared byte equality check.' }
          : { status: 'rejected', detail: 'Declared byte equality did not match.' }
      } }
  } }
  const harness = await mount([structured(code), toolCallResponse('overflow-write', 'write', { file_path: 'input.ts', content }),
    textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  try {
    harness.handle.agent.followup(direct('Replace input.ts with the supplied content.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.completion?.files?.entries[0]?.content).toBe(content)
    expect(task.externalCheckFinished?.status).toBe('verified')
    expect(evaluations).toBe(1)
    expect(task.review).toMatchObject({ verdict: 'inconclusive', category: null, proof: null,
      unavailableReason: 'material-too-large', evidenceQuotes: [],
      explanation: 'Automatic result review was not attempted: frozen answer contains 32770 UTF-8 bytes; the existing limit is 32768.' })
    expect(harness.adapter.requests).toHaveLength(3)
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toHaveLength(1)
    const recovery = await mount([], false, undefined, harness.root)
    try {
      expect(recovery.ctx.tianwenEvolution.listConversationTasks()[0]?.review).toEqual(task.review)
      expect(recovery.adapter.requests).toHaveLength(0)
    } finally { await recovery.handle.dispose(); await recovery.ctx.fiber.dispose() }
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['external', 'local-files'] as const)('uses the concrete TypeScript host check in ordinary %s code observation without authorizing learning', async mode => {
  const requestText = 'Repair the type of value in input.ts; change only input.ts.'
  let harness: Awaited<ReturnType<typeof mount>>
  const check: ConversationExternalCodeCheck = { async prepare(material) {
    return createConversationTypeScriptCheck({ cwd: harness.root, requestText, targetPath: 'input.ts', contextPaths: [],
      compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] } }).prepare(material)
  } }
  const code = { ...externalCode, evaluationMode: mode, ...(mode === 'local-files' ? { fileOutputKind: 'files' } : {}) }
  harness = await mount([structured(code), ...(mode === 'external' ? [structured(code)] : []), () => toolCallResponse('typed-write', 'write', {
    file_path: 'input.ts', content: 'export const value: number = 2',
  }), textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'export const value: number = "wrong"')
  try {
    harness.handle.agent.followup(direct(requestText))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.externalCheckPrepared).toBeDefined()
    expect(task.externalCheckPrepared?.checkerId).toBe('conversation-typescript-noemit')
    expect(task.externalCheckFinished).toMatchObject({ status: 'verified', resultDigest: task.completion?.resultDigest,
      preparationDigest: sha256(task.externalCheckPrepared), fileResultDigest: sha256(task.completion?.files) })
    expect(task.admission?.decision).toMatchObject({ family: 'code', evaluationMode: mode })
    expect(task.review?.verdict).toBe(mode === 'external' ? 'inconclusive' : 'met')
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['provider-defaults', 'outer-request-hook', 'later-config-drift'] as const)('binds an independent check to the actual native header with %s', async scenario => {
  let harness: Awaited<ReturnType<typeof mount>>
  let preparations = 0, evaluations = 0
  let preparedAtHeader = false, preparedBeforeProvider = false
  const check: ConversationExternalCodeCheck = { async prepare(material) {
    preparations++
    const header = harness.handle.agent.session.events.findLast(event => event.type === 'request/header')
    preparedAtHeader = header?.type === 'request/header' && sha256(header.data.header.config) === material.modelConfigDigest
      && !harness.handle.agent.session.events.some(event => ['assistant/message', 'tool/call', 'tool/result'].includes(event.type))
    return { checkerId: 'effective-config-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'),
      inputs: [{ path: 'input.ts', content: 'before' }], async evaluate() {
        evaluations++
        return { status: 'verified', detail: 'Only the frozen output check.' }
      } }
  } }
  harness = await mount([structured(externalCode), () => {
    preparedBeforeProvider = harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckPrepared !== undefined
    return toolCallResponse('effective-write', 'write', { file_path: 'input.ts', content: 'after' })
  }, textResponse('saved'), ...reviewPair()], true, check)
  const modelInfo = vi.spyOn(harness.adapter, 'resolveModel').mockImplementation(async (provider, model) => ({
    provider, id: model, name: model, defaultMaxTokens: 64000,
    reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }, { id: ReasoningEffortId('high'), name: 'High' }], defaultEffort: ReasoningEffortId('high') },
  }))
  let rootRequests = 0
  const off = harness.ctx.on('agent/request', async ({ agent }, next) => {
    const proposed = await next()
    if (String(agent.session.id) !== 'file-chat') return proposed
    rootRequests++
    if (scenario === 'outer-request-hook') return { ...proposed, maxTokens: 4096, reasoningEffort: ReasoningEffortId('low') }
    if (scenario === 'later-config-drift' && rootRequests > 1) return { ...proposed, reasoningEffort: ReasoningEffortId('low') }
    return proposed
  }, { prepend: true })
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.unavailableReason).toBeNull()
    expect(preparedBeforeProvider).toBe(true)
    expect(preparedAtHeader).toBe(true)
    expect(preparations).toBe(1)
    expect(task.externalCheckPrepared?.modelConfigDigest).toBe(task.models?.[0]?.modelConfigDigest)
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId('file-chat'))
    const header = saved.events.find(event => event.type === 'request/header')
    expect(header?.type === 'request/header' ? header.data.header.config : undefined).toMatchObject({
      maxTokens: scenario === 'outer-request-hook' ? 4096 : 64000,
      reasoningEffort: scenario === 'outer-request-hook' ? 'low' : 'high',
    })
    expect(task.externalCheckFinished?.status).toBe(scenario === 'later-config-drift' ? 'unverifiable' : 'verified')
    expect(evaluations).toBe(scenario === 'later-config-drift' ? 0 : 1)
    expect(task.review?.verdict).toBe('inconclusive')
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
  } finally { off(); modelInfo.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('prepares an external check before the candidate and records its result separately from model review', async () => {
  let preparedBeforeCandidate = false
  let preparations = 0, evaluations = 0
  let harness: Awaited<ReturnType<typeof mount>>
  const check = { async prepare({ request }: { request: readonly unknown[] }) {
    preparations++
    return { checkerId: 'bounded-mechanism-probe', checkerDigest: sha256('probe implementation'), contractDigest: sha256(request),
      inputs: [{ path: 'input.ts', content: 'before' }],
      async evaluate({ outputs }: { outputs: readonly { path: string, content: string | null }[] }) {
        evaluations++
        return { status: outputs.length === 1 && outputs[0]?.content === 'after' ? 'verified' as const : 'rejected' as const, detail: 'Frozen output check.' }
      } }
  } }
  harness = await mount([structured(externalCode), () => {
    preparedBeforeCandidate = harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckPrepared !== undefined
    return toolCallResponse('checked-write', 'write', { file_path: 'input.ts', content: 'after' })
  }, textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  let cold: Awaited<ReturnType<typeof mount>> | undefined
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(preparedBeforeCandidate).toBe(true)
    expect(task.externalCheckPrepared).toMatchObject({ checkerId: 'bounded-mechanism-probe', requestDigest: task.source.requestDigest })
    expect(task.externalCheckFinished).toMatchObject({ status: 'verified', resultDigest: task.completion?.resultDigest,
      preparationDigest: sha256(task.externalCheckPrepared), fileResultDigest: sha256(task.completion?.files) })
    expect(task.review?.verdict).toBe('inconclusive')
    await harness.handle.dispose(); await harness.ctx.fiber.dispose()
    cold = await mount([], true, check, harness.root)
    await cold.ctx.tianwenConversationObserver.whenIdle()
    expect(cold.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckFinished).toEqual(task.externalCheckFinished)
    expect(preparations).toBe(1)
    expect(evaluations).toBe(1)
  } finally { await cold?.handle.dispose(); await cold?.ctx.fiber.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['rejected', 'throw', 'oversized', 'invalid', 'changed-input'] as const)('keeps an external %s check from certifying success', async failure => {
  let evaluations = 0
  let harness: Awaited<ReturnType<typeof mount>>
  const check: ConversationExternalCodeCheck = { async prepare() { return {
    checkerId: 'bounded-mechanism-probe', checkerDigest: sha256('probe'), contractDigest: sha256('frozen contract'), inputs: [{ path: 'input.ts', content: 'before' }],
    async evaluate() {
      evaluations++
      if (failure === 'throw') throw new Error('controlled check failure')
      if (failure === 'oversized') return { status: 'verified', detail: '字'.repeat(4096) }
      if (failure === 'invalid') return { status: 'verified', detail: 'ignored extra', met: true } as never
      return { status: 'rejected', detail: 'The frozen requirement was not met.' }
    },
  } } }
  harness = await mount([structured(externalCode), () => {
    if (failure === 'changed-input') writeFileSync(join(harness.root, 'input.ts'), 'changed after preparation')
    return toolCallResponse('checked-write', 'write', { file_path: 'input.ts', content: 'after' })
  }, textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.externalCheckFinished?.status).toBe(failure === 'rejected' ? 'rejected' : 'unverifiable')
    expect(evaluations).toBe(failure === 'changed-input' ? 0 : 1)
    await new ConversationExternalCodeChecks(harness.ctx, check).finish(task.source.taskId)
    expect(evaluations).toBe(failure === 'changed-input' ? 0 : 1)
    expect(task.review?.verdict).toBe('inconclusive')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['not-applicable', 'prepare-failed', 'disabled', 'revoked'] as const)('keeps ordinary execution working when the external check is %s', async reason => {
  let harness: Awaited<ReturnType<typeof mount>>
  let evaluations = 0
  const check: ConversationExternalCodeCheck = { async prepare() {
    if (reason === 'not-applicable') return
    if (reason === 'prepare-failed') throw new Error('controlled preparation failure')
    return { checkerId: 'bounded-mechanism-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'),
      inputs: [{ path: 'input.ts', content: 'before' }], async evaluate() { evaluations++; return { status: 'verified', detail: 'Checked.' } } }
  } }
  harness = await mount([structured(externalCode), toolCallResponse('check-write', 'write', { file_path: 'input.ts', content: 'after' }), () => {
    if (reason === 'revoked') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    return textResponse('saved')
  }, ...(reason === 'revoked' ? [] : reviewPair())], reason !== 'disabled', check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.ts'), 'utf8')).toBe('after')
    expect(task.completion?.status).toBe('completed')
    expect(task.externalCheckFinished).toBeUndefined()
    if (reason !== 'revoked') expect(task.externalCheckPrepared).toBeUndefined()
    expect(evaluations).toBe(0)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('cold-recovers a lost check closure as unverifiable without post-answer preparation or retry', async () => {
  let preparations = 0, evaluations = 0
  const check: ConversationExternalCodeCheck = { async prepare() {
    preparations++
    return { checkerId: 'bounded-mechanism-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'),
      inputs: [{ path: 'input.ts', content: 'before' }], async evaluate() { evaluations++; return { status: 'verified', detail: 'Checked.' } } }
  } }
  // Simulate loss after durable completion, before the finish handler runs.
  const crash = vi.spyOn(ConversationExternalCodeChecks.prototype, 'finish').mockResolvedValueOnce(undefined)
  const harness = await mount([structured(externalCode), toolCallResponse('crash-write', 'write', { file_path: 'input.ts', content: 'after' }),
    textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  let cold: Awaited<ReturnType<typeof mount>> | undefined
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckFinished).toBeUndefined()
    crash.mockRestore()
    await harness.handle.dispose(); await harness.ctx.fiber.dispose()
    cold = await mount([], true, check, harness.root)
    await cold.ctx.tianwenConversationObserver.whenIdle()
    const task = cold.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.externalCheckFinished?.status).toBe('unverifiable')
    await new ConversationExternalCodeChecks(cold.ctx, check).finish(task.source.taskId)
    expect(preparations).toBe(1)
    expect(evaluations).toBe(0)
  } finally { crash.mockRestore(); await cold?.handle.dispose(); await cold?.ctx.fiber.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['prepare', 'evaluate'] as const)('releases observer work when consent is revoked during a pending %s callback', async stage => {
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const check: ConversationExternalCodeCheck = { async prepare() {
    if (stage === 'prepare') { entered(); await held }
    return { checkerId: 'held-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'),
      inputs: [{ path: 'input.ts', content: 'before' }], async evaluate() {
        if (stage === 'evaluate') { entered(); await held }
        return { status: 'verified', detail: 'Late callback result.' }
      } }
  } }
  const harness = await mount([structured(externalCode), toolCallResponse('held-write', 'write', { file_path: 'input.ts', content: 'after' }),
    textResponse('saved'), ...(stage === 'evaluate' ? reviewPair() : [])], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await started
    harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    const idle = harness.handle.agent.whenIdle().then(() => harness.ctx.tianwenConversationObserver.whenIdle()).then(() => true)
    expect(await Promise.race([idle, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1000) })])).toBe(true)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckFinished).toBeUndefined()
  } finally {
    clearTimeout(timer); release()
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    await harness.handle.dispose(); await harness.ctx.fiber.dispose()
  }
})

it('does not evaluate an external check when the original native session cannot flush', async () => {
  let evaluations = 0
  const check: ConversationExternalCodeCheck = { async prepare() { return {
    checkerId: 'flush-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'), inputs: [{ path: 'input.ts', content: 'before' }],
    async evaluate() { evaluations++; return { status: 'verified', detail: 'Checked.' } },
  } } }
  const harness = await mount([structured(externalCode), toolCallResponse('flush-write', 'write', { file_path: 'input.ts', content: 'after' }), textResponse('saved')], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  const originalFlush = harness.ctx.sessions.flush.bind(harness.ctx.sessions)
  const flush = vi.spyOn(harness.ctx.sessions, 'flush').mockImplementation(session => String(session.id) === 'file-chat' ? Promise.resolve(false) : originalFlush(session))
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckFinished?.status).toBe('unverifiable')
    expect(evaluations).toBe(0)
  } finally { flush.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('releases a pending external native flush on revocation without evaluating or recording a late result', async () => {
  let entered!: () => void, release!: (value: boolean) => void, evaluations = 0, first = true
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<boolean>(resolve => { release = resolve })
  const check: ConversationExternalCodeCheck = { async prepare() { return {
    checkerId: 'flush-probe', checkerDigest: sha256('probe'), contractDigest: sha256('contract'), inputs: [{ path: 'input.ts', content: 'before' }],
    async evaluate() { evaluations++; return { status: 'verified', detail: 'Checked.' } },
  } } }
  const harness = await mount([structured(externalCode), toolCallResponse('flush-write', 'write', { file_path: 'input.ts', content: 'after' }), textResponse('saved'), ...reviewPair()], true, check)
  writeFileSync(join(harness.root, 'input.ts'), 'before')
  const originalFlush = harness.ctx.sessions.flush.bind(harness.ctx.sessions)
  const flush = vi.spyOn(harness.ctx.sessions, 'flush').mockImplementation(session => {
    if (String(session.id) === 'file-chat' && first) { first = false; entered(); return held }
    return originalFlush(session)
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await started
    harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    const idle = harness.handle.agent.whenIdle().then(() => harness.ctx.tianwenConversationObserver.whenIdle()).then(() => true)
    expect(await Promise.race([idle, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1000) })])).toBe(true)
    release(true)
    await idle
    expect(evaluations).toBe(0)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.externalCheckFinished).toBeUndefined()
  } finally {
    clearTimeout(timer); release(true); flush.mockRestore()
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    await harness.handle.dispose(); await harness.ctx.fiber.dispose()
  }
})

it('captures external code artifacts without accepting a model success judgment', async () => {
  const harness = await mount([structured(externalCode),
    toolCallResponse('code-read', 'read', { file_path: 'input.ts' }),
    toolCallResponse('code-write', 'write', { file_path: 'input.ts', content: 'export const value = 2\n' }),
    textResponse('saved'), ...reviewPair()], true)
  writeFileSync(join(harness.root, 'input.ts'), 'export const value = 1\n')
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  try {
    harness.handle.agent.followup(direct('Implement the requested change and verify compilation.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.decision).toMatchObject({ family: 'code', evaluationMode: 'external' })
    expect(task.fileInputs?.map(({ path, content }) => ({ path, content }))).toEqual([
      { path: 'input.ts', content: 'export const value = 1\n' },
    ])
    expect(task.completion?.files).toMatchObject({ outputKind: 'files', outputPaths: ['input.ts'],
      entries: [{ path: 'input.ts', content: 'export const value = 2\n' }] })
    expect(task.review?.verdict).toBe('inconclusive')
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId('file-chat'))
    const changed = { ...saved, events: saved.events.map(event => event.type === 'tool/call' && String(event.data.callId) === 'code-write'
      ? { ...event, data: { ...event.data, arguments: JSON.stringify({ file_path: 'input.ts', content: 'forged bytes' }) } } : event) } as typeof saved
    const inspect = vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockResolvedValueOnce(changed)
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).files).toBeUndefined()
    inspect.mockRestore()
    writeFileSync(join(harness.root, 'input.ts'), 'unrelated later bytes')
    await harness.handle.dispose()
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('file-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).files).toMatchObject({
      entries: [{ path: 'input.ts', content: 'export const value = 1\n' }], outputPaths: ['input.ts'],
    })
  } finally { await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each([
  { enabled: false, decision: externalCode },
  { enabled: true, decision: { ...externalCode, family: 'writing' } },
])('leaves external captures absent for disabled capture or a non-code task: $enabled/$decision.family', async ({ enabled, decision }) => {
  const harness = await mount([structured(decision), toolCallResponse('ordinary-write', 'write', { file_path: 'input.ts', content: 'changed' }),
    textResponse('saved'), ...reviewPair()], enabled)
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.ts'), 'utf8')).toBe('changed')
    expect(task.fileInputs).toBeUndefined()
    expect(task.completion?.files).toBeUndefined()
    expect(task.review?.verdict).toBe('inconclusive')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not route an external command through the local-file command guard', async () => {
  const harness = await mount([structured(externalCode),
    toolCallResponse('write-before-check', 'write', { file_path: 'input.ts', content: 'changed' }),
    toolCallResponse('external-check', 'pwsh', { command: 'compile-probe' }), textResponse('saved'), ...reviewPair()], true)
  harness.ctx.tools.register(defineTool({
    name: 'pwsh', description: 'Controlled external tool dispatch probe; does not execute a shell.',
    parameters: { command: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ command }) { writeFileSync(join(harness.root, 'command-ran.txt'), command); return 'EXTERNAL_CHECK_RESULT' },
  }))
  try {
    harness.handle.agent.followup(direct('Implement the requested change and verify compilation.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'command-ran.txt'), 'utf8')).toBe('compile-probe')
    const result = harness.handle.agent.session.events.find(event => event.type === 'tool/result' && String(event.data.message.source.callId) === 'external-check')
    expect(result?.type === 'tool/result' && result.data.message.content[0].isError).toBe(false)
    expect(JSON.stringify(result?.data)).toContain('EXTERNAL_CHECK_RESULT')
    expect(task.fileInputs?.[0]?.content).toBeNull()
    expect(task.fileUnavailable?.reason).toBe('unsupported-tool')
    expect(task.fileAncillary).toBeUndefined()
    expect(task.completion?.files).toBeUndefined()
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).files).toBeUndefined()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('drops external final artifacts when consent is withdrawn after the native write', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([structured(externalCode), toolCallResponse('code-write', 'write', { file_path: 'input.ts', content: 'changed' }), () => {
    harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    return textResponse('saved')
  }], true)
  try {
    harness.handle.agent.followup(direct('Implement the requested change.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(readFileSync(join(harness.root, 'input.ts'), 'utf8')).toBe('changed')
    expect(task.fileInputs?.[0]?.content).toBeNull()
    expect(task.completion?.files).toBeUndefined()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

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
    expect(['read-a', 'read-b']).toContain(task.fileInputs?.[0]?.callId)
    expect(task.fileInputs?.[0]).toMatchObject({ path: 'input.md', content: 'source' })
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
    expect(task.review?.explanation).toContain('material-not-recovered')
    writeFileSync(join(missingOutput.root, 'output.md'), 'created after completion')
    expect((await recoverConversationTaskMaterial(missingOutput.ctx, task)).files).toBeUndefined()
  } finally { await missingOutput.handle.dispose(); await missingOutput.ctx.fiber.dispose() }

  const unavailable = await mount([structured(admission), toolCallResponse('large-write', 'write', { file_path: 'large.md', content: 'actual result' }), textResponse('saved'), ...reviewPair()])
  writeFileSync(join(unavailable.root, 'large.md'), 'x'.repeat(98305))
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

it('does not launch a source-blind review after an oversized read-to-chat file', async () => {
  const chat = { ...admission, objective: 'Answer from source.md', fileOutputKind: 'chat' }
  const harness = await mount([structured(chat), toolCallResponse('large-read', 'read', { file_path: 'source.md' }),
    textResponse('Answer delivered from the source.'), ...reviewPair()])
  writeFileSync(join(harness.root, 'source.md'), 'x'.repeat(98305))
  const warning = vi.spyOn(harness.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    harness.handle.agent.followup(direct('Read source.md and answer here.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.completion?.status).toBe('completed')
    expect(task.fileUnavailable?.reason).toBe('material-unavailable')
    expect(task.completion?.files).toBeUndefined()
    expect(task.review).toMatchObject({ verdict: 'inconclusive', proof: null, unavailableReason: 'file-evidence-unavailable' })
    expect(task.review?.reviewChecks).toBeUndefined()
    expect(task.reviewIntent).toBeUndefined()
    expect(harness.adapter.requests).toHaveLength(3)
  } finally { warning.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('captures a bounded 68 KiB source read in two native windows for review', async () => {
  const chat = { ...admission, objective: 'Answer from source.md', fileOutputKind: 'chat' }
  const source = Array.from({ length: 757 }, (_, index) => `${index + 1}: ${'x'.repeat(85)}`).join('\n')
  expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThan(68047)
  const harness = await mount([structured(chat),
    toolCallResponse('read-first', 'read', { file_path: 'source.md', limit: 400 }),
    toolCallResponse('read-second', 'read', { file_path: 'source.md', offset: 401, limit: 400 }),
    textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'source.md'), source)
  try {
    harness.handle.agent.followup(direct('Read source.md and answer here.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.completion?.status).toBe('completed')
    expect(task.fileUnavailable).toBeUndefined()
    expect(task.fileInputs?.[0]?.content).toBe(source)
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).files?.entries[0]?.content).toBe(source)
    const changedFinal = { ...task, completion: { ...task.completion!, files: {
      ...task.completion!.files!, entries: [{ path: 'source.md', content: 'changed final snapshot' }],
    } } }
    expect((await recoverConversationTaskMaterial(harness.ctx, changedFinal)).files).toBeUndefined()
    expect(task.review?.reviewChecks).toHaveLength(2)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects a read-to-chat snapshot when its source changes after the read', async () => {
  const chat = { ...admission, objective: 'Answer from source.md', fileOutputKind: 'chat' }
  const harness = await mount([structured(chat), toolCallResponse('source-read', 'read', { file_path: 'source.md' }),
    textResponse('saved'), ...reviewPair()])
  writeFileSync(join(harness.root, 'source.md'), 'original source')
  const offResult = harness.ctx.on('tools/result', exec => {
    if (exec.name === 'read') writeFileSync(join(harness.root, 'source.md'), 'changed after read')
  })
  try {
    harness.handle.agent.followup(direct('Read source.md and answer here.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.completion?.status).toBe('completed')
    expect(task.fileUnavailable?.reason).toBe('material-unavailable')
    expect(task.completion?.files).toBeUndefined()
    expect(task.review).toMatchObject({ verdict: 'inconclusive', proof: null, unavailableReason: 'file-evidence-unavailable' })
  } finally { offResult(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('keeps a consent withdrawal during file-review preparation classified as cancelled', async () => {
  const chat = { ...admission, objective: 'Answer from source.md', fileOutputKind: 'chat' }
  const harness = await mount([structured(chat), toolCallResponse('revoked-large-read', 'read', { file_path: 'source.md' }),
    textResponse('The ordinary answer completes.'), ...reviewPair()])
  writeFileSync(join(harness.root, 'source.md'), 'x'.repeat(98305))
  const originalFlush = harness.ctx.sessions.flush.bind(harness.ctx.sessions)
  let withdrew = false
  const flush = vi.spyOn(harness.ctx.sessions, 'flush').mockImplementation(async (...args) => {
    const result = await originalFlush(...args)
    if (!withdrew && harness.ctx.tianwenEvolution.listConversationTasks()[0]?.completion !== undefined) {
      withdrew = true
      harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    }
    return result
  })
  const warning = vi.spyOn(harness.ctx.logger, 'warn').mockImplementation(() => undefined)
  try {
    harness.handle.agent.followup(direct('Read source.md and answer here.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(withdrew).toBe(true)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review).toMatchObject({ verdict: 'inconclusive', proof: null, unavailableReason: 'cancelled' })
  } finally { flush.mockRestore(); warning.mockRestore(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
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
