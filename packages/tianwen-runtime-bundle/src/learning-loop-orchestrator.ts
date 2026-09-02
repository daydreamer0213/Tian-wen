/** The durable Evolution record is the queue; this service owns no jobs. */
import { Service, SessionId } from '@tianwen/dsh-compat'
import type { Context } from '@tianwen/dsh-compat'
import { sha256, type LearningAnalysisRetryPhase } from '@tianwen/evolution'

import { resolveExplicitCorrectionProtocol } from './explicit-correction-protocol.js'
import { materializeLearningCandidate } from './learning-candidate.js'

declare module '@deepseek-ai/cordis' {
  interface Context { tianwenLearningLoop: TianwenLearningLoopService }
}

export interface LearningLoopAdmission {
  readonly analysis: { readonly analysisId: string, readonly sessionId: string, readonly messageId: string, readonly feedbackVersion: string, readonly consentRevision: number, readonly phase: string }
  readonly consent: { readonly enabled: boolean, readonly revision: number } | undefined
  readonly intake: { readonly state: string, readonly rating: string, readonly ticketId: string, readonly feedbackVersion: string, readonly analysisConsentRevision?: number } | undefined
  readonly start: () => void | Promise<void>
}
export type LearningLoopAdmissionResult = { readonly state: 'analysis-started' } | { readonly state: 'invalidated' }

export async function continueLearningLoop(input: LearningLoopAdmission): Promise<LearningLoopAdmissionResult> {
  const { analysis, consent, intake } = input
  if (analysis.phase !== 'pending-parent' || consent?.enabled !== true
    || consent.revision !== analysis.consentRevision || intake?.state !== 'active'
    || intake.rating !== 'negative' || intake.feedbackVersion !== analysis.feedbackVersion
    || intake.analysisConsentRevision !== analysis.consentRevision) return { state: 'invalidated' }
  await input.start()
  return { state: 'analysis-started' }
}

export interface LearningLoopPhaseStatus {
  readonly analysisId: string
  readonly phase: string
  readonly resumePhase?: string
  readonly submission?: { readonly verdict: string }
  readonly ticketId?: string
  readonly sessionId?: string
  readonly messageId?: string
  readonly feedbackVersion?: string
  readonly consentRevision?: number
  readonly parentSessionId?: string
  readonly childSessionId?: string
  readonly candidateId?: string
  readonly evaluationId?: string
  readonly evaluationResultDigest?: string
  readonly shadowId?: string
  readonly shadowResultDigest?: string
  readonly promotionRecommendationDigest?: string
  readonly promotionTransitionId?: string
  readonly promotionTransitionReceiptDigest?: string
  readonly rollbackTransitionId?: string
  readonly rollbackTransitionReceiptDigest?: string
  readonly recoveredTransitionId?: string
  readonly recoveredTransitionReceiptDigest?: string
}

export interface LearningLoopLane {
  readonly read: () => LearningLoopPhaseStatus | undefined
  readonly advance: (status: LearningLoopPhaseStatus) => void | Promise<void>
  readonly maxSteps?: number
}

/** Re-reads after every append, so a durable submission cannot strand its lane. */
export async function drainLearningLoopLane(input: LearningLoopLane): Promise<void> {
  for (let step = 0; step < (input.maxSteps ?? 12); step += 1) {
    const before = input.read()
    if (before === undefined) return
    const fingerprint = JSON.stringify(before)
    await input.advance(before)
    const after = input.read()
    // Failure is durable backpressure, not a loop instruction. A later
    // explicit wake/restart resumes it and then continues from that exact
    // durable phase.  Only a newly-recorded failure stops this drain.
    if (after?.phase === 'failed') return
    if (after === undefined || JSON.stringify(after) === fingerprint) return
  }
  throw new Error('learning loop exceeded its bounded durable advance budget')
}

export async function drainLearningLoopLaneWithWake(
  input: LearningLoopLane & { readonly takeWake: () => boolean },
): Promise<void> {
  do {
    input.takeWake()
    await drainLearningLoopLane(input)
  } while (input.takeWake())
}
export interface LearningLoopExecutionContext { readonly ctx: Context, readonly status: LearningLoopPhaseStatus }

