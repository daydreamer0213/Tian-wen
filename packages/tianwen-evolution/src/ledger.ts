import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { TextDecoder } from 'node:util'

import { prepareLearningIntake } from './learning-intake.js'
import type {
  LearningIntakeInput,
  LearningIntakeReceipt,
  LearningIntakeRecordedEvent,
  LearningSignal,
  LearningSignalId,
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'

export type ArtifactId = `artifact:${string}`
export type Sha256Digest = `sha256:${string}`

export interface ArtifactVersion {
  readonly artifactId: ArtifactId
  readonly parentArtifactId?: ArtifactId
  readonly sourceDigest: Sha256Digest
  readonly createdAt: string
}

export interface EvaluationRecord {
  readonly artifactId: ArtifactId
  readonly receiptDigest: Sha256Digest
  readonly verdict: 'met' | 'not_met' | 'inconclusive'
}

export interface ApprovalRecord {
  readonly artifactId: ArtifactId
  readonly authority: 'human'
  readonly approvalId: string
}

export interface ChampionPointer {
  readonly artifactId: ArtifactId
  readonly revision: number
}

interface ArtifactRecordedEvent {
  readonly type: 'artifact-recorded'
  readonly at: string
  readonly artifact: ArtifactVersion
}

interface EvaluationRecordedEvent {
  readonly type: 'evaluation-recorded'
  readonly at: string
  readonly evaluation: EvaluationRecord
}

interface ApprovalRecordedEvent {
  readonly type: 'approval-recorded'
  readonly at: string
  readonly approval: ApprovalRecord
}

interface TransitionEvent {
  readonly type: 'promoted' | 'rolled-back'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly revision: number
  readonly receiptDigest: Sha256Digest
  readonly approvalId: string
}

export interface RuntimeBoundEvent {
  readonly type: 'runtime-bound'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly pluginId: string
  readonly packageId: string
}

export interface ActivationFailedEvent {
  readonly type: 'activation-failed'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly phase: 'promotion' | 'rollback' | 'rehydrate'
  readonly message: string
  readonly receiptDigest?: Sha256Digest
  readonly approvalId?: string
  readonly pluginId?: string
  readonly packageId?: string
}

export interface RecoveryFailedEvent {
  readonly type: 'recovery-failed'
  readonly at: string
  readonly artifactId: ArtifactId
  readonly previousArtifactId: ArtifactId
  readonly message: string
}

export type LedgerEvent =
  | LearningIntakeRecordedEvent
  | ArtifactRecordedEvent
  | EvaluationRecordedEvent
  | ApprovalRecordedEvent
  | TransitionEvent
  | RuntimeBoundEvent
  | ActivationFailedEvent
  | RecoveryFailedEvent

export type GovernanceErrorCode =
  | 'artifact-missing'
  | 'evaluation-required'
  | 'evaluation-not-met'
  | 'human-approval-required'
  | 'already-champion'
  | 'rollback-required'
  | 'rollback-target-required'

export class LedgerIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LedgerIntegrityError'
  }
}

export class LedgerCommitUnknownError extends LedgerIntegrityError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LedgerCommitUnknownError'
  }
}

export class EvolutionGovernanceError extends Error {
  constructor(
    readonly code: GovernanceErrorCode,
    readonly artifactId: ArtifactId,
    message: string,
  ) {
    super(message)
    this.name = 'EvolutionGovernanceError'
  }
}

export interface TransitionAuthority {
  readonly artifact: ArtifactVersion
  readonly evaluation: EvaluationRecord
  readonly approval: ApprovalRecord
}

export interface EvolutionLedgerOptions {
  readonly clock?: () => string
}

export interface ActivationFailure {
  readonly artifactId: ArtifactId
  readonly phase: ActivationFailedEvent['phase']
  readonly message: string
  readonly authority?: TransitionAuthority
  readonly binding?: {
    readonly pluginId: string
    readonly packageId: string
  }
}

const ARTIFACT_ID = /^artifact:[a-f0-9]{64}$/
const LEARNING_SIGNAL_ID = /^signal:[a-f0-9]{64}$/
const LEARNING_TICKET_ID = /^ticket:[a-f0-9]{64}$/
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  if (
    required.some(key => !(key in value)) ||
    keys.some(key => !allowed.has(key))
  ) {
    throw new LedgerIntegrityError('ledger event has an invalid shape')
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LedgerIntegrityError(`${label} must be a non-empty string`)
  }
  return value
}

function requireArtifactId(value: unknown): ArtifactId {
  const id = requireString(value, 'artifactId')
  if (!ARTIFACT_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid ArtifactId: ${id}`)
  }
  return id as ArtifactId
}

function requireDigest(value: unknown): Sha256Digest {
  const digest = requireString(value, 'digest')
  if (!SHA256_DIGEST.test(digest)) {
    throw new LedgerIntegrityError(`invalid SHA-256 digest: ${digest}`)
  }
  return digest as Sha256Digest
}

function requireSignalId(value: unknown): LearningSignalId {
  const id = requireString(value, 'signalId')
  if (!LEARNING_SIGNAL_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid LearningSignalId: ${id}`)
  }
  return id as LearningSignalId
}

