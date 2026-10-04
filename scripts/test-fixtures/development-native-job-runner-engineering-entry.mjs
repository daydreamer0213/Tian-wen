import assert from 'node:assert/strict'
import * as module from '../development-native-job-runner.mjs'

// Separate engineering checks: corrected public Cordis effect lifecycle.
// Original natural-task acceptance remains immutable and is not regraded.
const passed=[]
const check=async(name,fn)=>{await fn();passed.push(name)}
const good={summary:{taskId:'original-task',completionStatus:'completed',functionalStatus:'verified',reviewVerdict:'met',permissionSetExact:true,functionalCandidateVerified:true},requests:{observed:3,forwarded:3,rootForwarded:2}}
const row=async(result=good,options={})=>{
 const calls=[],signal=options.signal??new AbortController().signal
 const job={async run(actual){assert.equal(this,job);calls.push(['run',actual]);if(options.error)throw options.error;return result}}
 const output=[],errors=[],exits=[]
 const receipt=await module.runDevelopmentNativeJobRunner({job,signal,stdout:text=>output.push(text),stderr:text=>errors.push(text),exit:code=>exits.push(code)})
 return {calls,signal,output,errors,exits,receipt}
}
await check('plugin-metadata',async()=>{assert.equal(module.name,'tianwen-development-native-job-runner');assert.deepEqual(module.inject,['tianwenDevelopmentNativeTaskJob'])})
await check('one-original-run-and-original-signal',async()=>{const r=await row();assert.deepEqual(r.calls,[['run',r.signal]])})
await check('exact-original-json-and-object',async()=>{const r=await row();assert.deepEqual(r.output,[JSON.stringify(good)+'\n']);assert.deepEqual(r.errors,[]);assert.equal(r.receipt.result,good);assert.deepEqual(r.exits,[0]);assert.equal(r.receipt.exitCode,0)})
await check('completion-failed',async()=>{const r=await row({...good,summary:{...good.summary,completionStatus:'failed'}});assert.deepEqual(r.exits,[1])})
await check('functional-rejected',async()=>{const r=await row({...good,summary:{...good.summary,functionalStatus:'rejected',functionalCandidateVerified:false}});assert.deepEqual(r.exits,[1])})
await check('review-unmet',async()=>{const r=await row({...good,summary:{...good.summary,reviewVerdict:'unmet'}});assert.deepEqual(r.exits,[1])})
await check('review-inconclusive',async()=>{const r=await row({...good,summary:{...good.summary,reviewVerdict:'inconclusive'}});assert.deepEqual(r.exits,[2])})
await check('program-unverifiable',async()=>{const r=await row({...good,summary:{...good.summary,functionalStatus:'unverifiable',functionalCandidateVerified:false}});assert.deepEqual(r.exits,[2])})
await check('strict-candidate-verified',async()=>{const r=await row({...good,summary:{...good.summary,functionalCandidateVerified:'yes'}});assert.deepEqual(r.exits,[2])})
await check('original-rejection-once',async()=>{const error=new Error('original archive failure'),r=await row(good,{error});assert.equal(r.calls.length,1);assert.deepEqual(r.output,[]);assert.deepEqual(r.errors,[JSON.stringify({error:{name:error.name,message:error.message}})+'\n']);assert.deepEqual(r.exits,[1]);assert.deepEqual(r.receipt,{exitCode:1,result:null})})
await check('pre-cancel-no-job',async()=>{const c=new AbortController();c.abort(new Error('operator cancelled'));const r=await row(good,{signal:c.signal});assert.deepEqual(r.calls,[]);assert.deepEqual(r.exits,[1]);assert.deepEqual(r.output,[])})
await check('wait-original-settlement',async()=>{let release,exited=false,wrote=false;const signal=new AbortController().signal,result=module.runDevelopmentNativeJobRunner({job:{run:actual=>{assert.equal(actual,signal);return new Promise(r=>release=r)}},signal,stdout:()=>wrote=true,stderr:()=>{},exit:()=>exited=true});await Promise.resolve();assert.equal(wrote,false);assert.equal(exited,false);release(good);await result;assert.equal(wrote,true);assert.equal(exited,true)})
await check('exit-error-no-second-exit',async()=>{let exits=0;const error=new Error('exit failed');await assert.rejects(module.runDevelopmentNativeJobRunner({job:{run:async()=>good},signal:new AbortController().signal,stdout:()=>{},stderr:()=>{},exit:()=>{exits++;throw error}}),e=>e===error);assert.equal(exits,1)})
await check('stdout-error-no-job-retry',async()=>{let calls=0;const errors=[],exits=[],error=new Error('stdout failed');const r=await module.runDevelopmentNativeJobRunner({job:{run:async()=>{calls++;return good}},signal:new AbortController().signal,stdout:()=>{throw error},stderr:text=>errors.push(text),exit:code=>exits.push(code)});assert.equal(calls,1);assert.deepEqual(errors,[JSON.stringify({error:{name:error.name,message:error.message}})+'\n']);assert.deepEqual(exits,[1]);assert.deepEqual(r,{exitCode:1,result:null})})
await check('stderr-error-still-one-exit',async()=>{let calls=0;const exits=[],error=new Error('stderr failed');await assert.rejects(module.runDevelopmentNativeJobRunner({job:{run:async()=>{calls++;throw new Error('original failure')}},signal:new AbortController().signal,stdout:()=>{throw Error('must not write')},stderr:()=>{throw error},exit:code=>exits.push(code)}),e=>e===error);assert.equal(calls,1);assert.deepEqual(exits,[1])})
await check('invalid-options-before-effects',async()=>{for(const change of [{signal:{}},{job:{}},{stdout:null},{stderr:0},{exit:'invalid'}]){let effects=0;await assert.rejects(async()=>module.runDevelopmentNativeJobRunner({...{job:{run:async()=>{effects++;return good}},signal:new AbortController().signal,stdout:()=>effects++,stderr:()=>effects++,exit:()=>effects++},...change}));assert.equal(effects,0)}})

