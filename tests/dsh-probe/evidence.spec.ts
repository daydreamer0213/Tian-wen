import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CallId,
  SessionId,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { SessionEvent } from '@tianwen/dsh-compat'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { projectEvidence } from '../../packages/tianwen-evidence/src/index.js'

function toolCall(
  seq: number,
  callId: string,
  argumentsText: string,
): SessionEvent<'tool/call'> {
  return {
    type: 'tool/call',
    seq,
    time: seq,
    data: {
      turn: 1,
      step: 1,
      callId: CallId(callId),
      name: 'echo',
      arguments: argumentsText,
    },
  }
}

function toolResult(
  seq: number,
  callId: string,
  text: string,
  errorCode?: string,
  isError = errorCode !== undefined,
): SessionEvent<'tool/result'> {
  return {
    type: 'tool/result',
    seq,
    time: seq,
    surfaceOp: 'append',
    sourceEventSeqs: [seq - 1],
    data: {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId(callId),
        content: [{ type: 'text', text }],
        isError,
      }),
      ...(errorCode === undefined ? {} : {
        error: { name: 'EchoError', code: errorCode },
      }),
    },
  }
}

function userMessage(seq: number): SessionEvent<'user/message'> {
  return {
    type: 'user/message',
    seq,
    time: seq,
    surfaceOp: 'append',
    data: createUserMessage({
      content: [{ type: 'text', text: 'unrelated user conversation' }],
      source: { kind: 'user' },
    }),
  }
}

function registerEchoTool(
  harness: Awaited<ReturnType<typeof mountCoreHarness>>,
): void {
  harness.ctx.tools.register(defineTool({
    name: 'echo',
    description: 'return one fixed value',
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `private result:${args.text}`
    },
  }))
}

