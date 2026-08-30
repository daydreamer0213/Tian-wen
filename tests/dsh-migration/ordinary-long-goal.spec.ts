import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { SessionId, mountGoalHarness } from '@tianwen/dsh-compat'
import {
  abandonBlockedLongGoalTask,
  abandonContinuousGoalTask,
  appendLongGoalGuidance,
  appendContinuousGoalGuidance,
  bindGoalFirstLongGoalTask,
  bindLongGoalTask,
  commitLongGoalPlan,
  createContinuousLongGoal,
  createGoalFirstLongGoal,
  createLongGoal,
  formatLongGoalStatusText,
  findContinuousGoalByControlSession,
  listLongGoals,
  LongGoalIntegrityError,
  LongGoalRevisionConflictError,
  readLongGoal,
  readLongGoalStatus,
  redirectContinuousGoal,
  setContinuousGoalMode,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import { runLongGoalTask } from '../../packages/tianwen-runtime-bundle/src/long-goal-run.js'
import {
  runCurrentWebTask,
  type TianwenLongGoalRunDependencies,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

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
  it('lists strict direct records by newest update without skipping malformed files', () => {
    const stateRoot = createStateRoot()
    try {
      for (const [id, updatedAt] of [
        ['list-oldest', 10],
        ['list-newest', 30],
        ['list-middle', 20],
      ] as const) {
        createLongGoal({
          stateRoot,
          objective: `Goal ${id}`,
          tasks: ['Task'],
          maxTaskRounds: 1,
        }, { id: () => id, now: () => updatedAt })
      }

      expect(listLongGoals(stateRoot).map(record => record.updatedAt)).toEqual([30, 20, 10])

      writeFileSync(join(stateRoot, 'long-goals', 'malformed.json'), '{', 'utf8')
      expect(() => listLongGoals(stateRoot)).toThrow(LongGoalIntegrityError)
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

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

describe('goal-first long Goal v2 records', () => {
  it('keeps an unplanned v2 Goal out of the legacy task executor', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Use goal-first service', context: null, successCriteria: null,
        workspaceRoot: resolve(dataDir, 'workspace'), agentPreset: 'planner',
      }, { goalSuffix: () => 'legacy-guard', plannerSessionId: () => 'planner-legacy-guard', now: () => 1 })

      await expect(runLongGoalTask({
        longGoalId: record.id, productTarget: { kind: 'managed', dataDir }, json: true,
      })).rejects.toThrow('Goal-first Long Goal requires goal-first service')
      expect(stdout).not.toHaveBeenCalled()
    } finally {
      stdout.mockRestore()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('keeps an unplanned v2 Goal out of the legacy web executor', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    try {
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Use goal-first service', context: null, successCriteria: null,
        workspaceRoot: resolve(dataDir, 'workspace'), agentPreset: 'planner',
      }, { goalSuffix: () => 'web-legacy-guard', plannerSessionId: () => 'planner-web-legacy-guard', now: () => 1 })
      const dependencies: TianwenLongGoalRunDependencies = {
        readLongGoal,
        readLongGoalStatus,
        bindLongGoalTask,
        listSessions: async () => [],
        createSession: async () => { throw new Error('must not create a Session') },
        attachedAgent: () => undefined,
        createGoal: () => { throw new Error('must not create a Goal') },
        readGoalRef: async () => { throw new Error('must not read a Goal') },
        resumeColdGoal: async () => { throw new Error('must not resume a Goal') },
        flushSession: async () => undefined,
      }

      await expect(runCurrentWebTask({
        roots: {
          stateRoot,
          sessionsRoot: join(dataDir, 'dsh-home', 'sessions'),
          evolutionRoot: join(stateRoot, 'evolution'),
        },
        longGoalId: record.id,
      }, dependencies)).rejects.toThrow('Goal-first Long Goal requires goal-first service')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('reads mixed strict v1/v2 records and keeps all v1 status snapshots unchanged', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const workspaceRoot = resolve(dataDir, 'workspace')
    try {
      const v1 = createLongGoal({
        stateRoot, objective: 'Existing v1', tasks: ['Keep unchanged'], maxTaskRounds: 1,
      }, { id: () => 'v1-fixture', now: () => 1 })
      const unplanned = createGoalFirstLongGoal({
        stateRoot, objective: 'Unplanned v2', context: null, successCriteria: null,
        workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'v2-unplanned', plannerSessionId: () => 'planner-unplanned', now: () => 2 })
      const ready = createGoalFirstLongGoal({
        stateRoot, objective: 'Ready v2', context: 'Context', successCriteria: 'Done',
        workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'v2-ready', plannerSessionId: () => 'planner-ready', now: () => 3 })
      commitLongGoalPlan({
        stateRoot, longGoalId: ready.id, expectedRevision: 1, outcome: 'continue',
        tasks: [{ objective: 'Ready task' }], consideredSettledTasks: 0,
      }, { taskId: () => '00000000-0000-4000-8000-000000000001', now: () => 4 })
      const needsReplan = createGoalFirstLongGoal({
        stateRoot, objective: 'Needs replan v2', context: null, successCriteria: null,
        workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'v2-needs-replan', plannerSessionId: () => 'planner-needs-replan', now: () => 5 })
      appendLongGoalGuidance(stateRoot, needsReplan.id, 1, 'Reconsider scope')
      const complete = createGoalFirstLongGoal({
        stateRoot, objective: 'Complete v2', context: null, successCriteria: null,
        workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'v2-complete', plannerSessionId: () => 'planner-complete', now: () => 6 })
      commitLongGoalPlan({
        stateRoot, longGoalId: complete.id, expectedRevision: 1, outcome: 'complete', tasks: [], consideredSettledTasks: 0,
      }, { now: () => 7 })

      expect(listLongGoals(stateRoot).map(record => record.schemaVersion)).toEqual([
        'tianwen.long-goal.v2', 'tianwen.long-goal.v2', 'tianwen.long-goal.v2', 'tianwen.long-goal.v2', 'tianwen.long-goal.v1',
      ])
      expect(readLongGoal(stateRoot, v1.id)).toEqual(v1)
      expect(readLongGoal(stateRoot, ready.id)).toMatchObject({
        schemaVersion: 'tianwen.long-goal.v2', planner: { phase: 'ready' }, guidance: [],
      })
      expect(readLongGoal(stateRoot, needsReplan.id)).toMatchObject({
        schemaVersion: 'tianwen.long-goal.v2', planner: { phase: 'needs-replan' }, guidance: ['Reconsider scope'],
      })
      expect(readLongGoal(stateRoot, complete.id)).toMatchObject({
        schemaVersion: 'tianwen.long-goal.v2', planner: { phase: 'complete' }, tasks: [],
      })
      await expect(readLongGoalStatus({
        stateRoot, longGoalId: unplanned.id, dshStatusTarget: { dataDir },
      })).resolves.toMatchObject({
        schemaVersion: 'tianwen.long-goal-status.v2', goal: { phase: 'planning' }, currentTaskId: null,
      })
      await expect(readLongGoalStatus({
        stateRoot, longGoalId: ready.id, dshStatusTarget: { dataDir },
      })).resolves.toMatchObject({
        schemaVersion: 'tianwen.long-goal-status.v2', goal: { phase: 'active' }, currentTaskId: '00000000-0000-4000-8000-000000000001',
      })
      await expect(readLongGoalStatus({
        stateRoot, longGoalId: v1.id, dshStatusTarget: { dataDir },
      })).resolves.toEqual({
        schemaVersion: 'tianwen.long-goal-status.v1',
        goal: { id: v1.id, objective: 'Existing v1', phase: 'active', completedTasks: 0, totalTasks: 1 },
        tasks: [{ id: 'task-1', objective: 'Keep unchanged', phase: 'pending', execution: null }],
        currentTaskId: 'task-1',
        runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
      })
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('persists a strict v3 continuous Goal, rejects malformed control blocks, and leaves v2 bytes and status unchanged', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const workspaceRoot = resolve(dataDir, 'workspace')
    try {
      const v1 = createLongGoal({
        stateRoot, objective: 'Existing v1', tasks: ['Keep unchanged'], maxTaskRounds: 1,
      }, { id: () => 'v3-mixed-v1', now: () => 1 })
      const v2 = createGoalFirstLongGoal({
        stateRoot, objective: 'Existing v2', context: null, successCriteria: null, workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'v3-mixed-v2', plannerSessionId: () => 'planner-v2', now: () => 2 })
      const v2Path = longGoalPath(stateRoot, v2.id)
      const v2Bytes = readFileSync(v2Path, 'utf8')
      const v2Status = await readLongGoalStatus({ stateRoot, longGoalId: v2.id, dshStatusTarget: { dataDir } })

      const continuous = createContinuousLongGoal({
        stateRoot,
        objective: 'Ship the product',
        context: null,
        successCriteria: null,
        workspaceRoot,
        agentPreset: 'code',
        controlSessionId: 'session-control',
      }, { goalSuffix: () => 'v3-continuous', plannerSessionId: () => 'planner-v3', now: () => 3 })

      expect(continuous.schemaVersion).toBe('tianwen.long-goal.v3')
      expect(continuous.control).toEqual({ sessionId: 'session-control', autoProgress: 'running' })
      expect(readLongGoal(stateRoot, continuous.id)).toEqual(continuous)
      await expect(readLongGoalStatus({ stateRoot, longGoalId: continuous.id, dshStatusTarget: { dataDir } }))
        .resolves.toMatchObject({
          schemaVersion: 'tianwen.long-goal-status.v3',
          goal: { phase: 'planning' },
          control: { sessionId: 'session-control', autoProgress: 'running' },
        })
      expect(listLongGoals(stateRoot).map(record => record.schemaVersion)).toEqual([
        'tianwen.long-goal.v3', 'tianwen.long-goal.v2', 'tianwen.long-goal.v1',
      ])
      expect(readFileSync(v2Path, 'utf8')).toBe(v2Bytes)
      expect(await readLongGoalStatus({ stateRoot, longGoalId: v2.id, dshStatusTarget: { dataDir } })).toEqual(v2Status)

      for (const control of [
        { sessionId: 'session-control' },
        { sessionId: 'session-control', autoProgress: 'running', extra: true },
      ]) {
        writeFileSync(longGoalPath(stateRoot, continuous.id), `${JSON.stringify({ ...continuous, control })}\n`, 'utf8')
        expect(() => readLongGoal(stateRoot, continuous.id)).toThrow(LongGoalIntegrityError)
      }
      writeFileSync(longGoalPath(stateRoot, continuous.id), `${JSON.stringify(continuous)}\n`, 'utf8')
      expect(readLongGoal(stateRoot, v1.id)).toEqual(v1)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('updates a continuous Goal atomically, keeps same-mode writes idempotent, and finds its active control Session binding', () => {
    const stateRoot = createStateRoot()
    const workspaceRoot = resolve(stateRoot, 'workspace')
    try {
      const record = createContinuousLongGoal({
        stateRoot, objective: 'Ship continuous Goal', context: null, successCriteria: null,
        workspaceRoot, agentPreset: 'code', controlSessionId: 'session-control',
      }, { goalSuffix: () => 'v3-mutations', plannerSessionId: () => 'planner-v3-mutations', now: () => 10 })

      expect(findContinuousGoalByControlSession({ stateRoot, controlSessionId: 'session-control' })).toEqual(record)
      const paused = setContinuousGoalMode({
        stateRoot, longGoalId: record.id, expectedRevision: 1, mode: 'paused',
      })
      expect(paused.control.autoProgress).toBe('paused')
      expect(paused.revision).toBe(2)
      const path = longGoalPath(stateRoot, record.id)
      const pausedBytes = readFileSync(path, 'utf8')
      expect(setContinuousGoalMode({
        stateRoot, longGoalId: record.id, expectedRevision: 2, mode: 'paused',
      })).toEqual(paused)
      expect(readFileSync(path, 'utf8')).toBe(pausedBytes)

      expect(redirectContinuousGoal({
        stateRoot, longGoalId: record.id, expectedRevision: 2, text: '改成先解决离线安装',
      })).toMatchObject({
        revision: 3,
        guidance: ['改成先解决离线安装'],
        control: { autoProgress: 'paused' },
      })
      const redirectedBytes = readFileSync(path, 'utf8')
      expect(() => redirectContinuousGoal({
        stateRoot, longGoalId: record.id, expectedRevision: 2, text: 'stale redirect',
      })).toThrow(LongGoalRevisionConflictError)
      expect(readFileSync(path, 'utf8')).toBe(redirectedBytes)

      expect(appendContinuousGoalGuidance({
        stateRoot, longGoalId: record.id, expectedRevision: 3, text: '保留离线步骤',
      })).toMatchObject({
        revision: 4,
        planner: { phase: 'needs-replan' },
        guidance: ['改成先解决离线安装', '保留离线步骤'],
      })
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('abandons only a confirmed paused v3 Task and preserves its Goal and Session binding', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const workspaceRoot = resolve(dataDir, 'workspace')
    try {
      const record = createContinuousLongGoal({
        stateRoot, objective: 'Redirect continuous Goal', context: null, successCriteria: null,
        workspaceRoot, agentPreset: 'code', controlSessionId: 'session-control',
      }, { goalSuffix: () => 'v3-paused-task', plannerSessionId: () => 'planner-v3-paused-task', now: () => 10 })
      const execution = await persistGoal(dataDir, 'v3-paused-task', 'paused')
      const taskId = '00000000-0000-4000-8000-000000000041'
      writeFileSync(longGoalPath(stateRoot, record.id), `${JSON.stringify({
        ...record,
        planner: { ...record.planner, planRevision: 1, phase: 'ready' },
        tasks: [{ id: taskId, objective: 'Paused Task', execution, resolution: null }],
      })}\n`, 'utf8')

      await expect(abandonContinuousGoalTask({
        stateRoot, longGoalId: record.id, expectedRevision: 1, taskId, dshStatusTarget: { dataDir },
      })).resolves.toMatchObject({
        revision: 2,
        planner: { phase: 'needs-replan' },
        tasks: [{ id: taskId, execution, resolution: 'abandoned' }],
      })
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('persists guidance before planning and rejects stale mutations without changing bytes', () => {
    const stateRoot = createStateRoot()
    const workspaceRoot = resolve(stateRoot, 'workspace')
    try {
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship v2', context: null, successCriteria: null, workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'guidance', plannerSessionId: () => 'planner-guidance', now: () => 10 })
      const guided = appendLongGoalGuidance(stateRoot, record.id, 1, 'Keep the existing behavior')
      expect(guided).toMatchObject({
        revision: 2, planner: { phase: 'needs-replan' }, guidance: ['Keep the existing behavior'],
      })
      const path = longGoalPath(stateRoot, record.id)
      const before = readFileSync(path, 'utf8')
      expect(() => appendLongGoalGuidance(stateRoot, record.id, 1, 'Stale')).toThrow(LongGoalRevisionConflictError)
      expect(readFileSync(path, 'utf8')).toBe(before)
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  })

  it('commits only valid plans and replaces only an unbound suffix with fresh ids', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const workspaceRoot = resolve(dataDir, 'workspace')
    try {
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Plan v2', context: null, successCriteria: null, workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'planning', plannerSessionId: () => 'planner-plan', now: () => 10 })
      expect(() => commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue', tasks: [], consideredSettledTasks: 0,
      })).toThrow()
      expect(() => commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue',
        tasks: Array.from({ length: 6 }, () => ({ objective: 'Too many' })), consideredSettledTasks: 0,
      })).toThrow()
      expect(() => commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue', tasks: [{ objective: ' ' }], consideredSettledTasks: 0,
      })).toThrow()
      const planned = commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue',
        tasks: [{ objective: 'First task' }, { objective: 'Future task' }], consideredSettledTasks: 0,
      }, { taskId: (() => {
        const ids = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012']
        return () => ids.shift()!
      })(), now: () => 11 })
      const complete = await persistGoal(dataDir, 'v2-complete', 'complete')
      const bound = bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: record.id, expectedRevision: 2, taskId: '00000000-0000-4000-8000-000000000011', execution: complete,
      })
      const replanned = commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 3, outcome: 'continue',
        tasks: [{ objective: 'Replacement task' }], consideredSettledTasks: 1,
      }, { taskId: () => '00000000-0000-4000-8000-000000000013' })
      expect(replanned.tasks).toEqual([
        bound.tasks[0],
        { id: '00000000-0000-4000-8000-000000000013', objective: 'Replacement task', execution: null, resolution: null },
      ])
      expect(replanned).toMatchObject({ revision: 4, planner: { phase: 'ready', planRevision: 2, consideredSettledTasks: 1 } })
      expect(planned.tasks[1]!.id).not.toBe(replanned.tasks[1]!.id)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('binds v2 with a revision and abandons only its current blocked task without clearing execution', async () => {
    const dataDir = createStateRoot()
    const stateRoot = join(dataDir, 'state')
    const workspaceRoot = resolve(dataDir, 'workspace')
    try {
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Blocked v2', context: null, successCriteria: null, workspaceRoot, agentPreset: 'planner',
      }, { goalSuffix: () => 'blocked', plannerSessionId: () => 'planner-blocked', now: () => 10 })
      const planned = commitLongGoalPlan({
        stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue', tasks: [{ objective: 'Blocked task' }], consideredSettledTasks: 0,
      }, { taskId: () => '00000000-0000-4000-8000-000000000021', now: () => 11 })
      const blocked = await persistGoal(dataDir, 'v2-blocked', 'blocked')
      const bound = bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: record.id, expectedRevision: 2, taskId: '00000000-0000-4000-8000-000000000021', execution: blocked,
      })
      await expect(readLongGoalStatus({ stateRoot, longGoalId: record.id, dshStatusTarget: { dataDir } }))
        .resolves.toMatchObject({ goal: { phase: 'blocked' }, currentTaskId: '00000000-0000-4000-8000-000000000021' })
      const abandoned = await abandonBlockedLongGoalTask({
        stateRoot, longGoalId: record.id, expectedRevision: 3, taskId: '00000000-0000-4000-8000-000000000021',
        dshStatusTarget: { dataDir },
      })
      expect(abandoned).toMatchObject({
        revision: 4, planner: { phase: 'needs-replan' },
        tasks: [{ id: '00000000-0000-4000-8000-000000000021', execution: blocked, resolution: 'abandoned' }],
      })
      await expect(abandonBlockedLongGoalTask({
        stateRoot, longGoalId: record.id, expectedRevision: 4, taskId: '00000000-0000-4000-8000-000000000021',
        dshStatusTarget: { dataDir },
      })).rejects.toThrow(LongGoalIntegrityError)
      expect(bound.revision).toBe(3)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it.each(['active', 'paused', 'complete'] as const)(
    'refuses to abandon a current %s v2 Task without changing bytes',
    async phase => {
      const dataDir = createStateRoot()
      const stateRoot = join(dataDir, 'state')
      try {
        const record = createGoalFirstLongGoal({
          stateRoot, objective: `Keep ${phase} Task`, context: null, successCriteria: null,
          workspaceRoot: resolve(dataDir, 'workspace'), agentPreset: 'planner',
        }, { goalSuffix: () => `cannot-abandon-${phase}`, plannerSessionId: () => `planner-${phase}`, now: () => 10 })
        const taskId = phase === 'active'
          ? '00000000-0000-4000-8000-000000000031'
          : '00000000-0000-4000-8000-000000000032'
        commitLongGoalPlan({
          stateRoot, longGoalId: record.id, expectedRevision: 1, outcome: 'continue',
          tasks: [{ objective: `${phase} Task` }], consideredSettledTasks: 0,
        }, { taskId: () => taskId, now: () => 11 })
        const execution = await persistGoal(dataDir, `cannot-abandon-${phase}`, phase)
        bindGoalFirstLongGoalTask({
          stateRoot, longGoalId: record.id, expectedRevision: 2, taskId, execution,
        })
        const path = longGoalPath(stateRoot, record.id)
        const before = readFileSync(path, 'utf8')

        await expect(abandonBlockedLongGoalTask({
          stateRoot, longGoalId: record.id, expectedRevision: 3, taskId, dshStatusTarget: { dataDir },
        })).rejects.toThrow('current blocked Task')
        expect(readFileSync(path, 'utf8')).toBe(before)
      } finally {
        rmSync(dataDir, { recursive: true, force: true })
      }
    },
  )
})
