import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { mountGoalHarness, SessionId } from '@tianwen/dsh-compat'
import { readLongGoalStatusWithLiveAdmission } from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'
import { appendTianwenAttemptStarted, bindGoalFirstLongGoalTask, commitLongGoalPlan, createContinuousLongGoal, readLongGoalStatus } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import { GoalStatusIntegrityError, GoalStatusNotFoundError } from '../../packages/tianwen-runtime-bundle/src/status.js'

const BASE = resolve('D:/DevData/tianwen-live-status-flush-20261005/test-roots')
async function fixture() {
  mkdirSync(BASE, { recursive: true })
  const root = mkdtempSync(join(BASE, 'status-')), sessionsRoot = join(root, 'sessions'), stateRoot = join(root, 'state')
  const h = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('live-status-task'), meta: { cwd: root, agentPreset: 'standard' },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  const agent = handle.agent, native = h.ctx.goals.create(agent, { objective: 'Report original status', maxGoalRounds: 3 })
  let record = createContinuousLongGoal({ stateRoot, objective: 'Report original status', context: null, successCriteria: null,
    workspaceRoot: root, agentPreset: 'standard', controlSessionId: 'control' })
  record = commitLongGoalPlan({ stateRoot, longGoalId: record.id, expectedRevision: record.revision, outcome: 'continue',
    tasks: [{ objective: native.objective }], consideredSettledTasks: 0 }) as LongGoalRecordV3
  const taskId = record.tasks[0]!.id
  record = appendTianwenAttemptStarted({ stateRoot, longGoalId: record.id, expectedRevision: record.revision, taskId,
    epoch: 1, parentSessionId: record.planner.sessionId, childSessionId: String(agent.id), permissionFingerprint: `sha256:${'a'.repeat(64)}`,
    permissionMode: 'workspace-write', startedAt: new Date().toISOString() })
  record = bindGoalFirstLongGoalTask({ stateRoot, longGoalId: record.id, expectedRevision: record.revision, taskId,
    execution: { goalId: String(native.id), sessionId: String(agent.id) } }) as LongGoalRecordV3
  const missing = new GoalStatusNotFoundError(String(native.id))
  const readStatus = vi.fn<typeof readLongGoalStatus>().mockRejectedValueOnce(missing).mockImplementation(readLongGoalStatus)
  const deps = { readStatus, attachedAgent: vi.fn(() => agent), getGoal: vi.fn(() => h.ctx.goals.get(agent)),
    flushSession: vi.fn(async () => { if (!await h.ctx.sessions.flush(agent.session)) throw new Error('persistence unavailable') }) }
  const input = { stateRoot, longGoalId: record.id, dshStatusTarget: { sessionsRoot, evolutionRoot: join(stateRoot, 'evolution') } }
  return { ...h, agent, native, record, missing, deps, input, async cleanup() {
    await handle.dispose(); await h.ctx.fiber.dispose()
    if (!resolve(root).startsWith(`${BASE}${sep}`)) throw new Error('unexpected fixture path')
    rmSync(root, { recursive: true, force: true })
  } }
}

describe('continuous Goal live status persistence barrier', () => {
  it('flushes the exact existing SDK Goal and reads its durable status once, without new events or model requests', async () => {
    const f = await fixture()
    try {
      const events = [...f.agent.session.events]
      const status = await readLongGoalStatusWithLiveAdmission(f.input, f.deps)
      expect(status.tasks[0]).toMatchObject({ phase: 'active', execution: { goalId: f.native.id, sessionId: f.agent.id } })
      expect(f.deps.flushSession).toHaveBeenCalledExactlyOnceWith(f.agent)
      expect(f.deps.readStatus).toHaveBeenCalledTimes(2)
      expect(f.agent.session.events).toEqual(events)
      expect(f.adapter.requests).toEqual([])
    } finally { await f.cleanup() }
  })

  it('leaves an already readable status on the original read path', async () => {
    const f = await fixture()
    try {
      await f.ctx.sessions.flush(f.agent.session)
      f.deps.readStatus.mockReset().mockImplementation(readLongGoalStatus)
      await readLongGoalStatusWithLiveAdmission(f.input, f.deps)
      expect(f.deps.flushSession).not.toHaveBeenCalled()
      expect(f.deps.readStatus).toHaveBeenCalledTimes(1)
    } finally { await f.cleanup() }
  })

  it('retains NotFound when there is no live Agent', async () => {
    const f = await fixture()
    try {
      await expect(readLongGoalStatusWithLiveAdmission(f.input, { ...f.deps, attachedAgent: () => undefined })).rejects.toBe(f.missing)
      expect(f.deps.flushSession).not.toHaveBeenCalled()
    } finally { await f.cleanup() }
  })

  it('does not mask an unrelated missing Goal or an integrity error', async () => {
    const f = await fixture()
    try {
      for (const error of [new GoalStatusNotFoundError('unrelated'), new GoalStatusIntegrityError('invalid original status')]) {
        f.deps.readStatus.mockReset().mockRejectedValue(error)
        await expect(readLongGoalStatusWithLiveAdmission(f.input, f.deps)).rejects.toBe(error)
      }
      expect(f.deps.flushSession).not.toHaveBeenCalled()
    } finally { await f.cleanup() }
  })

  it('retains failure for a mismatched live Goal or workspace', async () => {
    const f = await fixture()
    try {
      await expect(readLongGoalStatusWithLiveAdmission(f.input, { ...f.deps, getGoal: () => undefined })).rejects.toBe(f.missing)
      f.deps.readStatus.mockReset().mockRejectedValue(f.missing)
      await expect(readLongGoalStatusWithLiveAdmission(f.input, { ...f.deps,
        readRecord: () => ({ ...f.record, workspaceRoot: join(f.record.workspaceRoot, 'other') }) })).rejects.toBe(f.missing)
      expect(f.deps.flushSession).not.toHaveBeenCalled()
    } finally { await f.cleanup() }
  })

  it('propagates flush failure without a second status read', async () => {
    const f = await fixture()
    try {
      const failed = new Error('actual persistence failed')
      f.deps.flushSession.mockRejectedValue(failed)
      await expect(readLongGoalStatusWithLiveAdmission(f.input, f.deps)).rejects.toBe(failed)
      expect(f.deps.readStatus).toHaveBeenCalledTimes(1)
    } finally { await f.cleanup() }
  })

  it('rejects replacement of the Task binding while flush waits', async () => {
    const f = await fixture()
    try {
      const readRecord = vi.fn().mockReturnValueOnce(f.record).mockReturnValue({ ...f.record,
        tasks: [{ ...f.record.tasks[0], execution: { ...f.record.tasks[0]!.execution, sessionId: 'replacement' } }] })
      await expect(readLongGoalStatusWithLiveAdmission(f.input, { ...f.deps, readRecord })).rejects.toThrow('binding changed')
      expect(f.deps.readStatus).toHaveBeenCalledTimes(1)
    } finally { await f.cleanup() }
  })

  it('rejects loss of the exact live Agent while flush waits', async () => {
    const f = await fixture()
    try {
      const attachedAgent = vi.fn().mockReturnValueOnce(f.agent).mockReturnValue(undefined)
      await expect(readLongGoalStatusWithLiveAdmission(f.input, { ...f.deps, attachedAgent })).rejects.toThrow('binding changed')
      expect(f.deps.readStatus).toHaveBeenCalledTimes(1)
    } finally { await f.cleanup() }
  })
})
