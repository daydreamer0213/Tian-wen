import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId, createUserMessage, mountPersistentHarness, mountFeedbackHarness, textResponse, toolCallResponse, type ScriptEntry } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import { TianwenConversationFeedbackService } from '../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.js'
import { TianwenMessageFeedbackBridgeService } from '../../packages/tianwen-runtime-bundle/src/message-feedback-bridge.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const structured = (value: Record<string, unknown>) => toolCallResponse('result', 'structured_output', value)
const admission = { kind: 'task', objective: 'Summarize supplied facts', criteria: ['Preserve source scope'], family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null }
const verdict = (met: boolean, quote: string) => ({ verdict: met ? 'met' : 'not-met', category: met ? null : 'source-fidelity', explanation: met ? 'Source scope preserved.' : 'Scope expanded beyond source.', evidenceQuotes: [quote] })

it.each(['accepted', 'recover', 'mixed-models', 'copied-holdout', 'contradict-source', 'contradict-counter', 'derived-quote', 'regression', 'disabled'] as const)('evaluates native text attempts and gates future behavior: %s', async scenario => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'loop-'))
  const guidance = '保留局部样本的适用范围，不将局部结论扩大到总体。'
  const script: ScriptEntry[] = [
    structured(admission), textResponse('全国需要 5 天。'), structured(verdict(false, '全国')),
    structured(admission), textResponse('公司整体增加 7%。'), structured(verdict(false, '公司整体')),
    structured(admission), textResponse('全公司降低 2%。'), structured(verdict(true, '2%')),
    structured({ adjacent: { prompt: '概括：试点满意度 80%，不代表全国。', criteria: ['Preserve pilot-only scope'] }, holdout: { prompt: scenario === 'copied-holdout' ? '概括：试点需要 5 天，不代表全国。' : '概括：实验室测量 3 秒，实地结果未知。', criteria: ['Do not claim field results'] } }),
    request => {
      expect(JSON.stringify(request.messages)).not.toContain('实验室测量 3 秒')
      return structured({ guidance })
    },
  ]
  for (let index = 0; index < 5; index++) {
    for (const role of ['baseline', 'candidate']) {
      script.push(request => {
        if (scenario === 'disabled') harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
        return structured({ answer: `${role === 'candidate' ? '保留来源范围' : '任务回答'} ${index}` })
      })
      script.push(structured({ ...verdict(!(role === 'baseline' && index < 2) && !(scenario === 'regression' && role === 'candidate' && index === 4), scenario === 'derived-quote' ? 'Preserve source scope' : `${index}`), category: null }))
    }
  }
  script.push(structured(admission), request => {
    expect(JSON.stringify(request.messages)).toContain(guidance)
    return textResponse('仍是局部样本，需要 4 天。')
  }, structured(verdict(true, '局部样本')))
  const harness = await mountFeedbackHarness(join(root, 'sessions'), script)
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationObserverService)
  await harness.ctx.plugin(TianwenMessageFeedbackBridgeService)
  const warnings: unknown[] = []
  const warningSpy = vi.spyOn(TianwenConversationGuidanceLoopService.prototype as never, 'warn' as never).mockImplementation((error: unknown) => { warnings.push(error instanceof Error ? error.message : error) })
  const loopFiber = harness.ctx.plugin(TianwenConversationGuidanceLoopService)
  await loopFiber
  const record = harness.ctx.tianwenEvolution.recordConversationGuidance.bind(harness.ctx.tianwenEvolution)
  const activationFault = scenario === 'recover' ? vi.spyOn(harness.ctx.tianwenEvolution, 'recordConversationGuidance').mockImplementation(input => {
    if (input.kind === 'guidance-activated') throw new Error('simulated activation append failure')
    return record(input)
  }) : undefined
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('natural-learning-main'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  if (scenario === 'mixed-models') handle.agent.ctx.on('agent/request', async ({ turn }, next) => ({ ...await next(), temperature: turn === 2 ? 0.2 : 0.1 }))
  try {
    for (const message of ['概括：试点需要 5 天，不代表全国。', '概括：测试组增加 7%，不是公司整体。', '概括：全公司降低 2%。']) {
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: message }], source: { kind: 'user' } }))
      await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    }
    if (scenario === 'mixed-models' || scenario === 'copied-holdout') {
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toEqual([])
      expect(harness.adapter.requests).toHaveLength(scenario === 'mixed-models' ? 9 : 10)
      return
    }
    if (scenario === 'recover') {
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.decision?.verdict).toBe('accepted')
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.activation).toBeUndefined()
      expect(warnings).toEqual(['simulated activation append failure'])
      warnings.splice(0); activationFault!.mockRestore()
      const requests = harness.adapter.requests.length
      await loopFiber.dispose(); await harness.ctx.plugin(TianwenConversationGuidanceLoopService)
      await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
      expect(harness.adapter.requests).toHaveLength(requests)
    }
    const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]
    if (scenario === 'derived-quote' || scenario === 'disabled') {
      expect(study?.activation).toBeUndefined()
      expect(study?.stopped?.reason).toBe(scenario === 'disabled' ? 'cancelled' : 'invalid-judgment')
      expect(study?.arms).toHaveLength(0)
      expect(warnings).toHaveLength(1)
      return
    }
    expect(warnings).toEqual([])
    expect(study?.arms).toHaveLength(10)
    if (scenario === 'regression') {
      expect(study?.decision?.verdict).toBe('rejected')
      expect(study?.activation).toBeUndefined()
      return
    }
    expect(study?.decision?.verdict).toBe('accepted')
    expect(study?.activation).toBeDefined()
    const oldTasks = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(new Set(oldTasks.map(task => task.source.behaviorVersion)).size).toBe(1)
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '概括：局部样本需要 4 天。' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    const tasks = harness.ctx.tianwenEvolution.listConversationTasks()
    expect(tasks.at(-1)?.source.behaviorVersion).not.toBe(tasks[0]?.source.behaviorVersion)
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()).toHaveLength(1)
    expect(harness.adapter.requests).toHaveLength(34)
    if (scenario === 'contradict-source' || scenario === 'contradict-counter') {
      const target = oldTasks[scenario === 'contradict-source' ? 0 : 2]!
      const result = await harness.ctx.messageFeedback.put({ sessionId: handle.agent.session.id, messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!),
        rating: scenario === 'contradict-source' ? 'positive' : 'negative', note: 'Changed user assessment.', ifVersion: null })
      expect(result.ok).toBe(true)
      // Withdrawal must invalidate the future pointer even while the native
      // agent is busy. Waiting for idle can admit another turn with stale rules.
      let releaseIdle!: () => void
      const idle = new Promise<void>(resolve => { releaseIdle = resolve })
      const busy = vi.spyOn(handle.agent, 'whenIdle').mockReturnValue(idle)
      try {
        await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession(String(handle.agent.session.id))
        expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe('support-retracted')
      } finally { releaseIdle(); busy.mockRestore() }
      await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
      expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe('support-retracted')
      expect(harness.ctx.tianwenEvolution.getConversationGuidance(study!.opened.scopeKey)).toEqual(study!.opened.parentSnapshot)
    }
  } finally { activationFault?.mockRestore(); warningSpy.mockRestore(); await handle.dispose(); await harness.ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) }
}, 30_000)

