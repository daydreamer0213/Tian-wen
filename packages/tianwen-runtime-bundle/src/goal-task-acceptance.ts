import type { Context } from '@deepseek-ai/cordis'
// Retain the public command/run event augmentation in standalone declaration graphs.
import '@deepseek-ai/dsh-commands'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { parseConversationExternalCheckOutcome, type ConversationExternalCheckOutcome } from '@tianwen/evolution/external-check'
import { sha256 } from '@tianwen/evolution/learning-intake'
import { withConversationObservationCancellation } from './observation-cancellation.js'
import { parseGoalTaskContentReviewPlan, type GoalCommandOrigin, type GoalTaskAcceptanceBinding, type GoalTaskContentReviewPlan } from './goal-task-acceptance-contract.js'
import type { LongGoalRecordV3, LongGoalTaskRecordV2, TianwenExecutionAttempt } from './long-goal-contract.js'
import { appendGoalTaskAcceptance, goalTaskAcceptanceGoalDigest as goalDigest, listLongGoals, readLongGoal, readTianwenTaskAttemptProjection } from './long-goal.js'
import { sandboxModeFromEvents } from './permission-attempt.js'
import { readGoalStatus } from './status.js'
import { readGoalTaskAcceptanceMaterial } from './goal-task-material.js'
import { readConversationFile } from './conversation-file-material.js'
import { finishGoalTaskContentReviews } from './goal-task-content-review.js'
import { conversationQualityContract } from '@tianwen/evolution/content-review'
import { publishGoalTaskResearchSources } from './goal-task-research-source.js'
import { guidanceVersion, parseGuidanceSnapshot } from '@tianwen/evolution/guidance'
import { GOAL_TASK_METHOD_PLUGIN, goalTaskMethodMessage, goalTaskMethodRule, goalTaskMethodWithdrawal, goalTaskUnboundMethodWithdrawal, parseGoalTaskMethodScope, readGoalTaskMethodUsage,
  type GoalTaskMethodBinding, type GoalTaskMethodScope } from './goal-task-method.js'

type CommandEvent = Extract<SessionEvent, { type: 'command/run' }>
export interface GoalTaskAcceptancePreparation {
  readonly goal: LongGoalRecordV3
  readonly task: LongGoalTaskRecordV2
  readonly attempt: TianwenExecutionAttempt
  /** Exact SDK command event, not the Planner's interpretation. */
  readonly source: CommandEvent
  readonly cwd: string
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly signal: AbortSignal
}
export interface PreparedGoalTaskAcceptanceCheck {
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly inputsDigest: ReturnType<typeof sha256>
  readonly requiredCondition: string
  readonly waitsForCancellationCleanup?: true
  /** Fixed before the Task's first request; old Tasks are never retroactively reviewed. */
  readonly contentReview?: Omit<GoalTaskContentReviewPlan, 'protocol'>
  /** Trusted host checks actual native evidence; generated programs require the existing isolated executor. */
  readonly evaluate: (candidate: {
    readonly preparation: GoalTaskAcceptanceBinding
    readonly source: CommandEvent
    readonly events: readonly SessionEvent[]
    readonly signal: AbortSignal
  }) => Promise<ConversationExternalCheckOutcome>
}
export interface GoalTaskAcceptanceCheck {
  /** Trusted project applicability only; the method body always comes from the existing governed library. */
  readonly methodScope?: (material: Omit<GoalTaskAcceptancePreparation, 'modelConfigDigest'>) => Promise<GoalTaskMethodScope | undefined>
  /** Undefined means this Task has no applicable pre-existing project check. */
  readonly prepare: (material: GoalTaskAcceptancePreparation) => Promise<PreparedGoalTaskAcceptanceCheck | undefined>
}

