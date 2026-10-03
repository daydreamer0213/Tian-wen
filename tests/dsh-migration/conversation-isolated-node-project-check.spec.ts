import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { conversationQualityContract, conversationExternalInputsDigest, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import type { ConversationStudyResultMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCohortCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-node-project-check.js'
import * as projectApi from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-node-project-check.js'

const mock = vi.hoisted(() => ({ prepare: vi.fn(), run: vi.fn() }))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-node-project.js', async original => ({ ...await original<typeof import('../../packages/tianwen-runtime-bundle/src/isolated-node-project.js')>(), prepareIsolatedNodeProject: mock.prepare }))
const roots: string[] = [], condition = 'Preserve the declared two-module functional JSON contract, exit zero, empty stderr.'
afterEach(() => { for (const root of roots.splice(0)) { expect(root.startsWith('D:\\DevData\\tianwen-node-project-checks-20261003\\test-roots\\')).toBe(true); rmSync(root, { recursive: true, force: true }) } vi.resetAllMocks() })
function fixture() {
  const base = 'D:/DevData/tianwen-node-project-checks-20261003/test-roots'; mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(resolve(base, 'binding-')); roots.push(cwd)
  const prompt = `Implement first.ts and second.ts. ${condition}`, signal = new AbortController().signal
  const entries = [{ path: 'first.ts', content: null }, { path: 'second.ts', content: null }, { path: 'entry.mjs', content: "import './first.js'; import './second.js';" }]
  writeFileSync(resolve(cwd, 'entry.mjs'), entries[2]!.content!)
  const config = { cwd, requestText: prompt, entryPath: 'entry.mjs', outputPaths: ['first.ts', 'second.ts'], referencePaths: ['entry.mjs'],
    cases: [{ id: 'independent', input: '{}', expectedJson: '{"n":7}', exitCode: 0 }], isolated: { cliPath: 'controlled', endpoint: 'controlled', imageRef: 'controlled', imageId: 'controlled', workRoot: resolve(cwd, 'receipts') } }
  const material = { cwd, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })], context: [], modelConfigDigest: sha256('model'), signal,
    task: { admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' } } } } as unknown as ConversationExternalCodePreparation
  const candidate = () => ({ request: structuredClone(material.request), context: [], inputs: structuredClone(entries), outputs: entries.map(entry => ({ ...entry, content: entry.content ?? 'export const n=7;' })), outputPaths: [...config.outputPaths], signal })
  const study = { prompt, criteria: [condition], caseId: 'source1', modelConfigDigest: material.modelConfigDigest, signal, qualityContract: conversationQualityContract(),
    files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd, entries: structuredClone(entries), outputPaths: [...config.outputPaths] } }
  const studyCandidate = () => { const { caseId: _id, modelConfigDigest: _model, signal: _signal, ...body } = study; const { request: _request, context: _context, ...output } = candidate(); return { ...structuredClone(body), ...output, answer: '' } }
  mock.prepare.mockResolvedValue({ digest: 'executor', run: mock.run }); mock.run.mockResolvedValue({ status: 'completed', stdout: '{"n":7}', stderr: '', exitCode: 0, receiptDigest: 'receipt' })
  return { cwd, config, material, candidate, study, studyCandidate, signal }
}

