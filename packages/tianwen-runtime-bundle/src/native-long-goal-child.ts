import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ContinuableStart } from '@deepseek-ai/dsh-subagent'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'

export class NativeLongGoalChild {
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
