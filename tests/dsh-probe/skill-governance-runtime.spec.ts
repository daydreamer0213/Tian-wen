import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DynamicCordisRunnerService,
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  mountCoreHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import type { Session } from '@tianwen/dsh-compat'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

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
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  await apply(harness.ctx, { evolutionRoot: root() })
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
  return harness
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('Tianwen governed Skill runtime intake', () => {
  it('binds a real resolved parent and records the final matching DSH Skill use', async () => {
    const harness = await mount([
      toolCallResponse('load-parent-1', 'skill', { name: parent.name }),
      toolCallResponse('load-parent-2', 'skill', { name: parent.name }),
      toolCallResponse('acceptance', 'verify_summary', { text: 'result first' }),
      textResponse('synthetic summary complete'),
    ])
    const disposeParent = harness.ctx.skills.register(parent)
    const define = vi.spyOn(harness.ctx.dynamicCordisRunner, 'define')
    const run = vi.spyOn(harness.ctx.dynamicCordisRunner, 'run')
    const stop = vi.spyOn(harness.ctx.dynamicCordisRunner, 'stop')
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`skill-runtime-${randomUUID()}`),
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      const binding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('success'),
        parent.name,
      )
      expect(binding).toMatchObject({ sessionUnchanged: true, duplicate: false })
      expect(binding.parentVersionId).toMatch(/^skill-version:[a-f0-9]{64}$/u)
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'load and verify the summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      expect(harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )).toMatchObject({ decision: 'no-case', sessionUnchanged: true })
      const receipt = harness.ctx.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      const calls = handle.agent.session.events.filter(event =>
        event.type === 'tool/call' && event.data.name === 'skill')
      expect(receipt).toMatchObject({
        decision: 'recorded',
        skillCallSeq: calls[1]!.seq,
        sessionUnchanged: true,
      })
      expect(harness.ctx.tianwenEvolution.listRunSkillUses()).toHaveLength(1)
      expect(define).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
      expect(stop).not.toHaveBeenCalled()
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
      await expect(harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('unknown'),
        'unknown-skill',
      )).rejects.toMatchObject({
        code: 'skill-unavailable', message: expect.stringMatching(/unknown DSH Skill/i),
      })
      const disposeNonModel = harness.ctx.skills.register({
        ...parent,
        name: 'non-model-skill',
        invocation: { modelInvocable: false, userInvocable: true },
      })
      await expect(harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('non-model'),
        'non-model-skill',
      )).rejects.toMatchObject({
        code: 'skill-not-model-invocable', message: expect.stringMatching(/not model-invocable/i),
      })
      disposeNonModel()
      const disposeSidecar = harness.ctx.skills.register({
        ...parent,
        name: 'sidecar-skill',
        resourceBase: { kind: 'url', url: 'https://invalid.test' },
      })
      await expect(harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('sidecar'),
        'sidecar-skill',
      )).rejects.toMatchObject({ code: 'run-binding-precondition-failed' })
      disposeSidecar()
      expect(harness.ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
      handle.agent.session.append('turn/start', { turn: 1 })
      await expect(harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('late'),
        parent.name,
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
      vi.spyOn(runHarness.ctx.tianwenEvolution, 'recordRunBinding').mockImplementation(() => {
        throw source
      })
      await expect(runHarness.ctx.tianwenLearningIntake.bindRunWithSkill(
        runHandle.agent, input('persistence-run'), parent.name,
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
      vi.spyOn(manifestHarness.ctx.tianwenEvolution, 'recordRunSkillManifest').mockImplementation(() => {
        throw source
      })
      await expect(manifestHarness.ctx.tianwenLearningIntake.bindRunWithSkill(
        manifestHandle.agent, input('persistence-manifest'), parent.name,
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
      harness.ctx.tianwenEvolution,
      'recordRunBinding',
    )
    try {
      const pending = harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('race'),
        parent.name,
      )
      handle.agent.session.append('turn/start', { turn: 1 })
      release()
      await expect(pending).rejects.toThrow(/before the first DSH Turn/i)
      expect(bindingWrite).not.toHaveBeenCalled()
      expect(harness.ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
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
      const binding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        input('no-proof'),
        parent.name,
      )
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'load and verify the summary' }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      harness.ctx.tianwenLearningIntake.consumeOutcome(
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
      expect(harness.ctx.tianwenLearningIntake.recordSkillUse(
        alteredSession,
        binding.runId,
      )).toEqual({ decision: 'no-use-proof', sessionUnchanged: true })
      expect(harness.ctx.tianwenEvolution.listRunSkillUses()).toEqual([])
    } finally {
      await handle.dispose()
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })
})
