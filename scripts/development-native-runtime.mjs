import assert from 'node:assert/strict'
import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import { createDevelopmentNativeCheckOptions } from './development-isolated-node-project-check.mjs'

const packageUrl=new URL('../packages/tianwen-runtime-bundle/package.json',import.meta.url)
const manifest=JSON.parse(readFileSync(packageUrl,'utf8'))
const runtime=await import(new URL(manifest.exports['./runtime'].default,packageUrl).href)
export const name='tianwen-development-native-runtime'
// Upstream Loader owns service readiness; the original DEV boundary requires
// the already mounted original backend, not a replacement constructed here.
export const inject=[...runtime.inject,'sessionPersistence']
const key=path=>resolve(path).toLowerCase()
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const packetMaxBytes=8*1024*1024
export function closedDevelopmentData(value,fields,optional=[]) {
 assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'DEV config must be an object')
 assert(fields.every(field=>Object.hasOwn(value,field))&&Object.keys(value).every(field=>[...fields,...optional].includes(field)),'DEV config has missing or unsupported fields')
}

/** Raw operator bytes; Loader expressions never run on this parsed data. */
export function readPinnedDevelopmentJson(contractPath,contractDigest) {
 assert(process.platform==='win32','DEV loading requires Windows')
 assert(typeof contractPath==='string'&&isAbsolute(contractPath),'DEV contract path must be absolute')
 const path=resolve(contractPath),stat=lstatSync(path)
 assert(key(path).startsWith(key('D:/DevData')+'\\')&&stat.isFile()&&!stat.isSymbolicLink()&&key(realpathSync(path))===key(path),'DEV contract must be an original regular D data file')
 assert(stat.size<=packetMaxBytes,'DEV contract exceeds the loading budget')
 assert(typeof contractDigest==='string'&&/^sha256:[0-9a-f]{64}$/u.test(contractDigest),'DEV contract digest is invalid')
 const bytes=readFileSync(path)
 assert(bytes.length<=packetMaxBytes&&isUtf8(bytes),'DEV contract is oversized or not exact UTF-8')
 assert.equal(hash(bytes),contractDigest,'DEV contract digest mismatch')
 return JSON.parse(bytes.toString('utf8'))
}
export function outsideDevelopmentWorkspace(path,cwd) {
 assert(typeof cwd==='string'&&isAbsolute(cwd),'DEV workspace must be absolute')
 assert(lstatSync(cwd).isDirectory(),'DEV workspace must be an existing directory')
 const child=relative(key(realpathSync(cwd)),key(path))
 assert(child!==''&&(isAbsolute(child)||child==='..'||child.startsWith('..\\')),'DEV operator data must be outside the mutable workspace')
}

/** Transient ownership binding, not a checker, learning event or permission. */
export class DevelopmentNativeRuntimeContracts extends Service {
 static inject=['tianwenEvolution']
 constructor(ctx,contracts) {
  super(ctx,'tianwenDevelopmentRuntimeContracts')
  const frozen=(Array.isArray(contracts)?contracts:[contracts]).map(contract=>Object.freeze({cwd:contract.cwd,requestText:contract.requestText,
   outputPaths:Object.freeze([...contract.outputPaths]),referencePaths:Object.freeze([...(contract.referencePaths??[])])}))
  Object.defineProperty(this,'contracts',{value:Object.freeze(frozen)})
 }
 matches(job) {
  const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length
   &&JSON.stringify([...a].sort())===JSON.stringify([...b].sort())
  return this.contracts.some(contract=>contract.cwd===job?.cwd&&contract.requestText===job?.requestText
   &&same(contract.outputPaths,job.outputPaths)&&same(contract.referencePaths,job.referencePaths))
 }
}

/** Operator-owned JSON becomes only the original fixed-host factory options. */
function readDevelopmentNativeRuntime(config) {
 closedDevelopmentData(config,['developmentRoot','contractPath','contractDigest'],['guidanceDecisionPolicy'])
 if(Object.hasOwn(config,'guidanceDecisionPolicy'))assert.equal(config.guidanceDecisionPolicy,'dev-paired-any-case.v1','DEV guidance decision policy is invalid')
 assert(process.platform==='win32','DEV loading requires Windows')
 const {developmentRoot,contractPath,contractDigest}=config
 const root=runtime.resolveDevelopmentRuntimeRoot(developmentRoot)
 const packet=readPinnedDevelopmentJson(contractPath,contractDigest)
 closedDevelopmentData(packet,['schemaVersion','ordinaryContract','studyContracts'],['goalContract','answerStudyContracts','goalAnswerContracts'])
 assert.equal(packet.schemaVersion,'tianwen.development-native-contracts.v1')
 // The mutable task workspace cannot contain the operator's pinned contract.
 outsideDevelopmentWorkspace(contractPath,packet.studyContracts?.cwd)
 const options=createDevelopmentNativeCheckOptions(packet.ordinaryContract,packet.studyContracts,packet.goalContract,packet.answerStudyContracts,packet.goalAnswerContracts)
 const producer={id:'tianwen.development-native-file-policy.v1',digest:hash(readFileSync(new URL('./development-native-file-policy.mjs',import.meta.url)))}
 return {contracts:packet.ordinaryContract,options:{developmentRoot:root,captureExternalCodeArtifacts:true,exposeCapturedFileFacts:false,...options,
  ...(Object.hasOwn(config,'guidanceDecisionPolicy')?{guidanceDecisionPolicy:config.guidanceDecisionPolicy}:{}),
  conversationReadDenialSources:[producer],conversationFileMutationDenialSources:[producer]}}
}
export function loadDevelopmentNativeRuntimeOptions(config) {return readDevelopmentNativeRuntime(config).options}

/** Normal Cordis plugin: no harness, request, consent, Agent or host shutdown. */
export async function apply(ctx,config) {
 const {options,contracts}=readDevelopmentNativeRuntime(config)
 await runtime.applyDevelopment(ctx,options)
 ctx.plugin(DevelopmentNativeRuntimeContracts,contracts)
}