/** Injected production protocol/verifier. Ordinary runtime deliberately has none. */
export interface LearningLoopControlledExecutor {
  freezeProtocol(context: LearningLoopExecutionContext): { readonly provenance: 'pre-candidate' | 'retrospective' } | Promise<{ readonly provenance: 'pre-candidate' | 'retrospective' }>
  materializeCandidate(context: LearningLoopExecutionContext): unknown | Promise<unknown>
  evaluate(context: LearningLoopExecutionContext): unknown | Promise<unknown>
  promote(context: LearningLoopExecutionContext): unknown | Promise<unknown>
  recoverPromotion?(context: LearningLoopExecutionContext): boolean | Promise<boolean>
  rollback(context: LearningLoopExecutionContext): unknown | Promise<unknown>
  /** Sends a concise, deduplicated result to the exact main parent. */
  report(context: LearningLoopExecutionContext): unknown | Promise<unknown>
}
export interface TianwenLearningLoopConfig { readonly executor?: LearningLoopControlledExecutor }

/**
 * Explicit fixture/protocol adapter.  All environment-specific authority is
 * supplied by configuration; the resolver itself never manufactures it.
 */
export interface ExplicitCorrectionLearningLoopExecutorConfig {
  readonly root: string
  readonly materializeWorkspace: (root: string, content: string) => void
  /** Reads and freezes the actual host execution environment at protocol time. */
  readonly environment: (context: LearningLoopExecutionContext) => Promise<{
    readonly callConfig: { readonly provider: string, readonly model: string }
    readonly retryPolicy: unknown
    readonly toolSchemas: unknown
    readonly rubricDigest: `sha256:${string}`
  }>
  /** Existing controlled evaluation fixture's deterministic outcome resolver. */
  readonly resolveVerdict?: unknown
  /** Resolves only after the exact parent report message is durably persisted. */
  readonly deliverTerminalReport: (input: {
    readonly context: LearningLoopExecutionContext
    readonly text: string
  }) => string | Promise<string>
  /** Finds only an exact durably persisted report after a restart. */
  readonly findTerminalReport?: (input: {
    readonly context: LearningLoopExecutionContext
    readonly text: string
  }) => string | undefined | Promise<string | undefined>
}

/**
 * Builds the only supported fixture executor.  It freezes a protocol before
 * asking the configured materializer for a Candidate, then uses the native
 * controlled arm/evaluator/Shadow/transition services and records their exact
 * receipts back onto the durable analysis.
 */
