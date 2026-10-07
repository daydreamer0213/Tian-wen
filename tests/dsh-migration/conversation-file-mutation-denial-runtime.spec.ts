import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { canonicalJson } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { NativeObservedToolRuntime } from '../../packages/tianwen-runtime-bundle/src/native-tools-observer.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial, fileExecutionTexts } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const require = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const load = (n: string) => import(/* @vite-ignore */ pathToFileURL(require.resolve(n)).href)
const [fs, fileTools, spawn] = await Promise.all(['@deepseek-ai/dsh-fs-local', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-subagent-spawn-in-process'].map(load))
const base = 'D:/DevData/tianwen-conversation-tests', roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) { if (dirname(resolve(root)) !== resolve(base) || !basename(root).startsWith('mutation-denial-')) throw new Error('unexpected test root');rmSync(root, { recursive: true, force: true }) } })
const producer = { id: 'reviewed-file-guard.v1', digest: sha256('original guard bytes') }, reason = 'Original mutation refused'
type Mode = 'trusted' | 'unknown' | 'body' | 'revoked' | 'producer-drift' | 'cancelled' | 'definition-drift'
async function run(tool: 'write' | 'edit', mode: Mode = 'trusted', outputKind: 'files' | 'chat' = 'files', evaluationMode: 'local-files' | 'external' = 'local-files', mixedRead = false) {
  mkdirSync(base, { recursive: true });const root = mkdtempSync(join(base, 'mutation-denial-'));roots.push(root);writeFileSync(join(root, 'input.md'), 'ORIGINAL_INPUT')
  if (tool === 'edit') writeFileSync(join(root, 'output.md'), 'BEFORE')
  const goodArgs = tool === 'write' ? { file_path: 'output.md', content: 'GENERATED_OUTPUT' } : { file_path: 'output.md', old_string: 'BEFORE', new_string: 'GENERATED_OUTPUT' }
  const badArgs = tool === 'write' ? { file_path: 'output.md', content: 'REFUSED_CONTENT' } : { file_path: 'output.md', old_string: 'BEFORE', new_string: 'REFUSED_CONTENT' }
  const script = [toolCallResponse('admit', 'structured_output', { decision: { kind: 'task', objective: 'Use original input', criteria: ['Use original input'], family: evaluationMode === 'external' ? 'code' : 'summarization', evaluationMode, ...(evaluationMode === 'local-files' ? { fileOutputKind: outputKind } : {}), relatedTaskId: null, feedback: null } }),
    ...(mixedRead ? [toolCallResponse('read-denied', 'read', { file_path: 'blocked.md' })] : []),
    toolCallResponse('denied', tool, badArgs), toolCallResponse('read-good', 'read', { file_path: 'input.md' }), ...(outputKind === 'files' ? [toolCallResponse('good', tool, goodArgs)] : []), textResponse('saved'),
    auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Mutation denial control only.', evidenceQuotes: ['saved'] }), auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Mutation denial control only.', evidenceQuotes: ['saved'] })]
  const h = await mountPersistentHarness(join(root, 'sessions'), script)
  try {
    for (const fiber of [...h.ctx.registry.get(ToolRuntime)!.fibers]) await fiber.dispose()
    await h.ctx.plugin(NativeObservedToolRuntime);await h.ctx.plugin(fs.default, { cwd: root });await h.ctx.plugin(SubagentRuntime);await h.ctx.plugin(spawn, { providerName: 'spawn' });await h.ctx.plugin(fileTools, {})
    await applyCore(h.ctx, { evolutionRoot: join(root, 'evolution') });h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
    await h.ctx.plugin(TianwenConversationFileObserverService, { readDenialSources: [producer], mutationDenialSources: [producer], externalCodeArtifacts: evaluationMode === 'external' });await h.ctx.plugin(TianwenConversationObserverService)
    const warnings: unknown[] = []
    vi.spyOn(h.ctx.tianwenConversationFileObserver as any, 'warn').mockImplementation(error => { warnings.push(error) })
    let deniedDispatches = 0, guardCalls = 0, refusalState: string | null | undefined
    h.ctx.on('tools/execute', (exec, next) => { if (String(exec.callId) === 'denied') { deniedDispatches++;if (mode === 'body') throw new Error(reason) };return next() })
    const handle = await h.ctx.agents.create({ sessionId: SessionId('mutation-denial'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup(ctx) {
      ctx.tools.presentAs('native');ctx.tools.restrict({ allow: ['read', 'write', 'edit'] })
      const guard = (exec: Parameters<typeof ctx.tools.guard>[0] extends (e: infer E) => unknown ? E : never) => {
        guardCalls++;if (String(exec.callId) === 'read-denied') return 'Original read refused'
        if (String(exec.callId) !== 'denied' || mode === 'body') return
        refusalState = existsSync(join(root, 'output.md')) ? readFileSync(join(root, 'output.md'), 'utf8') : null
        if (mode === 'revoked') h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
        if (mode === 'cancelled') handle.agent.cancel({ kind: 'user' })
        if (mode === 'definition-drift') ctx.tools.get(tool, exec.agent)!.description += ' drift'
        return reason
      }
      if (mode === 'unknown' || mode === 'body') ctx.tools.guard(guard)
      else h.ctx.tianwenConversationFileObserver.guardFiles(ctx, mode === 'producer-drift' ? { ...producer, digest: sha256('drift') } : producer, guard)
    } })
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Use input.md; produce requested answer.' }] }))
    await handle.agent.whenIdle();await h.ctx.tianwenConversationObserver.whenIdle()
    return { ...h, handle, root, task: h.ctx.tianwenEvolution.listConversationTasks()[0]!, deniedDispatches, guardCalls, refusalState, warnings }
  } catch (error) { await h.ctx.fiber.dispose();throw error }
}

