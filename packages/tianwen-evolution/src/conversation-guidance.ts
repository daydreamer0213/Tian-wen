import { sha256 } from './learning-intake.js'
import { CONVERSATION_FAMILIES, CONVERSATION_FAILURES, parseConversationQualityContract, parseConversationQualityReviewChecks, parseStoredConversationReviewChecks, conversationReviewConsensus, type ConversationStoredReviewChecks, type ConversationQualityContract, type ConversationFamily, type ConversationFailure, type ConversationJudgmentProof } from './conversation-learning.js'
import { classifyLearningExploration, parseConversationLearningExplorationRequest, type ConversationLearningExplorationRequest, type LearningExplorationResult } from './learning-exploration.js'
import type { Sha256Digest } from './ledger.js'
import { parseConversationFileMaterial, parseConversationFileTrialReceipt, type ConversationFileMaterial, type ConversationFileTrialReceipt } from './conversation-files.js'
import { parseConversationSkillAdmission, parseConversationSkillDefinition, parseGuidanceSourceUse, type ConversationSkillAdmission, type GuidanceSourceUse } from './conversation-skill-source.js'

/** Data only: the host reads these strings as guidance, never as executable source. */
export interface GuidanceSnapshot {
  readonly schemaVersion: 'tianwen.conversation-guidance.v1'
  readonly scopeKey: string
  readonly rules: Partial<Record<ConversationFamily, string>>
  readonly fileRules?: Partial<Record<ConversationFamily, Partial<Record<'files' | 'chat', string>>>>
}
export type GuidanceStudyId = `guidance-study:${string}`
export type GuidanceProof = ConversationJudgmentProof
export type GuidanceCaseKind = 'source1' | 'source2' | 'counterexample' | 'adjacent' | 'holdout'
export interface GuidanceSourceCase {
  readonly id: string
  readonly kind: 'source1' | 'source2' | 'counterexample'
  readonly sourceTaskId: string
  readonly feedbackAssessmentId?: string
  /** Host binds the actual request, context and original admission criteria. */
  readonly materialDigest: Sha256Digest
  /** Host hashes the original direct request text with guidanceInputDigest. */
  readonly inputDigest: Sha256Digest
}
export interface GuidanceGeneratedCase {
  readonly id: string
  readonly kind: 'adjacent' | 'holdout'
  readonly prompt: string
  readonly criteria: readonly string[]
  readonly materialDigest: Sha256Digest
  readonly inputDigest: Sha256Digest
  readonly qualityContract?: ConversationQualityContract
  readonly files?: ConversationFileMaterial
}
export type GuidanceCase = GuidanceSourceCase | GuidanceGeneratedCase
export interface GuidanceProposalClue {
  readonly taskId: string
  readonly assessmentId: string
  readonly assessmentDigest: Sha256Digest
  readonly materialDigest: Sha256Digest
}
export interface GuidanceStudyBody {
  readonly evaluationMode?: 'local-files'
  readonly fileOutputKind?: 'files' | 'chat'
  readonly scopeKey: string
  readonly family: ConversationFamily
  readonly failureCategory: ConversationFailure
  readonly consentRevision: number
  readonly parentVersion: Sha256Digest
  readonly parentSnapshot: GuidanceSnapshot
  readonly sourceTaskIds: readonly [string, string]
  readonly counterexampleTaskId: string
  readonly cases: readonly GuidanceCase[]
  readonly modelConfigDigest: Sha256Digest
  /** Absent only in historical studies; frozen before proposing a method. */
  readonly qualityContract?: ConversationQualityContract
  /** Bounded feedback hypotheses for the proposer only; never study sources. */
  readonly proposalClues?: readonly GuidanceProposalClue[]
}
export interface GuidanceStudyOpened extends GuidanceStudyBody {
  readonly kind: 'study-opened'
  readonly studyId: GuidanceStudyId
}
export interface GuidanceCandidateRecord {
  readonly kind: 'candidate-recorded'
  readonly studyId: GuidanceStudyId
  readonly candidateSnapshot: GuidanceSnapshot
  readonly proposalProof: GuidanceProof
  readonly sourceUse?: GuidanceSourceUse
}
export interface GuidanceSourceReferenceReadRecord {
  readonly kind: 'source-reference-read'
  readonly studyId: GuidanceStudyId
  readonly reference: ConversationSkillAdmission
  readonly definition: Readonly<Record<string, unknown>>
  readonly selectionProof: GuidanceProof
}
export interface GuidanceArmRecord {
  readonly kind: 'arm-recorded'
  readonly studyId: GuidanceStudyId
  readonly caseId: string
  readonly role: 'baseline' | 'candidate'
  readonly materialDigest: Sha256Digest
  readonly behaviorVersion: Sha256Digest
  readonly executionProof: GuidanceProof
  readonly judgeProof: GuidanceProof
  readonly outputDigest: Sha256Digest
  readonly verdict: 'met' | 'not-met' | 'inconclusive'
  readonly reviewChecks?: ConversationStoredReviewChecks
}
export type GuidanceFileTrialTarget = { readonly kind: 'formal', readonly caseId: string, readonly role: 'baseline' | 'candidate' }
  | { readonly kind: 'exploration', readonly requestDigest: Sha256Digest, readonly arm: 'control' | 'treatment' }
