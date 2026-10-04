import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { developmentStudyResultFixture } from '../../scripts/test-fixtures/development-study-result-host.mjs'
import { createUserMessage } from '@tianwen/dsh-compat'
import { conversationQualityContract, sha256 } from '../../packages/tianwen-evolution/dist/index.js'

const root='D:/DevData/tianwen-standard-dev-runtime-20261004'
mkdirSync(root,{recursive:true})
const ownedRoots:string[]=[],ownedLinks:string[]=[]
afterEach(()=>{
 // Only this test's fresh, canonical direct-child roots are disposable. Remove
 // the explicitly owned junctions first; never recurse through their targets.
 for(const path of ownedRoots) {
  expect([resolve(root),resolve('D:/DevData/tianwen-development-runtime')]).toContain(dirname(path))
  expect(lstatSync(path).isSymbolicLink()).toBe(false)
  expect(realpathSync(path).toLowerCase()).toBe(path.toLowerCase())
 }
 for(const path of ownedLinks) {
  expect(ownedRoots).toContain(dirname(path))
  expect(lstatSync(path).isSymbolicLink()).toBe(true)
 }
 for(const path of ownedLinks.splice(0))unlinkSync(path)
 for(const path of ownedRoots.splice(0))rmSync(path,{recursive:true})
})
const bundle=createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json',import.meta.url))
const cli=createRequire(bundle.resolve('@deepseek-ai/dsh/package.json'))
const load=(owner:NodeRequire,name:string)=>import(pathToFileURL(owner.resolve(name)).href)
const pluginUrl=new URL('../../scripts/development-native-runtime.mjs',import.meta.url).href
const digest=(bytes:Buffer|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
function fixture(cliProfile=false) {
 const packetRoot=mkdtempSync(root+'/packet-'), profileRoot=resolve('D:/DevData/tianwen-development-runtime')
 mkdirSync(profileRoot,{recursive:true})
 const home=resolve(mkdtempSync(profileRoot+'/standard-loader-'))
 const profile=cliProfile?resolve(home,'profiles','owned-dev'):home
 ownedRoots.push(resolve(packetRoot),home)
 mkdirSync(profile+'/workspace',{recursive:true})
 const f=developmentStudyResultFixture(profile+'/workspace')
 const packet={schemaVersion:'tianwen.development-native-contracts.v1',ordinaryContract:[1,2,3].map(f.ordinary),studyContracts:f.config,
  goalContract:[1,2,3].map(n=>({...f.ordinary(n),goalCommand:'Implement the frozen original project tasks.'}))}
 const path=packetRoot+'/contracts.json',write=(value=packet)=>{const bytes=JSON.stringify(value);writeFileSync(path,bytes);return {developmentRoot:profile,contractPath:path,contractDigest:digest(bytes)}}
 return {f,packet,profile,path,write,config:write()}
}

type TestAnswerMaterial={request?:ReturnType<typeof createUserMessage>[],context?:never[],objective?:string,prompt?:string,
 criteria:string[],qualityContract:ReturnType<typeof conversationQualityContract>,
 files?:{schemaVersion:'tianwen.conversation-file-material.v1',cwd:string,outputKind:'chat',outputPaths:string[],entries:{path:string,content:string}[]}}
function answerContracts(cwd:string, chat=false) {
 const qualityContract=conversationQualityContract(),roles=['source1','source2','counterexample','adjacent','holdout']
 const originals=roles.slice(0,3).map(label=>({request:[createUserMessage({source:{kind:'user'},content:[{type:'text',text:`Original ${label} requirement.`}]})],
  context:[],objective:'Report the original state.',criteria:['Preserve the original state.'],qualityContract}))
 const cases:{caseId:string,requiredCondition:string,verifierSource:string,material:TestAnswerMaterial}[]=roles.map((caseId,index)=>({caseId,requiredCondition:'Preserve the original state.',
  verifierSource:'import json,sys\np=json.load(sys.stdin)\nprint(json.dumps(p["answer"]=="pending"))',
  material:{...(index<3?originals[index]!:{prompt:`Independent ${caseId} requirement.`,criteria:['Preserve the original state.'],qualityContract}),
   ...(chat?{files:{schemaVersion:'tianwen.conversation-file-material.v1',cwd,outputKind:'chat',outputPaths:[],entries:[{path:'record.md',content:caseId}]}}:{})}}))
 return {modelConfigDigest:sha256('frozen-model'),provideIndependentCases:true,cases}
}

function goalAnswerContract(cwd:string, chat=false, suffix='one') {
 const requiredCondition='Report pending for an unresolved original verdict.',objective=`Report the controlled original ${suffix} status.`,task=`Preserve original ${suffix} verdict.`
 return {cwd,family:'writing',modelConfigDigest:sha256('frozen-model'),requiredCondition,
  verifierSource:'import json,sys\np=json.load(sys.stdin)\nprint(json.dumps(p["answer"]=="pending"))',
  material:{sourceKind:'native-goal-task',prompt:JSON.stringify({protocol:'tianwen.native-goal-study-input.v1',originalCommand:objective,
   goal:{objective,context:null,successCriteria:null},delegatedTask:task,permissionMode:'workspace-write'}),
   criteria:[task,requiredCondition],qualityContract:conversationQualityContract(),...(chat?{files:{schemaVersion:'tianwen.conversation-file-material.v1',cwd,
    outputKind:'chat',outputPaths:[],entries:[{path:'record.md',content:'Verdict not yet measured.'}]}}:{})}}
}

it.each([false,true])('loads frozen ordinary Goal %s answer contracts from the original DEV JSON without executor preparation',async chat=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture(),contract=goalAnswerContract(f.packet.studyContracts.cwd,chat)
 const {goalContract,...packet}=f.packet
 const options=loadDevelopmentNativeRuntimeOptions(f.write({...packet,goalAnswerContracts:contract} as any))
 expect(typeof options.goalTaskAcceptance.methodScope).toBe('function')
 expect(typeof options.goalTaskAcceptance.prepare).toBe('function')
 expect(await options.goalTaskAcceptance.prepare({task:{objective:'another delegated task'}})).toBeUndefined()
 // The public producer, rather than a loose objective match, must still reject
 // absent original Goal/command/native authority for an apparent task match.
 await expect(options.goalTaskAcceptance.methodScope({task:{objective:'Preserve original one verdict.'},signal:new AbortController().signal})).rejects.toThrow()
 expect(options.answerStudyResultCheck).toBeUndefined()
})

