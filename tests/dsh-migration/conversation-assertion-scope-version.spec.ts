import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { conversationQualityContract, parseConversationQualityContract, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationClaimReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const base = process.platform === 'win32' ? 'D:/DevData/tianwen-assertion-version-tests' : '/tmp/tianwen-assertion-version-tests'
const roots: string[] = []
const config = { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25 }
// Frozen before the change, independent of the new criterion builder.
const v11Digest = 'sha256:70fdec4324479cbe9800aa6caa9b7ecc34d1891a3d7ce175ecdc846cb578c8e1'
function legacyV11() {
  const criterion = conversationQualityContract().criterion.split(' Check each independent assertion')[0]!
  const old = { schemaVersion: 'tianwen.conversation-quality.v11' as const, source: 'host' as const, criterion }
  expect(sha256(old)).toBe(v11Digest)
  return old
}
function temporaryRoot() { mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'native-')); roots.push(root); return root }
afterEach(() => { for (const root of roots.splice(0)) { expect(dirname(resolve(root))).toBe(resolve(base)); rmSync(root, { recursive: true, force: true }) } })
function reply(material: unknown, answer: string) {
  const evidence = projectClaimEvidence(material)
  return toolCallResponse('scope-source-capture', 'structured_output', {
    verdict: 'met', category: null, explanation: 'The direct user record supplies this exact scoped commitment.', evidenceQuotes: [answer],
    audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: evidence.evidenceDigest, units: {
      'answer-1': { firstClaim: { quote: answer, kind: 'source-fact', status: 'supported', sourceIds: ['request-1'], explanation: 'request-1 directly establishes this assertion; the assistant context is not its authority.' }, additionalClaims: [] },
    } },
  })
}

it('uses v12 independent assertion responsibility in the actual native request and recovers it cold', async () => {
  const quality = conversationQualityContract()
  expect(quality.schemaVersion).toBe('tianwen.conversation-quality.v12')
  const root = temporaryRoot(), answer = '保存的偏好会应用于下一次导览。'
  const material = { task: { context: [{ role: 'assistant', content: [{ type: 'text', text: '之前有人提出过人工审核建议。' }] }],
    request: [{ role: 'user', content: [{ type: 'text', text: '请复述这条产品记录，不增加规则：保存的偏好会应用于下一次导览。' }] }], criteria: [], qualityContract: quality }, answer }
  const harness = await mountPersistentHarness(root, [reply(material, answer), reply(material, answer)])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('v12-assertion-parent'), meta: { cwd: root }, agentOptions: config })
  const expected = { purpose: 'method-study' as const, materialDigest: sha256(material.task), outputDigest: sha256(answer), modelConfigDigest: sha256(config) }
  let checks: Awaited<ReturnType<typeof runConversationClaimReview>>['reviewChecks']
  try {
    const result = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'New assertion scope', purpose: 'method-study', material,
      evidence: [answer], callConfig: config, signal: new AbortController().signal })
    expect(result.verdict).toBe('met'); checks = result.reviewChecks
    expect(harness.adapter.requests).toHaveLength(2)
    for (const check of checks) {
      await verifyConversationClaimReviewCheck(harness.ctx, check, expected)
      const recovered = await recoverConversationJudgmentRequest(harness.ctx, check)
      expect(recovered.material.original).toEqual(material)
      expect(recovered.material.claimEvidence.items).toEqual(projectClaimEvidence(material).items)
      expect(recovered.instruction).toContain('Assess each independently asserted')
      expect(recovered.instruction).toContain('one supported clause')
      const schema: any = harness.adapter.requests.find(r => String(r.sessionId) === check.proof.sessionId)?.tools?.find(t => t.name === 'structured_output')?.parameters
      expect(schema.properties.audit.properties.units.properties['answer-1'].properties.additionalClaims.description).toContain('independent source')
    }
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try {
    for (const check of checks!) {
      await verifyConversationClaimReviewCheck(cold.ctx, check, expected)
      await expect(verifyConversationClaimReviewCheck(cold.ctx, check, { ...expected, materialDigest: sha256('changed authority') })).rejects.toThrow('invalid-judgment')
      await expect(verifyConversationClaimReviewCheck(cold.ctx, { ...check, proof: { ...check.proof, requestDigest: sha256('swapped version request') } }, expected)).rejects.toThrow('invalid-judgment')
    }
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})

it('preserves frozen v11 contract, native instruction and schema independently of current v12', async () => {
  const old = legacyV11(); expect(parseConversationQualityContract(old)).toEqual(old)
  const root = temporaryRoot(), answer = '记录已提交。', material = { task: { prompt: '记录已提交。请复述。', criteria: [], qualityContract: old }, answer }
  const harness = await mountPersistentHarness(root, [reply(material, answer), reply(material, answer)])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('v11-preserved-parent'), meta: { cwd: root }, agentOptions: config })
  const expected = { purpose: 'method-study' as const, materialDigest: sha256(material.task), outputDigest: sha256(answer), modelConfigDigest: sha256(config) }
  let checks: Awaited<ReturnType<typeof runConversationClaimReview>>['reviewChecks']
  try {
    const result = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Legacy v11', purpose: 'method-study', material,
      evidence: [answer], callConfig: config, signal: new AbortController().signal }); checks = result.reviewChecks
    expect(result.verdict).toBe('met')
    for (const check of checks) {
      await verifyConversationClaimReviewCheck(harness.ctx, check, expected)
      const request = await recoverConversationJudgmentRequest(harness.ctx, check)
      expect(request.instruction).not.toContain('Assess each independently asserted')
      const schema: any = harness.adapter.requests.find(r => String(r.sessionId) === check.proof.sessionId)?.tools?.find(t => t.name === 'structured_output')?.parameters
      expect(schema.properties.audit.properties.units.properties['answer-1'].properties.additionalClaims.description).toBe('Additional assessments for this same answer unit; use an empty array when its first claim covers the whole nonblank unit.')
      expect(sha256(request.instruction)).toBe(check.focus === 'requirements'
        ? 'sha256:09104dc783af9896ad46c1e5b30fed47db1254a3a248a84c5ee92f209c4538c8'
        : 'sha256:a5e531160d6dc2c9615ec68b86dec9b3ba27415b683f2930fc130cb0a8c70e37')
      expect(sha256(schema)).toBe('sha256:66de984e2705ffe23f1eb8ab4ac6d56ad9a0675c7a7a572a57e5b762be80cd6e')
    }
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try { for (const check of checks!) await verifyConversationClaimReviewCheck(cold.ctx, check, expected); expect(cold.adapter.requests).toHaveLength(0) }
  finally { await cold.ctx.fiber.dispose() }
})
