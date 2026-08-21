import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import { canonicalEvidenceDigest } from '@tianwen/evidence/projector'
import { prepareRunAcceptanceContract } from '@tianwen/runtime/run-binding'
import type { RunBindingInputV2 } from '@tianwen/runtime/run-binding'

const MAX_CANONICAL_BYTES = 16 * 1024
const MAX_DEPTH = 16
const LABEL = /^[A-Za-z0-9._:/-]+$/u
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/u
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u

export interface NaturalRunTrialManifest {
  readonly schemaVersion: 'tianwen.natural-run-trial.v1'
  readonly goalId: string
  readonly taskRef: string
  readonly scopeKey: string
  readonly parentSkillName: string
  readonly acceptanceContract: RunBindingInputV2['acceptanceContract']
  readonly verifierArguments: Readonly<Record<string, unknown>>
}

export interface PreparedNaturalRunTrialManifest {
  readonly manifest: NaturalRunTrialManifest
  readonly manifestDigest: `sha256:${string}`
  readonly acceptanceSubjectDigest: `sha256:${string}`
}

export const NATURAL_RUN_TRIAL_FAILURE_CODES = [
  'manifest-revalidation-failed',
  'services-unavailable',
  'agent-resume-failed',
  'session-goal-preflight-failed',
  'verifier-unavailable',
  'run-binding-precondition-failed',
  'skill-unavailable',
  'skill-not-model-invocable',
  'run-binding-persistence-failed',
  'pre-turn-internal-error',
] as const

export type NaturalRunTrialFailureCode =
  typeof NATURAL_RUN_TRIAL_FAILURE_CODES[number]

export interface NaturalRunTrialSettledReceipt {
  readonly schemaVersion: 'tianwen.natural-run-trial-receipt.v1'
  readonly status: 'settled' | 'settled-with-learning-error'
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly phase: 'paused' | 'blocked' | 'complete'
  }
  readonly session: {
    readonly id: string
    readonly eventCountDelta: number
    readonly unchangedByGovernance: boolean
  }
  readonly run: {
    readonly runId: string
    readonly acceptanceSubjectDigest: `sha256:${string}`
    readonly acceptanceEvidenceId?: `sha256:${string}`
  }
  readonly learning: {
    readonly decision:
      | 'no-case'
      | 'continue-observing'
      | 'ordinary-correction'
      | 'signal-recorded'
      | 'ticket-created'
      | 'ticket-merged'
      | 'not-recorded'
    readonly reason?:
      | 'persistence-unavailable'
      | 'verifier-evidence-missing'
      | 'verifier-call-mismatch'
      | 'evidence-projection-failed'
      | 'outcome-intake-failed'
      | 'outcome-evidence-mismatch'
      | 'skill-use-intake-failed'
      | 'governance-session-changed'
    readonly ticketId?: string
    readonly skillUse: 'recorded' | 'no-use-proof' | 'not-attempted'
  }
  readonly usage: {
    readonly modelRequests: number
    readonly toolCalls: number
    readonly tokens?: {
      readonly inputTokens: number
      readonly outputTokens: number
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
      readonly reasoningTokens?: number
    }
    readonly exactCny: 'unavailable'
  }
}

export interface NaturalRunTrialFailureReceipt {
  readonly schemaVersion: 'tianwen.natural-run-trial-receipt.v1'
  readonly status: 'pre-turn-failed'
  readonly failureCode: NaturalRunTrialFailureCode
  readonly goal: { readonly id: string }
  readonly session: { readonly id: string }
  readonly usage: {
    readonly modelRequests: 0
    readonly toolCalls: 0
    readonly exactCny: 'unavailable'
  }
}

export type NaturalRunTrialReceipt =
  | NaturalRunTrialSettledReceipt
  | NaturalRunTrialFailureReceipt