it('permits different original Goals but rejects duplicate answer routes, execution overrides and ambiguous checker modes',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture(),cwd=f.packet.studyContracts.cwd
 const {goalContract,...packet}=f.packet,first=goalAnswerContract(cwd),second=goalAnswerContract(cwd,true,'two')
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...packet,goalAnswerContracts:[first,second]} as any))).not.toThrow()
 for(const values of [[],[first,first],[{...first,cwd:'D:/DevData/unrelated'}],[{...first,isolated:{}}],[{...first,guidanceActivationQuarantine:false}]])
  expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...packet,goalAnswerContracts:values} as any))).toThrow()
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...f.packet,goalAnswerContracts:first} as any))).toThrow()
 const bad=structuredClone(first);bad.material.criteria=['A different condition.']
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...packet,goalAnswerContracts:bad} as any))).toThrow()
})

it.each([false,true])('loads optional frozen answer contracts and supplies exact %s-mode cases without executor preparation',async chat=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture(),contract=answerContracts(f.packet.studyContracts.cwd,chat)
 const packet={...f.packet,answerStudyContracts:contract},options=loadDevelopmentNativeRuntimeOptions(f.write(packet as any))
 const input={sources:contract.cases.slice(0,2).map(row=>structuredClone(row.material)),counterexample:structuredClone(contract.cases[2]!.material),
  modelConfigDigest:contract.modelConfigDigest,qualityContract:conversationQualityContract(),...(chat?{cwd:f.packet.studyContracts.cwd}:{}),signal:new AbortController().signal}
 const expected=structuredClone(Object.fromEntries(contract.cases.slice(3).map(row=>[row.caseId,{prompt:row.material.prompt,criteria:row.material.criteria,
  ...(chat?{files:{entries:row.material.files!.entries,outputPaths:[]}}:{})}])))
 contract.cases[3]!.material.criteria[0]='Caller mutation must not change the loaded contract.'
 expect(await options.answerStudyResultCheck.prepareIndependentCases(input)).toEqual(expected)
 expect(await options.answerStudyResultCheck.prepareIndependentCases({...input,modelConfigDigest:sha256('other')})).toBeUndefined()
 input.sources[0]!.objective='Changed original'
 expect(await options.answerStudyResultCheck.prepareIndependentCases(input)).toBeUndefined()
})

