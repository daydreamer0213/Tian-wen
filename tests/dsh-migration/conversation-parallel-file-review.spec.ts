import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { projectClaimEvidence, runConversationClaimReview } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'
import { recoverConversationJudgmentRequest, verifyConversationReviewCheck } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'

const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)

it.each(['met', 'disagree', 'quote-repair', 'invalid-requirements', 'invalid-grounding', 'provider', 'cancelled', 'scope-change'] as const)(
  'overlaps independent large-file reviewers and owns both child cleanups: %s', async mode => {
    const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
    mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'parallel-file-'))
    const code = Array.from({ length: 56 }, (_, i) => `export function item${i}(){return ${i};}${' '.repeat(310)}\n`).join('')
    const files = [{ path: 'output.mjs', content: code }]
    const source = { request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Copy the supplied functions exactly; do not claim execution or external effects.' }] })],
      context: [], objective: 'Copy the functions.', criteria: ['Preserve the exact file.'], qualityContract: conversationQualityContract(),
      files: { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: root, entries: files, outputPaths: ['output.mjs'] } }
    const output = { answer: '', files }
    const material = { source, evaluationMode: 'local-files', conversation: [], toolEvidence: [], fileResult: { ...output, outputDigest: sha256(output) } }
    const evidence = projectClaimEvidence(material, 'file-chunks-v1')
    const controller = new AbortController(), release = Promise.withResolvers<void>()
    const started: Array<{ request: any; focus: 'requirements' | 'grounding' }> = []
    let active = 0, boundaryCalls = 0, requirementsCaptures = 0
    const value = (focus: 'requirements' | 'grounding') => {
      const invalid = mode === `invalid-${focus}`
      const verdict = mode === 'disagree' && focus === 'requirements' ? 'not-met' : 'met'
      return { verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: `${focus}-private-vote`, evidenceQuotes: [evidence.items.find(item => item.role === 'answer')!.text],
        audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: evidence.evidenceDigest,
          units: Object.fromEntries(evidence.items.filter(item => item.role === 'answer').map(item => [item.id, item.text.trim() === '' ? null : {
            firstClaim: { quote: item.text, kind: 'non-factual', status: invalid ? 'supported' : 'permitted', sourceIds: [], explanation: 'Requested code is not a claim of external execution.' }, additionalClaims: [] }])) } }
    }
    const response = (request: any) => {
      const focus = JSON.stringify(request.messages).includes('Independently try to falsify') ? 'grounding' : 'requirements'
      if (mode === 'provider' && focus === 'requirements') throw new Error('provider-control-failure')
      const result = value(focus)
      if (mode === 'quote-repair' && focus === 'requirements' && requirementsCaptures++ === 0) {
        result.audit.units[Object.keys(result.audit.units)[0]!]!.firstClaim.quote = 'outside-this-answer-unit'
      }
      return toolCallResponse(`capture-${focus}-${requirementsCaptures}`, 'structured_output', result)
    }
    const h = await mountPersistentHarness(root, [response, response, ...(mode === 'quote-repair' ? [response] : [])])
    await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
    const parent = await h.ctx.agents.create({ sessionId: SessionId('parallel-file-parent'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
    const stream = h.adapter.stream.bind(h.adapter)
    const hook = vi.spyOn(h.adapter, 'stream').mockImplementation(async function* (request) {
      const focus = JSON.stringify(request.messages).includes('Independently try to falsify') ? 'grounding' : 'requirements'
      started.push({ request, focus }); active++
      let off = () => {}
      const aborted = new Promise<void>(resolve => {
        const abort = () => resolve()
        request.signal?.addEventListener('abort', abort, { once: true }); off = () => request.signal?.removeEventListener('abort', abort)
        if (request.signal?.aborted) abort()
      })
      try {
        const failedSibling = mode === 'invalid-requirements' || mode === 'provider' ? 'grounding' : mode === 'invalid-grounding' ? 'requirements' : null
        if (focus === failedSibling) await aborted
        else await Promise.race([release.promise, aborted])
        if (request.signal?.aborted) return
        yield* stream(request)
      } finally { off(); active-- }
    })
    const callConfig = { provider: 'tianwen-probe', model: 'scripted', temperature: 0.25, maxTokens: 2048 }
    let run: ReturnType<typeof runConversationClaimReview> | undefined
    try {
      run = runConversationClaimReview(h.ctx, parent.agent, { label: 'Parallel file panel', material, evidence: [code], signal: controller.signal, callConfig,
        beforeCall: () => { boundaryCalls++; if (mode === 'scope-change' && boundaryCalls === 2) throw new Error('scope-changed') } })
      const settled = run.then(value => ({ value }), error => ({ error }))
      if (mode === 'scope-change') {
        const result = await settled; expect(result).toMatchObject({ error: { message: 'scope-changed' } }); expect(boundaryCalls).toBe(2)
      } else {
        await vi.waitFor(() => expect(started).toHaveLength(2), { timeout: 1_000 })
        expect(new Set(started.map(item => String(item.request.sessionId))).size).toBe(2)
        expect(started.map(item => item.focus).sort()).toEqual(['grounding', 'requirements'])
        const schemas = started.map(item => item.request.tools.find((tool: any) => tool.name === 'structured_output').parameters)
        expect(schemas[0]).toEqual(schemas[1])
        expect(Object.values((schemas[0] as any).properties.audit.properties.units.properties).filter((unit: any) => unit.properties)
          .every((unit: any) => unit.properties.firstClaim.properties.quote.enum === undefined)).toBe(true)
        if (mode === 'cancelled') controller.abort(); else release.resolve()
        const result = await settled
        if (mode === 'invalid-requirements' || mode === 'invalid-grounding') expect(result).toMatchObject({ error: { message: 'invalid-judgment' } })
        else if (mode === 'provider') expect(result).toMatchObject({ error: { message: 'model-unavailable' } })
        else if (mode === 'cancelled') expect(result).toMatchObject({ error: { message: 'cancelled' } })
        else {
          expect('value' in result).toBe(true); if (!('value' in result)) throw result.error
          expect(result.value.verdict).toBe(mode === 'disagree' ? 'inconclusive' : 'met')
          expect(result.value.reviewChecks.map(check => check.focus)).toEqual(['requirements', 'grounding'])
          for (const check of result.value.reviewChecks) {
            const recovered = await recoverConversationJudgmentRequest(h.ctx, check)
            expect(recovered.material).toEqual({ original: material, claimEvidence: evidence })
            expect(recovered.modelConfigDigests).toEqual([sha256(callConfig)])
            await expect(verifyConversationReviewCheck(h.ctx, check)).resolves.toBeUndefined()
          }
          expect(started.slice(0, 2).every(item => !JSON.stringify(item.request.messages).includes('-private-vote'))).toBe(true)
          expect(started.every(item => !JSON.stringify(item.request.messages).includes(item.focus === 'requirements' ? 'grounding-private-vote' : 'requirements-private-vote'))).toBe(true)
          if (mode === 'quote-repair') {
            expect(started.filter(item => item.focus === 'requirements')).toHaveLength(2)
            expect(started.filter(item => item.focus === 'grounding')).toHaveLength(1)
            expect(JSON.stringify(started.findLast(item => item.focus === 'requirements')!.request.messages)).toContain('Invalid quote in answer-1')
            expect(JSON.stringify(started.find(item => item.focus === 'grounding')!.request.messages)).not.toContain('Invalid quote in answer-1')
          }
        }
      }
      expect(active).toBe(0); expect(h.ctx.agents.list()).toHaveLength(1)
      expect(controller.signal.aborted).toBe(mode === 'cancelled')
      expect(h.adapter.requests.length).toBeLessThanOrEqual(mode === 'quote-repair' ? 3 : 2)
    } finally {
      release.resolve(); controller.abort(); await run?.catch(() => {}); hook.mockRestore(); await parent.dispose(); await h.ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true })
    }
  })
