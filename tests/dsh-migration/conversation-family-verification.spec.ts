import { expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  effectiveConversationFamily, parseConversationFamilyVerification, parseConversationLearningRecord,
  type ConversationTask,
} from '../../packages/tianwen-evolution/src/conversation-learning.js'

const proof = (name: string) => ({ sessionId: name, sessionDigest: sha256(`session:${name}`), requestDigest: sha256(`request:${name}`) })
const initialProof = proof('initial')
const check = (family: 'summarization' | 'writing' | 'other', name: string) => ({ family, quote: '写一段简短的进度摘要', proof: proof(name) })

it('confirms an initial summary or writing family with a separate native vote', () => {
  for (const family of ['summarization', 'writing'] as const) {
    const result = parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
      checks: [check(family, `confirm-${family}`)], resolvedFamily: family, unavailableReason: null }, family, initialProof)
    expect(result.resolvedFamily).toBe(family)
  }
})

it('corrects an initial other or writing family only with two independent summary votes', () => {
  for (const family of ['other', 'writing'] as const) {
    const result = parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
      checks: [check('summarization', `${family}-second`), check('summarization', `${family}-third`)],
      resolvedFamily: 'summarization', unavailableReason: null }, family, initialProof)
    expect(result.resolvedFamily).toBe('summarization')
  }
})

it('leaves a three-way disagreement or an unavailable tie-break unresolved', () => {
  const divided = parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'second'), check('writing', 'third')], resolvedFamily: null, unavailableReason: null }, 'other', initialProof)
  expect(divided.resolvedFamily).toBeNull()
  const unavailable = parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'second')], resolvedFamily: null, unavailableReason: 'model-unavailable' }, 'other', initialProof)
  expect(unavailable.resolvedFamily).toBeNull()
  expect(() => parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'second')], resolvedFamily: 'summarization', unavailableReason: null }, 'other', initialProof)).toThrow()
})

it('rejects reused or malformed native proof', () => {
  expect(() => parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'initial')], resolvedFamily: 'summarization', unavailableReason: null }, 'summarization', initialProof)).toThrow()
  expect(() => parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'second'), check('summarization', 'second')],
    resolvedFamily: 'summarization', unavailableReason: null }, 'other', initialProof)).toThrow()
  expect(() => parseConversationFamilyVerification({ schemaVersion: 'tianwen.family-verification.v1',
    checks: [{ ...check('summarization', 'second'), quote: ' ' }],
    resolvedFamily: 'summarization', unavailableReason: null }, 'summarization', initialProof)).toThrow()
})

it('requires verification only for new marked text tasks and preserves old family reads', () => {
  const base = { kind: 'task-admitted' as const, taskId: 'task-1', decision: {
    kind: 'task' as const, objective: 'Summarize facts', criteria: ['Keep facts'], family: 'other' as const,
    evaluationMode: 'text' as const, relatedTaskId: null, feedback: null,
  }, proof: initialProof, unavailableReason: null }
  const markedSource = { kind: 'task-started' as const, taskId: 'task-1', admissionPolicy: 'tianwen.family-verification.v1' as const }
  const historical = { source: { kind: 'task-started', taskId: 'task-1' }, admission: base } as unknown as ConversationTask
  expect(effectiveConversationFamily(historical)).toBe('other')
  expect(() => parseConversationLearningRecord({ ...base, familyVerification: { schemaVersion: 'tianwen.family-verification.v1',
    checks: [check('summarization', 'second'), check('summarization', 'third')],
    resolvedFamily: 'summarization', unavailableReason: null } })).not.toThrow()
  const resolved = { source: markedSource, admission: { ...base, familyVerification: {
    schemaVersion: 'tianwen.family-verification.v1', checks: [check('summarization', 'second'), check('summarization', 'third')],
    resolvedFamily: 'summarization', unavailableReason: null,
  } } } as unknown as ConversationTask
  expect(effectiveConversationFamily(resolved)).toBe('summarization')
  expect(effectiveConversationFamily({ ...resolved, admission: { ...resolved.admission!, familyVerification: {
    ...resolved.admission!.familyVerification!, resolvedFamily: null,
  } } })).toBeNull()
  const stillOther = { ...resolved, admission: { ...resolved.admission!, familyVerification: {
    ...resolved.admission!.familyVerification!, resolvedFamily: 'other' as const,
  } } }
  expect(effectiveConversationFamily(stillOther)).toBeNull()
})
