import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { MessageId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import { TianwenConversationFeedbackService } from '../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { type ConversationTask } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import {
  ConversationFeedbackState, conversationFeedbackAssessmentId, parseConversationFeedbackRecord,
  type ConversationFeedbackStarted, type ConversationFeedbackResult,
} from '../../packages/tianwen-evolution/src/conversation-feedback.js'

const proof = { sessionId: 'independent-assessor', sessionDigest: sha256('assessor'), requestDigest: sha256('assessment request') }
function task(taskId = 'target', turn = 1): ConversationTask {
  const admission = {
    kind: 'task-admitted' as const, taskId, proof: { ...proof, sessionId: 'original-admission' }, unavailableReason: null,
    decision: { kind: 'task' as const, objective: 'Summarize the pilot result.', criteria: ['Preserve the duration.'],
      family: 'summarization' as const, evaluationMode: 'text' as const, relatedTaskId: null, feedback: null },
  }
  return {
    source: { kind: 'task-started', taskId, sessionId: 'main', sessionLifecycleFingerprint: sha256('lifecycle'),
      turn, startSeq: turn * 10, userMessageIds: [`request-${turn}`], requestDigest: sha256(`request-${turn}`),
      contextDigest: sha256('context'), scopeKey: 'scope', consentRevision: 1, behaviorVersion: sha256('behavior') },
    recordedAt: '2026-09-07T00:00:00.000Z', admission,
    completion: { kind: 'task-finished', taskId, endSeq: turn * 10 + 8, status: 'completed',
      assistantMessageIds: [`answer-${turn}`], resultDigest: sha256(`answer-${turn}`), evidenceIds: [] },
    review: { kind: 'task-reviewed', taskId, admissionDigest: sha256(admission), resultDigest: sha256(`answer-${turn}`),
      verdict: 'met', category: null, explanation: 'The duration is preserved.', evidenceQuotes: [], proof: { ...proof, sessionId: 'original-review' }, unavailableReason: null },
  }
}
function started(target = task()): ConversationFeedbackStarted {
  const source = { kind: 'native' as const, sessionId: target.source.sessionId,
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint,
    messageId: target.completion!.assistantMessageIds[0]!, feedbackVersion: 'v1', feedbackFingerprint: sha256('negative: missing pilot') }
  return { kind: 'feedback-assessment-started', taskId: target.source.taskId,
    assessmentId: conversationFeedbackAssessmentId({ taskId: target.source.taskId, source }), source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest,
    materialDigest: sha256('frozen original input, answer, and feedback'), consentRevision: 1 }
}
function assessed(start = started()): ConversationFeedbackResult {
  return { kind: 'feedback-assessed', assessmentId: start.assessmentId, taskId: start.taskId,
    classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Preserve the pilot scope.'],
    explanation: 'The source explicitly limits the result to the pilot.', evidenceQuotes: ['pilot'], proof, unavailableReason: null }
}
function put(state: ConversationFeedbackState, record: ConversationFeedbackStarted | ConversationFeedbackResult, tasks = [task()]) {
  state.validate(record, tasks)
  state.apply(record, '2026-09-07T00:00:01.000Z')
}

