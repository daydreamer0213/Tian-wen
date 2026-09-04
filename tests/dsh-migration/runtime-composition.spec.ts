import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GoalService from '@deepseek-ai/dsh-goal'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import {
  AgentLoop,
  Context,
  DSH_VERSION,
  ScriptedAdapter,
  SessionId,
  SystemPrompt,
  ToolRuntime,
  createUserMessage,
  defineTool,
  goalRoundDriver,
  mountAgentLoopTestDependencies,
  mountFeedbackHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { GenerateOptions } from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import {
  apply as applyCore,
  SUPPORTED_DSH_VERSION,
} from '../../packages/tianwen-runtime/src/index.js'
import { apply as applyRuntimeBundle } from '../../packages/tianwen-runtime-bundle/src/runtime.js'

const runtimeBundleRequire = createRequire(resolve(
  'packages/tianwen-runtime-bundle/package.json',
))

const roots: string[] = []

function stateRoot(): string {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-dsh-migration-phase-1/evolution'
    : resolve('tmp/tianwen-dsh-migration-phase-1/evolution')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'composition-'))
  roots.push(root)
  return root
}

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

async function mountPublicCommandRuntime(ctx: Context): Promise<void> {
  const entry = runtimeBundleRequire.resolve('@deepseek-ai/dsh-commands')
  const { default: CommandRuntime } = await import(pathToFileURL(entry).href) as {
    readonly default: new (ctx: Context) => unknown
  }
  await ctx.plugin(CommandRuntime as never)
}

function normalizeRequest(request: GenerateOptions): unknown {
  const clone = structuredClone(Object.fromEntries(
    Object.entries(request).filter(([key]) => key !== 'signal'),
  )) as Record<string, unknown>
  clone.messages = request.messages.map((message, index) => ({
    ...structuredClone(message),
    id: `message-${index + 1}`,
  }))
  clone.system = request.system ?? null
  clone.reasoningEffort = request.reasoningEffort ?? null
  clone.tools = structuredClone(request.tools ?? [])
  clone.toolChoice = (request as GenerateOptions & { readonly toolChoice?: unknown }).toolChoice ?? null
  return clone
}

