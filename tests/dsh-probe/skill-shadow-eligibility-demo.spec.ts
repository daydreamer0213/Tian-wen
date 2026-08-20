import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runSkillShadowEligibilityDemo } from '../../scripts/run-skill-shadow-eligibility-demo.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
  'skill-shadow-eligibility-demo',
)

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('governed Skill Shadow eligibility demo', () => {
  it('keeps the current scripted Candidate unrouted', async () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const previous = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = fixtureRoot
    try {
      const result = await runSkillShadowEligibilityDemo()
      expect(result).toEqual({
        schemaVersion: 'tianwen.skill-shadow-eligibility-demo.v1',
        stage4Mechanism: {
          governedRuns: 3,
          evaluationArms: 8,
          sessions: 11,
          scriptedModelRequests: 25,
          toolCalls: 14,
        },
        evaluation: {
          evaluationId: expect.stringMatching(/^evaluation:/),
          verdict: 'INCONCLUSIVE',
          comparison: 'not-comparable',
          evidenceClass: 'scripted-mechanism',
          protocolProvenance: 'pre-candidate',
          baselineResolutionMatched: true,
          freshness: {
            state: 'stale',
            reason: 'policy-authorization-unobservable',
          },
        },
        shadow: {
          decision: 'no-eligible-shadow',
          reasons: [
            'evaluation-not-pass',
            'candidate-not-better',
            'evidence-not-independent-objective',
            'evaluation-decision-mismatch',
            'evaluation-stale',
          ],
          freshnessReason: 'policy-authorization-unobservable',
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
