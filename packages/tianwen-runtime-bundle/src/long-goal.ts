import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { readGoalStatus } from './status.js'
import type {
  LongGoalRecord,
  LongGoalRecordV2,
  LongGoalRecordV3,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
  LongGoalStatusProjectionV3,
  LongGoalTaskRecord,
  LongGoalTaskRecordV2,
  TaskExecutionBinding,
  TianwenExecutionAttempt,
  TianwenLongGoalEvent,
  TianwenTaskAttemptProjection,
  TianwenTerminalDeliveryCursor,
  AnyLongGoalRecord,
  AnyLongGoalStatusProjection,
  GoalFirstLongGoalRecord,
  ReadLongGoalStatusProjection,
} from './long-goal-contract.js'

export type {
  LongGoalRecord,
  LongGoalRecordV2,
  LongGoalRecordV3,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
  LongGoalStatusProjectionV3,
  LongGoalTaskRecord,
  LongGoalTaskRecordV2,
  TaskExecutionBinding,
  TianwenAttemptStatus,
  TianwenExecutionAttempt,
  TianwenLongGoalEvent,
  TianwenTaskAttemptProjection,
  TianwenTerminalDeliveryCursor,
  AnyLongGoalRecord,
  AnyLongGoalStatusProjection,
  AnyLongGoalSummary,
  GoalFirstLongGoalRecord,
  GoalFirstLongGoalStatusProjection,
  LongGoalSummaryV2,
  LongGoalSummaryV3,
  ReadLongGoalStatusProjection,
} from './long-goal-contract.js'

export class LongGoalIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LongGoalIntegrityError'
  }
}

export class LongGoalNotFoundError extends Error {
  constructor(readonly goalId: string) {
    super(`Long Goal not found: ${goalId}`)
    this.name = 'LongGoalNotFoundError'
  }
}

export class LongGoalRevisionConflictError extends Error {
  constructor(readonly expectedRevision: number, readonly currentRevision: number) {
    super(`Long Goal revision conflict: expected ${expectedRevision}, current ${currentRevision}`)
    this.name = 'LongGoalRevisionConflictError'
  }
}

type StatusTarget = {
  readonly dataDir: string
} | {
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

const LONG_GOAL_ID = /^tianwen-long-goal-[A-Za-z0-9][A-Za-z0-9-]*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isLongGoalId(value: unknown): value is string {
  return isNonEmptyString(value) && LONG_GOAL_ID.test(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCanonicalWorkspaceRoot(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && resolve(value) === value && resolve(value, '..') !== value
}

function nowAtLeast(previous: number, now: number): number {
  if (!isTimestamp(now)) throw new TypeError('Long Goal clock is invalid')
  return Math.max(previous, now)
}

function longGoalsDirectory(stateRoot: string): string {
  return join(resolve(stateRoot), 'long-goals')
}

function recordPath(stateRoot: string, longGoalId: string): string {
  if (!isLongGoalId(longGoalId)) throw new TypeError('Long Goal id is invalid')
  return join(longGoalsDirectory(stateRoot), `${longGoalId}.json`)
}

function parseExecution(value: unknown): TaskExecutionBinding | null {
  if (value === null) return null
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['goalId', 'sessionId']) ||
    !isNonEmptyString(value.goalId) ||
    !isNonEmptyString(value.sessionId)
  ) {
    throw new LongGoalIntegrityError('Long Goal Task execution binding is invalid')
  }
  return { goalId: value.goalId, sessionId: value.sessionId }
}

function parseTask(value: unknown, index: number): LongGoalTaskRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'objective', 'execution']) ||
    value.id !== `task-${index + 1}` ||
    !isNonEmptyString(value.objective)
  ) {
    throw new LongGoalIntegrityError('Long Goal Task record is invalid')
  }
  return {
    id: value.id,
    objective: value.objective,
    execution: parseExecution(value.execution),
  }
}

function validateTaskBindings(tasks: readonly LongGoalTaskRecord[]): void {
  let reachedUnboundTask = false
  const goalIds = new Set<string>()
  const sessionIds = new Set<string>()
  for (const task of tasks) {
    if (task.execution === null) {
      reachedUnboundTask = true
      continue
    }
    if (reachedUnboundTask) {
      throw new LongGoalIntegrityError('Long Goal Task bindings must form a continuous prefix')
    }
    if (goalIds.has(task.execution.goalId) || sessionIds.has(task.execution.sessionId)) {
      throw new LongGoalIntegrityError('Long Goal Task bindings must use unique Goal and Session ids')
    }
    goalIds.add(task.execution.goalId)
    sessionIds.add(task.execution.sessionId)
  }
}

function parseLongGoal(value: unknown): LongGoalRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion', 'id', 'objective', 'maxTaskRounds', 'createdAt',
      'updatedAt', 'tasks',
    ]) ||
    value.schemaVersion !== 'tianwen.long-goal.v1' ||
    !isLongGoalId(value.id) ||
    !isNonEmptyString(value.objective) ||
    !isPositiveInteger(value.maxTaskRounds) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    !Array.isArray(value.tasks) ||
    value.tasks.length === 0
  ) {
    throw new LongGoalIntegrityError('Long Goal record is invalid')
  }
  const tasks = value.tasks.map(parseTask)
  validateTaskBindings(tasks)
  return {
    schemaVersion: 'tianwen.long-goal.v1',
    id: value.id,
    objective: value.objective,
    maxTaskRounds: value.maxTaskRounds,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    tasks,
  }
}

function parseV2Task(value: unknown): LongGoalTaskRecordV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'objective', 'execution', 'resolution']) ||
    typeof value.id !== 'string' || !UUID.test(value.id) ||
    !isNonEmptyString(value.objective) ||
    (value.resolution !== null && value.resolution !== 'abandoned')
  ) {
    throw new LongGoalIntegrityError('Long Goal v2 Task record is invalid')
  }
  const execution = parseExecution(value.execution)
  if (execution === null && value.resolution !== null) {
    throw new LongGoalIntegrityError('Long Goal v2 Task abandonment requires a binding')
  }
  return { id: value.id, objective: value.objective, execution, resolution: value.resolution }
}

