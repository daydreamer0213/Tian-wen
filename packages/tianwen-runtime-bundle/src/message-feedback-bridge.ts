import { createHash } from 'node:crypto'
import { normalize, resolve } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { MessageFeedbackItem } from '@deepseek-ai/dsh-message-feedback'
import {
  Session,
  SessionId,
  deriveEventMessage,
  isAppendSurfaceEvent,
} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence-jsonl'
import {
  learningFeedbackFingerprint,
  learningSessionLifecycleFingerprint,
} from '@tianwen/evolution'
import type {} from '@tianwen/runtime'

const STARTUP_CONCURRENCY = 8
const PROFILE_SCOPE = 'profile:tianwen'

type SessionInspection = Awaited<
  ReturnType<Context['sessionPersistence']['inspect']>
>

export type MessageFeedbackReconciliationStatus =
  | {
      readonly schemaVersion: 'tianwen.message-feedback-reconciliation.v1'
      readonly sessionId: string
      readonly state: 'reconciled'
      readonly current: number
      readonly active: number
      readonly retracted: number
    }
  | {
      readonly schemaVersion: 'tianwen.message-feedback-reconciliation.v1'
      readonly sessionId: string
      readonly state: 'session-not-found' | 'pending'
    }

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenMessageFeedbackBridge: TianwenMessageFeedbackBridgeService
  }
}

function workspaceScope(cwd: string): string {
  const normalized = normalize(resolve(cwd)).replaceAll('\\', '/')
  const canonical = process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `workspace:sha256:${digest}`
}

function persistedSession(inspection: SessionInspection): Session {
  const session: Session = Object.create(Session.prototype, {
    header: { enumerable: true, value: inspection.meta },
    events: { enumerable: true, value: inspection.events },
  })
  Object.freeze(session)
  return session
}

function isFeedbackTarget(
  inspection: SessionInspection,
  messageId: string,
): boolean {
  return inspection.events.some(event => {
    if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) {
      return false
    }
    const message = deriveEventMessage(event)
    return message?.role === 'assistant'
      && String(message.id) === messageId
      && message.content.length > 0
  })
}

export class TianwenMessageFeedbackBridgeService extends Service {
  static inject = [
    'messageFeedback',
    'sessionPersistence',
    'tianwenLearningIntake',
    'tianwenEvolution',
  ] as const

  private readonly lanes = new Map<string, Promise<unknown>>()
  private accepting = true

  constructor(ctx: Context) {
    super(ctx, 'tianwenMessageFeedbackBridge')
  }

  protected async [Service.init](): Promise<void> {
    const offChanged = this.ctx.on('domain/changed', change => {
      if (
        change.domain !== 'message_feedback'
        || change.table !== 'sessions'
      ) return
      void this.reconcileSession(String(change.key))
    })
    const offAgent = this.ctx.on('agent/created', ({ agent }) => {
      void this.reconcileSession(String(agent.session.id))
    })
    this.ctx.effect(() => async () => {
      this.accepting = false
      offChanged()
      offAgent()
      await Promise.allSettled([...this.lanes.values()])
      this.lanes.clear()
    }, 'tianwen-message-feedback-bridge.dispose')
    await this.reconcileStartup()
  }

  async reconcileSession(
    sessionId: string,
  ): Promise<MessageFeedbackReconciliationStatus> {
    if (!this.accepting) return this.pending(sessionId)
    try {
      return await this.enqueue(sessionId, () => this.reconcile(sessionId))
    } catch {
      return this.pending(sessionId)
    }
  }

