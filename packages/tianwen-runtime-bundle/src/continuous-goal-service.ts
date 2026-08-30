import {
  abandonContinuousGoalTask,
  appendContinuousGoalGuidance,
  createContinuousLongGoal,
  LongGoalIntegrityError,
  redirectContinuousGoal,
  setContinuousGoalMode,
} from './long-goal.js'
import type { LongGoalStatusProjectionV3, TaskExecutionBinding } from './long-goal-contract.js'
import {
  continueGoalFirstProgress,
  type GoalFirstServiceDependencies,
  type GoalFirstProgressResult,
} from './goal-first-service.js'

export type ContinuousGoalControlAction =
  | { readonly action: 'guide'; readonly text: string }
  | { readonly action: 'pause-and-replan'; readonly text: string; readonly resume: boolean }
  | { readonly action: 'pause' }
  | { readonly action: 'resume' }
  | { readonly action: 'status' }

export interface ContinuousGoalControlResult {
  readonly schemaVersion: 'tianwen.continuous-goal-control-result.v1'
  readonly action:
    | 'started' | 'planning-pending' | 'guided' | 'redirected'
    | 'paused' | 'resumed' | 'blocked' | 'complete' | 'status'
  readonly status: LongGoalStatusProjectionV3
  readonly sessionId: string | null
}

export interface ContinuousGoalServiceDependencies extends GoalFirstServiceDependencies {
  readonly createContinuousRecord: typeof createContinuousLongGoal
  readonly setMode: typeof setContinuousGoalMode
  readonly appendGuidanceOnly: typeof appendContinuousGoalGuidance
  readonly redirect: typeof redirectContinuousGoal
  readonly abandonRedirectedTask: typeof abandonContinuousGoalTask
  readonly cancelTaskAndReadStatus: (execution: TaskExecutionBinding) => Promise<'paused' | 'complete'>
}

type ExistingInput = {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<GoalFirstServiceDependencies['readStatus']>[0]['dshStatusTarget']
  readonly longGoalId: string
  readonly expectedRevision: number
}

function requireV3Status(status: Awaited<ReturnType<GoalFirstServiceDependencies['readStatus']>>): LongGoalStatusProjectionV3 {
  if (status.schemaVersion !== 'tianwen.long-goal-status.v3') {
    throw new LongGoalIntegrityError('Continuous Goal service requires a v3 status')
  }
  return status
}

async function readStatus(input: Pick<ExistingInput, 'stateRoot' | 'dshStatusTarget' | 'longGoalId'>, dependencies: ContinuousGoalServiceDependencies): Promise<LongGoalStatusProjectionV3> {
  return requireV3Status(await dependencies.readStatus({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: input.dshStatusTarget,
  }))
}

function sessionId(status: LongGoalStatusProjectionV3): string | null {
  return status.currentTaskId === null
    ? null
    : status.tasks.find(task => task.id === status.currentTaskId)?.execution?.sessionId ?? null
}

function result(
  action: ContinuousGoalControlResult['action'],
  status: LongGoalStatusProjectionV3,
): ContinuousGoalControlResult {
  return {
    schemaVersion: 'tianwen.continuous-goal-control-result.v1',
    action,
    status,
    sessionId: sessionId(status),
  }
}

function progressResult(
  progress: GoalFirstProgressResult,
  runningAction: 'started' | 'resumed',
): ContinuousGoalControlResult {
  const status = requireV3Status(progress.status)
  if (progress.action === 'planning-pending') return result('planning-pending', status)
  if (progress.action === 'blocked') return result('blocked', status)
  if (progress.action === 'complete') return result('complete', status)
  return result(runningAction, status)
}

async function cancelAndConfirmTask(
  execution: TaskExecutionBinding,
  dependencies: ContinuousGoalServiceDependencies,
): Promise<'paused' | 'complete'> {
  try {
    return await dependencies.cancelTaskAndReadStatus(execution)
  } catch (cause) {
    throw new LongGoalIntegrityError(
      'Continuous Goal active Task cancellation could not be confirmed',
      { cause },
    )
  }
}

