import assert from 'node:assert/strict'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mountFeedbackHarness,toolCallResponse,textResponse,ToolRuntime} from '../../../packages/tianwen-dsh-compat/src/index.ts'
import {auditedEvidenceResponse} from '../../dsh-migration/conversation-audited-response.ts'
import {createDevelopmentIsolatedNodeProjectCheck} from '../../../scripts/development-isolated-node-project-check.mjs'
import {runDevelopmentNativeTask,developmentNativeReadDenialProducer} from '../../../scripts/development-native-task.mjs'
import {sha256} from '../../../packages/tianwen-evolution/src/index.ts'
import {recoverConversationTaskMaterial} from '../../../packages/tianwen-runtime-bundle/src/conversation-task-material.ts'
import {recoverConversationJudgmentRequest} from '../../../packages/tianwen-runtime-bundle/src/conversation-judgment.ts'
import {verifyConversationOriginalReviewCheck} from '../../../packages/tianwen-runtime-bundle/src/conversation-claim-review.ts'
const repo=resolve('.'),root=process.env.TIANWEN_NATIVE_HOST_CONTROL_ROOT
const mode=process.argv[2]??'--run';assert(['--run','--cold'].includes(mode))
const readDenialControl=process.env.TIANWEN_NATIVE_READ_DENIAL_CONTROL==='1'
assert(root&&root.startsWith('D:/DevData/'));if(mode==='--run')assert(!existsSync(join(root,'task-run/attempt-started.json')))
mkdirSync(root,{recursive:true})
const source='import {first} from "./first.mjs"; import {second} from "./second.mjs"; console.log(JSON.stringify({total:first+second}))'
if(mode==='--run')writeFileSync(join(root,'entry.mjs'),source,{flag:'wx'});else assert.equal(readFileSync(join(root,'entry.mjs'),'utf8'),source)
const requestText='Read entry.mjs, save the two control modules first.mjs and second.mjs, with first=1 and second=2. Use only the three declared files; this is a scripted host control.'
const admission={decision:{kind:'task',objective:'Save two control modules with first=1 and second=2.',criteria:['Preserve entry.mjs and write only first.mjs and second.mjs.'],family:'code',evaluationMode:'local-files',fileOutputKind:'files',relatedTaskId:null,feedback:null}}
const operation=(id,name,args)=>toolCallResponse(id,name,args),review=()=>auditedEvidenceResponse({verdict:'met',category:null,explanation:'Scripted DEV host fixture only.',evidenceQuotes:['saved']})
const script=[operation('admission','structured_output',admission),...(readDenialControl?[operation('read-denied','read',{file_path:'outside-directory'})]:[]),operation('read-entry','read',{file_path:'entry.mjs'}),operation('write-second','write',{file_path:'second.mjs',content:'export const second=2\n'}),operation('write-first','write',{file_path:'first.mjs',content:'export const first=0\n'}),operation('edit-first','edit',{file_path:'first.mjs',old_string:'first=0',new_string:'first=1'}),operation('read-second','read',{file_path:'second.mjs'}),operation('read-first','read',{file_path:'first.mjs'}),textResponse('Control modules saved.'),review(),review()]
const h=await mountFeedbackHarness(join(root,'profile'),mode==='--run'?script:[])
const cli=createRequire(createRequire(resolve(repo,'package.json')).resolve('@deepseek-ai/dsh/package.json'))
const mod=name=>import(pathToFileURL(cli.resolve(name)).href)
const manifest=JSON.parse(readFileSync(resolve(repo,'packages/tianwen-runtime-bundle/package.json')))
const {apply}=await import(pathToFileURL(resolve(repo,'packages/tianwen-runtime-bundle',manifest.exports['./runtime'].default)).href)
const producer=createDevelopmentIsolatedNodeProjectCheck({cwd:root,requestText,entryPath:'entry.mjs',outputPaths:['first.mjs','second.mjs'],referencePaths:['entry.mjs'],cases:[{id:'host-control-total',input:'{}',expectedJson:'{"total":3}',exitCode:0}],requiredCondition:'The actual two-module program emits total=3.'})
let preparations=0,evaluations=0
let deniedDispatches=0
try{
 if(readDenialControl){for(const fiber of [...h.ctx.registry.get(ToolRuntime).fibers])await fiber.dispose();const {NativeObservedToolRuntime}=await import(pathToFileURL(resolve(repo,'packages/tianwen-runtime-bundle',manifest.exports['./native-tools-observer'].default)).href);await h.ctx.plugin(NativeObservedToolRuntime);h.ctx.on('tools/execute',(exec,next)=>{if(exec.name==='read'&&exec.arguments.file_path==='outside-directory')deniedDispatches++;return next()})}
 await h.ctx.plugin((await mod('@deepseek-ai/dsh-fs-local')).default,{cwd:root});await h.ctx.plugin(await mod('@deepseek-ai/dsh-tool-fs'))
 await h.ctx.plugin((await mod('@deepseek-ai/dsh-subagent')).default);await h.ctx.plugin(await mod('@deepseek-ai/dsh-subagent-spawn-in-process'),{providerName:'spawn'})
 await apply(h.ctx,{stateRoot:join(root,'state'),sessionsRoot:join(root,'profile/sessions'),evolutionRoot:join(root,'evolution'),captureExternalCodeArtifacts:true,exposeCapturedFileFacts:false,...(readDenialControl?{conversationReadDenialSources:[developmentNativeReadDenialProducer()]}:{}),...(mode==='--run'?{externalCodeCheck:{async prepare(material){preparations++;const prepared=await producer.prepare(material);assert(prepared);return{...prepared,async evaluate(candidate){evaluations++;return prepared.evaluate(candidate)}}}}}:{})})
 if(mode==='--cold'){
  const before=readFileSync(join(root,'evolution/ledger.jsonl'))
  for(let pass=0;pass<8;pass++){await Promise.all([...h.ctx.registry.values()].flatMap(runtime=>[...runtime.fibers].map(fiber=>fiber.await())));if(![...h.ctx.registry.values()].some(runtime=>[...runtime.fibers].some(fiber=>fiber.inertia)))break;assert(pass<7)}
  const task=h.ctx.tianwenEvolution.listConversationTasks('owned-dev-host-scripted-control')[0],prior=JSON.parse(readFileSync(join(root,'task-run/task.json')))
  assert.deepEqual(task,prior);const material=await recoverConversationTaskMaterial(h.ctx,task)
  if(readDenialControl)assert.deepEqual(material,JSON.parse(readFileSync(join(root,'recovered-material.json'))))
  let recoveredChecks=0
  for(const check of task.review.reviewChecks){const recovered=await recoverConversationJudgmentRequest(h.ctx,check);assert.equal(sha256(recovered.material.original.source),sha256(material));await verifyConversationOriginalReviewCheck(h.ctx,check,recovered.material.original,task.models[0].modelConfigDigest);recoveredChecks++}
  assert.equal(recoveredChecks,2);assert.equal(h.adapter.requests.length,0);assert.equal(preparations,0);assert.equal(evaluations,0);assert.deepEqual(readFileSync(join(root,'evolution/ledger.jsonl')),before)
  writeFileSync(join(root,'cold-control-result.json'),JSON.stringify({originalTaskExact:true,originalProgramExact:true,...(readDenialControl?{originalMaterialExact:true,readDenialControl:true}:{}),recoveredChecks,scriptedRequests:0,naturalRequests:0,preparations,evaluations,ledgerUnchanged:true},null,2),{flag:'wx'})
  console.log('original published host task and both reviews cold recovered; zero provider/check rerun')
 }else{
 h.ctx.tianwenEvolution.recordLearningAnalysisConsent({revision:1,enabled:true,policyVersion:'tianwen-auto-analysis.v3'})
 const result=await runDevelopmentNativeTask(h.ctx,{cwd:root,sessionId:'owned-dev-host-scripted-control',requestText,outputPaths:['first.mjs','second.mjs'],referencePaths:['entry.mjs'],maxTargetBytes:20000,resultRoot:join(root,'task-run'),callConfig:{provider:'tianwen-probe',model:'scripted'},isPrepared:()=>preparations===1})
 const task=h.ctx.tianwenEvolution.listConversationTasks('owned-dev-host-scripted-control')[0]
 assert.deepEqual(task.completion.files.outputPaths,['second.mjs','first.mjs']);assert.equal(task.externalCheckFinished.status,'verified');assert.equal(result.summary.functionalCandidateVerified,true)
 assert.equal(task.review.verdict,'met');assert.equal(task.review.reviewChecks.length,2);assert.equal(preparations,1);assert.equal(evaluations,1)
 assert.equal(h.ctx.tianwenEvolution.listConversationGuidanceStudies().length,0);assert.equal(h.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined(),true)
 if(readDenialControl){assert.equal(deniedDispatches,0);assert.equal(task.fileAncillary.length,1);assert.equal(task.fileAncillary[0].payload.tool,'read-denied');assert(!task.fileInputs.some(input=>input.path==='outside-directory'));const material=await recoverConversationTaskMaterial(h.ctx,task);assert.equal(material.fileExecution.schemaVersion,'tianwen.file-execution-evidence.v3');assert.equal(material.fileExecution.actions[0].status,'denied');assert.equal(material.fileExecution.actions[0].path,null);writeFileSync(join(root,'recovered-material.json'),JSON.stringify(material,null,2),{flag:'wx'})}
 writeFileSync(join(root,'control-result.json'),JSON.stringify({result,preparations,evaluations,scriptedRequests:h.adapter.requests.length,naturalRequests:0,...(readDenialControl?{readDenialControl:true,deniedDispatches,capturedDenials:task.fileAncillary.length}:{}),originalOutputPaths:task.completion.files.outputPaths,publishedRuntimeUsed:true,studies:0,quarantine:true},null,2),{flag:'wx'})
 console.log('published Runtime and original Node-project checker actually consumed reusable host; reversed permissions and edit passed')
 }
}finally{await h.ctx.fiber.dispose()}
