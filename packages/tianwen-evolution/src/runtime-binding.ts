import { Service } from '@tianwen/dsh-compat'
import type {
  Agent,
  Context,
} from '@tianwen/dsh-compat'

import {
  EvolutionLedger,
  LedgerCommitUnknownError,
  isPublicLedgerEvent,
} from './ledger.js'
import type {
  ApprovalRecord,
  ArtifactId,
  ArtifactVersion,
  ChampionPointer,
  EvaluationRecord,
  PublicLedgerEvent,
  RunBindingObservation,
  Sha256Digest,
  TransitionAuthority,
} from './ledger.js'
import type {
  OutcomeIntakeInput,
  OutcomeIntakeRecordedEvent,
  OutcomeIntakeReceipt,
  OutcomeLearningSignal,
  RunBindingInput,
  RunBindingReceipt,
  TianwenRunBinding,
  TianwenRunId,
} from './outcome-intake.js'
import type {
  LearningAnalysisConsent,
  LearningAnalysisConsentInput,
  LearningAnalysisConsentReceipt,
  LearningConsentNoticeBinding,
  LearningConsentNoticeReceipt,
  LearningConsentNoticeStatus,
  LearningIntakeInput,
  LearningIntakeReceipt,
  LearningIntakeStatus,
  LearningSignalStatus,
  LearningTicket,
  LearningTicketFeedback,
  LearningTicketId,
} from './learning-intake.js'
import type {
  LearningAnalysisId,
  LearningAnalysisProgressBinding,
  LearningAnalysisReceipt,
  LearningAnalysisReportBinding,
  LearningAnalysisStatus,
  LearningAnalysisSubmission,
  RequestLearningAnalysisInput,
  RequestOutcomeLearningAnalysisInput,
} from './learning-analysis.js'
import type {
  LearningExplorationArm,
  LearningExplorationProposal,
  LearningExplorationReceipt,
  LearningExplorationStatus,
} from './learning-exploration.js'
import type {
  InitialRunSkillBindingInput,
  InitialRunSkillBindingReceipt,
  RunSkillManifest,
  RunSkillManifestInput,
  RunSkillManifestReceipt,
  RunSkillUse,
  RunSkillUseInput,
  RunSkillUseReceipt,
  AttributionId,
  AttributionInput,
  AttributionReceipt,
  AttributionRecord,
  LearningCase,
  LearningCaseId,
  LearningCaseReceipt,
  OpenLearningCaseInput,
  AcceptedLesson,
  AcceptedLessonInput,
  AcceptedLessonReceipt,
  GovernedSkillCandidate,
  GovernedSkillCandidateId,
  LessonId,
  SkillCandidateInput,
  SkillCandidateReceipt,
} from './skill-governance.js'
import type {
  FreezeSkillEvalProtocolInput,
  OpenSkillEvaluationInput,
  RecordSkillEvaluationResultInput,
  SkillEvaluationId,
  SkillEvaluationPlan,
  SkillEvaluationReceipt,
  SkillEvaluationResult,
  SkillEvaluationResultReceipt,
  SkillEvalProtocolId,
  SkillEvalProtocolReceipt,
  SkillEvalProtocolRecord,
} from './skill-evaluation.js'
import type {
  ControlledSkillEvaluationBlindMap,
  ControlledSkillEvaluationBlindMapReceipt,
  ControlledSkillEvaluationId,
  ControlledSkillEvaluationObjective,
  ControlledSkillEvaluationObjectiveReceipt,
  ControlledSkillEvaluationPlan,
  ControlledSkillEvaluationReceipt,
  ControlledSkillEvaluationResult,
  ControlledSkillEvaluationResultReceipt,
  ControlledSkillEvalTaskId,
  ControlledSkillEvalProtocolReceipt,
  ControlledSkillEvalProtocolRecord,
  FreezeControlledSkillEvaluationBlindMapInput,
  FreezeControlledSkillEvalProtocolInput,
  OpenControlledSkillEvaluationInput,
  RecordControlledSkillEvaluationObjectiveInput,
  RecordControlledSkillEvaluationResultInput,
  RecordControlledSkillEvaluatorObservationInput,
  ControlledSkillEvaluatorObservation,
  ControlledSkillEvaluatorObservationReceipt,
} from './controlled-skill-evaluation.js'
import type {
  ControlledSkillShadowId,
  ControlledSkillShadowPlan,
  ControlledSkillShadowReceipt,
  ControlledSkillShadowResult,
  ControlledSkillShadowResultReceipt,
  OpenControlledSkillShadowInput,
  RecordControlledSkillShadowResultInput,
} from './controlled-skill-shadow.js'
import type {
  BeginControlledSkillTransitionInput,
  CompleteControlledSkillTransitionInput,
  ControlledSkillActivationFailureReceipt,
  ControlledSkillScopePointer,
  ControlledSkillScopePointerReceipt,
  ControlledSkillTransition,
  ControlledSkillTransitionCompletionReceipt,
  ControlledSkillTransitionId,
  ControlledSkillTransitionReceipt,
  ControlledSkillTransitionStartReceipt,
  InitializeControlledSkillScopePointerInput,
  RecordControlledSkillActivationFailedInput,
} from './controlled-skill-activation.js'

