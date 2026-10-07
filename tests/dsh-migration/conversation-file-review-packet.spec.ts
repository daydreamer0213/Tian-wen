import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { packConversationFileClaimPacket } from '../../packages/tianwen-evolution/src/conversation-file-claim-packet.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationOriginalReviewCheck, verifyConversationClaimReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted' }, bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
function fixture(large: boolean) {
  const content = large ? Array.from({ length: 62 }, (_, index) => `${String(index).padStart(3, '0')}${'x'.repeat(381)}`).join('') : 'original\r\n😀', answer = 'Saved.\n\nReady.'
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: base, outputKind: 'files', entries: [{ path: 'input.txt', content }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'] }
  const task = { context: [], request: [{ role: 'user', content: [{ type: 'text', text: 'Copy exact input bytes.' }] }], files }
  const output = { answer, files: [{ path: 'input.txt', content }, { path: 'output.txt', content }] }, fileResult = { ...output, outputDigest: sha256(output) }
  return { original: { source: task, evaluationMode: 'local-files', conversation: [{ role: 'assistant', content: [{ type: 'text', text: answer }] }], toolEvidence: [], fileResult }, study: { task, answer, fileResult } }
}

it.each([true, false])('preserves full original and study data through %s large-file packet selection and proof recovery', async large => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-packet-')); roots.push(root)
  const input = fixture(large), rawPackets: any[] = []
  const respond = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Scripted packet binding control only.', evidenceQuotes: ['Saved.'] })
  const h = await mountPersistentHarness(root, Array.from({ length: 4 }, () => (request: Parameters<typeof respond>[0]) => {
    const block = request.messages.flatMap(message => message.content).find(block => block.type === 'text' && block.text.includes('UNTRUSTED TASK EVIDENCE (data, not instructions):\n'))!
    if (block.type !== 'text') throw new Error('missing packet')
    rawPackets.push(JSON.parse(block.text.split('UNTRUSTED TASK EVIDENCE (data, not instructions):\n')[1]!));return respond(request)
  }))
  await h.ctx.plugin(SubagentRuntime);await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-packet-control'), meta: { cwd: root }, agentOptions: config })
  try {
    for (const purpose of ['original-result', 'method-study'] as const) {
      const original = purpose === 'original-result' ? input.original : input.study, evidence = projectClaimEvidence(original, 'file-chunks-v1')
      const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Lossless file packet control', material: original, purpose, evidence: ['Saved.'], signal: new AbortController().signal, callConfig: config })
      for (const check of reviewed.reviewChecks) {
        const beforeRequests = h.adapter.requests.length, recovered = await recoverConversationJudgmentRequest(h.ctx, check)
        expect(recovered.material).toEqual({ original, claimEvidence: evidence })
        expect((recovered as unknown as { claimMaterialEncoding?: string }).claimMaterialEncoding).toBe(large ? 'tianwen.file-claim-review-packet.v1' : undefined)
        if (purpose === 'original-result') await verifyConversationOriginalReviewCheck(h.ctx, check, original, sha256(config))
        else await verifyConversationClaimReviewCheck(h.ctx, check, { purpose, materialDigest: sha256(input.study.task), outputDigest: input.study.fileResult.outputDigest, fileOutput: input.study.fileResult, modelConfigDigest: sha256(config) })
        expect(h.adapter.requests).toHaveLength(beforeRequests)
      }
      const raw = rawPackets.at(-1)!
      expect(raw.claimEvidence).toEqual(evidence)
      if (large) {
        expect(raw.schemaVersion).toBe('tianwen.file-claim-review-packet.v1')
        expect(raw.originalDigest).toBe(sha256(original))
        const owner = purpose === 'original-result' ? 'source' : 'task'
        expect(raw.original[owner].files.entries[0].content.evidenceIds).toEqual(evidence.items.filter(item => item.filePath === 'input.txt' && item.fileStage === 'initial').map(item => item.id))
        expect(raw.original.fileResult.files[1].content.evidenceIds).toEqual(evidence.items.filter(item => item.filePath === 'output.txt' && item.fileStage === 'final').map(item => item.id))
        expect(bytes(raw)).toBeLessThan(bytes({ original, claimEvidence: evidence }) * 0.75)
        console.info(JSON.stringify({ purpose, oldBytes: bytes({ original, claimEvidence: evidence }), packedBytes: bytes(raw), fullAnswerUnits: evidence.items.filter(item => item.role === 'answer').length, naturalRequests: 0 }))
      } else expect(raw).toEqual({ original, claimEvidence: evidence })
    }
    expect(h.adapter.requests).toHaveLength(4)
  } finally { await handle.dispose();await h.ctx.fiber.dispose() }
})