export function createExplicitCorrectionLearningLoopExecutor(
  config: ExplicitCorrectionLearningLoopExecutorConfig,
): LearningLoopControlledExecutor {
  const protocolFor = (context: LearningLoopExecutionContext) => {
    const binding = context.ctx.tianwenEvolution.getRunBindingBySessionId(
      String(context.status.sessionId),
    )
    return binding === undefined ? undefined : resolveExplicitCorrectionProtocol(binding.scopeKey)
  }
  const tasksFor = (context: LearningLoopExecutionContext) => {
    const protocol = protocolFor(context)
    if (protocol === undefined) return undefined
    const tasks = protocol.buildEvaluationTasks({
      root: config.root,
      materializeWorkspace: config.materializeWorkspace,
      sessionNamespace: context.status.analysisId,
    })
    for (const task of tasks) {
      protocol.assertWorkspaceSnapshot(task.baselineWorkspaceRoot, task.workspaceSnapshot)
      protocol.assertWorkspaceSnapshot(task.candidateWorkspaceRoot, task.workspaceSnapshot)
    }
    return {
      protocol,
      tasks,
    }
  }
  const protocolIdFor = (context: LearningLoopExecutionContext): string | undefined => {
    const existing = context.ctx.tianwenEvolution.listControlledSkillEvalProtocols()
      .filter(value => value.ticketId === context.status.ticketId)
    return existing.length === 1 ? existing[0]!.protocolId : undefined
  }
  const assertFrozenEnvironment = async (context: LearningLoopExecutionContext): Promise<void> => {
    const built = tasksFor(context)
    const protocolId = protocolIdFor(context)
    const record = protocolId === undefined
      ? undefined
      : context.ctx.tianwenEvolution.getControlledSkillEvalProtocol(protocolId as never)
    if (record === undefined || built === undefined) throw new Error('controlled protocol record is unavailable')
    const environment = await config.environment(context)
    const execution = record.protocol.execution
    if (execution.callConfigDigest !== sha256(environment.callConfig)
      || execution.retryPolicyDigest !== sha256(environment.retryPolicy)
      || execution.toolSchemaDigest !== sha256(built.tasks.map(task => ({
        taskId: task.taskId, toolSchemaDigest: sha256(environment.toolSchemas),
      })))) {
      throw new Error('controlled protocol execution environment drifted')
    }
  }
  const recoverTransition = (context: LearningLoopExecutionContext, kind: 'promote' | 'rollback'): boolean => {
    const shadowId = context.status.shadowId
    if (shadowId === undefined) return false
    const shadow = context.ctx.tianwenEvolution.getControlledSkillShadow(shadowId as never)
    const pointer = shadow === undefined ? undefined : context.ctx.tianwenEvolution.getControlledSkillScopePointer(shadow.scopeKey)
    const matching = context.ctx.tianwenEvolution.listControlledSkillTransitions().flatMap(transition => {
      const receipt = context.ctx.tianwenEvolution.getControlledSkillTransitionReceipt(transition.transitionId)
      return transition.shadowId === shadowId && transition.kind === kind
        && (receipt?.state === 'verified' || receipt?.state === 'recovered')
        && sha256(receipt.pointer) === sha256(pointer)
        ? [{ transition, receipt }]
        : []
    })
    if (matching.length !== 1) return false
    const input = {
      analysisId: context.status.analysisId as never,
      transitionId: matching[0]!.transition.transitionId,
    }
    if (matching[0]!.receipt.state === 'recovered') {
      context.ctx.tianwenEvolution.recordLearningAnalysisTransitionRecovered(input)
    } else if (kind === 'promote') {
      context.ctx.tianwenEvolution.recordLearningAnalysisPromoted(input)
    } else {
      context.ctx.tianwenEvolution.recordLearningAnalysisRolledBack(input)
    }
    return true
  }
  return {
    async freezeProtocol(context) {
      const built = tasksFor(context)
      if (built === undefined) {
        context.ctx.tianwenEvolution.recordLearningAnalysisProtocolUnavailable(context.status.analysisId as never)
        return { provenance: 'pre-candidate' }
      }
      const persisted = await context.ctx.sessionPersistence.list()
      const occupied = new Set([
        ...persisted.map(session => String(session.id)),
        ...context.ctx.agents.list().map(agent => String(agent.session.id)),
        ...context.ctx.sessions.list().map(session => String(session.id)),
      ])
      built.protocol.assertFreshSessions(built.tasks, occupied)
      const environment = await config.environment(context)
      built.protocol.freezeExecution({
        callConfig: environment.callConfig, retryPolicy: environment.retryPolicy, toolSchemas: environment.toolSchemas,
      })
      context.ctx.tianwenEvolution.freezeControlledSkillEvalProtocol(
        built.protocol.buildProtocolInput({
          ticketId: context.status.ticketId, sha256, rubricDigest: environment.rubricDigest,
          callConfig: environment.callConfig, retryPolicy: environment.retryPolicy,
          toolSchemaDigest: sha256(environment.toolSchemas), tasks: built.tasks,
        }) as never,
      )
      return { provenance: 'pre-candidate' }
    },
    materializeCandidate(context) {
      if (protocolFor(context) === undefined) return
      materializeLearningCandidate(context.ctx.tianwenEvolution as never, context.status.analysisId as never)
    },
    async evaluate(context) {
      const built = tasksFor(context)
      const candidateId = context.status.candidateId
      const protocolId = protocolIdFor(context)
      if (built === undefined || candidateId === undefined || protocolId === undefined) {
        throw new Error('controlled evaluation lacks its frozen protocol or Candidate')
      }
      await assertFrozenEnvironment(context)
      const evaluation = await (context.ctx.tianwenSkillEvaluation as unknown as {
        runControlledArms(input: unknown, resolver?: unknown): Promise<{ readonly state: string, readonly evaluationId: string, readonly result?: { readonly mechanismVerdict: string } }>
      }).runControlledArms(
        built.protocol.buildArmsInput(candidateId, protocolId, built.tasks), config.resolveVerdict,
      )
      if (evaluation.state === 'terminal') {
        context.ctx.tianwenEvolution.recordLearningAnalysisCandidateRejected({
          analysisId: context.status.analysisId as never, evaluationId: evaluation.evaluationId as never,
        })
        return
      }
      if (evaluation.state !== 'awaiting-evaluator') throw new Error('controlled arms stopped before blind evaluation')
      const evaluators = await (context.ctx.tianwenSkillEvaluation as unknown as {
        runControlledEvaluators(input: unknown, resolver?: unknown): Promise<{ readonly state: string, readonly evaluationId: string, readonly result?: { readonly mechanismVerdict: string } }>
      }).runControlledEvaluators(
        built.protocol.buildEvaluatorsInput(evaluation.evaluationId, built.tasks), config.resolveVerdict,
      )
      if (evaluators.state === 'terminal' && evaluators.result?.mechanismVerdict !== 'pass') {
        context.ctx.tianwenEvolution.recordLearningAnalysisCandidateRejected({
          analysisId: context.status.analysisId as never, evaluationId: evaluation.evaluationId as never,
        })
        return
      }
      if (evaluators.state !== 'terminal' || evaluators.result === undefined) throw new Error('controlled evaluators stopped before a governed verdict')
      const shadowTasks = built.protocol.buildShadowTasks({
        root: config.root,
        materializeWorkspace: config.materializeWorkspace,
        sessionNamespace: evaluation.evaluationId,
      })
      for (const task of shadowTasks) built.protocol.assertWorkspaceSnapshot(task.workspaceRoot, task.workspaceSnapshot)
      const shadow = await (context.ctx.tianwenSkillEvaluation as unknown as {
        runControlledShadow(input: unknown, resolver?: unknown): Promise<{ readonly state: string, readonly shadowId: string, readonly result?: { readonly mechanismVerdict: string, readonly promotionEligibility?: string } }>
      }).runControlledShadow({
        evaluationId: evaluation.evaluationId,
        tasks: shadowTasks,
      }, config.resolveVerdict)
      if (shadow.state === 'terminal' && (shadow.result?.mechanismVerdict !== 'pass' || shadow.result.promotionEligibility === 'ineligible')) {
        context.ctx.tianwenEvolution.recordLearningAnalysisCandidateRejected({
          analysisId: context.status.analysisId as never, evaluationId: evaluation.evaluationId as never,
          shadowId: shadow.shadowId as never,
        })
        return
      }
      if (shadow.state !== 'terminal' || shadow.result === undefined) throw new Error('controlled Shadow stopped before a governed verdict')
      context.ctx.tianwenEvolution.recordLearningAnalysisShadowReady({
        analysisId: context.status.analysisId as never, evaluationId: evaluation.evaluationId as never,
        shadowId: shadow.shadowId as never,
      })
    },
    async promote(context) {
      if (recoverTransition(context, 'promote')) return
      const built = tasksFor(context)
      if (built === undefined || context.status.shadowId === undefined) throw new Error('controlled promotion lacks Shadow')
      await assertFrozenEnvironment(context)
      const shadow = context.ctx.tianwenEvolution.getControlledSkillShadow(context.status.shadowId as never)
      if (shadow === undefined) throw new Error('controlled promotion Shadow is unavailable')
      const pointer = context.ctx.tianwenEvolution.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
      const transitionInput = built.protocol.buildTransitionInput({
        root: config.root, shadowId: shadow.shadowId, kind: 'promote', expectedRevision: pointer.revision,
        materializeWorkspace: config.materializeWorkspace,
      })
      built.protocol.assertWorkspaceSnapshot(transitionInput.task.workspaceRoot, transitionInput.task.workspaceSnapshot)
      const transition = await (context.ctx.tianwenSkillEvaluation as unknown as {
        runControlledSkillTransition(input: unknown, resolver?: unknown): Promise<{ readonly state: string, readonly transition: { readonly transitionId: string, readonly state: string } }>
      }).runControlledSkillTransition(transitionInput, config.resolveVerdict)
      if (transition.transition.state === 'recovered') {
        if (transition.state !== 'stopped') throw new Error('controlled promotion recovery state is inconsistent')
        context.ctx.tianwenEvolution.recordLearningAnalysisTransitionRecovered({
          analysisId: context.status.analysisId as never,
          transitionId: transition.transition.transitionId as never,
        })
        return
      }
      if (transition.state !== 'terminal' || transition.transition.state !== 'verified') {
        throw new Error('controlled promotion was not verified')
      }
      context.ctx.tianwenEvolution.recordLearningAnalysisPromoted({
        analysisId: context.status.analysisId as never, transitionId: transition.transition.transitionId as never,
      })
    },
    recoverPromotion(context) {
      return recoverTransition(context, 'promote')
    },
    async rollback(context) {
      if (recoverTransition(context, 'rollback')) return
      const built = tasksFor(context)
      if (built === undefined || context.status.shadowId === undefined) throw new Error('controlled rollback lacks Shadow')
      await assertFrozenEnvironment(context)
      const shadow = context.ctx.tianwenEvolution.getControlledSkillShadow(context.status.shadowId as never)
      const pointer = shadow === undefined ? undefined : context.ctx.tianwenEvolution.getControlledSkillScopePointer(shadow.scopeKey)
      if (shadow === undefined || pointer === undefined) throw new Error('controlled rollback pointer is unavailable')
      const transitionInput = built.protocol.buildTransitionInput({
        root: config.root, shadowId: shadow.shadowId, kind: 'rollback', expectedRevision: pointer.revision,
        materializeWorkspace: config.materializeWorkspace,
      })
      built.protocol.assertWorkspaceSnapshot(transitionInput.task.workspaceRoot, transitionInput.task.workspaceSnapshot)
      const transition = await (context.ctx.tianwenSkillEvaluation as unknown as {
        runControlledSkillTransition(input: unknown, resolver?: unknown): Promise<{ readonly state: string, readonly transition: { readonly transitionId: string, readonly state: string } }>
      }).runControlledSkillTransition(transitionInput, config.resolveVerdict)
      if (transition.transition.state === 'recovered') {
        if (transition.state !== 'stopped') throw new Error('controlled rollback recovery state is inconsistent')
        context.ctx.tianwenEvolution.recordLearningAnalysisTransitionRecovered({
          analysisId: context.status.analysisId as never,
          transitionId: transition.transition.transitionId as never,
        })
        return
      }
      if (transition.state !== 'terminal' || transition.transition.state !== 'verified') {
        throw new Error('controlled rollback was not verified')
      }
      context.ctx.tianwenEvolution.recordLearningAnalysisRolledBack({
        analysisId: context.status.analysisId as never, transitionId: transition.transition.transitionId as never,
      })
    },
    async report(context) {
      const { text, digest: reportDigest } = learningLoopTerminalReport(context.status)
      const binding = {
        analysisId: context.status.analysisId as never,
        parentSessionId: String(context.status.parentSessionId),
        childSessionId: String(context.status.childSessionId),
        reportDigest,
      }
      const recorded = context.ctx.tianwenEvolution.recordLearningAnalysisTerminalReportIntent(binding)
      if (recorded.terminalReportDelivery?.state === 'delivered') return
      const reportMessageId = await config.findTerminalReport?.({ context, text })
        ?? await config.deliverTerminalReport({ context, text })
      context.ctx.tianwenEvolution.recordLearningAnalysisTerminalReportDelivered({
        ...binding, reportMessageId,
      })
    },
  }
}

