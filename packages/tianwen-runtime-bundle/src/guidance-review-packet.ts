import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { conversationReviewConsensus, guidanceRule, guidanceVersion, parseConversationAuditedReviewChecks, sha256, type ConversationTask, type GuidanceArmRecord, type GuidanceStudy } from '@tianwen/evolution'
import { recoverConversationJudgmentRequest, recoverConversationStructuredJudgment, recoverConversationTrial } from './conversation-judgment.js'
import { verifyConversationClaimReviewCheck, verifyConversationOriginalReviewCheck } from './conversation-claim-review.js'
import { conversationMessages, conversationTaskModelDigest, recoverConversationTaskAnswer, recoverConversationTaskMaterial, type ConversationTaskMaterial } from './conversation-task-material.js'
import type { ConversationFeedbackMaterial } from './conversation-feedback-assessment.js'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** One read-only text arm for an independent review packet. No verdict is added. */
export async function recoverTextGuidanceArmForReview(ctx: Context, study: GuidanceStudy, arm: GuidanceArmRecord) {
  const opened = study.opened
  if (opened.evaluationMode === 'local-files' || study.decision?.verdict !== 'accepted' || study.candidate === undefined
    || study.arms.length !== 10 || sha256(study.arms) !== study.decision.armsDigest
    || arm.studyId !== opened.studyId || study.arms.filter(item => item.caseId === arm.caseId && item.role === arm.role).length !== 1
    || !study.arms.some(item => sha256(item) === sha256(arm))) throw new Error('source-unavailable')
  const cases = opened.cases.filter(item => item.id === arm.caseId)
  if (cases.length !== 1 || cases[0]!.materialDigest !== arm.materialDigest) throw new Error('source-unavailable')
  const snapshot = arm.role === 'baseline' ? opened.parentSnapshot : study.candidate.candidateSnapshot
  if (guidanceVersion(snapshot) !== arm.behaviorVersion) throw new Error('source-unavailable')
  const guidance = guidanceRule(snapshot, opened.family, opened.evaluationMode, opened.fileOutputKind)
  const checks = arm.reviewChecks
  if (checks === undefined || checks.length !== 2 || conversationReviewConsensus(checks).verdict !== arm.verdict) throw new Error('source-unavailable')
  const materials = await Promise.all(checks.map(async check => {
    if (!('audit' in check)) throw new Error('source-unavailable')
    await verifyConversationClaimReviewCheck(ctx, check, { purpose: 'method-study', materialDigest: arm.materialDigest,
      outputDigest: arm.outputDigest, modelConfigDigest: opened.modelConfigDigest })
    const recovered = await recoverConversationJudgmentRequest(ctx, check)
    if (!record(recovered.material) || !record(recovered.material.original)) throw new Error('source-unavailable')
    return recovered.material.original
  }))
  const task = materials[0]!.task
  if (!record(task) || materials.some(material => sha256(material.task) !== arm.materialDigest)
    || sha256(materials[1]!.task) !== sha256(task)) throw new Error('source-unavailable')
  const trialMaterial = 'request' in task && 'context' in task ? { request: task.request, context: task.context }
    : 'prompt' in task ? { prompt: task.prompt } : undefined
  if (trialMaterial === undefined) throw new Error('source-unavailable')
  const execution = await recoverConversationTrial(ctx, arm.executionProof, {
    outputDigest: arm.outputDigest, materialDigest: sha256(trialMaterial), modelConfigDigest: opened.modelConfigDigest,
    ...(guidance === undefined ? {} : { guidance }),
  })
  if (sha256(trialMaterial) !== sha256(execution.material)
    || materials.some(material => material.answer !== execution.answer)) throw new Error('source-unavailable')
  return { caseId: arm.caseId, role: arm.role, answer: execution.answer, task, reviews: checks,
    reviewStatus: study.activation === undefined ? 'unreviewed' as const : 'diagnostic-historical' as const }
}