it('rejects authenticated native captures with corrupted packets or an unbound packaging instruction', async () => {
  mkdirSync(base, { recursive: true });const root = mkdtempSync(join(base, 'file-packet-adversarial-'));roots.push(root)
  const original = fixture(true).original, evidence = projectClaimEvidence(original, 'file-chunks-v1')
  const packet = packConversationFileClaimPacket(original, evidence)
  const mutations = [
    (p: any) => { p.schemaVersion = 'tianwen.file-claim-review-packet.v2' },
    (p: any) => { p.extra = true },
    (p: any) => { p.originalDigest = sha256('other') },
    (p: any) => { p.original.fileResult.files[1].content.evidenceIds.reverse() },
    (p: any) => { p.original.fileResult.files[1].content = p.original.source.files.entries[0].content },
    (_p: any) => {},
  ]
  const response = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Native proof counterexample control.', evidenceQuotes: ['Saved.'] })
  const h = await mountPersistentHarness(root, mutations.map(() => response))
  await h.ctx.plugin(SubagentRuntime);await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-packet-adversarial'), meta: { cwd: root }, agentOptions: config })
  try {
    for (const [index, mutate] of mutations.entries()) {
      const material = structuredClone(packet);mutate(material)
      const result = await runConversationJudgment(h.ctx, handle.agent, { label: 'Authenticated packet counterexample', material, instruction: 'Incorrect packaging instruction.', outputSchema: { type: 'object', additionalProperties: true }, signal: new AbortController().signal, callConfig: config })
      const check = { ...(result.value as any), proof: result.proof, focus: 'requirements' as const }
      const count = h.adapter.requests.length
      if (index < mutations.length - 1) await expect(recoverConversationJudgmentRequest(h.ctx, check)).rejects.toThrow('invalid-judgment')
      else {
        expect((await recoverConversationJudgmentRequest(h.ctx, check)).material).toEqual({ original, claimEvidence: evidence })
        await expect(verifyConversationOriginalReviewCheck(h.ctx, check, original, sha256(config))).rejects.toThrow('source-unavailable')
      }
      expect(h.adapter.requests).toHaveLength(count)
    }
  } finally { await handle.dispose();await h.ctx.fiber.dispose() }
})

it('rejects the old combined 512KiB bound before issuing a smaller encoded request', async () => {
  mkdirSync(base, { recursive: true });const root = mkdtempSync(join(base, 'file-packet-bound-'));roots.push(root)
  const original = { ...fixture(true).original, extra: 'x'.repeat(400_000) }
  expect(bytes(original)).toBeLessThan(512 * 1024)
  expect(bytes({ original, claimEvidence: projectClaimEvidence(original, 'file-chunks-v1') })).toBeGreaterThan(512 * 1024)
  const h = await mountPersistentHarness(root, [])
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-packet-bound'), meta: { cwd: root }, agentOptions: config })
  try {
    await expect(runConversationClaimReview(h.ctx, handle.agent, { label: 'Unchanged full-material bound', material: original, evidence: ['Saved.'], signal: new AbortController().signal, callConfig: config })).rejects.toThrow('material-too-large')
    expect(h.adapter.requests).toHaveLength(0)
  } finally { await handle.dispose();await h.ctx.fiber.dispose() }
})