function unavailableExecutor(): never { throw new Error('controlled learning-loop executor is unavailable') }

function terminalReportText(status: LearningLoopPhaseStatus): string {
  switch (status.phase) {
    case 'no-case': return 'Tianwen 分析结论：未形成可学习案例，未改变任何 Skill。'
    case 'insufficient-evidence': return 'Tianwen 分析结论：证据不足，未改变任何 Skill。'
    case 'protocol-unavailable': return 'Tianwen 分析结论：受控评测协议不可用，未改变任何 Skill。'
    case 'candidate-rejected': return status.shadowId === undefined
      ? 'Tianwen 分析结论：候选 Skill 未通过盲评，未改变未来 Run。'
      : 'Tianwen 分析结论：候选 Skill 未通过 Shadow，未改变未来 Run。'
    case 'promoted': return 'Tianwen 分析结论：候选 Skill 已通过验证；仅未来 Run 使用新版本。'
    case 'rolled-back': return 'Tianwen 分析结论：支持已撤回，已验证回滚至父版本。'
    case 'transition-recovered': return status.promotionTransitionId === undefined
      ? 'Tianwen 分析结论：候选启用检查未通过，已恢复父版本；本次不会自动重试。'
      : 'Tianwen 分析结论：撤回回滚检查未通过，已恢复尝试前的候选版本；本次不会自动重试，需要人工处理。'
    default: return `Tianwen 分析结论：${status.phase}。`
  }
}

