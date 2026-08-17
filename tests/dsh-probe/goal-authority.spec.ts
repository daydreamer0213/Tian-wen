import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  AgentRegistry,
  CallId,
  Context,
  GoalService,
  Inbox,
  Session,
  SessionId,
  SystemPrompt,
  ToolRuntime,
  createUserMessage,
  toolGoal,
} from '@tianwen/dsh-compat'
import type {
  Agent,
  MessageSource,
  ToolExecutionResult,
} from '@tianwen/dsh-compat'

async function mountAuthorityContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(AgentRegistry, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(GoalService, {})
  await ctx.plugin(toolGoal, {})
  return ctx
}

function createStubAgent(
  ctx: Context,
  id: string,
): Agent {
  const session = Session.create(SessionId(id))
  const inbox = new Inbox(session, {
    inserted() {},
    discarded() {},
    claimed() {},
  })

  return {
    id: session.id,
    options: {},
    session,
    inbox,
    status: 'running',
    ctx,
    cancel() {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send(message, target) {
      inbox.append(target, message)
    },
    followup(message) {
      inbox.append('next-turn', message)
    },
    steer(message) {
      inbox.append('next-step', message)
    },
    inject(message) {
      inbox.append('next-step', message)
    },
  }
}

function registerAgent(
  ctx: Context,
  id: string,
  owner?: Agent,
): Agent {
  const agent = createStubAgent(ctx, id)
  if (owner === undefined) {
    ctx.agents.register(agent)
  } else {
    ctx.agents.enter(agent, owner)
    ctx.agents.announce(agent)
  }
  return agent
}

function openTurn(
  agent: Agent,
  turn: number,
  source: MessageSource,
): void {
  agent.session.append('turn/start', { turn })
  agent.session.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'goal authority probe' }],
      source,
    }),
    { surfaceOp: 'append' },
  )
}

function closeTurn(agent: Agent, turn: number): void {
  agent.session.append('turn/end', {
    turn,
    reason: { kind: 'completed' },
  })
}

function executeGoalTool(
  ctx: Context,
  agent: Agent,
  name: 'create_goal' | 'update_goal',
  argumentsValue: unknown,
): Promise<ToolExecutionResult> {
  return ctx.agents.withInitiator(agent, () =>
    ctx.tools.execute({
      callId: CallId(`goal-authority-${randomUUID()}`),
      name,
      arguments: argumentsValue,
      agent,
      signal: new AbortController().signal,
    }))
}

describe('DSH goal authority', () => {
  it('accepts top-level Goal creation from a direct human turn', async () => {
    const ctx = await mountAuthorityContext()
    try {
      const root = registerAgent(ctx, 'goal-authority-human-root')
      openTurn(root, 1, { kind: 'user' })

      const result = await executeGoalTool(
        ctx,
        root,
        'create_goal',
        {
          objective: 'Keep the top-level goal human-owned',
          max_goal_rounds: 1,
        },
      )

      expect(result.isError).toBe(false)
      expect(ctx.goals.get(root)).toMatchObject({
        objective: 'Keep the top-level goal human-owned',
        phase: 'active',
        maxGoalRounds: 1,
      })
      closeTurn(root, 1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects top-level Goal creation from a plugin-sourced turn', async () => {
    const ctx = await mountAuthorityContext()
    try {
      const root = registerAgent(ctx, 'goal-authority-plugin-create')
      openTurn(root, 1, {
        kind: 'plugin',
        plugin: 'tianwen-evidence',
      })

      const result = await executeGoalTool(
        ctx,
        root,
        'create_goal',
        {
          objective: 'silently created',
          max_goal_rounds: 1,
        },
      )

      expect(result).toMatchObject({
        isError: true,
        error: {
          info: { code: 'GOAL_TOOL_AUTHORITY_REQUIRED' },
        },
      })
      expect(ctx.goals.get(root)).toBeUndefined()
      closeTurn(root, 1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects Goal edits from a plugin-sourced turn', async () => {
    const ctx = await mountAuthorityContext()
    try {
      const root = registerAgent(ctx, 'goal-authority-plugin-edit')
      openTurn(root, 1, { kind: 'user' })
      const createdResult = await executeGoalTool(
        ctx,
        root,
        'create_goal',
        {
          objective: 'Keep the top-level goal human-owned',
          max_goal_rounds: 1,
        },
      )
      expect(createdResult.isError).toBe(false)
      const created = ctx.goals.get(root)
      expect(created).toBeDefined()
      closeTurn(root, 1)

      openTurn(root, 2, {
        kind: 'plugin',
        plugin: 'tianwen-evidence',
      })
      const result = await executeGoalTool(
        ctx,
        root,
        'update_goal',
        {
          goal_id: created!.id,
          revision: created!.revision,
          action: 'edit',
          objective: 'silently replaced',
        },
      )

      expect(result).toMatchObject({
        isError: true,
        error: {
          info: { code: 'GOAL_TOOL_AUTHORITY_REQUIRED' },
        },
      })
      expect(ctx.goals.get(root)?.objective)
        .toBe('Keep the top-level goal human-owned')
      closeTurn(root, 2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a user-looking child-agent attempt to edit the root Goal', async () => {
    const ctx = await mountAuthorityContext()
    try {
      const root = registerAgent(ctx, 'goal-authority-parent')
      openTurn(root, 1, { kind: 'user' })
      const createdResult = await executeGoalTool(
        ctx,
        root,
        'create_goal',
        {
          objective: 'Keep the top-level goal human-owned',
          max_goal_rounds: 1,
        },
      )
      expect(createdResult.isError).toBe(false)
      const created = ctx.goals.get(root)
      expect(created).toBeDefined()
      closeTurn(root, 1)

      const child = registerAgent(
        ctx,
        'goal-authority-child',
        root,
      )
      expect(ctx.agents.isOwnedBy(child.id, root)).toBe(true)
      openTurn(child, 1, { kind: 'user' })

      const result = await executeGoalTool(
        ctx,
        child,
        'update_goal',
        {
          goal_id: created!.id,
          revision: created!.revision,
          action: 'edit',
          objective: 'child replaced root',
        },
      )

      expect(result).toMatchObject({
        isError: true,
        error: {
          info: { code: 'GOAL_TOOL_AUTHORITY_REQUIRED' },
        },
      })
      expect(ctx.goals.get(root)?.objective)
        .toBe('Keep the top-level goal human-owned')
      expect(ctx.goals.get(child)).toBeUndefined()
      closeTurn(child, 1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

})
