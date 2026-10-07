import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {expect,it} from 'vitest'
import {developmentStudyResultFixture} from '../../scripts/test-fixtures/development-study-result-host.mjs'

const repo=resolve('.'),base=resolve('D:/DevData/tianwen-development-runtime'),evidence='D:/DevData/tianwen-dev-cli-entry-20261004'
const bundle=createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json',import.meta.url))
const cli=createRequire(bundle.resolve('@deepseek-ai/dsh/package.json')),dsh=dirname(cli.resolve('@deepseek-ai/dsh/package.json'))
const digest=(bytes:Buffer|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const ledgers=['D:/DevData/tianwen-development-runtime/continuous-project-20261004/evolution/ledger.jsonl','D:/DevData/tianwen-development-learning-20261001/evolution/ledger.jsonl']
mkdirSync(base,{recursive:true});mkdirSync(evidence,{recursive:true})
it('the original CLI mounts the published DEV Runtime in its dedicated real Profile without a Task or request',()=>{
 const home=mkdtempSync(base+'/cli-profile-test-'),profile=home+'/profiles/owned-dev',packetRoot=mkdtempSync(evidence+'/cli-packet-')
 const receipt=packetRoot+'/receipt.json',contractPath=packetRoot+'/contracts.json',before=ledgers.map(p=>digest(readFileSync(p)))
 mkdirSync(profile+'/workspace',{recursive:true})
 const f=developmentStudyResultFixture(profile+'/workspace'),packet={schemaVersion:'tianwen.development-native-contracts.v1',ordinaryContract:f.ordinary(1),studyContracts:f.config}
 const bytes=JSON.stringify(packet);writeFileSync(contractPath,bytes)
 const rows:any[]=[{id:'request-monitor',name:pathToFileURL(repo+'/tests/fixtures/development-native-cli-profile/monitor.mjs').href}]
 for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-agent','@deepseek-ai/dsh-agent-loop','@deepseek-ai/dsh-subagent'])
  rows.push({id:name.split('/').at(-1),name,config:name.endsWith('agent-loop')?{agents:[]}:{}})
 rows.push({id:'session-persistence',name:pathToFileURL(bundle.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href,config:{root:profile+'/sessions',compression:'none'}},
  {id:'development-runtime',name:pathToFileURL(repo+'/scripts/development-native-runtime.mjs').href,config:{developmentRoot:profile,contractPath,contractDigest:digest(bytes)}},
  {id:'owned-probe',name:pathToFileURL(repo+'/tests/fixtures/development-native-cli-profile/probe.mjs').href,config:{receipt}})
 writeFileSync(profile+'/package.json',JSON.stringify({name:'owned-dev',version:'0.0.0',private:true,dsh:{profile:{bundles:[]}}}))
 writeFileSync(profile+'/cordis.patch.yml',JSON.stringify([{insert:rows}]))
 try{
  const run=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',dsh+'/lib/bin.js','--profile','owned-dev'],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'}})
  writeFileSync(packetRoot+'/cli-result.json',JSON.stringify({status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr}))
  expect(run.error,run.stderr).toBeUndefined();expect(run.status,run.stderr).toBe(0)
  const result=JSON.parse(readFileSync(receipt,'utf8'))
  // The original Loader appends '/' to directory URLs; compare the actual
  // directory identity instead of imposing a different URL serialization.
  expect(resolve(fileURLToPath(result.baseUrl)).toLowerCase()).toBe(resolve(profile).toLowerCase())
  expect(result).toMatchObject({quarantine:false,tasks:0,studies:0,consent:null,requests:0,originalOrdinaryCheck:true,originalStudyCheck:true,originalContracts:1})
  expect(ledgers.map(p=>digest(readFileSync(p)))).toEqual(before)
  writeFileSync(packetRoot+'/result.json',JSON.stringify({engineeringOnly:true,originalCLI:true,publishedRuntime:true,ownCanonicalProfile:true,zeroRequests:true,businessLedgersUnchanged:true}))
 }finally{
  expect(realpathSync(home).toLowerCase()).toBe(resolve(home).toLowerCase());expect(dirname(resolve(home))).toBe(base)
  rmSync(home,{recursive:true})
 }
},300000)
