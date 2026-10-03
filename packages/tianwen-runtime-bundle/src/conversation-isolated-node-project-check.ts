import { createConversationIsolatedJsonCheck, createConversationStudyIsolatedJsonCheck, createConversationStudyIsolatedJsonCohortCheck,
  createGoalTaskIsolatedJsonCheck, type ConversationIsolatedPythonCheckConfig, type ConversationIsolatedPythonStudyCase } from './conversation-isolated-python-check.js'

/** Complete captured project: declared mutable outputs plus frozen read-only references. */
export type ConversationIsolatedNodeProjectCheckConfig = Omit<ConversationIsolatedPythonCheckConfig, 'targetPath'> & {
  readonly entryPath: string
  readonly outputPaths: readonly string[]
}
export type ConversationIsolatedNodeProjectStudyCase = ConversationIsolatedPythonStudyCase & { readonly entryPath: string }
export type GoalTaskIsolatedNodeProjectCheckConfig = ConversationIsolatedNodeProjectCheckConfig & {
  readonly goalCommand: string
  readonly requiredCondition: string
}
function fixedEntry<T extends ConversationIsolatedNodeProjectCheckConfig>(config: T) {
  const { entryPath, ...rest } = config
  return { ...rest, targetPath: entryPath }
}
export function createConversationIsolatedNodeProjectCheck(config: ConversationIsolatedNodeProjectCheckConfig) {
  return createConversationIsolatedJsonCheck(fixedEntry(config), 'node-project')
}
export function createGoalTaskIsolatedNodeProjectCheck(config: GoalTaskIsolatedNodeProjectCheckConfig) {
  return createGoalTaskIsolatedJsonCheck(fixedEntry(config), 'node-project')
}
export function createConversationStudyIsolatedNodeProjectCheck(config: ConversationIsolatedNodeProjectCheckConfig & {
  readonly requiredCondition: string; readonly criteria: readonly string[]
}) {
  return createConversationStudyIsolatedJsonCheck({ ...fixedEntry(config), requiredCondition: config.requiredCondition, criteria: config.criteria }, 'node-project')
}
export function createConversationStudyIsolatedNodeProjectCohortCheck(config: {
  readonly modelConfigDigest: Parameters<typeof createConversationStudyIsolatedJsonCohortCheck>[0]['modelConfigDigest']
  readonly cases: Readonly<Record<'source1' | 'source2' | 'counterexample' | 'adjacent' | 'holdout', ConversationIsolatedNodeProjectStudyCase>>
}) {
  return createConversationStudyIsolatedJsonCohortCheck(config, 'node-project')
}
