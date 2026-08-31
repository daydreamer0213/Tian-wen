import { describe, expect, it, vi } from 'vitest'

import type { Agent } from '@deepseek-ai/dsh-agent'
import { LongGoalIntegrityError } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import type { ContinuousGoalControlAction } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-service.js'
import { mountContinuousGoalHost, type ContinuousGoalHostDependencies } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-host.js'
import { deliverContinuousGoalSettlement } from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

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
  goalPhase?: LongGoalStatusProjectionV3['goal']['phase'],
): LongGoalStatusProjectionV3 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v3',
    goal: {
      id: source.id, objective: source.objective, context: source.context, successCriteria: source.successCriteria,
      phase: goalPhase ?? (phases.every(phase => phase === 'complete' || phase === 'abandoned') ? 'complete' : 'active'),
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

function agent(sessionId: string, goalId: string, phase: 'active' | 'blocked' | 'complete' = 'active'): Agent & {
  readonly whenIdle: ReturnType<typeof vi.fn>
  readonly cancel: ReturnType<typeof vi.fn>
  setGoal(phase: 'active' | 'blocked' | 'complete'): void
} {
  let current = { id: goalId, phase, activation: phase === 'active' ? 'armed' as const : 'disarmed' as const }
  const whenIdle = vi.fn(async () => undefined)
  const cancel = vi.fn()
  return {
    id: sessionId, session: { id: sessionId, header: { cwd: 'D:/workspace', agentPreset: 'chat' } },
    whenIdle, cancel,
    setGoal(next) { current = { ...current, phase: next, activation: next === 'active' ? 'armed' : 'disarmed' } },
    ctx: { goals: { get: () => current } },
  } as unknown as Agent & { readonly whenIdle: ReturnType<typeof vi.fn>, readonly cancel: ReturnType<typeof vi.fn>, setGoal(phase: 'active' | 'blocked' | 'complete'): void }
}

function harness(initial = record()) {
  let records: LongGoalRecordV3[] = [initial]
  let currentStatus = status(initial, ['active'], TASK_1)
  const goalListeners: ((input: { agent: Agent, change: { operation: string, ref: { id: string, revision: number } } }) => void)[] = []
  const sessionListeners: ((session: { id: string }, event: unknown) => void)[] = []
  const agentListeners: ((input: { agent: Agent }) => void)[] = []
  const first = agent(EXECUTION_1.sessionId, EXECUTION_1.goalId)
  const live = new Map<string, Agent>([[EXECUTION_1.sessionId, first]])
  const commands = new Map<Agent, { create(agent: Agent, objective: string): Promise<{ action: string }>, control(agent: Agent, action: ContinuousGoalControlAction): Promise<{ action: string }> }>()
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
      const createdStatus = status(created, ['active'], TASK_1)
      return {
        schemaVersion: 'tianwen.continuous-goal-control-result.v1' as const,
        action: 'started' as const,
        status: createdStatus,
        sessionId: EXECUTION_1.sessionId,
      }
    }),
    control: vi.fn(async () => ({ action: 'paused' })), continueProgress,
    pause, flushSession: vi.fn(async () => { order.push('flush') }),
    deliver: vi.fn(async () => undefined),
    reportError: vi.fn(),
    installCommand: vi.fn((controlAgent: Agent, operations) => {
      commands.set(controlAgent, operations as never)
      return { dispose: () => { commands.delete(controlAgent) } }
    }),
    installBoundControls: vi.fn(() => () => undefined),
  } satisfies ContinuousGoalHostDependencies
  return {
    ctx, dependencies, first, live, commands, order, continueProgress, readStatus, pause,
    records: () => records,
    setStatus(next: LongGoalStatusProjectionV3) { currentStatus = next },
    setRecords(next: LongGoalRecordV3[]) { records = next },
    complete(sessionId = EXECUTION_1.sessionId, goalId = EXECUTION_1.goalId) {
      const target = live.get(sessionId)
      if (target === undefined) throw new Error('missing live Agent')
      for (const listener of goalListeners) listener({ agent: target, change: { operation: 'complete', ref: { id: goalId, revision: 99 } } })
    },
    block(sessionId = EXECUTION_1.sessionId, goalId = EXECUTION_1.goalId) {
      const target = live.get(sessionId)
      if (target === undefined) throw new Error('missing live Agent')
      for (const listener of goalListeners) listener({ agent: target, change: { operation: 'block', ref: { id: goalId, revision: 99 } } })
    },
    abort(sessionId: string) {
      for (const listener of sessionListeners) listener({ id: sessionId }, {
        type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
      })
    },
    created(created: Agent) { for (const listener of agentListeners) listener({ agent: created }) },
    create(controlAgent: Agent, objective: string) { return commands.get(controlAgent)!.create(controlAgent, objective) },
    control(controlAgent: Agent, action: ContinuousGoalControlAction = { action: 'status' }) {
      return commands.get(controlAgent)!.control(controlAgent, action)
    },
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

  it('records one complete delivery after continuation reaches authoritative completion', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    const completed = status(record(), ['complete'], null)
    subject.setStatus(completed)
    subject.complete()
    subject.complete()
    await dispose()

    expect(subject.dependencies.deliver).toHaveBeenCalledOnce()
    expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      transition: 'complete',
      status: completed,
    }))
  })

  it('records conversation progress after initial planning and after advancing to the next Task', async () => {
    const previous = record({ control: { sessionId: 'another-control', autoProgress: 'running' } })
    const subject = harness(previous)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const created = record({
      id: `${GOAL_ID}-created`, revision: 2,
      control: { sessionId: 'control-session', autoProgress: 'running' },
    })
    const started = status(created, ['active'], TASK_1)
    subject.dependencies.createProgress = vi.fn(async () => {
      subject.setRecords([previous, created])
      subject.setStatus(started)
      return {
        schemaVersion: 'tianwen.continuous-goal-control-result.v1' as const,
        action: 'started' as const,
        status: started,
        sessionId: EXECUTION_1.sessionId,
      }
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    await expect(subject.create(controlAgent, 'Ship the actual Goal')).resolves.toMatchObject({ action: 'started' })
    await vi.waitFor(() => expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: created.id,
      transition: 'start',
      status: started,
    })))

    const advancedRecord = record({
      id: created.id, revision: 3,
      control: created.control,
      planner: { ...created.planner, consideredSettledTasks: 1, planRevision: 2 },
      tasks: [
        { id: TASK_1, objective: 'Publish', execution: EXECUTION_1, resolution: null },
        { id: TASK_2, objective: 'Verify', execution: EXECUTION_2, resolution: null },
      ],
    })
    const advanced = status(advancedRecord, ['complete', 'active'], TASK_2)
    subject.dependencies.continueProgress = vi.fn(async () => {
      subject.setRecords([previous, advancedRecord])
      subject.setStatus(advanced)
    })
    subject.first.setGoal('complete')
    subject.setStatus(status(created, ['complete'], TASK_1, 'planning'))
    subject.complete()

    await dispose()
    expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: created.id,
      transition: 'advance',
      status: advanced,
    }))
  })

  it('flushes and rereads one exact block without continuing, then records one attention delivery', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('blocked')
    const blocked = status(record(), ['blocked'], TASK_1, 'blocked')
    subject.setStatus(blocked)
    subject.block()
    subject.block()
    await dispose()

    expect(subject.first.whenIdle).toHaveBeenCalledOnce()
    expect(subject.dependencies.flushSession).toHaveBeenCalledOnce()
    expect(subject.continueProgress).not.toHaveBeenCalled()
    expect(subject.dependencies.deliver).toHaveBeenCalledOnce()
    expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      transition: 'block',
      status: blocked,
    }))
  })

  it('delivers distinct blocked Tasks even when their Goal revisions are equal', async () => {
    const firstRecord = record()
    const subject = harness(firstRecord)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('blocked')
    subject.setStatus(status(firstRecord, ['blocked'], TASK_1, 'blocked'))
    subject.block()
    await vi.waitFor(() => expect(subject.dependencies.deliver).toHaveBeenCalledOnce())

    const secondRecord = record({
      revision: 5,
      tasks: [
        firstRecord.tasks[0]!,
        { id: TASK_2, objective: 'Verify', execution: EXECUTION_2, resolution: null },
      ],
    })
    const second = agent(EXECUTION_2.sessionId, EXECUTION_2.goalId, 'blocked')
    subject.live.set(EXECUTION_2.sessionId, second)
    subject.setRecords([secondRecord])
    subject.setStatus(status(secondRecord, ['complete', 'blocked'], TASK_2, 'blocked'))
    subject.block(EXECUTION_2.sessionId, EXECUTION_2.goalId)
    await dispose()

    expect(subject.dependencies.deliver).toHaveBeenCalledTimes(2)
  })

  it('releases the Goal lane before detached delivery waits', async () => {
    const subject = harness()
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    subject.dependencies.deliver = vi.fn(async () => gate)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete()
    await vi.waitFor(() => expect(subject.dependencies.deliver).toHaveBeenCalledOnce())

    await expect(subject.control(controlAgent)).resolves.toEqual({ action: 'paused' })
    release()
    await dispose()
  })

  it('contains a rejected delivery without mutating or reclassifying durable state', async () => {
    const subject = harness()
    const failure = new Error('notice delivery failed')
    subject.dependencies.deliver = vi.fn(async () => { throw failure })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete()
    await expect(dispose()).resolves.toBeUndefined()

    expect(subject.pause).not.toHaveBeenCalled()
    expect(subject.dependencies.control).not.toHaveBeenCalled()
    expect(subject.records()[0]?.control.autoProgress).toBe('running')
    expect(subject.dependencies.reportError).toHaveBeenCalledOnce()
    expect(subject.dependencies.reportError).toHaveBeenCalledWith(failure)
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

  it('queues goal_control behind the Goal lane and rereads its latest durable revision', async () => {
    const source = record()
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    subject.dependencies.readStatus = vi.fn(async () => {
      await gate
      return status(source, ['active'], TASK_1)
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.dependencies.readStatus).toHaveBeenCalledOnce())

    const pending = subject.control(controlAgent)
    await Promise.resolve()
    const callsBeforeRelease = subject.dependencies.control.mock.calls.length
    subject.setRecords([{ ...source, revision: 5 }])
    release()

    await expect(pending).resolves.toEqual({ action: 'paused' })
    expect(callsBeforeRelease).toBe(0)
    expect(subject.dependencies.control).toHaveBeenCalledWith({
      longGoalId: GOAL_ID, expectedRevision: 5, action: { action: 'status' },
    })
    await dispose()
  })

  it('rejects an awaited goal_control failure without poisoning Host disposal', async () => {
    const subject = harness()
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const failure = new Error('requested control failed')
    subject.dependencies.control.mockRejectedValue(failure)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    await expect(subject.control(controlAgent)).rejects.toBe(failure)

    expect(subject.dependencies.reportError).not.toHaveBeenCalled()
    await expect(dispose()).resolves.toBeUndefined()
  })

  it('keeps completion deduplication while control waits behind a failed Continue', async () => {
    const subject = harness()
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const failure = new Error('Planner failed')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    subject.dependencies.continueProgress = vi.fn(async () => {
      await gate
      throw failure
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete()
    await vi.waitFor(() => expect(subject.dependencies.continueProgress).toHaveBeenCalledOnce())
    const pendingControl = subject.control(controlAgent)
    subject.complete()
    release()

    await expect(pendingControl).resolves.toEqual({ action: 'paused' })
    await expect(dispose()).rejects.toThrow(AggregateError)
    expect(subject.dependencies.continueProgress).toHaveBeenCalledOnce()
    expect(subject.dependencies.reportError).toHaveBeenCalledOnce()
    expect(subject.dependencies.reportError).toHaveBeenCalledWith(failure)
  })

  it('keeps the latest completed binding controllable after Host restart', async () => {
    const source = record({
      revision: 5,
      planner: { ...record().planner, phase: 'complete' },
      tasks: [],
    })
    const sourceStatus = status(source, [], null)
    const subject = harness(source)
    subject.setStatus(sourceStatus)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    subject.dependencies.control.mockResolvedValue({ action: 'status', status: sourceStatus })

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    expect(subject.dependencies.installBoundControls).toHaveBeenCalledOnce()
    await expect(subject.control(controlAgent)).resolves.toMatchObject({ action: 'status' })
    expect(subject.dependencies.control).toHaveBeenCalledWith({
      longGoalId: GOAL_ID, expectedRevision: 5, action: { action: 'status' },
    })
    await dispose()
  })

  it('reports durable complete status instead of applying later control mutations', async () => {
    const source = record({
      revision: 5,
      planner: { ...record().planner, phase: 'complete' },
      tasks: [],
    })
    const sourceStatus = status(source, [], null)
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    subject.dependencies.control.mockImplementation(async input => input.action.action === 'status'
      ? { action: 'status', status: sourceStatus }
      : { action: 'guided' })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    await expect(subject.control(controlAgent, { action: 'guide', text: 'Change completed work' }))
      .resolves.toMatchObject({ action: 'status' })
    expect(subject.dependencies.control).toHaveBeenCalledOnce()
    expect(subject.dependencies.control).toHaveBeenCalledWith({
      longGoalId: GOAL_ID, expectedRevision: 5, action: { action: 'status' },
    })
    await dispose()
  })

  it('allows a completed binding to be replaced when creation itself immediately completes', async () => {
    const previous = record({
      revision: 5,
      updatedAt: 1,
      planner: { ...record().planner, phase: 'complete' },
      tasks: [],
    })
    const created = record({
      id: `${GOAL_ID}-created`,
      revision: 2,
      updatedAt: 2,
      planner: { ...record().planner, phase: 'complete' },
      tasks: [],
    })
    const subject = harness(previous)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    subject.dependencies.createProgress = vi.fn(async () => {
      subject.setRecords([created, previous])
      return {
        schemaVersion: 'tianwen.continuous-goal-control-result.v1' as const,
        action: 'complete' as const,
        status: status(created, [], null),
        sessionId: null,
      }
    })
    subject.dependencies.control.mockResolvedValue({ action: 'status', status: status(created, [], null) })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    await expect(subject.create(controlAgent, 'Finish during initial planning')).resolves.toEqual({ action: 'complete' })
    await expect(subject.control(controlAgent)).resolves.toMatchObject({ action: 'status' })
    expect(subject.dependencies.control).toHaveBeenCalledWith({
      longGoalId: created.id, expectedRevision: created.revision, action: { action: 'status' },
    })
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

  it('owns and awaits asynchronous command registration cleanup', async () => {
    const subject = harness()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const disposeStarted = vi.fn()
    const disposed = vi.fn()
    subject.dependencies.installCommand = vi.fn(() => ({
      async dispose() {
        disposeStarted()
        await gate
        disposed()
      },
    }) as never)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    const pending = dispose()
    await vi.waitFor(() => expect(disposeStarted).toHaveBeenCalledOnce())
    expect(disposed).not.toHaveBeenCalled()
    release()
    await expect(pending).resolves.toBeUndefined()
    expect(disposed).toHaveBeenCalledOnce()
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

  it('continues a settled Task recovered at startup even when its completion event was missed', async () => {
    const subject = harness()
    subject.dependencies.readStatus = vi.fn(async () => {
      const settled = status(record(), ['complete'], TASK_1)
      return { ...settled, goal: { ...settled.goal, phase: 'planning' } }
    })
    subject.first.setGoal('complete')

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await dispose()
    expect(subject.first.whenIdle).not.toHaveBeenCalled()
    expect(subject.dependencies.flushSession).not.toHaveBeenCalled()
    expect(subject.continueProgress).toHaveBeenCalledTimes(1)
  })

  it.each(['start', 'advance'] as const)(
    'persists one guarded ordinary conversation reply for a %s transition',
    async transition => {
      const source = transition === 'start'
        ? record()
        : record({
            tasks: [
              { id: TASK_1, objective: 'Published', execution: EXECUTION_1, resolution: null },
              { id: TASK_2, objective: 'Verify', execution: EXECUTION_2, resolution: null },
            ],
          })
      const progress = transition === 'start'
        ? status(source, ['active'], TASK_1)
        : status(source, ['complete', 'active'], TASK_2)
      const preStepListeners: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>)[] = []
      const sessionListeners: ((session: unknown, event: unknown) => void)[] = []
      const guards: ((execution: { name: string }) => string | undefined)[] = []
      const denied: string[] = []
      let finishTurn!: () => void
      const turnFinished = new Promise<void>(resolve => { finishTurn = resolve })
      const controlAgent = {
        session: { id: 'control-session' },
        ctx: {
          tools: { guard: (guard: (execution: { name: string }) => string | undefined) => {
            guards.push(guard)
            return () => guards.splice(guards.indexOf(guard), 1)
          } },
          on(name: string, listener: never) {
            const listeners = name === 'agent/pre-step' ? preStepListeners : sessionListeners
            listeners.push(listener)
            return () => listeners.splice(listeners.indexOf(listener), 1)
          },
        },
        whenIdle: vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(async () => turnFinished),
        followup: vi.fn(message => queueMicrotask(async () => {
          for (const listener of preStepListeners) {
            await listener(
              { agent: controlAgent, messages: [message], turn: 9, step: 1, signal: new AbortController().signal },
              async () => ({ kind: 'enter', messages: [message] }),
            )
          }
          if (guards.some(guard => guard({ name: 'goal_control' }) !== undefined)) denied.push('goal_control')
          for (const listener of sessionListeners) {
            listener(controlAgent.session, { type: 'turn/end', data: { turn: 9, reason: { kind: 'completed' } } })
          }
          finishTurn()
        })),
      } as unknown as Agent
      const inspectSession = vi.fn(async () => ({
        meta: { id: EXECUTION_1.sessionId },
        events: [
          { seq: 0, time: 1, type: 'assistant/message', surfaceOp: 'append', data: {
            turn: 1, step: 1,
            message: { id: 'task-reply', role: 'assistant', content: [{ type: 'text', text: 'Published successfully' }] },
          } },
          { seq: 1, time: 2, type: 'goal/change', data: {
            operation: 'complete',
            ref: { id: EXECUTION_1.goalId, revision: 2 },
            goal: { id: EXECUTION_1.goalId, revision: 2, phase: 'complete' },
          } },
        ] as never,
      }))
      const flushSession = vi.fn(async () => true)

      await deliverContinuousGoalSettlement({ longGoalId: GOAL_ID, transition, status: progress }, {
        getAgent: () => controlAgent,
        readStatus: async () => progress,
        inspectSession,
        flushSession,
      })

      expect(controlAgent.followup).toHaveBeenCalledOnce()
      expect(denied).toEqual(['goal_control'])
      expect(flushSession).toHaveBeenCalledOnce()
      expect(guards).toEqual([])
      expect(inspectSession).toHaveBeenCalledTimes(transition === 'advance' ? 1 : 0)
    },
  )

  it('delivers one guarded followup for the exact notice Turn and releases the guard before later user work', async () => {
    const source = record()
    const completed = status(source, ['complete'], null)
    const preStepListeners: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>)[] = []
    const sessionListeners: ((session: unknown, event: unknown) => void)[] = []
    const guards: ((execution: { name: string }) => string | undefined)[] = []
    const executed: string[] = []
    const denied: string[] = []
    let finishDriver!: () => void
    const driverFinished = new Promise<void>(resolve => { finishDriver = resolve })
    let finishLaterTurn!: () => void
    const laterTurnFinished = new Promise<void>(resolve => { finishLaterTurn = resolve })
    let nextTurn = 7
    const scopedContext = {
      tools: {
        guard: vi.fn((guard: (execution: { name: string }) => string | undefined) => {
          guards.push(guard)
          return () => guards.splice(guards.indexOf(guard), 1)
        }),
      },
      on(name: string, listener: never) {
        const listeners = name === 'agent/pre-step' ? preStepListeners : sessionListeners
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
      },
    }
    const runTurn = async (message: unknown, turn: number, toolNames: readonly string[]) => {
      for (const listener of preStepListeners) {
        await listener(
          { agent: controlAgent, messages: [message], turn, step: 1, signal: new AbortController().signal },
          async () => ({ kind: 'enter', messages: [message] }),
        )
      }
      for (const name of toolNames) {
        if (guards.some(guard => guard({ name }) !== undefined)) denied.push(name)
        else executed.push(name)
      }
      for (const listener of sessionListeners) {
        listener(controlAgent.session, { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
      }
    }
    const controlAgent = {
      session: { id: 'control-session' },
      ctx: scopedContext,
      whenIdle: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(async () => driverFinished),
      followup: vi.fn(message => {
        const turn = nextTurn++
        queueMicrotask(async () => {
          await runTurn(message, turn, ['goal_control', 'read_file'])
          if (turn === 7) finishDriver()
          else finishLaterTurn()
        })
      }),
    } as unknown as Agent
    const inspectSession = vi.fn(async () => ({
      meta: { id: EXECUTION_1.sessionId },
      events: [
        { seq: 0, time: 1, type: 'turn/start', data: { turn: 1 } },
        { seq: 1, time: 2, type: 'user/message', data: { id: 'task-input', source: { kind: 'goal', goalId: EXECUTION_1.goalId }, content: [{ type: 'text', text: 'work' }] } },
        { seq: 2, time: 3, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'task-reply', role: 'assistant', content: [{ type: 'text', text: 'Published successfully' }] } } },
        { seq: 3, time: 4, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
        { seq: 4, time: 5, type: 'goal/change', data: { operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 2 }, goal: { id: EXECUTION_1.goalId, revision: 2, phase: 'complete' } } },
      ] as never,
    }))
    const flushSession = vi.fn(async () => true)
    const getAgent = vi.fn(() => controlAgent)
    const readStatus = vi.fn(async () => completed)

    await deliverContinuousGoalSettlement({
      longGoalId: GOAL_ID,
      transition: 'complete',
      status: completed,
    }, { getAgent, readStatus, inspectSession, flushSession })

    expect(controlAgent.followup).toHaveBeenCalledOnce()
    expect(inspectSession).toHaveBeenCalledWith(EXECUTION_1.sessionId)
    expect(denied).toEqual(['goal_control', 'read_file'])
    expect(executed).toEqual([])
    expect(flushSession).toHaveBeenCalledOnce()
    expect(guards).toEqual([])

    controlAgent.followup({ id: 'later-user-message' } as never)
    await laterTurnFinished
    expect(controlAgent.followup).toHaveBeenCalledTimes(2)
    expect(denied).toEqual(['goal_control', 'read_file'])
    expect(executed).toEqual(['goal_control', 'read_file'])
  })

  it('contains a missing bound control Agent without attempting persistence or delivery', async () => {
    const completed = status(record(), ['complete'], null)
    const readStatus = vi.fn(async () => completed)
    const inspectSession = vi.fn(async () => ({ meta: { id: 'unused' }, events: [] }))
    const flushSession = vi.fn(async () => true)

    await expect(deliverContinuousGoalSettlement({
      longGoalId: GOAL_ID,
      transition: 'complete',
      status: completed,
    }, {
      getAgent: () => undefined,
      readStatus,
      inspectSession,
      flushSession,
    })).resolves.toBeUndefined()

    expect(readStatus).not.toHaveBeenCalled()
    expect(inspectSession).not.toHaveBeenCalled()
    expect(flushSession).not.toHaveBeenCalled()
  })
})
