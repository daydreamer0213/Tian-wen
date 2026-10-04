import {mkdirSync,mkdtempSync,lstatSync,realpathSync,rmSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {sha256,conversationQualityContract} from '../../packages/tianwen-evolution/dist/index.js'
import {createGoalTaskIsolatedPythonAnswerCheck,createConversationStudyIsolatedPythonAnswerCheck} from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-answer-check.js'
import type {GoalTaskAcceptancePreparation,PreparedGoalTaskAcceptanceCheck} from '../../packages/tianwen-runtime-bundle/src/goal-task-acceptance.js'
import type {GoalTaskAcceptanceBinding} from '../../packages/tianwen-runtime-bundle/src/goal-task-acceptance-contract.js'
import type {SessionEvent} from '@deepseek-ai/dsh-session'

const mock=vi.hoisted(()=>({prepare:vi.fn(),run:vi.fn()}))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js',async original=>({...await original<typeof import('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js')>(),prepareIsolatedPythonCli:mock.prepare}))
const base=resolve('D:/DevData/tianwen-goal-answer-check-20261004/test-roots'),roots:string[]=[]
beforeEach(()=>{mock.prepare.mockResolvedValue({digest:'a'.repeat(64),run:mock.run});mock.run.mockResolvedValue({status:'completed',stdout:'true',stderr:'',exitCode:0})})
afterEach(()=>{for(const root of roots.splice(0)){expect(lstatSync(root).isSymbolicLink()).toBe(false);expect(realpathSync(root).toLowerCase()).toBe(root.toLowerCase());expect(root.startsWith(base+'/')||root.startsWith(base+'\\')).toBe(true);rmSync(root,{recursive:true,force:true})}vi.resetAllMocks()})
function fixture(chat=false){
 mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'owned-'));roots.push(root)
 const model={provider:'test',model:'original'},signal=new AbortController().signal,command='Read the original record and return its status.',taskObjective='Return original record status as JSON.',requiredCondition='Return exactly the original status without changing the record.'
 const source={seq:2,type:'command/run',data:{commandId:'command-original',source:{kind:'user'},name:'goal',args:command}}
 const task={id:'task-original',objective:taskObjective,execution:{sessionId:'child',goalId:'native-goal'}}
 const goal={id:'goal-original',objective:command,context:'Use the original record only.',successCriteria:'No extra claims.',workspaceRoot:root,origin:{sessionId:'control',commandId:'command-original',commandSeq:2,commandDigest:sha256(source)},tasks:[task],planner:{sessionId:'parent'}}
 const attempt={status:'running',epoch:1,parentSessionId:'parent',childSessionId:'child',permissionFingerprint:sha256('read-only'),permissionMode:'read-only'}
 const prompt=JSON.stringify({protocol:'tianwen.native-goal-study-input.v1',originalCommand:command,goal:{objective:command,context:goal.context,successCriteria:goal.successCriteria},delegatedTask:taskObjective,permissionMode:attempt.permissionMode})
 const files={schemaVersion:'tianwen.conversation-file-material.v1' as const,cwd:root,outputKind:'chat' as const,outputPaths:[],entries:[{path:'record.txt',content:'pending'}]}
 writeFileSync(join(root,'record.txt'),'pending')
 const material={sourceKind:'native-goal-task' as const,prompt,criteria:[taskObjective,requiredCondition,goal.successCriteria],qualityContract:conversationQualityContract(),...(chat?{files}:{})}
 const config={cwd:root,family:'writing' as const,material,modelConfigDigest:sha256(model),requiredCondition,verifierSource:'import json,sys\np=json.load(sys.stdin)\nprint(json.dumps(p["answer"]=="pending"))',isolated:{cliPath:'D:/unused.exe',endpoint:'unix:///unused',imageRef:'python@sha256:'+'a'.repeat(64),imageId:'sha256:'+'a'.repeat(64),workRoot:root}}
 const input={goal,task,attempt,source,cwd:root,modelConfigDigest:sha256(model),signal} as unknown as GoalTaskAcceptancePreparation
 function candidate(prepared:PreparedGoalTaskAcceptanceCheck){
  const header={seq:3,type:'request/header',data:{header:{config:model}}},message={seq:4,type:'assistant/message',surfaceOp:'append',data:{message:{id:'answer',role:'assistant',content:[{type:'text',text:'pending'}]}}},end={seq:5,type:'turn/end',data:{reason:{kind:'completed'}}}
  const binding={epoch:1,parentSessionId:'parent',childSessionId:'child',nativeGoalId:'native-goal',permissionFingerprint:attempt.permissionFingerprint,goalDigest:sha256('goal'),taskDigest:sha256(task),headerSeq:3,preparedSeq:3,prefixDigest:sha256([header]),modelConfigDigest:sha256(model),checkerId:prepared.checkerId,checkerDigest:prepared.checkerDigest,contractDigest:prepared.contractDigest,inputsDigest:prepared.inputsDigest,requiredCondition,contentReview:{protocol:'tianwen.goal-task-content-review.v1',...prepared.contentReview},requirementsSnapshot:{goal:{id:goal.id,objective:command,context:goal.context,successCriteria:goal.successCriteria,workspaceRoot:root,origin:goal.origin},task,permissionMode:attempt.permissionMode}} as unknown as GoalTaskAcceptanceBinding
  return {preparation:binding,source:structuredClone(input.source),events:[header,message,end] as unknown as SessionEvent[],signal}
 }
 return {root,config,input,candidate}
}
it.each([false,true])('binds the complete original native text/chat contract (chat=%s) before executing only trusted host code',async chat=>{
 const f=fixture(chat),check=createGoalTaskIsolatedPythonAnswerCheck(f.config)
 expect(await check.methodScope!(f.input)).toEqual(chat?{family:'writing',evaluationMode:'local-files',fileOutputKind:'chat'}:{family:'writing',evaluationMode:'text'})
 const prepared=await check.prepare(f.input);expect(prepared).toBeDefined();expect(prepared!.waitsForCancellationCleanup).toBe(true)
 expect(await prepared!.evaluate(f.candidate(prepared!))).toMatchObject({status:'verified'})
 const [source,packet]=mock.run.mock.calls[0]!;expect(source).toBe(f.config.verifierSource)
 expect(JSON.parse(packet)).toEqual({schemaVersion:'tianwen.answer-check.v1',material:f.config.material,answer:'pending',files:f.config.material.files?.entries??[]})
})
it.each([false,true])('binds a legitimately changed Task before its first answer within an explicit original Goal scope (chat=%s)',async chat=>{
 const f=fixture(chat),originalMaterial=structuredClone(f.config.material)
 const exact=createGoalTaskIsolatedPythonAnswerCheck(f.config)
 const check=createGoalTaskIsolatedPythonAnswerCheck({...f.config,bindActualTask:true})
 Object.assign(f.input.task,{objective:f.input.task.objective+' Preserve pending while keeping the original two-property output.'})
 expect(await exact.methodScope!(f.input)).toBeUndefined();expect(await exact.prepare(f.input)).toBeUndefined()
 expect(await check.methodScope!(f.input)).toEqual(chat?{family:'writing',evaluationMode:'local-files',fileOutputKind:'chat'}:{family:'writing',evaluationMode:'text'})
 const prepared=await check.prepare(f.input);expect(prepared).toBeDefined()
 const prompt={...JSON.parse(originalMaterial.prompt),delegatedTask:f.input.task.objective}
 const actualMaterial={...originalMaterial,prompt:JSON.stringify(prompt),criteria:[f.input.task.objective,f.config.requiredCondition,f.input.goal.successCriteria!]}
 expect(prepared!.inputsDigest).toBe(sha256(actualMaterial));expect(prepared!.inputsDigest).not.toBe(sha256(originalMaterial))
 expect(await prepared!.evaluate(f.candidate(prepared!))).toMatchObject({status:'verified'})
 expect(JSON.parse(mock.run.mock.calls[0]![1]).material).toEqual(actualMaterial)
 expect(f.config.material).toEqual(originalMaterial)
})
it('refuses a changed Goal or missing original provenance even when actual Task binding is enabled',async()=>{
 const f=fixture(),check=createGoalTaskIsolatedPythonAnswerCheck({...f.config,bindActualTask:true})
 Object.assign(f.input.task,{objective:f.input.task.objective+' Legitimate planning adjustment.'})
 for(const field of ['context','source','membership'] as const){
  const input=structuredClone({...f.input,signal:undefined}) as unknown as GoalTaskAcceptancePreparation;Object.assign(input,{signal:f.input.signal})
  if(field==='context')Object.assign(input.goal,{context:'changed original Goal'})
  if(field==='source')Object.assign(input.source.data,{source:{kind:'assistant'}})
  if(field==='membership')Object.assign(input.goal,{tasks:[]})
  expect(await check.methodScope!(input)).toBeUndefined();expect(await check.prepare(input)).toBeUndefined()
 }
 expect(mock.prepare).not.toHaveBeenCalled()
})
it.each([false,'true'])('rejects invalid actual Task binding opt-in %s',value=>{
 const f=fixture();expect(()=>createGoalTaskIsolatedPythonAnswerCheck({...f.config,bindActualTask:value as never})).toThrow()
})
function nativeCohort(chat=false){
 const f=fixture(chat),requiredCondition=f.config.requiredCondition
 const original=(task:string)=>({...f.config.material,prompt:JSON.stringify({...JSON.parse(f.config.material.prompt),delegatedTask:task}),criteria:[task,requiredCondition,f.input.goal.successCriteria!]})
 const templates=['source1','source2','counterexample'].map(role=>original('Original '+role+' Task.'))
 const actuals=['source1','source2','counterexample'].map(role=>original('Actual '+role+' Task, adjusted by the original Planner.'))
 const independent=['adjacent','holdout'].map(role=>({prompt:'Frozen independent '+role+'.',criteria:[requiredCondition],qualityContract:f.config.material.qualityContract,...(chat?{files:f.config.material.files!}:{})}))
 const roles=['source1','source2','counterexample','adjacent','holdout']
 const config={provideIndependentCases:true as const,bindActualGoalTasks:true as const,modelConfigDigest:f.config.modelConfigDigest,isolated:f.config.isolated,
  cases:[...templates,...independent].map((material,index)=>({caseId:roles[index]!,material,requiredCondition,verifierSource:f.config.verifierSource}))}
 const input={sources:actuals.slice(0,2),counterexample:actuals[2]!,modelConfigDigest:f.config.modelConfigDigest,qualityContract:f.config.material.qualityContract,...(chat?{cwd:f.root}:{}),signal:f.input.signal}
 return {...f,config,input,templates,actuals,independent}
}
it.each([false,true])('binds recovered original Goal study materials once before preparing five cases (chat=%s)',async chat=>{
 const f=nativeCohort(chat),check=createConversationStudyIsolatedPythonAnswerCheck(f.config)
 for(const entry of f.config.cases)expect(await check.prepare({caseId:entry.caseId,material:entry.material,modelConfigDigest:f.config.modelConfigDigest,signal:f.input.signal})).toBeUndefined()
 expect(mock.prepare).not.toHaveBeenCalled()
 const cases=await check.prepareIndependentCases!(f.input);expect(cases?.holdout.prompt).toBe(f.independent[1]!.prompt)
 const prepared=await check.prepare({caseId:'source1',material:f.actuals[0]!,modelConfigDigest:f.config.modelConfigDigest,signal:f.input.signal});expect(prepared).toBeDefined()
 expect(prepared!.inputsDigest).toBe(sha256(f.actuals[0]));expect(prepared!.inputsDigest).not.toBe(sha256(f.templates[0]))
 for(const answer of ['baseline answer','candidate answer'])expect(await prepared!.evaluate({material:f.actuals[0]!,answer,files:f.actuals[0]!.files?.entries??[],signal:f.input.signal})).toMatchObject({status:'verified'})
 const packets=mock.run.mock.calls.map(call=>JSON.parse(call[1]));expect(packets.map(p=>p.material)).toEqual([f.actuals[0],f.actuals[0]])
 const changed={...f.input,sources:[{...f.actuals[0]!,prompt:JSON.stringify({...JSON.parse(f.actuals[0]!.prompt),delegatedTask:'Another later source Task.'}),criteria:['Another later source Task.',f.config.cases[0]!.requiredCondition,JSON.parse(f.actuals[0]!.prompt).goal.successCriteria]},{...f.actuals[1]!}]}
 expect(await check.prepareIndependentCases!(changed)).toBeUndefined()
 expect(await check.prepare({caseId:'source1',material:changed.sources[0]!,modelConfigDigest:f.config.modelConfigDigest,signal:f.input.signal})).toBeUndefined()
 expect(await check.prepareIndependentCases!(f.input)).toEqual(cases)
})
it.each(['goal','criterion','quality','files'] as const)('does not bind changed original native study %s',async field=>{
 const f=nativeCohort(true),check=createConversationStudyIsolatedPythonAnswerCheck(f.config),input={...structuredClone({...f.input,signal:undefined}),signal:f.input.signal}
 const material=input.sources[0]!
 if(field==='goal')material.prompt=JSON.stringify({...JSON.parse(material.prompt),goal:{...JSON.parse(material.prompt).goal,context:'replacement'}})
 if(field==='criterion')material.criteria[1]='replacement'
 if(field==='quality')material.qualityContract={...material.qualityContract,criterion:'replacement'}
 if(field==='files')material.files!.entries[0]!.content='replacement'
 expect(await check.prepareIndependentCases!(input)).toBeUndefined();expect(mock.prepare).not.toHaveBeenCalled()
})
it('requires a complete explicit independent native cohort for actual Goal study binding',()=>{
 const f=nativeCohort();expect(()=>createConversationStudyIsolatedPythonAnswerCheck({...f.config,provideIndependentCases:undefined})).toThrow()
 expect(()=>createConversationStudyIsolatedPythonAnswerCheck({...f.config,bindActualGoalTasks:false as never})).toThrow()
})
it('rejects an oversized actual Task before latching the native study cohort',async()=>{
 const f=nativeCohort(),check=createConversationStudyIsolatedPythonAnswerCheck(f.config),task='Large actual Task '+ 'x'.repeat(20000)
 const oversized={...f.actuals[0]!,prompt:JSON.stringify({...JSON.parse(f.actuals[0]!.prompt),delegatedTask:task}),
  criteria:[task,f.config.cases[0]!.requiredCondition,JSON.parse(f.actuals[0]!.prompt).goal.successCriteria]}
 expect(await check.prepareIndependentCases!({...f.input,sources:[oversized,f.actuals[1]!]})).toBeUndefined()
 expect(await check.prepare({caseId:'source1',material:oversized,modelConfigDigest:f.config.modelConfigDigest,signal:f.input.signal})).toBeUndefined()
 expect(mock.prepare).not.toHaveBeenCalled()
 expect(await check.prepareIndependentCases!(f.input)).toBeDefined()
})
it.each(['source','context','criteria','permission','model'] as const)('does not prepare an unrelated or changed %s contract',async field=>{
 const f=fixture(),check=createGoalTaskIsolatedPythonAnswerCheck(f.config),input=structuredClone({...f.input,signal:undefined}) as unknown as GoalTaskAcceptancePreparation
 Object.assign(input,{signal:f.input.signal})
 if(field==='source')Object.assign(input.source.data,{args:'Other command'})
 if(field==='context')Object.assign(input.goal,{context:'Other context'})
 if(field==='criteria')Object.assign(input.goal,{successCriteria:'Other requirement'})
 if(field==='permission')Object.assign(input.attempt,{permissionMode:'full-access'})
 if(field==='model')Object.assign(input,{modelConfigDigest:sha256('other')})
 expect(await check.prepare(input)).toBeUndefined();expect(mock.prepare).not.toHaveBeenCalled()
})
it.each(['source','snapshot','epoch','model','checker','condition','prefix','incomplete','file','file-call'] as const)('does not execute a changed %s native candidate or attribute it as an original failure',async field=>{
 const f=fixture(field==='file'),prepared=(await createGoalTaskIsolatedPythonAnswerCheck(f.config).prepare(f.input))!,candidate=f.candidate(prepared)
 if(field==='source')Object.assign(candidate.source.data,{args:'replacement'})
 if(field==='snapshot')Object.assign(candidate.preparation.requirementsSnapshot!.goal,{context:'replacement'})
 if(field==='epoch')Object.assign(candidate.preparation,{epoch:2})
 if(field==='model')Object.assign(candidate.preparation,{modelConfigDigest:sha256('replacement')})
 if(field==='checker')Object.assign(candidate.preparation,{checkerDigest:sha256('replacement')})
 if(field==='condition')Object.assign(candidate.preparation,{requiredCondition:'replacement'})
 if(field==='prefix')Object.assign(candidate.preparation,{prefixDigest:sha256('replacement')})
 if(field==='incomplete')Object.assign(candidate.events.at(-1)!.data,{reason:{kind:'cancelled'}})
 if(field==='file')writeFileSync(join(f.root,'record.txt'),'changed externally')
 if(field==='file-call')candidate.events.splice(2,0,{seq:4,type:'tool/call',data:{name:'read',input:{file_path:join(f.root,'record.txt')}}} as unknown as SessionEvent)
 const result=await prepared.evaluate(candidate);expect(result.status).toBe('unverifiable');expect(result).not.toHaveProperty('failedRequiredConditionDigest');expect(mock.run).not.toHaveBeenCalled()
})
it('preserves explicit host rejection and cancellation instead of manufacturing a positive result',async()=>{
 const f=fixture(),prepared=(await createGoalTaskIsolatedPythonAnswerCheck(f.config).prepare(f.input))!
 mock.run.mockResolvedValue({status:'completed',stdout:'false',stderr:'',exitCode:0})
 expect(await prepared.evaluate(f.candidate(prepared))).toMatchObject({status:'rejected',failedRequiredConditionDigest:sha256(f.config.requiredCondition)})
 const controller=new AbortController();controller.abort();await expect(prepared.evaluate({...f.candidate(prepared),signal:controller.signal})).rejects.toThrow()
})
