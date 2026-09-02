export const name = 'tianwen-runtime-bundle'
export function apply(): void {}
export {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  EXPLICIT_CORRECTION_PROTOCOL_VERSION,
  resolveExplicitCorrectionProtocol,
} from './explicit-correction-protocol.js'
export type {
  ExplicitCorrectionEvaluationTask,
  ExplicitCorrectionWorkspaceSnapshot,
} from './explicit-correction-protocol.js'
