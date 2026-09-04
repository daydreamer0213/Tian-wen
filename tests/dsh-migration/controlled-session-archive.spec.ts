import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, mountFeedbackHarness, textResponse } from '@tianwen/dsh-compat'
import { afterEach, expect, it, vi } from 'vitest'

import * as archive from '../../packages/tianwen-runtime-bundle/src/controlled-session-archive.js'

const roots: string[] = []

async function mount() {
  const base = process.platform === 'win32'
    ? 'D:/DevData/tianwen-controlled-session-archive-tests'
    : resolve('tmp/tianwen-controlled-session-archive-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'native-'))
  roots.push(root)
  const harness = await mountFeedbackHarness(root, [textResponse('Internal test evidence.')])
  await harness.ctx.plugin(WorkspaceRegistry)
  return harness
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('archives only internal controlled Sessions at startup and creation, retaining their exact logs', async () => {
  const { ctx } = await mount()
  try {
    const main = ctx.sessions.create(SessionId('ordinary-main'))
    const historicalHandle = await ctx.agents.create({
      sessionId: SessionId('old-controlled'),
      meta: { agentPreset: 'tianwen-controlled-evaluation' },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const historical = historicalHandle.agent.session
    historicalHandle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Produce the internal test evidence.' }],
      source: { kind: 'user' },
    }))
    await historicalHandle.agent.whenIdle()
    const nativeChild = ctx.sessions.create(SessionId('native-child'), {
      meta: {
        origin: 'subagent', parentSession: main.id, delegationDepth: 1,
        agentPreset: 'tianwen-controlled-evaluation',
      },
    })
    await ctx.sessions.flush(historical)
    await historicalHandle.dispose()
    expect(ctx.sessions.get(historical.id)).toBeUndefined()
    const before = await ctx.sessionPersistence.readRaw(historical.id)
    expect(before.meta.agentPreset).toBe('tianwen-controlled-evaluation')
    expect(before.content).toContain('Internal test evidence.')
    const fiber = ctx.plugin(archive)
    await fiber
    await expect.poll(() => ctx.workspaceRegistry.archivedSessionIds).toEqual([historical.id])
    expect(await ctx.sessionPersistence.readRaw(historical.id)).toEqual(before)
    expect(ctx.sessions.get(main.id)).toBe(main)
    expect(ctx.sessions.get(nativeChild.id)).toBe(nativeChild)

    const fresh = ctx.sessions.create(SessionId('new-controlled'), {
      meta: { agentPreset: 'tianwen-controlled-evaluation' },
    })
    await expect.poll(() => ctx.workspaceRegistry.archivedSessionIds).toEqual([historical.id, fresh.id])
    expect(ctx.sessions.get(fresh.id)).toBe(fresh)
    expect(fresh.header.origin).toBeUndefined()
    expect(fresh.header.parentSession).toBeUndefined()
    expect(fresh.events).toEqual([])
    await fiber.dispose()
    await ctx.plugin(archive)
    expect(ctx.workspaceRegistry.archivedSessionIds).toEqual([historical.id, fresh.id])
    expect(await ctx.sessionPersistence.readRaw(historical.id)).toEqual(before)
  } finally {
    await ctx.fiber.dispose()
  }
})

it('does not prevent controlled Session creation when native archive storage is unavailable', async () => {
  const { ctx } = await mount()
  try {
    await ctx.plugin(archive)
    const archiveCall = vi.spyOn(ctx.workspaceRegistry, 'archiveSession')
      .mockRejectedValue(new Error('archive storage unavailable'))
    const fresh = ctx.sessions.create(SessionId('visible-on-archive-failure'), {
      meta: { agentPreset: 'tianwen-controlled-evaluation' },
    })
    await expect.poll(() => archiveCall.mock.calls.length).toBe(1)
    expect(ctx.sessions.get(fresh.id)).toBe(fresh)
    expect(ctx.workspaceRegistry.archivedSessionIds).toEqual([])
  } finally {
    await ctx.fiber.dispose()
  }
})
