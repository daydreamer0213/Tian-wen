import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { SessionId, isAppendSurfaceEvent, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { CAPTURED_FILE_FACTS_TOOL, conversationFileCaptureOutputKind, learningSessionLifecycleFingerprint, parseConversationFileEntries, sha256, type ConversationFileMaterial, type ConversationFileEntry, type ConversationTask, type ConversationTaskSource, type ConversationQualityContract } from '@tianwen/evolution/content-review'
import type { ConversationFeedbackMaterial } from './conversation-feedback-assessment.js'
import { projectConversationFileAncillaryContext, type ConversationFileAncillaryContext } from '@tianwen/evolution/content-review'
import { isCreatedFileMissingRead, isFileAncillaryTool, verifyConversationFileAncillary } from './conversation-file-ancillary.js'
import { conversationRequestContentDigest } from '@tianwen/evolution/content-review'

export function conversationMessages(events: readonly SessionEvent[], projection?: ConversationTaskSource['materialProjection']) {
  return events.flatMap(event => {
    if (event.type === 'user/message' && isAppendSurfaceEvent(event) && event.data.source.kind === 'user') return [{ id: String(event.data.id), role: 'user', content: event.data.content }]
    if (event.type === 'assistant/message' && isAppendSurfaceEvent(event)) return [{ id: String(event.data.message.id), role: 'assistant',
      content: projection === 'surface-text.v1' ? event.data.message.content.filter(block => block.type === 'text') : event.data.message.content }]
    return []
  })
}

/** Current-task context is bounded native history, not a backfill of old task
 * reviews. It also covers a follow-up to a legacy or pre-consent conversation. */
export function conversationContext(events: readonly SessionEvent[], boundary: number, projection?: ConversationTaskSource['materialProjection']) {
  const starts: number[] = []
  let turnStart: number | undefined
  for (const event of events) {
    if (event.seq >= boundary) break
    if (event.type === 'turn/start') turnStart = event.seq
    if (turnStart !== undefined && event.type === 'user/message' && isAppendSurfaceEvent(event)
      && event.data.source.kind === 'user' && starts.at(-1) !== turnStart) starts.push(turnStart)
  }
  const first = starts.at(-8) ?? starts[0]
  return first === undefined ? [] : conversationMessages(events.filter(event => event.seq >= first && event.seq < boundary), projection)
}

export interface ConversationTaskMaterial {
  readonly request: readonly UserMessage[]
  readonly context: ReturnType<typeof conversationMessages>
  readonly objective: string
  readonly criteria: readonly string[]
  readonly qualityContract?: ConversationQualityContract
  readonly files?: ConversationFileMaterial
  readonly ancillaryContext?: ConversationFileAncillaryContext
  /** Host-verified original-task actions, never carried into a method trial. */
  readonly fileExecution?: ConversationFileExecutionEvidence
  /** Present only on fresh study material, never on the original task review. */
  readonly feedbackStandard?: {
    readonly assessmentId: string
    readonly classification: string
    readonly criteria: readonly string[]
    /** Present only when current feedback-backed material has been recovered exactly. */
    readonly originalFeedback?: ConversationFeedbackMaterial['feedback']
  }
}

interface ReadOnlyFileExecutionEvidence {
  readonly schemaVersion: 'tianwen.file-execution-evidence.v1'
  readonly capturedInputsUnchanged: true
  readonly toolCalls: readonly string[]
  readonly directoryObservations: readonly { readonly command: string; readonly stdout: string }[]
}

export interface FileActionExecutionEvidence {
  readonly schemaVersion: 'tianwen.file-execution-evidence.v2'
  readonly actions: readonly {
    readonly tool: string
    readonly path: string | null
    readonly callSeq: number
    readonly resultSeq: number
    readonly status: 'success' | 'error'
  }[]
  readonly directoryObservations: ReadOnlyFileExecutionEvidence['directoryObservations']
}
export interface FileDenialExecutionEvidence {
  readonly schemaVersion: 'tianwen.file-execution-evidence.v3'
  readonly actions: readonly (FileActionExecutionEvidence['actions'][number] | {
    readonly tool: 'read'; readonly path: null; readonly callSeq: number; readonly resultSeq: number
    readonly status: 'denied'; readonly reason: string
  })[]
  readonly directoryObservations: ReadOnlyFileExecutionEvidence['directoryObservations']
}

export interface FileMutationDenialExecutionEvidence {
  readonly schemaVersion: 'tianwen.file-execution-evidence.v4'
  readonly actions: readonly (FileActionExecutionEvidence['actions'][number] | {
    readonly tool: 'read' | 'write' | 'edit'; readonly path: null; readonly callSeq: number; readonly resultSeq: number
    readonly status: 'denied'; readonly reason: string
  })[]
  readonly directoryObservations: ReadOnlyFileExecutionEvidence['directoryObservations']
}

export type ConversationFileExecutionEvidence = ReadOnlyFileExecutionEvidence | FileActionExecutionEvidence | FileDenialExecutionEvidence | FileMutationDenialExecutionEvidence

export function parseFileExecutionEvidence(value: unknown): ConversationFileExecutionEvidence {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid file execution evidence')
  const row = value as Record<string, unknown>
  if (!Array.isArray(row.directoryObservations) || row.directoryObservations.length > 16
    || row.directoryObservations.some(item => item === null || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).sort().join(',') !== 'command,stdout' || typeof item.command !== 'string'
      || typeof item.stdout !== 'string' || Buffer.byteLength(item.command, 'utf8') > 8192
      || Buffer.byteLength(item.stdout, 'utf8') > 8192)) throw new Error('invalid file execution evidence')
  if (row.schemaVersion === 'tianwen.file-execution-evidence.v1') {
    if (Object.keys(row).sort().join(',') !== 'capturedInputsUnchanged,directoryObservations,schemaVersion,toolCalls'
      || row.capturedInputsUnchanged !== true || !Array.isArray(row.toolCalls)
      || row.toolCalls.some(item => typeof item !== 'string' || item.length === 0 || item.length > 80)) throw new Error('invalid file execution evidence')
  } else if (row.schemaVersion === 'tianwen.file-execution-evidence.v2' || row.schemaVersion === 'tianwen.file-execution-evidence.v3' || row.schemaVersion === 'tianwen.file-execution-evidence.v4') {
    if (Object.keys(row).sort().join(',') !== 'actions,directoryObservations,schemaVersion'
      || !Array.isArray(row.actions) || row.actions.length === 0) throw new Error('invalid file execution evidence')
    let previous = 0
    const results = new Set<number>()
    for (const item of row.actions) {
      const denied = (row.schemaVersion === 'tianwen.file-execution-evidence.v3' || row.schemaVersion === 'tianwen.file-execution-evidence.v4') && item?.status === 'denied'
      if (item === null || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).sort().join(',') !== (denied ? 'callSeq,path,reason,resultSeq,status,tool' : 'callSeq,path,resultSeq,status,tool')
        || typeof item.tool !== 'string' || item.tool.length === 0 || item.tool.length > 80
        || !Number.isSafeInteger(item.callSeq) || item.callSeq <= previous
        || !Number.isSafeInteger(item.resultSeq) || item.resultSeq <= item.callSeq || results.has(item.resultSeq)
        || (denied ? !(row.schemaVersion === 'tianwen.file-execution-evidence.v4' ? ['read', 'write', 'edit'].includes(item.tool) : item.tool === 'read') || item.path !== null || typeof item.reason !== 'string'
          || !item.reason.trim() || item.reason.includes('\0') || Buffer.byteLength(item.reason, 'utf8') > 4096
          || Buffer.from(item.reason, 'utf8').toString('utf8') !== item.reason
          : item.status !== 'success' && item.status !== 'error'
            || (['read', 'write', 'edit', CAPTURED_FILE_FACTS_TOOL].includes(item.tool) ? typeof item.path !== 'string' : item.path !== null))) throw new Error('invalid file execution evidence')
      if (item.path !== null) parseConversationFileEntries([{ path: item.path, content: null }])
      previous = item.callSeq; results.add(item.resultSeq)
    }
  } else throw new Error('invalid file execution evidence')
  return value as ConversationFileExecutionEvidence
}

