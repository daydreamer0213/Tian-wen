import { describe, expect, it } from 'vitest'
import { runRepeatedOutcomeDemo } from '../../scripts/run-repeated-outcome-demo.js'

describe('repeated Outcome demo', () => {
  it('creates one Ticket only after two distinct synthetic Run outcomes', async () => {
    const result = await runRepeatedOutcomeDemo()
    expect(result).toMatchObject({
      schemaVersion: 'tianwen.repeated-outcome-demo.v1',
      fixture: { syntheticContractFixture: true },
      execution: { runs: 2, sessions: 2, status: 'completed' },
      outcomes: ['not-met', 'not-met'],
      learning: {
        firstDecision: 'signal-recorded',
        secondDecision: 'ticket-created',
        signals: 2,
        openTickets: 1,
        candidateCreated: false,
      },
      replay: { duplicate: true },
      nonInterference: { sessionsUnchanged: true },
      costs: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        cny: 0,
        docker: 0,
        userData: 0,
      },
    })
  })
})
