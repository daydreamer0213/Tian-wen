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
  LongGoalSummaryV2,
} from './long-goal-contract.js'
import type { RunCurrentTaskResult } from './long-goal-host.js'
import type {
  GoalTaskFeedbackRecordResult,
  GoalTaskFeedbackStatus,
} from './goal-task-feedback.js'
import type { LearningClueSource, LearningClueStatus } from './learning-clue-status.js'

export interface LearningClueAnalysisStart {
  readonly schemaVersion: 'tianwen.learning-clue-analysis-start.v1'
  readonly created: boolean
  readonly sessionId: string
}

export interface LearnLoopClient {
  list(signal?: AbortSignal): Promise<readonly AnyLongGoalSummary[]>
  learningClues(signal?: AbortSignal): Promise<LearningClueStatus>
  analyzeLearningClue(
    ticketId: string,
    signal?: AbortSignal,
  ): Promise<LearningClueAnalysisStart>
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
  feedbackStatus(
    longGoalId: string,
    signal?: AbortSignal,
  ): Promise<GoalTaskFeedbackStatus>
  recordTaskFeedback(input: {
    readonly longGoalId: string
    readonly taskId: string
    readonly rating: 'positive' | 'negative'
    readonly note: string | null
  }, signal?: AbortSignal): Promise<GoalTaskFeedbackRecordResult>
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

function isStatusV2(value: unknown): value is LongGoalStatusProjectionV2 {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'goal', 'planner', 'guidance', 'tasks', 'currentTaskId', 'runtime',
  ]) || value.schemaVersion !== 'tianwen.long-goal-status.v2' ||
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

function isStatus(value: unknown): value is AnyLongGoalStatusProjection {
  return isRecord(value) && (
    value.schemaVersion === 'tianwen.long-goal-status.v1' ? isStatusV1(value) :
      value.schemaVersion === 'tianwen.long-goal-status.v2' && isStatusV2(value)
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

function isSummaryV2(value: unknown): value is LongGoalSummaryV2 {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'id', 'objective', 'phase', 'revision', 'completedTasks',
    'abandonedTasks', 'totalTasks', 'currentTaskId', 'updatedAt',
  ]) && value.schemaVersion === 'tianwen.long-goal-summary.v2' &&
    isNonEmptyString(value.id) && isNonEmptyString(value.objective) &&
    isGoalPhaseV2(value.phase) && isPositiveInteger(value.revision) &&
    isNonNegativeInteger(value.completedTasks) && isNonNegativeInteger(value.abandonedTasks) &&
    isNonNegativeInteger(value.totalTasks) &&
    (value.currentTaskId === null || isNonEmptyString(value.currentTaskId)) &&
    isNonNegativeInteger(value.updatedAt)
}

