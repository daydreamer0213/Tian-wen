import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256, baselineGuidanceSnapshot, guidanceVersion, guidanceInputDigest, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationStudyTypeScriptCheck } from '../../scripts/conversation-typescript-check.js'
import { prepareConversationStudyResultChecks, evaluateConversationStudyResultCheck,
  type ConversationStudyResultPreparation, type ConversationStudyResultCandidate } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'

const base = 'D:/DevData/tianwen-study-typescript-20261001/test-roots'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const condition = 'The frozen target and context must have zero strict TypeScript noEmit diagnostics.'
function fixture() {
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'study-')); roots.push(cwd)
  writeFileSync(join(cwd, 'package.json'), '{"type":"module"}')
  // The present-day disk is intentionally unrelated to the saved task.
  writeFileSync(join(cwd, 'task.ts'), 'export const unrelated = true')
  writeFileSync(join(cwd, 'api.ts'), 'export const api: string = "present-day"')
  const requestText = 'Repair task.ts using the saved api.ts; require zero strict TypeScript noEmit diagnostics.'
  const original = 'import { api } from "./api.js"; export const value: string = api'
  const material = { caseId: 'source1', modelConfigDigest: sha256('model'),
    signal: new AbortController().signal, prompt: requestText, criteria: [condition], files: {
      schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd,
      entries: [{ path: 'task.ts', content: original }, { path: 'api.ts', content: 'export const api: number = 1' },
        { path: 'package.json', content: '{"type":"module"}' }], outputPaths: ['task.ts'],
    } } satisfies ConversationStudyResultPreparation
  const config = { cwd, requestText, criteria: [...material.criteria], targetPath: 'task.ts', contextPaths: ['api.ts'], referencePaths: ['api.ts', 'package.json'],
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] } }
  const candidate = (content = 'import { api } from "./api.js"; export const value: number = api') => {
    const { caseId: _caseId, modelConfigDigest: _model, ...body } = material
    return { ...structuredClone({ ...body, signal: undefined }), signal: material.signal, answer: '',
      inputs: structuredClone(material.files.entries), outputs: material.files.entries.map(entry => entry.path === 'task.ts'
        ? { path: entry.path, content } : structuredClone(entry)), outputPaths: ['task.ts'] }
  }
  return { cwd, original, requestText, material, config, candidate }
}

it('checks saved original files rather than today’s disk, sharing the compiler condition across both arms', async () => {
  const f = fixture(), prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(f.material)
  expect(prepared).toBeDefined(); expect(prepared!.inputs).toEqual(f.material.files.entries)
  expect(prepared!.requiredCondition).toBe(condition)
  expect(await prepared!.evaluate(f.candidate(f.original))).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
  expect((await prepared!.evaluate(f.candidate())).status).toBe('verified')
})

it('uses declared saved files even when their original disk paths no longer exist', async () => {
  const f = fixture(); rmSync(join(f.cwd, 'task.ts')); rmSync(join(f.cwd, 'api.ts'))
  const prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(f.material)
  expect(prepared).toBeDefined(); expect((await prepared!.evaluate(f.candidate())).status).toBe('verified')
})

it('freezes saved input bytes and compiler environment before either arm, isolating returned metadata', async () => {
  const f = fixture(), checker = createConversationStudyTypeScriptCheck(f.config)
  const prepared = await checker.prepare(f.material), candidate = f.candidate()
  writeFileSync(join(f.cwd, 'api.ts'), 'export const api: boolean = true')
  ;(prepared!.inputs as { path: string, content: string | null }[])[1]!.content = 'changed returned data'
  f.material.files.entries[1]!.content = 'changed argument data'
  expect((await prepared!.evaluate(candidate)).status).toBe('verified')
})

it('supports the original-request form without inventing an ordinary Task', async () => {
  const f = fixture(), { prompt: _prompt, ...rest } = f.material as ConversationStudyResultPreparation & { prompt: string }
  const request = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: f.requestText }] })]
  const material = { ...rest, request, context: [], objective: 'Repair the saved source.' }
  const prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(material)
  const { prompt: _candidatePrompt, ...candidate } = f.candidate() as ConversationStudyResultCandidate & { prompt: string }
  expect((await prepared!.evaluate({ ...candidate, request, context: [], objective: material.objective })).status).toBe('verified')
})

