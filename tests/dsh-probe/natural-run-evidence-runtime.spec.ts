import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  readNaturalRunTrialManifest,
} from '../../packages/tianwen-runtime-bundle/src/natural-run-trial.js'

const roots: string[] = []

function fixtureRoot(): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'natural-run-evidence-trial',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'manifest-'))
  roots.push(root)
  return root
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'tianwen.natural-run-trial.v1',
    goalId: 'goal:natural-evidence',
    taskRef: 'task:verify-summary',
    scopeKey: 'project:tianwen/capability:summary',
    parentSkillName: 'summary-parent',
    acceptanceContract: {
      source: 'dsh-tool-result',
      toolName: 'verify_summary',
      notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
      gapDisposition: 'reusable',
      problemCategory: 'summary-omits-required-result',
      severity: 2,
      blocksGoal: false,
    },
    verifierArguments: {
      subject: { include: ['result', 'evidence'] },
    },
    ...overrides,
  }
}

function writeManifest(value: unknown): string {
  const path = join(fixtureRoot(), 'trial-manifest.json')
  writeFileSync(path, JSON.stringify(value), 'utf8')
  return path
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('natural DSH Run trial manifest', () => {
  it('freezes one normalized verifier subject and detects source changes', () => {
    const path = writeManifest(manifest())
    const prepared = readNaturalRunTrialManifest(path)

    expect(prepared.manifest).toMatchObject({
      schemaVersion: 'tianwen.natural-run-trial.v1',
      goalId: 'goal:natural-evidence',
      acceptanceContract: { severity: 2, blocksGoal: false },
    })
    expect(prepared.manifestDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(prepared.acceptanceSubjectDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)

    writeFileSync(path, JSON.stringify(manifest({
      verifierArguments: { subject: { include: ['changed'] } },
    })), 'utf8')
    expect(() => readNaturalRunTrialManifest(path, prepared.manifestDigest))
      .toThrow(/digest/i)
  })

  it.each([
    ['unknown key', manifest({ extra: true })],
    ['wrong schema', manifest({ schemaVersion: 'tianwen.natural-run-trial.v0' })],
    ['path-shaped label', manifest({ taskRef: 'D:\\private\\task' })],
    ['URL-shaped label', manifest({ scopeKey: 'https://private.example' })],
    ['leading slash label', manifest({ parentSkillName: '/private-skill' })],
    ['overlong label', manifest({ taskRef: 'x'.repeat(129) })],
    ['oversized canonical manifest', manifest({ verifierArguments: { text: 'x'.repeat(16_384) } })],
  ])('rejects a %s before DSH execution', (_name, value) => {
    expect(() => readNaturalRunTrialManifest(writeManifest(value))).toThrow()
  })

  it('rejects nesting deeper than the fixed manifest boundary', () => {
    let value: unknown = 'leaf'
    for (let depth = 0; depth < 17; depth += 1) value = { value }

    expect(() => readNaturalRunTrialManifest(writeManifest(manifest({
      verifierArguments: value,
    })))).toThrow(/depth/i)
  })
})
