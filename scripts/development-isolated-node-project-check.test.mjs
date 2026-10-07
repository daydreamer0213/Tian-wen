import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import * as host from './development-isolated-node-project-check.mjs'
const require = createRequire(new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url))
const { conversationQualityContract, sha256 } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createUserMessage } = await import(pathToFileURL(require.resolve('@tianwen/dsh-compat')).href)
const ordinary = { cwd: 'D:/DevData', requestText: 'Implement a.ts and b.ts.', entryPath: 'entry.mjs', outputPaths: ['a.ts', 'b.ts'], referencePaths: ['entry.mjs'], cases: [{ id: 'one', input: '{}', expectedJson: '{}', exitCode: 0 }] }
function fixture() {
  const roles = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'], cwd = 'D:/DevData/tianwen-node-project-checks-20261003/saved-only'
  const qualityContract = conversationQualityContract(), modelConfigDigest = sha256('project-host-model'), signal = new AbortController().signal
  const cases = Object.fromEntries(roles.map((id,index) => {
    const prompt = `Original project ${index}`, common = { criteria: ['Return original JSON.'], qualityContract,
      files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd, outputPaths: ['a.ts','b.ts'], entries: [{ path: 'a.ts', content: null }, { path: 'b.ts', content: null }, { path: 'entry.mjs', content: "import './a.js';import './b.js'" }] } }
    return [id, { entryPath: 'entry.mjs', material: index<3 ? { ...common, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })], context: [], objective: prompt } : { ...common, prompt }, cases: ordinary.cases, requiredCondition: 'Return original JSON.' }]
  }))
  return { config: { modelConfigDigest, cases }, signal, supply: () => ({ sources: [structuredClone(cases.source1.material), structuredClone(cases.source2.material)], counterexample: structuredClone(cases.counterexample.material), cwd, qualityContract, modelConfigDigest, signal }) }
}
test('fixed project host exposes three new published factories and preserves declared multi-output material', async () => {
  assert.equal(typeof host.createDevelopmentIsolatedNodeProjectCheck(ordinary).prepare,'function')
  assert.equal(typeof host.createDevelopmentStudyIsolatedNodeProjectCheck({ ...ordinary, criteria: ['Return original JSON.'], requiredCondition: 'Return original JSON.' }).prepare,'function')
  const f=fixture(), check=host.createDevelopmentStudyIsolatedNodeProjectCohortCheck(f.config), result=await check.prepareIndependentCases(f.supply())
  assert.deepEqual(result.adjacent.files,f.config.cases.adjacent.material.files && { entries:f.config.cases.adjacent.material.files.entries,outputPaths:['a.ts','b.ts'] })
  result.holdout.files.entries[0].content='mutated return'
  assert.equal((await check.prepareIndependentCases(f.supply())).holdout.files.entries[0].content,null)
})
for(const key of ['entryPath','outputPaths','cases']) test(`ordinary host rejects invalid ${key} through original public validation`,()=> {
  const invalid={ ...ordinary, [key]:key==='entryPath'?'missing.mjs':[] }; assert.throws(()=>host.createDevelopmentIsolatedNodeProjectCheck(invalid))
})
for(const make of [host.createDevelopmentIsolatedNodeProjectCheck,host.createDevelopmentStudyIsolatedNodeProjectCheck]) test(`host rejects own isolated override (${make.name})`,()=>assert.throws(()=>make({...ordinary,criteria:['Original'],requiredCondition:'Original',isolated:undefined})))
test('cohort rejects top-level or per-role isolation overrides and missing explicit entry',()=> {
  const f=fixture(); assert.throws(()=>host.createDevelopmentStudyIsolatedNodeProjectCohortCheck({...f.config,isolated:{}}))
  for(const change of ['override','entry']) { const config=structuredClone(f.config); if(change==='override')config.cases.holdout.isolated={};else delete config.cases.holdout.entryPath;assert.throws(()=>host.createDevelopmentStudyIsolatedNodeProjectCohortCheck(config)) }
})
for(const mutation of ['order','input','model','quality']) test(`closed project cohort refuses ${mutation} source drift`,async()=>{
  const f=fixture(),check=host.createDevelopmentStudyIsolatedNodeProjectCohortCheck(f.config),source=f.supply()
  if(mutation==='order')source.sources.reverse()
  if(mutation==='input')source.sources[0].files.entries[1].content='different'
  if(mutation==='model')source.modelConfigDigest=sha256('different')
  if(mutation==='quality')source.qualityContract={...source.qualityContract,criterion:'different'}
  assert.equal(await check.prepareIndependentCases(source),undefined)
})
