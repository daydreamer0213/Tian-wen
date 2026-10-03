import { parseConversationExternalCheckOutcome, type ConversationExternalCheckOutcome } from '@tianwen/evolution/external-check'
import { sha256 } from '@tianwen/evolution/learning-intake'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { LongGoalTaskRecordV2 } from './long-goal-contract.js'
import { parseGoalTaskMethodBinding, type GoalTaskMethodBinding } from './goal-task-method.js'
import { parseConversationFileMaterial, parseConversationFileEntries, parseConversationAuditedReviewChecks,
  type ConversationFileMaterial, type ConversationFileTrialOutput, type ConversationAuditedReviewChecks } from '@tianwen/evolution/content-review'

export interface GoalTaskContentReviewPlan {
  readonly protocol: 'tianwen.goal-task-content-review.v1'
  readonly files?: ConversationFileMaterial
}
export type GoalTaskContentReviewEvent = {
  readonly type: 'task-content-review-started'
  readonly taskId: string
  readonly epoch: number
  readonly preparationDigest: ReturnType<typeof sha256>
  readonly materialDigest: ReturnType<typeof sha256>
  readonly reviewMaterialDigest: ReturnType<typeof sha256> | null
  readonly fileResult?: ConversationFileTrialOutput
} | {
  readonly type: 'task-content-review-finished'
  readonly taskId: string
  readonly epoch: number
  readonly startDigest: ReturnType<typeof sha256>
  readonly result: { readonly status: 'reviewed'; readonly checks: ConversationAuditedReviewChecks }
    | { readonly status: 'unverifiable'; readonly detail: string }
}

/** Small original requirements only. Native requests/results remain in the SDK log. */
export interface GoalTaskRequirementsSnapshot {
  readonly goal: {
    readonly id: string
    readonly objective: string
    readonly context: string | null
    readonly successCriteria: string | null
    readonly workspaceRoot: string
    readonly origin: GoalCommandOrigin
  }
  readonly task: LongGoalTaskRecordV2
  readonly permissionMode?: SandboxMode
}

export interface GoalCommandOrigin {
  readonly sessionId: string
  readonly commandId: string
  readonly commandSeq: number
  readonly commandDigest: ReturnType<typeof sha256>
}

export interface GoalTaskAcceptanceBinding {
  readonly epoch: number
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly nativeGoalId: string
  readonly permissionFingerprint: ReturnType<typeof sha256>
  readonly goalDigest: ReturnType<typeof sha256>
  readonly taskDigest: ReturnType<typeof sha256>
  readonly headerSeq: number
  readonly preparedSeq: number
  readonly prefixDigest: ReturnType<typeof sha256>
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly inputsDigest: ReturnType<typeof sha256>
  readonly requiredCondition: string
  /** Only enabled v3 consent observed before the original first Task request. */
  readonly learningConsentRevision?: number
  /** Absent on legacy preparations; never reconstruct it from later requirements. */
  readonly requirementsSnapshot?: GoalTaskRequirementsSnapshot
  readonly contentReview?: GoalTaskContentReviewPlan
  readonly method?: GoalTaskMethodBinding
}

export type GoalTaskAcceptanceEvent = {
  readonly type: 'task-acceptance-prepared'
  readonly taskId: string
  readonly binding: GoalTaskAcceptanceBinding
} | {
  readonly type: 'task-acceptance-finished'
  readonly taskId: string
  readonly epoch: number
  readonly preparationDigest: ReturnType<typeof sha256>
  readonly endSeq: number
  readonly materialDigest: ReturnType<typeof sha256>
  readonly outcome: ConversationExternalCheckOutcome
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function seq(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }
function digest(value: unknown): boolean { return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value) }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

