import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MessageId, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountFeedbackHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { afterEach, describe, expect, it } from 'vitest'
// Exercise the deployable artifact: importing the source Runtime would miss a stale public bundle.
import { apply as applyPublicRuntime } from '../../packages/tianwen-runtime-bundle/dist/runtime.js'
import { recoverConversationStructuredJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { hasVerifiedContinuingPreference } from '../../packages/tianwen-evolution/src/conversation-feedback.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
const note = 'For all future neighborhood notices, use short sentences with no title.'
const preference = {
  classification: 'preference', category: 'user-preference',
  supplementalCriteria: ['Use short sentences for future neighborhood notices.', 'Use no title for future neighborhood notices.'],
  explanation: 'The direct feedback states a continuing expression preference.', evidenceQuotes: ['For all future neighborhood notices'],
}
const corrected = { decisions: [
  { criterion: preference.supplementalCriteria[0], scope: 'continuing', evidenceQuote: 'For all future neighborhood notices, use short sentences' },
  { criterion: preference.supplementalCriteria[1], scope: 'unclear', evidenceQuote: 'with no title.' },
] }
type ScopeCapture = typeof corrected

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function mountPublic(scopeResponses: readonly ScopeCapture[]) {
  const base = process.env.TIANWEN_TEST_ROOT ?? (process.platform === 'win32'
    ? 'D:/DevData/tianwen-public-feedback-tests' : '/tmp/tianwen-public-feedback-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'public-feedback-')); roots.push(root)
  let scopeRequests = 0
  const respond = (request: GenerateOptions) => {
    const properties = request.tools?.find(tool => tool.name === 'structured_output')?.parameters.properties
    if (properties?.decision !== undefined) return toolCallResponse('public-admission', 'structured_output', { decision: {
      kind: 'task', objective: 'Write the supplied opening notice.', criteria: ['Preserve the confirmed opening time.'],
      family: 'writing', evaluationMode: 'text', relatedTaskId: null, feedback: null,
    } })
    if (properties?.audit !== undefined) return auditedEvidenceResponse({ verdict: 'met', category: null,
      explanation: 'The opening time is preserved.', evidenceQuotes: ['Sunday 14:00 to 16:00'] })(request)
    if (properties?.classification !== undefined) return toolCallResponse('public-feedback-assessment', 'structured_output', preference)
    if (properties?.decisions !== undefined) {
      const index = scopeRequests++
      const response = scopeResponses[index]
      if (response === undefined) throw new Error('Unexpected additional scripted scope request')
      return toolCallResponse(index === 0 && scopeResponses.length > 1 ? 'explicit-invalid-scope' : 'exact-scope', 'structured_output', response)
    }
    // Original public services may send a later status notice. It is not another source task.
    return textResponse('The reading room opens Sunday 14:00 to 16:00.')
  }
  // All transport responses are explicit fixtures; no actual provider is registered or called.
  const harness = await mountFeedbackHarness(root, Array.from({ length: 16 }, () => respond))
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyPublicRuntime(harness.ctx, { stateRoot: join(root, 'state'), evolutionRoot: join(root, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('public-feedback-main'), meta: { cwd: root },
    agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text',
    text: 'Write a reading-room notice from this record: Sunday 14:00 to 16:00 is the confirmed opening time.' }] }))
  await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
  expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(true)
  return { ...harness, handle, scopeRequests: () => scopeRequests }
}

async function putFeedback(harness: Awaited<ReturnType<typeof mountPublic>>) {
  const target = harness.ctx.tianwenEvolution.listConversationTasks()[0]!
  expect(target.completion?.status).toBe('completed')
  const original = structuredClone(target)
  const put = await harness.ctx.messageFeedback.put({ sessionId: harness.handle.agent.session.id,
    messageId: MessageId(target.completion!.assistantMessageIds.at(-1)!), rating: 'negative', note, ifVersion: null })
  if (!put.ok) throw new Error('Original native feedback write failed')
  await harness.ctx.tianwenMessageFeedbackBridge.reconcileSession('public-feedback-main')
  await harness.ctx.tianwenConversationFeedback.scheduleForSession('public-feedback-main')
  await harness.ctx.tianwenConversationFeedback.whenIdle()
  const assessment = harness.ctx.tianwenEvolution.listConversationFeedbackAssessments(target.source.taskId)[0]!
  expect(harness.ctx.tianwenEvolution.listConversationTasks()[0]).toEqual(original)
  expect(assessment.started.source).toMatchObject({ kind: 'native', messageId: target.completion!.assistantMessageIds.at(-1), feedbackVersion: String(put.value.version) })
  return assessment
}

