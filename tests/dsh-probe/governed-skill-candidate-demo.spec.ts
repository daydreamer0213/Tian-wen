import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGovernedSkillCandidateDemo } from '../../scripts/run-governed-skill-candidate-demo.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
  'governed-candidate-demo',
)

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('governed Skill Candidate demo', () => {
  it('reports the complete zero-cost inert Candidate contract', async () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const previous = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = fixtureRoot
    try {
      const result = await runGovernedSkillCandidateDemo()
      expect(result).toEqual({
        schemaVersion: 'tianwen.governed-skill-candidate-demo.v1',
        execution: {
          runs: 3,
          sessions: 3,
          scriptedModelRequests: 9,
          toolCalls: 6,
          outcomes: ['not-met', 'not-met', 'met'],
        },
        learning: {
          signals: 2,
          tickets: 1,
          cases: 1,
          attributions: 1,
          lessons: 1,
          candidates: 1,
          skillManifests: 3,
          skillUses: 3,
          candidateStatus: 'recorded',
          duplicateReplay: true,
          syntheticGovernanceContent: true,
          evaluated: false,
          shadowed: false,
          promoted: false,
        },
        isolation: {
          sessionsUnchanged: true,
          dynamicCordisInventoryUnchanged: true,
          legacyArtifactEventsCreated: 0,
          artifactFilesCreated: 0,
          championChanged: false,
        },
        cost: {
          network: 0,
          providerRequests: 0,
          paidTokens: 0,
          cny: 0,
          docker: 0,
          userData: 0,
        },
      })
      const serialized = JSON.stringify(result)
      expect(serialized).not.toMatch(/<skill_content>|State the observed|https?:\/\/|[A-Z]:\\/u)
      expect(result.learning).toMatchObject({
        evaluated: false,
        shadowed: false,
        promoted: false,
      })
    } finally {
      if (previous === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previous
    }
  })
})