function validSnapshot(value: unknown, b: Record<string, unknown>, taskId: string): boolean {
  if (!record(value)) return false
  const goal = value.goal, task = value.task
  if (!keys(value, ['goal', 'task', ...(Object.hasOwn(value, 'permissionMode') ? ['permissionMode'] : [])])
    || (Object.hasOwn(value, 'permissionMode') && !['read-only', 'workspace-write', 'danger-full-access'].includes(String(value.permissionMode)))
    || !record(goal) || !keys(goal, ['id', 'objective', 'context', 'successCriteria', 'workspaceRoot', 'origin'])
    || !['id', 'objective', 'workspaceRoot'].every(key => text(goal[key]))
    || !['context', 'successCriteria'].every(key => goal[key] === null || typeof goal[key] === 'string')
    || !record(goal.origin) || !text(goal.origin.sessionId)
    || !record(task) || !keys(task, ['id', 'objective', 'execution', 'resolution'])
    || task.id !== taskId || !text(task.objective) || ![null, 'abandoned'].includes(task.resolution as null | 'abandoned')
    || !record(task.execution) || !keys(task.execution, ['sessionId', 'goalId'])
    || task.execution.sessionId !== b.childSessionId || task.execution.goalId !== b.nativeGoalId) return false
  try { parseGoalCommandOrigin(goal.origin, goal.origin.sessionId) } catch { return false }
  const { workspaceRoot: _, ...boundGoal } = goal
  return sha256(boundGoal) === b.goalDigest && sha256(task) === b.taskDigest
}

export function parseGoalTaskContentReviewPlan(value: unknown): GoalTaskContentReviewPlan {
  if (!record(value) || !keys(value, ['protocol', ...(Object.hasOwn(value, 'files') ? ['files'] : [])])
    || value.protocol !== 'tianwen.goal-task-content-review.v1') throw new TypeError('Goal Task content review plan is invalid')
  return { protocol: value.protocol, ...(Object.hasOwn(value, 'files') ? { files: parseConversationFileMaterial(value.files) } : {}) }
}

export function parseGoalTaskContentReviewEvent(value: unknown): GoalTaskContentReviewEvent {
  if (!record(value) || !text(value.taskId) || !seq(value.epoch) || value.epoch === 0) throw new TypeError('Goal Task content review event is invalid')
  if (value.type === 'task-content-review-started'
    && keys(value, ['type', 'taskId', 'epoch', 'preparationDigest', 'materialDigest', 'reviewMaterialDigest', ...(Object.hasOwn(value, 'fileResult') ? ['fileResult'] : [])])
    && digest(value.preparationDigest) && digest(value.materialDigest) && (value.reviewMaterialDigest === null || digest(value.reviewMaterialDigest))) {
    if (value.fileResult !== undefined) {
      if (!record(value.fileResult) || !keys(value.fileResult, ['answer', 'files', 'outputDigest']) || typeof value.fileResult.answer !== 'string'
        || !digest(value.fileResult.outputDigest) || sha256({ answer: value.fileResult.answer, files: parseConversationFileEntries(value.fileResult.files) }) !== value.fileResult.outputDigest) throw new TypeError('Goal Task content file output is invalid')
    }
    return structuredClone(value) as unknown as GoalTaskContentReviewEvent
  }
  if (value.type === 'task-content-review-finished' && keys(value, ['type', 'taskId', 'epoch', 'startDigest', 'result'])
    && digest(value.startDigest) && record(value.result)) {
    if (value.result.status === 'unverifiable' && keys(value.result, ['status', 'detail']) && text(value.result.detail)) return structuredClone(value) as unknown as GoalTaskContentReviewEvent
    if (value.result.status === 'reviewed' && keys(value.result, ['status', 'checks'])) return { ...structuredClone(value), result: {
      status: 'reviewed', checks: parseConversationAuditedReviewChecks(value.result.checks) } } as unknown as GoalTaskContentReviewEvent
  }
  throw new TypeError('Goal Task content review event is invalid')
}

