import { describe, expect, it, vi } from 'vitest'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import { NativeLongGoalChild } from '../../packages/tianwen-runtime-bundle/src/native-long-goal-child.js'

const sessionId = (value: string) => value as SessionId

describe('NativeLongGoalChild', () => {
  it('forwards start arguments to the public continuable DSH service unchanged', async () => {
    const startContinuable = vi.fn().mockResolvedValue({ childId: sessionId('reserved-child') })
    const ctx = { subagents: { startContinuable } } as unknown as Context
    const adapter = new NativeLongGoalChild(ctx)
    const parent = { session: { id: sessionId('parent') } } as Agent
    const prompt = [{ type: 'text', text: 'start' }] as ContentBlock[]
    const agentOptions = { provider: 'model-provider', model: 'model-id', maxTokens: 17 } as AgentOptions
    const signal = AbortSignal.timeout(10_000)

    await expect(adapter.start({
      parent,
      childId: sessionId('reserved-child'),
      label: 'child label',
      prompt,
      agentOptions,
      signal,
    })).resolves.toEqual({ childId: sessionId('reserved-child') })

    expect(startContinuable).toHaveBeenCalledWith({
      provider: 'spawn',
      label: 'child label',
      childId: sessionId('reserved-child'),
      request: { parent, prompt, agentOptions },
      signal,
    })
  })

  it('forwards follow-up source and signal unchanged', async () => {
    const followup = vi.fn().mockResolvedValue('message-id')
    const ctx = { subagents: { followup } } as unknown as Context
    const adapter = new NativeLongGoalChild(ctx)
    const parent = { session: { id: sessionId('parent') } } as Agent
    const prompt = [{ type: 'text', text: 'continue' }] as ContentBlock[]
    const signal = AbortSignal.timeout(10_000)

    await expect(adapter.followup(parent, sessionId('child'), prompt, signal)).resolves.toBe('message-id')

    expect(followup).toHaveBeenCalledWith(parent, sessionId('child'), prompt, {
      source: {
        kind: 'coordinator',
        form: 'relay',
        senderSessionId: parent.session.id,
      },
      signal,
    })
  })

  it('forwards the parent session authority and reserved child id to interrupt', () => {
    const interrupt = vi.fn()
    const ctx = { subagents: { interrupt } } as unknown as Context
    const adapter = new NativeLongGoalChild(ctx)
    const parentSessionId = sessionId('parent')
    const childId = sessionId('child')

    adapter.interrupt(parentSessionId, childId)

    expect(interrupt).toHaveBeenCalledWith(childId, { kind: 'user', parentSessionId })
  })
})
