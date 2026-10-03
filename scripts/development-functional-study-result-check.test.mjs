import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as host from './development-isolated-node-project-check.mjs'
import { buildDevelopmentFunctionalStudyCases as build } from './development-functional-study-cases.mjs'
import { developmentStudyResultFixture as fixture, sha256 } from './test-fixtures/development-study-result-host.mjs'

test('DEV result host exposes actual Runtime options with the same frozen cwd',()=>{
  const f=fixture(),options=host.createDevelopmentNativeCheckOptions(f.ordinary(1),f.config)
  assert.deepEqual(Object.keys(options).sort(),['externalCodeCheck','studyResultCheck'])
  assert.equal(typeof options.externalCodeCheck.prepare,'function')
  assert.equal(typeof options.studyResultCheck.prepareIndependentCases,'function')
  assert.throws(()=>host.createDevelopmentNativeCheckOptions({...f.ordinary(1),cwd:'D:/DevData/another-project'},f.config))
})
test('no study case can be prepared before the host accepts independent cases',async()=>{
  const f=fixture(),check=host.createDevelopmentFunctionalStudyResultCheck(f.config),definition=build(f.config,f.material).source1
  assert.equal(await check.prepare({...definition.material,caseId:'source1',modelConfigDigest:f.material.modelConfigDigest,signal:f.material.signal}),undefined)
  f.controller.abort(new Error('original cancellation'))
  await assert.rejects(check.prepareIndependentCases(f.material),/original cancellation/)
})
for(const mutation of ['quality','readonly-null','bad-json','bad-entry','bad-path','override','role-override','original-whitespace','independent-whitespace'])test(`startup refuses ${mutation} before any study attempt or environment preparation`,()=>{
  const f=fixture()
  if(mutation==='quality')f.config.qualityContract={}
  if(mutation==='readonly-null')f.config.holdout.entries[2].content=null
  if(mutation==='bad-json')f.config.originals[2].cases[0].expectedJson='not JSON'
  if(mutation==='bad-entry')f.config.adjacent.entryPath='absent.mjs'
  if(mutation==='bad-path')f.config.holdout.entries[2].path='../outside.mjs'
  if(mutation==='override')f.config.isolated=undefined
  if(mutation==='role-override')f.config.originals[1].isolated={}
  if(mutation==='original-whitespace')f.config.originals[0].requestText=' '
  if(mutation==='independent-whitespace')f.config.adjacent.criteria=[' ']
  const before=structuredClone(f.config)
  assert.throws(()=>host.createDevelopmentFunctionalStudyResultCheck(f.config))
  assert.deepEqual(f.config,before)
})
test('startup freezes caller config and returns fresh independent materials',async()=>{
  const f=fixture(),before=structuredClone(f.config),check=host.createDevelopmentFunctionalStudyResultCheck(f.config)
  f.config.holdout.entries[2].content='caller mutation';f.config.originals[1].requestText='changed'
  const result=await check.prepareIndependentCases(f.material)
  assert.deepEqual(result.holdout.files,{entries:before.holdout.entries,outputPaths:before.holdout.outputPaths})
  result.holdout.files.entries[0].content='returned mutation'
  assert.equal((await check.prepareIndependentCases(f.material)).holdout.files.entries[0].content,null)
  assert.deepEqual(f.material.sources.map(source=>source.files.outputPaths),[['task2.mjs','extra2.mjs'],['task1.mjs','extra1.mjs']])
})
for(const path of ['package.json','nested/Package.JSON','.tianwen-loader.mjs','.tianwen-loader.mjs/nested'])test(`startup refuses executor-reserved ${path}`,()=>{
  const f=fixture();f.config.holdout.entries.push({path,content:'{}'})
  assert.throws(()=>host.createDevelopmentFunctionalStudyResultCheck(f.config))
})
for(const [typescript,collision] of [['dep.ts','dep.js'],['dep.mts','dep.mjs'],['dep.ts','DEP.JS/nested.mjs'],['dep.mts','dep.mjs/nested.mjs']])test(`startup refuses original TypeScript alias collision ${typescript}/${collision}`,()=>{
  const f=fixture();f.config.adjacent.entries.push({path:typescript,content:'export const unused=1;'}, {path:collision,content:'export const unused=2;'})
  assert.throws(()=>host.createDevelopmentFunctionalStudyResultCheck(f.config))
})
test('valid nonconflicting TypeScript inputs and initially present outputs retain the original permissions',async()=>{
  const f=fixture();f.config.holdout.entries.push({path:'nested/dep.ts',content:'export const unused: number=1;'})
  f.config.holdout.entries[0].content='export const left=0;'
  const check=host.createDevelopmentFunctionalStudyResultCheck(f.config),result=await check.prepareIndependentCases(f.material)
  assert.deepEqual(result.holdout.files,{entries:f.config.holdout.entries,outputPaths:f.config.holdout.outputPaths})
})
for(const mutation of ['unknown','duplicate','graph','cwd','quality'])test(`independent source ${mutation} is refused without touching caller material`,async()=>{
  const f=fixture(),check=host.createDevelopmentFunctionalStudyResultCheck(f.config)
  assert(await check.prepareIndependentCases(f.material))
  if(mutation==='unknown')f.material.sources[0].request=[]
  if(mutation==='duplicate')f.material.counterexample=f.material.sources[0]
  if(mutation==='graph')f.material.sources[0].files.entries[2].content='drift'
  if(mutation==='cwd')f.material.cwd='D:/DevData/other'
  if(mutation==='quality')f.material.qualityContract={}
  const before=JSON.stringify(f.material)
  assert.equal(await check.prepareIndependentCases(f.material),undefined)
  assert.equal(JSON.stringify(f.material),before)
})