export function parseGoalCommandOrigin(value: unknown, sessionId: string): GoalCommandOrigin {
  if (!record(value) || !keys(value, ['sessionId', 'commandId', 'commandSeq', 'commandDigest'])
    || value.sessionId !== sessionId || !text(value.commandId) || !seq(value.commandSeq) || !digest(value.commandDigest)) {
    throw new TypeError('Goal command origin is invalid')
  }
  return structuredClone(value) as unknown as GoalCommandOrigin
}

export function parseGoalTaskAcceptanceEvent(value: unknown): GoalTaskAcceptanceEvent {
  if (!record(value) || !text(value.taskId)) throw new TypeError('Goal Task acceptance event is invalid')
  if (value.type === 'task-acceptance-prepared' && keys(value, ['type', 'taskId', 'binding'])) {
    const b = value.binding
    if (!record(b) || !keys(b, ['epoch', 'parentSessionId', 'childSessionId', 'nativeGoalId', 'permissionFingerprint',
      'goalDigest', 'taskDigest', 'headerSeq', 'preparedSeq', 'prefixDigest', 'modelConfigDigest', 'checkerId', 'checkerDigest',
      'contractDigest', 'inputsDigest', 'requiredCondition', ...(Object.hasOwn(b, 'learningConsentRevision') ? ['learningConsentRevision'] : []),
      ...(Object.hasOwn(b, 'requirementsSnapshot') ? ['requirementsSnapshot'] : []), ...(Object.hasOwn(b, 'contentReview') ? ['contentReview'] : []),
      ...(Object.hasOwn(b, 'method') ? ['method'] : [])])
      || (Object.hasOwn(b, 'requirementsSnapshot') && !validSnapshot(b.requirementsSnapshot, b, value.taskId))
      || (Object.hasOwn(b, 'learningConsentRevision') && (!seq(b.learningConsentRevision) || b.learningConsentRevision === 0))
      || !seq(b.epoch) || b.epoch === 0 || !seq(b.headerSeq) || !seq(b.preparedSeq) || b.preparedSeq < b.headerSeq
      || !['parentSessionId', 'childSessionId', 'nativeGoalId', 'checkerId', 'requiredCondition'].every(key => text(b[key]))
      || !['permissionFingerprint', 'goalDigest', 'taskDigest', 'prefixDigest', 'modelConfigDigest', 'checkerDigest',
        'contractDigest', 'inputsDigest'].every(key => digest(b[key]))) throw new TypeError('Goal Task acceptance binding is invalid')
    if (Object.hasOwn(b, 'contentReview')) {
      const plan = parseGoalTaskContentReviewPlan(b.contentReview)
      if (!record(b.requirementsSnapshot) || !record(b.requirementsSnapshot.goal)
        || plan.files !== undefined && plan.files.cwd !== b.requirementsSnapshot.goal.workspaceRoot) throw new TypeError('Goal content review requires original requirements and workspace')
    }
    if (Object.hasOwn(b, 'method')) {
      const method = parseGoalTaskMethodBinding(b.method)
      if (!record(b.requirementsSnapshot) || !record(b.requirementsSnapshot.goal)
        || method.snapshot.scopeKey !== `conversation:${sha256({ cwd: b.requirementsSnapshot.goal.workspaceRoot })}`
        || method.messageSeq >= Number(b.headerSeq)) throw new TypeError('Goal Task method requires original workspace and prospective message')
    }
    return structuredClone(value) as unknown as GoalTaskAcceptanceEvent
  }
  if (value.type === 'task-acceptance-finished' && keys(value, ['type', 'taskId', 'epoch', 'preparationDigest', 'endSeq', 'materialDigest', 'outcome'])
    && seq(value.epoch) && value.epoch > 0 && seq(value.endSeq) && digest(value.preparationDigest) && digest(value.materialDigest)) {
    return { ...structuredClone(value), outcome: parseConversationExternalCheckOutcome(value.outcome) } as unknown as GoalTaskAcceptanceEvent
  }
  throw new TypeError('Goal Task acceptance event is invalid')
}
