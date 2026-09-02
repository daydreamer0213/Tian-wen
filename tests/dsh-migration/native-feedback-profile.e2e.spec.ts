import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { MessageId } from '@deepseek-ai/dsh-llm'
import type { MessageFeedbackItem } from '@deepseek-ai/dsh-message-feedback'
import {
  deriveEventMessage,
  isAppendSurfaceEvent,
  type SessionEvent,
} from '@deepseek-ai/dsh-session'
import {
  CallId,
  SessionId,
  createUserMessage,
  mountFeedbackHarness,
  textResponse,
} from '@tianwen/dsh-compat'
import type { Agent } from '@tianwen/dsh-compat'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apply as applyRuntimeBundle } from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const fixtureBase = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
  'native-feedback-profile',
)
const roots: string[] = []

function profileRoot(prefix: string): string {
  mkdirSync(fixtureBase, { recursive: true })
  const root = mkdtempSync(join(fixtureBase, `${prefix}-`))
  roots.push(root)
  return root
}

async function mountProfile(
  root: string,
  script: ReturnType<typeof textResponse>[],
) {
  const mounted = await mountFeedbackHarness(root, script)
  await applyRuntimeBundle(mounted.ctx, {
    stateRoot: join(root, 'state'),
    sessionsRoot: join(root, 'sessions'),
    evolutionRoot: join(root, 'evolution'),
  })
  return mounted
}

async function ask(
  agent: Agent,
  prompt: string,
): Promise<void> {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
}

function requestText(request: {
  readonly messages: readonly {
    readonly content: readonly { readonly type: string, readonly text?: string }[]
  }[]
}): string {
  return request.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n')
}

