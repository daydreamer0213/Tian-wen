import {writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
export async function apply(ctx,config) {
 const trace=[];let live=true
 const save=()=>writeFileSync(config.receipt,JSON.stringify({engineeringOnly:true,trace,live}))
 ctx.effect(()=>()=>{trace.push('resource-dispose');live=false;save()})
 ctx.provide('tianwenDevelopmentNativeTaskJob',{async run(signal){
  trace.push('job-start');save()
  setTimeout(()=>process.emit(config.signal),10)
  await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))
  trace.push('job-cancel')
  await new Promise(resolve=>setTimeout(resolve,30))
  trace.push(live?'job-archive-live':'job-archive-resource-gone');save()
  throw new Error('owned cancelled job')
 }})
 await ctx.loader.create({name:pathToFileURL(config.runner).href,config:{}})
}
