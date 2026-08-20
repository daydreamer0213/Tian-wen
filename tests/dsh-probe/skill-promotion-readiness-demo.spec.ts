import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runSkillPromotionReadinessDemo } from '../../scripts/run-skill-promotion-readiness-demo.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
  'skill-promotion-readiness-demo',
)

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('governed Skill promotion readiness demo', () => {
  it('keeps the current scripted Candidate out of Promotion', async () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const previous = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = fixtureRoot
    try {
      const result = await runSkillPromotionReadinessDemo()
      expect(result).toEqual({
        schemaVersion: 'tianwen.skill-promotion-readiness-demo.v1',
        stage4Mechanism: {
          governedRuns: 3,
          evaluationArms: 8,
          sessions: 11,
          scriptedModelRequests: 25,
          toolCalls: 14,
        },
        shadow: {
          evaluationId: expect.stringMatching(/^evaluation:/),
          decision: 'no-eligible-shadow',
          reasons: [
            'evaluation-not-pass',
            'candidate-not-better',
            'evidence-not-independent-objective',
            'evaluation-decision-mismatch',
            'evaluation-stale',
          ],
          ordinaryRunsRouted: 0,
          qualifiedNaturalRuns: 0,
        },
        promotion: {
          decision: 'no-promotion-readiness',
          reasons: ['shadow-not-eligible'],
          naturalShadowOpened: false,
          qualifiedNaturalRuns: 0,
          activePointerCreated: false,
          candidatePromoted: false,
          rollbackExecuted: false,
          legacyChampionChanged: false,
        },
        stage5Incremental: {
          agents: 0,
          sessions: 0,
          runs: 0,
          ledgerEvents: 0,
          registryMutations: 0,
        },
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
        cost: {
          network: 0,
          providerRequests: 0,
          paidTokens: 0,
          cny: 0,
          docker: 0,
          persistentExternalDatabase: 0,
          userData: 0,
        },
      })
      expect(JSON.stringify(result))
        .not.toMatch(/<skill_content>|State the observed|evaluation synthetic summary|governed synthetic summary|https?:\/\/|[A-Z]:\\/u)
    } finally {
      if (previous === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previous
    }
  })
})
