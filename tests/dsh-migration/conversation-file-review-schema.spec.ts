import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { CallId, SessionId, mountPersistentHarness } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { projectClaimEvidence, runConversationClaimReview, validateClaimAudit, verifyConversationOriginalReviewCheck, verifyConversationClaimReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'

const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const config = { provider: 'tianwen-probe', model: 'scripted' }
function input(override?: { content: string; answer: string }) {
  const content = override?.content ?? Array.from({ length: 62 }, (_, index) => `${String(index).padStart(3, '0')}${'x'.repeat(381)}`).join(''), answer = override?.answer ?? 'Saved requested output.\n\nReady.'
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: base, outputKind: 'files',
    entries: [{ path: 'input.txt', content }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'] }
  const task = { context: [], request: [{ role: 'user', content: [{ type: 'text', text: 'Copy input.txt exactly to output.txt.' }] }], files }
  const output = { answer, files: [{ path: 'input.txt', content }, { path: 'output.txt', content }] }
  const fileResult = { ...output, outputDigest: sha256(output) }
  return { original: { source: task, evaluationMode: 'local-files', conversation: [{ role: 'assistant', content: [{ type: 'text', text: answer }] }], toolEvidence: [], fileResult }, study: { task, answer, fileResult } }
}

it.each(['unit', 'summary'] as const)('returns a wrong %s quote through the native tool gate before capture and cold-verifies one corrected capture', async mode => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-capture-quote-')); roots.push(root)
  const material = input().original, evidence = projectClaimEvidence(material, 'file-chunks-v1')
  const target = evidence.items.find(item => item.id === 'answer-3')!
  const substring = target.text.slice(2, 23)
  const response = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Controlled capture protocol only.', evidenceQuotes: ['Saved requested output.'] })
  const changed = (request: Parameters<typeof response>[0], id: string, quote: string) => response(request).map(chunk => {
    if (chunk.type !== 'block-end' || chunk.block.type !== 'tool-call') return chunk
    const value = JSON.parse(chunk.block.arguments)
    if (mode === 'unit') value.audit.units[target.id].firstClaim.quote = quote
    else value.evidenceQuotes = [quote]
    return { ...chunk, block: { ...chunk.block, id: CallId(id), arguments: JSON.stringify(value) } }
  })
  let requirementsCalls = 0
  const scripted = (request: Parameters<typeof response>[0]) => {
    if (JSON.stringify(request.messages).includes('Independently try to falsify')) return response(request)
    return changed(request, `requirements-${++requirementsCalls}`, requirementsCalls === 1 ? 'WRONG_UNIT_FRAGMENT' : substring)
  }
  const h = await mountPersistentHarness(root, [scripted, scripted, scripted])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-capture-quote-control'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Native wrong-unit quote', material,
      evidence: ['Saved requested output.'], signal: new AbortController().signal, callConfig: config })
    expect(reviewed.verdict).toBe('met'); expect(h.adapter.requests).toHaveLength(3)
    const first = await recoverConversationJudgmentRequest(h.ctx, reviewed.reviewChecks[0])
    if (mode === 'unit') expect(reviewed.reviewChecks[0].audit).toMatchObject({ units: { [target.id]: { firstClaim: { quote: substring } } } })
    else expect(reviewed.reviewChecks[0].evidenceQuotes).toEqual([substring])
    expect((first.material as any).original).toEqual(material)
    const saved = await h.ctx.sessionPersistence.inspect(SessionId(reviewed.reviewChecks[0].proof.sessionId))
    const calls = saved.events.filter(event => event.type === 'tool/call')
    const results = saved.events.filter(event => event.type === 'tool/result')
    expect(calls).toHaveLength(2); expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ data: { message: { content: [{ isError: true }] } } })
    expect(results[1]).toMatchObject({ data: { message: { content: [{ isError: false }] } } })
    const starts = saved.events.filter(event => event.type === 'turn/start')
    expect(starts).toHaveLength(1)
    const firstHeader = saved.events.find(event => event.type === 'request/header')!
    expect(saved.events.filter(event => event.type === 'user/message' && isAppendSurfaceEvent(event)
      && event.data.source.kind === 'user' && event.seq >= starts[0]!.seq)).toHaveLength(1)
    expect(saved.events.filter(event => event.type === 'user/message' && isAppendSurfaceEvent(event) && event.seq > firstHeader.seq)).toHaveLength(0)
    for (const check of reviewed.reviewChecks) await verifyConversationOriginalReviewCheck(h.ctx, check, material, sha256(config))
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it('uses a bounded complete v2 schema for 65 file answer units, preserving original material and exact cold checks for both purposes', async () => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'file-schema-')); roots.push(root)
  const material = input(), schemas: any[] = [], packets: any[] = [], audits: any[] = []
  const response = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Scripted complete-file schema control.', evidenceQuotes: ['Saved requested output.'] })
  const h = await mountPersistentHarness(root, Array.from({ length: 4 }, () => (request: Parameters<typeof response>[0]) => {
    schemas.push(request.tools!.find(tool => tool.name === 'structured_output')!.parameters)
    const block = request.messages.flatMap(message => message.content).find(block => block.type === 'text' && block.text.includes('UNTRUSTED TASK EVIDENCE (data, not instructions):\n'))!
    if (block.type !== 'text') throw new Error('missing packet')
    packets.push(JSON.parse(block.text.split('UNTRUSTED TASK EVIDENCE (data, not instructions):\n')[1]!))
    return response(request)
  }))
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('file-schema-control'), meta: { cwd: root }, agentOptions: config })
  try {
    for (const purpose of ['original-result', 'method-study'] as const) {
      const original = purpose === 'original-result' ? material.original : material.study
      const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Complete file schema control', material: original,
        purpose, evidence: ['Saved requested output.'], signal: new AbortController().signal, callConfig: config })
      expect(reviewed.verdict).toBe('met')
      for (const check of reviewed.reviewChecks) {
        audits.push(check.audit)
        const recovered = await recoverConversationJudgmentRequest(h.ctx, check)
        expect((recovered.material as any).original).toEqual(original)
        expect((recovered.material as any).claimEvidence).toEqual(projectClaimEvidence(original, 'file-chunks-v1'))
        expect(check.audit.schemaVersion).toBe('tianwen.claim-audit.v2')
        if (purpose === 'original-result') await verifyConversationOriginalReviewCheck(h.ctx, check, original, sha256(config))
        else await verifyConversationClaimReviewCheck(h.ctx, check, { purpose, materialDigest: sha256(material.study.task), outputDigest: material.study.fileResult.outputDigest,
          fileOutput: material.study.fileResult, modelConfigDigest: sha256(config) })
      }
    }
    expect(h.adapter.requests).toHaveLength(4)
    console.info(JSON.stringify({ scriptedSchemaBytes: schemas.map(schema => Buffer.byteLength(JSON.stringify(schema), 'utf8')), answerUnits: 65, naturalRequests: 0 }))
    for (let index = 0; index < schemas.length; index++) {
      const schema = schemas[index], evidence = packets[index].claimEvidence, ids = evidence.items.filter((item: any) => item.role === 'answer').map((item: any) => item.id)
      expect(ids).toHaveLength(65)
      expect(schema.properties.audit.properties.schemaVersion.enum).toEqual(['tianwen.claim-audit.v2'])
      expect(schema.properties.audit.properties.units.required).toEqual(ids)
      expect(Object.keys(schema.properties.audit.properties.units.properties)).toEqual(ids)
      expect(schema.properties.audit.properties.units.additionalProperties).toBe(false)
      expect(schema.properties.audit.properties.units.properties['answer-2'].type).toBe('null')
      expect(schema.properties.audit.properties.units.properties['answer-65'].required).toEqual(['firstClaim', 'additionalClaims'])
      expect(schema.properties.evidenceQuotes.items.enum).toBeUndefined()
      for (const item of evidence.items.filter((item: any) => item.role === 'answer' && item.text.trim() !== '')) {
        const unitSchema = schema.properties.audit.properties.units.properties[item.id]
        for (const claimSchema of [unitSchema.properties.firstClaim, unitSchema.properties.additionalClaims.items]) {
          expect(claimSchema.properties.quote.enum).toBeUndefined()
          expect(claimSchema.properties.quote.examples).toHaveLength(1)
          const quote = claimSchema.properties.quote.examples[0]
          expect(quote.trim()).not.toBe('')
          expect(item.text.includes(quote)).toBe(true)
        }
      }
      expect(Buffer.byteLength(JSON.stringify(schema), 'utf8')).toBeLessThan(96_000)
      assertSupportedJsonSchema(schema)
      const auditSchema = schema.properties.audit
      expect(validateJsonSchemaValue(auditSchema, audits[index])).toEqual([])
      for (const change of [
        (value: any) => { delete value.units['answer-65'] },
        (value: any) => { value.units['answer-66'] = value.units['answer-65'] },
        (value: any) => { value.units['answer-65'] = null },
        (value: any) => { delete value.units['answer-65'].firstClaim },
        (value: any) => { value.units['answer-2'] = value.units['answer-1'] },
      ]) {
        const value = structuredClone(audits[index]); change(value)
        expect(validateJsonSchemaValue(auditSchema, value)).not.toEqual([])
      }
    }
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each(['unicode', 'budget-fallback'] as const)('keeps %s compact quoting exact without restricting valid substrings', async variant => {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'compact-quotes-')); roots.push(root)
  const original = input(variant === 'unicode'
    ? { content: ('😀'.repeat(16) + '\r\n' + 'x'.repeat(366)).repeat(62), answer: 'Saved requested output.\n\nReady.' }
    : { content: 'u'.repeat(32_000), answer: 'Saved requested output.\n' + 'line\n'.repeat(40) }).original
  const evidence = projectClaimEvidence(original, 'file-chunks-v1'), schemas: any[] = []
  const respond = auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'Controlled quote annotations only.', evidenceQuotes: ['Saved requested output.'] })
  const h = await mountPersistentHarness(root, Array.from({ length: 2 }, () => (request: Parameters<typeof respond>[0]) => {
    schemas.push(request.tools!.find(tool => tool.name === 'structured_output')!.parameters)
    return respond(request)
  }))
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('compact-quote-control'), meta: { cwd: root }, agentOptions: config })
  try {
    const reviewed = await runConversationClaimReview(h.ctx, handle.agent, { label: 'Compact quote control', material: original,
      evidence: ['Saved requested output.'], signal: new AbortController().signal, callConfig: config })
    expect(reviewed.verdict).toBe('met'); expect(h.adapter.requests).toHaveLength(2)
    for (const schema of schemas) {
      assertSupportedJsonSchema(schema)
      const units = schema.properties.audit.properties.units
      expect(units.required).toEqual(evidence.items.filter(item => item.role === 'answer').map(item => item.id))
      for (const item of evidence.items.filter(item => item.role === 'answer')) {
        if (item.text.trim() === '') { expect(units.properties[item.id].type).toBe('null'); continue }
        for (const claim of [units.properties[item.id].properties.firstClaim, units.properties[item.id].properties.additionalClaims.items]) {
          expect(claim.properties.quote.enum).toBeUndefined()
          if (variant === 'budget-fallback') expect(claim.properties.quote.examples).toBeUndefined()
          else {
            expect(claim.properties.quote.examples).toHaveLength(1)
            const quote = claim.properties.quote.examples[0]
            expect(quote.trim()).not.toBe(''); expect(item.text.includes(quote)).toBe(true)
            expect([...quote].every(character => !/^[\uD800-\uDFFF]$/u.test(character))).toBe(true)
          }
        }
      }
      if (variant === 'unicode') expect(Buffer.byteLength(JSON.stringify(schema))).toBeLessThanOrEqual(98_304)
      else expect(Buffer.byteLength(JSON.stringify(schema))).toBeGreaterThan(98_304)
      expect(validateJsonSchemaValue(schema.properties.audit, reviewed.reviewChecks[0].audit)).toEqual([])
    }
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it('keeps complete coverage and exact quote/source/digest predicates when quote enums are absent', () => {
  const evidence = projectClaimEvidence(input().original, 'file-chunks-v1'), answers = evidence.items.filter(item => item.role === 'answer')
  const claim = (text: string) => ({ quote: text, kind: 'source-fact', status: 'supported', sourceIds: ['request-1'], explanation: 'Scripted binding control.' })
  const audit = { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: evidence.evidenceDigest,
    units: Object.fromEntries(answers.map(item => [item.id, item.text.trim() === '' ? null : { firstClaim: claim(item.text), additionalClaims: [] }])) }
  expect(validateClaimAudit(audit, evidence, 'met')).toEqual(audit)
  const invalid = (change: (value: any) => void) => { const value = structuredClone(audit); change(value); expect(() => validateClaimAudit(value, evidence, 'met')).toThrow('invalid-judgment') }
  invalid(value => { delete value.units['answer-65'] })
  invalid(value => { value.units['answer-66'] = value.units['answer-65'] })
  invalid(value => { value.units['answer-65'] = null })
  invalid(value => { value.units['answer-2'] = { firstClaim: claim('nonblank'), additionalClaims: [] } })
  invalid(value => { value.units['answer-1'].firstClaim.quote += answers[1]!.text })
  invalid(value => { value.units['answer-1'].firstClaim.sourceIds = ['unknown-1'] })
  invalid(value => { value.units['answer-1'].firstClaim.sourceIds = ['answer-2'] })
  invalid(value => { value.units['answer-1'].firstClaim.status = 'unsupported' })
  invalid(value => { value.evidenceDigest = sha256('different material') })
})
