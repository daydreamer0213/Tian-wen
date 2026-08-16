import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import {
  SessionId,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
  toolGoal,
} from '@tianwen/dsh-compat'
import { describe, expect, it } from 'vitest'
import { TianwenEvidenceService } from '../../packages/tianwen-evidence/src/index.js'

import {
  LIVE_GOAL_OBJECTIVE,
  assessLiveGoalEvents,
  createGoalLiveSmokeFailure,
  parseGoalLiveSmokeChildReceipt,
} from '../../packages/tianwen-runtime-bundle/src/goal-live-smoke.js'
import { preflightGoalResume } from '../../packages/tianwen-runtime-bundle/src/resume.js'

function withUsage(chunks: readonly unknown[], inputTokens: number) {
  return [
    ...chunks.slice(0, -1),
    { type: 'usage' as const, usage: { inputTokens, outputTokens: 10, cacheReadTokens: 5 } },
    chunks.at(-1)!,
  ]
}

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
  it.each([
    ['missing usage', [undefined, undefined, undefined], 'usage-invalid'],
    ['unsafe usage', [{ inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 }], 'usage-invalid'],
    ['token total above the fixed cap', [{ inputTokens: 32769, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 }], 'token-budget-exceeded'],
  ])('rejects %s from durable assistant events', (_name, usages, failureCode) => {
    const events = usages.map((usage, index) => ({
      type: 'assistant/message', seq: index, time: index,
      data: { turn: 1, step: index + 1, message: { content: [] }, usage },
    }))
    expect(assessLiveGoalEvents('goal-session', events as never, { id: 'goal-id', revision: 2 }))
      .toEqual({ ok: false, failureCode })
  })

  it('runs exactly the fixed three-request Goal round with the two allowed tools', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'round-'))
    const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
    const sessionId = SessionId(`tianwen-goal-${randomUUID()}`)
    const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
    try {
      const initial = await first.ctx.agents.create({
        sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      const goal = first.ctx.goals.create(initial.agent, {
        objective: LIVE_GOAL_OBJECTIVE,
        maxGoalRounds: 1,
      })
      await first.ctx.sessions.flush(initial.agent.session)
      await initial.dispose()

      const second = await mountGoalHarness(sessionsRoot, [
        withUsage(toolCallResponse('live-action', 'tianwen_smoke_action', {}), 100),
        withUsage(toolCallResponse('live-complete', 'update_goal', {
          goal_id: String(goal.id), revision: 2, action: 'complete',
        }), 101),
        withUsage(textResponse('TIANWEN_GOAL_ROUND_OK'), 102),
      ], { goalRoundDriver: true })
      try {
        second.adapter.resolveModel = async (provider, model) => ({
          provider,
          id: model,
          name: model,
          reasoning: { efforts: [{ id: 'off', name: 'off' }] },
        })
        second.ctx.llm.registerAdapter(['deepseek-official'], second.adapter)
        await second.ctx.plugin(toolGoal, {})
        await second.ctx.plugin(TianwenEvidenceService)
        second.ctx.tools.register(defineTool({
          name: 'tianwen_smoke_action',
          description: 'Return the fixed live Goal smoke value.',
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          async execute() { return 'live-goal-action-ok' },
        }))
        second.ctx.provide('agentDefaultModel', {
          currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
        })
        second.ctx.provide('credentials', {
          describe: async () => ({ configured: true, writable: false }),
        })

        const { runGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume-runner.js'
        )
        const receipt = await runGoalResume(second.ctx, {
          goalId: String(goal.id), json: true, nonce: 'test-nonce', revision: 1,
          sessionId: String(sessionId), liveSmoke: true, evolutionRoot: join(dataDir, 'state', 'evolution'),
          startedAtMs: Date.now(),
        } as never)

        expect(receipt).toMatchObject({
          schemaVersion: 'tianwen.goal-live-smoke.v1',
          status: 'passed',
          provider: 'deepseek-official',
          model: 'deepseek-v4-pro',
          requestCount: 3,
          retryCount: 0,
          markerMatched: true,
          goal: { id: String(goal.id), phase: 'complete', roundsStarted: 1 },
          session: { id: String(sessionId), eventCountDelta: expect.any(Number) },
          evidence: [
            { toolName: 'tianwen_smoke_action', outcome: 'complete' },
            { toolName: 'update_goal', outcome: 'complete' },
          ],
          governance: { evolutionUnchanged: true, championUnchanged: true },
        })
        expect(second.adapter.requests).toHaveLength(3)
        expect(second.adapter.requests[0]!.system).toContain(`${String(goal.id)} revision 2`)
        for (const request of second.adapter.requests) {
          expect(request.provider).toBe('deepseek-official')
          expect(request.model).toBe('deepseek-v4-pro')
          expect(request.reasoningEffort).toBe('off')
          expect(request.maxTokens).toBe(64)
          expect(request.tools?.map(tool => tool.name).toSorted())
            .toEqual(['tianwen_smoke_action', 'update_goal'])
        }
        const events = second.adapter.requests.length === 3
          ? (await second.ctx.sessionPersistence.inspect(sessionId)).events
          : []
        const calls = events.filter(event => event.type === 'tool/call')
        const results = events.filter(event => event.type === 'tool/result')
        expect(calls.map(event => event.data.name)).toEqual(['tianwen_smoke_action', 'update_goal'])
        expect(results.map(event => String(event.data.message.source.callId)))
          .toEqual(calls.map(event => String(event.data.callId)))
        expect(events.filter(event => event.type === 'assistant/message').map(event => event.data.usage))
          .toHaveLength(3)
        const checked = await second.ctx.agents.resume({
          resumeSessionId: sessionId,
          agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
        })
        try {
          expect(second.ctx.goals.get(checked.agent)).toMatchObject({ phase: 'complete', activation: 'disarmed' })
        } finally {
          await checked.dispose()
        }
        const serialized = JSON.stringify(receipt)
        for (const secret of [LIVE_GOAL_OBJECTIVE, 'TIANWEN_GOAL_ROUND_OK', '{}', 'live-goal-action-ok']) {
          expect(serialized).not.toContain(secret)
        }
      } finally {
        await second.ctx.fiber.dispose()
      }
    } finally {
      await first.ctx.fiber.dispose()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

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
