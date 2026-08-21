import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { PassThrough } from 'node:stream'

import {
  CallId,
  SessionId,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
  toolGoal,
} from '@tianwen/dsh-compat'
import type { StreamChunk } from '@tianwen/dsh-compat'
import { describe, expect, it } from 'vitest'
import { TianwenEvidenceService } from '../../packages/tianwen-evidence/src/index.js'

import {
  LIVE_GOAL_OBJECTIVE,
  assessLiveGoalEvents,
  createGoalLiveSmokeFailure,
  parseGoalLiveSmokeChildReceipt,
} from '../../packages/tianwen-runtime-bundle/src/goal-live-smoke.js'
import { monitorLiveSmokeChild, preflightGoalResume } from '../../packages/tianwen-runtime-bundle/src/resume.js'
import { inject as resumeRunnerInject } from '../../packages/tianwen-runtime-bundle/src/resume-runner.js'

function withUsage(chunks: readonly unknown[], inputTokens: number) {
  return [
    ...chunks.slice(0, -1),
    { type: 'usage' as const, usage: { inputTokens, outputTokens: 10, cacheReadTokens: 5 } },
    chunks.at(-1)!,
  ]
}

function truncatedUpdateGoalResponse(): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta',
      index: 0,
      id: CallId('live-complete-truncated'),
      name: 'update_goal',
      argumentsDelta: '{"partial":"' + 'x'.repeat(48),
    },
    { type: 'usage', usage: { inputTokens: 126, outputTokens: 64, cacheReadTokens: 1536 } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ]
}

