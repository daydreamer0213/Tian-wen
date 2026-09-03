import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { MessageId } from '@deepseek-ai/dsh-llm'
import type {
  MessageFeedbackItem,
  MessageFeedbackListRequest,
  MessageFeedbackListResult,
} from '@deepseek-ai/dsh-message-feedback'
import {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appendFault = vi.hoisted(() => ({
  enabled: false,
  failLedgerFsyncAfterReal: 0,
  failLedgerWriteBeforeReal: 0,
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      if (appendFault.enabled) paths.set(descriptor, String(path))
      return descriptor
    },
    writeSync(
      descriptor: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position?: number | null,
    ) {
      if (
        appendFault.enabled
        && appendFault.failLedgerWriteBeforeReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerWriteBeforeReal -= 1
        throw Object.assign(new Error('forced pre-write ledger failure'), {
          code: 'EIO',
        })
      }
      return actual.writeSync(descriptor, buffer, offset, length, position)
    },
    fsyncSync(descriptor: number) {
      actual.fsyncSync(descriptor)
      if (
        appendFault.enabled
        && appendFault.failLedgerFsyncAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerFsyncAfterReal -= 1
        throw Object.assign(new Error('forced post-fsync ledger uncertainty'), {
          code: 'EIO',
        })
      }
    },
  }
})

import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  TianwenMessageFeedbackBridgeService,
} from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import {
  TianwenLearningConsentAgentService,
} from '../../packages/tianwen-runtime-bundle/src/learning-consent-agent.js'
import { apply as applyRuntimeBundle } from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const roots: string[] = []

function evolutionRoot(prefix: string): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-message-feedback-bridge-tests'
    : resolve('tmp/tianwen-message-feedback-bridge-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, `${prefix}-`))
  roots.push(root)
  return root
}

function nextTurn(): Promise<void> {
  return new Promise(resolveTurn => setImmediate(resolveTurn))
}

