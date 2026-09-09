import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { parseConversationFileTrialReceipt, recoverConversationFileTrial, runConversationFileTrial } from '../../packages/tianwen-runtime-bundle/src/conversation-file-trial.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const fileTools = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const agentPresets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const codeRuntime = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-code-runtime-worker-thread')).href)
const presentationPath = cliRequire.resolve('@deepseek-ai/dsh-agent-tool-presentation').replaceAll('\\', '/')
const roots: string[] = []

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

async function mountTrial(script: Parameters<typeof mountPersistentHarness>[1], options: { readonly codePreset?: boolean, readonly sandboxPolicy?: boolean } = {}) {
  const base = 'D:/DevData/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'file-trial-')); roots.push(root)
  const original = join(root, 'original'); const replicas = join(root, 'replicas')
  mkdirSync(original); mkdirSync(replicas)
  writeFileSync(join(original, 'input.md'), 'original source')
  const harness = await mountPersistentHarness(join(root, 'sessions'), script)
  if (options.sandboxPolicy) harness.ctx.provide('sandboxPolicy', {
    defaultMode: 'read-only',
    overrideOf(session: { readonly events: readonly { readonly type: string, readonly data: unknown }[] }) {
      const event = session.events.findLast(item => item.type === 'sandbox/mode')
      return (event?.data as { readonly mode?: string } | undefined)?.mode
    },
  } as never)
  await harness.ctx.plugin(localFs.default, { cwd: root })
  await harness.ctx.plugin(fileTools, {})
  if (options.codePreset) {
    const presetRoot = join(root, 'presets'); const preset = join(presetRoot, 'code-test')
    mkdirSync(preset, { recursive: true })
    writeFileSync(join(preset, 'agent.cordis.yml'), `- id: tool-presentation\n  name: '${presentationPath}'\n  config:\n    mode: code\n`)
    await harness.ctx.plugin(Loader)
    await harness.ctx.plugin(codeRuntime.default, {})
    await harness.ctx.plugin(agentPresets.default, { default: 'code-test', roots: [{ path: presetRoot, trust: 'system' }], includeUserRoot: false })
  }
  const presets = harness.ctx.get('agentPresets')
  const parent = await harness.ctx.agents.create({ sessionId: SessionId(`file-trial-parent-${roots.length}`),
    meta: { cwd: original, ...(options.codePreset ? { agentPreset: 'code-test' } : {}) },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    ...(options.codePreset ? { setup: async (agentCtx: typeof harness.ctx) => { await presets!.mount(agentCtx, 'code-test') } } : {}) })
  const material = {
    prompt: 'Read input.md and write its requested result to output.md.',
    files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd: original,
      entries: [{ path: 'input.md', content: 'original source' }, { path: 'output.md', content: null }], outputPaths: ['output.md'] },
  }
  const input = { label: 'candidate', material,
    callConfig: { provider: 'tianwen-probe', model: 'scripted', temperature: 0.2, maxTokens: 512 },
    signal: new AbortController().signal, replicaParent: replicas }
  return { ...harness, root, original, replicas, parent, material, input }
}

