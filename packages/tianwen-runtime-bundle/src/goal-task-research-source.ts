import type { Context } from '@deepseek-ai/cordis'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import { conversationExternalInputsDigest } from '@tianwen/evolution/external-check'
import { guidanceInputDigest, guidanceFileInputIdentity } from '@tianwen/evolution/guidance'
import { sha256 } from '@tianwen/evolution/learning-intake'
import { hasCurrentConversationQuality, type ConversationFileMaterial, type ConversationQualityContract } from '@tianwen/evolution/content-review'
import type { GoalTaskOutcomeObservation } from '@tianwen/evolution'
import type { GoalTaskResearchSource, GoalTaskResearchSourceInput } from '@tianwen/evolution/goal-task-research'
import type { GuidanceStudyOpened } from '@tianwen/evolution/guidance'
import { readGoalTaskOutcomeMaterial } from './goal-task-material.js'
import { goalTaskContentReviewMaterial } from './goal-task-content-review.js'
import { verifyConversationOriginalReviewCheck } from './conversation-claim-review.js'
import { readLongGoal, readTianwenTaskAttemptProjection, goalTaskAcceptanceGoalDigest } from './long-goal.js'

export interface NativeGoalTaskStudyMaterial {
  readonly sourceKind: 'native-goal-task'
  readonly prompt: string
  readonly criteria: readonly string[]
  readonly qualityContract: ConversationQualityContract
  readonly files?: ConversationFileMaterial
}

