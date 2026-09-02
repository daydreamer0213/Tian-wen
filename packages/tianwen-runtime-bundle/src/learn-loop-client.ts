import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

import type {
  AnyLongGoalStatusProjection,
  AnyLongGoalSummary,
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
  LongGoalStatusProjection,
  LongGoalSummary,
  LongGoalStatusProjectionV2,
  LongGoalStatusProjectionV3,
  LongGoalSummaryV2,
  LongGoalSummaryV3,
} from './long-goal-contract.js'
import type { RunCurrentTaskResult } from './long-goal-host.js'
import type { LearningAudit } from './learning-clue-status.js'

export interface LearnLoopClient {
  list(signal?: AbortSignal): Promise<readonly AnyLongGoalSummary[]>
  learningAudit(signal?: AbortSignal): Promise<LearningAudit>
  create(input: {
    readonly objective: string
    readonly tasks: readonly string[]
    readonly maxTaskRounds: number
  }, signal?: AbortSignal): Promise<LongGoalStatusProjection>
  status(longGoalId: string, signal?: AbortSignal): Promise<AnyLongGoalStatusProjection>
  runCurrentTask(input: {
    readonly longGoalId: string
    readonly initialCwd?: string
  }, signal?: AbortSignal): Promise<RunCurrentTaskResult>
  createGoalFirst(input: {
    readonly objective: string
    readonly context: string | null
    readonly successCriteria: string | null
    readonly workspaceSessionId: string
  }, signal?: AbortSignal): Promise<GoalFirstProgressResultV2>
  continueProgress(input: {
    readonly longGoalId: string
    readonly expectedRevision: number
  }, signal?: AbortSignal): Promise<GoalFirstProgressResultV2>
  addGuidance(input: {
    readonly longGoalId: string
    readonly expectedRevision: number
    readonly text: string
  }, signal?: AbortSignal): Promise<LongGoalGuidanceResultV2>
  abandonCurrentTask(input: {
    readonly longGoalId: string
    readonly expectedRevision: number
  }, signal?: AbortSignal): Promise<LongGoalAbandonResultV2>
}

export class LearnLoopRpcError extends Error {
  constructor(
    readonly code: 'internal' | 'revision-conflict',
    message: string,
    readonly details: Record<string, never> | {
      readonly expectedRevision: number
      readonly currentRevision: number
    },
  ) {
    super(message)
    this.name = 'LearnLoopRpcError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
}

function isGoalPhaseV1(value: unknown): value is 'active' | 'blocked' | 'complete' {
  return value === 'active' || value === 'blocked' || value === 'complete'
}

function isGoalPhaseV2(value: unknown): value is 'planning' | 'active' | 'blocked' | 'complete' {
  return value === 'planning' || isGoalPhaseV1(value)
}

function isTaskPhaseV1(value: unknown): value is 'pending' | 'active' | 'paused' | 'blocked' | 'complete' {
  return value === 'pending' || value === 'active' || value === 'paused' ||
    value === 'blocked' || value === 'complete'
}

function isTaskPhaseV2(value: unknown): boolean {
  return isTaskPhaseV1(value) || value === 'abandoned'
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value)
}

function isExecution(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['goalId', 'sessionId']) &&
    isNonEmptyString(value.goalId) && isNonEmptyString(value.sessionId)
}