function deferred(): {
  readonly promise: Promise<void>
  readonly resolve: () => void
} {
  let resolvePromise!: () => void
  const promise = new Promise<void>(resolve => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

function completedSession(
  id: string,
  messageIds: readonly string[],
  cwd?: string,
  createdAt = 1,
  lineage?: {
    readonly origin: 'subagent'
    readonly parentSession?: string
    readonly delegationDepth?: number
  },
): Session {
  const sessionId = SessionId(id)
  const session = Session.create(sessionId, [], {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt,
    ...(cwd === undefined ? {} : { cwd }),
    ...(lineage === undefined ? {} : {
      origin: lineage.origin,
      ...(lineage.parentSession === undefined
        ? {}
        : { parentSession: SessionId(lineage.parentSession) }),
      ...(lineage.delegationDepth === undefined
        ? {}
        : { delegationDepth: lineage.delegationDepth }),
    }),
  })
  for (const [index, messageId] of messageIds.entries()) {
    session.append('assistant/message', {
      turn: index + 1,
      message: {
        id: MessageId(messageId),
        role: 'assistant',
        content: [{ type: 'text', text: `answer-${index + 1}` }],
        source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
      },
    }, { surfaceOp: 'append' })
  }
  return session
}

function item(input: {
  readonly messageId: string
  readonly version: string
  readonly rating?: 'positive' | 'negative'
  readonly note?: string
  readonly updatedAt?: number
}): MessageFeedbackItem {
  const updatedAt = input.updatedAt ?? 2
  return {
    messageId: MessageId(input.messageId),
    rating: input.rating ?? 'negative',
    ...(input.note === undefined ? {} : { note: input.note }),
    version: input.version as MessageFeedbackItem['version'],
    createdAt: updatedAt,
    updatedAt,
  }
}

class SessionCatalog {
  readonly sessions = new Map<string, Session>()
  listed: readonly string[] | undefined
  failList = 0

  add(session: Session): void {
    this.sessions.set(String(session.id), session)
  }

  async list() {
    if (this.failList > 0) {
      this.failList -= 1
      throw new Error('forced private startup catalog failure')
    }
    const ids = this.listed ?? [...this.sessions.keys()]
    return ids.map(id => this.sessions.get(id)!.header)
  }

  async inspect(id: ReturnType<typeof SessionId>) {
    const session = this.sessions.get(String(id))
    if (session === undefined) throw new Error('persisted Session is unavailable')
    return { meta: session.header, events: session.events }
  }
}

class FeedbackCatalog {
  readonly rows = new Map<string, readonly MessageFeedbackItem[]>()
  readonly calls: string[] = []
  active = 0
  maxActive = 0
  waitForList: Promise<void> | undefined

  set(sessionId: string, items: readonly MessageFeedbackItem[]): void {
    this.rows.set(sessionId, items)
  }

  async list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult> {
    const sessionId = String(request.sessionId)
    const snapshot = structuredClone(this.rows.get(sessionId) ?? [])
    this.calls.push(sessionId)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      await this.waitForList
      return {
        ok: true,
        value: { items: snapshot },
      }
    } finally {
      this.active -= 1
    }
  }
}

async function mountBridge(
  root: string,
  sessions: SessionCatalog,
  feedback: FeedbackCatalog,
  options: { readonly learningConsent?: boolean } = {},
) {
  const ctx = new Context()
  ctx.provide('sessionPersistence', sessions)
  ctx.provide('messageFeedback', feedback)
  if (options.learningConsent === true) {
    ctx.provide('agents', {
      list: () => [],
      get: () => undefined,
    } as never)
    ctx.provide('sessions', {
      flush: async () => true,
    } as never)
  }
  await applyCore(ctx, { evolutionRoot: root })
  if (options.learningConsent === true) {
    await ctx.plugin(TianwenLearningConsentAgentService)
  }
  const fiber = ctx.plugin(TianwenMessageFeedbackBridgeService)
  await fiber
  return {
    ctx,
    fiber,
    bridge: ctx.tianwenMessageFeedbackBridge,
  }
}

function feedbackLedgerEvents(root: string): readonly Record<string, unknown>[] {
  const source = readFileSync(join(root, 'ledger.jsonl'), 'utf8').trim()
  return source.length === 0
    ? []
    : source.split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .filter(event => event.type === 'learning-intake-recorded')
}

function emitFeedbackChange(ctx: Context, sessionId: string): void {
  ctx.emit('domain/changed', {
    domain: 'message_feedback',
    table: 'sessions',
    key: sessionId,
    operation: 'put',
    value: {},
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  appendFault.enabled = false
  appendFault.failLedgerFsyncAfterReal = 0
  appendFault.failLedgerWriteBeforeReal = 0
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen DSH Message Feedback bridge', () => {
  it('wakes only analyses for the exact changed Tickets, including within one Session', async () => {
    const root = evolutionRoot('ticket-analysis-wake')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const first = completedSession('ticket-wake-a', ['message-a'], 'D:/private/shared')
    const second = completedSession(
      'ticket-wake-b',
      ['message-b', 'message-other'],
      'D:/private/shared',
    )
    const noTicket = completedSession('ticket-wake-no-ticket', ['message-positive'], 'D:/private/other')
    sessions.add(first)
    sessions.add(second)
    sessions.add(noTicket)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    const consent = mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    const updatedAt = Date.parse(consent.recordedAt) + 1
    feedback.set(String(first.id), [item({
      messageId: 'message-a', version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      note: 'Keep the verified result concrete.', updatedAt,
    })])
    await mounted.bridge.reconcileSession(String(first.id))
    const firstStatus = mounted.ctx.tianwenEvolution
      .getLearningIntakeStatus(String(first.id), 'message-a')!
    const requested = mounted.ctx.tianwenEvolution.requestLearningAnalysis({
      ticketId: firstStatus.ticketId!, sessionId: String(first.id), messageId: 'message-a',
      feedbackVersion: firstStatus.feedbackVersion, consentRevision: 1,
      parentSessionId: String(first.id),
    })
    feedback.set(String(second.id), [
      item({
        messageId: 'message-b', version: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        note: 'KEEP THE VERIFIED RESULT CONCRETE.', updatedAt,
      }),
      item({
        messageId: 'message-other', version: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        note: 'Keep citations in source order.', updatedAt,
      }),
    ])
    await mounted.bridge.reconcileSession(String(second.id))
    const secondStatus = mounted.ctx.tianwenEvolution
      .getLearningIntakeStatus(String(second.id), 'message-b')!
    const otherStatus = mounted.ctx.tianwenEvolution
      .getLearningIntakeStatus(String(second.id), 'message-other')!
    expect(secondStatus.ticketId).toBe(firstStatus.ticketId)
    expect(otherStatus.ticketId).not.toBe(firstStatus.ticketId)
    const promoted = { ...requested, phase: 'promoted' as const }
    const unrelated = {
      ...requested,
      analysisId: `analysis:${'e'.repeat(64)}` as const,
      ticketId: otherStatus.ticketId,
      sessionId: String(second.id),
      parentSessionId: String(second.id),
      phase: 'promoted' as const,
    }
    const priorDelivery = {
      analysisId: `analysis:${'d'.repeat(64)}` as const,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
      reportDigest: `sha256:${'1'.repeat(64)}` as const,
      state: 'delivered' as const,
      intentRecordedAt: '2026-09-02T00:00:00.000Z',
      deliveredAt: '2026-09-02T00:00:00.001Z',
      reportMessageId: 'promoted-report',
    }
    const rolledBackWithoutOutcomeReport = {
      ...requested,
      analysisId: priorDelivery.analysisId,
      phase: 'rolled-back' as const,
      terminalReportDelivery: priorDelivery,
    }
    const rolledBackWithOutcomeReport = {
      ...rolledBackWithoutOutcomeReport,
      analysisId: `analysis:${'c'.repeat(64)}` as const,
      terminalReportHistory: [priorDelivery],
      terminalReportDelivery: {
        ...priorDelivery,
        analysisId: `analysis:${'c'.repeat(64)}` as const,
        reportDigest: sha256({
          kind: 'terminal-governed-outcome',
          text: 'Tianwen 分析结论：支持已撤回，已验证回滚至父版本。',
        }),
        reportMessageId: 'rollback-report',
      },
    }
    const rolledBackWithOnlyOutcomeReport = {
      ...rolledBackWithOutcomeReport,
      analysisId: `analysis:${'b'.repeat(64)}` as const,
      terminalReportHistory: undefined,
      terminalReportDelivery: {
        ...rolledBackWithOutcomeReport.terminalReportDelivery,
        analysisId: `analysis:${'b'.repeat(64)}` as const,
      },
    }
    const recoveredWithoutOutcomeReport = {
      ...rolledBackWithoutOutcomeReport,
      analysisId: `analysis:${'a'.repeat(64)}` as const,
      phase: 'transition-recovered' as const,
      promotionTransitionId: `transition:${'a'.repeat(64)}` as const,
    }
    const recoveredWithOutcomeReport = {
      ...recoveredWithoutOutcomeReport,
      analysisId: `analysis:${'9'.repeat(64)}` as const,
      terminalReportDelivery: {
        ...priorDelivery,
        analysisId: `analysis:${'9'.repeat(64)}` as const,
        reportDigest: sha256({
          kind: 'terminal-governed-outcome',
          text: 'Tianwen 分析结论：撤回回滚检查未通过，已恢复尝试前的候选版本；本次不会自动重试，需要人工处理。',
        }),
        reportMessageId: 'recovered-rollback-report',
      },
    }
    const analyses = [
      promoted,
      unrelated,
      rolledBackWithoutOutcomeReport,
      rolledBackWithOutcomeReport,
      rolledBackWithOnlyOutcomeReport,
      recoveredWithoutOutcomeReport,
      recoveredWithOutcomeReport,
    ]
    vi.spyOn(mounted.ctx.tianwenEvolution, 'listLearningAnalyses')
      .mockReturnValue(analyses as never)
    const schedule = vi.fn(async (_analysisId: string) => undefined)
    mounted.ctx.provide('tianwenLearningLoop', { schedule } as never)

    try {
      feedback.set(String(second.id), [
        item({
          messageId: 'message-b', version: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          note: 'Keep the verified result concrete.', updatedAt: updatedAt + 1,
        }),
        item({
          messageId: 'message-other', version: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          note: 'Keep citations in source order.', updatedAt,
        }),
      ])
      await mounted.bridge.reconcileSession(String(second.id))
      await vi.waitFor(() => expect(schedule).toHaveBeenCalledWith(requested.analysisId))
      expect(schedule).toHaveBeenCalledWith(rolledBackWithoutOutcomeReport.analysisId)
      expect(schedule).not.toHaveBeenCalledWith(rolledBackWithOutcomeReport.analysisId)
      expect(schedule).not.toHaveBeenCalledWith(rolledBackWithOnlyOutcomeReport.analysisId)
      expect(schedule).toHaveBeenCalledWith(recoveredWithoutOutcomeReport.analysisId)
      expect(schedule).not.toHaveBeenCalledWith(recoveredWithOutcomeReport.analysisId)
      expect(schedule).not.toHaveBeenCalledWith(unrelated.analysisId)

      schedule.mockClear()
      feedback.set(String(first.id), [])
      await mounted.bridge.reconcileSession(String(first.id))
      await vi.waitFor(() => expect(schedule).toHaveBeenCalledWith(requested.analysisId))
      expect(schedule).not.toHaveBeenCalledWith(unrelated.analysisId)
      expect(mounted.ctx.tianwenEvolution.hasLearningAnalysisActiveSupport(requested.analysisId))
        .toBe(true)

      schedule.mockClear()
      feedback.set(String(second.id), [item({
        messageId: 'message-other', version: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        note: 'Keep citations in source order.', updatedAt,
      })])
      await mounted.bridge.reconcileSession(String(second.id))
      await vi.waitFor(() => expect(schedule).toHaveBeenCalledWith(requested.analysisId))
      expect(schedule).not.toHaveBeenCalledWith(unrelated.analysisId)
      expect(mounted.ctx.tianwenEvolution.hasLearningAnalysisActiveSupport(requested.analysisId))
        .toBe(false)

      schedule.mockClear()
      feedback.set(String(noTicket.id), [item({
        messageId: 'message-positive', version: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        rating: 'positive', updatedAt,
      })])
      await mounted.bridge.reconcileSession(String(noTicket.id))
      await new Promise(resolve => setImmediate(resolve))
      expect(schedule).not.toHaveBeenCalled()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reconciles two messages, exact replay, supersession, and retraction from durable domain changes', async () => {
    const root = evolutionRoot('lifecycle')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-lifecycle', ['message-1', 'message-2'], 'D:/private/workspace')
    sessions.add(session)
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      feedback.set(String(session.id), [
        item({
          messageId: 'message-1',
          version: '11111111-1111-4111-8111-111111111111',
          note: 'Keep the result concrete.',
        }),
        item({
          messageId: 'message-2',
          version: '22222222-2222-4222-8222-222222222222',
          rating: 'positive',
        }),
      ])
      emitFeedbackChange(mounted.ctx, String(session.id))
      await vi.waitFor(() => expect(
        mounted.ctx.tianwenEvolution.listLearningIntakeStatuses(String(session.id)),
      ).toHaveLength(2))

      const beforeReplay = feedbackLedgerEvents(root).length
      emitFeedbackChange(mounted.ctx, String(session.id))
      await vi.waitFor(() => expect(feedback.calls.length).toBeGreaterThanOrEqual(3))
      expect(feedbackLedgerEvents(root)).toHaveLength(beforeReplay)

      feedback.set(String(session.id), [
        item({
          messageId: 'message-1',
          version: '33333333-3333-4333-8333-333333333333',
          note: 'Keep the result concrete and cite the evidence.',
          updatedAt: 3,
        }),
        item({
          messageId: 'message-2',
          version: '22222222-2222-4222-8222-222222222222',
          rating: 'positive',
        }),
      ])
      emitFeedbackChange(mounted.ctx, String(session.id))
      await vi.waitFor(() => expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1'))
        .toMatchObject({
          state: 'active',
          feedbackVersion: '33333333-3333-4333-8333-333333333333',
        }))
      expect(mounted.ctx.tianwenEvolution.listLearningSignals()
        .filter(signal => 'messageId' in signal && signal.messageId === 'message-1')
        .map(signal => 'active' in signal ? signal.active : true))
        .toEqual([false, true])

      feedback.set(String(session.id), [
        item({
          messageId: 'message-2',
          version: '22222222-2222-4222-8222-222222222222',
          rating: 'positive',
        }),
      ])
      emitFeedbackChange(mounted.ctx, String(session.id))
      await vi.waitFor(() => expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1')?.state)
        .toBe('retracted'))
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-2')?.state)
        .toBe('active')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps DSH feedback after an Evolution failure and retries only on a later trigger', async () => {
    const root = evolutionRoot('write-failure')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const rawCwd = 'D:/private/customer/project'
    const privateNote = 'Do not expose this private correction.'
    const session = completedSession('feedback-write-failure', ['message-1'], rawCwd)
    sessions.add(session)
    const mounted = await mountBridge(root, sessions, feedback)
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '44444444-4444-4444-8444-444444444444',
      note: privateNote,
    })])
    vi.spyOn(mounted.ctx.tianwenEvolution, 'recordLearningFeedbackRevision')
      .mockImplementationOnce(() => {
        throw new Error(`forced failure: ${rawCwd}: ${privateNote}`)
      })

    try {
      const pending = await mounted.bridge.reconcileSession(String(session.id))
      expect(pending).toMatchObject({ state: 'pending', sessionId: String(session.id) })
      expect(JSON.stringify(pending)).not.toContain(rawCwd)
      expect(JSON.stringify(pending)).not.toContain(privateNote)
      expect(feedback.rows.get(String(session.id))).toHaveLength(1)
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1'))
        .toBeUndefined()
      const callsAfterFailure = feedback.calls.length
      await nextTurn()
      await nextTurn()
      expect(feedback.calls).toHaveLength(callsAfterFailure)

      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1')?.state)
        .toBe('active')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('retries a definitely uncommitted feedback ingestion and retraction without blocking Evolution', async () => {
    const root = evolutionRoot('pre-write-retry')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-pre-write-retry', ['message-1'])
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '43434343-4343-4434-8434-434343434343',
      note: 'Retry only after the write is known not to have happened.',
    })])

    try {
      appendFault.enabled = true
      appendFault.failLedgerWriteBeforeReal = 1
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution.blocked).toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        'message-1',
      )).toBeUndefined()
      expect(feedback.rows.get(String(session.id))).toHaveLength(1)

      appendFault.enabled = false
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', active: 1 })
      expect(mounted.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(1)
      expect(mounted.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)

      feedback.set(String(session.id), [])
      appendFault.enabled = true
      appendFault.failLedgerWriteBeforeReal = 1
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution.blocked).toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        'message-1',
      )).toMatchObject({ state: 'active' })

      appendFault.enabled = false
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', retracted: 1 })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        'message-1',
      )).toMatchObject({ state: 'retracted' })
      expect(mounted.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(1)
      expect(mounted.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('blocks a feedback reconciliation when a landed append cannot be re-fsynced', async () => {
    const root = evolutionRoot('feedback-resync-failure')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-resync-failure', ['message-1'])
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '45454545-4545-4454-8454-454545454545',
      note: 'Do not retry a write whose durable state cannot be proven.',
    })])

    try {
      appendFault.enabled = true
      appendFault.failLedgerFsyncAfterReal = 2
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution.blocked).toBe(true)
      expect(feedbackLedgerEvents(root)).toHaveLength(1)

      appendFault.enabled = false
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(feedbackLedgerEvents(root)).toHaveLength(1)
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reconciles a changed revision at restart and leaves exact startup replay idempotent', async () => {
    const root = evolutionRoot('restart')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-restart', ['message-1'], 'D:/restart/workspace')
    sessions.add(session)
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '55555555-5555-4555-8555-555555555555',
      note: 'First revision.',
    })])

    const first = await mountBridge(root, sessions, feedback)
    expect(first.ctx.tianwenEvolution
      .getLearningIntakeStatus(String(session.id), 'message-1')?.feedbackVersion)
      .toBe('55555555-5555-4555-8555-555555555555')
    await first.ctx.fiber.dispose()

    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '66666666-6666-4666-8666-666666666666',
      note: 'Second revision.',
      updatedAt: 3,
    })])
    const second = await mountBridge(root, sessions, feedback)
    expect(second.ctx.tianwenEvolution
      .getLearningIntakeStatus(String(session.id), 'message-1')?.feedbackVersion)
      .toBe('66666666-6666-4666-8666-666666666666')
    expect(feedbackLedgerEvents(root)).toHaveLength(2)
    await second.ctx.fiber.dispose()

    const third = await mountBridge(root, sessions, feedback)
    try {
      expect(feedbackLedgerEvents(root)).toHaveLength(2)
      expect(third.ctx.tianwenEvolution.listLearningSignals()
        .filter(signal => 'messageId' in signal && signal.messageId === 'message-1'))
        .toHaveLength(2)
    } finally {
      await third.ctx.fiber.dispose()
    }
  })

  it('fails closed when a restarted host sees a reused Session id lifecycle', async () => {
    const root = evolutionRoot('restart-session-id-reuse')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const sessionId = 'feedback-restart-session-id-reuse'
    const first = completedSession(
      sessionId,
      ['message-old'],
      'D:/private/old-workspace',
      1,
    )
    sessions.add(first)
    feedback.set(sessionId, [item({
      messageId: 'message-old',
      version: '16161616-1616-4616-8616-161616161616',
      note: 'Old lifecycle correction.',
    })])

    const initial = await mountBridge(root, sessions, feedback)
    expect(initial.ctx.tianwenEvolution
      .getLearningIntakeStatus(sessionId, 'message-old'))
      .toMatchObject({
        state: 'active',
        sessionLifecycleFingerprint: expect.stringMatching(
          /^sha256:[0-9a-f]{64}$/u,
        ),
      })
    await initial.ctx.fiber.dispose()

    const replacement = completedSession(
      sessionId,
      ['message-old', 'message-new'],
      'D:/private/new-workspace',
      2,
    )
    sessions.add(replacement)
    feedback.set(sessionId, [])
    const restarted = await mountBridge(root, sessions, feedback)

    try {
      expect(restarted.ctx.tianwenEvolution
        .getLearningIntakeStatus(sessionId, 'message-old')?.state)
        .toBe('active')
      await expect(restarted.bridge.reconcileSession(sessionId))
        .resolves.toMatchObject({ state: 'pending' })

      feedback.set(sessionId, [item({
        messageId: 'message-old',
        version: '17171717-1717-4717-8717-171717171717',
        note: 'Must not supersede the old lifecycle correction.',
        updatedAt: 3,
      }), item({
        messageId: 'message-new',
        version: '21212121-2121-4121-8121-212121212121',
        note: 'New lifecycle correction.',
        updatedAt: 3,
      })])
      await expect(restarted.bridge.reconcileSession(sessionId))
        .resolves.toMatchObject({ state: 'pending' })
      expect(restarted.ctx.tianwenEvolution
        .getLearningIntakeStatus(sessionId, 'message-old'))
        .toMatchObject({
          state: 'active',
          feedbackVersion: '16161616-1616-4616-8616-161616161616',
        })
      expect(restarted.ctx.tianwenEvolution
        .getLearningIntakeStatus(sessionId, 'message-new'))
        .toBeUndefined()
    } finally {
      await restarted.ctx.fiber.dispose()
    }
  })

  it('does not guess the lifecycle of legacy feedback history', async () => {
    const root = evolutionRoot('legacy-session-lifecycle')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-legacy-session-lifecycle',
      ['message-1'],
      'D:/private/legacy-workspace',
      1,
    )
    sessions.add(session)
    sessions.listed = []
    feedback.set(String(session.id), [])
    const mounted = await mountBridge(root, sessions, feedback)
    mounted.ctx.tianwenEvolution.recordLearningIntake({
      sessionId: String(session.id),
      messageId: 'message-1',
      feedbackVersion: '18181818-1818-4818-8818-181818181818',
      rating: 'negative',
      note: 'Legacy correction without lifecycle proof.',
      scopeKey: 'profile:tianwen',
      sessionDigest: `sha256:${'1'.repeat(64)}`,
      evidenceIds: [],
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1'))
        .toMatchObject({ state: 'active' })
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('fails closed when existing v2 statuses disagree on the Session lifecycle', async () => {
    const root = evolutionRoot('inconsistent-session-lifecycle')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-inconsistent-session-lifecycle',
      ['message-1', 'message-2'],
      'D:/private/current-workspace',
      1,
    )
    sessions.add(session)
    sessions.listed = []
    feedback.set(String(session.id), [])
    const mounted = await mountBridge(root, sessions, feedback)
    const intake = (messageId: string, feedbackVersion: string) => ({
      sessionId: String(session.id),
      messageId,
      feedbackVersion,
      rating: 'negative' as const,
      note: `Correction for ${messageId}.`,
      scopeKey: 'profile:tianwen',
      sessionDigest: `sha256:${'1'.repeat(64)}` as const,
      evidenceIds: [],
    })
    mounted.ctx.tianwenEvolution.recordLearningFeedbackRevision({
      intake: intake(
        'message-1',
        '22222222-2222-4222-8222-222222222222',
      ),
      sessionLifecycleFingerprint: `sha256:${'a'.repeat(64)}`,
    })
    mounted.ctx.tianwenEvolution.recordLearningFeedbackRevision({
      intake: intake(
        'message-2',
        '23232323-2323-4323-8323-232323232323',
      ),
      sessionLifecycleFingerprint: `sha256:${'b'.repeat(64)}`,
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(session.id)))
        .toHaveLength(2)
      expect(mounted.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(session.id))
        .every(status => status.state === 'active'))
        .toBe(true)
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it.each([
    ['the same createdAt with another cwd', 100, 100, 'D:/private/new-run'],
    ['a clock rollback', 100, 50, 'D:/private/old-run'],
  ] as const)(
    'does not reuse an old Run scope after %s',
    async (_label, firstCreatedAt, replacementCreatedAt, replacementCwd) => {
      const root = evolutionRoot(`run-scope-lifecycle-${replacementCreatedAt}`)
      const sessions = new SessionCatalog()
      const feedback = new FeedbackCatalog()
      const sessionId = `feedback-run-scope-lifecycle-${replacementCreatedAt}`
      const first = completedSession(
        sessionId,
        [],
        'D:/private/old-run',
        firstCreatedAt,
      )
      sessions.add(first)
      sessions.listed = []
      const mounted = await mountBridge(root, sessions, feedback)
      mounted.ctx.tianwenLearningIntake.bindRun(first, {
        goalRef: `goal:scope-lifecycle-${replacementCreatedAt}`,
        taskRef: `task:scope-lifecycle-${replacementCreatedAt}`,
        scopeKey: 'project:tianwen/capability:old-run-scope',
        acceptanceContract: {
          source: 'dsh-tool-result',
          toolName: 'verify_scope_lifecycle',
          notMetErrorCode: 'SCOPE_LIFECYCLE_NOT_MET',
          gapDisposition: 'observe',
        },
      })
      const replacement = completedSession(
        sessionId,
        ['message-new'],
        replacementCwd,
        replacementCreatedAt,
      )
      sessions.add(replacement)
      feedback.set(sessionId, [item({
        messageId: 'message-new',
        version: replacementCreatedAt === firstCreatedAt
          ? '19191919-1919-4919-8919-191919191919'
          : '20202020-2020-4020-8020-202020202020',
        note: 'Must not inherit the old Run scope.',
        updatedAt: 200,
      })])

      try {
        await expect(mounted.bridge.reconcileSession(sessionId))
          .resolves.toMatchObject({ state: 'pending' })
        expect(mounted.ctx.tianwenEvolution
          .getLearningIntakeStatus(sessionId, 'message-new'))
          .toBeUndefined()
      } finally {
        await mounted.ctx.fiber.dispose()
      }
    },
  )

  it('fails closed for legacy v1 and v2 Run bindings instead of using workspace scope', async () => {
    const root = evolutionRoot('legacy-run-bindings')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const v1 = completedSession('feedback-run-v1', ['message-v1'], 'D:/legacy/v1')
    const v2 = completedSession('feedback-run-v2', ['message-v2'], 'D:/legacy/v2')
    sessions.add(v1)
    sessions.add(v2)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    mounted.ctx.tianwenEvolution.recordRunBinding({
      goalRef: 'goal:legacy-v1',
      taskRef: 'task:legacy-v1',
      sessionId: String(v1.id),
      scopeKey: 'project:tianwen/capability:legacy-v1',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_legacy_v1',
        notMetErrorCode: 'LEGACY_V1_NOT_MET',
        gapDisposition: 'observe',
      },
    })
    mounted.ctx.tianwenEvolution.recordRunBinding({
      goalRef: 'goal:legacy-v2',
      taskRef: 'task:legacy-v2',
      sessionId: String(v2.id),
      scopeKey: 'project:tianwen/capability:legacy-v2',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_legacy_v2',
        notMetErrorCode: 'LEGACY_V2_NOT_MET',
        gapDisposition: 'observe',
      },
      acceptanceSubjectDigest: `sha256:${'2'.repeat(64)}`,
    })
    feedback.set(String(v1.id), [item({
      messageId: 'message-v1',
      version: '24242424-2424-4424-8424-242424242424',
      note: 'Legacy v1 must not fall back.',
    })])
    feedback.set(String(v2.id), [item({
      messageId: 'message-v2',
      version: '25252525-2525-4525-8525-252525252525',
      note: 'Legacy v2 must not fall back.',
    })])

    try {
      await expect(mounted.bridge.reconcileSession(String(v1.id)))
        .resolves.toMatchObject({ state: 'pending' })
      await expect(mounted.bridge.reconcileSession(String(v2.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(feedbackLedgerEvents(root)).toEqual([])
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reuses an exact v3 Run binding after ledger reload', async () => {
    const root = evolutionRoot('v3-run-binding-reload')
    const session = completedSession(
      'feedback-run-v3-reload',
      ['message-v3'],
      'D:/private/v3-reload',
      77,
    )
    const firstSessions = new SessionCatalog()
    const firstFeedback = new FeedbackCatalog()
    firstSessions.add(session)
    firstSessions.listed = []
    const first = await mountBridge(root, firstSessions, firstFeedback)
    first.ctx.tianwenLearningIntake.bindRun(session, {
      goalRef: 'goal:v3-reload',
      taskRef: 'task:v3-reload',
      scopeKey: 'project:tianwen/capability:v3-reload',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_v3_reload',
        notMetErrorCode: 'V3_RELOAD_NOT_MET',
        gapDisposition: 'observe',
      },
    })
    await first.ctx.fiber.dispose()

    const secondSessions = new SessionCatalog()
    const secondFeedback = new FeedbackCatalog()
    secondSessions.add(session)
    secondSessions.listed = []
    secondFeedback.set(String(session.id), [item({
      messageId: 'message-v3',
      version: '26262626-2626-4626-8626-262626262626',
      note: 'Exact v3 scope after reload.',
    })])
    const second = await mountBridge(root, secondSessions, secondFeedback)
    try {
      await expect(second.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled' })
      expect(second.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-v3')?.scopeKey)
        .toBe('project:tianwen/capability:v3-reload')
      expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8'))
        .not.toContain('D:/private/v3-reload')
    } finally {
      await second.ctx.fiber.dispose()
    }
  })

  it('fails closed before writes when a v3 binding fingerprint is not current', async () => {
    const root = evolutionRoot('v3-run-binding-mismatch')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-run-v3-mismatch',
      ['message-v3'],
      'D:/private/current-v3',
      88,
    )
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    mounted.ctx.tianwenEvolution.recordRunBinding({
      goalRef: 'goal:v3-mismatch',
      taskRef: 'task:v3-mismatch',
      sessionId: String(session.id),
      scopeKey: 'project:tianwen/capability:wrong-lifecycle',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_v3_mismatch',
        notMetErrorCode: 'V3_MISMATCH_NOT_MET',
        gapDisposition: 'observe',
      },
      sessionLifecycleFingerprint: `sha256:${'f'.repeat(64)}`,
    })
    feedback.set(String(session.id), [item({
      messageId: 'message-v3',
      version: '27272727-2727-4727-8727-272727272727',
      note: 'Do not ingest with a mismatched binding.',
    })])

    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(feedbackLedgerEvents(root)).toEqual([])
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reconciles the exact created Agent and exposes a read-only status trigger', async () => {
    const root = evolutionRoot('agent-created')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const first = completedSession('feedback-agent-first', ['message-1'], 'D:/agent/first')
    const second = completedSession('feedback-agent-second', ['message-2'], 'D:/agent/second')
    sessions.add(first)
    sessions.add(second)
    sessions.listed = []
    feedback.set(String(first.id), [item({
      messageId: 'message-1',
      version: '77777777-7777-4777-8777-777777777777',
      note: 'Agent-created revision.',
    })])
    feedback.set(String(second.id), [item({
      messageId: 'message-2',
      version: '88888888-8888-4888-8888-888888888888',
      note: 'Unrelated revision.',
    })])
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      mounted.ctx.emit('agent/created', { agent: { session: first } } as never)
      await vi.waitFor(() => expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(first.id), 'message-1')).toBeDefined())
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(second.id), 'message-2')).toBeUndefined()

      feedback.set(String(first.id), [item({
        messageId: 'message-1',
        version: '99999999-9999-4999-8999-999999999999',
        note: 'Status-query revision.',
        updatedAt: 3,
      })])
      await expect(mounted.bridge.reconcileSession(String(first.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(first.id), 'message-1')?.feedbackVersion)
        .toBe('99999999-9999-4999-8999-999999999999')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('limits startup reconciliation to eight Sessions at a time', async () => {
    const root = evolutionRoot('startup-concurrency')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    for (let index = 0; index < 17; index += 1) {
      sessions.add(completedSession(`feedback-startup-${index}`, [`message-${index}`]))
    }
    const gate = deferred()
    feedback.waitForList = gate.promise
    const ctx = new Context()
    ctx.provide('sessionPersistence', sessions)
    ctx.provide('messageFeedback', feedback)
    await applyCore(ctx, { evolutionRoot: root })
    const fiber = ctx.plugin(TianwenMessageFeedbackBridgeService)

    try {
      await vi.waitFor(() => expect(feedback.active).toBe(8))
      expect(feedback.calls).toHaveLength(8)
      expect(feedback.maxActive).toBe(8)
      gate.resolve()
      await fiber
      expect(feedback.calls).toHaveLength(17)
      expect(feedback.maxActive).toBe(8)
    } finally {
      gate.resolve()
      await ctx.fiber.dispose()
    }
  })

  it('serializes two reconciliation triggers for the same Session', async () => {
    const root = evolutionRoot('session-lane')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-session-lane', ['message-1'])
    sessions.add(session)
    sessions.listed = []
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '12121212-1212-4212-8212-121212121212',
      note: 'First queued revision.',
    })])
    const mounted = await mountBridge(root, sessions, feedback)
    const gate = deferred()
    feedback.waitForList = gate.promise

    try {
      const first = mounted.bridge.reconcileSession(String(session.id))
      await vi.waitFor(() => expect(feedback.active).toBe(1))
      feedback.set(String(session.id), [item({
        messageId: 'message-1',
        version: '13131313-1313-4313-8313-131313131313',
        note: 'Second queued revision.',
        updatedAt: 3,
      })])
      const second = mounted.bridge.reconcileSession(String(session.id))
      await nextTurn()
      expect(feedback.calls).toEqual([String(session.id)])
      expect(feedback.maxActive).toBe(1)

      gate.resolve()
      await expect(Promise.all([first, second])).resolves.toHaveLength(2)
      expect(feedback.calls).toEqual([String(session.id), String(session.id)])
      expect(feedback.maxActive).toBe(1)
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1')?.feedbackVersion)
        .toBe('13131313-1313-4313-8313-131313131313')
    } finally {
      gate.resolve()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps the bridge mounted after a startup catalog failure for a later status reconciliation', async () => {
    const root = evolutionRoot('startup-failure')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-startup-failure', ['message-1'])
    sessions.add(session)
    sessions.failList = 1
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: 'abababab-abab-4bab-8bab-abababababab',
      note: 'Recover after startup.',
    })])
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      expect(mounted.ctx.tianwenMessageFeedbackBridge).toBeDefined()
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(session.id), 'message-1')?.state)
        .toBe('active')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('filters the exact DSH domain and mounts only with every required service', async () => {
    const root = evolutionRoot('filter')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-filter', ['message-1'])
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      mounted.ctx.emit('domain/changed', {
        domain: 'other', table: 'sessions', key: String(session.id),
        operation: 'put', value: {},
      })
      mounted.ctx.emit('domain/changed', {
        domain: 'message_feedback', table: 'other', key: String(session.id),
        operation: 'put', value: {},
      })
      await nextTurn()
      expect(feedback.calls).toEqual([])
      emitFeedbackChange(mounted.ctx, String(session.id))
      await vi.waitFor(() => expect(feedback.calls).toEqual([String(session.id)]))
    } finally {
      await mounted.ctx.fiber.dispose()
    }

    const missing = new Context()
    missing.provide('sessionPersistence', sessions)
    await applyCore(missing, { evolutionRoot: evolutionRoot('missing-service') })
    const pending = missing.plugin(TianwenMessageFeedbackBridgeService)
    await nextTurn()
    expect(missing.get('tianwenMessageFeedbackBridge')).toBeUndefined()
    await pending.dispose()
    await missing.fiber.dispose()

    const composed = new Context()
    composed.provide('sessionPersistence', sessions)
    composed.provide('messageFeedback', feedback)
    await applyRuntimeBundle(composed, { evolutionRoot: evolutionRoot('runtime-composition') })
    try {
      await vi.waitFor(() => expect(composed.get('tianwenMessageFeedbackBridge'))
        .toBeDefined())
    } finally {
      await composed.fiber.dispose()
    }
  })

  it('prefers a bound Run scope, then an opaque workspace scope, then profile scope', async () => {
    const root = evolutionRoot('scope')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const rawCwd = 'D:/Private/Customer/Workspace/..//Workspace'
    const bound = completedSession('feedback-scope-bound', ['message-bound'], 'D:/bound')
    const workspace = completedSession('feedback-scope-workspace', ['message-workspace'], rawCwd)
    const profile = completedSession('feedback-scope-profile', ['message-profile'])
    for (const session of [bound, workspace, profile]) sessions.add(session)
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      mounted.ctx.tianwenLearningIntake.bindRun(bound, {
        goalRef: 'goal:scope',
        taskRef: 'task:scope',
        scopeKey: 'project:tianwen/capability:bound-scope',
        acceptanceContract: {
          source: 'dsh-tool-result',
          toolName: 'verify_scope',
          notMetErrorCode: 'SCOPE_NOT_MET',
          gapDisposition: 'observe',
        },
      })
      feedback.set(String(bound.id), [item({
        messageId: 'message-bound',
        version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        note: 'Bound note.',
      })])
      feedback.set(String(workspace.id), [item({
        messageId: 'message-workspace',
        version: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        note: 'Workspace note.',
      })])
      feedback.set(String(profile.id), [item({
        messageId: 'message-profile',
        version: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        note: 'Profile note.',
      })])
      const results = await Promise.all([bound, workspace, profile]
        .map(session => mounted.bridge.reconcileSession(String(session.id))))

      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(bound.id), 'message-bound')?.scopeKey)
        .toBe('project:tianwen/capability:bound-scope')
      const workspaceScope = mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(workspace.id), 'message-workspace')?.scopeKey
      expect(workspaceScope).toMatch(/^workspace:sha256:[0-9a-f]{64}$/u)
      expect(workspaceScope).not.toContain(rawCwd)
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(String(profile.id), 'message-profile')?.scopeKey)
        .toBe('profile:tianwen')
      expect(JSON.stringify(results)).not.toContain(rawCwd)
      expect(JSON.stringify(results)).not.toContain('Workspace note.')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('binds every revision to historical consent and preserves that decision across reload', async () => {
    const root = evolutionRoot('historical-consent')
    const consentTimes = [
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:02.000Z',
      '2026-09-01T00:00:04.000Z',
    ]
    let consentTick = 0
    const seeded = new EvolutionLedger(root, {
      clock: () => consentTimes[consentTick++]!,
    })
    seeded.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    seeded.recordLearningAnalysisConsent({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    seeded.recordLearningAnalysisConsent({
      revision: 3,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const enabledThenDisabled = completedSession(
      'feedback-consent-enabled-then-disabled',
      ['message-enabled-then-disabled'],
    )
    const disabledThenEnabled = completedSession(
      'feedback-consent-disabled-then-enabled',
      ['message-disabled-then-enabled'],
    )
    const equal = completedSession('feedback-consent-equal', ['message-equal'])
    const newlyEnabled = completedSession(
      'feedback-consent-newly-enabled',
      ['message-newly-enabled'],
    )
    sessions.add(enabledThenDisabled)
    sessions.add(disabledThenEnabled)
    sessions.add(equal)
    sessions.add(newlyEnabled)
    sessions.listed = []
    feedback.set(String(enabledThenDisabled.id), [item({
      messageId: 'message-enabled-then-disabled',
      version: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      note: 'Revision while consent revision one was enabled.',
      updatedAt: Date.parse('2026-09-01T00:00:01.000Z'),
    })])
    feedback.set(String(disabledThenEnabled.id), [item({
      messageId: 'message-disabled-then-enabled',
      version: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      note: 'Revision while consent was disabled.',
      updatedAt: Date.parse('2026-09-01T00:00:03.000Z'),
    })])
    feedback.set(String(equal.id), [item({
      messageId: 'message-equal',
      version: '14141414-1414-4414-8414-141414141414',
      note: 'Ambiguous equal-timestamp revision.',
      updatedAt: Date.parse('2026-09-01T00:00:04.000Z'),
    })])
    feedback.set(String(newlyEnabled.id), [item({
      messageId: 'message-newly-enabled',
      version: '15151515-1515-4515-8515-151515151515',
      note: 'Revision after consent revision three.',
      updatedAt: Date.parse('2026-09-01T00:00:05.000Z'),
    })])
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(enabledThenDisabled.id)))
        .resolves.toMatchObject({ state: 'reconciled' })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(enabledThenDisabled.id),
        'message-enabled-then-disabled',
      )).toMatchObject({ analysisConsentRevision: 1 })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()

      await mounted.bridge.reconcileSession(String(disabledThenEnabled.id))
      await mounted.bridge.reconcileSession(String(equal.id))
      await mounted.bridge.reconcileSession(String(newlyEnabled.id))
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(disabledThenEnabled.id),
        'message-disabled-then-enabled',
      )).not.toHaveProperty('analysisConsentRevision')
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(equal.id),
        'message-equal',
      )).not.toHaveProperty('analysisConsentRevision')
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(newlyEnabled.id),
        'message-newly-enabled',
      )).toMatchObject({ analysisConsentRevision: 3 })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(disabledThenEnabled.id),
      })
    } finally {
      await mounted.ctx.fiber.dispose()
    }

    const reloaded = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })
    try {
      await reloaded.bridge.reconcileSession(String(disabledThenEnabled.id))
      expect(reloaded.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(disabledThenEnabled.id),
        'message-disabled-then-enabled',
      )).not.toHaveProperty('analysisConsentRevision')
      expect(reloaded.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(enabledThenDisabled.id),
        'message-enabled-then-disabled',
      )).toMatchObject({ analysisConsentRevision: 1 })
      expect(reloaded.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(newlyEnabled.id),
        'message-newly-enabled',
      )).toMatchObject({ analysisConsentRevision: 3 })
      expect(reloaded.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(disabledThenEnabled.id),
      })
      expect(feedbackLedgerEvents(root)).toHaveLength(4)
      expect(feedbackLedgerEvents(root).find(event =>
        (event.input as { readonly sessionId: string }).sessionId
          === String(disabledThenEnabled.id)))
        .not.toHaveProperty('analysisConsentRevision')
    } finally {
      await reloaded.ctx.fiber.dispose()
    }
  })

  it('recovers an Evolution write failure with consent from the revision timestamp', async () => {
    const root = evolutionRoot('historical-consent-write-recovery')
    let consentTick = 0
    const seeded = new EvolutionLedger(root, {
      clock: () => [
        '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:02.000Z',
      ][consentTick++]!,
    })
    seeded.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    seeded.recordLearningAnalysisConsent({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-historical-consent-write-recovery',
      ['message-recovery'],
    )
    sessions.add(session)
    sessions.listed = []
    feedback.set(String(session.id), [item({
      messageId: 'message-recovery',
      version: '16161616-1616-4616-8616-161616161616',
      note: 'Revision before the later disable.',
      updatedAt: Date.parse('2026-09-01T00:00:01.000Z'),
    })])
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })
    const consume = vi.spyOn(mounted.ctx.tianwenLearningIntake, 'consume')
      .mockImplementationOnce(() => {
        throw new Error('forced historical intake write failure')
      })
    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      consume.mockRestore()
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled' })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        'message-recovery',
      )).toMatchObject({ analysisConsentRevision: 1 })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('records an unconsented correction before binding one durable notice intent to its exact root main', async () => {
    const root = evolutionRoot('consent-notice-lineage')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const main = completedSession('feedback-notice-main', [])
    const child = completedSession(
      'feedback-notice-child',
      ['message-child', 'message-child-2'],
      undefined,
      2,
      {
        origin: 'subagent',
        parentSession: String(main.id),
        delegationDepth: 1,
      },
    )
    sessions.add(main)
    sessions.add(child)
    sessions.listed = []
    feedback.set(String(child.id), [item({
      messageId: 'message-child',
      version: '31313131-3131-4131-8131-313131313131',
      note: 'PRIVATE CORRECTION MUST NOT ENTER THE NOTICE',
    })])
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(child.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(child.id),
        'message-child',
      )).toMatchObject({ state: 'active' })
      const notice = mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v1')
      expect(notice).toMatchObject({
        state: 'pending',
        mainSessionId: String(main.id),
      })
      expect(JSON.stringify(notice)).not.toContain('PRIVATE CORRECTION')
      expect(JSON.stringify(notice)).not.toMatch(/[A-Z]:\//u)

      feedback.set(String(child.id), [item({
        messageId: 'message-child',
        version: '32323232-3232-4232-8232-323232323232',
        note: 'SECOND PRIVATE CORRECTION',
        updatedAt: 3,
      }), item({
        messageId: 'message-child-2',
        version: '38383838-3838-4838-8838-383838383838',
        note: 'PRIVATE CORRECTION ON A NEW MESSAGE',
        updatedAt: 3,
      })])
      await mounted.bridge.reconcileSession(String(child.id))
      expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
        .split('\n')
        .filter(line => line.includes('learning-consent-notice-intent-recorded')))
        .toHaveLength(1)
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('fails the notice recovery closed after durable intake when child lineage cannot prove a main parent', async () => {
    const root = evolutionRoot('consent-notice-orphan')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const orphan = completedSession(
      'feedback-notice-orphan',
      ['message-orphan'],
      undefined,
      2,
      {
        origin: 'subagent',
        parentSession: 'feedback-notice-missing-parent',
        delegationDepth: 1,
      },
    )
    sessions.add(orphan)
    sessions.listed = []
    feedback.set(String(orphan.id), [item({
      messageId: 'message-orphan',
      version: '33333333-3333-4333-8333-333333333330',
      note: 'Private orphan correction.',
    })])
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(orphan.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(orphan.id),
        'message-orphan',
      )).toMatchObject({ state: 'active' })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('recovers after intake persistence when the first notice intent append fails', async () => {
    const root = evolutionRoot('consent-notice-intent-recovery')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-notice-intent-recovery',
      ['message-recovery'],
    )
    sessions.add(session)
    sessions.listed = []
    feedback.set(String(session.id), [item({
      messageId: 'message-recovery',
      version: '39393939-3939-4939-8939-393939393939',
      note: 'Private correction survives an intent failure.',
    })])
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })
    const intent = vi.spyOn(
      mounted.ctx.tianwenEvolution,
      'recordLearningConsentNoticeIntent',
    ).mockImplementationOnce(() => {
      throw new Error('forced notice intent failure')
    })

    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution.getLearningIntakeStatus(
        String(session.id),
        'message-recovery',
      )).toMatchObject({ state: 'active' })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()

      intent.mockRestore()
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled' })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(session.id),
      })
      expect(feedbackLedgerEvents(root)).toHaveLength(1)
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('prompts only for a nonempty negative note while consent is not enabled', async () => {
    const root = evolutionRoot('consent-notice-timing')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const positive = completedSession('feedback-notice-positive', ['message-positive'])
    const empty = completedSession('feedback-notice-empty', ['message-empty'])
    const enabled = completedSession('feedback-notice-enabled', ['message-enabled'])
    const disabled = completedSession('feedback-notice-disabled', ['message-disabled'])
    for (const session of [positive, empty, enabled, disabled]) sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback, {
      learningConsent: true,
    })

    try {
      feedback.set(String(positive.id), [item({
        messageId: 'message-positive',
        version: '34343434-3434-4434-8434-343434343434',
        rating: 'positive',
        note: 'Positive detail.',
      })])
      feedback.set(String(empty.id), [item({
        messageId: 'message-empty',
        version: '35353535-3535-4535-8535-353535353535',
        note: '   ',
      })])
      await mounted.bridge.reconcileSession(String(positive.id))
      await mounted.bridge.reconcileSession(String(empty.id))
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()

      const consent = mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1,
        enabled: true,
        policyVersion: 'tianwen-auto-analysis.v1',
      })
      feedback.set(String(enabled.id), [item({
        messageId: 'message-enabled',
        version: '36363636-3636-4636-8636-363636363636',
        note: 'Analyzable later revision.',
        updatedAt: Date.parse(consent.recordedAt) + 1,
      })])
      await mounted.bridge.reconcileSession(String(enabled.id))
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toBeUndefined()
      expect(feedbackLedgerEvents(root).find(event =>
        (event.input as { readonly sessionId: string }).sessionId === String(enabled.id)))
        .toMatchObject({ analysisConsentRevision: 1 })

      const disabledConsent = mounted.ctx.tianwenEvolution
        .recordLearningAnalysisConsent({
        revision: 2,
        enabled: false,
        policyVersion: 'tianwen-auto-analysis.v1',
      })
      feedback.set(String(disabled.id), [item({
        messageId: 'message-disabled',
        version: '37373737-3737-4737-8737-373737373737',
        note: 'Disabled correction.',
        updatedAt: Date.parse(disabledConsent.recordedAt) + 1,
      })])
      await mounted.bridge.reconcileSession(String(disabled.id))
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v1',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(disabled.id),
      })
      expect(feedbackLedgerEvents(root).find(event =>
        (event.input as { readonly sessionId: string }).sessionId === String(disabled.id)))
        .not.toHaveProperty('analysisConsentRevision')
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('fails closed when a Session lifecycle changes around the DSH list read', async () => {
    const root = evolutionRoot('session-lifecycle-race')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const sessionId = 'feedback-session-lifecycle-race'
    const first = completedSession(sessionId, ['message-1'], 'D:/first', 1)
    const replacement = completedSession(sessionId, ['message-1'], 'D:/second', 2)
    sessions.add(first)
    sessions.listed = []
    feedback.set(sessionId, [item({
      messageId: 'message-1',
      version: '15151515-1515-4515-8515-151515151515',
      note: 'Revision from the first lifecycle.',
    })])
    const mounted = await mountBridge(root, sessions, feedback)
    vi.spyOn(sessions, 'inspect')
      .mockImplementationOnce(async () => {
        sessions.add(replacement)
        return { meta: first.header, events: first.events }
      })
      .mockImplementation(async () => ({
        meta: replacement.header,
        events: replacement.events,
      }))

    try {
      await expect(mounted.bridge.reconcileSession(sessionId))
        .resolves.toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution
        .getLearningIntakeStatus(sessionId, 'message-1')).toBeUndefined()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('fails closed for a feedback item without a non-empty append-origin assistant target', async () => {
    const root = evolutionRoot('invalid-target')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-invalid-target', ['message-valid'], 'D:/private/invalid')
    sessions.add(session)
    feedback.set(String(session.id), [item({
      messageId: 'message-missing',
      version: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      note: 'Private invalid note.',
    })])
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      expect(await mounted.bridge.reconcileSession(String(session.id)))
        .toMatchObject({ state: 'pending' })
      expect(mounted.ctx.tianwenEvolution
        .listLearningIntakeStatuses(String(session.id))).toEqual([])
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reconciles exact Skill use before negative feedback and retries it on replay', async () => {
    const root = evolutionRoot('skill-use-before-feedback')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession(
      'feedback-skill-use-before-feedback',
      ['message-1'],
      'D:/private/research-summary',
    )
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    const binding = mounted.ctx.tianwenLearningIntake.bindRun(session, {
      goalRef: 'goal:research-summary',
      taskRef: 'task:research-summary',
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'submit_research_summary',
        notMetErrorCode: 'RESEARCH_SUMMARY_NOT_MET',
        gapDisposition: 'reusable',
        problemCategory: 'research-summary-correction',
        severity: 2,
        blocksGoal: false,
      },
    })
    const recordSkillUse = vi.spyOn(
      mounted.ctx.tianwenLearningIntake,
      'recordSkillUse',
    )
    const consume = vi.spyOn(mounted.ctx.tianwenLearningIntake, 'consume')
    feedback.set(String(session.id), [item({
      messageId: 'message-1',
      version: '16161616-1616-4616-8616-161616161616',
      note: 'Include the decision uncertainty.',
    })])

    try {
      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(recordSkillUse).toHaveBeenCalledOnce()
      expect(recordSkillUse).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
        binding.runId,
      )
      expect(consume).toHaveBeenCalledOnce()
      expect(recordSkillUse.mock.invocationCallOrder[0])
        .toBeLessThan(consume.mock.invocationCallOrder[0]!)

      await expect(mounted.bridge.reconcileSession(String(session.id)))
        .resolves.toMatchObject({ state: 'reconciled', current: 1 })
      expect(recordSkillUse).toHaveBeenCalledTimes(2)
      expect(consume).toHaveBeenCalledOnce()
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('waits for an admitted lane during unload and removes its listeners', async () => {
    const root = evolutionRoot('dispose')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const session = completedSession('feedback-dispose', ['message-1'])
    sessions.add(session)
    sessions.listed = []
    const mounted = await mountBridge(root, sessions, feedback)
    const gate = deferred()
    feedback.waitForList = gate.promise
    emitFeedbackChange(mounted.ctx, String(session.id))
    await vi.waitFor(() => expect(feedback.active).toBe(1))

    let disposed = false
    const disposing = mounted.fiber.dispose().then(() => { disposed = true })
    await nextTurn()
    expect(disposed).toBe(false)
    gate.resolve()
    await disposing
    expect(mounted.ctx.get('tianwenMessageFeedbackBridge')).toBeUndefined()
    const calls = feedback.calls.length
    emitFeedbackChange(mounted.ctx, String(session.id))
    await nextTurn()
    expect(feedback.calls).toHaveLength(calls)
    await mounted.ctx.fiber.dispose()
  })
})