/** Original requirements only: no previous answer, model result, method or synthetic user event. */
async function recoverSource(ctx: Context, stateRoot: string, outcome: GoalTaskOutcomeObservation, includeInputIdentity = true) {
  const material = await readGoalTaskOutcomeMaterial(ctx, { stateRoot, outcome: outcome.input })
  const b = material.preparation, snapshot = material.requirementsSnapshot, usage = material.methodUsage
  const end = material.events.at(-1)
  if (end?.type !== 'turn/end' || end.data.reason.kind !== 'completed'
    || material.events.some(event => event.type === 'request/header' && event.seq >= b.headerSeq
      && sha256(event.data.header.config) !== b.modelConfigDigest)) return
  if (snapshot === undefined || b.contentReview?.qualityContract === undefined || b.method === undefined
    || usage === undefined || usage.withdrawnAtSeq !== undefined) return
  const scope = b.method.scope, files = b.contentReview.files
  if (scope.evaluationMode === 'local-files' ? files?.outputKind !== scope.fileOutputKind : files !== undefined) return
  const goal = readLongGoal(stateRoot, outcome.input.goalId)
  if (goal.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('original Goal research source unavailable')
  const started = goal.tianwenEvents?.find(event => event.type === 'task-content-review-started'
    && event.taskId === outcome.input.taskId && event.epoch === outcome.input.epoch)
  const finished = goal.tianwenEvents?.find(event => event.type === 'task-content-review-finished'
    && event.taskId === outcome.input.taskId && event.epoch === outcome.input.epoch)
  if (started?.type !== 'task-content-review-started' || finished?.type !== 'task-content-review-finished'
    || finished.result.status !== 'reviewed') return
  const original = goalTaskContentReviewMaterial(material, started.fileResult)
  if (started.preparationDigest !== sha256(b) || started.materialDigest !== material.result.materialDigest
    || started.reviewMaterialDigest !== sha256(original) || finished.startDigest !== sha256(started)) throw new Error('original Goal research content binding changed')
  for (const check of finished.result.checks) await verifyConversationOriginalReviewCheck(ctx, check, original, b.modelConfigDigest)
  const prompt = JSON.stringify({ protocol: 'tianwen.native-goal-study-input.v1',
    originalCommand: material.source.data.args!,
    goal: { objective: snapshot.goal.objective, context: snapshot.goal.context, successCriteria: snapshot.goal.successCriteria },
    delegatedTask: snapshot.task.objective,
    ...(snapshot.permissionMode === undefined ? {} : { permissionMode: snapshot.permissionMode }) })
  const studyMaterial: NativeGoalTaskStudyMaterial = { sourceKind: 'native-goal-task', prompt,
    criteria: [snapshot.task.objective, b.requiredCondition, ...(snapshot.goal.successCriteria === null ? [] : [snapshot.goal.successCriteria])],
    qualityContract: b.contentReview.qualityContract, ...(files === undefined ? {} : { files }) }
  const input: GoalTaskResearchSourceInput = { sourceKind: 'native-goal-task', sourceId: outcome.sourceId,
    outcomeInputDigest: outcome.inputDigest, scopeKey: usage.scopeKey, family: scope.family, evaluationMode: scope.evaluationMode,
    ...(scope.evaluationMode === 'local-files' ? { fileOutputKind: scope.fileOutputKind, fileInputsDigest: conversationExternalInputsDigest(files!.entries) } : {}),
    behaviorVersion: usage.version, qualityContract: studyMaterial.qualityContract,
    sessionLifecycleFingerprint: material.sessionLifecycleFingerprint,
    assistantMessageIds: material.events.flatMap(event => event.type === 'assistant/message' && isAppendSurfaceEvent(event) ? [String(event.data.message.id)] : []),
    inputDigest: guidanceInputDigest(prompt, files),
    ...(includeInputIdentity ? { inputIdentityDigest: files === undefined ? guidanceInputDigest(prompt) : guidanceFileInputIdentity(prompt,files) } : {}),
    materialDigest: sha256(studyMaterial), reviewMaterialDigest: sha256(original), checks: finished.result.checks }
  const header = material.events.find(event => event.type === 'request/header' && event.seq === b.headerSeq)
  if (header?.type !== 'request/header' || sha256(header.data.header.config) !== outcome.input.modelConfigDigest) throw new Error('original Goal study model unavailable')
  return { input, studyMaterial, original, callConfig: structuredClone(header.data.header.config), preparation: b }
}

/** Shared zero-call restoration for the existing research owner and original finish lane. */
export async function recoverGoalTaskResearchSource(ctx: Context, stateRoot: string, source: GoalTaskResearchSource) {
  const recovered = await recoverSource(ctx, stateRoot, source.outcome, source.input.inputIdentityDigest !== undefined)
  if (recovered === undefined || sha256(recovered.input) !== source.inputDigest || sha256(source.input) !== source.inputDigest) {
    throw new Error('native Goal research source differs from its original Task material')
  }
  return recovered
}

/** The same frozen reference boundary for the original study owner and read-only packet. */
export async function recoverGoalGuidanceSource(ctx: Context, stateRoot: string | undefined, opened: GuidanceStudyOpened, sourceId: string) {
  const reference = opened.nativeGoalSources?.find(item=>item.sourceId === sourceId)
  const source = ctx.tianwenEvolution.listGoalTaskResearchSources().find(item=>item.sourceId === sourceId)
  if (stateRoot === undefined || reference === undefined || source === undefined || source.inputDigest !== reference.inputDigest) throw new Error('source-unavailable')
  return { source, ...await recoverGoalTaskResearchSource(ctx,stateRoot,source) }
}

/** Same Goal finishing operation; publishing does not schedule another ordinary task or re-evaluate it. */
export async function publishGoalTaskResearchSources(ctx: Context, input: { stateRoot: string; goalId: string; signal: AbortSignal }): Promise<void> {
  const authorized = (revision: number) => {
    const consent = ctx.tianwenEvolution.getLearningAnalysisConsent()
    return !input.signal.aborted && consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' && consent.revision === revision
  }
  for (const outcome of ctx.tianwenEvolution.listGoalTaskOutcomes().filter(item => item.input.goalId === input.goalId)) {
    if (!authorized(outcome.input.consentRevision)) continue
    const previous = ctx.tianwenEvolution.listGoalTaskResearchSources().find(item => item.sourceId === outcome.sourceId)
    const recovered = await recoverSource(ctx, input.stateRoot, outcome, previous === undefined || previous.input.inputIdentityDigest !== undefined)
    input.signal.throwIfAborted()
    if (recovered === undefined || !authorized(outcome.input.consentRevision)) continue
    if (previous !== undefined) {
      if (previous.inputDigest !== sha256(recovered.input)) throw new Error('saved original Goal research source changed')
      continue
    }
    if (!hasCurrentConversationQuality(recovered.input.qualityContract)) continue
    const goal = readLongGoal(input.stateRoot, input.goalId), b = recovered.preparation
    if (goal.schemaVersion !== 'tianwen.long-goal.v3') throw new Error('original Goal research binding unavailable')
    const task = goal.tasks.find(item => item.id === outcome.input.taskId)
    const attempt = readTianwenTaskAttemptProjection(goal, outcome.input.taskId).attempts.at(-1)
    const prepared = goal.tianwenEvents?.find(event => event.type === 'task-acceptance-prepared'
      && event.taskId === outcome.input.taskId && event.binding.epoch === b.epoch)
    if (sha256(task) !== b.taskDigest || goalTaskAcceptanceGoalDigest(goal) !== b.goalDigest
      || attempt?.epoch !== b.epoch || attempt.permissionFingerprint !== b.permissionFingerprint
      || prepared?.type !== 'task-acceptance-prepared' || sha256(prepared.binding) !== sha256(b)) {
      throw new Error('Goal requirements changed before original research source publication')
    }
    if (authorized(outcome.input.consentRevision)) ctx.tianwenEvolution.recordGoalTaskResearchSource(recovered.input)
  }
}