it('learns from native corrections without rewriting earlier met reviews, then retracts the supporting guidance', async () => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'feedback-loop-'))
  const guidance = 'Preserve the stated population boundary when summarizing numerical results.'
  const script: ScriptEntry[] = []
  for (const value of ['5 days', '7%', '2%']) script.push(structured({ ...admission, criteria: ['Preserve the number'] }), textResponse(value), structured(verdict(true, value)))
  for (const scope of ['pilot', 'test group']) script.push(structured({ classification: 'attributable-problem', category: 'source-fidelity', supplementalCriteria: ['Preserve the source population scope'], explanation: 'The answer omitted the original population scope.', evidenceQuotes: [scope] }))
  script.push(structured({ adjacent: { prompt: 'Summarize: the pilot reached 80%; national results are unknown.', criteria: ['Preserve pilot-only scope'] }, holdout: { prompt: 'Summarize: the laboratory measured 3 seconds; field results are unknown.', criteria: ['Do not claim field results'] } }), structured({ guidance }))
  for (let index = 0; index < 5; index++) for (const role of ['baseline', 'candidate']) {
    script.push(structured({ answer: `${role} actual answer ${index}` }), structured({ ...verdict(!(role === 'baseline' && index < 2), `${index}`), category: null }))
  }
  script.push(structured(admission), request => {
    expect(JSON.stringify(request.messages.at(-1))).toContain(guidance)
    return textResponse('The local sample took 4 days.')
  }, structured(verdict(true, 'local sample')))
  script.push(structured(admission), request => {
    expect(JSON.stringify(request.messages.at(-1))).toContain('Earlier Tianwen task guidance no longer applies')
    expect(JSON.stringify(request.messages.at(-1))).not.toContain(guidance)
    return textResponse('The local sample took 6 days.')
  }, structured(verdict(true, 'local sample')))
  const harness = await mountFeedbackHarness(join(root, 'sessions'), script)
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  await harness.ctx.plugin(TianwenConversationObserverService)
  await harness.ctx.plugin(TianwenMessageFeedbackBridgeService)
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('feedback-learning-main'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  const direct = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
  const warnings: unknown[] = []
  const warningSpy = vi.spyOn(TianwenConversationGuidanceLoopService.prototype as never, 'warn' as never).mockImplementation((error: unknown) => { warnings.push(error) })
  try {
    for (const message of ['Summarize: the pilot took 5 days.', 'Summarize: the test group increased 7%.', 'Summarize: all staff reduced costs by 2%.']) {
      handle.agent.followup(direct(message)); await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    }
    const originals = harness.ctx.tianwenEvolution.listConversationTasks()
    await harness.ctx.plugin(TianwenConversationFeedbackService)
    const writes = []
    for (const [index, note] of ['You omitted the pilot scope.', 'You omitted the test group scope.'].entries()) {
      const messageId = MessageId(originals[index]!.completion!.assistantMessageIds.at(-1)!)
      const result = await harness.ctx.messageFeedback.put({ sessionId: handle.agent.session.id, messageId, rating: 'negative', note, ifVersion: null })
      if (!result.ok) throw new Error('native feedback failed')
      writes.push({ messageId, version: result.value.version })
      await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession(String(handle.agent.session.id))
      await harness.ctx.tianwenConversationFeedback.whenIdle()
    }
    await harness.ctx.plugin(TianwenConversationGuidanceLoopService)
    await harness.ctx.tianwenConversationGuidanceLoop.schedule(handle.agent)
    expect(warnings).toEqual([])
    const study = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]!
    expect(study.activation).toBeDefined()
    expect(study.opened.cases.slice(0, 2).every(item => 'feedbackAssessmentId' in item)).toBe(true)
    expect(harness.ctx.tianwenEvolution.listConversationTasks()).toEqual(originals)
    handle.agent.followup(direct('Summarize: the local sample took 4 days.'))
    await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle(); await harness.ctx.tianwenConversationFeedback.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    const withdrawal = await harness.ctx.messageFeedback.delete({ sessionId: handle.agent.session.id, messageId: writes[0]!.messageId, ifVersion: writes[0]!.version })
    expect(withdrawal.ok).toBe(true)
    await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession(String(handle.agent.session.id))
    await harness.ctx.tianwenConversationFeedback.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe('support-retracted')
    expect(harness.ctx.tianwenEvolution.getConversationGuidance(study.opened.scopeKey)).toEqual(study.opened.parentSnapshot)
    handle.agent.followup(direct('Summarize: the local sample took 6 days.'))
    await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle(); await harness.ctx.tianwenConversationFeedback.whenIdle(); await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(harness.adapter.requests).toHaveLength(39)
    expect(harness.ctx.tianwenEvolution.listConversationTasks().at(-1)?.source.behaviorVersion).toBe(originals[0]!.source.behaviorVersion)
    expect(warnings).toEqual([])
  } finally { warningSpy.mockRestore(); await handle.dispose(); await harness.ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) }
}, 30_000)
