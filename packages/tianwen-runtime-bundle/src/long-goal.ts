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
import { join, resolve } from 'node:path'

import { readGoalStatus } from './status.js'
import type {
  LongGoalRecord,
  LongGoalStatusProjection,
  LongGoalTaskRecord,
  TaskExecutionBinding,
} from './long-goal-contract.js'

export type {
  LongGoalRecord,
  LongGoalStatusProjection,
  LongGoalTaskRecord,
  TaskExecutionBinding,
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

type StatusTarget = {
  readonly dataDir: string
} | {
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

const LONG_GOAL_ID = /^tianwen-long-goal-[A-Za-z0-9][A-Za-z0-9-]*$/

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

function writeRecordExclusive(path: string, record: LongGoalRecord): void {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' })
}

function replaceRecordAtomically(path: string, record: LongGoalRecord): void {
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

export function readLongGoal(stateRoot: string, goalId: string): LongGoalRecord {
  if (!isNonEmptyString(stateRoot)) {
    throw new TypeError('Long Goal location is invalid')
  }
  if (!isLongGoalId(goalId)) throw new TypeError('Long Goal id is invalid')
  const path = recordPath(stateRoot, goalId)
  if (!existsSync(path)) throw new LongGoalNotFoundError(goalId)
  try {
    const record = parseLongGoal(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    if (record.id !== goalId) {
      throw new LongGoalIntegrityError('Long Goal record id does not match its path')
    }
    return record
  } catch (error) {
    if (error instanceof LongGoalIntegrityError) throw error
    throw new LongGoalIntegrityError('Long Goal record is invalid', { cause: error })
  }
}

export function listLongGoals(stateRoot: string): readonly LongGoalRecord[] {
  if (!isNonEmptyString(stateRoot)) throw new TypeError('Long Goal location is invalid')
  const directory = longGoalsDirectory(stateRoot)
  if (!existsSync(directory)) return []
  const records = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      const path = join(directory, entry.name)
      try {
        const record = parseLongGoal(JSON.parse(readFileSync(path, 'utf8')) as unknown)
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

export async function readLongGoalStatus(input: {
  readonly stateRoot: string
  readonly longGoalId: string
  readonly dshStatusTarget: StatusTarget
}): Promise<LongGoalStatusProjection> {
  const record = readLongGoal(input.stateRoot, input.longGoalId)
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

export function formatLongGoalStatusText(status: LongGoalStatusProjection): string {
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
