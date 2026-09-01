import type { AgentSetup } from '@deepseek-ai/dsh-agent'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'

export function installLongGoalSubagentDescriptor(
  ctx: Parameters<AgentSetup>[0],
  label: string,
): void {
  const descriptor = snapshotSubagentDescriptor({
    mode: 'one-shot',
    provider: 'tianwen-long-goal',
    label,
  })
  let appended = false
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (!appended && decision.kind === 'enter') {
      appended = true
      agent.session.append('subagent/descriptor', descriptor)
    }
    return decision
  })
}