function isSummary(value: unknown): value is AnyLongGoalSummary {
  if (!isRecord(value)) return false
  if (value.schemaVersion === undefined) return isSummaryV1(value)
  return value.schemaVersion === 'tianwen.long-goal-summary.v2' && isSummaryV2(value)
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

function isFeedbackItem(value: unknown): boolean {
  if (!isRecord(value) || ![
    hasExactKeys(value, ['taskId', 'rating', 'decision', 'recordedAt']),
    hasExactKeys(value, ['taskId', 'rating', 'decision', 'recordedAt', 'ticketId']),
  ].includes(true) || !isNonEmptyString(value.taskId) ||
    (value.rating !== 'positive' && value.rating !== 'negative') ||
    !['no-case', 'observed-gap', 'ticket-created', 'ticket-merged']
      .includes(String(value.decision)) || !isNonEmptyString(value.recordedAt)) {
    return false
  }
  const ticketDecision = value.decision === 'ticket-created' || value.decision === 'ticket-merged'
  const ratingDecisionMatches = value.rating === 'positive'
    ? value.decision === 'no-case'
    : value.decision !== 'no-case'
  return ratingDecisionMatches &&
    (ticketDecision ? isNonEmptyString(value.ticketId) : value.ticketId === undefined)
}

function isFeedbackStatus(value: unknown): value is GoalTaskFeedbackStatus {
  return isRecord(value) && hasExactKeys(value, ['schemaVersion', 'items']) &&
    value.schemaVersion === 'tianwen.goal-task-feedback-status.v1' &&
    Array.isArray(value.items) && value.items.every(isFeedbackItem)
}

function isFeedbackRecord(value: unknown): value is GoalTaskFeedbackRecordResult {
  return isRecord(value) && hasExactKeys(value, [
    'schemaVersion', 'duplicate', 'item',
  ]) && value.schemaVersion === 'tianwen.goal-task-feedback-record.v1' &&
    typeof value.duplicate === 'boolean' && isFeedbackItem(value.item)
}

function isLearningClueSource(value: unknown): value is LearningClueSource {
  return isRecord(value) && hasExactKeys(value, [
    'longGoalId', 'goalObjective', 'taskId', 'taskObjective', 'recordedAt',
  ]) && isNonEmptyString(value.longGoalId) && isNonEmptyString(value.goalObjective) &&
    isNonEmptyString(value.taskId) && isNonEmptyString(value.taskObjective) &&
    isNonEmptyString(value.recordedAt)
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = new Date(value)
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
}

function isLearningClueAnalysis(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.sessionId) ||
    !isCanonicalIsoTimestamp(value.startedAt)) return false
  if (value.phase === 'running') {
    return hasExactKeys(value, ['phase', 'sessionId', 'startedAt'])
  }
  return (value.phase === 'complete' || value.phase === 'failed') &&
    hasExactKeys(value, ['phase', 'sessionId', 'startedAt', 'finishedAt']) &&
    isCanonicalIsoTimestamp(value.finishedAt)
}

function isLearningClueStatus(value: unknown): value is LearningClueStatus {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'items']) ||
    value.schemaVersion !== 'tianwen.learning-clue-status.v1' || !Array.isArray(value.items)) {
    return false
  }
  const ticketIds = new Set<string>()
  return value.items.every(item => {
    if (!isRecord(item) || !hasExactKeys(item, [
      'ticketId', 'status', 'occurrenceCount', 'analysis', 'sources',
    ]) || typeof item.ticketId !== 'string' || !/^ticket:[a-f0-9]{64}$/.test(item.ticketId) ||
      ticketIds.has(item.ticketId) || item.status !== 'open' ||
      (item.analysis !== null && !isLearningClueAnalysis(item.analysis)) ||
      !isPositiveInteger(item.occurrenceCount) || !Array.isArray(item.sources) ||
      item.sources.length === 0) return false
    ticketIds.add(item.ticketId)
    const sourceIds = new Set<string>()
    return item.sources.every(source => {
      if (!isLearningClueSource(source)) return false
      const sourceId = `${source.longGoalId}\0${source.taskId}`
      if (sourceIds.has(sourceId)) return false
      sourceIds.add(sourceId)
      return true
    })
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
    async learningClues(signal) {
      const value = await call(rpc, 'learning-clues', {}, signal)
      if (!isLearningClueStatus(value)) invalidResponse()
      return value
    },
    async analyzeLearningClue(ticketId, signal) {
      const value = await call(rpc, 'analyze-learning-clue', { ticketId }, signal)
      if (!isRecord(value) || !hasExactKeys(value, [
        'schemaVersion', 'created', 'sessionId',
      ]) || value.schemaVersion !== 'tianwen.learning-clue-analysis-start.v1' ||
        typeof value.created !== 'boolean' || !isNonEmptyString(value.sessionId)) {
        invalidResponse()
      }
      return value as unknown as LearningClueAnalysisStart
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
    async feedbackStatus(longGoalId, signal) {
      const value = await call(rpc, 'feedback-status', { longGoalId }, signal)
      if (!isFeedbackStatus(value)) invalidResponse()
      return value
    },
    async recordTaskFeedback(input, signal) {
      const value = await call(rpc, 'record-task-feedback', input, signal)
      if (!isFeedbackRecord(value)) invalidResponse()
      return value
    },
  }
}
