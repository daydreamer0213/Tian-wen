import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  LedgerAppendNotCommittedError,
  LedgerCommitUnknownError,
  TianwenEvolutionService,
  assertLearningAnalysisEvidenceClosure,
  parseLearningAnalysisSubmission,
  sha256,
  type LearningAnalysisStatus,
  type LearningAnalysisReportBinding,
  type LearningAnalysisSubmission,
} from '@tianwen/evolution'

export const LEARNING_ANALYSIS_TOOL = 'submit_tianwen_analysis' as const

function exactSubmission(
  actual: LearningAnalysisSubmission | undefined,
  expected: LearningAnalysisSubmission,
): boolean {
  return actual !== undefined && sha256(actual) === sha256(expected)
}

async function readDurableAnalysis(
  evolutionRoot: string | undefined,
  analysisId: LearningAnalysisStatus['analysisId'],
): Promise<LearningAnalysisStatus | undefined> {
  if (evolutionRoot === undefined) return undefined
  const probe = new Context()
  try {
    await probe.plugin(TianwenEvolutionService, { root: evolutionRoot })
    return probe.tianwenEvolution.getLearningAnalysis(analysisId)
  } finally {
    await probe.fiber.dispose()
  }
}

function requireBoundChild(
  ctx: Context,
  child: Agent | undefined,
): LearningAnalysisStatus {
  if (child === undefined || ctx.agents.get(child.session.id) !== child) {
    throw new Error('learning analysis submission requires the exact live child')
  }
  const status = ctx.tianwenEvolution.getLearningAnalysisByChildSessionId(
    String(child.session.id),
  )
  if (
    status === undefined
    || String(child.session.header.parentSession) !== status.parentSessionId
    || status.childSessionId !== String(child.session.id)
  ) throw new Error('learning analysis child has no exact durable binding')
  return status
}

function assertActiveConsent(ctx: Context, status: LearningAnalysisStatus): void {
  const consent = ctx.tianwenEvolution.getLearningAnalysisConsent()
  const intake = ctx.tianwenEvolution.getLearningIntakeStatus(
    status.sessionId,
    status.messageId,
  )
  if (
    consent?.enabled !== true
    || intake?.state !== 'active'
    || intake.rating !== 'negative'
    || intake.ticketId !== status.ticketId
    || intake.feedbackVersion !== status.feedbackVersion
    || intake.analysisConsentRevision !== status.consentRevision
  ) throw new Error('learning analysis consent or exact feedback support is unavailable')
}

export function learningAnalysisEvidenceClosure(ctx: Context, status: LearningAnalysisStatus) {
  const result = new Set<`sha256:${string}`>()
  const ticket = ctx.tianwenEvolution.listLearningTickets()
    .find(item => item.ticketId === status.ticketId)
  const ticketSignalIds = new Set(ticket?.signalIds ?? [])
  for (const signal of ctx.tianwenEvolution.listLearningSignals()) {
    if (
      !('active' in signal)
      || !signal.active
      || signal.sessionId !== status.sessionId
      || !ticketSignalIds.has(signal.signalId)
    ) continue
    for (const evidenceId of signal.evidenceIds) {
      if (evidenceId !== signal.sessionDigest) result.add(evidenceId)
    }
  }
  return result
}

function nextStage(verdict: LearningAnalysisSubmission['verdict']): string {
  return verdict === 'skill-change'
    ? 'governed-candidate'
    : verdict === 'insufficient-evidence'
      ? 'stopped-insufficient-evidence'
      : 'stopped-no-case'
}

function reportContent(submission: LearningAnalysisSubmission) {
  const stage = nextStage(submission.verdict)
  return [{
    type: 'text' as const,
    text: `Tianwen analysis verdict: ${submission.verdict}. Next governed stage: ${stage}.`,
  }]
}

function deliveredReportContent(
  status: LearningAnalysisStatus,
  content: ReturnType<typeof reportContent>,
) {
  return [{
    type: 'text' as const,
    text: `Background subagent ${status.childSessionId} reported:`,
  }, ...content]
}

