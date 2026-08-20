import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DynamicCordisRunnerService,
  SessionId,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { SessionEvent } from '@tianwen/dsh-compat'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

const roots: string[] = []

function evolutionRoot(): string {
  const root = mkdtempSync(resolve('.tianwen-stage1-runtime-'))
  roots.push(root)
  return root
}

function feedback(messageId: string) {
  return {
    messageId,
    rating: 'negative' as const,
    note: 'Preserve the tool result in the final answer.',
    version: '11111111-1111-4111-8111-111111111111',
  }
}

function finalAssistant(
  events: readonly SessionEvent[],
): SessionEvent<'assistant/message'> {
  const event = events.findLast(candidate =>
    candidate.type === 'assistant/message'
    && candidate.surfaceOp === 'append'
    && candidate.data.message.content.length > 0)
  if (event?.type !== 'assistant/message') {
    throw new Error('scripted run did not produce a final assistant message')
  }
  return event
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
      return `tool-result:${args.text}`
    },
  }))
}

async function mountCompletedSessions(count = 1) {
  const script = Array.from({ length: count }, (_, index) => [
    toolCallResponse(`call-${index}`, 'echo', { text: `input-${index}` }),
    textResponse(`completed-${index}`),
  ]).flat()
  const harness = await mountCoreHarness(script)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  await apply(harness.ctx, { evolutionRoot: evolutionRoot() })
  registerEchoTool(harness)

  const handles = []
  for (let index = 0; index < count; index += 1) {
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`learning-intake-runtime-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: `run echo ${index}` }],
      source: { kind: 'user' },
    }))
    await waitForIdle(harness.ctx, handle.agent)
    handles.push(handle)
  }
  return { harness, handles }
}

async function disposeMounted(
  mounted: Awaited<ReturnType<typeof mountCompletedSessions>>,
): Promise<void> {
  for (const handle of mounted.handles) await handle.dispose()
  await mounted.harness.ctx.fiber.dispose()
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen runtime learning intake', () => {
  it('consumes final DSH feedback through Evidence and the existing ledger without changing the Session', async () => {
    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const finalMessage = finalAssistant(handle!.agent.session.events)
      const before = structuredClone(handle!.agent.session.events)

      const receipt = mounted.harness.ctx.tianwenLearningIntake.consume(
        handle!.agent.session,
        'project:tianwen/capability:research-summary',
        feedback(String(finalMessage.data.message.id)),
      )

      expect(receipt).toMatchObject({
        decision: 'ticket-created',
        duplicate: false,
        sessionUnchanged: true,
      })
      expect(handle!.agent.session.events).toEqual(before)
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals())
        .toMatchObject([{
          sessionId: String(handle!.agent.session.id),
          messageId: String(finalMessage.data.message.id),
          evidenceIds: [expect.stringMatching(/^sha256:/u)],
        }])
      expect(mounted.harness.adapter.requests).toHaveLength(2)
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('rejects a final message id from another Session before ledger write', async () => {
    const mounted = await mountCompletedSessions(2)
    const [target, other] = mounted.handles
    try {
      const otherFinal = finalAssistant(other!.agent.session.events)

      expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
        target!.agent.session,
        'project:tianwen/capability:research-summary',
        feedback(String(otherFinal.data.message.id)),
      )).toThrow(/final assistant message/i)
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals())
        .toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets())
        .toEqual([])
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('rejects non-final and non-assistant message ids before ledger write', async () => {
    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const events = handle!.agent.session.events
      const finalMessage = finalAssistant(events)
      const earlierAssistant = events.find(event =>
        event.type === 'assistant/message'
        && event.data.message.id !== finalMessage.data.message.id)
      const userMessage = events.find(event => event.type === 'user/message')
      if (earlierAssistant?.type !== 'assistant/message'
        || userMessage?.type !== 'user/message') {
        throw new Error('scripted run did not produce comparison messages')
      }

      for (const messageId of [
        String(earlierAssistant.data.message.id),
        String(userMessage.data.id),
      ]) {
        expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
          handle!.agent.session,
          'project:tianwen/capability:research-summary',
          feedback(messageId),
        )).toThrow(/final assistant message/i)
      }
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals())
        .toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets())
        .toEqual([])
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('leaves the Session byte-for-byte unchanged when the ledger write fails', async () => {
    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const finalMessage = finalAssistant(handle!.agent.session.events)
      const before = JSON.stringify(handle!.agent.session.events)
      vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordLearningIntake')
        .mockImplementation(() => {
          throw new Error('injected ledger write failure')
        })

      expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
        handle!.agent.session,
        'project:tianwen/capability:research-summary',
        feedback(String(finalMessage.data.message.id)),
      )).toThrow(/injected ledger write failure/i)
      expect(JSON.stringify(handle!.agent.session.events)).toBe(before)
    } finally {
      await disposeMounted(mounted)
    }
  })
})
