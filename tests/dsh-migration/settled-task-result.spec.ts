import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

import {
  extractSettledTaskResult,
  readSettledTaskResult,
} from '../../packages/tianwen-runtime-bundle/src/settled-task-result.js'

function events(input: {
  readonly goalId?: string
  readonly terminalPhase?: 'complete' | 'blocked'
  readonly turnEndReason?: 'completed' | 'cancelled'
  readonly laterTurn?: boolean
  readonly finalContent?: readonly Record<string, unknown>[]
} = {}): readonly SessionEvent[] {
  const goalId = input.goalId ?? 'goal-1'
  const terminalPhase = input.terminalPhase ?? 'complete'
  return [
    { type: 'turn/start', seq: 1, data: { turn: 7 } },
    {
      type: 'user/message', seq: 2, surfaceOp: 'append',
      data: {
        id: 'goal-round', role: 'user', content: [{ type: 'text', text: 'Do the work' }],
        source: { kind: 'goal', goalId, revision: 1, round: 1 },
      },
    },
    {
      type: 'assistant/message', seq: 3, surfaceOp: 'append',
      data: {
        turn: 7,
        message: {
          id: 'assistant-draft', role: 'assistant',
          content: [{ type: 'text', text: 'Draft result' }],
        },
      },
    },
    {
      type: 'assistant/message', seq: 4, surfaceOp: 'append',
      data: {
        turn: 7,
        message: {
          id: 'assistant-final', role: 'assistant',
          content: input.finalContent ?? [
            { type: 'text', text: 'Final finding' },
            { type: 'text', text: 'Next fact' },
          ],
        },
      },
    },
    {
      type: 'turn/end', seq: 5,
      data: { turn: 7, reason: { kind: input.turnEndReason ?? 'completed' } },
    },
    ...(input.laterTurn === true
      ? [{ type: 'turn/start', seq: 6, data: { turn: 8 } }]
      : []),
    {
      type: 'goal/change', seq: 7,
      data: {
        kind: 'goal/change', version: 1,
        operation: terminalPhase === 'complete' ? 'complete' : 'block',
        goal: {
          id: goalId, revision: 2, objective: 'Do the work', maxGoalRounds: 3,
          phase: terminalPhase,
        },
        roundsStarted: 1, createdAt: 1, updatedAt: 2,
      },
    },
  ] as unknown as readonly SessionEvent[]
}

describe('settled Task result extraction', () => {
  it('returns the last appended assistant text from the anchored completed Goal turn', () => {
    expect(extractSettledTaskResult(events(), 'goal-1', 'complete')).toEqual({
      messageId: 'assistant-final',
      text: 'Final finding\nNext fact',
    })
  })

  it('maps an abandoned Task to the anchored blocked Goal turn', () => {
    expect(extractSettledTaskResult(
      events({ terminalPhase: 'blocked' }),
      'goal-1',
      'blocked',
    )).toMatchObject({ messageId: 'assistant-final', text: 'Final finding\nNext fact' })
  })

  it('rejects a result from a different Goal', () => {
    expect(extractSettledTaskResult(events({ goalId: 'goal-other' }), 'goal-1', 'complete'))
      .toBeUndefined()
  })

  it('rejects history with a later Turn before the terminal Goal change', () => {
    expect(extractSettledTaskResult(events({ laterTurn: true }), 'goal-1', 'complete'))
      .toBeUndefined()
  })

  it('rejects a Goal turn that did not complete', () => {
    expect(extractSettledTaskResult(
      events({ turnEndReason: 'cancelled' }),
      'goal-1',
      'complete',
    )).toBeUndefined()
  })

  it('does not invent text when the final assistant append has no text content', () => {
    expect(extractSettledTaskResult(
      events({ finalContent: [{ type: 'image', image: 'unavailable' }] }),
      'goal-1',
      'complete',
    )).toBeUndefined()
  })
})

describe('settled Task result inspection', () => {
  it('inspects the exact bound Session and Goal', async () => {
    const inspect = async (sessionId: string) => ({
      meta: { id: sessionId },
      events: events(),
    })

    await expect(readSettledTaskResult({
      sessionId: 'session-1', goalId: 'goal-1', phase: 'complete',
    }, inspect)).resolves.toBe('Final finding\nNext fact')
  })

  it('rejects an inspection whose header id differs from the binding', async () => {
    await expect(readSettledTaskResult({
      sessionId: 'session-1', goalId: 'goal-1', phase: 'complete',
    }, async () => ({ meta: { id: 'session-other' }, events: events() })))
      .rejects.toThrow(/identity mismatch/u)
  })

  it('propagates a missing persisted Session instead of hiding it as unavailable', async () => {
    await expect(readSettledTaskResult({
      sessionId: 'session-1', goalId: 'goal-1', phase: 'complete',
    }, async () => { throw new Error('session "session-1" not found') }))
      .rejects.toThrow('session "session-1" not found')
  })

  it('propagates persistence failures instead of hiding them as unavailable', async () => {
    await expect(readSettledTaskResult({
      sessionId: 'session-1', goalId: 'goal-1', phase: 'complete',
    }, async () => { throw new Error('corrupt session log') }))
      .rejects.toThrow('corrupt session log')
  })
})
