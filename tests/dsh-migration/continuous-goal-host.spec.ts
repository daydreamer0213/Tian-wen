import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { Agent, AgentOptions, AgentSetup } from '@deepseek-ai/dsh-agent'
import { SubagentError } from '@deepseek-ai/dsh-subagent'
import { sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { projectEvidence } from '../../packages/tianwen-evidence/src/index.js'
import {
  LongGoalIntegrityError,
  appendTianwenAttemptSettled,
  appendTianwenAttemptStarted,
  bindGoalFirstLongGoalTask,
  commitLongGoalPlan,
  createContinuousLongGoal,
  markTianwenAttemptPermissionLimited,
  readLongGoal,
  readTianwenTaskAttemptProjection,
  reserveTianwenPermissionRenewal,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3, LongGoalStatusProjectionV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import type { ContinuousGoalControlAction } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-service.js'
import { mountContinuousGoalHost, type ContinuousGoalHostDependencies } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-host.js'
import {
  createPermissionAttemptHost,
  deliverContinuousGoalSettlement,
  recordContinuousGoalTerminalAttempt,
  reportLongGoalProgress,
  runCurrentWebTask,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'
import { runLongGoalPlannerTurn } from '../../packages/tianwen-runtime-bundle/src/long-goal-planner.js'
import { permissionSnapshot } from '../../packages/tianwen-runtime-bundle/src/permission-attempt.js'

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

function terminalFixture(label: string) {
  const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
  mkdirSync(base, { recursive: true })
  const fixture = mkdtempSync(resolve(base, `${label}-`))
  const stateRoot = resolve(fixture, 'state')
  const created = createContinuousLongGoal({
    stateRoot,
    objective: 'Deliver one terminal result',
    context: null,
    successCriteria: null,
    workspaceRoot: fixture,
    agentPreset: 'planner-preset',
    controlSessionId: 'control-session',
  }, { goalSuffix: () => label, plannerSessionId: () => 'planner-session', now: () => 1 })
  const planned = commitLongGoalPlan({
    stateRoot, longGoalId: created.id, expectedRevision: created.revision,
    outcome: 'continue', tasks: [{ objective: 'Publish once' }], consideredSettledTasks: 0,
  }, { taskId: () => TASK_1, now: () => 2 }) as LongGoalRecordV3
  const started = appendTianwenAttemptStarted({
    stateRoot, longGoalId: planned.id, expectedRevision: planned.revision,
    taskId: TASK_1, epoch: 1, parentSessionId: planned.planner.sessionId,
    childSessionId: EXECUTION_1.sessionId, permissionFingerprint: `sha256:${label}`,
    permissionMode: 'read-only', startedAt: '2026-09-01T00:00:00.000Z',
  })
  const bound = bindGoalFirstLongGoalTask({
    stateRoot, longGoalId: started.id, expectedRevision: started.revision,
    taskId: TASK_1, execution: EXECUTION_1,
  }) as LongGoalRecordV3
  const settled = appendTianwenAttemptSettled({
    stateRoot, longGoalId: bound.id, expectedRevision: bound.revision,
    taskId: TASK_1, epoch: 1,
    terminalEventId: `goal-change:${EXECUTION_1.sessionId}:17:complete`,
  })
  return {
    fixture,
    stateRoot,
    record: settled,
    status: status(settled, ['complete'], null),
  }
}

function permissionLimitedFixture(label: string) {
  const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
  mkdirSync(base, { recursive: true })
  const fixture = mkdtempSync(resolve(base, `${label}-`))
  const stateRoot = resolve(fixture, 'state')
  const created = createContinuousLongGoal({
    stateRoot, objective: 'Remain permission-limited', context: null, successCriteria: null,
    workspaceRoot: fixture, agentPreset: 'planner-preset', controlSessionId: 'control-session',
  }, { goalSuffix: () => label, plannerSessionId: () => 'planner-session', now: () => 1 })
  const planned = commitLongGoalPlan({
    stateRoot, longGoalId: created.id, expectedRevision: created.revision,
    outcome: 'continue', tasks: [{ objective: 'Needs wider permission' }], consideredSettledTasks: 0,
  }, { taskId: () => TASK_1, now: () => 2 }) as LongGoalRecordV3
  const started = appendTianwenAttemptStarted({
    stateRoot, longGoalId: planned.id, expectedRevision: planned.revision,
    taskId: TASK_1, epoch: 1, parentSessionId: 'planner-session', childSessionId: EXECUTION_1.sessionId,
    permissionFingerprint: `sha256:${label}`, permissionMode: 'read-only',
    startedAt: '2026-09-01T00:00:00.000Z',
  })
  const bound = bindGoalFirstLongGoalTask({
    stateRoot, longGoalId: started.id, expectedRevision: started.revision,
    taskId: TASK_1, execution: EXECUTION_1,
  }) as LongGoalRecordV3
  const limited = markTianwenAttemptPermissionLimited({
    stateRoot, longGoalId: bound.id, expectedRevision: bound.revision,
    taskId: TASK_1, epoch: 1, childSessionId: EXECUTION_1.sessionId,
    terminalEventId: `permission-limited:${EXECUTION_1.sessionId}:9`,
  })
  return {
    fixture,
    stateRoot,
    record: limited,
    status: status(limited, ['blocked'], TASK_1, 'blocked'),
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

function disarmedTaskAgent(sessionId: string, goalId: string) {
  let current = { id: goalId, revision: 1, phase: 'paused' as const, activation: 'disarmed' as const }
  const resume = vi.fn(() => {
    current = { ...current, phase: 'active', activation: 'armed' } as typeof current
    return current
  })
  const disarm = vi.fn(() => {
    current = { ...current, activation: 'disarmed' } as typeof current
    return current
  })
  const value = {
    session: { id: sessionId, header: { cwd: 'D:/workspace', agentPreset: 'planner' } },
    ctx: { goals: { get: () => current, resume, disarm } },
  } as unknown as Agent
  return { value, resume, disarm, current: () => current }
}

function feedbackAgent(sessionId = 'control-session') {
  const preStepListeners: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>)[] = []
  const sessionListeners: ((session: unknown, event: unknown) => void)[] = []
  let idle = Promise.resolve()
  let nextTurn = 20
  const controlAgent = {
    session: { id: sessionId },
    ctx: {
      tools: { guard: () => () => undefined },
      on(name: string, listener: never) {
        const listeners = name === 'agent/pre-step' ? preStepListeners : sessionListeners
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
      },
    },
    whenIdle: vi.fn(() => idle),
    followup: vi.fn(message => {
      idle = new Promise<void>(resolve => queueMicrotask(async () => {
        const turn = nextTurn++
        for (const listener of preStepListeners) {
          await listener(
            { agent: controlAgent, messages: [message], turn, step: 1, signal: new AbortController().signal },
            async () => ({ kind: 'enter', messages: [message] }),
          )
        }
        for (const listener of sessionListeners) {
          listener(controlAgent.session, { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
        }
        resolve()
      }))
    }),
  } as unknown as Agent & {
    readonly whenIdle: ReturnType<typeof vi.fn>
    readonly followup: ReturnType<typeof vi.fn>
  }
  return controlAgent
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
  const directCreate = vi.fn()
  const directResume = vi.fn()
  const ctx = {
    agents: { list: () => [...live.values()], get: (id: string) => live.get(id), create: directCreate, resume: directResume },
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
    reportProgress: vi.fn(async () => undefined),
    recordTerminalAttempt: vi.fn(async () => undefined),
    reportError: vi.fn(),
    installCommand: vi.fn((controlAgent: Agent, operations) => {
      commands.set(controlAgent, operations as never)
      return { dispose: () => { commands.delete(controlAgent) } }
    }),
    installBoundControls: vi.fn(() => () => undefined),
  } satisfies ContinuousGoalHostDependencies
  return {
    ctx, dependencies, first, live, commands, order, continueProgress, readStatus, pause, directCreate, directResume,
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
    approval(sessionId: string, approvalId = 'approval-1') {
      for (const listener of sessionListeners) listener({ id: sessionId }, {
        type: 'approval/asked',
        data: { id: approvalId, toolName: 'pwsh', reason: 'Run verification' },
      })
    },
    sessionEvent(sessionId: string, event: unknown) {
      for (const listener of sessionListeners) listener({ id: sessionId }, event)
    },
    created(created: Agent) { for (const listener of agentListeners) listener({ agent: created }) },
    create(controlAgent: Agent, objective: string) { return commands.get(controlAgent)!.create(controlAgent, objective) },
    control(controlAgent: Agent, action: ContinuousGoalControlAction = { action: 'status' }) {
      return commands.get(controlAgent)!.control(controlAgent, action)
    },
  }
}

describe('continuous Goal Host', () => {
  it('reports coalesced durable facts from the exact Planner through the public DSH API', async () => {
    const planner = { session: { id: 'planner-session' } } as unknown as Agent
    const reportFrom = vi.fn(async () => 'main-report-message')
    const signal = new AbortController().signal

    await expect(reportLongGoalProgress({ subagents: { reportFrom } } as never, {
      planner,
      facts: [{
        stage: 'Task 1 active',
        lastCompletedAction: 'Plan persisted',
        waitingFor: 'Task result',
        nextAction: 'Verify Task 1',
        changedAt: '2026-09-01T00:00:00.000Z',
      }],
      signal,
    })).resolves.toBe('main-report-message')

    expect(reportFrom).toHaveBeenCalledWith(
      planner,
      [{ type: 'text', text: [
        'Stage: Task 1 active',
        'Last completed action: Plan persisted',
        'Waiting for: Task result',
        'Next action: Verify Task 1',
      ].join('\n') }],
      { delivery: 'next-step', signal },
    )
  })

  it('persists one offline main completion Turn before acknowledging delivery and never sends it twice', async () => {
    const terminal = terminalFixture('offline-exact-once')
    try {
      const controlAgent = feedbackAgent()
      let mainEvents: readonly SessionEvent[] = []
      const taskEvents = [
        { type: 'turn/start', seq: 10, time: 900, data: { turn: 4 } },
        { type: 'user/message', seq: 11, time: 901, surfaceOp: 'append', data: {
          id: 'task-input', role: 'user', content: [{ type: 'text', text: 'Publish once' }],
          source: { kind: 'goal', goalId: EXECUTION_1.goalId, revision: 1, round: 1 },
        } },
        { type: 'assistant/message', seq: 12, time: 950, surfaceOp: 'append', data: {
          turn: 4,
          message: { id: 'task-result', role: 'assistant', content: [{ type: 'text', text: 'Published once.' }] },
        } },
        { type: 'turn/end', seq: 13, time: 951, data: { turn: 4, reason: { kind: 'completed' } } },
        { type: 'goal/change', seq: 17, time: 1_000, data: {
          operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
          goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
        } },
      ] as unknown as readonly SessionEvent[]
      const inspectSession = vi.fn(async (sessionId: string) => sessionId === EXECUTION_1.sessionId
        ? { meta: { id: sessionId, parentSession: 'planner-session' }, events: taskEvents }
        : { meta: { id: sessionId }, events: mainEvents })
      const flushSession = vi.fn(async () => {
        const notice = controlAgent.followup.mock.calls[0]![0]
        mainEvents = [
          { type: 'turn/start', seq: 20, time: 1_100, data: { turn: 20 } },
          { type: 'user/message', seq: 21, time: 1_101, surfaceOp: 'append', data: notice },
          { type: 'assistant/message', seq: 22, time: 1_102, surfaceOp: 'append', data: {
            turn: 20,
            message: { id: 'main-result', role: 'assistant', content: [{ type: 'text', text: 'Delivery confirmed.' }] },
          } },
          { type: 'turn/end', seq: 23, time: 1_103, data: { turn: 20, reason: { kind: 'completed' } } },
        ] as unknown as readonly SessionEvent[]
        return true
      })
      const dependencies = {
        stateRoot: terminal.stateRoot,
        getAgent: () => controlAgent,
        readStatus: async () => terminal.status,
        inspectSession,
        flushSession,
      }

      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id, transition: 'complete', status: terminal.status,
      }, dependencies)).resolves.toBe(true)
      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id, transition: 'complete', status: terminal.status,
      }, dependencies)).resolves.toBe(true)

      expect(controlAgent.followup).toHaveBeenCalledOnce()
      expect(flushSession).toHaveBeenCalledOnce()
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(terminal.stateRoot, terminal.record.id) as LongGoalRecordV3,
        TASK_1,
      ).terminalDelivery).toEqual({
        terminalEventId: `goal-change:${EXECUTION_1.sessionId}:17:complete`,
        parentSessionId: 'planner-session',
        completionTurnObserved: true,
      })
    } finally {
      rmSync(terminal.fixture, { recursive: true, force: true })
    }
  })

  it('acknowledges an already-persisted native Planner completion Turn without sending fallback', async () => {
    const terminal = terminalFixture('native-observed')
    try {
      const taskEvents = [{
        type: 'goal/change', seq: 17, time: 1_000,
        data: {
          operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
          goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
        },
      }] as unknown as readonly SessionEvent[]
      const mainEvents = [
        { type: 'turn/start', seq: 20, time: 1_100, data: { turn: 9 } },
        { type: 'user/message', seq: 21, time: 1_101, surfaceOp: 'append', data: {
          id: 'native-settlement', role: 'user', content: [{ type: 'text', text: 'Planner settled.' }],
          source: { kind: 'subagent-settled', form: 'notice', summary: 'settled', senderSessionId: 'planner-session' },
        } },
        { type: 'assistant/message', seq: 22, time: 1_102, surfaceOp: 'append', data: {
          turn: 9,
          message: { id: 'native-main-reply', role: 'assistant', content: [{ type: 'text', text: 'Goal complete.' }] },
        } },
        { type: 'turn/end', seq: 23, time: 1_103, data: { turn: 9, reason: { kind: 'completed' } } },
      ] as unknown as readonly SessionEvent[]
      const followup = vi.fn()

      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id, transition: 'complete', status: terminal.status,
      }, {
        stateRoot: terminal.stateRoot,
        getAgent: () => ({ followup } as unknown as Agent),
        readStatus: async () => terminal.status,
        inspectSession: async sessionId => sessionId === EXECUTION_1.sessionId
          ? { meta: { id: sessionId, parentSession: 'planner-session' }, events: taskEvents }
          : { meta: { id: sessionId }, events: mainEvents },
        flushSession: vi.fn(async () => true),
      })).resolves.toBe(true)

      expect(followup).not.toHaveBeenCalled()
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(terminal.stateRoot, terminal.record.id) as LongGoalRecordV3,
        TASK_1,
      ).terminalDelivery?.completionTurnObserved).toBe(true)
    } finally {
      rmSync(terminal.fixture, { recursive: true, force: true })
    }
  })

  it('does not mistake a persisted Planner progress report for terminal settlement', async () => {
    const terminal = terminalFixture('progress-is-not-settlement')
    try {
      const taskEvents = [{
        type: 'goal/change', seq: 17, time: 1_000,
        data: {
          operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
          goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
        },
      }] as unknown as readonly SessionEvent[]
      const mainEvents = [
        { type: 'turn/start', seq: 20, time: 1_100, data: { turn: 9 } },
        { type: 'user/message', seq: 21, time: 1_101, surfaceOp: 'append', data: {
          id: 'native-progress', role: 'user', content: [{ type: 'text', text: 'Progress only.' }],
          source: { kind: 'subagent-report', form: 'notice', summary: 'progress', senderSessionId: 'planner-session' },
        } },
        { type: 'assistant/message', seq: 22, time: 1_102, surfaceOp: 'append', data: {
          turn: 9,
          message: { id: 'native-main-reply', role: 'assistant', content: [{ type: 'text', text: 'Keep going.' }] },
        } },
        { type: 'turn/end', seq: 23, time: 1_103, data: { turn: 9, reason: { kind: 'completed' } } },
      ] as unknown as readonly SessionEvent[]

      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id, transition: 'complete', status: terminal.status,
      }, {
        stateRoot: terminal.stateRoot,
        getAgent: () => undefined,
        readStatus: async () => terminal.status,
        inspectSession: async sessionId => sessionId === EXECUTION_1.sessionId
          ? { meta: { id: sessionId, parentSession: 'planner-session' }, events: taskEvents }
          : { meta: { id: sessionId }, events: mainEvents },
        flushSession: vi.fn(async () => true),
      })).resolves.toBe(false)

      expect(readTianwenTaskAttemptProjection(
        readLongGoal(terminal.stateRoot, terminal.record.id) as LongGoalRecordV3,
        TASK_1,
      ).terminalDelivery).toBeUndefined()
    } finally {
      rmSync(terminal.fixture, { recursive: true, force: true })
    }
  })

  it('does not acknowledge or rerun a Task when offline fallback delivery fails', async () => {
    const terminal = terminalFixture('offline-failure')
    try {
      const controlAgent = feedbackAgent()
      controlAgent.followup.mockImplementation(() => { throw new Error('main followup failed') })
      const taskEvents = [{
        type: 'goal/change', seq: 17, time: 1_000,
        data: {
          operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
          goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
        },
      }] as unknown as readonly SessionEvent[]

      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id, transition: 'complete', status: terminal.status,
      }, {
        stateRoot: terminal.stateRoot,
        getAgent: () => controlAgent,
        readStatus: async () => terminal.status,
        inspectSession: async sessionId => sessionId === EXECUTION_1.sessionId
          ? { meta: { id: sessionId, parentSession: 'planner-session' }, events: taskEvents }
          : { meta: { id: sessionId }, events: [] },
        flushSession: vi.fn(async () => true),
      })).rejects.toThrow('main followup failed')

      const reloaded = readLongGoal(terminal.stateRoot, terminal.record.id) as LongGoalRecordV3
      expect(readTianwenTaskAttemptProjection(reloaded, TASK_1).terminalDelivery).toBeUndefined()
      expect(readTianwenTaskAttemptProjection(reloaded, TASK_1).attempts).toHaveLength(1)
      expect(reloaded.tasks[0]!.execution).toEqual(EXECUTION_1)
    } finally {
      rmSync(terminal.fixture, { recursive: true, force: true })
    }
  })

  it('does not turn a permission-limited attempt into settlement feedback or delivery acknowledgement', async () => {
    const limited = permissionLimitedFixture('permission-limited-no-settlement')
    try {
      const main = feedbackAgent()
      await expect(deliverContinuousGoalSettlement({
        longGoalId: limited.record.id, transition: 'block', status: limited.status,
      }, {
        stateRoot: limited.stateRoot,
        getAgent: () => main,
        readStatus: async () => limited.status,
        inspectSession: async sessionId => ({ meta: { id: sessionId }, events: [] }),
        flushSession: vi.fn(async () => true),
      })).resolves.toBe(false)

      expect(main.followup).not.toHaveBeenCalled()
      const projection = readTianwenTaskAttemptProjection(
        readLongGoal(limited.stateRoot, limited.record.id) as LongGoalRecordV3,
        TASK_1,
      )
      expect(projection.attempts).toMatchObject([{ status: 'permission-limited' }])
      expect(projection.terminalDelivery).toBeUndefined()
    } finally {
      rmSync(limited.fixture, { recursive: true, force: true })
    }
  })

  it('folds a persisted child terminal event once after restart without starting the Task again', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'terminal-restart-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const created = createContinuousLongGoal({
        stateRoot,
        objective: 'Record one child terminal event',
        context: null,
        successCriteria: null,
        workspaceRoot: fixture,
        agentPreset: 'planner-preset',
        controlSessionId: 'main-control',
      }, {
        goalSuffix: () => 'terminal-restart', plannerSessionId: () => 'planner-terminal', now: () => 1,
      })
      const planned = commitLongGoalPlan({
        stateRoot, longGoalId: created.id, expectedRevision: created.revision,
        outcome: 'continue', tasks: [{ objective: 'Finish exact work once' }], consideredSettledTasks: 0,
      }, { taskId: () => TASK_1, now: () => 2 }) as LongGoalRecordV3
      const started = appendTianwenAttemptStarted({
        stateRoot, longGoalId: planned.id, expectedRevision: planned.revision,
        taskId: TASK_1, epoch: 1, parentSessionId: planned.planner.sessionId,
        childSessionId: EXECUTION_1.sessionId, permissionFingerprint: 'sha256:terminal-restart',
        permissionMode: 'read-only', startedAt: '2026-09-01T00:00:00.000Z',
      })
      const bound = bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: started.id, expectedRevision: started.revision,
        taskId: TASK_1, execution: EXECUTION_1,
      }) as LongGoalRecordV3
      const completed = status(bound, ['complete'], null)
      const inspectSession = vi.fn(async () => ({
        meta: {
          id: EXECUTION_1.sessionId,
          parentSession: bound.planner.sessionId,
        },
        events: [{
          type: 'goal/change', seq: 17, time: 1_000,
          data: {
            operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
            goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
          },
        }] as unknown as readonly SessionEvent[],
      }))

      await recordContinuousGoalTerminalAttempt({
        stateRoot, longGoalId: bound.id, status: completed,
      }, { inspectSession })
      await recordContinuousGoalTerminalAttempt({
        stateRoot, longGoalId: bound.id, status: completed,
      }, { inspectSession })

      const reloaded = readLongGoal(stateRoot, bound.id) as LongGoalRecordV3
      expect(readTianwenTaskAttemptProjection(reloaded, TASK_1)).toMatchObject({
        attempts: [{
          epoch: 1,
          childSessionId: EXECUTION_1.sessionId,
          status: 'settled',
          terminalEventId: `goal-change:${EXECUTION_1.sessionId}:17:complete`,
        }],
      })
      expect(reloaded.tasks[0]!.execution).toEqual(EXECUTION_1)
      expect(inspectSession).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('serializes a wider main sandbox event with exact Planner recovery on the same Goal lane', async () => {
    const source = record({
      tasks: [{ id: TASK_1, objective: 'Renew permission', execution: null, resolution: null }],
    })
    const subject = harness(source)
    subject.setStatus(status(source, ['pending'], TASK_1))
    let reserved = false
    let reservations = 0
    let releaseEvent!: () => void
    const eventHeld = new Promise<void>(resolve => { releaseEvent = resolve })
    const enteredEvent = vi.fn()
    const reserve = async (hold: boolean) => {
      const observed = reserved
      if (hold) {
        enteredEvent()
        await eventHeld
      }
      if (!observed) {
        reserved = true
        reservations += 1
      }
    }
    const handlePermissionEvent = vi.fn(async () => reserve(true))
    const reconcilePermissionAttempt = vi.fn(async () => reserve(false))
    Object.assign(subject.dependencies, { handlePermissionEvent, reconcilePermissionAttempt })

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(reconcilePermissionAttempt).toHaveBeenCalledOnce())
    reserved = false
    reservations = 0

    subject.sessionEvent('control-session', {
      type: 'sandbox/mode', seq: 9, time: 9, data: { mode: 'danger-full-access' },
    })
    await vi.waitFor(() => expect(enteredEvent).toHaveBeenCalledOnce())
    subject.created(agent('planner-session', 'planner-goal'))
    releaseEvent()
    await dispose()

    expect(reservations).toBe(1)
    expect(handlePermissionEvent).toHaveBeenCalledOnce()
    expect(reconcilePermissionAttempt).toHaveBeenCalledTimes(2)
  })

  it('starts and continues the Planner through native DSH with the exact live main Agent parent', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'native-planner-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot,
        objective: 'Keep native child lineage exact',
        context: null,
        successCriteria: null,
        workspaceRoot: fixture,
        agentPreset: 'planner-preset',
        controlSessionId: 'main-control',
      }, {
        goalSuffix: () => 'native-planner-host',
        plannerSessionId: () => 'reserved-planner',
        now: () => 1,
      })
      const main = { session: { id: 'main-control' } } as unknown as Agent
      const whenIdle = vi.fn(async () => undefined)
      const planner = {
        id: 'reserved-planner',
        session: { id: 'reserved-planner', header: { cwd: fixture, agentPreset: 'planner-preset' } },
        whenIdle,
      } as unknown as Agent
      const live = new Map<string, Agent>([['main-control', main]])
      const start = vi.fn(async (input: { readonly parent: Agent, readonly childId: string }) => {
        live.set(input.childId, planner)
        return { childId: input.childId, messageId: 'initial-message' }
      })
      const followup = vi.fn(async () => 'followup-message')
      const setups = new Map<string, AgentSetup>()
      let persisted = false
      const directCreate = vi.fn(async () => { throw new Error('direct Agent creation is forbidden for v3 Planner') })
      const directResume = vi.fn(async () => { throw new Error('agents.resume is forbidden for v3 Planner continuation') })
      const dependencies = {
        inspectSession: vi.fn(async () => persisted
          ? { exists: true, cwd: fixture, agentPreset: 'planner-preset' }
          : { exists: false }),
        createAgent: directCreate,
        resumeAgent: directResume,
        getAgent: (sessionId: string) => live.get(sessionId),
        installNativeSetup: (sessionId: string, setup: AgentSetup) => { setups.set(sessionId, setup) },
        startNativeChild: async (input: {
          readonly parent: Agent
          readonly childId: string
          readonly label: string
          readonly prompt: unknown[]
          readonly agentOptions: AgentOptions
          readonly signal: AbortSignal
        }) => {
          persisted = true
          return start(input)
        },
        followupNativeChild: followup,
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        flushSession: vi.fn(async () => undefined),
        readSettledTaskResult: vi.fn(async () => undefined),
      }
      const input = {
        stateRoot,
        dshStatusTarget: { sessionsRoot: resolve(fixture, 'sessions'), evolutionRoot: resolve(stateRoot, 'evolution') },
        record: source,
        reason: 'create' as const,
      }

      await expect(runLongGoalPlannerTurn(input, dependencies as never)).resolves.toBe('not-submitted')
      await expect(runLongGoalPlannerTurn({ ...input, reason: 'continue' }, dependencies as never)).resolves.toBe('not-submitted')

      expect(start).toHaveBeenCalledWith(expect.objectContaining({
        parent: main,
        childId: 'reserved-planner',
        label: 'Long Goal Planner',
      }))
      expect(followup).toHaveBeenCalledWith(
        main,
        'reserved-planner',
        expect.any(Array),
        expect.any(AbortSignal),
      )
      expect(setups.get('reserved-planner')).toBeTypeOf('function')
      expect(directCreate).not.toHaveBeenCalled()
      expect(directResume).not.toHaveBeenCalled()
      expect(whenIdle).toHaveBeenCalledTimes(2)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('closes a pre-acceptance rejection, then cold-adopts the exact DSH-accepted child without another Task start', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'native-task-rejection-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot,
        objective: 'Keep rejected work retryable',
        context: null,
        successCriteria: null,
        workspaceRoot: fixture,
        agentPreset: 'planner-preset',
        controlSessionId: 'main-control',
      }, {
        goalSuffix: () => 'native-task-rejection',
        plannerSessionId: () => 'live-planner',
        now: () => 1,
      })
      const planned = commitLongGoalPlan({
        stateRoot,
        longGoalId: source.id,
        expectedRevision: 1,
        outcome: 'continue',
        tasks: [{ objective: 'Start exact child' }],
        consideredSettledTasks: 0,
      }, {
        taskId: () => '00000000-0000-4000-8000-000000000091',
        now: () => 2,
      }) as LongGoalRecordV3
      const taskId = planned.tasks[0]!.id
      const planner = {
        id: 'live-planner',
        session: { id: 'live-planner', header: { cwd: fixture, agentPreset: 'planner-preset' } },
      } as unknown as Agent
      const directCreate = vi.fn(async () => { throw new Error('direct Task Session creation is forbidden') })
      const reservedIds = ['reserved-task-child', 'accepted-before-bind-child']
      let startFailure: Error = new Error('native start rejected before acceptance')
      const startNativeTaskChild = vi.fn(async (input: { readonly parent: Agent, readonly childId: string }) => {
        expect(input.parent).toBe(planner)
        throw startFailure
      })
      const adoptedGoal = {
        id: 'adopted-task-goal', revision: 1, phase: 'active' as const, activation: 'armed' as const,
        objective: 'Start exact child', maxGoalRounds: 3,
      }
      const adoptedChild = {
        session: {
          id: 'accepted-before-bind-child',
          header: { cwd: fixture, agentPreset: 'planner-preset', parentSession: 'live-planner' },
        },
        ctx: { goals: { get: () => adoptedGoal } },
      } as unknown as Agent
      const live = new Map<string, Agent>([['live-planner', planner]])
      const followupNativeTaskChild = vi.fn(async (_parent: Agent, childId: string) => {
        expect(childId).toBe('accepted-before-bind-child')
        live.set(childId, adoptedChild)
        return 'cold-adopt-message'
      })
      const dependencies = {
        readLongGoal,
        readLongGoalStatus: vi.fn(async () => {
          const latest = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
          return status(latest, [latest.tasks[0]!.execution === null ? 'pending' : 'active'], taskId)
        }),
        bindLongGoalTask: vi.fn(),
        bindGoalFirstLongGoalTask,
        listSessions: vi.fn(async () => []),
        createSession: directCreate,
        reserveTaskSessionId: () => reservedIds.shift()!,
        startNativeTaskChild,
        followupNativeTaskChild,
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        attachedAgent: (sessionId: string) => live.get(sessionId),
        createGoal: vi.fn(() => adoptedGoal),
        readGoalRef: vi.fn(),
        resumeColdGoal: vi.fn(),
        flushSession: vi.fn(),
      }

      await expect(runCurrentWebTask({
        roots: {
          stateRoot,
          sessionsRoot: resolve(fixture, 'sessions'),
          evolutionRoot: resolve(stateRoot, 'evolution'),
        },
        longGoalId: source.id,
        expectedRevision: planned.revision,
      }, dependencies as never)).rejects.toThrow('native start rejected before acceptance')

      expect(directCreate).not.toHaveBeenCalled()
      expect(startNativeTaskChild).toHaveBeenCalledOnce()
      const reloaded = readLongGoal(stateRoot, source.id)
      if (reloaded.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
      expect(reloaded.tasks[0]!.execution).toBeNull()
      expect(readTianwenTaskAttemptProjection(reloaded, taskId)).toMatchObject({
        attempts: [{
          epoch: 1,
          parentSessionId: 'live-planner',
          childSessionId: 'reserved-task-child',
          status: 'interrupted',
        }],
      })

      startFailure = new SubagentError('subagent already exists after DSH acceptance', 'DUPLICATE_CHILD')
      await expect(runCurrentWebTask({
        roots: {
          stateRoot,
          sessionsRoot: resolve(fixture, 'sessions'),
          evolutionRoot: resolve(stateRoot, 'evolution'),
        },
        longGoalId: source.id,
        expectedRevision: reloaded.revision,
      }, dependencies as never)).resolves.toMatchObject({
        action: 'started', sessionId: 'accepted-before-bind-child',
      })
      const acceptedBeforeBind = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
      expect(readTianwenTaskAttemptProjection(acceptedBeforeBind, taskId).attempts).toMatchObject([
        { epoch: 1, childSessionId: 'reserved-task-child', status: 'interrupted' },
        { epoch: 2, childSessionId: 'accepted-before-bind-child', status: 'running' },
      ])
      expect(acceptedBeforeBind.tianwenEvents?.filter(event => event.type === 'attempt-provisioning-failed')).toHaveLength(1)
      expect(acceptedBeforeBind.tasks[0]!.execution).toEqual({
        sessionId: 'accepted-before-bind-child', goalId: 'adopted-task-goal',
      })
      expect(followupNativeTaskChild).toHaveBeenCalledOnce()

      await expect(runCurrentWebTask({
        roots: {
          stateRoot,
          sessionsRoot: resolve(fixture, 'sessions'),
          evolutionRoot: resolve(stateRoot, 'evolution'),
        },
        longGoalId: source.id,
        expectedRevision: acceptedBeforeBind.revision,
      }, dependencies as never)).resolves.toMatchObject({
        action: 'already-running', sessionId: 'accepted-before-bind-child',
      })
      const restarted = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
      expect(readTianwenTaskAttemptProjection(restarted, taskId).attempts).toHaveLength(2)
      expect(startNativeTaskChild.mock.calls.slice(1).map(call => call[0].childId)).toEqual([
        'accepted-before-bind-child',
      ])
      expect(dependencies.createGoal).not.toHaveBeenCalled()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('retries rejected native Task provisioning with the unchanged permission snapshot', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'native-task-provisioning-retry-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot,
        objective: 'Retry the exact provisioning request',
        context: null,
        successCriteria: null,
        workspaceRoot: fixture,
        agentPreset: 'planner-preset',
        controlSessionId: 'main-control',
      }, {
        goalSuffix: () => 'native-task-provisioning-retry',
        plannerSessionId: () => 'live-planner',
        now: () => 1,
      })
      const planned = commitLongGoalPlan({
        stateRoot,
        longGoalId: source.id,
        expectedRevision: 1,
        outcome: 'continue',
        tasks: [{ objective: 'Start exact child' }],
        consideredSettledTasks: 0,
      }, {
        taskId: () => '00000000-0000-4000-8000-000000000092',
        now: () => 2,
      }) as LongGoalRecordV3
      const taskId = planned.tasks[0]!.id
      const planner = {
        session: { id: 'live-planner', header: { cwd: fixture, agentPreset: 'planner-preset' } },
      } as unknown as Agent
      const secondTask = {
        session: { id: 'reserved-task-child-2', header: { cwd: fixture, agentPreset: 'planner-preset' } },
        ctx: { goals: { get: () => undefined } },
      } as unknown as Agent
      const live = new Map<string, Agent>([['live-planner', planner]])
      const reservedIds = ['reserved-task-child-1', 'reserved-task-child-2']
      const directCreate = vi.fn(async () => { throw new Error('direct Task Session creation is forbidden') })
      const directResume = vi.fn(async () => { throw new Error('agents.resume is forbidden for v3 Task') })
      const startNativeTaskChild = vi.fn(async (input: { readonly parent: Agent, readonly childId: string }) => {
        expect(input.parent).toBe(planner)
        if (input.childId === 'reserved-task-child-1') {
          throw new Error('native start rejected before acceptance')
        }
        live.set(input.childId, secondTask)
        return { childId: input.childId }
      })
      const dependencies = {
        readLongGoal,
        readLongGoalStatus: vi.fn(async () => {
          const current = readLongGoal(stateRoot, source.id)
          if (current.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
          return status(current, ['active'], taskId)
        }),
        bindLongGoalTask: vi.fn(),
        bindGoalFirstLongGoalTask,
        listSessions: vi.fn(async () => []),
        createSession: directCreate,
        reserveTaskSessionId: () => reservedIds.shift()!,
        startNativeTaskChild,
        followupNativeTaskChild: vi.fn(),
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        attachedAgent: (sessionId: string) => live.get(sessionId),
        createGoal: vi.fn(() => ({ id: 'goal-epoch-2' })),
        readGoalRef: vi.fn(),
        resumeColdGoal: directResume,
        flushSession: vi.fn(),
      }
      const roots = {
        stateRoot,
        sessionsRoot: resolve(fixture, 'sessions'),
        evolutionRoot: resolve(stateRoot, 'evolution'),
      }
      await expect(runCurrentWebTask({
        roots,
        longGoalId: source.id,
        expectedRevision: planned.revision,
      }, dependencies as never)).rejects.toThrow('native start rejected before acceptance')
      const interrupted = readLongGoal(stateRoot, source.id)

      await expect(runCurrentWebTask({
        roots,
        longGoalId: source.id,
        expectedRevision: interrupted.revision,
      }, dependencies as never)).resolves.toMatchObject({
        sessionId: 'reserved-task-child-2',
        action: 'started',
      })

      expect(startNativeTaskChild).toHaveBeenCalledTimes(2)
      expect(startNativeTaskChild.mock.calls[1]![0]).toMatchObject({ childId: 'reserved-task-child-2' })
      expect(directCreate).not.toHaveBeenCalled()
      expect(directResume).not.toHaveBeenCalled()
      const reloaded = readLongGoal(stateRoot, source.id)
      if (reloaded.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
      expect(readTianwenTaskAttemptProjection(reloaded, taskId)).toMatchObject({
        attempts: [
          { epoch: 1, status: 'interrupted' },
          { epoch: 2, childSessionId: 'reserved-task-child-2', status: 'running' },
        ],
      })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('renews a structured limited attempt only through a wider main Session and preserves old child evidence', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'permission-renewal-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot,
        objective: 'Renew only proven sandbox limits',
        context: null,
        successCriteria: null,
        workspaceRoot: fixture,
        agentPreset: 'planner-preset',
        controlSessionId: 'main-control',
      }, {
        goalSuffix: () => 'permission-renewal',
        plannerSessionId: () => 'planner-old',
        now: () => 1,
      })
      const planned = commitLongGoalPlan({
        stateRoot,
        longGoalId: source.id,
        expectedRevision: 1,
        outcome: 'continue',
        tasks: [{ objective: 'Write protected output' }],
        consideredSettledTasks: 0,
      }, {
        taskId: () => '00000000-0000-4000-8000-000000000093',
        now: () => 2,
      }) as LongGoalRecordV3
      const taskId = planned.tasks[0]!.id
      appendTianwenAttemptStarted({
        stateRoot,
        longGoalId: source.id,
        expectedRevision: 2,
        taskId,
        epoch: 1,
        parentSessionId: 'planner-old',
        childSessionId: 'task-old',
        permissionFingerprint: 'sha256:old-main-snapshot',
        permissionMode: 'read-only',
        startedAt: '2026-09-01T00:00:00.000Z',
      })
      bindGoalFirstLongGoalTask({
        stateRoot,
        longGoalId: source.id,
        expectedRevision: 3,
        taskId,
        execution: { sessionId: 'task-old', goalId: 'goal-old' },
      })

      const mainEvents = [] as unknown as SessionEvent[]
      const oldTaskEvents = [{
        type: 'tool/call', seq: 1, time: 1, data: {
          turn: 1, step: 1, callId: CallId('denied-call'), name: 'pwsh', arguments: '{"cmd":"write"}',
        },
      }, {
        type: 'tool/result', seq: 2, time: 2, surfaceOp: 'append', sourceEventSeqs: [1], data: {
          turn: 1,
          step: 1,
          message: createToolResultMessage({
            callId: CallId('denied-call'),
            content: [{ type: 'text', text: 'sandbox runner could not start' }],
            isError: true,
          }),
          error: { name: 'ToolError', code: 'SANDBOX_UNAVAILABLE' },
        },
      }] as unknown as SessionEvent[]
      const oldTaskLog = structuredClone(oldTaskEvents)
      const sessions = new Map<string, {
        id: string
        header?: { parentSession?: string }
        meta?: { id: string, parentSession?: string, seedLength?: number }
        events: SessionEvent[]
      }>([
        ['main-control', { id: 'main-control', events: mainEvents }],
        ['planner-old', { id: 'planner-old', events: [{
          type: 'sandbox/mode', seq: 0, time: 0,
          data: { mode: 'workspace-write', source: 'delegation' },
        }] as unknown as SessionEvent[] }],
        ['task-old', {
          id: 'task-old', header: { parentSession: 'planner-old' },
          meta: { id: 'task-old', parentSession: 'planner-old', seedLength: 0 }, events: oldTaskEvents,
        }],
      ])
      const main = {
        session: sessions.get('main-control'),
        followup: vi.fn(),
      } as unknown as Agent
      const live = new Map<string, Agent>([['main-control', main]])
      const reservedIds = ['planner-new', 'task-new']
      const startNativeChild = vi.fn(async (input: { readonly parent: Agent, readonly childId: string }) => {
        const parentMode = (input.parent.session.events.findLast(event => event.type === 'sandbox/mode')?.data as { mode: string }).mode
        const childSession = {
          id: input.childId,
          meta: { id: input.childId, parentSession: String(input.parent.session.id), seedLength: 0 },
          header: {
            cwd: fixture, agentPreset: 'planner-preset', parentSession: String(input.parent.session.id),
          },
          events: [{
            type: 'sandbox/mode', seq: 0, time: 0,
            data: { mode: parentMode, source: 'delegation' },
          }] as unknown as SessionEvent[],
        }
        sessions.set(input.childId, childSession)
        const created = {
          session: childSession,
          ctx: { goals: { get: () => undefined } },
        } as unknown as Agent
        live.set(input.childId, created)
        return { childId: input.childId }
      })
      const roots = {
        stateRoot,
        sessionsRoot: resolve(fixture, 'sessions'),
        evolutionRoot: resolve(stateRoot, 'evolution'),
      }
      let sourceFlushAllowed = false
      const quiesceNativeAttempt = vi.fn(async () => {
        if (!sourceFlushAllowed) throw new Error('source Session persistence is unavailable')
        const before = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
        expect(readTianwenTaskAttemptProjection(before, taskId).attempts[0]?.status).toBe('running')
      })
      const runDependencies = {
        readLongGoal,
        readLongGoalStatus: vi.fn(async () => {
          const current = readLongGoal(stateRoot, source.id)
          if (current.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
          return status(current, [current.tasks[0]!.execution === null ? 'pending' : 'active'], taskId)
        }),
        bindLongGoalTask: vi.fn(),
        bindGoalFirstLongGoalTask,
        listSessions: vi.fn(async () => [...sessions.values()].map(session => ({ sessionId: session.id }))),
        createSession: vi.fn(),
        reserveTaskSessionId: () => { throw new Error('reserved attempt must reuse its child id') },
        startNativeTaskChild: startNativeChild,
        followupNativeTaskChild: vi.fn(),
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        attachedAgent: (sessionId: string) => live.get(sessionId),
        createGoal: vi.fn((_agent: Agent) => ({ id: 'goal-new' })),
        readGoalRef: vi.fn(),
        resumeColdGoal: vi.fn(),
        flushSession: vi.fn(),
      }
      const permissionHost = createPermissionAttemptHost({
        roots,
        readLongGoal,
        projectEvidence: (sessionId, events) => projectEvidence(SessionId(sessionId), events),
        inspectSession: async sessionId => {
          if (sessionId === 'planner-new' && !sessions.has(sessionId) && mainEvents.length === 3) {
            mainEvents.push({
              type: 'sandbox/mode', seq: 4, time: 4, data: { mode: 'danger-full-access' },
            } as unknown as SessionEvent)
          }
          return sessions.get(sessionId)
        },
        flushSession: async () => sourceFlushAllowed,
        quiesceNativeAttempt,
        attachedAgent: sessionId => live.get(sessionId),
        reserveSessionId: () => reservedIds.shift()!,
        startNativeChild,
        followupNativeChild: vi.fn(),
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        runCurrentTask: input => runCurrentWebTask(input, runDependencies as never),
        notifyMain: (agent, message) => { agent.followup(message) },
        now: () => '2026-09-01T00:01:00.000Z',
      })

      await expect(permissionHost.handlePermissionEvent({
        longGoalId: source.id,
        session: sessions.get('task-old') as unknown as Session,
        event: oldTaskEvents[1],
      })).rejects.toThrow('source Session persistence is unavailable')
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        taskId,
      ).attempts[0]?.status).toBe('running')
      expect(quiesceNativeAttempt).toHaveBeenCalledOnce()

      sourceFlushAllowed = true
      await permissionHost.reconcilePermissionAttempt({ longGoalId: source.id })
      const limited = readLongGoal(stateRoot, source.id)
      if (limited.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
      expect(limited.tasks[0]).toMatchObject({ execution: null, resolution: null })
      expect(readTianwenTaskAttemptProjection(limited, taskId).attempts[0]).toMatchObject({
        status: 'permission-limited',
      })
      expect(quiesceNativeAttempt).toHaveBeenCalledTimes(2)
      expect(main.followup).toHaveBeenCalledWith(expect.objectContaining({
        content: [expect.objectContaining({ text: expect.stringContaining('Full access') })],
      }))

      mainEvents.push({
        type: 'sandbox/mode', seq: 1, time: 1, data: { mode: 'read-only' },
      } as unknown as SessionEvent)
      await permissionHost.handlePermissionEvent({
        longGoalId: source.id,
        session: sessions.get('main-control') as unknown as Session,
        event: mainEvents[0],
      })
      mainEvents.push({
        type: 'sandbox/mode', seq: 2, time: 2, data: { mode: 'read-only' },
      } as unknown as SessionEvent)
      await permissionHost.handlePermissionEvent({
        longGoalId: source.id,
        session: sessions.get('main-control') as unknown as Session,
        event: mainEvents[1],
      })
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        taskId,
      ).attempts).toHaveLength(1)
      expect(reservedIds).toEqual(['planner-new', 'task-new'])

      mainEvents.push({
        type: 'sandbox/mode', seq: 3, time: 3, data: { mode: 'workspace-write' },
      } as unknown as SessionEvent)
      const widerEvent = mainEvents[2]!
      sourceFlushAllowed = false
      await permissionHost.handlePermissionEvent({
        longGoalId: source.id,
        session: sessions.get('main-control') as unknown as Session,
        event: widerEvent,
      })
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        taskId,
      ).attempts).toHaveLength(1)
      sourceFlushAllowed = true
      await permissionHost.reconcilePermissionAttempt({ longGoalId: source.id })

      const renewed = readLongGoal(stateRoot, source.id)
      if (renewed.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 record')
      expect(renewed.planner.sessionId).toBe('planner-new')
      expect(renewed.tasks[0]).toMatchObject({
        execution: { sessionId: 'task-new', goalId: 'goal-new' },
        resolution: null,
      })
      expect(readTianwenTaskAttemptProjection(renewed, taskId).attempts).toMatchObject([
        { epoch: 1, parentSessionId: 'planner-old', childSessionId: 'task-old', status: 'permission-limited' },
        {
          epoch: 2, parentSessionId: 'planner-new', childSessionId: 'task-new', status: 'running',
          permissionMode: 'danger-full-access',
          permissionFingerprint: permissionSnapshot(mainEvents, 'danger-full-access').fingerprint,
        },
      ])
      expect(renewed.tianwenEvents?.filter(event => event.type === 'attempt-permission-reservation-rebased')).toHaveLength(1)
      expect(sessions.get('task-old')!.events).toEqual(oldTaskLog)
      expect(sessions.get('planner-new')!.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'sandbox/mode', data: { mode: 'danger-full-access', source: 'delegation' } }),
      ]))
      expect(sessions.get('task-new')!.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'sandbox/mode', data: { mode: 'danger-full-access', source: 'delegation' } }),
      ]))
      expect(renewed.tianwenEvents?.some(event => event.type === 'attempt-settled')).toBe(false)

      await permissionHost.handlePermissionEvent({
        longGoalId: source.id,
        session: sessions.get('main-control') as unknown as Session,
        event: widerEvent,
      })
      await permissionHost.reconcilePermissionAttempt({ longGoalId: source.id })
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        taskId,
      ).attempts).toHaveLength(2)
      expect(startNativeChild).toHaveBeenCalledTimes(2)
      expect(reservedIds).toEqual([])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it.each([
    { direction: 'live', delegatedMode: undefined },
    { direction: 'restart', delegatedMode: undefined },
    { direction: 'live', delegatedMode: 'read-only' },
    { direction: 'restart', delegatedMode: 'read-only' },
    { direction: 'live', delegatedMode: 'workspace-write' },
    { direction: 'live', delegatedMode: 'danger-full-access' },
  ] as const)(
    'limits a legacy running attempt from a structured denial on $direction consumption (delegated mode: $delegatedMode)',
    async ({ direction, delegatedMode }) => {
      const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
      mkdirSync(base, { recursive: true })
      const fixture = mkdtempSync(resolve(base, `legacy-unknown-${direction}-`))
      try {
        const stateRoot = resolve(fixture, 'state')
        const source = createContinuousLongGoal({
          stateRoot, objective: 'Stop a legacy unknown-mode denial', context: null, successCriteria: null,
          workspaceRoot: fixture, agentPreset: 'planner-preset', controlSessionId: 'main-control',
        }, { goalSuffix: () => `legacy-unknown-${direction}`, plannerSessionId: () => 'planner-old', now: () => 1 })
        const planned = commitLongGoalPlan({
          stateRoot, longGoalId: source.id, expectedRevision: 1, outcome: 'continue',
          tasks: [{ objective: 'Attempt a sandboxed action' }], consideredSettledTasks: 0,
        }, { taskId: () => '00000000-0000-4000-8000-000000000096', now: () => 2 }) as LongGoalRecordV3
        const taskId = planned.tasks[0]!.id
        appendTianwenAttemptStarted({
          stateRoot, longGoalId: source.id, expectedRevision: 2, taskId, epoch: 1,
          parentSessionId: 'planner-old', childSessionId: 'task-old',
          permissionFingerprint: 'sha256:legacy-unknown', permissionMode: 'read-only',
          startedAt: '2026-09-01T00:00:00.000Z',
        })
        bindGoalFirstLongGoalTask({
          stateRoot, longGoalId: source.id, expectedRevision: 3, taskId,
          execution: { sessionId: 'task-old', goalId: 'goal-old' },
        })
        const recordPath = resolve(stateRoot, 'long-goals', `${source.id}.json`)
        const legacy = JSON.parse(readFileSync(recordPath, 'utf8')) as {
          tianwenEvents: { type: string, attempt?: { permissionMode?: string } }[]
        }
        delete legacy.tianwenEvents.find(event => event.type === 'attempt-started')?.attempt?.permissionMode
        writeFileSync(recordPath, `${JSON.stringify(legacy)}\n`, 'utf8')

        const taskEvents = [...(delegatedMode === undefined ? [] : [{
          type: 'sandbox/mode', seq: 0, time: 0,
          data: { mode: delegatedMode, source: 'delegation' },
        }]), {
          type: 'tool/call', seq: 1, time: 1, data: {
            turn: 1, step: 1, callId: CallId('legacy-denial'), name: 'pwsh', arguments: '{"cmd":"write"}',
          },
        }, {
          type: 'tool/result', seq: 2, time: 2, surfaceOp: 'append', sourceEventSeqs: [1], data: {
            turn: 1, step: 1,
            message: createToolResultMessage({
              callId: CallId('legacy-denial'), content: [{ type: 'text', text: 'sandbox unavailable' }], isError: true,
            }),
            error: { name: 'ToolError', code: 'SANDBOX_UNAVAILABLE' },
          },
        }] as unknown as SessionEvent[]
        const taskSession = {
          id: 'task-old', header: { parentSession: 'planner-old' },
          meta: { id: 'task-old', parentSession: 'planner-old', seedLength: 0 }, events: taskEvents,
        }
        const mainSession = {
          id: 'main-control', header: {}, meta: { id: 'main-control', seedLength: 0 },
          events: [{
            type: 'sandbox/mode', seq: 0, time: 0, data: { mode: delegatedMode ?? 'read-only' },
          }] as unknown as SessionEvent[],
        }
        const main = { session: mainSession, followup: vi.fn() } as unknown as Agent
        const quiesceNativeAttempt = vi.fn(async () => undefined)
        const reserveSessionId = vi.fn(() => { throw new Error('non-renewable old mode must not renew') })
        const notifyMain = vi.fn()
        const dependencies = {
          roots: { stateRoot, sessionsRoot: resolve(fixture, 'sessions'), evolutionRoot: resolve(stateRoot, 'evolution') },
          readLongGoal,
          projectEvidence: (sessionId: string, events: readonly SessionEvent[]) => projectEvidence(SessionId(sessionId), events),
          inspectSession: async (sessionId: string) => sessionId === 'task-old' ? taskSession : sessionId === 'main-control' ? mainSession : undefined,
          flushSession: async () => true,
          quiesceNativeAttempt,
          attachedAgent: (sessionId: string) => sessionId === 'main-control' ? main : undefined,
          reserveSessionId,
          startNativeChild: vi.fn(), followupNativeChild: vi.fn(),
          nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
          runCurrentTask: vi.fn(), notifyMain,
        }
        const firstHost = createPermissionAttemptHost(dependencies)

        if (direction === 'live') {
          await firstHost.handlePermissionEvent({
            longGoalId: source.id, session: taskSession as unknown as Session,
            event: taskEvents.find(event => event.type === 'tool/result'),
          })
        } else {
          await firstHost.reconcilePermissionAttempt({ longGoalId: source.id })
        }

        const limited = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
        expect(limited.tasks[0]).toMatchObject({ execution: null, resolution: null })
        const limitedAttempt = readTianwenTaskAttemptProjection(limited, taskId).attempts.at(-1)
        expect(limitedAttempt?.status).toBe('permission-limited')
        expect(limitedAttempt?.permissionMode).toBe(delegatedMode)
        expect(limited.tianwenEvents?.filter(event => event.type === 'attempt-permission-limited')).toHaveLength(1)
        expect(limited.tianwenEvents?.filter(event => event.type === 'attempt-permission-mode-observed'))
          .toHaveLength(delegatedMode === undefined ? 0 : 1)
        if (delegatedMode !== undefined) {
          expect(limited.tianwenEvents?.findIndex(event => event.type === 'attempt-permission-mode-observed'))
            .toBeLessThan(limited.tianwenEvents?.findIndex(event => event.type === 'attempt-permission-limited') ?? -1)
        }
        expect(limited.tianwenEvents?.some(event => event.type === 'attempt-settled')).toBe(false)
        expect(quiesceNativeAttempt).toHaveBeenCalledOnce()
        expect(reserveSessionId).not.toHaveBeenCalled()
        const noticeText = (notifyMain.mock.calls[0]?.[1].content[0] as { text?: string } | undefined)?.text
        if (delegatedMode === 'read-only' || delegatedMode === 'workspace-write') {
          expect(noticeText).toBe(
            'This Task reached the current sandbox limit. Change this main Session to Full access; Tianwen will start a new attempt without modifying the old child.',
          )
        } else if (delegatedMode === 'danger-full-access') {
          expect(noticeText).toContain('no wider permission mode')
          expect(noticeText).toContain('will not automatically create a new attempt')
          expect(noticeText).toContain('remains permission-limited')
          expect(noticeText).not.toContain('will start a new attempt')
        } else {
          expect(noticeText).toContain('cannot verify the old permission mode')
          expect(noticeText).toContain('will not automatically create a new attempt')
          expect(noticeText).toContain('remains permission-limited')
          expect(noticeText).not.toContain('will start a new attempt')
        }

        const restartedHost = createPermissionAttemptHost(dependencies)
        await restartedHost.reconcilePermissionAttempt({ longGoalId: source.id })
        expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.filter(
          event => event.type === 'attempt-permission-limited',
        )).toHaveLength(1)
        expect(quiesceNativeAttempt).toHaveBeenCalledOnce()
        expect(reserveSessionId).not.toHaveBeenCalled()
        if (delegatedMode === undefined || delegatedMode === 'danger-full-access') {
          mainSession.events.push({
            type: 'sandbox/mode', seq: 3, time: 3, data: { mode: 'danger-full-access' },
          } as unknown as SessionEvent)
          await restartedHost.handlePermissionEvent({
            longGoalId: source.id, session: mainSession as unknown as Session,
            event: mainSession.events.at(-1),
          })
          expect(readTianwenTaskAttemptProjection(
            readLongGoal(stateRoot, source.id) as LongGoalRecordV3, taskId,
          ).attempts).toHaveLength(1)
          expect(reserveSessionId).not.toHaveBeenCalled()
        }
      } finally {
        rmSync(fixture, { recursive: true, force: true })
      }
    },
  )

  it('refuses a live renewed Planner with the exact id and mode but the wrong main parent lineage', async () => {
    const taskId = TASK_1
    const source = record({
      planner: { ...record().planner, sessionId: 'planner-renewed' },
      tasks: [{ id: taskId, objective: 'Do not run under wrong lineage', execution: null, resolution: null }],
      tianwenEvents: [{
        type: 'attempt-started', taskId, attempt: {
          epoch: 1, parentSessionId: 'planner-old', childSessionId: 'task-old',
          permissionFingerprint: 'sha256:read-only', permissionMode: 'read-only', status: 'running',
          startedAt: '2026-09-01T00:00:00.000Z',
        },
      }, {
        type: 'attempt-permission-limited', taskId, epoch: 1, terminalEventId: 'limited-old',
      }, {
        type: 'attempt-started', taskId, attempt: {
          epoch: 2, parentSessionId: 'planner-renewed', childSessionId: 'task-renewed',
          permissionFingerprint: 'sha256:workspace-write', permissionMode: 'workspace-write', status: 'running',
          startedAt: '2026-09-01T00:01:00.000Z',
        },
      }],
    })
    const main = {
      session: {
        id: source.control.sessionId,
        header: { cwd: source.workspaceRoot, agentPreset: source.planner.agentPreset },
        events: [{ type: 'sandbox/mode', seq: 1, time: 1, data: { mode: 'workspace-write' } }],
      },
    } as unknown as Agent
    const planner = {
      session: {
        id: source.planner.sessionId,
        header: {
          cwd: source.workspaceRoot, agentPreset: source.planner.agentPreset,
          parentSession: 'different-main-control',
        },
        events: [{
          type: 'sandbox/mode', seq: 0, time: 0,
          data: { mode: 'workspace-write', source: 'delegation' },
        }],
      },
    } as unknown as Agent
    const runCurrentTask = vi.fn()
    const host = createPermissionAttemptHost({
      roots: { stateRoot: 'unused', sessionsRoot: 'unused', evolutionRoot: 'unused' },
      readLongGoal: (() => source) as typeof readLongGoal,
      projectEvidence: () => [], inspectSession: vi.fn(), flushSession: vi.fn(),
      quiesceNativeAttempt: vi.fn(),
      attachedAgent: sessionId => sessionId === source.control.sessionId ? main : sessionId === source.planner.sessionId ? planner : undefined,
      reserveSessionId: vi.fn(), startNativeChild: vi.fn(), followupNativeChild: vi.fn(),
      nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
      runCurrentTask, notifyMain: vi.fn(),
    })

    await host.reconcilePermissionAttempt({ longGoalId: source.id })

    expect(runCurrentTask).not.toHaveBeenCalled()
  })

  it('rejects an exact Task id with the wrong live Planner parent before quiescence or limitation', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'wrong-permission-lineage-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot, objective: 'Reject the wrong persisted Task lineage', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset', controlSessionId: 'main-control',
      }, { goalSuffix: () => 'wrong-permission-lineage', plannerSessionId: () => 'planner-exact', now: () => 1 })
      const planned = commitLongGoalPlan({
        stateRoot, longGoalId: source.id, expectedRevision: 1, outcome: 'continue',
        tasks: [{ objective: 'Do not touch wrong child' }], consideredSettledTasks: 0,
      }, { taskId: () => '00000000-0000-4000-8000-000000000097', now: () => 2 }) as LongGoalRecordV3
      const taskId = planned.tasks[0]!.id
      appendTianwenAttemptStarted({
        stateRoot, longGoalId: source.id, expectedRevision: 2, taskId, epoch: 1,
        parentSessionId: 'planner-exact', childSessionId: 'task-exact',
        permissionFingerprint: 'sha256:known', permissionMode: 'workspace-write',
        startedAt: '2026-09-01T00:00:00.000Z',
      })
      bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: source.id, expectedRevision: 3, taskId,
        execution: { sessionId: 'task-exact', goalId: 'goal-exact' },
      })
      const taskEvents = [{
        type: 'tool/call', seq: 1, time: 1, data: {
          turn: 1, step: 1, callId: CallId('wrong-parent-denial'), name: 'pwsh', arguments: '{"cmd":"write"}',
        },
      }, {
        type: 'tool/result', seq: 2, time: 2, surfaceOp: 'append', sourceEventSeqs: [1], data: {
          turn: 1, step: 1,
          message: createToolResultMessage({
            callId: CallId('wrong-parent-denial'), content: [{ type: 'text', text: 'sandbox unavailable' }], isError: true,
          }),
          error: { name: 'ToolError', code: 'SANDBOX_UNAVAILABLE' },
        },
      }] as unknown as SessionEvent[]
      const wrongTask = {
        session: { id: 'task-exact', header: { parentSession: 'different-planner' }, events: taskEvents },
      } as unknown as Agent
      const persistedWrongTask = {
        meta: { id: 'task-exact', parentSession: 'different-planner', seedLength: 0 }, events: taskEvents,
      }
      const quiesceNativeAttempt = vi.fn()
      const reserveSessionId = vi.fn()
      const common = {
        roots: { stateRoot, sessionsRoot: resolve(fixture, 'sessions'), evolutionRoot: resolve(stateRoot, 'evolution') },
        readLongGoal,
        projectEvidence: (sessionId: string, events: readonly SessionEvent[]) => projectEvidence(SessionId(sessionId), events),
        flushSession: vi.fn(), quiesceNativeAttempt, reserveSessionId,
        startNativeChild: vi.fn(), followupNativeChild: vi.fn(),
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        runCurrentTask: vi.fn(), notifyMain: vi.fn(),
      }
      const liveHost = createPermissionAttemptHost({
        ...common,
        inspectSession: async () => undefined,
        attachedAgent: sessionId => sessionId === 'task-exact' ? wrongTask : undefined,
      })

      await expect(liveHost.handlePermissionEvent({
        longGoalId: source.id, session: wrongTask.session, event: taskEvents[1],
      })).rejects.toThrow('Task lineage')
      expect(quiesceNativeAttempt).not.toHaveBeenCalled()

      const restartedHost = createPermissionAttemptHost({
        ...common,
        inspectSession: async sessionId => sessionId === 'task-exact' ? persistedWrongTask : undefined,
        attachedAgent: () => undefined,
      })
      await expect(restartedHost.reconcilePermissionAttempt({ longGoalId: source.id }))
        .rejects.toThrow('Task lineage')

      const unchanged = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
      expect(unchanged.tasks[0]).toMatchObject({
        execution: { sessionId: 'task-exact', goalId: 'goal-exact' }, resolution: null,
      })
      expect(readTianwenTaskAttemptProjection(unchanged, taskId).attempts).toEqual([
        expect.objectContaining({ status: 'running', childSessionId: 'task-exact' }),
      ])
      expect(unchanged.tianwenEvents?.some(event => event.type === 'attempt-permission-limited')).toBe(false)
      expect(quiesceNativeAttempt).not.toHaveBeenCalled()
      expect(reserveSessionId).not.toHaveBeenCalled()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('restarts with a new permission host and reuses the later Task exact reserved Planner and child ids', async () => {
    const base = resolve('D:/DevData/tianwen-continuous-goal-host-tests')
    mkdirSync(base, { recursive: true })
    const fixture = mkdtempSync(resolve(base, 'permission-restart-'))
    try {
      const stateRoot = resolve(fixture, 'state')
      const source = createContinuousLongGoal({
        stateRoot, objective: 'Recover reserved permission work', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset', controlSessionId: 'main-control',
      }, { goalSuffix: () => 'permission-restart', plannerSessionId: () => 'planner-old', now: () => 1 })
      const taskIds = [
        '00000000-0000-4000-8000-000000000094',
        '00000000-0000-4000-8000-000000000095',
      ]
      const planned = commitLongGoalPlan({
        stateRoot, longGoalId: source.id, expectedRevision: 1, outcome: 'continue',
        tasks: [{ objective: 'Already completed' }, { objective: 'Recover exact reservation' }],
        consideredSettledTasks: 0,
      }, { taskId: () => taskIds.shift()!, now: () => 2 }) as LongGoalRecordV3
      const firstTaskId = planned.tasks[0]!.id
      const secondTaskId = planned.tasks[1]!.id
      appendTianwenAttemptStarted({
        stateRoot, longGoalId: source.id, expectedRevision: 2, taskId: firstTaskId,
        epoch: 1, parentSessionId: 'planner-old', childSessionId: 'task-first',
        permissionFingerprint: 'sha256:first', permissionMode: 'workspace-write', startedAt: '2026-09-01T00:00:00.000Z',
      })
      bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: source.id, expectedRevision: 3, taskId: firstTaskId,
        execution: { sessionId: 'task-first', goalId: 'goal-first' },
      })
      appendTianwenAttemptSettled({
        stateRoot, longGoalId: source.id, expectedRevision: 4, taskId: firstTaskId,
        epoch: 1, terminalEventId: 'settled-first',
      })
      appendTianwenAttemptStarted({
        stateRoot, longGoalId: source.id, expectedRevision: 5, taskId: secondTaskId,
        epoch: 1, parentSessionId: 'planner-old', childSessionId: 'task-old',
        permissionFingerprint: 'sha256:workspace-write', permissionMode: 'workspace-write', startedAt: '2026-09-01T00:01:00.000Z',
      })
      bindGoalFirstLongGoalTask({
        stateRoot, longGoalId: source.id, expectedRevision: 6, taskId: secondTaskId,
        execution: { sessionId: 'task-old', goalId: 'goal-old' },
      })
      markTianwenAttemptPermissionLimited({
        stateRoot, longGoalId: source.id, expectedRevision: 7, taskId: secondTaskId, epoch: 1,
        childSessionId: 'task-old', terminalEventId: 'limited-old',
      })
      const recordPath = resolve(stateRoot, 'long-goals', `${source.id}.json`)
      const legacy = JSON.parse(readFileSync(recordPath, 'utf8')) as {
        tianwenEvents: { type: string, taskId: string, attempt?: { permissionMode?: string } }[]
      }
      const legacyStarted = legacy.tianwenEvents.find(event =>
        event.type === 'attempt-started' && event.taskId === secondTaskId)
      delete legacyStarted?.attempt?.permissionMode
      const legacyBytes = `${JSON.stringify(legacy)}\n`
      writeFileSync(recordPath, legacyBytes, 'utf8')
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        secondTaskId,
      ).attempts.at(-1)?.permissionMode).toBeUndefined()
      expect(readFileSync(recordPath, 'utf8')).toBe(legacyBytes)

      const mainSession = {
        id: 'main-control', header: { cwd: fixture, agentPreset: 'planner-preset' },
        events: [{ type: 'sandbox/mode', seq: 0, time: 0, data: { mode: 'danger-full-access' } }] as unknown as SessionEvent[],
      }
      const main = { session: mainSession, followup: vi.fn() } as unknown as Agent
      const sessions = new Map<string, {
        id: string
        header: { cwd: string, agentPreset: string, parentSession?: string }
        meta?: { id: string, parentSession?: string, seedLength?: number }
        events: SessionEvent[]
      }>([
        ['main-control', mainSession],
      ])
      const oldTaskSession = {
        id: 'task-old', header: { cwd: fixture, agentPreset: 'planner-preset', parentSession: 'planner-old' },
        meta: { id: 'task-old', parentSession: 'planner-old', seedLength: 4 },
        events: [{
          type: 'sandbox/mode', seq: 4, time: 4,
          data: { mode: 'workspace-write', source: 'delegation' },
        }] as unknown as SessionEvent[],
      }
      const live = new Map<string, Agent>([['main-control', main]])
      let shrinkBeforePlannerCapture = true
      const reservedIds = ['planner-reserved', 'task-reserved']
      const startNativeChild = vi.fn(async (input: { readonly parent: Agent, readonly childId: string }) => {
        const childSession = {
          id: input.childId,
          header: { cwd: fixture, agentPreset: 'planner-preset', parentSession: String(input.parent.session.id) },
          events: [{
            type: 'sandbox/mode', seq: 0, time: 0,
            data: { mode: 'danger-full-access', source: 'delegation' },
          }] as unknown as SessionEvent[],
        }
        sessions.set(input.childId, childSession)
        live.set(input.childId, { session: childSession, ctx: { goals: { get: () => undefined } } } as unknown as Agent)
        return { childId: input.childId }
      })
      const roots = { stateRoot, sessionsRoot: resolve(fixture, 'sessions'), evolutionRoot: resolve(stateRoot, 'evolution') }
      const baseDependencies = {
        roots,
        readLongGoal,
        projectEvidence: () => [],
        inspectSession: async (sessionId: string) => {
          if (sessionId === 'planner-reserved' && !sessions.has(sessionId) && shrinkBeforePlannerCapture) {
            mainSession.events.push({
              type: 'sandbox/mode', seq: 1, time: 1, data: { mode: 'workspace-write' },
            } as unknown as SessionEvent)
          }
          return sessions.get(sessionId)
        },
        flushSession: async () => true,
        quiesceNativeAttempt: async () => undefined,
        attachedAgent: (sessionId: string) => live.get(sessionId),
        reserveSessionId: () => {
          const reserved = reservedIds.shift()
          if (reserved === undefined) throw new Error('restart must not reserve another id')
          return reserved
        },
        startNativeChild,
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        notifyMain: vi.fn(),
      }
      const firstHost = createPermissionAttemptHost({
        ...baseDependencies,
        followupNativeChild: vi.fn(),
        runCurrentTask: vi.fn(async () => { throw new Error('must not run while permission shrank') }),
      })

      await firstHost.reconcilePermissionAttempt({ longGoalId: source.id })
      expect(reservedIds).toEqual(['planner-reserved', 'task-reserved'])
      expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.some(
        event => event.type === 'attempt-permission-mode-observed',
      )).toBe(false)

      sessions.set('task-old', {
        ...oldTaskSession,
        meta: { ...oldTaskSession.meta, id: 'different-task' },
      })
      await expect(firstHost.reconcilePermissionAttempt({ longGoalId: source.id }))
        .rejects.toThrow('Task lineage')
      expect(reservedIds).toEqual(['planner-reserved', 'task-reserved'])
      expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.some(
        event => event.type === 'attempt-permission-mode-observed',
      )).toBe(false)

      sessions.set('task-old', {
        ...oldTaskSession,
        meta: { ...oldTaskSession.meta, parentSession: 'wrong-planner' },
      })
      await expect(firstHost.reconcilePermissionAttempt({ longGoalId: source.id }))
        .rejects.toThrow('Task lineage')
      expect(reservedIds).toEqual(['planner-reserved', 'task-reserved'])
      expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.some(
        event => event.type === 'attempt-permission-mode-observed',
      )).toBe(false)

      sessions.set('task-old', {
        ...oldTaskSession,
        meta: { ...oldTaskSession.meta, seedLength: 5 },
      })
      await firstHost.reconcilePermissionAttempt({ longGoalId: source.id })
      expect(reservedIds).toEqual(['planner-reserved', 'task-reserved'])
      expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.some(
        event => event.type === 'attempt-permission-mode-observed',
      )).toBe(false)

      sessions.set('task-old', oldTaskSession)
      await firstHost.reconcilePermissionAttempt({ longGoalId: source.id })
      expect(startNativeChild).not.toHaveBeenCalled()
      const waiting = readTianwenTaskAttemptProjection(
        readLongGoal(stateRoot, source.id) as LongGoalRecordV3,
        secondTaskId,
      ).attempts.at(-1)
      expect(waiting).toMatchObject({
        status: 'running', parentSessionId: 'planner-reserved', childSessionId: 'task-reserved',
      })
      expect((readLongGoal(stateRoot, source.id) as LongGoalRecordV3).tianwenEvents?.filter(
        event => event.type === 'attempt-permission-mode-observed',
      )).toHaveLength(1)

      shrinkBeforePlannerCapture = false
      mainSession.events.push({
        type: 'sandbox/mode', seq: 2, time: 2, data: { mode: 'danger-full-access' },
      } as unknown as SessionEvent)

      const followupNativeChild = vi.fn(async (_parent: Agent, childId: string) => {
        const childSession = sessions.get(childId)!
        live.set(childId, { session: childSession, ctx: { goals: { get: () => undefined } } } as unknown as Agent)
      })
      const runDependencies = {
        readLongGoal,
        readLongGoalStatus: vi.fn(async () => {
          const current = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
          return status(current, ['complete', current.tasks[1]!.execution === null ? 'pending' : 'active'], secondTaskId)
        }),
        bindLongGoalTask: vi.fn(), bindGoalFirstLongGoalTask,
        listSessions: vi.fn(async () => [...sessions.values()].map(session => ({ sessionId: session.id }))),
        createSession: vi.fn(), reserveTaskSessionId: () => { throw new Error('must reuse task-reserved') },
        startNativeTaskChild: startNativeChild, followupNativeTaskChild: vi.fn(),
        nativeAgentOptions: { provider: 'provider', model: 'model' } as AgentOptions,
        attachedAgent: (sessionId: string) => live.get(sessionId),
        createGoal: vi.fn(() => ({ id: 'goal-reserved' })), readGoalRef: vi.fn(), resumeColdGoal: vi.fn(), flushSession: vi.fn(),
      }
      const restartedHost = createPermissionAttemptHost({
        ...baseDependencies,
        followupNativeChild,
        runCurrentTask: input => runCurrentWebTask(input, runDependencies as never),
      })

      await restartedHost.reconcilePermissionAttempt({ longGoalId: source.id })

      const recovered = readLongGoal(stateRoot, source.id) as LongGoalRecordV3
      expect(recovered.planner.sessionId).toBe('planner-reserved')
      expect(recovered.tasks[1]!.execution).toEqual({ sessionId: 'task-reserved', goalId: 'goal-reserved' })
      expect(readTianwenTaskAttemptProjection(recovered, firstTaskId).attempts).toHaveLength(1)
      expect(readTianwenTaskAttemptProjection(recovered, secondTaskId).attempts).toHaveLength(2)
      expect(followupNativeChild).not.toHaveBeenCalled()
      expect(startNativeChild.mock.calls.map(call => call[0].childId)).toEqual(['planner-reserved', 'task-reserved'])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('cold-continues a v3 Task through native followup with the exact live Planner parent', async () => {
    const execution = { sessionId: 'cold-task', goalId: 'cold-goal' }
    const source = record({
      planner: { ...record().planner, sessionId: 'live-planner' },
      tasks: [{ id: TASK_1, objective: 'Continue native Task', execution, resolution: null }],
    })
    const projected = status(source, ['active'], TASK_1)
    const planner = { session: { id: 'live-planner' } } as unknown as Agent
    const task = agent('cold-task', 'cold-goal')
    let resumed = false
    const followupNativeTaskChild = vi.fn(async (parent: Agent, childId: string) => {
      expect(parent).toBe(planner)
      expect(childId).toBe('cold-task')
      resumed = true
      return 'followup-message'
    })
    const resumeColdGoal = vi.fn(async () => { throw new Error('agents.resume path is forbidden for v3 Task') })
    const dependencies = {
      readLongGoal: vi.fn(() => source),
      readLongGoalStatus: vi.fn(async () => projected),
      bindLongGoalTask: vi.fn(),
      bindGoalFirstLongGoalTask: vi.fn(),
      listSessions: vi.fn(async () => [{
        sessionId: 'cold-task', cwd: source.workspaceRoot, agentPreset: source.planner.agentPreset,
      }]),
      createSession: vi.fn(),
      attachedAgent: (sessionId: string) => sessionId === 'live-planner' ? planner : resumed ? task : undefined,
      createGoal: vi.fn(),
      readGoalRef: vi.fn(async () => ({ id: 'cold-goal', revision: 1, phase: 'active' as const })),
      resumeColdGoal,
      followupNativeTaskChild,
      flushSession: vi.fn(async () => undefined),
    }

    await expect(runCurrentWebTask({
      roots: { stateRoot: 'D:/state', sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/evolution' },
      longGoalId: source.id,
      expectedRevision: source.revision,
    }, dependencies as never)).resolves.toEqual({
      status: projected,
      sessionId: 'cold-task',
      action: 'continued',
    })

    expect(followupNativeTaskChild).toHaveBeenCalledOnce()
    expect(resumeColdGoal).not.toHaveBeenCalled()
  })

  it('keeps a disarmed v3 Task retryable until its exact Planner parent is live', async () => {
    const execution = { sessionId: 'disarmed-task', goalId: 'disarmed-goal' }
    const source = record({
      planner: { ...record().planner, sessionId: 'live-planner' },
      tasks: [{ id: TASK_1, objective: 'Continue disarmed Task', execution, resolution: null }],
    })
    const projected = status(source, ['paused'], TASK_1)
    const task = disarmedTaskAgent(execution.sessionId, execution.goalId)
    const planner = { session: { id: 'live-planner' } } as unknown as Agent
    let plannerLive = false
    const followupNativeTaskChild = vi.fn(async () => 'followup-message')
    const dependencies = {
      readLongGoal: vi.fn(() => source),
      readLongGoalStatus: vi.fn(async () => projected),
      bindLongGoalTask: vi.fn(),
      bindGoalFirstLongGoalTask: vi.fn(),
      listSessions: vi.fn(async () => [{
        sessionId: execution.sessionId, cwd: source.workspaceRoot, agentPreset: source.planner.agentPreset,
      }]),
      createSession: vi.fn(),
      attachedAgent: (sessionId: string) => sessionId === execution.sessionId
        ? task.value
        : sessionId === source.planner.sessionId && plannerLive
          ? planner
          : undefined,
      createGoal: vi.fn(),
      readGoalRef: vi.fn(),
      resumeColdGoal: vi.fn(),
      followupNativeTaskChild,
      flushSession: vi.fn(async () => undefined),
    }
    const input = {
      roots: { stateRoot: 'D:/state', sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/evolution' },
      longGoalId: source.id,
      expectedRevision: source.revision,
    }

    await expect(runCurrentWebTask(input, dependencies as never)).rejects.toThrow(
      'Continuous Goal Planner parent Agent is not live',
    )
    expect(task.resume).not.toHaveBeenCalled()
    expect(followupNativeTaskChild).not.toHaveBeenCalled()
    expect(task.current().activation).toBe('disarmed')

    plannerLive = true
    await expect(runCurrentWebTask(input, dependencies as never)).resolves.toMatchObject({
      sessionId: execution.sessionId,
      action: 'continued',
    })
    expect(task.resume).toHaveBeenCalledOnce()
    expect(followupNativeTaskChild).toHaveBeenCalledOnce()
    expect(followupNativeTaskChild).toHaveBeenCalledWith(
      planner,
      execution.sessionId,
      expect.any(Array),
      expect.any(AbortSignal),
    )
  })

  it('restores a disarmed v3 Task when native followup rejects so a retry can continue it', async () => {
    const execution = { sessionId: 'rejected-followup-task', goalId: 'rejected-followup-goal' }
    const source = record({
      planner: { ...record().planner, sessionId: 'live-planner' },
      tasks: [{ id: TASK_1, objective: 'Retry rejected followup', execution, resolution: null }],
    })
    const projected = status(source, ['paused'], TASK_1)
    const task = disarmedTaskAgent(execution.sessionId, execution.goalId)
    const planner = { session: { id: 'live-planner' } } as unknown as Agent
    const followupNativeTaskChild = vi.fn()
      .mockRejectedValueOnce(new Error('native followup rejected'))
      .mockResolvedValueOnce('followup-message')
    const flushSession = vi.fn(async () => undefined)
    const dependencies = {
      readLongGoal: vi.fn(() => source),
      readLongGoalStatus: vi.fn(async () => projected),
      bindLongGoalTask: vi.fn(),
      bindGoalFirstLongGoalTask: vi.fn(),
      listSessions: vi.fn(async () => [{
        sessionId: execution.sessionId, cwd: source.workspaceRoot, agentPreset: source.planner.agentPreset,
      }]),
      createSession: vi.fn(),
      attachedAgent: (sessionId: string) => sessionId === execution.sessionId ? task.value : planner,
      createGoal: vi.fn(),
      readGoalRef: vi.fn(),
      resumeColdGoal: vi.fn(),
      followupNativeTaskChild,
      flushSession,
    }
    const input = {
      roots: { stateRoot: 'D:/state', sessionsRoot: 'D:/sessions', evolutionRoot: 'D:/evolution' },
      longGoalId: source.id,
      expectedRevision: source.revision,
    }

    await expect(runCurrentWebTask(input, dependencies as never)).rejects.toThrow('native followup rejected')
    expect(task.current().activation).toBe('disarmed')
    expect(task.disarm).toHaveBeenCalledOnce()

    await expect(runCurrentWebTask(input, dependencies as never)).resolves.toMatchObject({
      sessionId: execution.sessionId,
      action: 'continued',
    })
    expect(task.resume).toHaveBeenCalledTimes(2)
    expect(followupNativeTaskChild).toHaveBeenCalledTimes(2)
  })

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

  it('records one terminal attempt but leaves online completion delivery to native DSH settlement', async () => {
    const subject = harness()
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    const completed = status(record(), ['complete'], null)
    subject.setStatus(completed)
    subject.complete()
    subject.complete()
    await dispose()

    expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledOnce()
    expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      status: completed,
    }))
    expect(subject.dependencies.deliver.mock.calls.filter(([intent]) => intent.transition === 'complete')).toHaveLength(0)
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
    const planner = agent(created.planner.sessionId, 'planner-goal')
    subject.live.set(created.planner.sessionId, planner)
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
    await vi.waitFor(() => expect(subject.dependencies.reportProgress).toHaveBeenCalledWith(expect.objectContaining({
      planner,
      facts: [expect.objectContaining({ stage: 'active: Task 1 of 1' })],
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
    expect(subject.dependencies.reportProgress.mock.calls.some(([input]) =>
      input.planner === planner
      && input.facts.some(fact => fact.stage === 'active: Task 2 of 2'))).toBe(true)
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
  })

  it('flushes and rereads one exact block without continuing or online fallback delivery', async () => {
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
    expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledOnce()
    expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      status: blocked,
    }))
    expect(subject.dependencies.deliver.mock.calls.filter(([intent]) => intent.transition === 'block')).toHaveLength(0)
  })

  it('records distinct blocked Tasks even when their Goal revisions are equal without online fallback', async () => {
    const firstRecord = record()
    const subject = harness(firstRecord)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('blocked')
    subject.setStatus(status(firstRecord, ['blocked'], TASK_1, 'blocked'))
    subject.block()
    await vi.waitFor(() => expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledOnce())

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

    expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledTimes(2)
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
  })

  it('keeps online terminal handling free of detached fallback delivery', async () => {
    const subject = harness()
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.first.setGoal('complete')
    subject.setStatus(status(record(), ['complete'], null))
    subject.complete()
    await vi.waitFor(() => expect(subject.dependencies.recordTerminalAttempt).toHaveBeenCalledOnce())

    await expect(subject.control(controlAgent)).resolves.toEqual({ action: 'paused' })
    await dispose()
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
  })

  it('contains a rejected offline recovery delivery without mutating or reclassifying durable state', async () => {
    const terminal = record({ planner: { ...record().planner, phase: 'complete' } })
    const subject = harness(terminal)
    subject.setStatus(status(terminal, ['complete'], null))
    const failure = new Error('notice delivery failed')
    subject.dependencies.deliver = vi.fn(async () => { throw failure })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(subject.dependencies.deliver).toHaveBeenCalledOnce())
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

  it('rejects a duplicate create after the durable binding exists and installs controls once', async () => {
    const source = record({ control: { sessionId: 'another-control', autoProgress: 'running' } })
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    const started = subject.create(controlAgent, 'Ship the actual Goal')
    await expect(subject.create(controlAgent, 'Concurrent duplicate')).rejects.toThrow('already bound')
    await expect(started).resolves.toEqual({ action: 'started' })
    subject.created(controlAgent)
    subject.created(controlAgent)

    expect(subject.dependencies.installBoundControls).toHaveBeenCalledTimes(1)
    await dispose()
  })

  it('returns from /goal after the durable binding exists while planning continues', async () => {
    const source = record({ control: { sessionId: 'another-control', autoProgress: 'running' } })
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const created = record({
      id: `${GOAL_ID}-created`,
      control: { sessionId: 'control-session', autoProgress: 'running' },
    })
    let release!: () => void
    const planning = new Promise<void>(resolve => { release = resolve })
    subject.dependencies.createProgress = vi.fn(async () => {
      subject.setRecords([source, created])
      await planning
      return {
        schemaVersion: 'tianwen.continuous-goal-control-result.v1' as const,
        action: 'started' as const,
        status: status(created, ['active'], TASK_1),
        sessionId: EXECUTION_1.sessionId,
      }
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    let commandSettled = false
    const command = subject.create(controlAgent, 'Ship without holding the composer').then(result => {
      commandSettled = true
      return result
    })
    await Promise.resolve()
    const settledBeforePlanner = commandSettled
    release()

    await expect(command).resolves.toEqual({ action: 'started' })
    await dispose()
    expect(settledBeforePlanner).toBe(true)
  })

  it('leaves background initial-planning settlement to native DSH without fallback delivery', async () => {
    const source = record({ control: { sessionId: 'another-control', autoProgress: 'running' } })
    const subject = harness(source)
    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    const created = record({
      id: `${GOAL_ID}-created`,
      planner: { ...record().planner, phase: 'unplanned' },
      control: { sessionId: 'control-session', autoProgress: 'running' },
      tasks: [],
    })
    const planningStatus = status(created, [], null, 'planning')
    const failure = new Error('private provider failure details')
    let rejectPlanning!: () => void
    const planning = new Promise<void>((_resolve, reject) => {
      rejectPlanning = () => reject(failure)
    })
    subject.dependencies.createProgress = vi.fn(async () => {
      subject.setRecords([source, created])
      subject.setStatus(planningStatus)
      await planning
      throw new Error('unreachable')
    })
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)

    await expect(subject.create(controlAgent, 'Start and report any planning failure')).resolves.toEqual({ action: 'started' })
    rejectPlanning()

    await expect(dispose()).rejects.toThrow(AggregateError)
    expect(subject.dependencies.reportError).toHaveBeenCalledWith(failure)
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
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

    await expect(subject.create(controlAgent, 'Finish during initial planning')).resolves.toEqual({ action: 'started' })
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalled())
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
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

  it('leaves Task approval routing to native DSH without changing Goal control', async () => {
    const source = record({
      tasks: [
        { id: TASK_1, objective: 'Publish', execution: EXECUTION_1, resolution: null },
        { id: TASK_2, objective: 'Verify', execution: EXECUTION_2, resolution: null },
      ],
    })
    const subject = harness(source)
    subject.setStatus(status(source, ['active', 'pending'], TASK_1))
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.readStatus).toHaveBeenCalledOnce())

    subject.approval(EXECUTION_1.sessionId)
    subject.approval(EXECUTION_1.sessionId)
    subject.approval('unrelated-session')
    await Promise.resolve()

    const currentSecond = status(source, ['complete', 'active'], TASK_2)
    subject.setStatus(currentSecond)
    subject.approval(EXECUTION_1.sessionId, 'approval-non-current')
    await Promise.resolve()
    await dispose()

    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
    expect(subject.pause).not.toHaveBeenCalled()
    expect(subject.dependencies.control).not.toHaveBeenCalled()
    expect(subject.records()[0]?.control.autoProgress).toBe('running')
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
    const completed = status(record(), ['complete'], null)
    subject.dependencies.readStatus = vi.fn(async () => {
      if (subject.continueProgress.mock.calls.length > 0) return completed
      const settled = status(record(), ['complete'], TASK_1)
      return { ...settled, goal: { ...settled.goal, phase: 'planning' } }
    })
    subject.first.setGoal('complete')

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await dispose()
    expect(subject.first.whenIdle).not.toHaveBeenCalled()
    expect(subject.dependencies.flushSession).not.toHaveBeenCalled()
    expect(subject.continueProgress).toHaveBeenCalledTimes(1)
    expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      transition: 'complete',
      status: completed,
    }))
  })

  it('recovers a missing terminal delivery from durable Goal state at startup', async () => {
    const source = record({
      planner: { ...record().planner, phase: 'complete', consideredSettledTasks: 1 },
    })
    const completed = status(source, ['complete'], null)
    const subject = harness(source)
    subject.setStatus(completed)

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await dispose()

    expect(subject.continueProgress).not.toHaveBeenCalled()
    expect(subject.dependencies.deliver).toHaveBeenCalledWith(expect.objectContaining({
      longGoalId: GOAL_ID,
      transition: 'complete',
      status: completed,
    }))
  })

  it('retries terminal delivery when its control Session becomes live after startup', async () => {
    const source = record({
      planner: { ...record().planner, phase: 'complete', consideredSettledTasks: 1 },
    })
    const completed = status(source, ['complete'], null)
    const subject = harness(source)
    subject.setStatus(completed)
    subject.dependencies.deliver = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.dependencies.deliver).toHaveBeenCalledOnce())

    const controlAgent = agent('control-session', 'control-goal')
    subject.live.set('control-session', controlAgent)
    subject.created(controlAgent)
    await dispose()

    expect(subject.dependencies.deliver).toHaveBeenCalledTimes(2)
  })

  it('retries one pending Task only when its exact Planner Session becomes live', async () => {
    const source = record({
      tasks: [{ id: TASK_1, objective: 'Publish', execution: null, resolution: null }],
    })
    const subject = harness(source)
    subject.setStatus(status(source, ['pending'], TASK_1))
    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await vi.waitFor(() => expect(subject.continueProgress).toHaveBeenCalledOnce())

    const unrelated = agent('unrelated-session', 'unrelated-goal')
    subject.live.set('unrelated-session', unrelated)
    subject.created(unrelated)
    await Promise.resolve()
    expect(subject.continueProgress).toHaveBeenCalledOnce()

    const planner = agent(source.planner.sessionId, 'planner-goal')
    subject.live.set(source.planner.sessionId, planner)
    subject.created(planner)
    await vi.waitFor(() => expect(subject.continueProgress).toHaveBeenCalledTimes(2))
    await dispose()

    expect(subject.directCreate).not.toHaveBeenCalled()
    expect(subject.directResume).not.toHaveBeenCalled()
  })

  it('re-arms an unfinished current Task at startup without claiming it advanced', async () => {
    const source = record({
      tasks: [{ id: TASK_1, objective: 'Publish', execution: null, resolution: null }],
    })
    const active = status(source, ['active'], TASK_1)
    const subject = harness(source)
    subject.setStatus(active)

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await dispose()

    expect(subject.continueProgress).toHaveBeenCalledOnce()
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
  })

  it.each([
    [TASK_1, ['active'] as const, 'start'],
    [TASK_2, ['complete', 'active'] as const, 'advance'],
  ] as const)('reconstructs %s progress for an already active bound Task', async (taskId, phases, _transition) => {
    const source = taskId === TASK_1
      ? record()
      : record({
          planner: { ...record().planner, consideredSettledTasks: 1 },
          tasks: [
            { id: TASK_1, objective: 'Published', execution: EXECUTION_1, resolution: null },
            { id: TASK_2, objective: 'Verify', execution: EXECUTION_2, resolution: null },
          ],
        })
    const active = status(source, phases, taskId)
    const subject = harness(source)
    const planner = agent(source.planner.sessionId, 'planner-goal')
    subject.live.set(source.planner.sessionId, planner)
    if (taskId === TASK_2) subject.live.set(EXECUTION_2.sessionId, agent(EXECUTION_2.sessionId, EXECUTION_2.goalId))
    subject.setStatus(active)

    const dispose = mountContinuousGoalHost(subject.ctx as never, subject.dependencies)
    await dispose()

    expect(subject.continueProgress).not.toHaveBeenCalled()
    expect(subject.dependencies.reportProgress).toHaveBeenCalledWith(expect.objectContaining({
      planner,
      facts: [expect.objectContaining({
        stage: taskId === TASK_1 ? 'active: Task 1 of 1' : 'active: Task 2 of 2',
      })],
      signal: expect.any(AbortSignal),
    }))
    expect(subject.dependencies.reportProgress.mock.calls.at(-1)?.[0].facts[0]?.nextAction).toBeUndefined()
    expect(subject.dependencies.deliver).not.toHaveBeenCalled()
  })

  it('delivers one guarded followup for the exact notice Turn and releases the guard before later user work', async () => {
    const terminal = terminalFixture('offline-tool-guard')
    const completed = terminal.status
    const preStepListeners: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>)[] = []
    const sessionListeners: ((session: unknown, event: unknown) => void)[] = []
    const guards: ((execution: { name: string }) => string | undefined)[] = []
    const executed: string[] = []
    const denied: string[] = []
    let mainEvents: readonly SessionEvent[] = []
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
      if (turn === 7) {
        mainEvents = [
          { type: 'turn/start', seq: 20, time: 1_100, data: { turn } },
          { type: 'user/message', seq: 21, time: 1_101, surfaceOp: 'append', data: message },
          { type: 'assistant/message', seq: 22, time: 1_102, surfaceOp: 'append', data: {
            turn,
            message: { id: 'offline-result', role: 'assistant', content: [{ type: 'text', text: 'Delivery confirmed.' }] },
          } },
          { type: 'turn/end', seq: 23, time: 1_103, data: { turn, reason: { kind: 'completed' } } },
        ] as unknown as readonly SessionEvent[]
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
    const inspectSession = vi.fn(async (sessionId: string) => sessionId === EXECUTION_1.sessionId
      ? {
          meta: { id: sessionId, parentSession: 'planner-session' },
          events: [{
            seq: 17, time: 1_000, type: 'goal/change', data: {
              operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
              goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
            },
          }] as never,
        }
      : { meta: { id: sessionId }, events: mainEvents })
    const flushSession = vi.fn(async () => true)
    const getAgent = vi.fn(() => controlAgent)
    const readStatus = vi.fn(async () => completed)

    await deliverContinuousGoalSettlement({
      longGoalId: terminal.record.id,
      transition: 'complete',
      status: completed,
    }, { stateRoot: terminal.stateRoot, getAgent, readStatus, inspectSession, flushSession })

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
    rmSync(terminal.fixture, { recursive: true, force: true })
  })

  it('contains an offline parent without acquiring it or acknowledging delivery', async () => {
    const terminal = terminalFixture('offline-parent-stays-offline')
    try {
      const readStatus = vi.fn(async () => terminal.status)
      const inspectSession = vi.fn(async (sessionId: string) => ({
        meta: { id: sessionId, ...(sessionId === EXECUTION_1.sessionId ? { parentSession: 'planner-session' } : {}) },
        events: sessionId === EXECUTION_1.sessionId
          ? [{ type: 'goal/change', seq: 17, time: 1_000, data: {
              operation: 'complete', ref: { id: EXECUTION_1.goalId, revision: 3 },
              goal: { id: EXECUTION_1.goalId, revision: 3, phase: 'complete' },
            } }] as never
          : [],
      }))
      const flushSession = vi.fn(async () => true)

      await expect(deliverContinuousGoalSettlement({
        longGoalId: terminal.record.id,
        transition: 'complete',
        status: terminal.status,
      }, {
        stateRoot: terminal.stateRoot,
        getAgent: () => undefined,
        readStatus,
        inspectSession,
        flushSession,
      })).resolves.toBe(false)

      expect(readStatus).not.toHaveBeenCalled()
      expect(inspectSession).toHaveBeenCalledWith('control-session')
      expect(flushSession).not.toHaveBeenCalled()
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(terminal.stateRoot, terminal.record.id) as LongGoalRecordV3,
        TASK_1,
      ).terminalDelivery).toBeUndefined()
    } finally {
      rmSync(terminal.fixture, { recursive: true, force: true })
    }
  })
})
