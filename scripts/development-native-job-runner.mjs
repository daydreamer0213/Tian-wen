export const name='tianwen-development-native-job-runner'
export const inject=['tianwenDevelopmentNativeTaskJob']

/** Original job settlement and receipt only; no Task or learning writes here. */
export async function runDevelopmentNativeJobRunner(options) {
 if(options===null||typeof options!=='object')throw new TypeError('DEV runner options are required')
 const {job,signal,stdout,stderr,exit}=options
 // Validate the native signal without treating a valid pre-abort as bad input.
 Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal)
 if(typeof job?.run!=='function'||typeof stdout!=='function'||typeof stderr!=='function'||typeof exit!=='function')
  throw new TypeError('DEV runner requires the original job and output/exit callbacks')
 let exitCode,result,outputError
 try{
  AbortSignal.prototype.throwIfAborted.call(signal)
  result=await job.run(signal)
  stdout(JSON.stringify(result)+'\n')
  const summary=result?.summary
  exitCode=summary?.completionStatus==='failed'||summary?.functionalStatus==='rejected'||summary?.reviewVerdict==='unmet'?1
   :summary?.completionStatus==='completed'&&summary?.functionalCandidateVerified===true&&summary?.reviewVerdict==='met'?0:2
 }catch(error){
  exitCode=1;result=null
  try{stderr(JSON.stringify({error:{name:error.name,message:error.message}})+'\n')}
  catch(error){outputError=error}
 }
 // Keep exit outside the job/IO catch: an exit failure must not trigger it again.
 await exit(exitCode)
 if(outputError!==undefined)throw outputError
 return {exitCode,result}
}

/** Explicit host runner. Loading the separate job service remains inert. */
export function apply(ctx,config) {
 if(config===null||typeof config!=='object'||Array.isArray(config)||Object.keys(config).length!==0)
  throw new TypeError('DEV job runner accepts only empty config')
 const exit=ctx.get('appExit'),job=ctx.tianwenDevelopmentNativeTaskJob
 if(typeof exit!=='function'||typeof job?.run!=='function'||typeof ctx.effect!=='function'||typeof ctx.on!=='function')
  throw new TypeError('DEV job runner requires original appExit, job and Context disposal')
 const controller=new AbortController()
 const timer=setTimeout(()=>controller.abort(new Error('original eight-minute task budget')),480000)
 let settlement,settled=false,cleanupPromise
 // Register cancellation synchronously. Await only the original job, never the
 // outer runner whose exit calls this cleanup (which would wait on itself).
 const off=ctx.effect(()=>async()=>{
  clearTimeout(timer)
  if(!settled)controller.abort(new Error('DEV job runner disposed'))
  if(settlement)await settlement.catch(()=>{})
 })
 const cleanup=()=>cleanupPromise??=Promise.resolve(off()).finally(()=>offBeforeExit())
 // The original CLI waits this hook before unloading its whole tree. Keep
 // injected services and the original session alive until the archive seals.
 const offBeforeExit=ctx.on('app/before-exit',()=>cleanup())
 runDevelopmentNativeJobRunner({job:{run(signal){
  settlement=Promise.resolve().then(()=>job.run(signal)).finally(()=>{settled=true})
  return settlement
 }},signal:controller.signal,
  stdout:text=>process.stdout.write(text),stderr:text=>process.stderr.write(text),
  exit:async code=>{await cleanup();await exit(code)},
 }).catch(async error=>{await cleanup();ctx.logger?.warn('DEV job runner terminal output unavailable: %s',error.message)})
}