export interface RuntimeBinding {
  readonly artifactId: ArtifactId
  readonly pluginId: string
  readonly packageId: string
}

type DynamicPluginId =
  Parameters<Context['dynamicCordisRunner']['run']>[1]
type DynamicPackageId =
  Parameters<Context['dynamicCordisRunner']['run']>[2]

interface BoundRuntime {
  readonly artifactId: ArtifactId
  readonly pluginId: DynamicPluginId
  readonly packageId: DynamicPackageId
}

interface EvolutionState {
  readonly ledger: EvolutionLedger
  readonly bindings: Map<ArtifactId, BoundRuntime>
  blocked: boolean
  operations: Promise<void>
  pendingOperations: number
}

const STATES = new WeakMap<Context, EvolutionState>()

export interface TianwenEvolutionConfig {
  readonly root: string
  readonly clock?: () => string
}

export class EvolutionActivationError extends Error {
  constructor(
    readonly artifactId: ArtifactId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'EvolutionActivationError'
  }
}

export class EvolutionRecoveryError extends Error {
  constructor(
    readonly artifactId: ArtifactId,
    readonly previousArtifactId: ArtifactId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'EvolutionRecoveryError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenEvolution: TianwenEvolutionService
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function publicBinding(binding: BoundRuntime): RuntimeBinding {
  return {
    artifactId: binding.artifactId,
    pluginId: binding.pluginId,
    packageId: binding.packageId,
  }
}

export class TianwenEvolutionService extends Service {
  constructor(ctx: Context, config: TianwenEvolutionConfig) {
    super(ctx, 'tianwenEvolution')
    const ledger = new EvolutionLedger(config.root, {
      ...(config.clock === undefined ? {} : { clock: config.clock }),
    })
    STATES.set(ctx.root, {
      ledger,
      bindings: new Map(),
      blocked: ledger.hasRecoveryFailure(),
      operations: Promise.resolve(),
      pendingOperations: 0,
    })
  }

  get blocked(): boolean {
    return this.state().blocked
  }

  recordArtifact(
    source: string,
    parentArtifactId?: ArtifactId,
  ): ArtifactVersion {
    return this.formalWrite(() =>
      this.state().ledger.recordArtifact(source, parentArtifactId))
  }

  recordEvaluation(record: EvaluationRecord): void {
    this.formalWrite(() => this.state().ledger.recordEvaluation(record))
  }

  recordApproval(record: ApprovalRecord): void {
    this.formalWrite(() => this.state().ledger.recordApproval(record))
  }

  recordLearningIntake(input: LearningIntakeInput): LearningIntakeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningIntake(input))
  }

