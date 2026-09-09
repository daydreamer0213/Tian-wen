import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { SessionId, isAppendSurfaceEvent, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { learningSessionLifecycleFingerprint, sha256, type ConversationFileMaterial, type ConversationFileEntry, type ConversationTask, type ConversationTaskSource, type ConversationQualityContract } from '@tianwen/evolution'
import type { ConversationFeedbackMaterial } from './conversation-feedback-assessment.js'
import { projectConversationFileAncillaryContext, type ConversationFileAncillaryContext } from '@tianwen/evolution'
import { isFileAncillaryTool, verifyConversationFileAncillary } from './conversation-file-ancillary.js'

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
  /** Present only on fresh study material, never on the original task review. */
  readonly feedbackStandard?: {
    readonly assessmentId: string
    readonly classification: string
    readonly criteria: readonly string[]
    /** Present only when current feedback-backed material has been recovered exactly. */
    readonly originalFeedback?: ConversationFeedbackMaterial['feedback']
  }
}

/** Quotable source text, excluding judgment-derived fields and native metadata. */
export function conversationEvidenceTexts(source: Pick<ConversationTaskMaterial, 'request' | 'context' | 'files'>, answers: readonly string[], toolEvents: readonly SessionEvent[] = [], finalEntries?: readonly ConversationFileEntry[]): string[] {
  return [
    ...[...source.request, ...source.context].flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
    ...answers,
    ...(source.files === undefined ? toolEvents.flatMap(event => event.type === 'tool/result' && isAppendSurfaceEvent(event)
      ? event.data.message.content[0].content.flatMap(block => block.type === 'text' ? [block.text] : []) : [])
      : [...source.files.entries.flatMap(entry => entry.content === null ? [] : [entry.content]),
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
  const context = conversationContext(saved.events, source.startSeq, source.materialProjection)
  if (sha256(context) !== source.contextDigest) throw new Error('natural task prior context drift')
  const files = recoverFiles(ctx, saved.meta.cwd, saved.events, task)
  const ancillaryContext = files === undefined ? undefined : projectConversationFileAncillaryContext(task.fileAncillary ?? [], files.entries)
  return { request: requests, context, objective: task.admission.decision.objective, criteria: task.admission.decision.criteria,
    ...(task.admission.qualityContract === undefined ? {} : { qualityContract: task.admission.qualityContract }),
    ...(files === undefined ? {} : { files }), ...(ancillaryContext === undefined ? {} : { ancillaryContext }) }
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
  const outputKind = task.admission?.decision?.fileOutputKind
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
    if (isFileAncillaryTool(event.data.name)) return []
    if (event.data.name !== 'read' && event.data.name !== 'write' && event.data.name !== 'edit') return [{ event, path: undefined }]
    let args: unknown
    try { args = JSON.parse(event.data.arguments) } catch { return [{ event, path: undefined }] }
    const path = recordedToolPath(cwd, args !== null && typeof args === 'object' ? (args as Record<string, unknown>).file_path : undefined)
    return [{ event, path }]
  })
  if (calls.length === 0 || calls.some(call => call.path === undefined)) return
  try {
    const observer = ctx.get('tianwenConversationFileObserver')
    if (observer === undefined) {
      if (task.fileAncillary?.some(record => record.payload.tool === 'skill')) return
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
  if (calls.some(call => !successful(call))) return
  const mutations = new Set(calls.filter(call => call.event.data.name === 'write' || call.event.data.name === 'edit').map(call => call.path!.toLowerCase()))
  if (outputKind === 'chat') {
    if (mutations.size !== 0 || !calls.some(call => call.event.data.name === 'read' && successful(call)) || result.outputPaths.length !== 0) return
  } else if (outputKind === 'files') {
    if (mutations.size === 0 || result.outputPaths.length !== mutations.size
      || result.outputPaths.some(path => !mutations.has(path.toLowerCase()))) return
  } else return
  const entries = inputs.map(({ path, content }) => ({ path, content }))
  if (result.inputsDigest !== sha256(entries) || sha256(result.entries.map(entry => entry.path)) !== sha256(entries.map(entry => entry.path))) return
  return { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind, cwd, entries, outputPaths: result.outputPaths }
}
