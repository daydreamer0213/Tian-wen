import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runNaturalRunEvidenceDemo } from '../../scripts/run-natural-run-evidence-demo.js'

const fixtureRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
  'natural-run-evidence-demo',
)

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('natural DSH Run evidence demo', () => {
  it('proves the zero-cost met/no-case mechanism without changing later governance stages', async () => {
    mkdirSync(fixtureRoot, { recursive: true })
    const previous = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = resolve(fixtureRoot, '..')
    try {
      const result = await runNaturalRunEvidenceDemo()

      expect(result).toEqual({
        schemaVersion: 'tianwen.natural-run-evidence-demo.v1',
        trial: {
          status: 'settled',
          goal: { phase: 'complete' },
          run: {
            id: expect.stringMatching(/^run:/),
            bindingVersion: 'v3',
            parentManifestRecorded: true,
            skillUse: 'recorded',
          },
          outcome: { verdict: 'met', learning: 'no-case' },
          sessionUnchangedByGovernance: true,
        },
        execution: { modelRequests: 3, toolCalls: 2 },
        governance: {
          candidates: 0,
          cases: 0,
          evaluations: 0,
          shadows: 0,
          activePointers: 0,
          promotions: 0,
        },
        cost: {
          network: 0,
          providerRequests: 0,
          paidTokens: 0,
          exactCny: 'unavailable',
          docker: 0,
          persistentExternalDatabase: 0,
          userData: 0,
        },
      })
      expect(existsSync(fixtureRoot) ? readdirSync(fixtureRoot) : []).toEqual([])
      expect(JSON.stringify(result)).not.toMatch(
        /Verify one useful summary|result.*evidence|Summary parent|https?:\/\/|[A-Z]:\\|credential/iu,
      )
    } finally {
      if (previous === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previous
    }
  })
})
