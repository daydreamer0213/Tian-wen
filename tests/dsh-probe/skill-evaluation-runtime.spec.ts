import { describe, expect, it } from 'vitest'
import {
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  mountCoreHarness,
  renderSkillContent,
  textResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { GenerateOptions, LlmCallConfig } from '@tianwen/dsh-compat'
import {
  compareNormalizedSkillEvaluationRequests,
  normalizeSkillEvaluationRequest,
  observeSkillEvaluationRequest,
} from '../../packages/tianwen-runtime/src/index.js'

const config: LlmCallConfig = {
  provider: 'scripted-adapter',
  model: 'tianwen-probe',
  maxTokens: 256,
}

const request = {
  ...config,
  sessionId: 'session:paired-arm',
  messages: [{
    id: 'message:skill',
    role: 'user',
    content: [{ type: 'text', text: '<skill_content>selected</skill_content>' }],
    source: { kind: 'user' },
  }],
} as unknown as GenerateOptions

const parent = {
  name: 'research-summary',
  description: 'Summarize one research observation',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const

const candidate = {
  ...parent,
  content: '# Research summary\n\nState the observed result with an explicit confidence level.',
} as const

function requestConfig(value: GenerateOptions): LlmCallConfig {
  return {
    provider: value.provider,
    model: value.model,
    ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
    ...(value.temperature === undefined ? {} : { temperature: value.temperature }),
    ...(value.maxTokens === undefined ? {} : { maxTokens: value.maxTokens }),
    ...(value.stop === undefined ? {} : { stop: value.stop }),
  }
}

describe('paired Skill evaluation request observation', () => {
  it('rejects a request not assembled by the public DSH Agent loop', () => {
    expect(observeSkillEvaluationRequest({
      request,
      sessionId: 'session:paired-arm',
      preflight: config,
      paired: config,
      expectedSkillContent: '<skill_content>selected</skill_content>',
      skillName: parent.name,
      requestOrdinal: 1,
      maxModelRequests: 1,
    })).toEqual({ accepted: false, reason: 'not-agent-loop' })
  })

  it('accepts the one exact explicit Skill injection from a real DSH Agent request', async () => {
    const harness = await mountCoreHarness([textResponse('scripted answer')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('paired-evaluation-request'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: '/research-summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const actual = harness.adapter.requests[0]!
      const config = requestConfig(actual)
      const input = {
        request: actual,
        sessionId: String(actual.sessionId),
        preflight: config,
        paired: config,
        expectedSkillContent: renderSkillContent({
          name: parent.name,
          provider: 'runtime',
          content: parent.content,
        }),
        skillName: parent.name,
        requestOrdinal: 1,
        maxModelRequests: 1,
      } as const
      const observation = observeSkillEvaluationRequest(input)
      expect(observation).toEqual(expect.objectContaining({
        accepted: true,
        injectionMessageIndex: expect.any(Number),
        fullRequestDigest: expect.stringMatching(/^sha256:/u),
        normalizedFirstRequestDigest: expect.stringMatching(/^sha256:/u),
        catalogTargetCount: 1,
      }))
      expect(observeSkillEvaluationRequest({ ...input, sessionId: 'session:other' }))
        .toEqual({ accepted: false, reason: 'wrong-session' })
      expect(observeSkillEvaluationRequest({ ...input, requestOrdinal: 2 }))
        .toEqual({ accepted: false, reason: 'wrong-order-or-budget' })
      expect(observeSkillEvaluationRequest({
        ...input,
        preflight: { ...config, maxTokens: 1 },
      })).toEqual({ accepted: false, reason: 'call-config-mismatch' })
      expect(observeSkillEvaluationRequest({
        ...input,
        expectedSkillContent: 'different skill body',
      })).toEqual({ accepted: false, reason: 'skill-injection-mismatch' })
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })

  it('normalizes only the paired Skill, arm identity, and pair-optional catalog entry', async () => {
    const harness = await mountCoreHarness([textResponse('scripted answer')])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId('paired-evaluation-normalization'),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: '/research-summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      const baseline = harness.adapter.requests[0]!
      const baselineSkill = renderSkillContent({
        name: parent.name,
        provider: 'runtime',
        content: parent.content,
      })
      const candidateSkill = renderSkillContent({
        name: candidate.name,
        provider: 'runtime',
        content: candidate.content,
      })
      const candidateRequest = {
        ...baseline,
        sessionId: 'session:paired-candidate',
        messages: baseline.messages.map(message =>
          message.role === 'user'
          && message.content.length === 1
          && message.content[0]?.type === 'text'
          && message.content[0].text === baselineSkill
            ? { ...message, content: [{ type: 'text', text: candidateSkill }] }
            : message),
      } as GenerateOptions
      const baselineNormalization = normalizeSkillEvaluationRequest({
        request: baseline,
        expectedSkillContent: baselineSkill,
        skillName: parent.name,
      })
      const candidateNormalization = normalizeSkillEvaluationRequest({
        request: candidateRequest,
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineNormalization,
        candidateNormalization,
      )).toEqual({ accepted: true, normalizedFirstRequestDigest: expect.any(String) })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineNormalization,
        normalizeSkillEvaluationRequest({
          request: { ...candidateRequest, messages: [...candidateRequest.messages, {
            id: 'message:catalog',
            role: 'system',
            content: [{ type: 'text', text: 'catalog' }],
            source: {
              kind: 'skill-catalog',
              entries: [{ name: candidate.name }, { name: 'ordinary-skill' }],
            },
          }] } as unknown as GenerateOptions,
          expectedSkillContent: candidateSkill,
          skillName: candidate.name,
        }),
      )).toEqual({ accepted: false, reason: 'asymmetric-skill-catalog' })
      const withCatalog = (
        request: GenerateOptions,
        selectedName: string,
        ordinaryName = 'ordinary-skill',
      ) => ({
        ...request,
        messages: [...request.messages.filter(message =>
          (message.source as { readonly kind?: string }).kind !== 'skill-catalog'), {
          id: `message:catalog:${selectedName}`,
          role: 'system',
          content: [{ type: 'text', text: 'catalog' }],
          source: {
            kind: 'skill-catalog',
            entries: [{ name: selectedName }, { name: ordinaryName }],
          },
        }],
      } as unknown as GenerateOptions)
      const baselineWithCatalog = normalizeSkillEvaluationRequest({
        request: withCatalog(baseline, parent.name),
        expectedSkillContent: baselineSkill,
        skillName: parent.name,
      })
      const candidateWithCatalog = normalizeSkillEvaluationRequest({
        request: withCatalog(candidateRequest, candidate.name),
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineWithCatalog,
        candidateWithCatalog,
      )).toEqual({ accepted: true, normalizedFirstRequestDigest: expect.any(String) })
      expect(compareNormalizedSkillEvaluationRequests(
        baselineWithCatalog,
        normalizeSkillEvaluationRequest({
          request: withCatalog(candidateRequest, candidate.name, 'different-ordinary-skill'),
          expectedSkillContent: candidateSkill,
          skillName: candidate.name,
        }),
      )).toEqual({ accepted: false, reason: 'unequal-normalized-first-request' })
      expect(normalizeSkillEvaluationRequest({
        request: {
          ...candidateRequest,
          messages: [...candidateRequest.messages.filter(message =>
            (message.source as { readonly kind?: string }).kind !== 'skill-catalog'), {
            id: 'message:duplicate-catalog',
            role: 'system',
            content: [{ type: 'text', text: 'catalog' }],
            source: {
              kind: 'skill-catalog',
              entries: [{ name: candidate.name }, { name: candidate.name }],
            },
          }],
        } as unknown as GenerateOptions,
        expectedSkillContent: candidateSkill,
        skillName: candidate.name,
      })).toEqual({ accepted: false, reason: 'duplicate-skill-catalog-entry' })
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })
})