export interface GuidanceFileTrialRecord {
  readonly kind: 'study-file-trial-captured'
  readonly studyId: GuidanceStudyId
  readonly materialDigest: Sha256Digest
  readonly target: GuidanceFileTrialTarget
  readonly receipt: ConversationFileTrialReceipt
}
export interface GuidanceExplorationIntentRecord {
  readonly kind: 'exploration-requested'
  readonly studyId: GuidanceStudyId
  readonly request: ConversationLearningExplorationRequest
}
export interface GuidanceExplorationArmRecord {
  readonly kind: 'exploration-arm-recorded'
  readonly studyId: GuidanceStudyId
  readonly arm: 'control' | 'treatment'
  readonly materialDigest: Sha256Digest
  readonly parentVersion: Sha256Digest
  readonly executionProof: GuidanceProof
  readonly outputDigest: Sha256Digest
  readonly reviewChecks: ConversationStoredReviewChecks
}
export interface GuidanceDecisionRecord {
  readonly kind: 'study-decided'
  readonly studyId: GuidanceStudyId
  readonly armsDigest: Sha256Digest
  readonly verdict: 'accepted' | 'rejected' | 'inconclusive'
}
export interface GuidanceActivationRecord {
  readonly kind: 'guidance-activated'
  readonly studyId: GuidanceStudyId
  readonly expectedParentVersion: Sha256Digest
  readonly decisionDigest: Sha256Digest
}
export interface GuidanceRollbackRecord {
  readonly kind: 'guidance-rolled-back'
  readonly studyId: GuidanceStudyId
  readonly expectedCurrentVersion: Sha256Digest
  readonly reason: 'support-retracted' | 'consent-disabled' | 'regression' | 'quality-contract-changed' | 'ancestor-invalidated'
  readonly ancestorStudyId?: GuidanceStudyId
  readonly evidenceTaskIds: readonly string[]
}
export interface GuidanceHistoricalStoppedRecord {
  readonly kind: 'study-stopped'
  readonly studyId: GuidanceStudyId
  readonly reason: 'cancelled' | 'invalid-judgment' | 'model-unavailable' | 'source-unavailable' | 'scope-changed'
}
export interface GuidanceInsufficientEvidenceStoppedRecord {
  readonly kind: 'study-stopped'
  readonly studyId: GuidanceStudyId
  readonly reason: 'insufficient-evidence'
  readonly proposalProof: GuidanceProof
}
export type GuidanceStoppedRecord = GuidanceHistoricalStoppedRecord | GuidanceInsufficientEvidenceStoppedRecord
export type ConversationGuidanceRecord = GuidanceStudyOpened | GuidanceSourceReferenceReadRecord | GuidanceCandidateRecord | GuidanceArmRecord | GuidanceFileTrialRecord | GuidanceExplorationIntentRecord | GuidanceExplorationArmRecord | GuidanceDecisionRecord | GuidanceActivationRecord | GuidanceRollbackRecord | GuidanceStoppedRecord
export interface GuidanceExploration {
  readonly intent: GuidanceExplorationIntentRecord
  readonly arms: readonly GuidanceExplorationArmRecord[]
  readonly result?: LearningExplorationResult
}
export interface GuidanceStudy {
  readonly opened: GuidanceStudyOpened
  readonly openedAt: string
  readonly sourceReference?: GuidanceSourceReferenceReadRecord
  readonly candidate?: GuidanceCandidateRecord
  readonly arms: readonly GuidanceArmRecord[]
  readonly fileTrials?: readonly GuidanceFileTrialRecord[]
  readonly exploration?: GuidanceExploration
  readonly decision?: GuidanceDecisionRecord
  readonly activation?: GuidanceActivationRecord
  readonly activatedAt?: string
  readonly rollback?: GuidanceRollbackRecord
  readonly rolledBackAt?: string
  readonly stopped?: GuidanceStoppedRecord
  readonly stoppedAt?: string
}

export function baselineGuidanceSnapshot(scopeKey: string): GuidanceSnapshot {
  return { schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey: text(scopeKey, 512), rules: {} }
}
export function guidanceVersion(snapshot: GuidanceSnapshot): Sha256Digest { return sha256(parseGuidanceSnapshot(snapshot)) }
export function guidanceInputDigest(text: string, files?: ConversationFileMaterial): Sha256Digest {
  const request = text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  return sha256(files === undefined ? request : { request, files: parseConversationFileMaterial(files) })
}
export function guidanceRule(snapshot: GuidanceSnapshot, family: ConversationFamily, evaluationMode: string = 'text', fileOutputKind?: 'files' | 'chat'): string | undefined {
  return evaluationMode === 'text' ? snapshot.rules[family]
    : evaluationMode === 'local-files' && fileOutputKind !== undefined ? snapshot.fileRules?.[family]?.[fileOutputKind] : undefined
}
export function guidanceStudyId(body: GuidanceStudyBody): GuidanceStudyId { return `guidance-study:${sha256(body).slice(7)}` }

