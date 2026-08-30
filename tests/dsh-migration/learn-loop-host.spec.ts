import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import {
  createTianwenLongGoalRpcHandler,
  LongGoalTaskAdmissionError,
  createLearningClueAnalysisOperations,
  mountTianwenLongGoalHost,
  resolveTianwenLongGoalHostRoots,
  runCurrentWebTask,
  type TianwenGoalFirstOperations,
  type TianwenGoalTaskFeedbackOperations,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'
import { readLearningClueAnalysisBinding } from '../../packages/tianwen-runtime-bundle/src/learning-clue-analysis.js'
import { readLearningClueReview } from '../../packages/tianwen-runtime-bundle/src/learning-clue-review.js'
import { projectLearningClueStatus } from '../../packages/tianwen-runtime-bundle/src/learning-clue-status.js'
import { runLongGoalPlannerTurn } from '../../packages/tianwen-runtime-bundle/src/long-goal-planner.js'
import {
  createGoalFirstLongGoal,
  createContinuousLongGoal,
  LongGoalRevisionConflictError,
  readLongGoal,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type {
  LongGoalRecord,
  LongGoalRecordV2,
  LongGoalRecordV3,
  LongGoalStatusProjection,
  LongGoalStatusProjectionV2,
  LongGoalStatusProjectionV3,
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
    readonly header?: { readonly cwd?: string; readonly agentPreset?: string }
  } = {},
): Agent {
  let view = current
  const agent = {
    id: sessionId,
    session: { id: sessionId, header: services.header ?? {} },
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
    bindGoalFirstLongGoalTask: vi.fn(() => { throw new Error('unexpected v2 binding') }),
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => 'session-new'),
    attachedAgent: vi.fn(() => undefined),
    createGoal: vi.fn(() => goalView()),
    readGoalRef: vi.fn(async () => ({ id: 'goal-1', revision: 1, phase: 'active' as const })),
    resumeColdGoal: vi.fn(async () => undefined),
    flushSession: vi.fn(async () => undefined),
    ...overrides,
  }
}

function goalFirstStatus(revision = 1): LongGoalStatusProjectionV2 {
  return {
    schemaVersion: 'tianwen.long-goal-status.v2',
    goal: {
      id: 'tianwen-long-goal-v2-test', objective: 'Ship release', context: null,
      successCriteria: null, phase: 'planning', revision, completedTasks: 0,
      abandonedTasks: 0, totalTasks: 0,
    },
    planner: { sessionId: 'planner-session', phase: 'unplanned', planRevision: 0 },
    guidance: [],
    tasks: [],
    currentTaskId: null,
    runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
  }
}

function goalFirstOperations(status = goalFirstStatus()): TianwenGoalFirstOperations {
  return {
    createGoalFirst: vi.fn(async () => ({
      schemaVersion: 'tianwen.goal-first-progress-result.v2',
      action: 'planning-pending', status, sessionId: null,
    })),
    addGuidance: vi.fn(async () => ({
      schemaVersion: 'tianwen.long-goal-guidance-result.v2',
      planning: 'pending', status,
    })),
    continueProgress: vi.fn(async () => ({
      schemaVersion: 'tianwen.goal-first-progress-result.v2',
      action: 'planning-pending', status, sessionId: null,
    })),
    abandonCurrentTask: vi.fn(async () => ({
      schemaVersion: 'tianwen.long-goal-abandon-result.v2',
      action: 'abandoned', status,
    })),
  }
}

function taskFeedbackOperations(): TianwenGoalTaskFeedbackOperations {
  const item = {
    taskId: 'task-1', rating: 'negative' as const,
    decision: 'ticket-created' as const,
    recordedAt: '2026-08-30T00:00:00.000Z',
    ticketId: `ticket:${'a'.repeat(64)}` as const,
  }
  return {
    status: vi.fn(async () => ({
      schemaVersion: 'tianwen.goal-task-feedback-status.v1', items: [item],
    })),
    record: vi.fn(async () => ({
      schemaVersion: 'tianwen.goal-task-feedback-record.v1',
      duplicate: false, item,
    })),
  }
}

async function installPlannerSetup(
  setup: AgentSetup,
  register: (tool: ToolDefinition) => void,
): Promise<void> {
  const result = await setup({
    tools: { register: (tool: ToolDefinition) => register(tool) },
  } as unknown as Context)
  result?.commit()
}

function plannerHandle(
  record: LongGoalRecordV2 | LongGoalRecordV3,
  onFollowup: () => void = () => undefined,
  header: { readonly cwd?: string; readonly agentPreset?: string } = {
    cwd: record.workspaceRoot,
    agentPreset: record.planner.agentPreset,
  },
): {
  readonly handle: AgentHandle
  readonly followup: ReturnType<typeof vi.fn>
  readonly whenIdle: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
} {
  const followup = vi.fn(() => onFollowup())
  const whenIdle = vi.fn(async () => undefined)
  const dispose = vi.fn(async () => undefined)
  const agent = {
    id: record.planner.sessionId,
    session: { id: record.planner.sessionId, header },
    followup,
    whenIdle,
  } as unknown as Agent
  return { handle: { agent, dispose }, followup, whenIdle, dispose }
}

