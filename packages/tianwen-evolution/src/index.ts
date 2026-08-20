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
      | 'run-skill-manifest-recorded'
      | 'run-skill-use-recorded'
      | 'learning-case-opened'
      | 'learning-attribution-recorded'
      | 'learning-lesson-recorded'
      | 'learning-candidate-recorded'
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
export {
  prepareAttribution,
  prepareAcceptedLesson,
  prepareLearningCase,
  prepareRunSkillManifest,
  prepareRunSkillUse,
  prepareSkillCandidate,
} from './skill-governance.js'
export type {
  AttributionInput,
  AcceptedLesson,
  AcceptedLessonInput,
  AcceptedLessonReceipt,
  AttributionId,
  AttributionReceipt,
  AttributionRecord,
  CaseEvidenceRelation,
  GovernedSkillCandidateId,
  GovernedSkillCandidate,
  GovernedSkillPayload,
  LearningCaseId,
  LearningCase,
  LearningCaseReceipt,
  LessonId,
  SkillCandidateInput,
  SkillCandidateReceipt,
  RunSkillManifest,
  RunSkillManifestInput,
  RunSkillManifestReceipt,
  RunSkillUse,
  RunSkillUseInput,
  RunSkillUseReceipt,
  OpenLearningCaseInput,
  SkillVersionId,
} from './skill-governance.js'
export * from './runtime-binding.js'