export function fileExecutionTexts(value: ConversationFileExecutionEvidence): string[] {
  if (value.schemaVersion === 'tianwen.file-execution-evidence.v2' || value.schemaVersion === 'tianwen.file-execution-evidence.v3' || value.schemaVersion === 'tianwen.file-execution-evidence.v4') return [
    ...value.actions.map(action => action.status === 'denied'
      ? `Native ${action.tool}: call seq ${action.callSeq}; denied before ${value.schemaVersion === 'tianwen.file-execution-evidence.v4' ? 'original tool body dispatch' : 'dispatch'}, result seq ${action.resultSeq}. Original refusal: ${action.reason}`
      : `Native ${action.tool}${action.path === null ? '' : ` ${JSON.stringify(action.path)}`}: call seq ${action.callSeq}; ${action.status} result seq ${action.resultSeq}.`),
    'These are all native tool calls in this captured task, listed by call sequence. They establish actions and recorded results, not file content truth or effects outside this captured task.',
    ...value.directoryObservations.map(item => `Certified read-only directory command: ${item.command}\nDirectory stdout:\n${item.stdout}`),
  ]
  return [
    `Verified native task tool calls in order: ${value.toolCalls.join(', ')}.`,
    'No write or edit tool call occurred in this captured task. Captured input files matched initial bytes at the task capture boundary.',
    ...value.directoryObservations.map(item => `Certified read-only directory command: ${item.command}\nDirectory stdout:\n${item.stdout}`),
  ]
}

