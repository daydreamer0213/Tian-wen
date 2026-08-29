import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'

import type {
  LongGoalStatusProjection,
  LongGoalSummary,
} from './long-goal-contract.js'
import {
  createLongGoal,
  listLongGoals,
  readLongGoalStatus,
} from './long-goal.js'

type RpcResult<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: {
      readonly code: 'internal'
      readonly message: 'invalid-request'
      readonly details: Record<string, never>
    } }

type ConnectionRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>>

interface HostContext extends Context {
  readonly connection: {
    readonly rpc: {
      handle(
        channel: string,
        handler: ConnectionRpcHandler,
        options: { readonly authority: 'loopback' },
      ): unknown
    }
  }
}

export interface TianwenLongGoalHostRoots {
  readonly stateRoot: string
  readonly sessionsRoot: string
  readonly evolutionRoot: string
}

export interface TianwenLongGoalHostConfig {
  readonly stateRoot?: string
  readonly sessionsRoot?: string
  readonly evolutionRoot?: string
}

export interface TianwenLongGoalHostDependencies {
  readonly listLongGoals: typeof listLongGoals
  readonly createLongGoal: typeof createLongGoal
  readonly readLongGoalStatus: typeof readLongGoalStatus
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function invalidRequest(): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message: 'invalid-request', details: {} } }
}

function summary(status: LongGoalStatusProjection, updatedAt: number): LongGoalSummary {
  return {
    id: status.goal.id,
    objective: status.goal.objective,
    phase: status.goal.phase,
    completedTasks: status.goal.completedTasks,
    totalTasks: status.goal.totalTasks,
    currentTaskId: status.currentTaskId,
    updatedAt,
  }
}

function assertAbsoluteConfiguredRoot(name: string, value: string | undefined): void {
  if (value !== undefined && (!isAbsolute(value) || value.length === 0)) {
    throw new Error(`${name} must be an absolute path`)
  }
}

export function resolveTianwenLongGoalHostRoots(input: {
  readonly profileBaseUrl: URL
  readonly dshHome?: string
  readonly config?: TianwenLongGoalHostConfig
}): TianwenLongGoalHostRoots {
  assertAbsoluteConfiguredRoot('stateRoot', input.config?.stateRoot)
  assertAbsoluteConfiguredRoot('sessionsRoot', input.config?.sessionsRoot)
  assertAbsoluteConfiguredRoot('evolutionRoot', input.config?.evolutionRoot)
  const profileRoot = resolve(fileURLToPath(input.profileBaseUrl))
  const stateRoot = input.config?.stateRoot ?? resolve(profileRoot, 'state')
  const evolutionRoot = input.config?.evolutionRoot ?? resolve(stateRoot, 'evolution')
  const dshHome = input.dshHome === undefined ? undefined : resolve(input.dshHome)
  const sessionsRoot = input.config?.sessionsRoot ??
    (dshHome === undefined ? undefined : resolve(dshHome, 'sessions'))
  if (sessionsRoot === undefined || (input.config?.sessionsRoot === undefined &&
    (input.dshHome === undefined || !isAbsolute(input.dshHome)))) {
    throw new Error('sessionsRoot requires an explicit root or absolute DSH_HOME')
  }
  return { stateRoot, sessionsRoot, evolutionRoot }
}

export function createTianwenLongGoalRpcHandler(
  roots: TianwenLongGoalHostRoots,
  dependencies: TianwenLongGoalHostDependencies = {
    listLongGoals,
    createLongGoal,
    readLongGoalStatus,
  },
): ConnectionRpcHandler {
  const readStatus = (longGoalId: string) => dependencies.readLongGoalStatus({
    stateRoot: roots.stateRoot,
    longGoalId,
    dshStatusTarget: {
      sessionsRoot: roots.sessionsRoot,
      evolutionRoot: roots.evolutionRoot,
    },
  })
  return async (endpoint, payload) => {
    if (endpoint === 'list' && isRecord(payload) && hasExactKeys(payload, [])) {
      const goals = await Promise.all(dependencies.listLongGoals(roots.stateRoot).map(async record =>
        summary(await readStatus(record.id), record.updatedAt)))
      return { ok: true, value: { goals } }
    }
    if (
      endpoint === 'create' &&
      isRecord(payload) &&
      hasExactKeys(payload, ['objective', 'tasks', 'maxTaskRounds']) &&
      isNonEmptyString(payload.objective) &&
      Array.isArray(payload.tasks) &&
      payload.tasks.length > 0 &&
      payload.tasks.every(isNonEmptyString) &&
      isPositiveInteger(payload.maxTaskRounds)
    ) {
      const record = dependencies.createLongGoal({
        stateRoot: roots.stateRoot,
        objective: payload.objective,
        tasks: payload.tasks,
        maxTaskRounds: payload.maxTaskRounds,
      })
      return { ok: true, value: { status: await readStatus(record.id) } }
    }
    if (
      endpoint === 'status' &&
      isRecord(payload) &&
      hasExactKeys(payload, ['longGoalId']) &&
      isNonEmptyString(payload.longGoalId)
    ) {
      return { ok: true, value: { status: await readStatus(payload.longGoalId) } }
    }
    return invalidRequest()
  }
}

export function mountTianwenLongGoalHost(
  ctx: Context,
  config?: TianwenLongGoalHostConfig,
): void {
  ctx.inject(['connection', 'apiProxy', 'agents', 'goals'], injected => {
    if (injected.baseUrl === undefined) throw new Error('Tianwen Long Goal Web host requires a Profile base URL')
    const roots = resolveTianwenLongGoalHostRoots({
      profileBaseUrl: new URL(injected.baseUrl),
      ...(process.env.DSH_HOME === undefined ? {} : { dshHome: process.env.DSH_HOME }),
      ...(config === undefined ? {} : { config }),
    })
    const host = injected as HostContext
    host.connection.rpc.handle('/tianwen', createTianwenLongGoalRpcHandler(roots), {
      authority: 'loopback',
    })
  })
}
