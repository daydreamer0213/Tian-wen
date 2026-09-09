import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { NativeObservedToolRuntime } from '../../packages/tianwen-runtime-bundle/src/native-tools-observer.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { TianwenNativeToolObservationService } from '../../packages/tianwen-runtime-bundle/src/native-tool-observation.js'
import { NativeObservedPwshExecutor } from '../../packages/tianwen-runtime-bundle/src/native-pwsh-observer.js'
import { runConversationFileTrial, recoverConversationFileTrial } from '../../packages/tianwen-runtime-bundle/src/conversation-file-trial.js'
import { ConversationFileAncillaryCapture, verifyConversationFileAncillary } from '../../packages/tianwen-runtime-bundle/src/conversation-file-ancillary.js'
import { runConversationClaimReview } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { canonicalJson } from '../../packages/tianwen-evolution/src/learning-intake.js'

const nativeRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const load = (name: string) => import(/* @vite-ignore */ pathToFileURL(nativeRequire.resolve(name)).href)
const { createScope } = await load('@deepseek-ai/dsh-scope')
const [fileTools, localFs, search, subprocess, spawn] = await Promise.all([
  load('@deepseek-ai/dsh-tool-fs'), load('@deepseek-ai/dsh-fs-local'), load('@deepseek-ai/dsh-tool-fs-search'),
  load('@deepseek-ai/dsh-subprocess-local'), load('@deepseek-ai/dsh-subagent-spawn-in-process'),
])
const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : join(tmpdir(), 'tianwen-consumer-tests'))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const original = '\uFEFFfirst needle\r\nsecond needle\n'
const direct = createUserMessage({ content: [{ type: 'text', text: 'Summarize input.md.' }], source: { kind: 'user' } })
const admission = { kind: 'task', objective: 'Summarize input.md', criteria: ['Use the input'], family: 'summarization',
  evaluationMode: 'local-files', fileOutputKind: 'chat', relatedTaskId: null, feedback: null }
const review = { verdict: 'met', category: null, explanation: 'The answer uses the file.', evidenceQuotes: ['saved'] }
const method = { name: 'source-audit', provider: 'owned-test-fixture', source: 'bundled',
  description: 'Review source statements.', content: 'METHOD_BODY: Preserve stated uncertainty.',
  invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'opaque', description: 'text-only fixture' } }
interface MountOptions { readonly pwsh?: boolean; readonly method?: boolean; readonly outputKind?: 'chat' | 'files' }

