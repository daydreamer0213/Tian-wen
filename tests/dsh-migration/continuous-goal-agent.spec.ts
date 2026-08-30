import { describe, expect, it, vi } from 'vitest'

import type { Agent } from '@deepseek-ai/dsh-agent'
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
  readonly execute: (args: unknown, exec: { readonly agent?: Agent }) => Promise<string>
}

function controlsAgent() {
  const commands: CommandDefinition[] = []
  const tools: ToolDefinition[] = []
  const sections: { readonly name: string, readonly content: unknown }[] = []
  const agent = {
    id: 'control-session-1',
    session: {
      id: 'control-session-1',
      header: { cwd: 'D:/workspace', agentPreset: 'chat' },
    },
    ctx: {
      commands: {
        register(definition: CommandDefinition) {
          commands.push(definition)
          return () => commands.splice(commands.indexOf(definition), 1)
        },
      },
      tools: {
        register(definition: ToolDefinition) {
          tools.push(definition)
          return () => tools.splice(tools.indexOf(definition), 1)
        },
      },
      systemPrompt: {
        section(section: { readonly name: string, readonly content: unknown }) {
          sections.push(section)
          return () => sections.splice(sections.indexOf(section), 1)
        },
      },
      effect(execute: () => Iterable<() => void>) {
        const disposers = [...execute()]
        return () => { for (const dispose of disposers.reverse()) dispose() }
      },
    },
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