function validateV2TaskBindings(tasks: readonly LongGoalTaskRecordV2[]): void {
  let reachedUnboundTask = false
  const ids = new Set<string>()
  const goalIds = new Set<string>()
  const sessionIds = new Set<string>()
  for (const task of tasks) {
    if (ids.has(task.id)) throw new LongGoalIntegrityError('Long Goal v2 Task ids must be unique')
    ids.add(task.id)
    if (task.execution === null) {
      reachedUnboundTask = true
      continue
    }
    if (reachedUnboundTask) {
      throw new LongGoalIntegrityError('Long Goal v2 Task bindings must form a continuous prefix')
    }
    if (goalIds.has(task.execution.goalId) || sessionIds.has(task.execution.sessionId)) {
      throw new LongGoalIntegrityError('Long Goal v2 Task bindings must use unique Goal and Session ids')
    }
    goalIds.add(task.execution.goalId)
    sessionIds.add(task.execution.sessionId)
  }
}

function parseTianwenAttempt(value: unknown): TianwenExecutionAttempt {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['epoch', 'parentSessionId', 'childSessionId', 'permissionFingerprint', 'status', 'startedAt']) ||
    !isPositiveInteger(value.epoch) ||
    !isNonEmptyString(value.parentSessionId) ||
    !isNonEmptyString(value.childSessionId) ||
    !isNonEmptyString(value.permissionFingerprint) ||
    !/^sha256:\S+$/u.test(value.permissionFingerprint) ||
    value.status !== 'running' ||
    !isNonEmptyString(value.startedAt)
  ) {
    throw new LongGoalIntegrityError('Tianwen attempt-started event is invalid')
  }
  return {
    epoch: value.epoch,
    parentSessionId: value.parentSessionId,
    childSessionId: value.childSessionId,
    permissionFingerprint: value.permissionFingerprint as `sha256:${string}`,
    status: 'running',
    startedAt: value.startedAt,
  }
}

function parseTianwenEvents(value: unknown, tasks: readonly LongGoalTaskRecordV2[]): readonly TianwenLongGoalEvent[] {
  if (!Array.isArray(value)) throw new LongGoalIntegrityError('Tianwen Long Goal events are invalid')
  const taskIds = new Set(tasks.map(task => task.id))
  const events: TianwenLongGoalEvent[] = []
  for (const event of value) {
    if (!isRecord(event) || !isNonEmptyString(event.taskId) || !taskIds.has(event.taskId)) {
      throw new LongGoalIntegrityError('Tianwen Long Goal event Task is invalid')
    }
    if (event.type === 'attempt-started' && hasExactKeys(event, ['type', 'taskId', 'attempt'])) {
      events.push({ type: 'attempt-started', taskId: event.taskId, attempt: parseTianwenAttempt(event.attempt) })
      continue
    }
    if (
      (event.type === 'attempt-permission-limited' || event.type === 'attempt-settled' || event.type === 'attempt-provisioning-failed') &&
      hasExactKeys(event, ['type', 'taskId', 'epoch', 'terminalEventId']) &&
      isPositiveInteger(event.epoch) && isNonEmptyString(event.terminalEventId)
    ) {
      events.push({
        type: event.type,
        taskId: event.taskId,
        epoch: event.epoch,
        terminalEventId: event.terminalEventId,
      })
      continue
    }
    if (
      event.type === 'terminal-delivery-observed' &&
      hasExactKeys(event, ['type', 'taskId', 'delivery']) &&
      isRecord(event.delivery) &&
      hasExactKeys(event.delivery, ['terminalEventId', 'parentSessionId', 'completionTurnObserved']) &&
      isNonEmptyString(event.delivery.terminalEventId) &&
      isNonEmptyString(event.delivery.parentSessionId) &&
      typeof event.delivery.completionTurnObserved === 'boolean'
    ) {
      events.push({
        type: 'terminal-delivery-observed',
        taskId: event.taskId,
        delivery: {
          terminalEventId: event.delivery.terminalEventId,
          parentSessionId: event.delivery.parentSessionId,
          completionTurnObserved: event.delivery.completionTurnObserved,
        },
      })
      continue
    }
    throw new LongGoalIntegrityError('Tianwen Long Goal event is invalid')
  }
  validateTianwenEventHistory(events)
  return events
}

function validateTianwenEventHistory(events: readonly TianwenLongGoalEvent[]): void {
  const projections = new Map<string, {
    attempts: TianwenExecutionAttempt[]
    provisioningFailedEpochs: Set<number>
    terminalDelivery?: TianwenTerminalDeliveryCursor
  }>()
  for (const event of events) {
    const projection = projections.get(event.taskId) ?? { attempts: [], provisioningFailedEpochs: new Set<number>() }
    projections.set(event.taskId, projection)
    if (event.type === 'attempt-started') {
      const previous = projection.attempts.at(-1)
      if (event.attempt.epoch !== projection.attempts.length + 1) {
        throw new LongGoalIntegrityError('Tianwen attempt epoch must start at 1 and increase by exactly 1')
      }
      if (previous?.status === 'running') {
        throw new LongGoalIntegrityError('Tianwen attempt-started requires no current running attempt')
      }
      if (projection.attempts.some(attempt => attempt.childSessionId === event.attempt.childSessionId)) {
        throw new LongGoalIntegrityError('Tianwen Task cannot reuse a child Session id')
      }
      const matchingPermissionAttempts = projection.attempts
        .filter(attempt => attempt.permissionFingerprint === event.attempt.permissionFingerprint)
      if (matchingPermissionAttempts.some(attempt => !projection.provisioningFailedEpochs.has(attempt.epoch))) {
        throw new LongGoalIntegrityError('Tianwen Task cannot automatically reuse a permission fingerprint')
      }
      projection.attempts.push(event.attempt)
      continue
    }
    const current = projection.attempts.at(-1)
    if (event.type === 'attempt-permission-limited' || event.type === 'attempt-settled' || event.type === 'attempt-provisioning-failed') {
      if (current === undefined || current.status !== 'running' || current.epoch !== event.epoch) {
        throw new LongGoalIntegrityError('Tianwen terminal attempt event requires the current running attempt')
      }
      projection.attempts[projection.attempts.length - 1] = {
        ...current,
        status: event.type === 'attempt-permission-limited'
          ? 'permission-limited'
          : event.type === 'attempt-settled'
            ? 'settled'
            : 'interrupted',
        terminalEventId: event.terminalEventId,
      }
      if (event.type === 'attempt-provisioning-failed') projection.provisioningFailedEpochs.add(event.epoch)
      continue
    }
    if (
      current === undefined ||
      (current.status !== 'permission-limited' && current.status !== 'settled' && current.status !== 'interrupted') ||
      current.terminalEventId !== event.delivery.terminalEventId ||
      current.parentSessionId !== event.delivery.parentSessionId
    ) {
      throw new LongGoalIntegrityError('Tianwen terminal delivery acknowledgement must name the current terminal event')
    }
    projection.terminalDelivery = event.delivery
  }
}

