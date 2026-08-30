import { describe, expect, it, vi } from 'vitest'

import type { Agent } from '@deepseek-ai/dsh-agent'
import { LongGoalIntegrityError } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import { mountContinuousGoalHost, type ContinuousGoalHostDependencies } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-host.js'

const GOAL_ID = 'tianwen-long-goal-00000000-0000-4000-8000-000000000001'
const TASK_1 = '00000000-0000-4000-8000-000000000002'
const TASK_2 = '00000000-0000-4000-8000-000000000003'
const EXECUTION_1 = { sessionId: 'task-session-1', goalId: 'task-goal-1' }
const EXECUTION_2 = { sessionId: 'task-session-2', goalId: 'task-goal-2' }

function record(overrides: Partial<LongGoalRecordV3> = {}): LongGoalRecordV3 {
  return {
    schemaVersion: 'tianwen.long-goal.v3', id: GOAL_ID, revision: 4,
    objective: 'Ship release', context: null, successCriteria: null,
    workspaceRoot: 'D:/workspace', maxTaskRounds: 3,
    planner: { sessionId: 'planner-session', agentPreset: 'planner', planRevision: 1, phase: 'ready', consideredSettledTasks: 0 },
    guidance: [], control: { sessionId: 'control-session', autoProgress: 'running' },
    createdAt: 1, updatedAt: 1,
    tasks: [{ id: TASK_1, objective: 'Publish', execution: EXECUTION_1, resolution: null }],
    ...overrides,
  }
}

function status(
  source: LongGoalRecordV3,
  phases: readonly ('pending' | 'active' | 'paused' | 'blocked' | 'complete' | 'abandoned')[],
  currentTaskId: string | null,
): LongGoalStatusProjectionV3 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v3',
    goal: {
      id: source.id, objective: source.objective, context: source.context, successCriteria: source.successCriteria,
      phase: phases.every(phase => phase === 'complete' || phase === 'abandoned') ? 'complete' : 'active',
      revision: source.revision, completedTasks: phases.filter(phase => phase === 'complete').length,
      abandonedTasks: phases.filter(phase => phase === 'abandoned').length, totalTasks: source.tasks.length,
    },
    planner: { sessionId: source.planner.sessionId, phase: source.planner.phase, planRevision: source.planner.planRevision },
    guidance: source.guidance,
    tasks: source.tasks.map((task, index) => ({
      id: task.id, objective: task.objective, phase: phases[index]!, execution: task.execution, resolution: task.resolution,
    })),
    currentTaskId, runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true }, control: source.control,
  }
}

function agent(sessionId: string, goalId: string, phase: 'active' | 'complete' = 'active'): Agent & {
  readonly whenIdle: ReturnType<typeof vi.fn>
  readonly cancel: ReturnType<typeof vi.fn>
  setGoal(phase: 'active' | 'complete'): void
} {
  let current = { id: goalId, phase, activation: phase === 'active' ? 'armed' as const : 'disarmed' as const }
  const whenIdle = vi.fn(async () => undefined)
  const cancel = vi.fn()
  return {
    id: sessionId, session: { id: sessionId, header: { cwd: 'D:/workspace', agentPreset: 'chat' } },
    whenIdle, cancel,
    setGoal(next) { current = { ...current, phase: next, activation: next === 'active' ? 'armed' : 'disarmed' } },
    ctx: { goals: { get: () => current } },
  } as unknown as Agent & { readonly whenIdle: ReturnType<typeof vi.fn>, readonly cancel: ReturnType<typeof vi.fn>, setGoal(phase: 'active' | 'complete'): void }
}

