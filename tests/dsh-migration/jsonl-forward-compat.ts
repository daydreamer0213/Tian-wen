import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import {
  DSH_VERSION,
  SessionId,
  type ScriptedAdapter,
  mountGoalHarness,
} from '@tianwen/dsh-compat'

const SESSION_ID = 'session:tianwen-rc7-jsonl-forward'
const META_FILE = 'fixture-meta.json'

interface FixtureMeta {
  readonly sourceVersion: string
  readonly sessionId: string
  readonly goal: { readonly id: string, readonly revision: number }
  readonly relativeLogPath: string
  readonly byteLength: number
  readonly sha256: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function fixtureRoot(): string {
  const root = requiredEnvironment('TIANWEN_DSH_JSONL_ROOT')
  if (!isAbsolute(root)) throw new Error('TIANWEN_DSH_JSONL_ROOT must be absolute')
  return resolve(root)
}

function findSessionLog(root: string): string {
  const candidates: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name === 'session.jsonl') candidates.push(path)
    }
  }
  visit(root)
  if (candidates.length !== 1) throw new Error(`expected one session.jsonl, found ${candidates.length}`)
  return candidates[0]!
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isOutsideRoot(root: string, path: string): boolean {
  const pathRelativeToRoot = relative(root, path)
  const normalized = pathRelativeToRoot.replaceAll('\\', '/')
  return isAbsolute(pathRelativeToRoot) || normalized === '' || normalized === '..' || normalized.startsWith('../')
}

function readMeta(root: string): FixtureMeta {
  return JSON.parse(readFileSync(join(root, META_FILE), 'utf8')) as FixtureMeta
}

async function createActiveGoal(root: string) {
  const harness = await mountGoalHarness(root, [], { goalRoundDriver: false })
  const adapter: ScriptedAdapter = harness.adapter
  const handle = await harness.ctx.agents.create({
    sessionId: SessionId(SESSION_ID),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    const goal = harness.ctx.goals.create(handle.agent, {
      objective: 'freeze synthetic JSONL forward compatibility fixture',
      maxGoalRounds: 1,
    })
    if (!await harness.ctx.sessions.flush(handle.agent.session)) {
      throw new Error('Session persistence is unavailable')
    }
    if (adapter.requests.length !== 0) throw new Error('fixture generation must not request a model')
    return { id: String(goal.id), revision: goal.revision }
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

async function generate(root: string): Promise<void> {
  if (DSH_VERSION !== '0.1.0-rc.7') {
    throw new Error(`generate requires DSH 0.1.0-rc.7, found ${DSH_VERSION}`)
  }
  if (existsSync(join(root, META_FILE))) throw new Error('frozen fixture already exists')
  mkdirSync(root, { recursive: true })

  const goal = await createActiveGoal(root)
  const logPath = findSessionLog(root)
  const bytes = readFileSync(logPath)
  const relativeLogPath = relative(root, logPath).replaceAll('\\', '/')
  if (!relativeLogPath || relativeLogPath.startsWith('../')) {
    throw new Error('session.jsonl must stay inside TIANWEN_DSH_JSONL_ROOT')
  }
  const meta: FixtureMeta = {
    sourceVersion: DSH_VERSION,
    sessionId: SESSION_ID,
    goal,
    relativeLogPath,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  }
  writeFileSync(join(root, META_FILE), `${JSON.stringify(meta, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(meta)}\n`)
}

async function verify(root: string): Promise<void> {
  if (DSH_VERSION !== '0.1.1-rc.2') {
    throw new Error(`verify requires DSH 0.1.1-rc.2, found ${DSH_VERSION}`)
  }
  const meta = readMeta(root)
  if (meta.sourceVersion !== '0.1.0-rc.7' || meta.sessionId !== SESSION_ID) {
    throw new Error('fixture metadata does not describe the frozen rc.7 Session')
  }
  const logPath = resolve(root, meta.relativeLogPath)
  if (isOutsideRoot(root, logPath) || !existsSync(logPath)) {
    throw new Error('fixture metadata points outside its root or to a missing JSONL log')
  }
  const before = readFileSync(logPath)
  if (before.byteLength !== meta.byteLength || sha256(before) !== meta.sha256) {
    throw new Error('frozen rc.7 JSONL bytes do not match fixture metadata')
  }

  const harness = await mountGoalHarness(root, [], { goalRoundDriver: false })
  const adapter: ScriptedAdapter = harness.adapter
  const handle = await harness.ctx.agents.resume({
    resumeSessionId: SessionId(meta.sessionId),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    const goal = harness.ctx.goals.get(handle.agent)
    if (!goal || String(goal.id) !== meta.goal.id || goal.revision !== meta.goal.revision) {
      throw new Error('rc.2 did not recover the frozen Goal ID and revision')
    }
    const paused = harness.ctx.goals.pause(handle.agent, goal)
    if (!await harness.ctx.sessions.flush(handle.agent.session)) {
      throw new Error('Session persistence is unavailable')
    }
    if (adapter.requests.length !== 0) throw new Error('fixture verification must not request a model')
    const after = readFileSync(logPath)
    if (after.byteLength <= before.byteLength || !after.subarray(0, before.byteLength).equals(before)) {
      throw new Error('rc.2 must append without changing the frozen rc.7 JSONL prefix')
    }
    process.stdout.write(`${JSON.stringify({ ...meta, verifiedGoalRevision: paused.revision })}\n`)
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

const mode = requiredEnvironment('TIANWEN_DSH_JSONL_MODE')
const root = fixtureRoot()

if (mode === 'generate') await generate(root)
else if (mode === 'verify') await verify(root)
else throw new Error('TIANWEN_DSH_JSONL_MODE must be generate or verify')