function reportBinding(
  status: LearningAnalysisStatus,
  content: ReturnType<typeof reportContent>,
): LearningAnalysisReportBinding {
  return {
    analysisId: status.analysisId,
    parentSessionId: status.parentSessionId,
    childSessionId: status.childSessionId,
    reportDigest: sha256(content),
  }
}

function exactPersistedReport(
  events: readonly unknown[],
  status: LearningAnalysisStatus,
  content: ReturnType<typeof reportContent>,
): string | undefined {
  for (const event of events) {
    const data = event !== null && typeof event === 'object'
      ? (event as { readonly type?: unknown, readonly data?: unknown }).data
      : undefined
    if (
      (event as { readonly type?: unknown } | undefined)?.type !== 'user/message'
      || data === null
      || typeof data !== 'object'
    ) continue
    const message = data as {
      readonly id?: unknown
      readonly source?: { readonly kind?: unknown, readonly senderSessionId?: unknown }
      readonly content?: unknown
    }
    if (
      message.source?.kind === 'subagent-report'
      && String(message.source.senderSessionId) === status.childSessionId
      && sha256(message.content) === sha256(deliveredReportContent(status, content))
      && typeof message.id === 'string'
      && message.id.length > 0
    ) return message.id
  }
  return undefined
}

async function reconcileReportDelivery(
  ctx: Context,
  status: LearningAnalysisStatus,
  binding: LearningAnalysisReportBinding,
  evolutionRoot: string | undefined,
): Promise<LearningAnalysisStatus> {
  try {
    return ctx.tianwenEvolution.recordLearningAnalysisReportIntent(binding)
  } catch (error) {
    const durable = await readDurableAnalysis(evolutionRoot, status.analysisId)
    if (durable?.reportDelivery?.reportDigest === binding.reportDigest) return durable
    throw error
  }
}

async function recordReportDelivered(
  ctx: Context,
  status: LearningAnalysisStatus,
  binding: LearningAnalysisReportBinding,
  reportMessageId: string,
  evolutionRoot: string | undefined,
): Promise<LearningAnalysisStatus> {
  const input = { ...binding, reportMessageId }
  try {
    return ctx.tianwenEvolution.recordLearningAnalysisReportDelivered(input)
  } catch (error) {
    if (error instanceof LedgerAppendNotCommittedError) {
      return ctx.tianwenEvolution.recordLearningAnalysisReportDelivered(input)
    }
    const durable = await readDurableAnalysis(evolutionRoot, status.analysisId)
    if (
      durable?.reportDelivery?.state === 'delivered'
      && durable.reportDelivery.reportDigest === binding.reportDigest
      && durable.reportDelivery.reportMessageId === reportMessageId
    ) return durable
    throw error
  }
}