describe('Tianwen evidence projection', () => {
  it('projects complete and missing calls without copying private payloads', () => {
    const events: SessionEvent[] = [
      userMessage(2),
      toolCall(3, 'call-complete', '{"secret":"raw-secret-argument"}'),
      toolResult(4, 'call-complete', 'raw-secret-result'),
      toolCall(5, 'call-missing', '{"text":"later"}'),
    ]

    const first = projectEvidence(SessionId('evidence-replay'), events)
    const second = projectEvidence(
      SessionId('evidence-replay'),
      structuredClone(events),
    )

    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
    expect(first[0]).toMatchObject({
      source: { callSeq: 3, resultSeq: 4 },
      action: { callId: 'call-complete', toolName: 'echo' },
      outcome: { status: 'complete', isError: false },
    })
    expect(first[1]).toMatchObject({
      source: { callSeq: 5 },
      outcome: { status: 'missing-result' },
    })
    expect(JSON.stringify(first)).not.toContain('raw-secret-argument')
    expect(JSON.stringify(first)).not.toContain('raw-secret-result')
  })

  it('preserves structured tool success and coded or uncoded failure facts', () => {
    const evidence = projectEvidence(SessionId('structured-errors'), [
      toolCall(1, 'success', '{}'),
      toolResult(2, 'success', 'ok'),
      toolCall(3, 'coded', '{}'),
      toolResult(4, 'coded', 'private error', 'STABLE_CODE'),
      toolCall(5, 'uncoded', '{}'),
      toolResult(6, 'uncoded', 'private error', undefined, true),
    ])

    expect(evidence.map(item => item.outcome)).toMatchObject([
      { status: 'complete', isError: false },
      { status: 'complete', isError: true, errorCode: 'STABLE_CODE' },
      { status: 'complete', isError: true },
    ])
    expect(evidence[2]!.outcome).not.toHaveProperty('errorCode')
  })

  it('canonically hashes recursively reordered arguments', () => {
    const first = projectEvidence(SessionId('canonical-first'), [
      toolCall(1, 'first', '{"z":{"b":true,"a":[{"y":2,"x":1}]},"a":"first"}'),
    ])
    const second = projectEvidence(SessionId('canonical-second'), [
      toolCall(1, 'second', '{"a":"first","z":{"a":[{"x":1,"y":2}],"b":true}}'),
    ])

    expect(first[0]!.action.argumentsDigest)
      .toBe(second[0]!.action.argumentsDigest)
  })

  it('keeps each result paired to its call when completions arrive in reverse order', () => {
    const evidence = projectEvidence(SessionId('reverse-results'), [
      toolCall(1, 'call-A', '{"text":"A"}'),
      toolCall(2, 'call-B', '{"text":"B"}'),
      toolResult(3, 'call-B', 'result-B'),
      toolResult(4, 'call-A', 'result-A'),
    ])

    expect(evidence.map(record => record.action.callId))
      .toEqual(['call-A', 'call-B'])
    expect(evidence.map(record => record.source.resultSeq)).toEqual([4, 3])
    expect(evidence).toMatchObject([
      {
        action: { callId: 'call-A' },
        outcome: {
          status: 'complete',
          resultDigest: 'sha256:c2694116933d7916164baa0756cb721cf4aabb246bf1656d79571f5b974fcaff',
        },
      },
      {
        action: { callId: 'call-B' },
        outcome: {
          status: 'complete',
          resultDigest: 'sha256:123db8d2e14d0004e78e5adb4d56c80bd7b1fc3553cabc8aa1ee270f206e68dc',
        },
      },
    ])
  })

  it('fails closed for duplicate calls, duplicate results, orphan results, and out-of-order results', () => {
    expect(() => projectEvidence(SessionId('duplicate-call'), [
      toolCall(1, 'duplicate', '{"text":"one"}'),
      toolCall(2, 'duplicate', '{"text":"two"}'),
    ])).toThrow(/duplicate tool\/call/i)

    expect(() => projectEvidence(SessionId('duplicate-result'), [
      toolCall(1, 'duplicate-result', '{"text":"one"}'),
      toolResult(2, 'duplicate-result', 'first'),
      toolResult(3, 'duplicate-result', 'second'),
    ])).toThrow(/duplicate tool\/result/i)

    expect(() => projectEvidence(SessionId('orphan-result'), [
      toolResult(1, 'orphan', 'no call'),
    ])).toThrow(/no matching tool\/call/i)

    expect(() => projectEvidence(SessionId('out-of-order-result'), [
      toolResult(1, 'ordered', 'too early'),
      toolCall(2, 'ordered', '{"text":"after"}'),
    ])).toThrow(/before its tool\/call/i)
  })

  it('fails closed when a result contains an unsupported canonical value', () => {
    const invalid = {
      type: 'tool/result',
      seq: 2,
      time: 2,
      surfaceOp: 'append',
      sourceEventSeqs: [1],
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'invalid-result',
          role: 'user',
          source: { kind: 'tool', callId: CallId('invalid') },
          content: [{
            type: 'tool-result',
            toolCallId: CallId('invalid'),
            content: [{ type: 'text', text: () => 'unsupported' }],
          }],
        }
      },
    } as unknown as SessionEvent

    expect(() => projectEvidence(SessionId('unsupported-value'), [
      toolCall(1, 'invalid', '{"text":"safe"}'),
      invalid,
    ])).toThrow(/canonical JSON does not support this value/i)
  })

  it('projects a real AgentLoop tool call without leaking the Session payloads', async () => {
    const harness = await mountCoreHarness([
      toolCallResponse('call-1', 'echo', { text: 'private input' }),
      textResponse('done'),
    ])
    registerEchoTool(harness)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`evidence-agent-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })

    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'run echo' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)

      const evidence = projectEvidence(
        handle.agent.session.id,
        handle.agent.session.events,
      )
      const call = handle.agent.session.events.find(
        event => event.type === 'tool/call',
      )
      const result = handle.agent.session.events.find(
        event => event.type === 'tool/result',
      )

      expect(evidence).toHaveLength(1)
      expect(projectEvidence(
        handle.agent.session.id,
        handle.agent.session.events,
      )).toEqual(evidence)
      expect(evidence[0]).toMatchObject({
        source: { callSeq: call!.seq, resultSeq: result!.seq },
        action: { callId: 'call-1', toolName: 'echo' },
        outcome: { status: 'complete' },
      })
      expect(evidence[0]!.source.callSeq).toBeLessThan(
        evidence[0]!.source.resultSeq!,
      )
      expect(evidence[0]!.action.argumentsDigest).toMatch(/^sha256:/u)
      expect((evidence[0]!.outcome as { resultDigest: string }).resultDigest)
        .toMatch(/^sha256:/u)
      expect(JSON.stringify(evidence)).not.toContain('private input')
      expect(JSON.stringify(evidence)).not.toContain('private result')
      expect(JSON.stringify(handle.agent.session.events)).toContain('private input')
      expect(JSON.stringify(handle.agent.session.events)).toContain('private result')
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('replays persistent evidence identically without requesting another model response', async () => {
    const root = mkdtempSync(resolve('.tianwen-stage1-evidence-'))
    const sessionId = SessionId(`evidence-replay-${randomUUID()}`)
    let first: Awaited<ReturnType<typeof mountPersistentHarness>> | undefined
    let second: Awaited<ReturnType<typeof mountPersistentHarness>> | undefined

    try {
      first = await mountPersistentHarness(root, [
        toolCallResponse('call-replay', 'echo', { text: 'private input' }),
        textResponse('done'),
      ])
      registerEchoTool(first)
      const initial = await first.ctx.agents.create({
        sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      initial.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'run echo' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(first.ctx, initial.agent)
      const before = projectEvidence(sessionId, initial.agent.session.events)
      const beforeBytes = JSON.stringify(before)
      expect(await first.ctx.sessions.flush(initial.agent.session)).toBe(true)
      await first.ctx.fiber.dispose()
      first = undefined

      second = await mountPersistentHarness(root, [])
      const resumed = await second.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      const after = projectEvidence(sessionId, resumed.agent.session.events)

      expect(after).toEqual(before)
      expect(JSON.stringify(after)).toBe(beforeBytes)
      expect(second.adapter.requests).toHaveLength(0)
    } finally {
      if (second !== undefined) await second.ctx.fiber.dispose()
      if (first !== undefined) await first.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
