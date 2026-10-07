import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { TianwenRuntimeBundleConfig } from './runtime.js'

export interface TianwenDevelopmentRuntimeConfig extends TianwenRuntimeBundleConfig {
  readonly guidanceDecisionPolicy?: 'dev-paired-any-case.v1' | 'dev-conclusive-pair.v1'
  /** Trusted Windows DEV directory or original CLI Profile under a dedicated D home. */
  readonly developmentRoot: string
}
const key=(path:string)=>resolve(path).toLowerCase()
/** Read-only directory identity shared by DEV hosts; no permissions or mounts. */
export function resolveDevelopmentRuntimeRoot(value:unknown):string {
  const fail=():never=>{throw new Error('Development Runtime requires its separate canonical D root and original derived state/sessions/evolution paths')}
  if(process.platform!=='win32'||typeof value!=='string'||!isAbsolute(value))return fail()
  const root=resolve(value),base=resolve('D:/DevData/tianwen-development-runtime'),profiles=dirname(root),home=dirname(profiles)
  const direct=key(profiles)===key(base)
  const cli=basename(profiles)==='profiles'&&key(dirname(home))===key(base)&&basename(root).toLowerCase()!=='node_modules'
  if(!direct&&!cli)return fail()
  for(const path of cli?[home,profiles,root]:[root]) {
    if(!existsSync(path)||!lstatSync(path).isDirectory()||lstatSync(path).isSymbolicLink()||key(realpathSync(path))!==key(path))return fail()
  }
  return root
}
/** No writes or mounts: reject formal Profiles and redirected roots first. */
export function developmentRuntimeConfig(baseUrl:string|undefined,config:TianwenDevelopmentRuntimeConfig,sessionPersistence:unknown):TianwenRuntimeBundleConfig {
  const fail=()=>{throw new Error('Development Runtime requires its separate canonical D root and original derived state/sessions/evolution paths')}
  const root=resolveDevelopmentRuntimeRoot(config.developmentRoot)
  try{if(baseUrl===undefined||key(fileURLToPath(baseUrl))!==key(root))return fail()}catch{return fail()}
  if(Object.hasOwn(config,'guidanceDecisionPolicy')&&config.guidanceDecisionPolicy!=='dev-paired-any-case.v1'&&config.guidanceDecisionPolicy!=='dev-conclusive-pair.v1') {
    throw new Error('Development Runtime guidance decision policy is invalid')
  }
  const {developmentRoot:_root,guidanceDecisionPolicy:_policy,...rest}=config
  const paths={stateRoot:join(root,'state'),sessionsRoot:join(root,'sessions'),evolutionRoot:join(root,'evolution')}
  for(const [name,path] of Object.entries(paths)) {
    const supplied=config[name as keyof typeof paths]
    if(supplied!==undefined&&(typeof supplied!=='string'||!isAbsolute(supplied)||key(supplied)!==key(path)))return fail()
    if(existsSync(path)&&(!lstatSync(path).isDirectory()||key(realpathSync(path))!==key(path)))return fail()
  }
  // Use the existing backend's public, side-effect-free locator. A config object
  // may be edited after its constructor has already frozen another physical root.
  if(!(sessionPersistence instanceof JsonlSessionPersistence)||key(sessionPersistence.config.root)!==key(paths.sessionsRoot)) {
    throw new Error('Development Runtime requires the original JSONL session backend under its derived sessions root')
  }
  const location=sessionPersistence.locate({version:SESSION_FORMAT_VERSION,id:SessionId('tianwen-development-boundary'),createdAt:0})
  if(location.kind!=='jsonl'||!key(location.path).startsWith(key(paths.sessionsRoot)+'\\')) {
    throw new Error('Development Runtime session backend physical storage differs from its derived sessions root')
  }
  return {...rest,...paths}
}
