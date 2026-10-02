import { createConversationIsolatedJsonCheck, createConversationStudyIsolatedJsonCheck, createConversationStudyIsolatedJsonCohortCheck,
  type ConversationIsolatedPythonCheckConfig, type ConversationIsolatedPythonStudyCase } from './conversation-isolated-python-check.js'

/** Fixed Node 22.23.1: single-file ESM JS or erasable TS; not a compiler or a project dependency runner. */
export type ConversationIsolatedNodeCheckConfig = ConversationIsolatedPythonCheckConfig
export type ConversationIsolatedNodeStudyCase = ConversationIsolatedPythonStudyCase
export function createConversationIsolatedNodeCheck(config: ConversationIsolatedNodeCheckConfig) {
  return createConversationIsolatedJsonCheck(config, 'node')
}
export function createConversationStudyIsolatedNodeCheck(config: ConversationIsolatedNodeCheckConfig & {
  readonly requiredCondition: string; readonly criteria: readonly string[]
}) {
  return createConversationStudyIsolatedJsonCheck(config, 'node')
}
export function createConversationStudyIsolatedNodeCohortCheck(config: Parameters<typeof createConversationStudyIsolatedJsonCohortCheck>[0]) {
  return createConversationStudyIsolatedJsonCohortCheck(config, 'node')
}