function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).some(key => typeof key !== 'string')
    || (keys !== undefined && (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))))) {
    throw new TypeError('guidance record has invalid fields')
  }
  return value as Record<string, unknown>
}
function text(value: unknown, maximum = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || Buffer.byteLength(value, 'utf8') > maximum || value.includes('\0')) throw new TypeError('guidance text length or content is invalid')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('guidance digest is invalid')
  return value as Sha256Digest
}
function oneOf<const T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new TypeError('guidance record enum value is invalid')
  return value as T
}
function list<T>(value: unknown, parse: (item: unknown) => T, maximum: number): T[] {
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError('guidance list length is invalid')
  return value.map(parse)
}
function uniqueIds(value: unknown, maximum: number): string[] {
  const values = list(value, item => text(item, 512), maximum)
  if (new Set(values).size !== values.length) throw new TypeError('guidance source identities must be distinct')
  return values
}
function proof(value: unknown): GuidanceProof {
  const input = object(value, ['sessionId', 'sessionDigest', 'requestDigest'])
  return { sessionId: text(input.sessionId, 512), sessionDigest: digest(input.sessionDigest), requestDigest: digest(input.requestDigest) }
}
export function parseGuidanceSnapshot(value: unknown): GuidanceSnapshot {
  const input = object(value)
  object(input, ['schemaVersion', 'scopeKey', 'rules', ...(Object.hasOwn(input, 'fileRules') ? ['fileRules'] : [])])
  if (input.schemaVersion !== 'tianwen.conversation-guidance.v1') throw new TypeError('guidance snapshot schema is invalid')
  const rules: GuidanceSnapshot['rules'] = {}
  for (const [key, value] of Object.entries(object(input.rules))) rules[oneOf(key, CONVERSATION_FAMILIES)] = text(value)
  const fileRules: NonNullable<GuidanceSnapshot['fileRules']> = {}
  if (Object.hasOwn(input, 'fileRules')) for (const [family, values] of Object.entries(object(input.fileRules))) {
    const outputs: Partial<Record<'files' | 'chat', string>> = {}
    for (const [outputKind, rule] of Object.entries(object(values))) outputs[oneOf(outputKind, ['files', 'chat'])] = text(rule)
    fileRules[oneOf(family, CONVERSATION_FAMILIES)] = outputs
  }
  return { schemaVersion: input.schemaVersion, scopeKey: text(input.scopeKey, 512), rules, ...(Object.hasOwn(input, 'fileRules') ? { fileRules } : {}) }
}
const CASE_KINDS = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
function parseCase(value: unknown): GuidanceCase {
  const input = object(value)
  const kind = oneOf(input.kind, CASE_KINDS)
  const generated = kind === 'adjacent' || kind === 'holdout'
  const assessed = !generated && kind !== 'counterexample' && Object.hasOwn(input, 'feedbackAssessmentId')
  object(input, ['id', 'kind', 'materialDigest', 'inputDigest', ...(generated ? ['prompt', 'criteria'] : ['sourceTaskId']), ...(assessed ? ['feedbackAssessmentId'] : []), ...(generated && Object.hasOwn(input, 'qualityContract') ? ['qualityContract'] : []), ...(generated && Object.hasOwn(input, 'files') ? ['files'] : [])])
  const common = { id: text(input.id, 512), materialDigest: digest(input.materialDigest), inputDigest: digest(input.inputDigest) }
  if (!generated) return { ...common, kind, sourceTaskId: text(input.sourceTaskId, 512), ...(assessed ? { feedbackAssessmentId: text(input.feedbackAssessmentId, 512) } : {}) }
  const material = { prompt: text(input.prompt, 16384), criteria: list(input.criteria, item => text(item, 2048), 12),
    ...(Object.hasOwn(input, 'qualityContract') ? { qualityContract: parseConversationQualityContract(input.qualityContract) } : {}),
    ...(Object.hasOwn(input, 'files') ? { files: parseConversationFileMaterial(input.files) } : {}) }
  if (material.criteria.length === 0 || sha256(material) !== common.materialDigest) throw new TypeError('guidance generated material digest or criteria is invalid')
  if (guidanceInputDigest(material.prompt, material.files) !== common.inputDigest) throw new TypeError('guidance generated input digest is invalid')
  return { ...common, kind, ...material }
}
function parseProposalClue(value: unknown): GuidanceProposalClue {
  const input = object(value, ['taskId', 'assessmentId', 'assessmentDigest', 'materialDigest'])
  return { taskId: text(input.taskId, 512), assessmentId: text(input.assessmentId, 512),
    assessmentDigest: digest(input.assessmentDigest), materialDigest: digest(input.materialDigest) }
}
function parseOpening(input: Record<string, unknown>, studyId: GuidanceStudyId): GuidanceStudyOpened {
  object(input, ['kind', 'studyId', 'scopeKey', 'family', 'failureCategory', 'consentRevision', 'parentVersion', 'parentSnapshot', 'sourceTaskIds', 'counterexampleTaskId', 'cases', 'modelConfigDigest', ...(Object.hasOwn(input, 'qualityContract') ? ['qualityContract'] : []), ...(Object.hasOwn(input, 'evaluationMode') ? ['evaluationMode', 'fileOutputKind'] : []), ...(Object.hasOwn(input, 'proposalClues') ? ['proposalClues'] : [])])
  const mode = Object.hasOwn(input, 'evaluationMode') ? { evaluationMode: oneOf(input.evaluationMode, ['local-files']), fileOutputKind: oneOf(input.fileOutputKind, ['files', 'chat']) } : {}
  const sourceTaskIds = uniqueIds(input.sourceTaskIds, 2)
  const counterexampleTaskId = text(input.counterexampleTaskId, 512)
  if (sourceTaskIds.length !== 2 || sourceTaskIds.includes(counterexampleTaskId)) throw new TypeError('guidance requires two distinct failure sources and a separate counterexample')
  const cases = list(input.cases, parseCase, 5)
  if (cases.some(item => !('sourceTaskId' in item) && (mode.evaluationMode === 'local-files'
    ? item.files?.outputKind !== mode.fileOutputKind : item.files !== undefined))) throw new TypeError('guidance cases require the frozen file mode and output kind')
  const quality = Object.hasOwn(input, 'qualityContract') ? { qualityContract: parseConversationQualityContract(input.qualityContract) } : {}
  const proposalClues = Object.hasOwn(input, 'proposalClues') ? list(input.proposalClues, parseProposalClue, 2) : []
  if (Object.hasOwn(input, 'proposalClues') && proposalClues.length === 0) throw new TypeError('proposal clues must be nonempty when present')
  if (proposalClues.length > 0 && mode.evaluationMode !== 'local-files') throw new TypeError('proposal clues require a local-files study')
  if (proposalClues.length > 0 && (new Set(proposalClues.map(item => `${item.taskId}\0${item.assessmentId}`)).size !== proposalClues.length
    || proposalClues.some(item => sourceTaskIds.includes(item.taskId) || item.taskId === counterexampleTaskId))) throw new TypeError('proposal clues must be unique and disjoint from actual sources')
  if (cases.some(item => !('sourceTaskId' in item) && sha256(item.qualityContract ?? null) !== sha256(quality.qualityContract ?? null))) throw new TypeError('guidance generated cases must freeze the same quality contract as the study')
  if (cases.length !== 5 || cases.some((item, index) => item.kind !== CASE_KINDS[index])
    || new Set(cases.map(item => item.id)).size !== 5
    || cases.slice(3).some((item, index) => cases.slice(0, index + 3).some(prior => prior.inputDigest === item.inputDigest))
    || cases.slice(0, 3).some((item, index) => !('sourceTaskId' in item) || item.sourceTaskId !== [...sourceTaskIds, counterexampleTaskId][index])) {
    throw new TypeError('guidance cases must contain the exact distinct frozen sources, adjacent task and holdout')
  }
  if (!Number.isSafeInteger(input.consentRevision) || (input.consentRevision as number) < 1) throw new TypeError('guidance consent revision is invalid')
  const body: GuidanceStudyBody = {
    scopeKey: text(input.scopeKey, 512), family: oneOf(input.family, CONVERSATION_FAMILIES),
    failureCategory: oneOf(input.failureCategory, CONVERSATION_FAILURES), consentRevision: input.consentRevision as number,
    parentVersion: digest(input.parentVersion), parentSnapshot: parseGuidanceSnapshot(input.parentSnapshot),
    sourceTaskIds: sourceTaskIds as [string, string], counterexampleTaskId, cases, modelConfigDigest: digest(input.modelConfigDigest), ...quality, ...mode,
    ...(Object.hasOwn(input, 'proposalClues') ? { proposalClues } : {}),
  }
  if (body.parentSnapshot.scopeKey !== body.scopeKey || guidanceVersion(body.parentSnapshot) !== body.parentVersion) throw new TypeError('guidance parent snapshot version or scope is invalid')
  if (guidanceStudyId(body) !== studyId) throw new TypeError('guidance study identity does not match its frozen body')
  return { kind: 'study-opened', studyId, ...body }
}
export function parseConversationGuidanceRecord(value: unknown): ConversationGuidanceRecord {
  const input = object(value)
  if (typeof input.studyId !== 'string' || !/^guidance-study:[a-f0-9]{64}$/u.test(input.studyId)) throw new TypeError('guidance study identity is invalid')
  const studyId = input.studyId as GuidanceStudyId
  if (input.kind === 'study-opened') return parseOpening(input, studyId)
  if (input.kind === 'study-file-trial-captured') {
    object(input, ['kind', 'studyId', 'materialDigest', 'target', 'receipt'])
    const target = object(input.target)
    const kind = oneOf(target.kind, ['formal', 'exploration'])
    object(target, kind === 'formal' ? ['kind', 'caseId', 'role'] : ['kind', 'requestDigest', 'arm'])
    return { kind: input.kind, studyId, materialDigest: digest(input.materialDigest), receipt: parseConversationFileTrialReceipt(input.receipt),
      target: kind === 'formal' ? { kind, caseId: text(target.caseId, 512), role: oneOf(target.role, ['baseline', 'candidate']) }
        : { kind, requestDigest: digest(target.requestDigest), arm: oneOf(target.arm, ['control', 'treatment']) } }
  }
  if (input.kind === 'source-reference-read') {
    object(input, ['kind', 'studyId', 'reference', 'definition', 'selectionProof'])
    const reference = parseConversationSkillAdmission(input.reference)
    return { kind: input.kind, studyId, reference, definition: parseConversationSkillDefinition(input.definition, reference), selectionProof: proof(input.selectionProof) }
  }
  if (input.kind === 'candidate-recorded') {
    object(input, ['kind', 'studyId', 'candidateSnapshot', 'proposalProof', ...(Object.hasOwn(input, 'sourceUse') ? ['sourceUse'] : [])])
    return { kind: input.kind, studyId, candidateSnapshot: parseGuidanceSnapshot(input.candidateSnapshot), proposalProof: proof(input.proposalProof),
      ...(Object.hasOwn(input, 'sourceUse') ? { sourceUse: parseGuidanceSourceUse(input.sourceUse) } : {}) }
  }
  if (input.kind === 'arm-recorded') {
    object(input, ['kind', 'studyId', 'caseId', 'role', 'materialDigest', 'behaviorVersion', 'executionProof', 'judgeProof', 'outputDigest', 'verdict', ...(Object.hasOwn(input, 'reviewChecks') ? ['reviewChecks'] : [])])
    return { kind: input.kind, studyId, caseId: text(input.caseId, 512), role: oneOf(input.role, ['baseline', 'candidate']),
      materialDigest: digest(input.materialDigest), behaviorVersion: digest(input.behaviorVersion), executionProof: proof(input.executionProof),
      judgeProof: proof(input.judgeProof), outputDigest: digest(input.outputDigest), verdict: oneOf(input.verdict, ['met', 'not-met', 'inconclusive']),
      ...(Object.hasOwn(input, 'reviewChecks') ? { reviewChecks: parseStoredConversationReviewChecks(input.reviewChecks) } : {}) }
  }
  if (input.kind === 'exploration-requested') {
    object(input, ['kind', 'studyId', 'request'])
    return { kind: input.kind, studyId, request: parseConversationLearningExplorationRequest(input.request) }
  }
  if (input.kind === 'exploration-arm-recorded') {
    object(input, ['kind', 'studyId', 'arm', 'materialDigest', 'parentVersion', 'executionProof', 'outputDigest', 'reviewChecks'])
    return { kind: input.kind, studyId, arm: oneOf(input.arm, ['control', 'treatment']), materialDigest: digest(input.materialDigest),
      parentVersion: digest(input.parentVersion), executionProof: proof(input.executionProof), outputDigest: digest(input.outputDigest),
      reviewChecks: parseStoredConversationReviewChecks(input.reviewChecks) }
  }
  if (input.kind === 'study-decided') {
    object(input, ['kind', 'studyId', 'armsDigest', 'verdict'])
    return { kind: input.kind, studyId, armsDigest: digest(input.armsDigest), verdict: oneOf(input.verdict, ['accepted', 'rejected', 'inconclusive']) }
  }
  if (input.kind === 'guidance-activated') {
    object(input, ['kind', 'studyId', 'expectedParentVersion', 'decisionDigest'])
    return { kind: input.kind, studyId, expectedParentVersion: digest(input.expectedParentVersion), decisionDigest: digest(input.decisionDigest) }
  }
  if (input.kind === 'guidance-rolled-back') {
    object(input, ['kind', 'studyId', 'expectedCurrentVersion', 'reason', 'evidenceTaskIds', ...(input.reason === 'ancestor-invalidated' ? ['ancestorStudyId'] : [])])
    const reason = oneOf(input.reason, ['support-retracted', 'consent-disabled', 'regression', 'quality-contract-changed', 'ancestor-invalidated'])
    const evidenceTaskIds = uniqueIds(input.evidenceTaskIds, 64)
    if (reason === 'regression' && evidenceTaskIds.length === 0) throw new TypeError('guidance regression rollback requires task evidence')
    if (reason === 'quality-contract-changed' && evidenceTaskIds.length !== 0) throw new TypeError('quality contract rollback must not claim task regression evidence')
    if (reason === 'ancestor-invalidated' && (typeof input.ancestorStudyId !== 'string' || !/^guidance-study:[a-f0-9]{64}$/u.test(input.ancestorStudyId) || evidenceTaskIds.length !== 0)) throw new TypeError('guidance ancestor rollback requires an exact ancestor study and no regression evidence')
    return { kind: input.kind, studyId, expectedCurrentVersion: digest(input.expectedCurrentVersion), reason, evidenceTaskIds,
      ...(reason === 'ancestor-invalidated' ? { ancestorStudyId: input.ancestorStudyId as GuidanceStudyId } : {}) }
  }
  if (input.kind === 'study-stopped') {
    if (input.reason === 'insufficient-evidence') {
      object(input, ['kind', 'studyId', 'reason', 'proposalProof'])
      return { kind: input.kind, studyId, reason: input.reason, proposalProof: proof(input.proposalProof) }
    }
    object(input, ['kind', 'studyId', 'reason'])
    return { kind: input.kind, studyId, reason: oneOf(input.reason, ['cancelled', 'invalid-judgment', 'model-unavailable', 'source-unavailable', 'scope-changed']) }
  }
  throw new TypeError('unknown guidance record kind')
}

