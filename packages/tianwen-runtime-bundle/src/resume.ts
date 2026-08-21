import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GoalStatusAmbiguousError,
  GoalStatusIntegrityError,
  GoalStatusNotFoundError,
  scanDurableGoals,
} from './status.js'
import {
  LIVE_GOAL_LIMITS,
  LIVE_GOAL_OBJECTIVE,
  createGoalLiveSmokeFailure,
  parseGoalLiveSmokeChildReceipt,
} from './goal-live-smoke.js'
import type { GoalLiveSmokeReceipt } from './goal-live-smoke.js'
import { readNaturalRunTrialManifest } from './natural-run-trial.js'
import type { PreparedNaturalRunTrialManifest } from './natural-run-trial.js'

const DSH_VERSION = '0.1.0-rc.7'
const LIVE_SMOKE_CHILD_OUTPUT_LIMIT_BYTES = 65_536
const LIVE_SMOKE_PARENT_GRACE_MS = 5_000

export interface ResumePreflight {
  readonly dataDir: string
  readonly evolutionRoot: string
  readonly goalId: string
  readonly revision: number
  readonly sessionId: string
  readonly sessionsRoot: string
}

export interface LiveSmokeResumePreflight extends ResumePreflight {
  readonly liveSmoke: true
}

export interface NaturalRunTrialResumePreflight extends ResumePreflight {
  readonly trial: PreparedNaturalRunTrialManifest
  readonly trialManifestPath: string
}