function requireTicketId(value: unknown): LearningTicketId {
  const id = requireString(value, 'ticketId')
  if (!LEARNING_TICKET_ID.test(id)) {
    throw new LedgerIntegrityError(`invalid LearningTicketId: ${id}`)
  }
  return id as LearningTicketId
}

function requireTimestamp(value: unknown): string {
  const timestamp = requireString(value, 'timestamp')
  if (
    Number.isNaN(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) {
    throw new LedgerIntegrityError(`invalid timestamp: ${timestamp}`)
  }
  return timestamp
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new LedgerIntegrityError('revision must be a positive integer')
  }
  return value as number
}

function parseArtifact(value: unknown): ArtifactVersion {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('artifact must be an object')
  }
  exactKeys(
    value,
    ['artifactId', 'sourceDigest', 'createdAt'],
    ['parentArtifactId'],
  )
  const artifactId = requireArtifactId(value.artifactId)
  const sourceDigest = requireDigest(value.sourceDigest)
  if (artifactId.slice('artifact:'.length) !== sourceDigest.slice('sha256:'.length)) {
    throw new LedgerIntegrityError('ArtifactId must equal the source digest')
  }
  const parentArtifactId = value.parentArtifactId === undefined
    ? undefined
    : requireArtifactId(value.parentArtifactId)
  return {
    artifactId,
    ...(parentArtifactId === undefined ? {} : { parentArtifactId }),
    sourceDigest,
    createdAt: requireTimestamp(value.createdAt),
  }
}

function parseEvaluation(value: unknown): EvaluationRecord {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('evaluation must be an object')
  }
  exactKeys(value, ['artifactId', 'receiptDigest', 'verdict'])
  if (
    value.verdict !== 'met' &&
    value.verdict !== 'not_met' &&
    value.verdict !== 'inconclusive'
  ) {
    throw new LedgerIntegrityError('invalid evaluation verdict')
  }
  return {
    artifactId: requireArtifactId(value.artifactId),
    receiptDigest: requireDigest(value.receiptDigest),
    verdict: value.verdict,
  }
}

function parseApproval(value: unknown): ApprovalRecord {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('approval must be an object')
  }
  exactKeys(value, ['artifactId', 'authority', 'approvalId'])
  if (value.authority !== 'human') {
    throw new LedgerIntegrityError('approval authority must be human')
  }
  return {
    artifactId: requireArtifactId(value.artifactId),
    authority: 'human',
    approvalId: requireString(value.approvalId, 'approvalId'),
  }
}

function parseLearningInput(value: unknown): LearningIntakeInput {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning input must be an object')
  }
  exactKeys(
    value,
    [
      'sessionId',
      'messageId',
      'feedbackVersion',
      'rating',
      'scopeKey',
      'sessionDigest',
      'evidenceIds',
    ],
    ['note'],
  )
  if (value.rating !== 'positive' && value.rating !== 'negative') {
    throw new LedgerIntegrityError('invalid learning feedback rating')
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new LedgerIntegrityError('learning note must be a string')
  }
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('learning evidenceIds must be an array')
  }
  const input: LearningIntakeInput = {
    sessionId: requireString(value.sessionId, 'sessionId'),
    messageId: requireString(value.messageId, 'messageId'),
    feedbackVersion: requireString(value.feedbackVersion, 'feedbackVersion'),
    rating: value.rating,
    ...(value.note === undefined ? {} : { note: value.note }),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
  try {
    prepareLearningIntake(input)
  } catch (error) {
    throw new LedgerIntegrityError('learning input is invalid', {
      cause: error,
    })
  }
  return input
}

function parseLearningReceipt(
  value: unknown,
): Omit<LearningIntakeReceipt, 'duplicate'> {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning receipt must be an object')
  }
  exactKeys(value, ['decision', 'ingestionId'], ['signalId', 'ticketId'])
  if (
    value.decision !== 'no-case' &&
    value.decision !== 'observed-gap' &&
    value.decision !== 'ticket-created' &&
    value.decision !== 'ticket-merged'
  ) {
    throw new LedgerIntegrityError('invalid learning intake decision')
  }
  const signalId = value.signalId === undefined
    ? undefined
    : requireSignalId(value.signalId)
  const ticketId = value.ticketId === undefined
    ? undefined
    : requireTicketId(value.ticketId)
  const ticketDecision =
    value.decision === 'ticket-created' || value.decision === 'ticket-merged'
  if (
    ticketDecision
      ? signalId === undefined || ticketId === undefined
      : signalId !== undefined || ticketId !== undefined
  ) {
    throw new LedgerIntegrityError(
      'learning receipt identifiers disagree with its decision',
    )
  }
  return {
    decision: value.decision,
    ingestionId: requireDigest(value.ingestionId),
    ...(signalId === undefined ? {} : { signalId }),
    ...(ticketId === undefined ? {} : { ticketId }),
  }
}

