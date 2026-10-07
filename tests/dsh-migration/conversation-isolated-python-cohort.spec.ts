import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@tianwen/dsh-compat'
import { baselineGuidanceSnapshot, conversationQualityContract, guidanceInputDigest, guidanceVersion, sha256, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/index.js'
import type { ConversationStudyResultMaterial, ConversationStudyResultPreparation } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { prepareConversationStudyResultChecks, evaluateConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import * as producers from '../../scripts/conversation-isolated-python-check.js'

import * as nodeProducers from '../../packages/tianwen-runtime-bundle/src/conversation-isolated-node-check.js'
const mock = vi.hoisted(() => ({ prepare: vi.fn(), run: vi.fn() }))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js', async original => ({
  ...await original<typeof import('../../packages/tianwen-runtime-bundle/src/isolated-python-cli.js')>(), prepareIsolatedPythonCli: mock.prepare,
}))
vi.mock('../../packages/tianwen-runtime-bundle/src/isolated-node-cli.js', async original => ({ ...await original<typeof import('../../packages/tianwen-runtime-bundle/src/isolated-node-cli.js')>(), prepareIsolatedNodeCli: mock.prepare }))
describe.each(['python', 'node'] as const)('fixed %s study cohort', engine => {
const producersForEngine = engine === 'python' ? producers : { createConversationStudyIsolatedPythonCheck: nodeProducers.createConversationStudyIsolatedNodeCheck, createConversationStudyIsolatedPythonCohortCheck: nodeProducers.createConversationStudyIsolatedNodeCohortCheck }
const extension = engine === 'python' ? 'py' : 'ts'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.resetAllMocks() })
const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
function fixture() {
  const base = 'D:/DevData/tianwen-functional-study-cohort-20261001/test-roots'
  mkdirSync(base, { recursive: true }); const cwd = mkdtempSync(join(base, 'cohort-')); roots.push(cwd)
  const modelConfigDigest = sha256('cohort-model'), qualityContract = conversationQualityContract(), signal = new AbortController().signal
  const cases = Object.fromEntries(ids.map((id, index) => {
    const prompt = `Implement task${index}.${extension}: JSON n must be ${index + 1}, per contract${index}.md.`
    const common = { criteria: [`Exact JSON integer ${index + 1}.`], qualityContract,
      files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd,
        entries: [{ path: `task${index}.${extension}`, content: null }, { path: `contract${index}.md`, content: `JSON n = ${index + 1}` }], outputPaths: [`task${index}.${extension}`] } }
    const material: ConversationStudyResultMaterial = index < 3
      ? { ...common, request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })], context: [], objective: `Implement task${index}.${extension}` }
      : { ...common, prompt }
    return [id, { material, requiredCondition: 'Implement the stated JSON contract exactly, with zero exit code and empty stderr.',
      cases: [{ id: `functional-${index}`, input: '{}', expectedJson: `{"n":${index + 1}}`, exitCode: 0 }],
      isolated: { cliPath: 'D:/unused.exe', endpoint: 'unix:///unused', imageRef: (engine === 'python' ? 'python' : 'node') + '@sha256:' + 'a'.repeat(64), imageId: 'sha256:' + 'a'.repeat(64), workRoot: join(cwd, 'receipts') } }]
  })) as unknown as Parameters<typeof producersForEngine.createConversationStudyIsolatedPythonCohortCheck>[0]['cases']
  mock.prepare.mockResolvedValue({ digest: 'b'.repeat(64), run: mock.run })
  mock.run.mockImplementation(async source => ({ status: 'completed', stdout: source, stderr: '', exitCode: 0, receiptDigest: 'c'.repeat(64) }))
  const config = { modelConfigDigest, cases }
  const preparation = (id: typeof ids[number]): ConversationStudyResultPreparation => ({ ...structuredClone(cases[id].material), caseId: id, modelConfigDigest, signal })
  const host = () => ({ sources: [cases.source1.material, cases.source2.material], counterexample: cases.counterexample.material,
    cwd, qualityContract, modelConfigDigest, signal }) as Parameters<NonNullable<ReturnType<typeof producersForEngine.createConversationStudyIsolatedPythonCohortCheck>['prepareIndependentCases']>>[0]
  return { cwd, config, cases, preparation, host, signal, modelConfigDigest, qualityContract }
}

