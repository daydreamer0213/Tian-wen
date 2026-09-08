import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'
import { hasCurrentConversationQuality, guidanceInputDigest, guidanceStudyId, guidanceVersion, parseConversationGuidanceRecord, sha256, type ConversationQualityContract, type ConversationTask, type ConversationFeedbackAssessment, type ConversationFailure, type GuidanceCase, type GuidanceStudyBody, type GuidanceStudyOpened } from '@tianwen/evolution'
import { conversationEvidenceTexts, conversationTaskModelDigest, recoverConversationTaskModel, recoverConversationTaskMaterial, type ConversationTaskMaterial } from './conversation-task-material.js'
import { CONVERSATION_CASES_SCHEMA, CONVERSATION_PROPOSAL_SCHEMA, runConversationJudgment, runConversationTrial } from './conversation-judgment.js'
import { runConversationClaimReview, verifyConversationClaimReviewCheck } from './conversation-claim-review.js'

declare module '@deepseek-ai/cordis' {
  interface Context { tianwenConversationGuidanceLoop: TianwenConversationGuidanceLoopService }
}
interface EvidenceGroup { readonly sources: readonly [ConversationTask, ConversationTask], readonly counterexample: ConversationTask, readonly category: ConversationFailure, readonly assessments: readonly (ConversationFeedbackAssessment | undefined)[] }

const RAW_FEEDBACK_GUIDANCE = 'When a source has feedbackStandard.originalFeedback, it is exact attributed feedback to an earlier assistant answer. Preserve its speaker, actor, negation, exception and unresolved references; use it to interpret only the attributed continuing preference or supported problem, never every new request in the feedback. The current evaluated task instruction remains authoritative, and feedback is not factual source evidence.'

function root(agent: Agent): boolean { return agent.session.header.origin !== 'subagent' && agent.session.header.parentSession === undefined && agent.session.header.agentPreset !== TIANWEN_CONTROLLED_AGENT_PRESET }
function generatedCases(value: unknown, qualityContract: ConversationQualityContract): readonly GuidanceCase[] {
  if (value === null || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'adjacent,holdout') throw new Error('invalid-judgment')
  return (['adjacent', 'holdout'] as const).map(kind => {
    const item = (value as Record<string, unknown>)[kind]
    if (item === null || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'criteria,prompt'
      || !('prompt' in item) || typeof item.prompt !== 'string' || !('criteria' in item) || !Array.isArray(item.criteria)
      || !item.criteria.every(criterion => typeof criterion === 'string')) throw new Error('invalid-judgment')
    const material = { prompt: item.prompt, criteria: item.criteria as string[], qualityContract }
    return { id: kind, kind, ...material, inputDigest: guidanceInputDigest(material.prompt), materialDigest: sha256(material) }
  })
}

/** A native-event consumer. DSH still owns all Agents and model execution; this
 * service only sequences the frozen learning study and its ledger transitions. */
export class TianwenConversationGuidanceLoopService extends Service {
  static inject = ['agents', 'sessions', 'sessionPersistence', 'subagents', 'tianwenEvolution', 'llm'] as const
  private readonly lanes = new Map<string, Promise<void>>()
  private readonly dirty = new Set<string>()
  private readonly controllers = new Set<AbortController>()
  private readonly recoverable = new Set<string>()
  private accepting = true

