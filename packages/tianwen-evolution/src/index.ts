import type { PublicLedgerEvent } from './ledger.js'

export type LedgerEvent = PublicLedgerEvent
type AssertNever<T extends never> = T
type PublicLedgerEventPrivacyContract = AssertNever<Extract<
  LedgerEvent,
  {
    type:
      | 'learning-intake-recorded'
      | 'run-binding-recorded'
      | 'outcome-intake-recorded'
  }
>>

export {
  EvolutionGovernanceError,
  LedgerCommitUnknownError,
  LedgerIntegrityError,
  PUBLIC_LEDGER_EVENT_TYPES,
  isPublicLedgerEvent,
} from './ledger.js'
export type {
  ActivationFailedEvent,
  ApprovalRecord,
  ArtifactId,
  ArtifactVersion,
  ChampionPointer,
  EvaluationRecord,
  GovernanceErrorCode,
  PublicLedgerEventType,
  RecoveryFailedEvent,
  RuntimeBoundEvent,
  Sha256Digest,
} from './ledger.js'
export { prepareLearningIntake } from './learning-intake.js'
export type {
  LearningIntakeInput,
  LearningIntakeReceipt,
  LearningSignal,
  LearningSignalId,
  LearningTicket,
  LearningTicketId,
  PreparedLearningIntake,
} from './learning-intake.js'
export { prepareOutcomeIntake, prepareRunBinding } from './outcome-intake.js'
export type {
  OutcomeIntakeInput,
  OutcomeIntakeReceipt,
  OutcomeLearningSignal,
  OutcomeSeverity,
  OutcomeVerdict,
  PreparedOutcomeIntake,
  RunAcceptanceContract,
  RunBindingInput,
  RunBindingReceipt,
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'
export * from './runtime-binding.js'