it('rejects answer execution overrides, unsupported fields and foreign captured workspaces before mounting',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture(),contract=answerContracts(f.packet.studyContracts.cwd,true)
 for(const extra of [{isolated:{}},{plugin:'arbitrary'},{guidanceActivationQuarantine:false}])
  expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...f.packet,answerStudyContracts:{...contract,...extra}} as any))).toThrow()
 for(const row of contract.cases)row.material.files!.cwd='D:/DevData/unrelated'
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...f.packet,answerStudyContracts:contract} as any))).toThrow()
})

it('loads the original factories from an exact raw-byte contract, without IO preparation or executable JSON',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture()
 const options=loadDevelopmentNativeRuntimeOptions(f.config)
 expect(options.developmentRoot).toBe(f.profile)
 expect(options.captureExternalCodeArtifacts).toBe(true)
 expect(options.exposeCapturedFileFacts).toBe(false)
 expect(typeof options.externalCodeCheck.prepare).toBe('function')
 expect(typeof options.studyResultCheck.prepareIndependentCases).toBe('function')
 expect(options.answerStudyResultCheck).toBeUndefined()
 expect(typeof options.goalTaskAcceptance.prepare).toBe('function')
 expect(await options.externalCodeCheck.prepare({request:[]})).toBeUndefined()
 expect(await options.goalTaskAcceptance.prepare({task:{objective:'unknown'}})).toBeUndefined()
 expect(await options.studyResultCheck.prepareIndependentCases({...f.f.material,cwd:'D:/unknown'})).toBeUndefined()
 // The packet is parsed after Loader interpolation. An expression-shaped data
 // value is not evaluated or changed into a runtime option.
 const bytes=readFileSync(f.path,'utf8');f.packet.studyContracts.originals[0].requestText={__jsExpr:'process.exit(99)'} as any
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write())).toThrow()
 expect(bytes).not.toContain('__jsExpr')
})

it('rejects a changed packet and extra executable or Runtime fields before mounting',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture()
 expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,contractDigest:'sha256:'+'0'.repeat(64)})).toThrow(/digest/i)
 for(const change of [{plugin:'arbitrary'}, {guidanceActivationQuarantine:false}, {externalCodeCheck:'arbitrary'}])
  expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,...change})).toThrow()
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write({...f.packet,plugin:'arbitrary'} as any))).toThrow()
 expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,contractDigest:'bad'})).toThrow()
 expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,contractPath:'relative.json'})).toThrow()
 expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,developmentRoot:root})).toThrow()
})

it('refuses a contract stored in the mutable workspace and invalid original contracts',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture()
 f.packet.studyContracts.cwd=resolve(f.path,'..')
 f.packet.ordinaryContract.forEach(c=>c.cwd=f.packet.studyContracts.cwd)
 f.packet.goalContract.forEach(c=>c.cwd=f.packet.studyContracts.cwd)
 expect(()=>loadDevelopmentNativeRuntimeOptions(f.write())).toThrow(/workspace/i)
 const g=fixture();g.packet.studyContracts.holdout.requiredCondition=''
 expect(()=>loadDevelopmentNativeRuntimeOptions(g.write())).toThrow()
 const h=fixture();(h.packet.ordinaryContract[0] as any).isolated={cliPath:'custom'}
 expect(()=>loadDevelopmentNativeRuntimeOptions(h.write())).toThrow()
})

