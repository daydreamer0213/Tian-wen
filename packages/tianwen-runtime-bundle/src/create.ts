import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInstalledDshBin } from './resume.js'

export interface GoalCreatePreflight {
  readonly dataDir: string
  readonly dshBin: string
  readonly evolutionRoot: string
  readonly maxGoalRounds: number
  readonly objective: string
  readonly sessionsRoot: string
}

export interface GoalCreateInvocation {
  readonly args: string[]
  readonly options: SpawnOptions
  readonly program: string
}

export function preflightGoalCreate(
  objectiveInput: string,
  maxGoalRounds: number,
  dataDirInput: string,
): GoalCreatePreflight {
  if (!isAbsolute(dataDirInput)) throw new TypeError('dataDir must be an absolute path')
  const objective = objectiveInput.trim()
  if (objective.length === 0) throw new TypeError('objective must not be empty')
  if (!Number.isSafeInteger(maxGoalRounds) || maxGoalRounds < 1) {
    throw new TypeError('maxGoalRounds must be a positive safe integer')
  }
  const dataDir = resolve(dataDirInput)
  return {
    dataDir,
    dshBin: resolveInstalledDshBin(dataDir),
    evolutionRoot: join(dataDir, 'state', 'evolution'),
    maxGoalRounds,
    objective,
    sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
  }
}

export function buildGoalCreateInvocation(
  preflight: GoalCreatePreflight,
  json: boolean,
  nonce: string,
): GoalCreateInvocation {
  return {
    program: process.execPath,
    args: [
      preflight.dshBin,
      '--profile',
      'tianwen',
      '--patch',
      resolve(dirname(fileURLToPath(import.meta.url)), '../create.patch.yml'),
    ],
    options: {
      env: {
        ...process.env,
        DSH_HOME: join(preflight.dataDir, 'dsh-home'),
        TIANWEN_CREATE_DATA_DIR: preflight.dataDir,
        TIANWEN_CREATE_EVOLUTION_ROOT: preflight.evolutionRoot,
        TIANWEN_CREATE_JSON: String(json),
        TIANWEN_CREATE_MAX_ROUNDS: String(preflight.maxGoalRounds),
        TIANWEN_CREATE_NONCE: nonce,
        TIANWEN_CREATE_OBJECTIVE: preflight.objective,
        TIANWEN_CREATE_SESSIONS_ROOT: preflight.sessionsRoot,
      },
      shell: false,
      stdio: 'inherit',
    },
  }
}

export async function launchGoalCreate(
  preflight: GoalCreatePreflight,
  json: boolean,
): Promise<number> {
  const invocation = buildGoalCreateInvocation(preflight, json, randomUUID())
  const child = spawn(invocation.program, invocation.args, invocation.options)
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
}
