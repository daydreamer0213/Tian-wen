import assert from 'node:assert/strict'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import { closedDevelopmentData, outsideDevelopmentWorkspace, readPinnedDevelopmentJson } from './development-native-runtime.mjs'
import { loadDevelopmentNativeModules, runDevelopmentNativeTask } from './development-native-task.mjs'

const {createDevelopmentNativeFilePolicy}=await loadDevelopmentNativeModules()
const key=path=>resolve(path).toLowerCase()
export const name='tianwen-development-native-task-job'
export const inject=['tianwenDevelopmentRuntimeContracts','tianwenEvolution','tianwenConversationObserver',
 'tianwenConversationFileObserver','tianwenConversationGuidanceLoop','agents','tools','llm','sessionPersistence']

/** Frozen job data only; no signal, callback, Runtime flags or executable JSON. */
export function loadDevelopmentNativeTaskJob(config) {
 closedDevelopmentData(config,['jobPath','jobDigest'])
 const job=readPinnedDevelopmentJson(config.jobPath,config.jobDigest)
 closedDevelopmentData(job,['schemaVersion','cwd','sessionId','requestText','outputPaths','referencePaths',
  'maxTargetBytes','resultRoot','callConfig'],['maxArchiveBytes'])
 assert.equal(job.schemaVersion,'tianwen.development-native-job.v1')
 assert(typeof job.requestText==='string'&&job.requestText.trim(),'DEV job request must be non-blank')
 outsideDevelopmentWorkspace(config.jobPath,job.cwd)
 assert(typeof job.resultRoot==='string'&&isAbsolute(job.resultRoot),'DEV archive root must be absolute')
 const root=resolve(job.resultRoot),parent=dirname(root)
 assert(key(root).startsWith(key('D:/DevData')+'\\')&&lstatSync(parent).isDirectory()&&key(realpathSync(parent))===key(parent),'DEV archive parent must be its canonical D directory')
 try {
  const stat=lstatSync(root)
  assert(stat.isDirectory()&&!stat.isSymbolicLink()&&key(realpathSync(root))===key(root),'DEV archive root must be an original directory')
 } catch(error) {if(error.code!=='ENOENT')throw error}
 outsideDevelopmentWorkspace(root,job.cwd)
 assert(job.callConfig!==null&&typeof job.callConfig==='object'&&!Array.isArray(job.callConfig),'DEV job requires original call config data')
 if(job.maxArchiveBytes!==undefined)assert(Number.isSafeInteger(job.maxArchiveBytes)&&job.maxArchiveBytes>0,'DEV archive budget must be a positive safe integer')
 // Original policy validates the declaration and target budget. This read-only
 // constructor does not install guards or certify a completed preparation.
 createDevelopmentNativeFilePolicy(job,()=>null)
 return job
}
function freeze(value) {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
class DevelopmentNativeTaskJob extends Service {
 static inject=inject
 constructor(ctx,job) {super(ctx,'tianwenDevelopmentNativeTaskJob');Object.defineProperty(this,'job',{value:freeze(structuredClone(job))})}
 async run(signal) {
  AbortSignal.prototype.throwIfAborted.call(signal)
  const ctx=this.ctx,{schemaVersion,...job}=structuredClone(this.job)
  assert(ctx.tianwenDevelopmentRuntimeContracts.matches(job),'DEV job differs from its mounted original contract')
  return runDevelopmentNativeTask(ctx,{...job,signal,isPrepared:()=>ctx.tianwenEvolution.listConversationTasks(job.sessionId)
   .some(task=>task.externalCheckPrepared!==undefined)})
 }
}
/** Loading prepares a data-bound entry; the caller explicitly runs and owns it. */
export function apply(ctx,config) {
 const job=loadDevelopmentNativeTaskJob(config)
 assert(ctx.tianwenDevelopmentRuntimeContracts.matches(job),'DEV job differs from its mounted original contract')
 ctx.plugin(DevelopmentNativeTaskJob,job)
}