async function runOrdinaryDshSession(tianwenEnabled: boolean) {
  const ctx = new Context()
  const profileRoot = stateRoot()
  const sessionsRoot = join(profileRoot, 'sessions')
  const evolutionRoot = join(profileRoot, 'evolution')
  const longGoalStateRoot = join(profileRoot, 'long-goals')
  const workspaceRoot = join(profileRoot, 'workspace')
  mkdirSync(workspaceRoot, { recursive: true })
  ctx.baseUrl = pathToFileURL(profileRoot).href
  ctx.provide('sessionProjections', projectionRegistry())
  ctx.provide('sandboxPolicy', sandboxPolicy())
  ctx.provide('approval', {})
  ctx.provide('connection', { rpc: { handle: () => undefined } })
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'ordinary-provider', model: 'ordinary-model' }),
  })
  const composedPreset = (agentCtx: { readonly agent?: { readonly session: {
    readonly header: { readonly agentPreset?: string }
  } } }) => agentCtx.agent?.session.header.agentPreset
  ctx.provide('agentPresets', {
    roots: [],
    mount: async () => undefined,
    composedPreset,
    composeFrom: (childCtx: Context, parentCtx: Parameters<typeof composedPreset>[0]) => {
      Object.defineProperty(childCtx, 'goals', { configurable: true, value: ctx.goals })
      return composedPreset(parentCtx)
    },
  })
  ctx.provide('apiProxy', {
    sessions: {
      async list() { return { result: { ok: true as const, value: { items: [] } } } },
      async create() { throw new Error('ordinary non-interference run must not create a child') },
    },
    goals: {
      async resume() { throw new Error('ordinary non-interference run must not resume a Goal') },
    },
  })
  await mountPublicCommandRuntime(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: 'none' })
  await ctx.plugin(GoalService)
  await ctx.plugin(goalRoundDriver)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  const adapter = new ScriptedAdapter([
    toolCallResponse('ordinary-call', 'ordinary_echo', { text: 'unchanged' }),
    textResponse('ordinary answer'),
  ])
  ctx.llm.registerAdapter(['ordinary-provider'], adapter)
  let toolRuns = 0
  const disposeTool = ctx.tools.register(defineTool({
    name: 'ordinary_echo',
    description: 'Return an ordinary DSH result.',
    parameters: { text: { type: 'string' } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: { readonly text: string }) {
      toolRuns += 1
      return `echo:${args.text}`
    },
  }))
  if (tianwenEnabled) {
    await applyRuntimeBundle(ctx, {
      stateRoot: longGoalStateRoot,
      sessionsRoot,
      evolutionRoot,
    })
  }
  const handle = await ctx.agents.create({
    sessionId: SessionId('ordinary-non-tianwen-session'),
    meta: { cwd: workspaceRoot, agentPreset: 'standard' },
    agentOptions: { provider: 'ordinary-provider', model: 'ordinary-model' },
  })
  try {
    handle.agent.session.append('sandbox/mode', {
      mode: 'workspace-write', source: 'user',
    })
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Run the ordinary echo tool.' }],
      source: { kind: 'user' },
    }))
    await handle.agent.whenIdle()
    const requests = adapter.requests.map(normalizeRequest)
    const permissionEvents = handle.agent.session.events
      .filter(event => event.type === 'sandbox/mode' || event.type === 'approval/policy')
      .map(event => ({ type: event.type, data: event.data }))
    const assistantOutput = handle.agent.session.events
      .filter(event => event.type === 'assistant/message')
      .map((event, index) => ({
        turn: event.data.turn,
        message: { ...structuredClone(event.data.message), id: `assistant-${index + 1}` },
      }))
    const commands = ctx.get('commands') as { list(agent: typeof handle.agent): readonly { name: string }[] }
    return {
      behavior: {
        requests,
        permissionEvents,
        assistantOutput,
        toolRuns,
        learningSignals: tianwenEnabled
          ? ctx.tianwenEvolution.listLearningSignals()
          : [],
      },
      hostMounted: commands.list(handle.agent).some(command => command.name === 'goal'),
    }
  } finally {
    await handle.dispose()
    disposeTool()
    await ctx.fiber.dispose()
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('@tianwen/runtime', () => {
  it('preserves an ordinary DSH flow while adding only the main-chat consent control', async () => {
    const disabled = await runOrdinaryDshSession(false)
    const enabled = await runOrdinaryDshSession(true)

    expect(disabled.hostMounted).toBe(false)
    expect(enabled.hostMounted).toBe(true)
    const ordinaryEnabled = structuredClone(enabled.behavior)
    for (const request of ordinaryEnabled.requests as Array<{
      tools: Array<{ readonly name: string }>
    }>) {
      request.tools = request.tools.filter(tool =>
        tool.name !== 'tianwen_learning_consent')
    }
    expect(ordinaryEnabled).toEqual(disabled.behavior)
    expect(enabled.behavior).toMatchObject({
      requests: [
        {
          provider: 'ordinary-provider', model: 'ordinary-model',
          reasoningEffort: null, toolChoice: null,
        },
        {
          provider: 'ordinary-provider', model: 'ordinary-model',
          reasoningEffort: null, toolChoice: null,
        },
      ],
      permissionEvents: [{
        type: 'sandbox/mode', data: { mode: 'workspace-write', source: 'user' },
      }],
      toolRuns: 1,
      learningSignals: [],
    })
    for (const request of enabled.behavior.requests as Array<{
      readonly system: unknown
      readonly messages: readonly { readonly role: string }[]
      readonly tools: readonly unknown[]
    }>) {
      expect(typeof request.system).toBe('string')
      expect(request.messages.length).toBeGreaterThan(0)
      expect(request.tools).toContainEqual({
        name: 'ordinary_echo',
        description: 'Return an ordinary DSH result.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      })
      expect(request.tools).toContainEqual({
        name: 'tianwen_learning_consent',
        description: expect.stringContaining('Enable, disable, or inspect Tianwen automatic feedback analysis for this profile.'),
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['enable', 'disable', 'status'],
            },
          },
          required: ['action'],
        },
      })
    }
    expect(enabled.behavior.assistantOutput).toHaveLength(2)
  })

  it('mounts the learning bridge against the real DSH Message Feedback profile services', async () => {
    const profileRoot = stateRoot()
    const mounted = await mountFeedbackHarness(profileRoot, [])
    try {
      await applyRuntimeBundle(mounted.ctx, {
        stateRoot: join(profileRoot, 'state'),
        sessionsRoot: join(profileRoot, 'sessions'),
        evolutionRoot: join(profileRoot, 'evolution'),
      })
      await vi.waitFor(() => expect(
        mounted.ctx.get('tianwenMessageFeedbackBridge'),
      ).toBeDefined())
    } finally {
      await mounted.ctx.fiber.dispose()
    }
  })

  it('uses an explicit absolute Evolution root instead of the Profile default', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})

    try {
      const profileRoot = stateRoot()
      const evolutionRoot = stateRoot()
      ctx.baseUrl = pathToFileURL(profileRoot).href
      expect(SUPPORTED_DSH_VERSION).toBe('0.1.1-rc.2')
      expect(DSH_VERSION).toBe(SUPPORTED_DSH_VERSION)
      await applyCore(ctx, { evolutionRoot })
      expect(ctx.tianwenEvidence).toBeDefined()
      expect(ctx.tianwenEvolution).toBeDefined()
      expect('dynamicCordisRunner' in ctx).toBe(false)
      expect('goals' in ctx).toBe(false)
      expect('agents' in ctx).toBe(false)
      expect(existsSync(join(evolutionRoot, 'artifacts'))).toBe(true)
      expect(existsSync(join(profileRoot, 'state', 'evolution'))).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('defaults Evolution state below the exact Profile-anchored base URL', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})

    try {
      const profileRoot = stateRoot()
      ctx.baseUrl = pathToFileURL(profileRoot).href
      await applyCore(ctx)
      expect(existsSync(
        join(profileRoot, 'state', 'evolution', 'artifacts'),
      )).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a non-absolute evolution root before mounting services', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    try {
      await expect(applyCore(ctx, { evolutionRoot: 'relative/evolution' }))
        .rejects.toThrow(/evolutionRoot.*absolute/)
      expect('tianwenEvidence' in ctx).toBe(false)
      expect('tianwenEvolution' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
