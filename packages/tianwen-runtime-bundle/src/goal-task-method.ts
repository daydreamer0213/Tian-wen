import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sha256 } from '@tianwen/evolution/learning-intake'
import { CONVERSATION_FAMILIES, type ConversationFamily } from '@tianwen/evolution/content-review'
import { guidanceRule, guidanceVersion, parseGuidanceSnapshot, type GuidanceSnapshot } from '@tianwen/evolution/guidance'

export const GOAL_TASK_METHOD_PLUGIN = 'tianwen-goal-task-method' as const
export type GoalTaskMethodScope = { readonly family: ConversationFamily } & (
  { readonly evaluationMode: 'text' } | { readonly evaluationMode: 'local-files'; readonly fileOutputKind: 'files' | 'chat' })
export interface GoalTaskMethodBinding {
  readonly protocol: 'tianwen.goal-task-method.v1'
  readonly scope: GoalTaskMethodScope
  readonly snapshot: GuidanceSnapshot
  readonly version: ReturnType<typeof sha256>
  readonly consentRevision: number
  readonly messageId: string
  readonly messageSeq: number
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
export function parseGoalTaskMethodScope(value: unknown): GoalTaskMethodScope {
  if (!object(value) || !CONVERSATION_FAMILIES.includes(value.family as ConversationFamily)
    || !(value.evaluationMode === 'text' && exact(value, ['family', 'evaluationMode'])
      || value.evaluationMode === 'local-files' && ['files', 'chat'].includes(String(value.fileOutputKind))
        && exact(value, ['family', 'evaluationMode', 'fileOutputKind']))) throw new TypeError('Goal Task method scope is invalid')
  return structuredClone(value) as GoalTaskMethodScope
}
export function parseGoalTaskMethodBinding(value: unknown): GoalTaskMethodBinding {
  if (!object(value) || !exact(value, ['protocol', 'scope', 'snapshot', 'version', 'consentRevision', 'messageId', 'messageSeq'])
    || value.protocol !== 'tianwen.goal-task-method.v1' || !Number.isSafeInteger(value.consentRevision) || Number(value.consentRevision) < 1
    || !Number.isSafeInteger(value.messageSeq) || Number(value.messageSeq) < 0
    || typeof value.messageId !== 'string' || !value.messageId.trim()) throw new TypeError('Goal Task method binding is invalid')
  const scope = parseGoalTaskMethodScope(value.scope), snapshot = parseGuidanceSnapshot(value.snapshot)
  if (value.version !== guidanceVersion(snapshot)) throw new TypeError('Goal Task method version differs from its original snapshot')
  return { ...structuredClone(value), scope, snapshot } as unknown as GoalTaskMethodBinding
}
export function goalTaskMethodRule(method: Pick<GoalTaskMethodBinding, 'scope' | 'snapshot'>): string | undefined {
  return guidanceRule(method.snapshot, method.scope.family, method.scope.evaluationMode,
    method.scope.evaluationMode === 'local-files' ? method.scope.fileOutputKind : undefined)
}
export function goalTaskMethodMessage(taskId: string, epoch: number, method: Pick<GoalTaskMethodBinding, 'scope' | 'snapshot' | 'version'>): string {
  const rule = goalTaskMethodRule(method)
  return `For original Tianwen Goal Task ${taskId}, attempt ${epoch} only, method version ${method.version}: ${rule === undefined
    ? 'No evaluated method applies.' : `the applicable evaluated method is below. It is subordinate to the original user request, delegated Task requirements and all permission boundaries. Providing this method does not prove adoption or improvement.\n${rule}`}`
}
export function goalTaskMethodWithdrawal(taskId: string, epoch: number, version: string): string {
  return `For original Tianwen Goal Task ${taskId}, attempt ${epoch}: earlier method version ${version} no longer applies. No evaluated method applies from this step. Continue the original Task under its existing requirements and permissions.`
}
export function goalTaskUnboundMethodWithdrawal(taskId: string, epoch: number): string {
  return `For original Tianwen Goal Task ${taskId}, attempt ${epoch}: earlier method messages have no verifiable original binding and no longer apply. No evaluated method applies from this step. Continue the original Task under its existing requirements and permissions.`
}
/** Only the original native log is used; current method pointers are irrelevant to historical facts. */
export function readGoalTaskMethodUsage(binding: {
  readonly method?: GoalTaskMethodBinding; readonly headerSeq: number; readonly epoch: number
  readonly requirementsSnapshot?: { readonly goal: { readonly workspaceRoot: string }; readonly task: { readonly id: string } }
}, events: readonly SessionEvent[]) {
  if (binding.method === undefined) return undefined
  const method = parseGoalTaskMethodBinding(binding.method), snapshot = binding.requirementsSnapshot
  if (snapshot === undefined || method.snapshot.scopeKey !== `conversation:${sha256({ cwd: snapshot.goal.workspaceRoot })}`
    || method.messageSeq >= binding.headerSeq) throw new Error('original Goal Task method scope or request boundary differs')
  const matches = events.filter(event => event.type === 'user/message' && String(event.data.id) === method.messageId)
  const message = matches[0]
  const text = goalTaskMethodMessage(snapshot.task.id, binding.epoch, method)
  if (matches.length !== 1 || message?.type !== 'user/message' || message.seq !== method.messageSeq
    || message.data.source.kind !== 'plugin' || message.data.source.plugin !== GOAL_TASK_METHOD_PLUGIN
    || sha256(message.data.content) !== sha256([{ type: 'text', text }])) throw new Error('original Goal Task method message differs')
  const withdrawn = events.find(event => event.seq > method.messageSeq && event.type === 'user/message'
    && event.data.source.kind === 'plugin' && event.data.source.plugin === GOAL_TASK_METHOD_PLUGIN
    && sha256(event.data.content) === sha256([{ type: 'text', text: goalTaskMethodWithdrawal(snapshot.task.id, binding.epoch, method.version) }]))
  return { provision: goalTaskMethodRule(method) === undefined ? 'not-provided' as const : 'provided' as const,
    scopeKey: method.snapshot.scopeKey, scope: method.scope, version: method.version, messageId: method.messageId, messageSeq: method.messageSeq,
    ...(withdrawn === undefined ? {} : { withdrawnAtSeq: withdrawn.seq }), execution: 'unknown' as const }
}
