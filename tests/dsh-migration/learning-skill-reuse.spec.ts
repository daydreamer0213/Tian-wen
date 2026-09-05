import { describe, expect, it, vi } from 'vitest'
import { Context, SkillRegistry } from '@tianwen/dsh-compat'
import { parseLearningAnalysisSubmission, sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { RESEARCH_SUMMARY_SCOPE, RESEARCH_SUMMARY_TOOL_NAME } from '../../packages/tianwen-runtime/src/index.js'
import { hasLearningSkillObservation, inspectLearningSkills, LEARNING_SKILL_INSPECTION_TOOL } from '../../packages/tianwen-runtime-bundle/src/learning-skill-reuse.js'
import { createLearningAnalysisTool } from '../../packages/tianwen-runtime-bundle/src/learning-analysis-tool.js'

const source = {
  name: 'source-audit', description: 'Check findings against uncertainties.',
  content: 'Separate confirmed findings from decision-relevant unknowns. Preserve source identifiers.',
  source: 'bundled', provider: 'test-reviewed-source',
  invocation: { modelInvocable: true, userInvocable: true },
}
const admission = {
  name: source.name, provider: source.provider, digest: sha256(source),
  origin: 'https://example.invalid/test-fixture', revision: 'fixture-v1',
  license: 'MIT' as const, reviewedAt: '2026-09-05T00:00:00.000Z',
  kind: 'self-contained-text' as const, runtime: '0.1.1-rc.2' as const,
  scopeKey: RESEARCH_SUMMARY_SCOPE, toolName: RESEARCH_SUMMARY_TOOL_NAME,
}
const submission = {
  verdict: 'skill-change', hypothesis: 'Explicitly audit decision uncertainties.',
  lesson: { claim: 'Keep uncertainties separate', when: 'research-summary', notWhen: 'other tasks' },
  candidatePatch: { description: 'Summary', whenToUse: 'Research packets', content: source.content },
  supportingEvidenceIds: [sha256('failure')], counterevidenceIds: [],
  reuseSource: { reference: admission, rationale: 'This source addresses the supported omission with no extra permissions.' },
}

describe('bounded existing Skill discovery and reuse', () => {
  it.each(['flush-failed', 'missing-durable-body', 'withdrawn-during-flush'])('refuses an unsafe source submission: %s', async mode => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.register(source)
    const child = { session: { id: 'analyst', header: { parentSession: 'main' }, events: [
      { type: 'tool/call', data: { callId: 'read-source', name: LEARNING_SKILL_INSPECTION_TOOL } },
      { type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'read-source',
        content: [{ type: 'text', text: JSON.stringify({ complete: true, skills: [{ reference: admission, definition: source }] }) }],
      }] } } },
    ] } }
    const status = { source: 'outcome', phase: 'running', analysisId: 'analysis:fixture', sessionId: 'main', parentSessionId: 'main', childSessionId: 'analyst' }
    let supported = true
    const flush = vi.fn(async () => {
      if (mode === 'withdrawn-during-flush') supported = false
      return mode !== 'flush-failed'
    })
    const record = vi.fn(() => { throw new Error('unexpected durable submission') })
    ctx.provide('agents', { get: () => child } as never)
    ctx.provide('sessions', { flush } as never)
    ctx.provide('sessionPersistence', { inspect: async () => ({
      meta: { id: 'analyst', parentSession: 'main' },
      events: mode === 'missing-durable-body' ? [] : child.session.events,
    }) } as never)
    ctx.provide('tianwenEvolution', {
      getLearningAnalysisByChildSessionId: () => status,
      hasLearningAnalysisActiveSupport: () => supported,
      getRunBindingBySessionId: () => ({ scopeKey: RESEARCH_SUMMARY_SCOPE }),
      getLearningAnalysisEvidenceIds: () => submission.supportingEvidenceIds,
      recordLearningAnalysisSubmission: record,
    } as never)
    try {
      const tool = createLearningAnalysisTool(ctx, undefined, [admission])
      await expect(tool.execute(submission as never, { agent: child, signal: AbortSignal.timeout(1000) } as never))
        .rejects.toThrow(/source observation.*persist|consent/u)
      expect(flush).toHaveBeenCalledOnce()
      expect(record).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  })
  it('requires an actual inspection tool result with exact source bytes', () => {
    const result = { type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'inspect-1',
      content: [{ type: 'text', text: JSON.stringify({ complete: true, skills: [{ reference: admission, definition: source }] }) }],
    }] } } }
    expect(hasLearningSkillObservation([result], admission)).toBe(false)
    const call = { type: 'tool/call', data: { callId: 'inspect-1', name: LEARNING_SKILL_INSPECTION_TOOL } }
    expect(hasLearningSkillObservation([call, result], admission)).toBe(true)
    expect(hasLearningSkillObservation([call, result], { ...admission, digest: sha256('drift') })).toBe(false)
    expect(hasLearningSkillObservation([{ ...call, data: { ...call.data, name: 'other-tool' } }, result], admission)).toBe(false)
  })
  it('preserves provenance only for a complete Skill-change submission', () => {
    expect(parseLearningAnalysisSubmission(submission).reuseSource).toEqual(submission.reuseSource)
    expect(() => parseLearningAnalysisSubmission({ ...submission,
      verdict: 'no-case', lesson: undefined, candidatePatch: undefined })).toThrow()
    expect(() => parseLearningAnalysisSubmission({ ...submission,
      reuseSource: { ...submission.reuseSource, reference: { ...admission, digest: 'not-a-digest' } } })).toThrow()
    expect(() => parseLearningAnalysisSubmission({ ...submission,
      reuseSource: { ...submission.reuseSource, execute: true } })).toThrow()
  })

  it('lists and loads an exact host-admitted native source without changing it', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.register(source)
    try {
      const result = await inspectLearningSkills(ctx.skills, [admission], RESEARCH_SUMMARY_SCOPE, source.name)
      expect(result).toMatchObject({ complete: true, skills: [{ reference: admission, definition: source }] })
      expect(await ctx.skills.get(source.name)).toEqual(source)
      expect(await inspectLearningSkills(ctx.skills, [], RESEARCH_SUMMARY_SCOPE)).toEqual({ complete: true, skills: [] })
    } finally { await ctx.fiber.dispose() }
  })

  it('rejects unreviewed bytes, incompatible scope or tool, and unknown licenses', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.register(source)
    try {
      for (const changed of [
        { digest: sha256('other bytes') }, { provider: 'other-provider' },
        { scopeKey: 'project:other' }, { toolName: 'shell' }, { license: 'unknown' },
        { kind: 'script' }, { runtime: 'other' },
      ]) {
        const result = await inspectLearningSkills(ctx.skills, [{ ...admission, ...changed } as never], RESEARCH_SUMMARY_SCOPE)
        expect(result.skills).toEqual([])
      }
    } finally { await ctx.fiber.dispose() }
  })

  it('does not rank an incomplete catalog or admit a model-disabled source', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const disabled = { ...source, invocation: { modelInvocable: false, userInvocable: true } }
    ctx.skills.register(disabled)
    try {
      expect((await inspectLearningSkills(ctx.skills, [{ ...admission, digest: sha256(disabled) }], RESEARCH_SUMMARY_SCOPE)).skills).toEqual([])
      expect(await inspectLearningSkills({
        snapshot: async () => ({ complete: false, skills: [source] }),
        get: async () => source,
      }, [admission], RESEARCH_SUMMARY_SCOPE)).toEqual({ complete: false, skills: [] })
    } finally { await ctx.fiber.dispose() }
  })
})
