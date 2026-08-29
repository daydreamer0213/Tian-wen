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
  GoalFirstProgressResultV2,
  LongGoalAbandonResultV2,
  LongGoalGuidanceResultV2,
  LongGoalRecordV2,
  LongGoalStatusProjectionV2,
} from './long-goal-contract.js'

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
    readonly record: LongGoalRecordV2
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

function requireV2Record(record: ReturnType<typeof readLongGoal>, expectedRevision?: number): LongGoalRecordV2 {
  if (record.schemaVersion !== 'tianwen.long-goal.v2') {
    throw new LongGoalIntegrityError('Goal-first service requires a v2 record')
  }
  if (expectedRevision !== undefined && record.revision !== expectedRevision) {
    throw new LongGoalRevisionConflictError(expectedRevision, record.revision)
  }
  return record
}

function requireV2Status(status: Awaited<ReturnType<typeof readLongGoalStatus>>): LongGoalStatusProjectionV2 {
  if (status.schemaVersion !== 'tianwen.long-goal-status.v2') {
    throw new LongGoalIntegrityError('Goal-first service requires a v2 status')
  }
  return status
}

async function readStatus(input: Pick<ExistingInput, 'stateRoot' | 'dshStatusTarget' | 'longGoalId'>, dependencies: GoalFirstServiceDependencies): Promise<LongGoalStatusProjectionV2> {
  return requireV2Status(await dependencies.readStatus({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: input.dshStatusTarget,
  }))
}

function sessionId(status: LongGoalStatusProjectionV2): string | null {
  return status.currentTaskId === null
    ? null
    : status.tasks.find(task => task.id === status.currentTaskId)?.execution?.sessionId ?? null
}

function result(
  action: GoalFirstProgressResultV2['action'],
  status: LongGoalStatusProjectionV2,
  session: string | null,
): GoalFirstProgressResultV2 {
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
): Promise<GoalFirstProgressResultV2> {
  const admitted = await dependencies.runTask({
    stateRoot: input.stateRoot,
    dshStatusTarget: input.dshStatusTarget,
    longGoalId: input.longGoalId,
    expectedRevision: input.expectedRevision,
  })
  return result(admitted.action, await readStatus(input, dependencies), admitted.sessionId)
}

async function planThenProgress(
  input: ExistingInput,
  record: LongGoalRecordV2,
  reason: 'create' | 'continue',
  dependencies: GoalFirstServiceDependencies,
): Promise<GoalFirstProgressResultV2> {
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
}, dependencies: GoalFirstServiceDependencies): Promise<GoalFirstProgressResultV2> {
  const record = requireV2Record(dependencies.createRecord({
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
): Promise<GoalFirstProgressResultV2> {
  const record = requireV2Record(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision)
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
  requireV2Record(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision)
  const record = dependencies.appendGuidance(input.stateRoot, input.longGoalId, input.expectedRevision, input.text)
  const planner = await dependencies.runPlannerTurn({ record, reason: 'guidance' })
  return {
    schemaVersion: 'tianwen.long-goal-guidance-result.v2',
    planning: planner === 'submitted' ? 'updated' : 'pending',
    status: await readStatus(input, dependencies),
  }
}

export async function abandonGoalFirstTask(
  input: ExistingInput,
  dependencies: GoalFirstServiceDependencies,
): Promise<LongGoalAbandonResultV2> {
  requireV2Record(dependencies.readRecord(input.stateRoot, input.longGoalId), input.expectedRevision)
  const status = await readStatus(input, dependencies)
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
    status: await readStatus(input, dependencies),
  }
}