export function learningLoopTerminalReport(status: LearningLoopPhaseStatus): {
  readonly text: string
  readonly digest: ReturnType<typeof sha256>
} {
  const text = terminalReportText(status)
  return {
    text,
    digest: sha256({ kind: 'terminal-governed-outcome', text }),
  }
}

/** Never let a Candidate, receipt, or pointer influence protocol construction. */
function preCandidateStatus(status: LearningLoopPhaseStatus): LearningLoopPhaseStatus {
  const {
    candidateId: _candidateId, evaluationId: _evaluationId,
    evaluationResultDigest: _evaluationResultDigest, shadowId: _shadowId,
    shadowResultDigest: _shadowResultDigest, promotionRecommendationDigest: _promotionRecommendationDigest,
    promotionTransitionId: _promotionTransitionId,
    promotionTransitionReceiptDigest: _promotionTransitionReceiptDigest,
    rollbackTransitionId: _rollbackTransitionId,
    rollbackTransitionReceiptDigest: _rollbackTransitionReceiptDigest,
    recoveredTransitionId: _recoveredTransitionId,
    recoveredTransitionReceiptDigest: _recoveredTransitionReceiptDigest,
    ...frozen
  } = status
  return frozen
}

/** One live-parent admission lane per durable analysis id; no in-memory queue. */
export class TianwenLearningLoopService extends Service {
  static inject = ['agents', 'tianwenEvolution', 'tianwenLearningAnalysisChild'] as const
  readonly #executor: LearningLoopControlledExecutor | undefined
  readonly #activeAnalysisIds = new Set<string>()
  readonly #rerunAnalysisIds = new Set<string>()