function tianwenTaskAttemptProjection(
  tasks: readonly LongGoalTaskRecordV2[],
  events: readonly TianwenLongGoalEvent[] | undefined,
  taskId: string,
): TianwenTaskAttemptProjection {
  if (!tasks.some(task => task.id === taskId)) throw new LongGoalIntegrityError('Tianwen Long Goal event Task is invalid')
  const projection = { attempts: [] as TianwenExecutionAttempt[], terminalDelivery: undefined as TianwenTerminalDeliveryCursor | undefined }
  for (const event of events ?? []) {
    if (event.taskId !== taskId) continue
    if (event.type === 'attempt-started') {
      projection.attempts.push(event.attempt)
    } else if (event.type === 'attempt-permission-limited' || event.type === 'attempt-settled' || event.type === 'attempt-provisioning-failed') {
      const current = projection.attempts.at(-1)
      if (current === undefined) throw new LongGoalIntegrityError('Tianwen attempt history is invalid')
      projection.attempts[projection.attempts.length - 1] = {
        ...current,
        status: event.type === 'attempt-permission-limited'
          ? 'permission-limited'
          : event.type === 'attempt-settled'
            ? 'settled'
            : 'interrupted',
        terminalEventId: event.terminalEventId,
      }
    } else {
      projection.terminalDelivery = event.delivery
    }
  }
  return projection.terminalDelivery === undefined
    ? { attempts: projection.attempts }
    : { attempts: projection.attempts, terminalDelivery: projection.terminalDelivery }
}

function parseGoalFirstLongGoalFields(
  value: unknown,
  hasControl: boolean,
  schemaVersion: 'v2' | 'v3',
): Omit<LongGoalRecordV2, 'schemaVersion'> {
  const recordKeys = [
    'schemaVersion', 'id', 'revision', 'objective', 'context', 'successCriteria',
    'workspaceRoot', 'maxTaskRounds', 'planner', 'guidance', 'createdAt', 'updatedAt', 'tasks',
    ...(hasControl ? ['control'] : []),
    ...(hasControl && isRecord(value) && Object.hasOwn(value, 'tianwenEvents') ? ['tianwenEvents'] : []),
  ]
  if (
    !isRecord(value) ||
    !hasExactKeys(value, recordKeys) ||
    !isLongGoalId(value.id) ||
    !isPositiveInteger(value.revision) ||
    !isNonEmptyString(value.objective) ||
    (value.context !== null && !isNonEmptyString(value.context)) ||
    (value.successCriteria !== null && !isNonEmptyString(value.successCriteria)) ||
    !isCanonicalWorkspaceRoot(value.workspaceRoot) ||
    !isPositiveInteger(value.maxTaskRounds) ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || value.updatedAt < value.createdAt ||
    !Array.isArray(value.guidance) || value.guidance.some(item => !isNonEmptyString(item)) ||
    !Array.isArray(value.tasks) ||
    !isRecord(value.planner) ||
    !hasExactKeys(value.planner, ['sessionId', 'agentPreset', 'planRevision', 'phase', 'consideredSettledTasks']) ||
    !isNonEmptyString(value.planner.sessionId) || !isNonEmptyString(value.planner.agentPreset) ||
    !isNonNegativeInteger(value.planner.planRevision) ||
    !['unplanned', 'ready', 'needs-replan', 'complete'].includes(String(value.planner.phase)) ||
    !isNonNegativeInteger(value.planner.consideredSettledTasks)
  ) {
    throw new LongGoalIntegrityError(`Long Goal ${schemaVersion} record is invalid`)
  }
  const plannerSessionId = (value.planner as { readonly sessionId: string }).sessionId
  const tasks = value.tasks.map(parseV2Task)
  validateV2TaskBindings(tasks)
  if (tasks.some(task => task.execution?.sessionId === plannerSessionId)) {
    throw new LongGoalIntegrityError(`Long Goal ${schemaVersion} Task execution Session must differ from planner Session`)
  }
  if (value.planner.phase === 'unplanned' && tasks.length !== 0) {
    throw new LongGoalIntegrityError(`Unplanned Long Goal ${schemaVersion} has Tasks`)
  }
  return {
    id: value.id,
    revision: value.revision,
    objective: value.objective,
    context: value.context,
    successCriteria: value.successCriteria,
    workspaceRoot: value.workspaceRoot,
    maxTaskRounds: value.maxTaskRounds,
    planner: {
      sessionId: value.planner.sessionId,
      agentPreset: value.planner.agentPreset,
      planRevision: value.planner.planRevision,
      phase: value.planner.phase as LongGoalRecordV2['planner']['phase'],
      consideredSettledTasks: value.planner.consideredSettledTasks,
    },
    guidance: [...value.guidance],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    tasks,
  }
}

function parseLongGoalV2(value: unknown): LongGoalRecordV2 {
  if (!isRecord(value) || value.schemaVersion !== 'tianwen.long-goal.v2') {
    throw new LongGoalIntegrityError('Long Goal v2 record is invalid')
  }
  return { schemaVersion: 'tianwen.long-goal.v2', ...parseGoalFirstLongGoalFields(value, false, 'v2') }
}