export interface LiveSmokeChildDependencies {
  readonly now?: () => number
  readonly setTimeout?: (callback: () => void, delay: number) => unknown
  readonly clearTimeout?: (timer: unknown) => void
  readonly write?: (line: string) => void
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

export function verifyInstalledRuntimeBundle(dataDir: string): void {
  const packageRoot = join(
    dataDir, 'dsh-home', 'profiles', 'tianwen', 'node_modules',
    '@tianwen', 'runtime-bundle',
  )
  try {
    const runtimeRoot = realpathSync(packageRoot)
    const executingFile = realpathSync(fileURLToPath(import.meta.url))
    if (!inside(runtimeRoot, executingFile)) throw new Error('outside runtime package')
  } catch {
    throw new GoalResumeUnavailableError('installed Tianwen Runtime Bundle is unavailable')
  }
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
  liveSmoke: true,
): Promise<LiveSmokeResumePreflight>
export async function preflightGoalResume(
  goalId: string,
  dataDirInput: string,
  liveSmoke?: false,
): Promise<ResumePreflight>
export async function preflightGoalResume(
  goalId: string,
  dataDirInput: string,
  liveSmoke?: boolean,
): Promise<ResumePreflight | LiveSmokeResumePreflight>
export async function preflightGoalResume(
  goalId: string,
  dataDirInput: string,
  liveSmoke = false,
): Promise<ResumePreflight | LiveSmokeResumePreflight> {
  if (!isAbsolute(dataDirInput)) {
    throw new TypeError('dataDir must be an absolute path')
  }
  if (goalId.length === 0) {
    throw new TypeError('goalId must not be empty')
  }
  const dataDir = resolve(dataDirInput)
  const devData = resolve('D:\\DevData')
  if (liveSmoke && !inside(devData, dataDir)) {
    throw new GoalResumeUnavailableError('Goal is not eligible for live smoke')
  }
  const matches = (await scanDurableGoals(dataDir))
    .filter(snapshot => String(snapshot.folded.goal?.id) === goalId)
  if (matches.length === 0) throw new GoalStatusNotFoundError(goalId)
  if (matches.length > 1) throw new GoalStatusAmbiguousError(goalId)
  const snapshot = matches[0]!
  const goal = snapshot.folded.goal
  if (goal === undefined) {
    throw new GoalStatusIntegrityError('Goal replay is incomplete')
  }
  const preflight: ResumePreflight = {
    dataDir,
    evolutionRoot: join(dataDir, 'state', 'evolution'),
    goalId,
    revision: goal.revision,
    sessionId: String(snapshot.inspection.meta.id),
    sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
  }
  if (liveSmoke) {
    const createEvent = snapshot.inspection.events[0]
    if (
      !/^tianwen-goal-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(preflight.sessionId) ||
      goal.objective !== LIVE_GOAL_OBJECTIVE || goal.phase !== 'active' ||
      goal.revision !== 1 || goal.maxGoalRounds !== 1 ||
      snapshot.folded.roundsStarted !== 0 ||
      snapshot.inspection.events.length !== 1 ||
      createEvent?.seq !== 0 || createEvent.type !== 'goal/change' ||
      createEvent.data.operation !== 'create' ||
      String(createEvent.data.goal.id) !== preflight.goalId ||
      createEvent.data.goal.revision !== 1 ||
      createEvent.data.goal.objective !== LIVE_GOAL_OBJECTIVE ||
      createEvent.data.goal.maxGoalRounds !== 1 ||
      createEvent.data.goal.phase !== 'active' || createEvent.data.roundsStarted !== 0
    ) {
      throw new GoalResumeUnavailableError('Goal is not eligible for live smoke')
    }
    return { ...preflight, liveSmoke: true }
  }
  if (goal.phase === 'complete') {
    throw new GoalResumeUnavailableError('Goal is complete')
  }
  if (snapshot.folded.roundsStarted >= goal.maxGoalRounds) {
    throw new GoalResumeUnavailableError('Goal round budget is exhausted')
  }
  return preflight
}

export async function preflightNaturalRunTrial(
  goalId: string,
  dataDir: string,
  manifestPath: string,
): Promise<NaturalRunTrialResumePreflight> {
  const trial = readNaturalRunTrialManifest(manifestPath)
  if (trial.manifest.goalId !== goalId) {
    throw new GoalResumeUnavailableError('trial manifest Goal does not match')
  }
  const preflight = await preflightGoalResume(goalId, dataDir)
  const matches = (await scanDurableGoals(preflight.dataDir))
    .filter(snapshot => String(snapshot.folded.goal?.id) === goalId)
  const events = matches[0]?.inspection.events
  if (events === undefined || events.some(event => event.type === 'turn/start')) {
    throw new GoalResumeUnavailableError('Goal Session is not fresh for a trial')
  }
  return { ...preflight, trial, trialManifestPath: manifestPath }
}

export async function monitorLiveSmokeChild(
  child: ChildProcess,
  preflight: LiveSmokeResumePreflight,
  startedAtMs: number,
  dependencies: LiveSmokeChildDependencies = {},
): Promise<number> {
  const now = dependencies.now ?? Date.now
  const schedule = dependencies.setTimeout ?? ((callback, delay) => setTimeout(callback, delay))
  const cancelTimer = dependencies.clearTimeout ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>))
  const write = dependencies.write ?? (line => { process.stdout.write(line) })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let stdoutBytes = 0
  let stderrBytes = 0
  let finished = false
  let terminated = false
  let deadlineTimer: unknown
  let graceTimer: unknown
  let forcedFailure: ReturnType<typeof createGoalLiveSmokeFailure> | undefined
  const internalFailure = () => createGoalLiveSmokeFailure('internal-error', {
    now: new Date(startedAtMs), requestCount: null, retryCount: null,
  })
  const timeoutFailure = () => createGoalLiveSmokeFailure('timeout', {
    now: new Date(startedAtMs), requestCount: null, retryCount: null,
  })
  const terminate = (): void => {
    if (terminated) return
    terminated = true
    try { child.kill() } catch {}
  }
  return await new Promise(resolveExit => {
    const finish = (receipt: GoalLiveSmokeReceipt) => {
      if (finished) return
      finished = true
      if (deadlineTimer !== undefined) cancelTimer(deadlineTimer)
      if (graceTimer !== undefined) cancelTimer(graceTimer)
      write(`${JSON.stringify(receipt)}\n`)
      resolveExit(receipt.status === 'passed' ? 0 : 1)
    }
    const finishFromChild = () => {
      if (forcedFailure !== undefined) {
        finish(forcedFailure)
        return
      }
      let receipt
      try {
        receipt = parseGoalLiveSmokeChildReceipt(
          Buffer.concat(stdout).toString('utf8'), Buffer.concat(stderr).toString('utf8'),
          { goalId: preflight.goalId, sessionId: preflight.sessionId },
        )
      } catch {
        finish(internalFailure())
        return
      }
      finish(receipt)
    }
    const overflow = () => {
      forcedFailure = internalFailure()
      terminate()
      finish(forcedFailure)
    }
    const collect = (chunks: Buffer[], chunk: Buffer, bytes: number): number => {
      if (finished) return bytes
      const nextBytes = bytes + chunk.byteLength
      if (nextBytes > LIVE_SMOKE_CHILD_OUTPUT_LIMIT_BYTES) {
        overflow()
        return bytes
      }
      chunks.push(chunk)
      return nextBytes
    }
    const beginDeadline = () => {
      if (finished) return
      graceTimer = schedule(() => {
        if (finished) return
        forcedFailure = timeoutFailure()
        terminate()
        finish(forcedFailure)
      }, LIVE_SMOKE_PARENT_GRACE_MS)
    }
    child.once('error', () => finish(internalFailure()))
    child.once('close', finishFromChild)
    if (child.stdout === null || child.stderr === null) {
      overflow()
      return
    }
    child.stdout.on('data', (chunk: Buffer) => { stdoutBytes = collect(stdout, chunk, stdoutBytes) })
    child.stderr.on('data', (chunk: Buffer) => { stderrBytes = collect(stderr, chunk, stderrBytes) })
    child.stdout.once('error', overflow)
    child.stderr.once('error', overflow)
    deadlineTimer = schedule(beginDeadline, Math.max(0, startedAtMs + LIVE_GOAL_LIMITS.timeoutMs - now()))
  })
}

