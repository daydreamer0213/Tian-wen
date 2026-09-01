import { describe, expect, it } from 'vitest'

import { sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import { CallId, SessionId } from '@tianwen/dsh-compat'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { projectEvidence } from '../../packages/tianwen-evidence/src/index.js'
import {
  isPermissionLimited,
  permissionSnapshot,
  permissionLimitedEvidence,
} from '../../packages/tianwen-runtime-bundle/src/permission-attempt.js'

function toolCall(seq: number, callId = 'call'): SessionEvent<'tool/call'> {
  return {
    type: 'tool/call',
    seq,
    time: seq,
    data: {
      turn: 1,
      step: 1,
      callId: CallId(callId),
      name: 'pwsh',
      arguments: '{"cmd":"Set-Content outside.txt blocked"}',
    },
  }
}

function toolResult(input: {
  readonly seq: number
  readonly text: string
  readonly errorCode?: string
  readonly isError?: boolean
  readonly callId?: string
}): SessionEvent<'tool/result'> {
  const callId = input.callId ?? 'call'
  return {
    type: 'tool/result',
    seq: input.seq,
    time: input.seq,
    surfaceOp: 'append',
    sourceEventSeqs: [input.seq - 1],
    data: {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId(callId),
        content: [{ type: 'text', text: input.text }],
        isError: input.isError ?? input.errorCode !== undefined,
      }),
      ...(input.errorCode === undefined ? {} : {
        error: { name: 'ToolError', code: input.errorCode },
      }),
    },
  }
}

function sandboxMode(
  seq: number,
  mode: 'read-only' | 'workspace-write' | 'danger-full-access',
  source?: 'delegation',
): SessionEvent {
  return {
    type: 'sandbox/mode',
    seq,
    time: seq,
    data: { mode, ...(source === undefined ? {} : { source }) },
  } as SessionEvent
}

function evidenceFor(events: readonly SessionEvent[]) {
  const evidence = projectEvidence(SessionId('permission-child'), events)
  expect(evidence).toHaveLength(1)
  return evidence[0]!
}

describe('permission-limited attempt classification', () => {
  it('accepts only the canonical denial marker for the effective sandbox mode', () => {
    const snapshot = permissionSnapshot([], 'workspace-write')
    const matching = toolResult({
      seq: 2,
      text: `command failed\n${sandboxDenialMarker('workspace-write')}\nretry with care`,
      isError: true,
    })
    const wrongMode = toolResult({
      seq: 2,
      text: sandboxDenialMarker('read-only'),
      isError: true,
    })

    expect(isPermissionLimited(matching, evidenceFor([toolCall(1), matching]), snapshot)).toBe(true)
    expect(isPermissionLimited(wrongMode, evidenceFor([toolCall(1), wrongMode]), snapshot)).toBe(false)
  })

  it('accepts structured SANDBOX_UNAVAILABLE even when no denial marker was rendered', () => {
    const snapshot = permissionSnapshot([], 'workspace-write')
    const result = toolResult({
      seq: 2,
      text: 'sandbox runner could not start',
      errorCode: 'SANDBOX_UNAVAILABLE',
    })

    expect(isPermissionLimited(result, evidenceFor([toolCall(1), result]), snapshot)).toBe(true)
  })

  it('classifies only structured SANDBOX_UNAVAILABLE when the legacy effective mode is unproven', () => {
    const unavailable = toolResult({
      seq: 2, text: 'sandbox runner could not start', errorCode: 'SANDBOX_UNAVAILABLE',
    })
    const markerOnly = toolResult({
      seq: 2, text: sandboxDenialMarker('read-only'), isError: true,
    })
    const unknownSnapshot = {
      eventSeq: null,
      fingerprint: permissionSnapshot([], 'read-only').fingerprint,
    }

    expect(isPermissionLimited(
      unavailable, evidenceFor([toolCall(1), unavailable]), unknownSnapshot,
    )).toBe(true)
    expect(isPermissionLimited(
      markerOnly, evidenceFor([toolCall(1), markerOnly]), unknownSnapshot,
    )).toBe(false)
  })

  it('rejects ordinary command and provider failures', () => {
    const snapshot = permissionSnapshot([], 'workspace-write')
    const commandFailure = toolResult({
      seq: 2,
      text: 'process exited with code 1: permission denied by the application',
      errorCode: 'COMMAND_FAILED',
    })
    const providerFailure = toolResult({
      seq: 2,
      text: 'provider request failed before execution',
      errorCode: 'PROVIDER_UNAVAILABLE',
    })

    expect(isPermissionLimited(
      commandFailure,
      evidenceFor([toolCall(1), commandFailure]),
      snapshot,
    )).toBe(false)
    expect(isPermissionLimited(
      providerFailure,
      evidenceFor([toolCall(1), providerFailure]),
      snapshot,
    )).toBe(false)
  })

  it('ignores a child assistant message that merely claims permission was denied', () => {
    const events: SessionEvent[] = [{
      type: 'assistant/message',
      seq: 0,
      time: 0,
      surfaceOp: 'append',
      data: {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          source: { provider: 'provider', model: 'model' },
          content: [{ type: 'text', text: 'permission denied; please grant Full access' }],
        }),
      },
    }, toolCall(1), toolResult({ seq: 2, text: 'ordinary success', isError: false })]
    const evidence = projectEvidence(SessionId('permission-child'), events)

    expect(permissionLimitedEvidence(events, evidence, permissionSnapshot([], 'workspace-write')))
      .toBeUndefined()
  })
})

describe('permission snapshots', () => {
  it('fingerprints the latest explicit sandbox event sequence and effective mode', () => {
    const events = [
      sandboxMode(2, 'read-only'),
      { type: 'assistant/message', seq: 3, time: 3, data: { uiPolicyLabel: 'Full access' } } as unknown as SessionEvent,
      sandboxMode(7, 'workspace-write'),
    ]

    const first = permissionSnapshot(events, 'workspace-write')
    const replayed = permissionSnapshot(structuredClone(events), 'workspace-write')
    const wider = permissionSnapshot([...events, sandboxMode(9, 'danger-full-access')], 'danger-full-access')

    expect(first).toEqual(replayed)
    expect(first).toMatchObject({ mode: 'workspace-write', eventSeq: 7 })
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(wider.fingerprint).not.toBe(first.fingerprint)
  })

  it('ignores UI labels and delegated child policy events', () => {
    const baseline = permissionSnapshot([sandboxMode(4, 'workspace-write')], 'workspace-write')
    const withPresentationAndDelegation = permissionSnapshot([
      sandboxMode(4, 'workspace-write'),
      { type: 'assistant/message', seq: 5, time: 5, data: { permissionPreset: 'Full access' } } as unknown as SessionEvent,
      sandboxMode(6, 'danger-full-access', 'delegation'),
    ], 'workspace-write')

    expect(withPresentationAndDelegation).toEqual(baseline)
  })
})
