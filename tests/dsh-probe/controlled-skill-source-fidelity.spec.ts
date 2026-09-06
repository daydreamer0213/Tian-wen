import { describe, expect, it } from 'vitest'
import * as family from '../../packages/tianwen-evolution/src/controlled-skill-source-fidelity.js'

describe('frozen source fidelity families', () => {
  it('retains legacy identity and resolves only coherent known grading families', () => {
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST).toBe('sha256:f5d110804d6a1011ea137add9ecafa5fb35a0e19511d435ed937de7def0c2100')
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST).toBe(
      'sha256:67d59c1ab275a180539b092adb83026e3f5813620ece21f91341b64829b317a6',
    )
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC).toBeDefined()
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST).toBe('sha256:87579a5370ba93b63e3dccba0631747913f92cf0da706e870509b99a7d82c7d2')
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY_DIGEST).toBe('sha256:0fde043bfb3f4eca0f512c2c8a7e13720699f8b47d4ae44bf8661c301eef9e89')
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC.candidatePassRules)
      .toEqual(family.CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC.candidatePassRules)
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY.originalTaskMinimumImprovement).toBe(1)
    expect(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_POLICY.holdoutMinimumDimensionScore).toBe(3)
    expect(family.resolveControlledSkillSourceFidelityFamily('sha256:' + '0'.repeat(64))).toBeUndefined()
    expect(family.resolveControlledSkillSourceFidelityFamily(family.CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST)?.metric)
      .toBe('research-summary-source-fidelity.v1')
    const complete = family.resolveControlledSkillSourceFidelityFamily(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST)!
    expect(complete.metric).toBe('research-summary-source-fidelity.v2')
    expect(complete.policy.rubricDigest).toBe(complete.rubricDigest)
    expect(Object.isFrozen(family.CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC.criteria)).toBe(true)
  })
})
