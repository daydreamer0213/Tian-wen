import {
  abandonBlockedLongGoalTask,
  appendLongGoalGuidance,
  createGoalFirstLongGoal,
  LongGoalIntegrityError,
  LongGoalRevisionConflictError,
  readLongGoal,
  readLongGoalStatus,
} from './long-goal.js'
import type {
  GoalFirstLongGoalRecord,
  GoalFirstLongGoalStatusProjection,
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
  LongGoalRecordV2,
  LongGoalStatusProjectionV2,
} from './long-goal-contract.js'

export type GoalFirstProgressResult = Omit<GoalFirstProgressResultV2, 'status'> & {
  readonly status: GoalFirstLongGoalStatusProjection
}

export type {
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
} from './long-goal-contract.js'

export interface GoalFirstServiceDependencies {
  readonly createRecord: typeof createGoalFirstLongGoal
  readonly readRecord: typeof readLongGoal
  readonly readStatus: typeof readLongGoalStatus
  readonly appendGuidance: typeof appendLongGoalGuidance
  readonly abandonBlockedTask: typeof abandonBlockedLongGoalTask
  readonly runPlannerTurn: (input: {
    readonly record: GoalFirstLongGoalRecord
    readonly reason: 'create' | 'continue' | 'guidance'
  }) => Promise<'submitted' | 'not-submitted'>
  readonly runTask: (input: {
    readonly stateRoot: string
    readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
    readonly longGoalId: string
    readonly expectedRevision: number
  }) => Promise<{
    readonly action: 'started' | 'continued' | 'already-running'
    readonly sessionId: string
  }>
}

type ExistingInput = {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
}

function requireGoalFirstRecord(
  record: ReturnType<typeof readLongGoal>,
  expectedRevision?: number,
): GoalFirstLongGoalRecord {
  if (record.schemaVersion !== 'tianwen.long-goal.v2' && record.schemaVersion !== 'tianwen.long-goal.v3') {
    throw new LongGoalIntegrityError('Goal-first service requires a v2 or v3 record')
  }
  if (expectedRevision !== undefined && record.revision !== expectedRevision) {
    throw new LongGoalRevisionConflictError(expectedRevision, record.revision)
  }
  return record
}

function requireGoalFirstStatus(
  status: Awaited<ReturnType<typeof readLongGoalStatus>>,
): GoalFirstLongGoalStatusProjection {
  if (status.schemaVersion !== 'tianwen.long-goal-status.v2' && status.schemaVersion !== 'tianwen.long-goal-status.v3') {
    throw new LongGoalIntegrityError('Goal-first service requires a v2 or v3 status')
  }
  return status
}

function requireV2Record(record: GoalFirstLongGoalRecord): LongGoalRecordV2 {
  if (record.schemaVersion !== 'tianwen.long-goal.v2') {
    throw new LongGoalIntegrityError('Goal-first operation requires a v2 record')
  }
  return record
}

function requireV2Status(status: GoalFirstLongGoalStatusProjection): LongGoalStatusProjectionV2 {
  if (status.schemaVersion !== 'tianwen.long-goal-status.v2') {
    throw new LongGoalIntegrityError('Goal-first operation requires a v2 status')
  }
  return status
}

async function readStatus(input: Pick<ExistingInput, 'stateRoot' | 'dshStatusTarget' | 'longGoalId'>, dependencies: GoalFirstServiceDependencies): Promise<GoalFirstLongGoalStatusProjection> {
  return requireGoalFirstStatus(await dependencies.readStatus({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: input.dshStatusTarget,
  }))
}

function sessionId(status: GoalFirstLongGoalStatusProjection): string | null {
  return status.currentTaskId === null
    ? null
    : status.tasks.find(task => task.id === status.currentTaskId)?.execution?.sessionId ?? null
}

function result(
  action: GoalFirstProgressResultV2['action'],
  status: GoalFirstLongGoalStatusProjection,
  session: string | null,
): GoalFirstProgressResult {
  return {
    schemaVersion: 'tianwen.goal-first-progress-result.v2',
    action,
    status,
    sessionId: session,
  }
}

