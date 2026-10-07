import assert from 'node:assert/strict'
import {writeFileSync,appendFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
export const name='native-analysis-exit-control'
export const inject=['appExit','llm','agents','sessions','sessionPersistence','subagents']
export async function apply(ctx,config){
 const trace=(phase,extra={})=>appendFileSync(config.trace,JSON.stringify({phase,...extra})+'\n')
 trace('control-apply')
 ctx.on('app/before-exit',()=>trace('before-exit'))
 ctx.effect(()=>()=>trace('control-dispose'))
 const runtime=await import(pathToFileURL(config.repo+'/packages/tianwen-runtime-bundle/dist/runtime.js').href)
 const {installDevelopmentNativeBatchBudget}=await import(pathToFileURL(config.repo+'/scripts/development-native-batch-budget.mjs').href)
 const {installDevelopmentNativeAnalysisShutdown}=await import(pathToFileURL(config.repo+'/scripts/development-native-analysis-shutdown.mjs').href)
 let models=0;ctx.on('llm/stream',async function*(){models++;trace('forbidden-model',{models});throw new Error('Zero-model exit control forbids provider requests')})
 await runtime.applyDevelopment(ctx,{developmentRoot:config.root})
 ctx.inject(['tianwenEvolution','tianwenConversationGuidanceLoop','agents','sessions'],async local=>{
  trace('native-services-ready')
  await local.tianwenConversationGuidanceLoop.whenIdle()
  trace('native-idle')
  const e=local.tianwenEvolution,study=e.listConversationGuidanceStudies()[0]
  assert(study?.activation&&!study.rollback);assert.equal(local.agents.list().length,0)
  const controller=new AbortController(),started=Date.now()
  const peer=await import(pathToFileURL(config.repo+'/packages/tianwen-dsh-compat/dist/runtime.js').href)
  trace('exit-parent-create')
  const parent=await local.agents.create({sessionId:peer.SessionId('native-cli-exit-parent'),meta:{cwd:config.cwd},
    agentOptions:{provider:'tianwen-probe',model:'scripted'},setup(owner){owner.tools.presentAs('native');owner.tools.restrict({allow:[]})}})
  trace('exit-parent-created')
  installDevelopmentNativeAnalysisShutdown(local,{controller,priorStudyIds:[],
   parent,
   onSettled:receipt=>{
    trace('withdrawal-settled',{receipt})
    const actual=e.listConversationGuidanceStudies()[0];assert.equal(actual.rollback?.reason,'consent-disabled');assert.equal(models,0)
    writeFileSync(config.receipt,JSON.stringify({originalCLI:true,models,rollback:actual.rollback,receipt,shutdownMs:Date.now()-started},null,2),{flag:'wx'})
   }})
  installDevelopmentNativeBatchBudget(local,{controller,timeoutMs:20})
  trace('budget-installed')
 })
}
