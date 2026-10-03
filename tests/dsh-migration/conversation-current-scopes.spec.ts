import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { collectSessionGuidanceScopes } from '../../packages/tianwen-runtime-bundle/src/conversation-current-scopes.js'

// Pure projected field fixtures frozen before the first candidate. These are
// not ledger admissions, feedback or natural learning sources. The native SDK
// profile test separately checks the public status tool against original data.
const cases = JSON.parse(readFileSync(new URL('../fixtures/session-guidance-scope-task.cases.json', import.meta.url), 'utf8')) as {
  input: { id: string; sessionId: string; conversationTasks: Parameters<typeof collectSessionGuidanceScopes>[1];
    goalOutcomes: Parameters<typeof collectSessionGuidanceScopes>[2]; nativeGoalSources: Parameters<typeof collectSessionGuidanceScopes>[3] }
  expected: { id: string; scopes: readonly string[]; unchanged: boolean }
}[]

for (const { input, expected } of cases) {
  it(`preserves the original current-session scope contract: ${input.id}`, () => {
    const before = JSON.stringify(input)
    expect(collectSessionGuidanceScopes(input.sessionId, input.conversationTasks, input.goalOutcomes, input.nativeGoalSources)).toEqual(expected.scopes)
    expect(JSON.stringify(input) === before).toBe(expected.unchanged)
  })
}
