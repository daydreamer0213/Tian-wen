import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LedgerIntegrityError,
  prepareRunBinding,
  type RunBindingInput,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'

const roots: string[] = []
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const base: RunBindingInput = {
  goalRef: 'goal:research-preview',
  taskRef: 'task:summarize-observation',
  sessionId: 'session:run-1',
  scopeKey: 'project:tianwen/capability:research-summary',
  acceptanceContract: acceptance,
}

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'outcome-intake-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('Tianwen Run binding', () => {
  it('prepares a stable immutable Run identity', () => {
    const first = prepareRunBinding(base)
    expect(prepareRunBinding(structuredClone(base))).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v1',
      goalRef: base.goalRef,
      taskRef: base.taskRef,
      sessionId: base.sessionId,
      scopeKey: base.scopeKey,
      acceptanceContract: acceptance,
    })
    expect(first.runId).toMatch(/^run:[a-f0-9]{64}$/u)
    expect(first.acceptanceContractDigest)
      .toMatch(/^sha256:[a-f0-9]{64}$/u)
  })

  it('replays the same binding and rejects a changed binding for one Session', () => {
    const ledger = new EvolutionLedger(root('binding'))
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: true })
    expect(() => ledger.recordRunBinding({
      ...base,
      scopeKey: 'project:other/capability:research-summary',
    })).toThrow(LedgerIntegrityError)
  })
})
