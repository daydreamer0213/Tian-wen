import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LedgerIntegrityError,
  prepareRunAcceptanceContract,
  prepareRunBinding,
  type RunBindingInput,
  type RunBindingInputV2,
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

const digest = (character: string) =>
  `sha256:${character.repeat(64)}` as const

function bind(
  ledger: EvolutionLedger,
  sessionId: string,
  patch: Partial<RunBindingInput> = {},
) {
  return ledger.recordRunBinding({ ...base, sessionId, ...patch }).runId
}

function record(
  ledger: EvolutionLedger,
  runId: ReturnType<typeof bind>,
  verdict: 'met' | 'not-met' | 'inconclusive',
  marker = '1',
) {
  return ledger.recordOutcomeIntake({
    runId,
    verdict,
    sessionDigest: digest(marker),
    evidenceIds: verdict === 'inconclusive' ? [] : [digest('e')],
  })
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
    expect(first.runId)
      .toBe('run:651b90b41f091d26d593a60659738d971b37b667f7788a462ff21362c9cc0af2')
  })

  it('binds a v2 verifier subject outside the reusable acceptance contract', () => {
    const subjectA = digest('a')
    const subjectB = digest('b')
    const v2: RunBindingInputV2 = {
      ...base,
      acceptanceSubjectDigest: subjectA,
    }
    const v1 = prepareRunBinding(base)
    const first = prepareRunBinding(v2)
    const changedSubject = prepareRunBinding({
      ...v2,
      acceptanceSubjectDigest: subjectB,
    })

    expect(prepareRunAcceptanceContract(acceptance)).toEqual(acceptance)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v2',
      acceptanceSubjectDigest: subjectA,
      acceptanceContractDigest: v1.acceptanceContractDigest,
    })
    expect(first.runId).not.toBe(v1.runId)
    expect(changedSubject.runId).not.toBe(first.runId)
    expect(changedSubject.acceptanceContractDigest)
      .toBe(first.acceptanceContractDigest)
    expect(() => prepareRunBinding({
      ...v2,
      acceptanceSubjectDigest: 'sha256:not-a-digest',
    } as unknown as RunBindingInputV2)).toThrow(/acceptanceSubjectDigest/i)

    const ledgerRoot = root('v2-binding')
    const ledger = new EvolutionLedger(ledgerRoot)
    expect(ledger.recordRunBinding(v2)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(v2)).toMatchObject({ duplicate: true })
    expect(new EvolutionLedger(ledgerRoot).getRunBinding(first.runId))
      .toEqual(first)
    expect(() => ledger.recordRunBinding({
      ...v2,
      acceptanceSubjectDigest: subjectB,
    })).toThrow(LedgerIntegrityError)
  })

  it('keeps different v2 subjects in the same reusable recurrence group', () => {
    const ledger = new EvolutionLedger(root('v2-recurrence'))
    const firstRun = ledger.recordRunBinding({
      ...base,
      sessionId: 'session:v2-subject-a',
      acceptanceSubjectDigest: digest('a'),
    }).runId
    const secondRun = ledger.recordRunBinding({
      ...base,
      sessionId: 'session:v2-subject-b',
      acceptanceSubjectDigest: digest('b'),
    }).runId

    expect(record(ledger, firstRun, 'not-met', 'a'))
      .toMatchObject({ decision: 'signal-recorded' })
    expect(record(ledger, secondRun, 'not-met', 'b'))
      .toMatchObject({ decision: 'ticket-created' })
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

  it('records one Signal first and creates one Ticket on the second Run', () => {
    const ledger = new EvolutionLedger(root('recurrence'))
    const firstRun = bind(ledger, 'session:run-1')
    const secondRun = bind(ledger, 'session:run-2')
    const first = ledger.recordOutcomeIntake({
      runId: firstRun,
      verdict: 'not-met',
      sessionDigest: digest('1'),
      evidenceIds: [digest('2')],
    })
    expect(first).toMatchObject({
      decision: 'signal-recorded',
      duplicate: false,
    })
    expect(first.ticketId).toBeUndefined()
    expect(ledger.listLearningSignals()).toHaveLength(1)
    expect(ledger.listLearningTickets()).toEqual([])

    const secondInput = {
      runId: secondRun,
      verdict: 'not-met' as const,
      sessionDigest: digest('3'),
      evidenceIds: [digest('4')],
    }
    const second = ledger.recordOutcomeIntake(secondInput)
    expect(second).toMatchObject({
      decision: 'ticket-created',
      duplicate: false,
    })
    expect(ledger.listLearningSignals()).toHaveLength(2)
    expect(ledger.listLearningTickets()).toMatchObject([{
      ticketId: second.ticketId,
      status: 'open',
      signalIds: [first.signalId, second.signalId],
    }])
    expect(ledger.recordOutcomeIntake(secondInput))
      .toMatchObject({ duplicate: true })
  })

  it('triages met, inconclusive, observe, and ordinary correction outcomes', () => {
    const ledger = new EvolutionLedger(root('triage'))
    expect(record(ledger, bind(ledger, 'session:met'), 'met'))
      .toMatchObject({ decision: 'no-case' })
    expect(record(
      ledger,
      bind(ledger, 'session:inconclusive'),
      'inconclusive',
      '2',
    )).toMatchObject({ decision: 'continue-observing' })
    expect(record(
      ledger,
      bind(ledger, 'session:observe', {
        acceptanceContract: {
          source: acceptance.source,
          toolName: acceptance.toolName,
          notMetErrorCode: acceptance.notMetErrorCode,
          gapDisposition: 'observe',
        },
      }),
      'not-met',
      '3',
    )).toMatchObject({ decision: 'continue-observing' })
    expect(record(
      ledger,
      bind(ledger, 'session:ordinary', {
        acceptanceContract: {
          source: acceptance.source,
          toolName: acceptance.toolName,
          notMetErrorCode: acceptance.notMetErrorCode,
          gapDisposition: 'ordinary-correction',
        },
      }),
      'not-met',
      '4',
    )).toMatchObject({ decision: 'ordinary-correction' })
    expect(ledger.listLearningSignals()).toEqual([])
  })

  it('merges a third distinct Run into the existing Ticket', () => {
    const ledger = new EvolutionLedger(root('third-run'))
    const receipts = ['1', '2', '3'].map(marker => record(
      ledger,
      bind(ledger, `session:${marker}`),
      'not-met',
      marker,
    ))
    expect(receipts.map(item => item.decision)).toEqual([
      'signal-recorded',
      'ticket-created',
      'ticket-merged',
    ])
    expect(ledger.listLearningTickets()[0]?.signalIds).toEqual(
      receipts.map(item => item.signalId),
    )
  })

  it('does not merge different scopes, categories, errors, or contracts', () => {
    const ledger = new EvolutionLedger(root('fingerprints'))
    const patches: Partial<RunBindingInput>[] = [
      { scopeKey: 'project:other/capability:research-summary' },
      {
        acceptanceContract: {
          ...acceptance,
          problemCategory: 'different-category',
        },
      },
      {
        acceptanceContract: {
          ...acceptance,
          notMetErrorCode: 'DIFFERENT_ERROR',
        },
      },
      {
        acceptanceContract: {
          ...acceptance,
          toolName: 'verify_different_contract',
        },
      },
    ]
    record(ledger, bind(ledger, 'session:base'), 'not-met', '0')
    for (const [index, patch] of patches.entries()) {
      expect(record(
        ledger,
        bind(ledger, `session:different-${index}`, patch),
        'not-met',
        String(index + 1),
      )).toMatchObject({ decision: 'signal-recorded' })
    }
    expect(ledger.listLearningTickets()).toEqual([])
  })

  it.each([
    { severity: 4 as const, blocksGoal: false },
    { severity: 2 as const, blocksGoal: true },
  ])('creates an immediate Ticket for trusted gates: %o', gate => {
    const ledger = new EvolutionLedger(root('immediate'))
    const runId = bind(ledger, 'session:immediate', {
      acceptanceContract: { ...acceptance, ...gate },
    })
    expect(record(ledger, runId, 'not-met')).toMatchObject({
      decision: 'ticket-created',
    })
    expect(ledger.listLearningTickets()).toHaveLength(1)
  })

  it('rejects changed Outcome replay content for one Run ingestion', () => {
    const ledger = new EvolutionLedger(root('changed-replay'))
    const runId = bind(ledger, 'session:changed')
    const input = {
      runId,
      verdict: 'not-met' as const,
      sessionDigest: digest('1'),
      evidenceIds: [digest('2')],
    }
    ledger.recordOutcomeIntake(input)
    for (const changed of [
      { ...input, verdict: 'met' as const },
      { ...input, evidenceIds: [digest('3')] },
      { ...input, sessionDigest: digest('4') },
    ]) {
      expect(() => ledger.recordOutcomeIntake(changed))
        .toThrow(LedgerIntegrityError)
    }
  })

  it('replays bindings, Signals, Tickets, and ordering from disk', () => {
    const ledgerRoot = root('reload')
    const ledger = new EvolutionLedger(ledgerRoot)
    record(ledger, bind(ledger, 'session:reload-1'), 'not-met', '1')
    record(ledger, bind(ledger, 'session:reload-2'), 'not-met', '2')
    const events = ledger.listEvents()
    const signals = ledger.listLearningSignals()
    const tickets = ledger.listLearningTickets()
    const reloaded = new EvolutionLedger(ledgerRoot)
    expect(reloaded.listEvents()).toEqual(events)
    expect(reloaded.listLearningSignals()).toEqual(signals)
    expect(reloaded.listLearningTickets()).toEqual(tickets)
  })

  it('fails closed on a malformed Outcome event', () => {
    const ledgerRoot = root('malformed')
    const ledger = new EvolutionLedger(ledgerRoot)
    bind(ledger, 'session:malformed')
    appendFileSync(join(ledgerRoot, 'ledger.jsonl'), `${JSON.stringify({
      schemaVersion: 'tianwen.outcome-intake.v1',
      type: 'outcome-intake-recorded',
      at: '2026-08-20T00:00:00.000Z',
      input: {},
    })}\n`)
    expect(() => new EvolutionLedger(ledgerRoot)).toThrow(LedgerIntegrityError)
  })
})
