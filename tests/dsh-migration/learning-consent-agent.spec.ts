import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import {
  CallId,
  SessionId,
  SkillRegistry,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import {
  guidanceVersion,
  conversationQualityContract,
  conversationReviewConsensus,
  parseConversationAuditedReviewChecks,
  sha256,
  type ConversationAdmissionDecision,
  type ConversationFeedbackAssessment,
  type ConversationTask,
  type GuidanceSnapshot,
  type GuidanceStudy,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  RESEARCH_SUMMARY_SCOPE,
  TIANWEN_CONTROLLED_AGENT_PRESET,
} from '../../packages/tianwen-runtime/src/index.js'
import {
  LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID,
  LEARNING_CONSENT_NOTICE_TEXT,
  TianwenLearningConsentAgentService,
} from '../../packages/tianwen-runtime-bundle/src/learning-consent-agent.js'

const roots: string[] = []

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

function tempRoot(prefix: string): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-learning-consent-agent-tests'
    : resolve('tmp/tianwen-learning-consent-agent-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, `${prefix}-`))
  roots.push(root)
  return root
}

async function mountConsentRuntimeAt(
  root: string,
  responses: Parameters<typeof mountGoalHarness>[1] = [],
  options: {
    readonly nativeSkills?: readonly object[]
    readonly learningSkillSources?: readonly object[]
  } = {},
) {
  const harness = await mountGoalHarness(join(root, 'sessions'), responses, {
    goalRoundDriver: false,
  })
  await applyCore(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  if (options.nativeSkills !== undefined) {
    await harness.ctx.plugin(SkillRegistry)
    for (const skill of options.nativeSkills) harness.ctx.skills.register(skill as never)
  }
  const consentFiber = harness.ctx.plugin(TianwenLearningConsentAgentService, options.learningSkillSources === undefined
    ? {}
    : { learningSkillSources: options.learningSkillSources as never })
  await consentFiber
  return { ...harness, root, consentFiber }
}

async function mountConsentRuntime(
  prefix: string,
  responses: Parameters<typeof mountGoalHarness>[1] = [],
  options: Parameters<typeof mountConsentRuntimeAt>[2] = {},
) {
  return mountConsentRuntimeAt(tempRoot(prefix), responses, options)
}

async function createMainAndChild(ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx']) {
  const main = await ctx.agents.create({
    sessionId: SessionId(`consent-main-${randomUUID()}`),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  const child = await main.agent.ctx.agents.create({
    sessionId: SessionId(`consent-child-${randomUUID()}`),
    meta: {
      origin: 'subagent',
      parentSession: main.agent.session.id,
      delegationDepth: 1,
    },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  return { main, child }
}

async function executeConsent(
  ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx'],
  agent: Agent | undefined,
  args: unknown,
) {
  return ctx.tools.execute({
    callId: CallId(`learning-consent-${randomUUID()}`),
    name: 'tianwen_learning_consent',
    arguments: args,
    ...(agent === undefined ? {} : { agent }),
    signal: new AbortController().signal,
  })
}

async function executeLearningStatus(
  ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx'],
  agent: Agent | undefined,
  signal = new AbortController().signal,
) {
  return ctx.tools.execute({
    callId: CallId(`learning-status-${randomUUID()}`),
    name: 'tianwen_learning_status',
    arguments: {},
    ...(agent === undefined ? {} : { agent }),
    signal,
  })
}

async function executeLearningContinue(
  ctx: Awaited<ReturnType<typeof mountConsentRuntime>>['ctx'],
  agent: Agent | undefined,
  args: unknown = {},
) {
  return ctx.tools.execute({
    callId: CallId(`learning-continue-${randomUUID()}`),
    name: 'tianwen_learning_continue',
    arguments: args,
    ...(agent === undefined ? {} : { agent }),
    signal: new AbortController().signal,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tianwen main-chat learning consent tool', () => {
  it.each([undefined, 'tianwen-auto-analysis.v1', 'tianwen-auto-analysis.v2'] as const)(
    'offers v3 once after an ordinary task with consent %s while preserving the current authorization', async policyVersion => {
      const mounted = await mountConsentRuntime('ordinary-upgrade-notice', [
        toolCallResponse('hold-current-task', 'hold_current_task', {}),
        textResponse('The ordinary task is complete.'),
        textResponse('You can agree here to enable automatic analysis of future conversations.'),
      ])
      const { main, child } = await createMainAndChild(mounted.ctx)
      const entered = deferred()
      const release = deferred()
      const disposeTool = main.agent.ctx.tools.register(defineTool({
        name: 'hold_current_task', description: 'Finish the current ordinary task.', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute() { entered.resolve(); await release.promise; return 'finished' },
      }))
      try {
        if (policyVersion !== undefined) mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
          revision: 1, enabled: true, policyVersion,
        })
        const beforeConsent = mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()
        main.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Do this ordinary task.' }], source: { kind: 'user' } }))
        await entered.promise
        const observation = mounted.ctx.tianwenLearningConsentAgent
          .observeConversationWithoutConsent(String(main.agent.session.id))
        await nextTurn()
        expect(main.agent.session.events.some(event => event.type === 'user/message'
          && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID)).toBe(false)
        expect(mounted.adapter.requests).toHaveLength(1)
        release.resolve()
        await expect(observation).resolves.toBe(true)
        expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toEqual(beforeConsent)
        expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v3'))
          .toMatchObject({ state: 'delivered', mainSessionId: String(main.agent.session.id) })
        const events = main.agent.session.events
        const noticeIndex = events.findIndex(event => event.type === 'user/message'
          && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID)
        expect(noticeIndex).toBeGreaterThan(events.findIndex(event => event.type === 'turn/end' && event.data.turn === 1))
        expect(events[noticeIndex]).toMatchObject({ type: 'user/message', data: {
          source: { kind: 'plugin', plugin: 'tianwen' },
          content: [{ type: 'text', text: expect.stringMatching(/agree.*this conversation/iu) }],
        } })
        await expect(mounted.ctx.tianwenLearningConsentAgent
          .observeConversationWithoutConsent(String(main.agent.session.id))).resolves.toBe(true)
        expect(mounted.adapter.requests).toHaveLength(3)
        expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
          .toMatchObject({ value: { enabled: true, policyVersion: 'tianwen-auto-analysis.v3', revision: policyVersion === undefined ? 1 : 2 } })
      } finally {
        release.resolve()
        await child.dispose()
        await main.dispose()
        disposeTool()
        await mounted.ctx.fiber.dispose()
      }
    },
  )

  it.each([
    ['tianwen-auto-analysis.v1', false], ['tianwen-auto-analysis.v2', false],
    ['tianwen-auto-analysis.v3', false], ['tianwen-auto-analysis.v3', true],
  ] as const)('does not prompt ordinary conversations for %s with enabled=%s', async (policyVersion, enabled) => {
    const mounted = await mountConsentRuntime('ordinary-notice-ineligible')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled, policyVersion })
      await expect(mounted.ctx.tianwenLearningConsentAgent
        .observeConversationWithoutConsent(String(main.agent.session.id))).resolves.toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(0)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('drops a queued ordinary conversation notice when consent is disabled before the current task becomes idle', async () => {
    const mounted = await mountConsentRuntime('ordinary-notice-disabled')
    const { main, child } = await createMainAndChild(mounted.ctx)
    const idle = deferred()
    const whenIdle = vi.spyOn(main.agent, 'whenIdle').mockReturnValueOnce(idle.promise)
    try {
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2' })
      const observation = mounted.ctx.tianwenLearningConsentAgent
        .observeConversationWithoutConsent(String(main.agent.session.id))
      await nextTurn()
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      idle.resolve()
      await expect(observation).resolves.toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(0)
    } finally {
      idle.resolve()
      whenIdle.mockRestore()
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('discloses first enable even when a pending v3 notice belongs to an offline main Session', async () => {
    const mounted = await mountConsentRuntime('pending-enable')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      mounted.ctx.tianwenEvolution.recordLearningConsentNoticeIntent({
        policyVersion: 'tianwen-auto-analysis.v3', mainSessionId: 'offline-original-main',
        noticeSourceMessageId: 'tianwen-learning-consent-notice:tianwen-auto-analysis.v3',
        deliveryId: 'tianwen-learning-consent-delivery:tianwen-auto-analysis.v3',
      })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
        .toMatchObject({ isError: false, value: {
          enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3',
          disclosure: expect.stringMatching(/ordinary conversation.*configured model/isu),
        } })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v3'))
        .toMatchObject({ state: 'pending', mainSessionId: 'offline-original-main' })
      expect((await executeConsent(mounted.ctx, main.agent, { action: 'enable' })).value)
        .not.toHaveProperty('disclosure')
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('finishes a native enable tool Turn before running the one-time notice Turn', async () => {
    const mounted = await mountConsentRuntime('native-enable', [
      toolCallResponse('enable-learning', 'tianwen_learning_consent', { action: 'enable' }),
      textResponse('Automatic conversation analysis is enabled with the disclosed scope.'),
      textResponse('You can disable automatic analysis later.'),
    ])
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      main.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Enable automatic learning for my conversations.' }],
        source: { kind: 'user' },
      }))
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state).toBe('delivered')
      const events = main.agent.session.events
      const firstEnd = events.findIndex(event => event.type === 'turn/end' && event.data.turn === 1)
      const noticeIndex = events.findIndex(event => event.type === 'user/message'
        && String(event.data.id) === 'tianwen-learning-consent-notice:tianwen-auto-analysis.v3')
      expect(firstEnd).toBeGreaterThan(0)
      expect(noticeIndex).toBeGreaterThan(firstEnd)
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent())
        .toMatchObject({ enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' })
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps enabled v2 unchanged until explicit enable discloses v3 once and delivers its notice after idle', async () => {
    const mounted = await mountConsentRuntime('natural-consent-enable', [textResponse('Automatic conversation analysis is now enabled.')])
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2',
      })
      const ledgerPath = join(mounted.root, 'evolution', 'ledger.jsonl')
      const beforeLedger = readFileSync(ledgerPath, 'utf8')
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'status' }))
        .toMatchObject({ value: { enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v2' } })
      expect(await executeLearningStatus(mounted.ctx, main.agent))
        .toMatchObject({ value: { consent: { policyVersion: 'tianwen-auto-analysis.v2' } } })
      await nextTurn()
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeLedger)
      expect(mounted.adapter.requests).toHaveLength(0)

      const enabled = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })

      expect(enabled).toMatchObject({ isError: false, value: {
        enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v3',
        disclosure: expect.stringMatching(/ordinary conversation.*configured model/isu),
      } })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state).toBe('delivered')
      const replay = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(replay).toMatchObject({ value: { enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v3' } })
      expect(replay.value).not.toHaveProperty('disclosure')
      const notices = main.agent.session.events.filter(event => event.type === 'user/message'
        && String(event.data.id) === 'tianwen-learning-consent-notice:tianwen-auto-analysis.v3')
      expect(notices).toHaveLength(1)
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'disable' }))
        .toMatchObject({ value: { enabled: false, revision: 3, policyVersion: 'tianwen-auto-analysis.v3' } })
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it.each([
    ['tianwen-auto-analysis.v1', false], ['tianwen-auto-analysis.v1', true],
    ['tianwen-auto-analysis.v2', false], ['tianwen-auto-analysis.v2', true],
  ] as const)('recovers historical %s notice with completed=%s without replacing its binding or enabling v3', async (policyVersion, completed) => {
    const mounted = await mountConsentRuntime('historical-notice', [textResponse('Historical notice acknowledged.')])
    const { main, child } = await createMainAndChild(mounted.ctx)
    const noticeSourceMessageId = `tianwen-learning-consent-notice:${policyVersion}`
    try {
      await mounted.consentFiber.dispose()
      mounted.ctx.tianwenEvolution.recordLearningConsentNoticeIntent({
        policyVersion, mainSessionId: String(main.agent.session.id), noticeSourceMessageId,
        deliveryId: `tianwen-learning-consent-delivery:${policyVersion}`,
      })
      if (completed) {
        main.agent.followup(freezeMessage({
          ...createUserMessage({ content: [{ type: 'text', text: 'Historical consent disclosure.' }],
            source: { kind: 'plugin', plugin: 'tianwen', form: 'notice', summary: 'Learning consent notice' } }),
          id: MessageId(noticeSourceMessageId),
        }))
        await main.agent.whenIdle()
        await mounted.ctx.sessions.flush(main.agent.session)
      }
      const reloaded = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await reloaded
      await expect.poll(() => mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(policyVersion)?.state)
        .toBe('delivered')
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(policyVersion))
        .toMatchObject({ mainSessionId: String(main.agent.session.id), noticeSourceMessageId })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')).toBeUndefined()
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toBeUndefined()
      expect(main.agent.session.events.filter(event => event.type === 'user/message'
        && String(event.data.id) === noticeSourceMessageId)).toHaveLength(1)
      expect(mounted.adapter.requests).toHaveLength(1)
      await reloaded.dispose()
      const secondReload = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await secondReload
      await nextTurn()
      expect(mounted.adapter.requests).toHaveLength(1)
      await secondReload.dispose()
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('counts natural task and review states without exposing source content or replacing legacy history', async () => {
    const mounted = await mountConsentRuntime('natural-status')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const evolution = mounted.ctx.tianwenEvolution
      evolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
      const mainId = String(main.agent.session.id)
      const proof = { sessionId: 'private-review-session', sessionDigest: sha256('proof'), requestDigest: sha256('judgment') }
      function record(turn: number, options: {
        sessionId?: string
        admission?: 'task' | 'conversation' | 'pending' | 'unavailable'
        completion?: 'completed' | 'interrupted' | 'pending'
        review?: 'met' | 'not-met' | 'inconclusive' | 'unavailable'
        feedback?: NonNullable<ConversationAdmissionDecision['feedback']>['kind']
      } = {}) {
        const sessionId = options.sessionId ?? mainId
        const lifecycle = sha256(`lifecycle:${sessionId}`)
        const taskId = `conversation-task:${sha256({ sessionId, lifecycle, turn }).slice(7)}`
        evolution.recordConversationLearning({
          kind: 'task-started', taskId, sessionId, sessionLifecycleFingerprint: lifecycle,
          turn, startSeq: turn * 10, userMessageIds: [`PRIVATE message ${turn}`],
          requestDigest: sha256(`request ${turn}`), contextDigest: sha256('context'),
          scopeKey: 'PRIVATE workspace', consentRevision: 1, behaviorVersion: sha256({ schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey: 'PRIVATE workspace', rules: {} }),
        })
        const admission = options.admission ?? 'task'
        const decision: ConversationAdmissionDecision | null = admission === 'unavailable' ? null : {
          kind: admission === 'conversation' ? 'conversation' : 'task',
          objective: 'PRIVATE objective', criteria: ['PRIVATE criterion'], family: 'writing',
          evaluationMode: 'text', relatedTaskId: options.feedback === undefined ? null : firstTask,
          feedback: options.feedback === undefined ? null : {
            kind: options.feedback, quote: 'PRIVATE feedback quote', category: 'instruction-following',
          },
        }
        const admitted = {
          kind: 'task-admitted' as const, taskId, decision,
          qualityContract: conversationQualityContract(),
          proof: decision === null ? null : proof,
          unavailableReason: decision === null ? 'model-unavailable' as const : null,
        }
        if (admission !== 'pending') evolution.recordConversationLearning(admitted)
        if (options.completion !== 'pending') evolution.recordConversationLearning({
          kind: 'task-finished', taskId, endSeq: turn * 10 + 8,
          status: options.completion ?? 'completed', assistantMessageIds: [`PRIVATE answer ${turn}`],
          resultDigest: sha256(`answer ${turn}`), evidenceIds: [],
        })
        const reviewChecks = options.review === undefined || options.review === 'unavailable' ? undefined : parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({
          focus, verdict: options.review, category: options.review === 'not-met' ? 'instruction-following' : null,
          explanation: 'PRIVATE review explanation', evidenceQuotes: ['PRIVATE answer quote'],
          proof: { sessionId: `${taskId}:${focus}`, sessionDigest: sha256(`${taskId}:${focus}`), requestDigest: sha256(`review:${taskId}:${focus}`) },
          audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(`evidence:${taskId}`), units: { 'answer-1': { firstClaim: {
            quote: 'PRIVATE answer quote', kind: 'source-fact', status: options.review === 'met' ? 'supported' : options.review === 'not-met' ? 'unsupported' : 'uncertain',
            sourceIds: ['request-1'], explanation: 'PRIVATE claim explanation',
          }, additionalClaims: [] } } },
        })))
        if (options.review !== undefined) evolution.recordConversationLearning({
          kind: 'task-reviewed', taskId, admissionDigest: sha256(admitted), resultDigest: sha256(`answer ${turn}`),
          verdict: options.review === 'unavailable' ? 'inconclusive' : options.review,
          category: options.review === 'not-met' ? 'instruction-following' : null,
          explanation: 'PRIVATE review explanation', evidenceQuotes: ['PRIVATE answer quote'],
          proof: options.review === 'unavailable' ? null : proof,
          unavailableReason: options.review === 'unavailable' ? 'model-unavailable' : null,
          ...(reviewChecks === undefined ? {} : { ...conversationReviewConsensus(reviewChecks), reviewChecks }),
        })
        return taskId
      }
      const firstTask = record(1, { review: 'met' })
      record(2, { review: 'not-met', feedback: 'correction' })
      record(3, { review: 'inconclusive', feedback: 'positive' })
      record(4, { review: 'unavailable', feedback: 'preference' })
      record(5, { feedback: 'requirement-change' })
      record(6, { completion: 'pending' })
      record(7, { admission: 'conversation' })
      record(8, { admission: 'pending', completion: 'pending' })
      record(9, { admission: 'unavailable', completion: 'interrupted', review: 'unavailable' })
      record(1, { sessionId: 'other-main', review: 'met' })
      function nativeFeedback(sessionId: string, messageId: string, rating: 'positive' | 'negative', stale = false) {
        evolution.recordLearningFeedbackRevision({
          intake: { sessionId, messageId, feedbackVersion: 'v1', rating, note: 'PRIVATE native feedback',
            scopeKey: 'PRIVATE workspace', sessionDigest: sha256(sessionId), evidenceIds: [sha256(messageId)] },
          sessionLifecycleFingerprint: sha256(stale ? 'stale lifecycle' : `lifecycle:${sessionId}`),
        })
      }
      nativeFeedback(mainId, 'PRIVATE answer 1', 'positive')
      nativeFeedback(mainId, 'PRIVATE answer 2', 'negative')
      nativeFeedback(mainId, 'PRIVATE answer 3', 'negative')
      evolution.recordLearningFeedbackRetraction({ sessionId: mainId, messageId: 'PRIVATE answer 3',
        retractedFeedbackVersion: 'v1', sessionLifecycleFingerprint: sha256(`lifecycle:${mainId}`) })
      nativeFeedback(mainId, 'PRIVATE answer 4', 'negative', true)
      nativeFeedback(mainId, 'unrelated answer', 'negative')
      nativeFeedback('other-main', 'PRIVATE answer 1', 'positive')
      const ledgerPath = join(mounted.root, 'evolution', 'ledger.jsonl')
      const beforeLedger = readFileSync(ledgerPath, 'utf8')

      const result = await executeLearningStatus(mounted.ctx, main.agent)

      expect(result).toMatchObject({ isError: false, value: {
        history: {
          skillBoundRuns: 0, recordedOutcomes: 0, recordedAnalyses: 0,
          naturalConversation: {
            observedTurns: 10, identifiedTasks: 7, nonTaskTurns: 1,
            admissionsPending: 1, admissionsUnavailable: 1,
            completion: { pending: 2, completed: 7, interrupted: 1, failed: 0 },
            reviews: { pending: 1, unavailable: 2, met: 2, notMet: 1, inconclusive: 1 },
            feedback: { correction: 1, positive: 1, preference: 1, requirementChange: 1 },
            nativeFeedback: { activePositive: 2, activeNegative: 1, retracted: 1 },
          },
        },
        currentSession: { naturalConversation: {
          observedTurns: 9, identifiedTasks: 6, nonTaskTurns: 1,
          completion: { pending: 2, completed: 6, interrupted: 1, failed: 0 },
          reviews: { pending: 1, unavailable: 2, met: 1, notMet: 1, inconclusive: 1 },
          nativeFeedback: { activePositive: 1, activeNegative: 1, retracted: 1 },
        } },
      } })
      expect(JSON.stringify(result.value)).not.toContain('PRIVATE')
      expect(JSON.stringify(result.value)).not.toContain(firstTask)
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeLedger)
      expect(mounted.adapter.requests).toHaveLength(0)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('separates historical feedback assessments and guidance decisions from current activation without leaking material', async () => {
    const mounted = await mountConsentRuntime('natural-assessment-status')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const evolution = mounted.ctx.tianwenEvolution
      evolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
      const mainId = String(main.agent.session.id)
      const proof = { sessionId: 'PRIVATE judgment', sessionDigest: sha256('proof'), requestDigest: sha256('request') }
      const snapshot = (scopeKey: string, rule: string): GuidanceSnapshot => ({
        schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey, rules: { writing: `PRIVATE ${rule}` },
      })
      function task(sessionId: string, scopeKey: string): ConversationTask {
        const taskId = `PRIVATE task ${sessionId}`
        return {
          source: { kind: 'task-started', taskId, sessionId, sessionLifecycleFingerprint: sha256(sessionId),
            turn: 1, startSeq: 1, userMessageIds: ['PRIVATE request'], requestDigest: sha256('request'),
            contextDigest: sha256('context'), scopeKey, consentRevision: 1, behaviorVersion: guidanceVersion(snapshot(scopeKey, 'base')) },
          recordedAt: '2026-09-07T00:00:00.000Z',
          admission: { kind: 'task-admitted', taskId, decision: { kind: 'task', objective: 'PRIVATE objective',
            criteria: ['PRIVATE criterion'], family: 'writing', evaluationMode: 'text', relatedTaskId: null, feedback: null },
          proof, unavailableReason: null },
          completion: { kind: 'task-finished', taskId, endSeq: 5, status: 'completed',
            assistantMessageIds: ['PRIVATE answer'], resultDigest: sha256('answer'), evidenceIds: [] },
          review: { kind: 'task-reviewed', taskId, admissionDigest: sha256('admission'), resultDigest: sha256('answer'),
            verdict: 'met', category: null, explanation: 'PRIVATE original review', evidenceQuotes: [], proof, unavailableReason: null },
        }
      }
      const tasks = [task(mainId, 'PRIVATE main scope'), task('other-session', 'PRIVATE other scope')]
      function assessment(index: number, taskId: string, classification?: NonNullable<ConversationFeedbackAssessment['result']>['classification'], unavailable = false): ConversationFeedbackAssessment {
        const assessmentId = `PRIVATE assessment ${index}`
        return {
          started: { kind: 'feedback-assessment-started', assessmentId, taskId, admissionDigest: sha256('admission'),
            resultDigest: sha256('answer'), source: { kind: 'natural', sourceTaskId: 'PRIVATE correction', sourceAdmissionDigest: sha256('correction') },
            materialDigest: sha256('material'), consentRevision: 1 },
          startedAt: '2026-09-07T00:00:00.000Z',
          ...(classification === undefined ? {} : { result: { kind: 'feedback-assessed' as const, assessmentId, taskId, classification,
            category: classification === 'attributable-problem' ? 'instruction-following' as const : null,
            supplementalCriteria: classification === 'attributable-problem' ? ['PRIVATE supplemental criterion'] : [],
            explanation: 'PRIVATE feedback explanation', evidenceQuotes: ['PRIVATE feedback quote'], proof: unavailable ? null : proof,
            unavailableReason: unavailable ? 'model-unavailable' as const : null } }),
        }
      }
      const assessments = [
        assessment(1, tasks[0]!.source.taskId),
        assessment(2, tasks[0]!.source.taskId, 'inconclusive', true),
        assessment(3, tasks[0]!.source.taskId, 'attributable-problem'),
        assessment(4, tasks[0]!.source.taskId, 'preference'),
        assessment(5, tasks[0]!.source.taskId, 'positive'),
        assessment(6, tasks[0]!.source.taskId, 'requirement-change'),
        assessment(7, tasks[0]!.source.taskId, 'inconclusive'),
        assessment(8, tasks[1]!.source.taskId, 'attributable-problem'),
      ]
      function study(index: number, scopeKey: string, state: 'waiting' | 'stopped' | 'rejected' | 'inconclusive' | 'accepted' | 'active' | 'rolled-back', rule = 'candidate'): GuidanceStudy {
        const studyId = `guidance-study:${sha256(index).slice(7)}` as const
        const candidateSnapshot = snapshot(scopeKey, rule)
        const verdict = state === 'rejected' || state === 'inconclusive' ? state : 'accepted'
        return {
          opened: { kind: 'study-opened', studyId, scopeKey, family: 'writing', failureCategory: 'instruction-following',
            consentRevision: 1, parentVersion: guidanceVersion(snapshot(scopeKey, 'base')), parentSnapshot: snapshot(scopeKey, 'base'),
            sourceTaskIds: ['PRIVATE source 1', 'PRIVATE source 2'], counterexampleTaskId: 'PRIVATE counterexample',
            cases: [], modelConfigDigest: sha256('model') },
          openedAt: '2026-09-07T00:00:00.000Z', arms: [],
          ...(state === 'stopped' ? { stopped: { kind: 'study-stopped' as const, studyId, reason: 'cancelled' as const } } : {}),
          ...(state === 'waiting' || state === 'stopped' ? {} : {
            candidate: { kind: 'candidate-recorded' as const, studyId, candidateSnapshot, proposalProof: proof },
            decision: { kind: 'study-decided' as const, studyId, armsDigest: sha256('arms'), verdict },
          }),
          ...(state === 'active' || state === 'rolled-back' ? {
            activation: { kind: 'guidance-activated' as const, studyId, expectedParentVersion: guidanceVersion(snapshot(scopeKey, 'base')), decisionDigest: sha256('decision') },
          } : {}),
          ...(state === 'rolled-back' ? { rollback: { kind: 'guidance-rolled-back' as const, studyId,
            expectedCurrentVersion: guidanceVersion(candidateSnapshot), reason: 'support-retracted' as const, evidenceTaskIds: [] } } : {}),
        }
      }
      const mainScope = tasks[0]!.source.scopeKey
      const otherScope = tasks[1]!.source.scopeKey
      const studies = [
        study(1, mainScope, 'waiting'), study(2, mainScope, 'stopped'), study(3, mainScope, 'rejected'),
        study(4, mainScope, 'inconclusive'), study(5, mainScope, 'accepted'),
        study(6, mainScope, 'active', 'superseded'), study(7, mainScope, 'active', 'current'),
        study(8, mainScope, 'rolled-back', 'current'), study(9, otherScope, 'active', 'current'),
        study(10, mainScope, 'active', 'current'),
      ]
      vi.spyOn(evolution, 'listConversationTasks').mockReturnValue(tasks)
      vi.spyOn(evolution, 'listConversationFeedbackAssessments').mockReturnValue(assessments)
      vi.spyOn(evolution, 'listConversationGuidanceStudies').mockReturnValue(studies)
      const getGuidance = vi.spyOn(evolution, 'getConversationGuidance')
        .mockImplementation(scopeKey => snapshot(scopeKey, 'current'))
      const ledgerPath = join(mounted.root, 'evolution', 'ledger.jsonl')
      const beforeLedger = readFileSync(ledgerPath, 'utf8')

      const result = await executeLearningStatus(mounted.ctx, main.agent)

      expect(result).toMatchObject({ isError: false, value: {
        history: { skillBoundRuns: 0, recordedOutcomes: 0, naturalConversation: {
          reviews: { met: 2, notMet: 0 }, feedback: { correction: 0 },
          feedbackAssessments: { total: 8, pending: 1, unavailable: 1, attributableProblems: 2,
            preferences: 1, positive: 1, requirementChanges: 1, inconclusive: 1,
            scope: expect.stringMatching(/historical.*not.*original.*review/iu) },
          guidanceStudies: { total: 10, waiting: 1, stopped: 1, rejected: 1, accepted: 6,
            inconclusive: 1, currentlyActive: 2, rolledBack: 1, unavailableScopes: 0,
            scope: expect.stringMatching(/accepted.*historical.*not.*improvement/iu) },
        } },
        currentSession: { naturalConversation: {
          reviews: { met: 1, notMet: 0 },
          feedbackAssessments: { total: 7, pending: 1, unavailable: 1, attributableProblems: 1,
            preferences: 1, positive: 1, requirementChanges: 1, inconclusive: 1 },
          guidanceStudies: { total: 9, waiting: 1, stopped: 1, rejected: 1, accepted: 5,
            inconclusive: 1, currentlyActive: 1, rolledBack: 1, unavailableScopes: 0 },
        } },
      } })
      expect(getGuidance).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(result.value)).not.toContain('PRIVATE')
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeLedger)
      expect(mounted.adapter.requests).toHaveLength(0)

      getGuidance.mockImplementation(() => { throw new Error('PRIVATE artifact integrity failure') })
      const unavailable = await executeLearningStatus(mounted.ctx, main.agent)
      expect(unavailable).toMatchObject({ isError: false, value: {
        history: { naturalConversation: { guidanceStudies: { accepted: 6, currentlyActive: 0, unavailableScopes: 2 } } },
        currentSession: { naturalConversation: { guidanceStudies: { accepted: 5, currentlyActive: 0, unavailableScopes: 1 } } },
      } })
      expect(JSON.stringify(unavailable.value)).not.toContain('PRIVATE')
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reports bounded read-only learning status only for a main Session', async () => {
    const mounted = await mountConsentRuntime('learning-status')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSchema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_status')
      expect(mainSchema).toMatchObject({
        name: 'tianwen_learning_status',
        parameters: { type: 'object', properties: {} },
        description: expect.any(String),
      })
      expect(mainSchema?.description).toContain('current learning history')
      expect(mainSchema?.description).toContain('filesystem verification')
      expect(mainSchema?.description).toContain('current consent')
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_status')).toBe(false)
      const beforeConsent = mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()
      const beforeRequests = mounted.adapter.requests.length
      await expect(executeLearningStatus(mounted.ctx, child.agent)).resolves
        .toMatchObject({ isError: true })
      const status = await executeLearningStatus(mounted.ctx, main.agent)
      expect(status).toMatchObject(
        {
          isError: false,
          value: {
            guidance: expect.stringContaining('bounded snapshot is sufficient'),
            consent: { policyVersion: 'tianwen-auto-analysis.v3', enabled: false, revision: 0 },
            currentSession: {
              hasFrozenGovernedBinding: false,
              scope: expect.stringMatching(/hasFrozenGovernedBinding is false.*absence of a frozen governed binding limits the evidence.*does not prevent explicit-feedback analysis/u),
            },
            history: {
              scope: expect.stringContaining('Skill-bound Runs'),
              analysisScope: expect.stringContaining('explicit-feedback analyses'),
              skillBoundRuns: 0, recordedOutcomes: 0, recordedAnalyses: 0,
              analysesBySource: { outcome: 0, explicitFeedback: 0 },
            },
            nativeSkills: { available: false, skills: [] },
            learningSources: {
              scope: expect.stringContaining('Optional host-reviewed reusable external Skill sources'),
              configured: 0, skills: [], available: false,
            },
          },
        })
      expect(status.value?.learningSources).not.toHaveProperty('eligible')
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toBe(beforeConsent)
      expect(mounted.adapter.requests).toHaveLength(beforeRequests)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('reports real outcome and ordinary-feedback analyses, native bytes, and a pending notice without writing', async () => {
    const skill = {
      name: 'reviewed-native', description: 'Review one bounded fact.', content: 'Use only the supplied fact.',
      source: 'test', provider: 'test-reviewed', invocation: { modelInvocable: true, userInvocable: true },
    }
    const admission = {
      name: skill.name, provider: skill.provider, digest: sha256(skill),
      origin: 'https://example.invalid/reviewed-native', revision: 'v1', license: 'MIT' as const,
      reviewedAt: '2026-09-05T00:00:00.000Z', kind: 'self-contained-text' as const,
      runtime: '0.1.1-rc.2' as const, scopeKey: RESEARCH_SUMMARY_SCOPE,
      toolName: 'submit_research_summary',
    }
    const mounted = await mountConsentRuntime('learning-status-records', [], {
      nativeSkills: [skill], learningSkillSources: [admission],
    })
    const cwd = join(mounted.root, 'status-workspace')
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      meta: { cwd },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const ordinary = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-ordinary-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const evolution = mounted.ctx.tianwenEvolution
      evolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2',
      })
      function recordRun(sessionId: string, verdict: 'met' | 'not-met') {
        const binding = evolution.recordRunBinding({
          goalRef: 'goal:status', taskRef: 'task:status', sessionId,
          scopeKey: RESEARCH_SUMMARY_SCOPE, sessionLifecycleFingerprint: sha256(`lifecycle:${sessionId}`),
          acceptanceContract: { source: 'dsh-tool-result', toolName: 'status_check', notMetErrorCode: 'STATUS_NOT_MET', gapDisposition: 'reusable', problemCategory: 'status', severity: 1, blocksGoal: false },
        })
        const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill })
        const sessionDigest = sha256(sessionId)
        const evidenceId = sha256(`acceptance:${sessionId}`)
        const outcome = evolution.recordOutcomeIntake({
          runId: binding.runId, verdict, sessionDigest, evidenceIds: [evidenceId],
        })
        evolution.recordRunSkillUse({
          runId: binding.runId, parentVersionId: manifest.parentVersionId, sessionId, sessionDigest,
          skillName: skill.name, contentDigest: sha256(skill.content),
          skillEvidenceId: sha256(`skill:${sessionId}`), acceptanceEvidenceId: evidenceId,
          skillCallSeq: 1, skillResultSeq: 2, acceptanceCallSeq: 3,
        })
        return { binding, outcome }
      }
      const counter = recordRun(String(main.agent.session.id), 'met')
      recordRun('status-failed-first', 'not-met')
      const failed = recordRun('status-failed-second', 'not-met')
      evolution.requestOutcomeLearningAnalysis({
        ticketId: failed.outcome.ticketId!, sessionId: 'status-failed-second',
        parentSessionId: 'status-failed-second', consentRevision: 1,
        counterevidenceRunIds: [counter.binding.runId],
      })
      const ordinarySessionId = String(ordinary.agent.session.id)
      const feedback = evolution.recordLearningFeedbackRevision({
        intake: {
          sessionId: ordinarySessionId, messageId: 'ordinary-reply', feedbackVersion: 'feedback-v1',
          rating: 'negative', note: 'Keep the answer concrete.', scopeKey: RESEARCH_SUMMARY_SCOPE,
          sessionDigest: sha256(ordinarySessionId), evidenceIds: [sha256('ordinary-feedback-evidence')],
        },
        sessionLifecycleFingerprint: sha256(`lifecycle:${ordinarySessionId}`), analysisConsentRevision: 1,
      })
      evolution.requestLearningAnalysis({
        ticketId: feedback.ticketId!, sessionId: ordinarySessionId, messageId: 'ordinary-reply',
        feedbackVersion: 'feedback-v1', consentRevision: 1, parentSessionId: ordinarySessionId,
      })
      evolution.recordLearningConsentNoticeIntent({
        policyVersion: 'tianwen-auto-analysis.v2', mainSessionId: String(main.agent.session.id),
        noticeSourceMessageId: 'tianwen-learning-consent-notice:tianwen-auto-analysis.v2',
        deliveryId: 'tianwen-learning-consent-delivery:tianwen-auto-analysis.v2',
      })
      const ledgerPath = join(mounted.root, 'evolution', 'ledger.jsonl')
      const beforeLedger = readFileSync(ledgerPath, 'utf8')
      const snapshots = vi.spyOn(mounted.ctx.skills, 'snapshot')
      await expect(executeLearningStatus(mounted.ctx, main.agent)).resolves.toMatchObject({
        value: {
          consent: { policyVersion: 'tianwen-auto-analysis.v2', enabled: true, revision: 1 },
          currentSession: { hasFrozenGovernedBinding: true },
          history: {
            skillBoundRuns: 3, recordedOutcomes: 3, recordedAnalyses: 2,
            analysesBySource: { outcome: 1, explicitFeedback: 1 },
            analysisScope: expect.stringContaining('do not establish causality'),
          },
          nativeSkills: { available: true, skills: [{ name: skill.name, description: skill.description }] },
          learningSources: {
            scope: expect.stringContaining('not feedback or Outcome input'),
            configured: 1, eligible: 1, available: true, skills: [{ name: skill.name, description: skill.description }],
          },
        },
      })
      const lookups = snapshots.mock.calls.map(([lookup]) => lookup as {
        readonly cwd?: string
        readonly scope?: unknown
      })
      expect(lookups.some(lookup => lookup.cwd === cwd)).toBe(true)
      expect(lookups.some(lookup => lookup.scope === main.agent)).toBe(true)
      await expect(executeLearningStatus(mounted.ctx, ordinary.agent)).resolves.toMatchObject({
        value: {
          currentSession: { hasFrozenGovernedBinding: false },
          history: {
            skillBoundRuns: 3, recordedOutcomes: 3, recordedAnalyses: 2,
            analysesBySource: { outcome: 1, explicitFeedback: 1 },
          },
        },
      })
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus('tianwen-auto-analysis.v2'))
        .toMatchObject({ state: 'pending' })
      expect(mounted.adapter.requests).toHaveLength(0)

      const aborted = new AbortController()
      aborted.abort()
      await expect(executeLearningStatus(mounted.ctx, main.agent, aborted.signal)).resolves
        .toMatchObject({ isError: true })
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeLedger)
    } finally {
      await ordinary.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('projects only the current main learning audit newest-first with a bounded safe ledger', async () => {
    const mounted = await mountConsentRuntime('learning-status-current-audit')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSessionId = String(main.agent.session.id)
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2',
      })
      const analyses = Array.from({ length: 10 }, (_, index) => ({
        analysisId: `analysis:${String(index).padStart(64, '0')}`,
        ticketId: `ticket:${String(index).padStart(64, '0')}`,
        sessionId: mainSessionId,
        messageId: `reply-${index}`,
        feedbackVersion: `feedback-${index}`,
        consentRevision: 1,
        parentSessionId: mainSessionId,
        childSessionId: `child-${index}`,
        phase: index === 9 ? 'failed' : index === 8 ? 'candidate-ready' : 'running',
        requestedAt: `2026-09-05T00:00:${String(index).padStart(2, '0')}.000Z`,
        updatedAt: `2026-09-05T00:00:${String(index).padStart(2, '0')}.000Z`,
        submission: {
          verdict: 'skill-change',
          rationale: `PRIVATE RATIONALE ${index}`,
          candidatePatch: { content: `PRIVATE CORRECTION ${index}` },
          supportingEvidenceIds: [`sha256:${String(index).padStart(64, 'a')}`],
          counterevidenceIds: [],
        },
        submissionDigest: `sha256:${String(index).padStart(64, 'b')}`,
        ...(index < 8 ? {} : {
          candidateId: `candidate:${index}`,
          evaluationId: `evaluation:${index}`,
          evaluationResultDigest: `sha256:${String(index).padStart(64, 'c')}`,
        }),
        ...(index === 9 ? { resumePhase: 'candidate-ready' } : {}),
      }))
      analyses.push({
        ...analyses[9]!,
        analysisId: `analysis:${'f'.repeat(64)}`,
        ticketId: `ticket:${'f'.repeat(64)}`,
        sessionId: 'unrelated-main', parentSessionId: 'unrelated-main',
        updatedAt: '2026-09-05T01:00:00.000Z',
      })
      vi.spyOn(mounted.ctx.tianwenEvolution, 'listLearningAnalyses')
        .mockReturnValue(analyses as never)
      const ledgerPath = join(mounted.root, 'evolution', 'ledger.jsonl')
      const beforeLedger = readFileSync(ledgerPath, 'utf8')
      const beforeRequests = mounted.adapter.requests.length

      const result = await executeLearningStatus(mounted.ctx, main.agent)

      expect(result).toMatchObject({
        isError: false,
        value: {
          guidance: expect.stringMatching(/Runtime owns evaluation and activation.*unchanged counts do not prove unchanged evaluation.*tianwen_learning_continue/isu),
          currentSession: {
            learning: {
              owner: 'tianwen-runtime',
              truncated: true,
            },
          },
        },
      })
      const learning = (result.value?.currentSession as any).learning
      expect(learning.items).toHaveLength(8)
      expect(learning.items[0]).toMatchObject({
        analysisId: analyses[9]!.analysisId,
        phase: 'failed',
        receipts: {
          candidateId: 'candidate:9',
          evaluationId: 'evaluation:9',
          evaluationResultDigest: `sha256:${'9'.padStart(64, 'c')}`,
        },
        recovery: { resumePhase: 'candidate-ready' },
      })
      expect(learning.items[1]).toMatchObject({
        analysisId: analyses[8]!.analysisId,
        phase: 'candidate-ready',
        receipts: {
          candidateId: 'candidate:8',
          evaluationId: 'evaluation:8',
          evaluationResultDigest: `sha256:${'8'.padStart(64, 'c')}`,
        },
        recovery: null,
      })
      expect(learning.items.map((item: { readonly analysisId: string }) => item.analysisId))
        .toEqual(analyses.slice(2, 10).reverse().map(item => item.analysisId))
      expect(JSON.stringify(learning)).not.toContain('PRIVATE')
      expect(JSON.stringify(learning)).not.toContain('candidatePatch')
      expect(JSON.stringify(learning)).not.toContain('rationale')
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeLedger)
      expect(mounted.adapter.requests).toHaveLength(beforeRequests)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('offers an exact-empty main continuation tool with bounded acknowledgements', async () => {
    const mounted = await mountConsentRuntime('learning-continue-tool')
    const { main, child } = await createMainAndChild(mounted.ctx)
    const controlled = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-controlled-${randomUUID()}`),
      meta: { agentPreset: TIANWEN_CONTROLLED_AGENT_PRESET },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const schema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_continue')
      expect(schema).toMatchObject({
        name: 'tianwen_learning_continue',
        parameters: { type: 'object', properties: {} },
        description: expect.stringMatching(/natural continuation request.*does not imply evaluation success/su),
      })
      expect(JSON.stringify(schema)).not.toContain('analysisId')
      expect(JSON.stringify(schema)).not.toContain('sessionId')
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_continue')).toBe(false)
      expect(mounted.ctx.tools.schemas(controlled.agent).some(tool =>
        tool.name === 'tianwen_learning_continue')).toBe(false)

      const definition = mounted.ctx.tools.get('tianwen_learning_continue', main.agent)
      expect(definition).toBeDefined()
      await expect(definition!.execute({}, { agent: undefined } as never))
        .rejects.toThrow(/only in a main Session/u)
      await expect(definition!.execute({}, { agent: child.agent } as never))
        .rejects.toThrow(/only in a main Session/u)
      await expect(definition!.execute({}, { agent: controlled.agent } as never))
        .rejects.toThrow(/only in a main Session/u)
      await expect(executeLearningContinue(mounted.ctx, main.agent, { analysisId: 'private-target' }))
        .resolves.toMatchObject({ isError: true })
      await expect(executeLearningContinue(mounted.ctx, main.agent)).resolves.toMatchObject({
        isError: false,
        value: {
          state: 'unavailable', scheduledAnalyses: 0,
          guidance: expect.stringContaining('Scheduling does not imply evaluation success.'),
        },
      })

      const continueFromMain = vi.fn(() => 0)
      mounted.ctx.provide('tianwenLearningLoop', { continueFromMain } as never)
      await expect(executeLearningContinue(mounted.ctx, main.agent)).resolves.toMatchObject({
        value: { state: 'no-resumable-work', scheduledAnalyses: 0 },
      })
      continueFromMain.mockReturnValueOnce(2)
      await expect(executeLearningContinue(mounted.ctx, main.agent)).resolves.toMatchObject({
        value: { state: 'scheduled', scheduledAnalyses: 2 },
      })
      expect(continueFromMain).toHaveBeenLastCalledWith(main.agent)
      expect(mounted.adapter.requests).toHaveLength(0)
    } finally {
      await controlled.dispose()
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps native Skills available when the subsequent learning-source snapshot is incomplete', async () => {
    const skill = {
      name: 'reviewed-native', description: 'Review one bounded fact.', content: 'Use only the supplied fact.',
      source: 'test', provider: 'test-reviewed', invocation: { modelInvocable: true, userInvocable: true },
    }
    const admission = {
      name: skill.name, provider: skill.provider, digest: sha256(skill),
      origin: 'https://example.invalid/reviewed-native', revision: 'v1', license: 'MIT' as const,
      reviewedAt: '2026-09-05T00:00:00.000Z', kind: 'self-contained-text' as const,
      runtime: '0.1.1-rc.2' as const, scopeKey: RESEARCH_SUMMARY_SCOPE,
      toolName: 'submit_research_summary',
    }
    const mounted = await mountConsentRuntime('learning-status-incomplete-sources', [], {
      nativeSkills: [skill], learningSkillSources: [admission],
    })
    const cwd = join(mounted.root, 'status-workspace')
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      meta: { cwd },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const snapshot = mounted.ctx.skills.snapshot.bind(mounted.ctx.skills)
      const snapshots = vi.spyOn(mounted.ctx.skills, 'snapshot')
        .mockImplementationOnce(snapshot)
        .mockImplementationOnce(async options => ({ ...await snapshot(options), complete: false }))
      const signal = new AbortController().signal
      const status = await executeLearningStatus(mounted.ctx, main.agent, signal)
      expect(status).toMatchObject({
        isError: false,
        value: {
          nativeSkills: { available: true, skills: [{ name: skill.name, description: skill.description }] },
          learningSources: { configured: 1, skills: [], available: false },
        },
      })
      expect(status.value?.learningSources).not.toHaveProperty('eligible')
      expect(snapshots.mock.calls).toEqual([
        [{ cwd, scope: main.agent, signal }],
        [{ cwd, scope: main.agent, signal }],
      ])
      expect(mounted.adapter.requests).toHaveLength(0)
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps an available empty admission list distinct from an unavailable catalog', async () => {
    const skill = {
      name: 'native-only', description: 'Native but not admitted.', content: 'Read one fact.',
      source: 'test', provider: 'test-native', invocation: { modelInvocable: true, userInvocable: true },
    }
    const mounted = await mountConsentRuntime('learning-status-empty-admissions', [], { nativeSkills: [skill] })
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect(executeLearningStatus(mounted.ctx, main.agent)).resolves.toMatchObject({
        value: {
          nativeSkills: { available: true, skills: [{ name: skill.name }] },
          learningSources: { configured: 0, eligible: 0, available: true, skills: [] },
        },
      })
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('installs the strict action-only tool for the main Agent and not its subagent', async () => {
    const mounted = await mountConsentRuntime('installation')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const mainSchema = mounted.ctx.tools.schemas(main.agent).find(tool =>
        tool.name === 'tianwen_learning_consent')
      expect(mainSchema).toEqual({
        name: 'tianwen_learning_consent',
        description: expect.stringContaining(LEARNING_CONSENT_NOTICE_TEXT),
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['enable', 'disable', 'status'],
            },
          },
          required: ['action'],
        },
      })
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)
      expect(JSON.stringify(mainSchema)).not.toContain('sessionId')
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('uses the executing main Agent identity and rejects absent, child, or invalid arguments', async () => {
    const mounted = await mountConsentRuntime('identity')
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      const definition = mounted.ctx.tools.get('tianwen_learning_consent', main.agent)
      expect(definition).toBeDefined()
      await expect(definition!.execute(
        { action: 'status' },
        { agent: undefined } as never,
      )).rejects.toThrow(/only in a main Session/u)
      await expect(definition!.execute(
        { action: 'status' },
        { agent: child.agent } as never,
      )).rejects.toThrow(/only in a main Session/u)

      for (const args of [
        {},
        { action: 'other' },
        { action: 'status', sessionId: String(main.agent.session.id) },
        { action: 'enable', note: 'private' },
      ]) {
        const result = await executeConsent(mounted.ctx, main.agent, args)
        expect(result).toMatchObject({ isError: true })
      }
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent())
        .toBeUndefined()
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('treats a parentSession-only Agent as a child in installation, execution, and notice recovery', async () => {
    const mounted = await mountConsentRuntime('parent-only', [
      textResponse('Notice acknowledged.'),
    ])
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const child = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-parent-only-${randomUUID()}`),
      meta: { parentSession: main.agent.session.id },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(child.agent.session.header.parentSession)
        .toBe(main.agent.session.id)
      expect(child.agent.session.header.origin).toBeUndefined()
      expect(mounted.ctx.tools.schemas(child.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)

      const definition = mounted.ctx.tools.get(
        'tianwen_learning_consent',
        main.agent,
      )
      await expect(definition!.execute(
        { action: 'status' },
        { agent: child.agent } as never,
      )).rejects.toThrow(/only in a main Session/u)

      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await main.agent.whenIdle()
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(main.agent.session.id),
      })
      expect(child.agent.session.events.some(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toBe(false)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('increments profile consent only on state changes and returns privacy-safe status', async () => {
    const mounted = await mountConsentRuntime('actions', [textResponse('Notice acknowledged.')])
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const initial = await executeConsent(mounted.ctx, main.agent, { action: 'status' })
      expect(initial).toMatchObject({
        isError: false,
        value: {
          policyVersion: 'tianwen-auto-analysis.v3',
          enabled: false,
          revision: 0,
        },
      })
      const enabled = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(enabled).toMatchObject({
        isError: false,
        value: {
          policyVersion: 'tianwen-auto-analysis.v3',
          enabled: true,
          revision: 1,
        },
      })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state).toBe('delivered')
      const enabledReplay = await executeConsent(mounted.ctx, main.agent, { action: 'enable' })
      expect(enabledReplay).toMatchObject({
        isError: false,
        value: { enabled: true, revision: 1 },
      })
      const disabled = await executeConsent(mounted.ctx, main.agent, { action: 'disable' })
      expect(disabled).toMatchObject({
        isError: false,
        value: { enabled: false, revision: 2 },
      })
      expect(enabled.value?.disclosure).toBe(LEARNING_CONSENT_NOTICE_TEXT)
      const serialized = JSON.stringify([initial.value, enabledReplay.value, disabled.value])
      expect(serialized).not.toContain('note')
      expect(serialized).not.toContain('scope')
      expect(serialized).not.toMatch(/[A-Z]:\//u)
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('keeps feedback-only consent readable and upgrades it once through the main tool', async () => {
    const mounted = await mountConsentRuntime('policy-upgrade', [textResponse('Notice acknowledged.')])
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      mounted.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v1',
      })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'status' }))
        .toMatchObject({ value: { enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v1' } })
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
        .toMatchObject({ value: { enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v3' } })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state).toBe('delivered')
      expect(await executeConsent(mounted.ctx, main.agent, { action: 'enable' }))
        .toMatchObject({ value: { enabled: true, revision: 2, policyVersion: 'tianwen-auto-analysis.v3' } })
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('removes scoped tools on service unload and reinstalls once after reload', async () => {
    const mounted = await mountConsentRuntime('reload')
    const main = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-main-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(mounted.ctx.tools.schemas(main.agent).filter(tool =>
        tool.name === 'tianwen_learning_consent')).toHaveLength(1)
      await mounted.consentFiber.dispose()
      expect(mounted.ctx.tools.schemas(main.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)

      const reloaded = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await reloaded
      expect(mounted.ctx.tools.schemas(main.agent).filter(tool =>
        tool.name === 'tianwen_learning_consent')).toHaveLength(1)
      await reloaded.dispose()
    } finally {
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('hides all tool schemas only in the notice Turn and waits for a real user Turn to enable', async () => {
    const mounted = await mountConsentRuntime('notice-tool-visibility', [
      toolCallResponse('ordinary-before', 'ordinary_probe', {}),
      textResponse('The ordinary task is complete.'),
      // A provider can still invent a hidden tool call; the guard must deny it.
      toolCallResponse('notice-false-enable', 'tianwen_learning_consent', { action: 'enable' }),
      textResponse('You can agree in your next message to enable analysis.'),
      toolCallResponse('real-user-enable', 'tianwen_learning_consent', { action: 'enable' }),
      toolCallResponse('ordinary-after', 'ordinary_probe', {}),
      textResponse('Analysis is enabled and the ordinary task is complete.'),
    ])
    const { main, child } = await createMainAndChild(mounted.ctx)
    let toolRuns = 0
    const disposeProbe = main.agent.ctx.tools.register(defineTool({
      name: 'ordinary_probe', description: 'Do ordinary work.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { toolRuns += 1; return 'finished' },
    }))
    const disposeGlobal = mounted.ctx.tools.register(defineTool({
      name: 'ask_user_question', description: 'Ask the user a question.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { throw new Error('The notice must not ask through a tool') },
    }))
    const beforeSchemas = mounted.ctx.tools.schemas(main.agent)
    const childSchemas = mounted.ctx.tools.schemas(child.agent)
    const permissionCalls: string[] = []
    const disposePermission = main.agent.ctx.on('tools/pre-execute', async (execution, next) => {
      permissionCalls.push(String(execution.callId))
      return next()
    })
    try {
      main.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Do ordinary work.' }], source: { kind: 'user' } }))
      await main.agent.whenIdle()
      await mounted.ctx.tianwenLearningConsentAgent.observeConversationWithoutConsent(String(main.agent.session.id))
      await main.agent.whenIdle()
      expect(mounted.adapter.requests).toHaveLength(4)
      expect(mounted.adapter.requests.slice(2).map(request => request.tools ?? [])).toEqual([[], []])
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toBeUndefined()
      expect(toolRuns).toBe(1)
      expect(main.agent.session.events.find(event => event.type === 'tool/result'
        && String(event.data.message.content[0].toolCallId) === 'notice-false-enable')).toMatchObject({
        data: { message: { content: [{ isError: true,
          content: [{ type: 'text', text: expect.stringContaining('notices are read-only') }] }] } },
      })
      expect(mounted.ctx.tools.schemas(child.agent)).toEqual(childSchemas)
      main.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Yes, enable analysis, then do ordinary work again.' }], source: { kind: 'user' } }))
      await main.agent.whenIdle()
      expect(mounted.ctx.tianwenEvolution.getLearningAnalysisConsent()).toMatchObject({ enabled: true, revision: 1 })
      expect(toolRuns).toBe(2)
      expect(mounted.adapter.requests).toHaveLength(7)
      for (const request of [...mounted.adapter.requests.slice(0, 2), ...mounted.adapter.requests.slice(4)]) {
        expect(request.tools).toEqual(beforeSchemas.toSorted((left, right) => left.name.localeCompare(right.name)))
      }
      expect(permissionCalls).toEqual(['ordinary-before', 'notice-false-enable', 'real-user-enable', 'ordinary-after'])
      expect(mounted.ctx.tools.schemas(main.agent)).toEqual(beforeSchemas)
      expect(main.agent.session.events.filter(event => event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID)).toHaveLength(1)
    } finally {
      disposePermission(); disposeGlobal(); disposeProbe()
      await child.dispose(); await main.dispose(); await mounted.ctx.fiber.dispose()
    }
  })

  it('delivers the source-disclosing tool-disabled notice once to the exact main parent of child feedback', async () => {
    const mounted = await mountConsentRuntime('notice', [
      toolCallResponse('notice-tool-call', 'notice_probe', {}),
      textResponse('Notice acknowledged.'),
    ])
    let toolRuns = 0
    const disposeProbe = mounted.ctx.tools.register(defineTool({
      name: 'notice_probe',
      description: 'Must stay disabled during the notice.',
      parameters: {},
      output: {
        schema: { type: 'string', const: 'ran' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        toolRuns += 1
        return 'ran'
      },
    }))
    const { main, child } = await createMainAndChild(mounted.ctx)
    try {
      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await main.agent.whenIdle()

      expect(toolRuns).toBe(0)
      expect(mounted.adapter.requests).toHaveLength(2)
      const noticeEvent = main.agent.session.events.find(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID)
      expect(noticeEvent).toBeDefined()
      if (noticeEvent?.type !== 'user/message') throw new Error('notice missing')
      expect(noticeEvent.data.content).toEqual([{
        type: 'text',
        text: expect.stringContaining(LEARNING_CONSENT_NOTICE_TEXT),
      }])
      expect(LEARNING_CONSENT_NOTICE_TEXT).toContain('ordinary conversation turns')
      expect(LEARNING_CONSENT_NOTICE_TEXT).toContain('frozen behavior and Skill text')
      expect(LEARNING_CONSENT_NOTICE_TEXT).not.toContain('PRIVATE CORRECTION')
      expect(child.agent.session.events.some(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(main.agent.session.id),
        noticeSourceMessageId: LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID,
      })

      await mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      expect(mounted.adapter.requests).toHaveLength(2)
    } finally {
      await child.dispose()
      await main.dispose()
      disposeProbe()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('recovers delivery-after-ack failure across restart without running the notice twice', async () => {
    const root = tempRoot('notice-restart')
    const first = await mountConsentRuntimeAt(root, [textResponse('Notice acknowledged.')])
    const { main, child } = await createMainAndChild(first.ctx)
    const mainSessionId = main.agent.session.id
    const acknowledge = first.ctx.tianwenEvolution
      .recordLearningConsentNoticeDelivered.bind(first.ctx.tianwenEvolution)
    let failAcknowledgement = true
    first.ctx.tianwenEvolution.recordLearningConsentNoticeDelivered = input => {
      if (failAcknowledgement) {
        failAcknowledgement = false
        throw new Error('forced acknowledgement failure')
      }
      return acknowledge(input)
    }
    await expect(first.ctx.tianwenLearningConsentAgent
      .observeFeedbackWithoutConsent(String(child.agent.session.id)))
      .rejects.toThrow('forced acknowledgement failure')
    expect(first.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
      'tianwen-auto-analysis.v3',
    )?.state).toBe('pending')
    expect(first.adapter.requests).toHaveLength(1)
    await child.dispose()
    await main.dispose()
    await first.ctx.fiber.dispose()

    const recovered = await mountConsentRuntimeAt(root)
    const resumed = await recovered.ctx.agents.resume({
      resumeSessionId: mainSessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect.poll(() => recovered.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state)
        .toBe('delivered')
      expect(recovered.adapter.requests).toHaveLength(0)
      expect(resumed.agent.session.events.filter(event =>
        event.type === 'user/message'
        && String(event.data.id) === LEARNING_CONSENT_NOTICE_SOURCE_MESSAGE_ID))
        .toHaveLength(1)
    } finally {
      await resumed.dispose()
      await recovered.ctx.fiber.dispose()
    }
  })

  it('keeps an offline intent bound to its original main and fails closed without provable lineage', async () => {
    const mounted = await mountConsentRuntime('offline', [textResponse('Recovered notice.')])
    const { main, child } = await createMainAndChild(mounted.ctx)
    const mainSessionId = main.agent.session.id
    const childSessionId = child.agent.session.id
    const offline = vi.spyOn(mounted.ctx.agents, 'get').mockReturnValue(undefined)

    await mounted.ctx.tianwenLearningConsentAgent
      .observeFeedbackWithoutConsent(String(childSessionId))
    expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
      'tianwen-auto-analysis.v3',
    )).toMatchObject({
      state: 'pending',
      mainSessionId: String(mainSessionId),
    })
    expect(mounted.adapter.requests).toHaveLength(0)

    offline.mockRestore()
    try {
      await executeConsent(mounted.ctx, main.agent, { action: 'status' })
      await expect.poll(() => mounted.ctx.tianwenEvolution
        .getLearningConsentNoticeStatus('tianwen-auto-analysis.v3')?.state)
        .toBe('delivered')
      expect(mounted.adapter.requests).toHaveLength(1)
    } finally {
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }

    const missing = await mountConsentRuntime('missing-lineage')
    const orphan = await missing.ctx.agents.create({
      sessionId: SessionId(`consent-orphan-${randomUUID()}`),
      meta: {
        origin: 'subagent',
        parentSession: SessionId(`missing-parent-${randomUUID()}`),
        delegationDepth: 1,
      },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect(missing.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(orphan.agent.session.id)))
        .resolves.toBe(false)
      expect(missing.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toBeUndefined()
      expect(missing.adapter.requests).toHaveLength(0)
    } finally {
      await orphan.dispose()
      await missing.ctx.fiber.dispose()
    }
  })

  it('fails a parentless subagent orphan closed', async () => {
    const mounted = await mountConsentRuntime('parentless-orphan')
    const orphan = await mounted.ctx.agents.create({
      sessionId: SessionId(`consent-parentless-orphan-${randomUUID()}`),
      meta: {
        origin: 'subagent',
        delegationDepth: 1,
      },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      expect(mounted.ctx.tools.schemas(orphan.agent).some(tool =>
        tool.name === 'tianwen_learning_consent')).toBe(false)
      await expect(mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(orphan.agent.session.id)))
        .resolves.toBe(false)
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toBeUndefined()
    } finally {
      await orphan.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('rereads an exact committed intent after an append error and rejects a conflicting one', async () => {
    const exact = await mountConsentRuntime('intent-append-reread')
    const exactLineage = await createMainAndChild(exact.ctx)
    const exactRecord = exact.ctx.tianwenEvolution
      .recordLearningConsentNoticeIntent.bind(exact.ctx.tianwenEvolution)
    vi.spyOn(exact.ctx.agents, 'get').mockReturnValue(undefined)
    vi.spyOn(exact.ctx.tianwenEvolution, 'recordLearningConsentNoticeIntent')
      .mockImplementationOnce(input => {
        exactRecord(input)
        throw new Error('forced error after exact intent append')
      })
    try {
      await expect(exact.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(exactLineage.child.agent.session.id)))
        .resolves.toBe(true)
      expect(exact.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(exactLineage.main.agent.session.id),
      })
    } finally {
      await exactLineage.child.dispose()
      await exactLineage.main.dispose()
      await exact.ctx.fiber.dispose()
    }

    vi.restoreAllMocks()
    const conflict = await mountConsentRuntime('intent-append-conflict')
    const first = await createMainAndChild(conflict.ctx)
    const second = await createMainAndChild(conflict.ctx)
    const conflictingRecord = conflict.ctx.tianwenEvolution
      .recordLearningConsentNoticeIntent.bind(conflict.ctx.tianwenEvolution)
    vi.spyOn(conflict.ctx.tianwenEvolution, 'recordLearningConsentNoticeIntent')
      .mockImplementationOnce(input => {
        conflictingRecord({
          ...input,
          mainSessionId: String(second.main.agent.session.id),
        })
        throw new Error('forced conflicting intent append')
      })
    try {
      await expect(conflict.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(first.child.agent.session.id)))
        .rejects.toThrow('forced conflicting intent append')
      expect(conflict.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({
        state: 'pending',
        mainSessionId: String(second.main.agent.session.id),
      })
    } finally {
      await second.child.dispose()
      await second.main.dispose()
      await first.child.dispose()
      await first.main.dispose()
      await conflict.ctx.fiber.dispose()
    }
  })

  it('admits concurrent lineages in call-entry order and records one notice lifecycle across reload', async () => {
    const mounted = await mountConsentRuntime('concurrent-admission', [
      textResponse('Notice acknowledged.'),
    ])
    const first = await createMainAndChild(mounted.ctx)
    const second = await createMainAndChild(mounted.ctx)
    const gate = deferred()
    const inspected: string[] = []
    const inspect = mounted.ctx.sessionPersistence.inspect
      .bind(mounted.ctx.sessionPersistence)
    vi.spyOn(mounted.ctx.sessionPersistence, 'inspect')
      .mockImplementation(async sessionId => {
        const value = String(sessionId)
        inspected.push(value)
        if (value === String(first.child.agent.session.id)) await gate.promise
        return inspect(sessionId)
      })
    try {
      const firstObservation = mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(first.child.agent.session.id))
      await nextTurn()
      const secondObservation = mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(second.child.agent.session.id))
      await nextTurn()

      expect(inspected).not.toContain(String(second.child.agent.session.id))
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toBeUndefined()

      gate.resolve()
      await expect(Promise.all([firstObservation, secondObservation]))
        .resolves.toEqual([true, true])
      await first.main.agent.whenIdle()
      await second.main.agent.whenIdle()
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({
        state: 'delivered',
        mainSessionId: String(first.main.agent.session.id),
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      const ledger = readFileSync(
        join(mounted.root, 'evolution', 'ledger.jsonl'),
        'utf8',
      ).trim().split('\n').map(line => JSON.parse(line) as { readonly type: string })
      expect(ledger.filter(event =>
        event.type === 'learning-consent-notice-intent-recorded'))
        .toHaveLength(1)
      expect(ledger.filter(event =>
        event.type === 'learning-consent-notice-delivered'))
        .toHaveLength(1)

      await mounted.consentFiber.dispose()
      const reloaded = mounted.ctx.plugin(TianwenLearningConsentAgentService)
      await reloaded
      await expect(mounted.ctx.tianwenLearningConsentAgent
        .observeFeedbackWithoutConsent(String(second.child.agent.session.id)))
        .resolves.toBe(true)
      expect(mounted.adapter.requests).toHaveLength(1)
      await reloaded.dispose()
    } finally {
      gate.resolve()
      await second.child.dispose()
      await second.main.dispose()
      await first.child.dispose()
      await first.main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })

  it('waits an admitted lineage choice during unload and rejects later admissions', async () => {
    const mounted = await mountConsentRuntime('admission-unload', [
      textResponse('Notice acknowledged.'),
    ])
    const { main, child } = await createMainAndChild(mounted.ctx)
    const service = mounted.ctx.tianwenLearningConsentAgent
    const gate = deferred()
    const inspect = mounted.ctx.sessionPersistence.inspect
      .bind(mounted.ctx.sessionPersistence)
    vi.spyOn(mounted.ctx.sessionPersistence, 'inspect')
      .mockImplementation(async sessionId => {
        if (String(sessionId) === String(child.agent.session.id)) {
          await gate.promise
        }
        return inspect(sessionId)
      })
    try {
      const observation = service
        .observeFeedbackWithoutConsent(String(child.agent.session.id))
      await nextTurn()
      let disposed = false
      const disposal = mounted.consentFiber.dispose().then(() => {
        disposed = true
      })
      await nextTurn()
      expect(disposed).toBe(false)
      gate.resolve()
      await expect(observation).resolves.toBe(true)
      await disposal
      expect(mounted.ctx.tianwenEvolution.getLearningConsentNoticeStatus(
        'tianwen-auto-analysis.v3',
      )).toMatchObject({ mainSessionId: String(main.agent.session.id) })
      await expect(service
        .observeFeedbackWithoutConsent(String(child.agent.session.id)))
        .resolves.toBe(false)
    } finally {
      gate.resolve()
      await child.dispose()
      await main.dispose()
      await mounted.ctx.fiber.dispose()
    }
  })
})
