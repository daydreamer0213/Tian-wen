import { isSkillName } from '@tianwen/dsh-compat'
import type {
  SkillDefinition,
  SkillInvocationPolicy,
  SkillRegistration,
} from '@tianwen/dsh-compat'

import type { Sha256Digest } from './ledger.js'
import { canonicalJson, sha256 } from './learning-intake.js'
import type {
  OutcomeIntakeInput,
  OutcomeLearningSignal,
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  LearningSignalId,
  LearningTicket,
  LearningTicketId,
} from './learning-intake.js'

export type SkillVersionId = `skill-version:${string}`
export type LearningCaseId = `case:${string}`
export type AttributionId = `attribution:${string}`
export type LessonId = `lesson:${string}`
export type GovernedSkillCandidateId = `candidate:${string}`

export type GovernedSkillPayload = Pick<
  SkillRegistration,
  'name' | 'description' | 'whenToUse' | 'source' | 'content'
> & { readonly invocation: SkillInvocationPolicy }

export interface RunSkillManifestInput {
  readonly runId: TianwenRunId
  readonly skill: SkillDefinition
}

export interface RunSkillManifestReceipt {
  readonly parentVersionId: SkillVersionId
  readonly duplicate: boolean
}

export interface RunSkillManifest {
  readonly schemaVersion: 'tianwen.run-skill-manifest.v1'
  readonly runId: TianwenRunId
  readonly parentVersionId: SkillVersionId
  readonly contentDigest: Sha256Digest
  readonly resolvedProvider: string
  readonly parent: GovernedSkillPayload
}

export interface RunSkillUse {
  readonly schemaVersion: 'tianwen.run-skill-use.v1'
  readonly runId: TianwenRunId
  readonly parentVersionId: SkillVersionId
  readonly sessionId: string
  readonly sessionDigest: Sha256Digest
  readonly skillName: string
  readonly contentDigest: Sha256Digest
  readonly skillEvidenceId: Sha256Digest
  readonly acceptanceEvidenceId: Sha256Digest
  readonly skillCallSeq: number
  readonly skillResultSeq: number
  readonly acceptanceCallSeq: number
}

export type RunSkillUseInput = Omit<RunSkillUse, 'schemaVersion'>

export interface RunSkillUseReceipt {
  readonly parentVersionId: SkillVersionId
  readonly duplicate: boolean
}

export interface RunSkillManifestRecordedEvent {
  readonly schemaVersion: 'tianwen.run-skill-manifest.v1'
  readonly type: 'run-skill-manifest-recorded'
  readonly at: string
  readonly manifest: RunSkillManifest
  readonly inputDigest: Sha256Digest
}

export interface RunSkillUseRecordedEvent {
  readonly schemaVersion: 'tianwen.run-skill-use.v1'
  readonly type: 'run-skill-use-recorded'
  readonly at: string
  readonly use: RunSkillUse
  readonly inputDigest: Sha256Digest
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u
const RUN_ID = /^run:[a-f0-9]{64}$/u
const SKILL_VERSION_ID = /^skill-version:[a-f0-9]{64}$/u

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
    required.some(key => !(key in value))
    || keys.some(key => !allowed.has(key))
  ) {
    throw new TypeError('Skill governance input has an invalid shape')
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`)
  }
  return value
}

function digestValue(value: unknown, label: string): Sha256Digest {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`)
  }
  return value as Sha256Digest
}

function runIdValue(value: unknown): TianwenRunId {
  if (typeof value !== 'string' || !RUN_ID.test(value)) {
    throw new TypeError('runId must be a Tianwen Run ID')
  }
  return value as TianwenRunId
}

