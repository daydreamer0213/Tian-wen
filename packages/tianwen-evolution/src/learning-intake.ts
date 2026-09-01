import { createHash } from 'node:crypto'

import type { Sha256Digest } from './ledger.js'

export type LearningSignalId = `signal:${string}`
export type LearningTicketId = `ticket:${string}`

export interface LearningIntakeInput {
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly rating: 'positive' | 'negative'
  readonly note?: string
  readonly scopeKey: string
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export type PreparedLearningIntake =
  | {
    readonly kind: 'no-case'
    readonly ingestionId: Sha256Digest
    readonly inputDigest: Sha256Digest
  }
  | {
    readonly kind: 'observed-gap'
    readonly ingestionId: Sha256Digest
    readonly inputDigest: Sha256Digest
  }
  | {
    readonly kind: 'explicit-correction'
    readonly ingestionId: Sha256Digest
    readonly inputDigest: Sha256Digest
    readonly signalId: LearningSignalId
    readonly ticketId: LearningTicketId
    readonly problemFingerprint: Sha256Digest
    readonly noteDigest: Sha256Digest
    readonly normalizedNote: string
  }

export interface LearningSignal {
  readonly signalId: LearningSignalId
  readonly ingestionId: Sha256Digest
  readonly sessionId: string
  readonly messageId: string
  readonly feedbackVersion: string
  readonly scopeKey: string
  readonly problemFingerprint: Sha256Digest
  readonly noteDigest: Sha256Digest
  readonly sessionDigest: Sha256Digest
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface LearningTicket {
  readonly ticketId: LearningTicketId
  readonly problemFingerprint: Sha256Digest
  readonly status: 'open'
  readonly signalIds: readonly LearningSignalId[]
}

export interface LearningTicketFeedback {
  readonly ticketId: LearningTicketId
  readonly scopeKey: string
  readonly latest: {
    readonly note: string
    readonly recordedAt: string
    readonly sessionId: string
    readonly messageId: string
  }
}

export interface LearningIntakeReceipt {
  readonly decision:
    | 'no-case'
    | 'observed-gap'
    | 'ticket-created'
    | 'ticket-merged'
  readonly ingestionId: Sha256Digest
  readonly signalId?: LearningSignalId
  readonly ticketId?: LearningTicketId
  readonly duplicate: boolean
}

/** Sanitized latest intake projection for product status surfaces. */
export interface LearningIntakeStatus
  extends Omit<LearningIntakeReceipt, 'duplicate'> {
  readonly sessionId: string
  readonly messageId: string
  readonly scopeKey: string
  readonly rating: 'positive' | 'negative'
  readonly feedbackFingerprint: Sha256Digest
  readonly recordedAt: string
}

export type MessageLearningState = ReadonlyMap<
  string,
  ReadonlyMap<string, LearningIntakeStatus>
>

export interface LearningIntakeRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-intake.v1'
  readonly type: 'learning-intake-recorded'
  readonly at: string
  readonly input: LearningIntakeInput
  readonly inputDigest: Sha256Digest
  readonly receipt: Omit<LearningIntakeReceipt, 'duplicate'>
  readonly signal?: LearningSignal
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new TypeError('canonical JSON does not support this value')
  }
  return encoded
}

export function sha256(value: unknown): Sha256Digest {
  const hex = createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')
  return `sha256:${hex}`
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function requireDigest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return value as Sha256Digest
}

export function normalizeLearningText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

/** Compare feedback retries without exposing the user's private note. */
export function learningFeedbackFingerprint(
  rating: 'positive' | 'negative',
  note?: string,
): Sha256Digest {
  return sha256({
    rating,
    normalizedNote: note === undefined ? '' : normalizeLearningText(note),
  })
}

function validateInput(input: LearningIntakeInput): LearningIntakeInput {
  const sessionId = requireNonEmpty(input.sessionId, 'sessionId')
  const messageId = requireNonEmpty(input.messageId, 'messageId')
  const feedbackVersion = requireNonEmpty(
    input.feedbackVersion,
    'feedbackVersion',
  )
  const scopeKey = requireNonEmpty(input.scopeKey, 'scopeKey')
  if (scopeKey.trim().length === 0) {
    throw new TypeError('scopeKey must be a non-blank string')
  }
  if (input.rating !== 'positive' && input.rating !== 'negative') {
    throw new TypeError('rating must be positive or negative')
  }
  if (input.note !== undefined && typeof input.note !== 'string') {
    throw new TypeError('note must be a string')
  }
  if (!Array.isArray(input.evidenceIds)) {
    throw new TypeError('evidenceIds must be an array')
  }
  const evidenceIds = input.evidenceIds.map((digest, index) =>
    requireDigest(digest, `evidenceId[${index}]`))

  return {
    sessionId,
    messageId,
    feedbackVersion,
    rating: input.rating,
    ...(input.note === undefined ? {} : { note: input.note }),
    scopeKey,
    sessionDigest: requireDigest(input.sessionDigest, 'sessionDigest'),
    evidenceIds,
  }
}

export function prepareLearningIntake(
  candidate: LearningIntakeInput,
): PreparedLearningIntake {
  const input = validateInput(candidate)
  const ingestionId = sha256({
    sessionId: input.sessionId,
    messageId: input.messageId,
    feedbackVersion: input.feedbackVersion,
  })
  const inputDigest = sha256(input)
  const normalizedNote = input.note === undefined
    ? ''
    : normalizeLearningText(input.note)

  if (input.rating === 'positive') {
    return { kind: 'no-case', ingestionId, inputDigest }
  }
  if (normalizedNote.length === 0) {
    return { kind: 'observed-gap', ingestionId, inputDigest }
  }

  const noteDigest = sha256(input.note!)
  const problemFingerprint = sha256({
    scopeKey: input.scopeKey,
    kind: 'explicit-user-correction',
    normalizedNoteDigest: sha256(normalizedNote),
  })
  const signalDigest = sha256({
    sessionId: input.sessionId,
    messageId: input.messageId,
    feedbackVersion: input.feedbackVersion,
    rating: input.rating,
    noteDigest,
    scopeKey: input.scopeKey,
  })

  return {
    kind: 'explicit-correction',
    ingestionId,
    inputDigest,
    signalId: `signal:${signalDigest.slice('sha256:'.length)}`,
    ticketId: `ticket:${problemFingerprint.slice('sha256:'.length)}`,
    problemFingerprint,
    noteDigest,
    normalizedNote,
  }
}
