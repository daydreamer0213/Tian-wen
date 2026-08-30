import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { foldGoal } from '@deepseek-ai/dsh-goal'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { projectEvidence } from '@tianwen/evidence/projector'
import {
  LedgerIntegrityError,
  inspectEvolutionLedger,
} from '@tianwen/evolution/inspection'

export type GoalStatusInput = {
  readonly goalId: string
  readonly dataDir: string
  readonly evolutionRoot?: never
  readonly sessionsRoot?: never
} | {
  readonly goalId: string
  readonly dataDir?: never
  readonly evolutionRoot: string
  readonly sessionsRoot: string
}

export type GoalListInput = {
  readonly dataDir: string
  readonly sessionsRoot?: never
} | {
  readonly dataDir?: never
  readonly sessionsRoot: string
}

export interface GoalStatusProjection {
  readonly schemaVersion: 'tianwen.goal-status.v1'
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly objective: string
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly blockedReason?: {
      readonly code: string
      readonly message: string
    }
    readonly maxGoalRounds: number
    readonly roundsStarted: number
    readonly createdAt: number
    readonly updatedAt: number
  }
  readonly session: {
    readonly id: string
    readonly eventCount: number
  }
  readonly evidence: {
    readonly total: number
    readonly counts: {
      readonly complete: number
      readonly 'missing-result': number
    }
    readonly items: readonly {
      readonly toolName: string
      readonly status: 'complete' | 'missing-result'
    }[]
  }
  readonly champion: {
    readonly artifactId: string
    readonly revision: number
  } | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export interface GoalListProjection {
  readonly schemaVersion: 'tianwen.goal-list.v1'
  readonly goals: readonly {
    readonly id: string
    readonly objective: string
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly maxGoalRounds: number
    readonly roundsStarted: number
    readonly updatedAt: number
    readonly session: {
      readonly id: string
      readonly eventCount: number
    }
  }[]
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export class GoalStatusNotFoundError extends Error {
  constructor(readonly goalId: string) {
    super(`Goal not found: ${goalId}`)
    this.name = 'GoalStatusNotFoundError'
  }
}

export class GoalStatusAmbiguousError extends Error {
  constructor(readonly goalId: string) {
    super(`Goal is present in more than one Session: ${goalId}`)
    this.name = 'GoalStatusAmbiguousError'
  }
}

export class GoalStatusIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'GoalStatusIntegrityError'
  }
}

export interface DurableGoalSnapshot {
  readonly inspection: Awaited<
    ReturnType<JsonlSessionPersistence['inspect']>
  >
  readonly folded: ReturnType<typeof foldGoal>
}

function sessionCompression(root: string): 'none' | 'zstd' {
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()!
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(join(directory, entry.name))
      else if (entry.isFile() && entry.name === 'session.jsonl.zstd') return 'zstd'
    }
  }
  return 'none'
}

export async function scanDurableGoals(
  sessionsRootInput: string,
): Promise<readonly DurableGoalSnapshot[]> {
  if (!isAbsolute(sessionsRootInput)) {
    throw new TypeError('sessionsRoot must be an absolute path')
  }
  const sessionsRoot = resolve(sessionsRootInput)
  if (!existsSync(sessionsRoot)) return []

  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    const persistence = new JsonlSessionPersistence(ctx, {
      root: sessionsRoot,
      compression: sessionCompression(sessionsRoot),
    })
    const headers = (await persistence.list())
      .toSorted((left, right) => String(left.id).localeCompare(String(right.id)))
    const snapshots: DurableGoalSnapshot[] = []
    for (const header of headers) {
      const inspection = await persistence.inspect(header.id)
      snapshots.push({ inspection, folded: foldGoal(inspection.events) })
    }
    return snapshots
  } catch (error) {
    if (error instanceof GoalStatusIntegrityError) {
      throw error
    }
    throw new GoalStatusIntegrityError('durable Goal status is invalid', {
      cause: error,
    })
  } finally {
    await ctx.fiber.dispose()
  }
}

