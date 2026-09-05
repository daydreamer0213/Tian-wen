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
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
  waitForIdle,
} from '@tianwen/dsh-compat'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  RESEARCH_SUMMARY_BASE_SKILL,
  RESEARCH_SUMMARY_SKILL_NAME,
  RESEARCH_SUMMARY_TOOL_NAME,
} from '../../packages/tianwen-runtime/src/research-summary.js'
import { TianwenResearchSummaryAdmissionService } from '../../packages/tianwen-runtime-bundle/src/research-summary-admission.js'
import {
  prepareRunSkillManifest,
  sha256,
  type ControlledSkillScopePointer,
  type GovernedSkillCandidate,
} from '../../packages/tianwen-evolution/src/index.js'

const roots: string[] = []
const packet = `<research_packet>
[F:f1|required] The verified result is concrete.
[U:u1|decision] The deployment region is undecided.
</research_packet>`
const invocation = `/research-summary\n${packet}`

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
    'research-summary-admission',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

async function mount(
  directory: string,
  script: Parameters<typeof mountPersistentHarness>[1],
) {
  const harness = await mountPersistentHarness(join(directory, 'sessions'), script)
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await applyRuntime(harness.ctx, { evolutionRoot: join(directory, 'evolution') })
  await harness.ctx.plugin(TianwenResearchSummaryAdmissionService)
  return harness
}

function direct(text: string) {
  return createUserMessage({
    content: [{ type: 'text' as const, text }],
    source: { kind: 'user' as const },
  })
}

