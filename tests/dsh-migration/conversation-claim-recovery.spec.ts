import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { sha256, type ConversationAuditedReviewCheck } from '../../packages/tianwen-evolution/src/index.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationClaimReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, runConversationJudgment, verifyConversationReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25 }
const schema = {
  type: 'object' as const, additionalProperties: false,
  properties: { verdict: { type: 'string' as const }, category: { type: 'null' as const }, explanation: { type: 'string' as const }, evidenceQuotes: { type: 'array' as const, items: { type: 'string' as const } },
    audit: { type: 'object' as const, additionalProperties: true } },
  required: ['verdict', 'category', 'explanation', 'evidenceQuotes', 'audit'],
}

it.each(['nonexistent-quote', 'assistant-only-support', 'missing-answer-coverage'] as const)('rejects a real native capture with %s audit evidence', async invalid => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'claim-recovery-')); roots.push(root)
  const material = invalid === 'assistant-only-support'
    ? { task: { context: [{ role: 'assistant', content: [{ type: 'text', text: 'Earlier assistant says delivered.' }] }], request: [{ role: 'user', content: [{ type: 'text', text: 'Only repeat: delivered.' }] }], criteria: ['repeat'] }, answer: 'delivered.' }
    : { task: { prompt: 'Only repeat: delivered.', criteria: ['repeat'] }, answer: invalid === 'missing-answer-coverage' ? 'delivered.\nSecond answer unit.' : 'delivered.' }
  const evidence = projectClaimEvidence(material)
  const audit = { schemaVersion: 'tianwen.claim-audit.v1', evidenceDigest: evidence.evidenceDigest,
    units: [{ answerId: 'answer-1', claims: [{ quote: invalid === 'nonexistent-quote' ? 'invented' : invalid === 'missing-answer-coverage' ? 'delivered.\n' : 'delivered.', kind: 'source-fact', status: 'supported', sourceIds: [invalid === 'assistant-only-support' ? 'context-1' : 'request-1'], explanation: 'Scripted native negative capture.' }] }] }
  const harness = await mountPersistentHarness(root, [auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] }), auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] }), toolCallResponse('invalid-audit', 'structured_output', { verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'], audit })])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('claim-recovery-parent'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Claim recovery', material, evidence: ['Only repeat: delivered.', 'delivered.'], purpose: 'method-study', signal: new AbortController().signal, callConfig: config })
    const recovered = await recoverConversationJudgmentRequest(harness.ctx, reviewed.reviewChecks[0])
    const raw = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Claim recovery invalid', instruction: recovered.instruction, material: recovered.material, outputSchema: schema, signal: new AbortController().signal, callConfig: config })
    const check = { ...(raw.value as object), focus: 'requirements', proof: raw.proof } as ConversationAuditedReviewCheck
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, { purpose: 'method-study', materialDigest: sha256(material.task), outputDigest: sha256(material.answer), modelConfigDigest: sha256(config) })).rejects.toThrow('invalid-judgment')
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('binds a real capture to exact projection, request, focus, task, answer and model', async () => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'claim-recovery-bindings-')); roots.push(root)
  const material = { task: { prompt: 'Only repeat: delivered.', criteria: ['repeat'] }, answer: 'delivered.' }
  const harness = await mountPersistentHarness(root, [auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] }), auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] })])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('claim-binding-parent'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Claim binding', material, evidence: ['Only repeat: delivered.', 'delivered.'], purpose: 'method-study', signal: new AbortController().signal, callConfig: config })
    const check = reviewed.reviewChecks[0]!
    const expected = { purpose: 'method-study' as const, materialDigest: sha256(material.task), outputDigest: sha256(material.answer), modelConfigDigest: sha256(config) }
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, expected)).resolves.toBeUndefined()
    await expect(verifyConversationClaimReviewCheck(harness.ctx, { ...check, focus: 'grounding' }, expected)).rejects.toThrow('invalid-judgment')
    await expect(verifyConversationClaimReviewCheck(harness.ctx, { ...check, proof: { ...check.proof, requestDigest: sha256('changed') } }, expected)).rejects.toThrow('invalid-judgment')
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, { ...expected, materialDigest: sha256('wrong-task') })).rejects.toThrow('invalid-judgment')
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, { ...expected, outputDigest: sha256('wrong-answer') })).rejects.toThrow('invalid-judgment')
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, { ...expected, modelConfigDigest: sha256('wrong-model') })).rejects.toThrow('invalid-judgment')
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects a real native capture whose persisted wrapper substitutes the projection', async () => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'claim-recovery-projection-')); roots.push(root)
  const material = { task: { prompt: 'Only repeat: delivered.', criteria: ['repeat'] }, answer: 'delivered.' }
  const evidence = projectClaimEvidence(material)
  const audit = { schemaVersion: 'tianwen.claim-audit.v1', evidenceDigest: evidence.evidenceDigest, units: [{ answerId: 'answer-1', claims: [{ quote: 'delivered.', kind: 'source-fact', status: 'supported', sourceIds: ['request-1'], explanation: 'Captured before wrapper substitution.' }] }] }
  const harness = await mountPersistentHarness(root, [auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] }), auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] }), toolCallResponse('substituted-projection', 'structured_output', { verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'], audit })])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('claim-projection-parent'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Claim projection', material, evidence: ['Only repeat: delivered.', 'delivered.'], purpose: 'method-study', signal: new AbortController().signal, callConfig: config })
    const recovered = await recoverConversationJudgmentRequest(harness.ctx, reviewed.reviewChecks[0])
    const substituted = { ...(recovered.material as Record<string, unknown>), claimEvidence: { ...evidence, evidenceDigest: sha256('substituted') } }
    const raw = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Claim projection substituted', instruction: recovered.instruction, material: substituted, outputSchema: schema, signal: new AbortController().signal, callConfig: config })
    const check = { ...(raw.value as object), focus: 'requirements', proof: raw.proof } as ConversationAuditedReviewCheck
    await expect(verifyConversationClaimReviewCheck(harness.ctx, check, { purpose: 'method-study', materialDigest: sha256(material.task), outputDigest: sha256(material.answer), modelConfigDigest: sha256(config) })).rejects.toThrow('invalid-judgment')
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})