  constructor(ctx: Context, config: TianwenLearningLoopConfig = {}) {
    super(ctx, 'tianwenLearningLoop')
    this.#executor = config.executor
  }

  protected [Service.init](): void {
    const offAgent = this.ctx.on('agent/created', ({ agent }) => {
      const sessionId = String(agent.session.id)
      for (const analysis of this.ctx.tianwenEvolution.listLearningAnalyses()) {
        if (analysis.parentSessionId === sessionId || analysis.childSessionId === sessionId) {
          void this.schedule(analysis.analysisId).catch(() => undefined)
        }
      }
    })
    this.ctx.effect(() => offAgent, 'tianwen-learning-loop.agent-wake.dispose')
  }

  async schedule(analysisId: string): Promise<void> {
    if (this.#activeAnalysisIds.has(analysisId)) {
      // A reconciliation can arrive after the lane's last support check. Keep
      // one exact rerun marker; it is not a general queue.
      this.#rerunAnalysisIds.add(analysisId)
      return
    }
    this.#activeAnalysisIds.add(analysisId)
    try {
      await drainLearningLoopLaneWithWake({
        takeWake: () => this.#rerunAnalysisIds.delete(analysisId),
        read: () => {
          const current = this.ctx.tianwenEvolution.getLearningAnalysis(analysisId as never)
          return current as unknown as LearningLoopPhaseStatus | undefined
        },
        advance: status => this.advance(status),
      })
    } finally {
      this.#activeAnalysisIds.delete(analysisId)
      this.#rerunAnalysisIds.delete(analysisId)
    }
  }