export async function launchGoalResume(
  preflight:
    | ResumePreflight
    | LiveSmokeResumePreflight
    | NaturalRunTrialResumePreflight,
  json: boolean,
): Promise<number> {
  const liveSmoke = 'liveSmoke' in preflight
  const naturalTrial = 'trial' in preflight
  if (liveSmoke || naturalTrial) verifyInstalledRuntimeBundle(preflight.dataDir)
  const startedAtMs = Date.now()
  const dshHome = join(preflight.dataDir, 'dsh-home')
  const child = spawn(process.execPath, [
    resolveInstalledDshBin(preflight.dataDir), '--profile', 'tianwen', '--patch',
    resolve(dirname(fileURLToPath(import.meta.url)), '../resume.patch.yml'),
  ], {
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      TIANWEN_RESUME_EVOLUTION_ROOT: preflight.evolutionRoot,
      TIANWEN_RESUME_LIVE_SMOKE: String(liveSmoke),
      TIANWEN_RESUME_GOAL_ID: preflight.goalId,
      TIANWEN_RESUME_JSON: String(json),
      TIANWEN_RESUME_NONCE: randomUUID(),
      TIANWEN_RESUME_REVISION: String(preflight.revision),
      TIANWEN_RESUME_SESSION_ID: preflight.sessionId,
      TIANWEN_RESUME_SESSIONS_ROOT: preflight.sessionsRoot,
      TIANWEN_RESUME_STARTED_AT_MS: String(startedAtMs),
      ...(naturalTrial ? {
        TIANWEN_RESUME_TRIAL_MANIFEST_PATH: preflight.trialManifestPath,
        TIANWEN_RESUME_TRIAL_MANIFEST_DIGEST: preflight.trial.manifestDigest,
      } : {}),
    },
    shell: false,
    stdio: liveSmoke ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (liveSmoke) return monitorLiveSmokeChild(child, preflight, startedAtMs)
  return await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit(code ?? (signal === null ? 1 : 1)))
  })
}
