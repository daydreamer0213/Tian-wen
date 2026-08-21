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

export interface NaturalRunTrialReceipt {
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
