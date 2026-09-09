import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDefinition, ToolDispatchExecution, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { isAppendSurfaceEvent, type SessionEvent } from '@deepseek-ai/dsh-session'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
import { canonicalJson } from '@tianwen/evolution/learning-intake'
import { parseConversationTaskFileAncillary, parseConversationSkillAdmission, parseConversationSkillDefinition,
  projectConversationFileAncillaryContext, sha256, type ConversationSkillAdmission, type ConversationTask,
  type ConversationTaskFileAncillary, type ConversationAncillaryPayload } from '@tianwen/evolution'
import { conversationFilePath } from './conversation-file-material.js'
import { parseNativeDirectoryReceipt, type NativeDirectoryReceipt } from './native-tool-observation.js'
import type { NativeToolRegistrationProducer } from './native-tools-observer.js'

export interface ConversationFileAncillaryConfig {
  readonly evolutionRoot?: string
  readonly skillSources?: readonly ConversationSkillAdmission[]
}
type Call = Extract<SessionEvent, { type: 'tool/call' }>
type Result = Extract<SessionEvent, { type: 'tool/result' }>
interface Pending {
  readonly execution: ToolDispatchExecution
  readonly call: Call
  readonly definition: ToolDefinition
  readonly producer?: NativeToolRegistrationProducer
  readonly argumentsDigest: ReturnType<typeof sha256>
  method?: Extract<ConversationAncillaryPayload, { tool: 'skill' }>
  receipt?: NativeDirectoryReceipt
  result?: ToolExecutionResult
  settled: boolean
}
const ancillaryNames = new Set(['glob', 'grep', 'skill', 'pwsh'])
export function isFileAncillaryTool(name: string): boolean { return ancillaryNames.has(name) }
function assert(value: unknown): asserts value { if (!value) throw new Error('native file ancillary evidence is unavailable') }
function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const row = object(value)
  assert(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)))
  return row
}
function nativeRelative(cwd: string, target: string): string {
  return relative(cwd, resolve(cwd, target)).split(sep).join('/') || '.'
}
function nativeGlobRoot(cwd: string, args: Record<string, unknown>): string {
  if (args.path === undefined) return '.'
  assert(typeof args.path === 'string')
  // Native toWorkdirRelative preserves a relative argument's original spelling.
  return isAbsolute(args.path) ? relative(cwd, args.path) || '.' : args.path
}
export function recordedFilePath(cwd: string, candidate: unknown): string | undefined {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) return
  const child = nativeRelative(cwd, candidate)
  if (child === '.' || child === '..' || child.startsWith('../') || isAbsolute(child)) return
  return child
}
function normalizedNativePaths(cwd: string, value: unknown): string[] {
  assert(Array.isArray(value) && value.length <= 256)
  return value.map(raw => { const path = recordedFilePath(cwd, raw); assert(path !== undefined); return path })
}
function normalizedNativeMatches(cwd: string, value: unknown): Extract<ConversationAncillaryPayload, { tool: 'grep' }>['matches'] {
  assert(Array.isArray(value) && value.length <= 256)
  return value.map(raw => {
    const row = exact(raw, ['path', 'lineNumber', 'line'])
    const path = recordedFilePath(cwd, row.path); assert(path !== undefined)
    return { path, lineNumber: row.lineNumber as number, line: row.line as string }
  })
}
function registration(ctx: Context, definition: ToolDefinition): NativeToolRegistrationProducer | undefined {
  const runtime = ctx.tools as Context['tools'] & { nativeRegistration?: (definition: ToolDefinition) => NativeToolRegistrationProducer | undefined }
  return runtime.nativeRegistration?.(definition)
}
function resultFor(events: readonly SessionEvent[], call: Call, boundary: number): Result {
  const matches = events.filter((event): event is Result => event.type === 'tool/result'
    && String(event.data.message.source.callId) === String(call.data.callId))
  assert(matches.length === 1)
  const event = matches[0]!
  assert(isAppendSurfaceEvent(event) && event.seq > call.seq && event.seq <= boundary
    && event.sourceEventSeqs?.length === 1 && event.sourceEventSeqs[0] === call.seq
    && event.data.turn === call.data.turn && event.data.step === call.data.step
    && event.data.error === undefined && event.data.message.content[0].isError !== true)
  return event
}
function eventProjection(event: Result): unknown {
  return { content: event.data.message.content[0].content, isError: event.data.message.content[0].isError === true,
    ...(event.data.error === undefined ? {} : { error: event.data.error }), ...(event.data.meta === undefined ? {} : { meta: event.data.meta }) }
}
function finalProjection(result: ToolExecutionResult): unknown {
  return { content: result.content, isError: result.isError,
    ...(result.error?.info === undefined ? {} : { error: result.error.info }), ...(result.meta === undefined ? {} : { meta: result.meta }) }
}
function admitted(reference: ConversationSkillAdmission, task: ConversationTask, config: ConversationFileAncillaryConfig): void {
  const parsed = parseConversationSkillAdmission(reference)
  assert(config.evolutionRoot !== undefined && isAbsolute(config.evolutionRoot)
    && parsed.scopeKey === task.source.scopeKey
    && parsed.environmentDigest === sha256({ kind: 'tianwen.conversation-skill-environment.v1', evolutionRoot: config.evolutionRoot })
    && config.skillSources?.filter(item => item.name === parsed.name).length === 1
    && config.skillSources.some(item => sha256(item) === sha256(parsed)))
}
function skillValue(payload: Extract<ConversationAncillaryPayload, { tool: 'skill' }>): unknown {
  const definition = parseConversationSkillDefinition(payload.definition, payload.reference)
  return { name: definition.name, provider: definition.provider, content: definition.content,
    ...(definition.resourceBase === undefined ? {} : { resourceBase: definition.resourceBase }) }
}
function verifyDirectory(payload: Extract<ConversationAncillaryPayload, { tool: 'pwsh' }>, task: ConversationTask, cwd: string, call: Call): unknown {
  const receipt = parseNativeDirectoryReceipt(JSON.parse(payload.nativeReceiptJson))
  const value = object(JSON.parse(payload.nativeValueJson))
  const args = object(JSON.parse(call.data.arguments))
  assert(value.kind === 'foreground' && args.run_in_background !== true
    && receipt.identity.taskId === task.source.taskId && receipt.identity.sessionId === task.source.sessionId
    && receipt.identity.callId === String(call.data.callId) && receipt.command === args.command
    && resolve(receipt.workspaceRoot) === resolve(cwd)
    && resolve(receipt.cwd) === resolve(cwd, typeof args.workdir === 'string' ? args.workdir : '.'))
  const { kind: _kind, ...foreground } = value
  assert(receipt.nativeResultDigest === sha256(foreground))
  // executionSettingsDigest is the producer's witness over its actual spec and
  // config. It is retained inside this exact receipt, never reconstructed here.
  return value
}
function verifyGrepOrder(record: ConversationTaskFileAncillary, task: ConversationTask, cwd: string, events: readonly SessionEvent[], boundary: number): void {
  if (record.payload.tool !== 'grep') return
  for (const path of new Set(record.payload.matches.map(match => match.path))) {
    const input = task.fileInputs?.find(item => item.path === path && item.content !== null)
    assert(input !== undefined)
    const reads = events.filter((event): event is Call => event.type === 'tool/call' && event.data.name === 'read'
      && event.seq >= task.source.startSeq && event.seq < record.callSeq
      && recordedFilePath(cwd, object(JSON.parse(event.data.arguments)).file_path) === path)
    // Completeness belongs to the host preimage, not the model-facing read window.
    assert(reads.some(call => { try { return resultFor(events, call, boundary).seq < record.callSeq } catch { return false } }))
    assert(!events.some(event => event.type === 'tool/call' && event.seq >= task.source.startSeq && event.seq <= record.resultSeq
      && (event.data.name === 'write' || event.data.name === 'edit')
      && recordedFilePath(cwd, object(JSON.parse(event.data.arguments)).file_path)?.toLowerCase() === path.toLowerCase()))
  }
}

