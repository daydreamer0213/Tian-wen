import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInstalledDshBin } from './resume.js'
import type { ResolvedPortableProfileTarget } from './portable-profile.js'
import type { GoalCreateReceipt } from './create-runner.js'

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

interface GoalCreateCaptureResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

interface GoalCreateCaptureDependencies {
  readonly nonce?: () => string
  readonly run?: (invocation: GoalCreateInvocation) => Promise<GoalCreateCaptureResult>
}

const GOAL_CREATE_CAPTURE_OUTPUT_LIMIT_BYTES = 16 * 1024

function receiptRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Goal create receipt must be an object')
  }
  return value as Record<string, unknown>
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).toSorted()
  const wanted = [...expected].toSorted()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError('Goal create receipt has an invalid shape')
  }
}

function receiptText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`Goal create receipt ${name} is invalid`)
  }
  return value
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`Goal create receipt ${name} is invalid`)
  }
  return value as number
}

function nonnegativeSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`Goal create receipt ${name} is invalid`)
  }
  return value as number
}

export function parseGoalCreateReceipt(value: unknown): GoalCreateReceipt {
  const receipt = receiptRecord(value)
  requireExactKeys(receipt, ['schemaVersion', 'goal', 'session'])
  if (receipt.schemaVersion !== 'tianwen.goal-create.v1') {
    throw new TypeError('Goal create receipt schema is invalid')
  }
  const goal = receiptRecord(receipt.goal)
  requireExactKeys(goal, [
    'id', 'maxGoalRounds', 'objective', 'phase', 'revision', 'roundsStarted',
  ])
  const session = receiptRecord(receipt.session)
  requireExactKeys(session, ['eventCount', 'id', 'modelRequestsDelta'])
  if (
    goal.phase !== 'active' || goal.revision !== 1 || goal.roundsStarted !== 0 ||
    session.modelRequestsDelta !== 0
  ) throw new TypeError('Goal create receipt has invalid creation values')
  return {
    schemaVersion: 'tianwen.goal-create.v1',
    goal: {
      id: receiptText(goal.id, 'Goal id'),
      maxGoalRounds: positiveSafeInteger(goal.maxGoalRounds, 'Goal max rounds'),
      objective: receiptText(goal.objective, 'Goal objective'),
      phase: 'active',
      revision: 1,
      roundsStarted: 0,
    },
    session: {
      eventCount: nonnegativeSafeInteger(session.eventCount, 'Session event count'),
      id: receiptText(session.id, 'Session id'),
      modelRequestsDelta: 0,
    },
  }
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

async function runCapturedGoalCreate(invocation: GoalCreateInvocation): Promise<GoalCreateCaptureResult> {
  const child = spawn(invocation.program, invocation.args, {
    ...invocation.options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return await new Promise((resolveResult, reject) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let outputError: Error | undefined
    const capture = (chunks: Buffer[], append: (size: number) => void) => (chunk: Buffer) => {
      if (outputError !== undefined) return
      append(chunk.length)
      if (stdoutBytes > GOAL_CREATE_CAPTURE_OUTPUT_LIMIT_BYTES ||
        stderrBytes > GOAL_CREATE_CAPTURE_OUTPUT_LIMIT_BYTES) {
        outputError = new TypeError('Goal create child output is too large')
        child.kill()
        return
      }
      chunks.push(chunk)
    }
    child.stdout?.on('data', capture(stdout, size => { stdoutBytes += size }))
    child.stderr?.on('data', capture(stderr, size => { stderrBytes += size }))
    child.once('error', reject)
    child.once('exit', code => {
      if (outputError !== undefined) {
        reject(outputError)
        return
      }
      resolveResult({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

export async function captureGoalCreate(
  preflight: GoalCreatePreflight | PortableGoalCreatePreflight,
  dependencies: GoalCreateCaptureDependencies = {},
): Promise<GoalCreateReceipt> {
  const invocation = buildGoalCreateInvocation(preflight, true, (dependencies.nonce ?? randomUUID)())
  const result = await (dependencies.run ?? runCapturedGoalCreate)(invocation)
  if (
    result.code !== 0 || result.stderr !== '' ||
    Buffer.byteLength(result.stdout, 'utf8') > GOAL_CREATE_CAPTURE_OUTPUT_LIMIT_BYTES ||
    Buffer.byteLength(result.stderr, 'utf8') > GOAL_CREATE_CAPTURE_OUTPUT_LIMIT_BYTES
  ) throw new Error('Goal creation failed')
  const lines = result.stdout.split(/\r?\n/u).filter(line => line.trim().length > 0)
  if (lines.length !== 1) throw new TypeError('Goal create child must emit one JSON line')
  let receipt: unknown
  try { receipt = JSON.parse(lines[0]!) as unknown } catch {
    throw new TypeError('Goal create child receipt is invalid JSON')
  }
  return parseGoalCreateReceipt(receipt)
}
