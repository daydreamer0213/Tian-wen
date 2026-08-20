import type { SkillEvaluationId } from './skill-evaluation.js'
import type { SkillShadowEligibility } from './skill-shadow.js'

export type SkillPromotionReadinessInput = SkillShadowEligibility

export type SkillPromotionReadinessReason =
  | 'shadow-not-eligible'
  | 'shadow-stability-evidence-absent'

export interface SkillPromotionReadiness {
  readonly decision: 'no-promotion-readiness'
  readonly evaluationId: SkillEvaluationId
  readonly reasons: readonly SkillPromotionReadinessReason[]
}

export function assessSkillPromotionReadiness(
  input: SkillPromotionReadinessInput,
): SkillPromotionReadiness {
  return {
    decision: 'no-promotion-readiness',
    evaluationId: input.evaluationId,
    reasons: [
      input.decision === 'no-eligible-shadow'
        ? 'shadow-not-eligible'
        : 'shadow-stability-evidence-absent',
    ],
  }
}
