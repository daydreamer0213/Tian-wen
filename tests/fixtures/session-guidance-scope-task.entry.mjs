import { readFileSync } from 'node:fs'
import { collectSessionGuidanceScopes } from '../../packages/tianwen-runtime-bundle/src/conversation-current-scopes.js'
const inputs = JSON.parse(readFileSync(0, 'utf8'))
const results = inputs.map(input => {
  const before = JSON.stringify(input)
  const scopes = collectSessionGuidanceScopes(input.sessionId, input.conversationTasks, input.goalOutcomes, input.nativeGoalSources)
  return { id: input.id, scopes, unchanged: JSON.stringify(input) === before }
})
process.stdout.write(JSON.stringify(results))
