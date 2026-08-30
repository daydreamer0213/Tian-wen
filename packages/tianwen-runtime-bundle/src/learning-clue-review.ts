import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, parse, resolve } from 'node:path'

const TICKET_ID = /^ticket:[a-f0-9]{64}$/u

export interface LearningClueReviewRecord {
  readonly schemaVersion: 'tianwen.learning-clue-review.v1'
  readonly ticketId: string
  readonly sessionId: string
  readonly messageId: string
  readonly reviewedOccurrenceCount: number
  readonly reviewedAt: string
}

export class LearningClueReviewIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LearningClueReviewIntegrityError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function requireStateRoot(value: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('Learning clue review stateRoot must be absolute')
  }
  const root = resolve(value)
  if (root === parse(root).root) {
    throw new TypeError('Learning clue review stateRoot must not be a filesystem root')
  }
  return root
}

function requireTicketId(value: string): string {
  if (typeof value !== 'string' || !TICKET_ID.test(value)) {
    throw new TypeError('Learning clue review ticketId is invalid')
  }
  return value
}

function requireIdentity(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`Learning clue review ${label} is invalid`)
  }
  return value
}

function requireOccurrenceCount(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('Learning clue review reviewedOccurrenceCount is invalid')
  }
  return value
}

function requireReviewedAt(value: string): string {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError('Learning clue review reviewedAt is invalid')
  }
  return value
}

function reviewPath(stateRoot: string, ticketId: string): string {
  return join(
    requireStateRoot(stateRoot),
    'learning-clue-reviews',
    `${requireTicketId(ticketId).slice('ticket:'.length)}.json`,
  )
}

function parseReview(value: unknown, expectedTicketId: string): LearningClueReviewRecord {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'ticketId',
    'sessionId',
    'messageId',
    'reviewedOccurrenceCount',
    'reviewedAt',
  ]) || value.schemaVersion !== 'tianwen.learning-clue-review.v1' ||
    value.ticketId !== expectedTicketId) {
    throw new LearningClueReviewIntegrityError(
      'Learning clue review shape or identity is invalid',
    )
  }
  try {
    return {
      schemaVersion: 'tianwen.learning-clue-review.v1',
      ticketId: requireTicketId(value.ticketId as string),
      sessionId: requireIdentity(value.sessionId as string, 'sessionId'),
      messageId: requireIdentity(value.messageId as string, 'messageId'),
      reviewedOccurrenceCount: requireOccurrenceCount(value.reviewedOccurrenceCount as number),
      reviewedAt: requireReviewedAt(value.reviewedAt as string),
    }
  } catch (error) {
    throw new LearningClueReviewIntegrityError(
      'Learning clue review content is invalid',
      { cause: error },
    )
  }
}

export function readLearningClueReview(
  stateRoot: string,
  ticketId: string,
): LearningClueReviewRecord | undefined {
  const path = reviewPath(stateRoot, ticketId)
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  try {
    return parseReview(JSON.parse(source), ticketId)
  } catch (error) {
    if (error instanceof LearningClueReviewIntegrityError) throw error
    throw new LearningClueReviewIntegrityError(
      'Learning clue review is not valid JSON',
      { cause: error },
    )
  }
}

export function writeLearningClueReview(input: {
  readonly stateRoot: string
  readonly ticketId: string
  readonly sessionId: string
  readonly messageId: string
  readonly reviewedOccurrenceCount: number
  readonly reviewedAt: string
}): LearningClueReviewRecord {
  const path = reviewPath(input.stateRoot, input.ticketId)
  const review: LearningClueReviewRecord = {
    schemaVersion: 'tianwen.learning-clue-review.v1',
    ticketId: requireTicketId(input.ticketId),
    sessionId: requireIdentity(input.sessionId, 'sessionId'),
    messageId: requireIdentity(input.messageId, 'messageId'),
    reviewedOccurrenceCount: requireOccurrenceCount(input.reviewedOccurrenceCount),
    reviewedAt: requireReviewedAt(input.reviewedAt),
  }
  const existing = readLearningClueReview(input.stateRoot, input.ticketId)
  if (existing !== undefined) {
    if (existing.sessionId !== review.sessionId || existing.messageId !== review.messageId) {
      throw new LearningClueReviewIntegrityError(
        'Learning clue review analysis identity must not change',
      )
    }
    if (existing.reviewedOccurrenceCount > review.reviewedOccurrenceCount) {
      throw new LearningClueReviewIntegrityError(
        'Learning clue review occurrence count must not decrease',
      )
    }
    if (existing.reviewedOccurrenceCount === review.reviewedOccurrenceCount) return existing
  }
  mkdirSync(join(requireStateRoot(input.stateRoot), 'learning-clue-reviews'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(review)}\n`, 'utf8')
  return review
}
