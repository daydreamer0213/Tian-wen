import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DynamicCordisRunnerService,
  renderSkillContent,
  SessionId,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
  toolGoal,
} from '@tianwen/dsh-compat'

import { apply } from '../../packages/tianwen-runtime/src/index.js'
import {
  readNaturalRunTrialManifest,
} from '../../packages/tianwen-runtime-bundle/src/natural-run-trial.js'
import { runGoalResume } from '../../packages/tianwen-runtime-bundle/src/resume-runner.js'

const roots: string[] = []

function fixtureRoot(): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'natural-run-evidence-trial',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'manifest-'))
  roots.push(root)
  return root
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'tianwen.natural-run-trial.v1',
    goalId: 'goal:natural-evidence',
    taskRef: 'task:verify-summary',
    scopeKey: 'project:tianwen/capability:summary',
    parentSkillName: 'summary-parent',
    acceptanceContract: {
      source: 'dsh-tool-result',
      toolName: 'verify_summary',
      notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
      gapDisposition: 'reusable',
      problemCategory: 'summary-omits-required-result',
      severity: 2,
      blocksGoal: false,
    },
    verifierArguments: {
      subject: { include: ['result', 'evidence'] },
    },
    ...overrides,
  }
}

function writeManifest(value: unknown): string {
  const path = join(fixtureRoot(), 'trial-manifest.json')
  writeFileSync(path, JSON.stringify(value), 'utf8')
  return path
}

const parentSkill = {
  name: 'summary-parent',
  description: 'Summarize one verified result.',
  whenToUse: 'When one verified result needs a summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Summary parent\n\nState the verified result.',
} as const

function pureSkillProjection(skill: NonNullable<Awaited<ReturnType<Context['skills']['get']>>>) {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    invocation: skill.invocation,
    source: skill.source,
    provider: skill.provider,
    content: skill.content,
  }
}

async function mountFilesystemParent(
  mounted: Awaited<ReturnType<typeof mountNaturalGoal>>,
  options: { readonly sidecar?: boolean } = {},
): Promise<void> {
  mounted.disposeParent()
  const skillsRoot = join(mounted.dataRoot, 'skills')
  const parentRoot = join(skillsRoot, parentSkill.name)
  mkdirSync(parentRoot, { recursive: true })
  writeFileSync(join(parentRoot, 'SKILL.md'), [
    '---',
    `name: ${parentSkill.name}`,
    `description: ${parentSkill.description}`,
    '---',
    '',
    parentSkill.content,
  ].join('\n'), 'utf8')
  if (options.sidecar) writeFileSync(join(parentRoot, 'sidecar.md'), 'unsupported', 'utf8')
  const requireFromRoot = createRequire(resolve(process.cwd(), 'package.json'))
  const requireFromDsh = createRequire(requireFromRoot.resolve('@deepseek-ai/dsh/package.json'))
  const localFs = await import(pathToFileURL(requireFromDsh.resolve('@deepseek-ai/dsh-fs-local')).href)
  const filesystemSkills = await import(pathToFileURL(
    requireFromDsh.resolve('@deepseek-ai/dsh-skill-filesystem'),
  ).href)
  await mounted.harness.ctx.plugin(localFs.default)
  expect(mounted.harness.ctx.get('fs')).toBeDefined()
  await mounted.harness.ctx.plugin(filesystemSkills, {
    agentsHome: join(mounted.dataRoot, 'agents-home'),
    customSkillDirs: [skillsRoot],
    dshHome: join(mounted.dataRoot, 'dsh-home'),
    includeDefaultRoots: false,
    watch: false,
  })
}

