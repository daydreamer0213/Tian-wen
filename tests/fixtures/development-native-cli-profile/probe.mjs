import {writeFileSync} from 'node:fs'
import {requests} from './monitor.mjs'
export const inject=['tianwenEvolution','tianwenConversationObserver','tianwenConversationGuidanceLoop','tianwenDevelopmentRuntimeContracts']
export function apply(ctx,config){
 writeFileSync(config.receipt,JSON.stringify({engineeringOnly:true,baseUrl:ctx.baseUrl,
  quarantine:ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined(),
  tasks:ctx.tianwenEvolution.listConversationTasks().length,studies:ctx.tianwenEvolution.listConversationGuidanceStudies().length,
  consent:ctx.tianwenEvolution.getLearningAnalysisConsent()??null,requests:requests(),
  originalOrdinaryCheck:typeof ctx.tianwenConversationObserver.config.externalCodeCheck.prepare==='function',
  originalStudyCheck:typeof ctx.tianwenConversationGuidanceLoop.studyResultCheck.prepareIndependentCases==='function',
  originalContracts:ctx.tianwenDevelopmentRuntimeContracts.contracts.length,
 }))
 ctx.get('appExit')(0)
}