function isStatusV1(value: unknown): value is LongGoalStatusProjection {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'goal', 'tasks', 'currentTaskId', 'runtime',
  ]) || value.schemaVersion !== 'tianwen.long-goal-status.v1' ||
    !isRecord(value.goal) || !hasExactKeys(value.goal, [
      'id', 'objective', 'phase', 'completedTasks', 'totalTasks',
    ]) || !isNonEmptyString(value.goal.id) || !isNonEmptyString(value.goal.objective) ||
    !isGoalPhaseV1(value.goal.phase) || !isNonNegativeInteger(value.goal.completedTasks) ||
    !isNonNegativeInteger(value.goal.totalTasks) || !Array.isArray(value.tasks) ||
    (value.currentTaskId !== null && !isNonEmptyString(value.currentTaskId)) ||
    !isRecord(value.runtime) || !hasExactKeys(value.runtime, [
      'activation', 'modelRequests', 'readOnly',
    ]) || value.runtime.activation !== 'not-loaded' ||
    value.runtime.modelRequests !== 0 || value.runtime.readOnly !== true) {
    return false
  }
  return value.tasks.every(task => {
    if (!isRecord(task) || ![
      hasExactKeys(task, ['id', 'objective', 'phase', 'execution']),
      hasExactKeys(task, ['id', 'objective', 'phase', 'execution', 'blockedReason']),
    ].includes(true) || !isNonEmptyString(task.id) || !isNonEmptyString(task.objective) ||
      !isTaskPhaseV1(task.phase) || (task.execution !== null && !isExecution(task.execution))) {
      return false
    }
    const validBlockedReason = isRecord(task.blockedReason) &&
      hasExactKeys(task.blockedReason, ['code', 'message']) &&
      isNonEmptyString(task.blockedReason.code) && isNonEmptyString(task.blockedReason.message)
    return task.phase === 'blocked' ? validBlockedReason : task.blockedReason === undefined
  })
}

function isContinuousControl(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['sessionId', 'autoProgress']) &&
    isNonEmptyString(value.sessionId) &&
    (value.autoProgress === 'running' || value.autoProgress === 'paused')
}

function isGoalFirstStatus(
  value: unknown,
  schemaVersion: 'tianwen.long-goal-status.v2' | 'tianwen.long-goal-status.v3',
): boolean {
  const keys = [
    'schemaVersion', 'goal', 'planner', 'guidance', 'tasks', 'currentTaskId', 'runtime',
    ...(schemaVersion === 'tianwen.long-goal-status.v3' ? ['control'] : []),
  ]
  if (!isRecord(value) || !hasExactKeys(value, keys) || value.schemaVersion !== schemaVersion ||
    (schemaVersion === 'tianwen.long-goal-status.v3' && !isContinuousControl(value.control)) ||
    !isRecord(value.goal) || !hasExactKeys(value.goal, [
      'id', 'objective', 'context', 'successCriteria', 'phase', 'revision',
      'completedTasks', 'abandonedTasks', 'totalTasks',
    ]) || !isNonEmptyString(value.goal.id) || !isNonEmptyString(value.goal.objective) ||
    !isNullableNonEmptyString(value.goal.context) ||
    !isNullableNonEmptyString(value.goal.successCriteria) ||
    !isGoalPhaseV2(value.goal.phase) || !isPositiveInteger(value.goal.revision) ||
    !isNonNegativeInteger(value.goal.completedTasks) ||
    !isNonNegativeInteger(value.goal.abandonedTasks) ||
    !isNonNegativeInteger(value.goal.totalTasks) ||
    !isRecord(value.planner) || !hasExactKeys(value.planner, [
      'sessionId', 'phase', 'planRevision',
    ]) || !isNonEmptyString(value.planner.sessionId) ||
    !['unplanned', 'ready', 'needs-replan', 'complete'].includes(String(value.planner.phase)) ||
    !isNonNegativeInteger(value.planner.planRevision) || !Array.isArray(value.guidance) ||
    !value.guidance.every(isNonEmptyString) || !Array.isArray(value.tasks) ||
    (value.currentTaskId !== null && !isNonEmptyString(value.currentTaskId)) ||
    !isRecord(value.runtime) || !hasExactKeys(value.runtime, [
      'activation', 'modelRequests', 'readOnly',
    ]) || value.runtime.activation !== 'not-loaded' || value.runtime.modelRequests !== 0 ||
    value.runtime.readOnly !== true) {
    return false
  }
  return value.tasks.every(task => {
    if (!isRecord(task) || ![
      hasExactKeys(task, ['id', 'objective', 'phase', 'execution', 'resolution']),
      hasExactKeys(task, ['id', 'objective', 'phase', 'execution', 'resolution', 'blockedReason']),
    ].includes(true) || !isNonEmptyString(task.id) || !isNonEmptyString(task.objective) ||
      !isTaskPhaseV2(task.phase) || (task.execution !== null && !isExecution(task.execution)) ||
      (task.resolution !== null && task.resolution !== 'abandoned')) {
      return false
    }
    const validBlockedReason = isRecord(task.blockedReason) &&
      hasExactKeys(task.blockedReason, ['code', 'message']) &&
      isNonEmptyString(task.blockedReason.code) && isNonEmptyString(task.blockedReason.message)
    const validBinding = task.phase === 'pending'
      ? task.execution === null && task.resolution === null
      : task.phase === 'abandoned'
        ? task.execution !== null && task.resolution === 'abandoned'
        : task.execution !== null && task.resolution === null
    const validReason = task.phase === 'blocked'
      ? validBlockedReason
      : task.blockedReason === undefined
    return validBinding && validReason
  })
}

