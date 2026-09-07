import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { MessageId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionId, SkillRegistry, applySkillTool, createUserMessage, mountFeedbackHarness, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import { TianwenResearchSummaryAdmissionService } from '../../packages/tianwen-runtime-bundle/src/research-summary-admission.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const admission = { kind: 'task', objective: 'Summarize the supplied facts', criteria: ['Preserve all supplied facts'], family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null }
const review = { verdict: 'met', category: null, explanation: 'The facts are preserved.', evidenceQuotes: ['5 天'] }
const structured = (value: Record<string, unknown>) => toolCallResponse('judgment', 'structured_output', value)
const evidenceResponse = (value: Record<string, unknown> & { evidenceQuotes: readonly string[] }) => (request: GenerateOptions) => {
  const schema = request.tools?.find(tool => tool.name === 'structured_output')?.parameters as ObjectJsonSchema | undefined
  const choices = schema?.properties?.evidenceQuotes?.items?.enum ?? []
  return structured({ ...value, evidenceQuotes: value.evidenceQuotes.map(quote => {
    const raw = choices.find(item => typeof item === 'string' && item.includes(quote))
    expect(raw, `No raw evidence choice contains ${quote}`).toBeDefined()
    return raw
  }) })
}

async function mount(script: Parameters<typeof mountPersistentHarness>[1], policy = 'tianwen-auto-analysis.v3', feedback = false, legacy = false) {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'observer-')); roots.push(root)
  const harness = await (feedback ? mountFeedbackHarness(root, script) : mountPersistentHarness(join(root, 'sessions'), script))
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: policy as never })
  if (legacy) {
    await harness.ctx.plugin(SkillRegistry); await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(TianwenResearchSummaryAdmissionService)
  }
  await harness.ctx.plugin(TianwenConversationObserverService)
  if (feedback) await harness.ctx.plugin(TianwenMessageFeedbackBridgeService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('ordinary-chat'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  return { ...harness, handle }
}

it('keeps an admitted legacy turn in its own route while observing a later natural follow-up with its context', async () => {
  const original = '/research-summary\n<research_packet>\n[F:days|required] The pilot takes 5 days.\n</research_packet>'
  const harness = await mount([
    textResponse('试点预计 5 天完成。'),
    request => {
      expect(JSON.stringify(request.messages)).toContain('试点预计 5 天完成。')
      return structured(admission)
    }, textResponse('试点要 5 天。'), evidenceResponse(review),
  ], 'tianwen-auto-analysis.v3', false, true)
  try {
    harness.handle.agent.followup(direct(original))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.getRunBindingBySessionId('ordinary-chat')?.scopeKey).toBe('project:tianwen/capability:research-summary')
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toEqual([])
    harness.handle.agent.followup(direct('把刚才那句话缩短一点。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const [task] = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(task?.source.turn).toBe(2)
    expect(task?.review?.verdict).toBe('met')
    const material = await recoverConversationTaskMaterial(harness.ctx, task!)
    expect(JSON.stringify(material.context)).toContain('试点预计 5 天完成。')
    expect(harness.adapter.requests).toHaveLength(4)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('captures ordinary requests in two native turns before each answer and reviews automatically', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  let boundBeforeAnswer = false
  harness = await mount([
    structured(admission),
    () => {
      const tasks = harness.ctx.tianwenEvolution.listConversationTasks('ordinary-chat')
      expect(tasks).toHaveLength(1); expect(tasks[0]?.admission?.decision?.criteria).toEqual(admission.criteria)
      expect(tasks[0]?.admission).toMatchObject({ qualityContract: { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host' } })
      boundBeforeAnswer = tasks[0]?.models?.[0]?.modelConfigDigest === sha256({ provider: 'tianwen-probe', model: 'scripted' })
      return textResponse('预计 5 天完成。')
    }, evidenceResponse(review),
    structured({ ...admission, relatedTaskId: null }), textResponse('需要 5 天。'), evidenceResponse(review),
  ])
  try {
    for (const message of ['帮我概括一下：预计 5 天完成。', '再整理这段：需要 5 天。']) {
      harness.handle.agent.followup(direct(message))
      await harness.handle.agent.whenIdle()
      await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks('ordinary-chat')
    expect(boundBeforeAnswer).toBe(true)
    expect(tasks[1]?.models).toHaveLength(1)
    expect(tasks[1]?.models?.[0]?.headerSeq).toBe(tasks[0]?.models?.[0]?.headerSeq)
    expect(tasks.map(task => task.source.turn)).toEqual([1, 2])
    expect(tasks.map(task => task.review?.verdict)).toEqual(['met', 'met'])
    const recovered = await recoverConversationTaskMaterial(harness.ctx, tasks[0]!)
    expect(recovered).toHaveProperty('qualityContract', tasks[0]!.admission!.qualityContract)
    expect(recovered.criteria).toEqual(admission.criteria)
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('tianwen.conversation-quality.v1')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('self-contained summaries, translations and rewrites')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('Writing is not automatically subjective')
    expect(JSON.stringify(harness.adapter.requests[2]?.messages)).toContain('tianwen.conversation-quality.v1')
    expect(tasks[0]?.source.taskId).not.toBe(tasks[1]?.source.taskId)
    expect(harness.adapter.requests).toHaveLength(6)
    expect(harness.adapter.requests[0]?.tools?.[0]?.parameters).toMatchObject({
      type: 'object', additionalProperties: false,
      required: ['kind', 'objective', 'criteria', 'family', 'evaluationMode', 'relatedTaskId', 'feedback'],
      properties: { kind: { type: 'string', enum: ['task', 'conversation'] }, relatedTaskId: { type: 'null' } },
    })
    expect(harness.adapter.requests[3]?.tools?.[0]?.parameters).toMatchObject({
      properties: { relatedTaskId: { oneOf: [{ type: 'string', enum: [tasks[0]!.source.taskId] }, { type: 'null' }] } },
    })
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toHaveLength(2)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not analyze ordinary conversations under the earlier narrower consent', async () => {
  const harness = await mount([textResponse('普通回答')], 'tianwen-auto-analysis.v2')
  try {
    harness.handle.agent.followup(direct('请帮我整理这段话'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toEqual([])
    expect(harness.adapter.requests).toHaveLength(1)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['correction', 'preference'] as const)('keeps %s linked to the earlier answer and states actual learning status before the main reply', async kind => {
  let harness: Awaited<ReturnType<typeof mount>>
  const quote = kind === 'correction' ? '你漏了试点范围' : '以后都保留试点范围'
  let statusBeforeAnswer = false
  let feedbackMessages = ''
  let feedbackPlugins: string[] = []
  let nextTurnPlugins: string[] = []
  const currentPlugins = () => {
    const events = harness.handle.agent.session.events
    const boundary = events.findLast(event => event.type === 'turn/start')!.seq
    return events.flatMap(event => event.seq >= boundary && event.type === 'user/message' && event.data.source.kind === 'plugin' ? [event.data.source.plugin] : [])
  }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review),
    () => structured({ ...admission, relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
      feedback: { kind, quote, category: kind === 'preference' ? 'user-preference' : 'source-fidelity' } }),
    request => {
      const messages = JSON.stringify(request.messages)
      expect(messages).toContain('Automatic evaluation is enabled under current consent')
      expect(messages).toContain('do not ask again to enable learning or save this feedback')
      expect(messages).toContain('acknowledging feedback is not proof of persistent memory or an activated future method')
      feedbackMessages = messages
      feedbackPlugins = currentPlugins()
      expect(harness.ctx.tianwenEvolution.listConversationTasks()[1]?.admission?.decision?.feedback?.kind).toBe(kind)
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      statusBeforeAnswer = true
      return textResponse('试点预计 5 天完成。')
    }, evidenceResponse(review),
    structured(admission), () => { nextTurnPlugins = currentPlugins(); return textResponse('下一项需要 5 天。') }, evidenceResponse(review),
  ])
  try {
    for (const message of ['概括一下：试点预计 5 天完成。', `${quote}，补进去。`, '整理另一项：下一项需要 5 天。']) {
      harness.handle.agent.followup(direct(message)); await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(tasks[1]?.admission?.decision?.relatedTaskId).toBe(tasks[0]?.source.taskId)
    expect(tasks[1]?.admission?.decision?.feedback?.kind).toBe(kind)
    expect(tasks[1]?.completion?.assistantMessageIds).not.toEqual(tasks[0]?.completion?.assistantMessageIds)
    expect(statusBeforeAnswer).toBe(true)
    expect.soft(feedbackPlugins).toEqual(['tianwen-conversation-feedback-status'])
    expect.soft(feedbackMessages).not.toContain('Earlier Tianwen task guidance no longer applies')
    expect.soft(nextTurnPlugins).toEqual([])
    expect(tasks[2]?.review?.verdict).toBe('met')
    expect(JSON.stringify(harness.adapter.requests[1]?.messages)).not.toContain('Automatic evaluation is enabled under current consent')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('continues the actual user task when admission is unavailable and never backfills criteria on resume', async () => {
  const harness = await mount([new Error('provider unavailable'), textResponse('正常完成用户任务')])
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  try {
    harness.handle.agent.followup(direct('帮我整理这段话'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const before = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(before[0]?.admission?.unavailableReason).toBe('model-unavailable')
    expect(before[0]?.completion?.status).toBe('completed')
    expect(before[0]?.review?.verdict).toBe('inconclusive')
    await harness.handle.dispose()
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('ordinary-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toEqual(before)
    expect(harness.adapter.requests).toHaveLength(2)
  } finally { await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not promote a model opinion about external effects to verified completion', async () => {
  const harness = await mount([structured({ ...admission, evaluationMode: 'external' }), textResponse('预计 5 天完成。'), evidenceResponse(review)])
  try {
    harness.handle.agent.followup(direct('把计划写入文件，写明预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]
    expect(task?.review?.verdict).toBe('inconclusive')
    expect(task?.review?.proof).not.toBeNull()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each([admission.criteria[0], admission.objective, 'evaluationMode'])('rejects a review whose evidence quotes only derived task data: %s', async quote => {
  let rejectedRequest: GenerateOptions | undefined
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), structured({
    verdict: 'not-met', category: 'source-fidelity', explanation: 'The response omitted a required fact.', evidenceQuotes: [quote],
  }), request => {
    rejectedRequest = request
    return textResponse('No valid evidence quote is available.')
  }])
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(rejectedRequest?.messages.flatMap(message => message.content).filter(block => block.type === 'tool-result'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ toolCallId: 'judgment', isError: true,
        content: [{ type: 'text', text: expect.stringContaining('evidenceQuotes') }] })]))
    const result = harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review
    expect(result?.verdict).toBe('inconclusive')
    expect(result?.unavailableReason).toBe('invalid-judgment')
    expect(result?.proof).toBeNull()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['same', 'new'])('retains the original request when a native replacement has a %s message id', async identity => {
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([structured(admission), () => {
    const original = harness.handle.agent.session.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    if (original?.type !== 'user/message') throw new Error('original user event missing')
    const replacement = direct('model-only replacement, not another user request')
    harness.handle.agent.session.append('user/message', identity === 'same' ? { ...replacement, id: original.data.id } : replacement, {
      surfaceOp: { op: 'replace', start: original.seq, end: original.seq }, sourceEventSeqs: [original.seq],
    })
    return textResponse('预计 5 天完成。')
  }, evidenceResponse(review)])
  try {
    const request = direct('概括：预计 5 天完成。')
    harness.handle.agent.followup(request)
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.review?.verdict).toBe('met')
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).request).toEqual([request])
    expect(JSON.stringify(harness.adapter.requests.at(-1)?.messages)).not.toContain('model-only replacement')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('recovers a task request only inside its frozen interval when a later turn reuses its message id', async () => {
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review), structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review)])
  try {
    const request = direct('概括：预计 5 天完成。')
    for (let turn = 0; turn < 2; turn++) {
      harness.handle.agent.followup(request)
      await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect((await recoverConversationTaskMaterial(harness.ctx, task)).request).toEqual([request])
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('associates native feedback and retraction with the exact later natural task', async () => {
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review), structured(admission), textResponse('需要 5 天。'), evidenceResponse(review)], 'tianwen-auto-analysis.v3', true)
  try {
    for (const message of ['概括：预计 5 天完成。', '整理：需要 5 天。']) {
      harness.handle.agent.followup(direct(message)); await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks()
    const target = tasks[1]!
    const messageId = MessageId(target.completion!.assistantMessageIds.at(-1)!)
    const sessionId = SessionId(target.source.sessionId)
    const put = await harness.ctx.messageFeedback.put({ sessionId, messageId, rating: 'negative', note: '请保留原文范围', ifVersion: null })
    expect(put.ok).toBe(true)
    if (!put.ok) throw new Error('native feedback rejected')
    await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession(String(sessionId))
    expect(harness.ctx.tianwenEvolution.getLearningIntakeStatus(String(sessionId), String(messageId))?.scopeKey).toBe(target.source.scopeKey)
    expect(harness.ctx.tianwenEvolution.getLearningIntakeStatus(String(sessionId), tasks[0]!.completion!.assistantMessageIds.at(-1)!)).toBeUndefined()
    await harness.ctx.messageFeedback.delete({ sessionId, messageId, ifVersion: put.value.version })
    await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession(String(sessionId))
    expect(harness.ctx.tianwenEvolution.getLearningIntakeStatus(String(sessionId), String(messageId))?.state).toBe('retracted')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('cancels an in-flight observation on disable without cancelling the user task', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([() => {
    harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    return structured(admission)
  }, textResponse('仍然正常完成用户任务')])
  try {
    harness.handle.agent.followup(direct('概括这段话'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]
    expect(task?.admission?.unavailableReason).toBe('cancelled')
    expect(task?.completion?.status).toBe('completed')
    expect(task?.review?.verdict).toBe('inconclusive')
    expect(harness.adapter.requests).toHaveLength(2)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not rerun a persisted review attempt whose result append was lost', async () => {
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review)])
  const original = harness.ctx.tianwenEvolution.recordConversationLearning.bind(harness.ctx.tianwenEvolution)
  const fault = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationLearning').mockImplementation(record => {
    if (record.kind === 'task-reviewed') throw new Error('simulated result append failure')
    return original(record)
  })
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.reviewIntent).toBeDefined()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review).toBeUndefined()
    fault.mockRestore()
    await harness.handle.dispose()
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('ordinary-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review?.unavailableReason).toBe('cancelled')
    expect(harness.adapter.requests).toHaveLength(3)
  } finally { fault.mockRestore(); await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('starts and cancels a new main task while an older recovered native review is still waiting', async () => {
  const script: Parameters<typeof mountPersistentHarness>[1] = [structured(admission), textResponse('预计 5 天完成。')]
  const harness = await mount(script)
  const originalRecord = harness.ctx.tianwenEvolution.recordConversationLearning.bind(harness.ctx.tianwenEvolution)
  const fault = vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationLearning').mockImplementation(record => {
    if (record.kind === 'task-review-started' || record.kind === 'task-reviewed') throw new Error('simulated crash before review receipt')
    return originalRecord(record)
  })
  const releaseReview = Promise.withResolvers<void>()
  let reviewWaiting = false
  let mainStarted = false
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  const originalStream = harness.adapter.stream.bind(harness.adapter)
  const stream = vi.spyOn(harness.adapter, 'stream').mockImplementation(async function* (request) {
    if (JSON.stringify(request.messages).includes('Review the completed task against the criteria')) {
      reviewWaiting = true
      await releaseReview.promise
    }
    yield* originalStream(request)
  })
  const respond = (request: GenerateOptions) => {
    if (request.sessionId === 'ordinary-chat') {
      mainStarted = true
      resumed!.agent.cancel({ kind: 'user' })
      return textResponse('新任务已开始')
    }
    return JSON.stringify(request.messages).includes('Review the completed task against the criteria') ? evidenceResponse(review)(request) : structured(admission)
  }
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.completion).toBeDefined()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.reviewIntent).toBeUndefined()
    await harness.handle.dispose()
    fault.mockRestore()
    script.push(respond, respond, respond)
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('ordinary-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await vi.waitFor(() => expect(reviewWaiting).toBe(true), { timeout: 1_000 })
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.reviewIntent).toBeDefined()
    resumed.agent.followup(direct('新任务：概括另一段话'))
    await vi.waitFor(() => expect(mainStarted).toBe(true), { timeout: 1_000 })
    await resumed.agent.whenIdle()
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(tasks[0]?.review).toBeUndefined()
    expect(tasks[1]?.completion?.status).toBe('interrupted')
    releaseReview.resolve()
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review?.verdict).toBe('met')
  } finally {
    fault.mockRestore(); releaseReview.resolve()
    await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.tianwenConversationObserver.whenIdle()
    stream.mockRestore(); await harness.ctx.fiber.dispose()
  }
})

it('keeps oversized observation material unavailable without changing the actual task input', async () => {
  const large = '材料'.repeat(50_000)
  const harness = await mount([request => {
    expect(JSON.stringify(request.messages)).toContain(large)
    return textResponse('正常回答')
  }])
  try {
    harness.handle.agent.followup(direct(large))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.admission?.unavailableReason).toBe('material-too-large')
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.completion?.status).toBe('completed')
    expect(harness.adapter.requests).toHaveLength(1)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})