it.each(['condition', 'request', 'cwd', 'output', 'reference', 'context', 'extra', 'duplicate', 'null-reference'] as const)('declines an inapplicable %s before preparing a result', async kind => {
  const f = fixture(), material = f.material, config = f.config
  if (kind === 'condition') material.criteria = ['A vague successful result.']
  if (kind === 'request') (material as { prompt: string }).prompt = 'Different request.'
  if (kind === 'cwd') material.files.cwd = 'D:/DevData/other-study'
  if (kind === 'output') material.files.outputPaths = ['api.ts']
  if (kind === 'reference') material.files.entries = [material.files.entries[0]!]
  if (kind === 'context') config.contextPaths = ['missing.ts']
  if (kind === 'extra') material.files.entries = [...material.files.entries, { path: 'extra.md', content: 'unexpected' }]
  if (kind === 'duplicate') material.files.entries = [...material.files.entries, material.files.entries[1]!]
  if (kind === 'null-reference') (material.files.entries[1]! as { content: string | null }).content = null
  expect(await createConversationStudyTypeScriptCheck(config).prepare(material)).toBeUndefined()
})

it.each(['input', 'criteria', 'prompt', 'file-preimage', 'output-permission', 'final-reference', 'missing-reference', 'extra-output'] as const)('does not misattribute %s substitution to compiler failure', async kind => {
  const f = fixture(), prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(f.material), candidate = f.candidate(f.original)
  if (kind === 'input') candidate.inputs = [{ path: 'task.ts', content: 'substituted' }]
  if (kind === 'criteria') candidate.criteria = ['Weakened.']
  if (kind === 'prompt') (candidate as { prompt: string }).prompt = 'Different request.'
  if (kind === 'file-preimage') candidate.files.entries[0]!.content = 'different preimage'
  if (kind === 'output-permission') candidate.outputPaths = ['task.ts', 'api.ts']
  if (kind === 'final-reference') candidate.outputs = [candidate.outputs[0]!, { path: 'api.ts', content: 'export const api = "changed"' }]
  if (kind === 'missing-reference') candidate.outputs = [candidate.outputs[0]!]
  if (kind === 'extra-output') candidate.outputs = [...candidate.outputs, { path: 'other.ts', content: 'export {}' }]
  const result = await prepared!.evaluate(candidate)
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('declines invalid host compiler options rather than blaming a source task', async () => {
  const f = fixture()
  expect(await createConversationStudyTypeScriptCheck({ ...f.config, compilerOptions: { ...f.config.compilerOptions, emitDeclarationOnly: true } }).prepare(f.material)).toBeUndefined()
})

it('does not claim suppression or a project constraint proves the original compiler condition failed', async () => {
  const f = fixture(), prepared = await createConversationStudyTypeScriptCheck(f.config,
    { digest: sha256('constraint'), check: () => 'Project constraint not met.' }).prepare(f.material)
  for (const candidate of [f.candidate(`// @ts-nocheck\n${f.original}`), f.candidate()]) {
    const result = await prepared!.evaluate(candidate)
    expect(result.status).toBe('rejected'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
  }
})

it('does not read a late dependency from disk during candidate checking', async () => {
  const f = fixture(), prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(f.material)
  writeFileSync(join(f.cwd, 'late.ts'), 'export const late = 1')
  const result = await prepared!.evaluate(f.candidate('import { late } from "./late.js"; export const value = late'))
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('declines preparation when the original saved source imports an unsaved present-day local dependency', async () => {
  const f = fixture()
  writeFileSync(join(f.cwd, 'hidden.ts'), 'export const hidden: string = "today"')
  f.material.files.entries[0]!.content = 'import { hidden } from "./hidden.js"; export const value: number = hidden'
  expect(await createConversationStudyTypeScriptCheck(f.config).prepare(f.material)).toBeUndefined()
})

it('resolves a complete saved dependency even when its parent directory no longer exists', async () => {
  const f = fixture(), source = 'import { api } from "./saved-context/api.js"; export const value: number = api'
  f.material.files.entries[0]!.content = source
  f.material.files.entries[1]!.path = 'saved-context/api.ts'
  f.config.contextPaths = ['saved-context/api.ts']; f.config.referencePaths = ['saved-context/api.ts', 'package.json']
  const prepared = await createConversationStudyTypeScriptCheck(f.config).prepare(f.material)
  expect(prepared).toBeDefined()
  expect((await prepared!.evaluate(f.candidate(source))).status).toBe('verified')
})

it('binds natural original criteria without forcing a fixed English wording, and freezes host configuration', async () => {
  const f = fixture()
  f.material.criteria = ['修改后必须没有严格 TypeScript 编译错误。']
  f.config.criteria = [...f.material.criteria]
  const checker = createConversationStudyTypeScriptCheck(f.config)
  f.config.criteria[0] = 'Host later changed the criteria.'
  const prepared = await checker.prepare(f.material)
  expect(prepared).toBeDefined(); expect((await prepared!.evaluate(f.candidate())).status).toBe('verified')
})

it.each([[], null, [''], [undefined]])('rejects missing or malformed host criteria %j before preparing any study', criteria => {
  const f = fixture()
  expect(() => createConversationStudyTypeScriptCheck({ ...f.config, criteria } as unknown as Parameters<typeof createConversationStudyTypeScriptCheck>[0])).toThrow(/criteria/)
})

it('propagates cancellation without preparing or producing a result', async () => {
  const f = fixture(), checker = createConversationStudyTypeScriptCheck(f.config), prepared = await checker.prepare(f.material)
  const controller = new AbortController(); controller.abort()
  await expect(checker.prepare({ ...f.material, signal: controller.signal })).rejects.toThrow()
  await expect(prepared!.evaluate({ ...f.candidate(), signal: controller.signal })).rejects.toThrow()
})

it('connects five frozen case checks to both ten-arm result evaluations without post-answer preparation', async () => {
  const f = fixture(), ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const { caseId: _case, modelConfigDigest: _model, signal: _signal, ...baseMaterial } = f.material
  const materials = ids.map((_, index) => ({ ...structuredClone(baseMaterial), files: { ...structuredClone(baseMaterial.files),
    entries: [{ path: 'task.ts', content: index < 2 ? f.original : f.candidate().outputs[0]!.content },
      { path: 'api.ts', content: `export const api: number = ${index + 1}` }, structuredClone(f.material.files.entries[2]!)] } }))
  const parentSnapshot = baselineGuidanceSnapshot('study-typescript-controlled')
  const body: GuidanceStudyBody = { scopeKey: parentSnapshot.scopeKey, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot), family: 'code',
    evaluationMode: 'local-files', fileOutputKind: 'files', consentRevision: 1, failureCategory: 'instruction-following', sourceTaskIds: ['one', 'two'],
    counterexampleTaskId: 'three', modelConfigDigest: sha256('model'), cases: materials.map((material, index) => index < 3
      ? { id: ids[index]!, kind: (['source1', 'source2', 'counterexample'] as const)[index]!, sourceTaskId: ['one', 'two', 'three'][index]!,
        materialDigest: sha256(material), inputDigest: guidanceInputDigest(f.requestText, material.files) }
      : { id: ids[index]!, kind: index === 3 ? 'adjacent' : 'holdout', ...material,
        materialDigest: sha256(material), inputDigest: guidanceInputDigest(f.requestText, material.files) }) }
  let preparations = 0
  const producer = createConversationStudyTypeScriptCheck(f.config)
  const saved = await prepareConversationStudyResultChecks({ async prepare(material) { preparations++; return producer.prepare(material) } }, body, materials, f.material.signal)
  expect(saved.checks).toHaveLength(5); expect(preparations).toBe(5)
  for (const [index, material] of materials.entries()) {
    const baseline = await evaluateConversationStudyResultCheck(saved, ids[index]!, { answer: '', files: material.files.entries }, f.material.signal)
    expect(baseline.status).toBe(index < 2 ? 'rejected' : 'verified')
    const candidate = await evaluateConversationStudyResultCheck(saved, ids[index]!, { answer: '', files: material.files.entries.map(entry => entry.path === 'task.ts'
      ? f.candidate().outputs[0]! : entry) }, f.material.signal)
    expect(candidate.status).toBe('verified')
  }
  expect(preparations).toBe(5)
}, 60_000)
