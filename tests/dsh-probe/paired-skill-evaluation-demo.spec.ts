import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPairedSkillEvaluationDemo } from '../../scripts/run-paired-skill-evaluation-demo.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
  'paired-skill-evaluation-demo',
)

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('paired Skill evaluation demo', () => {
  it('reports the complete zero-cost B/C mechanism proof without efficacy claims', async () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const previous = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = fixtureRoot
    try {
      const result = await runPairedSkillEvaluationDemo()
      expect(result).toEqual({
        schemaVersion: 'tianwen.paired-skill-evaluation-demo.v1',
        execution: {
          governedRuns: 3,
          evaluationArms: 8,
          sessions: 11,
          scriptedModelRequests: 25,
          toolCalls: 14,
        },
        learning: {
          signals: 2,
          tickets: 1,
          protocols: 1,
          cases: 1,
          attributions: 1,
          lessons: 1,
          candidates: 1,
          evaluations: 1,
          results: 1,
          evaluationId: expect.stringMatching(/^evaluation:/),
          candidateStatus: 'recorded',
          protocolProvenance: 'pre-candidate',
          evidenceClass: 'scripted-mechanism',
          verdict: 'INCONCLUSIVE',
          comparison: 'not-comparable',
          decision: 'needs-evidence',
          baselineResolutionMatched: true,
          freshness: {
            state: 'stale',
            reason: 'policy-authorization-unobservable',
          },
          reasonIncludesScriptedModelOutput: true,
          duplicateReplay: true,
          restartMatched: true,
        },
        isolation: {
          sessionsUnchanged: true,
          rootSkillUnchanged: true,
          candidateAbsentAfterDisposal: true,
          dynamicCordisInventoryUnchanged: true,
          legacyArtifactEventsCreated: 0,
          artifactFilesCreated: 0,
          championChanged: false,
          publicEventsRedacted: true,
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
