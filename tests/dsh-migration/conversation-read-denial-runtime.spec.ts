import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { NativeObservedToolRuntime } from '../../packages/tianwen-runtime-bundle/src/native-tools-observer.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial, fileExecutionTexts } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { verifyConversationFileAncillary } from '../../packages/tianwen-runtime-bundle/src/conversation-file-ancillary.js'
import { canonicalJson } from '../../packages/tianwen-evolution/src/learning-intake.js'

const require = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const load = (n: string) => import(/* @vite-ignore */ pathToFileURL(require.resolve(n)).href)
const [fs, fileTools, spawn] = await Promise.all(['@deepseek-ai/dsh-fs-local', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-subagent-spawn-in-process'].map(load))
const base = 'D:/DevData/tianwen-conversation-tests', roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) { if (dirname(resolve(root)) !== resolve(base) || !basename(root).startsWith('denial-')) throw new Error('unexpected test root'); rmSync(root, { recursive: true, force: true }) } })
const producer = { id: 'reviewed-test-guard.v1', digest: sha256('reviewed original guard') }, reason = 'Only declared files'
type Mode = 'trusted' | 'unknown' | 'body' | 'revoked' | 'cancelled' | 'producer-drift' | 'definition-drift'

async function run(mode: Mode, outputKind: 'chat' | 'files' = 'files', evaluationMode: 'local-files' | 'external' = 'local-files') {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'denial-')); roots.push(root); writeFileSync(join(root, 'input.md'), 'ORIGINAL_INPUT')
  const admission = { kind: 'task', objective: 'Use original input', criteria: ['Use original input'], family: evaluationMode === 'external' ? 'code' : 'summarization', evaluationMode,
    ...(evaluationMode === 'local-files' ? { fileOutputKind: outputKind } : {}), relatedTaskId: null, feedback: null }
  const review = { verdict: 'met', category: null, explanation: 'Original source kept', evidenceQuotes: ['saved'] }
  const script = [toolCallResponse('admit', 'structured_output', { decision: admission }), toolCallResponse('denied', 'read', { file_path: 'outside-directory' }), toolCallResponse('good', 'read', { file_path: 'input.md' }),
    ...(outputKind === 'files' ? [toolCallResponse('write', 'write', { file_path: 'output.md', content: 'GENERATED_OUTPUT' })] : []), textResponse('saved'), auditedEvidenceResponse(review), auditedEvidenceResponse(review)]
  const h = await mountPersistentHarness(join(root, 'sessions'), script)
  for (const fiber of [...h.ctx.registry.get(ToolRuntime)!.fibers]) await fiber.dispose()
  await h.ctx.plugin(NativeObservedToolRuntime); await h.ctx.plugin(fs.default, { cwd: root }); await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' }); await h.ctx.plugin(fileTools, {})
  await applyCore(h.ctx, { evolutionRoot: join(root, 'evolution') }); h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await h.ctx.plugin(TianwenConversationFileObserverService, { readDenialSources: [producer], externalCodeArtifacts: evaluationMode === 'external' }); await h.ctx.plugin(TianwenConversationObserverService)
  let deniedDispatches = 0
  h.ctx.on('tools/execute', (exec, next) => { if (exec.name === 'read' && (exec.arguments as { file_path?: string }).file_path === 'outside-directory') { deniedDispatches++; if (mode === 'body') throw new Error(reason) }; return next() })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('read-denial'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup(ctx) {
    ctx.tools.presentAs('native'); ctx.tools.restrict({ allow: ['read', 'write', 'edit'] })
    const guard = (exec: Parameters<typeof ctx.tools.guard>[0] extends (e: infer E) => unknown ? E : never) => {
      if (exec.name !== 'read' || (exec.arguments as { file_path?: string }).file_path !== 'outside-directory' || mode === 'body') return
      if (mode === 'revoked') h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      if (mode === 'cancelled') handle.agent.cancel({ kind: 'user' })
      if (mode === 'definition-drift') ctx.tools.get('read', exec.agent)!.description += ' changed'
      return reason
    }
    if (mode === 'unknown' || mode === 'body') ctx.tools.guard(guard)
    else h.ctx.tianwenConversationFileObserver.guardRead(ctx, mode === 'producer-drift' ? { ...producer, digest: sha256('changed') } : producer, guard)
  } })
  handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Use input.md; produce requested answer.' }] }))
  await handle.agent.whenIdle(); await h.ctx.tianwenConversationObserver.whenIdle()
  return { ...h, handle, root, deniedDispatches, task: h.ctx.tianwenEvolution.listConversationTasks()[0]! }
}