/** Only the currently executing direct-user /goal command may establish provenance. */
export function currentGoalCommandOrigin(agent: Agent | undefined, objective: string): GoalCommandOrigin | undefined {
  if (agent === undefined || agent.session.header.parentSession !== undefined || agent.session.header.origin === 'subagent') return
  const event = agent.session.events.findLast(item => item.type === 'command/run')
  if (event?.type !== 'command/run' || event.data.name !== 'goal' || event.data.source.kind !== 'user'
    || event.data.args?.trim() !== objective || agent.session.events.some(item => item.seq > event.seq
      && item.type === 'command/done' && item.data.commandId === event.data.commandId)) return
  return { sessionId: String(agent.session.id), commandId: String(event.data.commandId), commandSeq: event.seq, commandDigest: sha256(event) }
}

/** Optional LongGoal-owned connection. No new Agent loop, evolution source or learning permission. */
export class GoalTaskAcceptanceChecks {
  private readonly attempted = new Set<string>()
  private readonly states = new Map<string, PreparedGoalTaskAcceptanceCheck>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly shutdown = new AbortController()
  private readonly methods = new Map<string, { method: Omit<GoalTaskMethodBinding, 'messageSeq'>;
    goalDigest: ReturnType<typeof sha256>; taskDigest: ReturnType<typeof sha256>; attemptDigest: ReturnType<typeof sha256> }>()
  constructor(private readonly ctx: Context, private readonly roots: {
    readonly stateRoot: string, readonly sessionsRoot: string, readonly evolutionRoot: string
  }, private readonly check?: GoalTaskAcceptanceCheck) {}
  private get stateRoot(): string { return this.roots.stateRoot }