if(process.env.TIANWEN_DEV_STUDY_RESULT_ISOLATED==='1')test('actual fixed SDK five-role checks, cancellation and replacement keep original contracts',async()=>{
  const f=fixture(),check=host.createDevelopmentFunctionalStudyResultCheck(f.config),definitions=build(f.config,f.material)
  assert(await check.prepareIndependentCases(f.material))
  const saved=[]
  for(const [role,n] of [['source1',2],['source2',1],['counterexample',3],['adjacent',4],['holdout',5]]) {
    const material={...definitions[role].material,caseId:role,modelConfigDigest:f.material.modelConfigDigest,signal:f.material.signal}
    const prepared=await check.prepare(material);assert(prepared,role);assert.equal(prepared.requiredCondition,f.requiredCondition)
    const outputs=structuredClone(material.files.entries),program=f.program(n)
    outputs[0].content=program.left;outputs[1].content=program.right
    const candidate={...material,answer:'Controlled modules.',inputs:prepared.inputs,outputs:outputs.reverse(),outputPaths:[...material.files.outputPaths].reverse()}
    assert.equal((await prepared.evaluate(candidate)).status,'verified',role)
    saved.push({material,prepared,candidate})
    if(role==='holdout') {
      candidate.outputs.find(entry=>entry.path===`extra${n}.mjs`).content='export const right=999;'
      const outcome=await prepared.evaluate(candidate);assert.equal(outcome.status,'rejected');assert.equal(outcome.failedRequiredConditionDigest,sha256(f.requiredCondition))
    }
  }
  const first=saved[0]
  // Both calls yield in the published cohort; only the latest generation may publish.
  const modelB={...f.material,modelConfigDigest:sha256('dev-result-host-controlled-model-B')}
  const [older,newer]=await Promise.all([check.prepareIndependentCases(f.material),check.prepareIndependentCases(modelB)])
  assert.equal(older,undefined);assert(newer)
  assert.equal(await check.prepare(first.material),undefined)
  assert(await check.prepare({...first.material,modelConfigDigest:modelB.modelConfigDigest}))
  assert.equal((await first.prepared.evaluate(first.candidate)).status,'verified')
  assert.equal(await check.prepareIndependentCases({...f.material,sources:[]}),undefined)
  assert.equal(await check.prepare({...first.material,modelConfigDigest:modelB.modelConfigDigest}),undefined)
  assert(await check.prepareIndependentCases(f.material))
  const cancelled=new AbortController();cancelled.abort(new Error('cancelled fresh study'))
  await assert.rejects(check.prepareIndependentCases({...f.material,signal:cancelled.signal}),/cancelled fresh study/)
  assert.equal(await check.prepare(first.material),undefined)
  assert.equal((await first.prepared.evaluate(first.candidate)).status,'verified')
  await assert.rejects(first.prepared.evaluate({...first.candidate,signal:cancelled.signal}),/cancelled fresh study/)
})