async function runNativeAncillaryTask(calls: Parameters<typeof mountPersistentHarness>[1], setup?: (h: Awaited<ReturnType<typeof mount>>) => void | Promise<void>, options: MountOptions = {}) {
  const h = await mount(calls, options)
  await setup?.(h)
  h.handle.agent.followup(direct)
  await h.handle.agent.whenIdle(); await h.ctx.tianwenConversationObserver.whenIdle()
  return { ...h, task: h.ctx.tianwenEvolution.listConversationTasks()[0]! }
}
async function mount(calls: Parameters<typeof mountPersistentHarness>[1], options: MountOptions = {}) {
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'ancillary-')); roots.push(root)
  writeFileSync(join(root, 'input.md'), original)
  const script = [toolCallResponse('admit', 'structured_output', { ...admission, fileOutputKind: options.outputKind ?? 'chat' }),
    ...calls, textResponse('saved ORIGINAL_ANSWER_CANARY'), auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
  const h = await mountPersistentHarness(join(root, 'sessions'), script)
  // Replace the engineering harness provider before any tool registration.
  for (const fiber of [...h.ctx.registry.get(ToolRuntime)!.fibers]) await fiber.dispose()
  await h.ctx.plugin(NativeObservedToolRuntime)
  await h.ctx.plugin(localFs.default, { cwd: root })
  await h.ctx.plugin(subprocess.default, {})
  await h.ctx.plugin(SubagentRuntime)
  await h.ctx.plugin(spawn, { providerName: 'spawn' })
  await h.ctx.plugin(fileTools, {})
  await h.ctx.plugin(search, { sampleOverCapGlobResults: false })
  const reference = { name: method.name, provider: method.provider, digest: sha256(method), origin: 'https://example.invalid/fixture', revision: 'v1',
    license: 'MIT', reviewedAt: '2026-09-09T00:00:00.000Z', kind: 'self-contained-text' as const, runtime: '0.1.1-rc.2' as const,
    scopeKey: `conversation:${sha256({ cwd: root })}`, purpose: 'conversation-method-reference' as const,
    environmentDigest: sha256({ kind: 'tianwen.conversation-skill-environment.v1', evolutionRoot: join(root, 'evolution') }) }
  if (options.method) {
    const [skills, skillTool] = await Promise.all([load('@deepseek-ai/dsh-skill'), load('@deepseek-ai/dsh-tool-skill')])
    await h.ctx.plugin(skills.default)
    h.ctx.skills.registerProvider(() => ({ name: method.provider, list: async () => [{ ...method, rank: 600, locator: method.name }], get: async () => method }))
    await h.ctx.plugin(skillTool, {})
  }
  if (options.pwsh) {
    const [sandbox, policy, env, pwsh] = await Promise.all(['@deepseek-ai/dsh-sandbox-local', '@deepseek-ai/dsh-sandbox-policy',
      '@deepseek-ai/dsh-shell-env', '@deepseek-ai/dsh-tool-pwsh'].map(load))
    await h.ctx.plugin(sandbox.LocalSandboxProvider, {})
    await h.ctx.plugin(policy.SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: root })
    await h.ctx.plugin(env.ShellEnvRegistry)
    await h.ctx.plugin(TianwenNativeToolObservationService)
    await h.ctx.plugin(NativeObservedPwshExecutor, { cwd: root, timeoutMs: 15000, maxTimeoutMs: 15000, maxOutputBytes: 65536, maxSpillBytes: 65536, graceMs: 500 })
    await h.ctx.plugin(pwsh, {})
  }
  await applyRuntime(h.ctx, { evolutionRoot: join(root, 'evolution') })
  h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await h.ctx.plugin(TianwenConversationFileObserverService, { evolutionRoot: join(root, 'evolution'), skillSources: options.method ? [reference] : [] })
  await h.ctx.plugin(TianwenConversationObserverService)
  const handle = await h.ctx.agents.create({ sessionId: SessionId('ancillary-chat'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  return { ...h, handle, root, reference, script }
}
const read = () => toolCallResponse('read-input', 'read', { file_path: 'input.md' })
const glob = () => toolCallResponse('find-input', 'glob', { pattern: '*.md' })
const grep = () => toolCallResponse('grep-input', 'grep', { pattern: 'needle|QUERY_CANARY', path: 'input.md' })
const parallel = (calls: readonly { id: string; name: string; arguments: Record<string, unknown> }[]): StreamChunk[] => [
  ...calls.flatMap((call, index) => [{ type: 'block-start' as const, index, blockType: 'tool-call' as const },
    { type: 'block-end' as const, index, block: { type: 'tool-call' as const, id: call.id as never, name: call.name, arguments: JSON.stringify(call.arguments) } }]),
  { type: 'finish', reason: { kind: 'tool-calls' } },
]

it('keeps discovery and reads in one native batch eligible when native scheduling serializes the search', async () => {
  for (const name of ['glob', 'grep']) {
    const h = await runNativeAncillaryTask([parallel([{ id: 'read-input', name: 'read', arguments: { file_path: 'input.md' } },
      { id: 'search-input', name, arguments: { pattern: name === 'glob' ? '*.md' : 'needle', ...(name === 'grep' ? { path: 'input.md' } : {}) } }])])
    try { expect(h.task.completion?.files !== undefined).toBe(true) }
    finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
  }
})

it('refuses grep before read even when a complete input is captured later', async () => {
  const h = await runNativeAncillaryTask([grep(), read()])
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.completion?.status).toBe('completed') }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each(['post-error', 'finalizer-error', 'changed-registration', 'duplicate-result', 'late-result', 'flush-false', 'flush-error', 'revoked', 'shadow'] as const)(
  'refuses %s while preserving the ordinary turn outcome', async fault => {
    const h = await runNativeAncillaryTask([glob(), read()], async h => {
      if (fault === 'flush-false') vi.spyOn(h.ctx.sessions, 'flush').mockResolvedValue(false)
      if (fault === 'flush-error') vi.spyOn(h.ctx.sessions, 'flush').mockRejectedValue(new Error('flush failed'))
      if (fault === 'post-error') h.ctx.on('tools/post-execute', async (exec, _result, next) => { if (exec.name === 'glob') throw new Error('post failed'); return next() })
      if (fault === 'finalizer-error') {
        const definition = h.ctx.tools.get('glob')!
        const finalize = definition.finalizeContent
        // Register a native-origin mutation after prepare but before finalization.
        h.ctx.on('tools/post-execute', async (exec, _result, next) => { if (exec.name === 'glob') definition.finalizeContent = () => { throw new Error('finalizer failed') }; return next() })
        h.ctx.effect(() => () => { definition.finalizeContent = finalize })
      }
      if (fault === 'changed-registration') h.ctx.on('tools/post-execute', async (exec, _result, next) => {
        if (exec.name === 'glob') h.ctx.tools.get('glob')!.description += ' changed'; return next()
      })
      if (fault === 'duplicate-result' || fault === 'late-result') {
        const originalResult = ConversationFileAncillaryCapture.prototype.result
        const late: (() => void)[] = []
        vi.spyOn(ConversationFileAncillaryCapture.prototype, 'result').mockImplementation(function (exec, result) {
          if (exec.name === 'glob' && fault === 'late-result') { late.push(() => originalResult.call(this, exec, result)); return }
          originalResult.call(this, exec, result)
          if (exec.name === 'glob' && fault === 'duplicate-result') originalResult.call(this, exec, result)
        })
        h.ctx.on('agent/turn-stopping', () => { for (const deliver of late.splice(0)) deliver() })
      }
      if (fault === 'revoked') h.ctx.on('agent/turn-stopping', async () => {
        h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      })
      if (fault === 'shadow') await createScope(h.ctx, h.handle.agent).ctx.plugin({ name: 'same-name-shadow', inject: ['tools'], apply(ctx) {
        ctx.tools.register({ ...h.ctx.tools.get('glob')! })
      } })
    })
    try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.completion?.status).toBe('completed') }
    finally { vi.restoreAllMocks(); await h.handle.dispose(); await h.ctx.fiber.dispose() }
  })

