import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { baselineGuidanceSnapshot, guidanceInputDigest, guidanceStudyId, guidanceVersion, parseConversationGuidanceRecord, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { CONVERSATION_CASES_SCHEMA, CONVERSATION_FILE_CASES_SCHEMA, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { recoverConversationCaseDesign } from '../../packages/tianwen-runtime-bundle/src/conversation-case-design.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const base = resolve(process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'))
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    const child = relative(base, root)
    if (!child.startsWith('case-design-') || child.includes(sep) || isAbsolute(child)) throw new Error('unsafe test cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})

async function mount(files = false, checked = false) {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'case-design-')); roots.push(root)
  const source = (id: number) => ({ request: [{ content: [{ type: 'text', text: `Original requirement ${id}` }] }], context: [],
    objective: 'Summarize records', criteria: ['Preserve uncertainty'],
    feedbackStandard: { originalFeedback: { request: [{ content: [{ type: 'text', text: 'Preserve my exception and the assistant as speaker.' }] }] } } })
  const sources = [source(1), source(2)]
  const value = Object.fromEntries(['adjacent', 'holdout'].map((kind, index) => [kind, {
    prompt: `New ${kind} records with uncertainty ${index}`, criteria: ['Preserve the stated uncertainty'],
    ...(files ? { files: { entries: [{ path: `${kind}.md`, content: 'new input\r\n' }], outputPaths: [] } } : {}),
  }]))
  const checkedFailureSources = checked ? (['s1', 's2'] as const).map(taskId => ({ taskId, preparationDigest: sha256(`prepared:${taskId}`),
    outcomeDigest: sha256(`outcome:${taskId}`), requiredCondition: 'Preserve the supplied API.', detail: 'An original API name was replaced.' })) : undefined
  const references = checkedFailureSources === undefined ? {} : { checkedFailureSources: [checkedFailureSources[0]!, checkedFailureSources[1]!] as const }
  const material = { family: 'summarization', failureCategory: 'source-fidelity', sources, ...references }
  const harness = await mountPersistentHarness(join(root, 'sessions'), [toolCallResponse('design', 'structured_output', value)])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('case-design-parent'), meta: { cwd: root },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  const design = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Case design', instruction: 'Design independent cases.',
    material, outputSchema: files ? CONVERSATION_FILE_CASES_SCHEMA : CONVERSATION_CASES_SCHEMA, signal: new AbortController().signal })
  const saved = await harness.ctx.sessionPersistence.inspect(SessionId(design.proof.sessionId))
  const parentSnapshot = baselineGuidanceSnapshot('scope:case-design')
  const body: GuidanceStudyBody = { scopeKey: parentSnapshot.scopeKey, family: 'summarization', failureCategory: 'source-fidelity',
    consentRevision: 1, parentVersion: guidanceVersion(parentSnapshot), parentSnapshot, sourceTaskIds: ['s1', 's2'], counterexampleTaskId: 'counter',
    modelConfigDigest: sha256(saved.events.find(event => event.type === 'request/header')!.data.header.config),
    caseDesignProof: design.proof, ...references,
    ...(files ? { evaluationMode: 'local-files', fileOutputKind: 'chat' } : {}),
    cases: [
      ...(['source1', 'source2', 'counterexample'] as const).map((kind, index) => ({ id: kind, kind,
        sourceTaskId: ['s1', 's2', 'counter'][index]!, materialDigest: sha256(sources[index] ?? 'counter'), inputDigest: sha256(kind) })),
      ...(['adjacent', 'holdout'] as const).map(kind => {
        const generated = value[kind]!
        const { files: generatedFiles, ...textMaterial } = generated
        const complete = { ...textMaterial, ...(generatedFiles === undefined ? {} : { files: { ...generatedFiles,
          schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'chat' as const, cwd: root } }) }
        return { id: kind, kind, ...complete, inputDigest: guidanceInputDigest(generated.prompt, complete.files), materialDigest: sha256(complete) }
      }),
    ] }
  return { ...harness, root, handle, body, material, value, saved, opened: { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body } }
}

