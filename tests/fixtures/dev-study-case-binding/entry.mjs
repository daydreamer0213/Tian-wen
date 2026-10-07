import assert from 'node:assert/strict'
import { buildDevelopmentFunctionalStudyCases as build } from '../../../scripts/development-functional-study-cases.mjs'
const cwd = '/frozen-project', quality = { schemaVersion: 'opaque-quality-fixture', original: ['bound'] }
const graph = n => ({ entries: [{ path: `contract${n}.md`, content: `original contract ${n}` }, { path: `task${n}.mjs`, content: null }], outputPaths: [`task${n}.mjs`] })
const contract = n => ({ requestText: `Repair task ${n}.`, ...graph(n), entryPath: `contract${n}.md`, cases: [{ id: `case-${n}`, input: '{}', expectedJson: `{"n":${n}}`, exitCode: 0 }], requiredCondition: `Original condition ${n}` })
const independent = n => { const { requestText, ...value } = contract(n); return { prompt: requestText, criteria: [`Preserve contract ${n}.`], ...value } }
const config = { cwd, qualityContract: quality, originals: [contract(1), contract(2), contract(3), contract(6)], adjacent: independent(4), holdout: independent(5) }
const source = n => ({ request: [{ id: `user-${n}`, content: [{ type: 'text', text: contract(n).requestText }], source: { kind: 'user' } }],
  context: [{ role: 'context', text: `Original context ${n}` }], objective: `Original objective ${n}`, criteria: [`Original criterion ${n}`],
  qualityContract: structuredClone(quality), files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd, ...graph(n) } })
const material = { cwd, qualityContract: structuredClone(quality), sources: [source(2), { ...source(1), feedbackStandard: { assessmentId: 'original-feedback', classification: 'preference', criteria: ['Preserve scope'], originalFeedback: { note: 'Original note' } } }], counterexample: source(3) }
const configBefore = structuredClone(config), materialBefore = structuredClone(material), result = build(config, material)
assert.deepEqual(Object.keys(result).sort(), ['adjacent', 'counterexample', 'holdout', 'source1', 'source2'])
for (const [role, index] of [['source1', 2], ['source2', 1], ['counterexample', 3], ['adjacent', 4], ['holdout', 5]]) {
  const value = result[role]
  assert.deepEqual(Object.keys(value).sort(), ['cases', 'entryPath', 'material', 'requiredCondition'])
  assert.deepEqual(value.cases, contract(index).cases); assert.equal(value.entryPath, contract(index).entryPath); assert.equal(value.requiredCondition, contract(index).requiredCondition)
  assert(!Object.hasOwn(value, 'isolated')); assert.deepEqual(value.material.qualityContract, quality)
}
assert.deepEqual(result.source1.material, material.sources[0]); assert.deepEqual(result.source2.material, material.sources[1]); assert.deepEqual(result.counterexample.material, material.counterexample)
assert.deepEqual(result.adjacent.material, { prompt: config.adjacent.prompt, criteria: config.adjacent.criteria, qualityContract: quality,
  files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd, ...graph(4) } })
assert.deepEqual(config, configBefore); assert.deepEqual(material, materialBefore)
result.source1.material.request[0].content[0].text = 'changed output'; result.source2.material.feedbackStandard.originalFeedback.note = 'changed'; result.source1.cases[0].expectedJson = '{}'
result.adjacent.material.files.entries[0].content = 'changed'; result.holdout.material.qualityContract.original.push('changed')
assert.deepEqual(config, configBefore); assert.deepEqual(material, materialBefore)
const permuted = structuredClone(material); permuted.sources[0].files.entries.reverse()
assert.deepEqual(build(config, permuted).source1.material.files.entries, permuted.sources[0].files.entries)
const multi = structuredClone(config); multi.originals[0].requestText = 'first\nsecond\nthird'
const multiMaterial = structuredClone(material); multiMaterial.sources[1].request = [ { content: [{ type: 'text', text: 'first' }, { type: 'image', url: 'opaque' }, { type: 'text', text: 'second' }] }, { content: [{ type: 'text', text: 'third' }] } ]
assert.deepEqual(build(multi, multiMaterial).source2.material.request, multiMaterial.sources[1].request)
const multiOutput = structuredClone(config); multiOutput.originals[1].entries.push({ path: 'extra.mjs', content: '' }); multiOutput.originals[1].outputPaths.push('extra.mjs')
const multiOutputMaterial = structuredClone(material); multiOutputMaterial.sources[0].files.entries.push({ path: 'extra.mjs', content: '' }); multiOutputMaterial.sources[0].files.outputPaths = ['extra.mjs', 'task2.mjs']
assert.deepEqual(build(multiOutput, multiOutputMaterial).source1.material.files.outputPaths, multiOutputMaterial.sources[0].files.outputPaths)
const privateMaterial = structuredClone(material); privateMaterial.sources[0].answer = 'must not leak'; privateMaterial.sources[0].signal = 'opaque'
assert(!Object.hasOwn(build(config, privateMaterial).source1.material, 'answer')); assert(!Object.hasOwn(build(config, privateMaterial).source1.material, 'signal'))
for (const change of [
  m => { m.cwd = '/other' }, m => { m.qualityContract.original.push('other') }, m => { m.sources[0].qualityContract.original.push('other') },
  m => { m.sources[0].files.cwd = '/other' }, m => { m.sources[0].files.schemaVersion = 'unknown' }, m => { m.sources[0].files.outputKind = 'chat' },
  m => { m.sources.pop() }, m => { m.sources[0].request[0].content[0].text = 'unknown' }, m => { m.sources[0].files.entries[0].content += 'changed' },
  m => { m.sources[0].files.entries.pop() }, m => { m.sources[0].files.entries.push(m.sources[0].files.entries[0]) }, m => { m.sources[0].files.entries.push({ path: 'borrowed.mjs', content: null }) },
  m => { m.sources[0].files.outputPaths.push(m.sources[0].files.outputPaths[0]) }, m => { m.sources[0].files.outputPaths = [] }, m => { m.sources[0].files.outputPaths = ['borrowed.mjs'] },
  m => { m.counterexample = structuredClone(m.sources[0]) }, m => { m.sources[1] = structuredClone(m.sources[0]) }, m => { delete m.counterexample },
]) { const m = structuredClone(material); change(m); const before = structuredClone(m); assert.equal(build(config, m), undefined); assert.deepEqual(m, before) }
for (const change of [
  c => { c.originals[1].requestText = c.originals[0].requestText }, c => { c.originals = [] }, c => { c.qualityContract = null }, c => { c.cwd = '' },
  c => { c.originals[0].entries.push(c.originals[0].entries[0]) }, c => { c.originals[0].outputPaths.push(c.originals[0].outputPaths[0]) },
  c => { c.originals[0].entryPath = 'missing.mjs' }, c => { c.originals[0].requiredCondition = '' }, c => { c.adjacent.criteria = [] }, c => { c.holdout.cases = [] },
]) { const c = structuredClone(config); change(c); const before = structuredClone(c); assert.throws(() => build(c, material), TypeError); assert.deepEqual(c, before) }
assert.equal(build(config, null), undefined); assert.equal(build(config, {}), undefined)
console.log(JSON.stringify({ passed: true }))
