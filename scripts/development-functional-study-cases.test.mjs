import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { buildDevelopmentFunctionalStudyCases as build } from './development-functional-study-cases.mjs'
import * as host from './development-isolated-node-project-check.mjs'
const require = createRequire(new URL('../packages/tianwen-runtime-bundle/package.json', import.meta.url))
const { conversationQualityContract, sha256 } = await import(pathToFileURL(require.resolve('@tianwen/evolution')).href)
const { createUserMessage } = await import(pathToFileURL(require.resolve('@tianwen/dsh-compat')).href)
function fixture() {
  const cwd = 'D:/DevData/tianwen-dev-study-case-binding-native-20261003/saved-only', qualityContract = conversationQualityContract()
  const graph = n => ({ entries: [{ path: `task${n}.mjs`, content: null }, { path: 'entry.mjs', content: `import { value } from './task${n}.mjs';console.log(JSON.stringify({value}));` }], outputPaths: [`task${n}.mjs`] })
  const original = n => ({ requestText: `Implement actual task ${n}.`, ...graph(n), entryPath: 'entry.mjs', cases: [{ id: `original-${n}`, input: '{}', expectedJson: JSON.stringify({value:n}), exitCode:0 }], requiredCondition: `Return original value ${n}.` })
  const independent = n => { const {requestText,...rest}=original(n);return {...rest,prompt:requestText,criteria:[`Original case ${n}.`]} }
  const config = {cwd,qualityContract,originals:[original(1),original(2),original(3)],adjacent:independent(4),holdout:independent(5)}
  const source = n => ({request:[createUserMessage({source:{kind:'user'},content:[{type:'text',text:original(n).requestText}]})],context:[],objective:`Original objective ${n}.`,criteria:[`Original case ${n}.`],qualityContract,files:{schemaVersion:'tianwen.conversation-file-material.v1',outputKind:'files',cwd,...graph(n)}})
  return {config,material:{cwd,qualityContract,sources:[source(2),source(1)],counterexample:source(3),modelConfigDigest:sha256('actual-study-consumer-model'),signal:new AbortController().signal}}
}
for (const [field,wrong] of [['context','wrong'],['objective',[]],['criteria','wrong']]) {
  test(`malformed original ${field} is refused without changing inputs`,()=>{
    for (const erase of [true,false]) { const f=fixture();if(erase)delete f.material.sources[0][field];else f.material.sources[0][field]=wrong
      const before=JSON.stringify(f.material);assert.equal(build(f.config,f.material),undefined);assert.equal(JSON.stringify(f.material),before)
    }
  })
}
for (const role of ['adjacent','holdout']) test(`empty ${role} criterion violates original config`,()=>{
  const f=fixture();f.config[role].criteria=[''];const before=structuredClone(f.config);assert.throws(()=>build(f.config,f.material),TypeError);assert.deepEqual(f.config,before)
})
test('DEV consumes original contracts through actual published cohort factory',async()=>{
  const f=fixture();assert.equal(typeof host.createDevelopmentFunctionalStudyCohortCheck,'function')
  const check=host.createDevelopmentFunctionalStudyCohortCheck(f.config,f.material)
  const independent=await check.prepareIndependentCases(f.material)
  assert.deepEqual(independent.adjacent,{prompt:f.config.adjacent.prompt,criteria:f.config.adjacent.criteria,files:{entries:f.config.adjacent.entries,outputPaths:f.config.adjacent.outputPaths}})
  assert.deepEqual(independent.holdout.files.entries,f.config.holdout.entries)
  const switched={...f.material,sources:[...f.material.sources].reverse()};assert.equal(await check.prepareIndependentCases(switched),undefined)
  const drift={...f.material,modelConfigDigest:sha256('different')};assert.equal(await check.prepareIndependentCases(drift),undefined)
  const unknown={...f.material,sources:[{...f.material.sources[0],request:[]},f.material.sources[1]]};assert.equal(host.createDevelopmentFunctionalStudyCohortCheck(f.config,unknown),undefined)
  const definitions=build(f.config,f.material);f.config.adjacent.entries[0].content='changed config';f.material.sources[0].files.entries[0].content='changed source'
  assert.equal(definitions.source1.material.files.entries[0].content,null)
})
if(process.env.TIANWEN_DEV_STUDY_BINDING_ISOLATED==='1')test('five actual published role checks retain exact original functional expectations',async()=>{
  const f=fixture(),definitions=build(f.config,f.material),check=host.createDevelopmentFunctionalStudyCohortCheck(f.config,f.material)
  for(const [role,n] of [['source1',2],['source2',1],['counterexample',3],['adjacent',4],['holdout',5]]) {
    const material={...definitions[role].material,caseId:role,modelConfigDigest:f.material.modelConfigDigest,signal:f.material.signal}
    const prepared=await check.prepare(material);assert(prepared,role);assert.equal(prepared.requiredCondition,definitions[role].requiredCondition)
    const outputs=structuredClone(material.files.entries);outputs[0].content=`export const value=${n};`
    const candidate={...material,answer:'Original code only.',inputs:prepared.inputs,outputs,outputPaths:material.files.outputPaths}
    assert.equal((await prepared.evaluate(candidate)).status,'verified',role)
    if(role==='holdout') { outputs[0].content='export const value=999;';const rejected=await prepared.evaluate(candidate);assert.equal(rejected.status,'rejected');assert.equal(rejected.failedRequiredConditionDigest,sha256(definitions[role].requiredCondition)) }
    assert.equal(await check.prepare({...material,modelConfigDigest:sha256('different')}),undefined)
  }
})