function isStatusV2(value: unknown): value is LongGoalStatusProjectionV2 {
  return isGoalFirstStatus(value, 'tianwen.long-goal-status.v2')
}

function isStatusV3(value: unknown): value is LongGoalStatusProjectionV3 {
  return isGoalFirstStatus(value, 'tianwen.long-goal-status.v3')
}

function isStatus(value: unknown): value is AnyLongGoalStatusProjection {
  return isRecord(value) && (
    value.schemaVersion === 'tianwen.long-goal-status.v1' ? isStatusV1(value) :
      value.schemaVersion === 'tianwen.long-goal-status.v2' ? isStatusV2(value) :
        value.schemaVersion === 'tianwen.long-goal-status.v3' && isStatusV3(value)
  )
}

function isSummaryV1(value: unknown): value is LongGoalSummary {
  return isRecord(value) && hasExactKeys(value, [
    'id', 'objective', 'phase', 'completedTasks', 'totalTasks', 'currentTaskId', 'updatedAt',
  ]) && isNonEmptyString(value.id) && isNonEmptyString(value.objective) &&
    isGoalPhaseV1(value.phase) && isNonNegativeInteger(value.completedTasks) &&
    isNonNegativeInteger(value.totalTasks) &&
    (value.currentTaskId === null || isNonEmptyString(value.currentTaskId)) &&
    isNonNegativeInteger(value.updatedAt)
}

function isGoalFirstSummary(
  value: unknown,
  schemaVersion: 'tianwen.long-goal-summary.v2' | 'tianwen.long-goal-summary.v3',
): boolean {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'id', 'objective', 'phase', 'revision', 'completedTasks',
    'abandonedTasks', 'totalTasks', 'currentTaskId', 'updatedAt',
    ...(schemaVersion === 'tianwen.long-goal-summary.v3' ? ['control'] : []),
  ]) && value.schemaVersion === schemaVersion &&
    (schemaVersion !== 'tianwen.long-goal-summary.v3' || isContinuousControl(value.control)) &&
    isNonEmptyString(value.id) && isNonEmptyString(value.objective) &&
    isGoalPhaseV2(value.phase) && isPositiveInteger(value.revision) &&
    isNonNegativeInteger(value.completedTasks) && isNonNegativeInteger(value.abandonedTasks) &&
    isNonNegativeInteger(value.totalTasks) &&
    (value.currentTaskId === null || isNonEmptyString(value.currentTaskId)) &&
    isNonNegativeInteger(value.updatedAt)
}

function isSummaryV2(value: unknown): value is LongGoalSummaryV2 {
  return isGoalFirstSummary(value, 'tianwen.long-goal-summary.v2')
}

function isSummaryV3(value: unknown): value is LongGoalSummaryV3 {
  return isGoalFirstSummary(value, 'tianwen.long-goal-summary.v3')
}