it('demonstrates that one frozen producer cannot prepare five different saved requests and criteria', async () => {
  const f = fixture(), first = f.preparation('source1')
  if (!('request' in first)) throw new Error('missing original request')
  const check = producersForEngine.createConversationStudyIsolatedPythonCheck({ cwd: f.cwd, requestText: first.request[0]!.content.filter(block => block.type === 'text').map(block => block.text).join('\n'),
    targetPath: first.files.outputPaths[0]!, referencePaths: ['contract0.md'], criteria: first.criteria,
    ...f.cases.source1 })
  const prepared = await Promise.all(ids.map(id => check.prepare(f.preparation(id))))
  expect(prepared.map(Boolean)).toEqual([true, false, false, false, false]); expect(mock.prepare).toHaveBeenCalledTimes(1)
})

it('supplies frozen independent tasks and prepares five distinct functional contracts for ten arms', async () => {
  const f = fixture(), check = producersForEngine.createConversationStudyIsolatedPythonCohortCheck(f.config)
  const supplied = await check.prepareIndependentCases!(f.host())
  expect(supplied?.adjacent.prompt).toContain(`task3.${extension}`); expect(supplied?.holdout.prompt).toContain(`task4.${extension}`)
  expect(mock.prepare).not.toHaveBeenCalled()
  const materials = ids.map(id => {
    const value = f.cases[id].material
    if (!('request' in value)) return value
    const { feedbackStandard, ...rest } = value
    return { ...rest, ...(feedbackStandard === undefined ? {} : { feedbackStandard }) }
  }), parentSnapshot = baselineGuidanceSnapshot('cohort-controlled')
  const body: GuidanceStudyBody = { scopeKey: parentSnapshot.scopeKey, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot), family: 'code',
    evaluationMode: 'local-files', fileOutputKind: 'files', consentRevision: 1, failureCategory: 'instruction-following', sourceTaskIds: ['controlled-one', 'controlled-two'],
    counterexampleTaskId: 'controlled-three', modelConfigDigest: f.modelConfigDigest, cases: materials.map((material, index) => index < 3
      ? { id: ids[index]!, kind: (['source1', 'source2', 'counterexample'] as const)[index]!, sourceTaskId: ['controlled-one', 'controlled-two', 'controlled-three'][index]!, materialDigest: sha256(material), inputDigest: sha256(index) }
      : { id: ids[index]!, kind: index === 3 ? 'adjacent' : 'holdout', ...material as Extract<ConversationStudyResultMaterial, { prompt: string }>, materialDigest: sha256(material), inputDigest: guidanceInputDigest((material as { prompt: string }).prompt, material.files) }) }
  const prepared = await prepareConversationStudyResultChecks(check, body, materials, f.signal)
  expect(prepared.checks).toHaveLength(5); expect(mock.prepare).toHaveBeenCalledTimes(5); expect(new Set(prepared.checks.map(item => item.contractDigest)).size).toBe(5)
  for (const [index, id] of ids.entries()) {
    const outputs = (n: number) => f.cases[id].material.files.entries.map(entry => entry.path === `task${index}.${extension}` ? { ...entry, content: `{"n":${n}}` } : entry)
    const old = await evaluateConversationStudyResultCheck(prepared, id, { answer: '', files: outputs(index < 2 ? 99 : index + 1) }, f.signal)
    expect(old.status).toBe(index < 2 ? 'rejected' : 'verified')
    const current = await evaluateConversationStudyResultCheck(prepared, id, { answer: '', files: outputs(index + 1) }, f.signal)
    expect(current.status).toBe('verified')
  }
  expect(mock.run).toHaveBeenCalledTimes(10); expect(mock.prepare).toHaveBeenCalledTimes(5)
})

