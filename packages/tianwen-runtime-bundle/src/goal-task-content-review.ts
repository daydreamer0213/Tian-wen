import type { Context } from '@deepseek-ai/cordis'
import { SessionId, isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import { sha256 } from '@tianwen/evolution/learning-intake'
import type { ConversationFileTrialOutput } from '@tianwen/evolution/content-review'
import { CAPTURED_FILE_FACTS_TOOL } from '@tianwen/evolution/content-review'
import type { GoalTaskOutcomeMaterial } from './goal-task-material.js'
import { parseGoalTaskContentReviewPlan } from './goal-task-acceptance-contract.js'
import { appendGoalTaskContentReview, readLongGoal, goalTaskAcceptanceGoalDigest, readTianwenTaskAttemptProjection } from './long-goal.js'
import { readGoalTaskOutcomeMaterial } from './goal-task-material.js'
import { readConversationFile } from './conversation-file-material.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationOriginalReviewCheck } from './conversation-claim-review.js'
import type { GoalTaskContentReviewEvent } from './goal-task-acceptance-contract.js'
import type { LongGoalRecordV3 } from './long-goal-contract.js'
import { projectNativeFileActions, type ConversationFileExecutionEvidence } from './conversation-task-material.js'

/** A native Goal evidence view, never a persisted ConversationTask or a user-message event. */
export function goalTaskContentReviewMaterial(material: GoalTaskOutcomeMaterial, fileResult?: ConversationFileTrialOutput) {
  const snapshot = material.requirementsSnapshot
  if (snapshot === undefined || material.preparation.contentReview === undefined) throw new Error('original content review plan unavailable')
  const plan = parseGoalTaskContentReviewPlan(material.preparation.contentReview)
  if ((plan.files !== undefined) !== (fileResult !== undefined)) throw new Error('file-evidence-unavailable')
  if (plan.files === undefined && material.events.some(event => event.type === 'tool/call'
    && ['read', 'write', 'edit'].includes(event.data.name))) throw new Error('file-evidence-unavailable')
  const conversation = material.events.flatMap(event => event.type === 'assistant/message' && isAppendSurfaceEvent(event)
    ? [{ id: String(event.data.message.id), role: 'assistant' as const, content: event.data.message.content }] : [])
  const fileExecution: ConversationFileExecutionEvidence | undefined = plan.files === undefined || !material.events.some(event => event.type === 'tool/call') ? undefined
    : projectNativeFileActions(material.events, material.result.endSeq, plan.files)
  const nonFileCalls = new Set(material.events.filter(event => event.type === 'tool/call'
    && !['read', 'write', 'edit', CAPTURED_FILE_FACTS_TOOL].includes(event.data.name)).map(event => event.type === 'tool/call' ? String(event.data.callId) : ''))
  return {
    sourceKind: 'native-goal-task' as const,
    source: {
      // This is the actual command text, with its command event retained below; not a new SDK user/message.
      request: [{ role: 'user' as const, content: [{ type: 'text' as const, text: material.source.data.args! }] }], context: [],
      objective: snapshot.task.objective,
      criteria: [material.preparation.requiredCondition, ...(snapshot.goal.successCriteria === null ? [] : [snapshot.goal.successCriteria])],
      nativeGoal: { command: material.source, goal: snapshot.goal, task: snapshot.task,
        ...(material.methodUsage === undefined ? {} : { methodUsage: material.methodUsage }),
        preparationDigest: sha256(material.preparation), materialDigest: material.result.materialDigest,
        nativeActions: material.events.filter(event => event.type === 'tool/call'),
        delegation: material.events.filter(event => event.type === 'user/message') },
      ...(plan.files === undefined ? {} : { files: plan.files,
        nativeGoalToolResults: material.events.filter(event => event.type === 'tool/result' && nonFileCalls.has(String(event.data.message.source.callId))) }),
      ...(fileExecution === undefined ? {} : { fileExecution }),
    },
    conversation,
    // File contents come from the frozen preimage/final capture. Readback is not a factual source.
    toolEvidence: plan.files === undefined ? material.events.filter(event => event.type === 'tool/result') : [],
    ...(plan.files === undefined ? {} : { evaluationMode: 'local-files' as const, fileResult }),
  }
}

/** Called only in the existing serialized Goal finishing lane. No second loop/store. */
export async function finishGoalTaskContentReviews(ctx: Context, input: { stateRoot: string; goalId: string; signal: AbortSignal }): Promise<void> {
  const initial = readLongGoal(input.stateRoot, input.goalId)
  if (initial.schemaVersion !== 'tianwen.long-goal.v3') return
  const read = () => readLongGoal(input.stateRoot, input.goalId) as LongGoalRecordV3
  for (const prepared of initial.tianwenEvents ?? []) {
    if (prepared.type !== 'task-acceptance-prepared' || prepared.binding.contentReview === undefined || prepared.binding.learningConsentRevision === undefined) continue
    const b = prepared.binding, revision = b.learningConsentRevision!
    const authorized = () => {
      const consent = ctx.tianwenEvolution.getLearningAnalysisConsent()
      return !input.signal.aborted && consent?.enabled === true && consent.policyVersion === 'tianwen-auto-analysis.v3' && consent.revision === revision
    }
    if (!authorized()) { if (input.signal.aborted) return; continue }
    const outcome = ctx.tianwenEvolution.listGoalTaskOutcomes().find(item => item.input.goalId === initial.id
      && item.input.taskId === prepared.taskId && item.input.epoch === b.epoch)?.input
    if (outcome === undefined) continue
    const events = read().tianwenEvents ?? []
    const priorStart = events.find(event => event.type === 'task-content-review-started' && event.taskId === prepared.taskId && event.epoch === b.epoch)
    const priorFinish = events.find(event => event.type === 'task-content-review-finished' && event.taskId === prepared.taskId && event.epoch === b.epoch)
    const append = (event: GoalTaskContentReviewEvent) => {
      const latest = read()
      const task = latest.tasks.find(item => item.id === prepared.taskId)
      const attempt = readTianwenTaskAttemptProjection(latest, prepared.taskId).attempts.at(-1)
      const finished = latest.tianwenEvents?.find(item => item.type === 'task-acceptance-finished' && item.taskId === prepared.taskId && item.epoch === b.epoch)
      if (!authorized() || goalTaskAcceptanceGoalDigest(latest) !== b.goalDigest || sha256(task) !== b.taskDigest
        || attempt?.epoch !== b.epoch || attempt.permissionFingerprint !== b.permissionFingerprint
        || finished?.type !== 'task-acceptance-finished' || finished.materialDigest !== outcome.materialDigest
        || sha256(latest.tianwenEvents?.find(item => item.type === 'task-acceptance-prepared' && item.taskId === prepared.taskId && item.binding.epoch === b.epoch)) !== sha256(prepared)) throw new Error('original Goal content review binding changed')
      appendGoalTaskContentReview({ stateRoot: input.stateRoot, longGoalId: initial.id, expectedRevision: latest.revision, taskId: prepared.taskId, event })
    }
    const original = async () => {
      const material = await readGoalTaskOutcomeMaterial(ctx, { stateRoot: input.stateRoot, outcome })
      input.signal.throwIfAborted()
      const latest = read(), task = latest.tasks.find(item => item.id === prepared.taskId)
      const attempt = readTianwenTaskAttemptProjection(latest, prepared.taskId).attempts.at(-1)
      if (!authorized() || goalTaskAcceptanceGoalDigest(latest) !== b.goalDigest || sha256(task) !== b.taskDigest
        || attempt?.epoch !== b.epoch || attempt.permissionFingerprint !== b.permissionFingerprint
        || sha256(material.preparation) !== sha256(b)) throw new Error('original Goal content review binding unavailable')
      return material
    }
    if (priorFinish?.type === 'task-content-review-finished') {
      if (priorFinish.result.status === 'reviewed') {
        if (priorStart?.type !== 'task-content-review-started') throw new Error('original content review start unavailable')
        // This is read-only verification of a saved judgment, not a new decision under later requirements.
        const savedMaterial = await readGoalTaskOutcomeMaterial(ctx, { stateRoot: input.stateRoot, outcome })
        input.signal.throwIfAborted()
        const material = goalTaskContentReviewMaterial(savedMaterial, priorStart.fileResult)
        if (sha256(material) !== priorStart.reviewMaterialDigest) throw new Error('original content review material changed')
        for (const check of priorFinish.result.checks) await verifyConversationOriginalReviewCheck(ctx, check, material, b.modelConfigDigest)
      }
      continue
    }
    if (priorStart?.type === 'task-content-review-started') {
      // A lost native review execution is not permission to issue it again.
      if (authorized()) append({ type: 'task-content-review-finished', taskId: prepared.taskId, epoch: b.epoch,
        startDigest: sha256(priorStart), result: { status: 'unverifiable', detail: 'Original content review interrupted; no new review request.' } })
      continue
    }
    let start: Extract<GoalTaskContentReviewEvent, { type: 'task-content-review-started' }>
    let view: ReturnType<typeof goalTaskContentReviewMaterial> | undefined
    let material: GoalTaskOutcomeMaterial | undefined
    let failure: unknown
    let fileResult: ConversationFileTrialOutput | undefined
    try {
      material = await original()
      if (b.contentReview!.files !== undefined) {
        const files = await Promise.all(b.contentReview!.files.entries.map(entry => readConversationFile(b.contentReview!.files!.cwd, entry.path)))
        const answer = material.events.flatMap(event => event.type === 'assistant/message' && isAppendSurfaceEvent(event)
          ? event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []) : []).join('')
        const output = { answer, files }
        fileResult = { ...output, outputDigest: sha256(output) }
      }
      view = goalTaskContentReviewMaterial(material, fileResult)
      projectClaimEvidence(view)
    } catch (error) { failure = error; view = undefined; fileResult = undefined }
    if (!authorized()) { if (input.signal.aborted) return; continue }
    start = { type: 'task-content-review-started', taskId: prepared.taskId, epoch: b.epoch,
      preparationDigest: sha256(b), materialDigest: outcome.materialDigest, reviewMaterialDigest: view === undefined ? null : sha256(view),
      ...(fileResult === undefined ? {} : { fileResult }) }
    append(start)
    let result: Extract<GoalTaskContentReviewEvent, { type: 'task-content-review-finished' }>['result']
    try {
      if (failure !== undefined) throw failure
      const parent = ctx.agents.get(SessionId(outcome.origin.sessionId))
      const header = material!.events.find(event => event.seq === b.headerSeq)
      if (parent === undefined || header?.type !== 'request/header') throw new Error('original content review parent or model unavailable')
      const label = `Goal Task content ${initial.id}:${prepared.taskId}:${b.epoch}`
      const offRequest = ctx.on('llm/stream', async function* (request, next) {
        const agent = request.sessionId === undefined ? undefined : ctx.agents.get(SessionId(String(request.sessionId)))
        if (agent?.session.header.origin === 'subagent' && String(agent.session.header.parentSession) === String(parent.session.id)
          && agent.session.events.some(event => event.type === 'subagent/descriptor' && event.data.label?.startsWith(label) === true)) await original()
        yield* next()
      }, { prepend: true })
      let reviewed: Awaited<ReturnType<typeof runConversationClaimReview>>
      try { reviewed = await runConversationClaimReview(ctx, parent, { label,
        material: view!, evidence: projectClaimEvidence(view).items.map(item => item.text), signal: input.signal,
        callConfig: header.data.header.config, beforeCall: async () => { await original() } }) } finally { offRequest() }
      for (const check of reviewed.reviewChecks) await verifyConversationOriginalReviewCheck(ctx, check, view, b.modelConfigDigest)
      await original()
      result = { status: 'reviewed', checks: reviewed.reviewChecks }
    } catch (error) { result = { status: 'unverifiable', detail: (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'unavailable' } }
    if (!authorized()) { if (input.signal.aborted) return; continue }
    append({ type: 'task-content-review-finished', taskId: prepared.taskId, epoch: b.epoch, startDigest: sha256(start), result })
  }
}