type ReviewedArm = Awaited<ReturnType<typeof recoverTextGuidanceArmForReview>>
type OriginalAnswer = Awaited<ReturnType<typeof recoverConversationTaskAnswer>>
async function recoverOriginalTaskReview(ctx: Context, task: ConversationTask, originalMaterial: ConversationTaskMaterial): Promise<ConversationTask['review']> {
  const review = task.review
  if (review === undefined || review.proof === null) return undefined
  const modelConfigDigest = conversationTaskModelDigest(task)
  const checks = review.reviewChecks
  const completion = task.completion
  if (modelConfigDigest === undefined || checks?.length !== 2 || completion === undefined || task.reviewIntent === undefined
    || task.admission?.decision?.evaluationMode !== 'text'
    || review.admissionDigest !== sha256(task.admission) || review.resultDigest !== completion.resultDigest
    || conversationReviewConsensus(checks).verdict !== review.verdict) throw new Error('source-unavailable')
  const saved = await ctx.sessionPersistence.inspect(SessionId(task.source.sessionId))
  const span = saved.events.filter(event => event.seq >= task.source.startSeq && event.seq <= completion.endSeq)
  if (sha256(span) !== completion.resultDigest) throw new Error('source-unavailable')
  const original = { source: originalMaterial, evaluationMode: 'text',
    conversation: conversationMessages(span, task.source.materialProjection),
    toolEvidence: span.filter(event => event.type === 'tool/result') }
  if (sha256(original) !== task.reviewIntent.materialDigest) throw new Error('source-unavailable')
  for (const check of parseConversationAuditedReviewChecks(checks)) {
    await verifyConversationOriginalReviewCheck(ctx, check, original, modelConfigDigest)
  }
  return review
}
type ReviewCase = {
  readonly id: string
  readonly kind: 'source' | 'counterexample' | 'synthetic'
  readonly materialDigest: string
  readonly originalTaskId?: string
  readonly originalMaterial?: ConversationTaskMaterial
  readonly originalAnswer?: OriginalAnswer
  readonly originalTaskReview?: ConversationTask['review']
  readonly feedback?: {
    readonly assessmentId: string
    readonly originalFeedback: ConversationFeedbackMaterial['feedback']
    readonly supplementalCriteria: readonly string[]
    readonly studyStandard: unknown
    readonly rawFeedbackIncludedInStudy: boolean
  }
  readonly baseline: ReviewedArm
  readonly candidate: ReviewedArm
}