export async function listGoals(
  input: GoalListInput,
): Promise<GoalListProjection> {
  const sessionsRoot = input.dataDir === undefined
    ? input.sessionsRoot
    : isAbsolute(input.dataDir)
      ? join(resolve(input.dataDir), 'dsh-home', 'sessions')
      : undefined
  if (sessionsRoot === undefined || !isAbsolute(sessionsRoot)) {
    throw new TypeError(input.dataDir === undefined
      ? 'sessionsRoot must be an absolute path'
      : 'dataDir must be an absolute path')
  }
  const goalIds = new Set<string>()
  const goals: GoalListProjection['goals'][number][] = []
  for (const snapshot of await scanDurableGoals(sessionsRoot)) {
    const folded = snapshot.folded
    const goal = folded.goal
    if (goal === undefined) continue
    if (folded.createdAt === undefined || folded.updatedAt === undefined) {
      throw new GoalStatusIntegrityError('Goal replay is incomplete')
    }
    const goalId = String(goal.id)
    if (goalIds.has(goalId)) {
      throw new GoalStatusAmbiguousError(goalId)
    }
    goalIds.add(goalId)
    goals.push({
      id: goalId,
      objective: goal.objective,
      phase: goal.phase,
      maxGoalRounds: goal.maxGoalRounds,
      roundsStarted: folded.roundsStarted,
      updatedAt: folded.updatedAt,
      session: {
        id: String(snapshot.inspection.meta.id),
        eventCount: snapshot.inspection.events.length,
      },
    })
  }
  goals.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt
    }
    if (left.id !== right.id) return left.id < right.id ? -1 : 1
    if (left.session.id === right.session.id) return 0
    return left.session.id < right.session.id ? -1 : 1
  })
  return {
    schemaVersion: 'tianwen.goal-list.v1',
    goals,
    runtime: {
      activation: 'not-loaded',
      modelRequests: 0,
      readOnly: true,
    },
  }
}

export async function readGoalStatus(
  input: GoalStatusInput,
): Promise<GoalStatusProjection> {
  if (input.goalId.length === 0) {
    throw new TypeError('goalId must not be empty')
  }
  const roots = input.dataDir === undefined
    ? {
        sessionsRoot: input.sessionsRoot,
        evolutionRoot: input.evolutionRoot,
      }
    : isAbsolute(input.dataDir)
      ? {
          sessionsRoot: join(resolve(input.dataDir), 'dsh-home', 'sessions'),
          evolutionRoot: join(resolve(input.dataDir), 'state', 'evolution'),
        }
      : undefined
  if (roots === undefined) throw new TypeError('dataDir must be an absolute path')
  if (!isAbsolute(roots.sessionsRoot) || !isAbsolute(roots.evolutionRoot)) {
    throw new TypeError('sessionsRoot and evolutionRoot must be absolute paths')
  }
  try {
    const matches = (await scanDurableGoals(roots.sessionsRoot))
      .filter(snapshot => String(snapshot.folded.goal?.id) === input.goalId)
    if (matches.length === 0) {
      throw new GoalStatusNotFoundError(input.goalId)
    }
    if (matches.length > 1) {
      throw new GoalStatusAmbiguousError(input.goalId)
    }
    const snapshot = matches[0]!
    const folded = snapshot.folded
    const goal = folded.goal
    if (
      goal === undefined ||
      folded.createdAt === undefined ||
      folded.updatedAt === undefined
    ) {
      throw new GoalStatusIntegrityError('Goal replay is incomplete')
    }
    const { inspection } = snapshot
    const evidence = projectEvidence(inspection.meta.id, inspection.events)
    const complete = evidence.filter(
      record => record.outcome.status === 'complete',
    ).length
    const champion = inspectEvolutionLedger(
      roots.evolutionRoot,
    ).champion

    return {
      schemaVersion: 'tianwen.goal-status.v1',
      goal: {
        id: String(goal.id),
        revision: goal.revision,
        objective: goal.objective,
        phase: goal.phase,
        ...(goal.blockedReason === undefined ? {} : {
          blockedReason: {
            code: goal.blockedReason.code,
            message: goal.blockedReason.message,
          },
        }),
        maxGoalRounds: goal.maxGoalRounds,
        roundsStarted: folded.roundsStarted,
        createdAt: folded.createdAt,
        updatedAt: folded.updatedAt,
      },
      session: {
        id: String(inspection.meta.id),
        eventCount: inspection.events.length,
      },
      evidence: {
        total: evidence.length,
        counts: {
          complete,
          'missing-result': evidence.length - complete,
        },
        items: evidence.map(record => ({
          toolName: record.action.toolName,
          status: record.outcome.status,
        })),
      },
      champion,
      runtime: {
        activation: 'not-loaded',
        modelRequests: 0,
        readOnly: true,
      },
    }
  } catch (error) {
    if (error instanceof LedgerIntegrityError) {
      throw new GoalStatusIntegrityError('Evolution ledger is invalid', {
        cause: error,
      })
    }
    if (
      error instanceof GoalStatusNotFoundError ||
      error instanceof GoalStatusAmbiguousError ||
      error instanceof GoalStatusIntegrityError
    ) {
      throw error
    }
    throw new GoalStatusIntegrityError('durable Goal status is invalid', {
      cause: error,
    })
  }
}
