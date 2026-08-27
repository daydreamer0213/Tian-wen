import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInstalledDshBin } from './resume.js'
import type { ResolvedPortableProfileTarget } from './portable-profile.js'

export interface GoalCreatePreflight {
  readonly dataDir: string
  readonly dshBin: string
  readonly evolutionRoot: string
  readonly maxGoalRounds: number
  readonly objective: string
  readonly sessionsRoot: string
}

export interface PortableGoalCreatePreflight {
  readonly evolutionRoot: string
  readonly maxGoalRounds: number
  readonly objective: string
  readonly portableTarget: ResolvedPortableProfileTarget
  readonly resumeShell: 'posix' | 'powershell'
  readonly resumeTarget: string
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

function portableArgument(
  value: string,
  shell: PortableGoalCreatePreflight['resumeShell'],
): string {
  return shell === 'powershell'
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", `'"'"'`)}'`
}

export function preflightPortableGoalCreate(
  objectiveInput: string,
  maxGoalRounds: number,
  target: ResolvedPortableProfileTarget,
): PortableGoalCreatePreflight {
  const objective = objectiveInput.trim()
  if (objective.length === 0) throw new TypeError('objective must not be empty')
  if (!Number.isSafeInteger(maxGoalRounds) || maxGoalRounds < 1) {
    throw new TypeError('maxGoalRounds must be a positive safe integer')
  }
  const resumeShell = process.platform === 'win32' ? 'powershell' : 'posix'
  return {
    evolutionRoot: target.evolutionRoot,
    maxGoalRounds,
    objective,
    portableTarget: target,
    resumeShell,
    resumeTarget: [
      '--dsh-root', portableArgument(target.dshRoot, resumeShell),
      '--dsh-home', portableArgument(target.dshHome, resumeShell),
      '--profile', portableArgument(target.profile, resumeShell),
      '--state-root', portableArgument(target.stateRoot, resumeShell),
    ].join(' '),
    sessionsRoot: target.sessionsRoot,
  }
}

export function buildGoalCreateInvocation(
  preflight: GoalCreatePreflight | PortableGoalCreatePreflight,
  json: boolean,
  nonce: string,
): GoalCreateInvocation {
  const portable = 'portableTarget' in preflight
  const dshBin = portable
    ? preflight.portableTarget.dshBin
    : preflight.dshBin
  const dshHome = portable
    ? preflight.portableTarget.dshHome
    : join(preflight.dataDir, 'dsh-home')
  const profile = portable ? preflight.portableTarget.profile : 'tianwen'
  return {
    program: process.execPath,
    args: [
      dshBin,
      '--profile',
      profile,
      '--patch',
      resolve(dirname(fileURLToPath(import.meta.url)), '../create.patch.yml'),
    ],
    options: {
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        ...(portable ? {
          TIANWEN_CREATE_RESUME_SHELL: preflight.resumeShell,
          TIANWEN_CREATE_RESUME_TARGET: preflight.resumeTarget,
        } : {
          TIANWEN_CREATE_DATA_DIR: preflight.dataDir,
        }),
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
  preflight: GoalCreatePreflight | PortableGoalCreatePreflight,
  json: boolean,
): Promise<number> {
  const invocation = buildGoalCreateInvocation(preflight, json, randomUUID())
  const child = spawn(invocation.program, invocation.args, invocation.options)
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
}
