import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256, CONVERSATION_FILE_MAX_BYTES, CONVERSATION_FILE_MAX_ENTRY_BYTES } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationTypeScriptCheck, type ConversationTypeScriptCheckConfig } from '../../scripts/conversation-typescript-check.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const base = 'D:/DevData/tianwen-compiler-reference-inputs-20261001/test-roots'
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'check-')); roots.push(cwd)
  const initial = 'export const value: number = "wrong"', reference = 'Use the declared number type.'
  writeFileSync(join(cwd, 'package.json'), '{"type":"module"}')
  writeFileSync(join(cwd, 'task.ts'), initial); writeFileSync(join(cwd, 'notes.md'), reference)
  const requestText = 'Read notes.md and task.ts; repair only task.ts and keep notes.md unchanged.'
  const material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })],
    context: [], modelConfigDigest: sha256('model'), signal: new AbortController().signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } },
  } as unknown as ConversationExternalCodePreparation
  const config = { cwd, requestText, targetPath: 'task.ts', contextPaths: [], referencePaths: ['notes.md'], requireCleanTypecheck: true,
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] } }
  const inputs = [{ path: 'task.ts', content: initial }, { path: 'notes.md', content: reference }]
  const candidate = (content = 'export const value: number = 2') => ({ request: material.request, context: [], signal: material.signal,
    inputs: structuredClone(inputs), outputs: [{ path: 'task.ts', content }, { path: 'notes.md', content: reference }], outputPaths: ['task.ts'] })
  return { cwd, initial, reference, material, config, inputs, candidate }
}

it('binds all declared readonly inputs and accepts their native read order without adding compiler roots', async () => {
  const f = fixture(), prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect(prepared?.inputs).toEqual(f.inputs)
  const output = f.candidate(); output.inputs.reverse()
  expect((await prepared!.evaluate(output)).status).toBe('verified')
})

it('freezes declaration and bytes, and does not let returned inputs mutate the private binding', async () => {
  const f = fixture(), check = createConversationTypeScriptCheck(f.config)
  f.config.referencePaths[0] = 'different.md'
  const prepared = await check.prepare(f.material)
  expect(prepared?.inputs).toEqual(f.inputs)
  writeFileSync(join(f.cwd, 'notes.md'), 'Host changed after preparation.')
  const returned = prepared!.inputs as { path: string, content: string | null }[]
  returned[1]!.content = 'Changed returned metadata.'
  expect((await prepared!.evaluate(f.candidate())).status).toBe('verified')
})

it('preserves the exact default contract for omitted and empty reference lists', async () => {
  const f = fixture(), { referencePaths: _references, ...legacy } = f.config
  const absent = await createConversationTypeScriptCheck(legacy).prepare(f.material)
  const empty = await createConversationTypeScriptCheck({ ...legacy, referencePaths: [] }).prepare(f.material)
  expect(absent?.contractDigest).toBe(empty?.contractDigest)
  expect(absent?.inputs).toEqual([{ path: 'task.ts', content: f.initial }])
  expect((await absent!.evaluate(f.candidate())).status).toBe('unverifiable')
})