async function admitTask(
  input: ExistingInput,
  dependencies: GoalFirstServiceDependencies,
): Promise<GoalFirstProgressResult> {
  const admitted = await dependencies.runTask({
    stateRoot: input.stateRoot,
    dshStatusTarget: input.dshStatusTarget,
    longGoalId: input.longGoalId,
    expectedRevision: input.expectedRevision,
  })
  const status = await readStatus(input, dependencies)
  const currentSessionId = sessionId(status)
  if (currentSessionId === null) {
    throw new LongGoalIntegrityError('Goal-first Task admission did not leave a current bound Task')
  }
  return result(admitted.action, status, currentSessionId)
}

async function planThenProgress(
  input: ExistingInput,
  record: GoalFirstLongGoalRecord,
  reason: 'create' | 'continue',
  dependencies: GoalFirstServiceDependencies,
): Promise<GoalFirstProgressResult> {
  const planner = await dependencies.runPlannerTurn({ record, reason })
  const status = await readStatus(input, dependencies)
  if (planner === 'not-submitted' || status.goal.phase === 'planning') {
    return result('planning-pending', status, null)
  }
  if (status.goal.phase === 'blocked') return result('blocked', status, sessionId(status))
  if (status.goal.phase === 'complete') return result('complete', status, null)
  return admitTask({ ...input, expectedRevision: status.goal.revision }, dependencies)
}

export async function createGoalFirstProgress(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
}, dependencies: GoalFirstServiceDependencies): Promise<GoalFirstProgressResult> {
  const record = requireGoalFirstRecord(dependencies.createRecord({
    stateRoot: input.stateRoot,
    objective: input.objective,
    context: input.context,
    successCriteria: input.successCriteria,
    workspaceRoot: input.workspaceRoot,
    agentPreset: input.agentPreset,
  }))
  return planThenProgress({
    stateRoot: input.stateRoot,
    dshStatusTarget: input.dshStatusTarget,
    longGoalId: record.id,
    expectedRevision: record.revision,
  }, record, 'create', dependencies)
}

export async function continueGoalFirstProgress(
  input: ExistingInput,
  dependencies: GoalFirstServiceDependencies,
): Promise<GoalFirstProgressResult> {
  const record = requireGoalFirstRecord(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision)
  const status = await readStatus(input, dependencies)
  if (status.goal.phase === 'blocked') return result('blocked', status, sessionId(status))
  if (status.goal.phase === 'complete') return result('complete', status, null)

  const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
  if (current?.phase === 'active' || current?.phase === 'paused') return admitTask(input, dependencies)
  if (
    record.planner.phase === 'unplanned' ||
    record.planner.phase === 'needs-replan' ||
    status.goal.phase === 'planning'
  ) {
    return planThenProgress(input, record, 'continue', dependencies)
  }
  return admitTask(input, dependencies)
}

export async function addGoalFirstGuidance(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
  readonly text: string
}, dependencies: GoalFirstServiceDependencies): Promise<LongGoalGuidanceResultV2> {
  requireV2Record(requireGoalFirstRecord(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision))
  const record = dependencies.appendGuidance(input.stateRoot, input.longGoalId, input.expectedRevision, input.text)
  const planner = await dependencies.runPlannerTurn({ record, reason: 'guidance' })
  return {
    schemaVersion: 'tianwen.long-goal-guidance-result.v2',
    planning: planner === 'submitted' ? 'updated' : 'pending',
    status: requireV2Status(await readStatus(input, dependencies)),
  }
}

export async function abandonGoalFirstTask(
  input: ExistingInput,
  dependencies: GoalFirstServiceDependencies,
): Promise<LongGoalAbandonResultV2> {
  requireV2Record(requireGoalFirstRecord(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision))
  const status = requireV2Status(await readStatus(input, dependencies))
  const current = status.currentTaskId === null ? undefined : status.tasks.find(task => task.id === status.currentTaskId)
  if (status.goal.phase !== 'blocked' || current?.phase !== 'blocked') {
    throw new LongGoalIntegrityError('Goal-first abandonment requires a current blocked Task')
  }
  await dependencies.abandonBlockedTask({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    expectedRevision: input.expectedRevision,
    taskId: current.id,
    dshStatusTarget: input.dshStatusTarget,
  })
  return {
    schemaVersion: 'tianwen.long-goal-abandon-result.v2',
    action: 'abandoned',
    status: requireV2Status(await readStatus(input, dependencies)),
  }
}