function parseLearningSignal(value: unknown): LearningSignal {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('learning signal must be an object')
  }
  exactKeys(value, [
    'signalId',
    'ingestionId',
    'sessionId',
    'messageId',
    'feedbackVersion',
    'scopeKey',
    'problemFingerprint',
    'noteDigest',
    'sessionDigest',
    'evidenceIds',
  ])
  if (!Array.isArray(value.evidenceIds)) {
    throw new LedgerIntegrityError('learning signal evidenceIds must be an array')
  }
  return {
    signalId: requireSignalId(value.signalId),
    ingestionId: requireDigest(value.ingestionId),
    sessionId: requireString(value.sessionId, 'sessionId'),
    messageId: requireString(value.messageId, 'messageId'),
    feedbackVersion: requireString(value.feedbackVersion, 'feedbackVersion'),
    scopeKey: requireString(value.scopeKey, 'scopeKey'),
    problemFingerprint: requireDigest(value.problemFingerprint),
    noteDigest: requireDigest(value.noteDigest),
    sessionDigest: requireDigest(value.sessionDigest),
    evidenceIds: value.evidenceIds.map(requireDigest),
  }
}

function parseLearningEvent(
  value: Record<string, unknown>,
  at: string,
): LearningIntakeRecordedEvent {
  exactKeys(
    value,
    ['schemaVersion', 'type', 'at', 'input', 'inputDigest', 'receipt'],
    ['signal'],
  )
  if (value.schemaVersion !== 'tianwen.learning-intake.v1') {
    throw new LedgerIntegrityError('invalid learning intake schema version')
  }
  const input = parseLearningInput(value.input)
  const prepared = prepareLearningIntake(input)
  const inputDigest = requireDigest(value.inputDigest)
  const receipt = parseLearningReceipt(value.receipt)
  const signal = value.signal === undefined
    ? undefined
    : parseLearningSignal(value.signal)

  if (
    inputDigest !== prepared.inputDigest ||
    receipt.ingestionId !== prepared.ingestionId
  ) {
    throw new LedgerIntegrityError('learning event disagrees with its input')
  }
  if (prepared.kind !== 'explicit-correction') {
    if (receipt.decision !== prepared.kind || signal !== undefined) {
      throw new LedgerIntegrityError('learning observation has invalid output')
    }
  } else {
    if (
      (receipt.decision !== 'ticket-created' &&
        receipt.decision !== 'ticket-merged') ||
      receipt.signalId !== prepared.signalId ||
      receipt.ticketId !== prepared.ticketId ||
      signal === undefined ||
      signal.signalId !== prepared.signalId ||
      signal.ingestionId !== prepared.ingestionId ||
      signal.sessionId !== input.sessionId ||
      signal.messageId !== input.messageId ||
      signal.feedbackVersion !== input.feedbackVersion ||
      signal.scopeKey !== input.scopeKey ||
      signal.problemFingerprint !== prepared.problemFingerprint ||
      signal.noteDigest !== prepared.noteDigest ||
      signal.sessionDigest !== input.sessionDigest ||
      JSON.stringify(signal.evidenceIds) !== JSON.stringify(input.evidenceIds)
    ) {
      throw new LedgerIntegrityError('learning Signal disagrees with its input')
    }
  }

  return {
    schemaVersion: 'tianwen.learning-intake.v1',
    type: 'learning-intake-recorded',
    at,
    input,
    inputDigest,
    receipt,
    ...(signal === undefined ? {} : { signal }),
  }
}