async function pluginScene(mode){
 const original={setTimeout,clearTimeout,stdout:process.stdout.write,stderr:process.stderr.write}
 const trace=[],out=[],err=[];let disposer,signal,release,finish
 const finished=new Promise(r=>finish=r),timer={id:'owned-only'}
 globalThis.setTimeout=(callback,delay)=>{trace.push(['timer',delay]);timer.callback=callback;return timer}
 globalThis.clearTimeout=actual=>{assert.equal(actual,timer);trace.push(['clear'])}
 process.stdout.write=text=>{out.push(text);return true};process.stderr.write=text=>{err.push(text);return true}
 const ctx={get:name=>name==='appExit'?(code=>{trace.push(['exit',code]);finish(code)}):undefined,
  effect:setup=>{const dispose=setup();trace.push(['listen']);let called=false;disposer=()=>{if(called)return;called=true;trace.push(['off']);return dispose()};return disposer},
  tianwenDevelopmentNativeTaskJob:{run(actual){assert.equal(this,ctx.tianwenDevelopmentNativeTaskJob);signal=actual;trace.push(['run']);return new Promise((resolve,reject)=>{release=()=>resolve(good);actual.addEventListener('abort',()=>{trace.push(['cancel']);release=()=>reject(new Error('original cancellation settled'))},{once:true})})}}
 }
 try{
  const value=module.apply(ctx,{});assert.equal(value,undefined)
  for(let i=0;i<4;i++)await Promise.resolve();assert.equal(trace.filter(x=>x[0]==='run').length,1);assert.equal(signal instanceof AbortSignal,true)
  assert.deepEqual(trace.filter(x=>x[0]==='timer'),[['timer',480000]])
  let disposal;if(mode==='dispose')disposal=disposer();if(mode==='timeout')timer.callback()
  if(mode!=='normal'){assert.equal(signal.aborted,true);assert.equal(trace.some(x=>x[0]==='exit'),false)}
  release();if(disposal)await disposal;const code=await finished;await Promise.resolve();await Promise.resolve()
  assert.equal(code,mode==='normal'?0:1);assert.equal(trace.filter(x=>x[0]==='run').length,1);assert.equal(trace.filter(x=>x[0]==='exit').length,1)
  assert.equal(trace.filter(x=>x[0]==='clear').length,1);assert.equal(trace.filter(x=>x[0]==='off').length,1)
  const at=trace.findIndex(x=>x[0]==='exit');assert(trace.findIndex(x=>x[0]==='clear')<at);assert(trace.findIndex(x=>x[0]==='off')<at)
  if(mode==='normal'){assert.deepEqual(out,[JSON.stringify(good)+'\n']);assert.deepEqual(err,[])}else{assert.deepEqual(out,[]);assert.equal(JSON.parse(err[0]).error.message,'original cancellation settled')}
 }finally{globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;process.stdout.write=original.stdout;process.stderr.write=original.stderr}
}
await check('plugin-normal-cleanup-before-exit',()=>pluginScene('normal'))
await check('plugin-dispose-waits-cancellation',()=>pluginScene('dispose'))
await check('plugin-timeout-waits-cancellation',()=>pluginScene('timeout'))
await check('plugin-invalid-preflight-no-work',async()=>{for(const config of [null,[],{timeoutMs:1}])assert.throws(()=>module.apply({get:()=>()=>{},tianwenDevelopmentNativeTaskJob:{run:()=>{throw Error('must not run')}}},config));assert.throws(()=>module.apply({get:()=>undefined,tianwenDevelopmentNativeTaskJob:{run:()=>{throw Error('must not run')}}},{}))})
console.log(JSON.stringify({engineeringOnly:true,originalAcceptanceUnchanged:true,passed}))
