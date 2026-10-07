import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { assertSupportedJsonSchema, validateJsonSchemaValue, type ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { CallId, SessionId, mountPersistentHarness } from '@tianwen/dsh-compat'
import { sha256, type ConversationAuditedReviewCheck } from '../../packages/tianwen-evolution/src/index.js'
import { projectClaimEvidence, runConversationClaimReview, verifyConversationOriginalReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted' }
const prompt = '甲'.repeat(380) + '必须先读取来源再写报告。'
const crossing = '必须先读取来源再写报告。'
function files(content = 'Source fact.', outputContent = 'Source fact.') {
  const entries = [{ path: 'input.txt', content }, { path: 'output.txt', content: null }]
  const output = { answer: '', files: [{ path: 'input.txt', content }, { path: 'output.txt', content: outputContent }] }
  return { source: { context: [], request: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    criteria: ['DERIVED_CRITERION_CANARY'], files: { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: base, outputKind: 'files', entries, outputPaths: ['output.txt'] } },
    evaluationMode: 'local-files', conversation: [], toolEvidence: [], fileResult: { ...output, outputDigest: sha256(output) } }
}
async function review(material: unknown, inspect: (schema: ObjectJsonSchema) => void, purpose: 'original-result' | 'method-study' = 'original-result', quotes = ['Source fact.']) {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-quote-choices-')); roots.push(root)
  const respond = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Controlled schema fixture, not a real acceptance result.', evidenceQuotes: quotes })
  const schemas: ObjectJsonSchema[] = []
  const response = (request: GenerateOptions) => {
    const raw = request.tools?.find(tool => tool.name === 'structured_output')?.parameters
    if (raw?.type !== 'object') throw new Error('missing native structured object schema')
    const schema = raw as unknown as ObjectJsonSchema
    assertSupportedJsonSchema(schema)
    schemas.push(schema); return respond(request)
  }
  const h = await mountPersistentHarness(root, [response, response])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-quote-parent'), meta: { cwd: root }, agentOptions: config })
  try {
    const result = await runConversationClaimReview(h.ctx, handle.agent, { label: 'File quote choices', material, purpose,
      evidence: ['Source fact.'], signal: new AbortController().signal, callConfig: config })
    expect(result.verdict).toBe('met'); expect(h.adapter.requests).toHaveLength(2)
    expect(result.reviewChecks.map(check => check.evidenceQuotes)).toEqual([quotes, quotes])
    if (purpose === 'original-result') for (const check of result.reviewChecks) await verifyConversationOriginalReviewCheck(h.ctx, check, material, sha256(config))
    expect(schemas).toHaveLength(2); for (const schema of schemas) inspect(schema)
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
}

it.each(['original-result', 'method-study'] as const)('offers single-item quote examples while accepting a legal non-example in new %s full-file reviews', async purpose => {
  const original = files()
  const material = purpose === 'original-result' ? original : { task: { prompt, files: original.source.files, criteria: ['DERIVED_CRITERION_CANARY'],
    feedbackStandard: { criteria: ['FEEDBACK_STANDARD_CANARY'] } }, answer: '', fileResult: original.fileResult }
  const evidence = projectClaimEvidence(material, 'file-chunks-v1')
  expect(prompt).toContain(crossing); expect(evidence.items.some(item => item.text.includes(crossing))).toBe(false)
  const expected = [...new Set(evidence.items.flatMap(item => item.text.trim() === '' ? [] : [item.text]))]
  await review(material, schema => {
    const quoteSchema = schema.properties!.evidenceQuotes!
    expect(quoteSchema.items?.enum).toBeUndefined()
    expect(quoteSchema.items?.examples).toEqual(expected)
    expect(quoteSchema.items?.examples).not.toContain('Source')
    expect(expected.every(quote => evidence.items.some(item => item.text.includes(quote)))).toBe(true)
    expect(validateJsonSchemaValue(quoteSchema, ['Source'])).toEqual([])
    expect(schema.properties?.evidenceQuotes?.items?.description).toContain('one')
    expect(expected).not.toContain(crossing)
    expect(expected.some(text => text.includes('CANARY'))).toBe(false)
  }, purpose, ['Source'])
})

it('deduplicates quote examples without promoting empty answer units to quotations', async () => {
  const material = files('Source fact.', '')
  const evidence = projectClaimEvidence(material, 'file-chunks-v1')
  expect(evidence.items.some(item => item.role === 'answer' && item.text === '')).toBe(true)
  await review(material, schema => {
    expect(schema.properties?.evidenceQuotes?.items?.enum).toBeUndefined()
    const choices = schema.properties?.evidenceQuotes?.items?.examples
    expect(choices).toEqual([...new Set(evidence.items.flatMap(item => item.text.trim() === '' ? [] : [item.text]))])
    expect(choices).not.toContain('')
  })
})

it('rejects a cross-item quote with an example-only schema before accepting a legal non-example correction', async () => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-quote-example-repair-')); roots.push(root)
  const material = files(), evidence = projectClaimEvidence(material, 'file-chunks-v1')
  expect(evidence.items.some(item => item.text.includes(crossing))).toBe(false)
  const response = (quote: string, callId: string) => (request: GenerateOptions) => auditedEvidenceResponse({
    verdict: 'met', category: null, explanation: 'Controlled example-only quote boundary.', evidenceQuotes: [quote],
  }, 'empty', false)(request).map(chunk => chunk.type === 'block-end' && chunk.block.type === 'tool-call'
    ? { ...chunk, block: { ...chunk.block, id: CallId(callId) } } : chunk)
  const h = await mountPersistentHarness(root, [
    request => {
      const quoteSchema = request.tools!.find(tool => tool.name === 'structured_output')!.parameters.properties!.evidenceQuotes!
      expect(quoteSchema.items?.enum).toBeUndefined()
      expect(quoteSchema.items?.examples).not.toContain('Source')
      expect(validateJsonSchemaValue(quoteSchema, [crossing])).toEqual([])
      return response(crossing, 'cross-item-example')(request)
    },
    request => {
      expect(JSON.stringify(request.messages)).toContain('Invalid evidenceQuotes item 1')
      return response('Source', 'corrected-non-example')(request)
    },
    response('Source', 'independent-non-example'),
  ])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-quote-example-parent'), meta: { cwd: root }, agentOptions: config })
  let checks: ConversationAuditedReviewCheck[] = []
  try {
    const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Example-only host quote boundary', material,
      evidence: ['Source fact.'], signal: new AbortController().signal, callConfig: config })
    expect(reviewed.verdict).toBe('met')
    expect(reviewed.reviewChecks.map(check => check.evidenceQuotes)).toEqual([['Source'], ['Source']])
    expect(h.adapter.requests).toHaveLength(3)
    expect(String(h.adapter.requests[0]!.sessionId)).toBe(String(h.adapter.requests[1]!.sessionId))
    expect(String(h.adapter.requests[2]!.sessionId)).not.toBe(String(h.adapter.requests[1]!.sessionId))
    const saved = await h.ctx.sessionPersistence.inspect(SessionId(reviewed.reviewChecks[0]!.proof.sessionId))
    const results = saved.events.filter(event => event.type === 'tool/result')
    expect(results.filter(event => event.data.message.content.some(block => block.type === 'tool-result' && block.isError))).toHaveLength(1)
    expect(results.filter(event => event.data.message.content.some(block => block.type === 'tool-result' && !block.isError))).toHaveLength(1)
    checks = [...reviewed.reviewChecks]
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try {
    for (const check of checks) await verifyConversationOriginalReviewCheck(cold.ctx, check, material, sha256(config))
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})

it('keeps the existing option budget and single-item instruction when full choices do not fit', async () => {
  const content = Array.from({ length: 256 }, (_, i) => `${i.toString(36).padStart(3, '0')}|${'x'.repeat(380)}`).join('')
  const material = files(content)
  const evidence = projectClaimEvidence(material, 'file-chunks-v1')
  const values = [...new Set(evidence.items.map(item => item.text))]
  expect(Buffer.byteLength(JSON.stringify(values), 'utf8')).toBeGreaterThan(98_304)
  await review(material, schema => {
    expect(schema.properties?.evidenceQuotes?.items?.enum).toBeUndefined()
    expect(schema.properties?.evidenceQuotes?.description).toContain('one supplied claimEvidence item')
  })
})

it('leaves existing text quote schema unchanged', async () => {
  await review({ task: { prompt: 'Source fact.' }, answer: 'Source fact.' }, schema => {
    expect(schema.properties?.evidenceQuotes?.items?.enum).toBeUndefined()
    expect(schema.properties?.evidenceQuotes?.description).toBe('Copy each quote exactly from the supplied raw source or answer, preserving Markdown and whitespace. Do not add labels or paraphrase. The host checks every quote against the original text. If none supports the judgment, use an empty list and report uncertainty.')
  })
})

it('still rejects a cross-item quotation from a genuine legacy native capture without rerunning it', async () => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-quote-choices-legacy-')); roots.push(root)
  const material = files(), evidence = projectClaimEvidence(material, 'file-chunks-v1')
  const valid = () => auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Controlled exact quote fixture.', evidenceQuotes: ['Source fact.'] })
  const h = await mountPersistentHarness(root, [valid(), valid(), auditedEvidenceResponse({ verdict: 'met', category: null,
    explanation: 'Controlled cross-boundary counterexample.', evidenceQuotes: [crossing] }, 'empty', false)])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-quote-legacy-parent'), meta: { cwd: root }, agentOptions: config })
  const checks: ConversationAuditedReviewCheck[] = []
  try {
    const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Legal new capture', material,
      evidence: ['Source fact.'], signal: new AbortController().signal, callConfig: config })
    checks.push(...reviewed.reviewChecks)
    const recovered = await recoverConversationJudgmentRequest(h.ctx, reviewed.reviewChecks[0]!)
    const captured = await runConversationJudgment(h.ctx, handle.agent, { label: 'Legacy cross-item quote',
      material: { original: material, claimEvidence: evidence }, instruction: recovered.instruction,
      outputSchema: { type: 'object', additionalProperties: true }, signal: new AbortController().signal, callConfig: config })
    const check = { ...(captured.value as object), focus: 'requirements', proof: captured.proof } as ConversationAuditedReviewCheck
    const count = h.adapter.requests.length
    await expect(verifyConversationOriginalReviewCheck(h.ctx, check, material, sha256(config))).rejects.toThrow('source-unavailable')
    expect(h.adapter.requests).toHaveLength(count)
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(root, [])
  try {
    for (const check of checks) await expect(verifyConversationOriginalReviewCheck(cold.ctx, check, material, sha256(config))).resolves.toBeUndefined()
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})
