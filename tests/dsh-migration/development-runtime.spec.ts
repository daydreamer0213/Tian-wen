import { mkdirSync, mkdtempSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context, mountAgentLoopTestDependencies } from '@tianwen/dsh-compat'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import * as runtime from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const base=resolve('D:/DevData/tianwen-development-runtime'),roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0)){if(!root.startsWith(base+'\\'))throw new Error('owned DEV fixture escaped');rmSync(root,{recursive:true,force:true})}})
function fixture(){mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'api-test-'));roots.push(root);const ctx=new Context();ctx.baseUrl=pathToFileURL(root).href;return{root,ctx}}
it('provides an explicit development Runtime entry rather than exposing a default quarantine override',()=>{
  expect((runtime as any).applyDevelopment).toBeTypeOf('function')
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
