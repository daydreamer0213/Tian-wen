import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  SessionId,
  mountGoalHarness,
  textResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'

function findJsonlFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...findJsonlFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(path)
    }
  }
  return files
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('DSH goal recovery', () => {
  it('recovers disarmed and performs exactly one explicitly resumed round', async () => {
    const fixtureBase = process.platform === 'win32'
      ? resolve('D:/DevData/tianwen-dsh-probe/sessions')
      : resolve(process.cwd(), '.dsh-probe/sessions')
    mkdirSync(fixtureBase, { recursive: true })
    const persistenceRoot = mkdtempSync(resolve(fixtureBase, 'goal-recovery-'))
    const sessionId = SessionId(`goal-recovery-${randomUUID()}`)
    let first: Awaited<ReturnType<typeof mountGoalHarness>> | undefined
    let second: Awaited<ReturnType<typeof mountGoalHarness>> | undefined

    try {
      first = await mountGoalHarness(
        persistenceRoot,
        [],
        { goalRoundDriver: false },
      )
      const initial = await first.ctx.agents.create({
        sessionId,
        agentOptions: {
          provider: 'tianwen-probe',
          model: 'scripted',
        },
      })
      const created = first.ctx.goals.create(initial.agent, {
        objective: 'resume safely',
        maxGoalRounds: 1,
      })
      expect(created).toMatchObject({
        objective: 'resume safely',
        phase: 'active',
        maxGoalRounds: 1,
        roundsStarted: 0,
        activation: 'armed',
      })
      expect(first.adapter.requests).toHaveLength(0)
      expect(await first.ctx.sessions.flush(initial.agent.session)).toBe(true)
      await first.ctx.fiber.dispose()
      first = undefined

      const jsonlFiles = findJsonlFiles(persistenceRoot)
      expect(jsonlFiles).toHaveLength(1)
      const durableJsonl = readFileSync(jsonlFiles[0]!, 'utf8')
      expect(durableJsonl).toContain(String(sessionId))
      expect(durableJsonl).toContain('"goal/change"')

      second = await mountGoalHarness(
        persistenceRoot,
        [textResponse('one explicit goal round')],
        { goalRoundDriver: true },
      )
      const resumed = await second.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: {
          provider: 'tianwen-probe',
          model: 'scripted',
        },
      })
      await nextEventLoopTurn()
      await waitForIdle(second.ctx, resumed.agent)
      await nextEventLoopTurn()
      await waitForIdle(second.ctx, resumed.agent)

      const recovered = second.ctx.goals.get(resumed.agent)
      expect(recovered).toMatchObject({
        id: created.id,
        revision: created.revision,
        objective: created.objective,
        phase: created.phase,
        maxGoalRounds: created.maxGoalRounds,
        roundsStarted: created.roundsStarted,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        activation: 'disarmed',
      })
      expect(second.adapter.requests).toHaveLength(0)
      const preResumeEvents = resumed.agent.session.events.filter(
        event => event.seq >= resumed.agent.session.firstLiveSeq,
      )
      expect(preResumeEvents.filter(
        event => event.type === 'goal/change',
      )).toHaveLength(0)
      expect(preResumeEvents.filter(
        event => event.type === 'user/message'
          && event.data.source.kind === 'goal',
      )).toHaveLength(0)
      expect(preResumeEvents.filter(
        event => event.type === 'request/header',
      )).toHaveLength(0)
      const explicitResumeBoundary = resumed.agent.session.seq

      const rearmed = second.ctx.goals.resume(resumed.agent, recovered!)
      expect(rearmed.activation).toBe('armed')
      expect(rearmed).toMatchObject({
        id: recovered!.id,
        revision: recovered!.revision + 1,
      })
      const resumeEvent = resumed.agent.session.events.find(
        event => event.seq >= explicitResumeBoundary
          && event.type === 'goal/change'
          && event.data.operation === 'resume',
      )
      expect(resumeEvent).toMatchObject({
        seq: explicitResumeBoundary,
        data: {
          operation: 'resume',
          goal: {
            id: recovered!.id,
            revision: rearmed.revision,
          },
        },
      })
      await vi.waitFor(
        () => expect(second!.adapter.requests).toHaveLength(1),
        { timeout: 2_000 },
      )
      await waitForIdle(second.ctx, resumed.agent)

      expect(second.ctx.goals.get(resumed.agent)).toMatchObject({
        id: created.id,
        objective: 'resume safely',
        maxGoalRounds: 1,
        roundsStarted: 1,
        phase: 'blocked',
        activation: 'disarmed',
        blockedReason: {
          code: 'round-limit',
        },
      })
      const goalRoundMessages = resumed.agent.session.events.filter(event =>
        event.type === 'user/message'
        && event.data.source.kind === 'goal'
      )
      expect(goalRoundMessages).toHaveLength(1)
      expect(goalRoundMessages[0]!.data.source).toMatchObject({
        goalId: recovered!.id,
        revision: rearmed.revision,
        round: 1,
      })
      expect(goalRoundMessages[0]!.seq).toBeGreaterThan(resumeEvent!.seq)
      const requestHeaders = resumed.agent.session.events.filter(
        event => event.type === 'request/header'
          && event.seq > resumeEvent!.seq,
      )
      expect(requestHeaders).toHaveLength(1)
      expect(requestHeaders[0]!.seq)
        .toBeGreaterThan(goalRoundMessages[0]!.seq)
      expect(second.adapter.requests).toHaveLength(1)
    } finally {
      if (second !== undefined) {
        await second.ctx.fiber.dispose()
      }
      if (first !== undefined) {
        await first.ctx.fiber.dispose()
      }
      rmSync(persistenceRoot, { recursive: true, force: true })
    }
  })
})