it('runs native file tools only in a seeded replica and returns the captured output', async () => {
  const harness = await mountTrial([
    request => {
      expect(request.tools?.map(tool => tool.name).toSorted()).toEqual(['edit', 'read', 'write'])
      return toolCallResponse('read-source', 'read', { file_path: 'input.md' })
    },
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved the requested file.'),
  ])
  try {
    const retained: unknown[] = []
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      retainReceipt: receipt => { retained.push(receipt) } })
    expect(result.files).toEqual([{ path: 'input.md', content: 'original source' }, { path: 'output.md', content: 'candidate result' }])
    expect(readFileSync(join(harness.original, 'input.md'), 'utf8')).toBe('original source')
    expect(() => readFileSync(join(harness.original, 'output.md'), 'utf8')).toThrow()
    expect(retained).toEqual([result.receipt])
    expect(readdirSync(harness.replicas)).toEqual([])
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('recovers the exact retained output cold without reading current workspace files', async () => {
  const harness = await mountTrial([
    toolCallResponse('read-source', 'read', { file_path: 'input.md' }),
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved the requested file.'),
  ])
  try {
    let retained: Parameters<typeof parseConversationFileTrialReceipt>[0]
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      retainReceipt: receipt => { retained = structuredClone(receipt) } })
    writeFileSync(join(harness.original, 'input.md'), 'tampered current source')
    expect(await recoverConversationFileTrial(harness.ctx, result.proof, { receipt: retained!, material: harness.material,
      callConfig: harness.input.callConfig, outputDigest: result.outputDigest })).toEqual({
      answer: 'Saved the requested file.', files: [{ path: 'input.md', content: 'original source' }, { path: 'output.md', content: 'candidate result' }],
      outputDigest: result.outputDigest,
    })
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects missing native file output instead of treating chat text as success', async () => {
  const harness = await mountTrial([toolCallResponse('read-source', 'read', { file_path: 'input.md' }), textResponse('I saved it.')])
  try {
    let retained = false
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      retainReceipt: () => { retained = true } })).rejects.toThrow('missing a native output mutation')
    expect(retained).toBe(false)
    expect(readFileSync(join(harness.original, 'input.md'), 'utf8')).toBe('original source')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('denies original paths and disallowed tools but lets a later scoped native write complete', async () => {
  let original: string
  const harness = await mountTrial([
    () => toolCallResponse('outside-write', 'write', { file_path: join(original, 'input.md'), content: 'escaped' }),
    toolCallResponse('unknown-call', 'structured_output', { answer: 'spoofed' }),
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  original = harness.original
  try {
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: () => undefined })
    expect(readFileSync(join(harness.original, 'input.md'), 'utf8')).toBe('original source')
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.proof.sessionId))
    for (const id of ['outside-write', 'unknown-call']) expect(saved.events.some(event => event.type === 'tool/result'
      && String(event.data.message.source.callId) === id && event.data.message.content[0].isError === true)).toBe(true)
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('awaits an immutable receipt before return and preserves the replica when retention fails', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let callbackStarted = false; let settled = false
  try {
    const running = runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: async receipt => {
      callbackStarted = true
      expect(Object.isFrozen(receipt)).toBe(true)
      expect(Object.isFrozen(receipt.files)).toBe(true)
      await gate
    } }).finally(() => { settled = true })
    while (!callbackStarted) await new Promise(resolve => setTimeout(resolve, 1))
    expect(settled).toBe(false)
    release()
    await running
    expect(readdirSync(harness.replicas)).toEqual([])
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }

  const failing = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  try {
    await expect(runConversationFileTrial(failing.ctx, failing.parent.agent, { ...failing.input,
      retainReceipt: () => { throw new Error('ledger unavailable') } })).rejects.toThrow('ledger unavailable')
    expect(readdirSync(failing.replicas)).toHaveLength(1)
  } finally { await failing.parent.dispose(); await failing.ctx.fiber.dispose() }
})