function finalizedAssistantMessageIds(
  events: readonly SessionEvent[],
): readonly MessageId[] {
  return events.flatMap(event => {
    if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) {
      return []
    }
    const message = deriveEventMessage(event)
    return message?.role === 'assistant' && message.content.length > 0
      ? [message.id]
      : []
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('native DSH Message Feedback profile learning intake', () => {
  it('reconciles native feedback revisions and retraction across a Runtime restart without duplicates', async () => {
    const root = profileRoot('lifecycle')
    mkdirSync(join(root, 'workspace'), { recursive: true })
    const first = await mountProfile(root, [
      textResponse('First ordinary answer.'),
      textResponse('Second ordinary answer.'),
      textResponse('Consent notice acknowledged.'),
    ])
    const sessionId = SessionId('native-feedback-main')
    const main = await first.ctx.agents.create({
      sessionId,
      meta: { cwd: join(root, 'workspace'), agentPreset: 'standard' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    let dshBeforeRestart!: Awaited<ReturnType<typeof first.ctx.messageFeedback.list>>
    let statusesBeforeRestart!: ReturnType<
      typeof first.ctx.tianwenEvolution.listLearningIntakeStatuses
    >
    let signalsBeforeRestart!: ReturnType<
      typeof first.ctx.tianwenEvolution.listLearningSignals
    >
    let ticketsBeforeRestart!: ReturnType<
      typeof first.ctx.tianwenEvolution.listLearningTickets
    >

    try {
      expect('goals' in first.ctx).toBe(false)
      expect(first.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(sessionId))).toBeUndefined()
      for (const prompt of ['First question.', 'Second question.']) {
        await ask(main.agent, prompt)
      }
      const [firstMessageId, secondMessageId] = finalizedAssistantMessageIds(
        main.agent.session.events,
      )
      expect(firstMessageId).toBeDefined()
      expect(secondMessageId).toBeDefined()

      const createdFirst = await first.ctx.messageFeedback.put({
        sessionId,
        messageId: firstMessageId!,
        rating: 'negative',
        note: 'Keep the first answer concrete.',
        ifVersion: null,
      })
      const createdSecond = await first.ctx.messageFeedback.put({
        sessionId,
        messageId: secondMessageId!,
        rating: 'negative',
        note: 'Keep the second answer concise.',
        ifVersion: null,
      })
      expect(createdFirst.ok).toBe(true)
      expect(createdSecond.ok).toBe(true)
      if (!createdFirst.ok || !createdSecond.ok) {
        throw new Error('native feedback create failed')
      }
      await vi.waitFor(() => expect(first.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(sessionId))).toHaveLength(2))

      const updatedFirst = await first.ctx.messageFeedback.put({
        sessionId,
        messageId: firstMessageId!,
        rating: 'negative',
        note: 'Keep the first answer concrete and cite the evidence.',
        ifVersion: createdFirst.value.version,
      })
      expect(updatedFirst.ok).toBe(true)
      if (!updatedFirst.ok) throw new Error('native feedback update failed')
      await vi.waitFor(() => expect(first.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(sessionId), String(firstMessageId))
        ?.feedbackVersion).toBe(String(updatedFirst.value.version)))
      const updatedSidecar = await first.ctx.messageFeedback.list({ sessionId })
      expect(updatedSidecar.ok).toBe(true)
      if (!updatedSidecar.ok) throw new Error('native feedback list failed')
      expect(updatedSidecar.value.items[0]).toMatchObject({
        messageId: firstMessageId,
        note: 'Keep the first answer concrete and cite the evidence.',
        version: updatedFirst.value.version,
      })

      const removedFirst = await first.ctx.messageFeedback.delete({
        sessionId,
        messageId: firstMessageId!,
        ifVersion: updatedFirst.value.version,
      })
      expect(removedFirst).toEqual({ ok: true, value: { absent: true } })
      await vi.waitFor(() => expect(first.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(sessionId), String(firstMessageId))
        ?.state).toBe('retracted'))

      dshBeforeRestart = await first.ctx.messageFeedback.list({ sessionId })
      expect(dshBeforeRestart).toEqual({
        ok: true,
        value: { items: [createdSecond.value] },
      })
      statusesBeforeRestart = first.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(sessionId))
      signalsBeforeRestart = first.ctx.tianwenEvolution.listLearningSignals()
      ticketsBeforeRestart = first.ctx.tianwenEvolution.listLearningTickets()
      expect(signalsBeforeRestart).toHaveLength(3)
      expect(ticketsBeforeRestart).toHaveLength(3)
      expect(signalsBeforeRestart.filter(signal =>
        'active' in signal && signal.active).map(signal => signal.messageId))
        .toEqual([String(secondMessageId)])
      expect(statusesBeforeRestart.map(status => ({
        messageId: status.messageId,
        state: status.state,
        feedbackVersion: status.feedbackVersion,
      }))).toEqual([
        {
          messageId: String(firstMessageId),
          state: 'retracted',
          feedbackVersion: String(updatedFirst.value.version),
        },
        {
          messageId: String(secondMessageId),
          state: 'active',
          feedbackVersion: String(createdSecond.value.version),
        },
      ])
      expect(new Set(signalsBeforeRestart.map(signal => signal.signalId)).size)
        .toBe(signalsBeforeRestart.length)
      expect(new Set(ticketsBeforeRestart.map(ticket => ticket.ticketId)).size)
        .toBe(ticketsBeforeRestart.length)
    } finally {
      await main.dispose()
      await first.ctx.fiber.dispose()
    }

    const restarted = await mountProfile(root, [])
    try {
      const listed = await restarted.ctx.messageFeedback.list({ sessionId })
      expect(listed).toEqual(dshBeforeRestart)
      if (!listed.ok) throw new Error('native feedback reload failed')
      const [surviving] = listed.value.items
      expect(surviving).toMatchObject({
        messageId: expect.any(String),
        rating: 'negative',
        note: 'Keep the second answer concise.',
      } satisfies Partial<MessageFeedbackItem>)
      expect(restarted.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(sessionId)))
        .toEqual(statusesBeforeRestart)
      const signals = restarted.ctx.tianwenEvolution.listLearningSignals()
      const tickets = restarted.ctx.tianwenEvolution.listLearningTickets()
      expect(signals).toEqual(signalsBeforeRestart)
      expect(tickets).toEqual(ticketsBeforeRestart)
      expect(new Set(signals.map(signal => signal.signalId)).size)
        .toBe(signals.length)
      expect(new Set(tickets.map(ticket => ticket.ticketId)).size)
        .toBe(tickets.length)
    } finally {
      await restarted.ctx.fiber.dispose()
    }
  })

  it('recovers one Evolution write failure from the DSH sidecar without changing feedback', async () => {
    const root = profileRoot('write-recovery')
    mkdirSync(join(root, 'workspace'), { recursive: true })
    const first = await mountProfile(root, [textResponse('Ordinary answer.')])
    const sessionId = SessionId('native-feedback-write-recovery')
    const main = await first.ctx.agents.create({
      sessionId,
      meta: { cwd: join(root, 'workspace'), agentPreset: 'standard' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    let persisted!: MessageFeedbackItem

    try {
      await ask(main.agent, 'Give one ordinary answer.')
      const [messageId] = finalizedAssistantMessageIds(main.agent.session.events)
      expect(messageId).toBeDefined()
      const write = vi.spyOn(
        first.ctx.tianwenEvolution,
        'recordLearningFeedbackRevision',
      ).mockImplementationOnce(() => {
        throw new Error('forced Evolution write failure after DSH persistence')
      })

      const created = await first.ctx.messageFeedback.put({
        sessionId,
        messageId: messageId!,
        rating: 'negative',
        note: 'Persist this correction before learning intake.',
        ifVersion: null,
      })
      expect(created.ok).toBe(true)
      if (!created.ok) throw new Error('native feedback create failed')
      persisted = structuredClone(created.value)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
      expect(await first.ctx.messageFeedback.list({ sessionId })).toEqual({
        ok: true,
        value: { items: [persisted] },
      })
      expect(first.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(sessionId),
        String(messageId),
      )).toBeUndefined()
    } finally {
      await main.dispose()
      await first.ctx.fiber.dispose()
    }

    const restarted = await mountProfile(root, [])
    try {
      expect(await restarted.ctx.messageFeedback.list({ sessionId })).toEqual({
        ok: true,
        value: { items: [persisted] },
      })
      await vi.waitFor(() => expect(restarted.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(sessionId)))
        .toMatchObject([{ state: 'active' }]))
      expect(restarted.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(1)
      expect(restarted.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)
    } finally {
      await restarted.ctx.fiber.dispose()
    }
  })

  it('keeps an old private note out of model requests when consent is enabled later', async () => {
    const root = profileRoot('historical-privacy')
    mkdirSync(join(root, 'workspace'), { recursive: true })
    const privateNote = 'PRIVATE HISTORICAL NOTE MUST NOT ENTER A MODEL REQUEST'
    const mounted = await mountProfile(root, [
      textResponse('Ordinary answer.'),
      textResponse('Consent notice acknowledged.'),
      textResponse('Ordinary answer after consent.'),
    ])
    const sessionId = SessionId('native-feedback-historical-privacy')
    const main = await mounted.ctx.agents.create({
      sessionId,
      meta: { cwd: join(root, 'workspace'), agentPreset: 'standard' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })

    try {
      await ask(main.agent, 'Give an answer before analysis consent.')
      const [messageId] = finalizedAssistantMessageIds(main.agent.session.events)
      expect(messageId).toBeDefined()
      const created = await mounted.ctx.messageFeedback.put({
        sessionId,
        messageId: messageId!,
        rating: 'negative',
        note: privateNote,
        ifVersion: null,
      })
      expect(created.ok).toBe(true)
      await vi.waitFor(() => expect(mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v1')?.state)
        .toBe('delivered'))
      expect(mounted.adapter.requests).toHaveLength(2)
      expect(mounted.adapter.requests.map(requestText).join('\n'))
        .not.toContain(privateNote)
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(sessionId),
        String(messageId),
      )).not.toHaveProperty('analysisConsentRevision')

      const enabled = await mounted.ctx.tools.execute({
        callId: CallId('native-feedback-enable-consent'),
        name: 'tianwen_learning_consent',
        arguments: { action: 'enable' },
        agent: main.agent,
        signal: new AbortController().signal,
      })
      expect(enabled).toMatchObject({
        isError: false,
        value: { enabled: true, revision: 1 },
      })
      const requestsBeforeReconcile = mounted.adapter.requests.length
      await expect(mounted.ctx.tianwenMessageFeedbackBridge
        .reconcileSession(String(sessionId)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(mounted.adapter.requests).toHaveLength(requestsBeforeReconcile)
      await ask(main.agent, 'Continue after consent without analyzing old feedback.')

      expect(mounted.ctx.agents.list().map(agent => String(agent.session.id)))
        .toEqual([String(sessionId)])
      expect(mounted.adapter.requests.map(requestText).join('\n'))
        .not.toContain(privateNote)
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(sessionId),
        String(messageId),
      )).not.toHaveProperty('analysisConsentRevision')
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })
})
