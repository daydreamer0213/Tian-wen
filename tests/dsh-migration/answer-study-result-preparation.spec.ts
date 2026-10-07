import { expect, it, vi } from 'vitest'
import * as checks from '../../packages/tianwen-runtime-bundle/src/conversation-study-result-check.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import type { GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'

const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
function fixture(fileChat = false) {
  const materials = ids.map(id => ({ prompt: `Use only the original record ${id}: outcome pending, not failed.`,
    criteria: ['Do not upgrade pending to failure.'], ...(fileChat ? { files: {
      schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'chat' as const,
      cwd: 'D:/DevData/engineering-answer-prepare', entries: [{ path: 'record.txt', content: `Pending original ${id}.` }], outputPaths: [],
    } } : {}) }))
  const cases = materials.map((material, index) => index < 3
    ? { id: ids[index]!, kind: ids[index]!, sourceTaskId: `task-${index}`, materialDigest: sha256(material), inputDigest: sha256(material.prompt) }
    : { id: ids[index]!, kind: ids[index]!, ...material, materialDigest: sha256(material), inputDigest: sha256(material.prompt) })
  const body = { family: 'summarization', cases, modelConfigDigest: sha256('model'),
    ...(fileChat ? { evaluationMode: 'local-files', fileOutputKind: 'chat' } : {}) } as unknown as GuidanceStudyBody
  const evaluate = vi.fn(async () => ({ status: 'verified' as const, detail: 'Full engineering contract passed.' }))
  const prepare = vi.fn(async (input: { material: unknown }) => ({ checkerId: 'frozen-answer', checkerDigest: sha256('checker'),
    contractDigest: sha256(input.material), inputsDigest: sha256(input.material), requiredCondition: 'Do not upgrade pending to failure.', evaluate }))
  return { materials, body, prepare, evaluate, controller: new AbortController() }
}
it.each([false, true])('prepares five complete contracts once and shares the frozen checker across both answers: fileChat=%s', async fileChat => {
  const f = fixture(fileChat)
  const prepared = await checks.prepareConversationAnswerStudyResultChecks({ prepare: f.prepare }, f.body, f.materials, f.controller.signal)
  expect(prepared.checks).toHaveLength(5)
  expect(f.prepare).toHaveBeenCalledTimes(5)
  const input = f.prepare.mock.calls[0]![0]
  expect(input.material).toEqual(f.materials[0])
  expect(input).not.toHaveProperty('answer'); expect(input).not.toHaveProperty('guidance')
  ;(input.material as { prompt: string }).prompt = 'host mutation'
  for (const answer of ['baseline actual', 'candidate actual']) await checks.evaluateConversationStudyResultCheck(prepared, 'source1', {
    answer, files: fileChat ? f.materials[0]!.files!.entries : [],
  }, f.controller.signal)
  expect(f.evaluate).toHaveBeenCalledTimes(2)
  const received = f.evaluate.mock.calls as unknown as [{ material: unknown, answer: string }][]
  expect(received[0]![0].material).toEqual(f.materials[0])
  expect(received.map(call => call[0].answer)).toEqual(['baseline actual', 'candidate actual'])
  expect(received[0]![0]).not.toHaveProperty('role'); expect(received[0]![0]).not.toHaveProperty('verdict')
})
it('stops a substituted preparation before returning check metadata', async () => {
  const f = fixture(), prepare = async (input: { material: unknown }) => ({ ...(await f.prepare(input)), inputsDigest: sha256('substitute') })
  await expect(checks.prepareConversationAnswerStudyResultChecks({ prepare }, f.body, f.materials, f.controller.signal)).rejects.toThrow('source-unavailable')
  expect(f.evaluate).not.toHaveBeenCalled()
})
it('stops when any full case is unavailable without evaluating an answer', async () => {
  const f = fixture(); f.prepare.mockResolvedValueOnce(undefined as never)
  await expect(checks.prepareConversationAnswerStudyResultChecks({ prepare: f.prepare }, f.body, f.materials, f.controller.signal)).rejects.toThrow('source-unavailable')
  expect(f.evaluate).not.toHaveBeenCalled()
})
it('rejects post-freeze original material drift before calling the trusted host', async () => {
  const f = fixture(), changed = structuredClone(f.materials); changed[0]!.criteria = ['Weakened after freezing.']
  await expect(checks.prepareConversationAnswerStudyResultChecks({ prepare: f.prepare }, f.body, changed, f.controller.signal)).rejects.toThrow('source-unavailable')
  expect(f.prepare).not.toHaveBeenCalled()
})
it('does not prepare an already cancelled answer study', async () => {
  const f = fixture(); f.controller.abort()
  await expect(checks.prepareConversationAnswerStudyResultChecks({ prepare: f.prepare }, f.body, f.materials, f.controller.signal)).rejects.toThrow()
  expect(f.prepare).not.toHaveBeenCalled()
})
