import { createHash } from 'node:crypto'
import type { SessionEvent, SessionId } from '@tianwen/dsh-compat'

export interface EvidenceRecord {
  readonly schemaVersion: 'tianwen.evidence.v1'
  readonly evidenceId: `sha256:${string}`
  readonly source: {
    readonly kind: 'dsh-session-events'
    readonly sessionId: string
    readonly callSeq: number
    readonly resultSeq?: number
  }
  readonly action: {
    readonly callId: string
    readonly toolName: string
    readonly argumentsDigest: `sha256:${string}`
  }
  readonly outcome:
    | {
      readonly status: 'complete'
      readonly resultDigest: `sha256:${string}`
      readonly isError: boolean
      readonly errorCode?: string
    }
    | {
      readonly status: 'missing-result'
    }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new TypeError('canonical JSON does not support this value')
  }
  return encoded
}

export function canonicalEvidenceDigest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`
}

type ToolCallEvent = SessionEvent<'tool/call'>
type ToolResultEvent = SessionEvent<'tool/result'>

function readArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText) as unknown
  } catch {
    throw new TypeError('tool/call arguments must be valid JSON')
  }
}

export function projectEvidence(
  sessionId: SessionId,
  events: readonly SessionEvent[],
): readonly EvidenceRecord[] {
  const calls: ToolCallEvent[] = []
  const callsById = new Map<string, ToolCallEvent>()
  const resultsByCallId = new Map<string, ToolResultEvent>()

  for (const event of events) {
    if (event.type === 'tool/call') {
      const callId = String(event.data.callId)
      const previous = callsById.get(callId)
      if (previous !== undefined && previous.seq !== event.seq) {
        throw new Error(`duplicate tool/call for ${callId}`)
      }
      if (previous === undefined) {
        callsById.set(callId, event)
        calls.push(event)
      }
      continue
    }
    if (event.type === 'tool/result') {
      const callId = String(event.data.message.content[0].toolCallId)
      if (resultsByCallId.has(callId)) {
        throw new Error(`duplicate tool/result for ${callId}`)
      }
      resultsByCallId.set(callId, event)
    }
  }

  for (const [callId, result] of resultsByCallId) {
    const call = callsById.get(callId)
    if (call === undefined) {
      throw new Error(`tool/result for ${callId} has no matching tool/call`)
    }
    if (result.seq <= call.seq) {
      throw new Error(`tool/result for ${callId} is before its tool/call`)
    }
  }

  return calls.map(call => {
    const callId = String(call.data.callId)
    const argumentsDigest = canonicalEvidenceDigest(readArguments(call.data.arguments))
    const result = resultsByCallId.get(callId)
    const resultDigest = result === undefined
      ? undefined
      : canonicalEvidenceDigest(result.data.message.content)
    const status = result === undefined ? 'missing-result' : 'complete'
    const evidenceId = canonicalEvidenceDigest({
      sessionId: String(sessionId),
      callSeq: call.seq,
      resultSeq: result?.seq ?? null,
      callId,
      toolName: call.data.name,
      argumentsDigest,
      resultDigest: resultDigest ?? null,
      status,
    })

    return {
      schemaVersion: 'tianwen.evidence.v1',
      evidenceId,
      source: {
        kind: 'dsh-session-events',
        sessionId: String(sessionId),
        callSeq: call.seq,
        ...(result === undefined ? {} : { resultSeq: result.seq }),
      },
      action: {
        callId,
        toolName: call.data.name,
        argumentsDigest,
      },
      outcome: result === undefined
        ? { status: 'missing-result' }
        : {
          status: 'complete',
          resultDigest: resultDigest!,
          isError: result.data.message.content[0].isError === true,
          ...(result.data.error === undefined ? {} : {
            errorCode: result.data.error.code,
          }),
        },
    }
  })
}
