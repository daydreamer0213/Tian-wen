import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GoalView } from '@deepseek-ai/dsh-goal'

import {
  createTianwenLongGoalRpcHandler,
  resolveTianwenLongGoalHostRoots,
  runCurrentWebTask,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'
import type {
  LongGoalRecord,
  LongGoalStatusProjection,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-learn-loop-host-tests')

function createFixtureRoot(): string {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  return mkdtempSync(join(FIXTURE_BASE, 'host-'))
}

const ROOTS = {
  stateRoot: 'D:/state',
  sessionsRoot: 'D:/sessions',
  evolutionRoot: 'D:/state/evolution',
}

function longGoalRecord(executions: readonly ({ goalId: string; sessionId: string } | null)[]): LongGoalRecord {
  return {
    schemaVersion: 'tianwen.long-goal.v1',
    id: 'tianwen-long-goal-test',
    objective: 'Ship release',
    maxTaskRounds: 3,
    createdAt: 1,
    updatedAt: 1,
    tasks: executions.map((execution, index) => ({
      id: `task-${index + 1}`,
      objective: `Task ${index + 1}`,
      execution,
    })),
  }
}

function longGoalStatus(
  phases: readonly LongGoalStatusProjection['tasks'][number]['phase'][],
  executions: readonly ({ goalId: string; sessionId: string } | null)[],
): LongGoalStatusProjection {
  const currentIndex = phases.findIndex(phase => phase !== 'complete')
  return {
    schemaVersion: 'tianwen.long-goal-status.v1',
    goal: {
      id: 'tianwen-long-goal-test',
      objective: 'Ship release',
      phase: currentIndex === -1 ? 'complete' : phases[currentIndex] === 'blocked' ? 'blocked' : 'active',
      completedTasks: phases.filter(phase => phase === 'complete').length,
      totalTasks: phases.length,
    },
    tasks: phases.map((phase, index) => ({
      id: `task-${index + 1}`,
      objective: `Task ${index + 1}`,
      phase,
      execution: executions[index]!,
    })),
    currentTaskId: currentIndex === -1 ? null : `task-${currentIndex + 1}`,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
  }
}

function goalView(input: Partial<GoalView> = {}): GoalView {
  return {
    id: 'goal-1' as GoalView['id'],
    revision: 1,
    objective: 'Task 1',
    phase: 'active',
    maxGoalRounds: 3,
    roundsStarted: 0,
    createdAt: 1,
    updatedAt: 1,
    activation: 'armed',
    ...input,
  }
}

function fakeAgent(
  sessionId: string,
  current: GoalView,
  services: {
    readonly resume?: (agent: Agent, ref: { id: GoalView['id']; revision: number }) => GoalView
    readonly disarm?: (agent: Agent) => GoalView | undefined
  } = {},
): Agent {
  let view = current
  const agent = {
    id: sessionId,
    session: { id: sessionId },
    ctx: {
      goals: {
        get: () => view,
        resume: (target: Agent, ref: { id: GoalView['id']; revision: number }) => {
          view = services.resume?.(target, ref) ?? goalView({ ...view, phase: 'active', activation: 'armed' })
          return view
        },
        disarm: (target: Agent) => services.disarm?.(target),
      },
    },
  }
  return agent as unknown as Agent
}

type RunDependencies = Parameters<typeof runCurrentWebTask>[1]

function runDependencies(
  record: LongGoalRecord,
  status: LongGoalStatusProjection,
  overrides: Partial<RunDependencies> = {},
): RunDependencies {
  return {
    readLongGoal: vi.fn(() => record),
    readLongGoalStatus: vi.fn(async () => status),
    bindLongGoalTask: vi.fn(() => record),
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => 'session-new'),
    attachedAgent: vi.fn(() => undefined),
    createGoal: vi.fn(() => goalView()),
    readGoalRef: vi.fn(async () => ({ id: 'goal-1', revision: 1 })),
    resumeColdGoal: vi.fn(async () => undefined),
    flushSession: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('Tianwen Long Goal Web host', () => {
  it('resolves profile, configured, and DSH session roots without accepting relative roots', () => {
    const fixture = createFixtureRoot()
    try {
      const profileRoot = join(fixture, 'dsh-home', 'profiles', 'tianwen')
      const roots = resolveTianwenLongGoalHostRoots({
        profileBaseUrl: pathToFileURL(`${profileRoot}/`),
        dshHome: join(fixture, 'dsh-home'),
      })
      expect(roots).toEqual({
        stateRoot: join(profileRoot, 'state'),
        evolutionRoot: join(profileRoot, 'state', 'evolution'),
        sessionsRoot: join(fixture, 'dsh-home', 'sessions'),
      })
      expect(() => resolveTianwenLongGoalHostRoots({
        profileBaseUrl: pathToFileURL(`${profileRoot}/`),
        config: { stateRoot: 'relative' },
      })).toThrow('absolute')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('lists, creates, and reads status through exact endpoint payloads', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const handler = createTianwenLongGoalRpcHandler({
        stateRoot,
        sessionsRoot: join(fixture, 'sessions'),
        evolutionRoot: join(stateRoot, 'evolution'),
      })
      const signal = AbortSignal.timeout(1_000)

      const result = await handler('list', {}, signal)
      expect(result).toEqual({ ok: true, value: { goals: [] } })

      await expect(handler('create', {
        objective: 'Ship release',
        tasks: ['Prepare notes', 'Publish'],
        maxTaskRounds: 3,
      }, signal)).resolves.toMatchObject({
        ok: true,
        value: { status: { goal: { completedTasks: 0, totalTasks: 2 } } },
      })
      const listed = await handler('list', {}, signal)
      expect(listed).toMatchObject({ ok: true, value: { goals: [{ objective: 'Ship release' }] } })
      const goalId = listed.ok ? listed.value.goals[0]!.id : ''
      await expect(handler('status', { longGoalId: goalId }, signal)).resolves.toMatchObject({
        ok: true,
        value: { status: { goal: { id: goalId, totalTasks: 2 } } },
      })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects malformed requests without creating a goal file', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const handler = createTianwenLongGoalRpcHandler({
        stateRoot,
        sessionsRoot: join(fixture, 'sessions'),
        evolutionRoot: join(stateRoot, 'evolution'),
      })
      const invalid = { ok: false, error: { code: 'internal', message: 'invalid-request', details: {} } }
      const signal = AbortSignal.timeout(1_000)

      for (const [endpoint, payload] of [
        ['unknown', {}],
        ['list', { ignored: true }],
        ['create', { objective: ' ', tasks: ['Task'], maxTaskRounds: 1 }],
        ['create', { objective: 'Goal', tasks: [], maxTaskRounds: 1 }],
        ['create', { objective: 'Goal', tasks: ['Task'], maxTaskRounds: 0 }],
        ['create', { objective: 'Goal', tasks: ['Task'], maxTaskRounds: 1, ignored: true }],
        ['status', { longGoalId: 'tianwen-long-goal-a', ignored: true }],
      ] as const) {
        await expect(handler(endpoint, payload, signal)).resolves.toEqual(invalid)
      }
      expect(existsSync(join(stateRoot, 'long-goals'))).toBe(false)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('returns complete without calling a DSH operation', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const dependencies = runDependencies(longGoalRecord([status.tasks[0]!.execution]), status)

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .resolves.toEqual({ status, action: 'complete' })
    expect(dependencies.listSessions).not.toHaveBeenCalled()
    expect(dependencies.createSession).not.toHaveBeenCalled()
    expect(dependencies.attachedAgent).not.toHaveBeenCalled()
    expect(dependencies.createGoal).not.toHaveBeenCalled()
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
    expect(dependencies.flushSession).not.toHaveBeenCalled()
  })

  it('routes the fourth host endpoint to the current Task runner', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const dependencies = runDependencies(longGoalRecord([status.tasks[0]!.execution]), status)
    const handler = createTianwenLongGoalRpcHandler(ROOTS, undefined, dependencies)

    await expect(handler('run-current-task', {
      longGoalId: status.goal.id,
      initialCwd: 'D:/workspace',
    }, AbortSignal.timeout(1_000))).resolves.toEqual({
      ok: true,
      value: { status, action: 'complete' },
    })
  })

  it('requires a workspace for the first Task before creating a Session', async () => {
    const status = longGoalStatus(['pending'], [null])
    const dependencies = runDependencies(longGoalRecord([null]), status)

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .rejects.toThrow('workspace-required')
    expect(dependencies.createSession).not.toHaveBeenCalled()
  })

  it('binds a fresh Session and Goal before the queued driver starts a turn', async () => {
    const status = longGoalStatus(['pending'], [null])
    const boundStatus = longGoalStatus(['active'], [{ goalId: 'goal-new', sessionId: 'session-new' }])
    const record = longGoalRecord([null])
    const order: string[] = []
    let armed = true
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }))
    const dependencies = runDependencies(record, status, {
      readLongGoalStatus: vi.fn()
        .mockResolvedValueOnce(status)
        .mockResolvedValueOnce(boundStatus),
      createSession: vi.fn(async () => {
        order.push('session-created')
        return 'session-new'
      }),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => {
        order.push('goal-created')
        queueMicrotask(() => {
          if (armed) order.push('turn-start')
        })
        return goalView({ id: 'goal-new' as GoalView['id'] })
      }),
      bindLongGoalTask: vi.fn(() => {
        order.push('task-bound')
        return record
      }),
      flushSession: vi.fn(async () => {
        await Promise.resolve()
        order.push('session-flushed')
      }),
    })

    const result = await runCurrentWebTask({
      roots: ROOTS,
      longGoalId: status.goal.id,
      initialCwd: 'D:/workspace',
    }, dependencies)

    expect(result).toEqual({ status: boundStatus, sessionId: 'session-new', action: 'started' })
    expect(order).toEqual([
      'session-created',
      'goal-created',
      'task-bound',
      'turn-start',
      'session-flushed',
    ])
    armed = false
  })

  it("uses Task 1 Session's persisted cwd for Task 2", async () => {
    const first = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['complete', 'pending'], [first, null])
    const record = longGoalRecord([first, null])
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }))
    const dependencies = runDependencies(record, status, {
      listSessions: vi.fn(async () => [{ sessionId: 'session-1', cwd: 'D:/persisted-workspace' }]),
      createSession: vi.fn(async () => 'session-new'),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => goalView({ id: 'goal-new' as GoalView['id'] })),
    })

    await runCurrentWebTask({
      roots: ROOTS,
      longGoalId: status.goal.id,
      initialCwd: 'D:/browser-current-workspace',
    }, dependencies)

    expect(dependencies.createSession).toHaveBeenCalledWith({ cwd: 'D:/persisted-workspace' })
  })

  it('resumes an active cold Task in its bound Session without creating a replacement', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const agent = fakeAgent('session-1', goalView())
    const attachedAgent = vi.fn<RunDependencies['attachedAgent']>()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(agent)
    const readGoalRef = vi.fn(async () => ({ id: 'goal-1', revision: 7 }))
    const dependencies = runDependencies(longGoalRecord([execution]), status, {
      attachedAgent,
      readGoalRef,
    })

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .resolves.toEqual({ status, sessionId: 'session-1', action: 'continued' })
    expect(dependencies.resumeColdGoal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      goalId: 'goal-1',
      revision: 7,
    })
    expect(readGoalRef).toHaveBeenCalledWith('session-1', 'goal-1')
    expect(dependencies.createSession).not.toHaveBeenCalled()
    expect(dependencies.createGoal).not.toHaveBeenCalled()
  })

  it('returns already-running for the exact active armed attached Task', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const agent = fakeAgent('session-1', goalView())
    const dependencies = runDependencies(longGoalRecord([execution]), status, {
      attachedAgent: vi.fn(() => agent),
    })

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .resolves.toEqual({ status, sessionId: 'session-1', action: 'already-running' })
    expect(dependencies.createSession).not.toHaveBeenCalled()
    expect(dependencies.createGoal).not.toHaveBeenCalled()
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
  })

  it('disarms and flushes a newly created Goal when binding fails before the driver microtask', async () => {
    const status = longGoalStatus(['pending'], [null])
    const record = longGoalRecord([null])
    const order: string[] = []
    let armed = true
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }), {
      disarm: () => {
        armed = false
        order.push('goal-disarmed')
        return goalView({ id: 'goal-new' as GoalView['id'], activation: 'disarmed' })
      },
    })
    const dependencies = runDependencies(record, status, {
      createSession: vi.fn(async () => {
        order.push('session-created')
        return 'session-new'
      }),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => {
        order.push('goal-created')
        queueMicrotask(() => {
          if (armed) order.push('turn-start')
        })
        return goalView({ id: 'goal-new' as GoalView['id'] })
      }),
      bindLongGoalTask: vi.fn(() => {
        throw new Error('disk-full')
      }),
      flushSession: vi.fn(async () => {
        await Promise.resolve()
        order.push('session-flushed')
      }),
    })

    await expect(runCurrentWebTask({
      roots: ROOTS,
      longGoalId: status.goal.id,
      initialCwd: 'D:/workspace',
    }, dependencies)).rejects.toMatchObject({
      sessionId: 'session-new',
      goalId: 'goal-new',
    })
    expect(order).toEqual([
      'session-created',
      'goal-created',
      'goal-disarmed',
      'session-flushed',
    ])
    expect(dependencies.createSession).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the bound Session contains a different Goal', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const agent = fakeAgent('session-1', goalView({ id: 'goal-other' as GoalView['id'] }))
    const dependencies = runDependencies(longGoalRecord([execution]), status, {
      attachedAgent: vi.fn(() => agent),
    })

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .rejects.toThrow('mismatch')
    expect(dependencies.createSession).not.toHaveBeenCalled()
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
  })
})