function skillVersionIdValue(value: unknown): SkillVersionId {
  if (typeof value !== 'string' || !SKILL_VERSION_ID.test(value)) {
    throw new TypeError('parentVersionId must be a Skill version ID')
  }
  return value as SkillVersionId
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${label} must be a positive integer`)
  }
  return value as number
}

function prepareParent(skill: SkillDefinition): {
  readonly parent: GovernedSkillPayload
  readonly resolvedProvider: string
} {
  if (!isRecord(skill)) {
    throw new TypeError('skill must be an object')
  }
  exactKeys(
    skill,
    ['name', 'description', 'invocation', 'source', 'provider', 'content'],
    ['whenToUse'],
  )
  const name = stringValue(skill.name, 'skill.name')
  if (!isSkillName(name)) {
    throw new TypeError('skill.name must be a valid DSH Skill name')
  }
  if (!isRecord(skill.invocation)) {
    throw new TypeError('skill.invocation must be an object')
  }
  exactKeys(skill.invocation, ['modelInvocable', 'userInvocable'])
  if (
    typeof skill.invocation.modelInvocable !== 'boolean'
    || typeof skill.invocation.userInvocable !== 'boolean'
  ) {
    throw new TypeError('skill invocation flags must be booleans')
  }
  const whenToUse = skill.whenToUse === undefined
    ? undefined
    : stringValue(skill.whenToUse, 'skill.whenToUse')
  return {
    parent: {
      name,
      description: stringValue(skill.description, 'skill.description'),
      ...(whenToUse === undefined ? {} : { whenToUse }),
      invocation: {
        modelInvocable: skill.invocation.modelInvocable,
        userInvocable: skill.invocation.userInvocable,
      },
      source: stringValue(skill.source, 'skill.source'),
      content: stringValue(skill.content, 'skill.content'),
    },
    resolvedProvider: stringValue(skill.provider, 'skill.provider'),
  }
}

export function prepareRunSkillManifest(
  input: RunSkillManifestInput,
): RunSkillManifest {
  if (!isRecord(input)) {
    throw new TypeError('Run Skill manifest input must be an object')
  }
  exactKeys(input, ['runId', 'skill'])
  const runId = runIdValue(input.runId)
  const { parent, resolvedProvider } = prepareParent(input.skill)
  const contentDigest = sha256(parent.content)
  const digest = sha256({ parent, resolvedProvider })
  return {
    schemaVersion: 'tianwen.run-skill-manifest.v1',
    runId,
    parentVersionId:
      `skill-version:${digest.slice('sha256:'.length)}`,
    contentDigest,
    resolvedProvider,
    parent,
  }
}

function parseUseInput(value: unknown): RunSkillUseInput {
  if (!isRecord(value)) {
    throw new TypeError('Run Skill use input must be an object')
  }
  exactKeys(value, [
    'runId',
    'parentVersionId',
    'sessionId',
    'sessionDigest',
    'skillName',
    'contentDigest',
    'skillEvidenceId',
    'acceptanceEvidenceId',
    'skillCallSeq',
    'skillResultSeq',
    'acceptanceCallSeq',
  ])
  const skillCallSeq = positiveInteger(value.skillCallSeq, 'skillCallSeq')
  const skillResultSeq = positiveInteger(value.skillResultSeq, 'skillResultSeq')
  const acceptanceCallSeq = positiveInteger(
    value.acceptanceCallSeq,
    'acceptanceCallSeq',
  )
  if (!(skillCallSeq < skillResultSeq && skillResultSeq < acceptanceCallSeq)) {
    throw new TypeError('Skill use sequences must precede final acceptance')
  }
  return {
    runId: runIdValue(value.runId),
    parentVersionId: skillVersionIdValue(value.parentVersionId),
    sessionId: stringValue(value.sessionId, 'sessionId'),
    sessionDigest: digestValue(value.sessionDigest, 'sessionDigest'),
    skillName: stringValue(value.skillName, 'skillName'),
    contentDigest: digestValue(value.contentDigest, 'contentDigest'),
    skillEvidenceId: digestValue(value.skillEvidenceId, 'skillEvidenceId'),
    acceptanceEvidenceId: digestValue(
      value.acceptanceEvidenceId,
      'acceptanceEvidenceId',
    ),
    skillCallSeq,
    skillResultSeq,
    acceptanceCallSeq,
  }
}

export function prepareRunSkillUse(
  candidate: RunSkillUseInput,
  manifest: RunSkillManifest,
  binding: TianwenRunBinding,
  outcome: OutcomeIntakeInput,
): RunSkillUse {
  const input = parseUseInput(candidate)
  if (
    input.runId !== manifest.runId
    || input.runId !== binding.runId
    || input.runId !== outcome.runId
    || input.parentVersionId !== manifest.parentVersionId
    || input.sessionId !== binding.sessionId
    || input.sessionDigest !== outcome.sessionDigest
    || input.skillName !== manifest.parent.name
    || input.contentDigest !== manifest.contentDigest
    || !outcome.evidenceIds.includes(input.acceptanceEvidenceId)
  ) {
    throw new TypeError('Run Skill use disagrees with frozen Run facts')
  }
  return {
    schemaVersion: 'tianwen.run-skill-use.v1',
    ...input,
  }
}

export function parseRunSkillManifest(value: unknown): RunSkillManifest {
  if (!isRecord(value)) {
    throw new TypeError('Run Skill manifest must be an object')
  }
  exactKeys(value, [
    'schemaVersion',
    'runId',
    'parentVersionId',
    'contentDigest',
    'resolvedProvider',
    'parent',
  ])
  if (value.schemaVersion !== 'tianwen.run-skill-manifest.v1') {
    throw new TypeError('invalid Run Skill manifest schema version')
  }
  if (!isRecord(value.parent)) {
    throw new TypeError('Run Skill parent must be an object')
  }
  const prepared = prepareRunSkillManifest({
    runId: runIdValue(value.runId),
    skill: {
      ...value.parent,
      provider: stringValue(value.resolvedProvider, 'resolvedProvider'),
    } as unknown as SkillDefinition,
  })
  if (
    value.parentVersionId !== prepared.parentVersionId
    || value.contentDigest !== prepared.contentDigest
    || canonicalJson(value) !== canonicalJson(prepared)
  ) {
    throw new TypeError('Run Skill manifest is not canonical')
  }
  return prepared
}

export function parseRunSkillUse(value: unknown): RunSkillUse {
  if (!isRecord(value)) {
    throw new TypeError('Run Skill use must be an object')
  }
  exactKeys(value, [
    'schemaVersion',
    'runId',
    'parentVersionId',
    'sessionId',
    'sessionDigest',
    'skillName',
    'contentDigest',
    'skillEvidenceId',
    'acceptanceEvidenceId',
    'skillCallSeq',
    'skillResultSeq',
    'acceptanceCallSeq',
  ])
  if (value.schemaVersion !== 'tianwen.run-skill-use.v1') {
    throw new TypeError('invalid Run Skill use schema version')
  }
  return {
    schemaVersion: 'tianwen.run-skill-use.v1',
    ...parseUseInput({
      runId: value.runId,
      parentVersionId: value.parentVersionId,
      sessionId: value.sessionId,
      sessionDigest: value.sessionDigest,
      skillName: value.skillName,
      contentDigest: value.contentDigest,
      skillEvidenceId: value.skillEvidenceId,
      acceptanceEvidenceId: value.acceptanceEvidenceId,
      skillCallSeq: value.skillCallSeq,
      skillResultSeq: value.skillResultSeq,
      acceptanceCallSeq: value.acceptanceCallSeq,
    }),
  }
}

export interface CaseEvidenceRelation {
  readonly runId: TianwenRunId
  readonly evidenceIds: readonly Sha256Digest[]
  readonly skillUse?: RunSkillUse
}

export interface LearningCase {
  readonly caseId: LearningCaseId
  readonly ticketId: LearningTicketId
  readonly problemFingerprint: Sha256Digest
  readonly problemCategory: string
  readonly scopeKey: string
  readonly signalIds: readonly LearningSignalId[]
  readonly runIds: readonly TianwenRunId[]
  readonly supportingEvidenceIds: readonly Sha256Digest[]
  readonly supporting: readonly CaseEvidenceRelation[]
  readonly counterevidence: readonly CaseEvidenceRelation[]
  readonly acceptanceContractDigest: Sha256Digest
  readonly parentVersionId: SkillVersionId
  readonly parentSkillName: string
  readonly learningMode: 'experience-consolidation'
  readonly schedule: 'background'
  readonly experimentLimit: 0
  readonly candidateLimit: 1
  readonly stopConditions: readonly [
    'sufficient',
    'insufficient-evidence',
    'risk-boundary',
  ]
}

export interface OpenLearningCaseInput {
  readonly ticketId: LearningTicketId
  readonly counterevidenceRunIds: readonly TianwenRunId[]
}

export interface LearningCaseReceipt {
  readonly caseId: LearningCaseId
  readonly duplicate: boolean
}

export interface LearningCaseFacts {
  readonly bindings: readonly TianwenRunBinding[]
  readonly manifests: readonly RunSkillManifest[]
  readonly uses: readonly RunSkillUse[]
  readonly outcomes: readonly OutcomeIntakeInput[]
}

export type AttributionRecord =
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'unknown'; readonly reason: string }
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'outside-stage3'; readonly recommendation: string }
  | { readonly attributionId: AttributionId; readonly caseId: LearningCaseId;
      readonly resolution: 'dsh-skill'; readonly targetSkillName: string;
      readonly hypothesis: string;
      readonly supportingEvidenceIds: readonly Sha256Digest[];
      readonly counterevidenceIds: readonly Sha256Digest[];
      readonly alternatives: string }

export type AttributionInput =
  | { readonly caseId: LearningCaseId; readonly resolution: 'unknown';
      readonly reason: string }
  | { readonly caseId: LearningCaseId; readonly resolution: 'outside-stage3';
      readonly recommendation: string }
  | { readonly caseId: LearningCaseId; readonly resolution: 'dsh-skill';
      readonly targetSkillName: string; readonly hypothesis: string;
      readonly supportingEvidenceIds: readonly Sha256Digest[];
      readonly counterevidenceIds: readonly Sha256Digest[];
      readonly alternatives: string }

export interface AttributionReceipt {
  readonly attributionId: AttributionId
  readonly decision: 'resolved' | 'no-lesson'
  readonly duplicate: boolean
}

export interface LearningCaseOpenedEvent {
  readonly schemaVersion: 'tianwen.learning-case.v1'
  readonly type: 'learning-case-opened'
  readonly at: string
  readonly case: LearningCase
  readonly inputDigest: Sha256Digest
}

export interface LearningAttributionRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-attribution.v1'
  readonly type: 'learning-attribution-recorded'
  readonly at: string
  readonly attribution: AttributionRecord
  readonly inputDigest: Sha256Digest
}

function byRun<T extends { readonly runId: TianwenRunId }>(
  values: readonly T[],
): Map<TianwenRunId, T> {
  return new Map(values.map(value => [value.runId, value]))
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function relation(
  runId: TianwenRunId,
  evidenceIds: readonly Sha256Digest[],
  uses: Map<TianwenRunId, RunSkillUse>,
): CaseEvidenceRelation {
  const skillUse = uses.get(runId)
  return {
    runId,
    evidenceIds: [...evidenceIds],
    ...(skillUse === undefined ? {} : { skillUse }),
  }
}

export function prepareLearningCase(
  input: OpenLearningCaseInput,
  ticket: LearningTicket,
  signals: readonly OutcomeLearningSignal[],
  facts: LearningCaseFacts,
): LearningCase {
  if (!isRecord(input)) {
    throw new TypeError('Learning Case input must be an object')
  }
  exactKeys(input, ['ticketId', 'counterevidenceRunIds'])
  if (!Array.isArray(input.counterevidenceRunIds)) {
    throw new TypeError('counterevidenceRunIds must be an array')
  }
  if (ticket.status !== 'open' || input.ticketId !== ticket.ticketId) {
    throw new TypeError('Learning Case requires its open Ticket')
  }
  const selected = ticket.signalIds.map(signalId =>
    signals.find(signal => signal.signalId === signalId))
  if (selected.some(signal => signal === undefined) || selected.length < 2) {
    throw new TypeError('Learning Case requires all recurrent Outcome Signals')
  }
  const outcomes = byRun(facts.outcomes)
  const bindings = byRun(facts.bindings)
  const manifests = byRun(facts.manifests)
  const uses = byRun(facts.uses)
  const resolvedSignals = selected as OutcomeLearningSignal[]
  const runIds = resolvedSignals.map(signal => signal.runId)
  if (unique(runIds).length !== runIds.length) {
    throw new TypeError('Learning Case Signal Runs must be distinct')
  }
  const firstBinding = bindings.get(runIds[0]!)
  const firstManifest = manifests.get(runIds[0]!)
  if (firstBinding === undefined || firstManifest === undefined) {
    throw new TypeError('Learning Case lacks a frozen Run manifest')
  }
  const sameGovernedParent = (runId: TianwenRunId) => {
    const binding = bindings.get(runId)
    const manifest = manifests.get(runId)
    return binding !== undefined
      && manifest !== undefined
      && binding.scopeKey === firstBinding.scopeKey
      && binding.acceptanceContractDigest === firstBinding.acceptanceContractDigest
      && canonicalJson(manifest.parent) === canonicalJson(firstManifest.parent)
      && manifest.parentVersionId === firstManifest.parentVersionId
  }
  if (!runIds.every(sameGovernedParent)) {
    throw new TypeError('Learning Case supporting Runs disagree')
  }
  const counterRunIds = unique(input.counterevidenceRunIds.map(runIdValue)).sort()
  if (counterRunIds.length === 0 || counterRunIds.some(runId => runIds.includes(runId))) {
    throw new TypeError('Learning Case requires distinct counterevidence Runs')
  }
  const counterevidence = counterRunIds.map(runId => {
    const outcome = outcomes.get(runId)
    if (
      outcome?.verdict !== 'met'
      || outcome.evidenceIds.length === 0
      || !sameGovernedParent(runId)
    ) {
      throw new TypeError('Learning Case counterevidence is unrelated')
    }
    return relation(runId, outcome.evidenceIds, uses)
  })
  const supporting = resolvedSignals.map(signal =>
    relation(signal.runId, signal.evidenceIds, uses))
  const value = {
    ticketId: ticket.ticketId,
    problemFingerprint: ticket.problemFingerprint,
    problemCategory: resolvedSignals[0]!.problemCategory,
    scopeKey: firstBinding.scopeKey,
    signalIds: [...ticket.signalIds],
    runIds,
    supportingEvidenceIds: unique(supporting.flatMap(item => item.evidenceIds)),
    supporting,
    counterevidence,
    acceptanceContractDigest: firstBinding.acceptanceContractDigest,
    parentVersionId: firstManifest.parentVersionId,
    parentSkillName: firstManifest.parent.name,
    learningMode: 'experience-consolidation' as const,
    schedule: 'background' as const,
    experimentLimit: 0 as const,
    candidateLimit: 1 as const,
    stopConditions: [
      'sufficient',
      'insufficient-evidence',
      'risk-boundary',
    ] as const,
  }
  const digest = sha256(value)
  return { caseId: `case:${digest.slice('sha256:'.length)}`, ...value }
}

function nonblank(value: unknown, label: string): string {
  return stringValue(value, label)
}

export function prepareAttribution(
  input: AttributionInput,
  learningCase: LearningCase,
): AttributionRecord {
  if (!isRecord(input)) {
    throw new TypeError('Attribution input must be an object')
  }
  if (input.caseId !== learningCase.caseId) {
    throw new TypeError('Attribution references another Case')
  }
  let record: AttributionInput
  if (input.resolution === 'unknown') {
    exactKeys(input, ['caseId', 'resolution', 'reason'])
    record = { caseId: input.caseId, resolution: input.resolution,
      reason: nonblank(input.reason, 'reason') }
  } else if (input.resolution === 'outside-stage3') {
    exactKeys(input, ['caseId', 'resolution', 'recommendation'])
    record = { caseId: input.caseId, resolution: input.resolution,
      recommendation: nonblank(input.recommendation, 'recommendation') }
  } else if (input.resolution === 'dsh-skill') {
    exactKeys(input, [
      'caseId', 'resolution', 'targetSkillName', 'hypothesis',
      'supportingEvidenceIds', 'counterevidenceIds', 'alternatives',
    ])
    if (
      input.targetSkillName !== learningCase.parentSkillName
      || !Array.isArray(input.supportingEvidenceIds)
      || !Array.isArray(input.counterevidenceIds)
      || input.supportingEvidenceIds.length === 0
      || input.counterevidenceIds.length === 0
      || [...learningCase.supporting, ...learningCase.counterevidence]
        .some(item => item.skillUse?.parentVersionId !== learningCase.parentVersionId)
    ) {
      throw new TypeError('dsh-skill Attribution lacks governed Skill proof')
    }
    const supporting = new Set(learningCase.supporting.flatMap(item => item.evidenceIds))
    const counter = new Set(learningCase.counterevidence.flatMap(item => item.evidenceIds))
    const supportingEvidenceIds = unique(input.supportingEvidenceIds.map(value =>
      digestValue(value, 'supportingEvidenceId')))
    const counterevidenceIds = unique(input.counterevidenceIds.map(value =>
      digestValue(value, 'counterevidenceId')))
    if (
      supportingEvidenceIds.some(value => !supporting.has(value))
      || counterevidenceIds.some(value => !counter.has(value))
    ) {
      throw new TypeError('Attribution Evidence is outside its Case')
    }
    record = {
      caseId: input.caseId,
      resolution: input.resolution,
      targetSkillName: input.targetSkillName,
      hypothesis: nonblank(input.hypothesis, 'hypothesis'),
      supportingEvidenceIds,
      counterevidenceIds,
      alternatives: nonblank(input.alternatives, 'alternatives'),
    }
  } else {
    throw new TypeError('invalid Attribution resolution')
  }
  const digest = sha256(record)
  return {
    attributionId: `attribution:${digest.slice('sha256:'.length)}`,
    ...record,
  } as AttributionRecord
}

export function parseLearningCase(value: unknown): LearningCase {
  if (!isRecord(value)) throw new TypeError('Learning Case must be an object')
  const caseId = stringValue(value.caseId, 'caseId') as LearningCaseId
  const copy = structuredClone(value) as unknown as LearningCase
  const { caseId: _caseId, ...body } = copy
  if (caseId !== `case:${sha256(body).slice('sha256:'.length)}`) {
    throw new TypeError('Learning Case identity mismatch')
  }
  return copy
}

export function parseAttribution(value: unknown): AttributionRecord {
  if (!isRecord(value)) throw new TypeError('Attribution must be an object')
  const attributionId = stringValue(
    value.attributionId,
    'attributionId',
  ) as AttributionId
  const copy = structuredClone(value) as unknown as AttributionRecord
  const { attributionId: _attributionId, ...body } = copy
  if (attributionId !== `attribution:${sha256(body).slice('sha256:'.length)}`) {
    throw new TypeError('Attribution identity mismatch')
  }
  return copy
}

export interface AcceptedLesson {
  readonly lessonId: LessonId
  readonly ticketId: LearningTicketId
  readonly caseId: LearningCaseId
  readonly attributionId: AttributionId
  readonly claim: string
  readonly when: string
  readonly notWhen: string
  readonly supportingEvidenceIds: readonly Sha256Digest[]
  readonly counterevidenceIds: readonly Sha256Digest[]
  readonly targetScope: string
  readonly status: 'accepted'
}

export type AcceptedLessonInput = Omit<
  AcceptedLesson,
  'lessonId' | 'ticketId' | 'status'
>

export interface AcceptedLessonReceipt {
  readonly lessonId: LessonId
  readonly duplicate: boolean
}

export interface GovernedSkillCandidate {
  readonly candidateId: GovernedSkillCandidateId
  readonly ticketId: LearningTicketId
  readonly caseId: LearningCaseId
  readonly attributionId: AttributionId
  readonly lessonId: LessonId
  readonly targetScope: string
  readonly parentVersionId: SkillVersionId
  readonly payloadDigest: Sha256Digest
  readonly payload: GovernedSkillPayload
  readonly evidenceIds: readonly Sha256Digest[]
  readonly status: 'recorded'
}

export interface SkillCandidateInput {
  readonly lessonId: LessonId
  readonly payload: GovernedSkillPayload
  readonly evidenceIds: readonly Sha256Digest[]
}

export interface SkillCandidateReceipt {
  readonly candidateId: GovernedSkillCandidateId
  readonly duplicate: boolean
}

export interface LearningLessonRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-lesson.v1'
  readonly type: 'learning-lesson-recorded'
  readonly at: string
  readonly lesson: AcceptedLesson
  readonly inputDigest: Sha256Digest
}

export interface LearningCandidateRecordedEvent {
  readonly schemaVersion: 'tianwen.learning-candidate.v1'
  readonly type: 'learning-candidate-recorded'
  readonly at: string
  readonly candidate: GovernedSkillCandidate
  readonly inputDigest: Sha256Digest
}

export function prepareAcceptedLesson(
  input: AcceptedLessonInput,
  learningCase: LearningCase,
  attribution: AttributionRecord,
): AcceptedLesson {
  if (!isRecord(input)) throw new TypeError('Accepted Lesson input must be an object')
  exactKeys(input, [
    'caseId', 'attributionId', 'claim', 'when', 'notWhen',
    'supportingEvidenceIds', 'counterevidenceIds', 'targetScope',
  ])
  if (
    attribution.resolution !== 'dsh-skill'
    || input.caseId !== learningCase.caseId
    || input.attributionId !== attribution.attributionId
    || attribution.caseId !== learningCase.caseId
    || input.targetScope !== learningCase.scopeKey
    || !Array.isArray(input.supportingEvidenceIds)
    || !Array.isArray(input.counterevidenceIds)
  ) {
    throw new TypeError('Accepted Lesson lacks resolved Case Attribution')
  }
  const supporting = unique(input.supportingEvidenceIds.map(value =>
    digestValue(value, 'supportingEvidenceId')))
  const counter = unique(input.counterevidenceIds.map(value =>
    digestValue(value, 'counterevidenceId')))
  if (
    supporting.length === 0
    || counter.length === 0
    || supporting.some(value => !attribution.supportingEvidenceIds.includes(value))
    || counter.some(value => !attribution.counterevidenceIds.includes(value))
  ) {
    throw new TypeError('Accepted Lesson Evidence is outside Attribution')
  }
  const body = {
    ticketId: learningCase.ticketId,
    caseId: input.caseId,
    attributionId: input.attributionId,
    claim: nonblank(input.claim, 'claim'),
    when: nonblank(input.when, 'when'),
    notWhen: nonblank(input.notWhen, 'notWhen'),
    supportingEvidenceIds: supporting,
    counterevidenceIds: counter,
    targetScope: input.targetScope,
    status: 'accepted' as const,
  }
  const digest = sha256(body)
  return { lessonId: `lesson:${digest.slice('sha256:'.length)}`, ...body }
}

function prepareCandidatePayload(
  payload: GovernedSkillPayload,
  parent: GovernedSkillPayload,
): GovernedSkillPayload {
  if (!isRecord(payload)) throw new TypeError('Candidate payload must be an object')
  exactKeys(
    payload,
    ['name', 'description', 'invocation', 'source', 'content'],
    ['whenToUse'],
  )
  if (!isRecord(payload.invocation)) {
    throw new TypeError('Candidate invocation must be an object')
  }
  exactKeys(payload.invocation, ['modelInvocable', 'userInvocable'])
  if (
    payload.name !== parent.name
    || payload.source !== parent.source
    || canonicalJson(payload.invocation) !== canonicalJson(parent.invocation)
    || typeof payload.invocation.modelInvocable !== 'boolean'
    || typeof payload.invocation.userInvocable !== 'boolean'
  ) {
    throw new TypeError('Candidate changed frozen Skill identity')
  }
  const whenToUse = payload.whenToUse === undefined
    ? undefined
    : nonblank(payload.whenToUse, 'payload.whenToUse')
  return {
    name: payload.name,
    description: nonblank(payload.description, 'payload.description'),
    ...(whenToUse === undefined ? {} : { whenToUse }),
    invocation: {
      modelInvocable: payload.invocation.modelInvocable,
      userInvocable: payload.invocation.userInvocable,
    },
    source: payload.source,
    content: nonblank(payload.content, 'payload.content'),
  }
}

export function prepareSkillCandidate(
  input: SkillCandidateInput,
  lesson: AcceptedLesson,
  learningCase: LearningCase,
  attribution: AttributionRecord,
  parent: GovernedSkillPayload,
): GovernedSkillCandidate {
  if (!isRecord(input)) throw new TypeError('Skill Candidate input must be an object')
  exactKeys(input, ['lessonId', 'payload', 'evidenceIds'])
  if (
    input.lessonId !== lesson.lessonId
    || lesson.caseId !== learningCase.caseId
    || lesson.attributionId !== attribution.attributionId
    || attribution.resolution !== 'dsh-skill'
    || !Array.isArray(input.evidenceIds)
  ) {
    throw new TypeError('Skill Candidate lacks an Accepted Lesson chain')
  }
  const payload = prepareCandidatePayload(input.payload, parent)
  const evidenceIds = unique(input.evidenceIds.map(value =>
    digestValue(value, 'candidate Evidence ID')))
  const required = unique([
    ...lesson.supportingEvidenceIds,
    ...lesson.counterevidenceIds,
  ])
  if (
    evidenceIds.length !== required.length
    || required.some(value => !evidenceIds.includes(value))
  ) {
    throw new TypeError('Skill Candidate must retain all Lesson Evidence')
  }
  const payloadDigest = sha256(payload)
  const identity = sha256({
    caseId: learningCase.caseId,
    lessonId: lesson.lessonId,
    parentVersionId: learningCase.parentVersionId,
    payloadDigest,
  })
  return {
    candidateId: `candidate:${identity.slice('sha256:'.length)}`,
    ticketId: learningCase.ticketId,
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    lessonId: lesson.lessonId,
    targetScope: lesson.targetScope,
    parentVersionId: learningCase.parentVersionId,
    payloadDigest,
    payload,
    evidenceIds,
    status: 'recorded',
  }
}

export function parseAcceptedLesson(value: unknown): AcceptedLesson {
  if (!isRecord(value)) throw new TypeError('Accepted Lesson must be an object')
  const copy = structuredClone(value) as unknown as AcceptedLesson
  const { lessonId, ...body } = copy
  if (lessonId !== `lesson:${sha256(body).slice('sha256:'.length)}`) {
    throw new TypeError('Accepted Lesson identity mismatch')
  }
  return copy
}

export function parseSkillCandidate(value: unknown): GovernedSkillCandidate {
  if (!isRecord(value)) throw new TypeError('Skill Candidate must be an object')
  return structuredClone(value) as unknown as GovernedSkillCandidate
}
