import type { Sha256Digest } from './ledger.js'

export interface ClaimAssessment {
  readonly quote: string
  readonly kind: 'source-fact' | 'advice' | 'inference' | 'fiction' | 'general-knowledge' | 'non-factual'
  readonly status: 'supported' | 'unsupported' | 'contradicted' | 'permitted' | 'uncertain'
  readonly sourceIds: readonly string[]
  readonly explanation: string
}

export interface ClaimAuditV1 {
  readonly schemaVersion: 'tianwen.claim-audit.v1'
  readonly evidenceDigest: Sha256Digest
  readonly units: readonly {
    readonly answerId: string
    readonly claims: readonly ClaimAssessment[]
  }[]
}

export interface ClaimAuditV2 {
  readonly schemaVersion: 'tianwen.claim-audit.v2'
  readonly evidenceDigest: Sha256Digest
  readonly units: Readonly<Record<string, null | {
    readonly firstClaim: ClaimAssessment
    readonly additionalClaims: readonly ClaimAssessment[]
  }>>
}

export type ClaimAudit = ClaimAuditV1 | ClaimAuditV2

type Value = Record<string, unknown>
const kinds = ['source-fact', 'advice', 'inference', 'fiction', 'general-knowledge', 'non-factual'] as const
const statuses = ['supported', 'unsupported', 'contradicted', 'permitted', 'uncertain'] as const
const record = (value: unknown): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const text = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError('claim audit text is invalid')
  return value
}

function parseClaim(value: unknown, verdict: 'met' | 'not-met' | 'inconclusive'): void {
  if (!record(value) || !exact(value, ['quote', 'kind', 'status', 'sourceIds', 'explanation'])
    || !kinds.includes(value.kind as never) || !statuses.includes(value.status as never) || !Array.isArray(value.sourceIds)) throw new TypeError('claim audit claim is invalid')
  if (typeof value.quote !== 'string' || value.quote.length === 0) throw new TypeError('claim audit text is invalid')
  if (value.quote.trim() === '' && (value.kind !== 'non-factual' || value.status !== 'permitted' || value.sourceIds.length !== 0)) throw new TypeError('claim audit formatting claim is invalid')
  text(value.explanation)
  const sourceIds = value.sourceIds.map(text)
  if (new Set(sourceIds).size !== sourceIds.length) throw new TypeError('claim audit source identities must be unique')
  if (value.kind === 'source-fact' ? value.status === 'permitted' : value.status === 'supported') throw new TypeError('claim audit kind and status disagree')
  if (verdict === 'met' && ['unsupported', 'contradicted', 'uncertain'].includes(String(value.status))) throw new TypeError('met claim audit contains an unresolved claim')
}

function parseV1(value: Value, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAuditV1 {
  if (!Array.isArray(value.units) || value.units.length === 0 || value.units.length > 128) throw new TypeError('claim audit is invalid')
  const answerIds = new Set<string>()
  let claimCount = 0
  for (const unit of value.units) {
    if (!record(unit) || !exact(unit, ['answerId', 'claims']) || !Array.isArray(unit.claims)) throw new TypeError('claim audit unit is invalid')
    const answerId = text(unit.answerId)
    if (answerIds.has(answerId)) throw new TypeError('claim audit answer identities must be unique')
    answerIds.add(answerId)
    claimCount += unit.claims.length
    if (claimCount > 512) throw new TypeError('claim audit has too many claims')
    for (const claim of unit.claims) parseClaim(claim, verdict)
  }
  return value as unknown as ClaimAuditV1
}

function parseV2(value: Value, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAuditV2 {
  if (!record(value.units)) throw new TypeError('claim audit is invalid')
  const units = Object.entries(value.units)
  if (units.length === 0 || units.length > 128 || units.some(([answerId]) => !/^answer-[1-9][0-9]*$/u.test(answerId))) throw new TypeError('claim audit unit is invalid')
  let claimCount = 0
  for (const [, unit] of units) {
    if (unit === null) continue
    if (!record(unit) || !exact(unit, ['firstClaim', 'additionalClaims']) || !Array.isArray(unit.additionalClaims)) throw new TypeError('claim audit unit is invalid')
    const claims = [unit.firstClaim, ...unit.additionalClaims]
    claimCount += claims.length
    if (claimCount > 512) throw new TypeError('claim audit has too many claims')
    for (const claim of claims) parseClaim(claim, verdict)
  }
  return value as unknown as ClaimAuditV2
}

export function parseClaimAudit(value: unknown, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAudit {
  let bytes: number
  try { bytes = Buffer.byteLength(JSON.stringify(value), 'utf8') } catch { throw new TypeError('claim audit is invalid') }
  if (bytes > 32 * 1024 || !record(value) || !exact(value, ['schemaVersion', 'evidenceDigest', 'units'])
    || typeof value.evidenceDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value.evidenceDigest)) throw new TypeError('claim audit is invalid')
  if (value.schemaVersion === 'tianwen.claim-audit.v1') return parseV1(value, verdict)
  if (value.schemaVersion === 'tianwen.claim-audit.v2') return parseV2(value, verdict)
  throw new TypeError('claim audit is invalid')
}
