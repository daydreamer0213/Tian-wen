import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'

import { ScriptedAdapter } from './scripted-adapter.js'
import type { ScriptEntry } from './scripted-adapter.js'

export interface MountedHarness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
}

async function registerAdapter(
  ctx: Context,
  script: ScriptEntry[],
): Promise<MountedHarness> {
  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['tianwen-probe'], adapter)
  return { ctx, adapter }
}

export async function mountCoreHarness(
  script: ScriptEntry[],
): Promise<MountedHarness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  return registerAdapter(ctx, script)
}

export async function mountPersistentHarness(
  root: string,
  script: ScriptEntry[],
): Promise<MountedHarness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  return registerAdapter(ctx, script)
}

export function waitForIdle(
  ctx: Context,
  agent: Agent,
): Promise<void> {
  if (agent.ctx !== ctx) {
    return Promise.reject(new Error('waitForIdle: agent belongs to a different context'))
  }
  return agent.whenIdle()
}
