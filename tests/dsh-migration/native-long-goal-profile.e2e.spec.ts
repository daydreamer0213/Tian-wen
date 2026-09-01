import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import GoalService from '@deepseek-ai/dsh-goal'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime, { SubagentError, type SubagentProvider } from '@deepseek-ai/dsh-subagent'
import { sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import {
  Context,
  defineTool,
  goalRoundDriver,
  mountAgentLoopTestDependencies,
  SessionId,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import { apply as applyCore } from '../../packages/tianwen-runtime/src/index.js'
import {
  appendTianwenAttemptSettled,
  appendTianwenAttemptStarted,
  appendTianwenTerminalDeliveryBoundary,
  bindGoalFirstLongGoalTask,
  commitLongGoalPlan,
  createContinuousLongGoal,
  listLongGoals,
  readLongGoal,
  readLongGoalStatus,
  readTianwenTaskAttemptProjection,
} from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type {
  LongGoalRecordV3,
  LongGoalStatusProjectionV3,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import {
  deliverContinuousGoalSettlement,
  mountTianwenLongGoalHost,
} from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'

const FIXTURE_BASE = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
  'native-long-goal-profile',
)

type ProjectionDefinition = {
  readonly key: string
  init(): unknown
  apply(state: unknown, event: unknown): unknown
  readonly wire: { view(state: unknown): unknown }
}

function projectionRegistry() {
  const definitions: ProjectionDefinition[] = []
  const valuesFor = (events: readonly unknown[]) => Object.fromEntries(definitions.map(definition => {
    let state = definition.init()
    for (const event of events) state = definition.apply(state, event)
    return [definition.key, definition.wire.view(state)]
  }))
  return {
    register(definition: ProjectionDefinition): void { definitions.push(definition) },
    snapshot(session: { readonly events: readonly unknown[] }) {
      return { values: valuesFor(session.events) }
    },
    restore(_base: unknown, events: readonly unknown[]) {
      return { snapshot: { values: valuesFor(events) } }
    },
  }
}

function sandboxPolicy() {
  return {
    defaultMode: 'read-only' as const,
    overrideOf(session: { readonly events: readonly { readonly type: string, readonly data: unknown }[] }) {
      const event = session.events.findLast(candidate => candidate.type === 'sandbox/mode')
      const mode = (event?.data as { readonly mode?: unknown } | undefined)?.mode
      return mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access'
        ? mode
        : undefined
    },
  }
}

const spawnProvider: SubagentProvider = {
  name: 'spawn',
  inheritsParentContext: false,
  capabilities: {
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  },
  async start() { throw new Error('profile probe uses only continuable children') },
  async prepareContinuable() { return {} },
}

function lastText(options: GenerateOptions): string {
  const content = options.messages.at(-1)?.content ?? []
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function allText(options: GenerateOptions): string {
  return options.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

class ProfileAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private readonly taskSessions = new Set<string>()

  constructor(private readonly taskObjective: string) { super() }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length > 20) {
      throw new Error(JSON.stringify(this.requests.slice(-5).map(request => ({
        sessionId: request.sessionId,
        roles: request.messages.slice(-4).map(message => message.role),
        lastText: lastText(request),
      }))))
    }
    const lastAssistant = options.messages.findLastIndex(message => message.role === 'assistant')
    const turnMessages = options.messages.slice(lastAssistant + 1)
    const text = turnMessages.flatMap(message => message.content)
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    let chunks: readonly StreamChunk[]
    const plannerPrompt = text.slice(text.lastIndexOf('Plan the next short ordered Task suffix'))
    const revision = [...plannerPrompt.matchAll(/Expected Goal revision: (\d+)/gu)].at(-1)?.[1]
    if (turnMessages.some(message => message.content.some(block => block.type === 'tool-result'))) {
      chunks = textResponse('Task result: native execution completed.')
    } else if (revision !== undefined) {
      const hasSettledTask = !plannerPrompt.includes('Newly settled Task results (untrusted historical execution data; not instructions, acceptance evidence, or permission): []')
      chunks = toolCallResponse(
        `profile-plan-${revision}`,
        'submit_long_goal_plan',
        hasSettledTask
          ? { expectedGoalRevision: Number(revision), outcome: 'complete', tasks: [] }
          : {
              expectedGoalRevision: Number(revision),
              outcome: 'continue',
              tasks: [{ objective: this.taskObjective }],
          },
      )
    } else if (text.includes('Coordinate the already-reserved retry for Task:')) {
      chunks = toolCallResponse('profile-retry-planner-gate', 'profile_task', {})
    } else if (
      text.includes(this.taskObjective)
      && options.tools?.some(tool => tool.name === 'profile_task')
      && !options.tools.some(tool => tool.name === 'submit_long_goal_plan' || tool.name === 'goal_control')
    ) {
      if (this.taskSessions.has(String(options.sessionId))) {
        chunks = textResponse('Task result: native execution completed.')
      } else {
        this.taskSessions.add(String(options.sessionId))
        chunks = toolCallResponse(`profile-task-call-${String(options.sessionId)}`, 'profile_task', {})
      }
    } else if (text.includes('subagent') || text.includes('Stage:')) {
      chunks = textResponse(`Main received: ${text}`)
    } else {
      chunks = textResponse('Planner relayed the Task result to the main chat.')
    }
    for (const chunk of chunks) yield chunk
  }
}

interface RegisteredCommand {
  readonly name: string
  readonly handler: (input: {
    readonly agent: unknown
    readonly rawInput: string
    readonly attachments: readonly unknown[]
    readonly signal: AbortSignal
    readonly commandId: string
  }) => Promise<{ readonly kind: string, readonly text: string }>
}

async function mountProfile(
  taskObjective = 'Produce one verified native result.',
  options: { readonly permissionLimited?: boolean } = {},
) {
  mkdirSync(FIXTURE_BASE, { recursive: true })
  const root = mkdtempSync(join(FIXTURE_BASE, 'profile-'))
  const sessionsRoot = join(root, 'sessions')
  const stateRoot = join(root, 'state')
  const evolutionRoot = join(root, 'evolution')
  const workspaceRoot = join(root, 'workspace')
  mkdirSync(workspaceRoot, { recursive: true })
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href
  const commands = new Map<string, RegisteredCommand>()
  const headers = new Map<string, { sessionId: string, cwd?: string, agentPreset?: string }>()
  ctx.provide('sessionProjections', projectionRegistry())
  ctx.provide('sandboxPolicy', sandboxPolicy())
  ctx.provide('approval', {})
  ctx.provide('commands', {
    register(definition: RegisteredCommand) {
      commands.set(definition.name, definition)
      return () => { commands.delete(definition.name) }
    },
  })
  ctx.provide('connection', { rpc: { handle: () => undefined } })
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'tianwen-profile', model: 'scripted' }),
  })
  const composedPreset = (agentCtx: { readonly agent?: { readonly session: {
    readonly header: { readonly agentPreset?: string }
  } } }) => agentCtx.agent?.session.header.agentPreset
  ctx.provide('agentPresets', {
    roots: [],
    mount: async () => undefined,
    composedPreset,
    composeFrom: (childCtx: Context, parentCtx: Parameters<typeof composedPreset>[0]) => {
      Object.defineProperty(childCtx, 'goals', {
        configurable: true,
        value: ctx.goals,
      })
      return composedPreset(parentCtx)
    },
  })
  const apiProxy = {
    sessions: {
      async list() {
        return { result: { ok: true as const, value: { items: [...headers.values()] } } }
      },
      async create() { throw new Error('native profile must not create an ordinary child Session') },
    },
    goals: {
      async resume() { throw new Error('fresh native profile must not resume through Web RPC') },
    },
  }
  ctx.provide('apiProxy', apiProxy)

  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: 'none' })
  await ctx.plugin(GoalService)
  await ctx.plugin(goalRoundDriver)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  ctx.subagents.registerProvider(spawnProvider)
  const adapter = new ProfileAdapter(taskObjective)
  ctx.llm.registerAdapter(['tianwen-profile'], adapter)
  await applyCore(ctx, { evolutionRoot })
  mountTianwenLongGoalHost(ctx, { stateRoot, sessionsRoot, evolutionRoot })

  const offAgent = ctx.on('agent/created', ({ agent }) => {
    headers.set(String(agent.session.id), {
      sessionId: String(agent.session.id),
      ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }),
      ...(agent.session.header.agentPreset === undefined
        ? {}
        : { agentPreset: agent.session.header.agentPreset }),
    })
  })
  let releaseTask!: () => void
  const taskGate = new Promise<void>(resolveGate => { releaseTask = resolveGate })
  const taskRunSessions: string[] = []
  const mainSessionId = SessionId('native-profile-main')
  const disposeTask = ctx.tools.register(defineTool({
    name: 'profile_task',
    description: 'Complete the profile Task once the test observes its native Goal.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      if (String(exec.agent.session.header.parentSession) === String(mainSessionId)) {
        await taskGate
        return 'Planner kept the renewed Task attached.'
      }
      const delegatedMode = sandboxPolicy().overrideOf(exec.agent.session)
      if (options.permissionLimited && delegatedMode !== 'danger-full-access') {
        throw new SubagentError(
          sandboxDenialMarker('danger-full-access'),
          'SANDBOX_UNAVAILABLE',
        )
      }
      taskRunSessions.push(String(exec.agent.session.id))
      await taskGate
      return 'profile Task completed'
    },
  }))
  const main = (await ctx.agents.create({
    sessionId: mainSessionId,
    meta: { cwd: workspaceRoot, agentPreset: 'standard' },
    agentOptions: { provider: 'tianwen-profile', model: 'scripted' },
  })).agent
  main.session.append('sandbox/mode', { mode: 'workspace-write', source: 'user' })

  return {
    ctx,
    main,
    adapter,
    stateRoot,
    sessionsRoot,
    evolutionRoot,
    workspaceRoot,
    taskRuns: () => taskRunSessions.length,
    taskRunSessions: () => [...taskRunSessions],
    releaseTask,
    async startGoal() {
      const command = commands.get('goal')
      if (command === undefined) throw new Error('main Session has no /goal command')
      return command.handler({
        commandId: 'profile-command-1',
        agent: main,
        rawInput: ` ${taskObjective}`,
        attachments: [],
        signal: AbortSignal.timeout(30_000),
      })
    },
    async dispose() {
      releaseTask()
      disposeTask()
      offAgent()
      await ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

async function expectNativeChild(
  ctx: Context,
  parentId: string,
  childId: string,
  mode: 'workspace-write' | 'danger-full-access',
) {
  const entries = await ctx.subagents.listChildren(
    SessionId(parentId),
    AbortSignal.timeout(10_000),
  )
  expect(entries).toContainEqual(expect.objectContaining({
    kind: 'child', id: SessionId(childId), mode: 'continuable',
  }))
  expect(entries).not.toContainEqual(expect.objectContaining({
    kind: 'diagnostic', reason: 'corrupt',
  }))
  const child = await ctx.sessionPersistence.inspect(SessionId(childId))
  expect(String(child.meta.parentSession)).toBe(parentId)
  expect(child.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'subagent/descriptor',
      data: expect.objectContaining({ mode: 'continuable', provider: 'spawn' }),
    }),
    expect.objectContaining({
      type: 'sandbox/mode',
      data: { mode, source: 'delegation' },
    }),
    expect.objectContaining({
      type: 'approval/policy',
      data: { policy: 'never', source: 'delegation' },
    }),
  ]))
}

