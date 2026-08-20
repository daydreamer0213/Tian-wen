import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  LedgerIntegrityError,
  prepareLearningIntake,
  type LearningIntakeInput,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'

const base: LearningIntakeInput = {
  sessionId: 'session-1',
  messageId: 'message-1',
  feedbackVersion: '11111111-1111-4111-8111-111111111111',
  rating: 'negative',
  note: '  Preserve   tool feedback.  ',
  scopeKey: 'project:tianwen/capability:agent-feedback',
  sessionDigest: `sha256:${'1'.repeat(64)}`,
  evidenceIds: [`sha256:${'2'.repeat(64)}`],
}

const fixtureRoots: string[] = []

function ledgerRoot(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'learning-intake-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, `${prefix}-`))
  fixtureRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen learning intake domain', () => {
  it('classifies feedback without a concrete negative note without a ticket', () => {
    expect(prepareLearningIntake({ ...base, rating: 'positive' }).kind)
      .toBe('no-case')
    expect(prepareLearningIntake({ ...base, rating: 'positive', note: 'Useful detail' }).kind)
      .toBe('no-case')
    expect(prepareLearningIntake({ ...base, note: undefined }).kind)
      .toBe('observed-gap')
    expect(prepareLearningIntake({ ...base, note: '\u3000\t\n' }).kind)
      .toBe('observed-gap')
  })

  it('creates stable ids for an explicit correction', () => {
    const first = prepareLearningIntake(base)
    const replay = prepareLearningIntake(structuredClone(base))

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      kind: 'explicit-correction',
      normalizedNote: 'preserve tool feedback.',
    })
    if (first.kind !== 'explicit-correction') {
      throw new Error('expected an explicit correction')
    }
    expect(first.ingestionId).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.inputDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.noteDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.problemFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.signalId).toMatch(/^signal:[a-f0-9]{64}$/)
    expect(first.ticketId).toMatch(/^ticket:[a-f0-9]{64}$/)
  })

  it('merges only exact normalized corrections inside the same scope', () => {
    const first = prepareLearningIntake(base)
    const whitespaceVariant = prepareLearningIntake({
      ...base,
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'PRESERVE tool feedback.',
    })
    const anotherScope = prepareLearningIntake({
      ...base,
      scopeKey: 'project:other/capability:agent-feedback',
    })

    if (
      first.kind !== 'explicit-correction' ||
      whitespaceVariant.kind !== 'explicit-correction' ||
      anotherScope.kind !== 'explicit-correction'
    ) {
      throw new Error('expected explicit corrections')
    }
    expect(first.ticketId).toBe(whitespaceVariant.ticketId)
    expect(first.ticketId).not.toBe(anotherScope.ticketId)
  })

  it.each([
    ['sessionId', { sessionId: '' }, /sessionId/],
    ['messageId', { messageId: '' }, /messageId/],
    ['feedbackVersion', { feedbackVersion: '' }, /feedbackVersion/],
    ['scopeKey', { scopeKey: '  ' }, /scopeKey/],
    ['sessionDigest', { sessionDigest: 'sha256:bad' }, /sessionDigest/],
    ['evidenceIds', { evidenceIds: ['sha256:bad'] }, /evidenceId/],
  ] as const)('rejects an invalid %s', (_label, patch, message) => {
    expect(() => prepareLearningIntake({
      ...base,
      ...patch,
    } as LearningIntakeInput)).toThrow(message)
  })
})