function parseLongGoalV3(value: unknown): LongGoalRecordV3 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'tianwen.long-goal.v3' ||
    !isRecord(value.control) ||
    !hasExactKeys(value.control, ['sessionId', 'autoProgress']) ||
    !isNonEmptyString(value.control.sessionId) ||
    (value.control.autoProgress !== 'running' && value.control.autoProgress !== 'paused')
  ) {
    throw new LongGoalIntegrityError('Long Goal v3 record is invalid')
  }
  const controlSessionId = (value.control as { readonly sessionId: string }).sessionId
  const fields = parseGoalFirstLongGoalFields(value, true, 'v3')
  const events = Object.hasOwn(value, 'tianwenEvents')
    ? parseTianwenEvents(value.tianwenEvents, fields.tasks)
    : undefined
  if (controlSessionId === fields.planner.sessionId) {
    throw new LongGoalIntegrityError('Continuous Goal control Session must differ from planner Session')
  }
  if (fields.tasks.some(task => task.execution?.sessionId === controlSessionId)) {
    throw new LongGoalIntegrityError('Continuous Goal control Session must differ from Task execution Session')
  }
  return {
    schemaVersion: 'tianwen.long-goal.v3',
    ...fields,
    control: { sessionId: value.control.sessionId, autoProgress: value.control.autoProgress },
    ...(events === undefined ? {} : { tianwenEvents: events }),
  }
}

function parseAnyLongGoal(value: unknown): AnyLongGoalRecord {
  if (!isRecord(value)) throw new LongGoalIntegrityError('Long Goal record is invalid')
  if (value.schemaVersion === 'tianwen.long-goal.v1') return parseLongGoal(value)
  if (value.schemaVersion === 'tianwen.long-goal.v2') return parseLongGoalV2(value)
  if (value.schemaVersion === 'tianwen.long-goal.v3') return parseLongGoalV3(value)
  throw new LongGoalIntegrityError('Long Goal record schema version is invalid')
}

function validateCreateInput(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly tasks: readonly string[]
  readonly maxTaskRounds: number
}): void {
  if (
    typeof input.stateRoot !== 'string' ||
    !isNonEmptyString(input.objective) ||
    !Array.isArray(input.tasks) ||
    input.tasks.length === 0 ||
    input.tasks.some(task => !isNonEmptyString(task)) ||
    !isPositiveInteger(input.maxTaskRounds)
  ) {
    throw new TypeError('Long Goal input is invalid')
  }
}

function writeRecordExclusive(path: string, record: AnyLongGoalRecord): void {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' })
}

