import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const fixtureParent = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT
    ?? (process.platform === 'win32' ? 'D:\\DevData' : tmpdir()),
  'controlled-skill-lifecycle-demo-spec',
)

function fixtureUsage(root: string): { files: number; logicalBytes: number } {
  let files = 0
  let logicalBytes = 0
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      const child = fixtureUsage(path)
      files += child.files
      logicalBytes += child.logicalBytes
    } else if (entry.isFile()) {
      files += 1
      logicalBytes += statSync(path).size
    }
  }
  return { files, logicalBytes }
}

afterEach(() => {
  rmSync(fixtureParent, { recursive: true, force: true })
})

describe('controlled Skill lifecycle demo', () => {
  it('proves the complete scripted lifecycle through the public Runtime seams', async () => {
    mkdirSync(fixtureParent, { recursive: true })
    const packageJson = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    expect(packageJson.scripts?.['demo:controlled-skill-lifecycle'])
      .toBe('tsx scripts/run-controlled-skill-lifecycle-demo.ts')
    const { stdout, stderr } = await run(
      process.execPath,
      [
        resolve(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        resolve(repositoryRoot, 'scripts', 'run-controlled-skill-lifecycle-demo.ts'),
      ],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          PNPM_CONFIG_STORE_DIR: process.env.PNPM_CONFIG_STORE_DIR
            ?? (process.platform === 'win32' ? 'D:\\DevData\\pnpm-store' : undefined),
          TIANWEN_DSH_PROBE_ROOT: fixtureParent,
        },
        maxBuffer: 1_000_000,
      },
    )
    const receipt = JSON.parse(stdout) as unknown

    expect(stderr).toBe('')
    expect(receipt).toEqual({
      schemaVersion: 'tianwen.controlled-skill-lifecycle-demo.v1',
      evidence: {
        source: 'scripted-fixture',
        environment: 'development-only',
        defect: 'synthetic-defect',
        naturalUserEvidence: 'not-claimed',
        externalUserEvidence: 'not-claimed',
      },
      mechanism: {
        candidate: 'recorded',
        evaluation: 'pass',
        shadow: 'pass',
        transitions: {
          promote: 'verified',
          rollback: 'verified',
          restore: 'verified',
        },
        finalPointerRevision: 4,
        phaseOrderVerified: true,
        blindIdentityVerified: true,
      },
      counts: {
        formalSessions: 25,
        seedRuns: 2,
        evaluationArms: 10,
        evaluators: 5,
        shadowRuns: 5,
        transitions: 3,
        scriptedModelRequests: 65,
        toolBodies: 45,
        externalProviderRequests: 0,
      },
      isolation: {
        ordinaryRootSkillUnchanged: true,
        legacyChampionUnchanged: true,
        otherControlledScopesUnchanged: true,
        realProductDataUntouched: true,
        publicEventsRedacted: true,
        terminalReplayNoSecondActivity: true,
        preflightZeroEffect: true,
        preflightReasonCode: 'task-package-mismatch',
        fixtureCleanupComplete: true,
      },
      lineage: {
        protocolIdDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        evaluationIdDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        evaluationResultDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        shadowIdDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        shadowResultDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        transitionSetDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        finalPointerDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    })
    expect(stdout.trim().split('\n')).toHaveLength(1)
    for (const privateValue of [
      'Use the available Skill',
      '# Controlled summary',
      'verify_lifecycle',
      'session:',
      'run:',
      'candidate:',
      'controlled-skill-evaluation-opened',
      'controlled-skill-shadow-opened',
      'controlled-skill-transition-begun',
      fixtureParent,
    ]) expect(stdout).not.toContain(privateValue)
    expect(fixtureUsage(fixtureParent)).toEqual({ files: 0, logicalBytes: 0 })
  }, 120_000)
})