describe('Tianwen learning intake ledger', () => {
  it('writes one durable Signal and Ticket and treats replay as duplicate', () => {
    const root = ledgerRoot('replay')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-08-20T00:00:00.000Z',
    })

    const created = ledger.recordLearningIntake(base)

    expect(created).toMatchObject({
      decision: 'ticket-created',
      duplicate: false,
    })
    expect(ledger.listLearningSignals()).toHaveLength(1)
    expect(ledger.listLearningTickets()).toMatchObject([{
      status: 'open',
      signalIds: [created.signalId],
    }])

    const replay = ledger.recordLearningIntake(base)
    expect(replay).toMatchObject({
      decision: 'ticket-created',
      duplicate: true,
    })
    expect(ledger.listLearningSignals()).toHaveLength(1)

    const reloaded = new EvolutionLedger(root)
    expect(reloaded.listLearningSignals()).toEqual(ledger.listLearningSignals())
    expect(reloaded.listLearningTickets()).toEqual(ledger.listLearningTickets())
  })

  it('merges an exact normalized correction in the same scope', () => {
    const ledger = new EvolutionLedger(ledgerRoot('merge'), {
      clock: () => '2026-08-20T00:00:00.000Z',
    })
    const created = ledger.recordLearningIntake(base)

    const merged = ledger.recordLearningIntake({
      ...base,
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'PRESERVE tool feedback.',
    })

    expect(merged).toMatchObject({
      decision: 'ticket-merged',
      duplicate: false,
      ticketId: created.ticketId,
    })
    expect(ledger.listLearningSignals()).toHaveLength(2)
    expect(ledger.listLearningTickets()).toMatchObject([{
      ticketId: created.ticketId,
      status: 'open',
      signalIds: [created.signalId, merged.signalId],
    }])
  })

  it('records no-ticket observations without creating Signals or Tickets', () => {
    const ledger = new EvolutionLedger(ledgerRoot('no-ticket'), {
      clock: () => '2026-08-20T00:00:00.000Z',
    })

    expect(ledger.recordLearningIntake({ ...base, rating: 'positive' }))
      .toMatchObject({ decision: 'no-case', duplicate: false })
    expect(ledger.recordLearningIntake({
      ...base,
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: undefined,
    })).toMatchObject({ decision: 'observed-gap', duplicate: false })
    expect(ledger.listLearningSignals()).toEqual([])
    expect(ledger.listLearningTickets()).toEqual([])
    expect(ledger.listEvents().map(event => event.type)).toEqual([
      'learning-intake-recorded',
      'learning-intake-recorded',
    ])
  })

  it.each([
    ['note', { note: 'Changed correction' }],
    ['scope', { scopeKey: 'project:other/capability:agent-feedback' }],
    ['session digest', { sessionDigest: `sha256:${'3'.repeat(64)}` }],
    ['Evidence list', { evidenceIds: [`sha256:${'4'.repeat(64)}`] }],
  ] as const)('rejects the same ingestion id with changed %s', (_label, patch) => {
    const ledger = new EvolutionLedger(ledgerRoot('conflict'), {
      clock: () => '2026-08-20T00:00:00.000Z',
    })
    ledger.recordLearningIntake(base)

    expect(() => ledger.recordLearningIntake({
      ...base,
      ...patch,
    } as LearningIntakeInput)).toThrow(LedgerIntegrityError)
  })

  it('fails closed on a malformed learning intake event', () => {
    const root = ledgerRoot('malformed')
    writeFileSync(
      join(root, 'ledger.jsonl'),
      `${JSON.stringify({
        schemaVersion: 'tianwen.learning-intake.v1',
        type: 'learning-intake-recorded',
        at: '2026-08-20T00:00:00.000Z',
      })}\n`,
      'utf8',
    )

    expect(() => new EvolutionLedger(root)).toThrow(LedgerIntegrityError)
  })

  it('rejects a no-ticket receipt carrying a Signal identifier', () => {
    const root = ledgerRoot('no-ticket-id')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-08-20T00:00:00.000Z',
    })
    ledger.recordLearningIntake({ ...base, rating: 'positive' })
    const ledgerPath = join(root, 'ledger.jsonl')
    const event = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
      receipt: Record<string, unknown>
    }
    event.receipt.signalId = `signal:${'a'.repeat(64)}`
    writeFileSync(ledgerPath, `${JSON.stringify(event)}\n`, 'utf8')

    expect(() => new EvolutionLedger(root)).toThrow(LedgerIntegrityError)
  })

  it('keeps the raw note out of receipts and conflict errors', () => {
    const root = ledgerRoot('privacy')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-08-20T00:00:00.000Z',
    })
    const receipt = ledger.recordLearningIntake(base)

    expect(JSON.stringify(receipt)).not.toContain(base.note)
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')).toContain(base.note)

    const changedNote = 'Private replacement correction'
    let conflict: unknown
    try {
      ledger.recordLearningIntake({ ...base, note: changedNote })
    } catch (error) {
      conflict = error
    }
    expect(conflict).toBeInstanceOf(LedgerIntegrityError)
    expect(String(conflict)).not.toContain(base.note)
    expect(String(conflict)).not.toContain(changedNote)
  })
})
