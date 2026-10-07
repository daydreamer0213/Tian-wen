import { mkdirSync, mkdtempSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { Context, mountAgentLoopTestDependencies, mountFeedbackHarness } from '@tianwen/dsh-compat'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as runtime from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const base=resolve('D:/DevData/tianwen-development-runtime'),roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0)){if(!root.startsWith(base+'\\'))throw new Error('owned DEV fixture escaped');rmSync(root,{recursive:true,force:true})}})
function fixture(){mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'api-test-'));roots.push(root);const ctx=new Context();ctx.baseUrl=pathToFileURL(root).href;return{root,ctx}}
it.each(['ordinary','DEV'] as const)('waits for persisted feedback reconciliation before declaring %s Runtime ready',async mode=>{
 const f=fixture();await f.ctx.fiber.dispose()
 const {ctx}=await mountFeedbackHarness(f.root,[]);ctx.baseUrl=pathToFileURL(f.root).href
 let release!:()=>void,entered!:()=>void,settled=false
 const gate=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve})
 const originalList=ctx.sessionPersistence.list.bind(ctx.sessionPersistence)
 const delayed=vi.spyOn(ctx.sessionPersistence,'list').mockImplementationOnce(async()=>{entered();await gate;return originalList()})
 const mounted=(mode==='DEV'?runtime.applyDevelopment(ctx,{developmentRoot:f.root}):runtime.apply(ctx,{evolutionRoot:join(f.root,'evolution')})).then(()=>{settled=true})
 try{
  await started;await new Promise<void>(resolve=>setImmediate(resolve))
  expect(settled,'persisted feedback is still loading').toBe(false)
  release();await mounted
  expect(ctx.get('tianwenMessageFeedbackBridge')).toBeDefined()
  expect(ctx.tianwenEvolution.listConversationFeedbackAssessments()).toEqual([])
 }finally{release();await mounted;delayed.mockRestore();await ctx.fiber.dispose()}
})
it('provides an explicit development Runtime entry rather than exposing a default quarantine override',()=>{
  expect((runtime as any).applyDevelopment).toBeTypeOf('function')
})
it.each(['dev-paired-any-case.v1', 'dev-conclusive-pair.v1'])('ordinary apply refuses the %s option before mounting any ledger',async guidanceDecisionPolicy=>{
 const f=fixture()
 try{
  await expect(runtime.apply(f.ctx,{guidanceDecisionPolicy} as never)).rejects.toThrow(/DEV|development/i)
  expect(f.ctx.get('tianwenEvolution')).toBeUndefined()
 }finally{await f.ctx.fiber.dispose()}
})
it.each(['dev-paired-any-case.v1','dev-conclusive-pair.v1','dev-conclusive-pair.v2','unknown.v1',undefined])('strictly admits an explicit development policy: %s',async policy=>{
 const f=fixture()
 try{
  await mountAgentLoopTestDependencies(f.ctx)
  await f.ctx.plugin(JsonlSessionPersistence,{root:join(f.root,'sessions'),compression:'none'})
  await f.ctx.plugin(SubagentRuntime)
  const mounted=runtime.applyDevelopment(f.ctx,{developmentRoot:f.root,guidanceDecisionPolicy:policy} as never)
  if(policy==='dev-paired-any-case.v1'||policy==='dev-conclusive-pair.v1'){
   await mounted
   expect((f.ctx.tianwenConversationGuidanceLoop as any).sourceConfig.guidanceDecisionPolicy).toBe(policy)
  }else{
   await expect(mounted).rejects.toThrow(/policy/i)
   expect(f.ctx.get('tianwenEvolution')).toBeUndefined()
  }
 }finally{await f.ctx.fiber.dispose()}
})
it('mounts the original DEV Runtime in a dedicated canonical CLI Profile',async()=>{
  const f=fixture(),profile=join(f.root,'profiles','owned-dev');mkdirSync(profile,{recursive:true})
  f.ctx.baseUrl=pathToFileURL(profile).href
  try{
    await mountAgentLoopTestDependencies(f.ctx)
    await f.ctx.plugin(JsonlSessionPersistence,{root:join(profile,'sessions'),compression:'none'})
    await runtime.applyDevelopment(f.ctx,{developmentRoot:profile})
    expect(f.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(false)
    expect(f.ctx.tianwenEvolution.listConversationTasks()).toEqual([])
    expect(f.ctx.tianwenEvolution.getLearningAnalysisConsent()).toBeUndefined()
    expect(existsSync(join(f.root,'evolution'))).toBe(false)
  }finally{await f.ctx.fiber.dispose()}
})
it.each(['wrong-depth','module-fallback','profile-link','profiles-link','home-link','wrong-backend','wrong-base','state-link'] as const)('rejects CLI DEV %s before mounting Evolution',async mode=>{
  const f=fixture();let profile=join(f.root,'profiles','owned-dev')
  if(mode==='wrong-depth')profile=join(f.root,'extra','profiles','owned-dev')
  if(mode==='module-fallback')profile=join(f.root,'profiles','node_modules')
  if(mode==='profiles-link'){
    const other=fixture();mkdirSync(join(other.root,'owned-dev'))
    symlinkSync(other.root,join(f.root,'profiles'),'junction')
  }else mkdirSync(profile,{recursive:true})
  if(mode==='profile-link'){const alias=join(f.root,'profiles','alias');symlinkSync(profile,alias,'junction');profile=alias}
  if(mode==='home-link'){const alias=join(base,'alias-'+f.root.split('\\').at(-1));symlinkSync(f.root,alias,'junction');roots.push(alias);profile=join(alias,'profiles','owned-dev')}
  if(mode==='state-link'){const other=fixture();symlinkSync(other.root,join(profile,'state'),'junction')}
  f.ctx.baseUrl=pathToFileURL(mode==='wrong-base'?f.root:profile).href
  try{
    await mountAgentLoopTestDependencies(f.ctx)
    await f.ctx.plugin(JsonlSessionPersistence,{root:join(mode==='wrong-backend'?f.root:profile,'sessions'),compression:'none'})
    await expect(runtime.applyDevelopment(f.ctx,{developmentRoot:profile})).rejects.toThrow(/development/i)
    expect(f.ctx.get('tianwenEvolution')).toBeUndefined()
    expect(existsSync(join(profile,'evolution','ledger.jsonl'))).toBe(false)
  }finally{await f.ctx.fiber.dispose()}
})
it('refuses a Context already carrying another Evolution service before configuring DEV activation',async()=>{
  const f=fixture()
  f.ctx.provide('tianwenEvolution',{} as never)
  await expect(runtime.applyDevelopment(f.ctx,{developmentRoot:f.root})).rejects.toThrow(/development.*context/i)
  expect(existsSync(join(f.root,'evolution','ledger.jsonl'))).toBe(false)
  await f.ctx.fiber.dispose()
})
it.each(['wrong-root','changed-config'] as const)('rejects actual JSONL storage %s instead of trusting a configuration path',async mode=>{
  const f=fixture()
  await mountAgentLoopTestDependencies(f.ctx)
  await f.ctx.plugin(JsonlSessionPersistence,{root:join(f.root,'wrong-sessions'),compression:'none'})
  if(mode==='changed-config')(f.ctx.sessionPersistence as JsonlSessionPersistence).config.root=join(f.root,'sessions')
  try{
    await expect(runtime.applyDevelopment(f.ctx,{developmentRoot:f.root})).rejects.toThrow(/development.*session/i)
    expect(f.ctx.get('tianwenEvolution')).toBeUndefined()
    expect(existsSync(join(f.root,'evolution','ledger.jsonl'))).toBe(false)
  }finally{await f.ctx.fiber.dispose()}
})
it.each(['outside','state','sessions','evolution','base-url','root-link','state-link'] as const)('rejects DEV %s before any Runtime ledger is mounted',async mode=>{
  const f=fixture(),config:any={developmentRoot:f.root}
  if(mode==='outside')config.developmentRoot='D:/DevData/tianwen-development-learning-20261001'
  if(['state','sessions','evolution'].includes(mode))config[mode+'Root']='D:/DevData/tianwen-development-learning-20261001/'+mode
  if(mode==='base-url')f.ctx.baseUrl=pathToFileURL('D:/DevData/unrelated-root').href
  if(mode==='root-link'){const linked=join(base,'linked-'+f.root.split('\\').at(-1));symlinkSync(f.root,linked,'junction');roots.push(linked);config.developmentRoot=linked;f.ctx.baseUrl=pathToFileURL(linked).href}
  if(mode==='state-link'){const outside=fixture().root;symlinkSync(outside,join(f.root,'state'),'junction')}
  await expect((runtime as any).applyDevelopment(f.ctx,config)).rejects.toThrow(/development/i)
  expect(f.ctx.get('tianwenEvolution')).toBeUndefined()
  expect(existsSync(join(f.root,'evolution','ledger.jsonl'))).toBe(false)
  await f.ctx.fiber.dispose()
})
