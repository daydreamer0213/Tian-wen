import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  createUserMessage,
  freezeMessage,
  MessageId,
} from '@deepseek-ai/dsh-llm'
import {
  SessionId,
  isAppendSurfaceEvent,
  type SessionEvent,
} from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LearningConsentNoticeBinding } from '@tianwen/evolution'
import { TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'

const POLICY_VERSION = 'tianwen-auto-analysis.v1' as const
export const LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID =
  'tianwen-learning-consent-notice:tianwen-auto-analysis.v1'
export const LEARNING_CONSENT_NOTICE_DELIVERY_ID =
  'tianwen-learning-consent-delivery:tianwen-auto-analysis.v1'
export const LEARNING_CONSENT_NOTICE_TEXT = [
  'Native feedback normally does not enter the model.',
  'Enabling Tianwen sends the feedback note and referenced reply to the configured model for internal analysis.',
  'Analysis cannot edit the current project, install a Skill, or expand permission.',
  'Only evaluated changes may affect future Runs.',
  'You can disable automatic analysis later.',
].join('\n')

type ConsentAction = 'enable' | 'disable' | 'status'

export interface LearningConsentStatus {
  readonly policyVersion: typeof POLICY_VERSION
  readonly enabled: boolean
  readonly revision: number
  readonly recordedAt?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenLearningConsentAgent: TianwenLearningConsentAgentService
  }
}

function parseAction(value: unknown): ConsentAction {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !('action' in value)
    || (
      value.action !== 'enable'
      && value.action !== 'disable'
      && value.action !== 'status'
    )
  ) {
    throw new TypeError('learning consent arguments require exactly one valid action')
  }
  return value.action
}

function statusOf(
  consent: ReturnType<Context['tianwenEvolution']['getLearningAnalysisConsent']>,
): LearningConsentStatus {
  return consent === undefined
    ? { policyVersion: POLICY_VERSION, enabled: false, revision: 0 }
    : {
        policyVersion: consent.policyVersion,
        enabled: consent.enabled,
        revision: consent.revision,
        recordedAt: consent.recordedAt,
      }
}

function noticeBinding(mainSessionId: string): LearningConsentNoticeBinding {
  return {
    policyVersion: POLICY_VERSION,
    mainSessionId,
    noticeSourceMessageId: LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID,
    deliveryId: LEARNING_CONSENT_NOTICE_DELIVERY_ID,
  }
}

function isRootSession(header: {
  readonly origin?: string
  readonly parentSession?: unknown
  readonly agentPreset?: string
}): boolean {
  return header.parentSession === undefined
    && header.origin !== 'subagent'
    && header.agentPreset !== TIANWEN_CONTROLLED_AGENT_PRESET
}

function hasCompletedNotice(events: readonly SessionEvent[]): boolean {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (
      event?.type !== 'user/message'
      || String(event.data.id) !== LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID
      || event.data.source.kind !== 'plugin'
      || event.data.source.plugin !== 'tianwen'
    ) continue
    let noticeTurn: number | undefined
    for (let before = index - 1; before >= 0; before -= 1) {
      const candidate = events[before]
      if (candidate?.type === 'turn/start') {
        noticeTurn = candidate.data.turn
        break
      }
    }
    if (noticeTurn === undefined) continue
    let visibleReply = false
    for (let after = index + 1; after < events.length; after += 1) {
      const candidate = events[after]
      if (
        candidate?.type === 'assistant/message'
        && candidate.data.turn === noticeTurn
        && isAppendSurfaceEvent(candidate)
        && candidate.data.message.content.some(block =>
          block.type === 'text' && block.text.trim().length > 0)
      ) visibleReply = true
      if (candidate?.type === 'turn/end' && candidate.data.turn === noticeTurn) {
        if (visibleReply && (
          candidate.data.reason.kind === 'completed'
          || candidate.data.reason.kind === 'max-tokens'
        )) return true
        break
      }
    }
  }
  return false
}

function hasNoticeMessage(events: readonly SessionEvent[]): boolean {
  return events.some(event =>
    event.type === 'user/message'
    && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID
    && event.data.source.kind === 'plugin'
    && event.data.source.plugin === 'tianwen')
}

export class TianwenLearningConsentAgentService extends Service {
  static inject = [
    'agents',
    'sessions',
    'sessionPersistence',
    'tianwenEvolution',
  ] as const

  private readonly installed = new Map<Agent, () => Promise<void>>()
  private noticeAdmissionTail: Promise<void> = Promise.resolve()
  private noticeFlight: Promise<boolean> | undefined
  private accepting = true

