import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {expect,it} from 'vitest'
import {createDevelopmentNativeCliProfileData} from '../../scripts/development-native-cli-profile-data.mjs'

const repo=resolve('.'),base=resolve('D:/DevData/tianwen-development-runtime')
const evidence='D:/DevData/tianwen-live-cli-profile-data-final-20261004'
const bundle=createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json',import.meta.url))
const cli=createRequire(bundle.resolve('@deepseek-ai/dsh/package.json')),dsh=dirname(cli.resolve('@deepseek-ai/dsh/package.json'))
const digest=(bytes:Buffer|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const ledgers=['D:/DevData/tianwen-development-runtime/continuous-project-20261004/evolution/ledger.jsonl','D:/DevData/tianwen-development-learning-20261001/evolution/ledger.jsonl']
it('the delivered data factory cold loads its original CLI services and pinned inert job',()=>{
 const home=mkdtempSync(base+'/cli-data-consumer-'),profile=home+'/profiles/owned-data'
 const packetRoot=mkdtempSync(evidence+'/cli-consumer-'),receipt=packetRoot+'/receipt.json'
 const contractPath=packetRoot+'/contracts.json',jobPath=packetRoot+'/job.json'
 const before=ledgers.map(p=>digest(readFileSync(p)))
 mkdirSync(profile,{recursive:true})
 // Reuse the exact frozen ordinary/study data, never manufacture another cohort.
 const contractBytes=readFileSync(evidence+'/contracts.json')
 const job={...JSON.parse(readFileSync(evidence+'/job.json','utf8')),sessionId:'engineering-cli-data-inert-20261004',resultRoot:packetRoot+'/attempt'}
 const jobBytes=JSON.stringify(job);writeFileSync(contractPath,contractBytes);writeFileSync(jobPath,jobBytes)
 const data=createDevelopmentNativeCliProfileData({profileRoot:profile,cwd:repo,contractPath,contractDigest:digest(contractBytes),jobPath,jobDigest:digest(jobBytes)})
 // Explicitly do not mount the execution row: this is a cold consumer control,
 // not another attempt at the natural task or proof of whole CLI execution.
 const rows=data.patch[0].insert.filter((row:any)=>row.id!=='native-job-runner')
 const patch=[{insert:[{id:'request-monitor',name:pathToFileURL(repo+'/tests/fixtures/development-native-cli-profile/monitor.mjs').href},...rows,
  {id:'owned-probe',name:pathToFileURL(repo+'/tests/fixtures/development-native-cli-profile/probe-profile-data.mjs').href,config:{receipt}}]}]
 writeFileSync(profile+'/package.json',JSON.stringify(data.manifest))
 writeFileSync(profile+'/cordis.patch.yml',JSON.stringify(patch))
 try{
  const run=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',dsh+'/lib/bin.js','--profile','owned-data'],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'}})
  writeFileSync(packetRoot+'/cli-result.json',JSON.stringify({status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr}))
  expect(run.error,run.stderr).toBeUndefined();expect(run.status,run.stderr).toBe(0)
  const result=JSON.parse(readFileSync(receipt,'utf8'))
  expect(resolve(fileURLToPath(result.baseUrl)).toLowerCase()).toBe(resolve(profile).toLowerCase())
  expect(result).toMatchObject({tasks:0,studies:0,consent:null,requests:0,jobReady:true,jobMatches:true,originalContracts:1})
  expect(result.job).toEqual(job);expect(result.callConfig).toEqual(job.callConfig)
  expect(ledgers.map(p=>digest(readFileSync(p)))).toEqual(before)
  writeFileSync(packetRoot+'/result.json',JSON.stringify({engineeringOnly:true,deliveredFactory:true,originalCLI:true,inertJobReady:true,runnerMounted:false,requests:0,businessLedgersUnchanged:true}))
 }finally{
  expect(realpathSync(home).toLowerCase()).toBe(resolve(home).toLowerCase());expect(dirname(resolve(home))).toBe(base)
  rmSync(home,{recursive:true})
 }
},180000)
