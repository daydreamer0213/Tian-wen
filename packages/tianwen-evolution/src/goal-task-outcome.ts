import { parseConversationExternalCheckOutcome, type ConversationExternalCheckOutcome } from './conversation-external-check.js'
import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'

/** Actual LongGoal-owned result observation, not user feedback or a ConversationTask. */
export interface GoalTaskOutcomeInput {
  readonly source: 'native-goal-task'
  readonly goalId: string
  readonly taskId: string
  readonly epoch: number
  readonly origin: { readonly sessionId: string; readonly commandId: string; readonly commandSeq: number; readonly commandDigest: Sha256Digest }
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly nativeGoalId: string
  readonly preparedSeq: number
  readonly endSeq: number
  readonly preparationDigest: Sha256Digest
  readonly materialDigest: Sha256Digest
  readonly consentRevision: number
  readonly modelConfigDigest: Sha256Digest
  readonly checkerId: string
  readonly checkerDigest: Sha256Digest
  readonly contractDigest: Sha256Digest
  readonly inputsDigest: Sha256Digest
  readonly requiredConditionDigest: Sha256Digest
  readonly outcome: ConversationExternalCheckOutcome
}
export type GoalTaskOutcomeClassification = 'checked-success' | 'checked-failure' | 'unqualified-rejection' | 'unverifiable'
export interface GoalTaskOutcomeRecordedEvent {
  readonly type: 'goal-task-outcome-recorded'
  readonly schemaVersion: 'tianwen.goal-task-outcome.v1'
  readonly at: string
  readonly sourceId: string
  readonly inputDigest: Sha256Digest
  readonly input: GoalTaskOutcomeInput
}
export interface GoalTaskOutcomeObservation extends GoalTaskOutcomeRecordedEvent { readonly classification: GoalTaskOutcomeClassification }
export interface GoalTaskOutcomeReceipt { readonly sourceId: string; readonly classification: GoalTaskOutcomeClassification; readonly duplicate: boolean }

const textKeys = ['goalId', 'taskId', 'parentSessionId', 'childSessionId', 'nativeGoalId', 'checkerId'] as const
const digestKeys = ['preparationDigest', 'materialDigest', 'modelConfigDigest', 'checkerDigest', 'contractDigest', 'inputsDigest', 'requiredConditionDigest'] as const
const integerKeys = ['epoch', 'preparedSeq', 'endSeq', 'consentRevision'] as const
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
function digest(value: unknown): boolean { return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value) }
function text(value: unknown): boolean { return typeof value === 'string' && value.trim().length > 0 && value.length <= 512 && !value.includes('\0') && value.isWellFormed() }

export function parseGoalTaskOutcomeInput(value: unknown): GoalTaskOutcomeInput {
  if (!exact(value, ['source', ...textKeys, ...digestKeys, ...integerKeys, 'origin', 'outcome'])
    || value.source !== 'native-goal-task' || textKeys.some(key => !text(value[key])) || digestKeys.some(key => !digest(value[key]))
    || integerKeys.some(key => !Number.isSafeInteger(value[key]) || (value[key] as number) < 0)
    || value.epoch === 0 || value.consentRevision === 0 || (value.endSeq as number) <= (value.preparedSeq as number)
    || !exact(value.origin, ['sessionId', 'commandId', 'commandSeq', 'commandDigest'])
    || !text(value.origin.sessionId) || !text(value.origin.commandId) || !digest(value.origin.commandDigest)
    || !Number.isSafeInteger(value.origin.commandSeq) || (value.origin.commandSeq as number) < 0
    || value.childSessionId === value.parentSessionId || value.childSessionId === value.origin.sessionId) {
    throw new TypeError('native Goal Task outcome source is invalid')
  }
  const outcome = parseConversationExternalCheckOutcome(value.outcome)
  if (outcome.status === 'rejected' && outcome.failedRequiredConditionDigest !== undefined
    && outcome.failedRequiredConditionDigest !== value.requiredConditionDigest) throw new TypeError('Goal Task outcome failed a different original condition')
  return { ...structuredClone(value), outcome } as unknown as GoalTaskOutcomeInput
}
export function goalTaskOutcomeSourceId(input: Pick<GoalTaskOutcomeInput, 'goalId' | 'taskId' | 'epoch'>): string {
  return `goal-task-result:${sha256({ goalId: input.goalId, taskId: input.taskId, epoch: input.epoch }).slice(7)}`
}
export function goalTaskOutcomeClassification(input: GoalTaskOutcomeInput): GoalTaskOutcomeClassification {
  if (input.outcome.status === 'verified') return 'checked-success'
  if (input.outcome.status === 'unverifiable') return 'unverifiable'
  return input.outcome.failedRequiredConditionDigest === undefined ? 'unqualified-rejection' : 'checked-failure'
}
