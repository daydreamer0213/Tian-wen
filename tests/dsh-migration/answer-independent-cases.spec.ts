import { expect, it } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { conversationQualityContract, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { createConversationStudyIsolatedPythonAnswerCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-answer-check.js'

function fixture(chat = false) {
  const qualityContract = conversationQualityContract(), cwd = 'D:/DevData/tianwen-answer-independent-cases-20261004/engineering-captured'
  const original = (label: string) => ({ request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `Original ${label} record.` }] })],
    context: [], objective: 'Return original status.', criteria: ['Return the original status.'], qualityContract,
    ...(chat ? { files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'chat' as const, cwd,
      entries: [{ path: 'record.md', content: label }], outputPaths: [] } } : {}) })
  const generated = (label: string) => ({ prompt: `Independent ${label} record.`, criteria: ['Return the original status.'], qualityContract,
    ...(chat ? { files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'chat' as const, cwd,
      entries: [{ path: 'record.md', content: label }], outputPaths: [] } } : {}) })
  const originals = [original('source1'), original('source2'), original('counterexample')], independent = [generated('adjacent'), generated('holdout')]
  const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout']
  const config = { provideIndependentCases: true as const, modelConfigDigest: sha256('model'), cases: [...originals, ...independent].map((material, index) => ({
    caseId: roles[index]!, material, requiredCondition: 'Return the original status.', verifierSource: 'print(True)',
  })), isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: 'python@sha256:' + 'a'.repeat(64), imageId: 'sha256:' + 'a'.repeat(64), workRoot: cwd } }
  const input = { sources: originals.slice(0, 2), counterexample: originals[2]!, modelConfigDigest: config.modelConfigDigest,
    qualityContract, ...(chat ? { cwd } : {}), signal: new AbortController().signal }
  const expected = Object.fromEntries(independent.map((item, index) => [roles[index + 3]!, { prompt: item.prompt, criteria: item.criteria,
    ...(item.files === undefined ? {} : { files: { entries: item.files.entries, outputPaths: [] } }) }]))
  return { config, input, expected }
}
const feed = (config: ReturnType<typeof fixture>['config']) => {
  const check = createConversationStudyIsolatedPythonAnswerCheck(config) as ReturnType<typeof createConversationStudyIsolatedPythonAnswerCheck> & {
    prepareIndependentCases?: (input: ReturnType<typeof fixture>['input']) => Promise<unknown> }
  expect(check.prepareIndependentCases).toBeTypeOf('function'); return check.prepareIndependentCases!
}
it.each([false, true])('supplies frozen complete %s-mode cases before any executor preparation', async chat => {
  const f = fixture(chat), prepare = feed(f.config), result = await prepare(f.input)
  expect(result).toEqual(f.expected)
  expect(await prepare(f.input)).toEqual(f.expected)
  expect(result).not.toBe(f.expected)
})
it('supplies frozen cases through the actual published factory without starting an executor', async () => {
  const f = fixture(true)
  const published = await import(new URL('../../packages/tianwen-runtime-bundle/dist/index.js', import.meta.url).href)
  const check = published.createConversationStudyIsolatedPythonAnswerCheck(f.config)
  expect(await check.prepareIndependentCases(f.input)).toEqual(f.expected)
})
it.each(['source', 'counter', 'model', 'quality', 'cwd'] as const)('refuses original %s substitution rather than generating a fallback', async field => {
  const f = fixture(true), prepare = feed(f.config)
  if (field === 'source') f.input.sources[0]!.objective = 'replacement'
  if (field === 'counter') f.input.counterexample.files!.entries[0]!.content = 'replacement'
  if (field === 'model') f.input.modelConfigDigest = sha256('replacement')
  if (field === 'quality') f.input.qualityContract = { ...f.input.qualityContract, criterion: 'replacement' }
  if (field === 'cwd') f.input.cwd = 'D:/DevData/replacement'
  expect(await prepare(f.input)).toBeUndefined()
})
it('returns independent copies and freezes caller supplied case definitions', async () => {
  const f = fixture(true), prepare = feed(f.config), expected = structuredClone(f.expected)
  f.config.cases[3]!.material.criteria[0] = 'replacement'
  const result = await prepare(f.input) as typeof f.expected
  Object.values(result)[0]!.criteria[0] = 'mutated result'
  expect(await prepare(f.input)).toEqual(expected)
})
it('keeps ordinary single-case and non-opted-in factories without an independent feed', () => {
  const f = fixture(); const { provideIndependentCases, ...config } = f.config
  expect(createConversationStudyIsolatedPythonAnswerCheck(config)).not.toHaveProperty('prepareIndependentCases')
  expect(createConversationStudyIsolatedPythonAnswerCheck({ ...config, cases: config.cases.slice(0, 1) })).not.toHaveProperty('prepareIndependentCases')
})
it.each(['missing-role', 'generated-source', 'mixed-mode', 'mixed-quality'] as const)('refuses %s incomplete host cohort at creation', field => {
  const f = fixture(true)
  if (field === 'missing-role') f.config.cases.pop()
  if (field === 'generated-source') f.config.cases[3]!.material = f.config.cases[0]!.material
  if (field === 'mixed-mode') delete f.config.cases[3]!.material.files
  if (field === 'mixed-quality') f.config.cases[3]!.material.qualityContract = { ...f.input.qualityContract, criterion: 'replacement' }
  expect(() => createConversationStudyIsolatedPythonAnswerCheck(f.config)).toThrow()
})