it('rejects a successful native capture outside the descriptor request interval even when the legacy capture proof passes', async () => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'claim-interval-')); roots.push(root)
  const material = { task: { prompt: 'Only repeat: delivered.', criteria: ['repeat'] }, answer: 'delivered.' }
  const response = () => auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Complete.', evidenceQuotes: ['delivered.'] })
  const harness = await mountPersistentHarness(root, [response(), response()])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('claim-interval-parent'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Interval binding', material,
      evidence: ['Only repeat: delivered.', 'delivered.'], purpose: 'method-study', signal: new AbortController().signal, callConfig: config })
    const check = reviewed.reviewChecks[0]
    await expect(recoverConversationJudgmentRequest(harness.ctx, check)).resolves.toBeDefined()
    const inspect = harness.ctx.sessionPersistence.inspect.bind(harness.ctx.sessionPersistence)
    const saved = await inspect(SessionId(check.proof.sessionId))
    const start = saved.events.find(event => event.type === 'turn/start')!
    const end = saved.events.find(event => event.type === 'turn/end')!
    if (start.type !== 'turn/start' || end.type !== 'turn/end') throw new Error('missing native turn interval')
    const capture = saved.events.findIndex(event => event.type === 'tool/call')
    expect(capture).toBeGreaterThan(0)
    // Non-acceptance persisted-topology mutation only; capture arguments and
    // successful result are unchanged and still pass the legacy exact verifier.
    const laterStart = { ...start, data: { ...start.data, turn: start.data.turn + 1 } }
    const tail = saved.events.slice(capture).map(event => event.type === 'turn/end' ? { ...event, data: { ...event.data, turn: start.data.turn + 1 } } : event)
    const events = [...saved.events.slice(0, capture), end, laterStart, ...tail]
      .map((event, seq) => ({ ...event, seq: seq + 1 }))
    const substituted = { ...saved, events }
    const displaced = { ...check, proof: { ...check.proof, sessionDigest: sha256({ meta: saved.meta, events }) } }
    vi.spyOn(harness.ctx.sessionPersistence, 'inspect').mockImplementation(id => String(id) === check.proof.sessionId ? Promise.resolve(substituted) : inspect(id))
    await expect(verifyConversationReviewCheck(harness.ctx, displaced)).resolves.toBeUndefined()
    await expect(recoverConversationJudgmentRequest(harness.ctx, displaced)).rejects.toThrow('invalid-judgment')
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})
