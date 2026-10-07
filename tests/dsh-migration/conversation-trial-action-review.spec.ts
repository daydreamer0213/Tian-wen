import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { sha256, type ConversationAuditedReviewCheck } from '../../packages/tianwen-evolution/src/index.js'
import { runConversationFileTrial, recoverConversationFileTrialExecution } from '../../packages/tianwen-runtime-bundle/src/conversation-file-trial.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationClaimReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
const require = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const fileTools = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tool-fs')).href)
const localFs = (await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href)).default
const spawn = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted' }

it('cold-binds new trial facts to its own arm even when another native trial produced identical output, and leaves old reviews unchanged', async () => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'trial-action-review-')); roots.push(root)
  const replicas = join(root, 'replicas'); mkdirSync(replicas)
  const worker = { prompt: 'Read input.md before writing output.md.', files: { schemaVersion: 'tianwen.conversation-file-material.v1' as const,
    outputKind: 'files' as const, cwd: root, entries: [{ path: 'input.md', content: 'Source fact.' }, { path: 'output.md', content: null }], outputPaths: ['output.md'] } }
  const nativeTrial = () => [toolCallResponse('read-own', 'read', { file_path: 'input.md' }),
    toolCallResponse('write-own', 'write', { file_path: 'output.md', content: 'Source fact.' }), textResponse('Saved output.md.')]
  const response = () => auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Controlled native binding fixture, not semantic proof.', evidenceQuotes: ['Source fact.'] })
  const h = await mountPersistentHarness(root, [...nativeTrial(), ...nativeTrial(), response(), response(), response(), response(), response()])
  await h.ctx.plugin(localFs, { cwd: root }); await h.ctx.plugin(fileTools, {})
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('trial-action-review-parent'), meta: { cwd: root }, agentOptions: config })
  const input = { label: 'Owned native trial', material: worker, callConfig: config, signal: new AbortController().signal,
    replicaParent: replicas, retainReceipt: () => undefined }
  const captures: { check: ConversationAuditedReviewCheck, legacy: boolean }[] = []
  let own: Awaited<ReturnType<typeof runConversationFileTrial>>, other: typeof own
  try {
    own = await runConversationFileTrial(h.ctx, handle.agent, input); other = await runConversationFileTrial(h.ctx, handle.agent, input)
    expect(own.outputDigest).toBe(other.outputDigest); expect(own.proof.sessionId).not.toBe(other.proof.sessionId)
    const output = { answer: own.answer, files: own.files, outputDigest: own.outputDigest }
    const material = { task: worker, answer: own.answer, fileResult: output, trialExecution: own.trialExecution }
    const judged = await runConversationClaimReview(h.ctx, handle.agent, { purpose: 'method-study', label: 'New own trial review', material,
      evidence: ['Source fact.'], signal: input.signal, callConfig: config })
    captures.push(...judged.reviewChecks.map(check => ({ check, legacy: false })))
    const expected = { purpose: 'method-study' as const, materialDigest: sha256(worker), outputDigest: own.outputDigest,
      modelConfigDigest: sha256(config), fileOutput: output }
    await expect(verifyConversationClaimReviewCheck(h.ctx, judged.reviewChecks[0]!, expected)).rejects.toThrow('invalid-judgment')
    await expect(verifyConversationClaimReviewCheck(h.ctx, judged.reviewChecks[0]!, { ...expected, recoverTrialExecution: async () => other.trialExecution })).rejects.toThrow('invalid-judgment')
    const { trialExecution: _execution, ...legacy } = material
    const old = await runConversationClaimReview(h.ctx, handle.agent, { purpose: 'method-study', label: 'Legacy absent trial facts', material: legacy,
      evidence: ['Source fact.'], signal: input.signal, callConfig: config })
    captures.push(...old.reviewChecks.map(check => ({ check, legacy: true })))
    for (const check of old.reviewChecks) await expect(verifyConversationClaimReviewCheck(h.ctx, check, { ...expected,
      recoverTrialExecution: async () => { throw new Error('must not backfill legacy facts') } })).resolves.toBeUndefined()
    const recovered = await recoverConversationJudgmentRequest(h.ctx, judged.reviewChecks[0]!)
    const mutated = { ...material, trialExecution: { ...own.trialExecution, executionProof: other.proof } }
    const raw = await runConversationJudgment(h.ctx, handle.agent, { label: 'Controlled borrowed own-action proof', instruction: recovered.instruction,
      material: { original: mutated, claimEvidence: projectClaimEvidence(mutated, 'file-chunks-v1') },
      outputSchema: { type: 'object', additionalProperties: true }, signal: input.signal, callConfig: config })
    const substituted = { ...(raw.value as object), focus: 'requirements', proof: raw.proof } as ConversationAuditedReviewCheck
    await expect(verifyConversationClaimReviewCheck(h.ctx, substituted, { ...expected, recoverTrialExecution: async () => own.trialExecution })).rejects.toThrow('invalid-judgment')
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try {
    const output = { answer: own!.answer, files: own!.files, outputDigest: own!.outputDigest }
    for (const { check, legacy } of captures) await expect(verifyConversationClaimReviewCheck(cold.ctx, check, {
      purpose: 'method-study', materialDigest: sha256(worker), outputDigest: own!.outputDigest, modelConfigDigest: sha256(config), fileOutput: output,
      recoverTrialExecution: () => legacy ? Promise.reject(new Error('must not backfill old review'))
        : recoverConversationFileTrialExecution(cold.ctx, own!.proof, { receipt: own!.receipt, material: worker, callConfig: config, outputDigest: own!.outputDigest }),
    })).resolves.toBeUndefined()
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})