describe('Tianwen Long Goal Web host', () => {
  it('waits for the configured model and preset services before mounting the Goal-first RPC host', async () => {
    const ctx = new Context()
    const handle = vi.fn()
    ctx.baseUrl = pathToFileURL('D:/DevData/tianwen-learn-loop-host-tests/profile/').href
    try {
      for (const [name, service] of Object.entries({
        connection: { rpc: { handle } },
        apiProxy: {},
        agents: {},
        goals: {},
        sessions: {},
        sessionPersistence: {},
        tianwenLearningIntake: {},
        tianwenEvolution: {},
      })) {
        ;(ctx as unknown as { provide(name: string, value: unknown): void }).provide(name, service)
      }

      mountTianwenLongGoalHost(ctx, ROOTS)
      await Promise.resolve()
      expect(handle).not.toHaveBeenCalled()

      ;(ctx as unknown as { provide(name: string, value: unknown): void }).provide('agentDefaultModel', {
        currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4-pro' }),
      })
      await Promise.resolve()
      expect(handle).not.toHaveBeenCalled()

      ;(ctx as unknown as { provide(name: string, value: unknown): void }).provide('agentPresets', {
        mount: async () => undefined,
      })
      await vi.waitFor(() => expect(handle).toHaveBeenCalledWith(
        '/tianwen',
        expect.any(Function),
        { authority: 'loopback' },
      ))
    } finally {
      await ctx.fiber.dispose()
    }
  })

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

  it('routes exact goal-first endpoint payloads to exact named result values', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const run = runDependencies(longGoalRecord([status.tasks[0]!.execution]), status, {
      listSessions: vi.fn(async () => [{
        sessionId: 'workspace-session',
        cwd: 'D:/canonical-workspace',
        agentPreset: 'planner-preset',
      }]),
    })
    const operations = goalFirstOperations()
    const handler = createTianwenLongGoalRpcHandler(ROOTS, undefined, run, operations)
    const signal = AbortSignal.timeout(1_000)

    const created = await handler('create-goal-first', {
      objective: 'Ship release', context: null, successCriteria: 'Published',
      workspaceSessionId: 'workspace-session',
    }, signal)
    expect(created).toEqual({
      ok: true,
      value: {
        schemaVersion: 'tianwen.goal-first-progress-result.v2',
        action: 'planning-pending', status: goalFirstStatus(), sessionId: null,
      },
    })
    expect(operations.createGoalFirst).toHaveBeenCalledWith({
      objective: 'Ship release', context: null, successCriteria: 'Published',
      workspaceRoot: 'D:/canonical-workspace', agentPreset: 'planner-preset',
    })

    await expect(handler('add-guidance', {
      longGoalId: 'tianwen-long-goal-v2-test', expectedRevision: 2, text: 'Prefer the small release',
    }, signal)).resolves.toEqual({ ok: true, value: {
      schemaVersion: 'tianwen.long-goal-guidance-result.v2',
      planning: 'pending', status: goalFirstStatus(),
    } })
    await expect(handler('continue-progress', {
      longGoalId: 'tianwen-long-goal-v2-test', expectedRevision: 2,
    }, signal)).resolves.toEqual({ ok: true, value: {
      schemaVersion: 'tianwen.goal-first-progress-result.v2',
      action: 'planning-pending', status: goalFirstStatus(), sessionId: null,
    } })
    await expect(handler('abandon-current-task', {
      longGoalId: 'tianwen-long-goal-v2-test', expectedRevision: 2,
    }, signal)).resolves.toEqual({ ok: true, value: {
      schemaVersion: 'tianwen.long-goal-abandon-result.v2',
      action: 'abandoned', status: goalFirstStatus(),
    } })
    expect(run.listSessions).toHaveBeenCalledTimes(1)
  })

  it('rejects goal-first request extras and missing server-side workspace facts', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const operations = goalFirstOperations()
    const signal = AbortSignal.timeout(1_000)
    const invalid = { ok: false, error: { code: 'internal', message: 'invalid-request', details: {} } }
    const run = runDependencies(longGoalRecord([status.tasks[0]!.execution]), status, {
      listSessions: vi.fn(async () => [
        { sessionId: 'missing-preset', cwd: 'D:/workspace' },
        { sessionId: 'missing-cwd', agentPreset: 'planner' },
      ]),
    })
    const handler = createTianwenLongGoalRpcHandler(ROOTS, undefined, run, operations)

    for (const [endpoint, payload] of [
      ['create-goal-first', { objective: 'Goal', context: null, successCriteria: null }],
      ['create-goal-first', { objective: 'Goal', context: null, successCriteria: null, workspaceSessionId: 'missing-preset' }],
      ['create-goal-first', { objective: 'Goal', context: null, successCriteria: null, workspaceSessionId: 'missing-cwd' }],
      ['create-goal-first', { objective: 'Goal', context: null, successCriteria: null, workspaceSessionId: 'missing', ignored: true }],
      ['add-guidance', { longGoalId: 'goal', expectedRevision: 1, text: 'Text', ignored: true }],
      ['continue-progress', { longGoalId: 'goal', expectedRevision: 0 }],
      ['abandon-current-task', { longGoalId: 'goal', expectedRevision: 1, text: 'extra' }],
    ] as const) {
      await expect(handler(endpoint, payload, signal)).resolves.toEqual(invalid)
    }
    expect(operations.createGoalFirst).not.toHaveBeenCalled()
  })

  it('maps a goal-first revision conflict without wrapping or retrying', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const operations = goalFirstOperations()
    vi.mocked(operations.continueProgress).mockRejectedValueOnce(
      new LongGoalRevisionConflictError(4, 5),
    )
    const handler = createTianwenLongGoalRpcHandler(
      ROOTS,
      undefined,
      runDependencies(longGoalRecord([status.tasks[0]!.execution]), status),
      operations,
    )

    await expect(handler('continue-progress', {
      longGoalId: 'tianwen-long-goal-v2-test', expectedRevision: 4,
    }, AbortSignal.timeout(1_000))).resolves.toEqual({
      ok: false,
      error: {
        code: 'revision-conflict',
        message: 'revision-conflict',
        details: { expectedRevision: 4, currentRevision: 5 },
      },
    })
    expect(operations.continueProgress).toHaveBeenCalledTimes(1)
  })

  it('reads and records settled Task feedback through exact RPC payloads', async () => {
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const feedback = taskFeedbackOperations()
    const handler = createTianwenLongGoalRpcHandler(
      ROOTS,
      undefined,
      runDependencies(longGoalRecord([status.tasks[0]!.execution]), status),
      goalFirstOperations(),
      feedback,
    )
    const signal = AbortSignal.timeout(1_000)

    await expect(handler('feedback-status', {
      longGoalId: 'tianwen-long-goal-v2-test',
    }, signal)).resolves.toMatchObject({
      ok: true,
      value: { schemaVersion: 'tianwen.goal-task-feedback-status.v1' },
    })
    await expect(handler('record-task-feedback', {
      longGoalId: 'tianwen-long-goal-v2-test',
      taskId: 'task-1',
      rating: 'negative',
      note: 'Keep the result concrete.',
    }, signal)).resolves.toMatchObject({
      ok: true,
      value: { schemaVersion: 'tianwen.goal-task-feedback-record.v1' },
    })
    expect(feedback.status).toHaveBeenCalledWith({
      longGoalId: 'tianwen-long-goal-v2-test',
    })
    expect(feedback.record).toHaveBeenCalledWith({
      longGoalId: 'tianwen-long-goal-v2-test',
      taskId: 'task-1',
      rating: 'negative',
      note: 'Keep the result concrete.',
    })

    for (const [endpoint, payload] of [
      ['feedback-status', { longGoalId: 'goal', ignored: true }],
      ['record-task-feedback', {
        longGoalId: 'goal', taskId: 'task-1', rating: 'mixed', note: null,
      }],
      ['record-task-feedback', {
        longGoalId: 'goal', taskId: 'task-1', rating: 'negative', note: ' ',
      }],
      ['record-task-feedback', {
        longGoalId: 'goal', taskId: 'task-1', rating: 'positive', note: 'unexpected',
      }],
    ] as const) {
      await expect(handler(endpoint, payload, signal)).resolves.toEqual({
        ok: false,
        error: { code: 'internal', message: 'invalid-request', details: {} },
      })
    }
    expect(feedback.record).toHaveBeenCalledTimes(1)
  })

  it('projects only safe settled Goal-first Ticket sources and sorts clues by latest source', () => {
    const ticketA = `ticket:${'a'.repeat(64)}` as const
    const ticketB = `ticket:${'b'.repeat(64)}` as const
    const statusA = {
      ...goalFirstStatus(4),
      goal: {
        ...goalFirstStatus(4).goal,
        id: 'goal-a',
        objective: 'Improve release quality',
        phase: 'complete' as const,
        completedTasks: 1,
        totalTasks: 1,
      },
      planner: { sessionId: 'planner-a', phase: 'complete' as const, planRevision: 1 },
      tasks: [{
        id: 'task-a',
        objective: 'Review the release notes',
        phase: 'complete' as const,
        execution: { goalId: 'dsh-goal-a', sessionId: 'session-a' },
        resolution: null,
      }],
    }
    const statusB = {
      ...statusA,
      goal: { ...statusA.goal, id: 'goal-b', objective: 'Reduce support friction' },
      planner: { ...statusA.planner, sessionId: 'planner-b' },
      tasks: [{
        ...statusA.tasks[0],
        id: 'task-b',
        objective: 'Clarify the setup flow',
        execution: { goalId: 'dsh-goal-b', sessionId: 'session-b' },
      }],
    }

    const result = projectLearningClueStatus({
      goals: [{
        status: statusA,
        feedback: {
          schemaVersion: 'tianwen.goal-task-feedback-status.v1',
          items: [{
            taskId: 'task-a', rating: 'negative', decision: 'ticket-created',
            recordedAt: '2026-08-30T01:00:00.000Z', ticketId: ticketA,
          }],
        },
      }, {
        status: statusB,
        feedback: {
          schemaVersion: 'tianwen.goal-task-feedback-status.v1',
          items: [{
            taskId: 'task-b', rating: 'negative', decision: 'ticket-merged',
            recordedAt: '2026-08-30T03:00:00.000Z', ticketId: ticketA,
          }, {
            taskId: 'task-b', rating: 'negative', decision: 'ticket-merged',
            recordedAt: '2026-08-30T03:00:00.000Z', ticketId: ticketA,
          }],
        },
      }],
      tickets: [{
        ticketId: ticketB,
        problemFingerprint: `sha256:${'2'.repeat(64)}`,
        status: 'open',
        signalIds: [`signal:${'3'.repeat(64)}`],
      }, {
        ticketId: ticketA,
        problemFingerprint: `sha256:${'1'.repeat(64)}`,
        status: 'open',
        signalIds: [`signal:${'1'.repeat(64)}`, `signal:${'2'.repeat(64)}`],
      }],
    })

    expect(result).toEqual({
      schemaVersion: 'tianwen.learning-clue-status.v1',
      items: [{
        ticketId: ticketA,
        status: 'open',
        occurrenceCount: 2,
        analysis: null,
        review: null,
        sources: [{
          longGoalId: 'goal-b',
          goalObjective: 'Reduce support friction',
          taskId: 'task-b',
          taskObjective: 'Clarify the setup flow',
          recordedAt: '2026-08-30T03:00:00.000Z',
        }, {
          longGoalId: 'goal-a',
          goalObjective: 'Improve release quality',
          taskId: 'task-a',
          taskObjective: 'Review the release notes',
          recordedAt: '2026-08-30T01:00:00.000Z',
        }],
      }],
    })
    expect(JSON.stringify(result)).not.toMatch(
      /"problemFingerprint"|"signalIds"|"note"|"workspace"|"evidence"/,
    )
  })

  it('serves learning clues only for an exact empty RPC payload', async () => {
    const expected = { schemaVersion: 'tianwen.learning-clue-status.v1' as const, items: [] }
    const learningClues = { status: vi.fn(async () => expected) }
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const handler = createTianwenLongGoalRpcHandler(
      ROOTS,
      undefined,
      runDependencies(longGoalRecord([status.tasks[0]!.execution]), status),
      goalFirstOperations(),
      taskFeedbackOperations(),
      learningClues,
    )

    await expect(handler('learning-clues', {}, AbortSignal.timeout(1_000)))
      .resolves.toEqual({ ok: true, value: expected })
    await expect(handler('learning-clues', { ignored: true }, AbortSignal.timeout(1_000)))
      .resolves.toEqual({
        ok: false,
        error: { code: 'internal', message: 'invalid-request', details: {} },
      })
    expect(learningClues.status).toHaveBeenCalledOnce()
  })

  it('starts one analysis only for an exact visible-clue Ticket payload', async () => {
    const ticketId = `ticket:${'a'.repeat(64)}`
    const learningClues = {
      status: vi.fn(async () => ({
        schemaVersion: 'tianwen.learning-clue-status.v1' as const,
        items: [],
      })),
      analyze: vi.fn(async (input: { readonly ticketId: string }) => ({
        schemaVersion: 'tianwen.learning-clue-analysis-start.v1' as const,
        created: true,
        sessionId: `analysis-session-for-${input.ticketId.slice(-4)}`,
      })),
    }
    const status = longGoalStatus(['complete'], [{ goalId: 'goal-1', sessionId: 'session-1' }])
    const handler = createTianwenLongGoalRpcHandler(
      ROOTS,
      undefined,
      runDependencies(longGoalRecord([status.tasks[0]!.execution]), status),
      goalFirstOperations(),
      taskFeedbackOperations(),
      learningClues,
    )
    const signal = AbortSignal.timeout(1_000)

    await expect(handler('analyze-learning-clue', { ticketId }, signal)).resolves.toEqual({
      ok: true,
      value: {
        schemaVersion: 'tianwen.learning-clue-analysis-start.v1',
        created: true,
        sessionId: 'analysis-session-for-aaaa',
      },
    })
    expect(learningClues.analyze).toHaveBeenCalledWith({ ticketId })

    await expect(handler('analyze-learning-clue', { ticketId, ignored: true }, signal))
      .resolves.toEqual({
        ok: false,
        error: { code: 'internal', message: 'invalid-request', details: {} },
      })
    expect(learningClues.analyze).toHaveBeenCalledOnce()
  })

  it('marks a learning clue reviewed only for an exact Ticket payload', async () => {
    const ticketId = `ticket:${'b'.repeat(64)}`
    const reviewedAt = '2026-08-30T05:00:00.000Z'
    const learningClues = {
      status: vi.fn(async () => ({
        schemaVersion: 'tianwen.learning-clue-status.v1' as const,
        items: [],
      })),
      analyze: vi.fn(),
      review: vi.fn(async () => ({
        schemaVersion: 'tianwen.learning-clue-review-result.v1' as const,
        reviewed: true as const,
        occurrenceCount: 2,
        reviewedAt,
      })),
    }
    const handler = createTianwenLongGoalRpcHandler(
      ROOTS,
      undefined,
      undefined,
      undefined,
      undefined,
      learningClues,
    )
    const signal = AbortSignal.timeout(1_000)

    await expect(handler('review-learning-clue', { ticketId }, signal)).resolves.toEqual({
      ok: true,
      value: {
        schemaVersion: 'tianwen.learning-clue-review-result.v1',
        reviewed: true,
        occurrenceCount: 2,
        reviewedAt,
      },
    })
    expect(learningClues.review).toHaveBeenCalledWith({ ticketId })
    await expect(handler('review-learning-clue', { ticketId, ignored: true }, signal))
      .resolves.toEqual({
        ok: false,
        error: { code: 'internal', message: 'invalid-request', details: {} },
      })
    expect(learningClues.review).toHaveBeenCalledOnce()
  })

  it('analyzes one safe feedback source once without exposing its private evidence', async () => {
    const fixture = createFixtureRoot()
    const ticketId = `ticket:${'f'.repeat(64)}`
    const feedbackNote = '请用中文说明这个参数为什么无效。'
    const finalReply = '我会把参数直接传给启动脚本。'
    const sourceSessionId = 'source-session'
    let analysisSessionId = ''
    const sourceEvents = [{ type: 'turn/start', seq: 1, data: { turn: 1 } }, {
      type: 'user/message', seq: 2, data: { source: { kind: 'goal', goalId: 'source-goal' } },
    }, {
      type: 'assistant/message', seq: 3, surfaceOp: 'append', data: {
        turn: 1, message: { id: 'assistant-anchor', content: [{ type: 'text', text: finalReply }] },
      },
    }, {
      type: 'turn/end', seq: 4, time: 1_000, data: { turn: 1, reason: { kind: 'completed' } },
    }, {
      type: 'goal/change', seq: 5, data: {
        operation: 'complete', goal: { id: 'source-goal', phase: 'complete' },
      },
    }]
    const analysisEvents: unknown[] = []
    const followup = vi.fn(() => {
      expect(readLearningClueAnalysisBinding(fixture, ticketId)?.sessionId).toBe(analysisSessionId)
    })
    const flushSession = vi.fn(async () => undefined)
    const analysisAgent = {
      session: { id: 'analysis-session', header: { cwd: 'D:/workspace', agentPreset: 'tianwen' } },
      followup,
      whenIdle: vi.fn(async () => undefined),
    } as unknown as Agent
    const createSession = vi.fn(async (input: { readonly sessionId: string }) => {
      analysisSessionId = input.sessionId
      return { sessionId: input.sessionId, agent: analysisAgent }
    })
    const snapshot = {
      goals: [{
        record: {
          id: 'long-goal', schemaVersion: 'tianwen.long-goal.v2', workspaceRoot: 'D:/workspace',
          planner: { agentPreset: 'tianwen' },
        } as unknown as LongGoalRecordV2,
        status: {
          schemaVersion: 'tianwen.long-goal-status.v2',
          tasks: [{ id: 'task-1', phase: 'complete', execution: { goalId: 'source-goal', sessionId: sourceSessionId } }],
        } as unknown as LongGoalStatusProjectionV2,
        feedback: {} as never,
      }],
      status: {
        schemaVersion: 'tianwen.learning-clue-status.v1' as const,
        items: [{
          ticketId, status: 'open' as const, occurrenceCount: 1, analysis: null, review: null,
          sources: [{
            longGoalId: 'long-goal', goalObjective: '修正启动参数', taskId: 'task-1',
            taskObjective: '定位参数传递', recordedAt: '2026-08-30T00:00:00.000Z',
          }],
        }],
      },
    }
    const openSession = vi.fn(async (sessionId: string) => ({
      session: {
        events: sessionId === sourceSessionId ? sourceEvents : analysisEvents,
      } as never,
      release: () => undefined,
    }))
    const operations = createLearningClueAnalysisOperations({
      stateRoot: fixture,
      clueSnapshot: async () => snapshot,
      getFeedback: input => input === ticketId ? {
        scopeKey: 'workspace:D:/workspace',
        latest: { note: feedbackNote, sessionId: sourceSessionId, messageId: 'assistant-anchor' },
      } : undefined,
      openSession,
      createSession,
      flushSession,
    })
    const handler = createTianwenLongGoalRpcHandler(ROOTS, undefined, undefined, undefined, undefined, operations)
    try {
      const [first, concurrent] = await Promise.all([
        handler('analyze-learning-clue', { ticketId }, AbortSignal.timeout(1_000)),
        handler('analyze-learning-clue', { ticketId }, AbortSignal.timeout(1_000)),
      ])
      expect(first).toEqual({ ok: true, value: {
        schemaVersion: 'tianwen.learning-clue-analysis-start.v1', created: true, sessionId: analysisSessionId,
      } })
      expect(concurrent).toEqual(first)
      expect(JSON.stringify(first)).not.toContain(feedbackNote)
      expect(createSession).toHaveBeenCalledOnce()
      expect(followup).toHaveBeenCalledOnce()
      const prompt = String((followup.mock.calls[0]![0] as { content: readonly { text?: string }[] }).content[0]?.text)
      expect(prompt).toContain(feedbackNote)
      expect(prompt).toContain(finalReply)
      expect(prompt).toContain('中文')
      expect(readLearningClueAnalysisBinding(fixture, ticketId)?.sessionId).toBe(analysisSessionId)
      await expect(operations.status()).resolves.toMatchObject({
        items: [{ analysis: {
          phase: 'failed', sessionId: analysisSessionId,
          finishedAt: expect.any(String),
        } }],
      })

      const second = await handler('analyze-learning-clue', { ticketId }, AbortSignal.timeout(1_000))
      expect(second).toEqual({ ok: true, value: {
        schemaVersion: 'tianwen.learning-clue-analysis-start.v1', created: false, sessionId: analysisSessionId,
      } })
      expect(createSession).toHaveBeenCalledOnce()
      expect(followup).toHaveBeenCalledOnce()

      const binding = readLearningClueAnalysisBinding(fixture, ticketId)!
      analysisEvents.splice(0, analysisEvents.length,
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        { type: 'user/message', seq: 2, data: { id: binding.messageId } },
      )
      await expect(operations.review({ ticketId })).rejects.toThrow('still running')
      expect(readLearningClueReview(fixture, ticketId)).toBeUndefined()

      analysisEvents.splice(0, analysisEvents.length,
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        { type: 'user/message', seq: 2, data: { id: binding.messageId } },
        { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1 } },
        { type: 'turn/end', seq: 4, time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } },
      )
      await expect(operations.status()).resolves.toMatchObject({
        items: [{ analysis: { phase: 'complete', sessionId: analysisSessionId } }],
      })
      const review = await operations.review({ ticketId })
      expect(review).toMatchObject({
        schemaVersion: 'tianwen.learning-clue-review-result.v1',
        reviewed: true,
        occurrenceCount: 1,
        reviewedAt: expect.any(String),
      })
      expect(readLearningClueReview(fixture, ticketId)).toMatchObject({
        sessionId: analysisSessionId,
        messageId: binding.messageId,
        reviewedOccurrenceCount: 1,
      })
      await expect(operations.status()).resolves.toMatchObject({
        items: [{ review: { occurrenceCount: 1, reviewedAt: review.reviewedAt } }],
      })

      snapshot.status.items[0]!.occurrenceCount = 2
      await expect(operations.status()).resolves.toMatchObject({
        items: [{ occurrenceCount: 2, review: null }],
      })
      await expect(operations.review({ ticketId })).resolves.toMatchObject({
        reviewed: true,
        occurrenceCount: 2,
      })
      expect(readLearningClueReview(fixture, ticketId)?.reviewedOccurrenceCount).toBe(2)

      analysisEvents.splice(2, 2,
        { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'error' } } },
      )
      await expect(operations.status()).resolves.toMatchObject({
        items: [{ analysis: { phase: 'failed', sessionId: analysisSessionId } }],
      })

      const followupFailureFlush = vi.fn(async () => undefined)
      const followupFailure = createLearningClueAnalysisOperations({
        stateRoot: join(fixture, 'followup-failure'),
        clueSnapshot: async () => snapshot,
        getFeedback: input => input === ticketId ? {
          scopeKey: 'workspace:D:/workspace',
          latest: { note: feedbackNote, sessionId: sourceSessionId, messageId: 'assistant-anchor' },
        } : undefined,
        openSession,
        createSession: async input => ({
          sessionId: input.sessionId,
          agent: {
            session: { id: input.sessionId, header: {} },
            followup: () => { throw new Error('followup failed') },
            whenIdle: async () => undefined,
          } as unknown as Agent,
        }),
        flushSession: followupFailureFlush,
      })
      await expect(followupFailure.analyze({ ticketId })).rejects.toThrow('followup failed')
      expect(followupFailureFlush).toHaveBeenCalledOnce()
      await expect(followupFailure.status()).resolves.toMatchObject({
        items: [{ analysis: { phase: 'failed', finishedAt: expect.any(String) } }],
      })

      const rejected = createLearningClueAnalysisOperations({
        stateRoot: join(fixture, 'rejected'),
        clueSnapshot: async () => snapshot,
        getFeedback: () => ({
          scopeKey: 'workspace:D:/workspace',
          latest: { note: feedbackNote, sessionId: 'wrong-source', messageId: 'assistant-anchor' },
        }),
        openSession,
        createSession,
        flushSession,
      })
      await expect(rejected.analyze({ ticketId })).rejects.toThrow('source mismatch')
      await expect(rejected.analyze({ ticketId: `ticket:${'0'.repeat(64)}` })).rejects.toThrow('not visible')
      expect(createSession).toHaveBeenCalledOnce()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('keeps the v1 create payload and result unchanged when goal-first operations are installed', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const handler = createTianwenLongGoalRpcHandler({
        stateRoot,
        sessionsRoot: join(fixture, 'sessions'),
        evolutionRoot: join(stateRoot, 'evolution'),
      }, undefined, undefined, goalFirstOperations())

      await expect(handler('create', {
        objective: 'Legacy release', tasks: ['Legacy task'], maxTaskRounds: 2,
      }, AbortSignal.timeout(1_000))).resolves.toMatchObject({
        ok: true,
        value: {
          status: {
            schemaVersion: 'tianwen.long-goal-status.v1',
            goal: { objective: 'Legacy release', totalTasks: 1 },
          },
        },
      })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
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

  it('admits a v2 Task in the frozen workspace and preset while ignoring browser cwd', async () => {
    const record: LongGoalRecordV2 = {
      schemaVersion: 'tianwen.long-goal.v2', id: 'tianwen-long-goal-v2-test', revision: 3,
      objective: 'Ship release', context: null, successCriteria: null,
      workspaceRoot: 'D:/frozen-workspace', maxTaskRounds: 3,
      planner: {
        sessionId: 'planner-session', agentPreset: 'planner-preset', planRevision: 1,
        phase: 'ready', consideredSettledTasks: 0,
      },
      guidance: [], createdAt: 1, updatedAt: 1,
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', execution: null, resolution: null }],
    }
    const base = goalFirstStatus(3)
    const status: LongGoalStatusProjectionV2 = {
      ...base,
      goal: { ...base.goal, phase: 'active', totalTasks: 1 },
      planner: { ...base.planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', phase: 'pending', execution: null, resolution: null }],
      currentTaskId: 'task-v2',
    }
    const execution = { goalId: 'goal-new', sessionId: 'session-new' }
    const boundStatus: LongGoalStatusProjectionV2 = {
      ...status,
      goal: { ...status.goal, revision: 4 },
      tasks: [{ ...status.tasks[0]!, phase: 'active', execution }],
    }
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }), {
      header: { cwd: 'D:/frozen-workspace', agentPreset: 'planner-preset' },
    })
    const bindGoalFirstLongGoalTask = vi.fn(() => ({ ...record, revision: 4 }))
    const dependencies = {
      ...runDependencies(record as never, status as never),
      readLongGoal: vi.fn(() => record),
      readLongGoalStatus: vi.fn().mockResolvedValueOnce(status).mockResolvedValueOnce(boundStatus),
      createSession: vi.fn(async () => 'session-new'),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => goalView({ id: 'goal-new' as GoalView['id'] })),
      bindGoalFirstLongGoalTask,
    } as unknown as Parameters<typeof runCurrentWebTask>[1]

    await expect(runCurrentWebTask({
      roots: ROOTS,
      longGoalId: record.id,
      expectedRevision: 3,
      initialCwd: 'D:/browser-current-workspace',
    }, dependencies)).resolves.toEqual({ status: boundStatus, sessionId: 'session-new', action: 'started' })
    expect(dependencies.createSession).toHaveBeenCalledWith({
      cwd: 'D:/frozen-workspace',
      agentPreset: 'planner-preset',
    })
    expect(bindGoalFirstLongGoalTask).toHaveBeenCalledWith({
      stateRoot: ROOTS.stateRoot,
      longGoalId: record.id,
      expectedRevision: 3,
      taskId: 'task-v2',
      execution,
    })
  })

  it('admits a v3 Task through the Goal-first binder in its frozen workspace and preset', async () => {
    const record: LongGoalRecordV3 = {
      schemaVersion: 'tianwen.long-goal.v3', id: 'tianwen-long-goal-v3-test', revision: 3,
      objective: 'Ship continuous release', context: null, successCriteria: null,
      workspaceRoot: 'D:/frozen-workspace', maxTaskRounds: 3,
      planner: {
        sessionId: 'planner-session', agentPreset: 'planner-preset', planRevision: 1,
        phase: 'ready', consideredSettledTasks: 0,
      },
      guidance: [], createdAt: 1, updatedAt: 1,
      control: { sessionId: 'control-session', autoProgress: 'running' },
      tasks: [{ id: 'task-v3', objective: 'Prepare notes', execution: null, resolution: null }],
    }
    const base = goalFirstStatus(3)
    const status: LongGoalStatusProjectionV3 = {
      ...base,
      schemaVersion: 'tianwen.long-goal-status.v3',
      goal: { ...base.goal, id: record.id, phase: 'active', totalTasks: 1 },
      planner: { ...base.planner, phase: 'ready', planRevision: 1 },
      control: record.control,
      tasks: [{ id: 'task-v3', objective: 'Prepare notes', phase: 'pending', execution: null, resolution: null }],
      currentTaskId: 'task-v3',
    }
    const execution = { goalId: 'goal-new', sessionId: 'session-new' }
    const boundStatus: LongGoalStatusProjectionV3 = {
      ...status,
      goal: { ...status.goal, revision: 4 },
      tasks: [{ ...status.tasks[0]!, phase: 'active', execution }],
    }
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }), {
      header: { cwd: 'D:/frozen-workspace', agentPreset: 'planner-preset' },
    })
    const bindGoalFirstLongGoalTask = vi.fn(() => ({ ...record, revision: 4 }))
    const dependencies = {
      ...runDependencies(record as never, status as never),
      readLongGoal: vi.fn(() => record),
      readLongGoalStatus: vi.fn().mockResolvedValueOnce(status).mockResolvedValueOnce(boundStatus),
      createSession: vi.fn(async () => 'session-new'),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => goalView({ id: 'goal-new' as GoalView['id'] })),
      bindGoalFirstLongGoalTask,
    } as unknown as Parameters<typeof runCurrentWebTask>[1]

    await expect(runCurrentWebTask({
      roots: ROOTS, longGoalId: record.id, expectedRevision: 3,
    }, dependencies)).resolves.toEqual({ status: boundStatus, sessionId: 'session-new', action: 'started' })
    expect(dependencies.createSession).toHaveBeenCalledWith({
      cwd: 'D:/frozen-workspace', agentPreset: 'planner-preset',
    })
    expect(bindGoalFirstLongGoalTask).toHaveBeenCalledWith({
      stateRoot: ROOTS.stateRoot, longGoalId: record.id, expectedRevision: 3,
      taskId: 'task-v3', execution,
    })
    expect(dependencies.bindLongGoalTask).not.toHaveBeenCalled()
  })

  it('preserves a v2 bind revision conflict after cleaning up the created Goal', async () => {
    const record: LongGoalRecordV2 = {
      schemaVersion: 'tianwen.long-goal.v2', id: 'tianwen-long-goal-v2-test', revision: 3,
      objective: 'Ship release', context: null, successCriteria: null,
      workspaceRoot: 'D:/frozen-workspace', maxTaskRounds: 3,
      planner: {
        sessionId: 'planner-session', agentPreset: 'planner-preset', planRevision: 1,
        phase: 'ready', consideredSettledTasks: 0,
      },
      guidance: [], createdAt: 1, updatedAt: 1,
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', execution: null, resolution: null }],
    }
    const base = goalFirstStatus(3)
    const status: LongGoalStatusProjectionV2 = {
      ...base,
      goal: { ...base.goal, phase: 'active', totalTasks: 1 },
      planner: { ...base.planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', phase: 'pending', execution: null, resolution: null }],
      currentTaskId: 'task-v2',
    }
    const disarm = vi.fn()
    const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }), {
      disarm,
      header: { cwd: 'D:/frozen-workspace', agentPreset: 'planner-preset' },
    })
    const conflict = new LongGoalRevisionConflictError(3, 4)
    const dependencies = {
      ...runDependencies(record as never, status as never),
      readLongGoal: vi.fn(() => record),
      readLongGoalStatus: vi.fn(async () => status),
      createSession: vi.fn(async () => 'session-new'),
      attachedAgent: vi.fn(() => agent),
      createGoal: vi.fn(() => goalView({ id: 'goal-new' as GoalView['id'] })),
      bindGoalFirstLongGoalTask: vi.fn(() => { throw conflict }),
      flushSession: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof runCurrentWebTask>[1]

    await expect(runCurrentWebTask({
      roots: ROOTS,
      longGoalId: record.id,
      expectedRevision: 3,
    }, dependencies)).rejects.toBe(conflict)
    expect(disarm).toHaveBeenCalledWith(agent)
    expect(dependencies.flushSession).toHaveBeenCalledWith(agent)
  })

  it('refuses a stale v2 suffix when a Task settles before admission side effects', async () => {
    const settled = { goalId: 'goal-complete', sessionId: 'session-complete' }
    const record: LongGoalRecordV2 = {
      schemaVersion: 'tianwen.long-goal.v2', id: 'tianwen-long-goal-v2-test', revision: 3,
      objective: 'Ship release', context: null, successCriteria: null,
      workspaceRoot: 'D:/frozen-workspace', maxTaskRounds: 3,
      planner: {
        sessionId: 'planner-session', agentPreset: 'planner-preset', planRevision: 1,
        phase: 'ready', consideredSettledTasks: 0,
      },
      guidance: [], createdAt: 1, updatedAt: 1,
      tasks: [
        { id: 'task-complete', objective: 'Prepare notes', execution: settled, resolution: null },
        { id: 'task-stale', objective: 'Publish old suffix', execution: null, resolution: null },
      ],
    }
    const base = goalFirstStatus(3)
    const status: LongGoalStatusProjectionV2 = {
      ...base,
      goal: { ...base.goal, phase: 'planning', completedTasks: 1, totalTasks: 2 },
      planner: { ...base.planner, phase: 'ready', planRevision: 1 },
      tasks: [
        {
          id: 'task-complete', objective: 'Prepare notes', phase: 'complete',
          execution: settled, resolution: null,
        },
        {
          id: 'task-stale', objective: 'Publish old suffix', phase: 'pending',
          execution: null, resolution: null,
        },
      ],
      currentTaskId: 'task-stale',
    }
    const dependencies = {
      ...runDependencies(record as never, status as never),
      readLongGoal: vi.fn(() => record),
      readLongGoalStatus: vi.fn(async () => status),
    } as unknown as Parameters<typeof runCurrentWebTask>[1]

    await expect(runCurrentWebTask({
      roots: ROOTS,
      longGoalId: record.id,
      expectedRevision: 3,
    }, dependencies)).rejects.toThrow('active ready state')
    expect(dependencies.createSession).not.toHaveBeenCalled()
  })

  it.each([
    [{ sessionId: 'session-1', cwd: 'D:/other-workspace', agentPreset: 'planner-preset' }, 'workspace'],
    [{ sessionId: 'session-1', cwd: 'D:/frozen-workspace', agentPreset: 'other-preset' }, 'preset'],
  ] as const)('rejects a v2 cold Task %s mismatch before resume', async (sessionHeader, expected) => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const record: LongGoalRecordV2 = {
      schemaVersion: 'tianwen.long-goal.v2', id: 'tianwen-long-goal-v2-test', revision: 4,
      objective: 'Ship release', context: null, successCriteria: null,
      workspaceRoot: 'D:/frozen-workspace', maxTaskRounds: 3,
      planner: {
        sessionId: 'planner-session', agentPreset: 'planner-preset', planRevision: 1,
        phase: 'ready', consideredSettledTasks: 0,
      },
      guidance: [], createdAt: 1, updatedAt: 1,
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', execution, resolution: null }],
    }
    const base = goalFirstStatus(4)
    const status: LongGoalStatusProjectionV2 = {
      ...base,
      goal: { ...base.goal, phase: 'active', totalTasks: 1 },
      planner: { ...base.planner, phase: 'ready', planRevision: 1 },
      tasks: [{ id: 'task-v2', objective: 'Prepare notes', phase: 'active', execution, resolution: null }],
      currentTaskId: 'task-v2',
    }
    const dependencies = {
      ...runDependencies(record as never, status as never),
      readLongGoal: vi.fn(() => record),
      readLongGoalStatus: vi.fn(async () => status),
      listSessions: vi.fn(async () => [sessionHeader]),
      readGoalRef: vi.fn(async () => ({ id: 'goal-1', revision: 7, phase: 'active' as const })),
      bindGoalFirstLongGoalTask: vi.fn(),
    } as unknown as Parameters<typeof runCurrentWebTask>[1]

    await expect(runCurrentWebTask({
      roots: ROOTS, longGoalId: record.id, expectedRevision: 4,
    }, dependencies)).rejects.toThrow(expected)
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
  })

  it('resumes an active cold Task in its bound Session without creating a replacement', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const agent = fakeAgent('session-1', goalView())
    const attachedAgent = vi.fn<RunDependencies['attachedAgent']>()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(agent)
    const readGoalRef = vi.fn(async () => ({ id: 'goal-1', revision: 7, phase: 'active' as const }))
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

  it('rejects a projected blocked Task before any create or resume operation', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const base = longGoalStatus(['blocked'], [execution])
    const status = {
      ...base,
      tasks: [{
        ...base.tasks[0]!,
        blockedReason: { code: 'round-limit', message: 'Task reached its round limit.' },
      }],
    }
    const dependencies = runDependencies(longGoalRecord([execution]), status)

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .rejects.toThrow('Task reached its round limit')
    expect(dependencies.readGoalRef).not.toHaveBeenCalled()
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
    expect(dependencies.createSession).not.toHaveBeenCalled()
    expect(dependencies.createGoal).not.toHaveBeenCalled()
  })

  it('rejects a cold Goal that became blocked without calling the resume API', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const dependencies = runDependencies(longGoalRecord([execution]), status, {
      readGoalRef: vi.fn(async () => ({
        id: 'goal-1',
        revision: 7,
        phase: 'blocked' as const,
        blockedReason: { code: 'round-limit', message: 'Task reached its round limit.' },
      })),
    })

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .rejects.toThrow('Task reached its round limit')
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
    expect(dependencies.createSession).not.toHaveBeenCalled()
  })

  it('rejects an attached blocked Goal without calling goals.resume', async () => {
    const execution = { goalId: 'goal-1', sessionId: 'session-1' }
    const status = longGoalStatus(['active'], [execution])
    const resume = vi.fn()
    const agent = fakeAgent('session-1', goalView({
      phase: 'blocked',
      activation: 'disarmed',
      blockedReason: { code: 'round-limit', message: 'Task reached its round limit.' },
    }), { resume })
    const dependencies = runDependencies(longGoalRecord([execution]), status, {
      attachedAgent: vi.fn(() => agent),
    })

    await expect(runCurrentWebTask({ roots: ROOTS, longGoalId: status.goal.id }, dependencies))
      .rejects.toThrow('Task reached its round limit')
    expect(resume).not.toHaveBeenCalled()
    expect(dependencies.resumeColdGoal).not.toHaveBeenCalled()
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

  it('keeps both admission IDs when binding cleanup fails', async () => {
    for (const failingCleanup of ['disarm', 'flush'] as const) {
      const status = longGoalStatus(['pending'], [null])
      const record = longGoalRecord([null])
      const agent = fakeAgent('session-new', goalView({ id: 'goal-new' as GoalView['id'] }), {
        disarm: () => {
          if (failingCleanup === 'disarm') throw new Error('cleanup-disarm')
          return goalView({ id: 'goal-new' as GoalView['id'], activation: 'disarmed' })
        },
      })
      const dependencies = runDependencies(record, status, {
        attachedAgent: vi.fn(() => agent),
        createGoal: vi.fn(() => goalView({ id: 'goal-new' as GoalView['id'] })),
        bindLongGoalTask: vi.fn(() => {
          throw new Error('disk-full')
        }),
        flushSession: vi.fn(async () => {
          if (failingCleanup === 'flush') throw new Error('cleanup-flush')
        }),
      })

      let caught: unknown
      try {
        await runCurrentWebTask({
          roots: ROOTS,
          longGoalId: status.goal.id,
          initialCwd: 'D:/workspace',
        }, dependencies)
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(LongGoalTaskAdmissionError)
      expect(caught).toMatchObject({ sessionId: 'session-new', goalId: 'goal-new' })
      const cause = (caught as Error).cause
      expect(cause).toBeInstanceOf(AggregateError)
      expect((cause as AggregateError).errors.map(String)).toEqual([
        'Error: disk-full',
        `Error: cleanup-${failingCleanup}`,
      ])
    }
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

describe('Long Goal DSH planner', () => {
  it('rejects a settled-Task checkpoint beyond the current settled prefix', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const stored = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      const record = {
        ...stored,
        planner: { ...stored.planner, consideredSettledTasks: 1 },
      }
      const owned = plannerHandle(record)

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: {
          sessionsRoot: join(fixture, 'sessions'),
          evolutionRoot: join(stateRoot, 'evolution'),
        },
        record,
        reason: 'continue',
      }, {
        inspectSession: vi.fn(async () => ({ exists: false })),
        createAgent: vi.fn(async () => owned.handle),
        resumeAgent: vi.fn(async () => { throw new Error('unexpected resume') }),
        flushSession: vi.fn(async () => undefined),
        readSettledTaskResult: vi.fn(async () => undefined),
      })).rejects.toThrow(/settled Task checkpoint/u)
      expect(owned.followup).not.toHaveBeenCalled()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('creates then cold-resumes the one frozen Session with the scoped tool restored', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      let persisted = false
      const registered: string[] = []
      const created = plannerHandle(record)
      const resumed = plannerHandle(record)
      const inspectSession = vi.fn(async () => persisted
        ? { exists: true, cwd: fixture, agentPreset: 'planner-preset' }
        : { exists: false })
      const createAgent = vi.fn(async (input: {
        readonly setup: AgentSetup
        readonly sessionId: string
        readonly cwd: string
        readonly agentPreset: string
      }) => {
        await installPlannerSetup(input.setup, tool => registered.push(tool.name))
        persisted = true
        return created.handle
      })
      const resumeAgent = vi.fn(async (input: { readonly setup: AgentSetup }) => {
        await installPlannerSetup(input.setup, tool => registered.push(tool.name))
        return resumed.handle
      })
      const flushSession = vi.fn(async () => undefined)
      const dependencies = {
        inspectSession, createAgent, resumeAgent, flushSession,
        readSettledTaskResult: vi.fn(async () => undefined),
      }
      const input = {
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'create' as const,
      }

      await expect(runLongGoalPlannerTurn(input, dependencies)).resolves.toBe('not-submitted')
      await expect(runLongGoalPlannerTurn({ ...input, reason: 'continue' }, dependencies))
        .resolves.toBe('not-submitted')

      expect(createAgent).toHaveBeenCalledWith({
        sessionId: record.planner.sessionId,
        cwd: record.workspaceRoot,
        agentPreset: record.planner.agentPreset,
        setup: expect.any(Function),
      })
      expect(resumeAgent).toHaveBeenCalledWith({
        sessionId: record.planner.sessionId,
        setup: expect.any(Function),
      })
      expect(registered).toEqual(['submit_long_goal_plan', 'submit_long_goal_plan'])
      expect(created.followup).toHaveBeenCalledTimes(1)
      expect(created.whenIdle).toHaveBeenCalledTimes(1)
      expect(resumed.followup).toHaveBeenCalledTimes(1)
      expect(resumed.whenIdle).toHaveBeenCalledTimes(1)
      expect(flushSession).toHaveBeenCalledTimes(2)
      expect(created.dispose).toHaveBeenCalledTimes(1)
      expect(resumed.dispose).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('commits only a live typed-tool submission and concludes that turn', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: 'Keep history', successCriteria: 'Published',
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      let tool: ToolDefinition | undefined
      let pending = Promise.resolve<unknown>(undefined)
      const concludeTurn = vi.fn()
      const owned = plannerHandle(record, () => {
        pending = tool!.execute({
          expectedGoalRevision: 1,
          outcome: 'continue',
          tasks: [{ objective: 'Prepare notes' }, { objective: 'Publish' }],
        }, { concludeTurn } as never)
      })
      const whenIdle = vi.spyOn(owned.handle.agent, 'whenIdle').mockImplementation(async () => {
        await pending
      })
      const flushSession = vi.fn(async () => undefined)

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'create',
      }, {
        inspectSession: vi.fn(async () => ({ exists: false })),
        createAgent: vi.fn(async input => {
          await installPlannerSetup(input.setup, definition => { tool = definition })
          return owned.handle
        }),
        resumeAgent: vi.fn(async () => { throw new Error('unexpected resume') }),
        flushSession,
        readSettledTaskResult: vi.fn(async () => undefined),
      })).resolves.toBe('submitted')

      expect(concludeTurn).toHaveBeenCalledTimes(1)
      expect(whenIdle).toHaveBeenCalledTimes(1)
      expect(flushSession).toHaveBeenCalledTimes(1)
      expect(readLongGoal(stateRoot, record.id)).toMatchObject({
        revision: 2,
        planner: { phase: 'ready', planRevision: 1, consideredSettledTasks: 0 },
        tasks: [{ objective: 'Prepare notes' }, { objective: 'Publish' }],
      })
      const prompt = owned.followup.mock.calls[0]![0]
      expect(JSON.stringify(prompt)).toContain('Ship release')
      expect(JSON.stringify(prompt)).toContain('Expected Goal revision: 1')
      expect(JSON.stringify(prompt)).toContain('submit_long_goal_plan')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('runs a v3 Planner turn through the same typed plan submission path without dropping control', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createContinuousLongGoal({
        stateRoot, objective: 'Ship continuous release', context: 'Keep history', successCriteria: 'Published',
        workspaceRoot: fixture, agentPreset: 'planner-preset', controlSessionId: 'control-session',
      })
      let tool: ToolDefinition | undefined
      let pending = Promise.resolve<unknown>(undefined)
      const owned = plannerHandle(record, () => {
        pending = tool!.execute({
          expectedGoalRevision: 1,
          outcome: 'continue',
          tasks: [{ objective: 'Prepare notes' }],
        }, { concludeTurn: vi.fn() } as never)
      })
      vi.spyOn(owned.handle.agent, 'whenIdle').mockImplementation(async () => { await pending })

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'create',
      }, {
        inspectSession: vi.fn(async () => ({ exists: false })),
        createAgent: vi.fn(async input => {
          await installPlannerSetup(input.setup, definition => { tool = definition })
          return owned.handle
        }),
        resumeAgent: vi.fn(async () => { throw new Error('unexpected resume') }),
        flushSession: vi.fn(async () => undefined),
        readSettledTaskResult: vi.fn(async () => undefined),
      })).resolves.toBe('submitted')

      expect(readLongGoal(stateRoot, record.id)).toMatchObject({
        schemaVersion: 'tianwen.long-goal.v3', revision: 2,
        control: { sessionId: 'control-session', autoProgress: 'running' },
        planner: { phase: 'ready', planRevision: 1, consideredSettledTasks: 0 },
        tasks: [{ objective: 'Prepare notes' }],
      })
      expect(JSON.stringify(owned.followup.mock.calls[0]![0])).toContain('Newly settled Task results')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects extra tool keys without writing a plan', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      let tool: ToolDefinition | undefined
      let pending = Promise.resolve<unknown>(undefined)
      const owned = plannerHandle(record, () => {
        pending = tool!.execute({
          expectedGoalRevision: 1, outcome: 'continue',
          tasks: [{ objective: 'Prepare notes' }], ignored: true,
        }, { concludeTurn: vi.fn() } as never)
      })
      vi.spyOn(owned.handle.agent, 'whenIdle').mockImplementation(async () => { await pending })

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'create',
      }, {
        inspectSession: vi.fn(async () => ({ exists: false })),
        createAgent: vi.fn(async input => {
          await installPlannerSetup(input.setup, definition => { tool = definition })
          return owned.handle
        }),
        resumeAgent: vi.fn(async () => { throw new Error('unexpected resume') }),
        flushSession: vi.fn(async () => undefined),
        readSettledTaskResult: vi.fn(async () => undefined),
      })).rejects.toThrow('exact')
      expect(readLongGoal(stateRoot, record.id)).toEqual(record)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects a persisted planner header mismatch before any Turn', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      const resumeAgent = vi.fn()

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'continue',
      }, {
        inspectSession: vi.fn(async () => ({
          exists: true, cwd: 'D:/different-workspace', agentPreset: 'planner-preset',
        })),
        createAgent: vi.fn(),
        resumeAgent,
        flushSession: vi.fn(),
        readSettledTaskResult: vi.fn(async () => undefined),
      })).rejects.toThrow('mismatch')
      expect(resumeAgent).not.toHaveBeenCalled()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('propagates an ambiguous create error without changing the frozen Session id', async () => {
    const fixture = createFixtureRoot()
    try {
      const stateRoot = join(fixture, 'state')
      const record = createGoalFirstLongGoal({
        stateRoot, objective: 'Ship release', context: null, successCriteria: null,
        workspaceRoot: fixture, agentPreset: 'planner-preset',
      })
      const createAgent = vi.fn(async () => { throw new Error('ambiguous-create') })
      const inspectSession = vi.fn(async () => ({ exists: false }))

      await expect(runLongGoalPlannerTurn({
        stateRoot,
        dshStatusTarget: { sessionsRoot: join(fixture, 'sessions'), evolutionRoot: join(stateRoot, 'evolution') },
        record,
        reason: 'create',
      }, {
        inspectSession,
        createAgent,
        resumeAgent: vi.fn(),
        flushSession: vi.fn(),
        readSettledTaskResult: vi.fn(async () => undefined),
      })).rejects.toThrow('ambiguous-create')
      expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: record.planner.sessionId,
      }))
      expect(inspectSession).toHaveBeenCalledWith(record.planner.sessionId)
      expect(readLongGoal(stateRoot, record.id).planner.sessionId).toBe(record.planner.sessionId)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
