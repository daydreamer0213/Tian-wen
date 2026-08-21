import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DynamicCordisRunnerService,
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

afterEach(() => {
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
  it('rejects a child Goal mismatch before creating an Agent request or driving the Goal', async () => {
    const mounted = await mountNaturalGoal([textResponse('must stay unused')])
    const manifestPath = writeManifest(manifest({ goalId: String(mounted.goal.id) }))
    const trial = readNaturalRunTrialManifest(manifestPath)
    try {
      await expect(runGoalResume(mounted.harness.ctx, {
        ...trialConfig(mounted, trial, manifestPath), goalId: 'goal:other',
      })).rejects.toThrow(/manifest Goal/i)
      expect(mounted.harness.adapter.requests).toEqual([])
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