function replaceRecordAtomically(path: string, record: AnyLongGoalRecord): void {
  const temporaryPath = join(resolve(path, '..'), `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8', flag: 'wx',
    })
    renameSync(temporaryPath, path)
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw error
  }
}

export function createLongGoal(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly tasks: readonly string[]
  readonly maxTaskRounds: number
}, dependencies: {
  readonly id?: () => string
  readonly now?: () => number
} = {}): LongGoalRecord {
  validateCreateInput(input)
  const suffix = (dependencies.id ?? randomUUID)()
  const id = `tianwen-long-goal-${suffix}`
  if (!isLongGoalId(id)) throw new TypeError('Long Goal id is invalid')
  const now = (dependencies.now ?? Date.now)()
  if (!isTimestamp(now)) throw new TypeError('Long Goal clock is invalid')
  const record: LongGoalRecord = {
    schemaVersion: 'tianwen.long-goal.v1',
    id,
    objective: input.objective,
    maxTaskRounds: input.maxTaskRounds,
    createdAt: now,
    updatedAt: now,
    tasks: input.tasks.map((objective, index) => ({
      id: `task-${index + 1}`,
      objective,
      execution: null,
    })),
  }
  writeRecordExclusive(recordPath(input.stateRoot, record.id), record)
  return record
}

export function readLongGoal(stateRoot: string, goalId: string): AnyLongGoalRecord {
  if (!isNonEmptyString(stateRoot)) {
    throw new TypeError('Long Goal location is invalid')
  }
  if (!isLongGoalId(goalId)) throw new TypeError('Long Goal id is invalid')
  const path = recordPath(stateRoot, goalId)
  if (!existsSync(path)) throw new LongGoalNotFoundError(goalId)
  try {
    const record = parseAnyLongGoal(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    if (record.id !== goalId) {
      throw new LongGoalIntegrityError('Long Goal record id does not match its path')
    }
    return record
  } catch (error) {
    if (error instanceof LongGoalIntegrityError) throw error
    throw new LongGoalIntegrityError('Long Goal record is invalid', { cause: error })
  }
}

export function listLongGoals(stateRoot: string): readonly AnyLongGoalRecord[] {
  if (!isNonEmptyString(stateRoot)) throw new TypeError('Long Goal location is invalid')
  const directory = longGoalsDirectory(stateRoot)
  if (!existsSync(directory)) return []
  const records = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      const path = join(directory, entry.name)
      try {
        const record = parseAnyLongGoal(JSON.parse(readFileSync(path, 'utf8')) as unknown)
        if (entry.name !== `${record.id}.json`) {
          throw new LongGoalIntegrityError('Long Goal record id does not match its path')
        }
        return record
      } catch (error) {
        if (error instanceof LongGoalIntegrityError) throw error
        throw new LongGoalIntegrityError('Long Goal record is invalid', { cause: error })
      }
    })
  return records.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
}

export function bindLongGoalTask(
  stateRoot: string,
  longGoalId: string,
  taskId: string,
  execution: TaskExecutionBinding,
  dependencies: { readonly now?: () => number } = {},
): LongGoalRecord {
  if (!isNonEmptyString(taskId)) throw new TypeError('Long Goal Task id is invalid')
  const validExecution = parseExecution(execution)
  if (validExecution === null) throw new TypeError('Long Goal Task execution binding is invalid')
  const record = readLongGoal(stateRoot, longGoalId)
  if (record.schemaVersion !== 'tianwen.long-goal.v1') {
    throw new LongGoalIntegrityError('Long Goal Task binding requires a v1 record')
  }
  const taskIndex = record.tasks.findIndex(task => task.id === taskId)
  if (taskIndex === -1) throw new LongGoalIntegrityError('Long Goal Task does not exist')
  if (record.tasks[taskIndex]!.execution !== null) {
    throw new LongGoalIntegrityError('Long Goal Task is already bound')
  }
  const firstUnboundTaskIndex = record.tasks.findIndex(task => task.execution === null)
  if (taskIndex !== firstUnboundTaskIndex) {
    throw new LongGoalIntegrityError('Long Goal Task binding must follow Task order')
  }
  if (record.tasks.some(task =>
    task.execution?.goalId === validExecution.goalId ||
    task.execution?.sessionId === validExecution.sessionId,
  )) {
    throw new LongGoalIntegrityError('Long Goal Task binding must use unique Goal and Session ids')
  }
  const now = (dependencies.now ?? Date.now)()
  if (!isTimestamp(now) || now < record.updatedAt) {
    throw new TypeError('Long Goal clock is invalid')
  }
  const updated: LongGoalRecord = {
    ...record,
    updatedAt: now,
    tasks: record.tasks.map((task, index) => index === taskIndex
      ? { ...task, execution: validExecution }
      : task),
  }
  replaceRecordAtomically(recordPath(stateRoot, longGoalId), updated)
  return updated
}

function readLongGoalV2(stateRoot: string, longGoalId: string): LongGoalRecordV2 {
  const record = readLongGoal(stateRoot, longGoalId)
  if (record.schemaVersion !== 'tianwen.long-goal.v2') {
    throw new LongGoalIntegrityError('Goal-first mutation requires a v2 record')
  }
  return record
}

function readGoalFirstLongGoal(stateRoot: string, longGoalId: string): GoalFirstLongGoalRecord {
  const record = readLongGoal(stateRoot, longGoalId)
  if (record.schemaVersion !== 'tianwen.long-goal.v2' && record.schemaVersion !== 'tianwen.long-goal.v3') {
    throw new LongGoalIntegrityError('Goal-first mutation requires a v2 or v3 record')
  }
  return record
}

function readContinuousLongGoal(stateRoot: string, longGoalId: string): LongGoalRecordV3 {
  const record = readLongGoal(stateRoot, longGoalId)
  if (record.schemaVersion !== 'tianwen.long-goal.v3') {
    throw new LongGoalIntegrityError('Continuous Goal mutation requires a v3 record')
  }
  return record
}

function assertExpectedRevision(record: GoalFirstLongGoalRecord, expectedRevision: number): void {
  if (!isPositiveInteger(expectedRevision)) throw new TypeError('Long Goal expected revision is invalid')
  if (record.revision !== expectedRevision) {
    throw new LongGoalRevisionConflictError(expectedRevision, record.revision)
  }
}

function nextV2UpdatedAt(record: GoalFirstLongGoalRecord, now: number): number {
  return nowAtLeast(record.updatedAt, now)
}

export function createGoalFirstLongGoal(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
}, dependencies: {
  readonly goalSuffix?: () => string
  readonly plannerSessionId?: () => string
  readonly now?: () => number
} = {}): LongGoalRecordV2 {
  if (
    !isNonEmptyString(input.stateRoot) || !isNonEmptyString(input.objective) ||
    (input.context !== null && !isNonEmptyString(input.context)) ||
    (input.successCriteria !== null && !isNonEmptyString(input.successCriteria)) ||
    !isCanonicalWorkspaceRoot(input.workspaceRoot) || !isNonEmptyString(input.agentPreset)
  ) {
    throw new TypeError('Goal-first Long Goal input is invalid')
  }
  const id = `tianwen-long-goal-${(dependencies.goalSuffix ?? randomUUID)()}`
  const sessionId = (dependencies.plannerSessionId ?? randomUUID)()
  const now = (dependencies.now ?? Date.now)()
  if (!isLongGoalId(id) || !isNonEmptyString(sessionId) || !isTimestamp(now)) {
    throw new TypeError('Goal-first Long Goal input is invalid')
  }
  const record: LongGoalRecordV2 = {
    schemaVersion: 'tianwen.long-goal.v2',
    id,
    revision: 1,
    objective: input.objective,
    context: input.context,
    successCriteria: input.successCriteria,
    workspaceRoot: input.workspaceRoot,
    maxTaskRounds: 3,
    planner: {
      sessionId,
      agentPreset: input.agentPreset,
      planRevision: 0,
      phase: 'unplanned',
      consideredSettledTasks: 0,
    },
    guidance: [],
    createdAt: now,
    updatedAt: now,
    tasks: [],
  }
  writeRecordExclusive(recordPath(input.stateRoot, id), record)
  return record
}

export function createContinuousLongGoal(input: {
  readonly stateRoot: string
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
  readonly controlSessionId: string
}, dependencies: {
  readonly goalSuffix?: () => string
  readonly plannerSessionId?: () => string
  readonly now?: () => number
} = {}): LongGoalRecordV3 {
  if (
    !isNonEmptyString(input.stateRoot) || !isNonEmptyString(input.objective) ||
    (input.context !== null && !isNonEmptyString(input.context)) ||
    (input.successCriteria !== null && !isNonEmptyString(input.successCriteria)) ||
    !isCanonicalWorkspaceRoot(input.workspaceRoot) || !isNonEmptyString(input.agentPreset) ||
    !isNonEmptyString(input.controlSessionId)
  ) {
    throw new TypeError('Continuous Long Goal input is invalid')
  }
  const id = `tianwen-long-goal-${(dependencies.goalSuffix ?? randomUUID)()}`
  const plannerSessionId = (dependencies.plannerSessionId ?? randomUUID)()
  const now = (dependencies.now ?? Date.now)()
  if (!isLongGoalId(id) || !isNonEmptyString(plannerSessionId) || !isTimestamp(now)) {
    throw new TypeError('Continuous Long Goal input is invalid')
  }
  if (plannerSessionId === input.controlSessionId) {
    throw new TypeError('Continuous Goal Planner Session must differ from control Session')
  }
  const record: LongGoalRecordV3 = {
    schemaVersion: 'tianwen.long-goal.v3',
    id,
    revision: 1,
    objective: input.objective,
    context: input.context,
    successCriteria: input.successCriteria,
    workspaceRoot: input.workspaceRoot,
    maxTaskRounds: 3,
    planner: {
      sessionId: plannerSessionId,
      agentPreset: input.agentPreset,
      planRevision: 0,
      phase: 'unplanned',
      consideredSettledTasks: 0,
    },
    guidance: [],
    control: { sessionId: input.controlSessionId, autoProgress: 'running' },
    createdAt: now,
    updatedAt: now,
    tasks: [],
  }
  writeRecordExclusive(recordPath(input.stateRoot, id), record)
  return record
}

export function findContinuousGoalByControlSession(input: {
  readonly stateRoot: string
  readonly controlSessionId: string
}): LongGoalRecordV3 | null {
  if (!isNonEmptyString(input.controlSessionId)) {
    throw new TypeError('Continuous Goal control Session is invalid')
  }
  const matches = listLongGoals(input.stateRoot).filter((record): record is LongGoalRecordV3 =>
    record.schemaVersion === 'tianwen.long-goal.v3' &&
    record.control.sessionId === input.controlSessionId &&
    record.planner.phase !== 'complete',
  )
  if (matches.length > 1) {
    throw new LongGoalIntegrityError('Continuous Goal control Session binding is ambiguous')
  }
  return matches[0] ?? null
}

export function appendLongGoalGuidance(
  stateRoot: string,
  longGoalId: string,
  expectedRevision: number,
  text: string,
): LongGoalRecordV2 {
  if (!isNonEmptyString(text)) throw new TypeError('Long Goal guidance is invalid')
  const record = readLongGoalV2(stateRoot, longGoalId)
  assertExpectedRevision(record, expectedRevision)
  const updated: LongGoalRecordV2 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    planner: { ...record.planner, phase: 'needs-replan' },
    guidance: [...record.guidance, text],
  }
  replaceRecordAtomically(recordPath(stateRoot, longGoalId), updated)
  return updated
}

export function appendContinuousGoalGuidance(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly text: string
}): LongGoalRecordV3 {
  if (!isNonEmptyString(input.text)) throw new TypeError('Continuous Goal guidance is invalid')
  const record = readContinuousLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const updated: LongGoalRecordV3 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    planner: { ...record.planner, phase: 'needs-replan' },
    guidance: [...record.guidance, input.text],
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export function redirectContinuousGoal(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly text: string
}): LongGoalRecordV3 {
  if (!isNonEmptyString(input.text)) throw new TypeError('Continuous Goal guidance is invalid')
  const record = readContinuousLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const updated: LongGoalRecordV3 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    planner: { ...record.planner, phase: 'needs-replan' },
    guidance: [...record.guidance, input.text],
    control: { ...record.control, autoProgress: 'paused' },
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export function setContinuousGoalMode(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly mode: 'running' | 'paused'
}): LongGoalRecordV3 {
  if (input.mode !== 'running' && input.mode !== 'paused') {
    throw new TypeError('Continuous Goal mode is invalid')
  }
  const record = readContinuousLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  if (record.control.autoProgress === input.mode) return record
  const updated: LongGoalRecordV3 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    control: { ...record.control, autoProgress: input.mode },
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export function readTianwenTaskAttemptProjection(
  record: LongGoalRecordV3,
  taskId: string,
): TianwenTaskAttemptProjection {
  return tianwenTaskAttemptProjection(record.tasks, record.tianwenEvents, taskId)
}

type TianwenAttemptEventInput = {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
}

function appendTianwenEvent(input: TianwenAttemptEventInput, event: TianwenLongGoalEvent): LongGoalRecordV3 {
  const record = readContinuousLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const updated = parseLongGoalV3({
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    tianwenEvents: [...(record.tianwenEvents ?? []), event],
  })
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export function appendTianwenAttemptStarted(input: TianwenAttemptEventInput & {
  readonly epoch: number
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly permissionFingerprint: `sha256:${string}`
  readonly startedAt: string
}): LongGoalRecordV3 {
  return appendTianwenEvent(input, {
    type: 'attempt-started',
    taskId: input.taskId,
    attempt: {
      epoch: input.epoch,
      parentSessionId: input.parentSessionId,
      childSessionId: input.childSessionId,
      permissionFingerprint: input.permissionFingerprint,
      status: 'running',
      startedAt: input.startedAt,
    },
  })
}

export function appendTianwenAttemptPermissionLimited(input: TianwenAttemptEventInput & {
  readonly epoch: number
  readonly terminalEventId: string
}): LongGoalRecordV3 {
  return appendTianwenEvent(input, {
    type: 'attempt-permission-limited',
    taskId: input.taskId,
    epoch: input.epoch,
    terminalEventId: input.terminalEventId,
  })
}

export function appendTianwenAttemptSettled(input: TianwenAttemptEventInput & {
  readonly epoch: number
  readonly terminalEventId: string
}): LongGoalRecordV3 {
  return appendTianwenEvent(input, {
    type: 'attempt-settled',
    taskId: input.taskId,
    epoch: input.epoch,
    terminalEventId: input.terminalEventId,
  })
}

export function appendTianwenAttemptProvisioningFailed(input: TianwenAttemptEventInput & {
  readonly epoch: number
  readonly terminalEventId: string
}): LongGoalRecordV3 {
  return appendTianwenEvent(input, {
    type: 'attempt-provisioning-failed',
    taskId: input.taskId,
    epoch: input.epoch,
    terminalEventId: input.terminalEventId,
  })
}

export function appendTianwenTerminalDeliveryObserved(input: TianwenAttemptEventInput & TianwenTerminalDeliveryCursor): LongGoalRecordV3 {
  return appendTianwenEvent(input, {
    type: 'terminal-delivery-observed',
    taskId: input.taskId,
    delivery: {
      terminalEventId: input.terminalEventId,
      parentSessionId: input.parentSessionId,
      completionTurnObserved: input.completionTurnObserved,
    },
  })
}

export function commitLongGoalPlan(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly outcome: 'continue' | 'complete'
  readonly tasks: readonly { readonly objective: string }[]
  readonly consideredSettledTasks: number
}, dependencies: {
  readonly taskId?: () => string
  readonly now?: () => number
} = {}): GoalFirstLongGoalRecord {
  if (
    (input.outcome !== 'continue' && input.outcome !== 'complete') ||
    !Array.isArray(input.tasks) ||
    !isNonNegativeInteger(input.consideredSettledTasks) ||
    (input.outcome === 'continue' && (input.tasks.length < 1 || input.tasks.length > 5)) ||
    (input.outcome === 'complete' && input.tasks.length !== 0) ||
    input.tasks.some(task => !isRecord(task) || !hasExactKeys(task, ['objective']) || !isNonEmptyString(task.objective))
  ) {
    throw new TypeError('Long Goal plan is invalid')
  }
  const record = readGoalFirstLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const boundCount = record.tasks.findIndex(task => task.execution === null)
  const bound = boundCount === -1 ? record.tasks : record.tasks.slice(0, boundCount)
  const existingIds = new Set(record.tasks.map(task => task.id))
  const taskId = dependencies.taskId ?? randomUUID
  const replacement = input.tasks.map(task => {
    const id = taskId()
    if (!UUID.test(id) || existingIds.has(id)) throw new TypeError('Long Goal Task id is invalid')
    existingIds.add(id)
    return { id, objective: task.objective, execution: null, resolution: null } satisfies LongGoalTaskRecordV2
  })
  const now = nextV2UpdatedAt(record, (dependencies.now ?? Date.now)())
  const updated: GoalFirstLongGoalRecord = {
    ...record,
    revision: record.revision + 1,
    updatedAt: now,
    planner: {
      ...record.planner,
      planRevision: record.planner.planRevision + 1,
      phase: input.outcome === 'complete' ? 'complete' : 'ready',
      consideredSettledTasks: input.consideredSettledTasks,
    },
    tasks: [...bound, ...replacement],
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export function bindGoalFirstLongGoalTask(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
  readonly execution: TaskExecutionBinding
}): GoalFirstLongGoalRecord {
  if (!isNonEmptyString(input.taskId)) throw new TypeError('Long Goal Task id is invalid')
  const execution = parseExecution(input.execution)
  if (execution === null) throw new TypeError('Long Goal Task execution binding is invalid')
  const record = readGoalFirstLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  if (execution.sessionId === record.planner.sessionId) {
    throw new LongGoalIntegrityError('Long Goal Task execution Session must differ from planner Session')
  }
  if (record.schemaVersion === 'tianwen.long-goal.v3' && execution.sessionId === record.control.sessionId) {
    throw new LongGoalIntegrityError('Continuous Goal Task execution Session must differ from control Session')
  }
  const taskIndex = record.tasks.findIndex(task => task.id === input.taskId)
  if (taskIndex === -1 || record.tasks[taskIndex]!.execution !== null) {
    throw new LongGoalIntegrityError('Long Goal Task is not ready to bind')
  }
  if (record.tasks.findIndex(task => task.execution === null) !== taskIndex) {
    throw new LongGoalIntegrityError('Long Goal Task binding must follow Task order')
  }
  if (record.tasks.some(task =>
    task.execution?.goalId === execution.goalId || task.execution?.sessionId === execution.sessionId,
  )) {
    throw new LongGoalIntegrityError('Long Goal Task binding must use unique Goal and Session ids')
  }
  const updated: GoalFirstLongGoalRecord = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    tasks: record.tasks.map((task, index) => index === taskIndex ? { ...task, execution } : task),
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export async function abandonBlockedLongGoalTask(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
  readonly dshStatusTarget: StatusTarget
}): Promise<LongGoalRecordV2> {
  const status = await readLongGoalStatus({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: input.dshStatusTarget,
  })
  if (
    status.schemaVersion !== 'tianwen.long-goal-status.v2' ||
    status.currentTaskId !== input.taskId ||
    status.tasks.find(task => task.id === input.taskId)?.phase !== 'blocked'
  ) {
    throw new LongGoalIntegrityError('Long Goal Task is not a current blocked Task')
  }
  const record = readLongGoalV2(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const taskIndex = record.tasks.findIndex(task => task.id === input.taskId)
  const task = taskIndex === -1 ? undefined : record.tasks[taskIndex]
  if (task === undefined || task.execution === null || task.resolution !== null) {
    throw new LongGoalIntegrityError('Long Goal Task is not a current blocked Task')
  }
  const projectedTask = status.tasks.find(candidate => candidate.id === input.taskId)
  if (
    projectedTask === undefined ||
    projectedTask.execution?.goalId !== task.execution.goalId ||
    projectedTask.execution.sessionId !== task.execution.sessionId
  ) {
    throw new LongGoalIntegrityError('Long Goal Task is not a current blocked Task')
  }
  const updated: LongGoalRecordV2 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    planner: { ...record.planner, phase: 'needs-replan' },
    tasks: record.tasks.map((candidate, index) => index === taskIndex
      ? { ...candidate, resolution: 'abandoned' }
      : candidate),
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

export async function abandonContinuousGoalTask(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly taskId: string
  readonly dshStatusTarget: StatusTarget
}): Promise<LongGoalRecordV3> {
  const record = readContinuousLongGoal(input.stateRoot, input.longGoalId)
  assertExpectedRevision(record, input.expectedRevision)
  const taskIndex = record.tasks.findIndex(task => task.id === input.taskId)
  const task = taskIndex === -1 ? undefined : record.tasks[taskIndex]
  if (task === undefined || task.execution === null || task.resolution !== null) {
    throw new LongGoalIntegrityError('Continuous Goal Task is not a current paused Task')
  }
  const status = await readLongGoalStatus({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: input.dshStatusTarget,
  })
  if (
    status.schemaVersion !== 'tianwen.long-goal-status.v3' ||
    status.currentTaskId !== input.taskId ||
    status.tasks.find(candidate => candidate.id === input.taskId)?.phase !== 'paused'
  ) {
    throw new LongGoalIntegrityError('Continuous Goal Task is not a current paused Task')
  }
  const projectedTask = status.tasks.find(candidate => candidate.id === input.taskId)
  if (
    projectedTask === undefined ||
    projectedTask.execution?.goalId !== task.execution.goalId ||
    projectedTask.execution.sessionId !== task.execution.sessionId
  ) {
    throw new LongGoalIntegrityError('Continuous Goal Task is not a current paused Task')
  }
  const updated: LongGoalRecordV3 = {
    ...record,
    revision: record.revision + 1,
    updatedAt: nextV2UpdatedAt(record, Date.now()),
    planner: { ...record.planner, phase: 'needs-replan' },
    tasks: record.tasks.map((candidate, index) => index === taskIndex
      ? { ...candidate, resolution: 'abandoned' }
      : candidate),
  }
  replaceRecordAtomically(recordPath(input.stateRoot, input.longGoalId), updated)
  return updated
}

async function projectTask(
  task: LongGoalTaskRecord,
  target: StatusTarget,
): Promise<LongGoalStatusProjection['tasks'][number]> {
  if (task.execution === null) {
    return { id: task.id, objective: task.objective, phase: 'pending', execution: null }
  }
  const status = await readGoalStatus(
    'dataDir' in target
      ? { goalId: task.execution.goalId, dataDir: target.dataDir }
      : {
          goalId: task.execution.goalId,
          sessionsRoot: target.sessionsRoot,
          evolutionRoot: target.evolutionRoot,
        },
  )
  if (status.session.id !== task.execution.sessionId) {
    throw new LongGoalIntegrityError('Long Goal Task binding Session does not match DSH status')
  }
  if (status.goal.phase === 'blocked') {
    if (status.goal.blockedReason === undefined) {
      throw new LongGoalIntegrityError('Blocked DSH Goal has no blocked reason')
    }
    return {
      id: task.id,
      objective: task.objective,
      phase: 'blocked',
      execution: task.execution,
      blockedReason: status.goal.blockedReason,
    }
  }
  return {
    id: task.id,
    objective: task.objective,
    phase: status.goal.phase,
    execution: task.execution,
  }
}

async function projectV2Task(
  task: LongGoalTaskRecordV2,
  target: StatusTarget,
): Promise<LongGoalStatusProjectionV2['tasks'][number]> {
  if (task.resolution === 'abandoned') {
    return {
      id: task.id,
      objective: task.objective,
      phase: 'abandoned',
      execution: task.execution,
      resolution: 'abandoned',
    }
  }
  if (task.execution === null) {
    return { id: task.id, objective: task.objective, phase: 'pending', execution: null, resolution: null }
  }
  const status = await readGoalStatus(
    'dataDir' in target
      ? { goalId: task.execution.goalId, dataDir: target.dataDir }
      : {
          goalId: task.execution.goalId,
          sessionsRoot: target.sessionsRoot,
          evolutionRoot: target.evolutionRoot,
        },
  )
  if (status.session.id !== task.execution.sessionId) {
    throw new LongGoalIntegrityError('Long Goal Task binding Session does not match DSH status')
  }
  if (status.goal.phase === 'blocked') {
    if (status.goal.blockedReason === undefined) {
      throw new LongGoalIntegrityError('Blocked DSH Goal has no blocked reason')
    }
    return {
      id: task.id,
      objective: task.objective,
      phase: 'blocked',
      execution: task.execution,
      resolution: null,
      blockedReason: status.goal.blockedReason,
    }
  }
  return {
    id: task.id,
    objective: task.objective,
    phase: status.goal.phase,
    execution: task.execution,
    resolution: null,
  }
}

export async function readLongGoalStatus(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly dshStatusTarget: StatusTarget
}): Promise<ReadLongGoalStatusProjection> {
  const record = readLongGoal(input.stateRoot, input.longGoalId)
  if (record.schemaVersion === 'tianwen.long-goal.v2' || record.schemaVersion === 'tianwen.long-goal.v3') {
    const tasks = await Promise.all(record.tasks.map(task => projectV2Task(task, input.dshStatusTarget)))
    const completedTasks = tasks.filter(task => task.phase === 'complete').length
    const abandonedTasks = tasks.filter(task => task.phase === 'abandoned').length
    const currentBound = tasks.find(task =>
      task.execution !== null && task.phase !== 'complete' && task.phase !== 'abandoned',
    )
    const currentBoundIndex = currentBound === undefined ? -1 : tasks.indexOf(currentBound)
    if (currentBound !== undefined && tasks.slice(currentBoundIndex + 1).some(task => task.execution !== null)) {
      throw new LongGoalIntegrityError('Long Goal has a bound Task after its current incomplete Task')
    }
    const readyUnbound = record.planner.phase === 'ready'
      ? tasks.find(task => task.execution === null)
      : undefined
    const currentTaskId = currentBound?.id ?? readyUnbound?.id ?? null
    const settledBoundTasks = completedTasks + abandonedTasks
    const phase = currentBound?.phase === 'blocked'
      ? 'blocked'
      : currentBound !== undefined || readyUnbound !== undefined
        ? 'active'
        : record.planner.phase === 'complete' &&
            tasks.every(task => task.execution !== null && (task.phase === 'complete' || task.phase === 'abandoned'))
          ? 'complete'
          : 'planning'
    const projection: Omit<LongGoalStatusProjectionV2, 'schemaVersion'> = {
      goal: {
        id: record.id,
        objective: record.objective,
        context: record.context,
        successCriteria: record.successCriteria,
        phase: record.planner.phase === 'ready' && settledBoundTasks > record.planner.consideredSettledTasks && currentBound === undefined
          ? 'planning'
          : phase,
        revision: record.revision,
        completedTasks,
        abandonedTasks,
        totalTasks: tasks.length,
      },
      planner: {
        sessionId: record.planner.sessionId,
        phase: record.planner.phase,
        planRevision: record.planner.planRevision,
      },
      guidance: record.guidance,
      tasks,
      currentTaskId,
      runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    }
    if (record.schemaVersion === 'tianwen.long-goal.v3') {
      return {
        schemaVersion: 'tianwen.long-goal-status.v3',
        ...projection,
        control: record.control,
      }
    }
    return { schemaVersion: 'tianwen.long-goal-status.v2', ...projection }
  }
  const tasks = await Promise.all(record.tasks.map(task => projectTask(task, input.dshStatusTarget)))
  const completedTasks = tasks.filter(task => task.phase === 'complete').length
  const currentTask = tasks.find(task => task.phase !== 'complete')
  const currentTaskIndex = currentTask === undefined ? -1 : tasks.indexOf(currentTask)
  if (currentTask !== undefined && tasks.slice(currentTaskIndex + 1).some(task => task.execution !== null)) {
    throw new LongGoalIntegrityError('Long Goal has a bound Task after its current incomplete Task')
  }
  const phase = currentTask === undefined
    ? 'complete'
    : currentTask.phase === 'blocked'
      ? 'blocked'
      : 'active'
  return {
    schemaVersion: 'tianwen.long-goal-status.v1',
    goal: {
      id: record.id,
      objective: record.objective,
      phase,
      completedTasks,
      totalTasks: tasks.length,
    },
    tasks,
    currentTaskId: currentTask?.id ?? null,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
  }
}

export function formatLongGoalStatusText(status: ReadLongGoalStatusProjection): string {
  const lines = [
    `Goal ${status.goal.id}: ${status.goal.completedTasks}/${status.goal.totalTasks} ${status.goal.phase}`,
  ]
  for (const task of status.tasks) {
    const current = task.id === status.currentTaskId ? ' (current)' : ''
    const blocked = task.blockedReason === undefined
      ? ''
      : ` (${task.blockedReason.code}: ${task.blockedReason.message})`
    lines.push(`${task.id}: ${task.phase}${current} — ${task.objective}${blocked}`)
  }
  return lines.join('\n')
}
