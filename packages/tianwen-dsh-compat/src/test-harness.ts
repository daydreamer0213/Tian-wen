import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import * as goalRoundDriver from '@deepseek-ai/dsh-goal-round-driver'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import DynamicCordisRunnerService from '@deepseek-ai/dsh-cordis-host-runner'
import MessageFeedbackService from '@deepseek-ai/dsh-message-feedback'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'

import { ScriptedAdapter } from './scripted-adapter.js'
import type { ScriptEntry } from './scripted-adapter.js'

export interface MountedHarness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
}

export interface GoalHarnessOptions {
  readonly goalRoundDriver: boolean
  readonly compression?: 'none' | 'zstd'
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

export async function mountFeedbackHarness(
  root: string,
  script: ScriptEntry[],
): Promise<MountedHarness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(JsonlSessionPersistence, {
    root: join(root, 'sessions'),
    compression: 'none',
  })
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: join(root, 'feedback-storage') })
  await ctx.plugin(StorageDomain, { backend: 'json', routes: {} })
  await ctx.plugin(MessageFeedbackService, { maxNoteBytes: 8192 })
  await ctx.plugin(DynamicCordisRunnerService, {})
  return registerAdapter(ctx, script)
}

export async function mountGoalHarness(
  root: string,
  script: ScriptEntry[],
  options: GoalHarnessOptions,
): Promise<MountedHarness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, {
    root,
    compression: options.compression ?? 'none',
  })
  await ctx.plugin(GoalService, {})
  if (options.goalRoundDriver) {
    await ctx.plugin(goalRoundDriver)
  }
  await ctx.plugin(AgentLoop, { agents: [] })
  return registerAdapter(ctx, script)
}

export function waitForIdle(
  ctx: Context,
  agent: Agent,
): Promise<void> {
  if (ctx.agents.get(agent.id) === undefined) {
    return Promise.reject(new Error('waitForIdle: agent belongs to a different context'))
  }
  return agent.whenIdle()
}