  constructor(ctx: Context) {
    super(ctx, 'tianwenLearningConsentAgent')
  }

  protected [Service.init](): void {
    for (const agent of this.ctx.agents.list()) this.install(agent)
    const offAgent = this.ctx.on('agent/created', ({ agent }) => {
      this.install(agent)
      if (isRootSession(agent.session.header)) {
        void this.recoverPendingNotice().catch(() => undefined)
      }
    })
    const offDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      const dispose = this.installed.get(agent)
      this.installed.delete(agent)
      void dispose?.()
    })
    this.ctx.effect(() => async () => {
      this.accepting = false
      offDisposed()
      offAgent()
      await this.noticeAdmissionTail
      if (this.noticeFlight !== undefined) {
        await Promise.allSettled([this.noticeFlight])
      }
      await Promise.all([...this.installed.values()].map(dispose => dispose()))
      this.installed.clear()
    }, 'tianwen-learning-consent-agent.dispose')
    void this.recoverPendingNotice().catch(() => undefined)
  }

  async observeFeedbackWithoutConsent(sourceSessionId: string): Promise<boolean> {
    if (!this.accepting) return false
    const operation = this.noticeAdmissionTail
      .catch(() => undefined)
      .then(() => this.observeFeedbackWithoutConsentOnce(sourceSessionId))
    this.noticeAdmissionTail = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  private async observeFeedbackWithoutConsentOnce(
    sourceSessionId: string,
  ): Promise<boolean> {
    let status = this.ctx.tianwenEvolution
      .getLearningConsentNoticeStatus(POLICY_VERSION)
    if (status === undefined) {
      const mainSessionId = await this.resolveMainSessionId(sourceSessionId)
      if (mainSessionId === undefined) return false
      try {
        this.ctx.tianwenEvolution.recordLearningConsentNoticeIntent(
          noticeBinding(mainSessionId),
        )
      } catch (error) {
        const raced = this.ctx.tianwenEvolution
          .getLearningConsentNoticeStatus(POLICY_VERSION)
        if (
          raced?.mainSessionId !== mainSessionId
          || raced.noticeSourceMessageId
            !== LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID
        ) throw error
      }
      status = this.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus(POLICY_VERSION)
    }
    if (status?.state === 'delivered') return true
    await this.recoverPendingNotice()
    return true
  }

  private async resolveMainSessionId(
    sourceSessionId: string,
  ): Promise<string | undefined> {
    const visited = new Set<string>()
    let sessionId = sourceSessionId
    try {
      while (!visited.has(sessionId)) {
        visited.add(sessionId)
        const inspection = await this.ctx.sessionPersistence.inspect(
          SessionId(sessionId),
        )
        if (String(inspection.meta.id) !== sessionId) return undefined
        if (inspection.meta.parentSession !== undefined) {
          sessionId = String(inspection.meta.parentSession)
          continue
        }
        return isRootSession(inspection.meta) ? sessionId : undefined
      }
    } catch {
      return undefined
    }
    return undefined
  }

  private recoverPendingNotice(): Promise<boolean> {
    if (this.noticeFlight !== undefined) return this.noticeFlight
    const flight = this.recoverPendingNoticeOnce()
    this.noticeFlight = flight
    void flight.finally(() => {
      if (this.noticeFlight === flight) this.noticeFlight = undefined
    }).catch(() => undefined)
    return flight
  }

  private async recoverPendingNoticeOnce(): Promise<boolean> {
    const status = this.ctx.tianwenEvolution
      .getLearningConsentNoticeStatus(POLICY_VERSION)
    if (status === undefined) return false
    if (status.state === 'delivered') return true

    let inspection
    try {
      inspection = await this.ctx.sessionPersistence.inspect(
        SessionId(status.mainSessionId),
      )
    } catch {
      return false
    }
    if (
      String(inspection.meta.id) !== status.mainSessionId
      || !isRootSession(inspection.meta)
    ) return false
    if (hasCompletedNotice(inspection.events)) {
      this.ctx.tianwenEvolution.recordLearningConsentNoticeDelivered(
        noticeBinding(status.mainSessionId),
      )
      return true
    }
    if (hasNoticeMessage(inspection.events)) return false

    const agent = this.ctx.agents.get(SessionId(status.mainSessionId))
    if (
      agent === undefined
      || String(agent.session.id) !== status.mainSessionId
      || !isRootSession(agent.session.header)
    ) return false
    await agent.whenIdle()
    if (this.ctx.agents.get(agent.session.id) !== agent) return false
    const rechecked = await this.ctx.sessionPersistence.inspect(agent.session.id)
    if (hasCompletedNotice(rechecked.events)) {
      this.ctx.tianwenEvolution.recordLearningConsentNoticeDelivered(
        noticeBinding(status.mainSessionId),
      )
      return true
    }
    if (hasNoticeMessage(rechecked.events)) return false

    await this.runGuardedNoticeTurn(agent)
    const persisted = await this.ctx.sessionPersistence.inspect(agent.session.id)
    if (!hasCompletedNotice(persisted.events)) {
      throw new Error('learning consent notice Turn was not durably completed')
    }
    this.ctx.tianwenEvolution.recordLearningConsentNoticeDelivered(
      noticeBinding(status.mainSessionId),
    )
    return true
  }

  private async runGuardedNoticeTurn(agent: Agent): Promise<void> {
    const notice = freezeMessage({
      ...createUserMessage({
        content: [{ type: 'text', text: LEARNING_CONSENT_NOTICE_TEXT }],
        source: {
          kind: 'plugin',
          plugin: 'tianwen',
          form: 'notice',
          summary: 'Learning consent notice',
        },
      }),
      id: MessageId(LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID),
    })
    let noticeTurn: number | undefined
    let active = false
    let ended = false
    let resolveEnded!: () => void
    const turnEnded = new Promise<void>(resolve => { resolveEnded = resolve })
    const offPreStep = agent.ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (
        noticeTurn === undefined
        && decision.kind === 'enter'
        && decision.messages.some(message => String(message.id) === String(notice.id))
      ) {
        noticeTurn = payload.turn
        active = true
      }
      return decision
    })
    const offSession = agent.ctx.on('session/event', (session, event) => {
      if (
        active
        && String(session.id) === String(agent.session.id)
        && event.type === 'turn/end'
        && event.data.turn === noticeTurn
      ) {
        active = false
        ended = true
        resolveEnded()
      }
    })
    const offGuard = agent.ctx.tools.guard(() => active
      ? 'Tianwen learning consent notices are read-only; tools are disabled for this Turn.'
      : undefined)
    try {
      agent.followup(notice)
      const becameIdle = agent.whenIdle().then(() => {
        if (!ended) throw new Error('learning consent notice Turn was not observed')
      })
      await Promise.race([turnEnded, becameIdle])
      if (!await this.ctx.sessions.flush(agent.session)) {
        throw new Error('Session persistence is unavailable')
      }
    } finally {
      active = false
      offGuard()
      offSession()
      offPreStep()
    }
  }

  private install(agent: Agent): void {
    if (!isRootSession(agent.session.header) || this.installed.has(agent)) return
    const service = this
    const dispose = agent.ctx.effect(function* () {
      yield agent.ctx.tools.register(defineTool({
        name: 'tianwen_learning_consent',
        description: 'Enable, disable, or inspect Tianwen automatic feedback analysis for this profile.',
        parameters: {
          action: {
            type: 'string',
            enum: ['enable', 'disable', 'status'],
            required: true,
          },
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              policyVersion: { type: 'string', const: POLICY_VERSION, required: true },
              enabled: { type: 'boolean', required: true },
              revision: { type: 'integer', required: true },
              recordedAt: { type: 'string' },
            },
            additionalProperties: false,
          },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
          if (
            exec.agent === undefined
            || !isRootSession(exec.agent.session.header)
          ) {
            throw new Error('learning consent is available only in a main Session')
          }
          const action = parseAction(args)
          const status = service.updateOrRead(action)
          if (action === 'status') {
            void exec.agent.whenIdle()
              .then(() => service.recoverPendingNotice())
              .catch(() => undefined)
          }
          return status
        },
      }))
    })
    this.installed.set(agent, dispose)
  }

  private updateOrRead(action: ConsentAction): LearningConsentStatus {
    const current = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    if (action === 'status') return statusOf(current)
    const enabled = action === 'enable'
    if (current?.enabled === enabled) return statusOf(current)
    const recorded = statusOf(this.ctx.tianwenEvolution.recordLearningAnalysisConsent({
      revision: (current?.revision ?? 0) + 1,
      enabled,
      policyVersion: POLICY_VERSION,
    }))
    const loop = this.ctx.get('tianwenLearningLoop') as {
      schedule(analysisId: string): Promise<void>
    } | undefined
    if (loop !== undefined) {
      for (const analysis of this.ctx.tianwenEvolution.listLearningAnalyses()) {
        void loop.schedule(analysis.analysisId).catch(() => undefined)
      }
    }
    return recorded
  }
}