describe('immutable natural task feedback assessments', () => {
  it('adds feedback criteria beside an original met review without changing the target', () => {
    const original = task()
    const before = structuredClone(original)
    const state = new ConversationFeedbackState()
    put(state, started(original), [original])
    put(state, assessed(), [original])
    expect(state.list('target')[0]).toMatchObject({ result: { classification: 'attributable-problem', supplementalCriteria: ['Preserve the pilot scope.'] } })
    expect(original).toEqual(before)
    expect(original.review?.verdict).toBe('met')
    const copy = state.list()
    ;(copy[0]!.result!.supplementalCriteria as string[]).push('mutated')
    expect(state.list()[0]!.result!.supplementalCriteria).toEqual(['Preserve the pilot scope.'])
  })

  it('fences native feedback to the exact target answer, lifecycle, admission, and consent revision', () => {
    const target = task()
    for (const changed of [
      { ...started(target), admissionDigest: sha256('different criteria') },
      { ...started(target), resultDigest: sha256('another answer') },
      { ...started(target), consentRevision: 2 },
      { ...started(target), source: { ...started(target).source, messageId: 'unrelated-answer' } },
      { ...started(target), source: { ...started(target).source, sessionLifecycleFingerprint: sha256('reused session') } },
    ]) {
      const input = { ...changed, assessmentId: conversationFeedbackAssessmentId(changed) }
      expect(() => new ConversationFeedbackState().validate(input, [target])).toThrow()
    }
  })

  it('accepts a later feedback-only turn and rejects a different lifecycle or an invented source link', () => {
    const target = task()
    const later = task('correction', 2)
    const correction: ConversationTask = { ...later, admission: { ...later.admission!, decision: {
      ...later.admission!.decision!, kind: 'conversation', relatedTaskId: 'target',
      feedback: { kind: 'correction', quote: 'You omitted the pilot scope.', category: 'source-fidelity' },
    } } }
    const source = { kind: 'natural' as const, sourceTaskId: 'correction', sourceAdmissionDigest: sha256(correction.admission) }
    const input = { ...started(target), source, assessmentId: conversationFeedbackAssessmentId({ taskId: 'target', source }) }
    expect(() => new ConversationFeedbackState().validate(input, [target, correction])).not.toThrow()
    expect(() => new ConversationFeedbackState().validate(input, [target, { ...correction,
      source: { ...correction.source, sessionLifecycleFingerprint: sha256('other lifecycle') } }])).toThrow()
    expect(() => new ConversationFeedbackState().validate({ ...input, source: { ...source, sourceAdmissionDigest: sha256('edited correction') } }, [target, correction])).toThrow()
  })

  it('deduplicates by immutable source version and never replaces a completed assessment', () => {
    const state = new ConversationFeedbackState()
    const start = started()
    put(state, start)
    expect(state.existing(start)).toEqual(start)
    expect(() => put(state, { ...start, materialDigest: sha256('changed') })).toThrow(/conflict|immutable/i)
    put(state, assessed(start))
    expect(() => put(state, { ...assessed(start), classification: 'inconclusive' })).toThrow()
    const source = { ...start.source, feedbackVersion: 'v2' }
    expect(conversationFeedbackAssessmentId({ taskId: 'target', source })).not.toBe(start.assessmentId)
  })

  it('requires independent evidence for a problem and distinguishes future preference from changed requirements', () => {
    expect(() => parseConversationFeedbackRecord({ ...assessed(), proof: null })).toThrow()
    expect(() => parseConversationFeedbackRecord({ ...assessed(), supplementalCriteria: [] })).toThrow()
    expect(() => parseConversationFeedbackRecord({ ...assessed(), evidenceQuotes: [] })).toThrow()
    expect(parseConversationFeedbackRecord({ ...assessed(), classification: 'preference', category: 'user-preference' }))
      .toMatchObject({ classification: 'preference', supplementalCriteria: ['Preserve the pilot scope.'] })
    expect(() => parseConversationFeedbackRecord({ ...assessed(), classification: 'requirement-change' })).toThrow()
    expect(parseConversationFeedbackRecord({ ...assessed(), classification: 'inconclusive', category: null,
      supplementalCriteria: [], evidenceQuotes: [], proof: null, unavailableReason: 'cancelled' }))
      .toMatchObject({ classification: 'inconclusive', unavailableReason: 'cancelled' })
    const state = new ConversationFeedbackState()
    put(state, started())
    expect(() => put(state, { ...assessed(), proof: task().review!.proof })).toThrow(/independent/i)
  })
})

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const structured = (value: object) => toolCallResponse('feedback-judgment', 'structured_output', value)
const evidenceResponse = (value: Record<string, unknown> & { evidenceQuotes: readonly string[] }) => (request: GenerateOptions) => {
  const schema = request.tools?.find(tool => tool.name === 'structured_output')?.parameters as ObjectJsonSchema | undefined
  const choices = schema?.properties?.evidenceQuotes?.items?.enum ?? []
  return structured({ ...value, evidenceQuotes: value.evidenceQuotes.map(quote => {
    const raw = choices.find(item => typeof item === 'string' && item.includes(quote))
    expect(raw, `No raw evidence choice contains ${quote}`).toBeDefined()
    return raw
  }) })
}
const claimReviewResponse = auditedEvidenceResponse
const nativeAdmission = { kind: 'task', objective: 'Summarize the supplied pilot result.', criteria: ['Preserve the five-day duration.'],
  family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null }
const nativeReview = { verdict: 'met', category: null, explanation: 'The duration is preserved.', evidenceQuotes: ['5 days'] }
const nativeAssessment = { classification: 'attributable-problem', category: 'source-fidelity',
  supplementalCriteria: ['Retain the pilot-only scope.'], explanation: 'The request limits the duration to the pilot.', evidenceQuotes: ['pilot'] }