it.each(['edit-before', 'write-overlap'] as const)('refuses %s even if the mutation failed', async scenario => {
  const mutation = { id: 'failed-mutation', name: scenario === 'edit-before' ? 'edit' : 'write', arguments: scenario === 'edit-before'
    ? { file_path: 'input.md', old_string: 'absent', new_string: 'changed' } : { file_path: 'input.md', content: original } }
  const calls = scenario === 'edit-before' ? [read(), toolCallResponse(mutation.id, mutation.name, mutation.arguments), grep()]
    : [read(), parallel([mutation, { id: 'grep-input', name: 'grep', arguments: { pattern: 'needle', path: 'input.md' } }])]
  const h = await runNativeAncillaryTask(calls, undefined, { outputKind: 'files' })
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.completion?.status).toBe('completed') }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('admits a later-line grep after a partial native read when the host captured the whole preimage', async () => {
  const h = await runNativeAncillaryTask([toolCallResponse('partial-read', 'read', { file_path: 'input.md', limit: 1 }), grep()])
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).ancillaryContext?.positiveLocations[0]?.lines).toEqual([1, 2])
  }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('rejects simultaneous read/grep and mutation-call boundaries in persisted native rebind', async () => {
  const h = await runNativeAncillaryTask([read(), grep()])
  try {
    const saved = await h.ctx.sessionPersistence.inspect(SessionId('ancillary-chat'))
    const readCall = saved.events.find(event => event.type === 'tool/call' && event.data.name === 'read')!
    const readResult = saved.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'read-input')!
    const originalRecord = h.task.fileAncillary![0]!
    const changedSeq = readResult.seq - 1
    const events = saved.events.map(event => event.seq === originalRecord.callSeq ? { ...event, seq: changedSeq }
      : event.seq === originalRecord.resultSeq ? { ...event, sourceEventSeqs: [changedSeq] } : event)
    const record = { ...originalRecord, callSeq: changedSeq, resultDigest: sha256(events.find(event => event.seq === originalRecord.resultSeq)) }
    expect(() => verifyConversationFileAncillary({ ...h.task, fileAncillary: [record] }, h.root, events, h.task.completion!.files!.captureSeq)).toThrow()
    for (const name of ['write', 'edit']) {
      const mutations = [...saved.events, { ...readCall, seq: originalRecord.callSeq - 1, data: { ...(readCall as any).data,
        callId: 'failed-mutation', name, arguments: JSON.stringify({ file_path: 'input.md' }) } }]
      expect(() => verifyConversationFileAncillary(h.task, h.root, mutations as typeof saved.events, h.task.completion!.files!.captureSeq)).toThrow()
    }
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('keeps repeated stopping idempotent and rejects a stale boundary after a steered step', async () => {
  let firstBoundary: number | undefined
  const h = await runNativeAncillaryTask([glob(), read()], h => {
    let steered = false
    h.ctx.on('agent/turn-stopping', async ({ agent }) => {
      if (agent !== h.handle.agent || steered) return
      steered = true; firstBoundary = agent.session.events.at(-1)?.seq
      // The source task continues; its new user message does not contain tool output.
      h.script.unshift(toolCallResponse('second-glob', 'glob', { pattern: '*.md' }), textResponse('saved'))
      agent.steer(createUserMessage({ content: [{ type: 'text', text: 'Check once more.' }], source: { kind: 'user' } }))
    })
  })
  try {
    expect(h.task.fileAncillary).toHaveLength(2)
    expect(h.task.completion?.files).toBeDefined()
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files).toBeDefined()
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, completion: { ...h.task.completion!,
      files: { ...h.task.completion!.files!, captureSeq: firstBoundary! } } })).files).toBeUndefined()
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('cold recovery rejects tampered record linkage and canonical payload without new model calls or rereads', async () => {
  const h = await runNativeAncillaryTask([read(), grep()])
  try {
    const requests = h.adapter.requests.length
    rmSync(join(h.root, 'input.md'))
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).ancillaryContext?.positiveLocations[0]?.lines).toEqual([1, 2])
    const record = h.task.fileAncillary![0]!
    for (const change of [{ argumentsDigest: sha256('changed') }, { resultDigest: sha256('changed') }, { valueDigest: sha256('changed') },
      { callSeq: record.callSeq - 1 }, { resultSeq: record.resultSeq + 1 }, { callId: 'other' },
      { payload: { tool: 'grep' as const, matches: [{ path: 'input.md', lineNumber: 1, line: 'invented' }] } }]) {
      expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [{ ...record, ...change }] })).files).toBeUndefined()
    }
    for (const records of [[], [record, record]]) expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: records })).files).toBeUndefined()
    expect(h.adapter.requests).toHaveLength(requests)
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('keeps admitted method and positive locations in an independent replica trial and binds recovery digests', async () => {
  const h = await runNativeAncillaryTask([toolCallResponse('load-method', 'skill', { name: method.name }), read(), grep()], undefined, { method: true })
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    const recovered = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(recovered.ancillaryContext?.methods).toEqual([{ reference: h.reference, definition: method }])
    const parent = join(h.root, 'replicas'); mkdirSync(parent)
    const material = { request: recovered.request, context: recovered.context, files: recovered.files!, ancillaryContext: recovered.ancillaryContext! }
    let sent: unknown
    h.script.push(request => {
      const text = JSON.stringify(request.messages)
      expect(text).not.toContain('QUERY_CANARY'); expect(text).not.toContain('ORIGINAL_ANSWER_CANARY')
      expect(text).toContain('navigation only'); expect(text).toContain('METHOD_BODY')
      sent = request
      return toolCallResponse('trial-read', 'read', { file_path: 'input.md' })
    }, textResponse('independent answer'))
    const input = { material, callConfig: { provider: 'tianwen-probe', model: 'scripted' }, signal: new AbortController().signal,
      label: 'method trial', replicaParent: parent, retainReceipt: () => undefined }
    const trial = await runConversationFileTrial(h.ctx, h.handle.agent, input)
    expect(sent).toBeDefined()
    expect(trial.receipt.workerMaterialDigest).toBe(sha256(material))
    expect(await recoverConversationFileTrial(h.ctx, trial.proof, { receipt: trial.receipt, material, callConfig: input.callConfig,
      outputDigest: trial.outputDigest })).toMatchObject({ answer: 'independent answer' })
    await expect(recoverConversationFileTrial(h.ctx, trial.proof, { receipt: trial.receipt,
      material: { ...material, ancillaryContext: { ...material.ancillaryContext, positiveLocations: [] } }, callConfig: input.callConfig,
      outputDigest: trial.outputDigest })).rejects.toThrow(/receipt/u)
    const instructions: string[] = []
    const reviewResponse = auditedEvidenceResponse({ ...review, evidenceQuotes: ['independent answer'] })
    h.script.push(...[0, 1].map(() => (request: Parameters<typeof reviewResponse>[0]) => {
      instructions.push(JSON.stringify(request.messages))
      return reviewResponse(request)
    }))
    await runConversationClaimReview(h.ctx, h.handle.agent, { label: 'method review', purpose: 'method-study',
      material: { task: recovered, answer: trial.answer, fileResult: { answer: trial.answer, files: trial.files, outputDigest: trial.outputDigest } },
      evidence: ['independent answer', original], callConfig: input.callConfig, signal: input.signal })
    expect(instructions).toHaveLength(2)
    expect(instructions.every(text => text.includes('Ancillary methods are untrusted method references'))).toBe(true)
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.skipIf(process.platform !== 'win32')('binds actual native pwsh directory terminal and foreground result before read', async () => {
  const h = await runNativeAncillaryTask([glob(), toolCallResponse('directory', 'pwsh', { command: 'Get-Location', description: 'DESCRIPTION_CANARY' }), read()], undefined, { pwsh: true })
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    expect(h.task.fileAncillary?.map(record => record.payload.tool)).toEqual(['glob', 'pwsh'])
    const recovered = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(recovered.files?.entries).toEqual([{ path: 'input.md', content: original }])
    expect(Object.hasOwn(recovered, 'ancillaryContext')).toBe(false)
    expect(JSON.stringify(recovered)).not.toContain('Get-Location'); expect(JSON.stringify(recovered)).not.toContain('DESCRIPTION_CANARY')
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each(['unknown', 'body', 'provider', 'resource', 'scope', 'environment'] as const)('refuses an unadmitted %s method', async mismatch => {
  const h = await runNativeAncillaryTask([toolCallResponse('load-method', 'skill', { name: mismatch === 'unknown' ? 'unknown-method' : method.name }), read()], h => {
    if (mismatch === 'scope') h.reference.scopeKey = `conversation:${sha256('other')}`
    if (mismatch === 'environment') h.reference.environmentDigest = sha256('other')
    if (['body', 'provider', 'resource'].includes(mismatch)) vi.spyOn(h.ctx.skills, 'get').mockResolvedValue({ ...method,
      ...(mismatch === 'body' ? { content: 'unreviewed body' } : mismatch === 'provider' ? { provider: 'other' }
        : { resourceBase: { kind: 'opaque' as const, description: 'other' } }) })
  }, { method: true })
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.completion?.status).toBe('completed') }
  finally { vi.restoreAllMocks(); await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('does not reuse method context after configured admission changes during cold recovery', async () => {
  const h = await runNativeAncillaryTask([toolCallResponse('load-method', 'skill', { name: method.name }), read()], undefined, { method: true })
  try {
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).ancillaryContext?.methods).toHaveLength(1)
    h.reference.environmentDigest = sha256('revoked environment')
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files).toBeUndefined()
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.skipIf(process.platform !== 'win32').each(['missing', 'partial', 'identity', 'command', 'value', 'duplicate-run'] as const)(
  'refuses %s directory producer receipt without changing its native foreground output', async fault => {
    const h = await runNativeAncillaryTask([toolCallResponse('directory', 'pwsh', { command: 'Get-Location', description: 'DESCRIPTION_CANARY' }), read()], h => {
      const service = h.ctx.tianwenNativeToolObservation
      const capture = service.capture.bind(service)
      vi.spyOn(service, 'capture').mockImplementation(async (identity, next) => {
        const captured = await capture(identity, async () => {
          const result = await next()
          if (fault === 'duplicate-run') service.begin()
          return result
        })
        if (fault === 'missing') return { result: captured.result }
        if (captured.receipt === undefined) return captured
        const receipt = structuredClone(captured.receipt) as any
        if (fault === 'partial') receipt.frames.pop()
        if (fault === 'identity') receipt.identity.callId = 'other'
        if (fault === 'command') receipt.command = 'Get-ChildItem'
        if (fault === 'value') receipt.nativeResultDigest = sha256('other')
        return { result: captured.result, receipt }
      })
    }, { pwsh: true })
    try {
      expect(h.task.completion?.files).toBeUndefined()
      const result = h.handle.agent.session.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'directory')
      expect(result?.type === 'tool/result' && result.data.message.content[0].isError).toBe(false)
    } finally { vi.restoreAllMocks(); await h.handle.dispose(); await h.ctx.fiber.dispose() }
  })

it('rejects glob and grep raw native entry overflow without clipping positive locations', async () => {
  for (const name of ['glob', 'grep']) {
    const h = await runNativeAncillaryTask([read(), name === 'glob' ? glob() : grep()], h => {
      h.ctx.on('tools/post-execute', async (exec, result, next) => {
        const decision = await next()
        if (exec.name !== name || result.isError) return decision
        return { kind: 'accept' as const, value: name === 'glob' ? { root: '.', paths: Array.from({ length: 257 }, (_, index) => `file-${index}.md`) }
          : { matches: Array.from({ length: 257 }, () => ({ path: 'input.md', lineNumber: 1, line: 'first needle' })) } }
      })
    })
    try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.fileAncillary).toBeUndefined() }
    finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
  }
})

it('rejects a seventeenth ancillary call and does not retain a clipped task context', async () => {
  const h = await runNativeAncillaryTask([...Array.from({ length: 17 }, (_, index) => toolCallResponse(`glob-${index}`, 'glob', { pattern: '*.md' })), read()])
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.fileAncillary).toBeUndefined() }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('checks consent before every ancillary append and stops after withdrawal between records', async () => {
  const h = await runNativeAncillaryTask([glob(), toolCallResponse('second-glob', 'glob', { pattern: '*.md' }), read()], h => {
    const append = h.ctx.tianwenEvolution.recordConversationLearning.bind(h.ctx.tianwenEvolution)
    vi.spyOn(h.ctx.tianwenEvolution, 'recordConversationLearning').mockImplementation(record => {
      const result = append(record)
      if (record.kind === 'task-file-ancillary-captured') h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2,
        enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      return result
    })
  })
  try { expect(h.task.fileAncillary).toHaveLength(1); expect(h.task.completion?.files).toBeUndefined() }
  finally { vi.restoreAllMocks(); await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each([false, true])('restores ancillary material in a fresh runtime with zero new model requests, method=%s', async withMethod => {
  const h = await runNativeAncillaryTask([...(withMethod ? [toolCallResponse('load-method', 'skill', { name: method.name })] : []), read(), grep()], undefined, { method: withMethod })
  const expected = await recoverConversationTaskMaterial(h.ctx, h.task)
  const taskId = h.task.source.taskId
  await h.handle.dispose(); await h.ctx.fiber.dispose()
  rmSync(join(h.root, 'input.md'))
  const cold = await mountPersistentHarness(join(h.root, 'sessions'), [])
  try {
    await applyRuntime(cold.ctx, { evolutionRoot: join(h.root, 'evolution') })
    await cold.ctx.plugin(TianwenConversationFileObserverService, { evolutionRoot: join(h.root, 'evolution'), skillSources: withMethod ? [h.reference] : [] })
    const task = cold.ctx.tianwenEvolution.listConversationTasks().find(task => task.source.taskId === taskId)!
    expect(await recoverConversationTaskMaterial(cold.ctx, task)).toEqual(expected)
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})

it('withholds recovered ancillary material after consent is withdrawn', async () => {
  const h = await runNativeAncillaryTask([glob(), read()])
  try {
    h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files).toBeUndefined()
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('never certifies a cancelled native batch with a skipped undispatched tool', async () => {
  const h = await runNativeAncillaryTask([parallel([{ id: 'read-input', name: 'read', arguments: { file_path: 'input.md' } },
    { id: 'skipped-glob', name: 'glob', arguments: { pattern: '*.md' } }])], h => {
    h.ctx.on('tools/post-execute', async (exec, _result, next) => {
      const result = await next()
      if (exec.name === 'read') exec.agent?.cancel({ kind: 'user' })
      return result
    })
  })
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.completion?.status).toBe('interrupted') }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.skipIf(process.platform !== 'win32')('does not turn an overlong capture identity into an ordinary native pwsh error', async () => {
  const id = 'x'.repeat(513)
  const h = await runNativeAncillaryTask([toolCallResponse(id, 'pwsh', { command: 'Get-Location', description: 'identity fixture' }), read()], undefined, { pwsh: true })
  try {
    expect(h.task.completion?.files).toBeUndefined()
    const result = h.handle.agent.session.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === id)
    expect(result?.type === 'tool/result' && result.data.message.content[0].isError).toBe(false)
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('accounts for real native discovery before a read without projecting directory output', async () => {
  const h = await runNativeAncillaryTask([glob(), read()])
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    expect(h.task.completion?.files?.outputKind).toBe('chat')
    expect(h.task.fileAncillary).toHaveLength(1)
    const recovered = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(recovered.files?.entries).toEqual([{ path: 'input.md', content: original }])
    expect(Object.hasOwn(recovered, 'ancillaryContext')).toBe(false)
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('admits an in-workspace glob root whose ordinary directory name starts with two dots', async () => {
  const observations: unknown[] = []
  const h = await runNativeAncillaryTask([toolCallResponse('find-input', 'glob', { pattern: '*.md', path: '..notes' }), read()], h => {
    mkdirSync(join(h.root, '..notes')); writeFileSync(join(h.root, '..notes', 'side.md'), 'metadata only')
    vi.spyOn(h.ctx.logger, 'warn').mockImplementation((...args) => { observations.push(args) })
    h.ctx.on('tools/result', (exec, result) => { if (exec.name === 'glob') observations.push(result) })
  })
  try { expect(h.task.fileUnavailable, JSON.stringify(observations)).toBeUndefined(); expect(h.task.completion?.files).toBeDefined() }
  finally { vi.restoreAllMocks(); await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('binds nested native path spelling and relative glob roots while projecting canonical worker paths', async () => {
  const h = await runNativeAncillaryTask([
    toolCallResponse('nested-glob', 'glob', { pattern: '*.md', path: './nested/child' }),
    toolCallResponse('nested-read', 'read', { file_path: 'nested/child/input.md' }),
    toolCallResponse('nested-grep', 'grep', { pattern: 'needle|QUERY_CANARY', path: 'nested\\child' }),
  ], h => { mkdirSync(join(h.root, 'nested', 'child'), { recursive: true }); writeFileSync(join(h.root, 'nested', 'child', 'input.md'), original) })
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    const records = h.task.fileAncillary!
    expect(records.map(record => record.payload.nativeValueJson)).toEqual(records.map(record => expect.any(String)))
    const first = records[0]!
    expect(JSON.parse(first.payload.nativeValueJson!)).toMatchObject({ root: './nested/child' })
    const recovered = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(recovered.ancillaryContext?.positiveLocations[0]?.path).toBe('nested/child/input.md')
    expect(JSON.stringify(recovered)).not.toContain('nativeValueJson')
    expect(JSON.stringify(recovered)).not.toContain('QUERY_CANARY')
    const raw = JSON.parse(first.payload.nativeValueJson!)
    const mismatched = { ...first, valueDigest: sha256({ ...raw, paths: ['other.md'] }), payload: { ...first.payload,
      nativeValueJson: canonicalJson({ ...raw, paths: ['other.md'] }) } }
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [mismatched, records[1]!] })).files).toBeUndefined()
    const grepRecord = records[1]!
    const grepRaw = JSON.parse(grepRecord.payload.nativeValueJson!)
    const changed = { matches: [{ ...grepRaw.matches[0], line: 'invented' }] }
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [first, { ...grepRecord, valueDigest: sha256(changed),
      payload: { ...grepRecord.payload, nativeValueJson: canonicalJson(changed) } }] })).files).toBeUndefined()
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('recovers legacy flat glob/grep records with no native JSON field without backfilling them', async () => {
  const h = await runNativeAncillaryTask([glob(), read(), grep()])
  try {
    const legacy = { ...h.task, fileAncillary: h.task.fileAncillary!.map(record => {
      const { nativeValueJson: _raw, ...payload } = record.payload
      return { ...record, payload }
    }) }
    const before = JSON.stringify(legacy)
    expect((await recoverConversationTaskMaterial(h.ctx, legacy)).ancillaryContext?.positiveLocations[0]?.lines).toEqual([1, 2])
    expect(JSON.stringify(legacy)).toBe(before)
    expect(JSON.stringify(legacy.fileAncillary)).not.toContain('nativeValueJson')
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('binds actual native BOM grep lines to original bytes with no query or answer in context', async () => {
  const h = await runNativeAncillaryTask([read(), grep()])
  try {
    expect(h.task.fileUnavailable).toBeUndefined()
    const recovered = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(recovered.ancillaryContext).toEqual({ schemaVersion: 'tianwen.file-ancillary-context.v1', methods: [], positiveLocations: [
      { path: 'input.md', inputDigest: sha256({ path: 'input.md', content: original }), lines: [1, 2] },
    ] })
    expect(JSON.stringify(recovered)).not.toContain('QUERY_CANARY')
    expect(JSON.stringify(recovered)).not.toContain('ORIGINAL_ANSWER_CANARY')
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})