function harness(initial = record()) {
  let records: LongGoalRecordV3[] = [initial]
  let currentStatus = status(initial, ['active'], TASK_1)
  const goalListeners: ((input: { agent: Agent, change: { operation: string, ref: { id: string, revision: number } } }) => void)[] = []
  const sessionListeners: ((session: { id: string }, event: unknown) => void)[] = []
  const agentListeners: ((input: { agent: Agent }) => void)[] = []
  const first = agent(EXECUTION_1.sessionId, EXECUTION_1.goalId)
  const live = new Map<string, Agent>([[EXECUTION_1.sessionId, first]])
  const commands = new Map<Agent, { create(agent: Agent, objective: string): Promise<{ action: string }>, control(agent: Agent, action: { action: 'status' }): Promise<{ action: string }> }>()
  const order: string[] = []
  const ctx = {
    agents: { list: () => [...live.values()], get: (id: string) => live.get(id) },
    on(name: string, listener: (...args: never[]) => void) {
      const listeners = name === 'goal/changed' ? goalListeners : name === 'session/event' ? sessionListeners : agentListeners
      listeners.push(listener as never)
      return () => listeners.splice(listeners.indexOf(listener as never), 1)
    },
  }
  const continueProgress = vi.fn(async (input: { longGoalId: string }) => {
    order.push('continue')
    records = records.map(candidate => candidate.id === input.longGoalId
      ? {
          ...candidate,
          revision: candidate.revision + 1,
          planner: {
            ...candidate.planner,
            consideredSettledTasks: currentStatus.goal.completedTasks + currentStatus.goal.abandonedTasks,
          },
        }
      : candidate)
  })
  const readStatus = vi.fn(async () => { order.push('read'); return currentStatus })
  const pause = vi.fn((input: { longGoalId: string, expectedRevision: number }) => {
    order.push('pause')
    records = records.map(candidate => candidate.id === input.longGoalId
      ? { ...candidate, revision: candidate.revision + 1, control: { ...candidate.control, autoProgress: 'paused' } }
      : candidate)
  })
  const dependencies = {
    roots: { stateRoot: 'D:/state', sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/state/evolution' },
    listLongGoals: () => records, readLongGoal: (_root: string, id: string) => records.find(candidate => candidate.id === id)!, readStatus,
    createProgress: vi.fn(async (input: { controlSessionId: string }) => {
      const created = record({ id: `${GOAL_ID}-created`, control: { sessionId: input.controlSessionId, autoProgress: 'running' } })
      records = [...records, created]
      return { action: 'started' }
    }),
    control: vi.fn(async () => ({ action: 'paused' })), continueProgress,
    pause, flushSession: vi.fn(async () => { order.push('flush') }),
    reportError: vi.fn(),
    installCommand: vi.fn((controlAgent: Agent, operations) => { commands.set(controlAgent, operations as never); return () => undefined }),
    installBoundControls: vi.fn(() => () => undefined),
  } satisfies ContinuousGoalHostDependencies
  return {
    ctx, dependencies, first, live, commands, order, continueProgress, readStatus, pause,
    setStatus(next: LongGoalStatusProjectionV3) { currentStatus = next },
    setRecords(next: LongGoalRecordV3[]) { records = next },
    complete(sessionId = EXECUTION_1.sessionId, goalId = EXECUTION_1.goalId) {
      const target = live.get(sessionId)
      if (target === undefined) throw new Error('missing live Agent')
      for (const listener of goalListeners) listener({ agent: target, change: { operation: 'complete', ref: { id: goalId, revision: 99 } } })
    },
    abort(sessionId: string) {
      for (const listener of sessionListeners) listener({ id: sessionId }, {
        type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
      })
    },
    created(created: Agent) { for (const listener of agentListeners) listener({ agent: created }) },
    create(controlAgent: Agent, objective: string) { return commands.get(controlAgent)!.create(controlAgent, objective) },
    control(controlAgent: Agent) { return commands.get(controlAgent)!.control(controlAgent, { action: 'status' }) },
  }
}

describe('continuous Goal Host', () => {
  it('does not continue a live armed Task at startup, then continues once after its exact completion', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())
    expect(subject.continueProgress).not.toHaveBeenCalled()

    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete(EXECUTION_1.sessionId, 'wrong-goal')
    subject.complete()
    subject.complete()
    await dispose()

    expect(subject.first.whenIdle).toHaveBeenCalledOnce()
    expect(subject.dependencies.flushSession).toHaveBeenCalledOnce()
    expect(subject.continueProgress).toHaveBeenCalledTimes(1)
    expect(subject.order).toEqual(expect.arrayContaining(['read', 'flush', 'continue']))
  })

  it('rejects every existing control binding and reports ambiguous bindings as integrity errors', async () => {
    const first = record({ control: { sessionId: EXECUTION_1.sessionId, autoProgress: 'running' } })
    const second = record({ id: `${GOAL_ID}-second`, control: { sessionId: EXECUTION_1.sessionId, autoProgress: 'running' } })
    const subject = harness(first)
    subject.setRecords([first, second])
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    await expect(subject.create(subject.first, 'Do not create a third Goal')).rejects.toThrow(LongGoalIntegrityError)
    await expect(subject.control(subject.first)).rejects.toThrow(LongGoalIntegrityError)
    expect(subject.dependencies.createProgress).not.toHaveBeenCalled()
    await dispose()
  })

  it('guards concurrent create and installs bound controls immediately after durable creation', async () => {
    const source = record({ control: { sessionId: 'another-control', autoProgress: 'running' } })
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    const started = subject.create(controlAgent, 'Ship the actual Goal')
    await expect(subject.create(controlAgent, 'Concurrent duplicate')).rejects.toThrow('already being created')
    await expect(started).resolves.toEqual({ action: 'started' })
    subject.created(controlAgent)
    subject.created(controlAgent)

    expect(subject.dependencies.installBoundControls).toHaveBeenCalledTimes(1)
    await dispose()
  })

  it('ignores a historical Task Session abort but pauses and flushes the exact current Task without cancelling it again', async () => {
    const source = record({
      tasks: [
        { id: TASK_1, objective: 'Finished', execution: EXECUTION_1, resolution: null },
        { id: TASK_2, objective: 'Current', execution: EXECUTION_2, resolution: null },
      ],
    })
    const subject = harness(source)
    const second = agent(EXECUTION_2.sessionId, EXECUTION_2.goalId)
    subject.live.set(EXECUTION_2.sessionId, second)
    subject.setStatus(status(source, ['complete', 'active'], TASK_2))
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    subject.abort(EXECUTION_1.sessionId)
    await Promise.resolve()
    expect(subject.pause).not.toHaveBeenCalled()

    subject.abort(EXECUTION_2.sessionId)
    await dispose()

    expect(subject.pause).toHaveBeenCalledOnce()
    expect(second.whenIdle).toHaveBeenCalledOnce()
    expect(second.cancel).not.toHaveBeenCalled()
  })

  it('reports a reconciliation failure and makes the async disposer reject after lanes settle', async () => {
    const subject = harness()
    const failure = new Error('flush failed')
    subject.dependencies.flushSession = vi.fn(async () => { throw failure })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())
    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete()

    await expect(dispose()).rejects.toThrow(AggregateError)
    expect(subject.dependencies.reportError).toHaveBeenCalledWith(failure)
  })

  it('reports an unconfirmable cold Task after a control-session stop instead of silently returning', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())
    subject.live.delete(EXECUTION_1.sessionId)

    subject.abort('control-session')

    await expect(dispose()).rejects.toThrow(AggregateError)
    expect(subject.pause).toHaveBeenCalledOnce()
    expect(subject.dependencies.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('cancellation could not be confirmed') }),
    )
  })

  it('queues an exact completion behind startup reconciliation for one idle-flush-reread barrier', async () => {
    const subject = harness()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let reads = 0
    subject.dependencies.readStatus = vi.fn(async () => {
      reads += 1
      if (reads === 1) {
        await gate
        return status(record(), ['active'], TASK_1)
      }
      const completed = status(record(), ['complete'], null)
      return { ...completed, goal: { ...completed.goal, phase: 'planning' } }
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    subject.first.setGoal('complete')
    subject.complete()
    subject.complete()
    release()

    await dispose()
    expect(subject.first.whenIdle).toHaveBeenCalledOnce()
    expect(subject.dependencies.flushSession).toHaveBeenCalledOnce()
    expect(subject.continueProgress).toHaveBeenCalledTimes(1)
  })

  it('does not continue an observed completion while startup reconciliation is pending without goal/changed', async () => {
    const subject = harness()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    subject.dependencies.readStatus = vi.fn(async () => {
      await gate
      return status(record(), ['active'], TASK_1)
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    subject.first.setGoal('complete')
    release()

    await dispose()
    expect(subject.first.whenIdle).not.toHaveBeenCalled()
    expect(subject.dependencies.flushSession).not.toHaveBeenCalled()
    expect(subject.continueProgress).not.toHaveBeenCalled()
  })
})
