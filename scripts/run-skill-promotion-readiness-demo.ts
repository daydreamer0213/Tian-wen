import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessSkillPromotionReadiness } from '../packages/tianwen-evolution/src/index.js'
import type {
  SkillPromotionReadinessReason,
  SkillShadowEligibility,
  SkillShadowIneligibilityReason,
} from '../packages/tianwen-evolution/src/index.js'
import { runSkillShadowEligibilityDemo } from './run-skill-shadow-eligibility-demo.js'

export interface SkillPromotionReadinessDemoResult {
  readonly schemaVersion: 'tianwen.skill-promotion-readiness-demo.v1'
  readonly stage4Mechanism: Awaited<ReturnType<typeof runSkillShadowEligibilityDemo>>['stage4Mechanism']
  readonly shadow: {
    readonly evaluationId: `evaluation:${string}`
    readonly decision: 'no-eligible-shadow'
    readonly reasons: readonly SkillShadowIneligibilityReason[]
    readonly ordinaryRunsRouted: 0
    readonly qualifiedNaturalRuns: 0
  }
  readonly promotion: {
    readonly decision: 'no-promotion-readiness'
    readonly reasons: readonly SkillPromotionReadinessReason[]
    readonly naturalShadowOpened: false
    readonly qualifiedNaturalRuns: 0
    readonly activePointerCreated: false
    readonly candidatePromoted: false
    readonly rollbackExecuted: false
    readonly legacyChampionChanged: false
  }
  readonly stage5Incremental: Awaited<ReturnType<typeof runSkillShadowEligibilityDemo>>['stage5Incremental']
  readonly stage6Incremental: {
    readonly agents: 0
    readonly sessions: 0
    readonly runs: 0
    readonly ledgerEvents: 0
    readonly registryMutations: 0
    readonly pointers: 0
    readonly promotions: 0
    readonly rollbacks: 0
  }
  readonly cost: Awaited<ReturnType<typeof runSkillShadowEligibilityDemo>>['cost']
}

export async function runSkillPromotionReadinessDemo(): Promise<SkillPromotionReadinessDemoResult> {
  const stage5 = await runSkillShadowEligibilityDemo()
  const shadow = {
    evaluationId: stage5.evaluation.evaluationId,
    decision: stage5.shadow.decision,
    reasons: stage5.shadow.reasons,
    freshnessReason: stage5.shadow.freshnessReason,
  } satisfies SkillShadowEligibility
  const promotion = assessSkillPromotionReadiness(shadow)
  if (
    promotion.decision !== 'no-promotion-readiness'
    || promotion.reasons.length !== 1
    || promotion.reasons[0] !== 'shadow-not-eligible'
  ) throw new Error('current scripted Shadow unexpectedly reached Promotion readiness')
  return {
    schemaVersion: 'tianwen.skill-promotion-readiness-demo.v1',
    stage4Mechanism: stage5.stage4Mechanism,
    shadow: {
      evaluationId: shadow.evaluationId,
      decision: shadow.decision,
      reasons: shadow.reasons,
      ordinaryRunsRouted: stage5.shadow.ordinaryRunsRouted,
      qualifiedNaturalRuns: stage5.shadow.qualifiedNaturalRuns,
    },
    promotion: {
      decision: promotion.decision,
      reasons: promotion.reasons,
      naturalShadowOpened: false,
      qualifiedNaturalRuns: 0,
      activePointerCreated: false,
      candidatePromoted: false,
      rollbackExecuted: false,
      legacyChampionChanged: false,
    },
    stage5Incremental: stage5.stage5Incremental,
    stage6Incremental: {
      agents: 0,
      sessions: 0,
      runs: 0,
      ledgerEvents: 0,
      registryMutations: 0,
      pointers: 0,
      promotions: 0,
      rollbacks: 0,
    },
    cost: stage5.cost,
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runSkillPromotionReadinessDemo(), null, 2)}\n`)
}
