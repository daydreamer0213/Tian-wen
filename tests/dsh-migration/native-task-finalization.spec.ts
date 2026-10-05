import { describe, expect, it, vi } from 'vitest'
import { finalizeNativeLongGoalTask, recoverNativeLongGoalPlannerParent } from '../../packages/tianwen-runtime-bundle/src/long-goal-host.js'
import { permissionSnapshot } from '../../packages/tianwen-runtime-bundle/src/permission-attempt.js'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import GoalService from '@deepseek-ai/dsh-goal'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { Context, SessionId, mountAgentLoopTestDependencies, textResponse, toolCallResponse, toolGoal } from '@tianwen/dsh-compat'
import { NativeLongGoalChild } from '../../packages/tianwen-runtime-bundle/src/native-long-goal-child.js'
import { mountContinuousGoalHost } from '../../packages/tianwen-runtime-bundle/src/continuous-goal-host.js'

function fixture() {
  const snapshot = permissionSnapshot([], 'read-only')
  const attempt = { epoch: 1, parentSessionId: 'planner', childSessionId: 'child', status: 'running', permissionMode: snapshot.mode, permissionFingerprint: snapshot.fingerprint }
  let record: any = {
    schemaVersion: 'tianwen.long-goal.v3', id: 'long', revision: 1, maxTaskRounds: 3,
    workspaceRoot: 'D:/workspace', control: { sessionId: 'main', autoProgress: 'running' },
    planner: { sessionId: 'planner', phase: 'ready', agentPreset: 'standard' },
    tasks: [{ id: 'task', objective: 'Deliver', execution: { sessionId: 'child', goalId: 'goal' }, resolution: null }],
    tianwenEvents: [{ type: 'attempt-started', taskId: 'task', attempt }],
  }
  // Supply the same durable projection used by production through real event shape.
  let events: any[] = [
    { seq: 0, type: 'goal/change', data: { operation: 'create', goal: { id: 'goal' } } },
    { seq: 1, type: 'turn/start', data: { turn: 1 } },
    { seq: 2, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  const parent: any = { session: { id: 'planner', header: { parentSession: 'main', cwd: 'D:/workspace', agentPreset: 'standard' } } }
  const main: any = { session: { id: 'main', events: [], header: {} } }
  const goal: any = { id: 'goal', revision: 1, phase: 'active' }
  const deps: any = {
    readRecord: () => record,
    readStatus: async () => ({ goal: { phase: 'active' }, currentTaskId: 'task', tasks: [{ ...record.tasks[0], phase: 'active' }] }),
    inspectSession: async () => ({ meta: { id: 'child', parentSession: 'planner' }, events }),
    attachedAgent: (id: string) => id === 'planner' ? parent : id === 'main' ? main : undefined,
    getGoal: () => goal,
    readGoalRef: async () => goal,
    readPermissionSnapshot: () => snapshot,
    reconcilePermissionAttempt: vi.fn(async () => undefined),
    recoverParent: vi.fn(async () => ({ parent, release: vi.fn() })),
    followupTask: vi.fn(async (_parent, _child, prompt) => {
      events.push({ seq: events.at(-1).seq + 1, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [{ id: `accepted-${events.length}`, source: { kind: 'coordinator', senderSessionId: 'planner' }, content: prompt }] } })
      return 'accepted'
    }),
    stopTask: vi.fn(async () => undefined),
  }
  return { deps, attempt, goal, parent, main, events: () => events, replaceEvents(next: any[]) { events = next }, record: () => record, setRecord(next: any) { record = next } }
}

const input = { longGoalId: 'long', sessionId: 'child', taskId: 'task', goalId: 'goal', epoch: 1, completedTurnSeq: 2, signal: new AbortController().signal }

describe('same native Task finalization', () => {
  it.each([false, true])('uses public continuable cold followup through the host (sustained omission=%s)', async sustained => {
    const base = resolve('D:/DevData/tianwen-native-task-finalization-20261005/source-sdk-tests')
    mkdirSync(base, { recursive: true })
    const root = mkdtempSync(resolve(base, 'run-'))
    const ctx = new Context()
    const f = fixture()
    f.record().workspaceRoot = root
    const errors: unknown[] = []
    let coldRestorations = 0
    let unmount: (() => Promise<void>) | undefined
    ctx.provide('sessionProjections', { register() {}, snapshot() { return { values: {} } }, restore() { return { snapshot: { values: {} } } } })
    ctx.provide('sandboxPolicy', { overrideOf() { return 'read-only' } })
    ctx.provide('approval', {})
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(GoalService)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(toolGoal)
    class Adapter extends LlmAdapter {
      async *stream(options: any) {
        const messages = options.messages
        const closure = messages.some((message: any) => message.content.some((block: any) => block.type === 'text' && block.text.startsWith('tianwen.native-task-finalization.v1:')))
        const last = messages.at(-1)
        let chunks = textResponse('Original delivery unchanged.')
        if (String(options.sessionId) === 'child' && closure && !sustained) {
          if (last?.source.kind === 'tool' && last.source.callId === 'read-existing-goal') {
            const output = last.content.find((block: any) => block.type === 'tool-result')
            const view = JSON.parse(output.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join(''))
            chunks = toolCallResponse('finish-existing-goal', 'complete_long_goal_task', { goal_id: view.goal.id, revision: view.goal.revision })
          } else if (!(last?.source.kind === 'tool' && last.source.callId === 'finish-existing-goal')) {
            chunks = toolCallResponse('read-existing-goal', 'get_goal', {})
          }
        }
        for (const chunk of chunks) yield chunk
      }
    }
    ctx.llm.registerAdapter(['finalization-script'], new Adapter())
    ctx.subagents.registerProvider({ name: 'finalization-test', inheritsParentContext: false, capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false }, async start() { throw new Error('continuable only') }, async prepareContinuable() { return {} } })
    const child = new NativeLongGoalChild(ctx)
    const offSetup = ctx.subagents.registerContinuableSetup(childCtx => childCtx.on('agent/created', ({ agent }) => {
      if (String(agent.session.id) === 'child') {
        const goal = ctx.goals.get(agent) ?? ctx.goals.create(agent, { objective: 'Deliver', maxGoalRounds: 3 })
        f.goal.id = String(goal.id)
        f.record().tasks[0].execution.goalId = String(goal.id)
      }
    }))
    try {
      const main = (await ctx.agents.create({ sessionId: SessionId('main'), meta: { cwd: root, agentPreset: 'standard' }, agentOptions: { provider: 'finalization-script', model: 'scripted' } })).agent
      const parent = (await ctx.agents.create({ sessionId: SessionId('planner'), meta: { cwd: root, agentPreset: 'standard', parentSession: main.session.id }, agentOptions: { provider: 'finalization-script', model: 'scripted' } })).agent
      f.deps.attachedAgent = (id: string) => ctx.agents.get(SessionId(id))
      f.deps.inspectSession = vi.fn((id: string) => ctx.sessionPersistence.inspect(SessionId(id)))
      f.deps.readGoalRef = async () => f.goal
      f.deps.recoverParent = async () => {
        await vi.waitFor(() => expect(ctx.agents.get(SessionId('child'))).toBeUndefined())
        coldRestorations++
        return { parent, release() {} }
      }
      f.deps.followupTask = (p: any, id: string, prompt: any, signal: AbortSignal, guard: () => void) => child.followupTask(p, SessionId(id), prompt, signal, guard)
      f.deps.stopTask = vi.fn(async (_record, reason) => {
        f.record().control.autoProgress = 'paused'
        f.record().stopReason = reason
      })
      const continued = vi.fn(async () => undefined)
      const offGoal = ctx.on('goal/changed', ({ change }) => { if (String(change.ref.id) === f.goal.id && change.operation === 'complete') f.goal.phase = 'complete' })
      f.deps.readStatus = async () => ({
        schemaVersion: 'tianwen.long-goal-status.v3', goal: { id: 'long', phase: f.goal.phase === 'complete' ? 'planning' : 'active', completedTasks: f.goal.phase === 'complete' ? 1 : 0, abandonedTasks: 0 },
        currentTaskId: f.goal.phase === 'complete' ? null : 'task',
        tasks: [{ ...f.record().tasks[0], phase: f.goal.phase }],
      })
      unmount = mountContinuousGoalHost(ctx as never, {
        roots: { stateRoot: root, sessionsRoot: root, evolutionRoot: root },
        listLongGoals: () => [f.record()], readLongGoal: () => f.record(), readStatus: f.deps.readStatus,
        getGoal: agent => ctx.goals.get(agent), flushSession: agent => ctx.sessions.flush(agent.session),
        createProgress: vi.fn(), control: vi.fn(), continueProgress: continued, pause: vi.fn(),
        installCommand: () => ({ dispose() {} }), installBoundControls: () => () => undefined,
        finalizeTask: info => finalizeNativeLongGoalTask(info, f.deps), reportError: error => errors.push(error),
      })
      await ctx.subagents.startContinuable({ provider: 'finalization-test', childId: SessionId('child'), label: 'Original Task', request: { parent, prompt: [{ type: 'text', text: 'Deliver' }], agentOptions: { provider: 'finalization-script', model: 'scripted' } }, signal: AbortSignal.timeout(10_000) })
      await vi.waitFor(async () => {
        if (errors.length) throw new Error(String(errors[0]))
        const observed = sustained ? f.record().control.autoProgress : f.goal.phase
        if (observed !== (sustained ? 'paused' : 'complete')) {
          const saved = await ctx.sessionPersistence.inspect(SessionId('child'))
          throw new Error(JSON.stringify({ observed, coldRestorations, inspections: f.deps.inspectSession.mock.calls.length, meta: saved.meta, task: f.record().tasks[0], events: saved.events.map(event => ({ seq: event.seq, type: event.type, ...(event.type === 'turn/end' ? { data: event.data } : {}) })) }))
        }
      }, { timeout: 10_000 })
      await vi.waitFor(() => expect(ctx.agents.get(SessionId('child'))).toBeUndefined())
      const persisted = await ctx.sessionPersistence.inspect(SessionId('child'))
      const accepted = persisted.events.filter(event => event.type === 'agent/inbox/spliced' && event.data.inserted.some(message => message.source.kind === 'coordinator' && message.content.some(block => block.type === 'text' && block.text.startsWith('tianwen.native-task-finalization.v1:'))))
      expect(accepted).toHaveLength(sustained ? 3 : 1)
      expect(coldRestorations).toBe(sustained ? 3 : 1)
      expect(persisted.events.filter(event => event.type === 'assistant/message').map((event: any) => event.data.message.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('')).filter(Boolean)).toEqual(Array(sustained ? 4 : 2).fill('Original delivery unchanged.'))
      expect(persisted.events.filter(event => event.type === 'goal/change').map((event: any) => event.data.operation)).toEqual(sustained ? ['create'] : ['create', 'complete'])
      expect(continued).toHaveBeenCalledTimes(sustained ? 0 : 1)
      expect(errors).toEqual([])
      offGoal()
    } finally {
      offSetup()
      await unmount?.()
      await ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('recovers only the original parent/Task/Goal and persists coordinator acceptance', async () => {
    const f = fixture()
    await finalizeNativeLongGoalTask(input, f.deps)
    expect(f.deps.followupTask).toHaveBeenCalledTimes(1)
    expect(f.deps.followupTask.mock.calls[0][0]).toBe(f.parent)
    expect(f.deps.followupTask.mock.calls[0][1]).toBe('child')
    expect(f.events().at(-1).data.inserted[0].content[0].text).toContain('get_goal')
    expect(f.events().at(-1).data.inserted[0].content[0].text).toContain('unchanged')
    await finalizeNativeLongGoalTask(input, f.deps)
    expect(f.deps.followupTask).toHaveBeenCalledTimes(1)
    expect(f.deps.stopTask).not.toHaveBeenCalled()
  })

  it('requires a new admission in each public continuable Planner recovery turn', async () => {
    const base = resolve('D:/DevData/tianwen-planner-readmission-20261005/source-sdk-tests')
    mkdirSync(base, { recursive: true })
    const root = mkdtempSync(resolve(base, 'run-'))
    const ctx = new Context()
    const setups = new Map<string, (ctx: any) => void>()
    ctx.provide('sessionProjections', { register() {}, snapshot() { return { values: {} } }, restore() { return { snapshot: { values: {} } } } })
    ctx.provide('sandboxPolicy', { overrideOf() { return 'read-only' } })
    ctx.provide('approval', {})
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(GoalService)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    await ctx.plugin(SubagentRuntime)
    class Adapter extends LlmAdapter {
      async *stream(options: any) {
        const agent = ctx.agents.get(options.sessionId)
        const earlierAdmission = agent?.session.events.some(event => event.type === 'tool/call' && event.data.name === 'recover_long_goal_task')
        const work = options.messages.findLast((message: any) => message.role === 'user' && message.source.kind === 'coordinator')
        const text = work?.content.find((block: any) => block.type === 'text')?.text ?? ''
        const shouldAdmit = text.startsWith('Recover only as the existing Long Goal Planner parent')
          && (!earlierAdmission || text.includes('THIS turn'))
        for (const chunk of shouldAdmit
          ? toolCallResponse(`admit-${agent?.session.events.length}`, 'recover_long_goal_task', {})
          : textResponse('The earlier admission does not admit another turn.')) yield chunk
      }
    }
    ctx.llm.registerAdapter(['readmission-script'], new Adapter())
    ctx.subagents.registerProvider({ name: 'readmission-test', inheritsParentContext: false,
      capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
      async start() { throw new Error('continuable only') }, async prepareContinuable() { return {} } })
    const offSetup = ctx.subagents.registerContinuableSetup(childCtx => setups.get(String(childCtx.agent?.session.id))?.(childCtx))
    const child = new NativeLongGoalChild(ctx)
    const record = fixture().record()
    record.workspaceRoot = root
    // The public custom provider creates this Planner without a preset.
    record.planner.agentPreset = undefined
    try {
      const main = (await ctx.agents.create({ sessionId: SessionId('main'), meta: { cwd: root }, agentOptions: { provider: 'readmission-script', model: 'scripted' } })).agent
      await ctx.subagents.startContinuable({ provider: 'readmission-test', childId: SessionId('planner'), label: 'Original Planner',
        request: { parent: main, prompt: [{ type: 'text', text: 'Report once.' }], agentOptions: { provider: 'readmission-script', model: 'scripted' } }, signal: AbortSignal.timeout(5000) })
      for (let admission = 0; admission < 2; admission++) {
        await vi.waitFor(() => expect(ctx.agents.get(SessionId('planner'))).toBeUndefined())
        const lease = await recoverNativeLongGoalPlannerParent(record, {
          listSessions: async () => [{ sessionId: 'planner', cwd: root }],
          attachedAgent: id => ctx.agents.get(SessionId(id)),
          installNativeSetup: (id, setup) => setups.set(id, setup),
          followupNativeChild: (parent, id, prompt, signal) => child.followup(parent, SessionId(id), prompt, signal),
        }, { signal: AbortSignal.timeout(1500), assertAuthority() {} })
        lease!.release()
      }
      await vi.waitFor(() => expect(ctx.agents.get(SessionId('planner'))).toBeUndefined())
      const persisted = await ctx.sessionPersistence.inspect(SessionId('planner'))
      expect(persisted.events.filter(event => event.type === 'tool/call' && event.data.name === 'recover_long_goal_task')).toHaveLength(2)
    } finally {
      offSetup()
      await ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('durably pauses an unfinished original Task after parent recovery fails and still reports the cause', async () => {
    const f = fixture()
    const failure = new Error('Continuous Goal Planner recovery was not claimed')
    f.deps.recoverParent = vi.fn(async () => { throw failure })
    f.deps.stopTask = vi.fn(async (_record, reason) => {
      expect(reason).toMatchObject({ code: 'planner-recovery-failed' })
      expect(reason.message).toMatch(/task.*unfinished.*recovery.*not claimed/i)
      f.record().control.autoProgress = 'paused'
    })
    await expect(finalizeNativeLongGoalTask(input, f.deps)).rejects.toBe(failure)
    expect(f.deps.stopTask).toHaveBeenCalledTimes(1)
    expect(f.record().control.autoProgress).toBe('paused')
    expect(f.record().tasks[0].resolution).toBeNull()
    expect(f.goal.phase).toBe('active')
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it.each(['pause', 'cancel', 'permission', 'identity', 'latest-turn', 'terminal-goal', 'pending', 'accepted'])('does not overwrite %s after failed asynchronous parent recovery', async kind => {
    const f = fixture()
    const controller = new AbortController()
    const failure = new Error('Continuous Goal Planner recovery was not claimed')
    f.deps.recoverParent = vi.fn(async () => {
      if (kind === 'pause') f.record().control.autoProgress = 'paused'
      if (kind === 'cancel') controller.abort()
      if (kind === 'permission') f.attempt.permissionFingerprint = 'sha256:changed'
      if (kind === 'identity') f.record().tasks[0].execution.sessionId = 'replacement'
      if (kind === 'latest-turn') f.events().push({ seq: 3, type: 'turn/start', data: { turn: 2 } })
      if (kind === 'terminal-goal') f.goal.phase = 'complete'
      if (kind === 'pending' || kind === 'accepted') {
        const message = { id: 'racing-admission', source: { kind: 'coordinator', senderSessionId: 'planner' }, content: [{ type: 'text', text: 'tianwen.native-task-finalization.v1:{"longGoalId":"long","taskId":"task","epoch":1,"goalId":"goal","completedTurnSeq":2}' }] }
        const accepted = { seq: kind === 'pending' ? 3 : 0.5, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [message] } }
        if (kind === 'pending') f.events().push(accepted)
        else {
          f.events().splice(1, 0, accepted)
          f.events().splice(3, 0, { seq: 1.5, type: 'user/message', data: message })
        }
      }
      throw failure
    })
    await expect(finalizeNativeLongGoalTask({ ...input, signal: controller.signal }, f.deps)).rejects.toBe(failure)
    expect(f.deps.stopTask).not.toHaveBeenCalled()
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it.each(['new turn', 'accepted continuation'])('does not pause after %s arrives while failed-recovery status inspection awaits', async kind => {
    const f = fixture()
    const failure = new Error('Continuous Goal Planner recovery was not claimed')
    const child = { session: { id: 'child', header: { parentSession: 'planner' }, events: structuredClone(f.events()) } }
    const attached = f.deps.attachedAgent
    f.deps.attachedAgent = (id: string) => id === 'child' ? child : attached(id)
    // Persistence may lag the live Session. Every inspection returns an
    // immutable older snapshot so shared arrays cannot conceal this window.
    f.deps.inspectSession = async () => ({ meta: { id: 'child', parentSession: 'planner' }, events: structuredClone(f.events()) })
    const readStatus = f.deps.readStatus
    let reads = 0
    f.deps.readStatus = async (id: string) => {
      if (++reads === 2) {
        await Promise.resolve()
        child.session.events.push(kind === 'new turn'
          ? { seq: 3, type: 'turn/start', data: { turn: 2 } }
          : { seq: 3, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [{ id: 'new-continuation', source: { kind: 'coordinator', senderSessionId: 'planner' }, content: [{ type: 'text', text: 'Continue only the original Task.' }] }] } })
      }
      return readStatus(id)
    }
    f.deps.recoverParent = vi.fn(async () => { throw failure })
    await expect(finalizeNativeLongGoalTask(input, f.deps)).rejects.toBe(failure)
    expect(f.deps.stopTask).not.toHaveBeenCalled()
    expect(f.deps.followupTask).not.toHaveBeenCalled()
    expect(f.record().control.autoProgress).toBe('running')
  })

  it('permits normal Planner disposal during inspection followed by cold recovery of that same Session', async () => {
    const f = fixture()
    let currentParent: any = f.parent
    f.deps.attachedAgent = (id: string) => id === 'main' ? f.main : id === 'planner' ? currentParent : undefined
    const inspect = f.deps.inspectSession
    f.deps.inspectSession = async (id: string) => {
      currentParent = undefined // Public manager naturally disposes the report turn while inspection awaits.
      return inspect(id)
    }
    const recovered = { session: { ...f.parent.session, header: { ...f.parent.session.header } } }
    f.deps.recoverParent = async () => {
      currentParent = recovered
      f.deps.inspectSession = inspect
      return { parent: recovered, release: vi.fn() }
    }
    await expect(finalizeNativeLongGoalTask(input, f.deps)).resolves.toBeUndefined()
    expect(f.deps.followupTask).toHaveBeenCalledTimes(1)
    expect(f.deps.followupTask.mock.calls[0][0]).toBe(recovered)
  })

  it('still rejects replacing an exact live Planner credential during recovery admission', async () => {
    const f = fixture()
    const replacement = { session: { ...f.parent.session, header: { ...f.parent.session.header } } }
    f.deps.recoverParent = async () => {
      f.deps.attachedAgent = (id: string) => id === 'main' ? f.main : id === 'planner' ? replacement : undefined
      return { parent: replacement, release: vi.fn() }
    }
    await expect(finalizeNativeLongGoalTask(input, f.deps)).rejects.toThrow('authority changed')
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it('recovers once when the existing Planner naturally disposes during the second inspection', async () => {
    const f = fixture()
    let currentParent: any = f.parent
    let inspections = 0
    const inspect = f.deps.inspectSession
    const recovered = { session: { ...f.parent.session, header: { ...f.parent.session.header } } }
    f.deps.attachedAgent = (id: string) => id === 'main' ? f.main : id === 'planner' ? currentParent : undefined
    f.deps.inspectSession = async (id: string) => {
      if (++inspections === 2) currentParent = undefined
      return inspect(id)
    }
    f.deps.recoverParent = vi.fn(async () => {
      currentParent ??= recovered
      return { parent: currentParent, release: vi.fn() }
    })
    await expect(finalizeNativeLongGoalTask(input, f.deps)).resolves.toBeUndefined()
    expect(f.deps.recoverParent).toHaveBeenCalledTimes(2)
    expect(f.deps.followupTask).toHaveBeenCalledTimes(1)
    expect(f.deps.followupTask.mock.calls[0][0]).toBe(recovered)
  })

  it('does not treat a different still-live Planner after the second inspection as cold disposal', async () => {
    const f = fixture()
    let currentParent: any = f.parent
    let inspections = 0
    const inspect = f.deps.inspectSession
    f.deps.attachedAgent = (id: string) => id === 'main' ? f.main : id === 'planner' ? currentParent : undefined
    f.deps.inspectSession = async (id: string) => {
      if (++inspections === 2) currentParent = { session: { ...f.parent.session } }
      return inspect(id)
    }
    await expect(finalizeNativeLongGoalTask(input, f.deps)).rejects.toThrow('authority changed')
    expect(f.deps.recoverParent).toHaveBeenCalledTimes(1)
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it('counts the original plain coordinator recovery round against the shared continuation cap', async () => {
    const f = fixture()
    const plain = { id: 'ordinary-cold-recovery', source: { kind: 'coordinator', form: 'relay', senderSessionId: 'planner' }, content: [{ type: 'text', text: 'Execute exactly one Tianwen Long Goal Task.\nContinue only unfinished work from durable Session state.' }] }
    f.events().push(
      { seq: 3, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [plain] } },
      { seq: 4, type: 'turn/start', data: { turn: 2 } },
      { seq: 5, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
      { seq: 6, type: 'user/message', data: plain },
      { seq: 7, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
    )
    let seq = 7
    for (let turn = 2; turn <= 4; turn++) {
      await finalizeNativeLongGoalTask({ ...input, completedTurnSeq: seq }, f.deps)
      if (turn < 4) {
        const accepted = f.events().at(-1).data.inserted[0]
        seq = f.events().at(-1).seq
        f.events().push(
          { seq: ++seq, type: 'turn/start', data: { turn: turn + 1 } },
          { seq: ++seq, type: 'user/message', data: accepted },
          { seq: ++seq, type: 'turn/end', data: { turn: turn + 1, reason: { kind: 'completed' } } },
        )
      }
    }
    expect(f.deps.followupTask).toHaveBeenCalledTimes(2)
    expect(f.deps.stopTask).toHaveBeenCalledTimes(1)
  })

  it('bounds repeated omission by the original three continuation rounds across cold recovery', async () => {
    const f = fixture()
    let seq = 2
    for (let turn = 1; turn <= 4; turn++) {
      await finalizeNativeLongGoalTask({ ...input, completedTurnSeq: seq }, f.deps)
      if (turn < 4) {
        const accepted = f.events().at(-1).data.inserted[0]
        seq = f.events().at(-1).seq
        f.events().push(
          { seq: ++seq, type: 'turn/start', data: { turn: turn + 1 } },
          { seq: ++seq, type: 'user/message', data: accepted },
          { seq: ++seq, type: 'turn/end', data: { turn: turn + 1, reason: { kind: 'completed' } } },
        )
      }
    }
    expect(f.deps.followupTask).toHaveBeenCalledTimes(3)
    expect(f.deps.stopTask).toHaveBeenCalledTimes(1)
    expect(f.deps.stopTask.mock.calls[0][1]).toMatchObject({ code: 'max-task-rounds' })
  })

  it.each(['paused', 'cancelled', 'error', 'permission', 'identity', 'complete', 'attempt'])('does not dispatch after %s changes during asynchronous restoration', async kind => {
    const f = fixture()
    f.deps.recoverParent.mockImplementation(async () => {
      if (kind === 'paused' || kind === 'cancelled') f.record().control.autoProgress = 'paused'
      if (kind === 'complete') f.goal.phase = 'complete'
      if (kind === 'permission') f.attempt.permissionFingerprint = 'sha256:changed'
      if (kind === 'identity') f.record().planner.sessionId = 'other'
      if (kind === 'attempt') f.attempt.epoch = 2
      if (kind === 'error') f.events().push({ seq: 3, type: 'turn/end', data: { turn: 2, reason: { kind: 'error' } } })
      return { parent: f.parent, release: vi.fn() }
    })
    await finalizeNativeLongGoalTask(input, f.deps)
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it('rechecks permission before the existing cold Planner recovery dispatch', async () => {
    const f = fixture()
    const followupNativeChild = vi.fn()
    let permitted = true
    await expect(recoverNativeLongGoalPlannerParent(f.record(), {
      attachedAgent: id => id === 'main' ? f.main : undefined,
      listSessions: async () => { permitted = false; return [{ sessionId: 'planner', cwd: 'D:/workspace', agentPreset: 'standard' }] },
      installNativeSetup: vi.fn(), followupNativeChild,
    }, { signal: input.signal, assertAuthority() { if (!permitted) throw new Error('permission changed') } })).rejects.toThrow('permission changed')
    expect(followupNativeChild).not.toHaveBeenCalled()
  })

  it.each(['taskId', 'goalId', 'epoch'])('rejects a captured %s binding from an older attempt', async field => {
    const f = fixture()
    await finalizeNativeLongGoalTask({ ...input, [field]: field === 'epoch' ? 2 : 'different' }, f.deps)
    expect(f.deps.followupTask).not.toHaveBeenCalled()
  })

  it('ignores lookalike admissions from another Goal or parent', async () => {
    const f = fixture()
    f.record().maxTaskRounds = 1
    f.events().unshift({ seq: -1, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [
      { id: 'wrong-goal', source: { kind: 'coordinator', senderSessionId: 'planner' }, content: [{ type: 'text', text: 'tianwen.native-task-finalization.v1:{"longGoalId":"long","taskId":"task","epoch":1,"goalId":"different","completedTurnSeq":0}' }] },
      { id: 'wrong-parent', source: { kind: 'coordinator', senderSessionId: 'other' }, content: [{ type: 'text', text: 'tianwen.native-task-finalization.v1:{"longGoalId":"long","taskId":"task","epoch":1,"goalId":"goal","completedTurnSeq":0}' }] },
    ] } })
    await finalizeNativeLongGoalTask(input, f.deps)
    expect(f.deps.followupTask).toHaveBeenCalledTimes(1)
    expect(f.deps.stopTask).not.toHaveBeenCalled()
  })
})
