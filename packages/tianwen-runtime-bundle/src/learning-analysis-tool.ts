import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  LedgerCommitUnknownError,
  TianwenEvolutionService,
  assertLearningAnalysisEvidenceClosure,
  parseLearningAnalysisSubmission,
  type LearningAnalysisStatus,
  type LearningAnalysisSubmission,
} from '@tianwen/evolution'

export const LEARNING_ANALYSIS_TOOL = 'submit_tianwen_analysis' as const

function exactSubmission(
  actual: LearningAnalysisSubmission | undefined,
  expected: LearningAnalysisSubmission,
): boolean {
  return actual !== undefined && JSON.stringify(actual) === JSON.stringify(expected)
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

function evidenceClosure(ctx: Context, status: LearningAnalysisStatus) {
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
      },
      counterevidenceIds: {
        type: 'array', required: true, items: { type: 'string' },
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
      assertActiveConsent(ctx, status)
      if (status.submission !== undefined) {
        throw new Error('learning analysis was already submitted')
      }
      if (status.phase === 'pending-parent') {
        if (ctx.tianwenEvolution.blocked) {
          throw new Error('learning analysis requires a fresh Evolution replay')
        }
        ctx.tianwenEvolution.recordLearningAnalysisChildStarted({
          analysisId: status.analysisId,
          parentSessionId: status.parentSessionId,
          childSessionId: status.childSessionId,
        })
        status = ctx.tianwenEvolution.getLearningAnalysis(status.analysisId)!
      }
      if (status.phase !== 'running' || status.submission !== undefined) {
        throw new Error('learning analysis submission is not in the running phase')
      }
      const submission = parseLearningAnalysisSubmission(args)
      assertLearningAnalysisEvidenceClosure(
        submission,
        evidenceClosure(ctx, status),
      )

      let recorded: LearningAnalysisStatus
      if (ctx.tianwenEvolution.blocked) {
        const durable = await readDurableAnalysis(evolutionRoot, status.analysisId)
        if (
          durable?.childSessionId !== status.childSessionId
          || !exactSubmission(durable.submission, submission)
        ) throw new Error('learning analysis requires a fresh Evolution replay')
        recorded = durable
      } else {
        try {
          const receipt = ctx.tianwenEvolution.recordLearningAnalysisSubmission({
            analysisId: status.analysisId,
            childSessionId: status.childSessionId,
            submission,
          })
          if (receipt.duplicate) {
            throw new Error('learning analysis was already submitted')
          }
          recorded = receipt
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
      if (!exactSubmission(recorded.submission, submission)) {
        throw new Error('learning analysis durable submission mismatch')
      }

      const stage = nextStage(submission.verdict)
      await ctx.subagents.reportFrom(exec.agent!, [{
        type: 'text',
        text: `Tianwen analysis verdict: ${submission.verdict}. Next governed stage: ${stage}.`,
      }], { delivery: 'next-step', signal: exec.signal })
      exec.concludeTurn()
      return { verdict: submission.verdict, nextStage: stage }
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
