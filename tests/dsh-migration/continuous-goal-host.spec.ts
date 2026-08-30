import { describe, expect, it, vi } from 'vitest'

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import { mountContinuousGoalHost, type ContinuousGoalHostDependencies } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-host.js'

const GOAL_ID = 'tianwen-long-goal-00000000-0000-4000-8000-000000000001'
const TASK_ID = '00000000-0000-4000-8000-000000000002'
const EXECUTION = { sessionId: 'task-session', goalId: 'task-goal' }

function record(overrides: Partial<LongGoalRecordV3> = {}): LongGoalRecordV3 {
  return {
    schemaVersion: 'tianwen.long-goal.v3', id: GOAL_ID, revision: 4,
    objective: 'Ship release', context: null, successCriteria: null,
    workspaceRoot: 'D:/workspace', maxTaskRounds: 3,
    planner: { sessionId: 'planner-session', agentPreset: 'planner', planRevision: 1, phase: 'ready', consideredSettledTasks: 0 },
    guidance: [], control: { sessionId: 'control-session', autoProgress: 'running' },
    createdAt: 1, updatedAt: 1,
    tasks: [{ id: TASK_ID, objective: 'Publish', execution: EXECUTION, resolution: null }],
    ...overrides,
  }
}

function status(source: LongGoalRecordV3): LongGoalStatusProjectionV3 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v3',
    goal: { id: source.id, objective: source.objective, context: source.context, successCriteria: source.successCriteria, phase: 'active', revision: source.revision, completedTasks: 1, abandonedTasks: 0, totalTasks: 1 },
    planner: { sessionId: source.planner.sessionId, phase: source.planner.phase, planRevision: source.planner.planRevision },
    guidance: source.guidance,
    tasks: [{ id: TASK_ID, objective: 'Publish', phase: 'complete', execution: EXECUTION, resolution: null }],
    currentTaskId: null, runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true }, control: source.control,
  }
}

function agent(sessionId: string): Agent {
  return {
    id: sessionId, session: { id: sessionId, header: { cwd: 'D:/workspace', agentPreset: 'chat' } },
    whenIdle: vi.fn(async () => undefined),
    ctx: { goals: { get: () => undefined } },
  } as unknown as Agent
}

function harness(source = record()) {
  const goalListeners: ((input: { agent: Agent, change: { operation: string, ref: { id: string, revision: number } } }) => void)[] = []
  const sessionListeners: ((session: { id: string }, event: unknown) => void)[] = []
  const agentListeners: ((input: { agent: Agent }) => void)[] = []
  const live = new Map([[EXECUTION.sessionId, agent(EXECUTION.sessionId)]])
  const ctx = {
    agents: { list: () => [...live.values()], get: (id: string) => live.get(id) },
    on(name: string, listener: (...args: never[]) => void) {
      const listeners = name === 'goal/changed' ? goalListeners : name === 'session/event' ? sessionListeners : agentListeners
      listeners.push(listener as never)
      return () => listeners.splice(listeners.indexOf(listener as never), 1)
    },
  }
  const continueProgress = vi.fn(async () => undefined)
  const dependencies: ContinuousGoalHostDependencies = {
    roots: { stateRoot: 'D:/state', sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/state/evolution' },
    listLongGoals: () => [source], readLongGoal: () => source, readStatus: async () => status(source),
    createProgress: vi.fn(async () => undefined), control: vi.fn(async () => undefined), continueProgress,
    pause: vi.fn(() => source), flushSession: vi.fn(async () => undefined),
    installCommand: vi.fn(() => () => undefined), installBoundControls: vi.fn(() => () => undefined),
  }
  return {
    ctx, dependencies, continueProgress,
    complete() { for (const listener of goalListeners) listener({ agent: live.get(EXECUTION.sessionId)!, change: { operation: 'complete', ref: { id: EXECUTION.goalId, revision: 99 } } }) },
    abort(sessionId: string) {
      for (const listener of sessionListeners) listener({ id: sessionId }, {
        type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
      })
    },
  }
}

describe('continuous Goal Host', () => {
  it('continues a running v3 Goal once after its exact Task Goal completes', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    subject.complete()
    subject.complete()
    await dispose()

    expect(subject.continueProgress).toHaveBeenCalledTimes(1)
    expect(subject.continueProgress).toHaveBeenCalledWith({ longGoalId: GOAL_ID, expectedRevision: 4 })
  })

  it('ignores a user-aborted control Session after the continuous Goal is complete', async () => {
    const subject = harness(record({
      planner: { sessionId: 'planner-session', agentPreset: 'planner', planRevision: 1, phase: 'complete', consideredSettledTasks: 1 },
    }))
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    subject.abort('control-session')
    await dispose()

    expect(subject.dependencies.pause).not.toHaveBeenCalled()
    expect(subject.continueProgress).not.toHaveBeenCalled()
  })
})