  constructor(ctx: Context) { super(ctx, 'tianwenConversationGuidanceLoop') }
  protected [Service.init](): void {
    for (const scope of new Set(this.ctx.tianwenEvolution.listConversationGuidanceStudies().map(study => study.opened.scopeKey))) this.ctx.tianwenEvolution.retireIncompatibleConversationGuidance(scope)
    // A lost result must not cause an already-seen candidate to be rerun until
    // it passes. Retain interrupted studies; fresh evidence can open a new one.
    for (const study of this.ctx.tianwenEvolution.listConversationGuidanceStudies()) {
      if (study.decision === undefined && study.stopped === undefined) this.ctx.tianwenEvolution.recordConversationGuidance({ kind: 'study-stopped', studyId: study.opened.studyId, reason: 'cancelled' })
      if (study.decision?.verdict === 'accepted' && study.activation === undefined && hasCurrentConversationQuality(study.opened.qualityContract)) this.recoverable.add(study.opened.studyId)
    }
    const offReview = this.ctx.on('tianwen/conversation-task-reviewed', taskId => {
      const task = this.ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === taskId)
      const agent = task === undefined ? undefined : this.ctx.agents.get(SessionId(task.source.sessionId))
      if (agent !== undefined) void this.schedule(agent).catch(error => this.warn(error))
    })
    const wakeSession = (sessionId: string) => {
      const agent = this.ctx.agents.get(SessionId(sessionId))
      if (agent !== undefined) void this.schedule(agent).catch(error => this.warn(error))
    }
    const offFeedback = this.ctx.on('tianwen/conversation-feedback-reconciled', wakeSession)
    const offAssessment = this.ctx.on('tianwen/conversation-feedback-assessed', assessmentId => {
      const assessment = this.ctx.tianwenEvolution.listConversationFeedbackAssessments().find(item => item.started.assessmentId === assessmentId)
      const task = assessment === undefined ? undefined : this.ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === assessment.started.taskId)
      if (task !== undefined) wakeSession(task.source.sessionId)
    })
    const offCreated = this.ctx.on('agent/created', ({ agent }) => { if (root(agent)) void this.schedule(agent).catch(error => this.warn(error)) })
    const offConsent = this.ctx.on('tianwen/learning-consent-changed', () => {
      for (const controller of this.controllers) controller.abort()
      for (const agent of this.ctx.agents.list()) if (root(agent)) void this.schedule(agent).catch(error => this.warn(error))
    })
    for (const agent of this.ctx.agents.list()) if (root(agent)) void this.schedule(agent).catch(error => this.warn(error))
    this.ctx.effect(() => async () => {
      this.accepting = false; offReview(); offCreated(); offConsent(); offFeedback(); offAssessment()
      for (const controller of this.controllers) controller.abort()
      await this.whenIdle()
    }, 'tianwen-conversation-guidance-loop.dispose')
  }
  private support(task: ConversationTask): { readonly category: ConversationFailure, readonly assessment?: ConversationFeedbackAssessment } | undefined {
    const evolution = this.ctx.tianwenEvolution
    const assessments = evolution.listConversationFeedbackAssessments(task.source.taskId)
    if (assessments.some(item => item.result === undefined)) return undefined
    const latest = [...assessments].reverse().find(item => item.result?.proof != null && ['attributable-problem', 'preference', 'positive'].includes(item.result.classification)
      && evolution.isConversationFeedbackAssessmentActive(item.started.assessmentId))
    if (latest?.result?.classification === 'positive') return undefined
    const assessment = latest?.result?.supplementalCriteria.length ? latest : undefined
    if (assessment?.result?.category !== null && assessment?.result?.category !== undefined) return { category: assessment.result.category, assessment }
    const positive = evolution.listLearningIntakeStatuses(task.source.sessionId).some(item => item.state === 'active' && item.rating === 'positive'
      && item.sessionLifecycleFingerprint === task.source.sessionLifecycleFingerprint && task.completion?.assistantMessageIds.includes(item.messageId))
    return !positive && task.review?.verdict === 'not-met' && task.review.proof !== null && task.review.category !== null ? { category: task.review.category } : undefined
  }
  private negativeFeedback(task: ConversationTask): boolean {
    return this.ctx.tianwenEvolution.listLearningIntakeStatuses(task.source.sessionId).some(item => item.state === 'active' && item.rating === 'negative'
      && item.sessionLifecycleFingerprint === task.source.sessionLifecycleFingerprint && task.completion?.assistantMessageIds.includes(item.messageId))
  }
  private warn(error: unknown): void { this.ctx.logger.warn('Natural learning study unavailable: %s', error instanceof Error ? error.message : String(error)) }
  async whenIdle(): Promise<void> { while (this.lanes.size > 0) await Promise.allSettled([...this.lanes.values()]) }
  async schedule(agent: Agent): Promise<void> {
    if (!this.accepting || !root(agent)) return Promise.resolve()
    const scopeKey = `conversation:${sha256({ cwd: agent.session.header.cwd ?? null })}`
    // Invalidating an unsupported future method is synchronous ledger work.
    // Do not defer it behind a busy native turn or an ongoing model study.
    this.rollbackIfNeeded(scopeKey)
    this.dirty.add(scopeKey)
    const existing = this.lanes.get(scopeKey)
    if (existing !== undefined) return existing
    const work = Promise.resolve().then(async () => {
      while (this.accepting && this.dirty.delete(scopeKey)) {
        await agent.whenIdle()
        if (this.ctx.agents.get(agent.session.id) !== agent) return
        this.rollbackIfNeeded(scopeKey)
        await this.recoverAccepted(scopeKey)
        const evidence = this.select(scopeKey)
        if (evidence !== undefined) await this.study(agent, evidence)
      }
    }).finally(() => this.lanes.delete(scopeKey))
    this.lanes.set(scopeKey, work)
    return work
  }
  private async recoverAccepted(scopeKey: string): Promise<void> {
    const evolution = this.ctx.tianwenEvolution
    for (const study of evolution.listConversationGuidanceStudies(scopeKey)) {
      if (!this.recoverable.delete(study.opened.studyId) || study.decision?.verdict !== 'accepted' || study.candidate === undefined || study.activation !== undefined) continue
      const controller = new AbortController(); this.controllers.add(controller)
      try {
        await this.assertCurrent(study.opened, controller.signal)
        // Only finish a durable accepted decision. Never rerun a worker or judge;
        // missing or changed native evidence leaves it unapplied.
        for (const proof of [study.candidate.proposalProof, ...study.arms.flatMap(arm => [arm.executionProof, ...(arm.reviewChecks?.map(check => check.proof) ?? [arm.judgeProof])])]) {
          const saved = await this.ctx.sessionPersistence.inspect(SessionId(proof.sessionId))
          if (saved.meta.origin !== 'subagent' || sha256({ meta: saved.meta, events: saved.events }) !== proof.sessionDigest) throw new Error('source-unavailable')
        }
        for (const arm of study.arms) {
          if (arm.reviewChecks === undefined) throw new Error('source-unavailable')
          for (const check of arm.reviewChecks) {
            if (!('audit' in check)) throw new Error('source-unavailable')
            await verifyConversationClaimReviewCheck(this.ctx, check, { purpose: 'method-study', materialDigest: arm.materialDigest,
              outputDigest: arm.outputDigest, modelConfigDigest: study.opened.modelConfigDigest })
          }
        }
        await this.assertCurrent(study.opened, controller.signal)
        evolution.recordConversationGuidance(study.decision)
        evolution.recordConversationGuidance({ kind: 'guidance-activated', studyId: study.opened.studyId, expectedParentVersion: study.opened.parentVersion, decisionDigest: sha256(study.decision) })
      } catch (error) { this.warn(error) }
      finally { this.controllers.delete(controller) }
    }
  }
  private select(scopeKey: string): EvidenceGroup | undefined {
    const evolution = this.ctx.tianwenEvolution
    const consent = evolution.getLearningAnalysisConsent()
    if (consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3') return undefined
    const version = guidanceVersion(evolution.getConversationGuidance(scopeKey))
    const tasks = evolution.listConversationTasks().filter(task => task.source.scopeKey === scopeKey
      && task.source.consentRevision === consent.revision && task.source.behaviorVersion === version
      && hasCurrentConversationQuality(task.admission?.qualityContract)
      && task.admission?.decision?.evaluationMode === 'text' && task.completion?.status === 'completed' && conversationTaskModelDigest(task) !== undefined)
    const studies = evolution.listConversationGuidanceStudies(scopeKey)
    const failed = tasks.filter(task => this.support(task) !== undefined).reverse()
    for (const first of failed) {
      const second = failed.find(task => task.source.taskId !== first.source.taskId && task.source.requestDigest !== first.source.requestDigest
        && conversationTaskModelDigest(task) === conversationTaskModelDigest(first)
        && task.admission!.decision!.family === first.admission!.decision!.family && this.support(task)!.category === this.support(first)!.category)
      if (second === undefined) continue
      const sources: [ConversationTask, ConversationTask] = [second, first]
      if (studies.some(study => sources.every(task => study.opened.sourceTaskIds.includes(task.source.taskId)))) continue
      const counterexample = tasks.find(task => task.review?.verdict === 'met' && task.review.proof !== null && this.support(task) === undefined && !this.negativeFeedback(task)
        && conversationTaskModelDigest(task) === conversationTaskModelDigest(first) && task.admission!.decision!.family === first.admission!.decision!.family)
      if (counterexample !== undefined) return { sources, counterexample, category: this.support(first)!.category, assessments: sources.map(task => this.support(task)?.assessment) }
    }
    return undefined
  }
  private rollbackIfNeeded(scopeKey: string): void {
    const evolution = this.ctx.tianwenEvolution
    evolution.retireIncompatibleConversationGuidance(scopeKey)
    const consent = evolution.getLearningAnalysisConsent()
    const studies = evolution.listConversationGuidanceStudies(scopeKey)
    // Reverting one update can expose its prior verified update. Disabled
    // learning restores the baseline by traversing that exact recorded chain.
    for (const study of [...studies].reverse()) {
      if (study.activation === undefined || study.rollback !== undefined || study.candidate === undefined
        || guidanceVersion(evolution.getConversationGuidance(scopeKey)) !== guidanceVersion(study.candidate.candidateSnapshot)) continue
      const disabled = consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3'
      const retracted = !evolution.isConversationGuidanceSupported(study.opened.studyId)
      const failures = evolution.listConversationTasks().filter(task => task.source.scopeKey === scopeKey
        && task.source.behaviorVersion === guidanceVersion(study.candidate!.candidateSnapshot) && task.recordedAt > study.activatedAt!
        && conversationTaskModelDigest(task) === study.opened.modelConfigDigest
        && sha256(task.admission?.qualityContract ?? null) === sha256(study.opened.qualityContract ?? null)
        && task.admission?.decision?.family === study.opened.family && task.review?.verdict === 'not-met')
      const distinct = failures.filter((task, index) => failures.findIndex(item => item.source.requestDigest === task.source.requestDigest) === index)
      if (!disabled && !retracted && distinct.length < 2) continue
      evolution.recordConversationGuidance({ kind: 'guidance-rolled-back', studyId: study.opened.studyId,
        expectedCurrentVersion: guidanceVersion(study.candidate.candidateSnapshot), reason: disabled ? 'consent-disabled' : retracted ? 'support-retracted' : 'regression', evidenceTaskIds: disabled || retracted ? [] : distinct.slice(-2).map(task => task.source.taskId) })
    }
  }
  private async study(agent: Agent, group: EvidenceGroup): Promise<void> {
    const evolution = this.ctx.tianwenEvolution
    const controller = new AbortController(); this.controllers.add(controller)
    const signal = controller.signal
    let opened: GuidanceStudyOpened | undefined
    try {
      const source = group.sources[0]
      const qualityContract = source.admission?.qualityContract
      if (!hasCurrentConversationQuality(qualityContract)) throw new Error('scope-changed')
      const parentSnapshot = evolution.getConversationGuidance(source.source.scopeKey)
      const sourceConfigs = await Promise.all([...group.sources, group.counterexample].map(task => recoverConversationTaskModel(this.ctx, task)))
      const callConfig = await this.ctx.llm.resolveCallConfig(sourceConfigs[0]!, signal)
      if (sourceConfigs.some(config => sha256(config) !== sha256(callConfig))) throw new Error('source native model configuration drift')
      const sources = await Promise.all(group.sources.map(async (task, index) => {
        const original = await recoverConversationTaskMaterial(this.ctx, task)
        const assessment = group.assessments[index]
        // Preserve origin and timing: these standards evaluate newly generated
        // trial answers, not the earlier answer or its original requirements.
        if (assessment?.result === undefined) return original
        const feedback = this.ctx.get('tianwenConversationFeedback')
        if (feedback === undefined) throw new Error('source-unavailable')
        const recovered = await feedback.materialForAssessment(assessment)
        return { ...original, feedbackStandard: {
          assessmentId: assessment.started.assessmentId, classification: assessment.result.classification,
          criteria: assessment.result.supplementalCriteria, originalFeedback: recovered.feedback,
        } }
      }))
      const counter = await recoverConversationTaskMaterial(this.ctx, group.counterexample)
      const generated = await runConversationJudgment(this.ctx, agent, {
        outputSchema: CONVERSATION_CASES_SCHEMA,
        label: `Tianwen independent case design ${source.source.taskId}`, callConfig, signal,
        instruction: `Design exactly two independent text-only evaluation tasks for the observed task family and failure category. Return {"adjacent":{"prompt":"complete self-contained task with all source facts","criteria":["checkable criterion"]},"holdout":{"prompt":"different complete self-contained task","criteria":["checkable criterion"]}}. Preserve neither personal identifiers nor verbatim source problems. Include no answer, candidate instruction, tool request, or instruction to the reviewer. The holdout must use different facts and expose over-generalization. These are explicitly synthetic test cases, not real user outcomes. ${RAW_FEEDBACK_GUIDANCE}`,
        material: { family: source.admission!.decision!.family, failureCategory: group.category, sources },
      })
      const cases: GuidanceCase[] = [...group.sources, group.counterexample].map((task, index) => {
        const material = index < 2 ? sources[index]! : counter
        return { id: ['source1', 'source2', 'counterexample'][index]!, kind: (['source1', 'source2', 'counterexample'] as const)[index]!, sourceTaskId: task.source.taskId,
          inputDigest: guidanceInputDigest(conversationEvidenceTexts({ request: material.request, context: [] }, []).join('\n')),
          materialDigest: sha256(material), ...(group.assessments[index] === undefined ? {} : { feedbackAssessmentId: group.assessments[index]!.started.assessmentId }) }
      })
      const independent = generatedCases(generated.value, qualityContract!)
      const seen = new Set([...sources, counter].flatMap(material => conversationEvidenceTexts(material, [])).map(guidanceInputDigest))
      if (independent.some(item => seen.has(item.inputDigest))) throw new Error('invalid-judgment')
      cases.push(...independent)
      const body: GuidanceStudyBody = {
        scopeKey: source.source.scopeKey, family: source.admission!.decision!.family, failureCategory: group.category, consentRevision: source.source.consentRevision,
        parentVersion: guidanceVersion(parentSnapshot), parentSnapshot, sourceTaskIds: [group.sources[0].source.taskId, group.sources[1].source.taskId], counterexampleTaskId: group.counterexample.source.taskId,
        cases, modelConfigDigest: sha256(callConfig), qualityContract: qualityContract!,
      }
      opened = { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
      evolution.recordConversationGuidance(opened)
      const proposal = await runConversationJudgment(this.ctx, agent, {
        outputSchema: CONVERSATION_PROPOSAL_SCHEMA,
        label: `Tianwen method proposal ${opened.studyId}`, callConfig, signal,
        instruction: `Propose one concise reusable text-task method addressing the evidenced problem. Return exactly {"guidance":"plain text guidance"}, at most 4096 UTF-8 bytes. Generalize the method; never retain names, original answers, identifiers or case-specific facts. Do not change permissions, tools, consent, learning policy or request unneeded external actions. The guidance is subordinate to future user requests. You have not been given the counterexample or holdout; do not invent evaluation outcomes. ${RAW_FEEDBACK_GUIDANCE}`,
        material: { family: body.family, failureCategory: body.failureCategory, currentGuidance: parentSnapshot.rules[body.family] ?? '', sources },
      })
      if (proposal.value === null || typeof proposal.value !== 'object' || Object.keys(proposal.value).length !== 1 || !('guidance' in proposal.value) || typeof proposal.value.guidance !== 'string') throw new Error('invalid-judgment')
      const candidateSnapshot = { ...parentSnapshot, rules: { ...parentSnapshot.rules, [body.family]: proposal.value.guidance } }
      evolution.recordConversationGuidance({ kind: 'candidate-recorded', studyId: opened.studyId, candidateSnapshot, proposalProof: proposal.proof })
      const materialByTask = new Map<string, ConversationTaskMaterial>([[group.sources[0].source.taskId, sources[0]!], [group.sources[1].source.taskId, sources[1]!], [group.counterexample.source.taskId, counter]])
      for (const item of opened.cases) {
        const material = 'sourceTaskId' in item ? materialByTask.get(item.sourceTaskId)! : { prompt: item.prompt, criteria: item.criteria, qualityContract: item.qualityContract! }
        for (const role of ['baseline', 'candidate'] as const) {
          await this.assertCurrent(opened, signal)
          const snapshot = role === 'baseline' ? parentSnapshot : candidateSnapshot
          // Workers get the original task, not hidden reviewer criteria or old answers.
          const request = 'request' in material ? { request: material.request, context: material.context } : { prompt: material.prompt }
          const execution = await runConversationTrial(this.ctx, agent, { label: `Tianwen text trial ${opened.studyId}`, callConfig, signal, material: request, ...(snapshot.rules[body.family] === undefined ? {} : { guidance: snapshot.rules[body.family] }) })
          const evidence = 'request' in material ? conversationEvidenceTexts(material, [execution.answer]) : [material.prompt, execution.answer]
          const judged = await runConversationClaimReview(this.ctx, agent, {
            purpose: 'method-study',
            evidence,
            label: `Tianwen blind text review ${opened.studyId}`, callConfig, signal,
            material: { task: material, answer: execution.answer },
          })
          evolution.recordConversationGuidance(parseConversationGuidanceRecord({ kind: 'arm-recorded', studyId: opened.studyId, caseId: item.id, role,
            materialDigest: item.materialDigest, behaviorVersion: guidanceVersion(snapshot), executionProof: execution.proof, judgeProof: judged.proof, reviewChecks: judged.reviewChecks, outputDigest: sha256(execution.answer), verdict: judged.verdict }))
        }
      }
      await this.assertCurrent(opened, signal)
      const decision = evolution.conversationGuidanceDecision(opened.studyId)
      evolution.recordConversationGuidance(decision)
      if (decision.verdict === 'accepted') evolution.recordConversationGuidance({ kind: 'guidance-activated', studyId: opened.studyId, expectedParentVersion: opened.parentVersion, decisionDigest: sha256(decision) })
    } catch (error) {
      if (opened !== undefined) {
        const study = evolution.listConversationGuidanceStudies().find(item => item.opened.studyId === opened!.studyId)
        const reason = error instanceof Error && ['invalid-judgment', 'model-unavailable', 'scope-changed'].includes(error.message) ? error.message as 'invalid-judgment' | 'model-unavailable' | 'scope-changed' : 'source-unavailable'
        if (study !== undefined && study.decision === undefined && study.stopped === undefined) evolution.recordConversationGuidance({ kind: 'study-stopped', studyId: opened.studyId, reason: signal.aborted ? 'cancelled' : reason })
      }
      this.warn(error)
    } finally { this.controllers.delete(controller) }
  }
  private async assertCurrent(study: GuidanceStudyOpened, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    if (!hasCurrentConversationQuality(study.qualityContract) || consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3' || consent.revision !== study.consentRevision
      || guidanceVersion(this.ctx.tianwenEvolution.getConversationGuidance(study.scopeKey)) !== study.parentVersion) throw new Error('scope-changed')
    for (const item of study.cases) if ('feedbackAssessmentId' in item && item.feedbackAssessmentId !== undefined) {
      const assessment = this.ctx.tianwenEvolution.listConversationFeedbackAssessments().find(value => value.started.assessmentId === item.feedbackAssessmentId)
      const feedback = this.ctx.get('tianwenConversationFeedback')
      if (assessment === undefined || feedback === undefined || !await feedback.isAssessmentActive(assessment)) throw new Error('source-unavailable')
    }
  }
}
