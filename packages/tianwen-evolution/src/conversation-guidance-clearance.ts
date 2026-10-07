import { resolve } from 'node:path'
import { sha256 } from './learning-intake.js'
import type { GuidanceStudy } from './conversation-guidance.js'
import type { Sha256Digest } from './ledger.js'

export type ConversationGuidanceClearanceVerdict = 'clear' | 'reject' | 'insufficient'
export interface ConversationGuidanceClearance {
  readonly studyId: string
  readonly scopeKey: string
  readonly environmentDigest: Sha256Digest
  readonly parentVersion: Sha256Digest
  readonly candidateVersion: Sha256Digest
  readonly decisionDigest: Sha256Digest
  readonly armsDigest: Sha256Digest
  readonly studyEvidenceDigest: Sha256Digest
  readonly packetDigest: Sha256Digest
  readonly consentRevision: number
  readonly reviewer: {
    readonly authority: 'independent-ai' | 'human'
    readonly id: string
    readonly promptDigest: Sha256Digest
    readonly model?: string
  }
  readonly verdict: ConversationGuidanceClearanceVerdict
  readonly sourceChecks: readonly {
    readonly caseId: string
    readonly kind: 'source1' | 'source2' | 'counterexample'
    readonly verdict: ConversationGuidanceClearanceVerdict
    readonly reason: string
  }[]
  readonly armChecks: readonly {
    readonly caseId: string
    readonly role: 'baseline' | 'candidate'
    readonly verdict: ConversationGuidanceClearanceVerdict
    readonly boundary: string
    readonly reason: string
  }[]
}

export function conversationGuidanceClearanceEnvironmentDigest(root: string): Sha256Digest {
  const normalized = resolve(root).replaceAll('\\', '/')
  return sha256(process.platform === 'win32' ? normalized.toLowerCase() : normalized)
}

/** Only frozen study evidence: activation, consent and current support are rechecked separately. */
export function conversationGuidanceClearanceStudyEvidenceDigest(study: GuidanceStudy): Sha256Digest {
  if (study.candidate === undefined || study.decision === undefined) throw new TypeError('clearance requires completed study evidence')
  return sha256({ opened: study.opened, candidate: study.candidate, arms: study.arms, decision: study.decision })
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('clearance has invalid fields')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || Buffer.byteLength(value, 'utf8') > 16384) throw new TypeError('clearance text is invalid')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('clearance digest is invalid')
  return value as Sha256Digest
}
function oneOf<const T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new TypeError('clearance enum is invalid')
  return value as T
}
const verdicts = ['clear', 'reject', 'insufficient'] as const
export function parseConversationGuidanceClearance(value: unknown): ConversationGuidanceClearance {
  const input = object(value, ['studyId','scopeKey','environmentDigest','parentVersion','candidateVersion','decisionDigest','armsDigest','studyEvidenceDigest','packetDigest','consentRevision','reviewer','verdict','sourceChecks','armChecks'])
  if (!Number.isSafeInteger(input.consentRevision) || (input.consentRevision as number) < 1) throw new TypeError('clearance consent revision is invalid')
  const authority = oneOf((input.reviewer as Record<string, unknown> | null)?.authority, ['independent-ai', 'human'])
  const reviewer = object(input.reviewer, ['authority','id','promptDigest', ...(authority === 'independent-ai' ? ['model'] : [])])
  if (!Array.isArray(input.sourceChecks) || input.sourceChecks.length !== 3 || !Array.isArray(input.armChecks) || input.armChecks.length !== 10) throw new TypeError('clearance requires source3 and arm10')
  const sourceChecks = input.sourceChecks.map(item => {
    const c = object(item, ['caseId','kind','verdict','reason'])
    return { caseId: text(c.caseId), kind: oneOf(c.kind, ['source1','source2','counterexample']), verdict: oneOf(c.verdict, verdicts), reason: text(c.reason) }
  })
  const armChecks = input.armChecks.map(item => {
    const c = object(item, ['caseId','role','verdict','boundary','reason'])
    return { caseId: text(c.caseId), role: oneOf(c.role, ['baseline','candidate']), verdict: oneOf(c.verdict, verdicts), boundary: text(c.boundary), reason: text(c.reason) }
  })
  const cases = new Set(armChecks.map(c => c.caseId))
  if (new Set(sourceChecks.map(c => c.caseId)).size !== 3 || new Set(sourceChecks.map(c => c.kind)).size !== 3
    || cases.size !== 5 || sourceChecks.some(c => !cases.has(c.caseId))
    || new Set(armChecks.map(c => JSON.stringify([c.caseId, c.role]))).size !== 10) throw new TypeError('clearance checks must identify unique source3 and five paired arms')
  const verdict = oneOf(input.verdict, verdicts)
  if (verdict === 'clear' && (sourceChecks.some(c => c.verdict !== 'clear') || armChecks.some(c => c.role === 'candidate' && c.verdict !== 'clear'))) throw new TypeError('clear clearance requires faithful sources and clear candidates')
  return { studyId: text(input.studyId), scopeKey: text(input.scopeKey), environmentDigest: digest(input.environmentDigest),
    parentVersion: digest(input.parentVersion), candidateVersion: digest(input.candidateVersion), decisionDigest: digest(input.decisionDigest),
    armsDigest: digest(input.armsDigest), studyEvidenceDigest: digest(input.studyEvidenceDigest), packetDigest: digest(input.packetDigest),
    consentRevision: input.consentRevision as number,
    reviewer: { authority, id: text(reviewer.id), promptDigest: digest(reviewer.promptDigest), ...(authority === 'independent-ai' ? { model: text(reviewer.model) } : {}) },
    verdict, sourceChecks, armChecks }
}