/** Quotable source text, excluding judgment-derived fields and native metadata. */
export function conversationEvidenceTexts(source: Pick<ConversationTaskMaterial, 'request' | 'context' | 'files' | 'ancillaryContext' | 'fileExecution'>, answers: readonly string[], toolEvents: readonly SessionEvent[] = [], finalEntries?: readonly ConversationFileEntry[]): string[] {
  return [
    ...[...source.request, ...source.context].flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
    ...answers,
    ...(source.files === undefined ? toolEvents.flatMap(event => event.type === 'tool/result' && isAppendSurfaceEvent(event)
      ? event.data.message.content[0].content.flatMap(block => block.type === 'text' ? [block.text] : []) : [])
      : [`Workspace root: ${source.files.cwd}`,
        ...source.files.entries.flatMap(entry => entry.content === null ? [] : [entry.content]),
        ...(source.ancillaryContext?.facts ?? []).map(fact => `Captured initial file ${fact.path}: bytes=${fact.bytes}; lines=${fact.lines}; sha256=${fact.sha256}`),
        ...(source.fileExecution === undefined ? [] : fileExecutionTexts(source.fileExecution)),
        ...(source.files.outputKind === 'files' ? (finalEntries ?? []).flatMap(entry => source.files!.outputPaths.includes(entry.path) && entry.content !== null ? [entry.content] : []) : [])]),
  ]
}

export function conversationTaskModelDigest(task: ConversationTask): ReturnType<typeof sha256> | undefined {
  const models = task.models ?? []
  return models.length > 0 && models.every(item => item.modelConfigDigest === models[0]!.modelConfigDigest) ? models[0]!.modelConfigDigest : undefined
}

