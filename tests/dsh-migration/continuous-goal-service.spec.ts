import { describe, expect, it } from 'vitest'

import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import {
  controlContinuousGoal,
  createContinuousGoalProgress,
  type ContinuousGoalServiceDependencies,
} from '../../packages/tianwen-runtime-bundle/src/continuous-goal-service.js'

const STATE_ROOT = 'D:/continuous-goal-state'
const DSH_STATUS_TARGET = { dataDir: 'D:/continuous-goal-dsh' } as never
const GOAL_ID = 'tianwen-long-goal-00000000-0000-4000-8000-000000000001'
const TASK_ID = '00000000-0000-4000-8000-0000-000000000011'
const EXECUTION = { goalId: 'dsh-goal-1', sessionId: 'task-session-1' }

function record(overrides: Partial<LongGoalRecordV3> = {}): LongGoalRecordV3 {
  return {
    schemaVersion: 'tianwen.long-goal.v3', id: GOAL_ID, revision: 1,
    objective: 'Ship continuous Goal control', context: null, successCriteria: null,
    workspaceRoot: 'D:/workspace', maxTaskRounds: 3,
    planner: { sessionId: 'planner-session-1', agentPreset: 'planner', planRevision: 0, phase: 'unplanned', consideredSettledTasks: 0 },
    guidance: [], control: { sessionId: 'control-session-1', autoProgress: 'running' },
    createdAt: 1, updatedAt: 1, tasks: [], ...overrides,
  }
}

function status(source: LongGoalRecordV3, overrides: Partial<LongGoalStatusProjectionV3> = {}): LongGoalStatusProjectionV3 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v3',
    goal: { id: source.id, objective: source.objective, context: source.context, successCriteria: source.successCriteria, phase: 'active', revision: source.revision, completedTasks: 0, abandonedTasks: 0, totalTasks: source.tasks.length },
    planner: { sessionId: source.planner.sessionId, phase: source.planner.phase, planRevision: source.planner.planRevision },
    guidance: source.guidance,
    tasks: source.tasks.map(task => ({ id: task.id, objective: task.objective, phase: task.execution === null ? 'pending' as const : 'active' as const, execution: task.execution, resolution: task.resolution })),
    currentTaskId: source.tasks[0]?.id ?? null,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true }, control: source.control,
    ...overrides,
  }
}

function harness(initial = record()) {
  const events: string[] = []
  let current = initial
  let currentStatus = status(initial)
  const dependencies = {
    createRecord: (() => current) as ContinuousGoalServiceDependencies['createRecord'],
    readRecord: (() => current) as ContinuousGoalServiceDependencies['readRecord'],
    readStatus: (async () => currentStatus) as ContinuousGoalServiceDependencies['readStatus'],
    appendGuidance: (() => { throw new Error('v2 only') }) as ContinuousGoalServiceDependencies['appendGuidance'],
    abandonBlockedTask: (async () => { throw new Error('v2 only') }) as ContinuousGoalServiceDependencies['abandonBlockedTask'],
    runPlannerTurn: async () => { events.push('planner') ; return 'not-submitted' as const },
    runTask: async () => { events.push('task'); return { action: 'started' as const, sessionId: EXECUTION.sessionId } },
    createContinuousRecord: (() => { events.push('create'); return current }) as ContinuousGoalServiceDependencies['createContinuousRecord'],
    setMode: ((input: { mode: 'running' | 'paused' }) => { events.push(`mode:${input.mode}`); current = { ...current, revision: current.revision + 1, control: { ...current.control, autoProgress: input.mode } }; currentStatus = { ...currentStatus, control: current.control }; return current }) as ContinuousGoalServiceDependencies['setMode'],
    appendGuidanceOnly: ((input: { text: string }) => { events.push('guide'); current = { ...current, revision: current.revision + 1, guidance: [...current.guidance, input.text] }; return current }) as ContinuousGoalServiceDependencies['appendGuidanceOnly'],
    redirect: ((input: { text: string }) => { events.push('redirect'); current = { ...current, revision: current.revision + 1, guidance: [...current.guidance, input.text], control: { ...current.control, autoProgress: 'paused' } }; return current }) as ContinuousGoalServiceDependencies['redirect'],
    abandonRedirectedTask: (async input => { events.push('abandon'); current = { ...current, revision: current.revision + 1, tasks: current.tasks.map(task => task.id === input.taskId ? { ...task, resolution: 'abandoned' } : task) }; currentStatus = status(current, { goal: { ...status(current).goal, phase: 'planning' }, currentTaskId: null }); return current }) as ContinuousGoalServiceDependencies['abandonRedirectedTask'],
    cancelTaskAndReadStatus: async () => { events.push('cancel'); return 'paused' as const },
  } satisfies ContinuousGoalServiceDependencies
  return {
    dependencies,
    events,
    get current() { return current },
    advancePlan() {
      current = {
        ...current,
        revision: current.revision + 1,
        planner: { ...current.planner, phase: 'ready', planRevision: current.planner.planRevision + 1 },
        tasks: [...current.tasks, { id: '00000000-0000-4000-8000-000000000012', objective: 'Next work', execution: EXECUTION, resolution: null }],
      }
      currentStatus = status(current)
    },
    setStatus(next: LongGoalStatusProjectionV3) { currentStatus = next },
  }
}

