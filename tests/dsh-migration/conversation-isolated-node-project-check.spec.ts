import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { conversationQualityContract, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodePreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-external-check.js'
import type { ConversationStudyResultMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { createConversationIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCheck, createConversationStudyIsolatedNodeProjectCohortCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-node-project-check.js'

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
