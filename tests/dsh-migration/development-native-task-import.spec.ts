import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('imports the existing native task runner in ordinary Node and consumes published cancellation',()=>{
 const repo=fileURLToPath(new URL('../../',import.meta.url))
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict'
  const {runDevelopmentNativeTask}=await import('./scripts/development-native-task.mjs')
  const {withConversationObservationCancellation:cancel}=await import('./packages/tianwen-runtime-bundle/dist/runtime.js')
  assert.equal(typeof runDevelopmentNativeTask,'function')
  assert.equal(typeof cancel,'function')
  const active=new AbortController();let calls=0
  assert.equal(await cancel(active.signal,async()=>{calls++;return 42}),42)
  assert.equal(calls,1)
  const stopped=new AbortController();stopped.abort()
  await assert.rejects(cancel(stopped.signal,async()=>{calls++}))
  assert.equal(calls,1)
  const during=new AbortController()
  let markStarted;let entered=0
  const started=new Promise(resolve=>{markStarted=resolve})
  const pending=cancel(during.signal,()=>{entered++;markStarted();return new Promise(()=>{})})
  await started;assert.equal(entered,1);during.abort()
  await assert.rejects(pending,/external check cancelled/)
  console.log(JSON.stringify({ordinaryNode:true,modelRequests:0,publishedCancellation:true}))
 `],{cwd:repo,encoding:'utf8',timeout:15000})
 expect(child.error).toBeUndefined()
 expect(child.status,child.stderr).toBe(0)
 expect(JSON.parse(child.stdout.trim())).toEqual({ordinaryNode:true,modelRequests:0,publishedCancellation:true})
})
