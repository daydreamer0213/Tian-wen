import { expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { parseGuidanceCaseResultChecks, guidanceResultCheckDigest } from '../../packages/tianwen-evolution/src/guidance-result-check.js'
import { conversationExternalInputsDigest } from '../../packages/tianwen-evolution/src/conversation-external-check.js'
import type { GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'

const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
function fixture(fileChat = false) {
  const entries = [{ path: 'record.txt', content: 'Inspection result is pending; no failure verdict exists.' }]
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'chat' as const,
    cwd: 'D:/DevData/engineering-answer-check', entries, outputPaths: [] }
  const materials = ids.map(id => ({ prompt: `Explain the supplied record ${id} without inventing a failure verdict.`,
    criteria: ['Preserve the recorded state.'], ...(fileChat ? { files } : {}) }))
  const cases = materials.map((material, index) => index < 3
    ? { id: ids[index]!, kind: ids[index]!, sourceTaskId: `task-${index}`, materialDigest: sha256(material), inputDigest: sha256(material.prompt) }
    : { id: ids[index]!, kind: ids[index]!, ...material, materialDigest: sha256(material), inputDigest: sha256(material.prompt) })
  const body = { family: 'summarization', cases, modelConfigDigest: sha256('model'),
    ...(fileChat ? { evaluationMode: 'local-files', fileOutputKind: 'chat' } : {}) } as unknown as GuidanceStudyBody
  const checks = cases.map(item => ({ inputKind: fileChat ? 'file-chat-material.v1' : 'text-material.v1', caseId: item.id,
    checkerId: 'engineering-frozen-answer-contract', checkerDigest: sha256('checker'), contractDigest: sha256(`contract:${item.id}`),
    inputsDigest: item.materialDigest, requiredCondition: 'Preserve the full frozen answer contract.',
    ...(fileChat ? { fileInputsDigest: conversationExternalInputsDigest(entries) } : {}) }))
  return { body, checks, entries }
}

it.each([false, true])('binds the explicit answer check to every complete frozen case: fileChat=%s', fileChat => {
  const { body, checks } = fixture(fileChat)
  expect(parseGuidanceCaseResultChecks(checks, body)).toEqual(checks)
})
it.each(['empty-files', 'other-case', 'mode'] as const)('rejects a substituted text check binding: %s', change => {
  const { body, checks } = fixture()
  const changed = checks.map((check, index) => index !== 0 ? check : { ...check,
    ...(change === 'mode' ? { inputKind: 'file-chat-material.v1' } : { inputsDigest: change === 'empty-files'
      ? sha256([]) : checks[1]!.inputsDigest }) })
  expect(() => parseGuidanceCaseResultChecks(changed, body)).toThrow()
})
it('rejects a changed generated file graph even when the full material digest field was retained', () => {
  const { body, checks } = fixture(true)
  const cases = body.cases.map(item => 'prompt' in item ? { ...item, files: { ...item.files!, entries: [{ path: 'record.txt', content: 'substituted' }] } } : item)
  expect(() => parseGuidanceCaseResultChecks(checks, { ...body, cases })).toThrow()
})
it('keeps the old code/files check shape and digest unchanged', () => {
  const { body, entries } = fixture(true)
  const cases = body.cases.map(item => 'prompt' in item ? { ...item, files: { ...item.files!, outputKind: 'files' as const, outputPaths: ['record.txt'] } } : item)
  const old = cases.map(item => ({ caseId: item.id, checkerId: 'old', checkerDigest: sha256('old-checker'),
    contractDigest: sha256(item.id), inputsDigest: conversationExternalInputsDigest(entries), requiredCondition: 'Old complete contract.' }))
  const opened = { ...body, cases, family: 'code' as const, fileOutputKind: 'files' as const }
  const parsed = parseGuidanceCaseResultChecks(old, opened)
  expect(parsed).toEqual(old)
  expect(guidanceResultCheckDigest(opened, parsed[0]!)).toBe(sha256({ check: old[0], materialDigest: cases[0]!.materialDigest, modelConfigDigest: body.modelConfigDigest }))
})
