import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { CAPTURED_FILE_FACTS_TOOL, capturedFileFacts, parseConversationFileEntries, parseConversationFileResult, sha256, type CapturedFileFacts, type ConversationFileResult, type ConversationTask, type ConversationTaskFileUnavailable } from '@tianwen/evolution'
import { isAbsolute } from 'node:path'
import { TIANWEN_CONTROLLED_AGENT_PRESET } from '@tianwen/runtime'
import { conversationFilePath, readConversationFile } from './conversation-file-material.js'
import { ConversationFileAncillaryCapture, isFileAncillaryTool, verifyConversationFileAncillary, type ConversationFileAncillaryConfig } from './conversation-file-ancillary.js'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

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
  readonly native: ConversationFileAncillaryCapture
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
  static inject = ['agents', 'tools', 'sessions', 'tianwenEvolution'] as const
  private readonly states = new Map<string, CaptureState>()
  private readonly factDefinitions = new WeakSet<ToolDefinition>()
  private readonly installations = new Map<Agent, () => Promise<void>>()

  constructor(ctx: Context, private readonly config: ConversationFileAncillaryConfig = {}) { super(ctx, 'tianwenConversationFileObserver') }

  verifyAncillary(task: ConversationTask, cwd: string, events: readonly SessionEvent[], boundary: number): void {
    verifyConversationFileAncillary(task, cwd, events, boundary, this.config)
  }

  protected [Service.init](): void {
    for (const agent of this.ctx.agents.list()) this.installFacts(agent)
    const offAgent = this.ctx.on('agent/created', ({ agent }) => this.installFacts(agent))
    const offDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      const dispose = this.installations.get(agent)
      this.installations.delete(agent)
      void dispose?.()
    })
    const offExecute = this.ctx.on('tools/execute', async (exec, next) => this.observe(exec, next))
    // Native emit does not await listeners. Retain the frozen final value now.
    const offResult = this.ctx.on('tools/result', (exec, result) => {
      if (exec.agent === undefined || !isRoot(exec.agent)) return
      // Match call identity rather than a mutable current-turn property.
      const call = exec.agent.session.events.findLast(event => event.type === 'tool/call' && String(event.data.callId) === String(exec.callId))
      const current = call?.type === 'tool/call' ? this.ctx.tianwenEvolution.listConversationTasks(String(exec.agent.session.id))
        .find(item => item.source.turn === call.data.turn && item.completion === undefined) : undefined
      const state = current === undefined ? undefined : this.states.get(current.source.taskId)
      if (state !== undefined && !state.revoked) state.native.result(exec, result)
    })
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
        if (!this.authorized(state.consentRevision)) { state.revoked = true; state.native.discard(); delete state.final }
      }
    })
    this.ctx.effect(() => async () => {
      offExecute(); offResult(); offStopping(); offConsent(); offAgent(); offDisposed()
      await Promise.all([...this.installations.values()].map(dispose => dispose()))
      this.installations.clear(); this.states.clear()
    }, 'tianwen-conversation-file-observer.dispose')
  }

  isFactsDefinition(definition: ToolDefinition): boolean { return this.factDefinitions.has(definition) }

  private installFacts(agent: Agent): void {
    if (!isRoot(agent) || this.installations.has(agent)) return
    const service = this
    const definition = defineTool({
      name: CAPTURED_FILE_FACTS_TOOL,
      description: 'For an ordinary local-file task, get exact byte length, physical line count and SHA-256 for one UTF-8 workspace file. Use this instead of PowerShell counting or hashing. The result is tied to the captured initial file; give a relative file path.',
      parameters: { file_path: { type: 'string', required: true } },
      output: {
        schema: { type: 'object', properties: {
          path: { type: 'string', required: true }, bytes: { type: 'integer', required: true },
          lines: { type: 'integer', required: true }, sha256: { type: 'string', required: true },
        }, additionalProperties: false },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args, exec) { return service.factFor(args, exec) },
    })
    this.factDefinitions.add(definition)
    const dispose = agent.ctx.effect(function* () { yield agent.ctx.tools.register(definition) })
    this.installations.set(agent, dispose)
  }

  private async factFor(args: { file_path: string }, exec: ToolDispatchExecution): Promise<CapturedFileFacts> {
    if (Object.keys(args).length !== 1 || typeof args.file_path !== 'string' || isAbsolute(args.file_path)) throw new Error('captured file facts require one relative file path')
    const current = this.current(exec)
    if (current === undefined || current.state.revoked || current.state.unavailable || !this.authorized(current.state.consentRevision)) throw new Error('captured file facts require an active authorized local-file task')
    const path = await conversationFilePath(current.state.cwd, args.file_path)
    await current.state.captures.get(path.toLowerCase())
    const input = this.ctx.tianwenEvolution.listConversationTasks(String(exec.agent!.session.id))
      .find(item => item.source.taskId === current.task.source.taskId)?.fileInputs?.find(item => item.path === path)
    if (input === undefined) throw new Error('captured file preimage is unavailable')
    return capturedFileFacts(input)
  }

  takeResult(taskId: string): ConversationFileResult | undefined {
    const state = this.states.get(taskId)
    if (state === undefined) return
    const result = state.revoked || state.unavailable || !this.authorized(state.consentRevision) || state.final === undefined
      ? undefined : structuredClone(state.final)
    state.native.discard()
    this.states.delete(taskId)
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
        captures: new Map(), outputPaths: new Map(), successfulReads: new Set(), unavailable: false, revoked: false,
        native: new ConversationFileAncillaryCapture(this.ctx, task, cwd, this.config) }
      this.states.set(task.source.taskId, state)
    }
    return { task, state }
  }

  private async observe(exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    const current = this.current(exec)
    if (current === undefined) return next()
    const { task, state } = current
    delete state.final
    if (state.revoked || !this.authorized(state.consentRevision)) { state.revoked = true; state.native.discard(); return next() }
    try { await state.native.prepare(exec) }
    catch (error) { this.unavailable(state, 'material-unavailable'); this.warn(error) }
    if (isFileAncillaryTool(exec.name) && exec.name !== CAPTURED_FILE_FACTS_TOOL) return state.native.execute(exec, next)
    const supported = exec.name === 'read' || exec.name === 'write' || exec.name === 'edit' || exec.name === CAPTURED_FILE_FACTS_TOOL
    if (!supported || exec.parent !== undefined || String(exec.rootCallId) !== String(exec.callId)
      || state.outputKind === 'chat' && exec.name !== 'read' && exec.name !== CAPTURED_FILE_FACTS_TOOL) {
      this.unavailable(state, 'unsupported-tool')
      return next()
    }
    const candidate = nativePath(exec)
    if (candidate === undefined || exec.name === CAPTURED_FILE_FACTS_TOOL && isAbsolute(candidate)) {
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
    const result = await state.native.execute(exec, next)
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
    if (state.outputKind === 'chat' && sha256(entries) !== sha256(inputs)) throw new Error('conversation read-only file changed before capture boundary')
    const captureSeq = agent.session.events.at(-1)?.seq
    if (captureSeq === undefined) throw new Error('native file capture boundary is unavailable')
    const current = this.ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === task.source.taskId)!
    const ancillary = await state.native.freeze(current, agent, captureSeq)
    const fresh = ancillary.filter(record => !current.fileAncillary?.some(existing => sha256(existing) === sha256(record)))
    if (fresh.length > 0) {
      if (!await this.ctx.sessions.flush(agent.session)) throw new Error('native file ancillary durability listener is unavailable')
      if (agent.session.events.at(-1)?.seq !== captureSeq) throw new Error('native file ancillary capture boundary changed')
      for (const record of fresh) {
        if (!this.authorized(state.consentRevision)) { state.revoked = true; return }
        this.ctx.tianwenEvolution.recordConversationLearning(record)
      }
    }
    if (!this.authorized(state.consentRevision)) { state.revoked = true; return }
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