  private async advance(status: LearningLoopPhaseStatus): Promise<void> {
    const executor = this.#executor
    const contextFor = (current: LearningLoopPhaseStatus): LearningLoopExecutionContext => ({ ctx: this.ctx, status: current })
    if (status.phase === 'failed') await this.reportFailure(status)
    await runLearningLoopPhase({
      status,
      hasActiveSupport: current => this.hasActiveSupport(current),
      resume: current => this.ctx.tianwenEvolution.recordLearningAnalysisResumed({
        analysisId: current.analysisId as never, resumePhase: current.resumePhase as LearningAnalysisRetryPhase,
      }),
      startChild: async current => {
        const parent = this.ctx.agents.get(SessionId(String(current.parentSessionId)))
        if (parent === undefined) throw new Error('learning analysis requires the exact live main parent')
        const admitted = await continueLearningLoop({
          analysis: current as LearningLoopAdmission['analysis'],
          consent: this.ctx.tianwenEvolution.getLearningAnalysisConsent(),
          intake: this.intake(current),
          start: async () => { await this.ctx.tianwenLearningAnalysisChild.start({
            analysisId: current.analysisId as never, parent, signal: AbortSignal.timeout(30_000),
          }) },
        })
        if (admitted.state === 'invalidated') this.ctx.tianwenEvolution.recordLearningAnalysisInvalidated({ analysisId: current.analysisId as never })
      },
      waitForSubmission: () => undefined,
      freezeProtocol: current => executor === undefined ? unavailableExecutor() : executor.freezeProtocol({ ctx: this.ctx, status: preCandidateStatus(current) }),
      materializeCandidate: current => executor === undefined ? unavailableExecutor() : executor.materializeCandidate(contextFor(current)),
      evaluate: current => executor === undefined ? unavailableExecutor() : executor.evaluate(contextFor(current)),
      promote: current => executor === undefined ? unavailableExecutor() : executor.promote(contextFor(current)),
      recoverPromote: current => executor?.recoverPromotion?.(contextFor(current)) ?? false,
      rollback: current => executor === undefined ? unavailableExecutor() : executor.rollback(contextFor(current)),
      // The native tool reports its submitted verdict; configured executors report final governed outcomes.
      report: current => executor?.report(contextFor(current)),
      interruptChild: current => this.ctx.subagents.interrupt(SessionId(String(current.childSessionId)), {
        kind: 'user', parentSessionId: SessionId(String(current.parentSessionId)),
      }),
      invalidate: current => this.ctx.tianwenEvolution.recordLearningAnalysisInvalidated({ analysisId: current.analysisId as never }),
      fail: async current => {
        this.ctx.tianwenEvolution.recordLearningAnalysisFailed({
          analysisId: current.analysisId as never, resumePhase: current.phase as LearningAnalysisRetryPhase,
        })
        const failed = this.ctx.tianwenEvolution.getLearningAnalysis(current.analysisId as never)
        if (failed !== undefined) await this.reportFailure(failed as unknown as LearningLoopPhaseStatus)
      },
    })
  }

  /**
   * A failed record is the retry authority.  This is only a human-visible
   * progress notice, deliberately outside the terminal-report delivery slot:
   * a later successful retry must still be able to deliver its outcome.
   */
  private async reportFailure(status: LearningLoopPhaseStatus): Promise<void> {
    if (status.phase !== 'failed' || status.resumePhase === undefined) return
    try {
      const child = this.ctx.agents.get(SessionId(String(status.childSessionId)))
      const parent = this.ctx.agents.get(SessionId(String(status.parentSessionId)))
      if (child === undefined || parent === undefined
        || String(child.session.header.parentSession) !== String(parent.session.id)
        || parent.session.header.parentSession !== undefined
        || parent.session.header.origin === 'subagent') return
      const content = [{
        type: 'text' as const,
        text: status.resumePhase === 'promoted'
          ? 'Tianwen 学习流程停在 promoted：回滚验证暂未完成，当前指针状态未被进一步改变；系统将在下一次有效唤醒重试。'
          : `Tianwen 学习流程停在 ${status.resumePhase}：受控环境暂不可用，未启用候选；系统将在下一次有效唤醒重试。`,
      }]
      const delivered = [{
        type: 'text' as const,
        text: `Background subagent ${status.childSessionId} reported:`,
      }, ...content]
      const isExactFailureReport = (event: unknown): boolean => {
        if (event === null || typeof event !== 'object') return false
        const typed = event as { readonly type?: unknown, readonly data?: unknown }
        if (typed.type !== 'user/message' || typed.data === null || typeof typed.data !== 'object') return false
        const message = typed.data as {
          readonly source?: { readonly kind?: unknown, readonly senderSessionId?: unknown }
          readonly content?: unknown
        }
        return message.source?.kind === 'subagent-report'
          && String(message.source.senderSessionId) === String(status.childSessionId)
          && sha256(message.content) === sha256(delivered)
      }
      // reportFrom inserts the UserMessage into the live parent before its
      // persistence flush.  Check both representations so a crash-free
      // immediate re-wake cannot duplicate this non-terminal notice.
      const liveEvents = (parent.session as unknown as { readonly events?: readonly unknown[] }).events ?? []
      const inspection = await this.ctx.sessionPersistence.inspect(parent.session.id)
      const known = liveEvents.some(isExactFailureReport) || inspection.events.some(isExactFailureReport)
      if (!known) await this.ctx.subagents.reportFrom(child, content, {
        delivery: 'next-step', signal: AbortSignal.timeout(30_000),
      })
    } catch {
      // The durable failed record remains the retry source if either native
      // session is offline or a report delivery crashes.
    }
  }

