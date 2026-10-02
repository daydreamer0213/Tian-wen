import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import * as host from './development-isolated-node-check.mjs'

const require = createRequire(new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url))
const { conversationQualityContract, sha256 } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createUserMessage } = await import(pathToFileURL(require.resolve('@tianwen/dsh-compat')).href)
const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout']
function fixture() {
  const cwd = 'D:/DevData/tianwen-dev-study-host-20261003/saved-material-only'
  const qualityContract = conversationQualityContract(), modelConfigDigest = sha256('dev-study-host-model')
  const cases = Object.fromEntries(roles.map((role, index) => {
    const target = `task-${role}.${index < 3 ? 'mjs' : 'mts'}`, prompt = `Implement ${target}: JSON n = ${index + 1}.`
    const common = { criteria: [`JSON n = ${index + 1}.`], qualityContract,
      files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd,
        entries: [{ path: target, content: null }, { path: `${role}.md`, content: prompt }], outputPaths: [target] } }
    const material = index < 3 ? { ...common, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })], context: [], objective: prompt }
      : { ...common, prompt }
    return [role, { material, requiredCondition: `Return the original JSON n = ${index + 1} with zero exit code and empty stderr.`,
      cases: [{ id: role, input: '{}', expectedJson: `{"n":${index + 1}}`, exitCode: 0 }] }]
  }))
  const config = { modelConfigDigest, cases }
  const signal = new AbortController().signal
  return { config, signal, preparation: role => ({ ...structuredClone(cases[role].material), caseId: role, modelConfigDigest, signal }),
    supply: () => ({ sources: [structuredClone(cases.source1.material), structuredClone(cases.source2.material)],
      counterexample: structuredClone(cases.counterexample.material), cwd, qualityContract, modelConfigDigest, signal }) }
}

test('published development host exposes original single-study and closed-cohort producers', () => {
  assert.equal(typeof host.createDevelopmentStudyIsolatedNodeCheck, 'function')
  assert.equal(typeof host.createDevelopmentStudyIsolatedNodeCohortCheck, 'function')
})
test('ordinary host keeps its original override rejection and delegates invalid contracts', () => {
  const config = { cwd: 'D:/DevData', requestText: 'Implement task.mjs', targetPath: 'task.mjs', cases: [{ id: 'one', input: '{}', expectedJson: '{}', exitCode: 0 }] }
  assert.equal(typeof host.createDevelopmentIsolatedNodeCheck(config).prepare, 'function')
  assert.throws(() => host.createDevelopmentIsolatedNodeCheck({ ...config, isolated: {} }))
  assert.throws(() => host.createDevelopmentIsolatedNodeCheck({ ...config, cases: [] }))
})
test('single-study host preserves criteria and rejects isolated override', () => {
  const config = { cwd: 'D:/DevData', requestText: 'Implement task.mts', targetPath: 'task.mts', criteria: ['Return {}'], requiredCondition: 'Return {}',
    cases: [{ id: 'one', input: '{}', expectedJson: '{}', exitCode: 0 }] }
  assert.equal(typeof host.createDevelopmentStudyIsolatedNodeCheck(config).prepare, 'function')
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCheck({ ...config, isolated: undefined }))
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCheck({ ...config, criteria: [] }))
})
test('closed cohort supplies only original frozen adjacent/holdout material', async () => {
  const f = fixture(), check = host.createDevelopmentStudyIsolatedNodeCohortCheck(f.config)
  const result = await check.prepareIndependentCases(f.supply())
  for (const role of ['adjacent', 'holdout']) {
    assert.deepEqual(result[role], { prompt: f.config.cases[role].material.prompt, criteria: f.config.cases[role].material.criteria,
      files: { entries: f.config.cases[role].material.files.entries, outputPaths: f.config.cases[role].material.files.outputPaths } })
  }
  f.config.cases.holdout.material.prompt = 'mutated caller'
  result.holdout.files.entries[0].content = 'mutated return'
  assert.equal((await check.prepareIndependentCases(f.supply())).holdout.files.entries[0].content, null)
})
for (const mutation of ['source-order', 'request', 'reference', 'model', 'quality']) test(`source supply stops on ${mutation} drift`, async () => {
  const f = fixture(), check = host.createDevelopmentStudyIsolatedNodeCohortCheck(f.config), input = f.supply()
  if (mutation === 'source-order') input.sources.reverse()
  if (mutation === 'request') input.sources[0].request = []
  if (mutation === 'reference') input.sources[0].files.entries[1].content = 'different'
  if (mutation === 'model') input.modelConfigDigest = sha256('different')
  if (mutation === 'quality') input.qualityContract = { ...input.qualityContract, criterion: 'different' }
  assert.equal(await check.prepareIndependentCases(input), undefined)
})
for (const role of roles) test(`cohort rejects ${role} isolated configuration override`, () => {
  const f = fixture(); f.config.cases[role].isolated = undefined
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCohortCheck(f.config))
})
test('cohort rejects top-level override, incomplete roles and non-single output', () => {
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCohortCheck({ ...fixture().config, isolated: {} }))
  const incomplete = fixture().config; delete incomplete.cases.holdout
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCohortCheck(incomplete))
  const multiple = fixture().config; multiple.cases.holdout.material.files.outputPaths.push('other.mts')
  assert.throws(() => host.createDevelopmentStudyIsolatedNodeCohortCheck(multiple))
})
test('unknown role/material/model and cancellation stop before executor preparation', async () => {
  const f = fixture(), check = host.createDevelopmentStudyIsolatedNodeCohortCheck(f.config)
  const unknown = f.preparation('source1'); unknown.caseId = 'unknown'
  assert.equal(await check.prepare(unknown), undefined)
  const drift = f.preparation('source1'); drift.criteria = ['different']
  assert.equal(await check.prepare(drift), undefined)
  const model = f.preparation('source1'); model.modelConfigDigest = sha256('different')
  assert.equal(await check.prepare(model), undefined)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(check.prepare({ ...f.preparation('source1'), signal: controller.signal }))
  await assert.rejects(check.prepareIndependentCases({ ...f.supply(), signal: controller.signal }))
})
