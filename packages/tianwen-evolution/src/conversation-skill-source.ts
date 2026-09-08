import { Buffer } from 'node:buffer'
import { canonicalJson, sha256 } from './learning-intake.js'
import { parseLearningSkillReference, type LearningSkillReference } from './learning-analysis.js'
import type { Sha256Digest } from './ledger.js'

/** Host-loaded admission identity, never an external read authorization by itself. */
export interface ConversationSkillAdmission extends LearningSkillReference {
  readonly scopeKey: string
  readonly purpose: 'conversation-method-reference'
  readonly environmentDigest: Sha256Digest
}
export interface GuidanceSourceUse {
  readonly readDigest: Sha256Digest
  readonly status: 'adapted' | 'not-used'
  readonly rationale: string
}

function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).some(key => typeof key !== 'string')
    || Reflect.ownKeys(value).length !== Object.keys(value).length
    || (keys !== undefined && (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))))) {
    throw new TypeError('conversation Skill source has invalid fields')
  }
  return value as Record<string, unknown>
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('conversation Skill source digest is invalid')
  return value as Sha256Digest
}

export function parseConversationSkillAdmission(value: unknown): ConversationSkillAdmission {
  const input = object(value, ['name', 'provider', 'digest', 'origin', 'revision', 'license',
    'reviewedAt', 'kind', 'runtime', 'scopeKey', 'purpose', 'environmentDigest'])
  const { scopeKey, purpose, environmentDigest, ...reference } = input
  if (typeof scopeKey !== 'string' || !/^conversation:sha256:[a-f0-9]{64}$/u.test(scopeKey)
    || purpose !== 'conversation-method-reference') throw new TypeError('conversation Skill source scope or purpose is invalid')
  return { ...parseLearningSkillReference(reference), scopeKey, purpose, environmentDigest: digest(environmentDigest) }
}

// Reject values JSON would discard/coerce before canonicalizing the whole definition.
function assertJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return
  if (typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Skill definition must be serializable JSON')
  ancestors.add(value)
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length) {
      throw new TypeError('Skill definition arrays must contain only JSON elements')
    }
    for (let index = 0; index < value.length; index++) assertJson(value[index], ancestors)
  } else {
    for (const item of Object.values(object(value))) assertJson(item, ancestors)
  }
  ancestors.delete(value)
}

export function parseConversationSkillDefinition(value: unknown, reference: LearningSkillReference): Readonly<Record<string, unknown>> {
  object(value)
  assertJson(value)
  const definition = object(JSON.parse(canonicalJson(value)))
  const invocation = object(definition.invocation)
  if (definition.name !== reference.name || definition.provider !== reference.provider
    || typeof definition.description !== 'string' || typeof definition.source !== 'string'
    || invocation.modelInvocable !== true || typeof invocation.userInvocable !== 'boolean'
    || typeof definition.content !== 'string' || Buffer.byteLength(definition.content, 'utf8') > 16384
    || sha256(definition) !== reference.digest) throw new TypeError('Skill definition disagrees with its reviewed reference or text bounds')
  return definition
}

export function parseGuidanceSourceUse(value: unknown): GuidanceSourceUse {
  const input = object(value, ['readDigest', 'status', 'rationale'])
  if ((input.status !== 'adapted' && input.status !== 'not-used') || typeof input.rationale !== 'string'
    || input.rationale.trim().length === 0 || input.rationale.includes('\0') || !input.rationale.isWellFormed()
    || Buffer.byteLength(input.rationale, 'utf8') > 4096) throw new TypeError('guidance source use status or rationale is invalid')
  return { readDigest: digest(input.readDigest), status: input.status, rationale: input.rationale }
}
