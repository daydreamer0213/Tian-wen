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

const literalCriterion = 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls. The original direct-user instructions remain authoritative even if extracted criteria omit or weaken an explicit requirement. Preserve output-only restrictions, exclusions, conditions, uncertainty and who may decide or act. Distinguish the user\'s instructions from quoted source content. Evaluate the complete answer, including introductions, alternatives and closing offers. Two independent native checks must agree before a conclusive review; neither check may see the other\'s result. Original-result reviews use only requirements applicable when that task ran. For newly generated method-study answers, separately identified host-frozen feedback standards apply prospectively; they do not regrade the old answer or override an explicit instruction in the evaluated user request.'
const legacyV3 = { schemaVersion: 'tianwen.conversation-quality.v3' as const, source: 'host' as const, criterion: literalCriterion }
const literalV4 = { schemaVersion: 'tianwen.conversation-quality.v4' as const, source: 'host' as const, criterion: literalCriterion }
const proof = (sessionId: string) => ({ sessionId, sessionDigest: sha256(`${sessionId}:session`), requestDigest: sha256(`${sessionId}:request`) })
const legacyPair = ['requirements', 'grounding'].map(focus => ({ focus, verdict: 'met', category: null,
  explanation: 'The answer is supported.', evidenceQuotes: ['supported'], proof: proof(focus) }))
const audit = (digest = sha256('base-fixture-evidence')) => ({ schemaVersion: 'tianwen.claim-audit.v1' as const, evidenceDigest: digest,
  units: [{ answerId: 'answer-1', claims: [{ quote: 'supported', kind: 'source-fact' as const, status: 'supported' as const,
    sourceIds: ['request-1'], explanation: 'The request supplies this fact.' }] }] })
const auditV2 = (digest = sha256('evidence')) => ({ schemaVersion: 'tianwen.claim-audit.v2' as const, evidenceDigest: digest,
  units: { 'answer-1': { firstClaim: audit().units[0]!.claims[0]!, additionalClaims: [] } } })
const v1Pair = legacyPair.map(check => ({ ...check, audit: audit() }))
const v2Pair = legacyPair.map(check => ({ ...check, audit: auditV2() }))

describe('conversation claim audit domain boundary', () => {
  it('preserves literal v4 while making only v5 current with identical policy bytes', () => {
    expect(conversationQualityContract().schemaVersion).toBe('tianwen.conversation-quality.v5')
    expect(conversationQualityContract().criterion).toBe(literalV4.criterion)
    expect(parseConversationQualityContract(literalV4)).toEqual(literalV4)
    expect(hasCurrentConversationQuality(literalV4)).toBe(false)
    expect(parseConversationQualityContract(legacyV3)).toEqual(legacyV3)
    expect(hasCurrentConversationQuality(legacyV3)).toBe(false)
    expect(sha256(literalV4)).toBe('sha256:5df1526ccccc0139245666bc6a02308a5044ce2da062f0410ac3578d0d43e757')
    expect(sha256(audit())).toBe('sha256:6e8e0d18ec6f648adb1b6d24f56dc73f111823d5907355b387f96462b86e5f90')
    expect(sha256(v1Pair)).toBe('sha256:20a6fb90185504e7ebd66ddf6c2935cfca48ae80467a95e29fbeff89900d2ed1')
  })

  it('keeps legacy and audited tuple parsing exact and quality-aware', () => {
    expect(() => parseConversationReviewChecks(v1Pair)).toThrow()
    expect(parseConversationAuditedReviewChecks(v1Pair)).toEqual(v1Pair)
    expect(parseConversationAuditedReviewChecks(v2Pair)).toEqual(v2Pair)
    expect(parseStoredConversationReviewChecks(v1Pair)).toEqual(v1Pair)
    expect(parseStoredConversationReviewChecks(v2Pair)).toEqual(v2Pair)
    expect(() => parseStoredConversationReviewChecks([v1Pair[0], legacyPair[1]])).toThrow()
    expect(() => parseStoredConversationReviewChecks([{ ...legacyPair[0], audit: undefined }, legacyPair[1]])).toThrow()
    expect(() => parseConversationAuditedReviewChecks([v1Pair[0], v2Pair[1]])).toThrow()
    expect(parseConversationQualityReviewChecks(v1Pair, literalV4)).toEqual(v1Pair)
    expect(parseConversationQualityReviewChecks(v2Pair, conversationQualityContract())).toEqual(v2Pair)
    expect(() => parseConversationQualityReviewChecks(v1Pair, conversationQualityContract())).toThrow()
    expect(() => parseConversationQualityReviewChecks(v2Pair, literalV4)).toThrow()
    expect(() => parseConversationQualityReviewChecks(v1Pair, legacyV3)).toThrow()
    expect(() => parseConversationQualityReviewChecks(legacyPair, conversationQualityContract())).toThrow()
    expect(conversationReviewConsensus(v2Pair).verdict).toBe('met')
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
      v1Pair[0], { ...v1Pair[1], audit: audit(sha256('different')) },
    ])).toThrow(/digest/i)
    expect(() => parseClaimAudit({ ...audit(), units: Array.from({ length: 129 }, (_, index) => ({ ...audit().units[0], answerId: `answer-${index}` })) }, 'not-met')).toThrow()
    expect(() => parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: Array.from({ length: 513 }, () => claim) }] }, 'not-met')).toThrow()
    expect(() => parseClaimAudit({ ...audit(), units: [{ answerId: 'answer-1', claims: [{ ...claim, explanation: 'x'.repeat(33_000) }] }] }, 'not-met')).toThrow()
  })

  it('validates exact v2 fixed-unit syntax without normalizing the captured value', () => {
    const value = auditV2()
    expect(parseClaimAudit(value, 'met')).toBe(value)
    const firstClaim = value.units['answer-1']!.firstClaim
    for (const invalid of [
      { ...value, schemaVersion: 'tianwen.claim-audit.v1' },
      { ...value, units: {} },
      { ...value, units: { 'answer-0': value.units['answer-1'] } },
      { ...value, units: { 'answer-01': value.units['answer-1'] } },
      { ...value, units: { 'answer-1': { additionalClaims: [] } } },
      { ...value, units: { 'answer-1': { firstClaim, additionalClaims: [], extra: true } } },
      { ...value, units: { 'answer-1': { firstClaim, additionalClaims: Array.from({ length: 512 }, () => firstClaim) } } },
      { ...value, units: Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`answer-${index + 1}`, value.units['answer-1']])) },
    ]) expect(() => parseClaimAudit(invalid, 'met')).toThrow()
    const syntaxOnlyBlank = { ...value, units: { 'answer-1': null } }
    expect(parseClaimAudit(syntaxOnlyBlank, 'met')).toBe(syntaxOnlyBlank)
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
