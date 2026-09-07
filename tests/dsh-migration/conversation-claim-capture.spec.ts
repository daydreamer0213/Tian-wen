import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { assertSupportedJsonSchema, validateJsonSchemaValue, type ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { runConversationClaimReview, projectClaimEvidence, validateClaimAudit } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'

const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const claim = (quote: string) => ({ quote, kind: 'source-fact' as const, status: 'supported' as const,
  sourceIds: ['request-1'], explanation: 'The direct request supports this exact answer text.' })

it('captures the actual fixed-unit v2 schema and corrects one rejected tool call inside the same native one-shot', async () => {
  const base = process.env.TIANWEN_DSH_PROBE_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-native-claim-capture-20260908/task-1-fixtures' : '/tmp/tianwen-claim-capture')
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'native-capture-')); roots.push(root)
  const material = { task: { prompt: '请核对这段格式。', criteria: [] }, answer: '正文。\n\n---\n' }
  const evidence = projectClaimEvidence(material)
  const answers = evidence.items.filter(item => item.role === 'answer')
  expect(answers.map(item => ({ id: item.id, text: item.text }))).toEqual([
    { id: 'answer-1', text: '正文。\n' }, { id: 'answer-2', text: '\n' }, { id: 'answer-3', text: '---\n' },
  ])
  const audit = {
    schemaVersion: 'tianwen.claim-audit.v2' as const,
    evidenceDigest: evidence.evidenceDigest,
    units: Object.fromEntries(answers.map(item => [item.id, item.text.trim() === '' ? null : { firstClaim: claim(item.text), additionalClaims: [] }])),
  }
  const value = { verdict: 'met', category: null, explanation: 'Every answer unit is accounted for.', evidenceQuotes: ['请核对这段格式。'], audit }
  const missing = structuredClone(value); delete missing.audit.units['answer-2']
  const captured: ObjectJsonSchema[] = []
  const checkSchema = (request: GenerateOptions) => {
    const schema = request.tools?.find(tool => tool.name === 'structured_output')?.parameters as ObjectJsonSchema | undefined
    expect(schema).toBeDefined(); assertSupportedJsonSchema(schema); captured.push(schema!)
    expect(schema!.properties?.audit?.properties?.schemaVersion?.enum).toEqual(['tianwen.claim-audit.v2'])
    const auditSchema = schema!.properties!.audit!
    expect(validateJsonSchemaValue(auditSchema, audit)).toEqual([])
    const extra = structuredClone(audit); extra.units['answer-4'] = null
    const nonblankNull = structuredClone(audit); nonblankNull.units['answer-1'] = null
    const noFirst = structuredClone(audit); noFirst.units['answer-1'] = { additionalClaims: [] } as never
    const blankObject = structuredClone(audit); blankObject.units['answer-2'] = { firstClaim: claim('\n'), additionalClaims: [] }
    const wrongSource = structuredClone(audit); wrongSource.units['answer-1']!.firstClaim.sourceIds = ['answer-1']
    for (const invalid of [missing.audit, extra, nonblankNull, noFirst, blankObject, wrongSource]) {
      expect(validateJsonSchemaValue(auditSchema, invalid)).not.toEqual([])
    }
    const nonexact = structuredClone(audit); nonexact.units['answer-1']!.firstClaim.quote = '不存在'
    expect(validateJsonSchemaValue(auditSchema, nonexact)).toEqual([])
    expect(() => validateClaimAudit(nonexact, evidence, 'met')).toThrow('invalid-judgment')
  }
  const respond = (callId: string, response: typeof value) => (request: GenerateOptions) => {
    checkSchema(request)
    return toolCallResponse(callId, 'structured_output', response)
  }
  const harness = await mountPersistentHarness(root, [
    respond('missing-unit', missing), respond('corrected-requirements', value), respond('grounding', value),
  ])
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('capture-parent'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  try {
    const result = await runConversationClaimReview(harness.ctx, handle.agent, { label: 'Native claim capture', material,
      evidence: ['请核对这段格式。'], signal: new AbortController().signal,
      callConfig: { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25, maxTokens: 2048 } })
    expect(result.reviewChecks.map(check => check.audit)).toEqual([audit, audit])
    expect(captured).toHaveLength(3)
    expect(harness.adapter.requests).toHaveLength(3)
    const requestSessions = harness.adapter.requests.map(request => String(request.sessionId))
    expect(requestSessions[0]).toBe(requestSessions[1])
    expect(new Set(requestSessions).size).toBe(2)
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.reviewChecks[0].proof.sessionId))
    expect(saved.events.filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(saved.events.filter(event => event.type === 'tool/call' && event.data.name === 'structured_output')).toHaveLength(2)
    expect(saved.events.filter(event => event.type === 'tool/result' && event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true))).toHaveLength(1)
    expect(saved.events.filter(event => event.type === 'tool/result' && event.data.message.content.some(block => block.type === 'tool-result' && block.isError !== true))).toHaveLength(1)
    expect(handle.agent.session.events.filter(event => event.type === 'turn/start')).toHaveLength(0)
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})
