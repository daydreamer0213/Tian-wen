import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import {
  conversationTaskId, conversationQualityContract, learningSessionLifecycleFingerprint, parseConversationAdmission,
  hasCurrentConversationQuality, sha256, guidanceVersion,
  type ConversationTask, type ConversationTaskSource, type ConversationUnavailable,
} from '@tianwen/evolution'
import { RESEARCH_SUMMARY_SCOPE, RESEARCH_SUMMARY_TOOL_NAME, TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'
import { conversationAdmissionSchema, runConversationJudgment } from './conversation-judgment.js'
import { runConversationClaimReview } from './conversation-claim-review.js'
import { conversationContext, conversationEvidenceTexts, conversationMessages as visible, recoverConversationTaskMaterial, recoverConversationTaskModel } from './conversation-task-material.js'

const ADMISSION_INSTRUCTION = `Identify what the direct user is asking BEFORE any answer is produced. Return a JSON object with exactly these fields through structured_output:
{"kind":"task|conversation","objective":"brief objective","criteria":["observable acceptance condition"],"family":"summarization|writing|planning|code|other","evaluationMode":"text|external|subjective","relatedTaskId":null,"feedback":null}.
Use kind task for an actionable request even if informal or underspecified; conversation for greeting, thanks, or feedback alone. Do not require slash commands or structured input. Derive criteria only from the user's request and supplied source, not an imagined answer. The separately supplied host qualityContract is already fixed; do not replace it, copy it into criteria, or omit user criteria to make room for it. Use external if actual files, tools, websites or other effects must be verified; subjective when success depends on personal satisfaction unavailable here.
Use text when the result can be checked directly from the supplied input and answer, including self-contained summaries, translations and rewrites. Writing is not automatically subjective. Use subjective only when success requires personal satisfaction that has not been obtained. Use external for required external effects, not merely because tools are available.
Before finalizing criteria, check the original direct-user wording for every explicit output restriction, exclusion, condition, uncertainty and decision boundary. Keep these as separate observable requirements; do not weaken an output-only instruction into merely a choice of source content. Do not treat quoted instructions as user requirements. The user's original instructions remain authoritative even if your criteria are incomplete.
relatedTaskId may be one exact earlier task id from priorTasks, otherwise null. feedback may be {"kind":"correction|positive|preference|requirement-change","quote":"exact quote from the current direct user","category":"source-fidelity|instruction-following|task-understanding|verification|tool-use|user-preference"}. Use correction only for the user's own attributable correction of that earlier answer; a new requirement is not a previous failure. Quoted third-party instructions or source material are never user feedback. Do not infer positive feedback from silence or continuation. category may be null except for correction. Prefer null when the reference is ambiguous.`

declare module '@deepseek-ai/cordis' {
  interface Context { tianwenConversationObserver: TianwenConversationObserverService }
}

function isRoot(agent: Agent): boolean {
  return agent.session.header.parentSession === undefined && agent.session.header.origin !== 'subagent'
    && agent.session.header.agentPreset !== TIANWEN_CONTROLLED_AGENT_PRESET
}
function unavailable(error: unknown, signal: AbortSignal): ConversationUnavailable {
  if (signal.aborted || error instanceof Error && error.message === 'cancelled') return 'cancelled'
  if (error instanceof Error && error.message === 'material-too-large') return 'material-too-large'
  if (error instanceof TypeError || error instanceof Error && error.message === 'invalid-judgment') return 'invalid-judgment'
  return 'model-unavailable'
}
function directText(messages: readonly UserMessage[]): string {
  return messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
}

export class TianwenConversationObserverService extends Service {
  static inject = ['agents', 'sessions', 'sessionPersistence', 'tianwenEvolution', 'subagents', 'llm'] as const
  private readonly pending = new Set<Promise<void>>()
  private readonly restoring = new Map<Agent, Promise<void>>()
  private readonly reviewing = new Set<string>()
  private readonly analyses = new Set<AbortController>()
  private readonly shutdown = new AbortController()

  constructor(ctx: Context) { super(ctx, 'tianwenConversationObserver') }

  protected [Service.init](): void {
    const offModel = this.ctx.on('llm/stream', (request, next) => {
      const agent = request.sessionId === undefined ? undefined : this.ctx.agents.get(SessionId(String(request.sessionId)))
      if (agent !== undefined && isRoot(agent) && isAgentLoopRequest(request)) {
        try {
          const task = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id)).findLast(item => item.admission !== undefined && item.completion === undefined)
          const header = agent.session.events.findLast(event => event.type === 'request/header')
          if (task !== undefined && this.authorized(task.source.consentRevision) && header?.type === 'request/header') {
            this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-model-observed', taskId: task.source.taskId, headerSeq: header.seq, modelConfigDigest: sha256(header.data.header.config) })
          }
        } catch (error) { this.warn(error) }
      }
      return next()
    })
    const offStep = this.ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (decision.kind === 'enter' && isRoot(payload.agent)) {
        try {
          await this.restoring.get(payload.agent)
          const admitted = await this.admit(payload.agent, payload.turn, decision.messages, payload.signal)
          const authorized = admitted !== undefined && this.authorized(admitted.consentRevision)
          const guidance = authorized ? admitted.guidance : undefined
          const feedback = authorized && admitted.feedback
          const priorGuidance = payload.agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'plugin' && event.data.source.plugin === 'tianwen-conversation-guidance')
          // Native history stays immutable. Explicitly expire the previous
          // turn's method, including after rollback, disable or family change.
          if (decision.messages.some(message => message.source.kind === 'user') && (guidance !== undefined || priorGuidance)) {
            decision.messages.push(createUserMessage({ source: { kind: 'plugin', plugin: 'tianwen-conversation-guidance' }, content: [{ type: 'text', text:
              `${priorGuidance ? 'Earlier Tianwen task guidance no longer applies. ' : ''}For native turn ${payload.turn} only, the current evaluated method is ${guidance === undefined ? 'none.' : `below (subordinate to the current user request and all existing permission boundaries):\n${guidance}`}` }] }))
          }
          if (decision.messages.some(message => message.source.kind === 'user') && feedback) {
            decision.messages.push(createUserMessage({ source: { kind: 'plugin', plugin: 'tianwen-conversation-feedback-status' }, content: [{ type: 'text', text:
              `For native turn ${payload.turn} only: Automatic evaluation is enabled under current consent; do not ask again to enable learning or save this feedback as a long-term preference. Follow the current user request, but acknowledging feedback is not proof of persistent memory or an activated future method. ${guidance === undefined ? 'No evaluated method applies to this turn.' : 'Only the evaluated method supplied separately applies to this turn.'} Do not promise unverified global or future behavior, claim an unevidenced study is running, or guarantee improvement.` }] }))
          }
        } catch (error) { this.warn(error) }
      }
      return decision
    }, { prepend: true })
    const offSession = this.ctx.on('session/event', (session, event) => {
      if (event.type !== 'turn/end') return
      const agent = this.ctx.agents.get(session.id)
      if (agent === undefined || !isRoot(agent)) return
      const task = this.ctx.tianwenEvolution.listConversationTasks(String(session.id)).find(item => item.source.turn === event.data.turn)
      if (task === undefined || task.completion !== undefined) return
      const events = structuredClone(session.events.filter(item => item.seq >= task.source.startSeq && item.seq <= event.seq))
      try {
        this.complete(task, events, event)
        this.track(this.review(agent, task.source.taskId, events))
      } catch (error) { this.warn(error) }
    })
    const offCreated = this.ctx.on('agent/created', ({ agent }) => this.restore(agent))
    const offConsent = this.ctx.on('tianwen/learning-consent-changed', () => {
      for (const controller of this.analyses) controller.abort()
    })
    for (const agent of this.ctx.agents.list()) this.restore(agent)
    this.ctx.effect(() => async () => {
      offStep(); offModel(); offSession(); offCreated(); offConsent(); this.shutdown.abort()
      await this.whenIdle()
    }, 'tianwen-conversation-observer.dispose')
  }

  async whenIdle(): Promise<void> { while (this.pending.size > 0) await Promise.allSettled([...this.pending]) }
  private warn(error: unknown): void { this.ctx.logger.warn('Conversation observation failed: %s', error instanceof Error ? error.message : String(error)) }
  private track(work: Promise<void>): void {
    const caught = work.catch(error => this.warn(error))
      .finally(() => this.pending.delete(caught))
    this.pending.add(caught)
  }
  private complete(task: ConversationTask, events: readonly SessionEvent[], terminal: Extract<SessionEvent, { type: 'turn/end' }>): void {
    if (task.admission === undefined) this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-admitted', taskId: task.source.taskId, decision: null, proof: null, unavailableReason: 'cancelled' })
    const answer = visible(events).filter(message => message.role === 'assistant')
    this.ctx.tianwenEvolution.recordConversationLearning({
      kind: 'task-finished', taskId: task.source.taskId, endSeq: terminal.seq,
      status: terminal.data.reason.kind === 'completed' ? 'completed' : terminal.data.reason.kind === 'aborted' ? 'interrupted' : 'failed',
      assistantMessageIds: answer.map(message => message.id), resultDigest: sha256(events),
      evidenceIds: events.filter(item => item.type === 'tool/result').map(item => sha256(item)),
    })
  }
  private restore(agent: Agent): void {
    if (!isRoot(agent) || this.restoring.has(agent)) return
    const work = this.recover(agent).finally(() => this.restoring.delete(agent))
    this.restoring.set(agent, work)
    this.track(work)
  }
  private async recover(agent: Agent): Promise<void> {
    const tasks = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id))
    if (tasks.length === 0) return
    const saved = await this.ctx.sessionPersistence.inspect(agent.session.id)
    const lifecycle = learningSessionLifecycleFingerprint({ sessionId: String(saved.meta.id), createdAt: saved.meta.createdAt, ...(saved.meta.cwd === undefined ? {} : { cwd: saved.meta.cwd }) })
    for (const task of tasks) {
      if (task.review !== undefined || task.source.sessionLifecycleFingerprint !== lifecycle) continue
      // An already attempted admission must never be regenerated after seeing
      // the answer; a missing durable result stays unavailable after restart.
      if (task.admission === undefined && task.completion === undefined) this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-admitted', taskId: task.source.taskId, decision: null, proof: null, unavailableReason: 'cancelled' })
      const end = saved.events.find(event => event.type === 'turn/end' && event.data.turn === task.source.turn)
      if (end?.type !== 'turn/end') continue
      const events = saved.events.filter(event => event.seq >= task.source.startSeq && event.seq <= end.seq)
      if (task.completion === undefined) this.complete(this.task(task.source.taskId), events, end)
      else if (task.completion.resultDigest !== sha256(events)) throw new Error('recovered task boundary does not match the recorded result')
      // Recovery waits for the durable review receipt, never its model response.
      await this.review(agent, task.source.taskId, events)
    }
  }
  private task(taskId: string): ConversationTask {
    const task = this.ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === taskId)
    if (task === undefined) throw new Error('conversation source disappeared')
    return task
  }
  private authorized(revision?: number): boolean {
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    return consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3'
      && (revision === undefined || consent.revision === revision)
  }

  private async admit(agent: Agent, turn: number, messages: readonly UserMessage[], stepSignal: AbortSignal): Promise<{ readonly guidance: string | undefined, readonly feedback: boolean, readonly consentRevision: number } | undefined> {
    const direct = messages.filter(message => message.source.kind === 'user')
    if (direct.length === 0) return
    if (!this.authorized()) {
      const consentAgent = this.ctx.get('tianwenLearningConsentAgent')
      if (consentAgent !== undefined) this.track(consentAgent.observeConversationWithoutConsent(String(agent.session.id)).then(() => undefined))
      return
    }
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()!
    const sourceIdentity = {
      sessionId: String(agent.session.id), turn,
      sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({ sessionId: String(agent.session.id), createdAt: agent.session.header.createdAt, ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }) }),
    }
    const legacy = this.ctx.tianwenEvolution.getRunBindingBySessionId(sourceIdentity.sessionId)
    // The native summary adapter already owns its admitted first Turn. Do not
    // duplicate that source or route its feedback into a different scope.
    // Later ordinary Turns in the same Session still participate below.
    if (turn === 1 && legacy?.schemaVersion === 'tianwen.run-binding.v3'
      && legacy.sessionLifecycleFingerprint === sourceIdentity.sessionLifecycleFingerprint
      && legacy.scopeKey === RESEARCH_SUMMARY_SCOPE && legacy.acceptanceContract.toolName === RESEARCH_SUMMARY_TOOL_NAME) return
    const taskId = conversationTaskId(sourceIdentity)
    const existing = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id)).find(task => task.source.taskId === taskId)
    if (existing !== undefined) return
    const boundary = agent.session.events.findLast(event => event.type === 'turn/start' && event.data.turn === turn)
    if (boundary === undefined) return
    const earlier = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id))
      .filter(task => task.source.consentRevision === consent.revision && task.completion !== undefined).slice(-8)
    const materialProjection = 'surface-text.v1' as const
    const context = conversationContext(agent.session.events, boundary.seq, materialProjection)
    const scopeKey = `conversation:${sha256({ cwd: agent.session.header.cwd ?? null })}`
    this.ctx.tianwenEvolution.retireIncompatibleConversationGuidance(scopeKey)
    const snapshot = this.ctx.tianwenEvolution.getConversationGuidance(scopeKey)
    const source: ConversationTaskSource = {
      kind: 'task-started', taskId, ...sourceIdentity, startSeq: boundary.seq,
      userMessageIds: direct.map(message => String(message.id)), requestDigest: sha256(direct), contextDigest: sha256(context),
      scopeKey, consentRevision: consent.revision, behaviorVersion: guidanceVersion(snapshot), materialProjection,
    }
    this.ctx.tianwenEvolution.recordConversationLearning(source)
    const qualityContract = conversationQualityContract()
    const controller = new AbortController(); this.analyses.add(controller)
    const signal = AbortSignal.any([stepSignal, this.shutdown.signal, controller.signal])
    try {
      const result = await runConversationJudgment(this.ctx, agent, {
        label: `Tianwen admission ${taskId}`, instruction: ADMISSION_INSTRUCTION, outputSchema: conversationAdmissionSchema(earlier.map(task => task.source.taskId)),
        material: { request: direct, context, qualityContract, priorTasks: earlier.map(task => ({ taskId: task.source.taskId, objective: task.admission?.decision?.objective, answerIds: task.completion!.assistantMessageIds })) }, signal,
      })
      if (!this.authorized(consent.revision)) throw new Error('cancelled')
      const decision = parseConversationAdmission(result.value)
      if (decision.relatedTaskId !== null && !earlier.some(task => task.source.taskId === decision.relatedTaskId)) throw new TypeError('feedback target is not an available earlier task')
      if (decision.feedback !== null && !directText(direct).includes(decision.feedback.quote)) throw new TypeError('feedback quote is not in current direct user input')
      this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-admitted', taskId, decision, proof: result.proof, unavailableReason: null, qualityContract })
      return { guidance: decision.kind === 'task' ? snapshot.rules[decision.family] : undefined, feedback: decision.feedback !== null, consentRevision: consent.revision }
    } catch (error) {
      this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-admitted', taskId, decision: null, proof: null, unavailableReason: unavailable(error, signal), qualityContract })
    } finally { this.analyses.delete(controller) }
  }

  private async review(agent: Agent, taskId: string, events: readonly SessionEvent[]): Promise<void> {
    const task = this.task(taskId)
    if (task.admission === undefined || task.completion === undefined || task.review !== undefined || this.reviewing.has(taskId)) return
    this.reviewing.add(taskId)
    const base = { kind: 'task-reviewed' as const, taskId, admissionDigest: sha256(task.admission), resultDigest: task.completion.resultDigest }
    const controller = new AbortController(); this.analyses.add(controller)
    const signal = AbortSignal.any([this.shutdown.signal, controller.signal])
    const failed = (error: unknown) => {
      this.ctx.tianwenEvolution.recordConversationLearning({ ...base, verdict: 'inconclusive', category: null, explanation: 'Automatic review could not establish the task result.', evidenceQuotes: [], proof: null, unavailableReason: unavailable(error, signal) })
    }
    const settled = () => { this.analyses.delete(controller); this.reviewing.delete(taskId) }
    let queued = false
    try {
      if (task.reviewIntent !== undefined) throw new Error('cancelled')
      if (!this.authorized(task.source.consentRevision)) throw new Error('cancelled')
      if (!hasCurrentConversationQuality(task.admission.qualityContract)) throw new Error('cancelled')
      if (task.admission.decision?.kind !== 'task' || task.completion.status !== 'completed') {
        this.ctx.tianwenEvolution.recordConversationLearning({ ...base, verdict: 'inconclusive', category: null, explanation: 'No completed task with frozen acceptance criteria.', evidenceQuotes: [], proof: null, unavailableReason: task.admission.unavailableReason })
        return
      }
      if (!await this.ctx.sessions.flush(agent.session)) throw new Error('task persistence unavailable')
      const source = await recoverConversationTaskMaterial(this.ctx, task)
      const callConfig = await recoverConversationTaskModel(this.ctx, task)
      const material = { source, evaluationMode: task.admission.decision.evaluationMode, conversation: visible(events, task.source.materialProjection), toolEvidence: events.filter(event => event.type === 'tool/result') }
      if (material.conversation.some(message => message.role === 'user' && !task.source.userMessageIds.includes(message.id))) throw new TypeError('user request changed after criteria were frozen')
      this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-review-started', taskId, materialDigest: sha256(material) })
      const judge = async () => {
        const evidence = conversationEvidenceTexts(source, material.conversation.filter(message => message.role === 'assistant')
          .flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])), material.toolEvidence)
        const result = await runConversationClaimReview(this.ctx, agent, { label: `Tianwen review ${taskId}`, evidence, material, signal, callConfig })
        if (!this.authorized(task.source.consentRevision)) throw new Error('cancelled')
        const review = { ...result, ...base, unavailableReason: null }
        if (material.evaluationMode !== 'text' && review.verdict === 'met') {
          this.ctx.tianwenEvolution.recordConversationLearning({ ...review, verdict: 'inconclusive' })
        } else this.ctx.tianwenEvolution.recordConversationLearning(review)
      }
      queued = true
      this.track(judge().catch(failed).finally(settled))
    } catch (error) { failed(error) }
    finally { if (!queued) settled() }
  }
}