/** Native header epochs are recorded before model output and may span Turns. */
export async function recoverConversationTaskModel(ctx: Context, task: ConversationTask): Promise<LlmCallConfig> {
  const digest = conversationTaskModelDigest(task)
  if (digest === undefined || task.completion === undefined) throw new Error('source model identity unavailable or mixed')
  const saved = await ctx.sessionPersistence.inspect(SessionId(task.source.sessionId))
  const span = saved.events.filter(event => event.seq >= task.source.startSeq && event.seq <= task.completion!.endSeq)
  if (sha256(span) !== task.completion.resultDigest) throw new Error('source native model evidence changed')
  const headers = task.models!.map(model => saved.events.find(event => event.seq === model.headerSeq))
  if (headers.some(event => event?.type !== 'request/header' || sha256(event.data.header.config) !== digest)
    || span.some(event => event.type === 'request/header' && sha256(event.data.header.config) !== digest)) throw new Error('source native model configuration drift')
  const header = headers[0]!
  if (header.type !== 'request/header') throw new Error('source model identity unavailable')
  return structuredClone(header.data.header.config)
}

/** Recover exact pre-answer material from native persistence, never from a
 * current transcript rendering that may contain later turns or user edits. */
export async function recoverConversationTaskMaterial(ctx: Context, task: ConversationTask): Promise<ConversationTaskMaterial> {
  const source = task.source
  const saved = await ctx.sessionPersistence.inspect(SessionId(source.sessionId))
  const lifecycle = learningSessionLifecycleFingerprint({ sessionId: String(saved.meta.id), createdAt: saved.meta.createdAt, ...(saved.meta.cwd === undefined ? {} : { cwd: saved.meta.cwd }) })
  if (lifecycle !== source.sessionLifecycleFingerprint || task.admission?.decision?.kind !== 'task' || task.completion === undefined) throw new Error('natural task identity, criteria or result boundary unavailable')
  const endSeq = task.completion.endSeq
  const requests = saved.events.flatMap(event => event.seq >= source.startSeq && event.seq <= endSeq && event.type === 'user/message'
    && isAppendSurfaceEvent(event) && event.data.source.kind === 'user' && source.userMessageIds.includes(String(event.data.id)) ? [event.data] : [])
  if (sha256(requests) !== source.requestDigest || requests.length !== source.userMessageIds.length) throw new Error('natural task original request drift')
  if (source.requestContentDigest !== undefined && conversationRequestContentDigest(requests) !== source.requestContentDigest) throw new Error('natural task original request content drift')
  const context = conversationContext(saved.events, source.startSeq, source.materialProjection)
  if (sha256(context) !== source.contextDigest) throw new Error('natural task prior context drift')
  const files = recoverFiles(ctx, saved.meta.cwd, saved.events, task)
  const ancillaryContext = files === undefined ? undefined : projectConversationFileAncillaryContext(task.fileAncillary ?? [], files.entries)
  const fileExecution = files?.outputKind === 'chat' ? task.fileAncillary?.some(record => record.payload.tool === 'read-denied' || record.payload.tool === 'file-mutation-denied')
    ? recoverFileActions(saved.events, task, files) : recoverFileExecution(saved.events, task)
    : files?.outputKind === 'files' && source.fileExecutionProjection === 'native-actions.v1' ? recoverFileActions(saved.events, task, files) : undefined
  return { request: requests, context, objective: task.admission.decision.objective, criteria: task.admission.decision.criteria,
    ...(task.admission.qualityContract === undefined ? {} : { qualityContract: task.admission.qualityContract }),
    ...(files === undefined ? {} : { files }), ...(ancillaryContext === undefined ? {} : { ancillaryContext }),
    ...(fileExecution === undefined ? {} : { fileExecution }) }
}