export function createNaturalRunTrialFailure(
  failureCode: NaturalRunTrialFailureCode,
  input: { readonly goalId: string, readonly sessionId: string },
): NaturalRunTrialFailureReceipt {
  return {
    schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
    status: 'pre-turn-failed',
    failureCode,
    goal: { id: input.goalId },
    session: { id: input.sessionId },
    usage: { modelRequests: 0, toolCalls: 0, exactCny: 'unavailable' },
  }
}

const SHA_256_DIGEST = /^sha256:[0-9a-f]{64}$/u

const LEARNING_DECISIONS = [
  'no-case',
  'continue-observing',
  'ordinary-correction',
  'signal-recorded',
  'ticket-created',
  'ticket-merged',
  'not-recorded',
] as const

const LEARNING_REASONS = [
  'persistence-unavailable',
  'verifier-evidence-missing',
  'verifier-call-mismatch',
  'evidence-projection-failed',
  'outcome-intake-failed',
  'outcome-evidence-mismatch',
  'skill-use-intake-failed',
  'governance-session-changed',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value)
  if (
    actual.length !== keys.length
    || keys.some(key => !(key in value))
    || actual.some(key => !keys.includes(key))
  ) {
    throw new TypeError('natural Run trial manifest has an invalid shape')
  }
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) {
    throw new TypeError('natural Run trial receipt has an invalid shape')
  }
}

function requireKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (keys.some(key => !(key in value))) {
    throw new TypeError('natural Run trial receipt has an invalid shape')
  }
}

function safeCounter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('natural Run trial receipt has an invalid counter')
  }
  return value
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== 'string' || !SHA_256_DIGEST.test(value)) {
    throw new TypeError('natural Run trial receipt has an invalid digest')
  }
  return value as `sha256:${string}`
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('natural Run trial receipt has an invalid string')
  }
  return value
}

function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new TypeError('natural Run trial receipt has an invalid enum')
  }
  return value as T[number]
}