it('requires real reads for chat trials and returns their actual visible answer', async () => {
  const harness = await mountTrial([toolCallResponse('read-source', 'read', { file_path: 'input.md' }), textResponse('Answer from source.')])
  const chatMaterial = { prompt: 'Read input.md and answer here.', files: { ...harness.material.files, outputKind: 'chat' as const,
    entries: [{ path: 'input.md', content: 'original source' }], outputPaths: [] } }
  try {
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, material: chatMaterial,
      retainReceipt: () => undefined })
    expect(result).toMatchObject({ answer: 'Answer from source.', files: [{ path: 'input.md', content: 'original source' }] })
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('strictly parses bounded receipts and rejects output or field tampering', () => {
  const files = [{ path: 'output.md', content: 'result' }]
  const value = { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: 'files', answer: '', files,
    outputDigest: sha256({ answer: '', files }), workerMaterialDigest: sha256({ prompt: 'task' }), executionProof: {
      sessionId: 'trial', sessionDigest: sha256('session'), requestDigest: sha256('request'),
    } }
  expect(parseConversationFileTrialReceipt(value)).toEqual(value)
  expect(() => parseConversationFileTrialReceipt({ ...value, extra: true })).toThrow('invalid fields')
  expect(() => parseConversationFileTrialReceipt({ ...value, files: [{ path: 'output.md', content: 'changed' }] })).toThrow('output digest')
  expect(() => parseConversationFileTrialReceipt({ ...value, answer: 'x'.repeat(32769) })).toThrow('receipt is invalid')
})

it('joins the parent live preset, forces only native file tools in the child, and leaves parent Code Mode unchanged', async () => {
  const harness = await mountTrial([
    request => {
      expect(request.tools?.map(tool => tool.name).toSorted()).toEqual(['edit', 'read', 'write'])
      return toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'preset result' })
    },
    textResponse('Saved.'),
  ], { codePreset: true })
  try {
    const parentTools = harness.parent.agent.ctx.tools.schemas(harness.parent.agent).map(tool => tool.name)
    expect(parentTools).toContain('run_code')
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: () => undefined })
    expect(result.files.find(file => file.path === 'output.md')?.content).toBe('preset result')
    expect(harness.parent.agent.ctx.tools.schemas(harness.parent.agent).map(tool => tool.name)).toEqual(parentTools)
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.proof.sessionId))
    expect(saved.meta.agentPreset).toBe('code-test')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects mismatched cold recovery material, guidance, config, output digest, and native proof', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  try {
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, guidance: 'Keep it concise.', retainReceipt: () => undefined })
    const recover = (overrides: Record<string, unknown> = {}, proof = result.proof) => recoverConversationFileTrial(harness.ctx, proof, {
      receipt: result.receipt, material: harness.material, guidance: 'Keep it concise.', callConfig: harness.input.callConfig,
      outputDigest: result.outputDigest, ...overrides,
    })
    await expect(recover({ material: { ...harness.material, prompt: 'Different task.' } })).rejects.toThrow()
    await expect(recover({ guidance: 'Different guidance.' })).rejects.toThrow('request drift')
    await expect(recover({ callConfig: { ...harness.input.callConfig, temperature: 0.8 } })).rejects.toThrow('configuration drift')
    await expect(recover({ outputDigest: sha256('different') })).rejects.toThrow('does not match')
    await expect(recover({}, { ...result.proof, sessionDigest: sha256('tampered') })).rejects.toThrow('does not match')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects cancellation and extra worker material before retaining an output', async () => {
  const controller = new AbortController()
  const harness = await mountTrial([() => { controller.abort(); return textResponse('Cancelled.') }])
  try {
    let retained = false
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, signal: controller.signal,
      retainReceipt: () => { retained = true } })).rejects.toThrow('cancelled')
    expect(retained).toBe(false)
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      material: { ...harness.material, criteria: ['review-only'] } as never, retainReceipt: () => undefined })).rejects.toThrow('invalid fields')
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      material: { ...harness.material, prompt: 'x'.repeat(100_000) }, retainReceipt: () => undefined })).rejects.toThrow('material-too-large')
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input,
      callConfig: null as never, retainReceipt: () => undefined })).rejects.toThrow('call config is invalid')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('captures delegated policy synchronously before replica filesystem awaits', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ], { sandboxPolicy: true })
  harness.parent.agent.session.append('sandbox/mode', { mode: 'read-only', source: 'user' })
  try {
    const running = runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: () => undefined })
    harness.parent.agent.session.append('sandbox/mode', { mode: 'danger-full-access', source: 'user' })
    const result = await running
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.proof.sessionId))
    expect(saved.events.filter(event => event.type === 'sandbox/mode').map(event => event.data)).toEqual([
      { mode: 'read-only', source: 'delegation' },
    ])
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('refuses cleanup when the owned child is replaced by a directory link', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  const sibling = join(harness.replicas, 'must-survive')
  mkdirSync(sibling); writeFileSync(join(sibling, 'sentinel.txt'), 'keep')
  let linkedChild: string | undefined
  try {
    await expect(runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: async receipt => {
      const saved = await harness.ctx.sessionPersistence.inspect(SessionId(receipt.executionProof.sessionId))
      linkedChild = saved.meta.cwd!
      rmSync(linkedChild, { recursive: true })
      symlinkSync(sibling, linkedChild, 'junction')
    } })).rejects.toThrow('ownership changed')
    expect(readFileSync(join(sibling, 'sentinel.txt'), 'utf8')).toBe('keep')
  } finally {
    if (linkedChild !== undefined) rmSync(linkedChild, { force: true })
    await harness.parent.dispose(); await harness.ctx.fiber.dispose()
  }
})

it('binds cold receipt files to the exact frozen entry set and present outputs', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'candidate result' }),
    textResponse('Saved.'),
  ])
  try {
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, retainReceipt: () => undefined })
    const forged = (files: readonly { readonly path: string, readonly content: string | null }[]) => ({ ...result.receipt, files,
      outputDigest: sha256({ answer: result.answer, files }) })
    const recover = (files: readonly { readonly path: string, readonly content: string | null }[]) => recoverConversationFileTrial(
      harness.ctx, result.proof, { receipt: forged(files), material: harness.material, callConfig: harness.input.callConfig,
        outputDigest: forged(files).outputDigest })
    await expect(recover([{ path: 'output.md', content: 'candidate result' }])).rejects.toThrow('file set')
    await expect(recover([...result.files, { path: 'extra.md', content: 'invented' }])).rejects.toThrow('file set')
    await expect(recover([{ path: 'input.md', content: 'original source' }, { path: 'output.md', content: null }])).rejects.toThrow('output is missing')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})

it('accepts a successful native save when an already-correct output keeps the same bytes', async () => {
  const harness = await mountTrial([
    toolCallResponse('write-output', 'write', { file_path: 'output.md', content: 'already correct' }),
    textResponse('Saved.'),
  ])
  const material = { ...harness.material, files: { ...harness.material.files,
    entries: [{ path: 'input.md', content: 'original source' }, { path: 'output.md', content: 'already correct' }] } }
  try {
    const result = await runConversationFileTrial(harness.ctx, harness.parent.agent, { ...harness.input, material,
      retainReceipt: () => undefined })
    expect(result.files.find(file => file.path === 'output.md')?.content).toBe('already correct')
  } finally { await harness.parent.dispose(); await harness.ctx.fiber.dispose() }
})
