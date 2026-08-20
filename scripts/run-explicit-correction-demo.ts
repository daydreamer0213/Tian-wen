import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SessionId,
  createUserMessage,
  defineTool,
  mountFeedbackHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { SessionEvent } from '@tianwen/dsh-compat'
import { apply } from '../packages/tianwen-runtime/src/index.js'

const CORRECTION_NOTE = 'Preserve the tool result in the final answer.'

export interface ExplicitCorrectionDemoResult {
  readonly schemaVersion: 'tianwen.explicit-correction-demo.v1'
  readonly execution: {
    readonly status: 'completed'
    readonly modelRequests: number
    readonly toolCalls: number
  }
  readonly feedback: {
    readonly rating: 'negative'
    readonly stored: true
    readonly messageId: string
    readonly version: string
  }
  readonly learning: {
    readonly decision: 'ticket-created'
    readonly signals: 1
    readonly openTickets: 1
    readonly candidateCreated: false
    readonly signalId: string
    readonly ticketId: string
  }
  readonly replay: {
    readonly duplicate: true
  }
  readonly nonInterference: {
    readonly beforeDigest: `sha256:${string}`
    readonly afterDigest: `sha256:${string}`
    readonly sessionUnchanged: true
  }
}

function sessionDigest(events: readonly SessionEvent[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

function finalAssistant(
  events: readonly SessionEvent[],
): SessionEvent<'assistant/message'> {
  const turnEnd = events.findLast(event => event.type === 'turn/end')
  const finalMessage = events.findLast(event =>
    event.type === 'assistant/message'
    && event.surfaceOp === 'append'
    && event.data.message.content.length > 0
    && turnEnd?.type === 'turn/end'
    && event.data.turn === turnEnd.data.turn
    && event.seq < turnEnd.seq)
  if (turnEnd?.type !== 'turn/end'
    || turnEnd.data.reason.kind !== 'completed'
    || finalMessage?.type !== 'assistant/message') {
    throw new Error('DSH turn did not produce a finalized assistant message')
  }
  return finalMessage
}

export async function runExplicitCorrectionDemo(): Promise<ExplicitCorrectionDemoResult> {
  const root = mkdtempSync(resolve('.tianwen-explicit-correction-'))
  let harness: Awaited<ReturnType<typeof mountFeedbackHarness>> | undefined

  try {
    harness = await mountFeedbackHarness(root, [
      toolCallResponse('explicit-correction-summary', 'summarize', {
        text: 'one deterministic research observation',
      }),
      textResponse('execution completed'),
    ])
    await apply(harness.ctx, { evolutionRoot: resolve(root, 'evolution') })
    harness.ctx.tools.register(defineTool({
      name: 'summarize',
      description: 'summarize one deterministic research observation',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return `summary:${args.text}`
      },
    }))
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('explicit-correction-demo'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })

    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'summarize the research observation' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)

      const events = handle.agent.session.events
      const finalMessage = finalAssistant(events)
      const messageId = String(finalMessage.data.message.id)
      const beforeDigest = sessionDigest(events)
      const put = await harness.ctx.messageFeedback.put({
        sessionId: handle.agent.session.id,
        messageId: finalMessage.data.message.id,
        rating: 'negative',
        note: CORRECTION_NOTE,
        ifVersion: null,
      })
      if (!put.ok) {
        throw new Error(`message feedback put failed: ${put.error.code}`)
      }
      const listed = await harness.ctx.messageFeedback.list({
        sessionId: handle.agent.session.id,
      })
      if (!listed.ok) {
        throw new Error(`message feedback list failed: ${listed.error.code}`)
      }
      const item = listed.value.items.find(candidate =>
        String(candidate.messageId) === messageId)
      if (item === undefined) throw new Error('message feedback item is missing')
      const receipt = harness.ctx.tianwenLearningIntake.consume(
        handle.agent.session,
        'project:tianwen/capability:research-summary',
        item,
      )
      const replay = harness.ctx.tianwenLearningIntake.consume(
        handle.agent.session,
        'project:tianwen/capability:research-summary',
        item,
      )
      const signals = harness.ctx.tianwenEvolution.listLearningSignals()
      const tickets = harness.ctx.tianwenEvolution.listLearningTickets()
      const candidateCreated = harness.ctx.tianwenEvolution.listEvents()
        .some(event => event.type === 'artifact-recorded')
      const afterDigest = sessionDigest(events)
      if (receipt.decision !== 'ticket-created'
        || receipt.signalId === undefined
        || receipt.ticketId === undefined
        || signals.length !== 1
        || tickets.length !== 1
        || !replay.duplicate
        || candidateCreated
        || beforeDigest !== afterDigest) {
        throw new Error('explicit correction demo invariant failed')
      }

      return {
        schemaVersion: 'tianwen.explicit-correction-demo.v1',
        execution: {
          status: 'completed',
          modelRequests: harness.adapter.requests.length,
          toolCalls: events.filter(event => event.type === 'tool/call').length,
        },
        feedback: {
          rating: item.rating,
          stored: true,
          messageId,
          version: String(item.version),
        },
        learning: {
          decision: receipt.decision,
          signals: 1,
          openTickets: 1,
          candidateCreated: false,
          signalId: receipt.signalId,
          ticketId: receipt.ticketId,
        },
        replay: { duplicate: true },
        nonInterference: {
          beforeDigest,
          afterDigest,
          sessionUnchanged: true,
        },
      }
    } finally {
      await handle.dispose()
    }
  } finally {
    try {
      if (harness !== undefined) await harness.ctx.fiber.dispose()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runExplicitCorrectionDemo(), null, 2)}\n`)
}
