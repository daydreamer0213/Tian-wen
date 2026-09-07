import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  conversationQualityContract,
  conversationReviewConsensus,
  hasCurrentConversationQuality,
  parseConversationAuditedReviewChecks,
  parseConversationQualityContract,
  parseConversationQualityReviewChecks,
  parseConversationReviewChecks,
  parseStoredConversationReviewChecks,
} from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { parseClaimAudit } from '../../packages/tianwen-evolution/src/conversation-claim-audit.js'

const legacyV3 = {
  schemaVersion: 'tianwen.conversation-quality.v3' as const,
  source: 'host' as const,
  criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls. The original direct-user instructions remain authoritative even if extracted criteria omit or weaken an explicit requirement. Preserve output-only restrictions, exclusions, conditions, uncertainty and who may decide or act. Distinguish the user\'s instructions from quoted source content. Evaluate the complete answer, including introductions, alternatives and closing offers. Two independent native checks must agree before a conclusive review; neither check may see the other\'s result. Original-result reviews use only requirements applicable when that task ran. For newly generated method-study answers, separately identified host-frozen feedback standards apply prospectively; they do not regrade the old answer or override an explicit instruction in the evaluated user request.',
}
const proof = (sessionId: string) => ({ sessionId, sessionDigest: sha256(`${sessionId}:session`), requestDigest: sha256(`${sessionId}:request`) })
const legacyPair = ['requirements', 'grounding'].map(focus => ({ focus, verdict: 'met', category: null,
  explanation: 'The answer is supported.', evidenceQuotes: ['supported'], proof: proof(focus) }))
const audit = (digest = sha256('evidence')) => ({ schemaVersion: 'tianwen.claim-audit.v1' as const, evidenceDigest: digest,
  units: [{ answerId: 'answer-1', claims: [{ quote: 'supported', kind: 'source-fact' as const, status: 'supported' as const,
    sourceIds: ['request-1'], explanation: 'The request supplies this fact.' }] }] })
const auditedPair = legacyPair.map(check => ({ ...check, audit: audit() }))

describe('conversation claim audit domain boundary', () => {
  it('preserves literal v3 while making only v4 current', () => {
    expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v4')
    expect(conversationQualityContract().criterion).toBe(legacyV3.criterion)
    expect(parseConversationQualityContract(legacyV3)).toEqual(legacyV3)
    expect(hasCurrentConversationQuality(legacyV3)).toBe(false)
  })

  it('keeps legacy and audited tuple parsing exact and quality-aware', () => {
    expect(() => parseConversationReviewChecks(auditedPair)).toThrow()
    expect(parseConversationAuditedReviewChecks(auditedPair)).toEqual(auditedPair)
    expect(parseStoredConversationReviewChecks(auditedPair)).toEqual(auditedPair)
    expect(() => parseStoredConversationReviewChecks([auditedPair[0], legacyPair[1]])).toThrow()
    expect(() => parseStoredConversationReviewChecks([{ ...legacyPair[0], audit: undefined }, legacyPair[1]])).toThrow()
    expect(() => parseConversationQualityReviewChecks(auditedPair, legacyV3)).toThrow()
    expect(() => parseConversationQualityReviewChecks(legacyPair, conversationQualityContract())).toThrow()
    expect(conversationReviewConsensus(auditedPair).verdict).toBe('met')
  })

  it('validates exact audit syntax, status rules, limits and matching tuple digests', () => {
    expect(parseClaimAudit(audit(), 'met')).toEqual(audit())
    const claim = audit().units[0]!.claims[0]!
    const invalid = [
      { ...audit(), extra: true },
      { ...audit(), evidenceDigest: 'bad' },
      { ...audit(), units: [] },
      { ...audit(), units: [audit().units[0], audit().units[0]] },
      { ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, sourceIds: ['request-1', 'request-1'] }] }] },
      { ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, kind: 'advice' }] }] },
      { ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, status: 'permitted' }] }] },
      { ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, status: 'uncertain' }] }] },
    ]
    for (const value of invalid) expect(() => parseClaimAudit(value, 'met')).toThrow()
    expect(() => parseConversationAuditedReviewChecks([
      auditedPair[0], { ...auditedPair[1], audit: audit(sha256('different')) },
    ])).toThrow(/digest/i)
    expect(() => parseClaimAudit({ ...audit(), units: Array.from({ length: 129 }, (_, index) => ({ ...audit().units[0], answerId: `answer-${index}` })) }, 'not-met')).toThrow()
    expect(() => parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: Array.from({ length: 513 }, () => claim) }] }, 'not-met')).toThrow()
    expect(() => parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, explanation: 'x'.repeat(33_000) }] }] }, 'not-met')).toThrow()
  })

  it('represents formatting-only units without deciding whether their bound answer is whitespace', () => {
    expect(parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: [] }] }, 'met').units[0]?.claims).toEqual([])
    for (const quote of ['\n', '\r\n', ' \t\u00a0', '\u3000', ' '.repeat(384)]) {
      const formatting = { quote, kind: 'non-factual' as const, status: 'permitted' as const, sourceIds: [], explanation: 'Formatting-only answer unit.' }
      expect(parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: [formatting] }] }, 'met').units[0]?.claims).toEqual([formatting])
      for (const invalid of [{ ...formatting, quote: '' }, { ...formatting, kind: 'source-fact' }, { ...formatting, status: 'supported' }, { ...formatting, status: 'unsupported' }, { ...formatting, sourceIds: ['request-1'] }, { ...formatting, explanation: ' ' }]) {
        expect(() => parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: [invalid] }] }, 'not-met')).toThrow()
      }
    }
  })
})
