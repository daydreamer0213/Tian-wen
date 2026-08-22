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
      | 'skill-eval-protocol-frozen'
      | 'skill-evaluation-opened'
      | 'skill-evaluation-result-recorded'
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
export { prepareLearningIntake, sha256 } from './learning-intake.js'
export type {
  LearningIntakeInput,
  LearningIntakeReceipt,
  LearningSignal,
  LearningSignalId,
  LearningTicket,
  LearningTicketId,
  PreparedLearningIntake,
} from './learning-intake.js'
export {
  prepareOutcomeIntake,
  prepareRunAcceptanceContract,
  prepareRunBinding,
} from './outcome-intake.js'
export type {
  OutcomeIntakeInput,
  OutcomeIntakeReceipt,
  OutcomeLearningSignal,
  OutcomeSeverity,
  OutcomeVerdict,
  PreparedOutcomeIntake,
  RunAcceptanceContract,
  RunBindingInput,
  RunBindingInputV1,
  RunBindingInputV2,
  RunBindingReceipt,
  TianwenRunBinding,
  TianwenRunBindingV1,
  TianwenRunBindingV2,
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
export {
  assessSkillEvaluationFreshness,
  decideSkillEvaluation,
  prepareSkillEvaluationPlan,
  prepareSkillEvaluationResult,
  prepareSkillEvalProtocol,
  STAGE4_SCRIPTED_PROVIDER,
} from './skill-evaluation.js'
export { assessSkillShadowEligibility } from './skill-shadow.js'
export { assessSkillPromotionReadiness } from './skill-promotion.js'
export type {
  FreezeSkillEvalProtocolInput,
  OpenSkillEvaluationInput,
  RecordSkillEvaluationResultInput,
  SkillComparison,
  SkillEvaluationArmInput,
  SkillEvaluationArmPlan,
  SkillEvaluationArmObservation,
  SkillEvaluationCaseObservation,
  SkillEvaluationCaseResult,
  SkillEvaluationCasePlan,
  SkillEvaluationDecision,
  SkillEvaluationDecisionInput,
  SkillEvaluationCurrentDependencies,
  SkillEvaluationEnvironment,
  SkillEvaluationEvidenceClass,
  SkillEvaluationFreshness,
  SkillEvaluationFreshnessReason,
  SkillEvaluationId,
  SkillEvaluationPlan,
  SkillEvaluationReasonCode,
  SkillEvaluationPolicyAuthorization,
  SkillEvaluationDependencyBinding,
  SkillEvaluationReceipt,
  SkillEvaluationResult,
  SkillEvaluationResultReceipt,
  SkillEvaluationUsage,
  SkillEvaluationVerdict,
  SkillEvalArmOrder,
  SkillEvalAttemptReducer,
  SkillEvalCaseCategory,
  SkillEvalCaseId,
  SkillEvalMetric,
  SkillEvalProtocol,
  SkillEvalProtocolId,
  SkillEvalProtocolReasonCode,
  SkillEvalProtocolReceipt,
  SkillEvalProtocolRecord,
} from './skill-evaluation.js'
export {
  CONTROLLED_SKILL_EVAL_RUBRIC,
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  CONTROLLED_SKILL_EVAL_TASK_TYPES,
  prepareControlledSkillEvalProtocol,
} from './controlled-skill-evaluation.js'
export type {
  ControlledSkillEvalEvidenceLabel,
  ControlledSkillEvalEvidencePurpose,
  ControlledSkillEvalExecution,
  ControlledSkillEvalLimits,
  ControlledSkillEvalProtocol,
  ControlledSkillEvalProtocolProvenance,
  ControlledSkillEvalProtocolRecord,
  ControlledSkillEvalTask,
  ControlledSkillEvalTaskId,
  ControlledSkillEvalTaskType,
  FreezeControlledSkillEvalProtocolInput,
} from './controlled-skill-evaluation.js'
export type {
  SkillShadowEligibility,
  SkillShadowEligibilityInput,
  SkillShadowIneligibilityReason,
} from './skill-shadow.js'
export type {
  SkillPromotionReadiness,
  SkillPromotionReadinessInput,
  SkillPromotionReadinessReason,
} from './skill-promotion.js'
export * from './runtime-binding.js'
