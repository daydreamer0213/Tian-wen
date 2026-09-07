import type { Sha256Digest } from './ledger.js'

export interface ClaimAudit {
  readonly schemaVersion: 'tianwen.claim-audit.v1'
  readonly evidenceDigest: Sha256Digest
  readonly units: readonly {
    readonly answerId: string
    readonly claims: readonly {
      readonly quote: string
      readonly kind: 'source-fact' | 'advice' | 'inference' | 'fiction' | 'general-knowledge' | 'non-factual'
      readonly status: 'supported' | 'unsupported' | 'contradicted' | 'permitted' | 'uncertain'
      readonly sourceIds: readonly string[]
      readonly explanation: string
    }[]
  }[]
}

type Value = Record<string, unknown>
const kinds = ['source-fact', 'advice', 'inference', 'fiction', 'general-knowledge', 'non-factual'] as const
const statuses = ['supported', 'unsupported', 'contradicted', 'permitted', 'uncertain'] as const
const record = (value: unknown): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const text = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError('claim audit text is invalid')
  return value
}

export function parseClaimAudit(value: unknown, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAudit {
  let bytes: number
  try { bytes = Buffer.byteLength(JSON.stringify(value), 'utf8') } catch { throw new TypeError('claim audit is invalid') }
  if (bytes > 32 * 1024 || !record(value) || !exact(value, ['schemaVersion', 'evidenceDigest', 'units'])
    || value.schemaVersion !== 'tianwen.claim-audit.v1' || typeof value.evidenceDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(value.evidenceDigest) || !Array.isArray(value.units)
    || value.units.length === 0 || value.units.length > 128) throw new TypeError('claim audit is invalid')
  const answerIds = new Set<string>()
  let claimCount = 0
  for (const unit of value.units) {
    if (!record(unit) || !exact(unit, ['answerId', 'claims']) || !Array.isArray(unit.claims) || unit.claims.length === 0) throw new TypeError('claim audit unit is invalid')
    const answerId = text(unit.answerId)
    if (answerIds.has(answerId)) throw new TypeError('claim audit answer identities must be unique')
    answerIds.add(answerId)
    claimCount += unit.claims.length
    if (claimCount > 512) throw new TypeError('claim audit has too many claims')
    for (const claim of unit.claims) {
      if (!record(claim) || !exact(claim, ['quote', 'kind', 'status', 'sourceIds', 'explanation'])
        || !kinds.includes(claim.kind as never) || !statuses.includes(claim.status as never) || !Array.isArray(claim.sourceIds)) throw new TypeError('claim audit claim is invalid')
      text(claim.quote); text(claim.explanation)
      const sourceIds = claim.sourceIds.map(text)
      if (new Set(sourceIds).size !== sourceIds.length) throw new TypeError('claim audit source identities must be unique')
      if (claim.kind === 'source-fact' ? claim.status === 'permitted' : claim.status === 'supported') throw new TypeError('claim audit kind and status disagree')
      if (verdict === 'met' && ['unsupported', 'contradicted', 'uncertain'].includes(String(claim.status))) throw new TypeError('met claim audit contains an unresolved claim')
    }
  }
  return value as unknown as ClaimAudit
}
