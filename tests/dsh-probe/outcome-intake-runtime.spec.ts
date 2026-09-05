import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
import type { Session, SessionEvent } from '@tianwen/dsh-compat'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { learningSessionLifecycleFingerprint } from '../../packages/tianwen-evolution/src/index.js'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

const roots: string[] = []
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super(
      'synthetic summary requirement was not met',
      'SUMMARY_REQUIREMENT_NOT_MET',
    )
  }
}

function evolutionRoot(): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'outcome-intake-runtime-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'runtime-'))
  roots.push(root)
  return root
}

function registerVerifier(
  harness: Awaited<ReturnType<typeof mountCoreHarness>>,
): void {
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
}

async function mount(script: Parameters<typeof mountCoreHarness>[0]) {
  const harness = await mountCoreHarness(script)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  await apply(harness.ctx, { evolutionRoot: evolutionRoot() })
  registerVerifier(harness)
  return harness
}

function fakeSession(id: string): Session {
  return {
    id: SessionId(id),
    header: { id: SessionId(id), createdAt: 1 },
    events: [],
  } as Session
}

function setEvents(session: Session, events: readonly SessionEvent[]): void {
  ;(session as unknown as { events: SessionEvent[] }).events =
    structuredClone(events)
}

function bindingInput(index: string) {
  return {
    goalRef: 'goal:research-preview',
    taskRef: `task:summary-${index}`,
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: acceptance,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen runtime Outcome intake', () => {
  it('derives a v3 Run binding identity from the real Session header', async () => {
    const harness = await mount([])
    const rawCwd = join(evolutionRoot(), 'private-runtime-binding')
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-binding-v3-${randomUUID()}`),
      meta: { cwd: rawCwd },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const write = vi.spyOn(harness.ctx.tianwenEvolution, 'recordRunBinding')
    const callerFingerprint = `sha256:${'f'.repeat(64)}`

    try {
      const receipt = harness.ctx.tianwenLearningIntake.bindRun(
        handle.agent.session,
        {
          ...bindingInput('v3-header'),
          sessionLifecycleFingerprint: callerFingerprint,
        } as Parameters<
          typeof harness.ctx.tianwenLearningIntake.bindRun
        >[1],
      )
      const expected = learningSessionLifecycleFingerprint({
        sessionId: String(handle.agent.session.id),
        createdAt: handle.agent.session.header.createdAt,
        cwd: rawCwd,
      })
      const written = write.mock.calls[0]?.[0]

      expect(written).toMatchObject({
        sessionId: String(handle.agent.session.id),
        sessionLifecycleFingerprint: expected,
      })
      expect(written).not.toHaveProperty('cwd')
      expect(expected).not.toBe(callerFingerprint)
      expect(harness.ctx.tianwenEvolution.getRunBinding(receipt.runId))
        .toMatchObject({
          schemaVersion: 'tianwen.run-binding.v3',
          sessionLifecycleFingerprint: expected,
        })
      expect(JSON.stringify(harness.ctx.tianwenEvolution
        .getRunBinding(receipt.runId))).not.toContain(rawCwd)
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('merges the same structured failure across two real DSH Runs', async () => {
    const harness = await mount([
      toolCallResponse('call-1', 'verify_summary', { text: 'first' }),
      textResponse('first user result completed'),
      toolCallResponse('call-2', 'verify_summary', { text: 'second' }),
      textResponse('second user result completed'),
    ])
    const handles = []
    try {
      const receipts = []
      for (let index = 1; index <= 2; index += 1) {
        const handle = await harness.ctx.agents.create({
          sessionId: SessionId(`outcome-runtime-${randomUUID()}`),
          agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
        })
        handles.push(handle)
        const binding = harness.ctx.tianwenLearningIntake.bindRun(
          handle.agent.session,
          bindingInput(String(index)),
        )
        handle.agent.followup(createUserMessage({
          content: [{ type: 'text', text: `verify summary ${index}` }],
          source: { kind: 'user' },
        }))
        await waitForIdle(harness.ctx, handle.agent)
        const before = structuredClone(handle.agent.session.events)
        const receipt = harness.ctx.tianwenLearningIntake.consumeOutcome(
          handle.agent.session,
          binding.runId,
        )
        receipts.push(receipt)
        expect(receipt.acceptanceEvidenceId).toBe(
          harness.ctx.tianwenEvidence.project(handle.agent.session)
            .filter(record => record.action.toolName === 'verify_summary')
            .at(-1)!.evidenceId,
        )
        expect(handle.agent.session.events).toEqual(before)
      }

      const [first, second] = receipts
      expect(first).toMatchObject({
        decision: 'signal-recorded',
        duplicate: false,
        sessionUnchanged: true,
      })
      expect(second).toMatchObject({
        decision: 'ticket-created',
        duplicate: false,
        sessionUnchanged: true,
      })
      expect(harness.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(2)
      expect(harness.ctx.tianwenEvolution.listLearningTickets())
        .toMatchObject([{ signalIds: [first!.signalId, second!.signalId] }])
      const publicEvents = JSON.stringify(harness.ctx.tianwenEvolution.listEvents())
      expect(publicEvents).not.toContain('run-binding-recorded')
      expect(publicEvents).not.toContain('outcome-intake-recorded')
    } finally {
      for (const handle of handles) await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('enforces binding timing, Session identity, and failed-write isolation', async () => {
    const harness = await mount([
      toolCallResponse('call-guard', 'verify_summary', { text: 'guard' }),
      textResponse('guard result completed'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-guards-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const binding = harness.ctx.tianwenLearningIntake.bindRun(
      handle.agent.session,
      bindingInput('guards'),
    )
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'verify guard' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const bindingWrite = vi.spyOn(
        harness.ctx.tianwenEvolution,
        'recordRunBinding',
      )
      expect(() => harness.ctx.tianwenLearningIntake.bindRun(
        handle.agent.session,
        bindingInput('late'),
      )).toThrow(/before the first DSH Turn/i)
      expect(bindingWrite).not.toHaveBeenCalled()
      expect(() => harness.ctx.tianwenLearningIntake.consumeOutcome(
        fakeSession('another-session'),
        binding.runId,
      )).toThrow(/another DSH Session/i)

      const before = JSON.stringify(handle.agent.session.events)
      vi.spyOn(harness.ctx.tianwenEvolution, 'recordOutcomeIntake')
        .mockImplementation(() => {
          throw new Error('injected Outcome write failure')
        })
      expect(() => harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )).toThrow(/injected Outcome write failure/i)
      expect(JSON.stringify(handle.agent.session.events)).toBe(before)
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('uses the structured isError and error.code ternary', async () => {
    const harness = await mount([
      toolCallResponse('call-triage', 'verify_summary', { text: 'triage' }),
      textResponse('triage result completed'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-triage-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'verify triage' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const baseEvents = handle.agent.session.events
      const variants: Array<{
        name: string
        decision: 'no-case' | 'continue-observing'
        change(events: SessionEvent[]): SessionEvent[]
      }> = [
        {
          name: 'success',
          decision: 'no-case',
          change(events) {
            const result = events.find(event => event.type === 'tool/result')!
            if (result.type === 'tool/result') {
              result.data.message.content[0].isError = false
              delete (result.data as { error?: unknown }).error
            }
            return events
          },
        },
        {
          name: 'no-verifier',
          decision: 'continue-observing',
          change: events => events.filter(event =>
            event.type !== 'tool/call' && event.type !== 'tool/result'),
        },
        {
          name: 'missing-result',
          decision: 'continue-observing',
          change: events => events.filter(event => event.type !== 'tool/result'),
        },
        {
          name: 'uncoded-error',
          decision: 'continue-observing',
          change(events) {
            const result = events.find(event => event.type === 'tool/result')!
            if (result.type === 'tool/result') {
              delete (result.data as { error?: unknown }).error
            }
            return events
          },
        },
        {
          name: 'unrelated-code',
          decision: 'continue-observing',
          change(events) {
            const result = events.find(event => event.type === 'tool/result')!
            if (result.type === 'tool/result' && result.data.error !== undefined) {
              ;(result.data.error as { code: string }).code = 'UNRELATED_ERROR'
            }
            return events
          },
        },
        {
          name: 'interrupted',
          decision: 'continue-observing',
          change(events) {
            const end = events.findLast(event => event.type === 'turn/end')!
            if (end.type === 'turn/end') {
              end.data.reason = { kind: 'interrupted' }
            }
            return events
          },
        },
      ]

      for (const variant of variants) {
        const session = fakeSession(`triage-${variant.name}`)
        const binding = harness.ctx.tianwenLearningIntake.bindRun(
          session,
          bindingInput(variant.name),
        )
        setEvents(session, variant.change(structuredClone(baseEvents)))
        expect(harness.ctx.tianwenLearningIntake.consumeOutcome(
          session,
          binding.runId,
        )).toMatchObject({
          decision: variant.decision,
          sessionUnchanged: true,
        })
      }
      expect(harness.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('accepts an exact verifier attestation when the durable error code is absent', async () => {
    const harness = await mount([
      toolCallResponse('call-attested', 'verify_summary', { text: 'attested' }),
      textResponse('attested result completed'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-attested-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'verify attested outcome' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const events = structuredClone(handle.agent.session.events)
      const result = events.find(event => event.type === 'tool/result')!
      if (result.type !== 'tool/result') throw new Error('expected verifier result')
      delete (result.data as { error?: unknown }).error
      const session = fakeSession(`outcome-attested-copy-${randomUUID()}`)
      const binding = harness.ctx.tianwenLearningIntake.bindRun(
        session,
        bindingInput('attested'),
      )
      setEvents(session, events)
      const evidence = harness.ctx.tianwenEvidence.project(session)
        .find(record => record.action.toolName === 'verify_summary')!
      const write = vi.spyOn(harness.ctx.tianwenEvolution, 'recordOutcomeIntake')
      expect(() => harness.ctx.tianwenLearningIntake.consumeOutcome(
        session,
        binding.runId,
        {
          verdict: 'not-met',
          acceptanceEvidenceId: `sha256:${'0'.repeat(64)}`,
        },
      )).toThrow(/attestation does not match Evidence/i)
      expect(() => harness.ctx.tianwenLearningIntake.consumeOutcome(
        session,
        binding.runId,
        { verdict: 'met', acceptanceEvidenceId: evidence.evidenceId },
      )).toThrow(/attestation does not match Evidence/i)
      expect(write).not.toHaveBeenCalled()
      expect(harness.ctx.tianwenLearningIntake.consumeOutcome(
        session,
        binding.runId,
        { verdict: 'not-met', acceptanceEvidenceId: evidence.evidenceId },
      )).toMatchObject({
        decision: 'signal-recorded',
        acceptanceEvidenceId: evidence.evidenceId,
        sessionUnchanged: true,
      })
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it.each(['not-met', 'inconclusive'] as const)('accepts an attested %s verdict from a successful terminal verifier result', async verdict => {
    const harness = await mount([
      toolCallResponse('call-terminal-not-met', 'verify_summary', { text: 'not met' }),
      textResponse('terminal verifier completed'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-terminal-not-met-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'verify terminal not-met outcome' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const events = structuredClone(handle.agent.session.events)
      const result = events.find(event => event.type === 'tool/result')!
      if (result.type !== 'tool/result') throw new Error('expected verifier result')
      result.data.message.content[0].isError = false
      delete (result.data as { error?: unknown }).error
      const session = fakeSession(`outcome-terminal-not-met-copy-${randomUUID()}`)
      const binding = harness.ctx.tianwenLearningIntake.bindRun(
        session,
        bindingInput('terminal-not-met'),
      )
      setEvents(session, events)
      const evidence = harness.ctx.tianwenEvidence.project(session)
        .find(record => record.action.toolName === 'verify_summary')!

      expect(harness.ctx.tianwenLearningIntake.consumeOutcome(
        session,
        binding.runId,
        { verdict, acceptanceEvidenceId: evidence.evidenceId },
      )).toMatchObject({
        decision: verdict === 'not-met' ? 'signal-recorded' : 'continue-observing',
        acceptanceEvidenceId: evidence.evidenceId,
        sessionUnchanged: true,
      })
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('rejects a newer unmatched Turn boundary before writing', async () => {
    const harness = await mount([
      toolCallResponse('call-open', 'verify_summary', { text: 'open' }),
      textResponse('older result completed'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`outcome-open-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const binding = harness.ctx.tianwenLearningIntake.bindRun(
      handle.agent.session,
      bindingInput('open'),
    )
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'verify open boundary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      handle.agent.session.append('turn/start', { turn: 2 })
      const write = vi.spyOn(harness.ctx.tianwenEvolution, 'recordOutcomeIntake')
      expect(() => harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )).toThrow(/terminal Turn/i)
      expect(write).not.toHaveBeenCalled()
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })
})
