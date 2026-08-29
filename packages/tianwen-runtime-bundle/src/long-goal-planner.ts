import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

import type { LongGoalRecordV2, LongGoalStatusProjectionV2 } from './long-goal-contract.js'
import {
  commitLongGoalPlan,
  LongGoalIntegrityError,
  readLongGoalStatus,
} from './long-goal.js'

export interface LongGoalPlannerDependencies {
  readonly inspectSession: (sessionId: string) => Promise<{
    readonly exists: boolean
    readonly cwd?: string
    readonly agentPreset?: string
  }>
  readonly createAgent: (input: {
    readonly sessionId: string
    readonly cwd: string
    readonly agentPreset: string
    readonly setup: AgentSetup
  }) => Promise<AgentHandle>
  readonly resumeAgent: (input: {
    readonly sessionId: string
    readonly setup: AgentSetup
  }) => Promise<AgentHandle>
  readonly flushSession: (agent: Agent) => Promise<void>
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function requirePlannerHeader(
  header: { readonly cwd?: string; readonly agentPreset?: string },
  record: LongGoalRecordV2,
): void {
  if (header.cwd !== record.workspaceRoot || header.agentPreset !== record.planner.agentPreset) {
    throw new LongGoalIntegrityError('Long Goal planner Session header mismatch')
  }
}

function requirePlannerAgent(agent: Agent, record: LongGoalRecordV2): void {
  if (
    String(agent.id) !== record.planner.sessionId ||
    String(agent.session.id) !== record.planner.sessionId
  ) {
    throw new LongGoalIntegrityError('Long Goal planner Session identity mismatch')
  }
  requirePlannerHeader(agent.session.header, record)
}

function requireV2Status(
  status: Awaited<ReturnType<typeof readLongGoalStatus>>,
  record: LongGoalRecordV2,
): LongGoalStatusProjectionV2 {
  if (
    status.schemaVersion !== 'tianwen.long-goal-status.v2' ||
    status.goal.id !== record.id ||
    status.planner.sessionId !== record.planner.sessionId
  ) {
    throw new LongGoalIntegrityError('Long Goal planner status mismatch')
  }
  return status
}

function plannerPrompt(
  record: LongGoalRecordV2,
  status: LongGoalStatusProjectionV2,
  reason: 'create' | 'continue' | 'guidance',
): string {
  const startedTasks = status.tasks
    .filter(task => task.execution !== null)
    .map(task => ({ objective: task.objective, phase: task.phase }))
  const futureTasks = record.tasks
    .filter(task => task.execution === null)
    .map(task => ({ objective: task.objective }))
  return [
    'Plan the next short ordered Task suffix for this Long Goal.',
    `Reason: ${reason}`,
    `Goal: ${record.objective}`,
    `Context: ${record.context ?? '(none)'}`,
    `Success criteria: ${record.successCriteria ?? '(none)'}`,
    `Guidance: ${JSON.stringify(record.guidance)}`,
    `Started Task facts: ${JSON.stringify(startedTasks)}`,
    `Current future suffix: ${JSON.stringify(futureTasks)}`,
    `Expected Goal revision: ${record.revision}`,
    'Plan only. Do not execute Tasks. Call submit_long_goal_plan exactly once with the expected revision.',
  ].join('\n')
}

export async function runLongGoalPlannerTurn(input: {
  readonly stateRoot: string
  readonly dshStatusTarget: Parameters<typeof readLongGoalStatus>[0]['dshStatusTarget']
  readonly record: LongGoalRecordV2
  readonly reason: 'create' | 'continue' | 'guidance'
}, dependencies: LongGoalPlannerDependencies): Promise<'submitted' | 'not-submitted'> {
  let submitted = false
  const setup: AgentSetup = agentCtx => {
    agentCtx.tools.register(defineTool({
      name: 'submit_long_goal_plan',
      description: 'Commit the complete replacement suffix of unstarted Tasks for this Long Goal.',
      parameters: {
        expectedGoalRevision: { type: 'integer', required: true },
        outcome: { type: 'string', enum: ['continue', 'complete'], required: true },
        tasks: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            properties: { objective: { type: 'string', required: true } },
            additionalProperties: true,
          },
        },
      },
      output: {
        schema: { type: 'string', const: 'plan-submitted' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        if (
          !hasExactKeys(args as Record<string, unknown>, [
            'expectedGoalRevision', 'outcome', 'tasks',
          ]) ||
          args.tasks.some(task => !hasExactKeys(task as Record<string, unknown>, ['objective']))
        ) {
          throw new TypeError('Long Goal plan arguments require exact keys')
        }
        if (args.expectedGoalRevision !== input.record.revision) {
          throw new LongGoalIntegrityError('Long Goal planner expected revision mismatch')
        }
        const status = requireV2Status(await readLongGoalStatus({
          stateRoot: input.stateRoot,
          longGoalId: input.record.id,
          dshStatusTarget: input.dshStatusTarget,
        }), input.record)
        commitLongGoalPlan({
          stateRoot: input.stateRoot,
          longGoalId: input.record.id,
          expectedRevision: args.expectedGoalRevision,
          outcome: args.outcome,
          tasks: args.tasks,
          consideredSettledTasks: status.tasks.filter(task =>
            task.phase === 'complete' || task.phase === 'abandoned').length,
        })
        submitted = true
        exec.concludeTurn()
        return 'plan-submitted'
      },
    }))
  }

  const inspected = await dependencies.inspectSession(input.record.planner.sessionId)
  let handle: AgentHandle | undefined
  let idleAttempted = false
  let flushAttempted = false
  try {
    if (inspected.exists) {
      requirePlannerHeader(inspected, input.record)
      handle = await dependencies.resumeAgent({
        sessionId: input.record.planner.sessionId,
        setup,
      })
    } else {
      handle = await dependencies.createAgent({
        sessionId: input.record.planner.sessionId,
        cwd: input.record.workspaceRoot,
        agentPreset: input.record.planner.agentPreset,
        setup,
      })
    }
    requirePlannerAgent(handle.agent, input.record)
    const status = requireV2Status(await readLongGoalStatus({
      stateRoot: input.stateRoot,
      longGoalId: input.record.id,
      dshStatusTarget: input.dshStatusTarget,
    }), input.record)
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: plannerPrompt(input.record, status, input.reason) }],
      source: { kind: 'user' },
    }))
    idleAttempted = true
    await handle.agent.whenIdle()
    flushAttempted = true
    await dependencies.flushSession(handle.agent)
    return submitted ? 'submitted' : 'not-submitted'
  } finally {
    if (handle !== undefined) {
      try {
        if (!idleAttempted) await handle.agent.whenIdle()
        if (!flushAttempted) await dependencies.flushSession(handle.agent)
      } finally {
        await handle.dispose()
      }
    }
  }
}
