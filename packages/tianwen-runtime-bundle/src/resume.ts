import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GoalStatusAmbiguousError,
  GoalStatusIntegrityError,
  GoalStatusNotFoundError,
  scanDurableGoals,
} from './status.js'

const DSH_VERSION = '0.1.0-rc.6'

export interface ResumePreflight {
  readonly dataDir: string
  readonly evolutionRoot: string
  readonly goalId: string
  readonly revision: number
  readonly sessionId: string
  readonly sessionsRoot: string
}

export class GoalResumeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoalResumeUnavailableError'
  }
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

export function resolveInstalledDshBin(dataDir: string): string {
  const hostRoot = resolve(dataDir, 'dsh-host')
  const packageRoot = join(hostRoot, 'node_modules', '@deepseek-ai', 'dsh')
  const manifestPath = join(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new GoalResumeUnavailableError('installed DSH CLI is unavailable')
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new GoalResumeUnavailableError('installed DSH CLI manifest is invalid')
  }
  if (
    typeof manifest !== 'object' || manifest === null ||
    (manifest as { version?: unknown }).version !== DSH_VERSION ||
    typeof (manifest as { bin?: unknown }).bin !== 'object' ||
    (manifest as { bin: { dsh?: unknown } }).bin.dsh === undefined ||
    typeof (manifest as { bin: { dsh: unknown } }).bin.dsh !== 'string'
  ) {
    throw new GoalResumeUnavailableError('installed DSH CLI is incompatible')
  }
  const entry = (manifest as { bin: { dsh: string } }).bin.dsh
  const bin = resolve(packageRoot, entry)
  if (!inside(packageRoot, bin) || !existsSync(bin)) {
    throw new GoalResumeUnavailableError('installed DSH CLI entry is invalid')
  }
  try {
    const realHost = realpathSync(hostRoot)
    const realRoot = realpathSync(packageRoot)
    const realBin = realpathSync(bin)
    if (
      !inside(realHost, realRoot) ||
      !inside(realRoot, realBin) ||
      !lstatSync(realBin).isFile()
    ) {
      throw new Error('not contained regular file')
    }
    return realBin
  } catch (error) {
    throw new GoalResumeUnavailableError('installed DSH CLI entry is invalid')
  }
}

export async function preflightGoalResume(
  goalId: string,
  dataDirInput: string,
): Promise<ResumePreflight> {
  if (!isAbsolute(dataDirInput)) {
    throw new TypeError('dataDir must be an absolute path')
  }
  if (goalId.length === 0) {
    throw new TypeError('goalId must not be empty')
  }
  const dataDir = resolve(dataDirInput)
  const matches = (await scanDurableGoals(dataDir))
    .filter(snapshot => String(snapshot.folded.goal?.id) === goalId)
  if (matches.length === 0) throw new GoalStatusNotFoundError(goalId)
  if (matches.length > 1) throw new GoalStatusAmbiguousError(goalId)
  const snapshot = matches[0]!
  const goal = snapshot.folded.goal
  if (goal === undefined) {
    throw new GoalStatusIntegrityError('Goal replay is incomplete')
  }
  if (goal.phase === 'complete') {
    throw new GoalResumeUnavailableError('Goal is complete')
  }
  if (snapshot.folded.roundsStarted >= goal.maxGoalRounds) {
    throw new GoalResumeUnavailableError('Goal round budget is exhausted')
  }
  return {
    dataDir,
    evolutionRoot: join(dataDir, 'state', 'evolution'),
    goalId,
    revision: goal.revision,
    sessionId: String(snapshot.inspection.meta.id),
    sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
  }
}

export async function launchGoalResume(
  preflight: ResumePreflight,
  json: boolean,
): Promise<number> {
  const dshHome = join(preflight.dataDir, 'dsh-home')
  const child = spawn(process.execPath, [
    resolveInstalledDshBin(preflight.dataDir), '--profile', 'tianwen', '--patch',
    resolve(dirname(fileURLToPath(import.meta.url)), '../resume.patch.yml'),
  ], {
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      TIANWEN_RESUME_EVOLUTION_ROOT: preflight.evolutionRoot,
      TIANWEN_RESUME_GOAL_ID: preflight.goalId,
      TIANWEN_RESUME_JSON: String(json),
      TIANWEN_RESUME_NONCE: randomUUID(),
      TIANWEN_RESUME_REVISION: String(preflight.revision),
      TIANWEN_RESUME_SESSION_ID: preflight.sessionId,
      TIANWEN_RESUME_SESSIONS_ROOT: preflight.sessionsRoot,
    },
    shell: false,
    stdio: 'inherit',
  })
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit(code ?? (signal === null ? 1 : 1)))
  })
}
