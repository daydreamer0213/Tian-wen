import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ContinuableStart } from '@deepseek-ai/dsh-subagent'
import { defineTool, type ToolRestriction } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-goal'

export class NativeLongGoalChild {
  private readonly completionTools = new WeakSet<Agent>()
  constructor(private readonly ctx: Context) {}

  start(input: {
    parent: Agent
    childId: SessionId
    label: string
    prompt: ContentBlock[]
    agentOptions: AgentOptions
    persona?: string
    toolFilter?: ToolRestriction
    signal: AbortSignal
  }): Promise<ContinuableStart> {
    return this.ctx.subagents.startContinuable({
      provider: 'spawn',
      label: input.label,
      childId: input.childId,
      request: {
        parent: input.parent,
        prompt: input.prompt,
        agentOptions: input.agentOptions,
        ...(input.persona === undefined ? {} : { persona: input.persona }),
        ...(input.toolFilter === undefined ? {} : { toolFilter: input.toolFilter }),
      },
      signal: input.signal,
    })
  }

  // Coordinator recovery is not a human/Goal-driver turn. Give only this Task
  // an explicit completion capability; keep native attribution and revision checks.
  async followupTask(parent: Agent, childId: SessionId, prompt: ContentBlock[], signal: AbortSignal) {
    const install = (agent: Agent) => {
      if (agent.session.header.parentSession !== parent.session.id) {
        throw new Error('Recovered Task parent changed')
      }
      if (this.completionTools.has(agent)) return
      const bound = agent.ctx.goals.get(agent)
      if (bound === undefined) throw new Error('Native Task recovery has no Goal')
      agent.ctx.tools.register(defineTool({
        name: 'complete_long_goal_task',
        description: 'Complete only this recovered Task after verifying its objective. Read get_goal first and copy its exact goal_id and revision.',
        parameters: {
          goal_id: { type: 'string', required: true },
          revision: { type: 'integer', required: true },
        },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute(args, exec) {
          if (exec.agent !== agent || args.goal_id !== bound.id
            || agent.ctx.goals.get(agent)?.id !== bound.id) {
            throw new Error('Recovered Task completion binding changed')
          }
          agent.ctx.goals.complete(agent, { id: bound.id, revision: args.revision })
          return 'Recovered Task marked complete.'
        },
      }))
      this.completionTools.add(agent)
    }
    const prepare = (childCtx: Context) => {
      if (childCtx.agent?.session.id !== childId) return () => undefined
      return childCtx.on('agent/created', ({ agent }) => {
        if (agent === childCtx.agent) install(agent)
      })
    }
    const live = this.ctx.agents.get(childId)
    if (live !== undefined) install(live)
    const offSetup = this.ctx.subagents.registerContinuableSetup(prepare)
    try {
      return await this.followup(parent, childId, prompt, signal)
    } finally {
      offSetup()
    }
  }

  followup(parent: Agent, childId: SessionId, prompt: ContentBlock[], signal: AbortSignal) {
    return this.ctx.subagents.followup(parent, childId, prompt, {
      source: {
        kind: 'coordinator',
        form: 'relay',
        senderSessionId: parent.session.id,
      },
      signal,
    })
  }

  interrupt(parentSessionId: SessionId, childId: SessionId): void {
    this.ctx.subagents.interrupt(childId, { kind: 'user', parentSessionId })
  }
}