async function mountNaturalGoal(
  script: Parameters<typeof mountGoalHarness>[1],
) {
  const dataRoot = fixtureRoot()
  const sessionsRoot = join(dataRoot, 'sessions')
  const sessionId = SessionId(`natural-trial-${randomUUID()}`)
  const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
  let goal: ReturnType<typeof first.ctx.goals.create>
  try {
    const handle = await first.ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    try {
      goal = first.ctx.goals.create(handle.agent, {
        objective: 'Verify one useful summary result.', maxGoalRounds: 1,
      })
      await first.ctx.sessions.flush(handle.agent.session)
    } finally {
      await handle.dispose()
    }
  } finally {
    await first.ctx.fiber.dispose()
  }

  const harness = await mountGoalHarness(sessionsRoot, script, { goalRoundDriver: true })
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  await harness.ctx.plugin(toolGoal, {})
  await apply(harness.ctx, { evolutionRoot: join(dataRoot, 'evolution') })
  harness.ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
  })
  harness.ctx.tools.register(defineTool({
    name: 'verify_summary',
    description: 'Verify one summary result.',
    parameters: {
      subject: { type: 'object', additionalProperties: true, required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() { return 'verified' },
  }))
  const disposeParent = harness.ctx.skills.register(parentSkill)
  return { dataRoot, disposeParent, goal: goal!, harness, sessionId }
}

function trialConfig(
  mounted: Awaited<ReturnType<typeof mountNaturalGoal>>,
  trial: ReturnType<typeof readNaturalRunTrialManifest>,
  manifestPath: string,
) {
  return {
    goalId: String(mounted.goal.id),
    json: true,
    nonce: 'natural-trial-test',
    revision: mounted.goal.revision,
    sessionId: String(mounted.sessionId),
    trialManifestDigest: trial.manifestDigest,
    trialManifestPath: manifestPath,
  } as const
}

async function expectPreTurnFailure(
  mounted: Awaited<ReturnType<typeof mountNaturalGoal>>,
  receipt: unknown,
  failureCode: string,
): Promise<void> {
  expect(receipt).toEqual({
    schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
    status: 'pre-turn-failed',
    failureCode,
    goal: { id: String(mounted.goal.id) },
    session: { id: String(mounted.sessionId) },
    usage: { modelRequests: 0, toolCalls: 0, exactCny: 'unavailable' },
  })
  expect(mounted.harness.adapter.requests).toEqual([])
  expect((await mounted.harness.ctx.sessionPersistence.inspect(mounted.sessionId)).events
    .some(event => event.type === 'turn/start')).toBe(false)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('natural DSH Run trial manifest', () => {
  it('freezes one normalized verifier subject and detects source changes', () => {
    const path = writeManifest(manifest())
    const prepared = readNaturalRunTrialManifest(path)

    expect(prepared.manifest).toMatchObject({
      schemaVersion: 'tianwen.natural-run-trial.v1',
      goalId: 'goal:natural-evidence',
      acceptanceContract: { severity: 2, blocksGoal: false },
    })
    expect(prepared.manifestDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(prepared.acceptanceSubjectDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)

    writeFileSync(path, JSON.stringify(manifest({
      verifierArguments: { subject: { include: ['changed'] } },
    })), 'utf8')
    expect(() => readNaturalRunTrialManifest(path, prepared.manifestDigest))
      .toThrow(/digest/i)
  })

  it.each([
    ['unknown key', manifest({ extra: true })],
    ['wrong schema', manifest({ schemaVersion: 'tianwen.natural-run-trial.v0' })],
    ['path-shaped label', manifest({ taskRef: 'D:\\private\\task' })],
    ['URL-shaped label', manifest({ scopeKey: 'https://private.example' })],
    ['leading slash label', manifest({ parentSkillName: '/private-skill' })],
    ['overlong label', manifest({ taskRef: 'x'.repeat(129) })],
    ['oversized canonical manifest', manifest({ verifierArguments: { text: 'x'.repeat(16_384) } })],
  ])('rejects a %s before DSH execution', (_name, value) => {
    expect(() => readNaturalRunTrialManifest(writeManifest(value))).toThrow()
  })

  it('rejects nesting deeper than the fixed manifest boundary', () => {
    let value: unknown = 'leaf'
    for (let depth = 0; depth < 17; depth += 1) value = { value }

    expect(() => readNaturalRunTrialManifest(writeManifest(manifest({
      verifierArguments: value,
    })))).toThrow(/depth/i)
  })
})

describe('natural DSH Run trial runtime', () => {
  it('binds one real filesystem parent before its first Turn and records its matching Skill use', async () => {
    const mounted = await mountNaturalGoal([
      toolCallResponse('load-parent', 'skill', { name: parentSkill.name }),
      toolCallResponse('verify-final', 'verify_summary', {
        subject: { include: ['result', 'evidence'] },
      }),
      toolCallResponse('pause-goal', 'update_goal', {}),
      textResponse('summary verified'),
    ])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      await mountFilesystemParent(mounted)
      const raw = await mounted.harness.ctx.skills.get(parentSkill.name)
      expect(raw).toMatchObject({
        name: parentSkill.name,
        provider: 'filesystem',
        resourceBase: { kind: 'directory' },
      })
      expect(raw).toHaveProperty('path')

      const receipt = await runGoalResume(
        mounted.harness.ctx, trialConfig(mounted, trial, manifestPath),
      )

      expect(receipt).toMatchObject({
        status: 'settled',
        learning: { skillUse: 'recorded' },
      })
      const [frozen] = mounted.harness.ctx.tianwenEvolution.listRunSkillManifests()
      const [skillUse] = mounted.harness.ctx.tianwenEvolution.listRunSkillUses()
      if (frozen === undefined || skillUse === undefined) throw new Error('missing frozen Skill facts')
      expect(skillUse).toMatchObject({
        parentVersionId: frozen.parentVersionId,
        contentDigest: frozen.contentDigest,
      })
      const events = (await mounted.harness.ctx.sessionPersistence.inspect(mounted.sessionId)).events
      const skillResult = events.find(event =>
        event.type === 'tool/result'
        && String(event.data.message.content[0].toolCallId) === 'load-parent')
      if (skillResult?.type !== 'tool/result') throw new Error('missing Skill result')
      const skillText = skillResult.data.message.content[0].content[0]
      if (skillText?.type !== 'text') throw new Error('missing Skill text')
      expect(skillText.text).toBe(renderSkillContent({
        ...frozen.parent,
        provider: frozen.resolvedProvider,
      }))
      const safeFacts = JSON.stringify({
        frozen,
        skillUse,
        publicEvents: mounted.harness.ctx.tianwenEvolution.listEvents(),
        receipt,
      })
      expect(safeFacts).not.toMatch(/"(?:path|resourceBase|metadata)"/u)
      expect(mounted.harness.ctx.tianwenEvolution.listSkillCandidates()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('refuses a real filesystem parent with a sidecar before binding or a Turn', async () => {
    const mounted = await mountNaturalGoal([textResponse('must stay unused')])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      await mountFilesystemParent(mounted, { sidecar: true })
      const bindingWrite = vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')
      await expectPreTurnFailure(
        mounted,
        await runGoalResume(mounted.harness.ctx, trialConfig(mounted, trial, manifestPath)),
        'run-binding-precondition-failed',
      )
      expect(bindingWrite).not.toHaveBeenCalled()
      expect(mounted.harness.ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listRunSkillUses()).toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports a manifest revalidation failure before creating an Agent request or driving the Goal', async () => {
    const mounted = await mountNaturalGoal([textResponse('must stay unused')])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      const receipt = await runGoalResume(mounted.harness.ctx, {
        ...trialConfig(mounted, trial, manifestPath), goalId: 'goal:other',
      })
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
        status: 'pre-turn-failed',
        failureCode: 'manifest-revalidation-failed',
        goal: { id: 'goal:other' },
        session: { id: String(mounted.sessionId) },
        usage: { modelRequests: 0, toolCalls: 0, exactCny: 'unavailable' },
      })
      expect(mounted.harness.adapter.requests).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports unavailable services and rejected Agent resume before the first Turn', async () => {
    const services = await mountNaturalGoal([textResponse('must stay unused')])
    const servicesPath = writeManifest(manifest({ goalId: String(services.goal.id) }))
    const servicesTrial = readNaturalRunTrialManifest(servicesPath)
    try {
      vi.spyOn(services.harness.ctx, 'get').mockReturnValue(undefined)
      await expectPreTurnFailure(
        services,
        await runGoalResume(services.harness.ctx, trialConfig(services, servicesTrial, servicesPath)),
        'services-unavailable',
      )
    } finally {
      services.disposeParent()
      await services.harness.ctx.fiber.dispose()
    }

    const agent = await mountNaturalGoal([textResponse('must stay unused')])
    const agentPath = writeManifest(manifest({ goalId: String(agent.goal.id) }))
    const agentTrial = readNaturalRunTrialManifest(agentPath)
    try {
      vi.spyOn(agent.harness.ctx.agents, 'resume').mockRejectedValue(
        new Error('D:/private/sk-agent-resume-DO-NOT-LEAK'),
      )
      const receipt = await runGoalResume(agent.harness.ctx, trialConfig(agent, agentTrial, agentPath))
      await expectPreTurnFailure(agent, receipt, 'agent-resume-failed')
      expect(JSON.stringify(receipt)).not.toContain('sk-agent-resume-DO-NOT-LEAK')
    } finally {
      agent.disposeParent()
      await agent.harness.ctx.fiber.dispose()
    }
  })

  it('reports Session, Goal, and verifier preflight failures before the first Turn', async () => {
    const sessionGoal = await mountNaturalGoal([textResponse('must stay unused')])
    const sessionGoalPath = writeManifest(manifest({ goalId: String(sessionGoal.goal.id) }))
    const sessionGoalTrial = readNaturalRunTrialManifest(sessionGoalPath)
    try {
      const receipt = await runGoalResume(sessionGoal.harness.ctx, {
        ...trialConfig(sessionGoal, sessionGoalTrial, sessionGoalPath),
        revision: sessionGoal.goal.revision + 1,
      })
      await expectPreTurnFailure(sessionGoal, receipt, 'session-goal-preflight-failed')
    } finally {
      sessionGoal.disposeParent()
      await sessionGoal.harness.ctx.fiber.dispose()
    }

    const verifier = await mountNaturalGoal([textResponse('must stay unused')])
    const verifierPath = writeManifest(manifest({ goalId: String(verifier.goal.id) }))
    const verifierTrial = readNaturalRunTrialManifest(verifierPath)
    try {
      vi.spyOn(verifier.harness.ctx.tools, 'schemas').mockReturnValue([])
      await expectPreTurnFailure(
        verifier,
        await runGoalResume(verifier.harness.ctx, trialConfig(verifier, verifierTrial, verifierPath)),
        'verifier-unavailable',
      )
    } finally {
      verifier.disposeParent()
      await verifier.harness.ctx.fiber.dispose()
    }
  })

  it('preserves source-owned Run-binding codes through the natural runner', async () => {
    type MountedNaturalGoal = Awaited<ReturnType<typeof mountNaturalGoal>>
    const scenarios: readonly {
      readonly code: 'run-binding-precondition-failed' | 'skill-unavailable'
        | 'skill-not-model-invocable' | 'run-binding-persistence-failed'
      readonly setup: (mounted: MountedNaturalGoal) => (() => void) | undefined
    }[] = [
      {
        code: 'run-binding-precondition-failed',
        setup: mounted => {
          mounted.disposeParent()
          return mounted.harness.ctx.skills.register({
            ...parentSkill,
            resourceBase: { kind: 'url', url: 'https://invalid.test' },
          })
        },
      },
      {
        code: 'skill-unavailable',
        setup: mounted => { mounted.disposeParent(); return undefined },
      },
      {
        code: 'skill-not-model-invocable',
        setup: mounted => {
          mounted.disposeParent()
          return mounted.harness.ctx.skills.register({
            ...parentSkill,
            invocation: { modelInvocable: false, userInvocable: true },
          })
        },
      },
      {
        code: 'run-binding-persistence-failed',
        setup: mounted => {
          vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')
            .mockImplementation(() => { throw new Error('source-owned persistence failure') })
          return undefined
        },
      },
    ]
    for (const scenario of scenarios) {
      const mounted = await mountNaturalGoal([textResponse('must stay unused')])
      const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
      const trial = readNaturalRunTrialManifest(manifestPath)
      const dispose = scenario.setup(mounted)
      try {
        await expectPreTurnFailure(
          mounted,
          await runGoalResume(mounted.harness.ctx, trialConfig(mounted, trial, manifestPath)),
          scenario.code,
        )
      } finally {
        dispose?.()
        mounted.disposeParent()
        await mounted.harness.ctx.fiber.dispose()
      }
    }
  })

  it('normalizes an unknown pre-Turn error without exposing its details', async () => {
    const mounted = await mountNaturalGoal([textResponse('must stay unused')])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    const sentinel = 'D:/private/sk-pre-turn-DO-NOT-LEAK'
    try {
      const learning = mounted.harness.ctx.get('tianwenLearningIntake') as {
        bindRunWithSkill: (...args: readonly unknown[]) => Promise<unknown>
      }
      vi.spyOn(learning, 'bindRunWithSkill')
        .mockRejectedValue(new Error(sentinel))
      const receipt = await runGoalResume(
        mounted.harness.ctx, trialConfig(mounted, trial, manifestPath),
      )
      await expectPreTurnFailure(mounted, receipt, 'pre-turn-internal-error')
      expect(JSON.stringify(receipt)).not.toContain(sentinel)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('keeps the Agent-scoped pure snapshot visible through binding until the Goal drive', async () => {
    const mounted = await mountNaturalGoal([
      toolCallResponse('load-parent', 'skill', { name: parentSkill.name }),
      toolCallResponse('verify-final', 'verify_summary', {
        subject: { include: ['result', 'evidence'] },
      }),
      toolCallResponse('pause-goal', 'update_goal', {}),
      textResponse('summary verified'),
    ])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    let capturedAgent: Parameters<typeof mounted.harness.ctx.goals.resume>[0] | undefined
    let boundView: NonNullable<Awaited<ReturnType<Context['skills']['get']>>> | undefined
    let observed: NonNullable<Awaited<ReturnType<Context['skills']['get']>>> | undefined
    let markGoalResumeEntered: (() => void) | undefined
    const goalResumeEntered = new Promise<void>(resolve => { markGoalResumeEntered = resolve })
    try {
      await mountFilesystemParent(mounted)
      const learning = mounted.harness.ctx.get('tianwenLearningIntake') as {
        bindRunWithSkill: typeof mounted.harness.ctx.tianwenLearningIntake.bindRunWithSkill
      }
      const bindRunWithSkill = learning.bindRunWithSkill.bind(learning)
      vi.spyOn(learning, 'bindRunWithSkill')
        .mockImplementation(async (agent, input, skillName, skills) => {
          boundView = await skills.get(skillName, {
            cwd: agent.session.header.cwd,
            scope: agent,
          })
          return bindRunWithSkill(agent, input, skillName, skills)
        })
      const resumeGoal = mounted.harness.ctx.goals.resume.bind(mounted.harness.ctx.goals)
      vi.spyOn(mounted.harness.ctx.goals, 'resume').mockImplementation(((agent, input) => {
        capturedAgent = agent
        resumeGoal(agent, input)
        markGoalResumeEntered!()
      }) as never)
      const running = runGoalResume(
        mounted.harness.ctx, trialConfig(mounted, trial, manifestPath),
      )
      await goalResumeEntered
      expect(capturedAgent).toBeDefined()
      await capturedAgent!.ctx.inject(['skills'], async testCtx => {
        observed = await testCtx.skills.get(parentSkill.name, {
          cwd: capturedAgent!.session.header.cwd,
          scope: capturedAgent!,
        })
      })
      if (boundView === undefined || observed === undefined) throw new Error('snapshot was not visible')
      expect(pureSkillProjection(observed)).toEqual(pureSkillProjection(boundView))
      expect(observed).not.toHaveProperty('path')
      expect(observed).not.toHaveProperty('resourceBase')
      expect(observed).not.toHaveProperty('metadata')
      expect(mounted.harness.adapter.requests).toEqual([])
      const receipt = await running
      expect(receipt).toMatchObject({ status: 'settled' })
      const root = await mounted.harness.ctx.skills.get(parentSkill.name)
      expect(root).toMatchObject({ provider: 'filesystem', resourceBase: { kind: 'directory' } })
      expect(root).toHaveProperty('path')
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('binds before the first Turn, consumes final Evidence, and keeps no Skill use as a legal outcome', async () => {
    const mounted = await mountNaturalGoal([
      toolCallResponse('verify-final', 'verify_summary', {
        subject: { include: ['result', 'evidence'] },
      }),
      toolCallResponse('pause-goal', 'update_goal', {}),
      textResponse('summary verified'),
    ])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      const receipt = await runGoalResume(
        mounted.harness.ctx,
        trialConfig(mounted, trial, manifestPath),
      )

      expect(receipt).toMatchObject({
        schemaVersion: 'tianwen.natural-run-trial-receipt.v1',
        status: 'settled',
        goal: { id: String(mounted.goal.id), phase: 'blocked' },
        learning: { decision: 'no-case', skillUse: 'no-use-proof' },
        run: { acceptanceSubjectDigest: trial.acceptanceSubjectDigest },
        usage: { exactCny: 'unavailable' },
      })
      const events = (await mounted.harness.ctx.sessionPersistence.inspect(
        mounted.sessionId,
      )).events
      expect(events.find(event => event.type === 'turn/start')).toBeDefined()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        (receipt as { run: { runId: `run:${string}` } }).run.runId,
      )).toBeDefined()
      expect(JSON.stringify(receipt)).not.toContain('Verify one useful summary result.')
      expect(JSON.stringify(receipt)).not.toContain(manifestPath)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('keeps the settled Goal when Session persistence cannot confirm the final facts', async () => {
    const mounted = await mountNaturalGoal([
      toolCallResponse('verify-final', 'verify_summary', {
        subject: { include: ['result', 'evidence'] },
      }),
      toolCallResponse('pause-goal', 'update_goal', {}),
      textResponse('summary verified'),
    ])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      const consume = vi.spyOn(mounted.harness.ctx.tianwenLearningIntake, 'consumeOutcome')
      const receipt = await runGoalResume(
        mounted.harness.ctx,
        trialConfig(mounted, trial, manifestPath),
        { flush: async () => false },
      )

      expect(receipt).toMatchObject({
        status: 'settled-with-learning-error',
        goal: { phase: 'blocked' },
        learning: {
          decision: 'not-recorded', reason: 'persistence-unavailable',
          skillUse: 'not-attempted',
        },
      })
      expect(consume).not.toHaveBeenCalled()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('refuses a trailing mismatched verifier call without consuming an earlier matching result', async () => {
    const mounted = await mountNaturalGoal([
      toolCallResponse('verify-earlier', 'verify_summary', {
        subject: { include: ['result', 'evidence'] },
      }),
      toolCallResponse('verify-trailing', 'verify_summary', {
        subject: { include: ['different'] },
      }),
      toolCallResponse('pause-goal', 'update_goal', {}),
      textResponse('summary verified'),
    ])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      const consume = vi.spyOn(mounted.harness.ctx.tianwenLearningIntake, 'consumeOutcome')
      const receipt = await runGoalResume(
        mounted.harness.ctx,
        trialConfig(mounted, trial, manifestPath),
      )

      expect(receipt).toMatchObject({
        status: 'settled-with-learning-error',
        learning: {
          decision: 'not-recorded', reason: 'verifier-call-mismatch',
          skillUse: 'not-attempted',
        },
      })
      expect(consume).not.toHaveBeenCalled()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })
})
