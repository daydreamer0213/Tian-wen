import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness } from '@tianwen/dsh-compat'
import { sha256, type ConversationAuditedReviewCheck } from '../../packages/tianwen-evolution/src/index.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationClaimReviewCheck, verifyConversationOriginalReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted' }
const schema = { type: 'object' as const, additionalProperties: false, properties: {
  verdict: { type: 'string' as const }, category: { type: 'null' as const }, explanation: { type: 'string' as const },
  evidenceQuotes: { type: 'array' as const, items: { type: 'string' as const } }, audit: { type: 'object' as const, additionalProperties: true },
}, required: ['verdict', 'category', 'explanation', 'evidenceQuotes', 'audit'] }
function fileMaterial(content: string, answer = '') {
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: base, outputKind: 'files',
    entries: [{ path: 'input.txt', content }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'] }
  const task = { prompt: 'Copy input.txt exactly to output.txt.', files }
  const output = { answer, files: [{ path: 'input.txt', content }, { path: 'output.txt', content }] }
  return { task, answer, fileResult: { ...output, outputDigest: sha256(output) } }
}

it('packs complete multiline file bytes without changing original v1 projection or role/path/stage', () => {
  const content = 'export const value = 1;\r\n\n'.repeat(343) + '😀tail'
  const material = fileMaterial(content, 'saved')
  expect(() => projectClaimEvidence(material)).toThrow('material-too-large')
  const evidence = projectClaimEvidence(material, 'file-chunks-v1')
  expect(evidence.schemaVersion).toBe('tianwen.claim-evidence.v2')
  for (const stage of ['initial', 'final'] as const) {
    const chunks = evidence.items.filter(item => item.fileStage === stage)
    expect(chunks.map(item => item.text).join('')).toBe(content)
    expect(chunks).toHaveLength(Math.ceil([...content].length / 384))
    expect(chunks.every(item => item.role === (stage === 'initial' ? 'tool' : 'answer') && item.filePath === (stage === 'initial' ? 'input.txt' : 'output.txt'))).toBe(true)
    expect(chunks.reduce((count, item) => count + [...item.text].length, 0)).toBe([...content].length)
    expect(chunks.every(item => [...item.text].length <= 384)).toBe(true)
  }
  expect(evidence.items.find(item => item.id === 'answer-1')?.text).toBe('saved')
  expect(evidence.evidenceDigest).toBe(sha256(evidence.items))
  const small = fileMaterial('first\r\n\r\nsecond')
  expect(projectClaimEvidence(small).schemaVersion).toBe('tianwen.claim-evidence.v1')
  expect(projectClaimEvidence(small).items.filter(item => item.fileStage === 'final').map(item => item.text)).toEqual(['first\r\n', '\r\n', 'second'])
})

it('keeps byte/unit limits, empty files and missing-output rejection in the new file representation', () => {
  expect(projectClaimEvidence(fileMaterial(''), 'file-chunks-v1').items.at(-1)).toMatchObject({ text: '', fileStage: 'final', role: 'answer' })
  expect(() => projectClaimEvidence(fileMaterial('x'.repeat(32_769)), 'file-chunks-v1')).toThrow('material-too-large')
  expect(() => projectClaimEvidence(fileMaterial('', 'x\n'.repeat(128)), 'file-chunks-v1')).toThrow('material-too-large')
  expect(projectClaimEvidence(fileMaterial('', 'x\n'.repeat(127)), 'file-chunks-v1').items.filter(item => item.role === 'answer')).toHaveLength(128)
  const input = fileMaterial('input')
  const output = { answer: input.answer, files: input.fileResult.files.map(file => ({ ...file, content: file.path === 'output.txt' ? null : file.content })) }
  const missing = { ...input, fileResult: { ...output, outputDigest: sha256(output) } }
  expect(() => projectClaimEvidence(missing, 'file-chunks-v1')).toThrow('invalid-judgment')
})

it('does not let a projection choice change text or file-chat review semantics', () => {
  const text = { task: { prompt: 'Repeat.' }, answer: 'first\n\nsecond' }
  expect(projectClaimEvidence(text).items.filter(item => item.role === 'answer').map(item => item.text)).toEqual(['first\n', '\n', 'second'])
  expect(() => projectClaimEvidence(text, 'file-chunks-v1')).toThrow('invalid-judgment')
  const file = fileMaterial('first\n\nsecond', 'first\n\nsecond')
  const chat = { ...file, task: { ...file.task, files: { ...file.task.files, outputKind: 'chat', outputPaths: [], entries: [file.task.files.entries[0]!] } },
    fileResult: { answer: file.answer, files: [file.fileResult.files[0]!], outputDigest: '' } }
  chat.fileResult.outputDigest = sha256({ answer: chat.answer, files: chat.fileResult.files })
  expect(projectClaimEvidence(chat).schemaVersion).toBe('tianwen.claim-evidence.v1')
  expect(() => projectClaimEvidence(chat, 'file-chunks-v1')).toThrow('invalid-judgment')
  expect(() => projectClaimEvidence(file, 'unknown' as never)).toThrow('invalid-judgment')
})

it('persists full file v2 reviews and cold-verifies both purposes and historical v1 without new model requests', async () => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-packing-recovery-')); roots.push(root)
  const content = 'first\r\n\r\nsecond'
  const studyMaterial = fileMaterial(content)
  const original = { source: { context: [], request: [{ role: 'user', content: [{ type: 'text', text: studyMaterial.task.prompt }] }], files: studyMaterial.task.files },
    evaluationMode: 'local-files', conversation: [], toolEvidence: [], fileResult: studyMaterial.fileResult }
  const response = () => auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Exact file copy.', evidenceQuotes: ['first'] })
  const harness = await mountPersistentHarness(root, Array.from({ length: 10 }, response))
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('file-packing-parent'), meta: { cwd: root }, agentOptions: config })
  const expected = { purpose: 'method-study' as const, materialDigest: sha256(studyMaterial.task), outputDigest: studyMaterial.fileResult.outputDigest,
    fileOutput: studyMaterial.fileResult, modelConfigDigest: sha256(config) }
  const captures: { check: ConversationAuditedReviewCheck, purpose: 'original-result' | 'method-study' }[] = []
  try {
    for (const purpose of ['original-result', 'method-study'] as const) {
      const material = purpose === 'original-result' ? original : studyMaterial
      const reviewed = await runConversationClaimReview(harness.ctx, handle.agent, { label: `Packed ${purpose}`, material,
        purpose, evidence: [content, 'first'], signal: new AbortController().signal, callConfig: config })
      expect(reviewed.verdict).toBe('met')
      const recovered = await recoverConversationJudgmentRequest(harness.ctx, reviewed.reviewChecks[0]!)
      expect((recovered.material as { claimEvidence: { schemaVersion: string } }).claimEvidence.schemaVersion).toBe('tianwen.claim-evidence.v2')
      captures.push(...reviewed.reviewChecks.map(check => ({ check, purpose })))
      const capture = async (evidence: unknown) => {
        const raw = await runConversationJudgment(harness.ctx, handle.agent, { label: 'Frozen projection capture', instruction: recovered.instruction,
          material: { original: material, claimEvidence: evidence }, outputSchema: schema, signal: new AbortController().signal, callConfig: config })
        return { ...(raw.value as object), focus: 'requirements', proof: raw.proof } as ConversationAuditedReviewCheck
      }
      const legacy = await capture(projectClaimEvidence(material))
      captures.push({ check: legacy, purpose })
      const verify = (check: ConversationAuditedReviewCheck) => purpose === 'original-result'
        ? verifyConversationOriginalReviewCheck(harness.ctx, check, original, sha256(config)) : verifyConversationClaimReviewCheck(harness.ctx, check, expected)
      const current = projectClaimEvidence(material, 'file-chunks-v1')
      const unknown = await capture({ ...current, schemaVersion: 'tianwen.claim-evidence.v999' })
      const swapped = await capture({ ...current, schemaVersion: 'tianwen.claim-evidence.v1' })
      const count = harness.adapter.requests.length
      await expect(verify(unknown)).rejects.toThrow()
      await expect(verify(swapped)).rejects.toThrow()
      expect(harness.adapter.requests).toHaveLength(count)
    }
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try {
    for (const { check, purpose } of captures) await expect(purpose === 'original-result'
      ? verifyConversationOriginalReviewCheck(cold.ctx, check, original, sha256(config))
      : verifyConversationClaimReviewCheck(cold.ctx, check, expected)).resolves.toBeUndefined()
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})