it.each(['files', 'chat'] as const)('retains trusted pre-dispatch denial as an error action with original %s files and exact cold recovery', async outputKind => {
  const h = await run('trusted', outputKind)
  try {
    expect(h.deniedDispatches).toBe(0); expect(h.task.fileUnavailable).toBeUndefined(); expect(h.task.fileAncillary).toHaveLength(1)
    expect(h.task.fileAncillary![0]!.payload.tool).toBe('read-denied'); expect(h.task.fileInputs!.map(f => f.path)).not.toContain('outside-directory')
    const material = await recoverConversationTaskMaterial(h.ctx, h.task)
    expect(material.files?.outputKind).toBe(outputKind); expect(material.fileExecution?.schemaVersion).toBe('tianwen.file-execution-evidence.v3')
    if (material.fileExecution?.schemaVersion !== 'tianwen.file-execution-evidence.v3') throw new Error('missing denial projection')
    expect(material.fileExecution.actions[0]).toMatchObject({ tool: 'read', path: null, status: 'denied', reason })
    expect(material.fileExecution.actions.map(action => [action.tool, action.status])).toEqual(outputKind === 'files'
      ? [['read', 'denied'], ['read', 'success'], ['write', 'success']] : [['read', 'denied'], ['read', 'success']])
    expect(fileExecutionTexts(material.fileExecution!).join('\n')).toContain(reason)
    const reviews = h.adapter.requests.filter(request => JSON.stringify(request.messages).includes('File provenance:'))
    expect(reviews).toHaveLength(2)
    for (const request of reviews) {
      const text = JSON.stringify(request.messages)
      expect(text).toContain('File action tool items are host-recovered')
      expect(text).toContain('Denied reads did not access a file')
      expect(text).not.toContain('The absence of write/edit calls is limited')
    }
    rmSync(join(h.root, 'input.md')); const requests = h.adapter.requests.length
    expect(await recoverConversationTaskMaterial(h.ctx, h.task)).toEqual(material); expect(h.adapter.requests.length).toBe(requests)
    const missing = { ...h.task, fileAncillary: [] }; expect((await recoverConversationTaskMaterial(h.ctx, missing)).files).toBeUndefined()
    expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [...h.task.fileAncillary!, h.task.fileAncillary![0]!] })).files).toBeUndefined()
    const record = h.task.fileAncillary![0]!
    for (const drift of [{ ...record, argumentsDigest: sha256('other') }, { ...record, resultDigest: sha256('other') }, { ...record, valueDigest: sha256('other') }]) expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [drift] })).files).toBeUndefined()
    const events = h.handle.agent.session.events, boundary = h.task.completion!.files!.captureSeq
    expect(() => verifyConversationFileAncillary(h.task, h.root, events, boundary, { readDenialSources: [] })).toThrow()
    for (const update of [{ producer: { ...producer, digest: sha256('different') } }, { identity: { ...JSON.parse((record.payload as { nativeDenialJson: string }).nativeDenialJson).identity, sessionId: 'other' } }]) {
      const receipt = { ...JSON.parse((record.payload as { nativeDenialJson: string }).nativeDenialJson), ...update }
      const drift = { ...record, valueDigest: sha256(receipt), payload: { tool: 'read-denied' as const, nativeDenialJson: canonicalJson(receipt) } }
      expect((await recoverConversationTaskMaterial(h.ctx, { ...h.task, fileAncillary: [drift] })).files).toBeUndefined()
    }
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each(['unknown', 'body', 'revoked', 'cancelled', 'producer-drift', 'definition-drift'] as const)('fails closed for %s without certifying that error as a read', async mode => {
  const h = await run(mode)
  try { expect(h.task.completion?.files).toBeUndefined(); expect(h.task.fileAncillary).toBeUndefined(); expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files).toBeUndefined(); expect(h.deniedDispatches).toBe(mode === 'body' ? 1 : 0) }
  finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})

it('stores only the read-denied ancillary branch for a prospective external file task without manufacturing program acceptance', async () => {
  const h = await run('trusted', 'files', 'external')
  try {
    expect(h.task.fileUnavailable).toBeUndefined(); expect(h.task.fileAncillary?.[0]?.payload.tool).toBe('read-denied')
    expect((await recoverConversationTaskMaterial(h.ctx, h.task)).files?.outputKind).toBe('files')
    expect(h.task.externalCheckPrepared).toBeUndefined(); expect(h.task.externalCheckFinished?.status).not.toBe('verified')
  } finally { await h.handle.dispose(); await h.ctx.fiber.dispose() }
})