it.each(['missing', 'extra', 'content', 'path', 'duplicate'] as const)('does not attribute %s reference binding to compilation failure', async kind => {
  const f = fixture(), prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material), candidate = f.candidate(f.initial)
  if (kind === 'missing') candidate.inputs.pop()
  if (kind === 'extra') candidate.inputs.push({ path: 'extra.md', content: 'not declared' })
  if (kind === 'content') candidate.inputs[1]!.content = 'Changed bytes.'
  if (kind === 'path') candidate.inputs[1]!.path = 'other.md'
  if (kind === 'duplicate') candidate.inputs.push({ ...candidate.inputs[1]! })
  const result = await prepared!.evaluate(candidate)
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('continues to forbid a readonly reference becoming an output', async () => {
  const f = fixture(), prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material), candidate = f.candidate()
  candidate.outputs.push({ path: 'notes.md', content: 'changed' }); candidate.outputPaths.push('notes.md')
  const result = await prepared!.evaluate(candidate)
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it.each(['content', 'missing'] as const)('rejects %s readonly final state without marking compilation failure', async kind => {
  const f = fixture(), prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material), candidate = f.candidate()
  if (kind === 'content') candidate.outputs[1]!.content = 'Reference was changed.'
  else candidate.outputs.pop()
  const result = await prepared!.evaluate(candidate)
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('uses the same frozen readonly preimage when the reference is also a compiler context', async () => {
  const f = fixture(), initial = 'import { api } from "./api.js"; export const value: string = api'
  const config = { ...f.config, contextPaths: ['api.ts'], referencePaths: ['api.ts'] }
  writeFileSync(join(f.cwd, 'task.ts'), initial); writeFileSync(join(f.cwd, 'api.ts'), 'export const api: number = 1')
  const prepared = await createConversationTypeScriptCheck(config).prepare(f.material)
  const inputs = [{ path: 'task.ts', content: initial }, { path: 'api.ts', content: 'export const api: number = 1' }]
  expect(prepared?.inputs).toEqual(inputs)
  writeFileSync(join(f.cwd, 'api.ts'), 'export const api: string = "host changed"')
  const candidate = f.candidate('import { api } from "./api.js"; export const value: number = api')
  candidate.inputs = inputs; candidate.outputs = [{ path: 'task.ts', content: candidate.outputs[0]!.content }, inputs[1]!]
  expect((await prepared!.evaluate(candidate)).status).toBe('verified')
})

it('accepts a readonly reference at the ordinary entry limit instead of the smaller case-design budget', async () => {
  const f = fixture(), content = 'x'.repeat(CONVERSATION_FILE_MAX_ENTRY_BYTES)
  writeFileSync(join(f.cwd, 'notes.md'), content)
  const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material), candidate = f.candidate()
  candidate.inputs[1]!.content = content; candidate.outputs[1]!.content = content
  expect((await prepared!.evaluate(candidate)).status).toBe('verified')
})

it('attributes an actual compiler failure only after the full reference input binding', async () => {
  const f = fixture(), prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  const result = await prepared!.evaluate(f.candidate(f.initial))
  expect(result).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(prepared!.requiredCondition!) })
})

it.each([null, 'notes.md', [''], ['../outside.md'], ['notes.md', 'notes.md'], ['Notes.md', 'notes.md'], ['task.ts'], Array.from({ length: 8 }, (_, index) => `${index}.md`)])('rejects an invalid reference declaration %j before capture', references => {
  const f = fixture()
  expect(() => createConversationTypeScriptCheck({ ...f.config, referencePaths: references } as unknown as ConversationTypeScriptCheckConfig)).toThrow()
})

it.each(['missing', 'directory', 'invalid-utf8', 'entry-limit', 'total-limit'] as const)('declines unavailable reference %s without preparing a candidate failure', async scenario => {
  const f = fixture()
  if (scenario === 'missing') rmSync(join(f.cwd, 'notes.md'))
  if (scenario === 'directory') { rmSync(join(f.cwd, 'notes.md')); mkdirSync(join(f.cwd, 'notes.md')) }
  if (scenario === 'invalid-utf8') writeFileSync(join(f.cwd, 'notes.md'), Buffer.from([0xff]))
  if (scenario === 'entry-limit') writeFileSync(join(f.cwd, 'notes.md'), 'x'.repeat(CONVERSATION_FILE_MAX_ENTRY_BYTES + 1))
  if (scenario === 'total-limit') {
    writeFileSync(join(f.cwd, 'notes.md'), 'x'.repeat(CONVERSATION_FILE_MAX_BYTES / 2 + 1))
    writeFileSync(join(f.cwd, 'other.md'), 'x'.repeat(CONVERSATION_FILE_MAX_BYTES / 2 + 1)); f.config.referencePaths.push('other.md')
  }
  expect(await createConversationTypeScriptCheck(f.config).prepare(f.material)).toBeUndefined()
})
