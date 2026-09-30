import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationTypeScriptCheck } from '../../scripts/conversation-typescript-check.js'
import type { ConversationExternalCodePreparation, PreparedConversationExternalCodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const requestText = 'Repair the type of value in task.ts using the existing declared API; change only task.ts.'
function fixture(initial: string | null = 'export const value: number = "wrong"') {
  const base = 'D:/DevData/tianwen-typescript-host-check-20260930/test-roots'
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'check-')); roots.push(cwd)
  writeFileSync(join(cwd, 'package.json'), '{"type":"module"}')
  if (initial !== null) writeFileSync(join(cwd, 'task.ts'), initial)
  writeFileSync(join(cwd, 'api.ts'), 'export const api: number = 1')
  const signal = new AbortController().signal
  const material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })],
    context: [], modelConfigDigest: sha256('model'), signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'external' } } },
  } as unknown as ConversationExternalCodePreparation
  const config = { cwd, requestText, targetPath: 'task.ts', contextPaths: ['api.ts'],
    compilerOptions: { strict: true, noEmit: true, target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] } }
  return { cwd, initial, material, config }
}
function candidate(f: ReturnType<typeof fixture>, content: string) {
  return { request: f.material.request, context: [], signal: f.material.signal,
    inputs: [{ path: 'task.ts', content: f.initial }], outputs: [{ path: 'task.ts', content }], outputPaths: ['task.ts'] }
}
async function prepare(f: ReturnType<typeof fixture>) {
  const result = await createConversationTypeScriptCheck(f.config).prepare(f.material)
  expect(result).toBeDefined()
  return result as PreparedConversationExternalCodeCheck
}

it('accepts a typed output while describing only the frozen compiler check', async () => {
  const f = fixture(); const prepared = await prepare(f)
  expect(prepared.inputs).toEqual([{ path: 'task.ts', content: f.initial }])
  expect(prepared.checkerDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(prepared.contractDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
  const result = await prepared.evaluate(candidate(f, 'export const value: number = 2'))
  expect(result.status).toBe('verified')
  expect(result.detail).toMatch(/type|TypeScript/)
  expect(result.detail).not.toMatch(/whole task (?:met|passed)|learning approved/)
  expect(existsSync(join(f.cwd, 'task.js'))).toBe(false)
})

it('freezes a trusted candidate constraint and supplies only the captured program', async () => {
  const f = fixture(), calls: string[] = []
  const constraint = { digest: sha256('trusted-constraint'), check(program: ts.Program, target: ts.SourceFile): string | undefined {
    calls.push(target.text)
    expect(program.getSourceFile(join(f.cwd, 'api.ts'))?.text).toBe('export const api: number = 1')
    return 'Trusted project obligation rejected.'
  } }
  const check = createConversationTypeScriptCheck(f.config, constraint)
  constraint.digest = sha256('changed'); constraint.check = () => undefined
  const prepared = await check.prepare(f.material)
  expect(prepared).toBeDefined()
  writeFileSync(join(f.cwd, 'api.ts'), 'export const api: string = "changed"')
  const output = 'export const value: number = 2'
  expect((await prepared!.evaluate(candidate(f, output))).status).toBe('rejected')
  expect(calls).toEqual([output])
})

it('refuses a malformed trusted constraint before capturing a task', () => {
  const f = fixture()
  expect(() => createConversationTypeScriptCheck(f.config, { digest: 'invalid' as ReturnType<typeof sha256>, check: () => undefined })).toThrow(/constraint/)
})

it('rejects a type error without exposing candidate text', async () => {
  const f = fixture(); const prepared = await prepare(f)
  const result = await prepared.evaluate(candidate(f, 'export const private_value: number = "PRIVATE_VALUE"'))
  expect(result.status).toBe('rejected')
  expect(result.detail).not.toContain('PRIVATE_VALUE')
})

it.each(['cwd', 'request', 'family', 'mode'])('declines an inapplicable %s before preparing', async field => {
  const f = fixture(); const material = { ...f.material, task: structuredClone(f.material.task) }
  if (field === 'cwd') material.cwd = join(f.cwd, 'other')
  if (field === 'request') material.request = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Do something else' }] })]
  if (field === 'family' || field === 'mode') material.task = { admission: { decision: { kind: 'task', family: field === 'family' ? 'writing' : 'code', evaluationMode: field === 'mode' ? 'text' : 'external' } } } as typeof material.task
  expect(await createConversationTypeScriptCheck(f.config).prepare(material)).toBeUndefined()
})

it('uses the frozen dependency after the file changes', async () => {
  const f = fixture('import { api } from "./api.js"; export const value: number = api')
  const prepared = await prepare(f)
  writeFileSync(join(f.cwd, 'api.ts'), 'export const api: string = "changed"')
  expect((await prepared.evaluate(candidate(f, f.initial!))).status).toBe('verified')
})

it('does not read a new dependency created after preparation', async () => {
  const f = fixture(); const prepared = await prepare(f)
  writeFileSync(join(f.cwd, 'late.ts'), 'export const api: number = 2')
  expect((await prepared.evaluate(candidate(f, 'import { api } from "./late.js"; export const value: number = api'))).status).not.toBe('verified')
})

it.each(['input', 'path', 'extra', 'missing'])('cannot verify changed %s evidence', async kind => {
  const f = fixture(); const prepared = await prepare(f); const value = candidate(f, 'export const value: number = 2')
  if (kind === 'input') value.inputs[0]!.content = 'different'
  if (kind === 'path') value.outputPaths = ['other.ts']
  if (kind === 'extra') value.outputs.push({ path: 'extra.ts', content: 'export {}' })
  if (kind === 'missing') value.outputs = []
  expect((await prepared.evaluate(value)).status).not.toBe('verified')
})

it('supports a genuinely absent initial target', async () => {
  const f = fixture(null); const prepared = await prepare(f)
  expect((await prepared.evaluate(candidate(f, 'export const value: number = 2'))).status).toBe('verified')
})

it('does not execute a well-typed candidate', async () => {
  const f = fixture(); const prepared = await prepare(f)
  const output = 'throw new Error("CANDIDATE_MUST_NOT_EXECUTE"); export const value: number = 2'
  expect((await prepared.evaluate(candidate(f, output))).status).toBe('verified')
})

it('rejects a newly added typecheck suppression', async () => {
  const f = fixture(); const prepared = await prepare(f)
  expect((await prepared.evaluate(candidate(f, '// @ts-nocheck\nexport const value: number = "wrong"'))).status).not.toBe('verified')
})

it('cannot verify after cancellation', async () => {
  const f = fixture(); const prepared = await prepare(f); const value = candidate(f, 'export const value: number = 2')
  const controller = new AbortController(); controller.abort(); value.signal = controller.signal
  const outcome = await prepared.evaluate(value).catch(() => ({ status: 'unverifiable' }))
  expect(outcome.status).not.toBe('verified')
})

it('clones host configuration before later mutation', async () => {
  const f = fixture(); const checker = createConversationTypeScriptCheck(f.config)
  f.config.targetPath = '../escape.ts'; f.config.compilerOptions.strict = false
  const prepared = await checker.prepare(f.material)
  expect(prepared?.inputs).toEqual([{ path: 'task.ts', content: f.initial }])
  expect((await prepared!.evaluate(candidate(f, 'export const value: number = "wrong"'))).status).toBe('rejected')
})