/**
 * Pure same-ledger projection. The ledger must additionally check actual task
 * material/criteria, source feedback revisions, consent and native Session
 * proofs (including model config and holdout exclusion from the proposal).
 * Before activation it must bind the registered data Artifact and generic
 * EvaluationRecord to this exact accepted decision. No caller-supplied model
 * verdict alone grants activation; this class cannot inspect external facts.
 */
export class ConversationGuidanceState {
  private readonly studies = new Map<string, GuidanceStudy>()
  private readonly snapshots = new Map<string, GuidanceSnapshot>()
  private readonly activeStudies = new Map<string, string>()
  private readonly previousActiveStudies = new Map<string, string | undefined>()
  private readonly nativeSessions = new Set<string>()

  snapshot(scopeKey: string): GuidanceSnapshot {
    return structuredClone(this.snapshots.get(scopeKey) ?? baselineGuidanceSnapshot(scopeKey))
  }
  activeStudy(scopeKey: string): GuidanceStudy | undefined {
    const id = this.activeStudies.get(scopeKey)
    return id === undefined ? undefined : structuredClone(this.studies.get(id))
  }
  activeStudyChain(scopeKey: string): readonly GuidanceStudy[] {
    const chain: GuidanceStudy[] = []
    for (let id = this.activeStudies.get(scopeKey); id !== undefined; id = this.previousActiveStudies.get(id)) {
      const study = this.studies.get(id)!
      chain.push(study)
    }
    return structuredClone(chain)
  }
  listStudies(scopeKey?: string, limit?: number): readonly GuidanceStudy[] {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)) throw new TypeError('guidance study list limit must be between 1 and 1000')
    const studies = [...this.studies.values()].filter(study => scopeKey === undefined || study.opened.scopeKey === scopeKey)
    return structuredClone(limit === undefined ? studies : studies.slice(-limit))
  }
  existing(record: ConversationGuidanceRecord): ConversationGuidanceRecord | undefined {
    const study = this.studies.get(record.studyId)
    const value = record.kind === 'study-opened' ? study?.opened
      : record.kind === 'source-reference-read' ? study?.sourceReference
      : record.kind === 'candidate-recorded' ? study?.candidate
      : record.kind === 'arm-recorded' ? study?.arms.find(arm => arm.caseId === record.caseId && arm.role === record.role)
      : record.kind === 'study-file-trial-captured' ? study?.fileTrials?.find(item => sha256(item.target) === sha256(record.target))
      : record.kind === 'exploration-requested' ? study?.exploration?.intent
      : record.kind === 'exploration-arm-recorded' ? study?.exploration?.arms.find(arm => arm.arm === record.arm)
      : record.kind === 'study-decided' ? study?.decision
      : record.kind === 'guidance-activated' ? study?.activation
      : record.kind === 'guidance-rolled-back' ? study?.rollback : study?.stopped
    return value === undefined ? undefined : structuredClone(value)
  }
  decision(studyId: string): GuidanceDecisionRecord {
    const study = this.studies.get(studyId)
    if (study?.stopped !== undefined) throw new Error('guidance study is stopped')
    if (study?.candidate === undefined || study.arms.length !== 10) throw new Error('guidance decision requires all ten completed arms')
    const arms = study.opened.cases.flatMap(item => (['baseline', 'candidate'] as const).map(role => {
      const arm = study.arms.find(value => value.caseId === item.id && value.role === role)
      if (arm === undefined) throw new Error('guidance decision requires the complete arm set')
      return arm
    }))
    const verdict = arms.some(arm => arm.verdict === 'inconclusive') ? 'inconclusive'
      : arms.filter(arm => arm.role === 'candidate').every(arm => arm.verdict === 'met')
        && (arms[0]!.verdict === 'not-met' || arms[2]!.verdict === 'not-met')
        && arms[4]!.verdict === 'met' ? 'accepted' : 'rejected'
    return { kind: 'study-decided', studyId: study.opened.studyId, armsDigest: sha256(arms), verdict }
  }
  validate(record: ConversationGuidanceRecord): void {
    record = parseConversationGuidanceRecord(record)
    if (this.existing(record) !== undefined) throw new Error('guidance record conflicts with immutable history')
    if (record.kind === 'study-opened') {
      if (guidanceVersion(this.snapshot(record.scopeKey)) !== record.parentVersion) throw new Error('guidance study parent is not the current snapshot')
      return
    }
    const study = this.studies.get(record.studyId)
    if (study === undefined) throw new Error('unknown guidance study; its plan must be opened first')
    if (study.stopped !== undefined) throw new Error('guidance study is stopped; further results are prohibited')
    if (record.kind === 'study-stopped') {
      if (study.decision !== undefined || study.activation !== undefined) throw new Error('a decided guidance study cannot be stopped')
      if (record.reason === 'insufficient-evidence') {
        if (study.candidate !== undefined || this.nativeSessions.has(record.proposalProof.sessionId)) throw new Error('insufficient evidence requires an independent native proposal Session before any candidate')
      }
      return
    }
    const opened = study.opened
    if (record.kind === 'study-file-trial-captured') {
      if (opened.evaluationMode !== 'local-files' || record.receipt.outputKind !== opened.fileOutputKind) throw new Error('guidance file receipt mode disagrees with its study')
      if (study.decision !== undefined) throw new Error('guidance file receipt cannot follow a decision')
      const target = record.target
      if (target.kind === 'formal') {
        const item = opened.cases.find(item => item.id === target.caseId)
        if (study.candidate === undefined || item?.materialDigest !== record.materialDigest
          || study.arms.some(arm => arm.caseId === target.caseId && arm.role === target.role)) throw new Error('guidance file receipt disagrees with its formal target')
        if ('prompt' in item && record.receipt.workerMaterialDigest !== sha256({ prompt: item.prompt, files: item.files })) throw new Error('guidance file receipt worker material disagrees with its frozen case')
      } else if (study.candidate !== undefined || study.exploration === undefined
        || target.requestDigest !== sha256(study.exploration.intent.request)
        || record.materialDigest !== study.exploration.intent.request.sourceMaterialDigest
        || study.exploration.arms.some(arm => arm.arm === target.arm)) throw new Error('guidance file receipt disagrees with its exploration target')
      if (this.nativeSessions.has(record.receipt.executionProof.sessionId)) throw new Error('guidance file receipt requires an independent native Session')
      return
    }
    if (record.kind === 'source-reference-read') {
      if ((study.exploration !== undefined && study.exploration.result === undefined)
        || study.candidate !== undefined || study.decision !== undefined) throw new Error('guidance source must be read before candidate and decision, outside incomplete exploration')
      if (record.reference.scopeKey !== opened.scopeKey) throw new Error('guidance source scope disagrees with its opened study')
      if (this.nativeSessions.has(record.selectionProof.sessionId)) throw new Error('guidance source selection requires an independent native Session')
      return
    }
    if (record.kind === 'exploration-requested') {
      const request = record.request
      const source = opened.cases.find(item => item.kind === 'source1' && 'sourceTaskId' in item && item.sourceTaskId === request.sourceTaskId)
        ?? opened.cases.find(item => item.kind === 'source2' && 'sourceTaskId' in item && item.sourceTaskId === request.sourceTaskId)
      if (study.candidate !== undefined || study.decision !== undefined || study.exploration !== undefined
        || request.studyId !== opened.studyId || source === undefined || request.parentVersion !== opened.parentVersion
        || request.sourceMaterialDigest !== source.materialDigest || request.environmentDigest !== opened.modelConfigDigest
        || request.qualityContractDigest !== sha256(opened.qualityContract ?? null)) {
        throw new Error('guidance exploration request disagrees with its frozen opened study')
      }
      if (this.nativeSessions.has(request.proposalProof.sessionId)) throw new Error('guidance exploration proposal must use an independent native Session')
      return
    }
    if (record.kind === 'exploration-arm-recorded') {
      const exploration = study.exploration
      if (exploration === undefined || study.candidate !== undefined || study.decision !== undefined
        || exploration.arms.some(item => item.arm === record.arm) || record.materialDigest !== exploration.intent.request.sourceMaterialDigest
        || record.parentVersion !== opened.parentVersion) throw new Error('guidance exploration arm disagrees with its frozen intent')
      parseConversationQualityReviewChecks(record.reviewChecks, opened.qualityContract)
      const sessions = [record.executionProof.sessionId, ...record.reviewChecks.map(check => check.proof.sessionId)]
      const reserved = this.fileExecution(study, record, { kind: 'exploration', requestDigest: sha256(exploration.intent.request), arm: record.arm })
      if (new Set(sessions).size !== sessions.length || sessions.some(id => id !== reserved && this.nativeSessions.has(id))) throw new Error('guidance exploration execution and reviews require distinct independent native Sessions')
      return
    }
    if (record.kind === 'candidate-recorded') {
      if (study.sourceReference === undefined ? record.sourceUse !== undefined
        : record.sourceUse?.readDigest !== sha256(study.sourceReference)) throw new Error('guidance candidate source use must bind its exact source read')
      if (study.exploration !== undefined && study.exploration.result === undefined) throw new Error('guidance candidate requires both exploration arms when exploration was initiated')
      const next = record.candidateSnapshot
      const rule = guidanceRule(next, opened.family, opened.evaluationMode, opened.fileOutputKind)
      if (rule === undefined || rule === guidanceRule(opened.parentSnapshot, opened.family, opened.evaluationMode, opened.fileOutputKind)) throw new Error('guidance candidate requires a different nonempty family rule')
      const expected = opened.evaluationMode === 'local-files'
        ? { ...opened.parentSnapshot, fileRules: { ...opened.parentSnapshot.fileRules, [opened.family]: { ...opened.parentSnapshot.fileRules?.[opened.family], [opened.fileOutputKind!]: rule } } }
        : { ...opened.parentSnapshot, rules: { ...opened.parentSnapshot.rules, [opened.family]: rule } }
      if (sha256(next) !== sha256(expected)) throw new Error('guidance candidate changed another family, mode, map or scope')
      if (this.nativeSessions.has(record.proposalProof.sessionId)) throw new Error('guidance proposal must use an independent native Session')
      return
    }
    if (study.candidate === undefined) throw new Error('guidance candidate must be recorded before evaluation')
    if (record.kind === 'arm-recorded') {
      if (study.decision !== undefined) throw new Error('guidance arms cannot change after the decision')
      const item = opened.cases.find(value => value.id === record.caseId)
      if (item === undefined || item.materialDigest !== record.materialDigest) throw new Error('guidance arm does not match its frozen case material')
      const expected = record.role === 'baseline' ? opened.parentVersion : guidanceVersion(study.candidate.candidateSnapshot)
      if (record.behaviorVersion !== expected) throw new Error('guidance arm behavior version disagrees with its frozen role')
      if (['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(opened.qualityContract?.schemaVersion ?? '') && record.reviewChecks === undefined) throw new Error('versioned guidance arms require two independent review checks')
      if (record.reviewChecks !== undefined) {
        parseConversationQualityReviewChecks(record.reviewChecks, opened.qualityContract)
        const expected = conversationReviewConsensus(record.reviewChecks)
        if (record.verdict !== expected.verdict || sha256(record.judgeProof) !== sha256(expected.proof)) throw new Error('guidance arm disagrees with its independent check consensus')
      }
      const sessions = [record.executionProof.sessionId, ...(record.reviewChecks?.map(check => check.proof.sessionId) ?? [record.judgeProof.sessionId])]
      const reserved = this.fileExecution(study, record, { kind: 'formal', caseId: record.caseId, role: record.role })
      if (new Set(sessions).size !== sessions.length || sessions.some(id => id !== reserved && this.nativeSessions.has(id))) throw new Error('guidance execution and judge require distinct independent native Sessions')
      return
    }
    if (record.kind === 'study-decided') {
      if (sha256(record) !== sha256(this.decision(record.studyId))) throw new Error('guidance decision or receipt digest disagrees with the derived result')
      return
    }
    const currentVersion = guidanceVersion(this.snapshot(opened.scopeKey))
    if (record.kind === 'guidance-activated') {
      if (study.decision?.verdict !== 'accepted' || sha256(study.decision) !== record.decisionDigest) throw new Error('guidance activation requires its exact accepted decision')
      if (record.expectedParentVersion !== opened.parentVersion || currentVersion !== opened.parentVersion) throw new Error('guidance activation has a stale current parent version')
      return
    }
    if (study.activation === undefined || this.activeStudies.get(opened.scopeKey) !== record.studyId
      || currentVersion !== record.expectedCurrentVersion || currentVersion !== guidanceVersion(study.candidate.candidateSnapshot)) throw new Error('guidance rollback does not own the current active version')
    if (record.reason === 'ancestor-invalidated' && !this.activeStudyChain(opened.scopeKey).slice(1).some(item => item.opened.studyId === record.ancestorStudyId)) throw new Error('guidance rollback requires an actual active ancestor')
    if (record.reason === 'regression' && record.evidenceTaskIds.some(id => [...opened.sourceTaskIds, opened.counterexampleTaskId].includes(id))) throw new Error('guidance regression must reference new post-activation tasks, not source tasks')
  }
  private fileExecution(study: GuidanceStudy, record: GuidanceArmRecord | GuidanceExplorationArmRecord, target: GuidanceFileTrialTarget): string | undefined {
    if (study.opened.evaluationMode !== 'local-files') return
    const retained = study.fileTrials?.find(item => sha256(item.target) === sha256(target))
    if (retained === undefined || retained.materialDigest !== record.materialDigest || retained.receipt.outputDigest !== record.outputDigest
      || sha256(retained.receipt.executionProof) !== sha256(record.executionProof)) throw new Error('guidance file arm requires its exact retained receipt')
    return record.executionProof.sessionId
  }
  /** Called only after ledger validation and a durable append (also on replay). */
  apply(input: ConversationGuidanceRecord, at: string): void {
    const record = structuredClone(input)
    if (record.kind === 'study-opened') {
      this.studies.set(record.studyId, { opened: record, openedAt: at, arms: [] })
      return
    }
    const study = this.studies.get(record.studyId)!
    if (record.kind === 'study-stopped') {
      if (record.reason === 'insufficient-evidence') this.nativeSessions.add(record.proposalProof.sessionId)
      this.studies.set(record.studyId, { ...study, stopped: record, stoppedAt: at })
    }
    else if (record.kind === 'study-file-trial-captured') {
      this.nativeSessions.add(record.receipt.executionProof.sessionId)
      this.studies.set(record.studyId, { ...study, fileTrials: [...study.fileTrials ?? [], record] })
    } else if (record.kind === 'source-reference-read') {
      this.nativeSessions.add(record.selectionProof.sessionId)
      this.studies.set(record.studyId, { ...study, sourceReference: record })
    } else if (record.kind === 'candidate-recorded') {
      this.nativeSessions.add(record.proposalProof.sessionId)
      this.studies.set(record.studyId, { ...study, candidate: record })
    } else if (record.kind === 'arm-recorded') {
      this.nativeSessions.add(record.executionProof.sessionId)
      this.nativeSessions.add(record.judgeProof.sessionId)
      for (const check of record.reviewChecks ?? []) this.nativeSessions.add(check.proof.sessionId)
      this.studies.set(record.studyId, { ...study, arms: [...study.arms, record] })
    } else if (record.kind === 'exploration-requested') {
      this.nativeSessions.add(record.request.proposalProof.sessionId)
      this.studies.set(record.studyId, { ...study, exploration: { intent: record, arms: [] } })
    } else if (record.kind === 'exploration-arm-recorded') {
      this.nativeSessions.add(record.executionProof.sessionId)
      for (const check of record.reviewChecks) this.nativeSessions.add(check.proof.sessionId)
      const exploration = study.exploration!
      const arms = [...exploration.arms, record]
      const control = arms.find(item => item.arm === 'control')
      const treatment = arms.find(item => item.arm === 'treatment')
      const result = control === undefined || treatment === undefined ? undefined : (() => {
        const observation = { control: conversationReviewConsensus(control.reviewChecks).verdict, treatment: conversationReviewConsensus(treatment.reviewChecks).verdict }
        return { observation, classification: classifyLearningExploration(exploration.intent.request, observation) }
      })()
      this.studies.set(record.studyId, { ...study, exploration: { ...exploration, arms, ...(result === undefined ? {} : { result }) } })
    } else if (record.kind === 'study-decided') this.studies.set(record.studyId, { ...study, decision: record })
    else if (record.kind === 'guidance-activated') {
      this.snapshots.set(study.opened.scopeKey, study.candidate!.candidateSnapshot)
      this.previousActiveStudies.set(record.studyId, this.activeStudies.get(study.opened.scopeKey))
      this.activeStudies.set(study.opened.scopeKey, record.studyId)
      this.studies.set(record.studyId, { ...study, activation: record, activatedAt: at })
    } else {
      this.snapshots.set(study.opened.scopeKey, study.opened.parentSnapshot)
      const previous = this.previousActiveStudies.get(record.studyId)
      if (previous === undefined) this.activeStudies.delete(study.opened.scopeKey)
      else this.activeStudies.set(study.opened.scopeKey, previous)
      this.studies.set(record.studyId, { ...study, rollback: record, rolledBackAt: at })
    }
  }
}