/** Rebind durable ancillary records without reading workspace files or tools. */
export function verifyConversationFileAncillary(task: ConversationTask, cwd: string, events: readonly SessionEvent[], boundary: number,
  config?: ConversationFileAncillaryConfig): void {
  const records = task.fileAncillary ?? []
  const calls = events.filter((event): event is Call => event.type === 'tool/call' && event.seq >= task.source.startSeq && isFileAncillaryTool(event.data.name))
  assert(records.length === calls.length)
  for (const raw of records) {
    const record = parseConversationTaskFileAncillary(raw)
    const call = calls.find(item => item.seq === record.callSeq)
    assert(call !== undefined && record.taskId === task.source.taskId && record.callId === String(call.data.callId)
      && call.data.name === record.payload.tool && record.argumentsDigest === sha256(JSON.parse(call.data.arguments)))
    const result = resultFor(events, call, boundary)
    assert(result.seq === record.resultSeq && sha256(result) === record.resultDigest)
    let value: unknown
    switch (record.payload.tool) {
      case 'glob': {
        const args = object(JSON.parse(call.data.arguments))
        const root = resolve(cwd, typeof args.path === 'string' ? args.path : '.')
        const child = relative(cwd, root)
        assert(child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child) && resolve(record.payload.root) === root)
        if (record.payload.nativeValueJson === undefined) value = { root: nativeRelative(cwd, root), paths: record.payload.paths }
        else {
          const raw = exact(JSON.parse(record.payload.nativeValueJson), ['root', 'paths'])
          assert(raw.root === nativeGlobRoot(cwd, args)
            && sha256(normalizedNativePaths(cwd, raw.paths)) === sha256(record.payload.paths))
          value = raw
        }
        break
      }
      case 'grep':
        if (record.payload.nativeValueJson === undefined) value = { matches: record.payload.matches }
        else {
          const raw = exact(JSON.parse(record.payload.nativeValueJson), ['matches'])
          assert(sha256(normalizedNativeMatches(cwd, raw.matches)) === sha256(record.payload.matches))
          value = raw
        }
        verifyGrepOrder(record, task, cwd, events, boundary); break
      case 'skill':
        assert(object(JSON.parse(call.data.arguments)).name === record.payload.reference.name)
        if (config !== undefined) admitted(record.payload.reference, task, config)
        value = skillValue(record.payload); break
      case 'pwsh': value = verifyDirectory(record.payload, task, cwd, call); break
    }
    assert(sha256(value) === record.valueDigest)
  }
  projectConversationFileAncillaryContext(records, (task.fileInputs ?? []).map(({ path, content }) => ({ path, content })))
}