function parseEvent(value: unknown): LedgerEvent {
  if (!isRecord(value)) {
    throw new LedgerIntegrityError('ledger event must be an object')
  }
  const type = requireString(value.type, 'event type')
  const at = requireTimestamp(value.at)
  if (type === 'learning-intake-recorded') {
    return parseLearningEvent(value, at)
  }
  if (type === 'artifact-recorded') {
    exactKeys(value, ['type', 'at', 'artifact'])
    const artifact = parseArtifact(value.artifact)
    if (artifact.createdAt !== at) {
      throw new LedgerIntegrityError('artifact timestamp disagrees with event')
    }
    return { type, at, artifact }
  }
  if (type === 'evaluation-recorded') {
    exactKeys(value, ['type', 'at', 'evaluation'])
    return {
      type,
      at,
      evaluation: parseEvaluation(value.evaluation),
    }
  }
  if (type === 'approval-recorded') {
    exactKeys(value, ['type', 'at', 'approval'])
    return {
      type,
      at,
      approval: parseApproval(value.approval),
    }
  }
  if (type === 'promoted' || type === 'rolled-back') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'revision', 'receiptDigest', 'approvalId'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      revision: requireRevision(value.revision),
      receiptDigest: requireDigest(value.receiptDigest),
      approvalId: requireString(value.approvalId, 'approvalId'),
    }
  }
  if (type === 'runtime-bound') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'pluginId', 'packageId'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      pluginId: requireString(value.pluginId, 'pluginId'),
      packageId: requireString(value.packageId, 'packageId'),
    }
  }
  if (type === 'activation-failed') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'phase', 'message'],
      ['receiptDigest', 'approvalId', 'pluginId', 'packageId'],
    )
    if (
      value.phase !== 'promotion' &&
      value.phase !== 'rollback' &&
      value.phase !== 'rehydrate'
    ) {
      throw new LedgerIntegrityError('invalid activation failure phase')
    }
    const receiptDigest = value.receiptDigest === undefined
      ? undefined
      : requireDigest(value.receiptDigest)
    const approvalId = value.approvalId === undefined
      ? undefined
      : requireString(value.approvalId, 'approvalId')
    const pluginId = value.pluginId === undefined
      ? undefined
      : requireString(value.pluginId, 'pluginId')
    const packageId = value.packageId === undefined
      ? undefined
      : requireString(value.packageId, 'packageId')
    if ((receiptDigest === undefined) !== (approvalId === undefined)) {
      throw new LedgerIntegrityError(
        'activation authority digest and approval must appear together',
      )
    }
    if ((pluginId === undefined) !== (packageId === undefined)) {
      throw new LedgerIntegrityError(
        'activation plugin and package IDs must appear together',
      )
    }
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      phase: value.phase,
      message: requireString(value.message, 'activation failure message'),
      ...(receiptDigest === undefined ? {} : { receiptDigest }),
      ...(approvalId === undefined ? {} : { approvalId }),
      ...(pluginId === undefined ? {} : { pluginId }),
      ...(packageId === undefined ? {} : { packageId }),
    }
  }
  if (type === 'recovery-failed') {
    exactKeys(
      value,
      ['type', 'at', 'artifactId', 'previousArtifactId', 'message'],
    )
    return {
      type,
      at,
      artifactId: requireArtifactId(value.artifactId),
      previousArtifactId: requireArtifactId(value.previousArtifactId),
      message: requireString(value.message, 'recovery failure message'),
    }
  }
  throw new LedgerIntegrityError(`unknown ledger event type: ${type}`)
}

function canonicalLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

