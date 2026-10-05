import {expect,it} from 'vitest'
import * as goalSources from '../../packages/tianwen-runtime-bundle/src/goal-task-research-source.js'

const fixture=()=>({
  source:{sourceId:'original-source',inputDigest:'original-input',input:{reviewMaterialDigest:'original-review',checks:[{focus:'requirements',verdict:'not-met',category:'source-fidelity',proof:{sessionId:'independent-review'}}]},outcome:{input:{outcome:{status:'rejected',detail:'Original required condition failed.'}}}},
  recovered:{original:{source:{nativeGoal:{}},conversation:[{id:'earlier',role:'assistant',content:[{type:'text',text:'Earlier explanation.'}]},{id:'actual-final',role:'assistant',content:[{type:'text',text:'{"project":"original","status":"failed"}'}]}]},studyMaterial:{prompt:'Original task requirements only',criteria:['Original condition']}}
})
const observe=(f:ReturnType<typeof fixture>)=>(goalSources as any).goalTaskProposalObservation(f.source,f.recovered)

it('passes actual original deliveries, rejected acceptance and saved independent proof without changing trial material',()=>{
  const f=fixture(),before=structuredClone(f),value=observe(f)
  expect(value.sourceId).toBe('original-source');expect(value.sourceInputDigest).toBe('original-input')
  expect(value.reviewMaterialDigest).toBe('original-review');expect(value.acceptance).toEqual(f.source.outcome.input.outcome)
  expect(value.reviewChecks).toEqual(f.source.input.checks);expect(value.deliveries).toEqual(f.recovered.original.conversation)
  expect(f).toEqual(before);expect(value).not.toHaveProperty('counterexample');expect(value).not.toHaveProperty('guidance')
  value.deliveries[0].content[0].text='changed';value.reviewChecks[0].proof.sessionId='changed'
  expect(f).toEqual(before)
})
it('uses the frozen terminal delivery rather than earlier assistant messages',()=>{
  const f=fixture();Object.assign(f.recovered.original.source.nativeGoal,{delivery:{protocol:'native-terminal.v1',messageId:'actual-final',seq:8}})
  expect(observe(f).deliveries).toEqual([f.recovered.original.conversation[1]])
})
it('refuses an unavailable terminal delivery rather than inventing one',()=>{
  const f=fixture();Object.assign(f.recovered.original.source.nativeGoal,{delivery:{protocol:'native-terminal.v1',messageId:'absent',seq:8}})
  expect(()=>observe(f)).toThrow('original proposal delivery unavailable')
})
it('passes only the original captured file result when present',()=>{
  const f=fixture(),fileResult={answer:'Original file delivery',files:[{path:'output.txt',content:'Original captured bytes'}],outputDigest:'captured-output'}
  Object.assign(f.recovered.original,{evaluationMode:'local-files',fileResult})
  expect(observe(f).fileResult).toEqual(fileResult);expect(observe(f).fileResult).not.toBe(fileResult)
})
