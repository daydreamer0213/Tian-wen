import {writeFileSync} from 'node:fs'
import {requests} from './monitor.mjs'
export const inject=['tianwenEvolution','tianwenDevelopmentRuntimeContracts','tianwenDevelopmentNativeTaskJob','llm','tools','sessionPersistence']
export async function apply(ctx,config){
 const job=ctx.tianwenDevelopmentNativeTaskJob
 const call=await ctx.llm.resolveCallConfig(job.job.callConfig)
 writeFileSync(config.receipt,JSON.stringify({engineeringOnly:true,baseUrl:ctx.baseUrl,
  tasks:ctx.tianwenEvolution.listConversationTasks().length,
  studies:ctx.tianwenEvolution.listConversationGuidanceStudies().length,
  consent:ctx.tianwenEvolution.getLearningAnalysisConsent()??null,
  requests:requests(),jobReady:typeof job.run==='function',job:job.job,callConfig:call,
  originalContracts:ctx.tianwenDevelopmentRuntimeContracts.contracts.length,
  jobMatches:ctx.tianwenDevelopmentRuntimeContracts.matches(job.job),
 }))
 ctx.get('appExit')(0)
}
