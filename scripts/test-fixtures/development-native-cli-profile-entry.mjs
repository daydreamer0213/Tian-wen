import assert from 'node:assert/strict'
import * as candidate from '../development-native-cli-profile-data.mjs'

// Freeze before the unknown natural answer. Not feedback or a research cohort.
const passed=[]
const check=async(name,fn)=>{await fn();passed.push(name)}
const base={profileRoot:'D:/DevData/tianwen-development-runtime/cli-home/profiles/development',cwd:'D:/DevData/product',contractPath:'D:/DevData/operator/contracts.json',contractDigest:'sha256:'+'a'.repeat(64),jobPath:'D:/DevData/operator/job.json',jobDigest:'sha256:'+'b'.repeat(64)}
const make=(options=base)=>candidate.createDevelopmentNativeCliProfileData(options)
const ids=['llm','session','system-prompt','agent','agent-loop','subagent','native-tools-observer','session-persistence','fs-local','subagent-spawn','fs-tools','deepseek','development-runtime','native-job','native-job-runner']
const rows=()=>make().patch[0].insert
const url=path=>new URL(path,import.meta.url).href
await check('callable-export',()=>assert.equal(typeof candidate.createDevelopmentNativeCliProfileData,'function'))
await check('closed-result',()=>assert.deepEqual(Object.keys(make()).sort(),['manifest','patch']))
await check('original-manifest',()=>assert.deepEqual(make().manifest,{name:'tianwen-development-native-profile',version:'0.0.0',private:true,dsh:{profile:{bundles:[]}}}))
await check('original-insert-shape',()=>{const p=make().patch;assert.equal(p.length,1);assert.deepEqual(Object.keys(p[0]),['insert']);assert.equal(p[0].insert.length,15)})
await check('unique-ordered-services',()=>assert.deepEqual(rows().map(row=>row.id),ids))
await check('closed-service-rows',()=>{for(const row of rows())assert.deepEqual(Object.keys(row).sort(),['config','id','name'])})
await check('original-foundations',()=>{const r=rows();for(let i=0;i<6;i++){assert.equal(r[i].name,'@deepseek-ai/dsh-'+ids[i]);assert.deepEqual(r[i].config,i===4?{agents:[]}:{})}})
await check('published-observer',()=>assert.deepEqual(rows()[6],{id:ids[6],name:url('../../packages/tianwen-runtime-bundle/dist/native-tools-observer.js'),config:{}}))
await check('original-jsonl-storage',()=>assert.deepEqual(rows()[7],{id:ids[7],name:url('../../packages/tianwen-runtime-bundle/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js'),config:{root:base.profileRoot+'/sessions',compression:'none'}}))
await check('original-fs-scope',()=>assert.deepEqual(rows()[8],{id:ids[8],name:'@deepseek-ai/dsh-fs-local',config:{cwd:base.cwd}}))
await check('original-subagent-provider',()=>assert.deepEqual(rows()[9],{id:ids[9],name:'@deepseek-ai/dsh-subagent-spawn-in-process',config:{providerName:'spawn'}}))
await check('original-file-tools',()=>assert.deepEqual(rows()[10],{id:ids[10],name:'@deepseek-ai/dsh-tool-fs',config:{}}))
await check('original-real-provider-budget',()=>assert.deepEqual(rows()[11],{id:ids[11],name:'@deepseek-ai/dsh-llm-deepseek',config:{maxTokens:65536,reasoningEffort:'high',retryPolicy:{mode:'normal',maxRetries:0},streamIdleTimeoutMs:90000}}))
await check('pinned-original-runtime',()=>assert.deepEqual(rows()[12],{id:ids[12],name:url('../development-native-runtime.mjs'),config:{developmentRoot:base.profileRoot,contractPath:base.contractPath,contractDigest:base.contractDigest}}))
await check('pinned-original-job',()=>assert.deepEqual(rows()[13],{id:ids[13],name:url('../development-native-task-job.mjs'),config:{jobPath:base.jobPath,jobDigest:base.jobDigest}}))
await check('explicit-original-runner',()=>assert.deepEqual(rows()[14],{id:ids[14],name:url('../development-native-job-runner.mjs'),config:{}}))
await check('serializable-data',()=>assert.deepEqual(JSON.parse(JSON.stringify(make())),make()))
await check('frozen-input-unchanged',()=>{const input=Object.freeze({...base});const before=JSON.stringify(input);make(input);assert.equal(JSON.stringify(input),before)})
await check('fresh-owned-return-data',()=>{const first=make();first.manifest.dsh.profile.bundles.push('changed');first.patch[0].insert[4].config.agents.push('changed');first.patch[0].insert[11].config.retryPolicy.maxRetries=8;assert.deepEqual(make(),make({...base}));assert.deepEqual(make().manifest.dsh.profile.bundles,[]);assert.deepEqual(rows()[4].config.agents,[]);assert.equal(rows()[11].config.retryPolicy.maxRetries,0)})
await check('unicode-spaces-and-verbatim-bindings',()=>{const input={...base,profileRoot:'d:\\DevData\\求职 工作台\\profiles\\dev',cwd:'D:\\DevData\\产品 空间',contractPath:'D:/DevData/原始 合同.json',jobPath:'d:\\DevData\\原始 任务.json',contractDigest:'sha256:'+'c'.repeat(64),jobDigest:'sha256:'+'d'.repeat(64)};const r=make(input).patch[0].insert;assert.equal(r[7].config.root,input.profileRoot+'/sessions');assert.deepEqual(r[12].config,{developmentRoot:input.profileRoot,contractPath:input.contractPath,contractDigest:input.contractDigest});assert.deepEqual(r[13].config,{jobPath:input.jobPath,jobDigest:input.jobDigest});assert.equal(r[8].config.cwd,input.cwd)})
await check('trailing-separator-session-derivation',()=>{for(const suffix of ['/','\\','//'])assert.equal(make({...base,profileRoot:base.profileRoot+suffix}).patch[0].insert[7].config.root,base.profileRoot+'/sessions')})
await check('reject-nonplain-options',()=>{for(const value of [null,[],0,'text',Object.create({profileRoot:base.profileRoot}),new Date()])assert.throws(()=>make(value))})
await check('reject-missing-and-extra-fields',()=>{for(const key of Object.keys(base)){const input={...base};delete input[key];assert.throws(()=>make(input))}for(const key of ['consent','isolated','agents','provider','retryPolicy','extra'])assert.throws(()=>make({...base,[key]:true}))})
await check('reject-invalid-paths',()=>{for(const key of ['profileRoot','cwd','contractPath','jobPath'])for(const value of [null,0,'','relative/file','C:/DevData/file','D:relative','/tmp/file','\\\\server\\share\\file','D:/bad\u0000file'])assert.throws(()=>make({...base,[key]:value}))})
await check('reject-invalid-digests',()=>{for(const key of ['contractDigest','jobDigest'])for(const value of [null,0,'','a'.repeat(64),'sha256:'+'A'.repeat(64),'sha256:'+'a'.repeat(63),'sha256:'+'a'.repeat(65)])assert.throws(()=>make({...base,[key]:value}))})
process.stdout.write(JSON.stringify({passed}))
