import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { SessionId, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { runConversationJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'

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

async function checkNativeJudgment(configured: boolean, malformedFirst = false) {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'judgment-'))
  roots.push(root)
  const harness = await mountPersistentHarness(root, [
    ...(malformedFirst ? [toolCallResponse('wrong-output', 'structured_output', { type: 'object' })] : []),
    request => {
    expect(request.tools?.map(tool => tool.name)).toEqual(['structured_output'])
    expect(request.tools?.[0]?.parameters).toEqual(verdictSchema)
    if (configured) expect(request.temperature).toBe(0.25)
    return toolCallResponse('judgment-output', 'structured_output', { verdict: 'inconclusive' })
  }])
  await harness.ctx.plugin(SubagentRuntime)
  await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('ordinary-parent'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  try {
    const result = await runConversationJudgment(harness.ctx, handle.agent, {
      label: 'Tianwen test judgment', instruction: 'Return verdict inconclusive.',
      material: { request: '普通自然语言' }, signal: new AbortController().signal,
      outputSchema: verdictSchema,
      ...(configured ? { callConfig: { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25, maxTokens: 512 } } : {}),
    })
    expect(result.value).toEqual({ verdict: 'inconclusive' })
    expect(result.proof.sessionId).not.toBe('ordinary-parent')
    const saved = await harness.ctx.sessionPersistence.inspect(SessionId(result.proof.sessionId))
    expect(saved.meta.origin).toBe('subagent')
    expect(saved.meta.parentSession).toBe('ordinary-parent')
    expect(saved.events.some(event => event.type === 'subagent/descriptor')).toBe(true)
    if (malformedFirst) {
      expect(harness.adapter.requests).toHaveLength(2)
      expect(saved.events.some(event => event.type === 'tool/result'
        && event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true))).toBe(true)
    }
    expect(harness.ctx.agents.list()).toHaveLength(1)
  } finally { await handle.dispose(); await harness.ctx.fiber.dispose() }
}
