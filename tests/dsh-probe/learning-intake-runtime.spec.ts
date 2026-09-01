import { createHash, randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DynamicCordisRunnerService,
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  isSkillName,
  mountCoreHarness,
  renderSkillContent,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type {
  Session,
  SessionEvent,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillRegistration,
} from '@tianwen/dsh-compat'
import {
  PUBLIC_LEDGER_EVENT_TYPES,
} from '../../packages/tianwen-evolution/src/index.js'
import type { LedgerEvent } from '../../packages/tianwen-evolution/src/index.js'
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

function digest(events: readonly SessionEvent[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8')
    .digest('hex')}`
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

function finalAssistantForTurn(
  events: readonly SessionEvent[],
  turn: number,
): SessionEvent<'assistant/message'> {
  const turnEnd = events.find(event => event.type === 'turn/end'
    && event.data.turn === turn
    && event.data.reason.kind === 'completed')
  const event = events.findLast(candidate =>
    candidate.type === 'assistant/message'
    && candidate.surfaceOp === 'append'
    && candidate.data.turn === turn
    && candidate.data.message.content.length > 0
    && turnEnd?.type === 'turn/end'
    && candidate.seq < turnEnd.seq)
  if (event?.type !== 'assistant/message') {
    throw new Error(`scripted run did not complete assistant turn ${turn}`)
  }
  return event
}

function replaceEvent(
  session: Session,
  original: SessionEvent,
  replacement: SessionEvent,
): Session {
  const events = session.events.map(event =>
    event.seq === original.seq ? replacement : event)
  return new Proxy(session, {
    get(target, property, receiver) {
      return property === 'events'
        ? events
        : Reflect.get(target, property, receiver)
    },
  })
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

async function mountCompletedSessions(count = 1, turnsPerSession = 1) {
  const script = Array.from({ length: count * turnsPerSession }, (_, index) => [
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
    for (let turn = 0; turn < turnsPerSession; turn += 1) {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: `run echo ${index}:${turn}` }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
    }
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
    expect(Object.isFrozen(PUBLIC_LEDGER_EVENT_TYPES)).toBe(true)
    expect(PUBLIC_LEDGER_EVENT_TYPES).toEqual([
      'artifact-recorded',
      'evaluation-recorded',
      'approval-recorded',
      'promoted',
      'rolled-back',
      'runtime-bound',
      'activation-failed',
      'recovery-failed',
    ])
    expect(isSkillName('research-summary')).toBe(true)
    expect(typeof renderSkillContent).toBe('function')
    expect(typeof applySkillTool).toBe('function')
    expect(typeof SkillRegistry).toBe('function')
    const typeWitness: [
      SkillDefinition?,
      SkillInvocationPolicy?,
      SkillRegistration?,
    ] = []
    expect(typeWitness).toEqual([])

    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const ctx = mounted.harness.ctx
      const run = ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:public-boundary',
        taskRef: 'task:public-boundary',
        sessionId: 'session:public-boundary',
        scopeKey: 'project:tianwen/capability:public-boundary',
        acceptanceContract: {
          source: 'dsh-tool-result',
          toolName: 'verify_summary',
          notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
          gapDisposition: 'observe',
        },
      })
      ctx.tianwenEvolution.recordOutcomeIntake({
        runId: run.runId,
        verdict: 'met',
        sessionDigest: `sha256:${'1'.repeat(64)}`,
        evidenceIds: [`sha256:${'2'.repeat(64)}`],
      })
      expect(JSON.stringify(ctx.tianwenEvolution.listEvents()))
        .not.toContain('run-binding-recorded')
      expect(JSON.stringify(ctx.tianwenEvolution.listEvents()))
        .not.toContain('outcome-intake-recorded')

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
      expect(JSON.stringify(mounted.harness.ctx.tianwenEvolution.listEvents()))
        .not.toContain('Preserve the tool result in the final answer.')
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
      )).toThrow(/finalized append-origin assistant message/i)
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals())
        .toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets())
        .toEqual([])
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('consumes the first finalized assistant message after a later Turn exists without changing Session or Evidence', async () => {
    const mounted = await mountCompletedSessions(1, 2)
    const [handle] = mounted.handles
    try {
      const session = handle!.agent.session
      const completedTurns = session.events
        .filter(event => event.type === 'turn/end'
          && event.data.reason.kind === 'completed')
        .map(event => event.data.turn)
      expect(completedTurns).toHaveLength(2)
      const first = finalAssistantForTurn(session.events, completedTurns[0]!)
      const second = finalAssistantForTurn(session.events, completedTurns[1]!)
      expect(first.data.message.id).not.toBe(second.data.message.id)

      const beforeDigest = digest(session.events)
      const beforeEvidence = structuredClone(
        mounted.harness.ctx.tianwenEvidence.project(session),
      )
      const snapshot = feedback(String(first.data.message.id))
      const receipt = mounted.harness.ctx.tianwenLearningIntake.consume(
        session,
        'project:tianwen/capability:research-summary',
        snapshot,
      )

      expect(receipt).toMatchObject({
        decision: 'ticket-created',
        duplicate: false,
        sessionUnchanged: true,
      })
      expect(mounted.harness.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        String(first.data.message.id),
      )).toMatchObject({
        messageId: String(first.data.message.id),
        feedbackVersion: snapshot.version,
        state: 'active',
      })
      expect(digest(session.events)).toBe(beforeDigest)
      expect(mounted.harness.ctx.tianwenEvidence.project(session))
        .toEqual(beforeEvidence)
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('rejects missing, non-assistant, empty, and replacement-origin targets before ledger write', async () => {
    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const events = handle!.agent.session.events
      const finalMessage = finalAssistant(events)
      const userMessage = events.find(event => event.type === 'user/message')
      if (userMessage?.type !== 'user/message') {
        throw new Error('scripted run did not produce comparison messages')
      }

      for (const messageId of [
        'missing-assistant-message',
        String(userMessage.data.id),
      ]) {
        expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
          handle!.agent.session,
          'project:tianwen/capability:research-summary',
          feedback(messageId),
        )).toThrow(/finalized append-origin assistant message/i)
      }

      const empty = structuredClone(finalMessage)
      empty.data.message.content = []
      const replacement = structuredClone(finalMessage)
      replacement.surfaceOp = { op: 'replace', start: 0, end: 0 }
      for (const candidate of [empty, replacement]) {
        expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
          replaceEvent(handle!.agent.session, finalMessage, candidate),
          'project:tianwen/capability:research-summary',
          feedback(String(finalMessage.data.message.id)),
        )).toThrow(/finalized append-origin assistant message/i)
      }
      expect(mounted.harness.ctx.tianwenEvolution.listLearningSignals())
        .toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listLearningTickets())
        .toEqual([])
    } finally {
      await disposeMounted(mounted)
    }
  })

  it('passes exact supersession and captured consent revision to the v2 ledger write', async () => {
    const mounted = await mountCompletedSessions()
    const [handle] = mounted.handles
    try {
      const session = handle!.agent.session
      const messageId = String(finalAssistant(session.events).data.message.id)
      mounted.harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1,
        enabled: true,
        policyVersion: 'tianwen-auto-analysis.v1',
      })
      const first = {
        ...feedback(messageId),
        analysisConsentRevision: 1,
      }
      const second = {
        ...first,
        note: 'Use the exact persisted result.',
        version: '22222222-2222-4222-8222-222222222222',
        supersedesFeedbackVersion: first.version,
      }

      expect(mounted.harness.ctx.tianwenLearningIntake.consume(
        session,
        'project:tianwen/capability:research-summary',
        first,
      ).duplicate).toBe(false)
      expect(mounted.harness.ctx.tianwenLearningIntake.consume(
        session,
        'project:tianwen/capability:research-summary',
        second,
      ).duplicate).toBe(false)
      expect(mounted.harness.ctx.tianwenLearningIntake.consume(
        session,
        'project:tianwen/capability:research-summary',
        second,
      ).duplicate).toBe(true)
      expect(() => mounted.harness.ctx.tianwenLearningIntake.consume(
        session,
        'project:tianwen/capability:research-summary',
        {
          ...second,
          analysisConsentRevision: undefined,
        },
      )).toThrow(/replay changed content/i)
      expect(mounted.harness.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        messageId,
      )).toMatchObject({
        feedbackVersion: second.version,
        state: 'active',
      })
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
      vi.spyOn(
        mounted.harness.ctx.tianwenEvolution,
        'recordLearningFeedbackRevision',
      )
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
