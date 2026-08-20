import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AgentLoop,
  Context,
  DSH_VERSION,
  DynamicCordisRunnerService,
  GoalService,
  JsonlSessionPersistence,
  LocalSandboxProvider,
  ScriptedAdapter,
  SessionId,
  createUserMessage,
  mountAgentLoopTestDependencies,
  mountCoreHarness,
  mountPersistentHarness,
  textResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'

describe('tianwen-dsh-compat public seam', () => {
  it('exports the exact rc.7 load-bearing surface', () => {
    expect(DSH_VERSION).toBe('0.1.0-rc.7')
    expect(Context).toBeTypeOf('function')
    expect(AgentLoop).toBeTypeOf('function')
    expect(GoalService).toBeTypeOf('function')
    expect(JsonlSessionPersistence).toBeTypeOf('function')
    expect(DynamicCordisRunnerService).toBeTypeOf('function')
    expect(LocalSandboxProvider).toBeTypeOf('function')
    expect(SessionId('probe-session')).toBe('probe-session')
    expect(textResponse('ok').at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'stop' },
    })
  })

  it('can mount the published testkit and register a scripted adapter', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    const adapter = new ScriptedAdapter([textResponse('ok')])
    ctx.llm.registerAdapter(['tianwen-probe'], adapter)
    expect(ctx.llm.listProviders().map(provider => provider.id))
      .toContain('tianwen-probe')
    await ctx.fiber.dispose()
  })

  it('drives one scripted agent round through the core harness', async () => {
    const harness = await mountCoreHarness([textResponse('scripted answer')])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('public-core-harness'),
      agentOptions: {
        provider: 'tianwen-probe',
        model: 'scripted',
      },
    })

    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'probe' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      expect(harness.adapter.requests).toHaveLength(1)
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('mounts persistent harness storage under a disposable root', async () => {
    const fixtureBase = process.platform === 'win32'
      ? 'D:/DevData/tianwen-dsh-probe'
      : tmpdir()
    mkdirSync(fixtureBase, { recursive: true })
    const persistenceRoot = mkdtempSync(resolve(fixtureBase, 'public-persistence-'))
    const harness = await mountPersistentHarness(persistenceRoot, [])

    try {
      expect(harness.ctx.llm.listProviders().map(provider => provider.id))
        .toContain('tianwen-probe')
    } finally {
      await harness.ctx.fiber.dispose()
      rmSync(persistenceRoot, { recursive: true, force: true })
    }
  })
})