describe('native Long Goal profile execution', () => {
  it('keeps Planner and Task work behind one normal main Session with public native lineage', async () => {
    const profile = await mountProfile()
    try {
      await expect(profile.startGoal()).resolves.toMatchObject({ kind: 'success', text: 'started' })
      await vi.waitFor(async () => {
        const record = listLongGoals(profile.stateRoot)[0]
        expect(record?.schemaVersion).toBe('tianwen.long-goal.v3')
        if (record?.schemaVersion !== 'tianwen.long-goal.v3') return
        if (record.tasks[0]?.execution == null) {
          const entries = await profile.ctx.subagents.listChildren(
            profile.main.session.id,
            AbortSignal.timeout(10_000),
          )
          throw new Error(JSON.stringify({
            record,
            live: profile.ctx.agents.list().map(agent => ({
              id: agent.session.id,
              header: agent.session.header,
            })),
            entries,
            logs: profile.ctx.logger.buffer.map(message => ({
              name: message.name,
              type: message.type,
              args: message.args.map(value => value instanceof Error
                ? { name: value.name, message: value.message, stack: value.stack }
                : value),
            })),
            requests: profile.adapter.requests.map(request => ({
              sessionId: request.sessionId,
              lastText: lastText(request),
              tools: request.tools?.map(tool => tool.name),
            })),
          }))
        }
        expect(record.tasks[0]?.execution).not.toBeNull()
      })
      const running = listLongGoals(profile.stateRoot)[0]!
      if (running.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('expected v3 Long Goal')
      const taskId = running.tasks[0]!.execution!.sessionId
      const task = profile.ctx.agents.get(SessionId(taskId))
      if (task === undefined) throw new Error('expected live native Task')
      const taskGoal = profile.ctx.goals.get(task)
      if (taskGoal === undefined) throw new Error('expected Task Goal')
      profile.ctx.goals.complete(task, taskGoal)
      profile.releaseTask()

      await vi.waitFor(async () => {
        const status = await readLongGoalStatus({
          stateRoot: profile.stateRoot,
          longGoalId: running.id,
          dshStatusTarget: {
            sessionsRoot: profile.sessionsRoot,
            evolutionRoot: profile.evolutionRoot,
          },
        })
        expect(status.schemaVersion).toBe('tianwen.long-goal-status.v3')
        if (status.goal.phase !== 'complete') {
          throw new Error(JSON.stringify({
            status,
            requests: profile.adapter.requests.map(request => ({
              sessionId: request.sessionId,
              lastText: lastText(request),
              tools: request.tools?.map(tool => tool.name),
            })),
            logs: profile.ctx.logger.buffer.map(message => ({
              name: message.name,
              type: message.type,
              args: message.args.map(String),
            })),
          }))
        }
      }, { timeout: 20_000 })
      await profile.main.whenIdle()

      await expectNativeChild(
        profile.ctx, String(profile.main.session.id), running.planner.sessionId, 'workspace-write',
      )
      await expectNativeChild(
        profile.ctx, running.planner.sessionId, taskId, 'workspace-write',
      )
      expect(profile.taskRunSessions()).toEqual([taskId])
      const plannerSettlements = profile.main.session.events.filter(event => (
        event.type === 'user/message'
        && event.data.source.kind === 'subagent-settled'
        && String(event.data.source.senderSessionId) === running.planner.sessionId
      ))
      expect(plannerSettlements.length).toBeGreaterThanOrEqual(2)
      expect(profile.main.session.events.some(event => event.type === 'assistant/message'
        && event.data.message.content.some(block => block.type === 'text'
          && (block.text.includes('Task result') || block.text.includes('Main received'))))).toBe(true)
    } finally {
      await profile.dispose()
    }
  }, 30_000)

  it('renews only after the user changes the main Session to Full access', async () => {
    const profile = await mountProfile(
      'Complete one Task that requires Full access.',
      { permissionLimited: true },
    )
    try {
      await expect(profile.startGoal()).resolves.toMatchObject({ kind: 'success', text: 'started' })
      await vi.waitFor(() => {
        const record = listLongGoals(profile.stateRoot)[0]
        expect(record?.schemaVersion).toBe('tianwen.long-goal.v3')
        if (record?.schemaVersion !== 'tianwen.long-goal.v3') return
        const task = record.tasks[0]
        expect(task?.execution).toBeNull()
        expect(readTianwenTaskAttemptProjection(record, task!.id).attempts.at(-1)?.status)
          .toBe('permission-limited')
      }, { timeout: 20_000 })
      const limited = listLongGoals(profile.stateRoot)[0] as LongGoalRecordV3
      const taskId = limited.tasks[0]!.id
      const limitedProjection = readTianwenTaskAttemptProjection(limited, taskId)
      const limitedAttempt = structuredClone(limitedProjection.attempts[0])
      if (limitedAttempt === undefined) throw new Error('expected limited attempt')
      expect(limitedAttempt).toMatchObject({
        epoch: 1,
        permissionMode: 'workspace-write',
        status: 'permission-limited',
      })
      await expectNativeChild(
        profile.ctx,
        String(profile.main.session.id),
        limitedAttempt.parentSessionId,
        'workspace-write',
      )
      await expectNativeChild(
        profile.ctx,
        limitedAttempt.parentSessionId,
        limitedAttempt.childSessionId,
        'workspace-write',
      )
      expect(profile.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
      expect(profile.main.session.events.some(event => event.type === 'user/message'
        && event.data.content.some(block => block.type === 'text'
          && block.text.includes('Change this main Session to Full access')))).toBe(true)

      profile.main.session.append('sandbox/mode', {
        mode: 'danger-full-access', source: 'user',
      })
      await vi.waitFor(() => {
        const record = listLongGoals(profile.stateRoot)[0]
        expect(record?.schemaVersion).toBe('tianwen.long-goal.v3')
        if (record?.schemaVersion !== 'tianwen.long-goal.v3') return
        const projection = readTianwenTaskAttemptProjection(record, taskId)
        expect(projection.attempts).toHaveLength(2)
        expect(projection.attempts[1]).toMatchObject({
          epoch: 2,
          permissionMode: 'danger-full-access',
          status: 'running',
        })
        expect(record.tasks[0]?.execution).not.toBeNull()
      }, { timeout: 20_000 })
      const renewed = listLongGoals(profile.stateRoot)[0] as LongGoalRecordV3
      const renewedProjection = readTianwenTaskAttemptProjection(renewed, taskId)
      const renewedAttempt = renewedProjection.attempts[1]!
      expect(renewedProjection.attempts[0]).toEqual(limitedAttempt)
      expect(renewedAttempt.childSessionId).not.toBe(limitedAttempt?.childSessionId)
      expect(renewedAttempt.parentSessionId).not.toBe(limitedAttempt?.parentSessionId)
      const renewedTaskId = renewed.tasks[0]!.execution!.sessionId
      const renewedTask = profile.ctx.agents.get(SessionId(renewedTaskId))
      if (renewedTask === undefined) throw new Error('expected renewed native Task')
      const renewedGoal = profile.ctx.goals.get(renewedTask)
      if (renewedGoal === undefined) throw new Error('expected renewed Task Goal')
      await expectNativeChild(
        profile.ctx,
        String(profile.main.session.id),
        renewedAttempt.parentSessionId,
        'danger-full-access',
      )
      await expectNativeChild(
        profile.ctx,
        renewedAttempt.parentSessionId,
        renewedTaskId,
        'danger-full-access',
      )

      profile.ctx.goals.complete(renewedTask, renewedGoal)
      profile.releaseTask()
      await vi.waitFor(async () => {
        const status = await readLongGoalStatus({
          stateRoot: profile.stateRoot,
          longGoalId: renewed.id,
          dshStatusTarget: {
            sessionsRoot: profile.sessionsRoot,
            evolutionRoot: profile.evolutionRoot,
          },
        })
        expect(status.goal.phase).toBe('complete')
      }, { timeout: 20_000 })

      const complete = readLongGoal(profile.stateRoot, renewed.id) as LongGoalRecordV3
      expect(readTianwenTaskAttemptProjection(complete, taskId).attempts).toMatchObject([
        { epoch: 1, status: 'permission-limited', permissionMode: 'workspace-write' },
        { epoch: 2, status: 'settled', permissionMode: 'danger-full-access' },
      ])
      expect(profile.taskRunSessions()).toEqual([renewedTaskId])
      expect(profile.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
    } finally {
      await profile.dispose()
    }
  }, 40_000)

  it('settles once in the recovered main Session without rerunning an offline Task', async () => {
    const profile = await mountProfile('Offline recovery must not rerun work.')
    const taskId = SessionId('offline-recovery-task')
    const taskGoalId = 'offline-recovery-goal'
    const taskHandle = await profile.ctx.agents.create({
      sessionId: taskId,
      meta: {
        cwd: profile.workspaceRoot,
        agentPreset: 'standard',
        parentSession: SessionId('offline-recovery-planner'),
      },
      agentOptions: { provider: 'tianwen-profile', model: 'scripted' },
    })
    try {
      const terminalEvent = taskHandle.agent.session.append('goal/change', {
        operation: 'complete',
        ref: { id: taskGoalId, revision: 3 },
        goal: {
          id: taskGoalId,
          revision: 3,
          objective: 'Already completed offline',
          maxGoalRounds: 1,
          phase: 'complete',
          roundsStarted: 1,
          activation: 'disarmed',
        },
      } as never)
      await profile.ctx.sessions.flush(taskHandle.agent.session)
      await profile.ctx.sessions.flush(profile.main.session)
      await taskHandle.dispose()

      const created = createContinuousLongGoal({
        stateRoot: profile.stateRoot,
        objective: 'Recover one already completed Task.',
        context: null,
        successCriteria: null,
        workspaceRoot: profile.workspaceRoot,
        agentPreset: 'standard',
        controlSessionId: String(profile.main.session.id),
      }, {
        goalSuffix: () => 'offline-recovery-profile',
        plannerSessionId: () => 'offline-recovery-planner',
        now: () => 1,
      })
      const taskUuid = '00000000-0000-4000-8000-000000000777'
      const planned = commitLongGoalPlan({
        stateRoot: profile.stateRoot,
        longGoalId: created.id,
        expectedRevision: created.revision,
        outcome: 'continue',
        tasks: [{ objective: 'Already completed offline' }],
        consideredSettledTasks: 0,
      }, { taskId: () => taskUuid, now: () => 2 }) as LongGoalRecordV3
      const started = appendTianwenAttemptStarted({
        stateRoot: profile.stateRoot,
        longGoalId: planned.id,
        expectedRevision: planned.revision,
        taskId: taskUuid,
        epoch: 1,
        parentSessionId: 'offline-recovery-planner',
        childSessionId: String(taskId),
        permissionFingerprint: `sha256:${'7'.repeat(64)}`,
        permissionMode: 'workspace-write',
        startedAt: '2026-09-01T00:00:00.000Z',
      })
      const bound = bindGoalFirstLongGoalTask({
        stateRoot: profile.stateRoot,
        longGoalId: started.id,
        expectedRevision: started.revision,
        taskId: taskUuid,
        execution: { sessionId: String(taskId), goalId: taskGoalId },
      }) as LongGoalRecordV3
      const terminalEventId = `goal-change:${String(taskId)}:${terminalEvent.seq}:complete`
      const bounded = appendTianwenTerminalDeliveryBoundary({
        stateRoot: profile.stateRoot,
        longGoalId: bound.id,
        expectedRevision: bound.revision,
        taskId: taskUuid,
        epoch: 1,
        terminalEventId,
        parentSessionId: 'offline-recovery-planner',
        mainInboxBoundarySeq: profile.main.session.events.at(-1)?.seq ?? 0,
      })
      const settled = appendTianwenAttemptSettled({
        stateRoot: profile.stateRoot,
        longGoalId: bounded.id,
        expectedRevision: bounded.revision,
        taskId: taskUuid,
        epoch: 1,
        terminalEventId,
      }) as LongGoalRecordV3
      const status: LongGoalStatusProjectionV3 = {
        schemaVersion: 'tianwen.long-goal-status.v3',
        goal: {
          id: settled.id,
          objective: settled.objective,
          context: null,
          successCriteria: null,
          phase: 'complete',
          revision: settled.revision,
          completedTasks: 1,
          abandonedTasks: 0,
          totalTasks: 1,
        },
        planner: {
          sessionId: settled.planner.sessionId,
          phase: settled.planner.phase,
          planRevision: settled.planner.planRevision,
        },
        guidance: [],
        tasks: [{
          id: taskUuid,
          objective: 'Already completed offline',
          phase: 'complete',
          execution: { sessionId: String(taskId), goalId: taskGoalId },
          resolution: null,
        }],
        currentTaskId: null,
        runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
        control: settled.control,
      }
      const inspectSession = (sessionId: string) => (
        profile.ctx.sessionPersistence.inspect(SessionId(sessionId))
      )
      const intent = { longGoalId: settled.id, transition: 'complete' as const, status }
      const taskRunsBeforeRecovery = profile.taskRuns()

      await expect(deliverContinuousGoalSettlement(intent, {
        stateRoot: profile.stateRoot,
        getAgent: () => undefined,
        readStatus: async () => status,
        inspectSession,
        flushSession: async agent => profile.ctx.sessions.flush(agent.session),
      })).resolves.toBe(false)
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(profile.stateRoot, settled.id) as LongGoalRecordV3,
        taskUuid,
      ).terminalDelivery).toBeUndefined()

      const mainRequestsBeforeRecovery = profile.adapter.requests.filter(
        request => String(request.sessionId) === String(profile.main.session.id),
      ).length
      const recoveredDependencies = {
        stateRoot: profile.stateRoot,
        getAgent: (sessionId: string) => sessionId === String(profile.main.session.id)
          ? profile.main
          : undefined,
        readStatus: async () => status,
        inspectSession,
        flushSession: async (agent: typeof profile.main) => profile.ctx.sessions.flush(agent.session),
      }
      await expect(deliverContinuousGoalSettlement(intent, recoveredDependencies)).resolves.toBe(true)
      await expect(deliverContinuousGoalSettlement(intent, recoveredDependencies)).resolves.toBe(true)

      expect(profile.taskRuns()).toBe(taskRunsBeforeRecovery)
      expect(profile.adapter.requests.filter(
        request => String(request.sessionId) === String(profile.main.session.id),
      )).toHaveLength(mainRequestsBeforeRecovery + 1)
      expect(readTianwenTaskAttemptProjection(
        readLongGoal(profile.stateRoot, settled.id) as LongGoalRecordV3,
        taskUuid,
      ).terminalDelivery).toEqual({
        terminalEventId,
        parentSessionId: 'offline-recovery-planner',
        completionTurnObserved: true,
      })
    } finally {
      await taskHandle.dispose()
      await profile.dispose()
    }
  }, 30_000)
})
