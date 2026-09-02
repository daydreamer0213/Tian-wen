import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import SubagentRuntime, { type SubagentProvider } from '@deepseek-ai/dsh-subagent'

const appendFault = vi.hoisted(() => ({
  mode: 'none' as 'none' | 'before-write' | 'after-write',
  eventType: '',
  phase: '',
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  const matches = (descriptor: number, buffer: Uint8Array, offset: number, length: number) => {
    if (appendFault.mode === 'none' || paths.get(descriptor)?.endsWith('ledger.jsonl') !== true) return false
    const line = Buffer.from(buffer).subarray(offset, offset + length).toString('utf8')
    return line.includes(`\"type\":\"${appendFault.eventType}\"`)
      && (appendFault.phase.length === 0 || line.includes(`\"phase\":\"${appendFault.phase}\"`))
  }
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      paths.set(descriptor, String(path))
      return descriptor
    },
    writeSync(
      descriptor: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position?: number | null,
    ) {
      if (appendFault.mode === 'before-write' && matches(descriptor, buffer, offset, length)) {
        appendFault.mode = 'none'
        throw Object.assign(new Error('forced pre-write ledger failure'), { code: 'EIO' })
      }
      const written = actual.writeSync(descriptor, buffer, offset, length, position)
      if (appendFault.mode === 'after-write' && matches(descriptor, buffer, offset, length)) {
        appendFault.mode = 'none'
        throw Object.assign(new Error('forced post-write ledger uncertainty'), { code: 'EIO' })
      }
      return written
    },
  }
})

import {
  Context,
  DynamicCordisRunnerService,
  SESSION_FORMAT_VERSION,
  ScriptedAdapter,
  Session,
  SessionId,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { MessageFeedbackItem, StreamChunk } from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  LedgerCommitUnknownError,
  learningSessionLifecycleFingerprint,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'
import {
  TianwenLearningLoopService,
  createExplicitCorrectionLearningLoopExecutor,
} from '../../packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'

const roots: string[] = []
const provider = 'tianwen-controlled-scripted'
const model = 'scripted'
const evidenceA = `sha256:${'1'.repeat(64)}` as const
const evidenceB = `sha256:${'2'.repeat(64)}` as const

const nativeProvider: SubagentProvider = {
  name: 'learning-loop-native',
  inheritsParentContext: false,
  capabilities: { outputSchema: false, depthLimit: false, toolFilter: true, persona: true },
  async start() { throw new Error('learning-loop test uses only continuable children') },
  async prepareContinuable() { return {} },
}

const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)
if (protocol === undefined) throw new Error('explicit correction protocol is unavailable')

class LifecycleNotMet extends HarnessError {
  constructor() {
    super('controlled lifecycle requirement was not met', protocol.acceptance.notMetErrorCode)
  }
}

class ControlledAdapter extends ScriptedAdapter {
  constructor(script: readonly (readonly StreamChunk[] | Error)[]) {
    super(script.map(entry => Array.isArray(entry) ? [...entry] : entry))
  }

  override providerRetryPolicy() {
    return {
      mode: 'normal' as const,
      maxRetries: 0,
      retryableCodes: [],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    }
  }
}

