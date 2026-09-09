import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { parseConversationFileEntries, parseConversationFileResult, sha256, type ConversationFileResult, type ConversationTask, type ConversationTaskFileUnavailable } from '@tianwen/evolution'
import { TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'
import { conversationFilePath, readConversationFile } from './conversation-file-material.js'

declare module '@deepseek-ai/cordis' {
  interface Context { tianwenConversationFileObserver: TianwenConversationFileObserverService }
}

interface CaptureState {
  readonly taskId: string
  readonly consentRevision: number
  readonly cwd: string
  readonly outputKind: 'files' | 'chat'
  readonly captures: Map<string, Promise<void>>
  readonly outputPaths: Map<string, string>
  readonly successfulReads: Set<string>
  unavailable: boolean
  revoked: boolean
  final?: ConversationFileResult
}

function isRoot(agent: Agent): boolean {
  return agent.session.header.parentSession === undefined && agent.session.header.origin !== 'subagent'
    && agent.session.header.agentPreset !== TIANWEN_CONTROLLED_AGENT_PRESET
}

function nativePath(exec: ToolDispatchExecution): string | undefined {
  if (exec.arguments === null || typeof exec.arguments !== 'object' || Array.isArray(exec.arguments)) return
  const path = (exec.arguments as Record<string, unknown>).file_path
  return typeof path === 'string' ? path : undefined
}

export class TianwenConversationFileObserverService extends Service {
  static inject = ['agents', 'tools', 'tianwenEvolution'] as const
  private readonly states = new Map<string, CaptureState>()

  constructor(ctx: Context) { super(ctx, 'tianwenConversationFileObserver') }

  protected [Service.init](): void {
    const offExecute = this.ctx.on('tools/execute', async (exec, next) => this.observe(exec, next))
    const offStopping = this.ctx.on('agent/turn-stopping', async ({ agent, turn }) => {
      if (!isRoot(agent)) return
      const task = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id)).find(item => item.source.turn === turn)
      if (task === undefined) return
      const state = this.states.get(task.source.taskId)
      if (state === undefined) return
      try { await this.freeze(task, state, agent) }
      catch (error) { this.unavailable(state, this.reason(error)); this.warn(error) }
    })
    const offConsent = this.ctx.on('tianwen/learning-consent-changed', () => {
      for (const state of this.states.values()) {
        if (!this.authorized(state.consentRevision)) { state.revoked = true; delete state.final }
      }
    })
    this.ctx.effect(() => () => { offExecute(); offStopping(); offConsent(); this.states.clear() }, 'tianwen-conversation-file-observer.dispose')
  }

  takeResult(taskId: string): ConversationFileResult | undefined {
    const state = this.states.get(taskId)
    if (state === undefined || state.revoked || state.unavailable || !this.authorized(state.consentRevision)) return
    const result = state.final === undefined ? undefined : structuredClone(state.final)
    delete state.final
    return result
  }

  private current(exec: ToolDispatchExecution): { readonly task: ConversationTask, readonly state: CaptureState } | undefined {
    const agent = exec.agent
    if (agent === undefined || !isRoot(agent)) return
    const call = agent.session.events.findLast(event => event.type === 'tool/call' && String(event.data.callId) === String(exec.callId))
    if (call?.type !== 'tool/call') return
    const task = this.ctx.tianwenEvolution.listConversationTasks(String(agent.session.id))
      .find(item => item.source.turn === call.data.turn && item.admission?.decision?.kind === 'task'
        && item.admission.decision.evaluationMode === 'local-files' && item.completion === undefined)
    const outputKind = task?.admission?.decision?.fileOutputKind
    const cwd = agent.session.header.cwd
    if (task === undefined || outputKind === undefined || cwd === undefined) return
    let state = this.states.get(task.source.taskId)
    if (state === undefined) {
      state = { taskId: task.source.taskId, consentRevision: task.source.consentRevision, cwd, outputKind,
        captures: new Map(), outputPaths: new Map(), successfulReads: new Set(), unavailable: false, revoked: false }
      this.states.set(task.source.taskId, state)
    }
    return { task, state }
  }

  private async observe(exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    const current = this.current(exec)
    if (current === undefined) return next()
    const { task, state } = current
    delete state.final
    if (state.revoked || !this.authorized(state.consentRevision)) { state.revoked = true; return next() }
    const supported = exec.name === 'read' || exec.name === 'write' || exec.name === 'edit'
    if (!supported || exec.parent !== undefined || String(exec.rootCallId) !== String(exec.callId)
      || state.outputKind === 'chat' && exec.name !== 'read') {
      this.unavailable(state, 'unsupported-tool')
      return next()
    }
    const candidate = nativePath(exec)
    if (candidate === undefined) {
      this.unavailable(state, 'material-unavailable')
      return next()
    }
    let path: string | undefined
    try {
      path = await conversationFilePath(state.cwd, candidate)
      const alias = path.toLowerCase()
      let capture = state.captures.get(alias)
      if (capture === undefined) {
        capture = readConversationFile(state.cwd, path).then(entry => this.capture(task, state, exec, entry))
        state.captures.set(alias, capture)
      }
      await capture
    } catch (error) {
      this.unavailable(state, this.reason(error)); this.warn(error)
    }
    const result = await next()
    if (result.isError) this.unavailable(state, 'capture-interrupted')
    else if (exec.name === 'read') state.successfulReads.add(String(exec.callId))
    else if (path !== undefined) state.outputPaths.set(path.toLowerCase(), path)
    return result
  }

  private async capture(task: ConversationTask, state: CaptureState, exec: ToolDispatchExecution, entry: { readonly path: string, readonly content: string | null }): Promise<void> {
    if (!this.authorized(state.consentRevision)) { state.revoked = true; return }
    const event = exec.agent?.session.events.findLast(item => item.type === 'tool/call' && String(item.data.callId) === String(exec.callId))
    if (event?.type !== 'tool/call' || event.data.name !== exec.name) throw new Error('native file call identity is unavailable')
    let argumentsValue: unknown
    try { argumentsValue = JSON.parse(event.data.arguments) } catch { throw new Error('native file call arguments are unavailable') }
    if (sha256(argumentsValue) !== sha256(exec.arguments)) throw new Error('native file call arguments changed')
    if (!this.authorized(state.consentRevision)) { state.revoked = true; return }
    this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-file-input-captured', taskId: task.source.taskId,
      callId: String(exec.callId), callSeq: event.seq, path: entry.path, content: entry.content })
  }

  private async freeze(task: ConversationTask, state: CaptureState, agent: Agent): Promise<void> {
    delete state.final
    if (state.revoked || state.unavailable || !this.authorized(state.consentRevision)) return
    await Promise.all(state.captures.values())
    const inputs = task.fileInputs?.map(input => ({ path: input.path, content: input.content })) ?? []
    if (inputs.length === 0 || state.outputKind === 'files' && state.outputPaths.size === 0
      || state.outputKind === 'chat' && state.successfulReads.size === 0) return
    const entries = parseConversationFileEntries(await Promise.all(inputs.map(entry => readConversationFile(state.cwd, entry.path))))
    const captureSeq = agent.session.events.at(-1)?.seq
    if (captureSeq === undefined) throw new Error('native file capture boundary is unavailable')
    state.final = parseConversationFileResult({
      schemaVersion: 'tianwen.conversation-file-result.v1', outputKind: state.outputKind,
      inputsDigest: sha256(inputs), captureSeq,
      outputPaths: state.outputKind === 'files' ? inputs.flatMap(entry => state.outputPaths.has(entry.path.toLowerCase()) ? [entry.path] : []) : [], entries,
    })
  }

  private authorized(revision: number): boolean {
    const consent = this.ctx.tianwenEvolution.getLearningAnalysisConsent()
    return consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' && consent.revision === revision
  }

  private unavailable(state: CaptureState, reason: ConversationTaskFileUnavailable['reason']): void {
    if (state.unavailable || state.revoked) return
    state.unavailable = true; delete state.final
    try { this.ctx.tianwenEvolution.recordConversationLearning({ kind: 'task-file-evidence-unavailable', taskId: state.taskId, reason }) }
    catch (error) { this.warn(error) }
  }

  private reason(error: unknown): ConversationTaskFileUnavailable['reason'] {
    if (error instanceof Error && /escape|link|path|root|regular file/iu.test(error.message)) return 'unsafe-path'
    return 'material-unavailable'
  }

  private warn(error: unknown): void {
    this.ctx.logger.warn('Conversation file observation failed: %s', error instanceof Error ? error.message : String(error))
  }
}