it.each(['write', 'edit'] as const)('retains trusted %s rejection and then the successful mutation without capturing refused content', async tool => {
  const h = await run(tool)
  try {
    expect(h.deniedDispatches).toBe(0);expect(h.guardCalls).toBe(3);expect(h.refusalState).toBe(tool === 'edit' ? 'BEFORE' : null)
    expect(h.warnings.map(error => (error as Error).stack)).toEqual([])
    expect(h.task.fileUnavailable).toBeUndefined();expect(h.task.completion?.files).toBeDefined();expect(h.task.fileAncillary).toHaveLength(1)
    expect(h.task.fileAncillary![0]!.payload.tool).toBe('file-mutation-denied');expect(readFileSync(join(h.root, 'output.md'), 'utf8')).toBe('GENERATED_OUTPUT')
    const material = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(material.fileExecution?.schemaVersion).toBe('tianwen.file-execution-evidence.v4')
    if (material.fileExecution?.schemaVersion !== 'tianwen.file-execution-evidence.v4') throw new Error('missing exact mutation actions')
    expect(material.fileExecution.actions.map(action => [action.tool, action.status])).toEqual([[tool, 'denied'], ['read', 'success'], [tool, 'success']])
    expect(material.fileExecution.actions[0]).toMatchObject({ tool, path: null, reason })
    const reviews = h.adapter.requests.filter(request => JSON.stringify(request.messages).includes('File provenance:'))
    expect(reviews).toHaveLength(2)
    for (const review of reviews) {
      expect(JSON.stringify(review.messages)).toContain('before the original tool body was dispatched')
      expect(JSON.stringify(review.messages)).toContain('A guard may itself inspect a target')
      expect(JSON.stringify(review.messages)).not.toContain('Denied reads did not access a file')
    }
    expect(fileExecutionTexts(material.fileExecution).join('\n')).toContain(`Native ${tool}:`)
    expect(material.files?.entries.find(f => f.path === 'output.md')?.content).toBe(tool === 'edit' ? 'BEFORE' : null)
    const requests = h.adapter.requests.length;rmSync(join(h.root, 'input.md'));rmSync(join(h.root, 'output.md'))
    expect(await recoverConversationTaskMaterial(h.ctx, h.task)).toEqual(material);expect(h.adapter.requests).toHaveLength(requests)
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [] })).files).toBeUndefined()
    const record = h.task.fileAncillary![0]!
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [record, record] })).files).toBeUndefined()
    for (const update of [{ tool: tool === 'write' ? 'edit' : 'write' }, { producer: { ...producer, digest: sha256('other') } }]) {
      const receipt = { ...JSON.parse((record.payload as { nativeDenialJson: string }).nativeDenialJson), ...update }
      const changed = { ...record, valueDigest: sha256(receipt), payload: { tool: 'file-mutation-denied' as const, nativeDenialJson: canonicalJson(receipt) } }
      expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [changed] })).files).toBeUndefined()
    }
  } finally { await h.handle.dispose();await h.ctx.fiber.dispose() }
})

