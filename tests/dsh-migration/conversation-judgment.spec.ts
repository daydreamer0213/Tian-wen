import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { assertObjectJsonSchema, validateJsonSchemaValue, type ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionId, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { CONVERSATION_BLIND_REVIEW_SCHEMA, CONVERSATION_FEEDBACK_SCHEMA, CONVERSATION_MATERIAL_MAX_BYTES, CONVERSATION_REVIEW_SCHEMA, conversationEvidenceSchema, runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'

// Resolve the CLI's public provider entry: exercise the installed DSH composition,
// not a test reimplementation of spawning, restrictions or structured output.
const cliRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cliRequire.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const roots: string[] = []
const verdictSchema: ObjectJsonSchema = { type: 'object', properties: { verdict: { type: 'string', enum: ['inconclusive'] } }, required: ['verdict'], additionalProperties: false }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it.each([false, true])('uses a native, read-only, persisted child with exact sampling configuration: %s', configured => {
  return checkNativeJudgment(configured)
})

it('lets native capture reject schema-shaped metadata before accepting an actual result', () => checkNativeJudgment(false, true))

it.each([CONVERSATION_REVIEW_SCHEMA, CONVERSATION_FEEDBACK_SCHEMA, CONVERSATION_BLIND_REVIEW_SCHEMA])('restricts quotes to raw evidence without changing the base schema', base => {
  const original = structuredClone(base)
  const raw = '  **原定日期，未改期、未确认**  '
  const schema = conversationEvidenceSchema(base, [raw, '\n\t', raw])
  expect(() => assertObjectJsonSchema(schema)).not.toThrow()
  expect(base).toEqual(original)
  expect(schema).not.toBe(base)
  expect(schema.properties).not.toBe(base.properties)
  expect(schema.required).toEqual(original.required)
  expect(schema.properties?.evidenceQuotes).toMatchObject({ type: 'array', items: { type: 'string', enum: [raw] } })
  for (const [key, value] of Object.entries(original.properties!)) if (key !== 'evidenceQuotes') expect(schema.properties?.[key]).toEqual(value)
  const quotes = schema.properties!.evidenceQuotes!
  expect(validateJsonSchemaValue(quotes, [raw])).toEqual([])
  expect(validateJsonSchemaValue(quotes, [`用户任务：${raw}`])).not.toEqual([])
  expect(validateJsonSchemaValue(quotes, [raw.replaceAll('**', '')])).not.toEqual([])
  expect(validateJsonSchemaValue(quotes, [raw.trim()])).not.toEqual([])
})

it('covers the whole long line with intact Unicode code points and exact raw fragments', () => {
  const line = `${'甲'.repeat(383)}😀${'乙'.repeat(383)}🚀末尾`
  const evidence = [`\t标题\r\n${line}\n  尾行  `]
  const schema = conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, evidence)
  const fragments = schema.properties!.evidenceQuotes!.items!.enum as string[]
  expect(fragments).toEqual(['\t标题', `${'甲'.repeat(383)}😀`, `${'乙'.repeat(383)}🚀`, '末尾', '  尾行  '])
  expect(fragments.slice(1, 4).join('')).toBe(line)
  for (const fragment of fragments) {
    expect([...fragment].length).toBeLessThanOrEqual(384)
    expect(Buffer.byteLength(fragment, 'utf8')).toBeLessThanOrEqual(2048)
    expect(evidence.some(raw => raw.includes(fragment))).toBe(true)
  }
})

it('allows an empty quote list when no nonblank raw fragment exists', () => {
  const schema = conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, ['', ' \t\r\n'])
  expect(() => assertObjectJsonSchema(schema)).not.toThrow()
  expect(schema.properties?.evidenceQuotes).toMatchObject({ type: 'array', items: { type: 'null' } })
  expect(validateJsonSchemaValue(schema.properties!.evidenceQuotes!, [])).toEqual([])
  expect(validateJsonSchemaValue(schema.properties!.evidenceQuotes!, ['invented evidence'])).not.toEqual([])
})

it('fails closed on excessive raw evidence instead of silently dropping its tail', () => {
  expect(() => conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, ['a'.repeat(CONVERSATION_MATERIAL_MAX_BYTES)]))
    .toThrow('material-too-large')
  const manyLines = Array.from({ length: 14_500 }, (_, index) => String(index)).join('\n')
  expect(Buffer.byteLength(JSON.stringify([manyLines]), 'utf8')).toBeLessThan(CONVERSATION_MATERIAL_MAX_BYTES)
  expect(() => conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, [manyLines])).toThrow('material-too-large')
})

