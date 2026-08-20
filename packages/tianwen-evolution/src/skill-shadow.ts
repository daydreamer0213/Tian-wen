import type {
  SkillEvaluationFreshness,
  SkillEvaluationFreshnessReason,
  SkillEvaluationId,
  SkillEvaluationResult,
} from './skill-evaluation.js'

export type SkillShadowEligibilityInput = Pick<
  SkillEvaluationResult,
  | 'evaluationId'
  | 'verdict'
  | 'comparison'
  | 'decision'
  | 'evidenceClass'
  | 'baselineResolutionMatched'
  | 'protocolProvenance'
> & {
  readonly freshness: SkillEvaluationFreshness
}

export type SkillShadowIneligibilityReason =
  | 'evaluation-not-pass'
  | 'candidate-not-better'
  | 'evidence-not-independent-objective'
  | 'baseline-resolution-mismatch'
  | 'protocol-not-pre-candidate'
  | 'evaluation-decision-mismatch'
  | 'evaluation-stale'

export type SkillShadowEligibility =
  | {
      readonly decision: 'eligible-for-shadow'
      readonly evaluationId: SkillEvaluationId
      readonly reasons: readonly []
    }
  | {
      readonly decision: 'no-eligible-shadow'
      readonly evaluationId: SkillEvaluationId
      readonly reasons: readonly SkillShadowIneligibilityReason[]
      readonly freshnessReason?: SkillEvaluationFreshnessReason
    }

export function assessSkillShadowEligibility(
  input: SkillShadowEligibilityInput,
): SkillShadowEligibility {
  const reasons: SkillShadowIneligibilityReason[] = []
  if (input.verdict !== 'PASS') reasons.push('evaluation-not-pass')
  if (input.comparison !== 'candidate-better') reasons.push('candidate-not-better')
  if (input.evidenceClass !== 'independent-objective') {
    reasons.push('evidence-not-independent-objective')
  }
  if (!input.baselineResolutionMatched) reasons.push('baseline-resolution-mismatch')
  if (input.protocolProvenance !== 'pre-candidate') reasons.push('protocol-not-pre-candidate')
  if (input.decision !== 'eligible-for-shadow-review') reasons.push('evaluation-decision-mismatch')
  if (input.freshness.state !== 'fresh') reasons.push('evaluation-stale')
  if (reasons.length === 0) {
    return { decision: 'eligible-for-shadow', evaluationId: input.evaluationId, reasons: [] }
  }
  return {
    decision: 'no-eligible-shadow',
    evaluationId: input.evaluationId,
    reasons,
    ...(input.freshness.state === 'stale'
      ? { freshnessReason: input.freshness.reason }
      : {}),
  }
}