it.each(['write', 'edit'] as const)('preserves refused %s in chat without allowing any output mutation', async tool => {
  const h = await run(tool, 'trusted', 'chat')
  try { expect(h.deniedDispatches).toBe(0);expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files?.outputKind).toBe('chat');expect(h.task.completion?.files?.outputPaths).toEqual([]);expect(existsSync(join(h.root, 'output.md')) ? readFileSync(join(h.root, 'output.md'), 'utf8') : null).toBe(tool === 'edit' ? 'BEFORE' : null);expect(h.task.review?.reviewChecks).toHaveLength(2);expect(h.task.review?.verdict).toBe('met') }
  finally { await h.handle.dispose();await h.ctx.fiber.dispose() }
})

it.each((['write', 'edit'] as const).flatMap(tool => (['unknown', 'body', 'revoked', 'producer-drift', 'cancelled', 'definition-drift'] as const).map(mode => ({ tool, mode }))))('keeps $tool $mode rejection unverifiable instead of silently discarding an error', async ({ tool, mode }) => {
  const h = await run(tool, mode)
  try { expect(h.task.completion?.files).toBeUndefined();expect(h.task.fileAncillary).toBeUndefined();expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files).toBeUndefined();expect(h.deniedDispatches).toBe(mode === 'body' ? 1 : 0) }
  finally { await h.handle.dispose();await h.ctx.fiber.dispose() }
})

it('recovers mixed read and edit denials in original order without converting them into file inputs', async () => {
  const h = await run('edit', 'trusted', 'files', 'local-files', true)
  try {
    const material = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(h.task.fileUnavailable).toBeUndefined();expect(h.task.fileAncillary?.map(record => record.payload.tool)).toEqual(['read-denied', 'file-mutation-denied'])
    expect(material.fileExecution?.schemaVersion).toBe('tianwen.file-execution-evidence.v4')
    if (material.fileExecution?.schemaVersion !== 'tianwen.file-execution-evidence.v4') throw new Error('missing mutation evidence')
    expect(material.fileExecution.actions.map(action => [action.tool, action.status])).toEqual([['read', 'denied'], ['edit', 'denied'], ['read', 'success'], ['edit', 'success']])
    expect(material.files?.entries.map(entry => entry.path)).not.toContain('blocked.md')
  } finally { await h.handle.dispose();await h.ctx.fiber.dispose() }
})

it('retains external code file capture without manufacturing independent functional verification', async () => {
  const h = await run('write', 'trusted', 'files', 'external')
  try {
    expect(h.task.fileUnavailable).toBeUndefined();expect(h.task.fileAncillary?.[0]?.payload.tool).toBe('file-mutation-denied')
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files?.outputKind).toBe('files')
    expect(h.task.externalCheckPrepared).toBeUndefined();expect(h.task.externalCheckFinished?.status).not.toBe('verified')
  } finally { await h.handle.dispose();await h.ctx.fiber.dispose() }
})
