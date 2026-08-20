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
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'

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
