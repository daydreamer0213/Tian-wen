import { describe, expect, it } from 'vitest'
import {
  assessSkillShadowEligibility,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  SkillEvaluationFreshness,
  SkillEvaluationResult,
  SkillShadowEligibilityInput,
} from '../../packages/tianwen-evolution/src/index.js'

type EvaluationConclusion = Pick<
  SkillEvaluationResult,
  | 'evaluationId'
  | 'verdict'
  | 'comparison'
  | 'decision'
  | 'evidenceClass'
  | 'baselineResolutionMatched'
  | 'protocolProvenance'
>

const fresh: SkillEvaluationFreshness = { state: 'fresh', reason: 'fresh' }

function input(
  overrides: Partial<SkillShadowEligibilityInput> = {},
): SkillShadowEligibilityInput {
  const conclusion: EvaluationConclusion = {
    evaluationId: 'evaluation:eligible',
    verdict: 'PASS',
    comparison: 'candidate-better',
    decision: 'eligible-for-shadow-review',
    evidenceClass: 'independent-objective',
    baselineResolutionMatched: true,
    protocolProvenance: 'pre-candidate',
  }
  return { ...conclusion, freshness: fresh, ...overrides }
}

describe('governed Skill Shadow eligibility', () => {
  it.each([
    ['a non-PASS evaluation', { verdict: 'INCONCLUSIVE' }, 'evaluation-not-pass'],
    ['a non-winning Candidate', { comparison: 'tie' }, 'candidate-not-better'],
    ['non-independent evidence', { evidenceClass: 'scripted-mechanism' }, 'evidence-not-independent-objective'],
    ['a mismatched baseline', { baselineResolutionMatched: false }, 'baseline-resolution-mismatch'],
    ['a retrospective protocol', { protocolProvenance: 'retrospective' }, 'protocol-not-pre-candidate'],
    ['a mismatched Stage 4 decision', { decision: 'needs-evidence' }, 'evaluation-decision-mismatch'],
    ['a stale evaluation', {
      freshness: { state: 'stale', reason: 'policy-authorization-unobservable' },
    }, 'evaluation-stale'],
  ] as const)('refuses %s with its closed reason', (_name, overrides, reason) => {
    const value = input(overrides)
    const before = structuredClone(value)

    const result = assessSkillShadowEligibility(value)

    expect(value).toEqual(before)
    expect(result).toEqual({
      decision: 'no-eligible-shadow',
      evaluationId: value.evaluationId,
      reasons: [reason],
      ...(reason === 'evaluation-stale'
        ? { freshnessReason: 'policy-authorization-unobservable' }
        : {}),
    })
  })

  it('returns every failed term in the fixed order', () => {
    const result = assessSkillShadowEligibility(input({
      verdict: 'FAIL',
      evidenceClass: 'scripted-mechanism',
      freshness: { state: 'stale', reason: 'unbound-dependency' },
    }))

    expect(result).toEqual({
      decision: 'no-eligible-shadow',
      evaluationId: 'evaluation:eligible',
      reasons: [
        'evaluation-not-pass',
        'evidence-not-independent-objective',
        'evaluation-stale',
      ],
      freshnessReason: 'unbound-dependency',
    })
  })

  it('permits only the complete fresh conjunction', () => {
    const result = assessSkillShadowEligibility(input())

    expect(result).toEqual({
      decision: 'eligible-for-shadow',
      evaluationId: 'evaluation:eligible',
      reasons: [],
    })
    expect(JSON.stringify(result)).not.toMatch(/because|reason text|prompt/u)
  })
})