function passedChildReceipt() {
  return {
    schemaVersion: 'tianwen.goal-live-smoke.v1', status: 'passed',
    timestamp: '2026-08-16T12:34:56.789Z', provider: 'deepseek-official', model: 'deepseek-v4-pro',
    limits: { maxRequests: 3, maxOutputTokensPerRequest: 128, maxTotalTokens: 32768, maxCostCny: 0.25, timeoutMs: 90000, maxRetries: 0 },
    requestCount: 3, retryCount: 0, markerMatched: true,
    goal: { id: 'goal-receipt', revision: 3, phase: 'complete', roundsStarted: 1 },
    session: { id: 'session-receipt', eventCountDelta: 12 },
    usage: { inputTokens: 300, outputTokens: 30, cacheReadTokens: 15, cacheWriteTokens: 0, totalTokens: 345, estimatedCostCny: 0.001080375 },
    evidence: [
      { evidenceId: 'sha256:action', toolName: 'tianwen_smoke_action', outcome: 'complete' },
      { evidenceId: 'sha256:update', toolName: 'update_goal', outcome: 'complete' },
    ],
    governance: { evolutionUnchanged: true, championUnchanged: true },
  }
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
  it('hard-stops one unclosed live child after the fixed deadline grace and emits one sanitized timeout', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), killCalls: 0,
      kill() { this.killCalls += 1; this.emit('close', 1, null); return true },
    })
    const timers: { callback: () => void, delay: number }[] = []
    const cleared: number[] = []
    const output: string[] = []
    const exit = monitorLiveSmokeChild(child as never, {
      dataDir: 'D:/DevData/test', evolutionRoot: 'D:/DevData/test/state/evolution', goalId: 'goal-safe',
      revision: 1, sessionId: 'tianwen-goal-safe', sessionsRoot: 'D:/DevData/test/dsh-home/sessions',
      liveSmoke: true,
    }, 1_000, {
      now: () => 1_000,
      setTimeout: (callback, delay) => {
        timers.push({ callback, delay })
        return timers.length as never
      },
      clearTimeout: timer => { cleared.push(timer as never as number) },
      write: line => { output.push(line) },
    })
    child.stdout.write(`child-secret-${randomUUID()}`)
    child.stderr.write(`child-secret-${randomUUID()}`)
    expect(timers.map(timer => timer.delay)).toEqual([90_000])

    timers[0]!.callback()
    expect(child.killCalls).toBe(0)
    expect(timers.map(timer => timer.delay)).toEqual([90_000, 5_000])
    expect(timers.reduce((total, timer) => total + timer.delay, 0)).toBe(95_000)
    timers[1]!.callback()

    await expect(exit).resolves.toBe(1)
    expect(child.killCalls).toBe(1)
    expect(cleared).toEqual([1, 2])
    expect(output).toHaveLength(1)
    expect(JSON.parse(output[0]!.trim())).toMatchObject({
      schemaVersion: 'tianwen.goal-live-smoke.v1', status: 'failed', failureCode: 'timeout',
      requestCount: null, retryCount: null,
    })
    expect(output[0]).not.toContain('child-secret-')
    child.emit('close', 1, null)
    expect(output).toHaveLength(1)
  })

  it('declares every Cordis service consumed by ordinary and live Goal resumes', () => {
    expect(resumeRunnerInject).toEqual([
      'agentDefaultModel', 'agents', 'credentials', 'goals', 'llm', 'sessions', 'tianwenEvidence',
      'tianwenLearningIntake',
    ])
  })

  it.each([
    ['four requests', { requestCount: 4 }],
    ['a retry', { retryCount: 1 }],
    ['wrong rounds', { goal: { ...passedChildReceipt().goal, roundsStarted: 2 } }],
    ['invalid total', { usage: { ...passedChildReceipt().usage, totalTokens: 344 } }],
    ['over-budget total', { usage: { ...passedChildReceipt().usage, inputTokens: 32769, totalTokens: 32814 } }],
    ['duplicate evidence', { evidence: [passedChildReceipt().evidence[0], passedChildReceipt().evidence[0]] }],
    ['extra nested key', { governance: { ...passedChildReceipt().governance, extra: true } }],
  ])('rejects a forged child success receipt with %s', (_name, patch) => {
    const receipt = { ...passedChildReceipt(), ...patch }
    expect(parseGoalLiveSmokeChildReceipt(`${JSON.stringify(receipt)}\n`, '')).toMatchObject({
      status: 'failed', failureCode: 'internal-error', requestCount: null, retryCount: null,
    })
  })

  it.each([
    ['a different Goal', { goal: { ...passedChildReceipt().goal, id: 'other-goal' } }],
    ['a different Session', { session: { ...passedChildReceipt().session, id: 'other-session' } }],
  ])('rejects a child success receipt for %s', (_name, patch) => {
    const receipt = { ...passedChildReceipt(), ...patch }
    expect(parseGoalLiveSmokeChildReceipt(`${JSON.stringify(receipt)}\n`, '', {
      goalId: 'goal-receipt', sessionId: 'session-receipt',
    })).toMatchObject({ status: 'failed', failureCode: 'internal-error' })
  })

  it('accepts the exact child Goal and Session binding', () => {
    const child = passedChildReceipt()
    expect(parseGoalLiveSmokeChildReceipt(`${JSON.stringify(child)}\n`, '', {
      goalId: child.goal.id, sessionId: child.session.id,
    })).toMatchObject({ status: 'passed' })
  })

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

  it('rejects an update call that precedes the action result in durable event order', () => {
    const assistant = (seq: number, text = '') => ({
      type: 'assistant/message', seq, time: seq,
      data: { turn: 1, step: seq, usage: { inputTokens: 1, outputTokens: 1 }, message: {
        content: text === '' ? [] : [{ type: 'text', text }],
      } },
    })
    const events = [
      assistant(1),
      { type: 'tool/call', seq: 2, time: 2, data: { callId: 'action', name: 'tianwen_smoke_action', arguments: '{}' } },
      { type: 'tool/call', seq: 3, time: 3, data: { callId: 'update', name: 'update_goal', arguments: '{"goal_id":"goal-id","revision":2,"action":"complete"}' } },
      { type: 'tool/result', seq: 4, time: 4, data: { message: { source: { callId: 'action' } } } },
      { type: 'tool/result', seq: 5, time: 5, data: { message: { source: { callId: 'update' } } } },
      assistant(6),
      assistant(7, 'TIANWEN_GOAL_ROUND_OK'),
    ]
    expect(assessLiveGoalEvents('goal-session', events as never, { id: 'goal-id', revision: 2 }))
      .toEqual({ ok: false, failureCode: 'tool-contract-violated' })
  })

  it.each([
    ['a duplicate action', (events: any[]) => { events.splice(3, 0, { ...events[1], seq: 25 }) }, 'tool-contract-violated'],
    ['wrong update arguments', (events: any[]) => { events[3].data.arguments = '{"goal_id":"goal-id","revision":2,"action":"pause"}' }, 'tool-contract-violated'],
    ['an action result error', (events: any[]) => { events[2].data.error = { message: 'failed' } }, 'tool-contract-violated'],
    ['a missing update', (events: any[]) => { events.splice(3, 2) }, 'tool-contract-violated'],
    ['a wrong final marker', (events: any[]) => { events[6].data.message.content[0].text = 'wrong marker' }, 'marker-mismatch'],
  ])('rejects durable live events with %s', (_name, mutate, failureCode) => {
    const assistant = (seq: number, text = '') => ({
      type: 'assistant/message', seq, time: seq,
      data: { turn: 1, step: seq, usage: { inputTokens: 1, outputTokens: 1 }, message: {
        content: text === '' ? [] : [{ type: 'text', text }],
      } },
    })
    const events: any[] = [
      assistant(1),
      { type: 'tool/call', seq: 2, time: 2, data: { callId: 'action', name: 'tianwen_smoke_action', arguments: '{}' } },
      { type: 'tool/result', seq: 3, time: 3, data: { message: { source: { callId: 'action' } } } },
      { type: 'tool/call', seq: 4, time: 4, data: { callId: 'update', name: 'update_goal', arguments: '{"goal_id":"goal-id","revision":2,"action":"complete"}' } },
      { type: 'tool/result', seq: 5, time: 5, data: { message: { source: { callId: 'update' } } } },
      assistant(6), assistant(7, 'TIANWEN_GOAL_ROUND_OK'),
    ]
    mutate(events)
    expect(assessLiveGoalEvents('goal-session', events as never, { id: 'goal-id', revision: 2 }))
      .toEqual({ ok: false, failureCode })
  })

  it.each([
    ['an offline selection', { provider: 'tianwen-probe', model: 'scripted' }, true, 'selection-mismatch'],
    ['a missing credential', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, false, 'credential-missing'],
    ['an unresolved exact route', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, true, 'selection-mismatch'],
  ])('fails closed before a provider call for %s', async (_name, selection, configured, failureCode) => {
    const harness = await mountGoalHarness(join(FIXTURE_BASE, `preflight-${randomUUID()}`), [], { goalRoundDriver: false })
    try {
      harness.ctx.provide('agentDefaultModel', { currentSelection: () => selection })
      harness.ctx.provide('credentials', { describe: async () => ({ configured, writable: false }) })
      const { runGoalResume } = await import('../../packages/tianwen-runtime-bundle/src/resume-runner.js')
      const receipt = await runGoalResume(harness.ctx, {
        goalId: 'goal-preflight', json: true, nonce: 'test-nonce', revision: 1, sessionId: 'session-preflight',
        liveSmoke: true, evolutionRoot: join(FIXTURE_BASE, 'evolution-preflight'), startedAtMs: Date.now(),
      } as never)
      expect(receipt).toMatchObject({ status: 'failed', failureCode, requestCount: 0, retryCount: 0 })
      expect(harness.adapter.requests).toHaveLength(0)
      expect(JSON.stringify(receipt)).not.toContain('goal-preflight')
    } finally {
      await harness.ctx.fiber.dispose()
    }
  })

  it.each([
    ['runs exactly the fixed three-request Goal round with the two allowed tools', 'success', 'pass', false],
    ['maps a false business flush to persistence-unavailable and still releases the runner', 'success', 'false', false],
    ['maps a rejected business flush to persistence-unavailable and still releases the runner', 'success', 'reject', false],
    ['rejects removal of an empty evolution directory', 'success', 'pass', true],
    ['stops a provider failure before a global retry listener', 'provider-error', 'pass', false],
    ['rejects the fourth AgentLoop request before the provider', 'request-limit-exceeded', 'pass', false],
    ['cancels an already-expired provider request without waiting ninety seconds', 'timeout', 'pass', false],
    ['does not fabricate an update call from an unfinished tool-call delta', 'truncated', 'pass', false],
    ['completes the cap-sensitive update call at the fixed output ceiling', 'cap-sensitive', 'pass', false],
  ] as const)('%s', async (_name, scenario, flushMode, mutateEvolution) => {
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

      const removedDirectory = join(dataDir, 'state', 'evolution', 'empty-artifact-directory')
      if (mutateEvolution) mkdirSync(removedDirectory, { recursive: true })
      const script = scenario === 'provider-error'
        ? [new Error('provider-secret-sentinel')]
        : scenario === 'request-limit-exceeded'
          ? [
            withUsage(toolCallResponse('limit-action-1', 'tianwen_smoke_action', {}), 100),
            withUsage(toolCallResponse('limit-action-2', 'tianwen_smoke_action', {}), 101),
            withUsage(toolCallResponse('limit-action-3', 'tianwen_smoke_action', {}), 102),
          ]
          : scenario === 'truncated'
            ? [
              withUsage(toolCallResponse('live-action', 'tianwen_smoke_action', {}), 100),
              truncatedUpdateGoalResponse(),
            ]
            : [
              withUsage(toolCallResponse('live-action', 'tianwen_smoke_action', {}), 100),
              scenario === 'cap-sensitive'
                ? request => request.maxTokens === 128
                  ? withUsage(toolCallResponse('live-complete', 'update_goal', {
                    goal_id: String(goal.id), revision: 2, action: 'complete',
                  }), 126)
                  : truncatedUpdateGoalResponse()
                : withUsage(toolCallResponse('live-complete', 'update_goal', {
                  action: 'complete', revision: 2, goal_id: String(goal.id),
                }), 101),
              withUsage(textResponse('TIANWEN_GOAL_ROUND_OK'), 102),
            ]
      const second = await mountGoalHarness(sessionsRoot, script, { goalRoundDriver: true })
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
          async execute() {
            if (mutateEvolution) rmSync(removedDirectory, { recursive: true, force: true })
            return 'live-goal-action-ok'
          },
        }))
        second.ctx.provide('agentDefaultModel', {
          currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
        })
        second.ctx.provide('credentials', {
          describe: async () => ({ configured: true, writable: false }),
        })
        let globalRetryCalls = 0
        second.ctx.on('agent/request-error', async () => { globalRetryCalls += 1 })

        const { runGoalResume } = await import(
          '../../packages/tianwen-runtime-bundle/src/resume-runner.js'
        )
        let flushCalls = 0
        const receipt = await runGoalResume(second.ctx, {
          goalId: String(goal.id), json: true, nonce: 'test-nonce', revision: 1,
          sessionId: String(sessionId), liveSmoke: true, evolutionRoot: join(dataDir, 'state', 'evolution'),
          startedAtMs: scenario === 'timeout' ? Date.now() - 90_000 : Date.now(),
        } as never, {
          flush: async session => {
            flushCalls += 1
            if (flushMode === 'false') return false
            if (flushMode === 'reject') throw new Error('flush sentinel')
            return second.ctx.sessions.flush(session)
          },
        })

        if (flushMode !== 'pass' || mutateEvolution || !['success', 'cap-sensitive'].includes(scenario)) {
          expect(receipt).toMatchObject({
            status: 'failed', failureCode: scenario === 'success'
              ? mutateEvolution ? 'internal-error' : 'persistence-unavailable'
              : scenario === 'truncated' ? 'usage-invalid'
              : scenario,
            requestCount: scenario === 'provider-error' ? 1 : scenario === 'timeout' ? 0 : scenario === 'truncated' ? 2 : 3,
            retryCount: 0,
          })
          expect(second.adapter.requests).toHaveLength(
            scenario === 'provider-error' ? 1 : scenario === 'timeout' ? 0 : scenario === 'truncated' ? 2 : 3,
          )
          expect(flushCalls).toBeGreaterThanOrEqual(scenario === 'timeout' ? 1 : 2)
          expect(globalRetryCalls).toBe(0)
          expect(JSON.stringify(receipt)).not.toContain('provider-secret-sentinel')
          if (scenario === 'truncated') {
            const events = (await second.ctx.sessionPersistence.inspect(sessionId)).events
            const calls = events.filter(event => event.type === 'tool/call')
            const results = events.filter(event => event.type === 'tool/result')
            expect(calls.map(event => event.data.name)).toEqual(['tianwen_smoke_action'])
            expect(results.map(event => String(event.data.message.source.callId)))
              .toEqual(calls.map(event => String(event.data.callId)))
          }
          const released = await second.ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
          })
          if (scenario === 'truncated') {
            expect(second.ctx.goals.get(released.agent)).toMatchObject({
              phase: 'active', activation: 'disarmed', roundsStarted: 1,
            })
          } else if (scenario === 'provider-error' || scenario === 'timeout') {
            expect(second.ctx.goals.get(released.agent)).toMatchObject({ phase: 'active', activation: 'disarmed' })
          }
          await released.dispose()
          return
        }

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
          expect(request.maxTokens).toBe(128)
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
        maxOutputTokensPerRequest: 128,
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
