import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SessionId,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'

import { projectEvidence } from '../packages/tianwen-evidence/src/index.js'

export interface ResearchPreviewDemoResult {
  readonly schemaVersion: 'tianwen.research-preview-demo.v1'
  readonly execution: {
    readonly status: 'completed'
    readonly modelRequests: number
    readonly toolCalls: number
  }
  readonly evidence: {
    readonly count: number
    readonly complete: number
    readonly errors: number
  }
  readonly learning: {
    readonly decision: 'no-case'
    readonly signals: 0
    readonly candidateCreated: false
    readonly reason: 'no-repeat-failure-or-user-correction'
  }
  readonly nonInterference: {
    readonly beforeDigest: `sha256:${string}`
    readonly afterDigest: `sha256:${string}`
    readonly sessionUnchanged: true
  }
}

function sessionDigest(events: readonly unknown[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

export async function runResearchPreviewDemo(): Promise<ResearchPreviewDemoResult> {
  const harness = await mountCoreHarness([
    toolCallResponse('research-preview-summary', 'summarize', {
      text: 'one deterministic research observation',
    }),
    textResponse('execution completed'),
  ])

  try {
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
      sessionId: SessionId('research-preview-demo'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })

    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'summarize the research observation' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)

      const events = handle.agent.session.events
      const turnEnd = events.findLast(event => event.type === 'turn/end')
      const reason = turnEnd?.type === 'turn/end'
        ? turnEnd.data.reason.kind
        : 'missing-turn-end'
      if (reason !== 'completed') {
        throw new Error(`DSH turn did not complete: ${reason}`)
      }
      const beforeDigest = sessionDigest(events)
      const evidence = projectEvidence(handle.agent.session.id, events)
      const afterDigest = sessionDigest(events)
      if (beforeDigest !== afterDigest) {
        throw new Error('Evidence projection changed the DSH session')
      }

      return {
        schemaVersion: 'tianwen.research-preview-demo.v1',
        execution: {
          status: 'completed',
          modelRequests: harness.adapter.requests.length,
          toolCalls: events.filter(event => event.type === 'tool/call').length,
        },
        evidence: {
          count: evidence.length,
          complete: evidence.filter(record =>
            record.outcome.status === 'complete').length,
          errors: evidence.filter(record =>
            record.outcome.status === 'complete'
            && record.outcome.errorCode !== undefined).length,
        },
        learning: {
          decision: 'no-case',
          signals: 0,
          candidateCreated: false,
          reason: 'no-repeat-failure-or-user-correction',
        },
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
    await harness.ctx.fiber.dispose()
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runResearchPreviewDemo(), null, 2)}\n`)
}
