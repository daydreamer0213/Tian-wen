import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { MessageId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, SkillRegistry, applySkillTool, createUserMessage, mountFeedbackHarness, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { recoverConversationAdmissionJudgment, recoverConversationStructuredJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { recoverConversationTaskMaterial } from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'
import { TianwenResearchSummaryAdmissionService } from '../../packages/tianwen-runtime-bundle/src/research-summary-admission.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const admission = { kind: 'task', objective: 'Summarize the supplied facts', criteria: ['Preserve all supplied facts'], family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null }
const review = { verdict: 'met', category: null, explanation: 'The facts are preserved.', evidenceQuotes: ['5 天'] }
const structured = (value: Record<string, unknown>) => toolCallResponse('judgment', 'structured_output',
  'kind' in value && 'evaluationMode' in value ? { decision: value } : value)
const evidenceResponse = auditedEvidenceResponse
const reasoningTextResponse = (reasoning: string, text: string): readonly StreamChunk[] => [
  { type: 'block-start', index: 0, blockType: 'reasoning' },
  { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } },
  { type: 'block-start', index: 1, blockType: 'text' },
  { type: 'block-end', index: 1, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
]

const reviewPair = (value: typeof review) => [evidenceResponse(value), evidenceResponse(value)]

async function mount(script: Parameters<typeof mountPersistentHarness>[1], policy = 'tianwen-auto-analysis.v3', feedback = false, legacy = false, familyVerification = false) {
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
  await harness.ctx.plugin(TianwenConversationObserverService, { familyVerification })
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
    }, textResponse('试点要 5 天。'), ...reviewPair(review),
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
    expect(harness.adapter.requests).toHaveLength(5)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('captures ordinary requests in two native turns before each answer and reviews automatically', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  let boundBeforeAnswer = false
  let firstTaskQuality: string | undefined
  let firstReminder = ''
  let firstReminderCount = 0
  let secondReminder = ''
  harness = await mount([
    structured(admission),
    request => {
      const tasks = harness.ctx.tianwenEvolution.listConversationTasks('ordinary-chat')
      firstTaskQuality = tasks[0]?.admission?.qualityContract?.schemaVersion
      const reminders = request.messages.filter(message => message.source.kind === 'plugin' && message.source.plugin === 'tianwen-output-form-reminder')
      firstReminderCount = reminders.length
      firstReminder = JSON.stringify(reminders)
      boundBeforeAnswer = tasks[0]?.models?.[0]?.modelConfigDigest === sha256({ provider: 'tianwen-probe', model: 'scripted' })
      return textResponse('预计 5 天完成。')
    }, ...reviewPair(review),
    structured({ ...admission, relatedTaskId: null }), request => {
      secondReminder = JSON.stringify(request.messages.filter(message => message.source.kind === 'plugin' && message.source.plugin === 'tianwen-output-form-reminder'))
      return textResponse('需要 5 天。')
    }, ...reviewPair(review),
  ])
  try {
    for (const message of ['帮我概括一下：预计 5 天完成。', '再整理这段：需要 5 天。']) {
      harness.handle.agent.followup(direct(message))
      await harness.handle.agent.whenIdle()
      await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks('ordinary-chat')
    expect(boundBeforeAnswer).toBe(true)
    expect(firstTaskQuality).toBe('tianwen.conversation-quality.v11')
    expect(firstReminderCount).toBe(1)
    expect(firstReminder).toContain('original direct user request')
    expect(firstReminder).toContain('heading, bullets, divider, or extra addendum')
    expect(secondReminder).toContain('Earlier Tianwen output-form reminders no longer apply')
    expect(secondReminder).toContain('original direct user request')
    expect(tasks[1]?.models).toHaveLength(1)
    expect(tasks[1]?.models?.[0]?.headerSeq).toBe(tasks[0]?.models?.[0]?.headerSeq)
    expect(tasks.map(task => task.source.turn)).toEqual([1, 2])
    expect(tasks.map(task => task.review?.verdict)).toEqual(['met', 'met'])
    expect(tasks.every(task => task.review?.reviewChecks?.every(check => 'audit' in check && check.audit.schemaVersion === 'tianwen.claim-audit.v2'))).toBe(true)
    const recovered = await recoverConversationTaskMaterial(harness.ctx, tasks[0]!)
    expect(recovered).toHaveProperty('qualityContract', tasks[0]!.admission!.qualityContract)
    expect(recovered.criteria).toEqual(admission.criteria)
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('tianwen.conversation-quality.v11')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('self-contained summaries, translations and rewrites')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('Writing is not automatically subjective')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('tianwen_captured_file_facts')
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).toContain('inspect, count or hash local files and answer in chat is local-files/chat')
    expect(JSON.stringify(harness.adapter.requests[2]?.messages)).toContain('tianwen.conversation-quality.v11')
    expect(tasks[0]?.source.taskId).not.toBe(tasks[1]?.source.taskId)
    expect(harness.adapter.requests).toHaveLength(8)
    expect(harness.adapter.requests[0]?.tools?.[0]?.parameters).toMatchObject({
      type: 'object', additionalProperties: false,
      required: ['decision'], properties: { decision: { oneOf: [
        { properties: { kind: { type: 'string', enum: ['task', 'conversation'] }, relatedTaskId: { type: 'null' } } },
        { properties: { relatedTaskId: { type: 'null' } }, required: expect.arrayContaining(['fileOutputKind']) },
      ] } },
    })
    expect(harness.adapter.requests[4]?.tools?.[0]?.parameters?.properties?.decision?.oneOf?.[0]?.properties?.relatedTaskId)
      .toEqual({ oneOf: [{ type: 'string', enum: [tasks[0]!.source.taskId] }, { type: 'null' }] })
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toHaveLength(2)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('uses surface-only material for a later admission and both native reviews after an earlier assistant reasoning block exceeds 96 KiB', async () => {
  const hidden = 'HIDDEN-NATIVE-REASONING-'.repeat(6_000)
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([
    structured(admission), reasoningTextResponse(hidden, '可见保留助手文本：试点耗时 5 天。'), ...reviewPair(review),
    structured(admission), textResponse('后续仍保留 5 天。'), ...reviewPair(review),
  ])
  try {
    harness.handle.agent.followup(direct('Summarize: the pilot took 5 days.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.review?.verdict).toBe('met')
    harness.handle.agent.followup(direct('Summarize again: keep the 5-day duration.'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[1]!
    expect(task.source.materialProjection).toBe('surface-text.v1')
    expect(task.admission?.unavailableReason).toBeNull()
    expect(task.admission?.decision?.kind).toBe('task')
    expect(task.completion?.status).toBe('completed')
    expect(task.review?.verdict).toBe('met')
    const recovered = await recoverConversationTaskMaterial(harness.ctx, task)
    const admissionMaterial = await recoverConversationAdmissionJudgment(harness.ctx, task.admission!.proof!, task.admission!.decision)
    const reviewMaterials = await Promise.all(task.review!.reviewChecks!.map(check => recoverConversationStructuredJudgment(harness.ctx, check.proof, {
      verdict: check.verdict, category: check.category, explanation: check.explanation, evidenceQuotes: check.evidenceQuotes, audit: check.audit,
    })))
    expect(JSON.stringify(recovered.context)).toContain('可见保留助手文本')
    expect(JSON.stringify(recovered.context)).not.toContain('HIDDEN-NATIVE-REASONING-')
    expect(JSON.stringify(admissionMaterial.material)).toContain('可见保留助手文本')
    expect(JSON.stringify(admissionMaterial.material)).not.toContain('HIDDEN-NATIVE-REASONING-')
    for (const reviewMaterial of reviewMaterials) {
      expect(JSON.stringify(reviewMaterial.material)).toContain('可见保留助手文本')
      expect(JSON.stringify(reviewMaterial.material)).not.toContain('HIDDEN-NATIVE-REASONING-')
    }
    expect(harness.adapter.requests).toHaveLength(8)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('retains a completed first check after the second fails and never retries the task on restart', async () => {
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), evidenceResponse(review), new Error('second reviewer unavailable')])
  let resumed: Awaited<ReturnType<typeof harness.ctx.agents.resume>> | undefined
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.reviewIntent).toBeDefined()
    expect(task.review).toMatchObject({ verdict: 'inconclusive', proof: null, unavailableReason: 'model-unavailable' })
    expect(task.review).not.toHaveProperty('reviewChecks')
    const firstId = SessionId(String(harness.adapter.requests[2]!.sessionId))
    const saved = await harness.ctx.sessionPersistence.inspect(firstId)
    expect(saved.events.some(event => event.type === 'tool/call' && event.data.name === 'structured_output' && JSON.parse(event.data.arguments).verdict === 'met')).toBe(true)
    await harness.handle.dispose()
    resumed = await harness.ctx.agents.resume({ resumeSessionId: SessionId('ordinary-chat'), agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.adapter.requests).toHaveLength(4)
    expect(await harness.ctx.sessionPersistence.inspect(firstId)).toEqual(saved)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]).toEqual(task)
  } finally { await resumed?.dispose(); await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not analyze ordinary conversations under the earlier narrower consent', async () => {
  const harness = await mount([textResponse('普通回答')], 'tianwen-auto-analysis.v2')
  try {
    harness.handle.agent.followup(direct('请帮我整理这段话'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toEqual([])
    expect(harness.adapter.requests).toHaveLength(1)
    expect(JSON.stringify(harness.adapter.requests[0]?.messages)).not.toContain('tianwen-output-form-reminder')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('expires an earlier output-form reminder after learning consent is disabled', async () => {
  let laterReminder = ''
  const harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    request => {
      laterReminder = JSON.stringify(request.messages.filter(message => message.source.kind === 'plugin' && message.source.plugin === 'tianwen-output-form-reminder'))
      return textResponse('已收到下一条普通请求。')
    },
    textResponse('已收到第三条普通请求。'),
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    harness.handle.agent.followup(direct('下一条普通请求。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(laterReminder).toContain('Earlier Tianwen output-form reminders no longer apply')
    expect(laterReminder).toContain('No output-form reminder applies')
    harness.handle.agent.followup(direct('第三条普通请求。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const boundary = harness.handle.agent.session.events.findLast(event => event.type === 'turn/start')!.seq
    expect(harness.handle.agent.session.events.filter(event => event.seq >= boundary && event.type === 'user/message'
      && event.data.source.kind === 'plugin' && event.data.source.plugin === 'tianwen-output-form-reminder')).toHaveLength(0)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toHaveLength(1)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not add an output-form reminder to an external task', async () => {
  let reminderCount = -1
  const harness = await mount([
    structured({ ...admission, objective: 'Check an external site', evaluationMode: 'external' }),
    request => {
      reminderCount = request.messages.filter(message => message.source.kind === 'plugin' && message.source.plugin === 'tianwen-output-form-reminder').length
      return textResponse('External result unavailable.')
    },
  ])
  try {
    harness.handle.agent.followup(direct('请检查外部站点的最新状态。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(reminderCount).toBe(0)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.admission?.decision?.evaluationMode).toBe('external')
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
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    () => structured({ ...admission, relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
      feedback: { kind, quote, category: kind === 'preference' ? 'user-preference' : 'source-fidelity' } }),
    request => {
      const messages = JSON.stringify(request.messages)
      expect(messages).toContain('Automatic evaluation is enabled under current consent')
      expect(messages).toContain('do not ask again to enable learning or save this feedback')
      expect(messages).toContain('acknowledging feedback is not proof of persistent memory or an activated future method')
      if (kind === 'preference') expect(messages).not.toContain('A future-only preference is feedback')
      feedbackMessages = messages
      feedbackPlugins = currentPlugins()
      expect(harness.ctx.tianwenEvolution.listConversationTasks()[1]?.admission?.decision?.feedback?.kind).toBe(kind)
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      statusBeforeAnswer = true
      return textResponse('试点预计 5 天完成。')
    }, ...reviewPair(review),
    structured(admission), () => { nextTurnPlugins = currentPlugins(); return textResponse('下一项需要 5 天。') }, ...reviewPair(review),
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
    expect.soft(feedbackPlugins).toEqual(['tianwen-output-form-reminder', 'tianwen-conversation-feedback-status'])
    expect.soft(feedbackMessages).not.toContain('Earlier Tianwen task guidance no longer applies')
    expect.soft(nextTurnPlugins).toEqual(['tianwen-output-form-reminder'])
    expect(tasks[2]?.review?.verdict).toBe('met')
    expect(JSON.stringify(harness.adapter.requests[1]?.messages)).not.toContain('Automatic evaluation is enabled under current consent')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('tells the main reply to acknowledge future-only feedback without rewriting the prior answer', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  let status = ''
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    () => structured({ ...admission, kind: 'conversation', objective: 'Record a future writing preference without revising the answer',
      criteria: ['Do not rewrite the completed answer.'], family: 'other', evaluationMode: 'subjective',
      relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
      feedback: { kind: 'preference', quote: '以后同类摘要请分两句写', category: 'user-preference' } }),
    request => {
      const message = request.messages.find(item => item.source.kind === 'plugin' && item.source.plugin === 'tianwen-conversation-feedback-status')
      status = message?.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('') ?? ''
      return textResponse('了解这项未来写法偏好；刚才那份不重写。')
    },
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：试点预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct('刚才的事实是对的。以后同类摘要请分两句写。这次不用重写。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[1]?.admission?.decision?.kind).toBe('conversation')
    expect(status).toContain('do not reproduce or rewrite the completed answer')
    expect(status).toContain('If the user explicitly requests a current revision, complete it')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rechecks an explicitly targeted preference left unlinked by the first admission and stores the second native proof', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  const quote = '你这次把结论放在最后；以后同类摘要先给结论。'
  const feedback = { kind: 'preference', quote, category: 'user-preference' }
  const unlinked = { ...admission, kind: 'conversation', objective: 'Record a future summary preference', criteria: [],
    family: 'other', relatedTaskId: null, feedback }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    structured(unlinked),
    () => structured({ ...unlinked, relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId }),
    textResponse('已了解这项偏好。'),
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct(`针对刚才这份摘要，${quote}`))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const [target, feedbackTask] = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(feedbackTask?.admission?.decision?.relatedTaskId).toBe(target?.source.taskId)
    expect(feedbackTask?.admission?.decision?.feedback).toEqual(feedback)
    const saved = await recoverConversationAdmissionJudgment(harness.ctx, feedbackTask!.admission!.proof!, feedbackTask!.admission!.decision)
    expect(JSON.stringify(saved.material)).toContain('针对刚才这份摘要')
    expect(harness.adapter.requests).toHaveLength(7)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rechecks an initially misclassified future-only preference before replying and attributes it to the prior answer', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  const quote = '以后同类摘要请分三句写'
  const feedback = { kind: 'preference', quote, category: 'user-preference' }
  const initial = { ...admission, kind: 'task', objective: 'Acknowledge the new preference',
    criteria: ['Do not rewrite the completed answer'], family: 'other', relatedTaskId: null, feedback }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    structured(initial),
    () => structured({ ...initial, kind: 'conversation', objective: 'Record future preference without revising the answer',
      relatedTaskId: harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId }),
    request => {
      expect(JSON.stringify(request.messages)).toContain('do not reproduce or rewrite the completed answer')
      return textResponse('已了解未来写法偏好；刚才那份不重写。')
    },
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct(`刚才这份事实正确。${quote}。从下一份开始采用；这一份不用改，也不要再给我一版。`))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const [target, feedbackTask] = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(feedbackTask?.admission?.decision).toMatchObject({ kind: 'conversation', relatedTaskId: target?.source.taskId, feedback })
    expect(feedbackTask?.admission?.proof?.sessionId).toBe(String(harness.adapter.requests[5]?.sessionId))
    expect(harness.adapter.requests).toHaveLength(7)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('keeps an explicit current rewrite task when a preference recheck does not classify it as feedback-only', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  const quote = '以后同类摘要请分三句写'
  const initial = { ...admission, kind: 'task', objective: 'Rewrite this answer in three sentences',
    criteria: ['Produce a revised answer now'], family: 'writing', relatedTaskId: null,
    feedback: { kind: 'preference', quote, category: 'user-preference' } }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    structured(initial), structured(initial),
    request => {
      expect(JSON.stringify(request.messages)).not.toContain('do not reproduce or rewrite the completed answer')
      return textResponse('试点预计 5 天完成。其余事项待确认。发布日期未定。')
    }, ...reviewPair(review),
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct(`刚才那份请现在改成三句。${quote}。`))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[1]?.admission?.decision?.kind).toBe('task')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not invent a feedback target when a task-classified preference remains ambiguous on recheck', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  const feedback = { kind: 'preference', quote: '以后摘要尽量简短', category: 'user-preference' }
  const initial = { ...admission, kind: 'task', objective: 'Acknowledge a general preference',
    family: 'other', relatedTaskId: null, feedback }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    structured(initial), structured({ ...initial, kind: 'conversation' }),
    textResponse('已了解这项偏好。'), ...reviewPair(review),
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct('以后摘要尽量简短。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[1]?.admission?.decision).toMatchObject({
      kind: 'task', relatedTaskId: null, feedback,
    })
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each(['ambiguous', 'changed-feedback', 'unavailable'] as const)('keeps an unlinked preference unbound when the optional recheck is %s', async outcome => {
  let harness: Awaited<ReturnType<typeof mount>>
  const userText = outcome === 'ambiguous' ? '以后写摘要尽量简短。' : '针对刚才这份摘要，以后先给结论。'
  const feedback = { kind: 'preference', quote: userText, category: 'user-preference' }
  const unlinked = { ...admission, kind: 'conversation', objective: 'Record a future preference', criteria: [],
    family: 'other', relatedTaskId: null, feedback }
  harness = await mount([
    structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review),
    structured(unlinked),
    outcome === 'unavailable' ? new Error('recheck unavailable') : () => structured({ ...unlinked,
      relatedTaskId: outcome === 'ambiguous' ? null : harness.ctx.tianwenEvolution.listConversationTasks()[0]!.source.taskId,
      feedback: outcome === 'changed-feedback' ? { ...feedback, quote: '以后先给结论。' } : feedback }),
    textResponse('已了解。'),
  ])
  try {
    harness.handle.agent.followup(direct('概括一下：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    harness.handle.agent.followup(direct(userText))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const feedbackTask = harness.ctx.tianwenEvolution.listConversationTasks()[1]!
    expect(feedbackTask.admission?.decision?.relatedTaskId).toBeNull()
    expect(feedbackTask.admission?.decision?.feedback).toEqual(feedback)
    expect(harness.adapter.requests).toHaveLength(7)
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
  const harness = await mount([structured({ ...admission, evaluationMode: 'external' }), structured({ ...admission, evaluationMode: 'external' }), textResponse('预计 5 天完成。'), ...reviewPair(review)])
  try {
    harness.handle.agent.followup(direct('把计划写入文件，写明预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]
    expect(task?.review?.verdict).toBe('inconclusive')
    expect(task?.review?.proof).not.toBeNull()
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rechecks an external admission for a read-only workspace file query before the answer', async () => {
  const local = { kind: 'task', objective: 'Report local source file facts in chat', criteria: ['Read files', 'Report exact file facts', 'Do not change files'],
    family: 'other', evaluationMode: 'local-files', fileOutputKind: 'chat', relatedTaskId: null, feedback: null }
  const harness = await mount([structured({ ...local, evaluationMode: 'external', fileOutputKind: undefined }), structured(local), textResponse('已读取文件。')])
  try {
    harness.handle.agent.followup(direct('查看当前工作区的 TypeScript 文件，实际读取后报告每个文件的行数、字节数和 SHA-256，只在对话中回答，不改文件。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.decision).toMatchObject({ evaluationMode: 'local-files', fileOutputKind: 'chat' })
    expect(task.admission?.proof?.sessionId).toBe(String(harness.adapter.requests[1]?.sessionId))
    expect((await recoverConversationAdmissionJudgment(harness.ctx, task.admission!.proof!, task.admission!.decision)).instruction)
      .toContain('Verify the evaluation mode independently')
    expect(harness.adapter.requests).toHaveLength(3)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('keeps an external file task external when the recheck is unavailable', async () => {
  const external = { ...admission, evaluationMode: 'external' }
  const harness = await mount([structured(external), new Error('recheck unavailable'), textResponse('没有执行测试。'), ...reviewPair(review)])
  try {
    harness.handle.agent.followup(direct('读取工作区文件并运行测试，把测试结果报告给我。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.decision?.evaluationMode).toBe('external')
    expect(task.admission?.proof?.sessionId).toBe(String(harness.adapter.requests[0]?.sessionId))
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it.each([admission.criteria[0], admission.objective, 'evaluationMode'])('rejects a review whose evidence quotes only derived task data: %s', async quote => {
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), auditedEvidenceResponse({
    verdict: 'not-met', category: 'source-fidelity', explanation: 'The response omitted a required fact.', evidenceQuotes: [quote],
  }, 'empty', false)])
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.adapter.requests).toHaveLength(3)
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
  }, ...reviewPair(review)])
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
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review), structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review)])
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
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review), structured(admission), textResponse('需要 5 天。'), ...reviewPair(review)], 'tianwen-auto-analysis.v3', true)
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
  const harness = await mount([structured(admission), textResponse('预计 5 天完成。'), ...reviewPair(review)])
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
    expect(harness.adapter.requests).toHaveLength(4)
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
    if (JSON.stringify(request.messages).includes('Evaluate the complete answer against the original direct-user instructions')) {
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
    return JSON.stringify(request.messages).includes('Evaluate the complete answer against the original direct-user instructions') ? evidenceResponse(review)(request) : structured(admission)
  }
  try {
    harness.handle.agent.followup(direct('概括：预计 5 天完成。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.completion).toBeDefined()
    expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]?.reviewIntent).toBeUndefined()
    await harness.handle.dispose()
    fault.mockRestore()
    script.push(respond, respond, respond, respond)
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
  const large = '材料'.repeat(180_000)
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

it('keeps the initial admission and resolves a summary family with two independent focused votes before answering', async () => {
  const requestText = '请根据这些记录写一段简短摘要：试点预计 5 天。'
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([
    structured({ ...admission, family: 'other' }),
    request => {
      expect(JSON.stringify(request.messages)).toContain('family-only')
      expect(JSON.stringify(request.messages)).not.toContain('initialDecision')
      return structured({ family: 'summarization', quote: '写一段简短摘要' })
    },
    request => {
      expect(JSON.stringify(request.messages)).not.toContain('initialDecision')
      return structured({ family: 'summarization', quote: '写一段简短摘要' })
    },
    request => {
      const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]
      expect(task?.admission?.decision?.family).toBe('other')
      expect(task?.admission?.familyVerification?.resolvedFamily).toBe('summarization')
      expect(task?.source.admissionPolicy).toBe('tianwen.family-verification.v1')
      return textResponse('试点预计 5 天。')
    }, ...reviewPair(review),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct(requestText))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.review?.verdict).toBe('met')
    expect(task.admission?.familyVerification?.checks).toHaveLength(2)
    expect(new Set([task.admission?.proof?.sessionId, ...task.admission!.familyVerification!.checks.map(check => check.proof.sessionId)]).size).toBe(3)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('confirms a real writing task with one focused vote and leaves its requested list intact', async () => {
  const harness = await mount([
    structured({ ...admission, family: 'writing', objective: 'Draft a status note' }),
    structured({ family: 'writing', quote: '一个标题和三条要点' }),
    textResponse('# 状态\n- 试点预计 5 天。'), ...reviewPair(review),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct('请写一个标题和三条要点，说明试点预计 5 天。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.familyVerification?.resolvedFamily).toBe('writing')
    expect(task.admission?.familyVerification?.checks).toHaveLength(1)
    expect(harness.adapter.requests).toHaveLength(5)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('answers but leaves family unresolved when three votes differ', async () => {
  const harness = await mount([
    structured({ ...admission, family: 'other' }),
    structured({ family: 'summarization', quote: '简短摘要' }),
    structured({ family: 'writing', quote: '简短摘要' }),
    textResponse('试点预计 5 天。'), ...reviewPair(review),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct('请根据记录写简短摘要：试点预计 5 天。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.familyVerification?.resolvedFamily).toBeNull()
    expect(task.completion?.status).toBe('completed')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('fails family routing closed when a native check cites text outside the direct request', async () => {
  const harness = await mount([
    structured(admission), structured({ family: 'summarization', quote: 'not in the request' }),
    textResponse('试点预计 5 天。'), ...reviewPair(review),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct('请概括：试点预计 5 天。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.familyVerification).toMatchObject({ resolvedFamily: null, unavailableReason: 'invalid-judgment', checks: [] })
    expect(task.completion?.status).toBe('completed')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not complete family verification after the profile consent is disabled mid-check', async () => {
  let harness: Awaited<ReturnType<typeof mount>>
  harness = await mount([
    structured(admission), () => {
      harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
      return structured({ family: 'summarization', quote: '请概括' })
    }, textResponse('试点预计 5 天。'),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct('请概括：试点预计 5 天。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.unavailableReason).toBe('cancelled')
    expect(task.admission?.familyVerification).toBeUndefined()
    expect(task.completion?.status).toBe('completed')
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('does not request family votes for a non-text task', async () => {
  const harness = await mount([
    structured({ ...admission, evaluationMode: 'external' }),
    textResponse('没有执行外部操作。'), ...reviewPair(review),
  ], 'tianwen-auto-analysis.v3', false, false, true)
  try {
    harness.handle.agent.followup(direct('请访问外部网站后概括试点状态。'))
    await harness.handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    const task = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
    expect(task.admission?.decision?.evaluationMode).toBe('external')
    expect(task.admission?.familyVerification).toBeUndefined()
    expect(harness.adapter.requests).toHaveLength(3)
  } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
})
