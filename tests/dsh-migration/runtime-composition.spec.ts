import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
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
  mountAgentLoopTestDependencies,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import {
  apply,
  SUPPORTED_DSH_VERSION,
} from '../../packages/tianwen-runtime/src/index.js'

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

async function runOrdinaryDshSession(tianwenEnabled: boolean) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
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
  if (tianwenEnabled) await apply(ctx, { evolutionRoot: stateRoot() })
  const handle = await ctx.agents.create({
    sessionId: SessionId('ordinary-non-tianwen-session'),
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
    const requests = adapter.requests.map(request => ({
      provider: request.provider,
      model: request.model,
      reasoningEffort: request.reasoningEffort,
      tools: request.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }))
    const permissionEvents = handle.agent.session.events
      .filter(event => event.type === 'sandbox/mode')
      .map(event => event.data)
    const assistantText = handle.agent.session.events
      .filter(event => event.type === 'assistant/message')
      .flatMap(event => event.data.message.content)
      .filter(block => block.type === 'text')
      .map(block => block.text)
    return {
      requests,
      permissionEvents,
      assistantText,
      toolRuns,
      learningSignals: tianwenEnabled
        ? ctx.tianwenEvolution.listLearningSignals()
        : [],
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
  it('leaves an ordinary DSH model, tool, and permission flow unchanged with zero learning writes', async () => {
    const disabled = await runOrdinaryDshSession(false)
    const enabled = await runOrdinaryDshSession(true)

    expect(enabled).toEqual(disabled)
    expect(enabled).toMatchObject({
      requests: [
        { provider: 'ordinary-provider', model: 'ordinary-model' },
        { provider: 'ordinary-provider', model: 'ordinary-model' },
      ],
      permissionEvents: [{ mode: 'workspace-write', source: 'user' }],
      assistantText: ['ordinary answer'],
      toolRuns: 1,
      learningSignals: [],
    })
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
      await apply(ctx, { evolutionRoot })
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
      await apply(ctx)
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
      await expect(apply(ctx, { evolutionRoot: 'relative/evolution' }))
        .rejects.toThrow(/evolutionRoot.*absolute/)
      expect('tianwenEvidence' in ctx).toBe(false)
      expect('tianwenEvolution' in ctx).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