function nativeFixture() {
  const f=fixture(), goalCommand='Complete the real project work represented by this controlled native Goal.'
  const source={type:'command/run',seq:1,data:{name:'goal',args:goalCommand,commandId:'original-command',source:{kind:'user'}}}
  const origin={sessionId:'original-root',commandId:'original-command',commandSeq:1,commandDigest:sha256(source)}
  const task={id:'original-task',objective:f.config.requestText,execution:{sessionId:'child',goalId:'native-goal'},resolution:null}
  const attempt={epoch:1,parentSessionId:'planner',childSessionId:'child',permissionFingerprint:sha256('permission'),permissionMode:'workspace-write',status:'running',startedAt:'2026-10-03T00:00:00.000Z'}
  const goal={schemaVersion:'tianwen.long-goal.v3',id:'original-goal',objective:goalCommand,context:null,successCriteria:null,workspaceRoot:f.cwd,
    origin,tasks:[task],planner:{sessionId:'planner'}}
  const material={goal,task,attempt,source,cwd:f.cwd,modelConfigDigest:sha256('model'),signal:f.signal}
  const config={...f.config,goalCommand,requiredCondition:condition}
  const candidate=(prepared:any)=>{
    const output=f.candidate()
    for(const entry of output.outputs) writeFileSync(resolve(f.cwd,entry.path),entry.content)
    return {source:structuredClone(source),signal:f.signal,events:[],preparation:{epoch:attempt.epoch,parentSessionId:attempt.parentSessionId,childSessionId:attempt.childSessionId,
      nativeGoalId:task.execution.goalId,permissionFingerprint:attempt.permissionFingerprint,modelConfigDigest:material.modelConfigDigest,taskDigest:sha256(task),
      checkerId:prepared.checkerId,checkerDigest:prepared.checkerDigest,contractDigest:prepared.contractDigest,inputsDigest:prepared.inputsDigest,requiredCondition:prepared.requiredCondition,
      contentReview:{protocol:'tianwen.goal-task-content-review.v1',qualityContract:conversationQualityContract(),...structuredClone(prepared.contentReview)},
      requirementsSnapshot:{goal:{id:goal.id,objective:goal.objective,context:goal.context,successCriteria:goal.successCriteria,workspaceRoot:goal.workspaceRoot,origin},task:structuredClone(task),permissionMode:attempt.permissionMode}}}
  }
  return {...f,goalCommand,source,material,config,candidate}
}

it('provides the original native Goal project adapter and checks actual complete files through the existing isolated executor',async()=>{
  const f=nativeFixture(),create=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck
  expect(create).toBeTypeOf('function')
  const check=create(f.config)
  expect(await check.methodScope(f.material)).toEqual({family:'code',evaluationMode:'local-files',fileOutputKind:'files'})
  expect(mock.prepare).not.toHaveBeenCalled()
  const prepared=await check.prepare(f.material)
  expect(prepared.waitsForCancellationCleanup).toBe(true)
  expect(prepared.contentReview.files.entries).toEqual(f.study.files.entries)
  expect(prepared.inputsDigest).toBe(conversationExternalInputsDigest(f.study.files.entries))
  expect(await prepared.evaluate(f.candidate(prepared))).toMatchObject({status:'verified'})
  expect(mock.run).toHaveBeenCalledWith({files:f.study.files.entries.map(entry=>({...entry,content:entry.content??'export const n=7;'})),entryPath:'entry.mjs',input:'{}'},f.signal)
})

it('preserves the exact original Goal cwd spelling in its content plan while checking the same canonical project',async()=>{
  const f=nativeFixture()
  f.material.cwd=f.cwd.replaceAll('\\','/')
  f.material.goal.workspaceRoot=f.material.cwd
  const check=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck(f.config)
  expect(await check.methodScope(f.material)).toBeDefined()
  const prepared=await check.prepare(f.material)
  expect(prepared.contentReview.files.cwd).toBe(f.material.cwd)
})

it.each(['task','command','origin','source-role','cwd','goal-cwd','goal-objective','child','parent','inactive'] as const)(
  'declines a native Goal %s applicability mismatch before method provision or environment preparation',async change=>{
    const f=nativeFixture(),material=structuredClone({...f.material,signal:undefined}) as typeof f.material
    material.signal=f.signal
    if(change==='task') material.task.objective='A different delegated Task'
    if(change==='command') material.source.data.args='A different original command'
    if(change==='origin') material.goal.origin.commandDigest=sha256('wrong command')
    if(change==='source-role') material.source.data.source.kind='plugin'
    if(change==='cwd') material.cwd='D:/DevData/another-workspace'
    if(change==='goal-cwd') material.goal.workspaceRoot='D:/DevData/another-workspace'
    if(change==='goal-objective') material.goal.objective='A different Goal'
    if(change==='child') material.attempt.childSessionId='another child'
    if(change==='parent') material.attempt.parentSessionId='another planner'
    if(change==='inactive') material.attempt.status='settled'
    const check=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck(f.config)
    expect(await check.methodScope(material)).toBeUndefined()
    expect(await check.prepare(material)).toBeUndefined()
    expect(mock.prepare).not.toHaveBeenCalled()
  },
)

