import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationTypeScriptCheck, type ConversationTypeScriptCheckConfig } from '../../scripts/conversation-typescript-check.js'
import type { ConversationExternalCodePreparation, PreparedConversationExternalCodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'

const base = 'D:/DevData/tianwen-required-typecheck-20261001/test-roots'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const condition = 'The frozen target and context must have zero strict TypeScript noEmit diagnostics.'
function fixture(requireCleanTypecheck = true) {
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'required-')); roots.push(cwd)
  writeFileSync(join(cwd, 'package.json'), '{"type":"module"}')
  const initial = 'export const value: number = "wrong"'
  writeFileSync(join(cwd, 'task.ts'), initial)
  const requestText = 'Repair task.ts. The target and context must pass strict TypeScript noEmit with zero diagnostics.'
  const request = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })]
  const material = { cwd, request, context: [], modelConfigDigest: sha256('model'), signal: new AbortController().signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } },
  } as unknown as ConversationExternalCodePreparation
  const config = { cwd, requestText, targetPath: 'task.ts', contextPaths: [], requireCleanTypecheck,
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] } }
  const candidate = (content = 'export const value: number = 2') => ({ request, context: [], signal: material.signal,
    inputs: [{ path: 'task.ts', content: initial }], outputs: [{ path: 'task.ts', content }], outputPaths: ['task.ts'] })
  return { cwd, initial, material, config, candidate }
}
async function prepare(f: ReturnType<typeof fixture>, config = f.config) {
  const prepared = await createConversationTypeScriptCheck(config).prepare(f.material)
  expect(prepared).toBeDefined(); return prepared as PreparedConversationExternalCodeCheck
}

it('attributes only an actual compiler diagnostic to the opt-in frozen required condition', async () => {
  const f = fixture(), prepared = await prepare(f)
  expect(prepared.requiredCondition).toBe(condition)
  expect(await prepared.evaluate(f.candidate(f.initial))).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
  const good = await prepared.evaluate(f.candidate())
  expect(good.status).toBe('verified'); expect(good).not.toHaveProperty('failedRequiredConditionDigest')
})

it('keeps false and absent opt-in identical diagnostic-only contracts and result fields', async () => {
  const f = fixture(false), { requireCleanTypecheck: _flag, ...absent } = f.config
  const off = await prepare(f), legacy = await createConversationTypeScriptCheck(absent).prepare(f.material)
  expect(off).not.toHaveProperty('requiredCondition'); expect(legacy).not.toHaveProperty('requiredCondition')
  expect(off.contractDigest).toBe(legacy!.contractDigest)
  expect(await off.evaluate(f.candidate(f.initial))).not.toHaveProperty('failedRequiredConditionDigest')
  const enabled = await prepare(f, { ...f.config, requireCleanTypecheck: true })
  expect(enabled.contractDigest).not.toBe(off.contractDigest)
})

it('freezes opt-in at factory creation and keeps the condition comparable across different original tasks', async () => {
  const f = fixture(), checker = createConversationTypeScriptCheck(f.config)
  f.config.requireCleanTypecheck = false
  const first = await checker.prepare(f.material)
  expect(first!.requiredCondition).toBe(condition)
  const secondText = 'Repair a different original request while requiring zero strict TypeScript noEmit diagnostics.'
  writeFileSync(join(f.cwd, 'task.ts'), 'export const second: boolean = "wrong"')
  const second = await createConversationTypeScriptCheck({ ...f.config, requireCleanTypecheck: true, requestText: secondText }).prepare({
    ...f.material, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: secondText }] })],
  })
  expect(second!.requiredCondition).toBe(first!.requiredCondition); expect(second!.checkerDigest).toBe(first!.checkerDigest)
  expect(second!.contractDigest).not.toBe(first!.contractDigest)
})

it.each([null, 1, 'true'])('rejects malformed opt-in %s before capture', flag => {
  const f = fixture()
  expect(() => createConversationTypeScriptCheck({ ...f.config, requireCleanTypecheck: flag } as unknown as ConversationTypeScriptCheckConfig)).toThrow(/requireCleanTypecheck/)
})

it('does not attribute a suppression guard rejection to a proved compiler failure', async () => {
  const f = fixture(), prepared = await prepare(f)
  const result = await prepared.evaluate(f.candidate('// @ts-nocheck\nexport const value: number = "wrong"'))
  expect(result.status).toBe('rejected'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('does not attribute a project constraint rejection after successful compilation to compiler failure', async () => {
  const f = fixture()
  const prepared = await createConversationTypeScriptCheck(f.config, { digest: sha256('project-obligation'), check: () => 'Project-specific obligation rejected.' }).prepare(f.material)
  const result = await prepared!.evaluate(f.candidate())
  expect(result.status).toBe('rejected'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('stops at true compilation failure before consulting a project constraint', async () => {
  const f = fixture(); let consulted = false
  const prepared = await createConversationTypeScriptCheck(f.config, { digest: sha256('project-obligation'), check: () => { consulted = true; return undefined } }).prepare(f.material)
  const result = await prepared!.evaluate(f.candidate(f.initial))
  expect(result).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) }); expect(consulted).toBe(false)
})

it('does not attribute unavailable frozen dependencies to compiler failure', async () => {
  const f = fixture(), prepared = await prepare(f)
  writeFileSync(join(f.cwd, 'late.ts'), 'export const late: number = 2')
  const result = await prepared.evaluate(f.candidate('import { late } from "./late.js"; export const value: number = late'))
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it.each(['input', 'output', 'path'])('does not attribute %s binding failure to compiler failure', async kind => {
  const f = fixture(), prepared = await prepare(f), output = f.candidate()
  if (kind === 'input') output.inputs[0]!.content = 'different source'
  if (kind === 'output') output.outputs = []
  if (kind === 'path') output.outputPaths = ['different.ts']
  const result = await prepared.evaluate(output)
  expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})

it('does not return a required-condition result after cancellation', async () => {
  const f = fixture(), prepared = await prepare(f), output = f.candidate(f.initial), controller = new AbortController()
  controller.abort(); output.signal = controller.signal
  await expect(prepared.evaluate(output)).rejects.toThrow()
})

it('declines opt-in preparation for host compiler option errors while retaining default diagnostics', async () => {
  const f = fixture(), invalid = { ...f.config, compilerOptions: { ...f.config.compilerOptions, emitDeclarationOnly: true } }
  expect(await createConversationTypeScriptCheck(invalid).prepare(f.material)).toBeUndefined()
  const diagnostic = await createConversationTypeScriptCheck({ ...invalid, requireCleanTypecheck: false }).prepare(f.material)
  expect(diagnostic).toBeDefined()
  const result = await diagnostic!.evaluate(f.candidate())
  expect(result.status).toBe('rejected'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})
