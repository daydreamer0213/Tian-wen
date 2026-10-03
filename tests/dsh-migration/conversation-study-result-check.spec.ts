import { expect, it, vi } from 'vitest'
import { sha256, baselineGuidanceSnapshot, guidanceVersion, guidanceInputDigest, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/index.js'
import { prepareConversationStudyResultChecks, evaluateConversationStudyResultCheck,
  type ConversationStudyResultCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'

function fixture() {
  const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
  const materials = ids.map(prompt => ({ prompt, criteria: ['Preserve the frozen value.'], files: {
    schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const, cwd: 'D:/DevData/owned-fixture',
    entries: [{ path: 'input.txt', content: prompt }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'],
  } }))
  const parentSnapshot = baselineGuidanceSnapshot('controlled-study-check')
  const body: GuidanceStudyBody = { scopeKey: parentSnapshot.scopeKey, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot),
    family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files', consentRevision: 1, failureCategory: 'instruction-following',
    sourceTaskIds: ['one', 'two'], counterexampleTaskId: 'three', modelConfigDigest: sha256('model'),
    cases: materials.map((material, index) => index < 3 ? {
      id: ids[index]!, kind: (['source1', 'source2', 'counterexample'] as const)[index]!, sourceTaskId: ['one', 'two', 'three'][index]!,
      materialDigest: sha256(material), inputDigest: guidanceInputDigest(material.prompt, material.files),
    } : { id: ids[index]!, kind: index === 3 ? 'adjacent' : 'holdout', ...material,
      materialDigest: sha256(material), inputDigest: guidanceInputDigest(material.prompt, material.files) }),
  }
  const evaluate = vi.fn(async () => ({ status: 'verified' as const, detail: 'Frozen exact value present.' }))
  const check: ConversationStudyResultCheck = { prepare: vi.fn(async material => ({ checkerId: 'owned-fixture', checkerDigest: sha256('checker'),
    contractDigest: sha256(material.files.entries), inputs: material.files.entries, requiredCondition: 'Preserve the frozen value.', evaluate })) }
  return { body, materials, check, evaluate, controller: new AbortController() }
}

it('keeps a single frozen checker for both outputs and isolates mutable host arguments', async () => {
  const f = fixture()
  const saved = await prepareConversationStudyResultChecks(f.check, f.body, f.materials, f.controller.signal)
  expect(saved.checks).toHaveLength(5); expect(f.check.prepare).toHaveBeenCalledTimes(5)
  const argument = vi.mocked(f.check.prepare).mock.calls[0]![0]
  expect(argument).not.toHaveProperty('answer'); expect(argument).not.toHaveProperty('guidance')
  ;(argument.files.entries as { path: string, content: string | null }[])[0]!.content = 'host mutation'
  for (const answer of ['baseline actual', 'candidate actual']) await evaluateConversationStudyResultCheck(saved, 'source1', {
    answer, files: [{ path: 'output.txt', content: answer }],
  }, f.controller.signal)
  expect(f.evaluate).toHaveBeenCalledTimes(2)
  const received = vi.mocked(f.evaluate).mock.calls as unknown as [import('../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js').ConversationStudyResultCandidate][]
  expect(received[0]![0].inputs).toEqual(f.materials[0]!.files.entries)
  expect(received[0]![0]).not.toHaveProperty('role'); expect(received[0]![0]).not.toHaveProperty('verdict')
})
it('preserves original native Goal identity for the prepared host check and both outputs', async () => {
  const f=fixture()
  const materials=f.materials.map((material,index)=>index<3 ? {...material,sourceKind:'native-goal-task' as const,
    prompt:JSON.stringify({protocol:'tianwen.native-goal-study-input.v1',originalCommand:'Complete the supplied original tasks.',
      goal:{objective:'Complete original tasks.',context:null,successCriteria:null},delegatedTask:material.prompt})} : material)
  const body={...f.body,cases:f.body.cases.map((item,index)=>({...item,materialDigest:sha256(materials[index]),inputDigest:guidanceInputDigest(materials[index]!.prompt,materials[index]!.files)}))}
  const prepared=await prepareConversationStudyResultChecks(f.check,body,materials,f.controller.signal)
  expect(vi.mocked(f.check.prepare).mock.calls[0]![0]).toHaveProperty('sourceKind','native-goal-task')
  await evaluateConversationStudyResultCheck(prepared,'source1',{answer:'Actual trial result.',files:materials[0]!.files.entries},f.controller.signal)
  expect(vi.mocked(f.evaluate).mock.calls[0]![0]).toHaveProperty('sourceKind','native-goal-task')
})
it('rejects preparation with substituted complete inputs before returning any study metadata', async () => {
  const f = fixture(), original = f.check.prepare
  const check: ConversationStudyResultCheck = { async prepare(material) {
    const prepared = (await original(material))!
    return { ...prepared, inputs: [{ path: 'input.txt', content: 'substituted' }] }
  } }
  await expect(prepareConversationStudyResultChecks(check, f.body, f.materials, f.controller.signal)).rejects.toThrow('source-unavailable')
  expect(f.evaluate).not.toHaveBeenCalled()
})
it('refuses a changed case material before invoking the host', async () => {
  const f = fixture(), changed = structuredClone(f.materials)
  changed[0]!.criteria = ['Weakened condition.']
  await expect(prepareConversationStudyResultChecks(f.check, f.body, changed, f.controller.signal)).rejects.toThrow('source-unavailable')
  expect(f.check.prepare).not.toHaveBeenCalled()
})
for (const outcome of [{ status: 'verified', detail: '', }, { status: 'rejected', detail: 'Wrong original condition.', failedRequiredConditionDigest: sha256('another condition') }]) {
  it(`retains invalid host outcome as unverifiable: ${outcome.status}`, async () => {
    const f = fixture()
    f.evaluate.mockImplementation(async () => outcome as Awaited<ReturnType<typeof f.evaluate>>)
    const saved = await prepareConversationStudyResultChecks(f.check, f.body, f.materials, f.controller.signal)
    expect((await evaluateConversationStudyResultCheck(saved, 'source1', { answer: 'actual', files: [] }, f.controller.signal)).status).toBe('unverifiable')
  })
}
it('does not prepare an already cancelled study', async () => {
  const f = fixture(); f.controller.abort()
  await expect(prepareConversationStudyResultChecks(f.check, f.body, f.materials, f.controller.signal)).rejects.toThrow()
  expect(f.check.prepare).not.toHaveBeenCalled()
})
it('does not retain a late preparation after cancellation', async () => {
  const f = fixture(), original = f.check.prepare
  const check: ConversationStudyResultCheck = { async prepare(material) { f.controller.abort(); return original(material) } }
  await expect(prepareConversationStudyResultChecks(check, f.body, f.materials, f.controller.signal)).rejects.toThrow()
  expect(f.evaluate).not.toHaveBeenCalled()
})
it('does not turn cancellation into an unverifiable result receipt', async () => {
  const f = fixture(), saved = await prepareConversationStudyResultChecks(f.check, f.body, f.materials, f.controller.signal)
  f.evaluate.mockImplementation(async () => { f.controller.abort(); return { status: 'verified', detail: 'late' } })
  await expect(evaluateConversationStudyResultCheck(saved, 'source1', { answer: 'actual', files: [] }, f.controller.signal)).rejects.toThrow()
})
it('preserves a bounded producer cleanup promise through formal study preparation and cancellation', async () => {
  const f = fixture(), original = f.check.prepare
  let release!: () => void, entered!: () => void
  const held = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  const check: ConversationStudyResultCheck = { async prepare(material) { return { ...(await original(material))!, waitsForCancellationCleanup: true,
    async evaluate(candidate) { entered(); await held; candidate.signal.throwIfAborted(); return { status: 'verified', detail: 'Cleanup complete.' } },
  } } }
  const saved = await prepareConversationStudyResultChecks(check, f.body, f.materials, f.controller.signal)
  let settled = false
  const pending = evaluateConversationStudyResultCheck(saved, 'source1', { answer: 'actual', files: [] }, f.controller.signal)
  pending.catch(() => { settled = true }); await started; f.controller.abort()
  await new Promise(resolve => setTimeout(resolve, 5)); const endedBeforeCleanup = settled
  release(); await expect(pending).rejects.toThrow(); expect(endedBeforeCleanup).toBe(false)
})