  private intake(status: LearningLoopPhaseStatus): LearningLoopAdmission['intake'] {
    const intake = this.ctx.tianwenEvolution.getLearningIntakeStatus(String(status.sessionId), String(status.messageId))
    if (intake?.ticketId === undefined) return undefined
    return {
      state: intake.state, rating: intake.rating, ticketId: intake.ticketId,
      feedbackVersion: intake.feedbackVersion,
      ...(intake.analysisConsentRevision === undefined ? {} : { analysisConsentRevision: intake.analysisConsentRevision }),
    }
  }

  private hasActiveSupport(status: LearningLoopPhaseStatus): boolean {
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    return this.ctx.tianwenEvolution.hasLearningAnalysisActiveSupport(status.analysisId as never)
      && consent?.enabled === true
  }
}

export interface LearningLoopPhaseOperations {
  readonly status: LearningLoopPhaseStatus
  readonly hasActiveSupport: (status: LearningLoopPhaseStatus) => boolean | Promise<boolean>
  readonly resume?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly startChild?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly waitForSubmission?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly freezeProtocol?: (status: LearningLoopPhaseStatus) => { readonly provenance: 'pre-candidate' | 'retrospective' } | Promise<{ readonly provenance: 'pre-candidate' | 'retrospective' }>
  readonly materializeCandidate?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly evaluate?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly promote?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  /** Replays only an already terminal promote transition; never starts one. */
  readonly recoverPromote?: (status: LearningLoopPhaseStatus) => boolean | Promise<boolean>
  readonly rollback?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly report?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly interruptChild?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly fail?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
  readonly invalidate?: (status: LearningLoopPhaseStatus) => unknown | Promise<unknown>
}
function operation<T extends keyof LearningLoopPhaseOperations>(input: LearningLoopPhaseOperations, name: T): Exclude<LearningLoopPhaseOperations[T], undefined> {
  const value = input[name]
  if (value === undefined) throw new Error(`learning loop operation is unavailable: ${name}`)
  return value as Exclude<LearningLoopPhaseOperations[T], undefined>
}

/** Advance exactly one durable phase; callers re-read Evolution before the next step. */
export async function runLearningLoopPhase(input: LearningLoopPhaseOperations): Promise<void> {
  const status = input.status
  try {
    if (!await input.hasActiveSupport(status)) {
      if (status.phase === 'failed' && status.resumePhase === 'promoted') {
        await operation(input, 'resume')(status)
        return
      }
      if (status.phase === 'transition-recovered') {
        await operation(input, 'report')(status)
        return
      }
      if (status.phase === 'shadow-ready' && input.recoverPromote !== undefined) {
        if (await input.recoverPromote(status)) return
      }
      if (status.phase === 'promoted') await operation(input, 'rollback')(status)
      else if (status.phase === 'rolled-back') await operation(input, 'report')(status)
      else {
        if (input.invalidate !== undefined) await input.invalidate(status)
        if (status.phase === 'pending-parent' || status.phase === 'running') await operation(input, 'interruptChild')(status)
      }
      return
    }
    if (status.phase === 'failed') await operation(input, 'resume')(status)
    else if (status.phase === 'pending-parent') await operation(input, 'startChild')(status)
    else if (status.phase === 'running') {
      if (status.submission === undefined) { await operation(input, 'waitForSubmission')(status); return }
      if (status.submission.verdict !== 'skill-change') { await operation(input, 'report')(status); return }
      const protocol = await operation(input, 'freezeProtocol')(status)
      if (protocol.provenance !== 'pre-candidate') throw new Error('learning loop requires a pre-candidate protocol')
      await operation(input, 'materializeCandidate')(status)
    } else if (status.phase === 'candidate-ready') await operation(input, 'evaluate')(status)
    else if (status.phase === 'shadow-ready') await operation(input, 'promote')(status)
    else if (['no-case', 'insufficient-evidence', 'protocol-unavailable', 'candidate-rejected', 'promoted', 'rolled-back', 'transition-recovered'].includes(status.phase)) await operation(input, 'report')(status)
  } catch (error) {
    if (status.phase === 'failed' || input.fail === undefined
      || !['pending-parent', 'running', 'candidate-ready', 'shadow-ready', 'promoted'].includes(status.phase)) throw error
    await input.fail(status)
  }
}
