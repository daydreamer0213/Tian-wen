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
  mountAgentLoopTestDependencies,
  textResponse,
} from '@tianwen/dsh-compat'

describe('tianwen-dsh-compat public seam', () => {
  it('exports the exact rc.6 load-bearing surface', () => {
    expect(DSH_VERSION).toBe('0.1.0-rc.6')
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
})
