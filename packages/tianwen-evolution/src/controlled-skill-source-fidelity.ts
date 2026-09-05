import { sha256 } from './learning-intake.js'

const SCORE_ANCHORS = Object.freeze({
  0: 'unusable, irrelevant, or seriously misleading',
  1: 'main goal not met; only limited value can be recovered',
  2: 'basically usable with clear gaps and substantial manual correction',
  3: 'good; goal clearly met with only minor correction',
  4: 'excellent; accurate, clear, restrained, and directly usable',
})

export const CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC = Object.freeze({
  schemaVersion: 'tianwen.controlled-skill-eval-rubric.v2',
  scoreAnchors: SCORE_ANCHORS,
  dimensions: Object.freeze([
    'relevance',
    'correctness-reasoning',
    'clarity-usability',
    'scope-restraint',
    'source-fidelity',
  ] as const),
  candidatePassRules: Object.freeze([
    'candidate-all-objective-hard-gates-pass',
    'candidate-has-no-objective-regression',
    'candidate-original-source-fidelity-improves-by-at-least-one',
    'candidate-other-source-fidelity-does-not-decrease',
    'candidate-existing-dimension-total-not-lower',
    'candidate-no-existing-dimension-lower-by-two',
    'evaluator-material-sufficient',
  ] as const),
})

export const CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST = sha256(
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC,
)

export const CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY = Object.freeze({
  schemaVersion: 'tianwen.controlled-skill-source-fidelity-policy.v1',
  packetVersion: 'tianwen.research-summary-source-packet.v1',
  rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  originalTaskMinimumImprovement: 1,
  holdoutMinimumDimensionScore: 3,
})

export const CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST = sha256(
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
)

export const CONTROLLED_SKILL_SOURCE_FIDELITY_SCORE_KEYS = Object.freeze([
  'relevance',
  'correctnessReasoning',
  'clarityUsability',
  'scopeRestraint',
  'sourceFidelity',
] as const)
