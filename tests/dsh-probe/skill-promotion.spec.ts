import { describe, expect, it } from 'vitest'
import {
  assessSkillPromotionReadiness,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  SkillPromotionReadiness,
  SkillShadowEligibility,
} from '../../packages/tianwen-evolution/src/index.js'

type Equal<Left, Right> = (
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false
)
type Assert<Value extends true> = Value
type _OnlyRefusalDecision = Assert<Equal<
  SkillPromotionReadiness['decision'],
  'no-promotion-readiness'
>>
type _NoPositivePromotionBranch = Assert<Equal<
  Extract<SkillPromotionReadiness, { decision: 'ready' | 'promoted' }>,
  never
>>

const realIneligible: SkillShadowEligibility = {
  decision: 'no-eligible-shadow',
  evaluationId: 'evaluation:real-stage5',
  reasons: ['evaluation-not-pass'],
}

const syntheticEligible: SkillShadowEligibility = {
  decision: 'eligible-for-shadow',
  evaluationId: 'evaluation:synthetic-stage5',
  reasons: [],
}

describe('governed Skill promotion readiness', () => {
  it('refuses the real ineligible Shadow receipt without mutation', () => {
    const value = structuredClone(realIneligible)
    const before = structuredClone(value)

    const result = assessSkillPromotionReadiness(value)

    expect(value).toEqual(before)
    expect(result).toEqual({
      decision: 'no-promotion-readiness',
      evaluationId: 'evaluation:real-stage5',
      reasons: ['shadow-not-eligible'],
    })
  })

  it('refuses a synthetic eligible receipt without claiming stability evidence', () => {
    const value = structuredClone(syntheticEligible)
    const before = structuredClone(value)

    const result = assessSkillPromotionReadiness(value)

    expect(value).toEqual(before)
    expect(result).toEqual({
      decision: 'no-promotion-readiness',
      evaluationId: 'evaluation:synthetic-stage5',
      reasons: ['shadow-stability-evidence-absent'],
    })
    expect(JSON.stringify(result)).toBe(
      '{"decision":"no-promotion-readiness","evaluationId":"evaluation:synthetic-stage5","reasons":["shadow-stability-evidence-absent"]}',
    )
  })
})
