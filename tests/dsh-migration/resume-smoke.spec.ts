import { CallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { renderGoalRoundPrompt } from '@deepseek-ai/dsh-goal-round-driver'
import { describe, expect, it } from 'vitest'

import {
  Phase2SmokeAdapter,
  SMOKE_ACTION,
  SMOKE_FINAL_TEXT,
  SMOKE_MODEL,
  SMOKE_PROVIDER,
} from '../../packages/tianwen-runtime-bundle/dist/smoke.js'

const tools = [
  { name: 'create_goal', description: 'Create a goal', parameters: {} },
  { name: SMOKE_ACTION, description: 'Run smoke action', parameters: {} },
  { name: 'update_goal', description: 'Update a goal', parameters: {} },
]
const resumeTools = [tools[2]!]

const base = {
  provider: SMOKE_PROVIDER,
  model: SMOKE_MODEL,
  sessionId: 'tianwen-resume-session',
  tools,
} satisfies Pick<GenerateOptions, 'provider' | 'model' | 'sessionId' | 'tools'>

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  return Array.fromAsync(stream)
}

function result(callId: string, content: string): GenerateOptions {
  return {
    ...base,
    messages: [{
      role: 'user',
      source: { kind: 'tool', callId: CallId(callId) },
      content: [{
        type: 'tool-result',
        toolCallId: CallId(callId),
        content: [{ type: 'text', text: content }],
      }],
    }],
  }
}

describe('Phase2SmokeAdapter resume mode', () => {
  it('keeps fresh first two steps and fixed constants', async () => {
    const adapter = new Phase2SmokeAdapter()
    const first = await collect(adapter.stream({
      ...base,
      messages: [{ role: 'user', source: { kind: 'user' }, content: [] }],
    }))
    expect(first[1]).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'tianwen-phase2-goal',
        name: 'create_goal',
      },
    })

    const second = await collect(adapter.stream(result(
      'tianwen-phase2-goal',
      JSON.stringify({ goal: { id: 'fresh-goal', revision: 1 } }),
    )))
    expect(second[1]).toMatchObject({
      block: { type: 'tool-call', name: SMOKE_ACTION, arguments: '{}' },
    })
    expect(SMOKE_PROVIDER).toBe('tianwen-offline')
    expect(SMOKE_MODEL).toBe('phase2-smoke')
    expect(SMOKE_ACTION).toBe('tianwen_smoke_action')
    expect(SMOKE_FINAL_TEXT).toBe('TIANWEN_PHASE2_OK')
  })

  it('completes a legal goal round on the first request of a fresh adapter', async () => {
    const adapter = new Phase2SmokeAdapter()
    const goalId = 'resumed-goal-id'
    const revision = 7
    const goalRound = renderGoalRoundPrompt({
      id: goalId,
      revision,
      objective: 'resume the goal',
      phase: 'active',
      maxGoalRounds: 3,
      roundsStarted: 0,
      createdAt: 1,
      updatedAt: 1,
      activation: 'armed',
    } as Parameters<typeof renderGoalRoundPrompt>[0], 1)
    const resumed = {
      ...base,
      tools: resumeTools,
      messages: [
        {
          role: 'user',
          source: { kind: 'goal' as const, goalId, revision, round: 1 },
          content: goalRound,
        },
        {
          role: 'user',
          source: {
            kind: 'plugin' as const,
            plugin: 'resume-smoke-test',
            form: 'snapshot' as const,
            sections: [],
          },
          content: [{ type: 'text' as const, text: 'runtime context' }],
        },
      ],
    } satisfies GenerateOptions

    const complete = await collect(adapter.stream(resumed))
    expect(complete[1]).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'tianwen-phase2-goal-complete',
        name: 'update_goal',
        arguments: JSON.stringify({ goal_id: goalId, revision, action: 'complete' }),
      },
    })

    const completion = result(
      'tianwen-phase2-goal-complete',
      JSON.stringify({ goal: { id: goalId, revision: revision + 1 } }),
    )
    const finished = await collect(adapter.stream({
      ...completion,
      messages: [
        ...completion.messages,
        {
          role: 'user',
          source: {
            kind: 'plugin' as const,
            plugin: 'tool-goal',
            form: 'notice' as const,
            summary: 'complete',
          },
          content: [{ type: 'text' as const, text: '<goal_complete />' }],
        },
      ],
    }))
    expect(finished[1]).toMatchObject({
      block: { type: 'text', text: 'TIANWEN_RESUME_OK' },
    })
  })
})
