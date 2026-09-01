import { describe, expect, it } from 'vitest'
import { runExplicitCorrectionDemo } from '../../scripts/run-explicit-correction-demo.js'

describe('Tianwen explicit-correction demo', () => {
  it('turns real DSH feedback into one durable Ticket without a Candidate', async () => {
    const result = await runExplicitCorrectionDemo()
    expect(result).toMatchObject({
      schemaVersion: 'tianwen.explicit-correction-demo.v1',
      execution: { status: 'completed' },
      feedback: { rating: 'negative', stored: true },
      learning: {
        decision: 'ticket-created',
        sessionId: 'explicit-correction-demo',
        messageId: result.feedback.messageId,
        feedbackVersion: result.feedback.version,
        signals: 1,
        openTickets: 1,
        candidateCreated: false,
      },
      replay: { duplicate: true },
      nonInterference: { sessionUnchanged: true },
    })
    expect(JSON.stringify(result)).not.toContain(
      'Preserve the tool result in the final answer.',
    )
  })
})
