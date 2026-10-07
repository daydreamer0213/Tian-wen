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
export function createConversationStudyIsolatedNodeCohortCheck(config: {
  readonly modelConfigDigest: Parameters<typeof createConversationStudyIsolatedJsonCohortCheck>[0]['modelConfigDigest']
  readonly cases: Readonly<Record<'source1' | 'source2' | 'counterexample' | 'adjacent' | 'holdout', ConversationIsolatedNodeStudyCase>>
}) {
  return createConversationStudyIsolatedJsonCohortCheck(config, 'node')
}
