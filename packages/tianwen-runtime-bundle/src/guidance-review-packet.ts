import type { Context } from '@deepseek-ai/cordis'
import { conversationReviewConsensus, guidanceRule, guidanceVersion, sha256, type GuidanceArmRecord, type GuidanceStudy } from '@tianwen/evolution'
import { recoverConversationJudgmentRequest, recoverConversationTrial } from './conversation-judgment.js'
import { verifyConversationClaimReviewCheck } from './conversation-claim-review.js'

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
