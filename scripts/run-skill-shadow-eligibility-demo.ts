import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessSkillShadowEligibility } from '../packages/tianwen-evolution/src/index.js'
import type {
  SkillEvaluationFreshnessReason,
  SkillShadowIneligibilityReason,
} from '../packages/tianwen-evolution/src/index.js'
import { runPairedSkillEvaluationDemo } from './run-paired-skill-evaluation-demo.js'

const expectedReasons = [
  'evaluation-not-pass',
  'candidate-not-better',
  'evidence-not-independent-objective',
  'evaluation-decision-mismatch',
  'evaluation-stale',
] as const satisfies readonly SkillShadowIneligibilityReason[]

export interface SkillShadowEligibilityDemoResult {
  readonly schemaVersion: 'tianwen.skill-shadow-eligibility-demo.v1'
  readonly stage4Mechanism: Awaited<ReturnType<typeof runPairedSkillEvaluationDemo>>['execution']
  readonly evaluation: {
    readonly evaluationId: `evaluation:${string}`
    readonly verdict: 'INCONCLUSIVE'
    readonly comparison: 'not-comparable'
    readonly evidenceClass: 'scripted-mechanism'
    readonly protocolProvenance: 'pre-candidate'
    readonly baselineResolutionMatched: boolean
    readonly freshness: Awaited<ReturnType<typeof runPairedSkillEvaluationDemo>>['learning']['freshness']
  }
  readonly shadow: {
    readonly decision: 'no-eligible-shadow'
    readonly reasons: readonly SkillShadowIneligibilityReason[]
    readonly freshnessReason: SkillEvaluationFreshnessReason
    readonly ordinaryRunsRouted: 0
    readonly qualifiedNaturalRuns: 0
    readonly candidateRegisteredForOrdinaryTraffic: false
    readonly activePointerChanged: false
    readonly legacyChampionChanged: false
  }
  readonly stage5Incremental: {
    readonly agents: 0
    readonly sessions: 0
    readonly runs: 0
    readonly ledgerEvents: 0
    readonly registryMutations: 0
  }
  readonly cost: Awaited<ReturnType<typeof runPairedSkillEvaluationDemo>>['cost']
}

export async function runSkillShadowEligibilityDemo(): Promise<SkillShadowEligibilityDemoResult> {
  const stage4 = await runPairedSkillEvaluationDemo()
  const eligibility = assessSkillShadowEligibility({
    evaluationId: stage4.learning.evaluationId,
    verdict: stage4.learning.verdict,
    comparison: stage4.learning.comparison,
    decision: stage4.learning.decision,
    evidenceClass: stage4.learning.evidenceClass,
    baselineResolutionMatched: stage4.learning.baselineResolutionMatched,
    protocolProvenance: stage4.learning.protocolProvenance,
    freshness: stage4.learning.freshness,
  })
  if (
    eligibility.decision !== 'no-eligible-shadow'
    || eligibility.freshnessReason === undefined
    || JSON.stringify(eligibility.reasons) !== JSON.stringify(expectedReasons)
  ) throw new Error('current scripted Evaluation unexpectedly passed Shadow eligibility')
  return {
    schemaVersion: 'tianwen.skill-shadow-eligibility-demo.v1',
    stage4Mechanism: stage4.execution,
    evaluation: {
      evaluationId: stage4.learning.evaluationId,
      verdict: stage4.learning.verdict,
      comparison: stage4.learning.comparison,
      evidenceClass: stage4.learning.evidenceClass,
      protocolProvenance: stage4.learning.protocolProvenance,
      baselineResolutionMatched: stage4.learning.baselineResolutionMatched,
      freshness: stage4.learning.freshness,
    },
    shadow: {
      decision: eligibility.decision,
      reasons: eligibility.reasons,
      freshnessReason: eligibility.freshnessReason,
      ordinaryRunsRouted: 0,
      qualifiedNaturalRuns: 0,
      candidateRegisteredForOrdinaryTraffic: false,
      activePointerChanged: false,
      legacyChampionChanged: false,
    },
    stage5Incremental: {
      agents: 0,
      sessions: 0,
      runs: 0,
      ledgerEvents: 0,
      registryMutations: 0,
    },
    cost: stage4.cost,
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runSkillShadowEligibilityDemo(), null, 2)}\n`)
}