export async function createContinuousGoalProgress(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: ExistingInput['dshStatusTarget']
  readonly objective: string
  readonly context: string | null
  readonly successCriteria: string | null
  readonly workspaceRoot: string
  readonly agentPreset: string
  readonly controlSessionId: string
}, dependencies: ContinuousGoalServiceDependencies): Promise<ContinuousGoalControlResult> {
  const record = dependencies.createContinuousRecord({
    stateRoot: input.stateRoot,
    objective: input.objective,
    context: input.context,
    successCriteria: input.successCriteria,
    workspaceRoot: input.workspaceRoot,
    agentPreset: input.agentPreset,
    controlSessionId: input.controlSessionId,
  })
  return progressResult(await continueGoalFirstProgress({
    stateRoot: input.stateRoot,
    dshStatusTarget: input.dshStatusTarget,
    longGoalId: record.id,
    expectedRevision: record.revision,
  }, dependencies), 'started')
}

export async function controlContinuousGoal(
  input: ExistingInput & { readonly action: ContinuousGoalControlAction },
  dependencies: ContinuousGoalServiceDependencies,
): Promise<ContinuousGoalControlResult> {
  if (input.action.action === 'status') return result('status', await readStatus(input, dependencies))

  if (input.action.action === 'guide') {
    dependencies.appendGuidanceOnly({
      stateRoot: input.stateRoot, longGoalId: input.longGoalId,
      expectedRevision: input.expectedRevision, text: input.action.text,
    })
    return result('guided', await readStatus(input, dependencies))
  }

  if (input.action.action === 'pause') {
    dependencies.setMode({
      stateRoot: input.stateRoot, longGoalId: input.longGoalId,
      expectedRevision: input.expectedRevision, mode: 'paused',
    })
    const beforeCancel = await readStatus(input, dependencies)
    const active = beforeCancel.currentTaskId === null ? undefined : beforeCancel.tasks.find(task => task.id === beforeCancel.currentTaskId)
    if (active?.phase === 'active') {
      if (active.execution === null) throw new LongGoalIntegrityError('Continuous Goal active Task has no Session')
      await cancelAndConfirmTask(active.execution, dependencies)
    }
    const status = await readStatus(input, dependencies)
    return result(status.goal.phase === 'complete' ? 'complete' : 'paused', status)
  }

  if (input.action.action === 'resume') {
    const record = dependencies.setMode({
      stateRoot: input.stateRoot, longGoalId: input.longGoalId,
      expectedRevision: input.expectedRevision, mode: 'running',
    })
    return progressResult(await continueGoalFirstProgress({ ...input, expectedRevision: record.revision }, dependencies), 'resumed')
  }

  const redirected = dependencies.redirect({
    stateRoot: input.stateRoot, longGoalId: input.longGoalId,
    expectedRevision: input.expectedRevision, text: input.action.text,
  })
  const beforeCancel = await readStatus(input, dependencies)
  const active = beforeCancel.currentTaskId === null ? undefined : beforeCancel.tasks.find(task => task.id === beforeCancel.currentTaskId)
  if (active === undefined || active.execution === null) {
    throw new LongGoalIntegrityError('Continuous Goal redirection requires a current Task')
  }
  const cancellation = await cancelAndConfirmTask(active.execution, dependencies)
  if (cancellation === 'complete') return result('complete', await readStatus(input, dependencies))
  const abandoned = await dependencies.abandonRedirectedTask({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    expectedRevision: redirected.revision,
    taskId: active.id,
    dshStatusTarget: input.dshStatusTarget,
  })
  if (!input.action.resume) {
    await dependencies.runPlannerTurn({ record: abandoned, reason: 'guidance' })
    return result('redirected', await readStatus(input, dependencies))
  }
  const resumed = dependencies.setMode({
    stateRoot: input.stateRoot,
    longGoalId: input.longGoalId,
    expectedRevision: abandoned.revision,
    mode: 'running',
  })
  return progressResult(await continueGoalFirstProgress({ ...input, expectedRevision: resumed.revision }, dependencies), 'resumed')
}