describe('public bundled Runtime native feedback scope capture', () => {
  it('delegates the complete current assessment instruction through the deployable public entry', async () => {
    // This checks deployable instruction transport, with disclosed fixture responses;
    // it cannot establish that a real model will classify future preferences correctly.
    const source = readFileSync(new URL('../../packages/tianwen-runtime-bundle/src/conversation-feedback-assessment.ts', import.meta.url), 'utf8')
    const instruction = source.match(/const ASSESSMENT_INSTRUCTION = `([\s\S]*?)`/)?.[1]
    expect(instruction).toBeTruthy()
    const harness = await mountPublic([corrected])
    try {
      const assessment = await putFeedback(harness)
      const request = harness.adapter.requests.find(request =>
        request.tools?.find(tool => tool.name === 'structured_output')?.parameters.properties?.classification !== undefined)
      expect(request).toBeDefined()
      expect(JSON.stringify(request)).toContain(JSON.stringify(instruction).slice(1, -1))
      const result = assessment.result!
      const { kind, assessmentId, taskId, proof, scopeReview, unavailableReason, ...value } = result
      const recovered = await recoverConversationStructuredJudgment(harness.ctx, proof!, value)
      expect(recovered.material).toMatchObject({ feedback: { rating: 'negative', note } })
      expect(result).toMatchObject({ classification: 'preference', unavailableReason: null })
      expect(harness.ctx.tianwenEvolution.isConversationGuidanceActivationQuarantined()).toBe(true)
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it('rejects an explicitly scripted nonliteral first quote before the same native child captures its correction', async () => {
    const invalid = { decisions: [corrected.decisions[0], { ...corrected.decisions[1],
      evidenceQuote: 'For all future neighborhood notices…with no title.' }] }
    const harness = await mountPublic([invalid, corrected])
    try {
      const assessment = await putFeedback(harness)
      // The stale public bundle instead records the first call and late-rejects it,
      // leaving the correction unconsumed and this native assessment unavailable.
      const firstScopeRequest = harness.adapter.requests.find(request =>
        request.tools?.find(tool => tool.name === 'structured_output')?.parameters.properties?.decisions !== undefined)!
      const firstChild = await harness.ctx.sessionPersistence.inspect(SessionId(String(firstScopeRequest.sessionId)))
      expect.soft(firstChild.events.flatMap(event => event.type === 'tool/result' ? [{
        callId: event.data.message.source.callId,
        isError: event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true),
      }] : [])).toEqual([
        { callId: 'explicit-invalid-scope', isError: true },
        { callId: 'exact-scope', isError: false },
      ])
      expect.soft(harness.scopeRequests()).toBe(2)
      expect(assessment.result).toMatchObject({ classification: 'preference', unavailableReason: null,
        scopeReview: { decisions: corrected.decisions, proof: { sessionId: expect.any(String) } } })
      expect(harness.scopeRequests()).toBe(2)
      const proof = assessment.result!.scopeReview!.proof
      const saved = await harness.ctx.sessionPersistence.inspect(SessionId(proof.sessionId))
      expect(proof.sessionId).toBe(String(firstScopeRequest.sessionId))
      expect(saved.meta).toMatchObject({ origin: 'subagent', parentSession: 'public-feedback-main' })
      const denied = saved.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'explicit-invalid-scope')
      expect(denied?.type === 'tool/result' && denied.data.message.content.some(block => block.type === 'tool-result' && block.isError === true)).toBe(true)
      expect(JSON.stringify(denied)).toContain('decisions[1].evidenceQuote')
      const success = saved.events.filter(event => event.type === 'tool/result'
        && event.data.message.content.some(block => block.type === 'tool-result' && block.isError !== true))
      expect(success).toHaveLength(1)
      expect(success[0]!.seq).toBeGreaterThan(denied!.seq)
      expect(success[0]!.type === 'tool/result' && success[0]!.data.message.source.callId).toBe('exact-scope')
      const childRequests = harness.adapter.requests.filter(request => String(request.sessionId) === proof.sessionId)
      expect(childRequests).toHaveLength(2)
      expect(JSON.stringify(childRequests[1]!.messages)).toContain('decisions[1].evidenceQuote')
      const recovered = await recoverConversationStructuredJudgment(harness.ctx, proof, corrected)
      expect(recovered.material).toMatchObject({ feedback: { rating: 'negative', note }, criteria: preference.supplementalCriteria })
      const material = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
      expect(sha256(material)).toBe(assessment.started.materialDigest)
      expect(hasVerifiedContinuingPreference(assessment.result!)).toBe(false)
      await expect(harness.ctx.tianwenConversationFeedback.proposalClueForAssessment(assessment)).rejects.toThrow('not eligible')
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })

  it.each(['continuing', 'unclear'] as const)('retains exact-quote %s scope and original proof eligibility without a fault', async scope => {
    const exact = { decisions: corrected.decisions.map(decision => ({ ...decision, scope })) }
    const harness = await mountPublic([exact])
    try {
      const assessment = await putFeedback(harness)
      expect(assessment.result).toMatchObject({ classification: 'preference', unavailableReason: null,
        scopeReview: { decisions: exact.decisions, proof: { sessionId: expect.any(String) } } })
      expect(harness.scopeRequests()).toBe(1)
      const result = assessment.result!
      const scopeProof = result.scopeReview!.proof
      const saved = await harness.ctx.sessionPersistence.inspect(SessionId(scopeProof.sessionId))
      expect(saved.events.filter(event => event.type === 'tool/result'
        && event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true))).toHaveLength(0)
      const recovered = await recoverConversationStructuredJudgment(harness.ctx, scopeProof, exact)
      expect(recovered.material).toMatchObject({ feedback: { rating: 'negative', note }, criteria: preference.supplementalCriteria })
      expect(scopeProof.sessionId).not.toBe(result.proof!.sessionId)
      const { kind: _kind, assessmentId: _assessmentId, taskId: _taskId, proof, unavailableReason: _unavailable, scopeReview: _scope, ...captured } = result
      const first = await recoverConversationStructuredJudgment(harness.ctx, proof!, captured)
      const material = await harness.ctx.tianwenConversationFeedback.materialForAssessment(assessment)
      expect(sha256(first.material)).toBe(sha256(material))
      expect(sha256(material)).toBe(assessment.started.materialDigest)
      expect(hasVerifiedContinuingPreference(result)).toBe(scope === 'continuing')
      if (scope === 'unclear') await expect(harness.ctx.tianwenConversationFeedback.proposalClueForAssessment(assessment)).rejects.toThrow('not eligible')
    } finally { await harness.handle.dispose(); await harness.ctx.fiber.dispose() }
  })
})
