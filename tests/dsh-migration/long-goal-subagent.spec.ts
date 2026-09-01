import { describe, expect, it } from 'vitest'
import type { AgentSetup } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import {
  foldSubagentDescriptor,
  SUBAGENT_DESCRIPTOR_VERSION,
} from '@deepseek-ai/dsh-subagent'

import { installLongGoalSubagentDescriptor } from '../../packages/tianwen-runtime-bundle/src/long-goal-subagent.js'

describe('Long Goal child descriptor', () => {
  it('records one durable descriptor when the child first enters a step', async () => {
    const session = Session.create(SessionId('long-goal-child'))
    const listeners: ((payload: { readonly agent: { readonly session: Session } }, next: () => Promise<{ readonly kind: string }>) => Promise<{ readonly kind: string }>)[] = []
    const context = {
      on(name: string, listener: (payload: { readonly agent: { readonly session: Session } }, next: () => Promise<{ readonly kind: string }>) => Promise<{ readonly kind: string }>) {
        if (name === 'agent/pre-step') listeners.push(listener)
        return () => undefined
      },
    } as unknown as Parameters<AgentSetup>[0]

    installLongGoalSubagentDescriptor(context, 'Task 2: Verify the result')

    const enter = async () => ({ kind: 'enter' })
    await listeners[0]!({ agent: { session } }, enter)

    expect(foldSubagentDescriptor(session.events)).toEqual({
      version: SUBAGENT_DESCRIPTOR_VERSION,
      mode: 'one-shot',
      provider: 'tianwen-long-goal',
      label: 'Task 2: Verify the result',
    })
    expect(session.events.filter(event => event.type === 'subagent/descriptor')).toHaveLength(1)

    await listeners[0]!({ agent: { session } }, enter)

    expect(session.events.filter(event => event.type === 'subagent/descriptor')).toHaveLength(1)
  })
})
