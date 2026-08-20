import { createHash } from 'node:crypto'
import {
  callConfigEquals,
  isAgentLoopRequest,
} from '@tianwen/dsh-compat'
import type {
  GenerateOptions,
  LlmCallConfig,
} from '@tianwen/dsh-compat'

export interface ObserveSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly sessionId: string
  readonly preflight: LlmCallConfig
  readonly paired: LlmCallConfig
  readonly expectedSkillContent: string
  readonly skillName: string
  readonly requestOrdinal: number
  readonly maxModelRequests: number
}

export interface NormalizeSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly expectedSkillContent: string
  readonly skillName: string
}

export type SkillEvaluationRequestNormalization =
  | { readonly accepted: false; readonly reason: string }
  | {
      readonly accepted: true
      readonly injectionMessageIndex: number
      readonly fullRequestDigest: `sha256:${string}`
      readonly normalizedFirstRequestDigest: `sha256:${string}`
      readonly catalogTargetCount: 0 | 1
    }

export type SkillEvaluationRequestObservation = SkillEvaluationRequestNormalization

export type NormalizedSkillEvaluationRequestComparison =
  | {
      readonly accepted: false
      readonly reason: 'asymmetric-skill-catalog' | 'unequal-normalized-first-request'
    }
  | {
      readonly accepted: true
      readonly normalizedFirstRequestDigest: `sha256:${string}`
    }

const NORMALIZED_SESSION = '<paired-evaluation-session>'
const NORMALIZED_SKILL_CONTENT = '<selected-skill-content>'
const NORMALIZED_CATALOG_ENTRY = Object.freeze({ name: '<selected-skill-catalog-entry>' })

function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex')}`
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function catalogEntries(message: unknown): readonly unknown[] | undefined {
  const source = record(record(message)?.source)
  return source?.kind === 'skill-catalog' && Array.isArray(source.entries)
    ? source.entries
    : undefined
}

function isTargetCatalogEntry(entry: unknown, skillName: string): boolean {
  return record(entry)?.name === skillName
}

function normalizeRequest(
  request: GenerateOptions,
  injectionMessageIndex: number,
  skillName: string,
): unknown {
  return {
    ...request,
    sessionId: NORMALIZED_SESSION,
    messages: request.messages.map((message, index) => {
      const entries = catalogEntries(message)
      if (index !== injectionMessageIndex && entries === undefined) {
        return message
      }
      return {
        ...message,
        ...(index === injectionMessageIndex
          ? { content: [{ type: 'text', text: NORMALIZED_SKILL_CONTENT }] }
          : {}),
        ...(entries === undefined
          ? {}
          : {
              source: {
                ...record(message.source),
                entries: entries.map(entry =>
                  isTargetCatalogEntry(entry, skillName) ? NORMALIZED_CATALOG_ENTRY : entry),
              },
            }),
      }
    }),
  }
}

export function normalizeSkillEvaluationRequest(
  input: NormalizeSkillEvaluationRequestInput,
): SkillEvaluationRequestNormalization {
  const injectionIndexes = input.request.messages.flatMap((message, index) =>
    message.role === 'user'
    && message.content.length === 1
    && message.content[0]?.type === 'text'
    && message.content[0].text === input.expectedSkillContent
      ? [index]
      : [])
  if (injectionIndexes.length !== 1) {
    return { accepted: false, reason: 'skill-injection-mismatch' }
  }
  const catalogTargetCount = input.request.messages
    .flatMap(message => catalogEntries(message) ?? [])
    .filter(entry => isTargetCatalogEntry(entry, input.skillName)).length
  if (catalogTargetCount > 1) {
    return { accepted: false, reason: 'duplicate-skill-catalog-entry' }
  }
  return {
    accepted: true,
    injectionMessageIndex: injectionIndexes[0]!,
    fullRequestDigest: sha256(input.request),
    normalizedFirstRequestDigest: sha256(normalizeRequest(
      input.request,
      injectionIndexes[0]!,
      input.skillName,
    )),
    catalogTargetCount: catalogTargetCount === 1 ? 1 : 0,
  }
}

export function compareNormalizedSkillEvaluationRequests(
  baseline: SkillEvaluationRequestNormalization,
  candidate: SkillEvaluationRequestNormalization,
): NormalizedSkillEvaluationRequestComparison {
  if (!baseline.accepted || !candidate.accepted
    || baseline.catalogTargetCount !== candidate.catalogTargetCount) {
    return { accepted: false, reason: 'asymmetric-skill-catalog' }
  }
  if (baseline.normalizedFirstRequestDigest !== candidate.normalizedFirstRequestDigest) {
    return { accepted: false, reason: 'unequal-normalized-first-request' }
  }
  return {
    accepted: true,
    normalizedFirstRequestDigest: baseline.normalizedFirstRequestDigest,
  }
}

function requestConfig(request: GenerateOptions): LlmCallConfig {
  return {
    provider: request.provider,
    model: request.model,
    ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    ...(request.stop === undefined ? {} : { stop: request.stop }),
  }
}

export function observeSkillEvaluationRequest(
  input: ObserveSkillEvaluationRequestInput,
): SkillEvaluationRequestObservation {
  if (!isAgentLoopRequest(input.request)) {
    return { accepted: false, reason: 'not-agent-loop' }
  }
  if (String(input.request.sessionId) !== input.sessionId) {
    return { accepted: false, reason: 'wrong-session' }
  }
  if (input.request.purpose !== undefined) {
    return { accepted: false, reason: 'non-ordinary-purpose' }
  }
  if (
    !Number.isSafeInteger(input.requestOrdinal)
    || input.requestOrdinal !== 1
    || input.requestOrdinal > input.maxModelRequests
  ) {
    return { accepted: false, reason: 'wrong-order-or-budget' }
  }
  const actual = requestConfig(input.request)
  if (!callConfigEquals(actual, input.preflight) || !callConfigEquals(actual, input.paired)) {
    return { accepted: false, reason: 'call-config-mismatch' }
  }
  return normalizeSkillEvaluationRequest(input)
}