/** Recover the original completed answer, bound to the task's frozen native span. */
export async function recoverConversationTaskAnswer(ctx: Context, task: ConversationTask): Promise<ReturnType<typeof conversationMessages>> {
  await recoverConversationTaskMaterial(ctx, task)
  const completion = task.completion
  if (completion?.status !== 'completed') throw new Error('source-unavailable')
  const saved = await ctx.sessionPersistence.inspect(SessionId(task.source.sessionId))
  const span = saved.events.filter(event => event.seq >= task.source.startSeq && event.seq <= completion.endSeq)
  const terminal = span.at(-1)
  if (sha256(span) !== completion.resultDigest || terminal?.type !== 'turn/end' || terminal.seq !== completion.endSeq
    || terminal.data.reason.kind !== 'completed') throw new Error('source-unavailable')
  const answer = conversationMessages(span, task.source.materialProjection).filter(message => message.role === 'assistant')
  if (sha256(answer.map(message => message.id)) !== sha256(completion.assistantMessageIds) || answer.length === 0) throw new Error('source-unavailable')
  return answer
}

function recoverFileActions(events: readonly SessionEvent[], task: ConversationTask, files: ConversationFileMaterial): FileActionExecutionEvidence | FileDenialExecutionEvidence | FileMutationDenialExecutionEvidence {
  const span = events.filter(event => event.seq >= task.source.startSeq && event.seq <= task.completion!.endSeq)
  return projectNativeFileActions(span, task.completion!.files!.captureSeq, files, task.fileAncillary,
    recoverFileExecution(events, task).directoryObservations)
}

/** Reuse only with a host-verified original SDK span and capture boundary. No Task identity is invented. */
export function projectNativeFileActions(span: readonly SessionEvent[], boundary: number, files: ConversationFileMaterial,
  ancillary: ConversationTask['fileAncillary'] = [], directoryObservations: ReadOnlyFileExecutionEvidence['directoryObservations'] = []): FileActionExecutionEvidence | FileDenialExecutionEvidence | FileMutationDenialExecutionEvidence {
  const actions: FileMutationDenialExecutionEvidence['actions'][number][] = []
  for (const call of span) {
    if (call.type !== 'tool/call') continue
    const results = span.filter((event): event is Extract<SessionEvent, { type: 'tool/result' }> => event.type === 'tool/result'
      && String(event.data.message.source.callId) === String(call.data.callId))
    const result = results[0]
    if (results.length !== 1 || result === undefined || !isAppendSurfaceEvent(result)
      || call.seq > boundary || result.seq <= call.seq || result.seq > boundary
      || result.sourceEventSeqs?.length !== 1 || result.sourceEventSeqs[0] !== call.seq
      || result.data.turn !== call.data.turn || result.data.step !== call.data.step) throw new Error('native file action evidence unavailable')
    const denial = ancillary?.find(record => record.callSeq === call.seq && (record.payload.tool === 'read-denied' || record.payload.tool === 'file-mutation-denied'))
    if (denial?.payload.tool === 'read-denied' || denial?.payload.tool === 'file-mutation-denied') {
      const receipt = JSON.parse(denial.payload.nativeDenialJson) as { reason: string }
      actions.push({ tool: call.data.name as 'read' | 'write' | 'edit', path: null, callSeq: call.seq, resultSeq: result.seq, status: 'denied', reason: receipt.reason })
      continue
    }
    const fileTool = ['read', 'write', 'edit', CAPTURED_FILE_FACTS_TOOL].includes(call.data.name)
    let path: string | null = null
    if (fileTool) {
      const args = JSON.parse(call.data.arguments) as Record<string, unknown>
      const nativePath = recordedToolPath(files.cwd, args.file_path)
      path = files.entries.find(entry => entry.path.toLowerCase() === nativePath?.toLowerCase())?.path ?? null
      if (path === null) throw new Error('native file action path unavailable')
    }
    actions.push({ tool: call.data.name, path, callSeq: call.seq, resultSeq: result.seq,
      status: result.data.error === undefined && result.data.message.content[0].isError !== true ? 'success' : 'error' })
  }
  return parseFileExecutionEvidence({ schemaVersion: actions.some(action => action.status === 'denied' && action.tool !== 'read') ? 'tianwen.file-execution-evidence.v4' : actions.some(action => action.status === 'denied')
    ? 'tianwen.file-execution-evidence.v3' : 'tianwen.file-execution-evidence.v2', actions,
    directoryObservations }) as FileActionExecutionEvidence | FileDenialExecutionEvidence | FileMutationDenialExecutionEvidence
}

