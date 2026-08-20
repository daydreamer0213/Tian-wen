import { describe, expect, it } from 'vitest'

import {
  prepareLearningIntake,
  type LearningIntakeInput,
} from '../../packages/tianwen-evolution/src/index.js'

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
