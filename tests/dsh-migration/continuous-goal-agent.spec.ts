import { describe, expect, it, vi } from 'vitest'

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '../../packages/tianwen-runtime-bundle/node_modules/@deepseek-ai/dsh-commands/lib/index.js'
import {
  installBoundContinuousGoalControls,
  installContinuousGoalCommand,
  type ContinuousGoalAgentOperations,
} from '../../packages/tianwen-runtime-bundle/src/continuous-goal-agent.js'

type CommandDefinition = {
  readonly name: string
  readonly handler: (invocation: { readonly agent: Agent, readonly rawInput: string }) => Promise<{
    readonly kind: 'success' | 'error'
    readonly text?: string
  }>
}

type ToolDefinition = {
  readonly name: string
  readonly description: string
  readonly parameters: {
    readonly properties: Record<string, { readonly description?: string }>
  }
  readonly execute: (args: unknown, exec: { readonly agent?: Agent }) => Promise<string>
}

type PromptSection = {
  readonly name: string
  readonly text: () => string
}

function controlsAgent() {
  const commands: CommandDefinition[] = []
  const tools: ToolDefinition[] = []
  const sections: PromptSection[] = []
  const commandRegistry = {
    register(definition: CommandDefinition) {
      commands.push(definition)
      return () => commands.splice(commands.indexOf(definition), 1)
    },
  }
  const agentContext = {
    commands: commandRegistry,
    inject(
      _services: readonly string[],
      register: (ctx: { commands: typeof commandRegistry }) => () => void,
    ) {
      const dispose = register(agentContext)
      return {
        dispose,
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve(undefined))
        },
      }
    },
    tools: {
      register(definition: ToolDefinition) {
        tools.push(definition)
        return () => tools.splice(tools.indexOf(definition), 1)
      },
    },
    systemPrompt: {
      section(section: PromptSection) {
        sections.push(section)
        return () => sections.splice(sections.indexOf(section), 1)
      },
    },
    effect(execute: () => Iterable<() => void>) {
      const disposers = [...execute()]
      return () => { for (const dispose of disposers.reverse()) dispose() }
    },
  }
  const agent = {
    id: 'control-session-1',
    session: {
      id: 'control-session-1',
      header: { cwd: 'D:/workspace', agentPreset: 'chat' },
    },
    ctx: agentContext,
  } as unknown as Agent
  return { agent, commands, tools, sections }
}

function operations(): ContinuousGoalAgentOperations & {
  readonly create: ReturnType<typeof vi.fn>
  readonly control: ReturnType<typeof vi.fn>
} {
  return {
    create: vi.fn(async () => ({ action: 'started' })),
    control: vi.fn(async () => ({ action: 'paused' })),
  }
}