function recoverFileExecution(events: readonly SessionEvent[], task: ConversationTask): ReadOnlyFileExecutionEvidence {
  const calls = events.filter((event): event is Extract<SessionEvent, { type: 'tool/call' }> =>
    event.seq >= task.source.startSeq && event.seq <= task.completion!.files!.captureSeq && event.type === 'tool/call')
  const ancillary = new Map((task.fileAncillary ?? []).map(item => [item.callSeq, item.payload]))
  const toolCalls = calls.map(call => {
    const payload = ancillary.get(call.seq)
    return payload?.tool === 'pwsh' ? 'pwsh (certified read-only directory)' : payload?.tool === 'pwsh-denied'
      ? 'pwsh (denied before execution)' : call.data.name
  })
  const directoryObservations = (task.fileAncillary ?? []).flatMap(item => {
    if (item.payload.tool !== 'pwsh') return []
    const value = JSON.parse(item.payload.nativeValueJson) as { stdout?: { text?: unknown; truncated?: unknown } }
    const receipt = JSON.parse(item.payload.nativeReceiptJson) as { command: string }
    const stdout = value.stdout
    return stdout?.truncated === false && typeof stdout.text === 'string' && Buffer.byteLength(stdout.text, 'utf8') <= 8192
      ? [{ command: receipt.command, stdout: stdout.text }] : [{ command: receipt.command, stdout: '[output unavailable for review]' }]
  })
  return { schemaVersion: 'tianwen.file-execution-evidence.v1', capturedInputsUnchanged: true, toolCalls, directoryObservations }
}

function recordedToolPath(cwd: string, candidate: unknown): string | undefined {
  if (typeof candidate !== 'string' || candidate.length === 0) return
  const target = resolve(isAbsolute(candidate) ? candidate : resolve(cwd, candidate))
  const child = relative(cwd, target)
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) return
  return child.split(sep).join('/')
}

