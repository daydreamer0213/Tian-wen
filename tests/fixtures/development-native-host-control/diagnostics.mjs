import assert from 'node:assert/strict'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {mountFeedbackHarness,toolCallResponse,textResponse,ToolRuntime} from '../../../packages/tianwen-dsh-compat/src/index.ts'
import {sha256} from '../../../packages/tianwen-evolution/src/index.ts'
import {runDevelopmentNativeTask,inspectDevelopmentNativeTaskArchive,developmentNativeReadDenialProducer} from '../../../scripts/development-native-task.mjs'
const repo=resolve('.'),root=process.env.TIANWEN_NATIVE_DIAGNOSTIC_CONTROL_ROOT,mode=process.argv[2]??'--run'
const [first,second,reference]=process.env.TIANWEN_NATIVE_DIAGNOSTIC_CONTROL_BRACES==='1'?['{{model}}.mjs','{{missing_variable}}.mjs','{{not_registered}}.md']:['first.mjs','second.mjs','reference.md']
assert(root?.startsWith('D:/DevData/'));assert(['--run','--cold'].includes(mode))
mkdirSync(root,{recursive:true});if(mode==='--run'){assert(!existsSync(join(root,'task-run/attempt-started.json')));writeFileSync(join(root,reference),'readonly reference\n',{flag:'wx'})}
const sessionId='original-host-observation-overflow',requestText='Save first.mjs and second.mjs. This is a scripted diagnostic control only.'
const admission={decision:{kind:'task',objective:'Save two control files.',criteria:['Save first.mjs and second.mjs.'],family:'code',evaluationMode:'local-files',fileOutputKind:'files',relatedTaskId:null,feedback:null}}
const script=[toolCallResponse('admission','structured_output',admission),...Array.from({length:17},(_,i)=>toolCallResponse('denied-'+i,'read',{file_path:'undeclared-'+i+'.md'})),toolCallResponse('write-first','write',{file_path:first,content:'export const first=1\n'}),toolCallResponse('write-second','write',{file_path:second,content:'export const second=2\n'}),textResponse('Control files saved.')]
const h=await mountFeedbackHarness(join(root,'profile'),mode==='--run'?script:[])
const bundle=createRequire(resolve(repo,'packages/tianwen-runtime-bundle/package.json')),cli=createRequire(bundle.resolve('@deepseek-ai/dsh/package.json'))
const mod=(r,name)=>import(pathToFileURL(r.resolve(name)).href)
const {apply}=await mod(bundle,'@tianwen/runtime-bundle/runtime'),{NativeObservedToolRuntime}=await mod(bundle,'@tianwen/runtime-bundle/native-tools-observer')
let preparations=0,evaluations=0,deniedDispatches=0
try{
 for(const fiber of [...h.ctx.registry.get(ToolRuntime).fibers])await fiber.dispose()
 await h.ctx.plugin(NativeObservedToolRuntime)
 await h.ctx.plugin((await mod(cli,'@deepseek-ai/dsh-fs-local')).default,{cwd:root})
 await h.ctx.plugin(await mod(cli,'@deepseek-ai/dsh-tool-fs'))
 await h.ctx.plugin((await mod(cli,'@deepseek-ai/dsh-subagent')).default)
 await h.ctx.plugin(await mod(cli,'@deepseek-ai/dsh-subagent-spawn-in-process'),{providerName:'spawn'})
 h.ctx.on('tools/execute',(exec,next)=>{if(exec.name==='read'&&exec.arguments.file_path.startsWith('undeclared-'))deniedDispatches++;return next()})
 await apply(h.ctx,{stateRoot:join(root,'state'),sessionsRoot:join(root,'profile/sessions'),evolutionRoot:join(root,'evolution'),captureExternalCodeArtifacts:true,exposeCapturedFileFacts:false,conversationReadDenialSources:[developmentNativeReadDenialProducer()],...(mode==='--run'?{externalCodeCheck:{async prepare(){
  preparations++;return{checkerId:'original-diagnostic-control.v1',checkerDigest:sha256('original controlled dispatcher'),contractDigest:sha256('original controlled diagnostic scope'),inputs:[{path:first,content:null},{path:second,content:null},{path:reference,content:'readonly reference\n'}],project:{inputs:[{path:first,content:null},{path:second,content:null},{path:reference,content:'readonly reference\n'}],outputPaths:[first,second]},async evaluate(){evaluations++;throw Error('Overflow Task must not evaluate a missing file result')}}
 }}}:{})})
 if(mode==='--run'){
  h.ctx.tianwenEvolution.recordLearningAnalysisConsent({enabled:true,revision:1,policyVersion:'tianwen-auto-analysis.v3'})
  const result=await runDevelopmentNativeTask(h.ctx,{cwd:root,sessionId,requestText,outputPaths:[first,second],referencePaths:[reference],maxTargetBytes:1000,resultRoot:join(root,'task-run'),callConfig:{provider:'tianwen-probe',model:'scripted'},isPrepared:()=>true})
  const task=h.ctx.tianwenEvolution.listConversationTasks(sessionId)[0],native=JSON.parse(gunzipSync(readFileSync(join(root,'task-run/root-native.json.gz'))))
  assert.equal(task.fileUnavailable.reason,'material-unavailable');assert.equal(task.externalCheckFinished.status,'unverifiable');assert.equal(task.review.verdict,'inconclusive');assert.equal(evaluations,0)
  assert.equal(deniedDispatches,0);assert.equal(preparations,1);assert.equal(h.adapter.requests.length,21)
  const user=native.events.find(e=>e.type==='user/message').data
  assert.equal(user.content[0].text,requestText);assert.equal(task.source.requestDigest,sha256([user]))
  const header=native.events.find(e=>e.type==='request/header').data.header
  assert(header.system.includes(JSON.stringify({outputPaths:[first,second],referencePaths:[reference]})))
  const cleanup=JSON.parse(readFileSync(join(root,'task-run/cleanup.json'))),diagnostics=cleanup.fileObservationDiagnostics
  if(!diagnostics)writeFileSync(join(root,'diagnostic-debug.json'),JSON.stringify({observerFiber:h.ctx.tianwenConversationFileObserver.ctx.fiber.name,rootFiber:h.ctx.fiber.name,logs:h.ctx.logger.buffer.filter(m=>m.type==='warn').map(m=>({sn:m.sn,name:m.name,sourceFiber:m.fiber?.deref()?.name,sameFiber:m.fiber?.deref()===h.ctx.tianwenConversationFileObserver.ctx.fiber,args:m.args}))},null,2),{flag:'wx'})
  assert(diagnostics?.records.some(r=>r.phase==='freeze'&&r.taskId===task.source.taskId&&r.sessionId===sessionId&&r.detail==='conversation file ancillary record exceeds its count limit'),'original concrete observer failure missing from sealed cleanup')
  const inspection=await inspectDevelopmentNativeTaskArchive(h.ctx,{resultRoot:join(root,'task-run'),sessionId,outputPaths:[first,second],signal:new AbortController().signal})
  assert.equal(inspection.verification.complete,true);assert.equal(inspection.summary.functionalStatus,'unverifiable')
  assert.deepEqual(inspection.status.diagnostics,{items:[{stage:'保存最终文件证据时',detail:'conversation file ancillary record exceeds its count limit',detailTruncated:false}],observedCount:1,truncated:false,disposition:'诊断只说明观察失败原因，不改变原任务或学习资格。'})
  writeFileSync(join(root,'control-result.json'),JSON.stringify({result,diagnostics,inspection,scriptedRequests:h.adapter.requests.length,deniedDispatches,originalMessageUnchanged:true,permissionSectionBeforeDispatch:true,preparations,evaluations,originalEvidenceLimit:16,actualDenials:17,quarantine:h.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined(),studies:h.ctx.tianwenEvolution.listConversationGuidanceStudies().length},null,2),{flag:'wx'})
 }else{
  const ledger=readFileSync(join(root,'evolution/ledger.jsonl')),task=h.ctx.tianwenEvolution.listConversationTasks(sessionId)[0]
  assert.deepEqual(task,JSON.parse(readFileSync(join(root,'task-run/task.json'))))
  const inspection=await inspectDevelopmentNativeTaskArchive(h.ctx,{resultRoot:join(root,'task-run'),sessionId,outputPaths:[first,second],signal:new AbortController().signal})
  const prior=JSON.parse(readFileSync(join(root,'control-result.json')))
  assert.deepEqual(inspection,prior.inspection);assert.deepEqual(JSON.parse(readFileSync(join(root,'task-run/cleanup.json'))).fileObservationDiagnostics,prior.diagnostics)
  assert.deepEqual(readFileSync(join(root,'evolution/ledger.jsonl')),ledger);assert.equal(h.adapter.requests.length,0);assert.equal(preparations,0);assert.equal(evaluations,0)
  writeFileSync(join(root,'cold-result.json'),JSON.stringify({newNodeProcess:true,modelRequests:0,exactTask:true,exactDiagnosticArchive:true,ledgerUnchanged:true},null,2),{flag:'wx'})
 }
 console.log(JSON.stringify({mode,scriptedRequests:h.adapter.requests.length,preparations,evaluations,originalFailurePreserved:true,diagnosticChecked:true}))
}finally{await h.ctx.fiber.dispose()}
