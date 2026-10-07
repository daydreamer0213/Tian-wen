import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {expect,it} from 'vitest'

const require=createRequire(import.meta.url),repo=resolve('.'),base='D:/DevData/tianwen-native-host-shutdown-tests'
const dsh=dirname(require.resolve('@deepseek-ai/dsh/package.json'))
const {disposeProfileContext}=await import(pathToFileURL(dsh+'/lib/profile-boot-DG5t9aNs.js').href)
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
mkdirSync(base,{recursive:true})
it('a failed shutdown hook still waits other owners and disposes the original Context',async()=>{
 const ctx=new Context(),trace:string[]=[]
 ctx.effect(()=>()=>{trace.push('resource-dispose')})
 ctx.on('app/before-exit',()=>{throw new Error('owned drain failure')})
 ctx.on('app/before-exit',async()=>{
  await new Promise(resolve=>setTimeout(resolve,10));trace.push('other-owner-settled')
 })
 await expect(disposeProfileContext(ctx)).rejects.toThrow()
 expect(trace).toEqual(['other-owner-settled','resource-dispose'])
})
it('an original Context without shutdown owners still disposes normally',async()=>{
 const ctx=new Context(),trace:string[]=[]
 ctx.effect(()=>()=>{trace.push('resource-dispose')})
 await disposeProfileContext(ctx)
 expect(trace).toEqual(['resource-dispose'])
 await disposeProfileContext(undefined)
})
it.each(['SIGINT','SIGTERM'])('original CLI %s drains the runner before disposing its resources',signal=>{
 const root=mkdtempSync(base+'/cli-'),profile=root+'/profiles/owned-shutdown',receipt=root+'/receipt.json'
 mkdirSync(profile,{recursive:true})
 writeFileSync(profile+'/package.json',JSON.stringify({name:'owned-shutdown',version:'0.0.0',private:true,dsh:{profile:{bundles:[]}}}))
 writeFileSync(profile+'/cordis.patch.yml',JSON.stringify([{insert:[{id:'owned-shutdown',name:pathToFileURL(repo+'/tests/fixtures/development-native-host-shutdown/control-plugin.mjs').href,config:{receipt,signal,runner:repo+'/scripts/development-native-job-runner.mjs'}}]}]))
 try{
  const run=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',dsh+'/lib/bin.js','--profile','owned-shutdown'],{
   cwd:repo,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,DSH_HOME:root,DSH_TELEMETRY_DISABLED:'1'},
  })
  expect(run.error,run.stderr).toBeUndefined()
  expect(run.status,run.stderr).toBe(signal==='SIGINT'?130:0)
  const report=JSON.parse(readFileSync(receipt,'utf8'))
  expect(report.trace).toEqual(['job-start','job-cancel','job-archive-live','resource-dispose'])
  expect(report.live).toBe(false)
 }finally{
  expect(realpathSync(root).toLowerCase()).toBe(resolve(root).toLowerCase())
  expect(resolve(dirname(root))).toBe(resolve(base));rmSync(root,{recursive:true})
 }
},300000)