function invokedContent(request: { readonly messages: readonly ReturnType<typeof direct>[] }) {
  const message = request.messages.findLast(item => item.source.kind === 'skill-invocation')
  const block = message?.content[0]
  return block?.type === 'text' ? block.text : undefined
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

function candidateFixture(content = '# Candidate research summary\n\nUse the improved rule.') {
  const base = {
    ...RESEARCH_SUMMARY_BASE_SKILL,
    invocation: RESEARCH_SUMMARY_BASE_SKILL.invocation!,
    provider: RESEARCH_SUMMARY_BASE_SKILL.provider!,
  }
  const baseManifest = prepareRunSkillManifest({
    runId: `run:${'0'.repeat(64)}`,
    skill: base,
  })
  const payload = {
    name: base.name,
    description: 'Improved bounded research summary.',
    whenToUse: base.whenToUse,
    invocation: base.invocation,
    source: base.source,
    content,
  }
  const skill = { ...payload, provider: base.provider }
  const candidateManifest = prepareRunSkillManifest({
    runId: `run:${'0'.repeat(64)}`,
    skill,
  })
  const candidate = {
    candidateId: `candidate:${'1'.repeat(64)}`,
    ticketId: `ticket:${'2'.repeat(64)}`,
    caseId: `case:${'3'.repeat(64)}`,
    attributionId: `attribution:${'4'.repeat(64)}`,
    lessonId: `lesson:${'5'.repeat(64)}`,
    targetScope: 'project:tianwen/capability:research-summary',
    parentVersionId: baseManifest.parentVersionId,
    payloadDigest: sha256(payload),
    payload,
    evidenceIds: [`sha256:${'6'.repeat(64)}`],
    status: 'recorded',
  } as GovernedSkillCandidate
  const promoted = {
    schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2',
    scopeKey: candidate.targetScope,
    activeVersionId: candidateManifest.parentVersionId,
    payloadDigest: candidate.payloadDigest,
    revision: 2,
  } as ControlledSkillScopePointer
  const rolledBack = {
    ...promoted,
    activeVersionId: baseManifest.parentVersionId,
    payloadDigest: sha256(baseManifest.parent),
    revision: 3,
  } as ControlledSkillScopePointer
  return { base, baseManifest, candidate, skill, candidateManifest, promoted, rolledBack }
}

describe('research summary first-step admission', () => {
  it('freezes the first task result when an ordinary follow-up is already queued', async () => {
    const directory = root('queued-followup')
    const harness = await mount(directory, [
      toolCallResponse('first-submit', RESEARCH_SUMMARY_TOOL_NAME, {
        summary: 'Verified result.', confirmedFindingIds: ['f1'], uncertaintyIds: [],
      }), textResponse('Verified result.'), textResponse('You are welcome.'),
    ])
    let queued = false
    const off = harness.ctx.on('agent/turn-stopping', ({ agent, turn }) => {
      if (turn === 1) {
        queued = true
        agent.followup(direct('谢谢'))
      }
    })
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`queued-${randomUUID()}`), meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, handle.agent)
      await harness.ctx.tianwenResearchSummaryAdmission.whenIdle()
      const binding = harness.ctx.tianwenEvolution.getRunBindingBySessionId(String(handle.agent.session.id))!
      expect(queued).toBe(true)
      expect(handle.agent.session.events.filter(event => event.type === 'turn/end')).toHaveLength(2)
      expect(harness.ctx.tianwenEvolution.getOutcomeIntake(binding.runId)?.input.verdict).toBe('not-met')
      expect(harness.ctx.tianwenEvolution.getRunSkillUse(binding.runId)).toBeDefined()
      expect(harness.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(1)
    } finally {
      off()
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('binds and exposes one frozen source tool before the first main-chat model request', async () => {
    const directory = root('fresh-root')
    const harness = await mount(directory, [
      toolCallResponse('submit-source', RESEARCH_SUMMARY_TOOL_NAME, {
        summary: 'The verified result is concrete.',
        confirmedFindingIds: ['f1'],
        uncertaintyIds: [],
      }),
      textResponse('The verified result is concrete.'),
    ])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`research-main-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, handle.agent)
      await harness.ctx.tianwenResearchSummaryAdmission.whenIdle()

      expect(
        harness.adapter.requests,
        JSON.stringify(handle.agent.session.events),
      ).toHaveLength(2)
      expect(harness.adapter.requests[0]!.tools?.map(tool => tool.name))
        .toContain(RESEARCH_SUMMARY_TOOL_NAME)
      const firstMessages = harness.adapter.requests[0]!.messages
      expect(firstMessages).toContainEqual(expect.objectContaining({
        source: {
          kind: 'skill-invocation',
          name: RESEARCH_SUMMARY_SKILL_NAME,
          form: 'instructions',
        },
        content: [{
          type: 'text',
          text: renderSkillContent(RESEARCH_SUMMARY_BASE_SKILL),
        }],
      }))
      const binding = harness.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(handle.agent.session.id))
      expect(binding).toMatchObject({
        schemaVersion: 'tianwen.run-binding.v3',
        goalRef: 'goal:research-summary-source',
        taskRef: 'task:research-summary-source',
      })
      expect(binding === undefined
        ? undefined
        : harness.ctx.tianwenEvolution.getRunSkillManifest(binding.runId))
        .toMatchObject({ parent: { content: RESEARCH_SUMMARY_BASE_SKILL.content } })
      expect(binding === undefined
        ? undefined
        : harness.ctx.tianwenEvolution.getRunSkillUse(binding.runId))
        .toMatchObject({
          schemaVersion: 'tianwen.run-skill-use.v2',
          provenance: { kind: 'direct-invocation' },
        })
      // An accepted tool call is not a successful task: the decision uncertainty
      // is missing. One synthetic failure records a Signal, not a learning Case.
      expect(harness.ctx.tianwenEvolution.listLearningSignals()).toMatchObject([{
        runId: binding!.runId,
      }])
      expect(harness.ctx.tianwenEvolution.listLearningTickets()).toEqual([])
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('groups two missing requirements, excludes success, and separates frozen Skill parents', async () => {
    const directory = root('ordinary-outcomes')
    const summaries = [[], ['u1'], [], []]
    const harness = await mount(directory, summaries.flatMap((uncertaintyIds, index) => [
      toolCallResponse(`ordinary-submit-${index}`, RESEARCH_SUMMARY_TOOL_NAME, {
        summary: uncertaintyIds.length ? 'Verified result; deployment region undecided.' : 'Verified result.',
        confirmedFindingIds: ['f1'], uncertaintyIds,
      }),
      textResponse('Submitted summary.'),
    ]))
    const writes = vi.spyOn(harness.ctx.tianwenEvolution, 'recordOutcomeIntake')
    const fixture = candidateFixture()
    let pointer: ControlledSkillScopePointer | undefined
    vi.spyOn(harness.ctx.tianwenEvolution, 'getControlledSkillScopePointer').mockImplementation(() => pointer)
    vi.spyOn(harness.ctx.tianwenEvolution, 'listSkillCandidates').mockReturnValue([fixture.candidate])
    try {
      for (let index = 0; index < summaries.length; index++) {
        if (index === 3) pointer = fixture.promoted
        const handle = await harness.ctx.agents.create({
          sessionId: SessionId(`outcome-source-${randomUUID()}`), meta: { cwd: directory },
          agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
        })
        try {
          // Different real task subjects may share the same frozen acceptance contract.
          handle.agent.followup(direct(invocation.replace('concrete.', `concrete in task ${index}.`)))
          await waitForIdle(harness.ctx, handle.agent)
          await harness.ctx.tianwenResearchSummaryAdmission.whenIdle()
          const binding = harness.ctx.tianwenEvolution.getRunBindingBySessionId(String(handle.agent.session.id))!
          expect(harness.ctx.tianwenEvolution.getOutcomeIntake(binding.runId)?.input.verdict)
            .toBe(summaries[index]!.length ? 'met' : 'not-met')
          expect(harness.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(index < 2 ? 0 : 1)
        } finally { await handle.dispose() }
      }
      expect(writes.mock.calls.map(([input]) => input.verdict)).toEqual(['not-met', 'met', 'not-met', 'not-met'])
      expect(harness.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(3)
      expect(harness.ctx.tianwenEvolution.listLearningTickets()[0]?.signalIds).toHaveLength(2)
      expect(harness.ctx.tianwenEvolution.listLearningCases()).toEqual([])
    } finally { await harness.ctx.fiber.dispose() }
  })

  it('honors an exact stored historical parent after the packaged base changes', async () => {
    const directory = root('historical-parent')
    const harness = await mount(directory, [textResponse('Historical frozen rule remains in use.')])
    const fixture = candidateFixture('# Historical packaged parent')
    // The pointer is only a selection seam here; the immutable manifest itself is real.
    const historical = prepareRunSkillManifest({ runId: `run:${'9'.repeat(64)}`, skill: fixture.skill })
    vi.spyOn(harness.ctx.tianwenEvolution, 'getControlledSkillScopePointer').mockReturnValue({
      ...fixture.promoted, activeVersionId: historical.parentVersionId, payloadDigest: sha256(historical.parent),
    })
    vi.spyOn(harness.ctx.tianwenEvolution, 'listRunSkillManifests').mockReturnValue([historical])
    const getBinding = harness.ctx.tianwenEvolution.getRunBinding.bind(harness.ctx.tianwenEvolution)
    vi.spyOn(harness.ctx.tianwenEvolution, 'getRunBinding').mockImplementation(runId =>
      runId === historical.runId
        ? { scopeKey: fixture.candidate.targetScope } as ReturnType<typeof getBinding>
        : getBinding(runId))
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`historical-parent-${randomUUID()}`), meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, handle.agent)
      expect(invokedContent(harness.adapter.requests[0]!)).toBe(renderSkillContent(fixture.skill))
      const binding = harness.ctx.tianwenEvolution.getRunBindingBySessionId(String(handle.agent.session.id))!
      expect(harness.ctx.tianwenEvolution.getRunSkillManifest(binding.runId)?.parentVersionId)
        .toBe(historical.parentVersionId)
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('keeps a historical capture-only Outcome unchanged after restart', async () => {
    const directory = root('legacy-outcome')
    const harness = await mount(directory, [
      toolCallResponse('legacy-submit', RESEARCH_SUMMARY_TOOL_NAME, {
        summary: 'Verified result.', confirmedFindingIds: ['f1'], uncertaintyIds: [],
      }),
      textResponse('Verified result.'),
    ])
    const bind = harness.ctx.tianwenLearningIntake.bindInitialStepWithSkill.bind(harness.ctx.tianwenLearningIntake)
    // Reproduce the prior release's persisted contract, not a new evaluated Run.
    vi.spyOn(harness.ctx.tianwenLearningIntake, 'bindInitialStepWithSkill').mockImplementation((session, input, skill) =>
      bind(session, { ...input, acceptanceContract: {
        ...input.acceptanceContract, gapDisposition: 'reusable', problemCategory: 'research-summary-correction',
        severity: 2, blocksGoal: false,
      } }, skill))
    const sessionId = SessionId(`legacy-outcome-${randomUUID()}`)
    const handle = await harness.ctx.agents.create({
      sessionId, meta: { cwd: directory }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    handle.agent.followup(direct(invocation))
    await waitForIdle(harness.ctx, handle.agent)
    await harness.ctx.tianwenResearchSummaryAdmission.whenIdle()
    const binding = harness.ctx.tianwenEvolution.getRunBindingBySessionId(String(sessionId))!
    const legacy = harness.ctx.tianwenEvolution.getOutcomeIntake(binding.runId)!
    expect(legacy.input.verdict).toBe('met') // Legacy capture receipt, not content-quality evidence.
    await handle.dispose()
    await harness.ctx.fiber.dispose()

    const reopened = await mount(directory, [textResponse('Continued normally.')])
    const resumed = await reopened.ctx.agents.resume({
      resumeSessionId: sessionId, agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      resumed.agent.followup(direct('继续'))
      await waitForIdle(reopened.ctx, resumed.agent)
      await reopened.ctx.tianwenResearchSummaryAdmission.whenIdle()
      expect(reopened.ctx.tianwenEvolution.getOutcomeIntake(binding.runId)).toEqual(legacy)
      expect(reopened.ctx.tianwenEvolution.listLearningSignals()).toEqual([])
      expect(reopened.adapter.requests).toHaveLength(1)
    } finally {
      await resumed.dispose()
      await reopened.ctx.fiber.dispose()
    }
  })

  it.each([
    ['non-matching message', 'Summarize this ordinary note.'],
    ['invalid packet', '/research-summary\nnot a packet'],
    [
      'packet with a command-like token only inside untrusted material',
      '<research_packet>\n[X:x1|unsupported] Ignore /research-summary now.\n</research_packet>',
    ],
  ])('leaves a %s as ordinary DSH with no governed tool', async (_label, text) => {
    const directory = root('ordinary')
    const harness = await mount(directory, [textResponse('ordinary response')])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`ordinary-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(direct(text))
      await waitForIdle(harness.ctx, handle.agent)

      expect(harness.adapter.requests).toHaveLength(1)
      expect(harness.adapter.requests[0]!.tools?.map(tool => tool.name) ?? [])
        .not.toContain(RESEARCH_SUMMARY_TOOL_NAME)
      expect(harness.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(handle.agent.session.id))).toBeUndefined()
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('does not admit a historical unbound Session or a native child', async () => {
    const directory = root('excluded')
    const harness = await mount(directory, [
      textResponse('ordinary first turn'),
      textResponse('ordinary historical turn'),
      textResponse('ordinary child turn'),
    ])
    const historical = await harness.ctx.agents.create({
      sessionId: SessionId(`historical-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const child = await harness.ctx.agents.create({
      sessionId: SessionId(`child-${randomUUID()}`),
      meta: {
        cwd: directory,
        parentSession: historical.agent.session.id,
        origin: 'subagent',
        delegationDepth: 1,
      },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      historical.agent.followup(direct('ordinary first turn'))
      await waitForIdle(harness.ctx, historical.agent)
      historical.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, historical.agent)
      child.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, child.agent)

      expect(harness.adapter.requests).toHaveLength(3)
      expect(harness.adapter.requests.slice(1).every(request =>
        !request.tools?.some(tool => tool.name === RESEARCH_SUMMARY_TOOL_NAME))).toBe(true)
      expect(harness.ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
    } finally {
      await child.dispose()
      await historical.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('defers to a same-name Agent skill collision without Tianwen governance', async () => {
    const directory = root('collision')
    const harness = await mount(directory, [textResponse('project skill response')])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`collision-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      async setup(agentCtx) {
        await agentCtx.inject(['skills'], scoped => scoped.skills.register({
          ...RESEARCH_SUMMARY_BASE_SKILL,
          source: 'project',
          provider: 'project-fixture',
          content: '# Project-owned collision',
        }))
      },
    })
    try {
      handle.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, handle.agent)

      expect(harness.adapter.requests).toHaveLength(1)
      expect(harness.adapter.requests[0]!.tools?.map(tool => tool.name) ?? [])
        .not.toContain(RESEARCH_SUMMARY_TOOL_NAME)
      expect(JSON.stringify(harness.adapter.requests[0]!.messages))
        .toContain('# Project-owned collision')
      expect(harness.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(handle.agent.session.id))).toBeUndefined()
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('rejects an active pointer that has no exact persisted Candidate', async () => {
    const directory = root('missing-candidate')
    const harness = await mount(directory, [textResponse('must not run')])
    const { promoted } = candidateFixture()
    vi.spyOn(harness.ctx.tianwenEvolution, 'getControlledSkillScopePointer')
      .mockReturnValue(promoted)
    vi.spyOn(harness.ctx.tianwenEvolution, 'listSkillCandidates')
      .mockReturnValue([])
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`missing-candidate-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      handle.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, handle.agent)

      expect(harness.adapter.requests).toEqual([])
      expect(handle.agent.session.events.findLast(event => event.type === 'turn/end'))
        .toMatchObject({ data: { reason: { kind: 'blocked' } } })
      expect(harness.ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
    } finally {
      await handle.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('keeps each live Session frozen across promotion and rollback', async () => {
    const directory = root('pointer-freeze')
    const harness = await mount(directory, Array.from(
      { length: 5 },
      (_, index) => textResponse(`response ${index + 1}`),
    ))
    const fixture = candidateFixture()
    let pointer: ControlledSkillScopePointer | undefined
    vi.spyOn(harness.ctx.tianwenEvolution, 'getControlledSkillScopePointer')
      .mockImplementation(() => pointer)
    vi.spyOn(harness.ctx.tianwenEvolution, 'listSkillCandidates')
      .mockReturnValue([fixture.candidate])
    const create = (name: string) => harness.ctx.agents.create({
      sessionId: SessionId(`${name}-${randomUUID()}`),
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    const base = await create('base-live')
    let candidate: Awaited<ReturnType<typeof create>> | undefined
    let afterRollback: Awaited<ReturnType<typeof create>> | undefined
    try {
      base.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, base.agent)
      pointer = fixture.promoted
      base.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, base.agent)

      candidate = await create('candidate-live')
      candidate.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, candidate.agent)
      pointer = fixture.rolledBack
      candidate.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, candidate.agent)

      afterRollback = await create('base-new')
      afterRollback.agent.followup(direct(invocation))
      await waitForIdle(harness.ctx, afterRollback.agent)

      expect(harness.adapter.requests).toHaveLength(5)
      const rendered = harness.adapter.requests.map(request => invokedContent(request))
      expect(rendered[0]).toBe(renderSkillContent(fixture.base))
      expect(rendered[1]).toBe(renderSkillContent(fixture.base))
      expect(rendered[2]).toBe(renderSkillContent(fixture.skill))
      expect(rendered[3]).toBe(renderSkillContent(fixture.skill))
      expect(rendered[4]).toBe(renderSkillContent(fixture.base))

      const baseBinding = harness.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(base.agent.session.id))!
      const candidateBinding = harness.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(candidate.agent.session.id))!
      expect(harness.ctx.tianwenEvolution.getRunSkillManifest(baseBinding.runId)?.parentVersionId)
        .toBe(fixture.baseManifest.parentVersionId)
      expect(harness.ctx.tianwenEvolution.getRunSkillManifest(candidateBinding.runId)?.parentVersionId)
        .toBe(fixture.candidateManifest.parentVersionId)
    } finally {
      if (afterRollback !== undefined) await afterRollback.dispose()
      if (candidate !== undefined) await candidate.dispose()
      await base.dispose()
      await harness.ctx.fiber.dispose()
    }
  })

  it('restores the persisted packet and frozen Manifest on a cold resume', async () => {
    const directory = root('cold-resume')
    const sessionId = SessionId(`cold-resume-${randomUUID()}`)
    const first = await mount(directory, [textResponse('first response')])
    const initial = await first.ctx.agents.create({
      sessionId,
      meta: { cwd: directory },
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    initial.agent.followup(direct(invocation))
    await waitForIdle(first.ctx, initial.agent)
    await first.ctx.tianwenResearchSummaryAdmission.whenIdle()
    const original = first.ctx.tianwenEvolution.getRunBindingBySessionId(String(sessionId))!
    await initial.dispose()
    await first.ctx.fiber.dispose()

    const second = await mount(directory, [textResponse('resumed response')])
    const resumed = await second.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      resumed.agent.followup(direct(invocation))
      await waitForIdle(second.ctx, resumed.agent)

      expect(second.adapter.requests).toHaveLength(1)
      expect(second.adapter.requests[0]!.tools?.map(tool => tool.name))
        .toContain(RESEARCH_SUMMARY_TOOL_NAME)
      expect(invokedContent(second.adapter.requests[0]!))
        .toBe(renderSkillContent(RESEARCH_SUMMARY_BASE_SKILL))
      expect(second.ctx.tianwenEvolution
        .getRunBindingBySessionId(String(sessionId))?.runId).toBe(original.runId)
      expect(second.ctx.tianwenEvolution.listRunSkillManifests()).toHaveLength(1)
    } finally {
      await resumed.dispose()
      await second.ctx.fiber.dispose()
    }
  })

  it('fails closed before a request on loader, snapshot, catalog, schema, or persistence drift', async () => {
    const directory = root('drift')
    const cases: readonly {
      readonly name: string
      readonly sabotage: (harness: Awaited<ReturnType<typeof mount>>) => void
    }[] = [
      {
        name: 'loader',
        sabotage(harness) {
          const original = harness.ctx.skills.get.bind(harness.ctx.skills)
          let calls = 0
          vi.spyOn(harness.ctx.skills, 'get').mockImplementation(async (...args) => {
            calls += 1
            if (calls === 2) return {
              ...RESEARCH_SUMMARY_BASE_SKILL,
              invocation: RESEARCH_SUMMARY_BASE_SKILL.invocation!,
              provider: RESEARCH_SUMMARY_BASE_SKILL.provider!,
              content: '# loader drift',
            }
            return original(...args)
          })
        },
      },
      {
        name: 'snapshot',
        sabotage(harness) {
          const original = harness.ctx.skills.snapshot.bind(harness.ctx.skills)
          vi.spyOn(harness.ctx.skills, 'snapshot').mockImplementationOnce(async (...args) => ({
            ...await original(...args),
            complete: false,
          }))
        },
      },
      {
        name: 'catalog',
        sabotage(harness) {
          const original = harness.ctx.skills.snapshot.bind(harness.ctx.skills)
          let calls = 0
          vi.spyOn(harness.ctx.skills, 'snapshot').mockImplementation(async (...args) => {
            calls += 1
            const result = await original(...args)
            return calls === 2
              ? {
                  ...result,
                  skills: result.skills.map(skill => skill.name === RESEARCH_SUMMARY_SKILL_NAME
                    ? { ...skill, description: 'catalog drift' }
                    : skill),
                }
              : result
          })
        },
      },
      {
        name: 'tool schema',
        sabotage(harness) {
          harness.ctx.tools.register(defineTool({
            name: RESEARCH_SUMMARY_TOOL_NAME,
            description: 'schema drift',
            parameters: {},
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            async execute() { return 'wrong tool' },
          }))
        },
      },
      {
        name: 'persistence',
        sabotage(harness) {
          vi.spyOn(harness.ctx.tianwenEvolution, 'recordInitialRunSkillBinding')
            .mockImplementationOnce(() => { throw new Error('forced persistence failure') })
        },
      },
    ]

    for (const testCase of cases) {
      vi.restoreAllMocks()
      const caseRoot = join(directory, testCase.name.replaceAll(' ', '-'))
      const harness = await mount(caseRoot, [textResponse('must not run')])
      testCase.sabotage(harness)
      const handle = await harness.ctx.agents.create({
        sessionId: SessionId(`${testCase.name}-${randomUUID()}`),
        meta: { cwd: caseRoot },
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      try {
        handle.agent.followup(direct(invocation))
        await waitForIdle(harness.ctx, handle.agent)
        expect(harness.adapter.requests, testCase.name).toEqual([])
        expect(harness.ctx.tianwenEvolution
          .getRunBindingBySessionId(String(handle.agent.session.id)), testCase.name)
          .toBeUndefined()
      } finally {
        await handle.dispose()
        await harness.ctx.fiber.dispose()
      }
    }
  })
})