it.each(['source','task','model','epoch','child','parent','native-goal','permission','checker','contract','inputs','condition','files'] as const)(
  'does not execute a native Goal candidate with changed original %s binding',async change=>{
    const f=nativeFixture(),check=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck(f.config),prepared=await check.prepare(f.material),output=f.candidate(prepared)
    if(change==='source') output.source.data.args='Changed original command'
    if(change==='task') output.preparation.requirementsSnapshot.task.objective='Changed Task'
    if(change==='model') output.preparation.modelConfigDigest=sha256('other model')
    if(change==='epoch') output.preparation.epoch++
    if(change==='child') output.preparation.childSessionId='other child'
    if(change==='parent') output.preparation.parentSessionId='other planner'
    if(change==='native-goal') output.preparation.nativeGoalId='other native goal'
    if(change==='permission') output.preparation.permissionFingerprint=sha256('other permission')
    if(change==='checker') output.preparation.checkerDigest=sha256('other checker')
    if(change==='contract') output.preparation.contractDigest=sha256('other contract')
    if(change==='inputs') output.preparation.inputsDigest=sha256('other original inputs')
    if(change==='condition') output.preparation.requiredCondition='A weaker condition'
    if(change==='files') output.preparation.contentReview.files.outputPaths=['first.ts']
    expect(await prepared.evaluate(output)).toMatchObject({status:'unverifiable'})
    expect(mock.run).not.toHaveBeenCalled()
  },
)

it.each(['readonly','missing','unsupported','json','exit','stderr'] as const)(
  'classifies a native Goal project %s result through the original check without regrading requirements',async change=>{
    const f=nativeFixture(),check=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck(f.config),prepared=await check.prepare(f.material),output=f.candidate(prepared)
    if(change==='readonly') writeFileSync(resolve(f.cwd,'entry.mjs'),'Changed readonly original entry')
    if(change==='missing') rmSync(resolve(f.cwd,'first.ts'))
    if(change==='unsupported') mock.run.mockResolvedValue({status:'source-rejected',detail:'Isolated runtime unavailable'})
    if(change==='json') mock.run.mockResolvedValue({status:'completed',stdout:'{}',stderr:'',exitCode:0,receiptDigest:'receipt'})
    if(change==='exit') mock.run.mockResolvedValue({status:'completed',stdout:'{"n":7}',stderr:'',exitCode:1,receiptDigest:'receipt'})
    if(change==='stderr') mock.run.mockResolvedValue({status:'completed',stdout:'{"n":7}',stderr:'error',exitCode:0,receiptDigest:'receipt'})
    const result=await prepared.evaluate(output)
    if(['json','exit','stderr'].includes(change)) expect(result).toMatchObject({status:'rejected',failedRequiredConditionDigest:sha256(condition)})
    else { expect(result.status).toBe('unverifiable');expect(result).not.toHaveProperty('failedRequiredConditionDigest') }
    if(['readonly','missing'].includes(change)) expect(mock.run).not.toHaveBeenCalled()
  },
)

