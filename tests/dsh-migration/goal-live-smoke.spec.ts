import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'
import { describe, expect, it } from 'vitest'

import {
  LIVE_GOAL_OBJECTIVE,
  createGoalLiveSmokeFailure,
  parseGoalLiveSmokeChildReceipt,
} from '../../packages/tianwen-runtime-bundle/src/goal-live-smoke.js'
import { preflightGoalResume } from '../../packages/tianwen-runtime-bundle/src/resume.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-live-goal-smoke-tests')
const CLI = resolve('packages/tianwen-runtime-bundle/dist/cli.js')

function snapshotTree(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      if (entry.isFile()) files[relative(root, path).replaceAll('\\', '/')] = readFileSync(path).toString('base64')
    }
  }
  visit(root)
  return files
}

async function persistLiveGoal(dataDir: string, options: {
  readonly objective?: string
  readonly maxGoalRounds?: number
  readonly phase?: 'paused' | 'blocked' | 'complete'
} = {}) {
  const sessionId = `tianwen-goal-${randomUUID()}`
  const harness = await mountGoalHarness(
    join(dataDir, 'dsh-home', 'sessions'), [], { goalRoundDriver: false },
  )
  const handle = await harness.ctx.agents.create({
    sessionId: SessionId(sessionId),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    let goal = harness.ctx.goals.create(handle.agent, {
      objective: options.objective ?? LIVE_GOAL_OBJECTIVE,
      maxGoalRounds: options.maxGoalRounds ?? 1,
    })
    if (options.phase === 'paused') goal = harness.ctx.goals.pause(handle.agent, goal)
    if (options.phase === 'blocked') {
      goal = harness.ctx.goals.block(handle.agent, goal, {
        code: 'needs-input', message: 'needs input',
      })
    }
    if (options.phase === 'complete') goal = harness.ctx.goals.complete(handle.agent, goal)
    await harness.ctx.sessions.flush(handle.agent.session)
    return { goalId: String(goal.id), sessionId }
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

describe('tianwen live Goal smoke', () => {
  it('accepts only the immutable, pristine Goal in a strict D:\\DevData child', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'valid-'))
    try {
      const fixture = await persistLiveGoal(dataDir)
      const before = snapshotTree(dataDir)
      await expect(preflightGoalResume(fixture.goalId, dataDir, true)).resolves.toEqual({
        dataDir,
        evolutionRoot: join(dataDir, 'state', 'evolution'),
        goalId: fixture.goalId,
        revision: 1,
        sessionId: fixture.sessionId,
        sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
        liveSmoke: true,
      })
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it.each([
    ['wrong objective', { objective: 'untrusted objective' }],
    ['second Goal change', { phase: 'paused' as const }],
    ['wrong max rounds', { maxGoalRounds: 2 }],
  ])('rejects strict preflight for %s without mutating durable state', async (_name, options) => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'rejected-'))
    try {
      const fixture = await persistLiveGoal(dataDir, options)
      const before = snapshotTree(dataDir)
      await expect(preflightGoalResume(fixture.goalId, dataDir, true)).rejects.toThrow(
        'Goal is not eligible for live smoke',
      )
      expect(snapshotTree(dataDir)).toEqual(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('produces a fixed, secret-free zero-request failure receipt', () => {
    const secret = `sk-live-${randomUUID()}-DO-NOT-LEAK`
    const receipt = createGoalLiveSmokeFailure('preflight-rejected', {
      now: new Date('2026-08-16T12:34:56.789Z'),
      goalId: secret,
      objective: secret,
      error: secret,
    })
    expect(receipt).toEqual({
      schemaVersion: 'tianwen.goal-live-smoke.v1',
      status: 'failed',
      failureCode: 'preflight-rejected',
      timestamp: '2026-08-16T12:34:56.789Z',
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      limits: {
        maxRequests: 3,
        maxOutputTokensPerRequest: 64,
        maxTotalTokens: 32768,
        maxCostCny: 0.25,
        timeoutMs: 90000,
        maxRetries: 0,
      },
      requestCount: 0,
      retryCount: 0,
      markerMatched: false,
    })
    expect(JSON.stringify(receipt)).not.toContain(secret)
  })

  it('preserves unknown child request counts as null', () => {
    const receipt = createGoalLiveSmokeFailure('internal-error', {
      requestCount: null,
      retryCount: null,
    })
    expect(receipt.requestCount).toBeNull()
    expect(receipt.retryCount).toBeNull()
  })

  it('accepts exactly one canonical child receipt and sanitizes every malformed child output', () => {
    const canonical = `${JSON.stringify(createGoalLiveSmokeFailure('provider-error', {
      now: new Date('2026-08-16T12:34:56.789Z'),
    }))}\n`
    const successWithSecret = `${JSON.stringify({
      schemaVersion: 'tianwen.goal-live-smoke.v1',
      status: 'succeeded',
      timestamp: '2026-08-16T12:34:56.789Z',
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      limits: JSON.parse(canonical).limits,
      requestCount: 3,
      retryCount: 0,
      markerMatched: true,
      providerError: 'provider-error-SENTINEL',
    })}\n`
    expect(parseGoalLiveSmokeChildReceipt(canonical, 'child stderr sentinel')).toEqual(JSON.parse(canonical))
    const secret = `provider-error-${randomUUID()}-DO-NOT-LEAK`
    for (const stdout of [
      `${canonical}${canonical}`,
      '{not-json}\n',
      `${JSON.stringify({ schemaVersion: 'wrong' })}\n`,
      `${'x'.repeat(65_537)}\n`,
      '',
      `${JSON.stringify({ ...JSON.parse(canonical), objective: secret })}\n`,
      successWithSecret,
    ]) {
      const receipt = parseGoalLiveSmokeChildReceipt(stdout, 'child stderr sentinel')
      expect(receipt.failureCode).toBe('internal-error')
      expect(receipt.requestCount).toBeNull()
      expect(receipt.retryCount).toBeNull()
      expect(JSON.stringify(receipt)).not.toContain('child stderr sentinel')
      expect(JSON.stringify(receipt)).not.toContain(secret)
      expect(JSON.stringify(receipt)).not.toContain('provider-error-SENTINEL')
    }
  })

  it('rejects live-smoke grammar before state inspection and prints a sanitized receipt after valid strict parsing', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'cli-'))
    try {
      const fixture = await persistLiveGoal(dataDir)
      const before = snapshotTree(dataDir)
      for (const args of [
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke'],
        ['resume', '--data-dir', dataDir, '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', 'relative', '--live-smoke', '--json'],
        ['create', '--objective', 'x', '--data-dir', dataDir, '--live-smoke'],
        ['status', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke'],
        ['list', '--data-dir', dataDir, '--live-smoke'],
        ['model', 'status', '--data-dir', dataDir, '--live-smoke'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--objective', 'untrusted', '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--max-rounds', '2', '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke', '--json', 'extra'],
        ['resume', '--goal', fixture.goalId, '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--data-dir', dataDir, '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke', '--live-smoke', '--json'],
        ['resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke', '--json', '--json'],
      ]) {
        const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
        expect(result.status).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('Usage:')
        expect(snapshotTree(dataDir)).toEqual(before)
      }
      const result = spawnSync(process.execPath, [
        CLI, 'resume', '--goal', fixture.goalId, '--data-dir', dataDir, '--live-smoke', '--json',
      ], { encoding: 'utf8' })
      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim().split('\n')).toHaveLength(1)
      expect(JSON.parse(result.stdout).failureCode).toBe('preflight-rejected')
      expect(snapshotTree(dataDir)).toEqual(before)
      const rootResult = spawnSync(process.execPath, [
        CLI, 'resume', '--goal', `tianwen-goal-${randomUUID()}`,
        '--data-dir', resolve('D:/DevData'), '--live-smoke', '--json',
      ], { encoding: 'utf8' })
      expect(rootResult.status).toBe(1)
      expect(rootResult.stderr).toBe('')
      expect(JSON.parse(rootResult.stdout).failureCode).toBe('preflight-rejected')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
