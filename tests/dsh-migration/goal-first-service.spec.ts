import { describe, expect, it } from 'vitest'

import type {
  LongGoalRecord,
  LongGoalRecordV2,
  LongGoalStatusProjectionV2,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import {
  abandonGoalFirstTask,
  addGoalFirstGuidance,
  continueGoalFirstProgress,
  createGoalFirstProgress,
  type GoalFirstServiceDependencies,
} from '../../packages/tianwen-runtime-bundle/src/goal-first-service.js'

const STATE_ROOT = 'D:/goal-first-state'
const DSH_STATUS_TARGET = { dataDir: 'D:/goal-first-dsh' } as never
const GOAL_ID = 'tianwen-long-goal-00000000-0000-4000-8000-000000000001'
const TASK_ID = '00000000-0000-4000-8000-000000000011'
const EXECUTION = { goalId: 'dsh-goal-1', sessionId: 'task-session-1' }

function record(overrides: Partial<LongGoalRecordV2> = {}): LongGoalRecordV2 {
  return {
    schemaVersion: 'tianwen.long-goal.v2',
    id: GOAL_ID,
    revision: 1,
    objective: 'Ship the Goal-first service',
    context: null,
    successCriteria: null,
    workspaceRoot: 'D:/workspace',
    maxTaskRounds: 3,
    planner: {
      sessionId: 'planner-session-1',
      agentPreset: 'planner',
      planRevision: 0,
      phase: 'unplanned',
      consideredSettledTasks: 0,
    },
    guidance: [],
    createdAt: 1,
    updatedAt: 1,
    tasks: [],
    ...overrides,
  }
}

function status(source: LongGoalRecordV2, overrides: Partial<LongGoalStatusProjectionV2> = {}): LongGoalStatusProjectionV2 {
  const tasks = source.tasks.map(task => ({
    id: task.id,
    objective: task.objective,
    phase: task.resolution === 'abandoned' ? 'abandoned' as const : 'pending' as const,
    execution: task.execution,
    resolution: task.resolution,
  }))
  return {
    schemaVersion: 'tianwen.long-goal-status.v2',
    goal: {
      id: source.id,
      objective: source.objective,
      context: source.context,
      successCriteria: source.successCriteria,
      phase: 'planning',
      revision: source.revision,
      completedTasks: 0,
      abandonedTasks: 0,
      totalTasks: tasks.length,
    },
    planner: {
      sessionId: source.planner.sessionId,
      phase: source.planner.phase,
      planRevision: source.planner.planRevision,
    },
    guidance: source.guidance,
    tasks,
    currentTaskId: null,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
    ...overrides,
  }
}

function taskStatus(
  source: LongGoalRecordV2,
  phase: LongGoalStatusProjectionV2['tasks'][number]['phase'],
  goalPhase: LongGoalStatusProjectionV2['goal']['phase'],
  execution = EXECUTION,
): LongGoalStatusProjectionV2 {
  return status(source, {
    goal: {
      id: source.id,
      objective: source.objective,
      context: source.context,
      successCriteria: source.successCriteria,
      phase: goalPhase,
      revision: source.revision,
      completedTasks: phase === 'complete' ? 1 : 0,
      abandonedTasks: phase === 'abandoned' ? 1 : 0,
      totalTasks: source.tasks.length,
    },
    tasks: source.tasks.map(task => ({
      id: task.id,
      objective: task.objective,
      phase,
      execution,
      resolution: phase === 'abandoned' ? 'abandoned' : null,
    })),
    currentTaskId: source.tasks[0]?.id ?? null,
  })
}

interface DoubleOptions {
  readonly created?: LongGoalRecordV2 | LongGoalRecord
  readonly current?: LongGoalRecordV2 | LongGoalRecord
  readonly currentStatus?: LongGoalStatusProjectionV2
  readonly plannerResult?: 'submitted' | 'not-submitted'
  readonly taskResult?: { readonly action: 'started' | 'continued' | 'already-running', readonly sessionId: string }
  readonly onPlanner?: (input: { readonly record: LongGoalRecordV2, readonly reason: 'create' | 'continue' | 'guidance' }) => void
  readonly onTask?: () => void
  readonly onAbandon?: () => void
}

function doubles(options: DoubleOptions = {}) {
  const events: string[] = []
  let current = options.current ?? record()
  let currentStatus = options.currentStatus ?? status(current as LongGoalRecordV2)
  let abandonInput: unknown
  const dependencies = {
    createRecord: ((input: Parameters<GoalFirstServiceDependencies['createRecord']>[0]) => {
      events.push('record-created')
      current = options.created ?? record({
        objective: input.objective,
        context: input.context,
        successCriteria: input.successCriteria,
        workspaceRoot: input.workspaceRoot,
        planner: { ...record().planner, agentPreset: input.agentPreset },
      })
      return current
    }) as GoalFirstServiceDependencies['createRecord'],
    readRecord: (() => {
      events.push('record-read')
      return current
    }) as GoalFirstServiceDependencies['readRecord'],
    readStatus: (async () => {
      events.push('status-read')
      return currentStatus
    }) as GoalFirstServiceDependencies['readStatus'],
    appendGuidance: ((_: string, __: string, expectedRevision: number, text: string) => {
      events.push('guidance-appended')
      const v2 = current as LongGoalRecordV2
      if (v2.revision !== expectedRevision) throw new Error('revision conflict')
      current = {
        ...v2,
        revision: v2.revision + 1,
        planner: { ...v2.planner, phase: 'needs-replan' },
        guidance: [...v2.guidance, text],
      }
      return current as LongGoalRecordV2
    }) as GoalFirstServiceDependencies['appendGuidance'],
    abandonBlockedTask: (async input => {
      events.push('task-abandoned')
      abandonInput = input
      options.onAbandon?.()
      return current as LongGoalRecordV2
    }) as GoalFirstServiceDependencies['abandonBlockedTask'],
    runPlannerTurn: async input => {
      events.push('planner-turn')
      options.onPlanner?.(input)
      return options.plannerResult ?? 'submitted'
    },
    runTask: async () => {
      events.push('task-admitted')
      options.onTask?.()
      return options.taskResult ?? { action: 'started', sessionId: 'task-session-1' }
    },
  } satisfies GoalFirstServiceDependencies
  return {
    events,
    get abandonInput() { return abandonInput },
    dependencies,
    setStatus(next: LongGoalStatusProjectionV2) { currentStatus = next },
  }
}

describe('Goal-first state service', () => {
  it('persists, plans once, admits the first ready Task, and returns the final status on create', async () => {
    const created = record()
    const planned = record({
      revision: 2,
      planner: { ...created.planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: TASK_ID, objective: 'Implement the service', execution: null, resolution: null }],
    })
    const final = taskStatus(record({ ...planned, revision: 3 }), 'active', 'active')
    const harness = doubles({
      created,
      onPlanner: () => harness.setStatus(status(planned, {
        goal: { ...status(planned).goal, phase: 'active' }, currentTaskId: TASK_ID,
      })),
      onTask: () => harness.setStatus(final),
    })

    await expect(createGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, objective: created.objective,
      context: null, successCriteria: null, workspaceRoot: created.workspaceRoot, agentPreset: 'planner',
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'started', status: final, sessionId: 'task-session-1',
    })
    expect(harness.events).toEqual([
      'record-created', 'planner-turn', 'status-read', 'task-admitted', 'status-read',
    ])
  })

  it('returns planning-pending without admitting a Task when create planning has no submission', async () => {
    const created = record()
    const authoritative = status(created)
    const harness = doubles({ created, currentStatus: authoritative, plannerResult: 'not-submitted' })

    await expect(createGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, objective: created.objective,
      context: null, successCriteria: null, workspaceRoot: created.workspaceRoot, agentPreset: 'planner',
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'planning-pending', status: authoritative, sessionId: null,
    })
    expect(harness.events).toEqual(['record-created', 'planner-turn', 'status-read'])
  })

  it.each(['active', 'paused'] as const)(
    'continues a bound %s Task without calling the planner',
    async phase => {
      const current = record({
        revision: 3,
        planner: { ...record().planner, phase: 'ready', planRevision: 1 },
        tasks: [{ id: TASK_ID, objective: 'Current work', execution: EXECUTION, resolution: null }],
      })
      const authoritative = taskStatus(current, phase, 'active')
      const harness = doubles({ current, currentStatus: authoritative, taskResult: { action: 'continued', sessionId: EXECUTION.sessionId } })

      await expect(continueGoalFirstProgress({
        stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
      }, harness.dependencies)).resolves.toEqual({
        schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'continued', status: authoritative, sessionId: EXECUTION.sessionId,
      })
      expect(harness.events).not.toContain('planner-turn')
      expect(harness.events.filter(event => event === 'task-admitted')).toHaveLength(1)
    },
  )

  it('returns the blocked current Task without planning or admitting another Task', async () => {
    const current = record({
      revision: 3,
      planner: { ...record().planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: TASK_ID, objective: 'Blocked work', execution: EXECUTION, resolution: null }],
    })
    const authoritative = taskStatus(current, 'blocked', 'blocked')
    const harness = doubles({ current, currentStatus: authoritative })

    await expect(continueGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'blocked', status: authoritative, sessionId: EXECUTION.sessionId,
    })
    expect(harness.events).not.toContain('planner-turn')
    expect(harness.events).not.toContain('task-admitted')
  })

  it('admits a ready unbound Task without planning', async () => {
    const current = record({
      revision: 2,
      planner: { ...record().planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: TASK_ID, objective: 'Ready work', execution: null, resolution: null }],
    })
    const ready = status(current, { goal: { ...status(current).goal, phase: 'active' }, currentTaskId: TASK_ID })
    const final = taskStatus(record({ ...current, revision: 3 }), 'active', 'active')
    const harness = doubles({ current, currentStatus: ready, onTask: () => harness.setStatus(final) })

    await expect(continueGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
    }, harness.dependencies)).resolves.toMatchObject({ action: 'started', status: final, sessionId: EXECUTION.sessionId })
    expect(harness.events).not.toContain('planner-turn')
    expect(harness.events.filter(event => event === 'task-admitted')).toHaveLength(1)
  })

  it('replans once before admitting when newly settled Tasks exceed the considered count', async () => {
    const current = record({
      revision: 3,
      planner: { ...record().planner, phase: 'ready', planRevision: 1, consideredSettledTasks: 0 },
      tasks: [{ id: TASK_ID, objective: 'Finished work', execution: EXECUTION, resolution: null }],
    })
    const needsPlanning = taskStatus(current, 'complete', 'planning')
    const replanned = record({
      ...current,
      revision: 4,
      planner: { ...current.planner, phase: 'ready', planRevision: 2, consideredSettledTasks: 1 },
      tasks: [
        current.tasks[0]!,
        { id: '00000000-0000-4000-8000-000000000012', objective: 'Next work', execution: null, resolution: null },
      ],
    })
    const ready = status(replanned, {
      goal: { ...status(replanned).goal, phase: 'active' }, currentTaskId: replanned.tasks[1]!.id,
    })
    const final = taskStatus(record({ ...replanned, revision: 5, tasks: [replanned.tasks[1]!] }), 'active', 'active')
    const harness = doubles({
      current,
      currentStatus: needsPlanning,
      onPlanner: () => harness.setStatus(ready),
      onTask: () => harness.setStatus(final),
    })

    await expect(continueGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
    }, harness.dependencies)).resolves.toMatchObject({ action: 'started', status: final })
    expect(harness.events).toEqual([
      'record-read', 'status-read', 'planner-turn', 'status-read', 'task-admitted', 'status-read',
    ])
  })

  it('returns a complete Goal without planner or Task runtime effects', async () => {
    const current = record({ revision: 2, planner: { ...record().planner, phase: 'complete', planRevision: 1 } })
    const authoritative = status(current, { goal: { ...status(current).goal, phase: 'complete' } })
    const harness = doubles({ current, currentStatus: authoritative })

    await expect(continueGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.goal-first-progress-result.v2', action: 'complete', status: authoritative, sessionId: null,
    })
    expect(harness.events).not.toContain('planner-turn')
    expect(harness.events).not.toContain('task-admitted')
  })

  it('persists guidance before its one planner Turn and returns pending without running a Task', async () => {
    const current = record({ revision: 3, guidance: ['Keep scope'] })
    const authoritative = status(record({ ...current, revision: 4, guidance: [...current.guidance, 'Prefer the safe path'] }))
    const harness = doubles({ current, currentStatus: authoritative, plannerResult: 'not-submitted' })

    await expect(addGoalFirstGuidance({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id,
      expectedRevision: current.revision, text: 'Prefer the safe path',
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.long-goal-guidance-result.v2', planning: 'pending', status: authoritative,
    })
    expect(harness.events).toEqual(['record-read', 'guidance-appended', 'planner-turn', 'status-read'])
    expect(harness.events).not.toContain('task-admitted')
  })

  it('uses the authoritative blocked current Task for abandonment and re-reads its result', async () => {
    const current = record({
      revision: 3,
      planner: { ...record().planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: TASK_ID, objective: 'Blocked work', execution: EXECUTION, resolution: null }],
    })
    const blocked = taskStatus(current, 'blocked', 'blocked')
    const abandoned = record({
      ...current,
      revision: 4,
      planner: { ...current.planner, phase: 'needs-replan' },
      tasks: [{ ...current.tasks[0]!, resolution: 'abandoned' }],
    })
    const final = taskStatus(abandoned, 'abandoned', 'planning')
    const harness = doubles({ current, currentStatus: blocked, onAbandon: () => harness.setStatus(final) })

    await expect(abandonGoalFirstTask({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: current.revision,
    }, harness.dependencies)).resolves.toEqual({
      schemaVersion: 'tianwen.long-goal-abandon-result.v2', action: 'abandoned', status: final,
    })
    expect(harness.events).toEqual(['record-read', 'status-read', 'task-abandoned', 'status-read'])
    expect(harness.abandonInput).toMatchObject({ taskId: TASK_ID, dshStatusTarget: DSH_STATUS_TARGET })
    expect(harness.events).not.toContain('planner-turn')
  })

  it('rejects stale existing-Goal operations before planner or Task effects', async () => {
    const current = record({ revision: 2 })
    const harness = doubles({ current })
    const stale = { stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: current.id, expectedRevision: 1 }

    await expect(continueGoalFirstProgress(stale, harness.dependencies)).rejects.toThrow()
    await expect(addGoalFirstGuidance({ ...stale, text: 'Stale guidance' }, harness.dependencies)).rejects.toThrow()
    await expect(abandonGoalFirstTask(stale, harness.dependencies)).rejects.toThrow()
    expect(harness.events).toEqual(['record-read', 'record-read', 'record-read'])
  })

  it('rejects v1 records at every Goal-first operation', async () => {
    const legacy: LongGoalRecord = {
      schemaVersion: 'tianwen.long-goal.v1', id: GOAL_ID, objective: 'Legacy', maxTaskRounds: 1,
      createdAt: 1, updatedAt: 1, tasks: [],
    }
    const harness = doubles({ created: legacy, current: legacy, currentStatus: status(record()) })
    const existing = { stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: legacy.id, expectedRevision: 1 }

    await expect(createGoalFirstProgress({
      stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, objective: 'New', context: null,
      successCriteria: null, workspaceRoot: 'D:/workspace', agentPreset: 'planner',
    }, harness.dependencies)).rejects.toThrow()
    await expect(continueGoalFirstProgress(existing, harness.dependencies)).rejects.toThrow()
    await expect(addGoalFirstGuidance({ ...existing, text: 'No migration' }, harness.dependencies)).rejects.toThrow()
    await expect(abandonGoalFirstTask(existing, harness.dependencies)).rejects.toThrow()
    expect(harness.events).toEqual(['record-created', 'record-read', 'record-read', 'record-read'])
  })
})
