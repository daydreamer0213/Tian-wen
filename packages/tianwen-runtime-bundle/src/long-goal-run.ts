import { resolve } from 'node:path'

import {
  captureGoalCreate,
  preflightGoalCreate,
  preflightPortableGoalCreate,
} from './create.js'
import type {
  GoalCreatePreflight,
  PortableGoalCreatePreflight,
} from './create.js'
import {
  bindLongGoalTask,
  formatLongGoalStatusText,
  LongGoalIntegrityError,
  readLongGoal,
  readLongGoalStatus,
} from './long-goal.js'
import type { LongGoalRecord, LongGoalStatusProjection } from './long-goal.js'
import type { ResolvedPortableProfileTarget } from './portable-profile.js'
import {
  launchGoalResume,
  preflightGoalResume,
  preflightPortableGoalResume,
} from './resume.js'
import type { PortableResumePreflight, ResumePreflight } from './resume.js'

export type LongGoalProductTarget =
  | { readonly kind: 'managed', readonly dataDir: string }
  | { readonly kind: 'portable', readonly target: ResolvedPortableProfileTarget }

export interface LongGoalRunDependencies {
  readonly readLongGoal?: (stateRoot: string, goalId: string) => LongGoalRecord
  readonly readLongGoalStatus?: typeof readLongGoalStatus
  readonly bindLongGoalTask?: typeof bindLongGoalTask
  readonly preflightGoalCreate?: typeof preflightGoalCreate
  readonly preflightPortableGoalCreate?: typeof preflightPortableGoalCreate
  readonly captureGoalCreate?: typeof captureGoalCreate
  readonly preflightGoalResume?: (
    goalId: string,
    dataDir: string,
  ) => Promise<ResumePreflight>
  readonly preflightPortableGoalResume?: typeof preflightPortableGoalResume
  readonly launchGoalResume?: typeof launchGoalResume
}

function writeProjection(status: LongGoalStatusProjection, json: boolean): void {
  process.stdout.write(json
    ? `${JSON.stringify(status)}\n`
    : `${formatLongGoalStatusText(status)}\n`)
}

export async function runLongGoalTask(input: {
  readonly longGoalId: string
  readonly productTarget: LongGoalProductTarget
  readonly json: boolean
}, dependencies: LongGoalRunDependencies = {}): Promise<number> {
  const readStatus = dependencies.readLongGoalStatus ?? readLongGoalStatus
  const readRecord = dependencies.readLongGoal ?? readLongGoal
  const bindTask = dependencies.bindLongGoalTask ?? bindLongGoalTask
  const managed = input.productTarget.kind === 'managed'
  const stateRoot = managed
    ? resolve(input.productTarget.dataDir, 'state')
    : input.productTarget.target.stateRoot
  const status = await readStatus({
    stateRoot,
    longGoalId: input.longGoalId,
    dshStatusTarget: managed
      ? { dataDir: input.productTarget.dataDir }
      : {
          sessionsRoot: input.productTarget.target.sessionsRoot,
          evolutionRoot: input.productTarget.target.evolutionRoot,
        },
  })
  if (status.currentTaskId === null) {
    writeProjection(status, input.json)
    return 0
  }

  const projectedTask = status.tasks.find(task => task.id === status.currentTaskId)
  if (projectedTask === undefined) {
    throw new LongGoalIntegrityError('Long Goal current Task is missing')
  }
  const record = readRecord(stateRoot, input.longGoalId)
  const task = record.tasks.find(candidate => candidate.id === projectedTask.id)
  if (task === undefined) throw new LongGoalIntegrityError('Long Goal current Task is missing')

  let execution = task.execution
  if (execution === null) {
    const createPreflight: GoalCreatePreflight | PortableGoalCreatePreflight = managed
      ? (dependencies.preflightGoalCreate ?? preflightGoalCreate)(
          task.objective,
          record.maxTaskRounds,
          input.productTarget.dataDir,
        )
      : (dependencies.preflightPortableGoalCreate ?? preflightPortableGoalCreate)(
          task.objective,
          record.maxTaskRounds,
          input.productTarget.target,
        )
    const receipt = await (dependencies.captureGoalCreate ?? captureGoalCreate)(createPreflight)
    execution = { goalId: receipt.goal.id, sessionId: receipt.session.id }
    try {
      bindTask(stateRoot, record.id, task.id, execution)
    } catch (error) {
      throw new Error(
        `Created Goal ${execution.goalId} in Session ${execution.sessionId}, but could not bind Task`,
        { cause: error },
      )
    }
  }

  const resumePreflight: ResumePreflight | PortableResumePreflight = managed
    ? await (dependencies.preflightGoalResume ?? preflightGoalResume)(
        execution.goalId,
        input.productTarget.dataDir,
      )
    : await (dependencies.preflightPortableGoalResume ?? preflightPortableGoalResume)(
        execution.goalId,
        input.productTarget.target,
      )
  if (resumePreflight.sessionId !== execution.sessionId) {
    throw new LongGoalIntegrityError(
      'Long Goal Task binding Session does not match resume preflight',
    )
  }
  return await (dependencies.launchGoalResume ?? launchGoalResume)(resumePreflight, input.json)
}
