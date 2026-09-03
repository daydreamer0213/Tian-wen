import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  renderSkillContent,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { Session, SessionEvent } from '@tianwen/dsh-compat'
import * as TianwenRuntime from '../../packages/tianwen-runtime/src/index.js'

const roots: string[] = []
const parent = {
  name: 'research-summary',
  description: 'Summarize one verified research observation.',
  whenToUse: 'When a result needs a concise research summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

function root(): string {
  const parentRoot = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'skill-governance-runtime-ledgers',
  )
  mkdirSync(parentRoot, { recursive: true })
  const value = mkdtempSync(join(parentRoot, 'runtime-'))
  roots.push(value)
  return value
}

function input(index: string) {
  return {
    goalRef: 'goal:research-preview',
    taskRef: `task:governed-${index}`,
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: acceptance,
  }
}

async function mount(script: Parameters<typeof mountCoreHarness>[0]) {
  const harness = await mountCoreHarness(script)
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  const runtime = harness.ctx.isolate('skills')
  await runtime.plugin(TianwenRuntime, { evolutionRoot: root() })
  harness.ctx.tools.register(defineTool({
    name: 'verify_summary',
    description: 'verify a deterministic summary',
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() { return 'accepted' },
  }))
  return { ...harness, runtime }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('Tianwen governed Skill runtime intake', () => {
  it('records an exact main-chat direct research-summary invocation', async () => {
    const packet = TianwenRuntime.parseResearchPacket(`<research_packet>
[F:f1|required] The verified result is concrete.
[U:u1|decision] The deployment region is undecided.
</research_packet>`)
    const harness = await mount([
      toolCallResponse('submit-summary', TianwenRuntime.RESEARCH_SUMMARY_TOOL_NAME, {
        summary: 'The verified result is concrete.',
        confirmedFindingIds: ['f1'],
        uncertaintyIds: [],
      }),
      textResponse('The verified result is concrete.'),
    ])
    const disposeParent = harness.ctx.skills.register(
      TianwenRuntime.RESEARCH_SUMMARY_BASE_SKILL,
    )
    const summaryTool = TianwenRuntime.createResearchSummaryTool(
      packet,
      { kind: 'source-capture' },
    )
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-direct-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      setup(agentCtx) {
        agentCtx.tools.register(summaryTool)
      },
    })
    try {
      const binding = await harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        {
          goalRef: 'goal:research-preview',
          taskRef: 'task:direct-research-summary',
          scopeKey: TianwenRuntime.RESEARCH_SUMMARY_SCOPE,
          acceptanceContract: {
            ...acceptance,
            toolName: TianwenRuntime.RESEARCH_SUMMARY_TOOL_NAME,
          },
        },
        TianwenRuntime.RESEARCH_SUMMARY_SKILL_NAME,
        harness.ctx.skills,
      )
      handle.agent.inject(createUserMessage({
        content: [{
          type: 'text',
          text: renderSkillContent(TianwenRuntime.RESEARCH_SUMMARY_BASE_SKILL),
        }],
        source: {
          kind: 'skill-invocation',
          name: TianwenRuntime.RESEARCH_SUMMARY_SKILL_NAME,
          form: 'instructions',
        },
      }))
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: packet.source }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      harness.runtime.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )
      const directEvent = handle.agent.session.events.find(event =>
        event.type === 'user/message'
        && event.data.source.kind === 'skill-invocation')
      const acceptanceCall = handle.agent.session.events.find(event =>
        event.type === 'tool/call'
        && event.data.name === TianwenRuntime.RESEARCH_SUMMARY_TOOL_NAME)
      if (directEvent?.type !== 'user/message' || acceptanceCall?.type !== 'tool/call') {
        throw new Error('missing direct invocation proof boundary')
      }
      const alteredSessions = [
        (events: SessionEvent[]) => {
          const event = events.find(candidate => candidate.seq === directEvent.seq)!
          ;(event.data as { source: unknown }).source = { kind: 'user' }
        },
        (events: SessionEvent[]) => {
          const event = events.find(candidate => candidate.seq === directEvent.seq)!
          ;((event.data as { source: { name: string } }).source).name = 'other-skill'
        },
        (events: SessionEvent[]) => {
          const event = events.find(candidate => candidate.seq === directEvent.seq)!
          const block = (event.data as { content: SessionEvent<'user/message'>['data']['content'] })
            .content[0]
          if (block?.type === 'text') (block as { text: string }).text += '\naltered'
        },
        (events: SessionEvent[]) => {
          const event = events.find(candidate => candidate.seq === directEvent.seq)!
          ;(event as { seq: number }).seq = acceptanceCall.seq
        },
      ]
      for (const alter of alteredSessions) {
        const events = structuredClone(handle.agent.session.events) as SessionEvent[]
        alter(events)
        const altered = {
          id: handle.agent.session.id,
          header: handle.agent.session.header,
          events,
        } as unknown as Session
        expect(harness.runtime.tianwenLearningIntake.recordSkillUse(
          altered,
          binding.runId,
        )).toEqual({ decision: 'no-use-proof', sessionUnchanged: true })
      }
      const crossSession = {
        id: SessionId(`other-${randomUUID()}`),
        header: handle.agent.session.header,
        events: handle.agent.session.events,
      } as unknown as Session
      expect(harness.runtime.tianwenLearningIntake.recordSkillUse(
        crossSession,
        binding.runId,
      )).toEqual({ decision: 'no-use-proof', sessionUnchanged: true })
      expect(harness.runtime.tianwenEvolution.listRunSkillUses()).toEqual([])

      const receipt = harness.runtime.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      const stored = harness.runtime.tianwenEvolution.getRunSkillUse(binding.runId)
      expect(receipt).toMatchObject({
        decision: 'recorded',
        provenance: { kind: 'direct-invocation' },
        sessionUnchanged: true,
      })
      expect(stored).toMatchObject({
        schemaVersion: 'tianwen.run-skill-use.v2',
        provenance: {
          kind: 'direct-invocation',
          sourceMessageId: expect.any(String),
        },
      })
      expect(JSON.stringify(stored)).not.toContain(packet.source)
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })

  it('binds a real resolved parent and records the final matching DSH Skill use', async () => {
    const harness = await mount([
      toolCallResponse('load-parent-1', 'skill', { name: parent.name }),
      toolCallResponse('load-parent-2', 'skill', { name: parent.name }),
      toolCallResponse('acceptance', 'verify_summary', { text: 'result first' }),
      textResponse('synthetic summary complete'),
    ])
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-runtime-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const binding = await harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('success'),
        parent.name,
        harness.ctx.skills,
      )
      expect(binding).toMatchObject({ sessionUnchanged: true, duplicate: false })
      expect(binding.parentVersionId).toMatch(/^skill-version:[a-f0-9]{64}$/u)
      expect(harness.runtime.tianwenEvolution.getRunBinding(binding.runId)).toBeDefined()
      expect(harness.runtime.tianwenEvolution.listRunSkillManifests()).toHaveLength(1)
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'load and verify the summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      expect(harness.runtime.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )).toMatchObject({ decision: 'no-case', sessionUnchanged: true })
      const receipt = harness.runtime.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      const calls = handle.agent.session.events.filter(event =>
        event.type === 'tool/call' && event.data.name === 'skill')
      expect(receipt).toMatchObject({
        decision: 'recorded',
        skillCallSeq: calls[1]!.seq,
        provenance: {
          kind: 'skill-tool',
          callSeq: calls[1]!.seq,
        },
        sessionUnchanged: true,
      })
      expect(harness.runtime.tianwenEvolution.listRunSkillUses()).toHaveLength(1)
      expect(harness.runtime.tianwenEvolution.getRunSkillUse(binding.runId))
        .toMatchObject({
          schemaVersion: 'tianwen.run-skill-use.v2',
          provenance: { kind: 'skill-tool' },
        })
      expect('dynamicCordisRunner' in harness.runtime).toBe(false)
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })

  it('rejects unresolved, non-model, sidecar, and late binding before writes', async () => {
    const harness = await mount([textResponse('unused')])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-guards-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      await expect(harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('unknown'),
        'unknown-skill',
        harness.ctx.skills,
      )).rejects.toMatchObject({
        code: 'skill-unavailable', message: expect.stringMatching(/unknown DSH Skill/i),
      })
      const disposeNonModel = harness.ctx.skills.register({
        ...parent,
        name: 'non-model-skill',
        invocation: { modelInvocable: false, userInvocable: true },
      })
      await expect(harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('non-model'),
        'non-model-skill',
        harness.ctx.skills,
      )).rejects.toMatchObject({
        code: 'skill-not-model-invocable', message: expect.stringMatching(/not model-invocable/i),
      })
      disposeNonModel()
      const disposeSidecar = harness.ctx.skills.register({
        ...parent,
        name: 'sidecar-skill',
        resourceBase: { kind: 'url', url: 'https://invalid.test' },
      })
      await expect(harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('sidecar'),
        'sidecar-skill',
        harness.ctx.skills,
      )).rejects.toMatchObject({ code: 'run-binding-precondition-failed' })
      disposeSidecar()
      expect(harness.runtime.tianwenEvolution.listRunSkillManifests()).toEqual([])
      handle.agent.session.append('turn/start', { turn: 1 })
      await expect(harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('late'),
        parent.name,
        harness.ctx.skills,
      )).rejects.toMatchObject({
        code: 'run-binding-precondition-failed',
        message: expect.stringMatching(/before the first DSH Turn/i),
      })
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('classifies unknown Evolution binding writes without exposing their causes', async () => {
    const source = new Error('D:/private/sk-run-binding-cause-DO-NOT-LEAK')
    const runHarness = await mount([textResponse('unused')])
    const runParent = runHarness.ctx.skills.register(parent)
    const runHandle = await runHarness.ctx.agents.create({
      sessionId: SessionId(`skill-persistence-run-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      vi.spyOn(runHarness.runtime.tianwenEvolution, 'recordRunBinding').mockImplementation(() => {
        throw source
      })
      await expect(runHarness.runtime.tianwenLearningIntake.bindRunWithSkill(
        runHandle.agent, input('persistence-run'), parent.name, runHarness.ctx.skills,
      )).rejects.toMatchObject({ code: 'run-binding-persistence-failed', cause: source })
    } finally {
      await runHandle.dispose()
      runParent()
      await runHarness.ctx.fiber.dispose()
    }

    const manifestHarness = await mount([textResponse('unused')])
    const manifestParent = manifestHarness.ctx.skills.register(parent)
    const manifestHandle = await manifestHarness.ctx.agents.create({
      sessionId: SessionId(`skill-persistence-manifest-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      vi.spyOn(manifestHarness.runtime.tianwenEvolution, 'recordRunSkillManifest').mockImplementation(() => {
        throw source
      })
      await expect(manifestHarness.runtime.tianwenLearningIntake.bindRunWithSkill(
        manifestHandle.agent, input('persistence-manifest'), parent.name, manifestHarness.ctx.skills,
      )).rejects.toMatchObject({ code: 'run-binding-persistence-failed', cause: source })
    } finally {
      await manifestHandle.dispose()
      manifestParent()
      await manifestHarness.ctx.fiber.dispose()
    }
  })

  it('rechecks the pre-Turn boundary after asynchronous Skill resolution', async () => {
    const harness = await mount([textResponse('unused')])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-race-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    let release!: () => void
    const gate = new Promise<void>(resolveGate => { release = resolveGate })
    vi.spyOn(harness.ctx.skills, 'get').mockImplementation(async () => {
      await gate
      return parent
    })
    const bindingWrite = vi.spyOn(
      harness.runtime.tianwenEvolution,
      'recordRunBinding',
    )
    try {
      const pending = harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('race'),
        parent.name,
        harness.ctx.skills,
      )
      handle.agent.session.append('turn/start', { turn: 1 })
      release()
      await expect(pending).rejects.toThrow(/before the first DSH Turn/i)
      expect(bindingWrite).not.toHaveBeenCalled()
      expect(harness.runtime.tianwenEvolution.listRunSkillManifests()).toEqual([])
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('returns no-use-proof for altered rendered Skill output without changing Outcome', async () => {
    const harness = await mount([
      toolCallResponse('load-parent', 'skill', { name: parent.name }),
      toolCallResponse('acceptance', 'verify_summary', { text: 'result first' }),
      textResponse('synthetic summary complete'),
    ])
    const disposeParent = harness.ctx.skills.register(parent)
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-no-proof-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const binding = await harness.runtime.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('no-proof'),
        parent.name,
        harness.ctx.skills,
      )
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'load and verify the summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      harness.runtime.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )
      const alteredEvents = structuredClone(handle.agent.session.events)
      const result = alteredEvents.find(event =>
        event.type === 'tool/result'
        && String(event.data.message.content[0].toolCallId) === 'load-parent')
      if (result?.type !== 'tool/result') throw new Error('missing Skill result')
      const block = result.data.message.content[0].content[0]
      if (block?.type !== 'text') throw new Error('missing Skill text')
      ;(block as { text: string }).text = `${block.text}\naltered`
      const alteredSession = {
        id: handle.agent.session.id,
        header: handle.agent.session.header,
        events: alteredEvents,
      } as unknown as Session
      expect(harness.runtime.tianwenLearningIntake.recordSkillUse(
        alteredSession,
        binding.runId,
      )).toEqual({ decision: 'no-use-proof', sessionUnchanged: true })
      expect(harness.runtime.tianwenEvolution.listRunSkillUses()).toEqual([])
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })
})
