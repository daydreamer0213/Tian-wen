import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  LearningClueReviewIntegrityError,
  readLearningClueReview,
  writeLearningClueReview,
} from '../../packages/tianwen-runtime-bundle/src/learning-clue-review.js'

const ROOT = resolve('D:/DevData/tianwen-learning-clue-review-tests')
const roots: string[] = []
const ticketId = `ticket:${'a'.repeat(64)}`

function stateRoot(): string {
  mkdirSync(ROOT, { recursive: true })
  const root = mkdtempSync(join(ROOT, 'review-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Learning clue review persistence', () => {
  it('writes and reads the strict review record for one Ticket', () => {
    const root = stateRoot()
    const record = writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 1,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    })

    expect(record).toEqual({
      schemaVersion: 'tianwen.learning-clue-review.v1',
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 1,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    })
    expect(readLearningClueReview(root, ticketId)).toEqual(record)

    const directory = join(root, 'learning-clue-reviews')
    expect(readdirSync(directory)).toEqual([`${'a'.repeat(64)}.json`])
    expect(JSON.parse(readFileSync(join(directory, `${'a'.repeat(64)}.json`), 'utf8')))
      .toEqual(record)
  })

  it('returns the existing record when the same occurrence is reviewed again', () => {
    const root = stateRoot()
    const first = writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 2,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    })
    const second = writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 2,
      reviewedAt: '2026-08-30T00:01:00.000Z',
    })

    expect(second).toEqual(first)
    expect(readLearningClueReview(root, ticketId)).toEqual(first)
  })

  it('replaces the same Ticket record only for a higher occurrence count', () => {
    const root = stateRoot()
    writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 1,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    })
    const updated = writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 3,
      reviewedAt: '2026-08-30T00:03:00.000Z',
    })

    expect(updated.reviewedOccurrenceCount).toBe(3)
    expect(updated.reviewedAt).toBe('2026-08-30T00:03:00.000Z')
    expect(readLearningClueReview(root, ticketId)).toEqual(updated)

    expect(() => writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 2,
      reviewedAt: '2026-08-30T00:04:00.000Z',
    })).toThrow(LearningClueReviewIntegrityError)
    expect(readLearningClueReview(root, ticketId)).toEqual(updated)
  })

  it('rejects rebinding an existing Ticket review to another Session or message', () => {
    const root = stateRoot()
    const existing = writeLearningClueReview({
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 1,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    })

    for (const changed of [
      { sessionId: 'session-2', messageId: 'message-1', reviewedOccurrenceCount: 1 },
      { sessionId: 'session-1', messageId: 'message-2', reviewedOccurrenceCount: 1 },
      { sessionId: 'session-2', messageId: 'message-1', reviewedOccurrenceCount: 2 },
      { sessionId: 'session-1', messageId: 'message-2', reviewedOccurrenceCount: 2 },
    ]) {
      expect(() => writeLearningClueReview({
        stateRoot: root,
        ticketId,
        ...changed,
        reviewedAt: '2026-08-30T00:01:00.000Z',
      })).toThrow(LearningClueReviewIntegrityError)
    }
    expect(readLearningClueReview(root, ticketId)).toEqual(existing)
  })

  it('rejects invalid identities, occurrence counts, timestamps, and unsafe roots', () => {
    const root = stateRoot()
    const valid = {
      stateRoot: root,
      ticketId,
      sessionId: 'session-1',
      messageId: 'message-1',
      reviewedOccurrenceCount: 1,
      reviewedAt: '2026-08-30T00:00:00.000Z',
    }
    for (const invalid of [
      { ...valid, stateRoot: 'relative' },
      { ...valid, stateRoot: parse(resolve(root)).root },
      { ...valid, ticketId: 'ticket:bad' },
      { ...valid, sessionId: ' ' },
      { ...valid, messageId: '' },
      { ...valid, reviewedOccurrenceCount: 0 },
      { ...valid, reviewedOccurrenceCount: -1 },
      { ...valid, reviewedOccurrenceCount: 1.5 },
      { ...valid, reviewedAt: '2026-08-30' },
    ]) {
      expect(() => writeLearningClueReview(invalid)).toThrow(TypeError)
    }
    expect(readLearningClueReview(root, `ticket:${'b'.repeat(64)}`)).toBeUndefined()
  })

  it('fails closed for invalid JSON, extra fields, and mismatched file identity', () => {
    const root = stateRoot()
    const directory = join(root, 'learning-clue-reviews')
    const path = join(directory, `${'a'.repeat(64)}.json`)
    mkdirSync(directory, { recursive: true })

    for (const source of [
      '{',
      JSON.stringify({
        schemaVersion: 'tianwen.learning-clue-review.v1',
        ticketId,
        sessionId: 'session-1',
        messageId: 'message-1',
        reviewedOccurrenceCount: 1,
        reviewedAt: '2026-08-30T00:00:00.000Z',
        note: 'private',
      }),
      JSON.stringify({
        schemaVersion: 'tianwen.learning-clue-review.v1',
        ticketId: `ticket:${'b'.repeat(64)}`,
        sessionId: 'session-1',
        messageId: 'message-1',
        reviewedOccurrenceCount: 1,
        reviewedAt: '2026-08-30T00:00:00.000Z',
      }),
      JSON.stringify({
        schemaVersion: 'tianwen.learning-clue-review.v1',
        ticketId,
        sessionId: ' ',
        messageId: 'message-1',
        reviewedOccurrenceCount: 0,
        reviewedAt: '2026-08-30',
      }),
    ]) {
      writeFileSync(path, source, 'utf8')
      expect(() => readLearningClueReview(root, ticketId))
        .toThrow(LearningClueReviewIntegrityError)
    }
  })
})
