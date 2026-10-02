import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import Subagents from '@deepseek-ai/dsh-subagent'
import { mountFeedbackHarness, SessionId, createUserMessage, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import { apply } from '../../packages/tianwen-runtime-bundle/src/runtime.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { observeNativeTaskRequests } from '../../scripts/native-task-request-observer.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const localFs = (await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-fs-local')).href)).default
const fileTools = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-tool-fs')).href)
const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const admission = { decision: { kind: 'task', objective: 'Save the final pilot counter in output.md.', criteria: ['Preserve pilot and save the final counter in output.md.'], family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', relatedTaskId: null, feedback: null } }
const review = () => auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Owned scripted fixture only.', evidenceQuotes: ['pilot'] })

for (const scenario of ['post-nine', 'legacy-cap', 'tool-cap', 'outside', 'unprepared', 'readonly'] as const) it(`keeps native task execution and evidence boundaries: ${scenario}`, async () => {
  const base = process.env.TIANWEN_REQUEST_OBSERVER_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-request-observer-tests' : '/tmp/tianwen-request-observer-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'native-'))
  const sessionId = SessionId('owned-request-observer-fixture')
  const operation = (index: number, name: string, args: Record<string, unknown>) => toolCallResponse(`file-${index}`, name, args)
  const operations: ScriptEntry[] = scenario === 'outside'
    ? [operation(1, 'write', { file_path: 'outside.md', content: 'should not exist' })]
    : scenario === 'tool-cap'
      ? [operation(0, 'read', { file_path: 'input.md' }), ...Array.from({ length: 15 }, (_, i) => operation(i + 1, 'write', { file_path: 'output.md', content: `pilot ${i}` }))]
      : [operation(0, 'read', { file_path: 'input.md' }), operation(1, 'write', { file_path: 'output.md', content: 'pilot 0' }),
        ...Array.from({ length: 9 }, (_, i) => operation(i + 2, 'edit', { file_path: 'output.md', old_string: `pilot ${i}`, new_string: `pilot ${i + 1}` })),
        operation(11, 'read', { file_path: 'output.md' })]
  const script: ScriptEntry[] = [toolCallResponse('admission', 'structured_output', admission), ...operations, textResponse('pilot saved'), review(), review()]
  const h = await mountFeedbackHarness(join(root, 'profile'), script)
  let toolAttempts = 0, preparations = 0, evaluations = 0, prepared = false, legacyRoots = 0
  let handle: Awaited<ReturnType<typeof h.ctx.agents.create>> | undefined
  let observation: ReturnType<typeof observeNativeTaskRequests> | undefined
  let legacyOff: (() => void) | undefined
  writeFileSync(join(root, 'input.md'), 'pilot')
  try {
    await h.ctx.plugin(localFs, { cwd: root }); await h.ctx.plugin(fileTools)
    await h.ctx.plugin(Subagents); await h.ctx.plugin(spawn, { providerName: 'spawn' })
    await apply(h.ctx, { stateRoot: join(root, 'state'), sessionsRoot: join(root, 'profile/sessions'), evolutionRoot: join(root, 'evolution'), captureExternalCodeArtifacts: true, exposeCapturedFileFacts: false,
      externalCodeCheck: { async prepare() {
        preparations++
        if (scenario === 'unprepared') return undefined
        prepared = true
        const inputs = [{ path: 'input.md', content: 'pilot' }, { path: 'output.md', content: null }]
        return { checkerId: 'owned-scripted-pilot-fixture', checkerDigest: sha256('owned-scripted-pilot-fixture'), contractDigest: sha256(inputs), inputs,
          async evaluate(candidate) { evaluations++; return candidate.outputs.find(file => file.path === 'output.md')?.content === 'pilot 9'
            ? { status: 'verified', detail: 'Owned controlled fixture final file matches.' }
            : { status: 'unverifiable', detail: 'Controlled fixture not complete.' } } }
      } } })
    h.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
    if (scenario === 'legacy-cap') legacyOff = h.ctx.on('llm/stream', async function* (request, next) {
      if (String(request.sessionId) === String(sessionId)) { assert(legacyRoots < 9); assert(prepared); legacyRoots++ }
      yield* next()
    })
    else observation = observeNativeTaskRequests(h.ctx, { rootSessionId: String(sessionId), requestsAllowed: scenario !== 'readonly', isPrepared: () => prepared })
    handle = await h.ctx.agents.create({ sessionId, meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' }, setup: ctx => {
      ctx.tools.presentAs('native'); ctx.tools.restrict({ allow: ['read', 'write', 'edit'] }); ctx.tools.guard(execution => {
        if (String(execution.agent?.session.id) !== String(sessionId)) return
        if (++toolAttempts > 14) return 'task tool limit exceeded'
        const args = execution.arguments as Record<string, unknown> | undefined
        if (!args || typeof args.file_path !== 'string' || execution.parent !== undefined) return 'only declared file actions permitted'
        const path = resolve(root, args.file_path)
        if (execution.name === 'read' && [join(root, 'input.md'), join(root, 'output.md')].includes(path)) return
        if (['write', 'edit'].includes(execution.name) && path === join(root, 'output.md')) return
        return 'only declared file actions permitted'
      })
    } })
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Read input.md and save the pilot counter after nine increments in output.md. Use only those two files.' }] }))
    await handle.agent.whenIdle(); await h.ctx.tianwenConversationObserver.whenIdle(); await h.ctx.tianwenConversationGuidanceLoop.whenIdle()
    const task = h.ctx.tianwenEvolution.listConversationTasks(String(sessionId))[0]
    const output = existsSync(join(root, 'output.md')) ? readFileSync(join(root, 'output.md'), 'utf8') : null
    if (scenario === 'post-nine') {
      expect(output).toBe('pilot 9'); expect(toolAttempts).toBe(12); expect(observation!.counts().rootForwarded).toBe(13)
      expect(task?.completion).toMatchObject({ status: 'completed', files: { outputPaths: ['output.md'] } })
      expect(task?.externalCheckFinished?.status).toBe('verified'); expect(evaluations).toBe(1)
      expect(task?.review).toMatchObject({ verdict: 'met', reviewChecks: [{ verdict: 'met' }, { verdict: 'met' }] })
    } else if (scenario === 'legacy-cap') {
      expect(legacyRoots).toBe(9); expect(task?.completion?.status).toBe('failed'); expect(evaluations).toBe(0); expect(output).toBe('pilot 7')
    } else if (scenario === 'tool-cap') {
      expect(toolAttempts).toBe(16); expect(output).toBe('pilot 12'); expect(task?.externalCheckFinished?.status).toBe('unverifiable'); expect(evaluations).toBe(0)
    } else if (scenario === 'outside') {
      expect(existsSync(join(root, 'outside.md'))).toBe(false); expect(evaluations).toBe(0)
    } else {
      expect(output).toBeNull(); expect(toolAttempts).toBe(0); expect(evaluations).toBe(0)
      expect(observation!.counts().rootForwarded).toBe(0)
      if (scenario === 'readonly') expect(h.adapter.requests).toHaveLength(0)
      else expect(h.adapter.requests).toHaveLength(1)
    }
    expect(h.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(0)
    const receiptRoot = process.env.TIANWEN_REQUEST_OBSERVER_RECEIPT_ROOT
    if (receiptRoot !== undefined) { mkdirSync(receiptRoot, { recursive: true }); writeFileSync(join(receiptRoot, `${scenario}-${randomUUID()}.json`), JSON.stringify({ scenario, root, scriptedRequests: h.adapter.requests.length, realProviderRequests: 0, toolAttempts, preparations, evaluations, completion: task?.completion?.status ?? null, check: task?.externalCheckFinished?.status ?? null, counts: observation?.counts() ?? { rootForwarded: legacyRoots }, studies: 0, nature: 'controlled mechanism only' }), { flag: 'wx' }) }
  } finally {
    observation?.dispose(); legacyOff?.(); await handle?.dispose(); await h.ctx.fiber.dispose()
    const resolved = resolve(root); assert(resolved.startsWith(resolve(base) + sep)); rmSync(resolved, { recursive: true, force: true })
  }
})