describe('continuous Goal Agent controls', () => {
  it('registers the command through real Cordis injection and owns cleanup', async () => {
    const root = new Context()
    await root.plugin(CommandRuntime)
    const agentData = {
      id: 'real-cordis-control-session',
      session: {
        id: 'real-cordis-control-session',
        header: { cwd: 'D:/workspace', agentPreset: 'chat' },
      },
      ctx: undefined as unknown as Context,
    }
    const agent = agentData as unknown as Agent
    await root.plugin(ctx => { agentData.ctx = ctx.extend({ agent }) })
    const commandRuntime = root.get('commands') as CommandRuntime

    try {
      const registration = installContinuousGoalCommand(agent, operations()) as unknown as
        PromiseLike<unknown> & { dispose(): void | Promise<void> }
      expect(commandRuntime.list(agent)).toEqual([])

      await registration
      expect(commandRuntime.list(agent).map(command => command.name)).toEqual(['goal'])

      await registration.dispose()
      expect(commandRuntime.list(agent)).toEqual([])
    } finally {
      await root.fiber.dispose()
    }
  })

  it('shows command usage for empty input without querying or creating a Goal', async () => {
    const subject = controlsAgent()
    const ops = operations()
    installContinuousGoalCommand(subject.agent, ops)

    for (const rawInput of ['', '   ']) {
      await expect(subject.commands[0]!.handler({ agent: subject.agent, rawInput }))
        .resolves.toEqual({
          kind: 'error',
          text: 'Usage: /goal <objective> | pause | resume | edit <direction>',
        })
    }
    expect(ops.create).not.toHaveBeenCalled()
    expect(ops.control).not.toHaveBeenCalled()
  })

  it('trims command separator whitespace and passes only the invoking Agent identity to Goal operations', async () => {
    const subject = controlsAgent()
    const ops = operations()
    installContinuousGoalCommand(subject.agent, ops)

    const command = subject.commands[0]!
    await expect(command.handler({ agent: subject.agent, rawInput: '   Ship the migration' }))
      .resolves.toEqual({ kind: 'success', text: 'started' })
    await expect(command.handler({ agent: subject.agent, rawInput: ' edit use the safe path' }))
      .resolves.toEqual({ kind: 'success', text: 'paused' })

    expect(ops.create).toHaveBeenCalledWith(subject.agent, 'Ship the migration')
    expect(ops.control).toHaveBeenLastCalledWith(subject.agent, {
      action: 'pause-and-replan', text: 'use the safe path', resume: true,
    })
  })

  it('rejects an empty edit command without invoking Goal control', async () => {
    const subject = controlsAgent()
    const ops = operations()
    installContinuousGoalCommand(subject.agent, ops)

    await expect(subject.commands[0]!.handler({ agent: subject.agent, rawInput: ' edit   ' }))
      .resolves.toEqual({ kind: 'error', text: 'Usage: /goal edit <direction>' })
    expect(ops.control).not.toHaveBeenCalled()
  })

  it('uses exec.agent for goal_control and rejects smuggled identity keys', async () => {
    const subject = controlsAgent()
    const ops = operations()
    installBoundContinuousGoalControls(subject.agent, ops)
    const tool = subject.tools[0]!

    await expect(tool.execute({ action: 'pause' }, { agent: subject.agent }))
      .resolves.toBe('paused')
    await expect(tool.execute({ action: 'pause', sessionId: 'smuggled' }, { agent: subject.agent }))
      .rejects.toThrow('Goal control arguments require exact keys')
    await expect(tool.execute({ action: 'status' }, {}))
      .resolves.toBe('No active continuous Goal is bound to this Agent.')

    expect(ops.control).toHaveBeenCalledTimes(1)
    expect(ops.control).toHaveBeenCalledWith(subject.agent, { action: 'pause' })
  })

  it('returns compact redacted progress for status', async () => {
    const subject = controlsAgent()
    const ops = operations()
    ops.control.mockResolvedValue({
      schemaVersion: 'tianwen.continuous-goal-control-result.v1',
      action: 'status',
      sessionId: 'internal-task-session-id',
      status: {
        schemaVersion: 'tianwen.long-goal-status.v3',
        goal: {
          id: 'internal-long-goal-id', objective: 'Ship the migration', phase: 'active', revision: 7,
          completedTasks: 2, abandonedTasks: 0, totalTasks: 4,
        },
        planner: { sessionId: 'internal-planner-session-id', phase: 'ready', planRevision: 3 },
        guidance: [],
        tasks: [
          { id: 'internal-task-id', objective: 'Verify the release', phase: 'active', execution: { sessionId: 'internal-task-session-id' }, resolution: null },
        ],
        currentTaskId: 'internal-task-id',
        runtime: { activation: 'not-loaded', modelRequests: 0, readOnly: true },
        control: { sessionId: 'internal-control-session-id', autoProgress: 'running' },
      },
    })
    installBoundContinuousGoalControls(subject.agent, ops)

    const output = await subject.tools[0]!.execute({ action: 'status' }, { agent: subject.agent })

    expect(JSON.parse(output)).toEqual({
      action: 'status',
      goal: {
        objective: 'Ship the migration', phase: 'active', completedTasks: 2, totalTasks: 4,
        autoProgress: 'running', currentTask: { objective: 'Verify the release', phase: 'active' },
      },
    })
    for (const internalId of [
      'internal-long-goal-id', 'internal-task-id', 'internal-task-session-id',
      'internal-planner-session-id', 'internal-control-session-id',
    ]) expect(output).not.toContain(internalId)
  })

  it('returns a null current Task when status has none', async () => {
    const subject = controlsAgent()
    const ops = operations()
    ops.control.mockResolvedValue({
      action: 'status',
      status: {
        goal: { objective: 'Ship the migration', phase: 'planning', completedTasks: 0, totalTasks: 1 },
        tasks: [],
        currentTaskId: null,
        control: { autoProgress: 'paused' },
      },
    })
    installBoundContinuousGoalControls(subject.agent, ops)

    const output = await subject.tools[0]!.execute({ action: 'status' }, { agent: subject.agent })

    expect(JSON.parse(output)).toEqual({
      action: 'status',
      goal: {
        objective: 'Ship the migration', phase: 'planning', completedTasks: 0, totalTasks: 1,
        autoProgress: 'paused', currentTask: null,
      },
    })
  })

  it('advertises every exact goal_control action shape to the model before execution', () => {
    const subject = controlsAgent()
    installBoundContinuousGoalControls(subject.agent, operations())

    const tool = subject.tools[0]!
    const prompt = subject.sections[0]!
    const shapes = [
      '{ action: "guide", text: "<guidance>" }',
      '{ action: "pause-and-replan", text: "<direction>", resume: <boolean> }',
      '{ action: "pause" }',
      '{ action: "resume" }',
      '{ action: "status" }',
    ]

    for (const shape of shapes) {
      expect(tool.description).toContain(shape)
      expect(prompt.text()).toContain(shape)
    }
    expect(tool.parameters.properties.action.description).toContain('guide')
    expect(tool.parameters.properties.text.description).toContain('guide')
    expect(tool.parameters.properties.text.description).toContain('pause-and-replan')
    expect(tool.parameters.properties.resume.description).toContain('pause-and-replan')
  })

  it('treats the bound prompt as authority for natural Goal guidance before native get_goal', () => {
    const subject = controlsAgent()
    installBoundContinuousGoalControls(subject.agent, operations())

    const prompt = subject.sections[0]!.text()
    expect(prompt).toContain('goal_control is the authority for whether an active continuous Goal exists')
    expect(prompt).toContain('native DSH get_goal')
    expect(prompt).toContain('a null result must not be used to decide whether a continuous Goal exists')
    expect(prompt).toContain('first action must be goal_control')
    expect(prompt).toContain('Do not read from or write to the workspace before calling it')
    expect(prompt).toContain('Unrelated conversation should proceed normally')
  })

  it('owns tool and merged prompt registrations in one disposer that permits reinstall', () => {
    const subject = controlsAgent()
    const ops = operations()
    const dispose = installBoundContinuousGoalControls(subject.agent, ops)

    expect(subject.tools.map(tool => tool.name)).toEqual(['goal_control'])
    expect(subject.sections.map(section => section.name)).toEqual(['tianwen:continuous-goal-control'])
    dispose()
    expect(subject.tools).toEqual([])
    expect(subject.sections).toEqual([])

    installBoundContinuousGoalControls(subject.agent, ops)
    expect(subject.tools.map(tool => tool.name)).toEqual(['goal_control'])
  })
})
