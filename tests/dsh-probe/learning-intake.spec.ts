import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const appendFault = vi.hoisted(() => ({
  enabled: false,
  failLedgerFsyncAfterReal: 0,
  failLedgerWriteAfterReal: 0,
  failLedgerWriteBeforeReal: 0,
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      if (appendFault.enabled) paths.set(descriptor, String(path))
      return descriptor
    },
    writeSync(
      descriptor: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position?: number | null,
    ) {
      if (
        appendFault.enabled
        && appendFault.failLedgerWriteBeforeReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerWriteBeforeReal -= 1
        throw Object.assign(new Error('forced pre-write ledger failure'), {
          code: 'EIO',
        })
      }
      const written = actual.writeSync(
        descriptor,
        buffer,
        offset,
        length,
        position,
      )
      if (
        appendFault.enabled
        && appendFault.failLedgerWriteAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerWriteAfterReal -= 1
        throw Object.assign(new Error('forced post-write ledger uncertainty'), {
          code: 'EIO',
        })
      }
      return written
    },
    fsyncSync(descriptor: number) {
      actual.fsyncSync(descriptor)
      if (
        appendFault.enabled
        && appendFault.failLedgerFsyncAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerFsyncAfterReal -= 1
        throw Object.assign(new Error('forced post-fsync ledger uncertainty'), {
          code: 'EIO',
        })
      }
    },
  }
})

