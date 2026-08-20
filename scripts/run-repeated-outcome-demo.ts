import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { apply } from '../packages/tianwen-runtime/src/index.js'

export interface RepeatedOutcomeDemoResult {
  readonly schemaVersion: 'tianwen.repeated-outcome-demo.v1'
  readonly fixture: { readonly syntheticContractFixture: true }
  readonly execution: {
    readonly status: 'completed'
    readonly runs: 2
    readonly sessions: 2
    readonly modelRequests: number
    readonly toolCalls: number
  }
  readonly outcomes: readonly ['not-met', 'not-met']
  readonly learning: {
    readonly firstDecision: 'signal-recorded'
    readonly secondDecision: 'ticket-created'
    readonly signals: 2
    readonly openTickets: 1
    readonly candidateCreated: false
    readonly ticketId: string
  }
  readonly replay: { readonly duplicate: true }
  readonly nonInterference: {
    readonly beforeDigests: readonly [
      `sha256:${string}`,
      `sha256:${string}`,
    ]
    readonly afterDigests: readonly [
      `sha256:${string}`,
      `sha256:${string}`,
    ]
    readonly sessionsUnchanged: true
  }
  readonly costs: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly cny: 0
    readonly docker: 0
    readonly userData: 0
  }
}

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super(
      'synthetic summary requirement was not met',
      'SUMMARY_REQUIREMENT_NOT_MET',
    )
  }
}

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

function sessionDigest(
  events: readonly SessionEvent[],
): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
}

export async function runRepeatedOutcomeDemo(): Promise<RepeatedOutcomeDemoResult> {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(resolve(parent, '.tianwen-repeated-outcome-'))
  const harness = await mountCoreHarness([
    toolCallResponse('repeated-outcome-1', 'verify_summary', { text: 'first' }),
    textResponse('first synthetic result completed'),
    toolCallResponse('repeated-outcome-2', 'verify_summary', { text: 'second' }),
    textResponse('second synthetic result completed'),
  ])
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  await apply(harness.ctx, { evolutionRoot: resolve(root, 'evolution') })
  harness.ctx.tools.register(defineTool({
    name: 'verify_summary',
    description: 'verify one synthetic summary contract',
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      throw new SummaryRequirementNotMet()
    },
  }))

  const handles = []
  try {
    const bindings = []
    const receipts = []
    const beforeDigests: [`sha256:${string}`, `sha256:${string}`] = [
      'sha256:',
      'sha256:',
    ]
    const afterDigests: [`sha256:${string}`, `sha256:${string}`] = [
      'sha256:',
      'sha256:',
    ]
    let toolCalls = 0
    for (let index = 0; index < 2; index += 1) {
      const handle = await harness.ctx.agents.create({
        sessionId: SessionId(`repeated-outcome-demo-${index + 1}`),
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      handles.push(handle)
      const binding = harness.ctx.tianwenLearningIntake.bindRun(
        handle.agent.session,
        {
          goalRef: 'goal:research-preview',
          taskRef: `task:summary-${index + 1}`,
          scopeKey: 'project:tianwen/capability:research-summary',
          acceptanceContract: acceptance,
        },
      )
      bindings.push(binding)
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: `verify synthetic summary ${index + 1}` }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const finalBoundary = handle.agent.session.events.findLast(event =>
        event.type === 'turn/start' || event.type === 'turn/end')
      if (
        finalBoundary?.type !== 'turn/end'
        || finalBoundary.data.reason.kind !== 'completed'
      ) {
        throw new Error('synthetic DSH Run did not complete')
      }
      beforeDigests[index] = sessionDigest(handle.agent.session.events)
      const receipt = harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )
      receipts.push(receipt)
      afterDigests[index] = sessionDigest(handle.agent.session.events)
      toolCalls += handle.agent.session.events.filter(event =>
        event.type === 'tool/call').length
    }

    const replay = harness.ctx.tianwenLearningIntake.consumeOutcome(
      handles[1]!.agent.session,
      bindings[1]!.runId,
    )
    const [first, second] = receipts
    const signals = harness.ctx.tianwenEvolution.listLearningSignals()
    const tickets = harness.ctx.tianwenEvolution.listLearningTickets()
    const candidateCreated = harness.ctx.tianwenEvolution.listEvents()
      .some(event => event.type === 'artifact-recorded')
    if (
      bindings[0]!.runId === bindings[1]!.runId
      || first?.decision !== 'signal-recorded'
      || second?.decision !== 'ticket-created'
      || first.signalId === undefined
      || second.signalId === undefined
      || second.ticketId === undefined
      || signals.length !== 2
      || tickets.length !== 1
      || JSON.stringify(tickets[0]!.signalIds)
        !== JSON.stringify([first.signalId, second.signalId])
      || !replay.duplicate
      || candidateCreated
      || beforeDigests[0] !== afterDigests[0]
      || beforeDigests[1] !== afterDigests[1]
    ) {
      throw new Error('repeated Outcome demo invariant failed')
    }

    return {
      schemaVersion: 'tianwen.repeated-outcome-demo.v1',
      fixture: { syntheticContractFixture: true },
      execution: {
        status: 'completed',
        runs: 2,
        sessions: 2,
        modelRequests: harness.adapter.requests.length,
        toolCalls,
      },
      outcomes: ['not-met', 'not-met'],
      learning: {
        firstDecision: 'signal-recorded',
        secondDecision: 'ticket-created',
        signals: 2,
        openTickets: 1,
        candidateCreated: false,
        ticketId: second.ticketId,
      },
      replay: { duplicate: true },
      nonInterference: {
        beforeDigests,
        afterDigests,
        sessionsUnchanged: true,
      },
      costs: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        cny: 0,
        docker: 0,
        userData: 0,
      },
    }
  } finally {
    try {
      for (const handle of handles) await handle.dispose()
      await harness.ctx.fiber.dispose()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runRepeatedOutcomeDemo(), null, 2)}\n`)
}