function root(name: string): string {
  const parent = resolve(process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe', 'learning-loop-controlled-executor')
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${name}-`))
  roots.push(value)
  return value
}

function hash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`
}

function materializeWorkspace(workspaceRoot: string, content: string): void {
  mkdirSync(workspaceRoot, { recursive: true })
  const path = join(workspaceRoot, 'brief.txt')
  try {
    writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    if (readFileSync(path, 'utf8') !== content) throw new Error('controlled workspace drift')
  }
}

function verifiedScript(id: string, subject: Readonly<Record<string, unknown>>) {
  return [
    toolCallResponse(`${id}-skill`, 'skill', { name: protocol.parentSkill.name }),
    toolCallResponse(`${id}-verify`, protocol.acceptance.toolName, { subject }),
    textResponse(`completed ${id}`),
  ]
}

function successfulControlledScript() {
  const arms = protocol.evaluationTaskDefinitions.flatMap(task =>
    (['baseline', 'candidate'] as const).flatMap(role => verifiedScript(
      `arm-${task.semanticType}-${role}`,
      { phase: 'evaluation', task: task.semanticType },
    )))
  const evaluators = protocol.evaluationTaskDefinitions.map(task => toolCallResponse(
    `evaluator-${task.semanticType}`,
    'submit_blind_evaluation',
    {
      status: 'scored', insufficientMaterial: false, reasonCode: 'score-submitted',
      scores: {
        x: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
        y: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
      },
    },
  ))
  const shadows = protocol.evaluationTaskDefinitions.flatMap(task => verifiedScript(
    `shadow-${task.semanticType}`,
    { phase: 'shadow', task: task.semanticType },
  ))
  return [
    ...arms,
    ...evaluators,
    ...shadows,
    ...verifiedScript('transition-promote', { phase: 'transition', kind: 'promote' }),
    ...verifiedScript('transition-rollback', { phase: 'transition', kind: 'rollback' }),
  ]
}

async function mountControlledRuntime(
  fixtureRoot: string,
  script: readonly (readonly StreamChunk[] | Error)[],
) {
  const harness = await mountPersistentHarness(join(fixtureRoot, 'sessions'), [])
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  const disposeSkill = harness.ctx.skills.register(protocol.parentSkill)
  const disposeVerifier = harness.ctx.tools.register(defineTool({
    name: protocol.acceptance.toolName,
    description: 'Verify one controlled lifecycle observation.',
    parameters: { subject: { type: 'object', additionalProperties: true, required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const subject = (args as { subject?: { phase?: unknown, task?: unknown } }).subject
      if (subject?.phase === 'evaluation'
        && String(exec.agent?.id).endsWith(':baseline')
        && (subject.task === 'original-defect' || subject.task === 'adjacent-transfer')) {
        throw new LifecycleNotMet()
      }
      return 'verified'
    },
  }))
  const adapter = new ControlledAdapter(script)
  harness.ctx.llm.registerAdapter([provider], adapter)
  const selection = { provider, model }
  harness.ctx.provide('agentDefaultModel', { currentSelection: () => ({ ...selection }) })
  await applyRuntime(harness.ctx, { evolutionRoot: join(fixtureRoot, 'evolution') })
  return {
    harness,
    adapter,
    selection,
    async dispose() {
      disposeVerifier()
      disposeSkill()
      await harness.ctx.fiber.dispose()
    },
  }
}

function feedbackSession(id: string, messageId: string, createdAt: number): Session {
  const sessionId = SessionId(id)
  const session = Session.create(sessionId, [], {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt,
  })
  session.append('assistant/message', {
    turn: 1,
    message: {
      id: messageId as never,
      role: 'assistant',
      content: [{ type: 'text', text: 'controlled answer' }],
      source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
    },
  }, { surfaceOp: 'append' })
  return session
}

class FeedbackBridgeCatalogs {
  readonly sessions = new Map<string, Session>()
  readonly rows = new Map<string, readonly MessageFeedbackItem[]>()

  readonly persistence = {
    list: async () => [],
    inspect: async (id: ReturnType<typeof SessionId>) => {
      const session = this.sessions.get(String(id))
      if (session === undefined) throw new Error('feedback bridge Session is unavailable')
      return { meta: session.header, events: session.events }
    },
  }

  readonly feedback = {
    list: async (request: { readonly sessionId: ReturnType<typeof SessionId> }) => ({
      ok: true as const,
      value: { items: structuredClone(this.rows.get(String(request.sessionId)) ?? []) },
    }),
  }
}

function feedbackItem(input: {
  readonly messageId: string
  readonly version: string
  readonly note: string
  readonly updatedAt: number
}): MessageFeedbackItem {
  return {
    messageId: input.messageId as never,
    rating: 'negative',
    note: input.note,
    version: input.version as never,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  }
}

async function mountFeedbackBridge(
  source: Awaited<ReturnType<typeof mountControlledRuntime>>['harness'],
  loop: { readonly schedule: (analysisId: string) => Promise<void> },
  catalogs: FeedbackBridgeCatalogs,
) {
  const ctx = new Context()
  const evolution = source.ctx.tianwenEvolution
  ctx.provide('sessionPersistence', catalogs.persistence as never)
  ctx.provide('messageFeedback', catalogs.feedback as never)
  ctx.provide('tianwenLearningIntake', {
    consume: (...args: Parameters<typeof source.ctx.tianwenLearningIntake.consume>) =>
      source.ctx.tianwenLearningIntake.consume(...args),
  } as never)
  ctx.provide('tianwenEvolution', {
    listLearningIntakeStatuses: (...args: Parameters<typeof evolution.listLearningIntakeStatuses>) =>
      evolution.listLearningIntakeStatuses(...args),
    getLearningIntakeStatus: (...args: Parameters<typeof evolution.getLearningIntakeStatus>) =>
      evolution.getLearningIntakeStatus(...args),
    getLearningAnalysisConsentBefore: (...args: Parameters<typeof evolution.getLearningAnalysisConsentBefore>) =>
      evolution.getLearningAnalysisConsentBefore(...args),
    recordLearningFeedbackRetraction: (...args: Parameters<typeof evolution.recordLearningFeedbackRetraction>) =>
      evolution.recordLearningFeedbackRetraction(...args),
    listLearningAnalyses: (...args: Parameters<typeof evolution.listLearningAnalyses>) =>
      evolution.listLearningAnalyses(...args),
    getRunBindingBySessionId: (...args: Parameters<typeof evolution.getRunBindingBySessionId>) =>
      evolution.getRunBindingBySessionId(...args),
  } as never)
  ctx.provide('tianwenLearningLoop', {
    schedule: (analysisId: string) => loop.schedule(analysisId),
  } as never)
  const fiber = ctx.plugin(TianwenMessageFeedbackBridgeService)
  await fiber
  return { ctx, bridge: ctx.tianwenMessageFeedbackBridge }
}

afterEach(() => {
  appendFault.mode = 'none'
  appendFault.eventType = ''
  appendFault.phase = ''
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('explicit-correction controlled learning-loop executor', () => {
  it('recovers durable promote, report, rollback, and repeated-learning boundaries across fresh Contexts', async () => {
    const previousProbeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = resolve(
      previousProbeRoot ?? 'D:/DevData/tianwen-dsh-probe',
    )
    const fixtureRoot = root('real-path')
    const feedbackCatalogs = new FeedbackBridgeCatalogs()
    const mainFeedbackSession = feedbackSession('main-session', 'assistant-message', 1)
    const independentFeedbackSession = feedbackSession('independent-session', 'independent-message', 2)
    feedbackCatalogs.sessions.set(String(mainFeedbackSession.id), mainFeedbackSession)
    feedbackCatalogs.sessions.set(String(independentFeedbackSession.id), independentFeedbackSession)
    const lifecycle = learningSessionLifecycleFingerprint({
      sessionId: String(mainFeedbackSession.id),
      createdAt: mainFeedbackSession.header.createdAt,
    })
    const independentLifecycle = learningSessionLifecycleFingerprint({
      sessionId: String(independentFeedbackSession.id),
      createdAt: independentFeedbackSession.header.createdAt,
    })
    let mounted = await mountControlledRuntime(fixtureRoot, successfulControlledScript())
    let { harness, adapter, selection } = mounted
    try {
      const current = harness.ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:explicit-correction', taskRef: 'task:research-summary',
        sessionId: 'main-session', scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
        acceptanceContract: protocol.acceptance, sessionLifecycleFingerprint: lifecycle,
      })
      const currentManifest = harness.ctx.tianwenEvolution.recordRunSkillManifest({
        runId: current.runId, skill: protocol.parentSkill,
      })
      harness.ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:independent-support', taskRef: 'task:independent-support',
        sessionId: 'independent-session', scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
        acceptanceContract: protocol.acceptance,
        sessionLifecycleFingerprint: independentLifecycle,
      })
      const consent = harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v1',
      })
      const intake = harness.ctx.tianwenEvolution.recordLearningFeedbackRevision({
        intake: {
          sessionId: 'main-session', messageId: 'assistant-message', feedbackVersion: 'feedback-v1',
          rating: 'negative', note: 'Preserve the verified result in the answer.',
          scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE, sessionDigest: lifecycle,
          evidenceIds: [evidenceA, evidenceB],
        },
        sessionLifecycleFingerprint: lifecycle, analysisConsentRevision: 1,
      })
      const feedbackUpdatedAt = Date.parse(consent.recordedAt) + 1
      feedbackCatalogs.rows.set(String(mainFeedbackSession.id), [feedbackItem({
        messageId: 'assistant-message', version: 'feedback-v1',
        note: 'Preserve the verified result in the answer.', updatedAt: feedbackUpdatedAt,
      })])
      const requested = harness.ctx.tianwenEvolution.requestLearningAnalysis({
        ticketId: intake.ticketId!, sessionId: 'main-session', messageId: 'assistant-message',
        feedbackVersion: 'feedback-v1', consentRevision: 1, parentSessionId: 'main-session',
      })
      harness.ctx.tianwenEvolution.recordLearningAnalysisChildStarted({
        analysisId: requested.analysisId, parentSessionId: 'main-session', childSessionId: requested.childSessionId,
      })
      harness.ctx.tianwenEvolution.recordLearningAnalysisSubmission({
        analysisId: requested.analysisId, childSessionId: requested.childSessionId,
        submission: {
          verdict: 'skill-change', hypothesis: 'The answer omitted the verified result.',
          lesson: {
            claim: 'State the verified result before interpretation.',
            when: 'A response summarizes a verified lifecycle observation.',
            notWhen: 'The user asks only for raw extraction.',
          },
          candidatePatch: {
            description: 'Summarize a controlled observation with its verified result.',
            whenToUse: 'When responding to a verified controlled lifecycle observation.',
            content: '# Controlled summary\n\nState the verified result before interpretation.',
          },
          supportingEvidenceIds: [evidenceA], counterevidenceIds: [evidenceB],
        },
      })

      await harness.ctx.plugin(SubagentRuntime)
      harness.ctx.subagents.registerProvider(nativeProvider)
      harness.ctx.llm.registerAdapter(['terminal-parent'], new ScriptedAdapter([
        textResponse('parent received the terminal report'),
      ]))
      harness.ctx.llm.registerAdapter(['terminal-child'], new ScriptedAdapter([
        textResponse('child is ready to report'),
      ]))
      const parent = (await harness.ctx.agents.create({
        sessionId: SessionId('main-session'),
        agentOptions: { provider: 'terminal-parent', model: 'scripted' },
      })).agent
      expect(await harness.ctx.sessions.flush(parent.session)).toBe(true)
      await harness.ctx.subagents.startContinuable({
        provider: nativeProvider.name,
        childId: SessionId(requested.childSessionId),
        label: 'Tianwen learning analysis',
        request: {
          parent,
          prompt: [{ type: 'text', text: 'Prepare the terminal report.' }],
          agentOptions: { provider: 'terminal-child', model: 'scripted' },
        },
        signal: AbortSignal.timeout(10_000),
      })
      await harness.ctx.agents.get(SessionId(requested.childSessionId))!.whenIdle()

      let deliverTerminalReport = async ({ context, text }: {
        readonly context: ReturnType<typeof context>
        readonly text: string
      }) => {
        const child = harness.ctx.agents.get(SessionId(String(context.status.childSessionId)))!
        return String(await harness.ctx.subagents.reportFrom(child, [{ type: 'text', text }], {
          delivery: 'next-step', signal: AbortSignal.timeout(10_000),
        }))
      }
      let findTerminalReport = async ({ context, text }: {
        readonly context: ReturnType<typeof context>
        readonly text: string
      }): Promise<string | undefined> => {
        const childSessionId = String(context.status.childSessionId)
        const parentAgent = harness.ctx.agents.get(SessionId(String(context.status.parentSessionId)))
        if (parentAgent === undefined) return undefined
        const expected = [{ type: 'text', text: `Background subagent ${childSessionId} reported:` }, {
          type: 'text', text,
        }]
        const exact = (event: unknown): string | undefined => {
          if (event === null || typeof event !== 'object') return undefined
          const typed = event as { readonly type?: unknown, readonly data?: unknown }
          if (typed.type !== 'user/message' || typed.data === null || typeof typed.data !== 'object') return undefined
          const message = typed.data as {
            readonly id?: unknown
            readonly source?: { readonly kind?: unknown, readonly senderSessionId?: unknown }
            readonly content?: unknown
          }
          return message.source?.kind === 'subagent-report'
            && String(message.source.senderSessionId) === childSessionId
            && sha256(message.content) === sha256(expected)
            && typeof message.id === 'string'
            ? message.id : undefined
        }
        const live = parentAgent.session.events.map(exact).find((id): id is string => id !== undefined)
        if (live !== undefined) return live
        const persisted = await harness.ctx.sessionPersistence.inspect(parentAgent.session.id)
        return persisted.events.map(exact).find((id): id is string => id !== undefined)
      }
      const makeExecutor = () => createExplicitCorrectionLearningLoopExecutor({
        root: join(fixtureRoot, 'workspaces'), materializeWorkspace,
        async environment() {
          const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
          const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
          const toolSchemas = harness.ctx.tools.schemas()
            .filter(schema => schema.name === 'skill' || schema.name === protocol.acceptance.toolName)
            .toSorted((left, right) => left.name.localeCompare(right.name))
          return { callConfig, retryPolicy, toolSchemas, rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST }
        },
        deliverTerminalReport: input => deliverTerminalReport(input as never),
        findTerminalReport: input => findTerminalReport(input as never),
      })
      let executor = makeExecutor()
      const context = () => ({
        ctx: harness.ctx,
        status: harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!,
      })

      await executor.freezeProtocol(context())
      const frozen = harness.ctx.tianwenEvolution.listControlledSkillEvalProtocols()
      expect(frozen).toHaveLength(1)
      expect(frozen[0]).toMatchObject({ ticketId: intake.ticketId })

      await executor.materializeCandidate(context())
      const candidateReady = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(candidateReady.phase).toBe('candidate-ready')
      expect(candidateReady.candidateId).toMatch(/^candidate:/u)
      expect(harness.ctx.tianwenEvolution.getRunSkillManifest(current.runId)?.parentVersionId)
        .toBe(currentManifest.parentVersionId)

      await executor.evaluate(context())
      const shadowReady = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(shadowReady).toMatchObject({ phase: 'shadow-ready' })
      expect(shadowReady.evaluationId).toMatch(/^evaluation:/u)
      expect(shadowReady.shadowId).toMatch(/^shadow:/u)
      expect(harness.ctx.tianwenEvolution.getControlledSkillEvaluation(shadowReady.evaluationId!))
        .toMatchObject({ evaluationId: shadowReady.evaluationId })
      expect(harness.ctx.tianwenEvolution.getControlledSkillShadow(shadowReady.shadowId!))
        .toMatchObject({ shadowId: shadowReady.shadowId })

      appendFault.mode = 'after-write'
      appendFault.eventType = 'learning-analysis-governed-outcome-recorded'
      appendFault.phase = 'promoted'
      await expect(executor.promote(context())).rejects.toMatchObject({
        name: LedgerCommitUnknownError.name,
      })
      expect(harness.ctx.tianwenEvolution.blocked).toBe(true)
      const requestsAfterVerifiedTransition = adapter.requests.length
      const transitionsAfterVerifiedPromotion = harness.ctx.tianwenEvolution
        .listControlledSkillTransitions().length

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, [])
      ;({ harness, adapter, selection } = mounted)
      executor = makeExecutor()
      expect(adapter.requests).toHaveLength(0)
      const promoted = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      const promotedShadow = harness.ctx.tianwenEvolution.getControlledSkillShadow(shadowReady.shadowId!)!
      const pointer = harness.ctx.tianwenEvolution.getControlledSkillScopePointer(promotedShadow.scopeKey)
      expect(promoted).toMatchObject({ phase: 'promoted' })
      expect(promoted.promotionTransitionId).toMatch(/^transition:/u)
      expect(pointer?.activeVersionId).toBe(
        promotedShadow.candidateVersionId,
      )
      expect(harness.ctx.tianwenEvolution.getControlledSkillTransition(promoted.promotionTransitionId!))
        .toMatchObject({ transitionId: promoted.promotionTransitionId })
      expect(harness.ctx.tianwenEvolution.getControlledSkillTransitionReceipt(promoted.promotionTransitionId!))
        .toMatchObject({ transitionId: promoted.promotionTransitionId, state: 'verified' })
      expect(harness.ctx.tianwenEvolution.listControlledSkillTransitions())
        .toHaveLength(transitionsAfterVerifiedPromotion)
      expect(requestsAfterVerifiedTransition).toBeGreaterThan(0)

      const future = await harness.ctx.agents.create({
        sessionId: SessionId('future-main-session'), agentOptions: { provider, model },
      })
      try {
        const futureBinding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
          future.agent,
          {
            goalRef: 'goal:future-explicit-correction', taskRef: 'task:future-research-summary',
            scopeKey: promotedShadow.scopeKey, acceptanceContract: protocol.acceptance,
          },
          protocol.parentSkill.name,
          harness.ctx.skills,
        )
        expect(futureBinding.parentVersionId).toBe(pointer?.activeVersionId)
      } finally {
        await future.dispose()
      }
      expect(harness.ctx.tianwenEvolution.getRunSkillManifest(current.runId)?.parentVersionId)
        .toBe(currentManifest.parentVersionId)

      await harness.ctx.plugin(SubagentRuntime)
      harness.ctx.subagents.registerProvider(nativeProvider)
      harness.ctx.llm.registerAdapter(['terminal-parent'], new ScriptedAdapter([
        textResponse('parent received the terminal report'),
      ]))
      harness.ctx.llm.registerAdapter(['terminal-child'], new ScriptedAdapter([
        textResponse('child resumed for its terminal report'),
      ]))
      const resumedParent = (await harness.ctx.agents.resume({
        resumeSessionId: SessionId('main-session'),
        agentOptions: { provider: 'terminal-parent', model: 'scripted' },
      })).agent
      await harness.ctx.subagents.followup(
        resumedParent,
        SessionId(requested.childSessionId),
        [{ type: 'text', text: 'Resume only to deliver the governed terminal report.' }],
        {
          source: { kind: 'coordinator', form: 'relay', senderSessionId: resumedParent.session.id },
          signal: AbortSignal.timeout(10_000),
        },
      )
      await harness.ctx.agents.get(SessionId(requested.childSessionId))!.whenIdle()

      appendFault.mode = 'before-write'
      appendFault.eventType = 'learning-analysis-terminal-report-delivered'
      appendFault.phase = ''
      await expect(executor.report(context())).rejects.toMatchObject({
        name: LedgerCommitUnknownError.name,
      })
      expect(harness.ctx.tianwenEvolution.blocked).toBe(true)
      await resumedParent.whenIdle()
      expect(await harness.ctx.sessions.flush(resumedParent.session)).toBe(true)
      const persistedAfterReport = await harness.ctx.sessionPersistence.inspect(resumedParent.session.id)
      const terminalMessages = persistedAfterReport.events.filter(event =>
        event.type === 'user/message'
        && event.data.source?.kind === 'subagent-report'
        && String(event.data.source.senderSessionId) === requested.childSessionId
        && JSON.stringify(event.data.content).includes('候选 Skill 已通过验证'))
      expect(terminalMessages).toHaveLength(1)
      const reportMessageId = String(terminalMessages[0]!.data.id)

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, successfulControlledScript().slice(-3))
      ;({ harness, adapter, selection } = mounted)
      const replayedParent = (await harness.ctx.agents.resume({
        resumeSessionId: SessionId('main-session'),
        agentOptions: { provider: 'terminal-parent', model: 'scripted' },
      })).agent
      deliverTerminalReport = async () => {
        throw new Error('persisted terminal report must be recovered without redelivery')
      }
      executor = makeExecutor()
      await executor.report(context())
      const terminal = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(terminal.terminalReportDelivery).toMatchObject({
        state: 'delivered', reportMessageId,
      })
      const replayedInspection = await harness.ctx.sessionPersistence.inspect(replayedParent.session.id)
      expect(replayedInspection.events.filter(event =>
        event.type === 'user/message'
        && event.data.source?.kind === 'subagent-report'
        && JSON.stringify(event.data.content).includes('候选 Skill 已通过验证')))
        .toHaveLength(1)

      let learningLoop = new TianwenLearningLoopService(harness.ctx, { executor })
      let schedule = vi.spyOn(learningLoop, 'schedule')
      let feedbackBridge = await mountFeedbackBridge(harness, learningLoop, feedbackCatalogs)
      feedbackCatalogs.rows.set(String(independentFeedbackSession.id), [feedbackItem({
        messageId: 'independent-message', version: 'independent-v1',
        note: 'PRESERVE THE VERIFIED RESULT IN THE ANSWER.', updatedAt: feedbackUpdatedAt,
      })])
      const independentReconciliation = await feedbackBridge.bridge
        .reconcileSession(String(independentFeedbackSession.id))
      expect(independentReconciliation).toMatchObject({ state: 'reconciled' })
      await Promise.allSettled(schedule.mock.results.map(result => result.value))
      const independent = harness.ctx.tianwenEvolution
        .getLearningIntakeStatus('independent-session', 'independent-message')!
      expect(independent.ticketId).toBe(intake.ticketId)

      feedbackCatalogs.rows.set(String(mainFeedbackSession.id), [])
      schedule.mockClear()
      await feedbackBridge.bridge.reconcileSession(String(mainFeedbackSession.id))
      await Promise.allSettled(schedule.mock.results.map(result => result.value))
      expect(harness.ctx.tianwenEvolution.hasLearningAnalysisActiveSupport(requested.analysisId)).toBe(true)
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)?.phase).toBe('promoted')
      expect(harness.ctx.tianwenEvolution.listControlledSkillTransitions())
        .toHaveLength(transitionsAfterVerifiedPromotion)

      appendFault.mode = 'before-write'
      appendFault.eventType = 'learning-analysis-governed-outcome-recorded'
      appendFault.phase = 'rolled-back'
      feedbackCatalogs.rows.set(String(independentFeedbackSession.id), [])
      schedule.mockClear()
      await feedbackBridge.bridge.reconcileSession(String(independentFeedbackSession.id))
      await Promise.allSettled(schedule.mock.results.map(result => result.value))
      expect(harness.ctx.tianwenEvolution.hasLearningAnalysisActiveSupport(requested.analysisId)).toBe(false)
      expect(schedule).toHaveBeenCalledWith(requested.analysisId)
      await vi.waitFor(() => expect(harness.ctx.tianwenEvolution.blocked).toBe(true), {
        timeout: 10_000,
      })
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId))
        .toMatchObject({ phase: 'promoted' })
      const requestsAfterVerifiedRollback = adapter.requests.length
      await feedbackBridge.ctx.fiber.dispose()

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, [])
      ;({ harness, adapter, selection } = mounted)
      executor = makeExecutor()
      await harness.ctx.plugin(SubagentRuntime)
      harness.ctx.subagents.registerProvider(nativeProvider)
      let releaseRollbackChild!: () => void
      const rollbackChildGate = new Promise<void>(resolveGate => {
        releaseRollbackChild = resolveGate
      })
      const disposeRollbackChildGate = harness.ctx.tools.register(defineTool({
        name: 'rollback_report_gate',
        description: 'Keep the native learning child resident until the rollback report is delivered.',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          await rollbackChildGate
          return 'rollback report delivered'
        },
      }))
      harness.ctx.llm.registerAdapter(['terminal-parent'], new ScriptedAdapter([
        textResponse('parent received the rollback report'),
      ]))
      harness.ctx.llm.registerAdapter(['terminal-child'], new ScriptedAdapter([
        toolCallResponse('rollback-report-gate-call', 'rollback_report_gate', {}),
        textResponse('child resumed for its rollback report'),
      ]))
      const rollbackParent = (await harness.ctx.agents.resume({
        resumeSessionId: SessionId('main-session'),
        agentOptions: { provider: 'terminal-parent', model: 'scripted' },
      })).agent
      await harness.ctx.subagents.followup(
        rollbackParent,
        SessionId(requested.childSessionId),
        [{ type: 'text', text: 'Resume only to deliver the governed rollback report.' }],
        {
          source: { kind: 'coordinator', form: 'relay', senderSessionId: rollbackParent.session.id },
          signal: AbortSignal.timeout(10_000),
        },
      )
      await vi.waitFor(() => expect(harness.ctx.agents.get(SessionId(requested.childSessionId))
        ?.session.events.some(event => event.type === 'tool/call')).toBe(true))
      deliverTerminalReport = async ({ context: reportContext, text }: {
        readonly context: ReturnType<typeof context>
        readonly text: string
      }) => {
        const child = harness.ctx.agents.get(SessionId(String(reportContext.status.childSessionId)))!
        return String(await harness.ctx.subagents.reportFrom(child, [{ type: 'text', text }], {
          delivery: 'next-step', signal: AbortSignal.timeout(10_000),
        }))
      }
      executor = makeExecutor()
      learningLoop = new TianwenLearningLoopService(harness.ctx, { executor })
      schedule = vi.spyOn(learningLoop, 'schedule')
      feedbackBridge = await mountFeedbackBridge(harness, learningLoop, feedbackCatalogs)
      try {
        await feedbackBridge.bridge.reconcileSession(String(independentFeedbackSession.id))
        const replaySchedules = await Promise.allSettled(schedule.mock.results.map(result => result.value))
        expect(replaySchedules.filter(result => result.status === 'rejected')).toEqual([])
      } finally {
        releaseRollbackChild()
        disposeRollbackChildGate()
        await feedbackBridge.ctx.fiber.dispose()
      }
      expect(adapter.requests).toHaveLength(0)
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)?.phase).toBe('rolled-back')
      expect(harness.ctx.tianwenEvolution.getControlledSkillScopePointer(promotedShadow.scopeKey)?.activeVersionId)
        .toBe(currentManifest.parentVersionId)
      expect(requestsAfterVerifiedRollback).toBe(3)
      await rollbackParent.whenIdle()
      expect(await harness.ctx.sessions.flush(rollbackParent.session)).toBe(true)
      const reportedRollback = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(reportedRollback).toMatchObject({
        phase: 'rolled-back', terminalReportDelivery: { state: 'delivered' },
      })
      expect(reportedRollback.terminalReportHistory).toHaveLength(1)
      const afterRollbackReport = await harness.ctx.sessionPersistence.inspect(rollbackParent.session.id)
      expect(afterRollbackReport.events.filter(event =>
        event.type === 'user/message'
        && event.data.source?.kind === 'subagent-report'
        && JSON.stringify(event.data.content).includes('支持已撤回')))
        .toHaveLength(1)

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, [])
      ;({ harness, adapter, selection } = mounted)
      await harness.ctx.plugin(SubagentRuntime)
      harness.ctx.subagents.registerProvider(nativeProvider)
      harness.ctx.llm.registerAdapter(['terminal-parent'], new ScriptedAdapter([
        textResponse('parent must not receive a duplicate rollback report'),
      ]))
      const rollbackReplayParent = (await harness.ctx.agents.resume({
        resumeSessionId: SessionId('main-session'),
        agentOptions: { provider: 'terminal-parent', model: 'scripted' },
      })).agent
      deliverTerminalReport = async () => {
        throw new Error('delivered rollback report must not be redelivered after restart')
      }
      executor = makeExecutor()
      await executor.report(context())
      const replayedRollbackReport = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(replayedRollbackReport.terminalReportDelivery).toMatchObject({ state: 'delivered' })
      expect(replayedRollbackReport.terminalReportHistory).toMatchObject([{ state: 'delivered' }])
      const afterRollbackReplay = await harness.ctx.sessionPersistence.inspect(rollbackReplayParent.session.id)
      expect(afterRollbackReplay.events.filter(event =>
        event.type === 'user/message'
        && event.data.source?.kind === 'subagent-report'
        && JSON.stringify(event.data.content).includes('支持已撤回')))
        .toHaveLength(1)

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, successfulControlledScript())
      ;({ harness, adapter, selection } = mounted)
      const secondTerminalReports: string[] = []
      let rejectNextSecondTerminalReport = true
      deliverTerminalReport = async ({ text }) => {
        if (rejectNextSecondTerminalReport) {
          rejectNextSecondTerminalReport = false
          throw new Error('forced report delivery outage after durable intent')
        }
        secondTerminalReports.push(text)
        return 'second-rollback-terminal-report'
      }
      findTerminalReport = async () => undefined
      executor = makeExecutor()
      const secondRun = harness.ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:second-explicit-correction', taskRef: 'task:second-research-summary',
        sessionId: 'second-main-session', scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
        acceptanceContract: protocol.acceptance,
        sessionLifecycleFingerprint: `sha256:${'c'.repeat(64)}`,
      })
      harness.ctx.tianwenEvolution.recordRunSkillManifest({
        runId: secondRun.runId, skill: protocol.parentSkill,
      })
      const secondIntake = harness.ctx.tianwenEvolution.recordLearningFeedbackRevision({
        intake: {
          sessionId: 'second-main-session', messageId: 'second-assistant-message',
          feedbackVersion: 'second-feedback-v1', rating: 'negative',
          note: 'Keep the evidence order stable in the final answer.',
          scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
          sessionDigest: `sha256:${'c'.repeat(64)}`,
          evidenceIds: [`sha256:${'5'.repeat(64)}`, `sha256:${'6'.repeat(64)}`],
        },
        sessionLifecycleFingerprint: `sha256:${'c'.repeat(64)}`,
        analysisConsentRevision: 1,
      })
      const secondRequested = harness.ctx.tianwenEvolution.requestLearningAnalysis({
        ticketId: secondIntake.ticketId!, sessionId: 'second-main-session',
        messageId: 'second-assistant-message', feedbackVersion: 'second-feedback-v1',
        consentRevision: 1, parentSessionId: 'second-main-session',
      })
      harness.ctx.tianwenEvolution.recordLearningAnalysisChildStarted({
        analysisId: secondRequested.analysisId, parentSessionId: 'second-main-session',
        childSessionId: secondRequested.childSessionId,
      })
      harness.ctx.tianwenEvolution.recordLearningAnalysisSubmission({
        analysisId: secondRequested.analysisId,
        childSessionId: secondRequested.childSessionId,
        submission: {
          verdict: 'skill-change', hypothesis: 'The evidence order was unstable.',
          lesson: {
            claim: 'Preserve evidence order before interpretation.',
            when: 'A response summarizes ordered evidence.',
            notWhen: 'The user requests an unordered set.',
          },
          candidatePatch: {
            description: 'Summarize controlled observations in evidence order.',
            whenToUse: 'When responding to ordered controlled evidence.',
            content: '# Controlled summary\n\nPreserve evidence order and state the verified result.',
          },
          supportingEvidenceIds: [`sha256:${'5'.repeat(64)}`],
          counterevidenceIds: [`sha256:${'6'.repeat(64)}`],
        },
      })
      const secondContext = () => ({
        ctx: harness.ctx,
        status: harness.ctx.tianwenEvolution.getLearningAnalysis(secondRequested.analysisId)!,
      })
      const firstSessionIds = protocol.buildEvaluationTasks({
        root: join(fixtureRoot, 'identity-check-first'), materializeWorkspace,
        sessionNamespace: requested.analysisId,
      }).flatMap(task => [task.baselineSessionId, task.candidateSessionId, task.evaluatorSessionId])
      const secondSessionIds = protocol.buildEvaluationTasks({
        root: join(fixtureRoot, 'identity-check-second'), materializeWorkspace,
        sessionNamespace: secondRequested.analysisId,
      }).flatMap(task => [task.baselineSessionId, task.candidateSessionId, task.evaluatorSessionId])
      expect(secondSessionIds.some(id => firstSessionIds.includes(id))).toBe(false)

      await executor.freezeProtocol(secondContext())
      await executor.materializeCandidate(secondContext())
      await executor.evaluate(secondContext())
      await executor.promote(secondContext())
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(secondRequested.analysisId)?.phase)
        .toBe('promoted')

      const recoveryService = new TianwenLearningLoopService(harness.ctx, { executor })
      await recoveryService.schedule(secondRequested.analysisId)
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(secondRequested.analysisId))
        .toMatchObject({
          phase: 'failed', resumePhase: 'promoted',
          terminalReportDelivery: { state: 'pending' },
        })

      harness.ctx.tianwenEvolution.recordLearningFeedbackRetraction({
        sessionId: 'second-main-session', messageId: 'second-assistant-message',
        retractedFeedbackVersion: 'second-feedback-v1',
        sessionLifecycleFingerprint: `sha256:${'c'.repeat(64)}`,
      })
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(secondRequested.analysisId))
        .toMatchObject({ phase: 'failed', resumePhase: 'promoted' })
      await recoveryService.schedule(secondRequested.analysisId)
      const secondTerminal = harness.ctx.tianwenEvolution.getLearningAnalysis(secondRequested.analysisId)!
      expect(secondTerminal.phase).toBe('rolled-back')
      expect(secondTerminal.terminalReportDelivery).toMatchObject({
        state: 'delivered', reportMessageId: 'second-rollback-terminal-report',
      })
      expect(secondTerminal.terminalReportHistory).toMatchObject([{ state: 'pending' }])
      expect(secondTerminalReports).toEqual([
        'Tianwen 分析结论：支持已撤回，已验证回滚至父版本。',
      ])
      await recoveryService.schedule(secondRequested.analysisId)
      expect(secondTerminalReports).toHaveLength(1)
      expect(harness.ctx.tianwenEvolution.listEvents().filter(event =>
        event.type === 'learning-analysis-invalidated'
        && event.analysisId === secondRequested.analysisId)).toHaveLength(0)
      expect(harness.ctx.tianwenEvolution.getControlledSkillScopePointer(promotedShadow.scopeKey)?.activeVersionId)
        .toBe(currentManifest.parentVersionId)
      expect(hash({ current: currentManifest.parentVersionId, future: pointer?.activeVersionId }))
        .toMatch(/^sha256:[a-f0-9]{64}$/u)

      await mounted.dispose()
      mounted = await mountControlledRuntime(fixtureRoot, [])
      ;({ harness, adapter, selection } = mounted)
      deliverTerminalReport = async () => {
        throw new Error('delivered rollback report must not be redelivered after pending-intent restart')
      }
      executor = makeExecutor()
      await executor.report(secondContext())
      const replayedSecondTerminal = harness.ctx.tianwenEvolution
        .getLearningAnalysis(secondRequested.analysisId)!
      expect(replayedSecondTerminal.terminalReportDelivery).toMatchObject({
        state: 'delivered', reportMessageId: 'second-rollback-terminal-report',
      })
      expect(replayedSecondTerminal.terminalReportHistory).toMatchObject([{ state: 'pending' }])
      expect(secondTerminalReports).toHaveLength(1)
    } finally {
      await mounted.dispose()
      if (previousProbeRoot === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previousProbeRoot
    }
  }, 120_000)
})