describe('continuous Goal control service', () => {
  it('persists a v3 record before its one planner turn and starts at most one Task', async () => {
    const current = record()
    const subject = harness(current)
    await expect(createContinuousGoalProgress({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, objective: current.objective, context: null, successCriteria: null, workspaceRoot: current.workspaceRoot, agentPreset: 'planner', controlSessionId: current.control.sessionId }, subject.dependencies)).resolves.toMatchObject({ action: 'planning-pending' })
    expect(subject.events).toEqual(['create', 'planner'])
  })

  it('guides durably without invoking the planner or Task runtime', async () => {
    const subject = harness()
    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'guide', text: 'Use the safe path' } }, subject.dependencies)).resolves.toMatchObject({ action: 'guided' })
    expect(subject.events).toEqual(['guide'])
  })

  it('writes pause before cancelling an active Task', async () => {
    const current = record({ tasks: [{ id: TASK_ID, objective: 'Active work', execution: EXECUTION, resolution: null }] })
    const subject = harness(current)
    subject.setStatus(status(current))
    await controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'pause' } }, subject.dependencies)
    expect(subject.events).toEqual(['mode:paused', 'cancel'])
  })

  it('writes running and invokes the Goal-first Continue operation once on resume', async () => {
    const current = record({ control: { sessionId: 'control-session-1', autoProgress: 'paused' } })
    const subject = harness(current)
    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'resume' } }, subject.dependencies)).resolves.toMatchObject({ action: 'planning-pending' })
    expect(subject.events).toEqual(['mode:running', 'planner'])
  })

  it('redirects atomically, confirms pause, abandons, and runs one planner turn', async () => {
    const current = record({ tasks: [{ id: TASK_ID, objective: 'Old work', execution: EXECUTION, resolution: null }] })
    const subject = harness(current)
    subject.setStatus(status(current, { tasks: [{ id: TASK_ID, objective: 'Old work', phase: 'active', execution: EXECUTION, resolution: null }] }))
    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'pause-and-replan', text: 'Change direction', resume: false } }, subject.dependencies)).resolves.toMatchObject({ action: 'redirected' })
    expect(subject.events).toEqual(['redirect', 'cancel', 'abandon', 'planner'])
  })

  it('lets Continue perform the only not-submitted redirect planner turn when resuming', async () => {
    const current = record({ tasks: [{ id: TASK_ID, objective: 'Old work', execution: EXECUTION, resolution: null }] })
    const subject = harness(current)
    subject.setStatus(status(current, { tasks: [{ id: TASK_ID, objective: 'Old work', phase: 'active', execution: EXECUTION, resolution: null }] }))

    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'pause-and-replan', text: 'Change direction', resume: true } }, subject.dependencies)).resolves.toMatchObject({ action: 'planning-pending', status: { control: { autoProgress: 'running' } } })
    expect(subject.events).toEqual(['redirect', 'cancel', 'abandon', 'mode:running', 'planner'])
  })

  it('lets a submitted redirect planner advance revision before the single Continue path', async () => {
    const current = record({ tasks: [{ id: TASK_ID, objective: 'Old work', execution: EXECUTION, resolution: null }] })
    const subject = harness(current)
    subject.setStatus(status(current, { tasks: [{ id: TASK_ID, objective: 'Old work', phase: 'active', execution: EXECUTION, resolution: null }] }))
    const dependencies = {
      ...subject.dependencies,
      runPlannerTurn: async () => { subject.events.push('planner'); subject.advancePlan(); return 'submitted' as const },
    } satisfies ContinuousGoalServiceDependencies

    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'pause-and-replan', text: 'Change direction', resume: true } }, dependencies)).resolves.toMatchObject({ action: 'resumed', status: { control: { autoProgress: 'running' } } })
    expect(subject.events).toEqual(['redirect', 'cancel', 'abandon', 'mode:running', 'planner', 'task'])
  })

  it('keeps the atomic redirection correction durable when cancellation fails', async () => {
    const current = record({ tasks: [{ id: TASK_ID, objective: 'Old work', execution: EXECUTION, resolution: null }] })
    const subject = harness(current)
    subject.setStatus(status(current, { tasks: [{ id: TASK_ID, objective: 'Old work', phase: 'active', execution: EXECUTION, resolution: null }] }))
    const dependencies = {
      ...subject.dependencies,
      cancelTaskAndReadStatus: async () => { throw new Error('DSH cancellation failed') },
    } satisfies ContinuousGoalServiceDependencies

    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'pause-and-replan', text: 'Change direction', resume: false } }, dependencies)).rejects.toThrow('DSH cancellation failed')
    expect(subject.events).toEqual(['redirect'])
    expect(subject.current).toMatchObject({ guidance: ['Change direction'], control: { autoProgress: 'paused' } })
  })

  it('reads status without mutation', async () => {
    const subject = harness()
    await expect(controlContinuousGoal({ stateRoot: STATE_ROOT, dshStatusTarget: DSH_STATUS_TARGET, longGoalId: GOAL_ID, expectedRevision: 1, action: { action: 'status' } }, subject.dependencies)).resolves.toMatchObject({ action: 'status' })
    expect(subject.events).toEqual([])
  })
})