it('freezes native Goal host config and source material independently and propagates original cancellation cleanup',async()=>{
  const f=nativeFixture(),check=(projectApi as any).createGoalTaskIsolatedNodeProjectCheck(f.config)
  f.config.goalCommand='Changed caller config';f.config.requiredCondition='Changed caller condition';f.config.cases[0]!.expectedJson='{}'
  const prepared=await check.prepare(f.material),output=f.candidate(prepared)
  expect(prepared.requiredCondition).toBe(condition)
  expect((await prepared.evaluate(output)).status).toBe('verified')
  const controller=new AbortController();controller.abort(new Error('original cancelled Goal'))
  await expect(check.methodScope({...f.material,signal:controller.signal})).rejects.toThrow('original cancelled Goal')
  await expect(check.prepare({...f.material,signal:controller.signal})).rejects.toThrow('original cancelled Goal')
  await expect(prepared.evaluate({...output,signal:controller.signal})).rejects.toThrow('original cancelled Goal')
})
it('waits for the original native Goal isolated executor cleanup before rejecting mid-run cancellation', async () => {
  const f=nativeFixture(),check=projectApi.createGoalTaskIsolatedNodeProjectCheck(f.config)
  const prepared=await check.prepare(f.material),controller=new AbortController()
  let started!:()=>void,release!:()=>void,cleaned=false,settled=false
  const running=new Promise<void>(resolve=>{started=resolve})
  const cleanup=new Promise<void>(resolve=>{release=resolve})
  mock.run.mockImplementation(async(_input,signal)=>{started();await cleanup;cleaned=true;signal.throwIfAborted();throw new Error('unexpected uncancelled runner')})
  const output=f.candidate(prepared)
  const pending=prepared!.evaluate({...output,signal:controller.signal})
  const result=pending.then(()=>{settled=true;return undefined},error=>{settled=true;return error})
  await running
  controller.abort(new Error('original mid-run cancellation'))
  await Promise.resolve()
  expect(settled).toBe(false);expect(cleaned).toBe(false)
  release()
  expect((await result)?.message).toBe('original mid-run cancellation')
  expect(cleaned).toBe(true);expect(prepared!.waitsForCancellationCleanup).toBe(true)
})
it('executes the complete captured multi-output project with a read-only independent entry', async () => {
  const f = fixture(), check = createConversationIsolatedNodeProjectCheck(f.config); f.config.cases[0]!.expectedJson = '{}'
  const prepared = await check.prepare(f.material); expect(prepared).toBeDefined()
  writeFileSync(resolve(f.cwd, 'entry.mjs'), 'present-day disk must not run')
  const output = f.candidate(); output.outputs[0]!.content = ' '.repeat(20481)
  expect((await prepared!.evaluate(output)).status).toBe('verified')
  expect(mock.run).toHaveBeenCalledWith({ files: output.outputs, entryPath: 'entry.mjs', input: '{}' }, f.signal)
  expect(prepared!.waitsForCancellationCleanup).toBe(true)
})
it.each(['ordinary', 'study'] as const)('accepts the exact output permission set in native capture order for %s', async mode => {
  const f = fixture()
  const prepared = mode === 'ordinary'
    ? await createConversationIsolatedNodeProjectCheck(f.config).prepare(f.material)
    : await createConversationStudyIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition, criteria: [condition] }).prepare(f.study)
  const output = mode === 'ordinary' ? f.candidate() : f.studyCandidate()
  output.outputPaths.reverse(); output.inputs.reverse(); output.outputs.reverse()
  expect((await prepared!.evaluate(output as never)).status).toBe('verified')
  expect(mock.run).toHaveBeenCalledWith({ files: output.outputs, entryPath: 'entry.mjs', input: '{}' }, f.signal)
})
it.each([['first.ts'], ['first.ts', 'first.ts'], ['first.ts', 'second.ts', 'entry.mjs']] as const)('rejects changed multi-output permissions %j before executing', async paths => {
  const f = fixture(), prepared = await createConversationIsolatedNodeProjectCheck(f.config).prepare(f.material), output = f.candidate()
  output.outputPaths = [...paths]
  expect((await prepared!.evaluate(output)).status).toBe('unverifiable')
  expect(mock.run).not.toHaveBeenCalled()
})
it.each(['input', 'request', 'context', 'readonly', 'missing', 'extra', 'permission', 'null', 'oversize'] as const)('rejects project %s drift before invoking isolated execution', async change => {
  const f = fixture(), prepared = await createConversationIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition }).prepare(f.material), output = f.candidate()
  if (change === 'input') output.inputs[0]!.content = 'different preimage'
  if (change === 'request') output.request = []
  if (change === 'context') output.context = [{}] as never
  if (change === 'readonly') output.outputs[2]!.content = 'changed oracle entry'
  if (change === 'missing') output.outputs.pop()
  if (change === 'extra') output.outputs.push({ path: 'extra.js', content: '' })
  if (change === 'permission') output.outputPaths = ['entry.mjs']
  if (change === 'null') output.outputs[1]!.content = null as never
  if (change === 'oversize') output.outputs[0]!.content = 'x'.repeat(96 * 1024 + 1)
  const result = await prepared!.evaluate(output); expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest'); expect(mock.run).not.toHaveBeenCalled()
})
it.each(['json', 'stderr', 'exit', 'duplicate'] as const)('keeps a completed mandatory %s violation separate from infrastructure', async change => {
  const f = fixture(), prepared = await createConversationIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition }).prepare(f.material)
  mock.run.mockResolvedValue({ status: 'completed', stdout: change === 'json' ? '{}' : change === 'duplicate' ? '{"n":7,"n":7}' : '{"n":7}', stderr: change === 'stderr' ? 'error' : '', exitCode: change === 'exit' ? 2 : 0, receiptDigest: 'receipt' })
  expect(await prepared!.evaluate(f.candidate())).toMatchObject({ status: 'rejected', failedRequiredConditionDigest: sha256(condition) })
})
it.each(['unverifiable', 'source-rejected'] as const)('does not attribute %s as a proven mandatory failure', async status => {
  const f = fixture(), prepared = await createConversationIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition }).prepare(f.material); mock.run.mockResolvedValue({ status, detail: 'unsupported or incomplete' })
  const result = await prepared!.evaluate(f.candidate()); expect(result.status).toBe('unverifiable'); expect(result).not.toHaveProperty('failedRequiredConditionDigest')
})
it('prepares from saved study files after the original cwd disappears', async () => {
  const f = fixture(), check = createConversationStudyIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition, criteria: [condition] }); rmSync(f.cwd, { recursive: true })
  const prepared = await check.prepare(f.study); expect(prepared).toBeDefined(); expect((await prepared!.evaluate(f.studyCandidate())).status).toBe('verified')
})
it.each(['criteria', 'prompt', 'files', 'quality'] as const)('freezes the complete multi-file study %s material', async change => {
  const f = fixture(), prepared = await createConversationStudyIsolatedNodeProjectCheck({ ...f.config, requiredCondition: condition, criteria: [condition] }).prepare(f.study), output = f.studyCandidate()
  if (change === 'criteria') output.criteria = ['weakened']
  if (change === 'prompt') output.prompt = 'different'
  if (change === 'files') output.files.entries[0]!.content = 'changed preimage'
  if (change === 'quality') Object.assign(output, { qualityContract: { invalid: true } })
  expect((await prepared!.evaluate(output)).status).toBe('unverifiable'); expect(mock.run).not.toHaveBeenCalled()
})
function cohortFixture() {
  const f = fixture(), ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const cases = Object.fromEntries(ids.map((id, index) => {
    const common = { criteria: [`JSON n=${index+1}`], qualityContract: f.study.qualityContract, files: { ...f.study.files, entries: structuredClone(f.study.files.entries) } }
    const material: ConversationStudyResultMaterial = index < 3 ? { ...common, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `Original project ${index}` }] })], context: [], objective: `Project ${index}` } : { ...common, prompt: `Independent project ${index}` }
    return [id, { material, entryPath: 'entry.mjs', cases: [{ id: `case-${index}`, input: '{}', expectedJson: `{"n":${index+1}}`, exitCode: 0 }], isolated: f.config.isolated, requiredCondition: condition }]
  })) as unknown as Parameters<typeof createConversationStudyIsolatedNodeProjectCohortCheck>[0]['cases']
  const config = { modelConfigDigest: f.material.modelConfigDigest, cases }, check = createConversationStudyIsolatedNodeProjectCohortCheck(config)
  const host = { sources: [cases.source1.material, cases.source2.material], counterexample: cases.counterexample.material, cwd: f.cwd, qualityContract: f.study.qualityContract, modelConfigDigest: config.modelConfigDigest, signal: f.signal } as Parameters<NonNullable<typeof check.prepareIndependentCases>>[0]
  return { ...f, ids, cases, config, check, host }
}
it('binds five distinct saved multi-output roles and supplies original independent materials', async () => {
  const f = cohortFixture(), supplied = await f.check.prepareIndependentCases!(f.host); expect(supplied?.adjacent.files.outputPaths).toEqual(['first.ts', 'second.ts']); expect(mock.prepare).not.toHaveBeenCalled()
  const contracts = []
  for (const [index, id] of f.ids.entries()) {
    const material = f.cases[id].material, prepared = await f.check.prepare({ ...material, caseId: id, modelConfigDigest: f.config.modelConfigDigest, signal: f.signal }); expect(prepared).toBeDefined(); contracts.push(prepared!.contractDigest)
    const outputs = material.files.entries.map(entry => ({ ...entry, content: entry.content ?? 'export const n=7;' }))
    mock.run.mockResolvedValue({ status: 'completed', stdout: `{"n":${index+1}}`, stderr: '', exitCode: 0, receiptDigest: 'receipt' })
    expect((await prepared!.evaluate({ ...material, answer: '', inputs: material.files.entries, outputs, outputPaths: material.files.outputPaths, signal: f.signal })).status).toBe('verified')
  }
  expect(new Set(contracts).size).toBe(5); expect(mock.prepare).toHaveBeenCalledTimes(5); expect(mock.run).toHaveBeenCalledTimes(5)
})
it('binds native Goal originals in the same closed five-role program cohort without changing their identity',async()=>{
  const f=cohortFixture()
  const cases=structuredClone(f.cases)
  for(const id of ['source1','source2','counterexample'] as const) {
    const original=cases[id].material
    if(!('request' in original)) throw new Error('Original fixture unavailable')
    cases[id].material={sourceKind:'native-goal-task',prompt:JSON.stringify({protocol:'tianwen.native-goal-study-input.v1',originalCommand:'Complete the original projects.',
      goal:{objective:'Complete projects.',context:null,successCriteria:null},delegatedTask:original.objective}),
      criteria:original.criteria,qualityContract:original.qualityContract!,files:original.files}
  }
  const check=createConversationStudyIsolatedNodeProjectCohortCheck({...f.config,cases})
  const host={...f.host,sources:[cases.source1.material,cases.source2.material],counterexample:cases.counterexample.material} as typeof f.host
  expect(await check.prepareIndependentCases!(host)).toBeDefined()
  for(const [index,id] of f.ids.entries()) {
    const material=cases[id].material
    const prepared=await check.prepare({...material,caseId:id,modelConfigDigest:f.config.modelConfigDigest,signal:f.signal})
    expect(prepared).toBeDefined()
    mock.run.mockResolvedValue({status:'completed',stdout:`{"n":${index+1}}`,stderr:'',exitCode:0,receiptDigest:'receipt'})
    expect((await prepared!.evaluate({...material,answer:'Controlled output.',inputs:material.files.entries,
      outputs:material.files.entries.map(entry=>({...entry,content:entry.content??'export const n=7;'})),outputPaths:material.files.outputPaths,signal:f.signal})).status).toBe('verified')
  }
  const {sourceKind:_kind,...generic}=cases.source1.material as {sourceKind:string}&ConversationStudyResultMaterial
  expect(await check.prepare({...generic,caseId:'source1',modelConfigDigest:f.config.modelConfigDigest,signal:f.signal})).toBeUndefined()
  expect(()=>createConversationStudyIsolatedNodeProjectCohortCheck({...f.config,cases:{...cases,source2:f.cases.source2}})).toThrow()
})
it.each(['model', 'source', 'quality', 'role', 'files'] as const)('declines cohort %s drift without new preparation', async change => {
  const f = cohortFixture()
  if (change === 'model') { expect(await f.check.prepare({ ...f.cases.adjacent.material, caseId: 'adjacent', modelConfigDigest: sha256('other'), signal: f.signal })).toBeUndefined() }
  if (change === 'source') { const host = { ...f.host, sources: [...f.host.sources].reverse() } as typeof f.host; expect(await f.check.prepareIndependentCases!(host)).toBeUndefined() }
  if (change === 'quality') { const host = { ...f.host, qualityContract: { ...f.host.qualityContract, criterion: 'changed' } } as typeof f.host; expect(await f.check.prepareIndependentCases!(host)).toBeUndefined() }
  if (change === 'role') expect(await f.check.prepare({ ...f.cases.adjacent.material, caseId: 'source1', modelConfigDigest: f.config.modelConfigDigest, signal: f.signal })).toBeUndefined()
  if (change === 'files') { const material = structuredClone(f.cases.adjacent.material); Object.assign(material.files, { outputPaths: ['first.ts'] }); expect(await f.check.prepare({ ...material, caseId: 'adjacent', modelConfigDigest: f.config.modelConfigDigest, signal: f.signal })).toBeUndefined() }
  expect(mock.prepare).not.toHaveBeenCalled()
})