/** Per-task in-memory observation; no replacement tool or result wrapper. */
export class ConversationFileAncillaryCapture {
  private readonly pending = new Map<string, Pending>()
  private invalid = false
  constructor(private readonly ctx: Context, private readonly task: ConversationTask, private readonly cwd: string,
    private readonly config: ConversationFileAncillaryConfig) {}

  discard(): void {
    this.invalid = true
    // Async prepare/execute can still hold a row after removal from the map.
    for (const pending of this.pending.values()) {
      delete pending.method; delete pending.result; delete pending.receipt
    }
    this.pending.clear()
  }

  async prepare(exec: ToolDispatchExecution): Promise<void> {
    if (this.invalid) return
    try {
      assert(exec.agent !== undefined && exec.parent === undefined && exec.callId === exec.rootCallId
        && String(exec.callId).length > 0 && String(exec.callId).length <= 512)
      const call = exec.agent.session.events.findLast(event => event.type === 'tool/call' && String(event.data.callId) === String(exec.callId))
      const definition = this.ctx.tools.get(exec.name, exec.agent)
      assert(call?.type === 'tool/call' && definition !== undefined && !this.pending.has(String(exec.callId)))
      const argumentsDigest = sha256(exec.arguments)
      assert(call.data.name === exec.name && call.data.turn === this.task.source.turn && sha256(JSON.parse(call.data.arguments)) === argumentsDigest)
      const producer = isFileAncillaryTool(exec.name) ? registration(this.ctx, definition) : undefined
      assert(!isFileAncillaryTool(exec.name) || producer !== undefined)
      const pending: Pending = { execution: exec, call: structuredClone(call), definition, argumentsDigest,
        ...(producer === undefined ? {} : { producer }), settled: false }
      this.pending.set(String(exec.callId), pending)
      if (exec.name === 'skill') {
        const name = object(exec.arguments).name
        const reference = this.config.skillSources?.find(item => item.name === name)
        assert(reference !== undefined)
        admitted(reference, this.task, this.config)
        const registry = this.ctx.get('skills'); assert(registry !== undefined)
        const definition = parseConversationSkillDefinition(await registry.get(reference.name, { cwd: this.cwd, scope: exec.agent, signal: exec.signal }), reference)
        if (!this.invalid && this.pending.get(String(exec.callId)) === pending)
          pending.method = { tool: 'skill', reference: structuredClone(reference), definition }
      }
    } catch (error) { this.invalid = true; throw error }
  }
  async execute(exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    const pending = this.pending.get(String(exec.callId))
    try {
      if (this.invalid || pending === undefined) return await next()
      const service = exec.name === 'pwsh' ? this.ctx.get('tianwenNativeToolObservation') : undefined
      if (service === undefined) return await next()
      const captured = await service.capture({ taskId: this.task.source.taskId, sessionId: this.task.source.sessionId, callId: String(exec.callId) }, next)
      if (!this.invalid && this.pending.get(String(exec.callId)) === pending && captured.receipt !== undefined) pending.receipt = captured.receipt
      return captured.result
    } finally { if (pending !== undefined) pending.settled = true }
  }
  result(exec: Readonly<ToolExecution>, result: ToolExecutionResult): void {
    if (this.invalid) return
    const pending = this.pending.get(String(exec.callId))
    if (pending === undefined) { this.invalid = true; return }
    try {
      assert(exec.token === pending.execution.token && exec.agent?.session.id === pending.execution.agent?.session.id
        && exec.name === pending.call.data.name && sha256(exec.arguments) === pending.argumentsDigest
        && this.ctx.tools.get(exec.name, exec.agent) === pending.definition
        && (!isFileAncillaryTool(exec.name) || sha256(registration(this.ctx, pending.definition) ?? null) === sha256(pending.producer))
        && pending.result === undefined && Object.isFrozen(exec) && Object.isFrozen(result) && !result.isError)
      pending.result = structuredClone(result)
    } catch { this.invalid = true }
  }
  async freeze(task: ConversationTask, agent: Agent, boundary: number): Promise<readonly ConversationTaskFileAncillary[]> {
    assert(!this.invalid)
    const events = agent.session.events.filter(event => event.seq >= task.source.startSeq && event.seq <= boundary)
    const calls = events.filter((event): event is Call => event.type === 'tool/call')
    assert(calls.length === this.pending.size)
    const records: ConversationTaskFileAncillary[] = []
    for (const call of calls) {
      const pending = this.pending.get(String(call.data.callId))
      assert(pending !== undefined && pending.settled && pending.result !== undefined && sha256(call) === sha256(pending.call))
      const event = resultFor(events, call, boundary)
      assert(sha256(eventProjection(event)) === sha256(finalProjection(pending.result)))
      if (!isFileAncillaryTool(call.data.name)) continue
      const value = object(pending.result.value)
      let payload: ConversationAncillaryPayload
      if (call.data.name === 'glob') {
        exact(value, ['root', 'paths']); assert(typeof value.root === 'string' && Array.isArray(value.paths) && value.paths.length <= 256)
        const root = resolve(this.cwd, value.root)
        const child = relative(this.cwd, root)
        assert(child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child) && !((await lstat(root)).isSymbolicLink())
          && resolve(await realpath(root)) === root && value.root === nativeGlobRoot(this.cwd, object(JSON.parse(call.data.arguments))))
        const paths = normalizedNativePaths(this.cwd, value.paths)
        for (const path of paths) assert(await conversationFilePath(this.cwd, path) === path)
        payload = { tool: 'glob', root, paths, nativeValueJson: canonicalJson(value) }
      } else if (call.data.name === 'grep') {
        exact(value, ['matches']); assert(Array.isArray(value.matches))
        const matches = normalizedNativeMatches(this.cwd, value.matches)
        for (const path of new Set(matches.map(match => match.path))) assert(await conversationFilePath(this.cwd, path) === path)
        payload = { tool: 'grep', matches, nativeValueJson: canonicalJson(value) }
      } else if (call.data.name === 'skill') {
        assert(pending.method !== undefined && sha256(value) === sha256(skillValue(pending.method)))
        admitted(pending.method.reference, task, this.config); payload = pending.method
      } else {
        assert(pending.receipt !== undefined)
        payload = { tool: 'pwsh', nativeReceiptJson: canonicalJson(pending.receipt), nativeValueJson: canonicalJson(value) }
      }
      records.push(parseConversationTaskFileAncillary({ kind: 'task-file-ancillary-captured', taskId: task.source.taskId,
        callId: String(call.data.callId), callSeq: call.seq, resultSeq: event.seq, argumentsDigest: pending.argumentsDigest,
        resultDigest: sha256(event), valueDigest: sha256(value), producer: pending.producer, payload }))
    }
    verifyConversationFileAncillary({ ...task, fileAncillary: records }, this.cwd, events, boundary, this.config)
    return records
  }
}
