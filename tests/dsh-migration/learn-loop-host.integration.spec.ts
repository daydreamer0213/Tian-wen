import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Agent } from '@deepseek-ai/dsh-agent'
import { describe, expect, it } from 'vitest'

import {
  SessionId,
  mountGoalHarness,
  textResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import {
  bindLongGoalTask,
  createLongGoal,
  readLongGoal,
  readLongGoalStatus,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import { runCurrentWebTask } from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-learn-loop-host-integration')

describe('Tianwen Long Goal Web host integration', () => {
  it('persists the Task binding before the real Goal driver starts its first turn', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const fixture = mkdtempSync(join(FIXTURE_BASE, 'host-'))
    const stateRoot = join(fixture, 'state')
    const sessionsRoot = join(fixture, 'sessions')
    const evolutionRoot = join(stateRoot, 'evolution')
    const harness = await mountGoalHarness(
      sessionsRoot,
      [textResponse('Task round complete')],
      { goalRoundDriver: true },
    )
    const agents = new Map<string, Agent>()
    let sequence = 0
    let bindingObservedAt = Number.POSITIVE_INFINITY
    let turnStartObservedAt = Number.POSITIVE_INFINITY

    harness.ctx.on('session/event', (_session, event) => {
      if (event.type === 'turn/start' && turnStartObservedAt === Number.POSITIVE_INFINITY) {
        turnStartObservedAt = ++sequence
      }
    })

    try {
      const record = createLongGoal({
        stateRoot,
        objective: 'Ship release',
        tasks: ['Prepare notes', 'Publish'],
        maxTaskRounds: 1,
      })

      const result = await runCurrentWebTask({
        roots: { stateRoot, sessionsRoot, evolutionRoot },
        longGoalId: record.id,
        initialCwd: fixture,
      }, {
        readLongGoal,
        readLongGoalStatus,
        bindLongGoalTask: (...args) => {
          const bound = bindLongGoalTask(...args)
          bindingObservedAt = ++sequence
          return bound
        },
        listSessions: async () => [],
        createSession: async ({ cwd }) => {
          const sessionId = SessionId(`learn-loop-${randomUUID()}`)
          const created = await harness.ctx.agents.create({
            sessionId,
            agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
            sessionOptions: { meta: { cwd } },
          })
          agents.set(String(sessionId), created.agent)
          return String(sessionId)
        },
        attachedAgent: sessionId => agents.get(sessionId),
        createGoal: (agent, input) => harness.ctx.goals.create(agent, input),
        readGoalRef: async () => {
          throw new Error('cold ref reads are outside this fresh-admission proof')
        },
        resumeColdGoal: async () => {
          throw new Error('cold resume is outside this fresh-admission proof')
        },
        flushSession: async agent => {
          await harness.ctx.sessions.flush(agent.session)
        },
      })

      const agent = agents.get(result.sessionId!)!
      await waitForIdle(harness.ctx, agent)
      await harness.ctx.sessions.flush(agent.session)

      const bound = readLongGoal(stateRoot, record.id).tasks[0]!
      const events = agent.session.events
      expect(bound.execution?.sessionId).toBe(String(agent.session.id))
      expect(events.some(event => event.type === 'turn/start')).toBe(true)
      expect(bindingObservedAt).toBeLessThan(turnStartObservedAt)
    } finally {
      await harness.ctx.fiber.dispose()
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