import {
  LedgerAppendNotCommittedError,
  LedgerIntegrityError,
  learningSessionLifecycleFingerprint,
  prepareLearningIntake,
  sha256,
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

const SESSION_LIFECYCLE_FINGERPRINT = `sha256:${'3'.repeat(64)}` as const

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
  appendFault.enabled = false
  appendFault.failLedgerFsyncAfterReal = 0
  appendFault.failLedgerWriteAfterReal = 0
  appendFault.failLedgerWriteBeforeReal = 0
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

  it('fingerprints the canonical Session lifecycle without exposing cwd', () => {
    const rawCwd = resolve('private', 'workspace')
    const canonical = learningSessionLifecycleFingerprint({
      sessionId: 'session-lifecycle',
      createdAt: 1,
      cwd: join(rawCwd, '..', 'workspace'),
    })

    expect(canonical).toBe(learningSessionLifecycleFingerprint({
      sessionId: 'session-lifecycle',
      createdAt: 1,
      cwd: rawCwd,
    }))
    expect(canonical).not.toBe(learningSessionLifecycleFingerprint({
      sessionId: 'session-lifecycle',
      createdAt: 2,
      cwd: rawCwd,
    }))
    expect(canonical).not.toBe(learningSessionLifecycleFingerprint({
      sessionId: 'session-lifecycle',
      createdAt: 1,
      cwd: resolve('private', 'other-workspace'),
    }))
    expect(canonical).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(canonical).not.toContain(rawCwd)
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
  it.each(['write', 'fsync'] as const)(
    'reconciles a durably appended intake after %s reports uncertainty',
    failure => {
      const root = ledgerRoot(`intake-${failure}-commit-unknown`)
      const ledger = new EvolutionLedger(root, {
        clock: () => '2026-09-01T00:00:00.000Z',
      })
      const input = {
        intake: base,
        sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      }
      appendFault.enabled = true
      if (failure === 'write') appendFault.failLedgerWriteAfterReal = 1
      else appendFault.failLedgerFsyncAfterReal = 1

      expect(ledger.recordLearningFeedbackRevision(input)).toMatchObject({
        decision: 'ticket-created',
        duplicate: false,
      })
      expect(ledger.recordLearningFeedbackRevision(input).duplicate).toBe(true)
      expect(new EvolutionLedger(root).recordLearningFeedbackRevision(input).duplicate)
        .toBe(true)
      expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8').trimEnd().split('\n'))
        .toHaveLength(1)
    },
  )

  it('reconciles a durably appended retraction without duplicating it', () => {
    const root = ledgerRoot('retraction-commit-unknown')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    ledger.recordLearningFeedbackRevision({
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
    const input = {
      sessionId: base.sessionId,
      messageId: base.messageId,
      retractedFeedbackVersion: base.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    }
    appendFault.enabled = true
    appendFault.failLedgerFsyncAfterReal = 1

    expect(ledger.recordLearningFeedbackRetraction(input)).toEqual({
      duplicate: false,
    })
    expect(ledger.recordLearningFeedbackRetraction(input).duplicate).toBe(true)
    const replay = new EvolutionLedger(root)
    expect(replay.getLearningIntakeStatus(base.sessionId, base.messageId)?.state)
      .toBe('retracted')
    expect(replay.recordLearningFeedbackRetraction(input).duplicate).toBe(true)
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('learning-feedback-retracted')))
      .toHaveLength(1)
  })

  it('keeps an intake retryable when the append wrote no bytes', () => {
    const root = ledgerRoot('intake-not-appended')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    const input = {
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    }
    appendFault.enabled = true
    appendFault.failLedgerWriteBeforeReal = 1

    expect(() => ledger.recordLearningFeedbackRevision(input))
      .toThrow(LedgerAppendNotCommittedError)
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')).toBe('')

    expect(ledger.recordLearningFeedbackRevision(input).duplicate).toBe(false)
    expect(new EvolutionLedger(root).recordLearningFeedbackRevision(input).duplicate)
      .toBe(true)
  })

  it('blocks a same-process retry when a landed append cannot be re-fsynced', () => {
    const root = ledgerRoot('intake-resync-failed')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    const input = {
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    }
    appendFault.enabled = true
    appendFault.failLedgerFsyncAfterReal = 2

    expect(() => ledger.recordLearningFeedbackRevision(input))
      .toThrow(/durable commit is unknown/u)
    expect(() => ledger.recordLearningFeedbackRevision(input))
      .toThrow(/fresh replay/u)
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8').trimEnd().split('\n'))
      .toHaveLength(1)
    expect(new EvolutionLedger(root).recordLearningFeedbackRevision(input).duplicate)
      .toBe(true)
  })

  it('records an initial feedback revision as one active v2 snapshot', () => {
    const root = ledgerRoot('revision-v2')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })

    const receipt = ledger.recordLearningFeedbackRevision({
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })

    expect(receipt).toMatchObject({
      decision: 'ticket-created',
      duplicate: false,
    })
    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toMatchObject({
        state: 'active',
        feedbackVersion: base.feedbackVersion,
        sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
        signalId: receipt.signalId,
      })
    const lines = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      schemaVersion: 'tianwen.learning-intake.v2',
      type: 'learning-intake-recorded',
      input: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      receipt: {
        ingestionId: receipt.ingestionId,
      },
    })
  })

  it('atomically supersedes a revision and rejects contradictory replay', () => {
    const root = ledgerRoot('revision-supersedes')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    const first = ledger.recordLearningFeedbackRevision({
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
    const changed = {
      ...base,
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'Keep feedback attached to its exact message.',
    }

    const second = ledger.recordLearningFeedbackRevision({
      intake: changed,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: base.feedbackVersion,
    })

    expect(second).toMatchObject({
      decision: 'ticket-created',
      duplicate: false,
    })
    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toMatchObject({
        state: 'active',
        feedbackVersion: changed.feedbackVersion,
        ingestionId: second.ingestionId,
      })
    expect(ledger.listLearningSignals()).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalId: first.signalId, active: false }),
      expect.objectContaining({ signalId: second.signalId, active: true }),
    ]))
    expect(ledger.listLearningTickets()).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: first.ticketId, status: 'unsupported' }),
      expect.objectContaining({ ticketId: second.ticketId, status: 'open' }),
    ]))

    const linesBeforeReplay = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
    expect(linesBeforeReplay).toHaveLength(2)
    expect(JSON.parse(linesBeforeReplay[1]!)).toMatchObject({
      schemaVersion: 'tianwen.learning-intake.v2',
      input: changed,
      supersedesFeedbackVersion: base.feedbackVersion,
    })
    expect(ledger.recordLearningFeedbackRevision({
      intake: changed,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: base.feedbackVersion,
    })).toMatchObject({ duplicate: true })
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')).toHaveLength(2)
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: { ...changed, note: 'Contradictory private note' },
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: base.feedbackVersion,
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: changed,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: 'wrong-predecessor',
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: {
        ...changed,
        feedbackVersion: '55555555-5555-4555-8555-555555555555',
      },
      sessionLifecycleFingerprint: `sha256:${'4'.repeat(64)}`,
      supersedesFeedbackVersion: changed.feedbackVersion,
    })).toThrow(/Session lifecycle/u)

    const positive = {
      ...base,
      feedbackVersion: '33333333-3333-4333-8333-333333333333',
      rating: 'positive' as const,
      note: undefined,
    }
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: positive,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    }))
      .toThrow(LedgerIntegrityError)
    ledger.recordLearningFeedbackRevision({
      intake: positive,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: changed.feedbackVersion,
    })
    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toMatchObject({
        state: 'active',
        rating: 'positive',
        feedbackVersion: positive.feedbackVersion,
      })
    expect(ledger.listLearningTickets()).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: second.ticketId, status: 'unsupported' }),
    ]))
  })

  it('retracts only the exact current revision and recomputes active support', () => {
    const root = ledgerRoot('revision-retraction')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    const first = ledger.recordLearningFeedbackRevision({
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
    const other = {
      ...base,
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'PRESERVE tool feedback.',
    }
    const second = ledger.recordLearningFeedbackRevision({
      intake: other,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })

    expect(ledger.recordLearningFeedbackRetraction({
      sessionId: base.sessionId,
      messageId: base.messageId,
      retractedFeedbackVersion: base.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })).toEqual({ duplicate: false })
    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toMatchObject({ state: 'retracted', feedbackVersion: base.feedbackVersion })
    expect(ledger.listLearningSignals()).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalId: first.signalId, active: false }),
      expect.objectContaining({ signalId: second.signalId, active: true }),
    ]))
    expect(ledger.listLearningTickets()).toMatchObject([{
      ticketId: first.ticketId,
      status: 'open',
      signalIds: [first.signalId, second.signalId],
    }])

    const lineCount = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n').length
    expect(ledger.recordLearningFeedbackRetraction({
      sessionId: base.sessionId,
      messageId: base.messageId,
      retractedFeedbackVersion: base.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })).toEqual({ duplicate: true })
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')).toHaveLength(lineCount)
    expect(() => ledger.recordLearningFeedbackRetraction({
      sessionId: base.sessionId,
      messageId: other.messageId,
      retractedFeedbackVersion: base.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordLearningFeedbackRetraction({
      sessionId: base.sessionId,
      messageId: other.messageId,
      retractedFeedbackVersion: other.feedbackVersion,
      sessionLifecycleFingerprint: `sha256:${'4'.repeat(64)}`,
    })).toThrow(/retraction disagrees/u)

    ledger.recordLearningFeedbackRetraction({
      sessionId: base.sessionId,
      messageId: other.messageId,
      retractedFeedbackVersion: other.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
    expect(ledger.listLearningTickets()).toMatchObject([{
      ticketId: first.ticketId,
      status: 'unsupported',
      signalIds: [first.signalId, second.signalId],
    }])
    expect(ledger.getLearningTicketFeedback(first.ticketId!)).toBeUndefined()

    const reloaded = new EvolutionLedger(root)
    expect(reloaded.listLearningSignals()).toEqual(ledger.listLearningSignals())
    expect(reloaded.listLearningTickets()).toEqual(ledger.listLearningTickets())
    expect(reloaded.listLearningIntakeStatuses(base.sessionId))
      .toEqual(ledger.listLearningIntakeStatuses(base.sessionId))
    expect(reloaded.listEvents().at(-1)).toMatchObject({
      schemaVersion: 'tianwen.learning-feedback-retracted.v2',
      type: 'learning-feedback-retracted',
      retractedFeedbackVersion: other.feedbackVersion,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
  })

  it('replays legacy v2 history without guessing its Session lifecycle', () => {
    const root = ledgerRoot('revision-mixed')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    ledger.recordLearningIntake(base)
    const legacyRoot = ledgerRoot('legacy-v2-event')
    const legacyLedger = new EvolutionLedger(legacyRoot, {
      clock: () => '2026-09-01T00:00:01.000Z',
    })
    legacyLedger.recordLearningFeedbackRevision({
      intake: {
        ...base,
        feedbackVersion: '22222222-2222-4222-8222-222222222222',
        note: 'Second correction.',
      },
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
    })
    const legacyEvent = JSON.parse(readFileSync(
      join(legacyRoot, 'ledger.jsonl'),
      'utf8',
    )) as Record<string, unknown>
    delete legacyEvent.sessionLifecycleFingerprint
    legacyEvent.supersedesFeedbackVersion = base.feedbackVersion
    writeFileSync(
      join(root, 'ledger.jsonl'),
      `${readFileSync(join(root, 'ledger.jsonl'), 'utf8')}${JSON.stringify(legacyEvent)}\n`,
    )

    const reloaded = new EvolutionLedger(root)
    expect(reloaded.getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )).toMatchObject({
      state: 'active',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
    })
    expect(reloaded.getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )).not.toHaveProperty('sessionLifecycleFingerprint')
    expect(() => reloaded.recordLearningFeedbackRevision({
      intake: {
        ...base,
        feedbackVersion: '33333333-3333-4333-8333-333333333333',
        note: 'Must not supersede unknown lifecycle history.',
      },
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      supersedesFeedbackVersion: '22222222-2222-4222-8222-222222222222',
    })).toThrow(/Session lifecycle/u)
  })

  it('replays a legacy v1 retraction without inventing lifecycle proof', () => {
    const root = ledgerRoot('legacy-v1-retraction')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    ledger.recordLearningIntake(base)
    const legacyRetraction = {
      schemaVersion: 'tianwen.learning-feedback-retracted.v1',
      type: 'learning-feedback-retracted',
      at: '2026-09-01T00:00:01.000Z',
      sessionId: base.sessionId,
      messageId: base.messageId,
      retractedFeedbackVersion: base.feedbackVersion,
    }
    writeFileSync(
      join(root, 'ledger.jsonl'),
      `${readFileSync(join(root, 'ledger.jsonl'), 'utf8')}${JSON.stringify(legacyRetraction)}\n`,
    )

    expect(new EvolutionLedger(root).getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )).toMatchObject({
      state: 'retracted',
      feedbackVersion: base.feedbackVersion,
    })
    expect(new EvolutionLedger(root).getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )).not.toHaveProperty('sessionLifecycleFingerprint')
  })

  it('records profile consent revisions with exact replay and reload', () => {
    const root = ledgerRoot('analysis-consent')
    let tick = 0
    const ledger = new EvolutionLedger(root, {
      clock: () => new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)).toISOString(),
    })
    const enabled = ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    expect(enabled).toEqual({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
      recordedAt: '2026-09-01T00:00:00.000Z',
      duplicate: false,
    })
    expect(ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })).toEqual({ ...enabled, duplicate: true })
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')).toHaveLength(1)
    const disabled = ledger.recordLearningAnalysisConsent({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    expect(ledger.getLearningAnalysisConsentBefore(
      Date.parse(enabled.recordedAt),
    )).toBeUndefined()
    expect(ledger.getLearningAnalysisConsentBefore(
      Date.parse(disabled.recordedAt),
    )).toEqual({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
      recordedAt: enabled.recordedAt,
    })
    expect(ledger.getLearningAnalysisConsentBefore(
      Date.parse(disabled.recordedAt) + 1,
    )).toEqual({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
      recordedAt: disabled.recordedAt,
    })
    expect(ledger.getLearningAnalysisConsent()).toEqual({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
      recordedAt: disabled.recordedAt,
    })
    expect(() => ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordLearningAnalysisConsent({
      revision: 4,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })).toThrow(LedgerIntegrityError)
    const reloaded = new EvolutionLedger(root)
    expect(reloaded.getLearningAnalysisConsent())
      .toEqual(ledger.getLearningAnalysisConsent())
    expect(reloaded.getLearningAnalysisConsentBefore(
      Date.parse(disabled.recordedAt),
    )).toEqual(ledger.getLearningAnalysisConsentBefore(
      Date.parse(disabled.recordedAt),
    ))
    expect(JSON.stringify([
      enabled,
      disabled,
      ledger.getLearningAnalysisConsent(),
      ledger.getLearningIntakeStatus(base.sessionId, base.messageId),
    ])).not.toContain(base.note)
  })

  it('records one profile consent notice intent and delivered acknowledgement with exact replay and reload', () => {
    const root = ledgerRoot('analysis-consent-notice')
    let tick = 0
    const ledger = new EvolutionLedger(root, {
      clock: () => new Date(Date.UTC(2026, 8, 1, 1, 0, tick++)).toISOString(),
    })
    const intent = {
      policyVersion: 'tianwen-auto-analysis.v1' as const,
      mainSessionId: 'main-session-1',
      noticeSourceMessageId: 'tianwen-learning-consent-notice:v1',
      deliveryId: 'tianwen-learning-consent-delivery:v1',
    }

    expect(ledger.recordLearningConsentNoticeIntent(intent)).toEqual({
      ...intent,
      state: 'pending',
      intentRecordedAt: '2026-09-01T01:00:00.000Z',
      duplicate: false,
    })
    expect(ledger.recordLearningConsentNoticeIntent(intent)).toEqual({
      ...intent,
      state: 'pending',
      intentRecordedAt: '2026-09-01T01:00:00.000Z',
      duplicate: true,
    })
    expect(() => ledger.recordLearningConsentNoticeIntent({
      ...intent,
      mainSessionId: 'main-session-2',
    })).toThrow(LedgerIntegrityError)
    expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8').trimEnd().split('\n'))
      .toHaveLength(1)

    expect(ledger.recordLearningConsentNoticeDelivered(intent)).toEqual({
      ...intent,
      state: 'delivered',
      intentRecordedAt: '2026-09-01T01:00:00.000Z',
      deliveredAt: '2026-09-01T01:00:01.000Z',
      duplicate: false,
    })
    expect(ledger.recordLearningConsentNoticeDelivered(intent)).toEqual({
      ...intent,
      state: 'delivered',
      intentRecordedAt: '2026-09-01T01:00:00.000Z',
      deliveredAt: '2026-09-01T01:00:01.000Z',
      duplicate: true,
    })
    expect(() => ledger.recordLearningConsentNoticeDelivered({
      ...intent,
      noticeSourceMessageId: 'changed-message',
    })).toThrow(LedgerIntegrityError)

    const expected = {
      policyVersion: intent.policyVersion,
      mainSessionId: intent.mainSessionId,
      noticeSourceMessageId: intent.noticeSourceMessageId,
      state: 'delivered' as const,
      intentRecordedAt: '2026-09-01T01:00:00.000Z',
      deliveredAt: '2026-09-01T01:00:01.000Z',
    }
    expect(ledger.getLearningConsentNoticeStatus(intent.policyVersion))
      .toEqual(expected)
    expect(new EvolutionLedger(root)
      .getLearningConsentNoticeStatus(intent.policyVersion)).toEqual(expected)
    expect(JSON.stringify(expected)).not.toContain(base.note)
    expect(JSON.stringify(expected)).not.toMatch(/[A-Z]:\//u)
  })

  it('rejects a consent notice acknowledgement without its exact durable intent', () => {
    const ledger = new EvolutionLedger(ledgerRoot('analysis-consent-notice-order'))
    expect(() => ledger.recordLearningConsentNoticeDelivered({
      policyVersion: 'tianwen-auto-analysis.v1',
      mainSessionId: 'main-session-1',
      noticeSourceMessageId: 'tianwen-learning-consent-notice:v1',
      deliveryId: 'tianwen-learning-consent-delivery:v1',
    })).toThrow(LedgerIntegrityError)
  })

  it('accepts an exact enabled historical consent reference after a later disable', () => {
    const root = ledgerRoot('analysis-consent-reference')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-09-01T00:00:00.000Z',
    })
    ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    ledger.recordLearningAnalysisConsent({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    ledger.recordLearningFeedbackRevision({
      intake: base,
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      analysisConsentRevision: 1,
    })
    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toMatchObject({ analysisConsentRevision: 1 })
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: {
        ...base,
        messageId: 'message-2',
        feedbackVersion: '22222222-2222-4222-8222-222222222222',
      },
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      analysisConsentRevision: 2,
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordLearningFeedbackRevision({
      intake: {
        ...base,
        messageId: 'message-3',
        feedbackVersion: '33333333-3333-4333-8333-333333333333',
      },
      sessionLifecycleFingerprint: SESSION_LIFECYCLE_FINGERPRINT,
      analysisConsentRevision: 3,
    })).toThrow(LedgerIntegrityError)
    expect(JSON.stringify(ledger.listEvents().find(event =>
      event.type === 'learning-intake-recorded'))).toContain(
        '"analysisConsentRevision":1',
      )
    expect(new EvolutionLedger(root).getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )).toEqual(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
  })

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

  it('indexes sanitized intake statuses by Session and message after reload', () => {
    const root = ledgerRoot('status')
    const ledger = new EvolutionLedger(root, {
      clock: () => '2026-08-20T00:00:00.000Z',
    })
    ledger.recordLearningIntake({ ...base, rating: 'positive' })
    const first = ledger.recordLearningIntake({
      ...base,
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'Keep the final answer concrete.',
    })
    const second = ledger.recordLearningIntake({
      ...base,
      messageId: 'message-2',
      feedbackVersion: '33333333-3333-4333-8333-333333333333',
      rating: 'positive',
      note: undefined,
    })

    expect(ledger.getLearningIntakeStatus(base.sessionId, base.messageId)).toEqual({
      state: 'active',
      sessionId: base.sessionId,
      messageId: base.messageId,
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      scopeKey: base.scopeKey,
      rating: 'negative',
      feedbackFingerprint: sha256({
        rating: 'negative',
        normalizedNote: 'keep the final answer concrete.',
      }),
      recordedAt: '2026-08-20T00:00:00.000Z',
      decision: 'ticket-created',
      ingestionId: first.ingestionId,
      signalId: first.signalId,
      ticketId: first.ticketId,
    })
    expect(ledger.getLearningIntakeStatus(base.sessionId, 'message-2')).toMatchObject({
      messageId: 'message-2',
      decision: 'no-case',
      ingestionId: second.ingestionId,
    })
    expect(ledger.listLearningIntakeStatuses(base.sessionId)
      .map(item => item.messageId)).toEqual(['message-1', 'message-2'])
    expect(JSON.stringify(ledger.getLearningIntakeStatus(
      base.sessionId,
      base.messageId,
    )))
      .not.toContain('Keep the final answer concrete.')

    const reloaded = new EvolutionLedger(root)
    expect(reloaded.getLearningIntakeStatus(base.sessionId, base.messageId))
      .toEqual(ledger.getLearningIntakeStatus(base.sessionId, base.messageId))
    expect(reloaded.getLearningIntakeStatus(base.sessionId, 'message-2'))
      .toEqual(ledger.getLearningIntakeStatus(base.sessionId, 'message-2'))
    expect(reloaded.listLearningIntakeStatuses(base.sessionId))
      .toEqual(ledger.listLearningIntakeStatuses(base.sessionId))
    expect(ledger.getLearningIntakeStatus('missing-session', 'message-1'))
      .toBeUndefined()
    expect(ledger.getLearningIntakeStatus(base.sessionId, 'missing-message'))
      .toBeUndefined()
    expect(ledger.listLearningIntakeStatuses('missing-session')).toEqual([])

    const firstList = ledger.listLearningIntakeStatuses(base.sessionId)
    const secondList = ledger.listLearningIntakeStatuses(base.sessionId)
    expect(secondList).not.toBe(firstList)
    expect(secondList[0]).not.toBe(firstList[0])
  })

  it('returns the latest original feedback for an explicit Ticket after reload', () => {
    const root = ledgerRoot('ticket-feedback')
    let tick = 0
    const ledger = new EvolutionLedger(root, {
      clock: () => new Date(Date.UTC(2026, 7, 20, 0, 0, tick++)).toISOString(),
    })
    const created = ledger.recordLearningIntake(base)
    ledger.recordLearningIntake({
      ...base,
      sessionId: 'session-2',
      messageId: 'message-2',
      feedbackVersion: '22222222-2222-4222-8222-222222222222',
      note: 'PRESERVE tool feedback.',
    })

    const expected = {
      ticketId: created.ticketId,
      scopeKey: base.scopeKey,
      latest: {
        note: 'PRESERVE tool feedback.',
        recordedAt: '2026-08-20T00:00:01.000Z',
        sessionId: 'session-2',
        messageId: 'message-2',
      },
    }
    expect(ledger.getLearningTicketFeedback(created.ticketId!)).toEqual(expected)
    expect(new EvolutionLedger(root).getLearningTicketFeedback(created.ticketId!))
      .toEqual(expected)
    expect(JSON.stringify(ledger.getLearningIntakeStatus(
      'session-2',
      'message-2',
    )))
      .not.toContain(expected.latest.note)
  })

  it('returns no private feedback for a missing or Outcome-only Ticket', () => {
    const ledger = new EvolutionLedger(ledgerRoot('ticket-feedback-missing'))
    expect(ledger.getLearningTicketFeedback(`ticket:${'f'.repeat(64)}`))
      .toBeUndefined()

    const runId = ledger.recordRunBinding({
      goalRef: 'goal:outcome-only',
      taskRef: 'task:outcome-only',
      sessionId: 'session:outcome-only',
      scopeKey: 'project:tianwen/capability:outcome-only',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_outcome',
        notMetErrorCode: 'OUTCOME_NOT_MET',
        gapDisposition: 'reusable',
        problemCategory: 'outcome-only',
        severity: 4,
        blocksGoal: false,
      },
    }).runId
    const outcome = ledger.recordOutcomeIntake({
      runId,
      verdict: 'not-met',
      sessionDigest: `sha256:${'7'.repeat(64)}`,
      evidenceIds: [`sha256:${'8'.repeat(64)}`],
    })

    expect(outcome.ticketId).toBeDefined()
    expect(ledger.getLearningTicketFeedback(outcome.ticketId!)).toBeUndefined()
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
