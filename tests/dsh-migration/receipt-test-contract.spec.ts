import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { freezeReceiptTestContract } from '../../scripts/receipt-test-contract.js'

const roots: string[] = []
const cleanup = () => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) }
afterEach(cleanup)
afterAll(cleanup)
const original = `import type { ConversationFileTrialReceipt } from './receipt.js'
import { stamp } from './receipt.js'
const parseConversationFileTrialReceipt = (v: unknown): ConversationFileTrialReceipt => { throw new Error(String(v)) }
const useReceipt = (v: ConversationFileTrialReceipt) => v.outputDigest
const harness = { parent: { agent: { session: { append: (event: 'sandbox/mode', data: { mode: string; source?: 'delegation' }) => [event, data] } } } }
function cold() {
  let retained: Parameters<typeof parseConversationFileTrialReceipt>[0]
  retained = { outputDigest: 'actual', files: [] }
  return useReceipt(retained!)
}
harness.parent.agent.session.append('sandbox/mode', { mode: 'read-only', source: 'user' })
harness.parent.agent.session.append('sandbox/mode', { mode: 'danger-full-access', source: 'user' })
if (cold() !== stamp) throw new Error('assertion preserved')
`
// This small engineering fixture is not the selected real task's candidate.
const valid = original.replace('Parameters<typeof parseConversationFileTrialReceipt>[0]', 'ConversationFileTrialReceipt')
  .replaceAll(", source: 'user'", '')

function fixture() {
  mkdirSync('D:/DevData/tianwen-test-typecheck-contract-20260930/test-roots', { recursive: true })
  const root = mkdtempSync('D:/DevData/tianwen-test-typecheck-contract-20260930/test-roots/contract-'); roots.push(root)
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const targetPath = join(root, 'task.ts'); const receiptPath = join(root, 'receipt.ts')
  writeFileSync(targetPath, original)
  writeFileSync(receiptPath, "export interface ConversationFileTrialReceipt { outputDigest: string; files: readonly string[] }; export const stamp = 'actual'")
  return { root, targetPath, receiptPath }
}

let shared: ReturnType<typeof freezeReceiptTestContract>
beforeAll(() => { const paths = fixture(); shared = freezeReceiptTestContract({ ...paths, contextRoots: [] }) }, 30_000)

it('preserves a genuine baseline failure and independently verifies the complete permitted repair', () => {
  expect(shared.baselineDiagnostics.map(item => item.code)).toEqual([2345, 2322, 2322])
  expect(shared.check(original).status).toBe('rejected')
  expect(shared.check(valid).status).toBe('verified')
})

it.each([
  valid.replace('ConversationFileTrialReceipt\n  retained', 'any\n  retained'),
  valid.replace('useReceipt(retained!)', 'useReceipt(retained! as never)'),
  valid.replace('!== stamp', '=== stamp'),
  valid.replace("mode: 'read-only'", "mode: 'danger-full-access'"),
  valid.replace('let retained:', '// @ts-ignore\n  let retained:'),
  `/// <reference path="./unfrozen.ts" />\n${valid}`,
  `${valid}\ndeclare module './receipt.js' { interface ConversationFileTrialReceipt { injected?: string } }`,
  valid.replace('ConversationFileTrialReceipt\n  retained', "{ outputDigest: string; files: readonly string[] }\n  retained"),
])('rejects weakened types, changed execution, assertions or checking inputs', candidate => {
  expect(shared.check(candidate).status).toBe('rejected')
})

it('does not read changed source/dependencies after the contract is prepared', () => {
  const paths = fixture(); const contract = freezeReceiptTestContract({ ...paths, contextRoots: [] })
  writeFileSync(paths.targetPath, 'throw new Error("new current task must not be executed")')
  writeFileSync(paths.receiptPath, 'export type ConversationFileTrialReceipt = never')
  expect(contract.capturedText(paths.targetPath)).toBe(original)
  expect(() => contract.capturedText(join(paths.root, 'unfrozen.ts'))).toThrow('outside captured')
  expect(contract.check(valid).status).toBe('verified')
  const next = () => freezeReceiptTestContract({ ...paths, contextRoots: [] })
  expect(next).toThrow()
})

it('cannot acquire additional declarations through a new candidate import', () => {
  const candidate = `import type {} from './unfrozen.js'\n${valid}`
  expect(shared.check(candidate).status).toBe('rejected')
})

it('allows a type inferred from the existing parser without prescribing an answer spelling', () => {
  const candidate = valid.replace('ConversationFileTrialReceipt\n  retained', 'ReturnType<typeof parseConversationFileTrialReceipt>\n  retained')
  expect(shared.check(candidate).status).toBe('verified')
  expect(shared.check(candidate).binding.candidateDigest).not.toBe(shared.check(valid).binding.candidateDigest)
})

it('allows a type-only specifier added to an existing runtime import', () => {
  const candidate = valid.replace("import { stamp }", "import { stamp, type ConversationFileTrialReceipt as FrozenReceipt }")
    .replace('ConversationFileTrialReceipt\n  retained', 'FrozenReceipt\n  retained')
  expect(shared.check(candidate).status).toBe('verified')
})