export function createLearningAnalysisTool(
  ctx: Context,
  evolutionRoot?: string,
) {
  return defineTool({
    name: LEARNING_ANALYSIS_TOOL,
    description: 'Submit one bounded analysis result for the exact Tianwen correction bound to this child.',
    parameters: {
      verdict: {
        type: 'string',
        enum: ['no-case', 'insufficient-evidence', 'skill-change'],
        description: 'skill-change requires lesson, candidatePatch, and at least one supportingEvidenceId. Other verdicts must omit lesson and candidatePatch.',
        required: true,
      },
      hypothesis: { type: 'string', required: true },
      lesson: {
        type: 'object',
        properties: {
          claim: { type: 'string', required: true },
          when: { type: 'string', required: true },
          notWhen: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      candidatePatch: {
        type: 'object',
        properties: {
          description: { type: 'string', required: true },
          whenToUse: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      supportingEvidenceIds: {
        type: 'array', required: true, items: { type: 'string' },
        description: 'Copy relevant sha256: IDs from the available evidence IDs in your task. Never invent IDs. At least one is required for skill-change.',
      },
      counterevidenceIds: {
        type: 'array', required: true, items: { type: 'string' },
        description: 'Copy contrary evidence IDs from the same available list; do not reuse a supporting ID. Use [] when there is no counterevidence.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          verdict: {
            type: 'string',
            enum: ['no-case', 'insufficient-evidence', 'skill-change'],
            required: true,
          },
          nextStage: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      let status = requireBoundChild(ctx, exec.agent)
      const submission = parseLearningAnalysisSubmission(args)
      if (status.submission !== undefined) {
        if (!exactSubmission(status.submission, submission)) {
          throw new Error('learning analysis was already submitted')
        }
      } else {
        assertActiveConsent(ctx, status)
      }
      if (status.submission === undefined) {
        if (status.phase === 'pending-parent') {
          throw new Error('learning analysis private delivery is not yet durable')
        }
        if (status.phase !== 'running') {
          throw new Error('learning analysis submission is not in the running phase')
        }
      }

      let recorded = status
      if (status.submission === undefined) {
        assertLearningAnalysisEvidenceClosure(
          submission,
          learningAnalysisEvidenceClosure(ctx, status),
        )
        if (ctx.tianwenEvolution.blocked) {
          const durable = await readDurableAnalysis(evolutionRoot, status.analysisId)
          if (
            durable?.childSessionId !== status.childSessionId
            || !exactSubmission(durable.submission, submission)
          ) throw new Error('learning analysis requires a fresh Evolution replay')
          recorded = durable
        } else {
          try {
            recorded = ctx.tianwenEvolution.recordLearningAnalysisSubmission({
              analysisId: status.analysisId,
              childSessionId: status.childSessionId,
              submission,
            })
          } catch (error) {
            if (
              !(error instanceof LedgerCommitUnknownError)
              && !ctx.tianwenEvolution.blocked
            ) throw error
            const durable = await readDurableAnalysis(evolutionRoot, status.analysisId)
            if (
              durable?.childSessionId !== status.childSessionId
              || !exactSubmission(durable.submission, submission)
            ) throw error
            recorded = durable
          }
        }
      }
      if (!exactSubmission(recorded.submission, submission)) {
        throw new Error('learning analysis durable submission mismatch')
      }

      const content = reportContent(submission)
      const binding = reportBinding(recorded, content)
      recorded = await reconcileReportDelivery(ctx, recorded, binding, evolutionRoot)
      if (recorded.reportDelivery?.state !== 'delivered') {
        const inspection = await ctx.sessionPersistence.inspect(
          SessionId(binding.parentSessionId),
        )
        if (
          String(inspection.meta.id) !== binding.parentSessionId
          || inspection.meta.parentSession !== undefined
          || inspection.meta.origin === 'subagent'
        ) throw new Error('learning analysis report parent evidence is unavailable')
        const persistedMessageId = exactPersistedReport(
          inspection.events,
          recorded,
          content,
        )
        const reportMessageId = persistedMessageId ?? await ctx.subagents.reportFrom(
          exec.agent!, content, { delivery: 'next-step', signal: exec.signal },
        )
        recorded = await recordReportDelivered(
          ctx,
          recorded,
          binding,
          String(reportMessageId),
          evolutionRoot,
        )
      }
      // Submission and its parent report are durable before advancing the
      // single analysis lane. The optional lookup keeps the child usable when
      // this bundle is mounted without the loop service.
      const loop = (ctx as { get?: (name: string) => unknown }).get?.('tianwenLearningLoop') as {
        schedule(analysisId: string): Promise<void>
      } | undefined
      void loop?.schedule(recorded.analysisId).catch(() => undefined)
      exec.concludeTurn()
      return { verdict: submission.verdict, nextStage: nextStage(submission.verdict) }
    },
  })
}

export function installLearningAnalysisTool(
  rootCtx: Context,
  childCtx: Context,
  evolutionRoot?: string,
): () => void {
  const disposePresentation = childCtx.tools.presentAs('native')
  const disposeTool = childCtx.tools.register(
    createLearningAnalysisTool(rootCtx, evolutionRoot),
  )
  const child = childCtx.agent
  const disposeGuard = childCtx.tools.guard(exec =>
    exec.agent === child && exec.name === LEARNING_ANALYSIS_TOOL
      ? undefined
      : 'Tianwen learning analysis children are restricted to their bound submission tool.')
  return () => {
    disposeGuard()
    disposeTool()
    disposePresentation()
  }
}
