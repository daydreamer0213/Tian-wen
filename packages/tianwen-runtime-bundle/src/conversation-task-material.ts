import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { SessionId, isAppendSurfaceEvent, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import { learningSessionLifecycleFingerprint, sha256, type ConversationTask, type ConversationQualityContract } from '@tianwen/evolution'
import type { ConversationFeedbackMaterial } from './conversation-feedback-assessment.js'

export function conversationMessages(events: readonly SessionEvent[]) {
  return events.flatMap(event => {
    if (event.type === 'user/message' && isAppendSurfaceEvent(event) && event.data.source.kind === 'user') return [{ id: String(event.data.id), role: 'user', content: event.data.content }]
    if (event.type === 'assistant/message' && isAppendSurfaceEvent(event)) return [{ id: String(event.data.message.id), role: 'assistant', content: event.data.message.content }]
    return []
  })
}

/** Current-task context is bounded native history, not a backfill of old task
 * reviews. It also covers a follow-up to a legacy or pre-consent conversation. */
export function conversationContext(events: readonly SessionEvent[], boundary: number) {
  const starts: number[] = []
  let turnStart: number | undefined
  for (const event of events) {
    if (event.seq >= boundary) break
    if (event.type === 'turn/start') turnStart = event.seq
    if (turnStart !== undefined && event.type === 'user/message' && isAppendSurfaceEvent(event)
      && event.data.source.kind === 'user' && starts.at(-1) !== turnStart) starts.push(turnStart)
  }
  const first = starts.at(-8) ?? starts[0]
  return first === undefined ? [] : conversationMessages(events.filter(event => event.seq >= first && event.seq < boundary))
}

export interface ConversationTaskMaterial {
  readonly request: readonly UserMessage[]
  readonly context: ReturnType<typeof conversationMessages>
  readonly objective: string
  readonly criteria: readonly string[]
  readonly qualityContract?: ConversationQualityContract
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
export function conversationEvidenceTexts(source: Pick<ConversationTaskMaterial, 'request' | 'context'>, answers: readonly string[], toolEvents: readonly SessionEvent[] = []): string[] {
  return [
    ...[...source.request, ...source.context].flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
    ...answers,
    ...toolEvents.flatMap(event => event.type === 'tool/result' && isAppendSurfaceEvent(event)
      ? event.data.message.content[0].content.flatMap(block => block.type === 'text' ? [block.text] : []) : []),
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
  const context = conversationContext(saved.events, source.startSeq)
  if (sha256(context) !== source.contextDigest) throw new Error('natural task prior context drift')
  return { request: requests, context, objective: task.admission.decision.objective, criteria: task.admission.decision.criteria,
    ...(task.admission.qualityContract === undefined ? {} : { qualityContract: task.admission.qualityContract }) }
}
