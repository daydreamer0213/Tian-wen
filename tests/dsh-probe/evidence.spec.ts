import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
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
        isError: errorCode !== undefined,
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
      outcome: { status: 'complete' },
    })
    expect(first[1]).toMatchObject({
      source: { callSeq: 5 },
      outcome: { status: 'missing-result' },
    })
    expect(JSON.stringify(first)).not.toContain('raw-secret-argument')
    expect(JSON.stringify(first)).not.toContain('raw-secret-result')
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
    const fixtureBase = process.platform === 'win32'
      ? 'D:/DevData/tianwen-dsh-probe/sessions'
      : tmpdir()
    mkdirSync(fixtureBase, { recursive: true })
    const root = mkdtempSync(resolve(fixtureBase, 'evidence-replay-'))
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