it('lets native capture reject a labeled quote and accept a raw fragment in the same Turn', () =>
  checkNativeJudgment(false, true, '**原定日期，未改期、未确认**'))

it.each(['invalid-judgment', 'model-unavailable', 'cancelled'] as const)('classifies an uncaptured native result as %s without generating proof', async expected => {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'judgment-failure-'))
  roots.push(root)
  const controller = new AbortController()
  const schema = conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, ['**原始证据**'])
  const script: Parameters<typeof mountPersistentHarness>[1] = expected === 'model-unavailable'
    ? [new Error('scripted provider failure')]
    : expected === 'cancelled'
      ? [() => { controller.abort(); return textResponse('Cancelled.') }]
      : [toolCallResponse('invalid-quote', 'structured_output', { verdict: 'inconclusive', category: null,
          explanation: 'No valid quote.', evidenceQuotes: ['用户任务：原始证据'] }), textResponse('No valid structured result.')]
  const harness = await mountPersistentHarness(root, script)
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('failure-parent'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  try {
    const outcome = await runConversationJudgment(harness.ctx, handle.agent, {
      label: 'Tianwen uncaptured result', instruction: 'Return an exact evidence quote.',
      material: { request: '**原始证据**' }, outputSchema: schema, signal: controller.signal,
    }).catch((error: unknown) => error)
    const childId = String(harness.adapter.requests[0]?.sessionId)
    expect(childId).not.toBe('undefined')
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(childId))
    expect(saved.meta).toMatchObject({ origin: 'subagent', parentSession: 'failure-parent' })
    expect(saved.events.filter(event => event.type === 'turn/start')).toHaveLength(1)
    const end = saved.events.findLast(event => event.type === 'turn/end')
    if (expected !== 'cancelled') expect(end?.data.reason.kind).toBe(expected === 'invalid-judgment' ? 'completed' : 'error')
    expect(harness.adapter.requests).toHaveLength(expected === 'invalid-judgment' ? 2 : 1)
    expect(outcome).toBeInstanceOf(Error)
    expect(outcome).toMatchObject({ message: expected })
    expect(outcome).not.toHaveProperty('proof')
    expect(harness.ctx.agents.list()).toHaveLength(1)
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
})

async function checkNativeJudgment(configured: boolean, malformedFirst = false, evidence?: string) {
  const schema = evidence === undefined ? verdictSchema : conversationEvidenceSchema(CONVERSATION_REVIEW_SCHEMA, [evidence])
  const value = evidence === undefined ? { verdict: 'inconclusive' } : { verdict: 'inconclusive', category: null, explanation: 'No additional evidence.', evidenceQuotes: [evidence] }
  const invalid = evidence === undefined ? { type: 'object' } : { ...value, evidenceQuotes: [`用户任务：${evidence}`] }
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'judgment-'))
  roots.push(root)
  const harness = await mountPersistentHarness(root, [
    ...(malformedFirst ? [toolCallResponse('wrong-output', 'structured_output', invalid)] : []),
    request => {
      expect(request.tools?.map(tool => tool.name)).toEqual(['structured_output'])
      expect(request.tools?.[0]?.parameters).toEqual(schema)
      if (configured) expect(request.temperature).toBe(0.25)
      return toolCallResponse('judgment-output', 'structured_output', value)
    },
  ])
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('ordinary-parent'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  try {
    const result = await runConversationJudgment(harness.ctx, handle.agent, {
      label: 'Tianwen test judgment', instruction: 'Return verdict inconclusive.',
      material: { request: '普通自然语言' }, signal: new AbortController().signal,
      outputSchema: schema,
      ...(configured ? { callConfig: { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25, maxTokens: 512 } } : {}),
    })
    expect(result.value).toEqual(value)
    expect(result.proof.sessionId).not.toBe('ordinary-parent')
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.proof.sessionId))
    expect(saved.meta.origin).toBe('subagent')
    expect(saved.meta.parentSession).toBe('ordinary-parent')
    expect(saved.events.some(event => event.type === 'subagent/descriptor')).toBe(true)
    if (malformedFirst) {
      expect(harness.adapter.requests).toHaveLength(2)
      expect(new Set(harness.adapter.requests.map(request => String(request.sessionId))).size).toBe(1)
      expect(saved.events.filter(event => event.type === 'turn/start')).toHaveLength(1)
      expect(saved.events.some(event => event.type === 'tool/result'
        && event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true))).toBe(true)
    }
    expect(harness.ctx.agents.list()).toHaveLength(1)
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
}