  recordLearningFeedbackRevision(input: {
    readonly intake: LearningIntakeInput
    readonly sessionLifecycleFingerprint: Sha256Digest
    readonly supersedesFeedbackVersion?: string
    readonly analysisConsentRevision?: number
  }): LearningIntakeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningFeedbackRevision(input))
  }

  recordLearningFeedbackRetraction(input: {
    readonly sessionId: string
    readonly messageId: string
    readonly retractedFeedbackVersion: string
    readonly sessionLifecycleFingerprint: Sha256Digest
  }): { readonly duplicate: boolean } {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningFeedbackRetraction(input))
  }

  requestOutcomeLearningAnalysis(input: RequestOutcomeLearningAnalysisInput): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.requestOutcomeLearningAnalysis(input))
  }

  getLearningAnalysisEvidenceIds(analysisId: LearningAnalysisId): Sha256Digest[] {
    return this.state().ledger.getLearningAnalysisEvidenceIds(analysisId)
  }

  requestLearningExploration(input: {
    readonly analysisId: LearningAnalysisId
    readonly proposal: LearningExplorationProposal
    readonly environmentDigest: Sha256Digest
  }): LearningExplorationReceipt {
    return this.formalWrite(() => this.state().ledger.requestLearningExploration(input))
  }

  recordLearningExplorationArm(input: {
    readonly analysisId: LearningAnalysisId
    readonly arm: LearningExplorationArm
    readonly sessionId: string
    readonly runId?: TianwenRunId
    readonly acceptanceEvidenceId?: Sha256Digest
    readonly inconclusiveReason?: 'no-product-output' | 'infrastructure-failure'
  }): LearningExplorationReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningExplorationArm(input))
  }

  getLearningExploration(analysisId: LearningAnalysisId): LearningExplorationStatus | undefined {
    return this.state().ledger.getLearningExploration(analysisId)
  }

  getLearningExplorationEvidenceIds(analysisId: LearningAnalysisId): Sha256Digest[] {
    return this.state().ledger.getLearningExplorationEvidenceIds(analysisId)
  }

  getLearningExplorationByChildSessionId(
    childSessionId: string,
  ): LearningExplorationStatus | undefined {
    return this.state().ledger.getLearningExplorationByChildSessionId(childSessionId)
  }

  requestLearningAnalysis(
    input: RequestLearningAnalysisInput,
  ): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.requestLearningAnalysis(input))
  }

  recordLearningAnalysisChildStarted(input: {
    readonly analysisId: LearningAnalysisId
    readonly parentSessionId: string
    readonly childSessionId: string
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisChildStarted(input))
  }

  recordLearningAnalysisSubmission(input: {
    readonly analysisId: LearningAnalysisId
    readonly childSessionId: string
    readonly submission: LearningAnalysisSubmission
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisSubmission(input))
  }

  recordLearningAnalysisFailed(input: {
    readonly analysisId: LearningAnalysisId
    readonly resumePhase: import('./learning-analysis.js').LearningAnalysisRetryPhase
  }): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningAnalysisFailed(input))
  }

  recordLearningAnalysisResumed(input: {
    readonly analysisId: LearningAnalysisId
    readonly resumePhase: import('./learning-analysis.js').LearningAnalysisRetryPhase
  }): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningAnalysisResumed(input))
  }

  recordLearningAnalysisInvalidated(input: {
    readonly analysisId: LearningAnalysisId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningAnalysisInvalidated(input))
  }

  recordLearningAnalysisReportIntent(
    input: LearningAnalysisReportBinding,
  ): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisReportIntent(input))
  }

  recordLearningAnalysisReportDelivered(input: LearningAnalysisReportBinding & {
    readonly reportMessageId: string
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisReportDelivered(input))
  }

  recordLearningAnalysisTerminalReportIntent(input: LearningAnalysisReportBinding): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningAnalysisTerminalReportIntent(input))
  }

  recordLearningAnalysisTerminalReportDelivered(input: LearningAnalysisReportBinding & {
    readonly reportMessageId: string
  }): LearningAnalysisReceipt {
    return this.formalWrite(() => this.state().ledger.recordLearningAnalysisTerminalReportDelivered(input))
  }

  recordLearningAnalysisProgressIntent(
    input: LearningAnalysisProgressBinding,
  ): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisProgressIntent(input))
  }

  recordLearningAnalysisProgressDelivered(input: LearningAnalysisProgressBinding & {
    readonly reportMessageId: string
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisProgressDelivered(input))
  }

  getLearningAnalysis(
    analysisId: LearningAnalysisId,
  ): LearningAnalysisStatus | undefined {
    return this.state().ledger.getLearningAnalysis(analysisId)
  }

  hasLearningAnalysisActiveSupport(analysisId: LearningAnalysisId): boolean {
    return this.state().ledger.hasLearningAnalysisActiveSupport(analysisId)
  }

  getLearningAnalysisByChildSessionId(
    childSessionId: string,
  ): LearningAnalysisStatus | undefined {
    return this.state().ledger.getLearningAnalysisByChildSessionId(
      childSessionId,
    )
  }

  listLearningAnalyses(): readonly LearningAnalysisStatus[] {
    return this.state().ledger.listLearningAnalyses()
  }

  recordLearningAnalysisConsent(
    input: LearningAnalysisConsentInput,
  ): LearningAnalysisConsentReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisConsent(input))
  }

  getLearningAnalysisConsent(): LearningAnalysisConsent | undefined {
    return this.state().ledger.getLearningAnalysisConsent()
  }

  getLearningAnalysisConsentBefore(
    timestamp: number,
  ): LearningAnalysisConsent | undefined {
    return this.state().ledger.getLearningAnalysisConsentBefore(timestamp)
  }

  recordLearningConsentNoticeIntent(
    input: LearningConsentNoticeBinding,
  ): LearningConsentNoticeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningConsentNoticeIntent(input))
  }

  recordLearningConsentNoticeDelivered(
    input: LearningConsentNoticeBinding,
  ): LearningConsentNoticeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningConsentNoticeDelivered(input))
  }

  getLearningConsentNoticeStatus(
    policyVersion: LearningConsentNoticeBinding['policyVersion'],
  ): LearningConsentNoticeStatus | undefined {
    return this.state().ledger.getLearningConsentNoticeStatus(policyVersion)
  }

  getLearningIntakeStatus(
    sessionId: string,
    messageId: string,
  ): LearningIntakeStatus | undefined {
    return this.state().ledger.getLearningIntakeStatus(sessionId, messageId)
  }

  listLearningIntakeStatuses(
    sessionId: string,
  ): readonly LearningIntakeStatus[] {
    return this.state().ledger.listLearningIntakeStatuses(sessionId)
  }

  getLearningTicketFeedback(
    ticketId: LearningTicketId,
  ): LearningTicketFeedback | undefined {
    return this.state().ledger.getLearningTicketFeedback(ticketId)
  }

  recordRunBinding(input: RunBindingInput): RunBindingReceipt {
    return this.formalWrite(() => this.state().ledger.recordRunBinding(input))
  }

  getRunBinding(runId: TianwenRunId): TianwenRunBinding | undefined {
    return this.state().ledger.getRunBinding(runId)
  }

  getRunBindingBySessionId(
    sessionId: string,
  ): RunBindingObservation | undefined {
    return this.state().ledger.getRunBindingBySessionId(sessionId)
  }

  getOutcomeIntake(runId: TianwenRunId): OutcomeIntakeRecordedEvent | undefined {
    return this.state().ledger.getOutcomeIntake(runId)
  }

  recordOutcomeIntake(input: OutcomeIntakeInput): OutcomeIntakeReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordOutcomeIntake(input))
  }

  recordRunSkillManifest(
    input: RunSkillManifestInput,
  ): RunSkillManifestReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordRunSkillManifest(input))
  }

  getRunSkillManifest(runId: TianwenRunId): RunSkillManifest | undefined {
    return this.state().ledger.getRunSkillManifest(runId)
  }

  listRunSkillManifests(): readonly RunSkillManifest[] {
    return this.state().ledger.listRunSkillManifests()
  }

  recordInitialRunSkillBinding(
    input: InitialRunSkillBindingInput,
  ): InitialRunSkillBindingReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordInitialRunSkillBinding(input))
  }

  recordRunSkillUse(input: RunSkillUseInput): RunSkillUseReceipt {
    return this.formalWrite(() => this.state().ledger.recordRunSkillUse(input))
  }

  getRunSkillUse(runId: TianwenRunId): RunSkillUse | undefined {
    return this.state().ledger.getRunSkillUse(runId)
  }

  listRunSkillUses(): readonly RunSkillUse[] {
    return this.state().ledger.listRunSkillUses()
  }

  freezeSkillEvalProtocol(
    input: FreezeSkillEvalProtocolInput,
  ): SkillEvalProtocolReceipt {
    return this.formalWrite(() =>
      this.state().ledger.freezeSkillEvalProtocol(input))
  }

  getSkillEvalProtocol(
    protocolId: SkillEvalProtocolId,
  ): SkillEvalProtocolRecord | undefined {
    return this.state().ledger.getSkillEvalProtocol(protocolId)
  }

  listSkillEvalProtocols(): readonly SkillEvalProtocolRecord[] {
    return this.state().ledger.listSkillEvalProtocols()
  }

  openSkillEvaluation(input: OpenSkillEvaluationInput): SkillEvaluationReceipt {
    return this.formalWrite(() => this.state().ledger.openSkillEvaluation(input))
  }

  getSkillEvaluation(evaluationId: SkillEvaluationId): SkillEvaluationPlan | undefined {
    return this.state().ledger.getSkillEvaluation(evaluationId)
  }

  listSkillEvaluations(): readonly SkillEvaluationPlan[] {
    return this.state().ledger.listSkillEvaluations()
  }

  recordSkillEvaluationResult(
    input: RecordSkillEvaluationResultInput,
  ): SkillEvaluationResultReceipt {
    return this.formalWrite(() => this.state().ledger.recordSkillEvaluationResult(input))
  }

  getSkillEvaluationResult(
    evaluationId: SkillEvaluationId,
  ): SkillEvaluationResult | undefined {
    return this.state().ledger.getSkillEvaluationResult(evaluationId)
  }

  freezeControlledSkillEvalProtocol(
    input: FreezeControlledSkillEvalProtocolInput,
  ): ControlledSkillEvalProtocolReceipt {
    return this.formalWrite(() =>
      this.state().ledger.freezeControlledSkillEvalProtocol(input))
  }

  getControlledSkillEvalProtocol(
    protocolId: SkillEvalProtocolId,
  ): ControlledSkillEvalProtocolRecord | undefined {
    return this.state().ledger.getControlledSkillEvalProtocol(protocolId)
  }

  listControlledSkillEvalProtocols(): readonly ControlledSkillEvalProtocolRecord[] {
    return this.state().ledger.listControlledSkillEvalProtocols()
  }

  openControlledSkillEvaluation(
    input: OpenControlledSkillEvaluationInput,
  ): ControlledSkillEvaluationReceipt {
    return this.formalWrite(() =>
      this.state().ledger.openControlledSkillEvaluation(input))
  }

  getControlledSkillEvaluation(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationPlan | undefined {
    return this.state().ledger.getControlledSkillEvaluation(evaluationId)
  }

  listControlledSkillEvaluations(): readonly ControlledSkillEvaluationPlan[] {
    return this.state().ledger.listControlledSkillEvaluations()
  }

  recordControlledSkillEvaluationObjective(
    input: RecordControlledSkillEvaluationObjectiveInput,
  ): ControlledSkillEvaluationObjectiveReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordControlledSkillEvaluationObjective(input))
  }

  getControlledSkillEvaluationObjective(
    evaluationId: ControlledSkillEvaluationId,
    taskId: ControlledSkillEvalTaskId,
  ): ControlledSkillEvaluationObjective | undefined {
    return this.state().ledger.getControlledSkillEvaluationObjective(
      evaluationId,
      taskId,
    )
  }

  listControlledSkillEvaluationObjectives(
    evaluationId: ControlledSkillEvaluationId,
  ): readonly ControlledSkillEvaluationObjective[] {
    return this.state().ledger.listControlledSkillEvaluationObjectives(evaluationId)
  }

  freezeControlledSkillEvaluationBlindMap(
    input: FreezeControlledSkillEvaluationBlindMapInput,
  ): ControlledSkillEvaluationBlindMapReceipt {
    return this.formalWrite(() =>
      this.state().ledger.freezeControlledSkillEvaluationBlindMap(input))
  }

  getControlledSkillEvaluationBlindMap(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationBlindMap | undefined {
    return this.state().ledger.getControlledSkillEvaluationBlindMap(evaluationId)
  }

  recordControlledSkillEvaluatorObservation(
    input: RecordControlledSkillEvaluatorObservationInput,
  ): ControlledSkillEvaluatorObservationReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordControlledSkillEvaluatorObservation(input))
  }

  listControlledSkillEvaluatorObservations(
    evaluationId: ControlledSkillEvaluationId,
  ): readonly ControlledSkillEvaluatorObservation[] {
    return this.state().ledger.listControlledSkillEvaluatorObservations(evaluationId)
  }

  recordControlledSkillEvaluationResult(
    input: RecordControlledSkillEvaluationResultInput,
  ): ControlledSkillEvaluationResultReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordControlledSkillEvaluationResult(input))
  }

  getControlledSkillEvaluationResult(
    evaluationId: ControlledSkillEvaluationId,
  ): ControlledSkillEvaluationResult | undefined {
    return this.state().ledger.getControlledSkillEvaluationResult(evaluationId)
  }

  openControlledSkillShadow(
    input: OpenControlledSkillShadowInput,
  ): ControlledSkillShadowReceipt {
    return this.formalWrite(() =>
      this.state().ledger.openControlledSkillShadow(input))
  }

  getControlledSkillShadow(
    shadowId: ControlledSkillShadowId,
  ): ControlledSkillShadowPlan | undefined {
    return this.state().ledger.getControlledSkillShadow(shadowId)
  }

  listControlledSkillShadows(): readonly ControlledSkillShadowPlan[] {
    return this.state().ledger.listControlledSkillShadows()
  }

  recordControlledSkillShadowResult(
    input: RecordControlledSkillShadowResultInput,
  ): ControlledSkillShadowResultReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordControlledSkillShadowResult(input))
  }

  getControlledSkillShadowResult(
    shadowId: ControlledSkillShadowId,
  ): ControlledSkillShadowResult | undefined {
    return this.state().ledger.getControlledSkillShadowResult(shadowId)
  }

  listControlledSkillShadowResults(): readonly ControlledSkillShadowResult[] {
    return this.state().ledger.listControlledSkillShadowResults()
  }

  initializeControlledSkillScopePointer(
    input: InitializeControlledSkillScopePointerInput,
  ): ControlledSkillScopePointerReceipt {
    return this.formalWrite(() =>
      this.state().ledger.initializeControlledSkillScopePointer(input))
  }

  getControlledSkillScopePointer(
    scopeKey: string,
  ): ControlledSkillScopePointer | undefined {
    return this.state().ledger.getControlledSkillScopePointer(scopeKey)
  }

  listControlledSkillScopePointers(): readonly ControlledSkillScopePointer[] {
    return this.state().ledger.listControlledSkillScopePointers()
  }

  beginControlledSkillTransition(
    input: BeginControlledSkillTransitionInput,
  ): ControlledSkillTransitionStartReceipt {
    return this.formalWrite(() =>
      this.state().ledger.beginControlledSkillTransition(input))
  }

  getControlledSkillTransition(
    transitionId: ControlledSkillTransitionId,
  ): ControlledSkillTransition | undefined {
    return this.state().ledger.getControlledSkillTransition(transitionId)
  }

  listControlledSkillTransitions(): readonly ControlledSkillTransition[] {
    return this.state().ledger.listControlledSkillTransitions()
  }

  completeControlledSkillTransition(
    input: CompleteControlledSkillTransitionInput,
  ): ControlledSkillTransitionCompletionReceipt {
    return this.formalWrite(() =>
      this.state().ledger.completeControlledSkillTransition(input))
  }

  getControlledSkillTransitionReceipt(
    transitionId: ControlledSkillTransitionId,
  ): ControlledSkillTransitionReceipt | undefined {
    return this.state().ledger.getControlledSkillTransitionReceipt(transitionId)
  }

  recordControlledSkillActivationFailed(
    input: RecordControlledSkillActivationFailedInput,
  ): ControlledSkillActivationFailureReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordControlledSkillActivationFailed(input))
  }

  openLearningCase(input: OpenLearningCaseInput): LearningCaseReceipt {
    return this.formalWrite(() => this.state().ledger.openLearningCase(input))
  }

  getLearningCase(caseId: LearningCaseId): LearningCase | undefined {
    return this.state().ledger.getLearningCase(caseId)
  }

  openLearningAnalysisCase(analysisId: LearningAnalysisId): LearningCaseReceipt {
    return this.formalWrite(() => this.state().ledger.openLearningAnalysisCase(analysisId))
  }

  listLearningCases(): readonly LearningCase[] {
    return this.state().ledger.listLearningCases()
  }

  recordAttribution(input: AttributionInput): AttributionReceipt {
    return this.formalWrite(() => this.state().ledger.recordAttribution(input))
  }

  getAttribution(attributionId: AttributionId): AttributionRecord | undefined {
    return this.state().ledger.getAttribution(attributionId)
  }

  listAttributions(): readonly AttributionRecord[] {
    return this.state().ledger.listAttributions()
  }

  recordAcceptedLesson(input: AcceptedLessonInput): AcceptedLessonReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordAcceptedLesson(input))
  }

  getAcceptedLesson(lessonId: LessonId): AcceptedLesson | undefined {
    return this.state().ledger.getAcceptedLesson(lessonId)
  }

  listAcceptedLessons(): readonly AcceptedLesson[] {
    return this.state().ledger.listAcceptedLessons()
  }

  recordSkillCandidate(input: SkillCandidateInput): SkillCandidateReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordSkillCandidate(input))
  }

  recordLearningAnalysisCandidateReady(input: {
    readonly analysisId: LearningAnalysisId
    readonly candidateId: GovernedSkillCandidateId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisCandidateReady(input))
  }

  recordLearningAnalysisProtocolUnavailable(
    analysisId: LearningAnalysisId,
  ): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisProtocolUnavailable(analysisId))
  }

  recordLearningAnalysisCandidateRejected(input: {
    readonly analysisId: LearningAnalysisId
    readonly evaluationId: ControlledSkillEvaluationId
    readonly shadowId?: ControlledSkillShadowId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisCandidateRejected(input))
  }

  recordLearningAnalysisShadowReady(input: {
    readonly analysisId: LearningAnalysisId
    readonly evaluationId: ControlledSkillEvaluationId
    readonly shadowId: ControlledSkillShadowId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisShadowReady(input))
  }

  recordLearningAnalysisPromoted(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisPromoted(input))
  }

  recordLearningAnalysisRolledBack(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisRolledBack(input))
  }

  recordLearningAnalysisTransitionRecovered(input: {
    readonly analysisId: LearningAnalysisId
    readonly transitionId: ControlledSkillTransitionId
  }): LearningAnalysisReceipt {
    return this.formalWrite(() =>
      this.state().ledger.recordLearningAnalysisTransitionRecovered(input))
  }

  getSkillCandidate(
    candidateId: GovernedSkillCandidateId,
  ): GovernedSkillCandidate | undefined {
    return this.state().ledger.getSkillCandidate(candidateId)
  }

  listSkillCandidates(): readonly GovernedSkillCandidate[] {
    return this.state().ledger.listSkillCandidates()
  }

  listLearningSignals(): readonly (
    LearningSignalStatus | OutcomeLearningSignal
  )[] {
    return this.state().ledger.listLearningSignals()
  }

  listLearningTickets(): readonly LearningTicket[] {
    return this.state().ledger.listLearningTickets()
  }

  getChampion(): ChampionPointer | undefined {
    return this.state().ledger.getChampion()
  }

  listEvents(): readonly PublicLedgerEvent[] {
    return this.state().ledger.listEvents()
      .filter(isPublicLedgerEvent)
  }

  promote(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.serialize(() =>
      this.transition(agent, artifactId, 'promotion'))
  }

  rollback(agent: Agent, artifactId: ArtifactId): Promise<RuntimeBinding> {
    return this.serialize(() =>
      this.transition(agent, artifactId, 'rollback'))
  }

  rehydrateChampion(
    agent: Agent,
  ): Promise<RuntimeBinding | undefined> {
    return this.serialize(() => this.rehydrate(agent))
  }

  private async rehydrate(
    agent: Agent,
  ): Promise<RuntimeBinding | undefined> {
    this.requireReady()
    const champion = this.state().ledger.getChampion()
    if (champion === undefined) {
      return undefined
    }
    const existing = this.state().bindings.get(champion.artifactId)
    if (existing !== undefined && this.isActive(existing)) {
      return publicBinding(existing)
    }
    const state = this.state()
    state.blocked = true
    const source = this.state().ledger.readSource(champion.artifactId)
    let binding: BoundRuntime | undefined
    try {
      binding = this.define(agent, champion.artifactId, source)
      await this.run(agent, binding, 'run')
    } catch (error) {
      const message = errorMessage(error)
      let auditError: unknown
      try {
        state.ledger.recordActivationFailed({
          artifactId: champion.artifactId,
          phase: 'rehydrate',
          message,
          ...(binding === undefined ? {} : { binding }),
        })
        state.ledger.recordRecoveryFailed(
          champion.artifactId,
          champion.artifactId,
          message,
        )
      } catch (auditFailure) {
        auditError = auditFailure
      }
      throw new EvolutionRecoveryError(
        champion.artifactId,
        champion.artifactId,
        `failed to rehydrate Champion: ${message}${
          auditError === undefined
            ? ''
            : `; audit failed: ${errorMessage(auditError)}`
        }`,
        { cause: error },
      )
    }
    state.bindings.set(champion.artifactId, binding)
    try {
      state.ledger.recordRuntimeBinding(
        binding.artifactId,
        binding.pluginId,
        binding.packageId,
      )
    } catch (error) {
      throw new EvolutionRecoveryError(
        champion.artifactId,
        champion.artifactId,
        `Champion is active but runtime binding audit failed: ${
          errorMessage(error)
        }`,
        { cause: error },
      )
    }
    state.blocked = false
    return publicBinding(binding)
  }

  private async transition(
    agent: Agent,
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
  ): Promise<RuntimeBinding> {
    this.requireReady()
    const authority = this.state().ledger.prepareTransition(artifactId, kind)
    const previous = this.state().ledger.getChampion()
    if (
      previous !== undefined &&
      this.state().bindings.get(previous.artifactId) === undefined
    ) {
      await this.rehydrate(agent)
    }
    const previousBinding = previous === undefined
      ? undefined
      : this.state().bindings.get(previous.artifactId)

    const source = this.state().ledger.readSource(artifactId)
    let binding: BoundRuntime | undefined
    try {
      binding = this.define(
        agent,
        artifactId,
        source,
        previousBinding?.pluginId,
      )
      await this.run(
        agent,
        binding,
        previousBinding === undefined ? 'run' : 'update',
      )
    } catch (error) {
      await this.activationFailed(
        agent,
        artifactId,
        kind,
        authority,
        previousBinding,
        binding,
        error,
      )
    }

    if (binding === undefined) {
      throw new Error('unreachable: successful activation has no binding')
    }
    const state = this.state()
    const expectedRevision = (previous?.revision ?? 0) + 1
    try {
      if (kind === 'promotion') {
        state.ledger.promote(artifactId)
      } else {
        state.ledger.rollback(artifactId)
      }
    } catch (error) {
      if (error instanceof LedgerCommitUnknownError) {
        state.bindings.set(artifactId, binding)
        state.blocked = true
        throw new EvolutionRecoveryError(
          artifactId,
          previous?.artifactId ?? artifactId,
          'formal transition commit is unknown; fresh replay is required',
          { cause: error },
        )
      }
      const committed = state.ledger.getChampion()
      if (
        committed?.artifactId === artifactId &&
        committed.revision === expectedRevision
      ) {
        state.bindings.set(artifactId, binding)
        state.blocked = true
        throw new EvolutionRecoveryError(
          artifactId,
          previous?.artifactId ?? artifactId,
          `formal transition committed but derived Champion pointer failed: ${
            errorMessage(error)
          }`,
          { cause: error },
        )
      }
      if (previousBinding !== undefined) {
        await this.activationFailed(
          agent,
          artifactId,
          kind,
          authority,
          previousBinding,
          binding,
          error,
        )
      }
      await this.stopUncommittedFirstChampion(
        agent,
        binding,
        kind,
        authority,
        error,
      )
    }
    state.bindings.set(artifactId, binding)
    try {
      state.ledger.recordRuntimeBinding(
        binding.artifactId,
        binding.pluginId,
        binding.packageId,
      )
    } catch (error) {
      state.blocked = true
      throw new EvolutionRecoveryError(
        artifactId,
        previous?.artifactId ?? artifactId,
        `Champion is active but runtime binding audit failed: ${
          errorMessage(error)
        }`,
        { cause: error },
      )
    }
    return publicBinding(binding)
  }

  private async stopUncommittedFirstChampion(
    agent: Agent,
    binding: BoundRuntime,
    kind: 'promotion' | 'rollback',
    authority: TransitionAuthority,
    commitError: unknown,
  ): Promise<never> {
    const state = this.state()
    state.blocked = true
    let stopError: unknown
    try {
      const stopped = await this.dynamicRunner().stop(
        agent,
        binding.pluginId,
      )
      if (!stopped.ok) {
        stopError = new Error(stopped.message)
      }
    } catch (error) {
      stopError = error
    }
    let auditError: unknown
    try {
      state.ledger.recordActivationFailed({
        artifactId: binding.artifactId,
        phase: kind,
        message: `formal transition commit failed: ${errorMessage(commitError)}`,
        authority,
        binding,
      })
    } catch (error) {
      auditError = error
    }
    if (stopError !== undefined || auditError !== undefined) {
      const failure = stopError ?? auditError
      throw new EvolutionRecoveryError(
        binding.artifactId,
        binding.artifactId,
        `uncommitted first Champion could not be safely stopped/audited: ${
          errorMessage(failure)
        }`,
        { cause: failure },
      )
    }
    state.blocked = false
    throw new EvolutionActivationError(
      binding.artifactId,
      `Dynamic activation was stopped because formal commit failed: ${
        errorMessage(commitError)
      }`,
      { cause: commitError },
    )
  }

  private define(
    agent: Agent,
    artifactId: ArtifactId,
    source: string,
    pluginId?: DynamicPluginId,
  ): BoundRuntime {
    const receipt = this.dynamicRunner().define({
      sessionId: agent.id,
      plugin: pluginId === undefined
        ? { kind: 'new', idPrefix: 'tian' }
        : { kind: 'existing', pluginId },
      name: `artifact-${artifactId.slice('artifact:'.length, 20)}`,
      purpose: `Activate formal Tianwen ${artifactId}`,
      code: { host: source },
    })
    return {
      artifactId,
      pluginId: receipt.pluginId,
      packageId: receipt.packageId,
    }
  }

  private async run(
    agent: Agent,
    binding: BoundRuntime,
    mode: 'run' | 'update',
  ): Promise<void> {
    const result = await this.dynamicRunner().run(
      agent,
      binding.pluginId,
      binding.packageId,
      mode,
    )
    if (!result.ok || result.status !== 'running') {
      throw new Error(
        result.ok
          ? `Dynamic activation did not complete: ${result.status}`
          : result.message,
      )
    }
    if (!this.isActive(binding)) {
      throw new Error('Dynamic runner did not retain the activated package')
    }
  }

  private async activationFailed(
    agent: Agent,
    artifactId: ArtifactId,
    kind: 'promotion' | 'rollback',
    authority: TransitionAuthority,
    previousBinding: BoundRuntime | undefined,
    attemptedBinding: BoundRuntime | undefined,
    activationError: unknown,
  ): Promise<never> {
    const state = this.state()
    state.blocked = true
    const activationMessage = errorMessage(activationError)
    let activationAuditError: unknown
    try {
      state.ledger.recordActivationFailed({
        artifactId,
        phase: kind,
        message: activationMessage,
        authority,
        ...(attemptedBinding === undefined
          ? {}
          : { binding: attemptedBinding }),
      })
    } catch (error) {
      activationAuditError = error
    }
    if (previousBinding === undefined) {
      if (activationAuditError !== undefined) {
        throw new EvolutionRecoveryError(
          artifactId,
          artifactId,
          `activation failed and its audit could not be persisted: ${
            errorMessage(activationAuditError)
          }`,
          { cause: activationAuditError },
        )
      }
      state.blocked = false
      throw new EvolutionActivationError(
        artifactId,
        `Dynamic activation failed: ${activationMessage}`,
        { cause: activationError },
      )
    }

    try {
      const row = this.dynamicRunner().inventory()
        .find(item => item.pluginId === previousBinding.pluginId)
      const mode = row?.currentPackageId === previousBinding.packageId
        ? 'run'
        : 'update'
      await this.run(agent, previousBinding, mode)
    } catch (recoveryError) {
      const recoveryMessage = errorMessage(recoveryError)
      try {
        state.ledger.recordRecoveryFailed(
          artifactId,
          previousBinding.artifactId,
          recoveryMessage,
        )
      } catch {
        // The process-local blocked state is authoritative for this failed run.
      }
      throw new EvolutionRecoveryError(
        artifactId,
        previousBinding.artifactId,
        `candidate activation failed and Champion recovery failed: ${recoveryMessage}`,
        { cause: recoveryError },
      )
    }
    let recoveryAuditError: unknown
    try {
      state.ledger.recordRuntimeBinding(
        previousBinding.artifactId,
        previousBinding.pluginId,
        previousBinding.packageId,
      )
    } catch (error) {
      recoveryAuditError = error
    }
    const auditError = activationAuditError ?? recoveryAuditError
    if (auditError !== undefined) {
      throw new EvolutionRecoveryError(
        artifactId,
        previousBinding.artifactId,
        `previous Champion restored but recovery audit failed: ${
          errorMessage(auditError)
        }`,
        { cause: auditError },
      )
    }
    state.blocked = false
    throw new EvolutionActivationError(
      artifactId,
      `Dynamic activation failed; previous Champion restored: ${activationMessage}`,
      { cause: activationError },
    )
  }

  private isActive(binding: BoundRuntime): boolean {
    const row = this.dynamicRunner().inventory()
      .find(item => item.pluginId === binding.pluginId)
    return (
      row?.currentPackageId === binding.packageId &&
      row?.activeRun?.packageId === binding.packageId
    )
  }

  private requireReady(): void {
    if (this.state().blocked) {
      throw new Error(
        'Tianwen evolution is blocked after Champion recovery failure',
      )
    }
  }

  private dynamicRunner(): Context['dynamicCordisRunner'] {
    if (!('dynamicCordisRunner' in this.ctx)) {
      throw new Error(
        'dynamicCordisRunner is required for artifact activation',
      )
    }
    return this.ctx.dynamicCordisRunner
  }

  private requireNoTransition(): void {
    if (this.state().pendingOperations > 0) {
      throw new Error(
        'formal records cannot change during a Champion transition',
      )
    }
  }

  private formalWrite<T>(operation: () => T): T {
    this.requireReady()
    this.requireNoTransition()
    try {
      return operation()
    } catch (error) {
      if (error instanceof LedgerCommitUnknownError) {
        this.state().blocked = true
      }
      throw error
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state()
    state.pendingOperations += 1
    const result = state.operations.then(operation)
    state.operations = result.then(
      () => {
        state.pendingOperations -= 1
      },
      () => {
        state.pendingOperations -= 1
      },
    )
    return result
  }

  private state(): EvolutionState {
    const state = STATES.get(this.ctx.root)
    if (state === undefined) {
      throw new Error('Tianwen evolution state is unavailable')
    }
    return state
  }
}
