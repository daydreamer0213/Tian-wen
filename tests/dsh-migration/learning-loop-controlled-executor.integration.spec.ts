import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'

import {
  DynamicCordisRunnerService,
  ScriptedAdapter,
  SessionId,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { StreamChunk } from '@tianwen/dsh-compat'
import { CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST } from '../../packages/tianwen-evolution/src/index.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'
import {
  createExplicitCorrectionLearningLoopExecutor,
} from '../../packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.js'

const roots: string[] = []
const provider = 'tianwen-controlled-scripted'
const model = 'scripted'
const lifecycle = `sha256:${'a'.repeat(64)}` as const
const evidenceA = `sha256:${'1'.repeat(64)}` as const
const evidenceB = `sha256:${'2'.repeat(64)}` as const

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

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('explicit-correction controlled learning-loop executor', () => {
  it('runs durable correction evidence through real arms, blind evaluation, Shadow, verified promotion, and one terminal report', async () => {
    const previousProbeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    process.env.TIANWEN_DSH_PROBE_ROOT = resolve(
      previousProbeRoot ?? 'D:/DevData/tianwen-dsh-probe',
    )
    const fixtureRoot = root('real-path')
    const harness = await mountPersistentHarness(join(fixtureRoot, 'sessions'), [])
    let disposeSkill: (() => void) | undefined
    let disposeVerifier: (() => void) | undefined
    try {
      await harness.ctx.plugin(SkillRegistry)
      await harness.ctx.plugin(applySkillTool)
      await harness.ctx.plugin(DynamicCordisRunnerService, {})
      disposeSkill = harness.ctx.skills.register(protocol.parentSkill)
      disposeVerifier = harness.ctx.tools.register(defineTool({
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
      const adapter = new ControlledAdapter(successfulControlledScript())
      harness.ctx.llm.registerAdapter([provider], adapter)
      const selection = { provider, model }
      harness.ctx.provide('agentDefaultModel', { currentSelection: () => ({ ...selection }) })
      await applyRuntime(harness.ctx, { evolutionRoot: join(fixtureRoot, 'evolution') })

      const current = harness.ctx.tianwenEvolution.recordRunBinding({
        goalRef: 'goal:explicit-correction', taskRef: 'task:research-summary',
        sessionId: 'main-session', scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
        acceptanceContract: protocol.acceptance, sessionLifecycleFingerprint: lifecycle,
      })
      const currentManifest = harness.ctx.tianwenEvolution.recordRunSkillManifest({
        runId: current.runId, skill: protocol.parentSkill,
      })
      harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({
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

      const reports: string[] = []
      const executor = createExplicitCorrectionLearningLoopExecutor({
        root: join(fixtureRoot, 'workspaces'), materializeWorkspace,
        async environment() {
          const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
          const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
          const toolSchemas = harness.ctx.tools.schemas()
            .filter(schema => schema.name === 'skill' || schema.name === protocol.acceptance.toolName)
            .toSorted((left, right) => left.name.localeCompare(right.name))
          return { callConfig, retryPolicy, toolSchemas, rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST }
        },
        async deliverTerminalReport({ text }) { reports.push(text); return 'main-chat-terminal-message' },
        findTerminalReport({ text }) {
          return reports.includes(text) ? 'main-chat-terminal-message' : undefined
        },
      })
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

      // Simulate the narrow crash window: native verification has committed
      // the pointer, but the following analysis outcome append is uncertain.
      const evolution = harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisPromoted: (input: unknown) => unknown
      }
      const recordPromoted = evolution.recordLearningAnalysisPromoted
      let failOutcomeOnce = true
      evolution.recordLearningAnalysisPromoted = input => {
        if (failOutcomeOnce) {
          failOutcomeOnce = false
          throw new Error('forced outcome append uncertainty')
        }
        return recordPromoted.call(harness.ctx.tianwenEvolution, input)
      }
      await expect(executor.promote(context())).rejects.toThrow(/forced outcome append uncertainty/u)
      evolution.recordLearningAnalysisPromoted = recordPromoted
      const requestsAfterVerifiedTransition = adapter.requests.length
      await executor.promote(context())
      expect(adapter.requests).toHaveLength(requestsAfterVerifiedTransition)
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

      const recordTerminalDelivery = (harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisTerminalReportDelivered: (input: unknown) => unknown
      }).recordLearningAnalysisTerminalReportDelivered
      let failTerminalDeliveryOnce = true
      ;(harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisTerminalReportDelivered: (input: unknown) => unknown
      }).recordLearningAnalysisTerminalReportDelivered = input => {
        if (failTerminalDeliveryOnce) {
          failTerminalDeliveryOnce = false
          throw new Error('forced terminal delivery append uncertainty')
        }
        return recordTerminalDelivery.call(harness.ctx.tianwenEvolution, input)
      }
      await expect(executor.report(context())).rejects.toThrow(/forced terminal delivery append uncertainty/u)
      ;(harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisTerminalReportDelivered: (input: unknown) => unknown
      }).recordLearningAnalysisTerminalReportDelivered = recordTerminalDelivery
      await executor.report(context())
      const terminal = harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)!
      expect(reports).toEqual(['Tianwen 分析结论：候选 Skill 已通过验证；仅未来 Run 使用新版本。'])
      expect(terminal.terminalReportDelivery).toMatchObject({
        state: 'delivered', reportMessageId: 'main-chat-terminal-message',
      })
      const recordRolledBack = (harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisRolledBack: (input: unknown) => unknown
      }).recordLearningAnalysisRolledBack
      let failRollbackOutcomeOnce = true
      ;(harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisRolledBack: (input: unknown) => unknown
      }).recordLearningAnalysisRolledBack = input => {
        if (failRollbackOutcomeOnce) {
          failRollbackOutcomeOnce = false
          throw new Error('forced rollback outcome append uncertainty')
        }
        return recordRolledBack.call(harness.ctx.tianwenEvolution, input)
      }
      await expect(executor.rollback(context())).rejects.toThrow(/forced rollback outcome append uncertainty/u)
      ;(harness.ctx.tianwenEvolution as unknown as {
        recordLearningAnalysisRolledBack: (input: unknown) => unknown
      }).recordLearningAnalysisRolledBack = recordRolledBack
      const requestsAfterVerifiedRollback = adapter.requests.length
      await executor.rollback(context())
      expect(adapter.requests).toHaveLength(requestsAfterVerifiedRollback)
      expect(harness.ctx.tianwenEvolution.getLearningAnalysis(requested.analysisId)?.phase).toBe('rolled-back')
      expect(harness.ctx.tianwenEvolution.getControlledSkillScopePointer(promotedShadow.scopeKey)?.activeVersionId)
        .toBe(currentManifest.parentVersionId)
      expect(adapter.requests).toHaveLength(56)
      expect(hash({ current: currentManifest.parentVersionId, future: pointer?.activeVersionId }))
        .toMatch(/^sha256:[a-f0-9]{64}$/u)
    } finally {
      disposeVerifier?.()
      disposeSkill?.()
      await harness.ctx.fiber.dispose()
      if (previousProbeRoot === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previousProbeRoot
    }
  }, 120_000)
})
