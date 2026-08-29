import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ResolvedPortableProfileTarget } from './portable-profile.js'
import { resolveInstalledDshBin } from './resume.js'

export type GoalFirstOperation = 'start' | 'continue' | 'guide' | 'abandon'

export interface GoalFirstPreflight {
  readonly dshBin: string
  readonly dshHome: string
  readonly evolutionRoot: string
  readonly goalId?: string
  readonly json: boolean
  readonly objective?: string
  readonly operation: GoalFirstOperation
  readonly profile: string
  readonly revision?: number
  readonly sessionsRoot: string
  readonly stateRoot: string
  readonly text?: string
  readonly workspaceRoot: string
  readonly context?: string
  readonly successCriteria?: string
}

export interface GoalFirstInvocation {
  readonly args: string[]
  readonly options: SpawnOptions
  readonly program: string
}

function requireText(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new TypeError(`${name} must not be blank`)
  return value
}

function requireWorkspaceRoot(): string {
  const workspaceRoot = realpathSync(process.cwd())
  if (!isAbsolute(workspaceRoot) || resolve(workspaceRoot) === parse(resolve(workspaceRoot)).root) {
    throw new TypeError('workspace must be a canonical non-root absolute path')
  }
  return workspaceRoot
}

function requireRevision(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('revision must be a positive safe integer')
  }
  return value
}

export function preflightGoalFirst(input: {
  readonly operation: GoalFirstOperation
  readonly json: boolean
  readonly objective?: string
  readonly context?: string
  readonly successCriteria?: string
  readonly goalId?: string
  readonly revision?: number
  readonly text?: string
  readonly dataDir?: string
  readonly portableTarget?: ResolvedPortableProfileTarget
}): GoalFirstPreflight {
  if ((input.dataDir === undefined) === (input.portableTarget === undefined)) {
    throw new TypeError('exactly one product target is required')
  }
  const target = input.portableTarget
  if (input.dataDir !== undefined && !isAbsolute(input.dataDir)) {
    throw new TypeError('dataDir must be an absolute path')
  }
  const dataDir = input.dataDir === undefined ? undefined : resolve(input.dataDir)
  const start = input.operation === 'start'
  const guide = input.operation === 'guide'
  if (start) {
    requireText(input.objective, 'objective')
    if (input.context !== undefined) requireText(input.context, 'context')
    if (input.successCriteria !== undefined) requireText(input.successCriteria, 'successCriteria')
  } else {
    requireText(input.goalId, 'goalId')
    requireRevision(input.revision)
    if (guide) requireText(input.text, 'text')
  }
  return {
    dshBin: target?.dshBin ?? resolveInstalledDshBin(dataDir!),
    dshHome: target?.dshHome ?? join(dataDir!, 'dsh-home'),
    evolutionRoot: target?.evolutionRoot ?? join(dataDir!, 'state', 'evolution'),
    ...(input.goalId === undefined ? {} : { goalId: input.goalId }),
    json: input.json,
    ...(input.objective === undefined ? {} : { objective: input.objective }),
    operation: input.operation,
    profile: target?.profile ?? 'tianwen',
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    sessionsRoot: target?.sessionsRoot ?? join(dataDir!, 'dsh-home', 'sessions'),
    stateRoot: target?.stateRoot ?? join(dataDir!, 'state'),
    ...(input.text === undefined ? {} : { text: input.text }),
    workspaceRoot: requireWorkspaceRoot(),
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.successCriteria === undefined ? {} : { successCriteria: input.successCriteria }),
  }
}

export function buildGoalFirstInvocation(preflight: GoalFirstPreflight): GoalFirstInvocation {
  return {
    program: process.execPath,
    args: [
      preflight.dshBin,
      '--profile', preflight.profile,
      '--patch', resolve(dirname(fileURLToPath(import.meta.url)), '../goal-first.patch.yml'),
    ],
    options: {
      cwd: preflight.workspaceRoot,
      env: {
        ...process.env,
        DSH_HOME: preflight.dshHome,
        TIANWEN_GOAL_FIRST_CONTEXT: preflight.context ?? '',
        TIANWEN_GOAL_FIRST_EVOLUTION_ROOT: preflight.evolutionRoot,
        TIANWEN_GOAL_FIRST_GOAL_ID: preflight.goalId ?? '',
        TIANWEN_GOAL_FIRST_JSON: String(preflight.json),
        TIANWEN_GOAL_FIRST_OBJECTIVE: preflight.objective ?? '',
        TIANWEN_GOAL_FIRST_OPERATION: preflight.operation,
        TIANWEN_GOAL_FIRST_REVISION: preflight.revision === undefined ? '' : String(preflight.revision),
        TIANWEN_GOAL_FIRST_SESSIONS_ROOT: preflight.sessionsRoot,
        TIANWEN_GOAL_FIRST_STATE_ROOT: preflight.stateRoot,
        TIANWEN_GOAL_FIRST_SUCCESS_CRITERIA: preflight.successCriteria ?? '',
        TIANWEN_GOAL_FIRST_TEXT: preflight.text ?? '',
        TIANWEN_GOAL_FIRST_WORKSPACE_ROOT: preflight.workspaceRoot,
      },
      shell: false,
      stdio: 'inherit',
    },
  }
}

export async function launchGoalFirst(preflight: GoalFirstPreflight): Promise<number> {
  const invocation = buildGoalFirstInvocation(preflight)
  const child = spawn(invocation.program, invocation.args, invocation.options)
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
}
