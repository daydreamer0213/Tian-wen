import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { developmentStudyResultFixture } from '../../scripts/test-fixtures/development-study-result-host.mjs'

const base=resolve('D:/DevData/tianwen-standard-native-job-20261004'),profiles=resolve('D:/DevData/tianwen-development-runtime')
mkdirSync(base,{recursive:true});mkdirSync(profiles,{recursive:true})
const owned:string[]=[],links:string[]=[]
afterEach(()=>{
 for(const path of owned){expect([base,profiles]).toContain(dirname(path));expect(lstatSync(path).isSymbolicLink()).toBe(false);expect(realpathSync(path).toLowerCase()).toBe(path.toLowerCase())}
 for(const path of links){expect(owned).toContain(dirname(path));expect(lstatSync(path).isSymbolicLink()).toBe(true)}
 for(const path of links.splice(0))unlinkSync(path)
 for(const path of owned.splice(0))rmSync(path,{recursive:true})
})
const hash=(bytes:string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const runtimeUrl=new URL('../../scripts/development-native-runtime.mjs',import.meta.url).href
const jobUrl=new URL('../../scripts/development-native-task-job.mjs',import.meta.url).href
const bundle=createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json',import.meta.url)),cli=createRequire(bundle.resolve('@deepseek-ai/dsh/package.json'))
const load=(owner:NodeRequire,name:string)=>import(pathToFileURL(owner.resolve(name)).href)
function readJob(config:unknown){
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
  import {readFileSync} from 'node:fs'
  const {loadDevelopmentNativeTaskJob}=await import('./scripts/development-native-task-job.mjs')
  try{console.log(JSON.stringify({job:loadDevelopmentNativeTaskJob(JSON.parse(readFileSync(0,'utf8')))}))}
  catch(error){console.log(JSON.stringify({error:error.message}))}
 `],{cwd:resolve('.'),encoding:'utf8',input:JSON.stringify(config),timeout:15000})
 expect(child.error).toBeUndefined();expect(child.status,child.stderr).toBe(0)
 const result=JSON.parse(child.stdout.trim());if(result.error)throw new Error(result.error);return result.job
}
function fixture(){
 const root=resolve(mkdtempSync(base+'/job-')),profile=resolve(mkdtempSync(profiles+'/job-loader-'));owned.push(root,profile)
 const cwd=profile+'/workspace';mkdirSync(cwd);const f=developmentStudyResultFixture(cwd),ordinary=f.ordinary(1)
 const packet={schemaVersion:'tianwen.development-native-contracts.v1',ordinaryContract:[ordinary,f.ordinary(2)],studyContracts:f.config}
 const contractPath=root+'/contracts.json',bytes=JSON.stringify(packet);writeFileSync(contractPath,bytes)
 const runtimeConfig={developmentRoot:profile,contractPath,contractDigest:hash(bytes)}
 const job={schemaVersion:'tianwen.development-native-job.v1',cwd,sessionId:'owned-job-control',requestText:ordinary.requestText,
  outputPaths:[...ordinary.outputPaths],referencePaths:[...ordinary.referencePaths],maxTargetBytes:96*1024,resultRoot:root+'/attempt',
  callConfig:{provider:'deepseek-official',model:'deepseek-v4-flash',reasoningEffort:'high',maxTokens:65536}}
 const jobPath=root+'/job.json',write=(value=job)=>{const bytes=JSON.stringify(value);writeFileSync(jobPath,bytes);return {jobPath,jobDigest:hash(bytes)}}
 return {root,profile,cwd,f,packet,job,runtimeConfig,write,config:write()}
}

it('reads a raw pinned job as data and refuses extra callbacks, altered bytes and mutable locations',async()=>{
 const f=fixture()
 expect(readJob(f.config)).toEqual(f.job)
 expect(()=>readJob({...f.config,jobDigest:'sha256:'+'0'.repeat(64)})).toThrow(/digest/i)
 expect(()=>readJob({...f.config,run:'arbitrary'})).toThrow()
 expect(()=>readJob(f.write({...f.job,isPrepared:{__jsExpr:'process.exit(99)'}} as any))).toThrow()
 const g=fixture(),bytes=JSON.stringify(g.job),path=g.cwd+'/job.json';writeFileSync(path,bytes)
 expect(()=>readJob({jobPath:path,jobDigest:hash(bytes)})).toThrow(/workspace/i)
 const h=fixture();h.job.resultRoot=h.cwd+'/attempt'
 expect(()=>readJob(h.write())).toThrow(/workspace/i)
})

it('refuses physically mutable job bytes through an ancestor junction',async()=>{
 const f=fixture()
 const alias=f.root+'/workspace-alias';symlinkSync(f.root,alias,'junction');links.push(alias)
 mkdirSync(f.root+'/nested');f.job.cwd=alias+'/nested'
 const path=f.root+'/nested/job.json',bytes=JSON.stringify(f.job);writeFileSync(path,bytes)
 expect(()=>readJob({jobPath:path,jobDigest:hash(bytes)})).toThrow(/workspace/i)
})

it('binds only the exact original ordinary requirement and declaration, with frozen source data',async()=>{
 const {DevelopmentNativeRuntimeContracts}=await import(runtimeUrl),f=fixture(),ctx=new Context()
 try{
  const binding=new DevelopmentNativeRuntimeContracts(ctx,f.packet.ordinaryContract)
  expect(binding.matches(f.job)).toBe(true)
  expect(binding.matches({...f.job,outputPaths:[...f.job.outputPaths].reverse()})).toBe(true)
  for(const change of [{requestText:f.job.requestText+' '},{cwd:f.cwd+'/'},{outputPaths:['other.mjs']},{referencePaths:[]}])expect(binding.matches({...f.job,...change})).toBe(false)
  f.packet.ordinaryContract[0].requestText='changed';f.packet.ordinaryContract[0].outputPaths.push('extra.mjs')
  expect(binding.matches(f.job)).toBe(true)
 }finally{await ctx.fiber.dispose()}
})

async function mount(f:ReturnType<typeof fixture>){
 const ctx=new Context();await ctx.plugin(Loader,{baseUrl:pathToFileURL(f.profile).href})
 for(const module of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-agent','@deepseek-ai/dsh-agent-loop','@deepseek-ai/dsh-subagent']){
  const m=await load(cli,module);await ctx.plugin(m.default??m,module.endsWith('agent-loop')?{agents:[]}:{})
 }
 const tools=await load(bundle,'@tianwen/runtime-bundle/native-tools-observer');await ctx.plugin(tools.default??tools)
 const persist=await load(bundle,'@deepseek-ai/dsh-session-persistence-jsonl');await ctx.plugin(persist.default,{root:f.profile+'/sessions',compression:'none'})
 await ctx.loader.create({name:runtimeUrl,config:f.runtimeConfig})
 return ctx
}
async function settle(ctx:Context){
 for(let pass=0;pass<8;pass++){
  await ctx.loader.await();await Promise.all([...ctx.registry.values()].flatMap(r=>[...r.fibers].map(f=>f.await())))
  if(![...ctx.registry.values()].some(r=>[...r.fibers].some(f=>f.inertia)))return
 }throw new Error('original Loader did not settle')
}
it('normal Loader binds the job, starts nothing, and preserves caller cancellation before an attempt',async()=>{
 const f=fixture(),ctx=await mount(f);let calls=0
 try{
  ctx.on('llm/stream',async function*(){calls++;throw new Error('No request belongs to this constructor control')})
  const id=await ctx.loader.create({name:jobUrl,config:f.config});await settle(ctx)
  expect(ctx.loader.resolve(id).fiber?.state).toBe(2)
  const service=ctx.get('tianwenDevelopmentNativeTaskJob') as any
  expect(typeof service?.run).toBe('function')
  const stopped=new AbortController();stopped.abort()
  await expect(service.run(stopped.signal)).rejects.toThrow()
  expect(calls).toBe(0);expect(existsSync(f.job.resultRoot)).toBe(false)
  expect(ctx.tianwenEvolution.listConversationTasks()).toEqual([])
  expect(ctx.tianwenEvolution.getLearningAnalysisConsent()).toBeUndefined()
 }finally{await ctx.fiber.dispose()}
})

it('normal Loader refuses a job that does not match its mounted original contract',async()=>{
 const f=fixture(),ctx=await mount(f)
 try{
  f.job.referencePaths=[]
  await expect(ctx.loader.create({name:jobUrl,config:f.write()})).rejects.toThrow(/differs/);await settle(ctx)
  expect(ctx.get('tianwenDevelopmentNativeTaskJob')).toBeUndefined()
  expect(ctx.tianwenEvolution.listConversationTasks()).toEqual([])
  expect(existsSync(f.job.resultRoot)).toBe(false)
 }finally{await ctx.fiber.dispose()}
})
