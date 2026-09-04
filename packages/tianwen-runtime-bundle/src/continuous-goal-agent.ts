import type { Agent } from '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-commands'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { sandboxModeFromEvents } from './permission-attempt.js'

import type {
  ContinuousGoalControlAction,
  ContinuousGoalControlResult,
} from './continuous-goal-service.js'

export interface ContinuousGoalAgentOperations {
  create(agent: Agent, objective: string): Promise<Pick<ContinuousGoalControlResult, 'action'>>
  control(agent: Agent, action: ContinuousGoalControlAction): Promise<ControlOperationResult>
}

type ControlOperationResult = Pick<ContinuousGoalControlResult, 'action'>
  & Partial<Pick<ContinuousGoalControlResult, 'status'>>

const NO_ACTIVE_GOAL = 'No active continuous Goal is bound to this Agent.'
const GOAL_CONTROL_SHAPES = [
  '{ action: "guide", text: "<guidance>" }',
  '{ action: "pause-and-replan", text: "<direction>", resume: <boolean> }',
  '{ action: "pause" }',
  '{ action: "resume" }',
  '{ action: "status" }',
] as const

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

function formatControlResult(result: ControlOperationResult, agent: Agent): string {
  const status = result.status
  if (status === undefined) return result.action
  const currentTask = status.currentTaskId === null
    ? undefined
    : status.tasks.find(task => task.id === status.currentTaskId)
  const mainPermissionMode = sandboxModeFromEvents(agent.session.events, false)
  const attempt = currentTask?.attempt
  const needsMainPermission = attempt?.status === 'permission-limited'
    && status.control.autoProgress === 'running'
    && (attempt.permissionMode === 'read-only' || attempt.permissionMode === 'workspace-write')
    && mainPermissionMode !== 'danger-full-access'
  return JSON.stringify({
    action: result.action,
    ...(mainPermissionMode === undefined ? {} : { mainPermissionMode }),
    ...(needsMainPermission ? {
      requiredUserAction: 'Change this main Session permission using the control below its input box: select Full access (完全访问). This is the native Session setting, not a one-time approval. Tianwen then starts a new attempt automatically; do not open a child Session or ask for a separate approve/reject choice.',
    } : {}),
    goal: {
      objective: status.goal.objective,
      phase: status.goal.phase,
      completedTasks: status.goal.completedTasks,
      totalTasks: status.goal.totalTasks,
      autoProgress: status.control.autoProgress,
      currentTask: currentTask === undefined
        ? null
        : {
            objective: currentTask.objective, phase: currentTask.phase,
            ...(currentTask.attempt === undefined ? {} : { attempt: currentTask.attempt }),
          },
    },
  })
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
  if (input.length === 0) {
    return { kind: 'error', text: 'Usage: /goal <objective> | pause | resume | edit <direction>' }
  }
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
    return { kind: 'success', text: (await operations.create(agent, input)).action }
  } catch (error) {
    return commandError(error)
  }
}

export function installContinuousGoalCommand(
  agent: Agent,
  operations: ContinuousGoalAgentOperations,
) {
  return agent.ctx.inject(['commands'], scopedCtx => scopedCtx.commands.register({
    name: 'goal',
    description: 'start or control a long-running goal',
    input: { hint: '[<objective>|pause|resume|edit <direction>]', images: false },
    handler: invocation => handleGoalCommand(invocation.agent, invocation.rawInput.trim(), operations),
  }))
}

export function installBoundContinuousGoalControls(
  agent: Agent,
  operations: ContinuousGoalAgentOperations,
): () => Promise<void> {
  return agent.ctx.effect(function* () {
    yield agent.ctx.tools.register(defineTool({
      name: 'goal_control',
      description: [
        'Guide, pause, resume, replan, or inspect the continuous Goal bound to this Agent.',
        'Use exactly one of:',
        ...GOAL_CONTROL_SHAPES,
      ].join('\n'),
      parameters: {
        action: {
          type: 'string',
          enum: ['guide', 'pause-and-replan', 'pause', 'resume', 'status'],
          required: true,
          description: 'Required operation; guide needs text, pause-and-replan needs text and resume.',
        },
        text: {
          type: 'string',
          description: 'Required only for guide and pause-and-replan; omit it for pause, resume, and status.',
        },
        resume: {
          type: 'boolean',
          description: 'Required only for pause-and-replan; true resumes after replanning and false leaves it paused.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const controlAgent = exec.agent
        const controlSessionId = controlAgent?.session.id
        if (controlAgent === undefined || controlSessionId === undefined) return NO_ACTIVE_GOAL
        const action = parseControlAction(args)
        try {
          return formatControlResult(await operations.control(controlAgent, action), controlAgent)
        } finally {
          if (action.action !== 'status') exec.concludeTurn()
        }
      },
    }))
    yield agent.ctx.systemPrompt.section({
      name: 'tianwen:continuous-goal-control',
      order: 100,
      text: () => [
        'goal_control is the authority for whether an active continuous Goal exists for this chat.',
        'The native DSH get_goal tool manages a separate Goal domain; a null result must not be used to decide whether a continuous Goal exists.',
        'When a user message is primarily guidance, correction, pause, resume, or status, the first action must be goal_control.',
        'Do not read from or write to the workspace before calling it.',
        'autoProgress "running" means automatic progression is enabled, not that a Task is executing. Use currentTask.phase and currentTask.attempt for the actual state.',
        'Do not execute the continuous Goal Task in this control chat.',
        'Treat Planner and Task subagent reports as progress only. Inspect goal_control status.',
        'After status returns, give one brief user-facing update in the user\'s language: completed stages, current stage, and whether user action is needed. Do not call other tools merely to re-check the same status.',
        'If status includes requiredUserAction, explain that native main Session setting in plain language and end your reply. Do not use request_user_input to invent an approval or promise one-time elevated execution.',
        'Each Task owns a separate native Goal. A Task reporting its Goal complete is normal Task completion, not premature completion of the continuous Goal; do not investigate it with get_goal.',
        'Report the Goal as complete only after goal_control reports phase "complete".',
        'Use exactly one of:',
        ...GOAL_CONTROL_SHAPES,
        'Do not add fields or use text/resume for an action that does not list them.',
        'Unrelated conversation should proceed normally.',
      ].join('\n'),
    })
  })
}