function writeAllSync(descriptor: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  let offset = 0
  while (offset < bytes.length) {
    const written = writeSync(
      descriptor,
      bytes,
      offset,
      bytes.length - offset,
    )
    if (written <= 0) {
      throw new Error('file write made no progress')
    }
    offset += written
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class EvolutionLedger {
  readonly #root: string
  readonly #artifactsRoot: string
  readonly #ledgerPath: string
  readonly #pointerPath: string
  readonly #clock: () => string
  readonly #events: LedgerEvent[] = []
  readonly #learningIntakes = new Map<
    Sha256Digest,
    LearningIntakeRecordedEvent
  >()
  readonly #learningSignals = new Map<LearningSignalId, LearningSignal>()
  readonly #learningTickets = new Map<LearningTicketId, LearningTicket>()
  readonly #artifacts = new Map<ArtifactId, ArtifactVersion>()
  readonly #evaluations = new Map<ArtifactId, EvaluationRecord>()
  readonly #approvals = new Map<ArtifactId, ApprovalRecord[]>()
  readonly #approvalIds = new Set<string>()
  readonly #usedApprovals = new Set<string>()
  readonly #promoted = new Set<ArtifactId>()
  #champion: ChampionPointer | undefined

  constructor(root: string, options: EvolutionLedgerOptions = {}) {
    this.#root = root
    this.#artifactsRoot = join(root, 'artifacts')
    this.#ledgerPath = join(root, 'ledger.jsonl')
    this.#pointerPath = join(root, 'champion.json')
    this.#clock = options.clock ?? (() => new Date().toISOString())
    mkdirSync(this.#artifactsRoot, { recursive: true })
    this.#replay()
    for (const artifact of this.#artifacts.values()) {
      this.#verifySource(artifact)
    }
    this.#verifyPointer()
  }

  recordLearningIntake(input: LearningIntakeInput): LearningIntakeReceipt {
    const parsedInput = parseLearningInput(input)
    const prepared = prepareLearningIntake(parsedInput)
    const existing = this.#learningIntakes.get(prepared.ingestionId)
    if (existing !== undefined) {
      if (existing.inputDigest !== prepared.inputDigest) {
        throw new LedgerIntegrityError(
          `learning ingestion replay changed content: ${prepared.ingestionId}`,
        )
      }
      return { ...existing.receipt, duplicate: true }
    }

    const decision: LearningIntakeReceipt['decision'] =
      prepared.kind === 'explicit-correction'
        ? this.#learningTickets.has(prepared.ticketId)
          ? 'ticket-merged'
          : 'ticket-created'
        : prepared.kind
    const signal: LearningSignal | undefined =
      prepared.kind === 'explicit-correction'
        ? {
            signalId: prepared.signalId,
            ingestionId: prepared.ingestionId,
            sessionId: parsedInput.sessionId,
            messageId: parsedInput.messageId,
            feedbackVersion: parsedInput.feedbackVersion,
            scopeKey: parsedInput.scopeKey,
            problemFingerprint: prepared.problemFingerprint,
            noteDigest: prepared.noteDigest,
            sessionDigest: parsedInput.sessionDigest,
            evidenceIds: parsedInput.evidenceIds,
          }
        : undefined
    const receipt: Omit<LearningIntakeReceipt, 'duplicate'> = {
      decision,
      ingestionId: prepared.ingestionId,
      ...(prepared.kind === 'explicit-correction'
        ? {
            signalId: prepared.signalId,
            ticketId: prepared.ticketId,
          }
        : {}),
    }
    this.#accept({
      schemaVersion: 'tianwen.learning-intake.v1',
      type: 'learning-intake-recorded',
      at: this.#now(),
      input: parsedInput,
      inputDigest: prepared.inputDigest,
      receipt,
      ...(signal === undefined ? {} : { signal }),
    })
    return { ...receipt, duplicate: false }
  }

  listLearningSignals(): readonly LearningSignal[] {
    return clone([...this.#learningSignals.values()])
  }

  listLearningTickets(): readonly LearningTicket[] {
    return clone([...this.#learningTickets.values()])
  }

  recordArtifact(
    source: string,
    parentArtifactId?: ArtifactId,
  ): ArtifactVersion {
    if (parentArtifactId !== undefined && !this.#artifacts.has(parentArtifactId)) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        parentArtifactId,
        `parent Artifact is not recorded: ${parentArtifactId}`,
      )
    }
    const bytes = Buffer.from(source, 'utf8')
    const hex = createHash('sha256').update(bytes).digest('hex')
    const artifactId = `artifact:${hex}` as ArtifactId
    const sourceDigest = `sha256:${hex}` as Sha256Digest
    const existing = this.#artifacts.get(artifactId)
    if (existing !== undefined) {
      this.#verifySource(existing, bytes)
      if (existing.parentArtifactId !== parentArtifactId) {
        throw new LedgerIntegrityError(
          `Artifact replay changed parent metadata: ${artifactId}`,
        )
      }
      return clone(existing)
    }

    const sourcePath = this.#sourcePath(sourceDigest)
    let descriptor: number | undefined
    let created = false
    try {
      descriptor = openSync(sourcePath, 'wx')
      created = true
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor)
        descriptor = undefined
      }
      if (created) {
        if (existsSync(sourcePath)) {
          unlinkSync(sourcePath)
        }
        throw error
      }
      if (
        !isRecord(error) ||
        error.code !== 'EEXIST'
      ) {
        throw error
      }
      const stored = readFileSync(sourcePath)
      if (!stored.equals(bytes)) {
        throw new LedgerIntegrityError(
          `immutable source differs at ${sourceDigest}`,
          { cause: error },
        )
      }
    }

    const createdAt = this.#now()
    const artifact: ArtifactVersion = {
      artifactId,
      ...(parentArtifactId === undefined ? {} : { parentArtifactId }),
      sourceDigest,
      createdAt,
    }
    this.#accept({
      type: 'artifact-recorded',
      at: createdAt,
      artifact,
    })
    return clone(artifact)
  }

  recordEvaluation(record: EvaluationRecord): void {
    const evaluation = parseEvaluation(record)
    this.#accept({
      type: 'evaluation-recorded',
      at: this.#now(),
      evaluation,
    })
  }

  recordApproval(record: ApprovalRecord): void {
    const approval = parseApproval(record)
    this.#accept({
      type: 'approval-recorded',
      at: this.#now(),
      approval,
    })
  }

  prepareTransition(
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): TransitionAuthority {
    const artifact = this.#artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        artifactId,
        `Artifact is not recorded: ${artifactId}`,
      )
    }
    if (this.#champion?.artifactId === artifactId) {
      throw new EvolutionGovernanceError(
        'already-champion',
        artifactId,
        `Artifact is already Champion: ${artifactId}`,
      )
    }
    if (kind === 'promotion' && this.#promoted.has(artifactId)) {
      throw new EvolutionGovernanceError(
        'rollback-required',
        artifactId,
        `previously promoted Artifact requires rollback: ${artifactId}`,
      )
    }
    if (
      kind === 'rollback' &&
      (this.#champion === undefined || !this.#promoted.has(artifactId))
    ) {
      throw new EvolutionGovernanceError(
        'rollback-target-required',
        artifactId,
        `Artifact is not a prior Champion: ${artifactId}`,
      )
    }

    const evaluation = this.#evaluations.get(artifactId)
    if (evaluation === undefined) {
      throw new EvolutionGovernanceError(
        'evaluation-required',
        artifactId,
        `Artifact has no evaluation: ${artifactId}`,
      )
    }
    if (evaluation.verdict !== 'met') {
      throw new EvolutionGovernanceError(
        'evaluation-not-met',
        artifactId,
        `Artifact evaluation is ${evaluation.verdict}: ${artifactId}`,
      )
    }
    const approval = this.#unusedApproval(artifactId)
    if (approval === undefined) {
      throw new EvolutionGovernanceError(
        'human-approval-required',
        artifactId,
        `Artifact has no unused human approval: ${artifactId}`,
      )
    }
    return {
      artifact: clone(artifact),
      evaluation: clone(evaluation),
      approval: clone(approval),
    }
  }

  promote(artifactId: ArtifactId): ChampionPointer {
    return this.#transition(artifactId, 'promotion')
  }

  rollback(artifactId: ArtifactId): ChampionPointer {
    return this.#transition(artifactId, 'rollback')
  }

  recordRuntimeBinding(
    artifactId: ArtifactId,
    pluginId: string,
    packageId: string,
  ): void {
    this.#accept({
      type: 'runtime-bound',
      at: this.#now(),
      artifactId,
      pluginId,
      packageId,
    })
  }

  recordActivationFailed(failure: ActivationFailure): void {
    const authority = failure.authority
    const binding = failure.binding
    this.#accept({
      type: 'activation-failed',
      at: this.#now(),
      artifactId: failure.artifactId,
      phase: failure.phase,
      message: failure.message,
      ...(authority === undefined
        ? {}
        : {
            receiptDigest: authority.evaluation.receiptDigest,
            approvalId: authority.approval.approvalId,
          }),
      ...(binding === undefined
        ? {}
        : {
            pluginId: binding.pluginId,
            packageId: binding.packageId,
          }),
    })
  }

  recordRecoveryFailed(
    artifactId: ArtifactId,
    previousArtifactId: ArtifactId,
    message: string,
  ): void {
    this.#accept({
      type: 'recovery-failed',
      at: this.#now(),
      artifactId,
      previousArtifactId,
      message,
    })
  }

  readSource(artifactId: ArtifactId): string {
    const artifact = this.#artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new EvolutionGovernanceError(
        'artifact-missing',
        artifactId,
        `Artifact is not recorded: ${artifactId}`,
      )
    }
    const bytes = this.#verifySource(artifact)
    try {
      return UTF8.decode(bytes)
    } catch (error) {
      throw new LedgerIntegrityError(
        `Artifact source is not valid UTF-8: ${artifactId}`,
        { cause: error },
      )
    }
  }

  getChampion(): ChampionPointer | undefined {
    return this.#champion === undefined
      ? undefined
      : clone(this.#champion)
  }

  listEvents(): readonly LedgerEvent[] {
    return clone(this.#events)
  }

  hasRecoveryFailure(): boolean {
    return this.#events.some(event => event.type === 'recovery-failed')
  }

  #transition(
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): ChampionPointer {
    const authority = this.prepareTransition(artifactId, kind)
    const pointer: ChampionPointer = {
      artifactId,
      revision: (this.#champion?.revision ?? 0) + 1,
    }
    this.#accept({
      type: kind === 'promotion' ? 'promoted' : 'rolled-back',
      at: this.#now(),
      artifactId,
      revision: pointer.revision,
      receiptDigest: authority.evaluation.receiptDigest,
      approvalId: authority.approval.approvalId,
    })
    this.#writePointer(pointer)
    return clone(pointer)
  }

  #now(): string {
    return requireTimestamp(this.#clock())
  }

  #sourcePath(digest: Sha256Digest): string {
    return join(
      this.#artifactsRoot,
      `sha256-${digest.slice('sha256:'.length)}.mjs`,
    )
  }

  #verifySource(
    artifact: ArtifactVersion,
    expectedBytes?: Buffer,
  ): Buffer {
    let bytes: Buffer
    try {
      bytes = readFileSync(this.#sourcePath(artifact.sourceDigest))
    } catch (error) {
      throw new LedgerIntegrityError(
        `immutable source is unavailable: ${artifact.sourceDigest}`,
        { cause: error },
      )
    }
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (`sha256:${actual}` !== artifact.sourceDigest) {
      throw new LedgerIntegrityError(
        `immutable source digest mismatch: ${artifact.sourceDigest}`,
      )
    }
    if (expectedBytes !== undefined && !bytes.equals(expectedBytes)) {
      throw new LedgerIntegrityError(
        `immutable source differs at ${artifact.sourceDigest}`,
      )
    }
    return bytes
  }

  #unusedApproval(artifactId: ArtifactId): ApprovalRecord | undefined {
    return this.#approvals.get(artifactId)
      ?.findLast(record => !this.#usedApprovals.has(record.approvalId))
  }

  #accept(event: LedgerEvent): void {
    const parsed = parseEvent(event)
    this.#validateAgainstState(parsed)
    const line = canonicalLine(parsed)
    const descriptor = openSync(this.#ledgerPath, 'a')
    let commitError: unknown
    try {
      writeAllSync(descriptor, line)
      fsyncSync(descriptor)
    } catch (error) {
      commitError = error
    }
    try {
      closeSync(descriptor)
    } catch (error) {
      commitError ??= error
    }
    if (commitError !== undefined) {
      throw new LedgerCommitUnknownError(
        'ledger append started but its durable commit is unknown',
        { cause: commitError },
      )
    }
    this.#apply(parsed)
  }

  #validateAgainstState(event: LedgerEvent): void {
    if (event.type === 'learning-intake-recorded') {
      if (this.#learningIntakes.has(event.receipt.ingestionId)) {
        throw new LedgerIntegrityError(
          `duplicate learning ingestion: ${event.receipt.ingestionId}`,
        )
      }
      if (event.signal === undefined) {
        return
      }
      if (this.#learningSignals.has(event.signal.signalId)) {
        throw new LedgerIntegrityError(
          `duplicate LearningSignal: ${event.signal.signalId}`,
        )
      }
      const ticketId = event.receipt.ticketId!
      const ticket = this.#learningTickets.get(ticketId)
      if (ticket === undefined) {
        if (event.receipt.decision !== 'ticket-created') {
          throw new LedgerIntegrityError(
            `new LearningTicket must use ticket-created: ${ticketId}`,
          )
        }
      } else if (
        event.receipt.decision !== 'ticket-merged' ||
        ticket.problemFingerprint !== event.signal.problemFingerprint
      ) {
        throw new LedgerIntegrityError(
          `LearningTicket merge disagrees with history: ${ticketId}`,
        )
      }
      return
    }
    if (event.type === 'artifact-recorded') {
      if (this.#artifacts.has(event.artifact.artifactId)) {
        throw new LedgerIntegrityError(
          `duplicate Artifact event: ${event.artifact.artifactId}`,
        )
      }
      if (
        event.artifact.parentArtifactId !== undefined &&
        !this.#artifacts.has(event.artifact.parentArtifactId)
      ) {
        throw new LedgerIntegrityError(
          `Artifact parent is not recorded: ${event.artifact.parentArtifactId}`,
        )
      }
      return
    }
    const artifactId = event.type === 'evaluation-recorded'
      ? event.evaluation.artifactId
      : event.type === 'approval-recorded'
        ? event.approval.artifactId
        : event.artifactId
    if (!this.#artifacts.has(artifactId)) {
      throw new LedgerIntegrityError(
        `event references unknown Artifact: ${artifactId}`,
      )
    }
    if (event.type === 'evaluation-recorded' || event.type === 'runtime-bound') {
      return
    }
    if (event.type === 'approval-recorded') {
      if (this.#approvalIds.has(event.approval.approvalId)) {
        throw new LedgerIntegrityError(
          `duplicate approvalId: ${event.approval.approvalId}`,
        )
      }
      return
    }
    if (event.type === 'promoted' || event.type === 'rolled-back') {
      const expectedRevision = (this.#champion?.revision ?? 0) + 1
      if (event.revision !== expectedRevision) {
        throw new LedgerIntegrityError(
          `Champion revision must be ${expectedRevision}`,
        )
      }
      if (this.#champion?.artifactId === event.artifactId) {
        throw new LedgerIntegrityError('Champion transition is a no-op')
      }
      if (
        event.type === 'promoted' &&
        this.#promoted.has(event.artifactId)
      ) {
        throw new LedgerIntegrityError(
          'previously promoted Artifact must use rollback',
        )
      }
      if (
        event.type === 'rolled-back' &&
        (this.#champion === undefined || !this.#promoted.has(event.artifactId))
      ) {
        throw new LedgerIntegrityError('rollback target was never Champion')
      }
      this.#validateAuthority(
        event.artifactId,
        event.receiptDigest,
        event.approvalId,
      )
      return
    }
    if (event.type === 'activation-failed') {
      if (event.approvalId !== undefined && event.receiptDigest !== undefined) {
        this.#validateAuthority(
          event.artifactId,
          event.receiptDigest,
          event.approvalId,
        )
      }
      return
    }
    if (event.type !== 'recovery-failed') {
      throw new LedgerIntegrityError(
        `unhandled ledger event type: ${event.type}`,
      )
    }
    if (!this.#artifacts.has(event.previousArtifactId)) {
      throw new LedgerIntegrityError(
        `recovery references unknown Champion: ${event.previousArtifactId}`,
      )
    }
  }

  #validateAuthority(
    artifactId: ArtifactId,
    receiptDigest: Sha256Digest,
    approvalId: string,
  ): void {
    const evaluation = this.#evaluations.get(artifactId)
    if (
      evaluation?.verdict !== 'met' ||
      evaluation.receiptDigest !== receiptDigest
    ) {
      throw new LedgerIntegrityError(
        `transition lacks matching met evaluation: ${artifactId}`,
      )
    }
    const approval = this.#approvals.get(artifactId)
      ?.find(record => record.approvalId === approvalId)
    if (approval === undefined || this.#usedApprovals.has(approvalId)) {
      throw new LedgerIntegrityError(
        `transition lacks unused human approval: ${artifactId}`,
      )
    }
  }

  #apply(event: LedgerEvent): void {
    this.#events.push(event)
    if (event.type === 'learning-intake-recorded') {
      this.#learningIntakes.set(event.receipt.ingestionId, event)
      if (event.signal === undefined) {
        return
      }
      this.#learningSignals.set(event.signal.signalId, event.signal)
      const ticketId = event.receipt.ticketId!
      const ticket = this.#learningTickets.get(ticketId)
      this.#learningTickets.set(ticketId, ticket === undefined
        ? {
            ticketId,
            problemFingerprint: event.signal.problemFingerprint,
            status: 'open',
            signalIds: [event.signal.signalId],
          }
        : {
            ...ticket,
            signalIds: [...ticket.signalIds, event.signal.signalId],
          })
      return
    }
    if (event.type === 'artifact-recorded') {
      this.#artifacts.set(event.artifact.artifactId, event.artifact)
      return
    }
    if (event.type === 'evaluation-recorded') {
      this.#evaluations.set(event.evaluation.artifactId, event.evaluation)
      return
    }
    if (event.type === 'approval-recorded') {
      const records = this.#approvals.get(event.approval.artifactId) ?? []
      records.push(event.approval)
      this.#approvals.set(event.approval.artifactId, records)
      this.#approvalIds.add(event.approval.approvalId)
      return
    }
    if (event.type === 'promoted' || event.type === 'rolled-back') {
      this.#usedApprovals.add(event.approvalId)
      this.#promoted.add(event.artifactId)
      this.#champion = {
        artifactId: event.artifactId,
        revision: event.revision,
      }
      return
    }
    if (
      event.type === 'activation-failed' &&
      event.approvalId !== undefined
    ) {
      this.#usedApprovals.add(event.approvalId)
    }
  }

  #replay(): void {
    if (!existsSync(this.#ledgerPath)) {
      return
    }
    let serialized: string
    try {
      serialized = UTF8.decode(readFileSync(this.#ledgerPath))
    } catch (error) {
      throw new LedgerIntegrityError('ledger.jsonl is not valid UTF-8', {
        cause: error,
      })
    }
    if (serialized.length === 0) {
      return
    }
    if (!serialized.endsWith('\n') || serialized.includes('\r')) {
      throw new LedgerIntegrityError(
        'ledger.jsonl must use one canonical JSON object plus LF per event',
      )
    }
    for (const line of serialized.slice(0, -1).split('\n')) {
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch (error) {
        throw new LedgerIntegrityError('ledger.jsonl contains invalid JSON', {
          cause: error,
        })
      }
      if (JSON.stringify(value) !== line) {
        throw new LedgerIntegrityError('ledger event is not canonical JSON')
      }
      const event = parseEvent(value)
      this.#validateAgainstState(event)
      this.#apply(event)
    }
  }

  #verifyPointer(): void {
    if (this.#champion === undefined) {
      if (existsSync(this.#pointerPath)) {
        throw new LedgerIntegrityError(
          'champion.json exists without a ledger Champion',
        )
      }
      return
    }
    if (!existsSync(this.#pointerPath)) {
      if (this.#champion.revision === 1) {
        this.#writePointer(this.#champion)
        return
      }
      throw new LedgerIntegrityError(
        'champion.json is missing for the ledger Champion',
      )
    }
    let serialized: string
    let value: unknown
    try {
      serialized = UTF8.decode(readFileSync(this.#pointerPath))
      value = JSON.parse(serialized)
    } catch (error) {
      throw new LedgerIntegrityError('champion.json is invalid', {
        cause: error,
      })
    }
    if (serialized !== canonicalLine(value) || !isRecord(value)) {
      throw new LedgerIntegrityError('champion.json is not canonical JSON')
    }
    exactKeys(value, ['artifactId', 'revision'])
    const pointer: ChampionPointer = {
      artifactId: requireArtifactId(value.artifactId),
      revision: requireRevision(value.revision),
    }
    if (
      pointer.artifactId !== this.#champion.artifactId ||
      pointer.revision !== this.#champion.revision
    ) {
      const previous = this.#previousChampion()
      if (
        previous !== undefined &&
        pointer.artifactId === previous.artifactId &&
        pointer.revision === previous.revision &&
        this.#champion.revision === previous.revision + 1
      ) {
        this.#writePointer(this.#champion)
        return
      }
      throw new LedgerIntegrityError(
        'champion.json disagrees with ledger replay',
      )
    }
  }

  #previousChampion(): ChampionPointer | undefined {
    const transitions = this.#events.filter(
      (event): event is TransitionEvent =>
        event.type === 'promoted' || event.type === 'rolled-back',
    )
    const previous = transitions.at(-2)
    if (previous === undefined) {
      return undefined
    }
    return {
      artifactId: previous.artifactId,
      revision: previous.revision,
    }
  }

  #writePointer(pointer: ChampionPointer): void {
    const temporary = join(
      this.#root,
      `.champion-${randomUUID()}.tmp`,
    )
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporary, 'wx')
      writeAllSync(descriptor, canonicalLine(pointer))
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
      renameSync(temporary, this.#pointerPath)
    } finally {
      if (descriptor !== undefined) {
        closeSync(descriptor)
      }
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
}
