import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DynamicCordisRunnerService,
  SessionId,
  createUserMessage,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolGoal,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

function nextEventLoopTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('Tianwen runtime Session and Evidence recovery', () => {
  it('keeps recovered Goals disarmed and replays minimal Evidence identically', async () => {
    const base = process.platform === 'win32'
      ? 'D:/DevData/tianwen-dsh-migration-phase-1'
      : resolve('tmp/tianwen-dsh-migration-phase-1')
    mkdirSync(base, { recursive: true })
    const sessionRoot = mkdtempSync(join(base, 'sessions-task2-'))
    const evolutionRoot = mkdtempSync(join(base, 'evolution-task2-'))
    const sessionId = SessionId(`phase1-${randomUUID()}`)
    let first: Awaited<ReturnType<typeof mountGoalHarness>> | undefined
    let second: Awaited<ReturnType<typeof mountGoalHarness>> | undefined
    let third: Awaited<ReturnType<typeof mountGoalHarness>> | undefined

    try {
      first = await mountGoalHarness(sessionRoot, [
        toolCallResponse('phase1-goal', 'create_goal', {
          objective: 'prove the Phase 1 runtime slice',
          max_goal_rounds: 1,
        }),
        textResponse('goal created'),
      ], { goalRoundDriver: false })
      await first.ctx.plugin(toolGoal, {})
      await first.ctx.plugin(DynamicCordisRunnerService, {})
      await apply(first.ctx, { evolutionRoot })

      const initial = await first.ctx.agents.create({
        sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      initial.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'create the migration goal' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(first.ctx, initial.agent)
      const createdGoal = first.ctx.goals.get(initial.agent)
      expect(createdGoal).toMatchObject({
        objective: 'prove the Phase 1 runtime slice',
        activation: 'armed',
        maxGoalRounds: 1,
      })
      expect(await first.ctx.sessions.flush(initial.agent.session)).toBe(true)
      await first.ctx.fiber.dispose()
      first = undefined

      second = await mountGoalHarness(sessionRoot, [
        toolCallResponse('phase1-call', 'echo', {
          text: 'private argument',
        }),
        textResponse('done'),
      ], { goalRoundDriver: true })
      await second.ctx.plugin(DynamicCordisRunnerService, {})
      await apply(second.ctx, { evolutionRoot })
      second.ctx.tools.register(defineTool({
        name: 'echo',
        description: 'return one fixed value',
        parameters: { text: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute() {
          return 'private result'
        },
      }))

      const resumed = await second.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      await nextEventLoopTurn()
      await waitForIdle(second.ctx, resumed.agent)
      const recoveredGoal = second.ctx.goals.get(resumed.agent)
      expect(recoveredGoal?.activation).toBe('disarmed')
      expect(second.adapter.requests).toHaveLength(0)

      second.ctx.goals.resume(resumed.agent, recoveredGoal!)
      await vi.waitFor(
        () => expect(second!.adapter.requests.length).toBeGreaterThan(0),
        { timeout: 2_000 },
      )
      await waitForIdle(second.ctx, resumed.agent)

      const before = second.ctx.tianwenEvidence.project(
        resumed.agent.session,
      )
      const beforeBytes = JSON.stringify(before)
      const sessionBytes = JSON.stringify(resumed.agent.session.events)
      expect(before).toHaveLength(2)
      expect(before.map(record => ({
        callId: record.action.callId,
        toolName: record.action.toolName,
        status: record.outcome.status,
      }))).toEqual([
        {
          callId: 'phase1-goal',
          toolName: 'create_goal',
          status: 'complete',
        },
        {
          callId: 'phase1-call',
          toolName: 'echo',
          status: 'complete',
        },
      ])
      const echoEvidence = before.find(
        record => record.action.callId === 'phase1-call',
      )
      expect(echoEvidence).toMatchObject({
        action: {
          callId: 'phase1-call',
          toolName: 'echo',
          argumentsDigest: expect.stringMatching(/^sha256:/u),
        },
        outcome: {
          status: 'complete',
          resultDigest: expect.stringMatching(/^sha256:/u),
        },
      })
      expect(beforeBytes).not.toContain('prove the Phase 1 runtime slice')
      expect(beforeBytes).not.toContain('private argument')
      expect(beforeBytes).not.toContain('private result')
      expect(beforeBytes).not.toContain('create the migration goal')
      expect(sessionBytes).toContain('prove the Phase 1 runtime slice')
      expect(sessionBytes).toContain('private argument')
      expect(sessionBytes).toContain('private result')
      expect(sessionBytes).toContain('create the migration goal')
      expect(await second.ctx.sessions.flush(resumed.agent.session)).toBe(true)
      await second.ctx.fiber.dispose()
      second = undefined

      third = await mountGoalHarness(
        sessionRoot,
        [],
        { goalRoundDriver: true },
      )
      await third.ctx.plugin(DynamicCordisRunnerService, {})
      await apply(third.ctx, { evolutionRoot })
      const replayed = await third.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      await nextEventLoopTurn()
      await waitForIdle(third.ctx, replayed.agent)
      expect(third.adapter.requests).toHaveLength(0)
      expect(JSON.stringify(
        third.ctx.tianwenEvidence.project(replayed.agent.session),
      )).toBe(beforeBytes)
    } finally {
      if (third !== undefined) await third.ctx.fiber.dispose()
      if (second !== undefined) await second.ctx.fiber.dispose()
      if (first !== undefined) await first.ctx.fiber.dispose()
      rmSync(sessionRoot, { recursive: true, force: true })
      rmSync(evolutionRoot, { recursive: true, force: true })
    }
  })
})