export function parseNaturalRunTrialChildReceipt(
  stdout: string,
  stderr: string,
  expected: { readonly goalId: string, readonly sessionId: string },
): NaturalRunTrialReceipt {
  if (stderr !== '') throw new TypeError('natural Run trial child wrote stderr')
  let value: unknown
  try { value = JSON.parse(stdout) as unknown } catch {
    throw new TypeError('natural Run trial child receipt is invalid JSON')
  }
  if (!isRecord(value)) throw new TypeError('natural Run trial receipt must be an object')
  if (value.schemaVersion !== 'tianwen.natural-run-trial-receipt.v1') {
    throw new TypeError('natural Run trial receipt schema version is invalid')
  }
  const status = oneOf(value.status, [
    'settled', 'settled-with-learning-error', 'pre-turn-failed',
  ] as const)

  if (status === 'pre-turn-failed') {
    exactKeys(value, ['schemaVersion', 'status', 'failureCode', 'goal', 'session', 'usage'])
    if (!isRecord(value.goal)) throw new TypeError('natural Run trial receipt Goal is invalid')
    exactKeys(value.goal, ['id'])
    const goalId = nonEmptyString(value.goal.id)
    if (goalId !== expected.goalId) throw new TypeError('natural Run trial receipt Goal does not match')

    if (!isRecord(value.session)) throw new TypeError('natural Run trial receipt Session is invalid')
    exactKeys(value.session, ['id'])
    const sessionId = nonEmptyString(value.session.id)
    if (sessionId !== expected.sessionId) throw new TypeError('natural Run trial receipt Session does not match')

    if (!isRecord(value.usage)) throw new TypeError('natural Run trial receipt usage is invalid')
    exactKeys(value.usage, ['modelRequests', 'toolCalls', 'exactCny'])
    if (
      value.usage.modelRequests !== 0
      || value.usage.toolCalls !== 0
      || value.usage.exactCny !== 'unavailable'
    ) {
      throw new TypeError('natural Run trial failure receipt usage is invalid')
    }
    return createNaturalRunTrialFailure(
      oneOf(value.failureCode, NATURAL_RUN_TRIAL_FAILURE_CODES),
      { goalId, sessionId },
    )
  }

  exactKeys(value, ['schemaVersion', 'status', 'goal', 'session', 'run', 'learning', 'usage'])

  if (!isRecord(value.goal)) throw new TypeError('natural Run trial receipt Goal is invalid')
  exactKeys(value.goal, ['id', 'revision', 'phase'])
  const goal = {
    id: nonEmptyString(value.goal.id),
    revision: safeCounter(value.goal.revision),
    phase: oneOf(value.goal.phase, ['paused', 'blocked', 'complete'] as const),
  }
  if (goal.id !== expected.goalId) throw new TypeError('natural Run trial receipt Goal does not match')

  if (!isRecord(value.session)) throw new TypeError('natural Run trial receipt Session is invalid')
  exactKeys(value.session, ['id', 'eventCountDelta', 'unchangedByGovernance'])
  const unchangedByGovernance = value.session.unchangedByGovernance
  if (typeof unchangedByGovernance !== 'boolean') {
    throw new TypeError('natural Run trial receipt Session is invalid')
  }
  const session = {
    id: nonEmptyString(value.session.id),
    eventCountDelta: safeCounter(value.session.eventCountDelta),
    unchangedByGovernance,
  }
  if (session.id !== expected.sessionId) throw new TypeError('natural Run trial receipt Session does not match')

  if (!isRecord(value.run)) throw new TypeError('natural Run trial receipt Run is invalid')
  onlyKeys(value.run, ['runId', 'acceptanceSubjectDigest', 'acceptanceEvidenceId'])
  requireKeys(value.run, ['runId', 'acceptanceSubjectDigest'])
  const run = {
    runId: nonEmptyString(value.run.runId),
    acceptanceSubjectDigest: digest(value.run.acceptanceSubjectDigest),
    ...(value.run.acceptanceEvidenceId === undefined
      ? {} : { acceptanceEvidenceId: digest(value.run.acceptanceEvidenceId) }),
  }

  if (!isRecord(value.learning)) throw new TypeError('natural Run trial receipt learning is invalid')
  onlyKeys(value.learning, ['decision', 'reason', 'ticketId', 'skillUse'])
  requireKeys(value.learning, ['decision', 'skillUse'])
  const learning = {
    decision: oneOf(value.learning.decision, LEARNING_DECISIONS),
    ...(value.learning.reason === undefined
      ? {} : { reason: oneOf(value.learning.reason, LEARNING_REASONS) }),
    ...(value.learning.ticketId === undefined
      ? {} : { ticketId: nonEmptyString(value.learning.ticketId) }),
    skillUse: oneOf(value.learning.skillUse, ['recorded', 'no-use-proof', 'not-attempted'] as const),
  }

  if (!isRecord(value.usage)) throw new TypeError('natural Run trial receipt usage is invalid')
  onlyKeys(value.usage, ['modelRequests', 'toolCalls', 'tokens', 'exactCny'])
  requireKeys(value.usage, ['modelRequests', 'toolCalls', 'exactCny'])
  let tokens: NaturalRunTrialSettledReceipt['usage']['tokens'] | undefined
  if (value.usage.tokens !== undefined) {
    if (!isRecord(value.usage.tokens)) throw new TypeError('natural Run trial receipt tokens are invalid')
    onlyKeys(value.usage.tokens, [
      'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
    ])
    requireKeys(value.usage.tokens, ['inputTokens', 'outputTokens'])
    tokens = {
      inputTokens: safeCounter(value.usage.tokens.inputTokens),
      outputTokens: safeCounter(value.usage.tokens.outputTokens),
      ...(value.usage.tokens.cacheReadTokens === undefined
        ? {} : { cacheReadTokens: safeCounter(value.usage.tokens.cacheReadTokens) }),
      ...(value.usage.tokens.cacheWriteTokens === undefined
        ? {} : { cacheWriteTokens: safeCounter(value.usage.tokens.cacheWriteTokens) }),
      ...(value.usage.tokens.reasoningTokens === undefined
        ? {} : { reasoningTokens: safeCounter(value.usage.tokens.reasoningTokens) }),
    }
  }
  if (value.usage.exactCny !== 'unavailable') {
    throw new TypeError('natural Run trial receipt exact CNY is invalid')
  }
  return {
    schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
    status,
    goal,
    session,
    run,
    learning,
    usage: {
      modelRequests: safeCounter(value.usage.modelRequests),
      toolCalls: safeCounter(value.usage.toolCalls),
      ...(tokens === undefined ? {} : { tokens }),
      exactCny: 'unavailable',
    },
  }
}

