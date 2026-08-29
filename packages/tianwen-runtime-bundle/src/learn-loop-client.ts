import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

import type {
  LongGoalStatusProjection,
  LongGoalSummary,
} from './long-goal-contract.js'
import type { RunCurrentTaskResult } from './long-goal-host.js'

export interface LearnLoopClient {
  list(signal?: AbortSignal): Promise<readonly LongGoalSummary[]>
  create(input: {
    readonly objective: string
    readonly tasks: readonly string[]
    readonly maxTaskRounds: number
  }, signal?: AbortSignal): Promise<LongGoalStatusProjection>
  status(longGoalId: string, signal?: AbortSignal): Promise<LongGoalStatusProjection>
  runCurrentTask(input: {
    readonly longGoalId: string
    readonly initialCwd?: string
  }, signal?: AbortSignal): Promise<RunCurrentTaskResult>
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

function isGoalPhase(value: unknown): value is 'active' | 'blocked' | 'complete' {
  return value === 'active' || value === 'blocked' || value === 'complete'
}

function isTaskPhase(value: unknown): value is 'pending' | 'active' | 'paused' | 'blocked' | 'complete' {
  return value === 'pending' || value === 'active' || value === 'paused' ||
    value === 'blocked' || value === 'complete'
}

function isExecution(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['goalId', 'sessionId']) &&
    isNonEmptyString(value.goalId) && isNonEmptyString(value.sessionId)
}

function isStatus(value: unknown): value is LongGoalStatusProjection {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'goal', 'tasks', 'currentTaskId', 'runtime',
  ]) || value.schemaVersion !== 'tianwen.long-goal-status.v1' ||
    !isRecord(value.goal) || !hasExactKeys(value.goal, [
      'id', 'objective', 'phase', 'completedTasks', 'totalTasks',
    ]) || !isNonEmptyString(value.goal.id) || !isNonEmptyString(value.goal.objective) ||
    !isGoalPhase(value.goal.phase) || !isNonNegativeInteger(value.goal.completedTasks) ||
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
      !isTaskPhase(task.phase) || (task.execution !== null && !isExecution(task.execution))) {
      return false
    }
    const validBlockedReason = isRecord(task.blockedReason) &&
      hasExactKeys(task.blockedReason, ['code', 'message']) &&
      isNonEmptyString(task.blockedReason.code) && isNonEmptyString(task.blockedReason.message)
    return task.phase === 'blocked' ? validBlockedReason : task.blockedReason === undefined
  })
}

function isSummary(value: unknown): value is LongGoalSummary {
  return isRecord(value) && hasExactKeys(value, [
    'id', 'objective', 'phase', 'completedTasks', 'totalTasks', 'currentTaskId', 'updatedAt',
  ]) && isNonEmptyString(value.id) && isNonEmptyString(value.objective) &&
    isGoalPhase(value.phase) && isNonNegativeInteger(value.completedTasks) &&
    isNonNegativeInteger(value.totalTasks) &&
    (value.currentTaskId === null || isNonEmptyString(value.currentTaskId)) &&
    isNonNegativeInteger(value.updatedAt)
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
  const result = await rpc.call('/tianwen', endpoint, payload, signal)
  if (!isRecord(result)) invalidResponse()
  if (result.ok === true) {
    if (!hasExactKeys(result, ['ok', 'value'])) invalidResponse()
    return result.value
  }
  if (result.ok === false) {
    if (!hasExactKeys(result, ['ok', 'error'])) invalidResponse()
    if (!isRecord(result.error) || !hasExactKeys(result.error, ['code', 'message', 'details']) ||
      result.error.code !== 'internal' || !isNonEmptyString(result.error.message) ||
      !isRecord(result.error.details) || !hasExactKeys(result.error.details, [])) invalidResponse()
    throw new Error(result.error.message)
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
    async create(input, signal) {
      const value = await call(rpc, 'create', input, signal)
      if (!isRecord(value) || !hasExactKeys(value, ['status']) || !isStatus(value.status)) {
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
      if (!isRecord(value) || !isStatus(value.status) || !(
        (value.action === 'complete' && hasExactKeys(value, ['status', 'action'])) ||
        ((value.action === 'started' || value.action === 'continued' || value.action === 'already-running') &&
          hasExactKeys(value, ['status', 'action', 'sessionId']) && isNonEmptyString(value.sessionId))
      )) {
        invalidResponse()
      }
      return value as unknown as RunCurrentTaskResult
    },
  }
}