function isSummary(value: unknown): value is AnyLongGoalSummary {
  if (!isRecord(value)) return false
  if (value.schemaVersion === undefined) return isSummaryV1(value)
  return value.schemaVersion === 'tianwen.long-goal-summary.v2' ? isSummaryV2(value) :
    value.schemaVersion === 'tianwen.long-goal-summary.v3' && isSummaryV3(value)
}

function isProgressResult(value: unknown): value is GoalFirstProgressResultV2 {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'action', 'status', 'sessionId',
  ]) && value.schemaVersion === 'tianwen.goal-first-progress-result.v2' &&
    ['planning-pending', 'started', 'continued', 'already-running', 'blocked', 'complete']
      .includes(String(value.action)) && isStatusV2(value.status) &&
    (value.sessionId === null || isNonEmptyString(value.sessionId))
}

function isGuidanceResult(value: unknown): value is LongGoalGuidanceResultV2 {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'planning', 'status',
  ]) && value.schemaVersion === 'tianwen.long-goal-guidance-result.v2' &&
    (value.planning === 'updated' || value.planning === 'pending') && isStatusV2(value.status)
}

function isAbandonResult(value: unknown): value is LongGoalAbandonResultV2 {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'action', 'status',
  ]) && value.schemaVersion === 'tianwen.long-goal-abandon-result.v2' &&
    value.action === 'abandoned' && isStatusV2(value.status)
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = new Date(value)
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
}

const auditPhases = new Set([
  'pending-parent', 'running', 'no-case', 'insufficient-evidence', 'candidate-ready',
  'protocol-unavailable', 'candidate-rejected', 'shadow-ready', 'promoted',
  'rolled-back', 'invalidated', 'failed',
])
const digestPattern = /^sha256:[a-f0-9]{64}$/

function isLearningAudit(value: unknown): value is LearningAudit {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'items']) ||
    value.schemaVersion !== 'tianwen.learning-audit.v1' || !Array.isArray(value.items)) return false
  const analysisIds = new Set<string>()
  return value.items.every(item => {
    if (!isRecord(item) || !hasExactKeys(item, [
      'analysisId', 'ticketId', 'phase', 'requestedAt', 'updatedAt', 'evidenceDigests', 'receipts', 'recovery',
    ]) || !/^analysis:[a-f0-9]{64}$/.test(String(item.analysisId)) ||
      !/^ticket:[a-f0-9]{64}$/.test(String(item.ticketId)) || analysisIds.has(String(item.analysisId)) ||
      !auditPhases.has(String(item.phase)) || !isCanonicalIsoTimestamp(item.requestedAt) ||
      !isCanonicalIsoTimestamp(item.updatedAt) || !Array.isArray(item.evidenceDigests) ||
      !item.evidenceDigests.every(digest => typeof digest === 'string' && digestPattern.test(digest)) ||
      new Set(item.evidenceDigests).size !== item.evidenceDigests.length || !isRecord(item.receipts)) return false
    const receiptKeys = [
      'candidateId', 'evaluationId', 'evaluationResultDigest', 'shadowId', 'shadowResultDigest',
      'promotionRecommendationDigest', 'promotionTransitionId', 'promotionTransitionReceiptDigest',
      'rollbackTransitionId', 'rollbackTransitionReceiptDigest', 'reportDigest', 'reportState',
    ]
    if (Object.keys(item.receipts).some(key => !receiptKeys.includes(key)) ||
      Object.values(item.receipts).some(receipt => typeof receipt !== 'string' || receipt.length === 0) ||
      (item.receipts.reportState !== undefined && item.receipts.reportState !== 'pending' && item.receipts.reportState !== 'delivered')) return false
    if (item.recovery !== null && (!isRecord(item.recovery) || !hasExactKeys(item.recovery,
      item.recovery.resumedAt === undefined ? ['resumePhase'] : ['resumePhase', 'resumedAt']) ||
      !auditPhases.has(String(item.recovery.resumePhase)) ||
      (item.recovery.resumedAt !== undefined && !isCanonicalIsoTimestamp(item.recovery.resumedAt)))) return false
    analysisIds.add(String(item.analysisId))
    return true
  })
}