function label(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty label`)
  }
  if (
    Buffer.byteLength(value, 'utf8') > 128
    || !LABEL.test(value)
    || value.startsWith('/')
    || WINDOWS_DRIVE.test(value)
    || URI_SCHEME.test(value)
  ) {
    throw new TypeError(`${name} must be a safe governance label`)
  }
  return value
}

function canonicalValue(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new TypeError('natural Run trial manifest exceeds maximum depth')
  }
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('natural Run trial manifest has a non-finite number')
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) canonicalValue(item, depth + 1)
    return
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) canonicalValue(item, depth + 1)
    return
  }
  throw new TypeError('natural Run trial manifest has an unsupported value')
}

export function readNaturalRunTrialManifest(
  absolutePath: string,
  expectedDigest?: `sha256:${string}`,
): PreparedNaturalRunTrialManifest {
  if (!isAbsolute(absolutePath)) {
    throw new TypeError('trial manifest path must be absolute')
  }
  let value: unknown
  try {
    value = JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown
  } catch {
    throw new TypeError('trial manifest must be readable JSON')
  }
  if (!isRecord(value)) {
    throw new TypeError('trial manifest must be an object')
  }
  exactKeys(value, [
    'schemaVersion',
    'goalId',
    'taskRef',
    'scopeKey',
    'parentSkillName',
    'acceptanceContract',
    'verifierArguments',
  ])
  if (value.schemaVersion !== 'tianwen.natural-run-trial.v1') {
    throw new TypeError('trial manifest schema version is invalid')
  }
  if (typeof value.goalId !== 'string' || value.goalId.length === 0) {
    throw new TypeError('trial manifest goalId must be a non-empty string')
  }
  if (!isRecord(value.verifierArguments)) {
    throw new TypeError('trial manifest verifierArguments must be an object')
  }
  canonicalValue(value)
  const acceptanceContract = prepareRunAcceptanceContract(value.acceptanceContract)
  if (acceptanceContract.gapDisposition === 'reusable') {
    label(acceptanceContract.problemCategory, 'problemCategory')
  }
  const manifest: NaturalRunTrialManifest = {
    schemaVersion: 'tianwen.natural-run-trial.v1',
    goalId: value.goalId,
    taskRef: label(value.taskRef, 'taskRef'),
    scopeKey: label(value.scopeKey, 'scopeKey'),
    parentSkillName: label(value.parentSkillName, 'parentSkillName'),
    acceptanceContract,
    verifierArguments: value.verifierArguments,
  }
  if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > MAX_CANONICAL_BYTES) {
    throw new TypeError('natural Run trial manifest exceeds 16 KiB')
  }
  const manifestDigest = canonicalEvidenceDigest(manifest)
  if (expectedDigest !== undefined && expectedDigest !== manifestDigest) {
    throw new TypeError('trial manifest digest changed after preflight')
  }
  return {
    manifest,
    manifestDigest,
    acceptanceSubjectDigest: canonicalEvidenceDigest(manifest.verifierArguments),
  }
}
