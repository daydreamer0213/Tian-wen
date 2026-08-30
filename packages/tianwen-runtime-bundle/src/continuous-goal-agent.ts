import type { Agent } from '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-commands'
import { defineTool } from '@deepseek-ai/dsh-tools'

import type {
  ContinuousGoalControlAction,
  ContinuousGoalControlResult,
} from './continuous-goal-service.js'

export interface ContinuousGoalAgentOperations {
  create(agent: Agent, objective: string): Promise<Pick<ContinuousGoalControlResult, 'action'>>
  control(agent: Agent, action: ContinuousGoalControlAction): Promise<Pick<ContinuousGoalControlResult, 'action'>>
}

const NO_ACTIVE_GOAL = 'No active continuous Goal is bound to this Agent.'

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Goal control arguments require exact keys')
  }
  return value as Record<string, unknown>
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseControlAction(value: unknown): ContinuousGoalControlAction {
  const args = asRecord(value)
  if (args.action === 'guide' && exactKeys(args, ['action', 'text']) && nonEmptyText(args.text)) {
    return { action: 'guide', text: args.text.trim() }
  }
  if (
    args.action === 'pause-and-replan'
    && exactKeys(args, ['action', 'text', 'resume'])
    && nonEmptyText(args.text)
    && typeof args.resume === 'boolean'
  ) {
    return { action: 'pause-and-replan', text: args.text.trim(), resume: args.resume }
  }
  if (args.action === 'pause' && exactKeys(args, ['action'])) return { action: 'pause' }
  if (args.action === 'resume' && exactKeys(args, ['action'])) return { action: 'resume' }
  if (args.action === 'status' && exactKeys(args, ['action'])) return { action: 'status' }
  throw new TypeError('Goal control arguments require exact keys')
}

function commandError(error: unknown): { readonly kind: 'error', readonly text: string } {
  return {
    kind: 'error',
    text: error instanceof Error ? error.message : 'Continuous Goal command failed',
  }
}

async function handleGoalCommand(
  agent: Agent,
  input: string,
  operations: ContinuousGoalAgentOperations,
): Promise<{ readonly kind: 'success' | 'error', readonly text: string }> {
  if (input === 'edit') return { kind: 'error', text: 'Usage: /goal edit <direction>' }
  if (input.startsWith('edit ')) {
    const text = input.slice('edit '.length).trim()
    if (text.length === 0) return { kind: 'error', text: 'Usage: /goal edit <direction>' }
    try {
      const result = await operations.control(agent, {
        action: 'pause-and-replan', text, resume: true,
      })
      return { kind: 'success', text: result.action }
    } catch (error) {
      return commandError(error)
    }
  }
  try {
    if (input === 'pause') return { kind: 'success', text: (await operations.control(agent, { action: 'pause' })).action }
    if (input === 'resume') return { kind: 'success', text: (await operations.control(agent, { action: 'resume' })).action }
    if (input.length === 0) return { kind: 'success', text: (await operations.control(agent, { action: 'status' })).action }
    return { kind: 'success', text: (await operations.create(agent, input)).action }
  } catch (error) {
    return commandError(error)
  }
}

export function installContinuousGoalCommand(
  agent: Agent,
  operations: ContinuousGoalAgentOperations,
): () => void {
  return agent.ctx.commands.register({
    name: 'goal',
    description: 'start or control a long-running goal',
    input: { hint: '[<objective>|pause|resume|edit <direction>]', images: false },
    handler: invocation => handleGoalCommand(invocation.agent, invocation.rawInput.trim(), operations),
  })
}

export function installBoundContinuousGoalControls(
  agent: Agent,
  operations: ContinuousGoalAgentOperations,
): () => Promise<void> {
  return agent.ctx.effect(function* () {
    yield agent.ctx.tools.register(defineTool({
      name: 'goal_control',
      description: 'Guide, pause, resume, replan, or inspect the continuous Goal bound to this Agent.',
      parameters: {
        action: {
          type: 'string',
          enum: ['guide', 'pause-and-replan', 'pause', 'resume', 'status'],
          required: true,
        },
        text: { type: 'string' },
        resume: { type: 'boolean' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const controlAgent = exec.agent
        const controlSessionId = controlAgent?.session.id
        if (controlAgent === undefined || controlSessionId === undefined) return NO_ACTIVE_GOAL
        return (await operations.control(controlAgent, parseControlAction(args))).action
      },
    }))
    yield agent.ctx.systemPrompt.section({
      name: 'tianwen:continuous-goal-control',
      order: 100,
      text: () => [
        'For guidance, correction, pause, resume, or status of the current continuous Goal, call goal_control.',
        'Leave unrelated conversation alone.',
      ].join('\n'),
    })
  })
}
