import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { createAncillaryTypeResultContract } from '../../scripts/ancillary-type-result-contract.js'
import type { ConversationExternalCodePreparation, PreparedConversationExternalCodeCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'

const requestText = 'Repair only the payload assertion type; preserve execution, assertions and other types.'
const original = `import { parseConversationTaskFileAncillary, assertLength } from './api.js'
import type { ApiMarker } from './api.js'
const paths = ['a', 'b']
assertLength((parseConversationTaskFileAncillary({ paths }).payload as { paths: string[] }).paths, 2)
export const marker: ApiMarker = 1
`
const valid = original.replace('{ paths: string[] }', '{ readonly tool: "glob"; readonly root: string; readonly paths: readonly string[] }')
let cwd: string, material: ConversationExternalCodePreparation, prepared: PreparedConversationExternalCodeCheck
beforeAll(async () => {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? 'D:/DevData/tianwen-preserved-execution-contract-20261001/test-roots'
  mkdirSync(base, { recursive: true }); cwd = mkdtempSync(join(base, 'contract-'))
  writeFileSync(join(cwd, 'package.json'), '{"type":"module"}')
  writeFileSync(join(cwd, 'task.ts'), original)
  writeFileSync(join(cwd, 'api.ts'), `export function parseConversationTaskFileAncillary(_v: unknown): { payload: { readonly tool: 'glob'; readonly root: string; readonly paths: readonly string[] } | { readonly tool: 'facts'; readonly count: number } } { throw new Error('not executed') }
export function assertLength(_v: unknown, _n: number): void { throw new Error('not executed') }
export type ApiMarker = number
export type Looser = number | string
export type Glob = Extract<ReturnType<typeof parseConversationTaskFileAncillary>['payload'], { tool: 'glob' }>`)
  material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: requestText }] })], context: [], modelConfigDigest: sha256('model'),
    signal: new AbortController().signal, task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } } } as unknown as ConversationExternalCodePreparation
  const result = await createAncillaryTypeResultContract({ cwd, requestText, targetPath: 'task.ts', contextPaths: ['api.ts'],
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, verbatimModuleSyntax: true, types: [] } }).prepare(material)
  expect(result).toBeDefined(); prepared = result!
}, 30_000)
afterAll(() => { if (cwd !== undefined) rmSync(cwd, { recursive: true, force: true }) })
const candidate = (content: string) => ({ request: material.request, context: [], signal: material.signal,
  inputs: [{ path: 'task.ts', content: original }], outputs: [{ path: 'task.ts', content }], outputPaths: ['task.ts'] })

it('marks only a proven original preservation violation as failed required condition', async () => {
  expect(typeof prepared.requiredCondition).toBe('string')
  const changed = valid.replace('.paths, 2)', '.paths, 0)')
  const result = await prepared.evaluate(candidate(changed))
  expect(result.status).toBe('rejected')
  expect(result.failedRequiredConditionDigest).toBe(sha256(prepared.requiredCondition))
})
it('keeps compiler rejection diagnostic rather than inventing a failed required condition', async () => {
  expect((await prepared.evaluate(candidate(original))).status).toBe('rejected')
  expect((await prepared.evaluate(candidate(original))).failedRequiredConditionDigest).toBeUndefined()
  expect((await prepared.evaluate(candidate(valid))).failedRequiredConditionDigest).toBeUndefined()
})
it('independently rejects the original error and verifies only a complete permitted repair', async () => {
  expect((await prepared.evaluate(candidate(original))).status).toBe('rejected')
  expect((await prepared.evaluate(candidate(valid))).status).toBe('verified')
})
it.each([
  'export {}',
  valid.replace(', 2)', ', 0)'),
  valid.replace('const paths =', 'const paths: string[] ='),
  valid.replace('export const marker: ApiMarker = 1', 'export const marker: ApiMarker = 2'),
  valid.replace('assertLength(', 'void (').replace(', 2)', ')'),
  original.replace('{ paths: string[] }', 'any'),
  original.replace('{ paths: string[] }', 'ReturnType<typeof JSON.parse>'),
  original.replace('{ paths: string[] }', '{ paths: ReturnType<typeof JSON.parse> }'),
  original.replace('{ paths: string[] }', '{ paths: Array<ReturnType<typeof JSON.parse>> }'),
  original.replace('{ paths: string[] }', '{ paths: ReturnType<typeof JSON.parse> } | { paths: string[] }'),
  original.replace('{ paths: string[] }', '{ readonly tool: "glob"; readonly root: string; readonly paths: readonly string[]; readonly fn: <T = ReturnType<typeof JSON.parse>>() => T }'),
  original.replace('{ paths: string[] }', '{ readonly tool: "glob"; readonly root: string; readonly paths: readonly string[]; readonly fn: <T = ReturnType<typeof JSON.parse>>() => void }'),
  valid.replace('import type { ApiMarker }', 'import type { Looser as ApiMarker }'),
  valid.replace('import { parseConversationTaskFileAncillary, assertLength }', 'import { assertLength, parseConversationTaskFileAncillary }'),
])('rejects a compiling candidate that violates the original task', async content => {
  expect((await prepared.evaluate(candidate(content))).status).toBe('rejected')
})
it('accepts another genuine type spelling without prescribing the answer', async () => {
  const content = original.replace('{ paths: string[] }', "Extract<ReturnType<typeof parseConversationTaskFileAncillary>['payload'], { tool: 'glob' }>")
  expect((await prepared.evaluate(candidate(content))).status).toBe('verified')
})
it('allows new pure or mixed type imports while preserving original type bindings', async () => {
  const repaired = original.replace('{ paths: string[] }', 'Glob')
  const pure = `import type { Glob } from './api.js'\n${repaired}`
  const mixed = repaired.replace('assertLength }', 'assertLength, type Glob }')
  const typeSideEffect = `import { type Glob } from './api.js'\n${repaired}`
  expect((await prepared.evaluate(candidate(pure))).status).toBe('verified')
  expect((await prepared.evaluate(candidate(mixed))).status).toBe('verified')
  expect((await prepared.evaluate(candidate(typeSideEffect))).status).toBe('rejected')
})
it('keeps frozen dependency data and execution after preparation', async () => {
  writeFileSync(join(cwd, 'api.ts'), 'throw new Error("CHANGED_SOURCE_MUST_NOT_EXECUTE")')
  expect((await prepared.evaluate(candidate(valid))).status).toBe('verified')
})
it('cannot verify input, output or cancellation drift', async () => {
  const changed = candidate(valid); changed.inputs[0]!.content = 'different'
  expect((await prepared.evaluate(changed)).status).not.toBe('verified')
  const extra = candidate(valid); extra.outputs.push({ path: 'extra.ts', content: 'export {}' })
  expect((await prepared.evaluate(extra)).status).not.toBe('verified')
  const aborted = candidate(valid); const controller = new AbortController(); controller.abort(); aborted.signal = controller.signal
  await expect(prepared.evaluate(aborted)).rejects.toThrow()
})
