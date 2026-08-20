import { ScriptedAdapter } from '@tianwen/dsh-compat'
import { describe, expect, it, vi } from 'vitest'

import { runResearchPreviewDemo } from '../../scripts/run-research-preview-demo.js'

describe('Tianwen research preview demo', () => {
  it('projects evidence without changing the DSH session', async () => {
    const result = await runResearchPreviewDemo()

    expect(result).toMatchObject({
      schemaVersion: 'tianwen.research-preview-demo.v1',
      execution: { status: 'completed', modelRequests: 2, toolCalls: 1 },
      evidence: { count: 1, complete: 1, errors: 0 },
      learning: {
        decision: 'no-case',
        signals: 0,
        candidateCreated: false,
        reason: 'no-repeat-failure-or-user-correction',
      },
      nonInterference: { sessionUnchanged: true },
    })
    expect(result.nonInterference.beforeDigest)
      .toBe(result.nonInterference.afterDigest)
  })

  it('does not report completion when the DSH turn ends in error', async () => {
    const stream = ScriptedAdapter.prototype.stream
    let requests = 0
    const spy = vi.spyOn(ScriptedAdapter.prototype, 'stream')
      .mockImplementation(async function* (this: ScriptedAdapter, options) {
        requests += 1
        if (requests === 2) {
          throw new Error('scripted final failure')
        }
        yield* stream.call(this, options)
      })

    try {
      await expect(runResearchPreviewDemo())
        .rejects.toThrow('DSH turn did not complete: error')
    } finally {
      spy.mockRestore()
    }
  })
})