it.each([false, true])('recovers the complete native case design (%s file mode), without granting semantic independence', async files => {
  const harness = await mount(files)
  try {
    expect(parseConversationGuidanceRecord(harness.opened)).toEqual(harness.opened)
    const requests = harness.adapter.requests.length
    expect(await recoverConversationCaseDesign(harness.ctx, harness.opened)).toMatchObject({
      instruction: 'Design independent cases.', material: harness.material, output: harness.value,
      proof: harness.body.caseDesignProof, semanticIndependence: 'unestablished',
    })
    expect(harness.adapter.requests).toHaveLength(requests)
    expect(await harness.ctx.sessionPersistence.inspect(SessionId(harness.body.caseDesignProof!.sessionId))).toEqual(harness.saved)
    const { caseDesignProof: _proof, ...historical } = harness.body
    const old = { kind: 'study-opened' as const, studyId: guidanceStudyId(historical), ...historical }
    expect(parseConversationGuidanceRecord(old)).toEqual(old)
    expect(await recoverConversationCaseDesign(harness.ctx, old)).toBeUndefined()
    expect(() => parseConversationGuidanceRecord({ ...harness.opened, caseDesignProof: { ...harness.body.caseDesignProof!, requestDigest: sha256('changed') } })).toThrow()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})
it('recovers exact checked failure references from native design material without changing original source materials', async () => {
  const harness = await mount(true, true)
  try {
    const requests = harness.adapter.requests.length
    const recovered = await recoverConversationCaseDesign(harness.ctx, harness.opened)
    expect(recovered?.material).toEqual(harness.material)
    expect(harness.opened.cases.slice(0, 2).map(item => item.materialDigest)).toEqual(harness.material.sources.map(sha256))
    expect(harness.material.sources.every(source => !Object.hasOwn(source, 'checkedFailureSources'))).toBe(true)
    expect(recovered?.semanticIndependence).toBe('unestablished')
    const { checkedFailureSources: _references, ...absent } = harness.opened
    await expect(recoverConversationCaseDesign(harness.ctx, absent)).rejects.toThrow(/case-design-material/)
    for (const field of ['preparationDigest', 'outcomeDigest', 'requiredCondition', 'detail'] as const) {
      const original = harness.opened.checkedFailureSources!
      const changed = { ...original[0], [field]: field.endsWith('Digest') ? sha256('changed') : 'Changed reference' }
      await expect(recoverConversationCaseDesign(harness.ctx, { ...harness.opened, checkedFailureSources: [changed, original[1]] })).rejects.toThrow(/case-design-material/)
    }
    expect(harness.adapter.requests).toHaveLength(requests)
    expect(await harness.ctx.sessionPersistence.inspect(SessionId(harness.body.caseDesignProof!.sessionId))).toEqual(harness.saved)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects mismatched source, model and complete generated output, plus missing or altered native events', async () => {
  const harness = await mount()
  try {
    await expect(recoverConversationCaseDesign(harness.ctx, { ...harness.opened, modelConfigDigest: sha256('other model') })).rejects.toThrow()
    const changedCases = harness.opened.cases.map(item => item.kind === 'source1' ? { ...item, materialDigest: sha256('changed original requirement') } : item)
    await expect(recoverConversationCaseDesign(harness.ctx, { ...harness.opened, cases: changedCases })).rejects.toThrow()
    const changedOutput = harness.opened.cases.map(item => item.kind === 'holdout' && 'prompt' in item ? { ...item, prompt: item.prompt + ' extra content' } : item)
    await expect(recoverConversationCaseDesign(harness.ctx, { ...harness.opened, cases: changedOutput })).rejects.toThrow()
    const inspect = vi.spyOn(harness.ctx.sessionPersistence, 'inspect')
    inspect.mockRejectedValueOnce(new Error('missing session'))
    await expect(recoverConversationCaseDesign(harness.ctx, harness.opened)).rejects.toThrow()
    inspect.mockResolvedValueOnce({ ...harness.saved, events: harness.saved.events.map(event => event.type === 'tool/call'
      ? { ...event, data: { ...event.data, arguments: JSON.stringify({ ...harness.value, extra: true }) } } : event) } as typeof harness.saved)
    await expect(recoverConversationCaseDesign(harness.ctx, harness.opened)).rejects.toThrow()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})
