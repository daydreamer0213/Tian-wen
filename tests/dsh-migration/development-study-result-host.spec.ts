import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { CallId, SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import type { ConversationExternalCodeCheck, ConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/index.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const packageRequire = createRequire(new URL('../../packages/tianwen-runtime-bundle/package.json', import.meta.url))
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const localFs = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-fs-local')).href)
const presets = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-agent-presets')).href)
const fileToolsPath = cliRequire.resolve('@deepseek-ai/dsh-tool-fs')
const base = 'D:/DevData/tianwen-dev-study-result-host-20261003'
const user = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const structured = (value: Record<string, unknown>) => toolCallResponse('structured', 'structured_output', value)
const reviews = (verdict: 'met' | 'not-met') => [1, 2].map(() => auditedEvidenceResponse({ verdict,
  category: verdict === 'met' ? null : 'instruction-following', explanation: 'Explicit engineering script; no natural feedback or real-model verdict.', evidenceQuotes: ['saved'] }))

it.skipIf(process.env.TIANWEN_DEV_STUDY_RESULT_ISOLATED !== '1')('actual published Runtime consumes the DEV host and refuses a wrong original holdout', async () => {
  const { createDevelopmentNativeCheckOptions } = await import('../../scripts/development-isolated-node-project-check.mjs')
  const { developmentStudyResultFixture } = await import('../../scripts/test-fixtures/development-study-result-host.mjs')
  const { apply: applyBundle } = await import(pathToFileURL(packageRequire.resolve('@tianwen/runtime-bundle/runtime')).href)
  const roots = resolve(base, 'runtime-roots'); mkdirSync(roots, {recursive:true})
  const root = mkdtempSync(join(roots, 'controlled-study-')), f = developmentStudyResultFixture(root)
  const options = createDevelopmentNativeCheckOptions(f.ordinary(1), f.config)
  const ordinary = [options.externalCodeCheck, ...[2,3].map(n => createDevelopmentNativeCheckOptions(f.ordinary(n),f.config).externalCodeCheck)]
  let ordinaryPrepared=0, ordinaryEvaluated=0, supplied=0, prepared=0, evaluated=0
  const externalCodeCheck: ConversationExternalCodeCheck = { async prepare(material) {
    const text=material.request.flatMap(message=>message.content).filter(block=>block.type==='text').map(block=>block.text).join('\n')
    const index=[1,2,3].find(n=>f.original(n).requestText===text)
    if(index===undefined)return undefined
    ordinaryPrepared++
    const check=await ordinary[index-1].prepare(material)
    return check===undefined?undefined:{...check,async evaluate(candidate){ordinaryEvaluated++;return check.evaluate(candidate)}}
  } }
  const studyResultCheck: ConversationStudyResultCheck = { async prepareIndependentCases(material) {
    supplied++;expect(ordinaryPrepared).toBe(3);expect(ordinaryEvaluated).toBe(3)
    const independent=await options.studyResultCheck.prepareIndependentCases(material)
    expect(independent).toEqual({adjacent:{prompt:f.config.adjacent.prompt,criteria:[f.requiredCondition],files:{entries:f.config.adjacent.entries,outputPaths:f.config.adjacent.outputPaths}},
      holdout:{prompt:f.config.holdout.prompt,criteria:[f.requiredCondition],files:{entries:f.config.holdout.entries,outputPaths:f.config.holdout.outputPaths}}})
    return independent
  }, async prepare(material) {
    prepared++;const check=await options.studyResultCheck.prepare(material)
    expect(check).toBeDefined()
    return check===undefined?undefined:{...check,async evaluate(candidate){evaluated++;expect(prepared).toBe(5);return check.evaluate(candidate)}}
  } }
  const script: ScriptEntry[]=[]
  for(const n of [1,2,3])script.push(structured({decision:{kind:'task',objective:`Implement original modules ${n}.`,criteria:[f.requiredCondition],family:'code',evaluationMode:'local-files',fileOutputKind:'files',relatedTaskId:null,feedback:null}}),
    toolCallResponse(`read-entry-${n}`,'read',{file_path:'entry.mjs'}),
    toolCallResponse(`read-left-${n}`,'read',{file_path:`task${n}.mjs`}),toolCallResponse(`read-right-${n}`,'read',{file_path:`extra${n}.mjs`}),
    toolCallResponse(`write-left-${n}`,'write',{file_path:`task${n}.mjs`,content:f.program(n).left}),
    toolCallResponse(`write-right-${n}`,'write',{file_path:`extra${n}.mjs`,content:n<3?'export const right=999;':f.program(n).right}),textResponse('saved'),...reviews('met'))
  const independent=(n:number)=>({prompt:f.independent(n).prompt,criteria:[f.requiredCondition],files:{entries:f.independent(n).entries,outputPaths:f.independent(n).outputPaths}})
  script.push(request=>{
    expect(supplied).toBe(1);expect(prepared).toBe(5);expect(evaluated).toBe(0)
    const text=request.messages.flatMap(message=>message.content).filter(block=>block.type==='text').map(block=>block.text).join('\n')
    expect(text).toContain('independentResultChecksDigest')
    return structured({adjacent:independent(4),holdout:independent(5)})
  },structured({guidance:'Read both original module values and the independent entry, implement each declared export using this task’s original request, and preserve the entry.'}))
  for(const n of [1,2,3,4,5])for(const arm of ['baseline','candidate']) {
    const baselineFailure=arm==='baseline'&&n<3, wrong=baselineFailure||arm==='candidate'&&n===5
    script.push(toolCallResponse(`trial-entry-${n}-${arm}`,'read',{file_path:'entry.mjs'}),
      toolCallResponse(`trial-left-${n}-${arm}`,'write',{file_path:`task${n}.mjs`,content:f.program(n).left}),
      toolCallResponse(`trial-right-${n}-${arm}`,'write',{file_path:`extra${n}.mjs`,content:wrong?'export const right=999;':f.program(n).right}),
      textResponse('saved'),...reviews(baselineFailure?'not-met':'met'))
  }
  const presetRoot=join(root,'presets');mkdirSync(join(presetRoot,'files'),{recursive:true})
  writeFileSync(join(presetRoot,'files/agent.cordis.yml'),`- id: file-tools\n  name: '${fileToolsPath}'\n  config: {}\n`)
  async function mount(cold:boolean) {
    const harness=await mountFeedbackHarness(root,cold?[]:script)
    try {
      await harness.ctx.plugin(localFs.default,{cwd:root});await harness.ctx.plugin(Loader)
      await harness.ctx.plugin(presets.default,{default:'files',roots:[{path:presetRoot,trust:'system'}],includeUserRoot:false})
      await harness.ctx.plugin(SubagentRuntime);await harness.ctx.plugin(spawn,{providerName:'spawn'})
      // These are the actual DEV options. Wrappers only count original calls; no alternate checker or rewritten cohort.
      await applyBundle(harness.ctx,{stateRoot:join(root,'state'),evolutionRoot:join(root,'evolution'),captureExternalCodeArtifacts:true,
        ...options,externalCodeCheck,studyResultCheck})
      for(let pass=0;pass<8;pass++) {
        await Promise.all([...harness.ctx.registry.values()].flatMap(runtime=>[...runtime.fibers].map(fiber=>fiber.await())))
        if(![...harness.ctx.registry.values()].some(runtime=>[...runtime.fibers].some(fiber=>fiber.inertia)))break
        if(pass===7)throw new Error('Runtime did not settle')
      }
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(true)
      if(!cold)harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({revision:1,enabled:true,policyVersion:'tianwen-auto-analysis.v3'})
      return harness
    }catch(error){await harness.ctx.fiber.dispose();throw error}
  }
  let harness:Awaited<ReturnType<typeof mount>>|undefined,cold:Awaited<ReturnType<typeof mount>>|undefined
  let handle:Awaited<ReturnType<Awaited<ReturnType<typeof mount>>['ctx']['agents']['create']>>|undefined
  try {
    harness=await mount(false)
    const ctx=harness.ctx as typeof harness.ctx & {agentPresets:{mount(ctx:unknown,name:string):Promise<unknown>}}
    handle=await ctx.agents.create({sessionId:SessionId('dev-host-controlled'),meta:{cwd:root,agentPreset:'files'},agentOptions:{provider:'tianwen-probe',model:'scripted'},setup:async scope=>{await ctx.agentPresets.mount(scope,'files')}})
    for(const n of [1,2,3]) {
      writeFileSync(join(root,'entry.mjs'),f.original(n).entries[2].content)
      handle.agent.followup(user(f.original(n).requestText))
      await handle.agent.whenIdle();await ctx.tianwenConversationObserver.whenIdle();await ctx.tianwenConversationGuidanceLoop.whenIdle()
    }
    const tasks=ctx.tianwenEvolution.listConversationTasks(),studies=ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(tasks).toHaveLength(3);expect(tasks.map(task=>task.review?.verdict)).toEqual(['met','met','met'])
    expect(tasks.map(task=>task.externalCheckFinished?.status)).toEqual(['rejected','rejected','verified'])
    expect(studies).toHaveLength(1);const study=studies[0]!
    expect(study.decision?.verdict).toBe('accepted');expect(study.activation).toBeUndefined()
    expect(study.opened.resultChecks).toHaveLength(5);expect(study.arms).toHaveLength(10)
    expect(study.arms.map(arm=>arm.resultCheck?.status)).toEqual(['rejected','verified','rejected','verified','verified','verified','verified','verified','verified','rejected'])
    const holdout=study.arms.find(arm=>arm.caseId==='holdout'&&arm.role==='candidate')!
    expect(holdout.verdict).toBe('met');expect(holdout.reviewChecks!.map(check=>check.verdict)).toEqual(['met','met'])
    expect([ordinaryPrepared,ordinaryEvaluated,supplied,prepared,evaluated]).toEqual([3,3,1,5,10])
    const ledger=readFileSync(join(root,'evolution/ledger.jsonl')),requests=harness.adapter.requests.length
    const status=await ctx.tools.execute({callId:CallId(`dev-host-status-${basename(root)}`),name:'tianwen_learning_status',arguments:{},agent:handle.agent,signal:new AbortController().signal})
    expect(status).toMatchObject({isError:false,value:{currentSession:{naturalConversation:{guidanceStudies:{total:1,accepted:1,currentlyActive:0,
      independentResults:{configuredStudies:1,recordedArms:10,pendingArms:0,verified:7,rejected:3,satisfiedStudies:0},
      activationPending:{total:1,quarantined:1,independentResultsNotSatisfied:1}}}}}})
    expect(readFileSync(join(root,'evolution/ledger.jsonl'))).toEqual(ledger);expect(harness.adapter.requests).toHaveLength(requests)
    await handle.dispose();handle=undefined;await ctx.fiber.dispose();harness=undefined
    cold=await mount(true);await cold.ctx.tianwenConversationObserver.whenIdle();await cold.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(cold.ctx.tianwenEvolution.listConversationTasks()).toEqual(tasks);expect(cold.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual(studies)
    expect(readFileSync(join(root,'evolution/ledger.jsonl'))).toEqual(ledger);expect(cold.adapter.requests).toHaveLength(0)
    expect([ordinaryPrepared,ordinaryEvaluated,supplied,prepared,evaluated]).toEqual([3,3,1,5,10])
    writeFileSync(join(base,`${basename(root)}-published.json`),JSON.stringify({controlled:true,naturalSources:0,realModelRequests:0,publishedRuntime:true,
      ordinaryPrepared,ordinaryEvaluated,supplied,prepared,evaluated,scriptedRequests:requests,originalResults:tasks.map(task=>task.externalCheckFinished?.status),
      roleResultStatuses:study.arms.map(arm=>arm.resultCheck?.status),holdoutReview:holdout.verdict,holdoutResult:holdout.resultCheck?.status,
      activated:false,statusProjectionVerified:true,exactColdTasks:true,exactColdStudy:true,exactColdLedger:true,coldRequests:0},null,2),{flag:'wx'})
  }finally{
    if(handle)await handle.dispose();if(harness)await harness.ctx.fiber.dispose();if(cold)await cold.ctx.fiber.dispose()
    const realRoot=realpathSync(root),realParent=realpathSync(roots)
    if(!realRoot.startsWith(realParent+sep)||!realRoot.startsWith('D:\\'))throw new Error('Owned temporary root mismatch')
    rmSync(realRoot,{recursive:true,force:true})
  }
},120_000)
