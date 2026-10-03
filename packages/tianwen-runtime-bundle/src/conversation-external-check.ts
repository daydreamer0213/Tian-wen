import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { SessionId, isAppendSurfaceEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { conversationExternalInputsDigest, parseConversationExternalCheckOutcome, sha256, supportsConversationCodeCheck, validateConversationExternalCheck,
  type ConversationExternalCheckOutcome, type ConversationFileEntry, type ConversationTask } from '@tianwen/evolution'
import { conversationContext, recoverConversationTaskMaterial, recoverConversationTaskModel, type ConversationTaskMaterial } from './conversation-task-material.js'
import { withConversationObservationCancellation } from './observation-cancellation.js'
export { withConversationObservationCancellation } from './observation-cancellation.js'

export interface ConversationExternalCodePreparation {
  readonly task: ConversationTask
  readonly request: readonly UserMessage[]
  readonly context: ConversationTaskMaterial['context']
  readonly cwd: string
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly signal: AbortSignal
}
export interface ConversationExternalCodeCandidate {
  readonly request: readonly UserMessage[]
  readonly context: ConversationTaskMaterial['context']
  readonly inputs: readonly ConversationFileEntry[]
  readonly outputs: readonly ConversationFileEntry[]
  readonly outputPaths: readonly string[]
  readonly signal: AbortSignal
}
export interface PreparedConversationExternalCodeCheck {
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly inputs: readonly ConversationFileEntry[]
  /** Original mandatory condition; evaluator marks only a proved failure of it. */
  readonly requiredCondition?: string
  /** Bounded isolated producers own cleanup and must settle before cancellation leaves the observer. */
  readonly waitsForCancellationCleanup?: true
  /** Trusted host code over frozen material. Generated code runs only through an explicit, bounded isolated host producer. */
  readonly evaluate: (candidate: ConversationExternalCodeCandidate) => Promise<ConversationExternalCheckOutcome>
}
export interface ConversationExternalCodeCheck {
  /** Undefined means the original request has no applicable trusted check. */
  readonly prepare: (material: ConversationExternalCodePreparation) => Promise<PreparedConversationExternalCodeCheck | undefined>
}

/** Owned by the ordinary observer, with no separate Agent loop or result store. */
export class ConversationExternalCodeChecks {
  private readonly states = new Map<string, Pick<PreparedConversationExternalCodeCheck, 'evaluate' | 'waitsForCancellationCleanup'>>()
  private readonly checking = new Set<string>()
  private readonly controllers = new Set<AbortController>()
  constructor(private readonly ctx: Context, private readonly check?: ConversationExternalCodeCheck) {}

  cancel(): void {
    for (const controller of this.controllers) controller.abort()
    this.states.clear()
  }
  private authorized(revision: number): boolean {
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    return consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' && consent.revision === revision
  }
  private task(taskId: string): ConversationTask | undefined {
    return this.ctx.tianwenEvolution.listConversationTasks().find(task => task.source.taskId === taskId)
  }

  async prepare(agent: Agent, turn: number, config: LlmCallConfig, stepSignal: AbortSignal): Promise<void> {
    const task = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id)).find(task => task.source.turn === turn)
    if (this.check === undefined || task === undefined || task.externalCheckPrepared !== undefined || task.completion !== undefined
      || (task.models?.length ?? 0) > 0 || (task.fileInputs?.length ?? 0) > 0
      || !supportsConversationCodeCheck(task.admission?.decision)
      || agent.session.header.cwd === undefined || !this.authorized(task.source.consentRevision)) return
    const controller = new AbortController(); this.controllers.add(controller)
    const signal = AbortSignal.any([stepSignal, controller.signal])
    try {
      const request = agent.session.events.flatMap(event => event.seq >= task.source.startSeq && event.type === 'user/message'
        && isAppendSurfaceEvent(event) && event.data.source.kind === 'user' && task.source.userMessageIds.includes(String(event.data.id)) ? [event.data] : [])
      const context = conversationContext(agent.session.events, task.source.startSeq, task.source.materialProjection)
      const modelConfigDigest = sha256(config)
      const preparedSeq = agent.session.events.at(-1)?.seq
      const eventDigest = sha256(agent.session.events)
      if (preparedSeq === undefined || sha256(request) !== task.source.requestDigest || sha256(context) !== task.source.contextDigest
        || agent.session.events.some(event => event.seq >= task.source.startSeq
          && ['assistant/message', 'tool/call', 'tool/result'].includes(event.type))) throw new Error('pre-answer task material unavailable')
      const prepared = await withConversationObservationCancellation(signal, () => this.check!.prepare({ task: structuredClone(task), request: structuredClone(request), context: structuredClone(context),
        cwd: agent.session.header.cwd!, modelConfigDigest, signal }))
      if (prepared === undefined || signal.aborted || !this.authorized(task.source.consentRevision)) return
      if (typeof prepared.evaluate !== 'function' || eventDigest !== sha256(agent.session.events)
        || modelConfigDigest !== sha256(config)) throw new Error('preparation changed native task state')
      this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-external-check-prepared', taskId: task.source.taskId, preparedSeq,
        requestDigest: task.source.requestDigest, contextDigest: task.source.contextDigest, admissionDigest: sha256(task.admission), modelConfigDigest,
        checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, contractDigest: prepared.contractDigest,
        inputsDigest: conversationExternalInputsDigest(prepared.inputs), ...(prepared.requiredCondition === undefined ? {} : { requiredCondition: prepared.requiredCondition }) })
      this.states.set(task.source.taskId, { evaluate: prepared.evaluate,
        ...(prepared.waitsForCancellationCleanup === true ? { waitsForCancellationCleanup: true } : {}) })
    } catch (error) { this.ctx.logger.warn('External check preparation unavailable: %s', this.detail(error)) }
    finally { this.controllers.delete(controller) }
  }

  private detail(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'check unavailable' }

  private async candidate(task: ConversationTask, signal: AbortSignal): Promise<ConversationExternalCodeCandidate> {
    const prepared = task.externalCheckPrepared!, completion = task.completion!
    validateConversationExternalCheck({ kind: 'task-external-check-finished', taskId: task.source.taskId,
      preparationDigest: sha256(prepared), resultDigest: completion.resultDigest,
      fileResultDigest: completion.files === undefined ? null : sha256(completion.files), status: 'verified', detail: 'Binding preflight.' }, task)
    const nativeSession = this.ctx.sessions.get(SessionId(task.source.sessionId))
    if (nativeSession === undefined || !await withConversationObservationCancellation(signal, () => this.ctx.sessions.flush(nativeSession))) {
      throw new Error('external check native task persistence unavailable')
    }
    const material = await recoverConversationTaskMaterial(this.ctx, task)
    const model = await recoverConversationTaskModel(this.ctx, task)
    const saved = await this.ctx.sessionPersistence.inspect(SessionId(task.source.sessionId))
    if (material.files === undefined || material.files.outputKind !== 'files' || completion.files === undefined
      || conversationExternalInputsDigest(material.files.entries) !== prepared.inputsDigest || sha256(model) !== prepared.modelConfigDigest
      || saved.events.some(event => event.seq >= task.source.startSeq && event.seq <= prepared.preparedSeq
        && ['assistant/message', 'tool/call', 'tool/result'].includes(event.type))) throw new Error('external check original task binding unavailable')
    return { request: material.request, context: material.context, inputs: material.files.entries,
      outputs: structuredClone(completion.files.entries), outputPaths: [...completion.files.outputPaths], signal }
  }

  async finish(taskId: string): Promise<void> {
    const task = this.task(taskId)
    if (task?.externalCheckPrepared === undefined || task.completion === undefined || task.externalCheckFinished !== undefined
      || this.checking.has(taskId) || !this.authorized(task.source.consentRevision)) return
    this.checking.add(taskId)
    const evaluator = this.states.get(taskId); this.states.delete(taskId)
    const controller = new AbortController(); this.controllers.add(controller)
    try {
      let outcome: ConversationExternalCheckOutcome = { status: 'unverifiable', detail: 'Prepared check state unavailable; no post-answer preparation or rerun.' }
      if (evaluator !== undefined) {
        try {
          const material = await this.candidate(task, controller.signal)
          if (controller.signal.aborted || !this.authorized(task.source.consentRevision)) return
          outcome = parseConversationExternalCheckOutcome(await withConversationObservationCancellation(controller.signal,
            () => evaluator.evaluate(material), evaluator.waitsForCancellationCleanup === true))
          // The check consumes frozen values; a concurrent rewrite of original
          // native evidence must still prevent a conclusive receipt.
          await this.candidate(task, controller.signal)
          // Validate the host outcome before leaving its failure boundary.
          // Durable writes below must still propagate storage/history errors.
          validateConversationExternalCheck({ kind: 'task-external-check-finished', taskId,
            preparationDigest: sha256(task.externalCheckPrepared), resultDigest: task.completion.resultDigest,
            fileResultDigest: task.completion.files === undefined ? null : sha256(task.completion.files), ...outcome }, task)
        } catch (error) { outcome = { status: 'unverifiable', detail: this.detail(error) } }
      }
      if (controller.signal.aborted || !this.authorized(task.source.consentRevision)) return
      this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-external-check-finished', taskId,
        preparationDigest: sha256(task.externalCheckPrepared), resultDigest: task.completion.resultDigest,
        fileResultDigest: task.completion.files === undefined ? null : sha256(task.completion.files), ...outcome })
    } finally { this.controllers.delete(controller); this.checking.delete(taskId) }
  }
}