  private async reconcileStartup(): Promise<void> {
    let sessions: Awaited<ReturnType<Context['sessionPersistence']['list']>>
    try {
      sessions = await this.ctx.sessionPersistence.list()
    } catch {
      return
    }
    let next = 0
    const worker = async () => {
      while (this.accepting) {
        const index = next
        next += 1
        const session = sessions[index]
        if (session === undefined) return
        await this.reconcileSession(String(session.id))
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(STARTUP_CONCURRENCY, sessions.length) },
      worker,
    ))
  }

  private async reconcile(
    sessionId: string,
  ): Promise<MessageFeedbackReconciliationStatus> {
    let inspectionBefore: SessionInspection
    try {
      inspectionBefore = await this.ctx.sessionPersistence.inspect(
        SessionId(sessionId),
      )
    } catch {
      const listed = await this.ctx.messageFeedback.list({
        sessionId: SessionId(sessionId),
      })
      if (!listed.ok) return this.notFound(sessionId)
      throw new Error('persisted feedback Session inspection is unavailable')
    }
    const lifecycleBefore = learningSessionLifecycleFingerprint({
      sessionId: String(inspectionBefore.meta.id),
      createdAt: inspectionBefore.meta.createdAt,
      ...(inspectionBefore.meta.cwd === undefined
        ? {}
        : { cwd: inspectionBefore.meta.cwd }),
    })
    const listed = await this.ctx.messageFeedback.list({
      sessionId: SessionId(sessionId),
    })
    if (!listed.ok) return this.notFound(sessionId)
    const inspection = await this.ctx.sessionPersistence.inspect(
      SessionId(sessionId),
    )
    const lifecycleAfter = learningSessionLifecycleFingerprint({
      sessionId: String(inspection.meta.id),
      createdAt: inspection.meta.createdAt,
      ...(inspection.meta.cwd === undefined ? {} : { cwd: inspection.meta.cwd }),
    })
    if (
      String(inspectionBefore.meta.id) !== sessionId
      || String(inspection.meta.id) !== sessionId
      || lifecycleBefore !== lifecycleAfter
    ) {
      throw new Error('feedback Session inspection identity mismatch')
    }

    const byMessage = new Map<string, MessageFeedbackItem>()
    const versions = new Set<string>()
    for (const item of listed.value.items) {
      const messageId = String(item.messageId)
      const version = String(item.version)
      if (
        byMessage.has(messageId)
        || versions.has(version)
        || !isFeedbackTarget(inspection, messageId)
      ) {
        throw new Error('feedback snapshot does not match persisted Session')
      }
      byMessage.set(messageId, item)
      versions.add(version)
    }

    const session = persistedSession(inspection)
    const sessionLifecycleFingerprint = lifecycleAfter
    const existingStatuses = this.ctx.tianwenEvolution
      .listLearningIntakeStatuses(sessionId)
    if (existingStatuses.some(status =>
      status.sessionLifecycleFingerprint !== sessionLifecycleFingerprint)) {
      throw new Error('feedback Session lifecycle does not match learning history')
    }
    const scopeKey = this.scopeKey(
      sessionId,
      inspection,
      lifecycleBefore,
      lifecycleAfter,
    )
    const consentAgent = this.ctx.get('tianwenLearningConsentAgent')
    for (const [messageId, item] of byMessage) {
      const current = this.ctx.tianwenEvolution.getLearningIntakeStatus(
        sessionId,
        messageId,
      )
      const fingerprint = learningFeedbackFingerprint(item.rating, item.note)
      if (current?.feedbackVersion === String(item.version)) {
        if (
          current.state !== 'active'
          || current.rating !== item.rating
          || current.feedbackFingerprint !== fingerprint
        ) {
          throw new Error('feedback revision disagrees with learning history')
        }
        await this.observeConsentNotice(
          consentAgent,
          sessionId,
          item,
          current.analysisConsentRevision,
        )
        continue
      }
      const historicalConsent = this.ctx.tianwenEvolution
        .getLearningAnalysisConsentBefore(item.updatedAt)
      const analysisConsentRevision = historicalConsent?.enabled === true
        ? historicalConsent.revision
        : undefined
      this.ctx.tianwenLearningIntake.consume(session, scopeKey, {
        messageId,
        rating: item.rating,
        ...(item.note === undefined ? {} : { note: item.note }),
        version: String(item.version),
        ...(current?.state === 'active'
          ? { supersedesFeedbackVersion: current.feedbackVersion }
          : {}),
        ...(analysisConsentRevision === undefined
          ? {}
          : { analysisConsentRevision }),
      })
      const recorded = this.ctx.tianwenEvolution.getLearningIntakeStatus(
        sessionId,
        messageId,
      )
      if (recorded?.feedbackVersion !== String(item.version)) {
        throw new Error('feedback revision did not produce an exact learning status')
      }
      await this.observeConsentNotice(
        consentAgent,
        sessionId,
        item,
        recorded.analysisConsentRevision,
      )
    }

    const currentMessageIds = new Set(byMessage.keys())
    for (const status of existingStatuses) {
      if (status.state === 'active' && !currentMessageIds.has(status.messageId)) {
        this.ctx.tianwenEvolution.recordLearningFeedbackRetraction({
          sessionId,
          messageId: status.messageId,
          retractedFeedbackVersion: status.feedbackVersion,
          sessionLifecycleFingerprint,
        })
      }
    }

    const statuses = this.ctx.tianwenEvolution
      .listLearningIntakeStatuses(sessionId)
    return {
      schemaVersion: 'tianwen.message-feedback-reconciliation.v1',
      sessionId,
      state: 'reconciled',
      current: byMessage.size,
      active: statuses.filter(status => status.state === 'active').length,
      retracted: statuses.filter(status => status.state === 'retracted').length,
    }
  }

  private async observeConsentNotice(
    consentAgent: Context['tianwenLearningConsentAgent'] | undefined,
    sessionId: string,
    item: MessageFeedbackItem,
    analysisConsentRevision: number | undefined,
  ): Promise<void> {
    if (
      consentAgent === undefined
      || analysisConsentRevision !== undefined
      || item.rating !== 'negative'
      || typeof item.note !== 'string'
      || item.note.trim().length === 0
    ) return
    if (!await consentAgent.observeFeedbackWithoutConsent(sessionId)) {
      throw new Error('feedback notice main Session lineage is unavailable')
    }
  }

  private scopeKey(
    sessionId: string,
    inspection: SessionInspection,
    lifecycleBefore: string,
    lifecycleAfter: string,
  ): string {
    const binding = this.ctx.tianwenEvolution
      .getRunBindingBySessionId(sessionId)
    if (binding !== undefined) {
      if (
        !('sessionLifecycleFingerprint' in binding)
        || binding.sessionLifecycleFingerprint !== lifecycleBefore
        || binding.sessionLifecycleFingerprint !== lifecycleAfter
      ) {
        throw new Error('Run binding does not prove the current Session lifecycle')
      }
      return binding.scopeKey
    }
    const cwd = inspection.meta.cwd
    return typeof cwd === 'string' && cwd.trim().length > 0
      ? workspaceScope(cwd)
      : PROFILE_SCOPE
  }

  private enqueue<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.lanes.get(sessionId) ?? Promise.resolve()
    const current = prior.catch(() => undefined).then(operation)
    this.lanes.set(sessionId, current)
    void current.then(
      () => { if (this.lanes.get(sessionId) === current) this.lanes.delete(sessionId) },
      () => { if (this.lanes.get(sessionId) === current) this.lanes.delete(sessionId) },
    )
    return current
  }

  private pending(sessionId: string): MessageFeedbackReconciliationStatus {
    return {
      schemaVersion: 'tianwen.message-feedback-reconciliation.v1',
      sessionId,
      state: 'pending',
    }
  }

  private notFound(sessionId: string): MessageFeedbackReconciliationStatus {
    return {
      schemaVersion: 'tianwen.message-feedback-reconciliation.v1',
      sessionId,
      state: 'session-not-found',
    }
  }
}