  mount(): () => Promise<void> {
    const savedGoals = listLongGoals(this.stateRoot)
    if (this.check === undefined && !savedGoals.some(goal => goal.schemaVersion === 'tianwen.long-goal.v3'
      && goal.origin !== undefined && goal.tasks.some(task => task.execution !== null))) return async () => {}
    // Recover pending consumption of already-persisted results, never rerun a checker.
    for (const goal of savedGoals) void this.finishGoal(goal.id).catch(error => this.warn(error))
    const owner = this
    const offStep = this.ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (decision.kind === 'enter') {
        try { await owner.provideMethod(payload.agent, decision.messages, payload.signal) }
        catch (error) { owner.warn(error) }
      }
      return decision
    })
    const off = this.ctx.on('llm/stream', async function* (request, next) {
      const agent = request.sessionId === undefined ? undefined : owner.ctx.agents.get(SessionId(String(request.sessionId)))
      if (agent !== undefined && isAgentLoopRequest(request)) {
        try {
          await owner.prepare(agent, request.signal ?? owner.shutdown.signal)
          owner.assertMethodDispatch(agent)
        } catch (error) {
          // Do not send an unrecorded or newly unauthorized method after preparation failed.
          if (owner.methodState(agent) !== undefined || agent.session.events.some(event => event.type === 'user/message'
            && event.data.source.kind === 'plugin' && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN)) throw error
          owner.warn(error)
        }
      }
      yield* next()
    })
    return async () => { offStep(); off(); this.shutdown.abort(); await Promise.allSettled(this.pending.values()); this.states.clear(); this.methods.clear() }
  }

  private warn(error: unknown): void { this.ctx.logger('tianwen-goal-acceptance').warn('Acceptance unavailable: %s', this.detail(error)) }
  private detail(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'unavailable' }
  private read(id: string): LongGoalRecordV3 | undefined {
    const record = readLongGoal(this.stateRoot, id)
    return record.schemaVersion === 'tianwen.long-goal.v3' ? record : undefined
  }
  private find(sessionId: string) {
    for (const summary of listLongGoals(this.stateRoot)) {
      const goal = this.read(summary.id)
      const task = goal?.tasks.find(item => item.execution?.sessionId === sessionId)
      if (goal?.origin === undefined || task?.execution === null || task === undefined) continue
      const attempt = readTianwenTaskAttemptProjection(goal, task.id).attempts.at(-1)
      if (attempt?.childSessionId === sessionId) return { goal, task, attempt }
    }
  }
  private async source(goal: LongGoalRecordV3): Promise<CommandEvent> {
    const origin = goal.origin!
    const control = this.ctx.sessions.get(SessionId(origin.sessionId))
    if (control !== undefined && !await this.ctx.sessions.flush(control)) throw new Error('original command persistence unavailable')
    const saved = await this.ctx.sessionPersistence.inspect(SessionId(origin.sessionId))
    const event = saved.events.find(item => item.seq === origin.commandSeq)
    if (saved.meta.parentSession !== undefined || saved.meta.origin === 'subagent'
      || event?.type !== 'command/run' || String(event.data.commandId) !== origin.commandId || sha256(event) !== origin.commandDigest
      || event.data.source.kind !== 'user' || event.data.name !== 'goal' || event.data.args?.trim() !== goal.objective) {
      throw new Error('original direct-user Goal command binding unavailable')
    }
    return event
  }

  private methodState(agent: Agent) {
    const found = this.find(String(agent.session.id))
    if (found === undefined) return
    const key = `${found.goal.id}:${found.task.id}:${found.attempt.epoch}`
    const binding = found.goal.tianwenEvents?.find(event => event.type === 'task-acceptance-prepared'
      && event.taskId === found.task.id && event.binding.epoch === found.attempt.epoch)
    const pending = this.methods.get(key)
    const method = binding?.type === 'task-acceptance-prepared' ? binding.binding.method : pending?.method
    if (method === undefined) return
    return { found, method, pending, binding: binding?.type === 'task-acceptance-prepared' ? binding.binding : undefined }
  }
  private methodIsCurrent(state: NonNullable<ReturnType<GoalTaskAcceptanceChecks['methodState']>>): boolean {
    if (goalTaskMethodRule(state.method) === undefined) return true
    const { found, method, binding, pending } = state
    return this.authorized(method.consentRevision) && !this.shutdown.signal.aborted
      && guidanceVersion(this.ctx.tianwenEvolution.getConversationGuidance(method.snapshot.scopeKey)) === method.version
      && goalDigest(found.goal) === (binding?.goalDigest ?? pending?.goalDigest)
      && sha256(found.task) === (binding?.taskDigest ?? pending?.taskDigest)
      && (binding === undefined ? sha256(found.attempt) === pending?.attemptDigest
        : found.attempt.permissionFingerprint === binding.permissionFingerprint)
  }
  private methodWithdrawn(agent: Agent, state: NonNullable<ReturnType<GoalTaskAcceptanceChecks['methodState']>>): boolean {
    const text = goalTaskMethodWithdrawal(state.found.task.id, state.found.attempt.epoch, state.method.version)
    return agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'plugin'
      && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN && sha256(event.data.content) === sha256([{ type: 'text', text }]))
  }
  private assertMethodDispatch(agent: Agent): void {
    const state = this.methodState(agent)
    if (state !== undefined && state.binding === undefined) throw new Error('Goal Task method has no original durable binding')
    if (state?.binding !== undefined) readGoalTaskMethodUsage(state.binding, agent.session.events)
    const found = state?.found ?? this.find(String(agent.session.id))
    if (state === undefined && found !== undefined && agent.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin' && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN)
      && !this.unboundMethodWithdrawn(agent, found.task.id, found.attempt.epoch)) throw new Error('Goal Task method has no original durable binding')
    if (state !== undefined && !this.methodWithdrawn(agent, state) && !this.methodIsCurrent(state)) {
      throw new Error('Goal Task method authorization or original binding changed before dispatch')
    }
  }
  private unboundMethodWithdrawn(agent: Agent, taskId: string, epoch: number): boolean {
    return agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'plugin'
      && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN && sha256(event.data.content)
        === sha256([{ type: 'text', text: goalTaskUnboundMethodWithdrawal(taskId, epoch) }]))
  }
  private async provideMethod(agent: Agent, messages: UserMessage[], stepSignal: AbortSignal): Promise<void> {
    const state = this.methodState(agent)
    if (state !== undefined) {
      if (this.methodWithdrawn(agent, state)) return
      let valid = false
      try { valid = this.methodIsCurrent(state) } catch { /* Unavailable governance never authorizes an old method. */ }
      if (!valid) messages.push(createUserMessage({ source: { kind: 'plugin', plugin: GOAL_TASK_METHOD_PLUGIN },
        content: [{ type: 'text', text: goalTaskMethodWithdrawal(state.found.task.id, state.found.attempt.epoch, state.method.version) }] }))
      return
    }
    const found = this.find(String(agent.session.id)), select = this.check?.methodScope
    if (found !== undefined && agent.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin' && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN)) {
      if (!this.unboundMethodWithdrawn(agent, found.task.id, found.attempt.epoch)) messages.push(createUserMessage({
        source: { kind: 'plugin', plugin: GOAL_TASK_METHOD_PLUGIN },
        content: [{ type: 'text', text: goalTaskUnboundMethodWithdrawal(found.task.id, found.attempt.epoch) }] }))
      return
    }
    if (found === undefined || select === undefined || found.attempt.status !== 'running'
      || agent.session.events.some(event => ['request/header', 'assistant/message', 'tool/call', 'tool/result'].includes(event.type))) return
    const { goal, task, attempt } = found, consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    if (consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3') return
    const signal = AbortSignal.any([stepSignal, this.shutdown.signal]), prefix = sha256(agent.session.events)
    const source = await this.source(goal)
    const selection = await withConversationObservationCancellation(signal, () => select({ goal: structuredClone(goal), task: structuredClone(task),
      attempt: structuredClone(attempt), source: structuredClone(source), cwd: goal.workspaceRoot, signal }))
    if (selection === undefined) return
    const scope = parseGoalTaskMethodScope(selection), scopeKey = `conversation:${sha256({ cwd: goal.workspaceRoot })}`
    this.ctx.tianwenEvolution.retireIncompatibleConversationGuidance(scopeKey)
    const snapshot = parseGuidanceSnapshot(this.ctx.tianwenEvolution.getConversationGuidance(scopeKey))
    const latest = this.find(String(agent.session.id))
    signal.throwIfAborted()
    if (snapshot.scopeKey !== scopeKey || !this.authorized(consent.revision) || latest === undefined
      || goalDigest(latest.goal) !== goalDigest(goal) || sha256(latest.task) !== sha256(task) || sha256(latest.attempt) !== sha256(attempt)
      || prefix !== sha256(agent.session.events) || agent.session.header.cwd !== goal.workspaceRoot
      || String(agent.session.header.parentSession) !== attempt.parentSessionId) throw new Error('Goal Task method selection changed original binding')
    const method = { protocol: 'tianwen.goal-task-method.v1' as const, scope, snapshot, version: guidanceVersion(snapshot), consentRevision: consent.revision }
    const message = createUserMessage({ source: { kind: 'plugin', plugin: GOAL_TASK_METHOD_PLUGIN },
      content: [{ type: 'text', text: goalTaskMethodMessage(task.id, attempt.epoch, method) }] })
    this.methods.set(`${goal.id}:${task.id}:${attempt.epoch}`, { method: { ...method, messageId: String(message.id) },
      goalDigest: goalDigest(goal), taskDigest: sha256(task), attemptDigest: sha256(attempt) })
    messages.push(message)
  }

  private async prepare(agent: Agent, stepSignal: AbortSignal): Promise<void> {
    if (agent.session.header.parentSession === undefined) return
    const found = this.find(String(agent.session.id))
    if (this.check === undefined || found === undefined || found.attempt.status !== 'running') return
    const { goal, task, attempt } = found
    const key = `${goal.id}:${task.id}:${attempt.epoch}`
    if (this.attempted.has(key) || goal.tianwenEvents?.some(event => event.type === 'task-acceptance-prepared'
      && event.taskId === task.id && event.binding.epoch === attempt.epoch)) return
    this.attempted.add(key)
    const headers = agent.session.events.filter(item => item.type === 'request/header')
    const header = headers[0]
    if (headers.length !== 1 || header?.type !== 'request/header' || agent.session.header.cwd !== goal.workspaceRoot
      || String(agent.session.header.parentSession) !== attempt.parentSessionId
      || agent.session.events.some(item => ['assistant/message', 'tool/call', 'tool/result'].includes(item.type))) return
    const signal = AbortSignal.any([stepSignal, this.shutdown.signal])
    const prefixDigest = sha256(agent.session.events)
    const modelConfigDigest = sha256(header.data.header.config)
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    const learningConsentRevision = consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' ? consent.revision : undefined
    const source = await this.source(goal)
    const prepared = await withConversationObservationCancellation(signal, () => this.check!.prepare({
      goal: structuredClone(goal), task: structuredClone(task), attempt: structuredClone(attempt), source: structuredClone(source),
      cwd: goal.workspaceRoot, modelConfigDigest, signal,
    }))
    const selectedMethod = this.methods.get(key)?.method
    if (prepared === undefined) {
      if (selectedMethod !== undefined) throw new Error('Goal Task method requires its original project acceptance preparation')
      return
    }
    const methodEvent = selectedMethod === undefined ? undefined : agent.session.events.find(event => event.type === 'user/message'
      && String(event.data.id) === selectedMethod.messageId)
    if (selectedMethod !== undefined && (methodEvent?.type !== 'user/message' || methodEvent.seq >= header.seq)) throw new Error('Goal Task method was not provided before its original request')
    const contentReview = prepared.contentReview === undefined ? undefined : parseGoalTaskContentReviewPlan({
      protocol: 'tianwen.goal-task-content-review.v1', qualityContract: conversationQualityContract(), ...structuredClone(prepared.contentReview),
    })
    if (contentReview?.files !== undefined) {
      if (contentReview.files.cwd !== goal.workspaceRoot) throw new Error('content review files must belong to original Goal workspace')
      const actual = await Promise.all(contentReview.files.entries.map(entry => readConversationFile(goal.workspaceRoot, entry.path)))
      if (sha256(actual) !== sha256(contentReview.files.entries)) throw new Error('content review original file bytes differ')
    }
    signal.throwIfAborted()
    const latest = this.find(String(agent.session.id))
    if (latest === undefined || sha256(latest.task) !== sha256(task) || goalDigest(latest.goal) !== goalDigest(goal)
      || sha256(latest.attempt) !== sha256(attempt) || prefixDigest !== sha256(agent.session.events)
      || modelConfigDigest !== sha256(header.data.header.config) || typeof prepared.evaluate !== 'function') {
      throw new Error('acceptance preparation changed original Task binding')
    }
    const binding: GoalTaskAcceptanceBinding = {
      epoch: attempt.epoch, parentSessionId: attempt.parentSessionId, childSessionId: attempt.childSessionId,
      nativeGoalId: task.execution!.goalId, permissionFingerprint: attempt.permissionFingerprint,
      goalDigest: goalDigest(goal), taskDigest: sha256(task), headerSeq: header.seq, preparedSeq: agent.session.events.at(-1)!.seq, prefixDigest, modelConfigDigest,
      checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, contractDigest: prepared.contractDigest,
      inputsDigest: prepared.inputsDigest, requiredCondition: prepared.requiredCondition,
      ...(learningConsentRevision === undefined ? {} : { learningConsentRevision }),
      ...(contentReview === undefined ? {} : { contentReview }),
      ...(selectedMethod === undefined ? {} : { method: { ...selectedMethod, messageSeq: methodEvent!.seq } }),
      requirementsSnapshot: {
        goal: { id: goal.id, objective: goal.objective, context: goal.context, successCriteria: goal.successCriteria,
          workspaceRoot: goal.workspaceRoot, origin: structuredClone(goal.origin!) },
        task: structuredClone(task), ...(attempt.permissionMode === undefined ? {} : { permissionMode: attempt.permissionMode }),
      },
    }
    readGoalTaskMethodUsage(binding, agent.session.events)
    appendGoalTaskAcceptance({ stateRoot: this.stateRoot, longGoalId: goal.id, expectedRevision: latest.goal.revision,
      taskId: task.id, event: { type: 'task-acceptance-prepared', taskId: task.id, binding } })
    this.methods.delete(key)
    this.states.set(key, { ...prepared })
  }

  async finishGoal(longGoalId: string): Promise<void> {
    if (this.check === undefined) return
    const prior = this.pending.get(longGoalId)
    if (prior !== undefined) return prior
    const operation = this.finish(longGoalId).then(() => this.consumeOutcomes(longGoalId))
      .then(() => finishGoalTaskContentReviews(this.ctx, { stateRoot: this.stateRoot, goalId: longGoalId, signal: this.shutdown.signal }))
      .then(() => publishGoalTaskResearchSources(this.ctx, { stateRoot: this.stateRoot, goalId: longGoalId, signal: this.shutdown.signal }))
    this.pending.set(longGoalId, operation)
    try { await operation } finally { this.pending.delete(longGoalId) }
  }
  private async consumeOutcomes(longGoalId: string): Promise<void> {
    const goal = this.read(longGoalId)
    if (goal?.origin === undefined || this.shutdown.signal.aborted) return
    for (const event of goal.tianwenEvents ?? []) {
      if (event.type !== 'task-acceptance-prepared') continue
      const b = event.binding, revision = b.learningConsentRevision
      if (revision === undefined || !this.authorized(revision)) continue
      const result = goal.tianwenEvents?.find(item => item.type === 'task-acceptance-finished' && item.taskId === event.taskId && item.epoch === b.epoch)
      if (result?.type !== 'task-acceptance-finished') continue
      const material = await readGoalTaskAcceptanceMaterial(this.ctx, { stateRoot: this.stateRoot,
        goalId: goal.id, taskId: event.taskId, epoch: b.epoch })
      const existing = this.ctx.tianwenEvolution.listGoalTaskOutcomes().find(item => item.input.goalId === goal.id
        && item.input.taskId === event.taskId && item.input.epoch === b.epoch)
      if (existing !== undefined) {
        if (sha256(existing.input) !== sha256(material.outcomeInput)) throw new Error('Saved Goal Task outcome differs from original native material')
        if (this.shutdown.signal.aborted || !this.authorized(revision)) return
        // No new intake: later Goal context does not replace the already-saved original requirements.
        continue
      }
      // All async reads precede this synchronous final Goal/Task/attempt check and ledger write.
      const latest = this.find(b.childSessionId)
      if (latest === undefined || latest.attempt.epoch !== b.epoch) continue
      if (sha256(latest.task) !== b.taskDigest || goalDigest(latest.goal) !== b.goalDigest
        || latest.task.execution?.goalId !== b.nativeGoalId || latest.attempt.permissionFingerprint !== b.permissionFingerprint
        || sha256(material.preparation) !== sha256(b) || sha256(material.result) !== sha256(result)
        || sha256(latest.goal.tianwenEvents?.find(item => item.type === 'task-acceptance-prepared' && item.taskId === event.taskId && item.binding.epoch === b.epoch)) !== sha256(event)
        || sha256(latest.goal.tianwenEvents?.find(item => item.type === 'task-acceptance-finished' && item.taskId === event.taskId && item.epoch === b.epoch)) !== sha256(result)
        || sha256(latest.goal.origin) !== sha256(goal.origin)) {
        throw new Error('Goal Task outcome original native material changed')
      }
      if (this.shutdown.signal.aborted || !this.authorized(revision)) return
      // Source verification precedes the durable write; storage errors remain in the original Goal lane.
      this.ctx.tianwenEvolution.recordGoalTaskOutcome(material.outcomeInput!)
    }
  }
  private authorized(revision: number): boolean {
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    return consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' && consent.revision === revision
  }
  private async finish(longGoalId: string): Promise<void> {
    const goal = this.read(longGoalId)
    if (goal === undefined) return
    for (const event of goal.tianwenEvents ?? []) {
      if (event.type !== 'task-acceptance-prepared' || goal.tianwenEvents?.some(item => item.type === 'task-acceptance-finished'
        && item.taskId === event.taskId && item.epoch === event.binding.epoch)) continue
      const b = event.binding
      if (readTianwenTaskAttemptProjection(goal, event.taskId).attempts.at(-1)?.epoch !== b.epoch) continue
      const key = `${goal.id}:${event.taskId}:${b.epoch}`
      const agent = this.ctx.agents.get(SessionId(b.childSessionId))
      const native = await readGoalStatus({ goalId: b.nativeGoalId, sessionsRoot: this.roots.sessionsRoot, evolutionRoot: this.roots.evolutionRoot })
      if (native.session.id !== b.childSessionId || (native.goal.phase !== 'complete' && native.goal.phase !== 'blocked')) continue
      // Goal/change can occur inside a tool call, before the native final reply/turn end.
      await agent?.whenIdle()
      if (agent !== undefined && !await this.ctx.sessions.flush(agent.session)) throw new Error('Task result persistence unavailable')
      const saved = await this.ctx.sessionPersistence.inspect(SessionId(b.childSessionId))
      const end = saved.events.findLast(item => item.type === 'turn/end')
      if (end?.type !== 'turn/end' || end.seq <= b.headerSeq) continue
      const events = saved.events.filter(item => item.seq <= end.seq)
      let outcome: ConversationExternalCheckOutcome
      const evaluator = this.states.get(key)
      this.states.delete(key)
      try {
        const latest = this.find(b.childSessionId)
        const header = events.find(item => item.seq === b.headerSeq)
        if (latest === undefined || latest.attempt.epoch !== b.epoch || sha256(latest.task) !== b.taskDigest
          || goalDigest(latest.goal) !== b.goalDigest || latest.attempt.permissionFingerprint !== b.permissionFingerprint
          || sandboxModeFromEvents(events, false) !== latest.attempt.permissionMode || String(saved.meta.parentSession) !== b.parentSessionId
          || sha256(events.filter(item => item.seq <= b.preparedSeq)) !== b.prefixDigest
          || header?.type !== 'request/header' || sha256(header.data.header.config) !== b.modelConfigDigest
          || evaluator === undefined) throw new Error('original preparation or native binding unavailable')
        const source = await this.source(latest.goal)
        if (end.data.reason.kind !== 'completed') throw new Error('native Task turn did not complete')
        outcome = parseConversationExternalCheckOutcome(await withConversationObservationCancellation(this.shutdown.signal,
          () => evaluator.evaluate({ preparation: structuredClone(b), source: structuredClone(source), events: structuredClone(events), signal: this.shutdown.signal }), evaluator.waitsForCancellationCleanup === true))
        const after = this.find(b.childSessionId)
        const savedAfter = await this.ctx.sessionPersistence.inspect(SessionId(b.childSessionId))
        if (after === undefined || sha256(after.task) !== b.taskDigest || goalDigest(after.goal) !== b.goalDigest
          || after.attempt.permissionFingerprint !== b.permissionFingerprint || after.attempt.epoch !== b.epoch
          || sha256(savedAfter.events.filter(item => item.seq <= end.seq)) !== sha256(events)
          || sha256(await this.source(after.goal)) !== sha256(source)) throw new Error('native evidence changed during acceptance check')
        if (outcome.status === 'rejected' && outcome.failedRequiredConditionDigest !== undefined
          && outcome.failedRequiredConditionDigest !== sha256(b.requiredCondition)) throw new Error('failed condition differs from original requirement')
      } catch (error) { outcome = { status: 'unverifiable', detail: this.detail(error) } }
      if (this.shutdown.signal.aborted) return
      const latest = this.read(goal.id)!
      appendGoalTaskAcceptance({ stateRoot: this.stateRoot, longGoalId: goal.id, expectedRevision: latest.revision, taskId: event.taskId,
        event: { type: 'task-acceptance-finished', taskId: event.taskId, epoch: b.epoch, preparationDigest: sha256(b),
          endSeq: end.seq, materialDigest: sha256(events), outcome } })
    }
  }
}