async function mount(script: Parameters<typeof mountFeedbackHarness>[1]) {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-feedback-tests' : '/tmp/tianwen-conversation-feedback-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'feedback-')); roots.push(root)
  const harness = await mountFeedbackHarness(root, script)
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationObserverService)
  await harness.ctx.plugin(TianwenMessageFeedbackBridgeService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('feedback-main'), meta: { cwd: root },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  handle.agent.followup(direct('Summarize this: the pilot took 5 days.'))
  await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
  return { ...harness, handle }
}

describe('native feedback assessment adapter', () => {
  it('uses exact native feedback after original met and marks its immutable assessment inactive after retraction', async () => {
    const harness = await mount([structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview), evidenceResponse(nativeAssessment)])
    try {
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
      const before = structuredClone(target)
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      const messageId = MessageId(target.completion!.assistantMessageIds.at(-1)!)
      const put = await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id, messageId,
        rating: 'negative', note: 'You omitted the pilot scope.', ifVersion: null })
      if (!put.ok) throw new Error('native feedback write failed')
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)[0]!
      expect(assessment).toMatchObject({ started: { source: { kind: 'native', feedbackVersion: String(put.value.version) } },
        result: { classification: 'attributable-problem', supplementalCriteria: ['Retain the pilot-only scope.'] } })
      expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]).toEqual(before)
      expect(assessment.result?.proof?.sessionId).not.toBe(target.review?.proof?.sessionId)
      await expect(harness.ctx.tianwenConversationFeedback.isAssessmentActive(assessment)).resolves.toBe(true)
      await harness.ctx.messageFeedback.delete({ sessionId: harness.handle.agent.session.id, messageId, ifVersion: put.value.version })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.whenIdle()
      await expect(harness.ctx.tianwenConversationFeedback.isAssessmentActive(assessment)).resolves.toBe(false)
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()).toEqual([assessment])
      expect(harness.adapter.requests).toHaveLength(5)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('waits for a feedback-only direct turn to persist before assessing a natural correction', async () => {
    let harness: Awaited<ReturnType<typeof mount>>
    harness = await mount([
      structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview),
      () => structured({ ...nativeAdmission, kind: 'conversation', criteria: [],
        relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
        feedback: { kind: 'correction', quote: 'You omitted the pilot scope.', category: 'source-fidelity' } }),
      textResponse('Thank you for pointing that out.'), evidenceResponse(nativeAssessment),
    ])
    try {
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      harness.handle.agent.followup(direct('You omitted the pilot scope.'))
      await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      const tasks = harness.ctx.tianwenEvolution.listConversationTasks()
      const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]!
      expect(tasks[1]?.admission?.decision?.kind).toBe('conversation')
      expect(assessment).toMatchObject({ started: { taskId: tasks[0]!.source.taskId,
        source: { kind: 'natural', sourceTaskId: tasks[1]!.source.taskId, sourceAdmissionDigest: sha256(tasks[1]!.admission) } },
        result: { classification: 'attributable-problem' } })
      expect(tasks[0]?.review?.verdict).toBe('met')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      expect(harness.adapter.requests).toHaveLength(7)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('does not accept a quote that appears only in generated criteria as user evidence', async () => {
    let rejectedRequest: GenerateOptions | undefined
    const harness = await mount([structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview),
      structured({ ...nativeAssessment, evidenceQuotes: ['Preserve the five-day duration.'] }), request => {
        rejectedRequest = request
        return textResponse('No valid evidence quote is available.')
      }])
    try {
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
      const messageId = MessageId(target.completion!.assistantMessageIds.at(-1)!)
      await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id, messageId,
        rating: 'negative', note: 'You omitted the pilot scope.', ifVersion: null })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      expect(rejectedRequest?.messages.flatMap(message => message.content).filter(block => block.type === 'tool-result'))
        .toEqual(expect.arrayContaining([expect.objectContaining({ toolCallId: 'feedback-judgment', isError: true,
          content: [{ type: 'text', text: expect.stringContaining('evidenceQuotes') }] })]))
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.result)
        .toMatchObject({ classification: 'inconclusive', supplementalCriteria: [], unavailableReason: 'invalid-judgment', proof: null })
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it.each(['replacement', 'later-append'] as const)('recovers natural feedback from its original bounded append despite a %s with the same message id', async mutation => {
    let harness: Awaited<ReturnType<typeof mount>>
    const correction = direct('You omitted the pilot scope.')
    harness = await mount([
      structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview),
      () => structured({ ...nativeAdmission, kind: 'conversation', criteria: [],
        relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
        feedback: { kind: 'correction', quote: 'You omitted the pilot scope.', category: 'source-fidelity' } }),
      () => {
        if (mutation === 'replacement') {
          const original = harness.handle.agent.session.events.find(event => event.type === 'user/message' && event.data.id === correction.id)
          if (original === undefined) throw new Error('original feedback event missing')
          harness.handle.agent.session.append('user/message', { ...direct('Unrelated replacement text.'), id: correction.id }, {
            surfaceOp: { op: 'replace', start: original.seq, end: original.seq }, sourceEventSeqs: [original.seq],
          })
        }
        return textResponse('Thank you for pointing that out.')
      },
      evidenceResponse(nativeAssessment),
    ])
    try {
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      harness.handle.agent.followup(correction)
      await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
      await harness.ctx.tianwenConversationFeedback.whenIdle()
      const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]
      expect(assessment?.result?.classification).toBe('attributable-problem')
      if (assessment === undefined) throw new Error('natural feedback assessment missing')
      if (mutation === 'later-append') {
        harness.handle.agent.session.append('user/message', { ...direct('Unrelated later input.'), id: correction.id }, { surfaceOp: 'append' })
        await harness.ctx.sessions.flush(harness.handle.agent.session)
      }
      await expect(harness.ctx.tianwenConversationFeedback.isAssessmentActive(assessment)).resolves.toBe(true)
      const material = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
      expect(material.feedback.request).toEqual([correction])
      expect(JSON.stringify(material)).not.toContain('Unrelated')
      expect(harness.adapter.requests).toHaveLength(7)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('cancels only the assessment child on disable and retains the original completed task', async () => {
    let harness: Awaited<ReturnType<typeof mount>>
    harness = await mount([structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview), request => {
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.result).toBeUndefined()
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.started.materialDigest).toMatch(/^sha256:/)
      harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      return evidenceResponse(nativeAssessment)(request)
    }])
    try {
      const original = structuredClone(harness.ctx.tianwenEvolution.listConversationTasks()[0]!)
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id,
        messageId: MessageId(original.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note: 'You omitted the pilot scope.', ifVersion: null })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.result)
        .toMatchObject({ classification: 'inconclusive', unavailableReason: 'cancelled' })
      expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]).toEqual(original)
      expect(harness.ctx.agents.get(harness.handle.agent.session.id)).toBe(harness.handle.agent)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('recovers a started assessment without rerunning a lost native judgment result', async () => {
    const harness = await mount([structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview), evidenceResponse(nativeAssessment)])
    try {
      const fiber = harness.ctx.plugin(TianwenConversationFeedbackService)
      await fiber
      const record = harness.ctx.tianwenEvolution.recordConversationFeedback.bind(harness.ctx.tianwenEvolution)
      const fault = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationFeedback').mockImplementation(input => {
        if (input.kind === 'feedback-assessed') throw new Error('simulated result append failure')
        return record(input)
      })
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
      await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id,
        messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note: 'You omitted the pilot scope.', ifVersion: null })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.result).toBeUndefined()
      fault.mockRestore()
      await fiber.dispose()
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      await harness.ctx.tianwenConversationFeedback.whenIdle()
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments()[0]?.result)
        .toMatchObject({ classification: 'inconclusive', unavailableReason: 'cancelled' })
      expect(harness.adapter.requests).toHaveLength(5)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('rejects oversize exact native feedback instead of truncating it into an assessment call', async () => {
    const harness = await mount([structured(nativeAdmission), textResponse('It took 5 days.'), claimReviewResponse(nativeReview), claimReviewResponse(nativeReview)])
    try {
      await harness.ctx.plugin(TianwenConversationFeedbackService)
      const target = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
      const marker = 'OVERSIZE-DIRECT-FEEDBACK-MARKER:'
      const note = `${marker}${'x'.repeat(96 * 1024)}`
      const put = await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id,
        messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note, ifVersion: null })
      const requestCount = harness.adapter.requests.length
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('feedback-main')
      await harness.ctx.tianwenConversationFeedback.scheduleForSession('feedback-main')
      expect(put).toEqual({ ok: false, error: { code: 'note-too-large', maxBytes: 8192, actualBytes: Buffer.byteLength(note, 'utf8') } })
      expect(harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)).toEqual([])
      expect(harness.adapter.requests).toHaveLength(requestCount)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })
})