it.each(['source-order', 'source-request', 'source-context', 'source-objective', 'source-files', 'source-feedback', 'counter', 'model', 'quality', 'cwd'] as const)('declines changed cohort input (%s) without preparing any runner', async field => {
  const f = fixture(), check = producersForEngine.createConversationStudyIsolatedPythonCohortCheck(f.config), copied = structuredClone(f.host()), host = { ...copied, sources: [...copied.sources], signal: f.signal }
  if (field === 'source-order') Object.assign(host, { sources: [...host.sources].reverse() })
  if (field === 'source-request') host.sources[0] = { ...host.sources[0]!, request: [] }
  if (field === 'source-context') host.sources[0] = { ...host.sources[0]!, context: [{ id: 'changed', role: 'user', content: [] }] as never }
  if (field === 'source-objective') host.sources[0] = { ...host.sources[0]!, objective: 'changed' }
  if (field === 'source-files') Object.assign(host.sources[0]!.files!, { entries: [{ path: 'task0.py', content: 'different input' }] })
  if (field === 'source-feedback') host.sources[0] = { ...host.sources[0]!, feedbackStandard: { assessmentId: 'new', classification: 'preference', criteria: ['new'] } }
  if (field === 'counter') Object.assign(host, { counterexample: host.sources[0]! })
  if (field === 'model') Object.assign(host, { modelConfigDigest: sha256('different') })
  if (field === 'quality') Object.assign(host, { qualityContract: { ...host.qualityContract, criterion: 'different' } })
  if (field === 'cwd') Object.assign(host, { cwd: join(f.cwd, 'other') })
  expect(await check.prepareIndependentCases!(host)).toBeUndefined(); expect(mock.prepare).not.toHaveBeenCalled()
})

it.each(['case-id', 'model', 'prompt', 'criteria', 'inputs', 'quality'] as const)('rejects unregistered study preparation (%s) without fallback', async field => {
  const f = fixture(), check = producersForEngine.createConversationStudyIsolatedPythonCohortCheck(f.config), material = f.preparation('adjacent')
  if (field === 'case-id') Object.assign(material, { caseId: 'source1' })
  if (field === 'model') Object.assign(material, { modelConfigDigest: sha256('different') })
  if (field === 'prompt') Object.assign(material, { prompt: 'changed' })
  if (field === 'criteria') Object.assign(material, { criteria: ['changed'] })
  if (field === 'inputs') Object.assign(material.files.entries, { 0: { path: `task3.${extension}`, content: 'changed' } })
  if (field === 'quality') Object.assign(material, { qualityContract: { ...f.qualityContract, criterion: 'changed' } })
  expect(await check.prepare(material)).toBeUndefined(); expect(mock.prepare).not.toHaveBeenCalled()
})

it('clones all host material and expectations, preserves returned-task isolation, and uses saved files after the original directory disappears', async () => {
  const f = fixture(), check = producersForEngine.createConversationStudyIsolatedPythonCohortCheck(f.config), material = f.preparation('holdout'), host = { ...structuredClone(f.host()), signal: f.signal }
  Object.assign(f.config.cases.holdout.cases[0]!, { expectedJson: '{}' })
  Object.assign(f.config.cases.holdout.material, { criteria: ['mutated'] })
  const tasks = (await check.prepareIndependentCases!(host))!
  Object.assign(tasks.holdout.files.entries, { 0: { path: `task4.${extension}`, content: 'mutated returned task' } })
  expect((await check.prepareIndependentCases!(host))!.holdout.files.entries[0]!.content).toBeNull()
  rmSync(f.cwd, { recursive: true, force: true })
  const prepared = (await check.prepare(material))!
  const { caseId: _id, modelConfigDigest: _model, ...candidate } = material
  expect((await prepared.evaluate({ ...candidate, answer: '', inputs: material.files.entries, outputPaths: material.files.outputPaths,
    outputs: material.files.entries.map(entry => entry.path === `task4.${extension}` ? { ...entry, content: '{"n":5}' } : entry) })).status).toBe('verified')
})

it('propagates already-cancelled supply and preparation without infrastructure work', async () => {
  const f = fixture(), check = producersForEngine.createConversationStudyIsolatedPythonCohortCheck(f.config), controller = new AbortController(); controller.abort()
  await expect(check.prepareIndependentCases!({ ...f.host(), signal: controller.signal })).rejects.toThrow()
  await expect(check.prepare({ ...f.preparation('source1'), signal: controller.signal })).rejects.toThrow()
  expect(mock.prepare).not.toHaveBeenCalled()
})

})