function recoverFiles(ctx: Context, cwd: string | undefined, events: readonly SessionEvent[], task: ConversationTask): ConversationFileMaterial | undefined {
  const completion = task.completion
  const result = completion?.files
  const outputKind = conversationFileCaptureOutputKind(task.admission?.decision)
  const inputs = task.fileInputs ?? []
  if (cwd === undefined || !isAbsolute(cwd) || completion === undefined || result === undefined
    || task.fileUnavailable !== undefined || outputKind !== result.outputKind || inputs.length === 0) return
  if ((task.fileAncillary?.length ?? 0) > 0) {
    const consent = ctx.get('tianwenEvolution')?.getLearningAnalysisConsent()
    if (consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3' || consent.revision !== task.source.consentRevision) return
  }
  const span = events.filter(event => event.seq >= task.source.startSeq && event.seq <= completion.endSeq)
  const terminal = span.at(-1)
  const status = terminal?.type === 'turn/end'
    ? terminal.data.reason.kind === 'completed' ? 'completed' : terminal.data.reason.kind === 'aborted' ? 'interrupted' : 'failed'
    : undefined
  const assistantMessageIds = conversationMessages(span, task.source.materialProjection).filter(message => message.role === 'assistant').map(message => message.id)
  const evidenceIds = span.filter(event => event.type === 'tool/result').map(event => sha256(event))
  if (sha256(span) !== completion.resultDigest || terminal?.type !== 'turn/end' || terminal.seq !== completion.endSeq
    || terminal.data.turn !== task.source.turn || status !== completion.status
    || sha256(assistantMessageIds) !== sha256(completion.assistantMessageIds)
    || sha256(evidenceIds) !== sha256(completion.evidenceIds)) return
  const calls = span.flatMap(event => {
    if (event.type !== 'tool/call') return []
    // This exclusion is usable only after the entire ancillary set is rebound below.
    if (task.fileAncillary?.some(record => (record.payload.tool === 'read-denied' || record.payload.tool === 'file-mutation-denied') && record.callSeq === event.seq
      && record.callId === String(event.data.callId))) return []
    if (isFileAncillaryTool(event.data.name) && event.data.name !== CAPTURED_FILE_FACTS_TOOL) return []
    if (event.data.name !== 'read' && event.data.name !== 'write' && event.data.name !== 'edit'
      && event.data.name !== CAPTURED_FILE_FACTS_TOOL) return [{ event, path: undefined }]
    let args: unknown
    try { args = JSON.parse(event.data.arguments) } catch { return [{ event, path: undefined }] }
    const path = recordedToolPath(cwd, args !== null && typeof args === 'object' ? (args as Record<string, unknown>).file_path : undefined)
    return [{ event, path }]
  })
  if (calls.length === 0 || calls.some(call => call.path === undefined)) return
  try {
    const observer = ctx.get('tianwenConversationFileObserver')
    if (observer === undefined) {
      if (task.fileAncillary?.some(record => record.payload.tool === 'skill' || record.payload.tool === 'read-denied' || record.payload.tool === 'file-mutation-denied')) return
      verifyConversationFileAncillary(task, cwd, span, result.captureSeq)
    } else observer.verifyAncillary(task, cwd, span, result.captureSeq)
  } catch { return }
  if (!span.some(event => event.seq === result.captureSeq) || calls.some(call => call.event.seq > result.captureSeq)) return
  const inputByPath = new Map(inputs.map(input => [input.path.toLowerCase(), input]))
  if (inputByPath.size !== inputs.length || calls.some(call => !inputByPath.has(call.path!.toLowerCase()))) return
  for (const input of inputs) {
    const first = calls.find(call => call.path!.toLowerCase() === input.path.toLowerCase())
    if (first === undefined || first.path !== input.path || first.event.seq !== input.callSeq || String(first.event.data.callId) !== input.callId) return
  }
  const successful = (call: typeof calls[number]) => span.some(event => event.type === 'tool/result' && isAppendSurfaceEvent(event)
    && event.seq > call.event.seq && event.seq <= result.captureSeq
    && event.sourceEventSeqs?.[0] === call.event.seq && event.data.turn === call.event.data.turn && event.data.step === call.event.data.step
    && String(event.data.message.source.callId) === String(call.event.data.callId)
    && event.data.error === undefined && event.data.message.content[0].isError !== true)
  if (calls.some(call => !successful(call) && !(outputKind === 'files'
    && result.outputPaths.some(path => path.toLowerCase() === call.path!.toLowerCase())
    && result.entries.some(entry => entry.path.toLowerCase() === call.path!.toLowerCase() && entry.content !== null)
    && isCreatedFileMissingRead(task, cwd, call.event, span, result.captureSeq)))) return
  const mutations = new Set(calls.filter(call => call.event.data.name === 'write' || call.event.data.name === 'edit').map(call => call.path!.toLowerCase()))
  if (outputKind === 'chat') {
    if (mutations.size !== 0 || !calls.some(call => call.event.data.name === 'read' && successful(call)) || result.outputPaths.length !== 0) return
  } else if (outputKind === 'files') {
    if (mutations.size === 0 || result.outputPaths.length !== mutations.size
      || result.outputPaths.some(path => !mutations.has(path.toLowerCase()))) return
  } else return
  const entries = inputs.map(({ path, content }) => ({ path, content }))
  if (result.inputsDigest !== sha256(entries) || sha256(result.entries.map(entry => entry.path)) !== sha256(entries.map(entry => entry.path))) return
  if (outputKind === 'chat' && sha256(result.entries) !== sha256(entries)) return
  return { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind, cwd, entries, outputPaths: result.outputPaths }
}
