import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationFileObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-file-observer.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverNativeFileFactDiagnostic } from '../../scripts/native-file-fact-diagnostic.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const base = resolve(process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    const child = relative(base, resolve(root))
    if (!child.startsWith('native-fact-') || child.includes(sep) || isAbsolute(child)) throw new Error('unsafe test cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})

const content = '\uFEFF你好\r\n🙂\r\n'
const row = { path: 'input.md', bytes: 17, lines: 2, sha256: createHash('sha256').update(content).digest('hex') }
const table = JSON.stringify({ files: [row] })
const request = 'Read input.md, report its file facts, and explain whether the proposed launch is justified.'

async function mount(answer = table) {
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'native-fact-')); roots.push(root)
  const decision = { kind: 'task', objective: 'Report file facts', criteria: ['Report the file facts'], family: 'other',
    evaluationMode: 'local-files', fileOutputKind: 'chat', relatedTaskId: null, feedback: null }
  const review = { verdict: 'met', category: null, explanation: 'File facts supplied.', evidenceQuotes: [answer] }
  const harness = await mountPersistentHarness(join(root, 'sessions'), [
    toolCallResponse('admission', 'structured_output', { decision }),
    toolCallResponse('read-input', 'read', { file_path: 'input.md' }), textResponse(answer),
    auditedEvidenceResponse(review), auditedEvidenceResponse(review),
  ])
  await harness.ctx.plugin(localFs.default, { cwd: root })
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await harness.ctx.plugin(fileTools, {})
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationFileObserverService)
  await harness.ctx.plugin(TianwenConversationObserverService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('native-fact'), meta: { cwd: root },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  writeFileSync(join(root, 'input.md'), content)
  handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: request }], source: { kind: 'user' } }))
  await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
  const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
  expect(task.admission?.decision, task.admission?.unavailableReason ?? '').toMatchObject({ evaluationMode: 'local-files', fileOutputKind: 'chat' })
  return { ...harness, root, handle, task }
}

it('binds actual frozen source and full answer, without promoting incomplete criteria to full coverage', async () => {
  const harness = await mount()
  try {
    expect(harness.task.review?.verdict).toBe('met')
    const before = structuredClone(harness.ctx.tianwenEvolution.listEvents())
    const nativeBefore = await harness.ctx.sessionPersistence.inspect(SessionId('native-fact'))
    writeFileSync(join(harness.root, 'input.md'), 'later file contents')
    expect(await recoverNativeFileFactDiagnostic(harness.ctx, harness.task.source.taskId)).toMatchObject({
      availability: 'recovered', verification: { status: 'verified' }, requirementCoverage: 'unestablished',
      binding: { taskId: harness.task.source.taskId, requestDigest: harness.task.source.requestDigest,
        contextDigest: harness.task.source.contextDigest, resultDigest: harness.task.completion!.resultDigest },
    })
    expect(harness.ctx.tianwenEvolution.listEvents()).toEqual(before)
    expect(await harness.ctx.sessionPersistence.inspect(SessionId('native-fact'))).toEqual(nativeBefore)
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(0)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each([
  { answer: JSON.stringify({ files: [{ ...row, bytes: 18 }] }), status: 'rejected' },
  { answer: table + '\nLaunch is safe.', status: 'unverifiable' },
  { answer: table.replace('"bytes":17', '"bytes":18,"bytes":17'), status: 'unverifiable' },
  { answer: '```json\n' + table + '\n```', status: 'unverifiable' },
])('checks the complete native answer: $status', async ({ answer, status }) => {
  const harness = await mount(answer)
  try {
    expect(await recoverNativeFileFactDiagnostic(harness.ctx, harness.task.source.taskId)).toMatchObject({
      availability: 'recovered', verification: { status }, requirementCoverage: 'unestablished',
    })
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('refuses unknown tasks and altered native request or completion records', async () => {
  const harness = await mount()
  try {
    expect(await recoverNativeFileFactDiagnostic(harness.ctx, 'unknown')).toMatchObject({ availability: 'unavailable' })
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId('native-fact'))
    const inspect = vi.spyOn(harness.ctx.sessionPersistence, 'inspect')
  for (const kind of ['user/message', 'assistant/message', 'request/header', 'tool/call'] as const) {
      const changed = { ...saved, events: saved.events.map(event => event.type !== kind ? event : {
        ...event, data: kind === 'user/message' ? { ...event.data, content: [{ type: 'text', text: 'changed' }] }
          : kind === 'assistant/message' ? { ...event.data, message: { ...(event.data as { message: object }).message, content: [{ type: 'text', text: table + ' altered' }] } }
          : kind === 'request/header' ? { ...event.data, header: { ...(event.data as { header: object }).header, config: { model: 'changed' } } }
          : { ...event.data, arguments: JSON.stringify({ file_path: 'other.md' }) },
      }) } as typeof saved
      inspect.mockResolvedValue(changed)
      expect(await recoverNativeFileFactDiagnostic(harness.ctx, harness.task.source.taskId)).toMatchObject({ availability: 'unavailable' })
    }
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not use caller-substituted task material or combine changing ledger snapshots', async () => {
  const harness = await mount()
  try {
    const list = vi.spyOn(harness.ctx.tianwenEvolution, 'listConversationTasks')
    list.mockReturnValue([{ ...harness.task, fileInputs: [] }])
    expect(await recoverNativeFileFactDiagnostic(harness.ctx, harness.task.source.taskId)).toMatchObject({
      availability: 'unavailable', reason: 'frozen-file-material-required',
    })
    list.mockReturnValueOnce([harness.task]).mockReturnValue([{ ...harness.task,
      admission: { ...harness.task.admission!, decision: { ...harness.task.admission!.decision!, criteria: ['changed after inspection'] } },
    }])
    expect(await recoverNativeFileFactDiagnostic(harness.ctx, harness.task.source.taskId)).toMatchObject({
      availability: 'unavailable', reason: 'recorded-task-changed',
    })
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})
