import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'
import {
  bindLongGoalTask,
  createLongGoal,
  formatLongGoalStatusText,
  LongGoalIntegrityError,
  readLongGoal,
  readLongGoalStatus,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-ordinary-long-goal-tests')
const GOAL_ID = 'tianwen-long-goal-00000000-0000-4000-8000-000000000001'

function longGoalPath(stateRoot: string, goalId: string): string {
  return join(stateRoot, 'long-goals', `${goalId}.json`)
}

function createStateRoot(): string {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  return mkdtempSync(join(FIXTURE_BASE, 'long-goal-'))
}

async function persistGoal(
  dataDir: string,
  sessionId: string,
  phase: 'active' | 'paused' | 'blocked' | 'complete' = 'active',
): Promise<{ readonly goalId: string, readonly sessionId: string }> {
  const harness = await mountGoalHarness(
    join(dataDir, 'dsh-home', 'sessions'), [], { goalRoundDriver: false },
  )
  const handle = await harness.ctx.agents.create({
    sessionId: SessionId(sessionId),
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
  })
  try {
    let goal = harness.ctx.goals.create(handle.agent, {
      objective: `Persist ${sessionId}`,
      maxGoalRounds: 3,
    })
    if (phase === 'paused') goal = harness.ctx.goals.pause(handle.agent, goal)
    if (phase === 'blocked') {
      goal = harness.ctx.goals.block(handle.agent, goal, {
        code: 'needs-input',
        message: 'Needs user input',
      })
    }
    if (phase === 'complete') goal = harness.ctx.goals.complete(handle.agent, goal)
    await harness.ctx.sessions.flush(handle.agent.session)
    return { goalId: String(goal.id), sessionId }
  } finally {
    await handle.dispose()
    await harness.ctx.fiber.dispose()
  }
}

describe('ordinary long Goal record', () => {
  it('persists one strict ordered record with stable task ids', () => {
    const stateRoot = createStateRoot()
    try {
      const record = createLongGoal({
        stateRoot,
        objective: 'Ship the release',
        tasks: ['Prepare notes', 'Publish release'],
        maxTaskRounds: 3,
      }, {
        id: () => '00000000-0000-4000-8000-000000000001',
        now: () => 10,
      })

      expect(record).toEqual({
        schemaVersion: 'tianwen.long-goal.v1',
        id: GOAL_ID,
        objective: 'Ship the release',
        maxTaskRounds: 3,
        createdAt: 10,
        updatedAt: 10,
        tasks: [
          { id: 'task-1', objective: 'Prepare notes', execution: null },
          { id: 'task-2', objective: 'Publish release', execution: null },
        ],
      })
      expect(record.tasks.map(task => task.id)).toEqual(['task-1', 'task-2'])
      expect(readLongGoal(stateRoot, record.id)).toEqual(record)
      expect(JSON.parse(readFileSync(longGoalPath(stateRoot, record.id), 'utf8')))
        .toEqual(record)
      expect(() => createLongGoal({
        stateRoot,
        objective: 'A second goal',
        tasks: ['A task'],
        maxTaskRounds: 1,
      }, { id: () => '00000000-0000-4000-8000-000000000001' })).toThrow()
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('rejects unsafe generated Long Goal ids before creating a record', () => {
    const stateRoot = createStateRoot()
    try {
      expect(() => createLongGoal({
        stateRoot,
        objective: 'Ship the release',
        tasks: ['Prepare notes'],
        maxTaskRounds: 3,
      }, { id: () => '../outside' })).toThrow('Long Goal id is invalid')
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('rejects traversal Long Goal ids before reading or binding outside the record directory', () => {
    const stateRoot = createStateRoot()
    try {
      const escapedPath = join(stateRoot, 'escaped.json')
      const escaped = {
        schemaVersion: 'tianwen.long-goal.v1',
        id: GOAL_ID,
        objective: 'Escaped record',
        maxTaskRounds: 1,
        createdAt: 1,
        updatedAt: 1,
        tasks: [{ id: 'task-1', objective: 'Escaped task', execution: null }],
      }
      writeFileSync(escapedPath, JSON.stringify(escaped), 'utf8')

      expect(() => readLongGoal(stateRoot, '../escaped')).toThrow('Long Goal id is invalid')
      expect(() => bindLongGoalTask(stateRoot, '../escaped', 'task-1', {
        goalId: 'dsh-goal-1', sessionId: 'dsh-session-1',
      })).toThrow('Long Goal id is invalid')
      expect(readFileSync(escapedPath, 'utf8')).toBe(JSON.stringify(escaped))
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('rejects invalid authored values and malformed durable records without repair', () => {
    const stateRoot = createStateRoot()
    try {
      for (const input of [
        { objective: ' ', tasks: ['Task'], maxTaskRounds: 1 },
        { objective: 'Goal', tasks: [], maxTaskRounds: 1 },
        { objective: 'Goal', tasks: [' '], maxTaskRounds: 1 },
        { objective: 'Goal', tasks: ['Task'], maxTaskRounds: 0 },
      ]) {
        expect(() => createLongGoal({ stateRoot, ...input })).toThrow()
      }

      const malformed = {
        schemaVersion: 'tianwen.long-goal.v1',
        id: 'tianwen-long-goal-malformed',
        objective: 'Goal',
        maxTaskRounds: 1,
        createdAt: 1,
        updatedAt: 1,
        tasks: [
          { id: 'task-1', objective: 'First', execution: null },
          { id: 'task-1', objective: 'Second', execution: null },
        ],
      }
      mkdirSync(join(stateRoot, 'long-goals'), { recursive: true })
      const path = longGoalPath(stateRoot, malformed.id)
      writeFileSync(path, JSON.stringify(malformed), 'utf8')
      const before = readFileSync(path, 'utf8')

      expect(() => readLongGoal(stateRoot, malformed.id)).toThrow()
      expect(readFileSync(path, 'utf8')).toBe(before)

      writeFileSync(path, JSON.stringify({ ...malformed, tasks: [
        { id: 'not-an-ordinal', objective: 'First', execution: null },
      ] }), 'utf8')
      expect(() => readLongGoal(stateRoot, malformed.id)).toThrow()
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('rejects durable bindings that are non-prefix or reuse a Goal or Session id', () => {
    const stateRoot = createStateRoot()
    try {
      for (const record of [
        {
          id: 'tianwen-long-goal-non-prefix',
          tasks: [
            { id: 'task-1', objective: 'First', execution: null },
            { id: 'task-2', objective: 'Second', execution: { goalId: 'goal-2', sessionId: 'session-2' } },
          ],
        },
        {
          id: 'tianwen-long-goal-duplicate-goal',
          tasks: [
            { id: 'task-1', objective: 'First', execution: { goalId: 'goal-1', sessionId: 'session-1' } },
            { id: 'task-2', objective: 'Second', execution: { goalId: 'goal-1', sessionId: 'session-2' } },
          ],
        },
        {
          id: 'tianwen-long-goal-duplicate-session',
          tasks: [
            { id: 'task-1', objective: 'First', execution: { goalId: 'goal-1', sessionId: 'session-1' } },
            { id: 'task-2', objective: 'Second', execution: { goalId: 'goal-2', sessionId: 'session-1' } },
          ],
        },
      ]) {
        const path = longGoalPath(stateRoot, record.id)
        mkdirSync(join(stateRoot, 'long-goals'), { recursive: true })
        const serialized = JSON.stringify({
          schemaVersion: 'tianwen.long-goal.v1',
          objective: 'Strict bindings', maxTaskRounds: 1,
          createdAt: 1, updatedAt: 1, ...record,
        })
        writeFileSync(path, serialized, 'utf8')

        expect(() => readLongGoal(stateRoot, record.id)).toThrow(LongGoalIntegrityError)
        expect(readFileSync(path, 'utf8')).toBe(serialized)
      }
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('binds only one existing unbound task atomically', () => {
    const stateRoot = createStateRoot()
    try {
      const record = createLongGoal({
        stateRoot,
        objective: 'Ship the release',
        tasks: ['Prepare notes', 'Publish release'],
        maxTaskRounds: 3,
      }, { id: () => 'bind-test', now: () => 10 })
      const bound = bindLongGoalTask(stateRoot, record.id, 'task-1', {
        goalId: 'dsh-goal-1', sessionId: 'dsh-session-1',
      }, { now: () => 20 })

      expect(bound).toEqual({
        ...record,
        updatedAt: 20,
        tasks: [
          {
            id: 'task-1', objective: 'Prepare notes',
            execution: { goalId: 'dsh-goal-1', sessionId: 'dsh-session-1' },
          },
          { id: 'task-2', objective: 'Publish release', execution: null },
        ],
      })
      expect(readLongGoal(stateRoot, record.id)).toEqual(bound)
      expect(() => bindLongGoalTask(stateRoot, record.id, 'task-1', {
        goalId: 'other-goal', sessionId: 'other-session',
      })).toThrow()
      expect(() => bindLongGoalTask(stateRoot, record.id, 'task-3', {
        goalId: 'other-goal', sessionId: 'other-session',
      })).toThrow()
      expect(readLongGoal(stateRoot, record.id)).toEqual(bound)
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('binds only the next Task and never reuses another Task binding identity', () => {
    const stateRoot = createStateRoot()
    try {
      const outOfOrder = createLongGoal({
        stateRoot, objective: 'Ordered bindings', tasks: ['First', 'Second'], maxTaskRounds: 1,
      }, { id: () => 'out-of-order-bind', now: () => 1 })
      expect(() => bindLongGoalTask(stateRoot, outOfOrder.id, 'task-2', {
        goalId: 'goal-2', sessionId: 'session-2',
      })).toThrow(LongGoalIntegrityError)

      for (const [id, execution] of [
        ['duplicate-goal-bind', { goalId: 'goal-1', sessionId: 'session-2' }],
        ['duplicate-session-bind', { goalId: 'goal-2', sessionId: 'session-1' }],
      ] as const) {
        const record = createLongGoal({
          stateRoot, objective: 'Unique bindings', tasks: ['First', 'Second'], maxTaskRounds: 1,
        }, { id: () => id, now: () => 1 })
        bindLongGoalTask(stateRoot, record.id, 'task-1', {
          goalId: 'goal-1', sessionId: 'session-1',
        }, { now: () => 2 })

        expect(() => bindLongGoalTask(stateRoot, record.id, 'task-2', execution, { now: () => 3 }))
          .toThrow(LongGoalIntegrityError)
      }
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })
})

describe('ordinary long Goal status projection', () => {
  it('projects durable DSH status without writing state and selects the first incomplete task', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    try {
      const complete = await persistGoal(dataDir, 'long-goal-complete', 'complete')
      const active = await persistGoal(dataDir, 'long-goal-active', 'active')
      const record = createLongGoal({
        stateRoot,
        objective: 'Ship the release',
        tasks: ['Prepare notes', 'Publish release', 'Announce release'],
        maxTaskRounds: 3,
      }, { id: () => 'projection-test', now: () => 10 })
      bindLongGoalTask(stateRoot, record.id, 'task-1', complete, { now: () => 20 })
      bindLongGoalTask(stateRoot, record.id, 'task-2', active, { now: () => 30 })
      const before = readFileSync(longGoalPath(stateRoot, record.id), 'utf8')

      const status = await readLongGoalStatus({
        stateRoot,
        longGoalId: record.id,
        dshStatusTarget: { dataDir },
      })

      expect(status).toMatchObject({
        schemaVersion: 'tianwen.long-goal-status.v1',
        goal: {
          id: record.id, objective: 'Ship the release', phase: 'active',
          completedTasks: 1, totalTasks: 3,
        },
        tasks: [
          { id: 'task-1', phase: 'complete', execution: complete },
          { id: 'task-2', phase: 'active', execution: active },
          { id: 'task-3', phase: 'pending', execution: null },
        ],
        currentTaskId: 'task-2',
        runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
      })
      expect(formatLongGoalStatusText(status)).toContain('1/3')
      expect(formatLongGoalStatusText(status)).toContain('task-2')
      expect(readFileSync(longGoalPath(stateRoot, record.id), 'utf8')).toBe(before)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('fails closed when the bound DSH Session is inconsistent', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    try {
      const actual = await persistGoal(dataDir, 'long-goal-real-session')
      const record = createLongGoal({
        stateRoot,
        objective: 'Ship the release',
        tasks: ['Prepare notes'],
        maxTaskRounds: 3,
      }, { id: () => 'mismatch-test', now: () => 10 })
      bindLongGoalTask(stateRoot, record.id, 'task-1', {
        goalId: actual.goalId,
        sessionId: 'different-session',
      })

      await expect(readLongGoalStatus({
        stateRoot,
        longGoalId: record.id,
        dshStatusTarget: { dataDir },
      })).rejects.toThrow()
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('keeps a fully completed continuous binding sequence valid', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    try {
      const first = await persistGoal(dataDir, 'completed-first', 'complete')
      const second = await persistGoal(dataDir, 'completed-second', 'complete')
      const record = createLongGoal({
        stateRoot,
        objective: 'Completed execution',
        tasks: ['First Task', 'Second Task'],
        maxTaskRounds: 1,
      }, { id: () => 'fully-complete', now: () => 1 })
      bindLongGoalTask(stateRoot, record.id, 'task-1', first, { now: () => 2 })
      bindLongGoalTask(stateRoot, record.id, 'task-2', second, { now: () => 3 })

      await expect(readLongGoalStatus({
        stateRoot,
        longGoalId: record.id,
        dshStatusTarget: { dataDir },
      })).resolves.toMatchObject({
        goal: { phase: 'complete', completedTasks: 2, totalTasks: 2 },
        currentTaskId: null,
      })
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it.each(['active', 'blocked'] as const)(
    'fails closed when a %s current Task has a bound later Task',
    async phase => {
      const dataDir = createStateRoot()
      const stateRoot = join(dataDir, 'state')
      try {
        const first = await persistGoal(dataDir, `current-${phase}`, phase)
        const later = await persistGoal(dataDir, `later-${phase}`, 'active')
        const record = createLongGoal({
          stateRoot,
          objective: 'Ordered execution',
          tasks: ['First Task', 'Later Task'],
          maxTaskRounds: 1,
        }, { id: () => `later-bound-${phase}`, now: () => 1 })
        bindLongGoalTask(stateRoot, record.id, 'task-1', first, { now: () => 2 })
        bindLongGoalTask(stateRoot, record.id, 'task-2', later, { now: () => 3 })

        await expect(readLongGoalStatus({
          stateRoot,
          longGoalId: record.id,
          dshStatusTarget: { dataDir },
        })).rejects.toBeInstanceOf(LongGoalIntegrityError)
      } finally {
        rmSync(dataDir, { recursive: true, force: true })
      }
    },
  )
})
