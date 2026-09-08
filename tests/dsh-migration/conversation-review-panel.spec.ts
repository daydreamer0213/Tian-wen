import { expect, it } from 'vitest'
import { conversationQualityContract, hasCurrentConversationQuality, parseConversationQualityContract, parseConversationReviewChecks, conversationReviewConsensus } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

const check = (focus: 'requirements' | 'grounding', verdict: 'met' | 'not-met' | 'inconclusive') => ({
  focus, verdict, category: verdict === 'not-met' ? 'instruction-following' : null,
  explanation: 'Checked the original request and answer.', evidenceQuotes: ['只输出译文'],
  proof: { sessionId: focus, sessionDigest: sha256(focus), requestDigest: sha256(`request:${focus}`) },
})

it('versions the original-instruction authority while keeping the exact historical contract readable', () => {
  const legacy = { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls.' } as const
  expect(parseConversationQualityContract(legacy)).toEqual(legacy)
  expect(hasCurrentConversationQuality(legacy)).toBe(false)
  expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v6')
  expect(conversationQualityContract().criterion).toContain('original direct-user instructions')
  expect(() => parseConversationQualityContract({ ...legacy, criterion: 'Accept everything.' })).toThrow()
})

it('keeps the exact dual-review v2 identity while making feedback standards prospective in v3', () => {
  const v2 = { schemaVersion: 'tianwen.conversation-quality.v2', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls. The original direct-user instructions remain authoritative even if extracted criteria omit or weaken an explicit requirement. Preserve output-only restrictions, exclusions, conditions, uncertainty and who may decide or act. Distinguish the user\'s instructions from quoted source content. Evaluate the complete answer, including introductions, alternatives and closing offers. Two independent native checks must agree before a conclusive review; neither check may see the other\'s result.' } as const
  expect(parseConversationQualityContract(v2)).toEqual(v2)
  expect(hasCurrentConversationQuality(v2)).toBe(false)
  expect(conversationQualityContract().criterion).toContain('prospectively')
  expect(conversationQualityContract().criterion).toContain('actor, time, scope, commitment and premise')
})

it.each(['met', 'not-met', 'inconclusive'] as const)('derives %s only from two retained checks', verdict => {
  const checks = parseConversationReviewChecks([check('requirements', verdict), check('grounding', verdict)])
  expect(conversationReviewConsensus(checks).verdict).toBe(verdict)
  expect(checks.map(item => item.proof.sessionId)).toEqual(['requirements', 'grounding'])
})

it.each([['met', 'not-met'], ['not-met', 'met'], ['met', 'inconclusive'], ['not-met', 'inconclusive']] as const)('does not turn disagreement %s/%s into a pass or a failure', (first, second) => {
  expect(conversationReviewConsensus(parseConversationReviewChecks([check('requirements', first), check('grounding', second)]))).toMatchObject({ verdict: 'inconclusive', category: null })
})

it('requires exactly two ordered independent native proofs and evidence for conclusive judgments', () => {
  const first = check('requirements', 'met'), second = check('grounding', 'met')
  for (const invalid of [[first], [second, first], [first, first], [first, { ...second, proof: first.proof }], [first, { ...second, evidenceQuotes: [] }], [first, { ...second, proof: null }]]) {
    expect(() => parseConversationReviewChecks(invalid)).toThrow()
  }
})