function invalidResponse(): never {
  throw new Error('invalid Tianwen RPC response')
}

async function call(
  rpc: ClientConnectionRpc,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const rawResult: unknown = await rpc.call('/tianwen', endpoint, payload, signal)
  if (!isRecord(rawResult)) invalidResponse()
  const result = rawResult
  if (result.ok === true) {
    if (!hasExactKeys(result, ['ok', 'value'])) invalidResponse()
    return result.value
  }
  if (result.ok === false) {
    if (!hasExactKeys(result, ['ok', 'error'])) invalidResponse()
    if (!isRecord(result.error) || !hasExactKeys(result.error, ['code', 'message', 'details']) ||
      !isNonEmptyString(result.error.message) || !isRecord(result.error.details)) invalidResponse()
    if (result.error.code === 'internal' && hasExactKeys(result.error.details, [])) {
      throw new LearnLoopRpcError('internal', result.error.message, {})
    }
    if (result.error.code === 'revision-conflict' && result.error.message === 'revision-conflict' &&
      hasExactKeys(result.error.details, ['expectedRevision', 'currentRevision']) &&
      isPositiveInteger(result.error.details.expectedRevision) &&
      isPositiveInteger(result.error.details.currentRevision)) {
      throw new LearnLoopRpcError('revision-conflict', result.error.message, {
        expectedRevision: result.error.details.expectedRevision,
        currentRevision: result.error.details.currentRevision,
      })
    }
    invalidResponse()
  }
  invalidResponse()
}

export function createLearnLoopClient(rpc: ClientConnectionRpc): LearnLoopClient {
  return {
    async list(signal) {
      const value = await call(rpc, 'list', {}, signal)
      if (!isRecord(value) || !hasExactKeys(value, ['goals']) || !Array.isArray(value.goals) ||
        !value.goals.every(isSummary)) invalidResponse()
      return value.goals
    },
    async learningAudit(signal) {
      const value = await call(rpc, 'learning-audit', {}, signal)
      if (!isLearningAudit(value)) invalidResponse()
      return value
    },
    async create(input, signal) {
      const value = await call(rpc, 'create', input, signal)
      if (!isRecord(value) || !hasExactKeys(value, ['status']) || !isStatusV1(value.status)) {
        invalidResponse()
      }
      return value.status
    },
    async status(longGoalId, signal) {
      const value = await call(rpc, 'status', { longGoalId }, signal)
      if (!isRecord(value) || !hasExactKeys(value, ['status']) || !isStatus(value.status)) {
        invalidResponse()
      }
      return value.status
    },
    async runCurrentTask(input, signal) {
      const value = await call(rpc, 'run-current-task', input, signal)
      if (!isRecord(value) || !isStatusV1(value.status) || !(
        (value.action === 'complete' && hasExactKeys(value, ['status', 'action'])) ||
        ((value.action === 'started' || value.action === 'continued' || value.action === 'already-running') &&
          hasExactKeys(value, ['status', 'action', 'sessionId']) && isNonEmptyString(value.sessionId))
      )) {
        invalidResponse()
      }
      return value as unknown as RunCurrentTaskResult
    },
    async createGoalFirst(input, signal) {
      const value = await call(rpc, 'create-goal-first', input, signal)
      if (!isProgressResult(value)) invalidResponse()
      return value
    },
    async continueProgress(input, signal) {
      const value = await call(rpc, 'continue-progress', input, signal)
      if (!isProgressResult(value)) invalidResponse()
      return value
    },
    async addGuidance(input, signal) {
      const value = await call(rpc, 'add-guidance', input, signal)
      if (!isGuidanceResult(value)) invalidResponse()
      return value
    },
    async abandonCurrentTask(input, signal) {
      const value = await call(rpc, 'abandon-current-task', input, signal)
      if (!isAbandonResult(value)) invalidResponse()
      return value
    },
  }
}
