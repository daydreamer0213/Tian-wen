import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage, mountGoalHarness, SessionId } from '@tianwen/dsh-compat'
import { cancelContinuousTaskAgent } from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

const BASE = resolve('D:/DevData/tianwen-idle-error-pause-20261005/test-roots')

async function fixture() {
  mkdirSync(BASE, { recursive: true })
  const root = mkdtempSync(join(BASE, 'cancel-'))
  const harness = await mountGoalHarness(root, [() => { throw new Error('controlled adapter failure') }], {
    goalRoundDriver: false,
  })
  const handle = await harness.ctx.agents.create({
    sessionId: SessionId('controlled-cancel'),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  const goal = harness.ctx.goals.create(handle.agent, { objective: 'controlled error', maxGoalRounds: 2 })
  return { ...harness, agent: handle.agent, goal, async cleanup() {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
    if (!resolve(root).startsWith(`${BASE}${sep}`)) throw new Error('unexpected fixture root')
    rmSync(root, { recursive: true, force: true })
  } }
}

async function failTurn(f: Awaited<ReturnType<typeof fixture>>) {
  f.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'trigger controlled error' }], source: { kind: 'user' } }))
  await f.agent.whenIdle()
  expect(f.agent.status).toBe('idle')
  const error = f.agent.session.events.findLast(e => e.type === 'turn/end')!
  expect(error).toMatchObject({ data: { reason: { kind: 'error' } } })
  expect(f.ctx.goals.get(f.agent)).toMatchObject({ id: f.goal.id, phase: 'active' })
  return error
}

describe('continuous Goal native cancellation', () => {
  it('pauses an actual idle failed SDK Task, retaining its error and no acceptance', async () => {
    const f = await fixture()
    try {
      const error = await failTurn(f)
      const before = [...f.agent.session.events]
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(f.ctx.goals.get(f.agent)).toMatchObject({ phase: 'paused', activation: 'disarmed' })
      expect(f.agent.session.events.slice(0, before.length)).toEqual(before)
      expect(f.agent.session.events.findLast(e => e.type === 'turn/end')).toBe(error)
      expect(f.agent.session.events.slice(before.length).map(e => e.type)).toEqual(['goal/change'])
      expect(await f.ctx.sessions.flush(f.agent.session)).toBe(true)
    } finally { await f.cleanup() }
  })

  it('uses the current revision after waiting, without overwriting the objective', async () => {
    const f = await fixture()
    try {
      await failTurn(f)
      const originalWait = f.agent.whenIdle.bind(f.agent)
      vi.spyOn(f.agent, 'whenIdle').mockImplementation(async () => {
        await originalWait()
        const current = f.ctx.goals.get(f.agent)!
        f.ctx.goals.edit(f.agent, current, { objective: 'current revised objective' })
      })
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(f.ctx.goals.get(f.agent)).toMatchObject({ phase: 'paused', objective: 'current revised objective', revision: f.goal.revision + 2 })
    } finally { await f.cleanup() }
  })

  it('does not pause an active idle Goal without a failed turn', async () => {
    const f = await fixture()
    try {
      const before = [...f.agent.session.events]
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(f.ctx.goals.get(f.agent)).toEqual(f.goal)
      expect(f.agent.session.events).toEqual(before)
    } finally { await f.cleanup() }
  })

  it('keeps a completed Goal complete after an original error', async () => {
    const f = await fixture()
    try {
      await failTurn(f)
      const complete = f.ctx.goals.complete(f.agent, f.ctx.goals.get(f.agent)!)
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(f.ctx.goals.get(f.agent)).toEqual(complete)
    } finally { await f.cleanup() }
  })

  it('rejects the wrong Goal binding before cancelling', async () => {
    const f = await fixture()
    try {
      const cancel = vi.spyOn(f.agent, 'cancel')
      await expect(cancelContinuousTaskAgent(f.agent, 'goal-wrong', f.ctx.goals)).rejects.toThrow('binding')
      expect(cancel).not.toHaveBeenCalled()
    } finally { await f.cleanup() }
  })

  it('keeps normal running cancellation on the original SDK path', async () => {
    const f = await fixture()
    try {
      f.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'cancel running' }], source: { kind: 'user' } }))
      expect(f.agent.status).toBe('running')
      const pause = vi.spyOn(f.ctx.goals, 'pause')
      const cancel = vi.spyOn(f.agent, 'cancel')
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(cancel).toHaveBeenCalledWith({ kind: 'parent' })
      expect(pause).not.toHaveBeenCalled()
      expect(f.agent.status).toBe('idle')
    } finally { await f.cleanup() }
  })

  it('does not use an old error to pause a newer turn', async () => {
    const f = await fixture()
    try {
      await failTurn(f)
      const originalWait = f.agent.whenIdle.bind(f.agent)
      vi.spyOn(f.agent, 'whenIdle').mockImplementation(async () => {
        await originalWait()
        f.agent.session.append('turn/start', { turn: 2 })
        f.agent.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      })
      await cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)
      expect(f.ctx.goals.get(f.agent)).toMatchObject({ phase: 'active' })
    } finally { await f.cleanup() }
  })

  it('rejects a replacement Goal observed after waiting', async () => {
    const f = await fixture()
    try {
      await failTurn(f)
      const originalWait = f.agent.whenIdle.bind(f.agent)
      vi.spyOn(f.agent, 'whenIdle').mockImplementation(async () => {
        await originalWait()
        f.ctx.goals.complete(f.agent, f.ctx.goals.get(f.agent)!)
        f.ctx.goals.create(f.agent, { objective: 'unrelated replacement', maxGoalRounds: 1 })
      })
      await expect(cancelContinuousTaskAgent(f.agent, String(f.goal.id), f.ctx.goals)).rejects.toThrow('binding mismatch')
      expect(f.ctx.goals.get(f.agent)).toMatchObject({ phase: 'active', objective: 'unrelated replacement' })
    } finally { await f.cleanup() }
  })
})
