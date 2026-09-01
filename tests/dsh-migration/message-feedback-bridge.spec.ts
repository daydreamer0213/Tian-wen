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

import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import {
  TianwenMessageFeedbackBridgeService,
} from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
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
): Session {
  const sessionId = SessionId(id)
  const session = Session.create(sessionId, [], {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt,
    ...(cwd === undefined ? {} : { cwd }),
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
) {
  const ctx = new Context()
  ctx.provide('sessionPersistence', sessions)
  ctx.provide('messageFeedback', feedback)
  await applyCore(ctx, { evolutionRoot: root })
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
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen DSH Message Feedback bridge', () => {
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
      mounted.ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:scope',
        taskRef: 'task:scope',
        sessionId: String(bound.id),
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

  it('captures only consent enabled before the exact feedback revision', async () => {
    const root = evolutionRoot('consent')
    const sessions = new SessionCatalog()
    const feedback = new FeedbackCatalog()
    const later = completedSession('feedback-consent-later', ['message-later'])
    const earlier = completedSession('feedback-consent-earlier', ['message-earlier'])
    const equal = completedSession('feedback-consent-equal', ['message-equal'])
    sessions.add(later)
    sessions.add(earlier)
    sessions.add(equal)
    const mounted = await mountBridge(root, sessions, feedback)

    try {
      const consent = mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1,
        enabled: true,
        policyVersion: 'tianwen-auto-analysis.v1',
      })
      const consentAt = Date.parse(consent.recordedAt)
      feedback.set(String(later.id), [item({
        messageId: 'message-later',
        version: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        note: 'Revision after consent.',
        updatedAt: consentAt + 1,
      })])
      feedback.set(String(earlier.id), [item({
        messageId: 'message-earlier',
        version: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        note: 'Historical revision.',
        updatedAt: Math.max(0, consentAt - 1),
      })])
      feedback.set(String(equal.id), [item({
        messageId: 'message-equal',
        version: '14141414-1414-4414-8414-141414141414',
        note: 'Ambiguous equal-timestamp revision.',
        updatedAt: consentAt,
      })])
      await mounted.bridge.reconcileSession(String(later.id))
      await mounted.bridge.reconcileSession(String(earlier.id))
      await mounted.bridge.reconcileSession(String(equal.id))

      const events = feedbackLedgerEvents(root)
      const bySession = new Map(events.map(event => [
        (event.input as { readonly sessionId: string }).sessionId,
        event,
      ]))
      expect(bySession.get(String(later.id))?.analysisConsentRevision).toBe(1)
      expect(bySession.get(String(earlier.id)))
        .not.toHaveProperty('analysisConsentRevision')
      expect(bySession.get(String(equal.id)))
        .not.toHaveProperty('analysisConsentRevision')

      await mounted.bridge.reconcileSession(String(earlier.id))
      expect(feedbackLedgerEvents(root)).toHaveLength(3)
      expect(feedbackLedgerEvents(root).find(event =>
        (event.input as { readonly sessionId: string }).sessionId === String(earlier.id)))
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