it('rejects a packet physically inside a workspace reached through an ancestor junction',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture()
 const alias=resolve(f.path,'..','workspace-alias'),real=resolve(f.path,'..')
 mkdirSync(real+'/nested',{recursive:true});symlinkSync(real,alias,'junction')
 ownedLinks.push(alias)
 const cwd=alias+'/nested',path=real+'/nested/contracts.json'
 f.packet.studyContracts.cwd=cwd
 f.packet.ordinaryContract.forEach(c=>c.cwd=cwd)
 f.packet.goalContract.forEach(c=>c.cwd=cwd)
 const bytes=JSON.stringify(f.packet);writeFileSync(path,bytes)
 expect(()=>loadDevelopmentNativeRuntimeOptions({...f.config,contractPath:path,contractDigest:digest(bytes)})).toThrow(/workspace/i)
})

it('keeps a legitimate ancestor alias when the pinned packet is physically outside its workspace',async()=>{
 const {loadDevelopmentNativeRuntimeOptions}=await import(pluginUrl),f=fixture()
 const alias=resolve(f.path,'..','external-workspace-alias')
 symlinkSync(f.profile,alias,'junction')
 ownedLinks.push(alias)
 const cwd=alias+'/workspace';f.packet.studyContracts.cwd=cwd
 f.packet.ordinaryContract.forEach(c=>c.cwd=cwd)
 f.packet.goalContract.forEach(c=>c.cwd=cwd)
 expect(typeof loadDevelopmentNativeRuntimeOptions(f.write()).externalCodeCheck.prepare).toBe('function')
})

it.each([false,true])('normal Loader imports DEV without a request under CLI profile=%s',async cliProfile=>{
 const f=fixture(cliProfile),ctx=new Context(),requests:unknown[]=[]
 if(cliProfile)f.config=f.write({...f.packet,answerStudyContracts:answerContracts(f.packet.studyContracts.cwd,true)} as any)
 try {
  await ctx.plugin(Loader,{baseUrl:pathToFileURL(f.profile).href})
  const id=await ctx.loader.create({name:pluginUrl,config:f.config})
  await ctx.loader.await()
  expect(ctx.get('tianwenEvolution')).toBeUndefined()
  const backend=(await load(bundle,'@deepseek-ai/dsh-session-persistence-jsonl')).default
  await ctx.plugin(backend,{root:f.profile+'/sessions',compression:'none'})
  await ctx.loader.await()
  // Normal shared services, imported from their original upstream modules.
  for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session','@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent','@deepseek-ai/dsh-agent-loop','@deepseek-ai/dsh-subagent']) {
   const module=await load(cli,name);await ctx.plugin(module.default??module,name.endsWith('agent-loop')?{agents:[]}: {})
  }
  ctx.on('llm/stream',async function*(request,next){requests.push(request);yield* next()})
  for(let pass=0;pass<8;pass++) {
   await Promise.all([...ctx.registry.values()].flatMap(r=>[...r.fibers].map(f=>f.await())))
   if(![...ctx.registry.values()].some(r=>[...r.fibers].some(f=>f.inertia)))break
   if(pass===7)throw new Error('normal loader did not settle')
  }
  expect(ctx.loader.resolve(id).fiber?.state).toBe(2)
  expect(ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(false)
  expect(ctx.tianwenEvolution.getLearningAnalysisConsent()).toBeUndefined()
  expect(ctx.tianwenEvolution.listConversationTasks()).toEqual([])
  expect(ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
  expect(typeof ctx.tianwenConversationObserver.config.externalCodeCheck.prepare).toBe('function')
  expect(typeof ctx.tianwenConversationGuidanceLoop.studyResultCheck.prepareIndependentCases).toBe('function')
  const loop=ctx.get('tianwenConversationGuidanceLoop') as unknown as {answerStudyResultCheck?:{prepareIndependentCases?:unknown}}
  if(cliProfile)expect(typeof loop.answerStudyResultCheck?.prepareIndependentCases).toBe('function')
  else expect(loop.answerStudyResultCheck).toBeUndefined()
  expect(requests).toEqual([])
 } finally {await ctx.fiber.dispose()}
})