/** Complete text-only evidence packet. Missing raw feedback or any native proof stops export. */
export async function recoverTextGuidanceStudyReviewPacket(ctx: Context, study: GuidanceStudy): Promise<{
  readonly schemaVersion: 'tianwen.guidance-review-packet.v1'
  readonly reviewStatus: 'unreviewed' | 'diagnostic-historical'
  readonly opened: GuidanceStudy['opened']
  readonly candidate: NonNullable<GuidanceStudy['candidate']>
  readonly decision: NonNullable<GuidanceStudy['decision']>
  readonly activation: GuidanceStudy['activation']
  readonly currentConsent: ReturnType<Context['tianwenEvolution']['getLearningAnalysisConsent']>
  readonly currentSupport: boolean
  readonly proposalMaterial: unknown
  readonly cases: readonly ReviewCase[]
}> {
  const recorded = ctx.tianwenEvolution.listConversationGuidanceStudies().find(item => item.opened.studyId === study.opened.studyId)
  if (recorded === undefined || sha256(recorded) !== sha256(study) || study.opened.evaluationMode === 'local-files'
    || study.candidate === undefined || study.decision?.verdict !== 'accepted' || study.opened.cases.length !== 5
    || study.arms.length !== 10 || sha256(study.arms) !== study.decision.armsDigest) throw new Error('source-unavailable')
  const currentConsent = ctx.tianwenEvolution.getLearningAnalysisConsent()
  const currentSupport = ctx.tianwenEvolution.isConversationGuidanceSupported(study.opened.studyId)
  if (study.activation === undefined && (currentConsent?.enabled !== true || !currentSupport)) throw new Error('source-unavailable')
  const tasks = ctx.tianwenEvolution.listConversationTasks()
  const assessments = ctx.tianwenEvolution.listConversationFeedbackAssessments()
  const cases: ReviewCase[] = []
  for (const kind of ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const) {
    const matches = study.opened.cases.filter(item => item.kind === kind)
    if (matches.length !== 1) throw new Error('source-unavailable')
    const item = matches[0]!
    const arms = study.arms.filter(arm => arm.caseId === item.id)
    if (arms.length !== 2 || arms[0]?.role !== 'baseline' || arms[1]?.role !== 'candidate') throw new Error('source-unavailable')
    const [baseline, candidate] = await Promise.all(arms.map(arm => recoverTextGuidanceArmForReview(ctx, study, arm))) as [ReviewedArm, ReviewedArm]
    if (sha256(baseline.task) !== sha256(candidate.task)) throw new Error('source-unavailable')
    if (!('sourceTaskId' in item)) {
      const generated = { prompt: item.prompt, criteria: item.criteria, ...(item.qualityContract === undefined ? {} : { qualityContract: item.qualityContract }) }
      if (sha256(generated) !== sha256(baseline.task)) throw new Error('source-unavailable')
      cases.push({ id: item.id, kind: 'synthetic', materialDigest: item.materialDigest, baseline, candidate })
      continue
    }
    const matchingTasks = tasks.filter(task => task.source.taskId === item.sourceTaskId)
    if (matchingTasks.length !== 1) throw new Error('source-unavailable')
    const task: ConversationTask = matchingTasks[0]!
    const originalMaterial = await recoverConversationTaskMaterial(ctx, task)
    const originalAnswer = await recoverConversationTaskAnswer(ctx, task)
    const originalTaskReview = await recoverOriginalTaskReview(ctx, task, originalMaterial)
    const { feedbackStandard, ...taskWithoutStandard } = baseline.task
    if (sha256(taskWithoutStandard) !== sha256(originalMaterial)) throw new Error('source-unavailable')
    if (kind === 'counterexample') {
      if (item.sourceTaskId !== study.opened.counterexampleTaskId || feedbackStandard !== undefined || item.feedbackAssessmentId !== undefined) throw new Error('source-unavailable')
      cases.push({ id: item.id, kind: 'counterexample', materialDigest: item.materialDigest,
        originalTaskId: item.sourceTaskId, originalMaterial, originalAnswer, originalTaskReview, baseline, candidate })
      continue
    }
    const sourceIndex = kind === 'source1' ? 0 : 1
    if (item.sourceTaskId !== study.opened.sourceTaskIds[sourceIndex]) throw new Error('source-unavailable')
    if (item.feedbackAssessmentId === undefined) {
      if (feedbackStandard !== undefined || task.review?.verdict !== 'not-met') throw new Error('source-unavailable')
      cases.push({ id: item.id, kind: 'source', materialDigest: item.materialDigest,
        originalTaskId: item.sourceTaskId, originalMaterial, originalAnswer, originalTaskReview, baseline, candidate })
      continue
    }
    const feedbackService = ctx.get('tianwenConversationFeedback')
    if (feedbackService === undefined) throw new Error('source-unavailable')
    const matchingAssessments = assessments.filter(assessment => assessment.started.assessmentId === item.feedbackAssessmentId)
    if (matchingAssessments.length !== 1) throw new Error('source-unavailable')
    const assessment = matchingAssessments[0]!
    if (assessment.started.taskId !== item.sourceTaskId || assessment.result?.proof == null || !record(feedbackStandard)
      || feedbackStandard.assessmentId !== assessment.started.assessmentId
      || feedbackStandard.classification !== assessment.result.classification
      || sha256(feedbackStandard.criteria) !== sha256(assessment.result.supplementalCriteria)) throw new Error('source-unavailable')
    const feedbackMaterial = await feedbackService.materialForAssessment(assessment)
    if (sha256(feedbackMaterial.original) !== sha256(originalMaterial) || sha256(feedbackMaterial.answer) !== sha256(originalAnswer)
      || sha256(feedbackMaterial) !== assessment.started.materialDigest) throw new Error('source-unavailable')
    const { kind: _kind, assessmentId: _id, taskId: _task, proof: _proof, unavailableReason: _reason, scopeReview: _scopeReview, ...value } = assessment.result
    const recovered = await recoverConversationStructuredJudgment(ctx, assessment.result.proof, value)
    if (sha256(recovered.material) !== sha256(feedbackMaterial)) throw new Error('source-unavailable')
    const rawFeedbackIncludedInStudy = Object.hasOwn(feedbackStandard, 'originalFeedback')
    if (rawFeedbackIncludedInStudy && sha256(feedbackStandard.originalFeedback) !== sha256(feedbackMaterial.feedback)) throw new Error('source-unavailable')
    cases.push({ id: item.id, kind: 'source', materialDigest: item.materialDigest,
      originalTaskId: item.sourceTaskId, originalMaterial, originalAnswer, originalTaskReview, baseline, candidate,
      feedback: { assessmentId: assessment.started.assessmentId, originalFeedback: feedbackMaterial.feedback,
        supplementalCriteria: assessment.result.supplementalCriteria, studyStandard: feedbackStandard, rawFeedbackIncludedInStudy } })
  }
  const proposalGuidance = guidanceRule(study.candidate.candidateSnapshot, study.opened.family, study.opened.evaluationMode, study.opened.fileOutputKind)
  if (proposalGuidance === undefined) throw new Error('source-unavailable')
  const proposalValue = { guidance: proposalGuidance, ...(study.candidate.sourceUse === undefined ? {} : { sourceUse: study.candidate.sourceUse }) }
  const proposal = await recoverConversationStructuredJudgment(ctx, study.candidate.proposalProof, proposalValue)
  if (!record(proposal.material)) throw new Error('source-unavailable:proposal-identity')
  const historicalProposal = study.activation !== undefined && proposal.material.studyId === undefined && proposal.material.sourceTaskIds === undefined
  if (!historicalProposal && proposal.material.studyId !== study.opened.studyId) throw new Error('source-unavailable:proposal-identity')
  if (!historicalProposal && sha256(proposal.material.sourceTaskIds) !== sha256(study.opened.sourceTaskIds)) throw new Error('source-unavailable:proposal-tasks')
  if (proposal.material.family !== study.opened.family || proposal.material.failureCategory !== study.opened.failureCategory
    || proposal.material.currentGuidance !== (guidanceRule(study.opened.parentSnapshot, study.opened.family, study.opened.evaluationMode, study.opened.fileOutputKind) ?? '')) throw new Error('source-unavailable:proposal-context')
  if (proposal.modelConfigDigests.some(digest => digest !== study.opened.modelConfigDigest)) throw new Error('source-unavailable:proposal-model')
  if (!Array.isArray(proposal.material.sources) || proposal.material.sources.length !== 2) throw new Error('source-unavailable:proposal-sources')
  if (proposal.material.sources.some((source, index) => sha256(source) !== sha256(cases[index]!.baseline.task))) throw new Error('source-unavailable:proposal-source-material')
  return { schemaVersion: 'tianwen.guidance-review-packet.v1',
    reviewStatus: study.activation === undefined ? 'unreviewed' : 'diagnostic-historical',
    opened: study.opened, candidate: study.candidate, decision: study.decision, activation: study.activation,
    currentConsent, currentSupport, proposalMaterial: proposal.material, cases }
}
