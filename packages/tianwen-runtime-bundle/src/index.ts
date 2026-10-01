export const name = 'tianwen-runtime-bundle'
export function apply(): void {}
export type {
  ConversationStudyResultPreparation, ConversationStudyResultCandidate, PreparedConversationStudyResultCheck, ConversationStudyResultCheck,
} from './conversation-study-result-check.js'
export type {
  ConversationExternalCodePreparation,
  ConversationExternalCodeCandidate,
  PreparedConversationExternalCodeCheck,
  ConversationExternalCodeCheck,
} from './conversation-external-check.js'
export {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  EXPLICIT_CORRECTION_PROTOCOL_VERSION,
  resolveExplicitCorrectionProtocol,
} from './explicit-correction-protocol.js'
export type {
  ExplicitCorrectionEvaluationTask,
  ExplicitCorrectionWorkspaceSnapshot,
} from './explicit-correction-protocol.js'
