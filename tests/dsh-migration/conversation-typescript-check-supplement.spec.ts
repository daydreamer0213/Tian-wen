// Supplementary checks of requirements frozen BEFORE generation; not a regrade.
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { createConversationTypeScriptCheck } from '../../scripts/conversation-typescript-check.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(initial = 'export const value: number = 1') {
  const base = 'D:/DevData/tianwen-typescript-host-check-20260930/test-roots'
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'supplement-')); roots.push(cwd)
  writeFileSync(join(cwd, 'task.ts'), initial); writeFileSync(join(cwd, 'api.ts'), 'export const api: number = 1')
  const request = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Check only task.ts' }] })]
  const material = { cwd, request, context: [], signal: new AbortController().signal, modelConfigDigest: sha256('model'),
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'external' } } } } as unknown as ConversationExternalCodePreparation
  const config = { cwd, requestText: 'Check only task.ts', targetPath: 'task.ts', contextPaths: ['api.ts'],
    compilerOptions: { strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext } as ts.CompilerOptions }
  const candidate = (content: string) => ({ request, context: [], signal: material.signal,
    inputs: [{ path: 'task.ts', content: initial }], outputs: [{ path: 'task.ts', content }], outputPaths: ['task.ts'] })
  return { cwd, config, material, candidate }
}

it.each(['files', 'chat'] as const)('handles local code %s output without allowing a chat-only check', async outputKind => {
  const f = fixture()
  const material = { ...f.material, task: { ...f.material.task, admission: { ...f.material.task.admission!,
    decision: { ...f.material.task.admission!.decision!, evaluationMode: 'local-files' as const, fileOutputKind: outputKind } } } }
  const prepared = await createConversationTypeScriptCheck(f.config).prepare(material)
  if (outputKind === 'chat') expect(prepared).toBeUndefined()
  else {
    expect(prepared).toBeDefined()
    expect((await prepared!.evaluate(f.candidate('export const value: number = 2'))).status).toBe('verified')
  }
})

it.each(['target', 'context'])('rejects an initial %s path outside the project', async field => {
  const f = fixture(); if (field === 'target') f.config.targetPath = '../outside.ts'; else f.config.contextPaths = ['../outside.ts']
  expect(await createConversationTypeScriptCheck(f.config).prepare(f.material).catch(() => undefined)).toBeUndefined()
})

it('rejects a target behind a directory link to a different project', async () => {
  const f = fixture(); const outside = fixture()
  symlinkSync(outside.cwd, join(f.cwd, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  f.config.targetPath = 'linked/task.ts'
  expect(await createConversationTypeScriptCheck(f.config).prepare(f.material).catch(() => undefined)).toBeUndefined()
})

it.each(['strict', 'noCheck', 'strictNullChecks'])('cannot disable type checking using initial %s options', async option => {
  const f = fixture(); f.config.compilerOptions[option] = option === 'noCheck'
  const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  const output = option === 'strictNullChecks' ? 'export const value: number = null' : 'export const value: number = "wrong"'
  expect((await prepared!.evaluate(f.candidate(output))).status).toBe('rejected')
})

it('clones nested compiler options before prepare', async () => {
  const f = fixture('import { api } from "fixture-api"; export const value: number = api')
  writeFileSync(join(f.cwd, 'changed-api.ts'), 'export const api: string = "changed"')
  f.config.compilerOptions.paths = { 'fixture-api': [join(f.cwd, 'api.ts')] }
  const checker = createConversationTypeScriptCheck(f.config)
  f.config.compilerOptions.paths['fixture-api']![0] = join(f.cwd, 'changed-api.ts')
  const prepared = await checker.prepare(f.material)
  expect((await prepared!.evaluate(f.candidate('import { api } from "fixture-api"; export const value: number = api'))).status).toBe('verified')
})

it.each(['ignore', 'expect-error'])('rejects newly added @ts-%s', async directive => {
  const f = fixture(); const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate(`// @ts-${directive}\nexport const value: number = "wrong"`))).status).not.toBe('verified')
})

it.each(['ignoreWhatever', 'expect-errorWhatever'])('rejects compiler-recognized @ts-%s prefixes', async directive => {
  const f = fixture(); const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate(`// @ts-${directive}\nexport const value: number = "wrong"`))).status).not.toBe('verified')
})

it.each(['ignore', 'expect-error'])('rejects @ts-%s on a multiline comment closing line', async directive => {
  const f = fixture(); const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate(`/* explanation\n@ts-${directive} */\nexport const value: number = "wrong"`))).status).not.toBe('verified')
})

it('does not classify a directive-shaped string literal as suppression', async () => {
  const f = fixture(); const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate('export const value: string = "@ts-ignore"'))).status).toBe('verified')
})

it('rejects a suppression comment after an interpolated template literal', async () => {
  const f = fixture(); const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate('const label = `value ${1}`;\n// @ts-ignore\nexport const value: number = "wrong"'))).status).not.toBe('verified')
})

it('cannot prepare after cancellation', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort()
  expect(await createConversationTypeScriptCheck(f.config).prepare({ ...f.material, signal: controller.signal }).catch(() => undefined)).toBeUndefined()
})

it('binds a changed frozen dependency into a different contract', async () => {
  const f = fixture(); const checker = createConversationTypeScriptCheck(f.config)
  const before = await checker.prepare(f.material)
  writeFileSync(join(f.cwd, 'api.ts'), 'export const api: string = "changed"')
  const after = await checker.prepare(f.material)
  expect(after!.contractDigest).not.toBe(before!.contractDigest)
})

it('forces noEmit even when the host requests emit', async () => {
  const f = fixture(); f.config.compilerOptions.noEmit = false
  const prepared = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect((await prepared!.evaluate(f.candidate('export const value: number = 2'))).status).toBe('verified')
  expect(existsSync(join(f.cwd, 'task.js'))).toBe(false)
})
