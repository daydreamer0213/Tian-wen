import { parseConversationExternalCheckOutcome, type ConversationExternalCheckOutcome } from '@tianwen/evolution/external-check'
import { sha256 } from '@tianwen/evolution/learning-intake'

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
      'contractDigest', 'inputsDigest', 'requiredCondition', ...(Object.hasOwn(b, 'learningConsentRevision') ? ['learningConsentRevision'] : [])])
      || (Object.hasOwn(b, 'learningConsentRevision') && (!seq(b.learningConsentRevision) || b.learningConsentRevision === 0))
      || !seq(b.epoch) || b.epoch === 0 || !seq(b.headerSeq) || !seq(b.preparedSeq) || b.preparedSeq < b.headerSeq
      || !['parentSessionId', 'childSessionId', 'nativeGoalId', 'checkerId', 'requiredCondition'].every(key => text(b[key]))
      || !['permissionFingerprint', 'goalDigest', 'taskDigest', 'prefixDigest', 'modelConfigDigest', 'checkerDigest',
        'contractDigest', 'inputsDigest'].every(key => digest(b[key]))) throw new TypeError('Goal Task acceptance binding is invalid')
    return structuredClone(value) as unknown as GoalTaskAcceptanceEvent
  }
  if (value.type === 'task-acceptance-finished' && keys(value, ['type', 'taskId', 'epoch', 'preparationDigest', 'endSeq', 'materialDigest', 'outcome'])
    && seq(value.epoch) && value.epoch > 0 && seq(value.endSeq) && digest(value.preparationDigest) && digest(value.materialDigest)) {
    return { ...structuredClone(value), outcome: parseConversationExternalCheckOutcome(value.outcome) } as unknown as GoalTaskAcceptanceEvent
  }
  throw new TypeError('Goal Task acceptance event is invalid')
}
