import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  Context,
  DynamicCordisRunnerService,
  Inbox,
  Session,
  SessionId,
  SystemPrompt,
  ToolRuntime,
} from '@tianwen/dsh-compat'
import type { Agent } from '@tianwen/dsh-compat'
import { default as TimerService } from '@deepseek-ai/cordis-plugin-timer'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { PythonA1Evaluator } from '../../packages/tianwen-evaluator-python/src/index.js'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const probeRoot = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-test-fixtures',
)
const fixtureRoot = resolve(
  probeRoot,
  'runtime-governance',
)
const V1 = 'return { name: "phase1-v1", apply() {} }'
const BROKEN = 'throw new Error("phase1 broken candidate")'
const RECEIPT_V1 = `sha256:${'1'.repeat(64)}` as const
const RECEIPT_BROKEN = `sha256:${'2'.repeat(64)}` as const

function createStubAgent(ctx: Context, id: string): Agent {
  const session = Session.create(SessionId(id))
  const inbox = new Inbox(session, {
    inserted() {},
    discarded() {},
    claimed() {},
  })
  return {
    id: session.id,
    options: {},
    session,
    inbox,
    status: 'running',
    ctx,
    cancel() {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send(message, target) {
      inbox.append(target, message)
    },
    followup(message) {
      inbox.append('next-turn', message)
    },
    steer(message) {
      inbox.append('next-step', message)
    },
    inject(message) {
      inbox.append('next-step', message)
    },
  }
}

async function mountGovernance(root: string, id: string) {
  const ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(DynamicCordisRunnerService, {})
  await apply(ctx, { evolutionRoot: root })
  return { ctx, agent: createStubAgent(ctx, id) }
}

describe('Tianwen runtime governance migration', () => {
  it('keeps a feedback-derived learning Ticket inert until the governed loop acts', async () => {
    const base = resolve(fixtureRoot, 'feedback-governance')
    mkdirSync(base, { recursive: true })
    const root = mkdtempSync(join(base, 'runtime-governance-'))
    const mounted = await mountGovernance(root, 'feedback-governance-main')

    try {
      mounted.agent.session.append('assistant/message', {
        turn: 1,
        message: {
          id: MessageId('feedback-governance-answer'),
          role: 'assistant',
          content: [{ type: 'text', text: 'An answer that can be corrected.' }],
          source: { kind: 'model', provider: 'probe', model: 'scripted' },
        },
      }, { surfaceOp: 'append' })
      expect(mounted.ctx.tianwenLearningIntake.consume(
        mounted.agent.session,
        'profile:tianwen',
        {
          messageId: 'feedback-governance-answer',
          rating: 'negative',
          note: 'Cite the governing evidence.',
          version: 'feedback-governance-v1',
        },
      )).toMatchObject({ decision: 'ticket-created', duplicate: false })

      expect(mounted.ctx.tianwenEvolution.listLearningSignals()).toHaveLength(1)
      expect(mounted.ctx.tianwenEvolution.listLearningTickets()).toHaveLength(1)
      expect(mounted.ctx.tianwenEvolution.getChampion()).toBeUndefined()
      expect(mounted.ctx.dynamicCordisRunner.inventory()).toEqual([])
    } finally {
      await mounted.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps Python A1 as an independent repo-task evaluator', async () => {
    const stateRoot = resolve(fixtureRoot, 'migration-phase-1-a1')
    const pythonExecutable = process.env.TIANWEN_DSH_PROBE_PYTHON
    const evaluator = new PythonA1Evaluator({
      repoRoot,
      stateRoot,
      ...(pythonExecutable === undefined ? {} : { pythonExecutable }),
      authorityRoot: probeRoot,
    })
    const nop1 = await evaluator.evaluateA1('nop')
    const nop2 = await evaluator.evaluateA1('nop')
    const oracle1 = await evaluator.evaluateA1('oracle')
    const oracle2 = await evaluator.evaluateA1('oracle')

    expect(nop1.verdict).toBe('not_met')
    expect(nop1.raw_stdout).toBe(nop2.raw_stdout)
    expect(nop1.raw_stdout_digest).toBe(nop2.raw_stdout_digest)
    expect(oracle1.verdict).toBe('met')
    const oracleOutput = JSON.parse(oracle1.raw_stdout) as {
      summary: string
      passed_checks: string[]
    }
    expect(oracleOutput.summary).toBe('7/7 checks passed')
    expect(oracleOutput.passed_checks).toHaveLength(7)
    expect(oracle1.raw_stdout).toBe(oracle2.raw_stdout)
    expect(oracle1.raw_stdout_digest).toBe(oracle2.raw_stdout_digest)
  })

  it('keeps Cordis source governance separate from Python A1 evaluation', async () => {
    const base = resolve(fixtureRoot, 'migration-phase-1-governance')
    mkdirSync(base, { recursive: true })
    const root = mkdtempSync(join(base, 'runtime-governance-'))
    let first: Awaited<ReturnType<typeof mountGovernance>> | undefined
    let second: Awaited<ReturnType<typeof mountGovernance>> | undefined

    try {
      first = await mountGovernance(root, 'phase1-governance-first')
      const { ctx, agent } = first
      const evolution = ctx.tianwenEvolution
      const v1 = evolution.recordArtifact(V1)
      evolution.recordEvaluation({
        artifactId: v1.artifactId,
        receiptDigest: RECEIPT_V1,
        verdict: 'met',
      })
      await expect(evolution.promote(agent, v1.artifactId))
        .rejects.toMatchObject({ code: 'human-approval-required' })
      expect(ctx.dynamicCordisRunner.inventory()).toEqual([])

      evolution.recordApproval({
        artifactId: v1.artifactId,
        authority: 'human',
        approvalId: 'phase1-v1-human',
      })
      const firstBinding = await evolution.promote(agent, v1.artifactId)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })

      const broken = evolution.recordArtifact(BROKEN, v1.artifactId)
      evolution.recordEvaluation({
        artifactId: broken.artifactId,
        receiptDigest: RECEIPT_BROKEN,
        verdict: 'met',
      })
      evolution.recordApproval({
        artifactId: broken.artifactId,
        authority: 'human',
        approvalId: 'phase1-broken-human',
      })
      await expect(evolution.promote(agent, broken.artifactId))
        .rejects.toThrow(/previous Champion restored/)
      expect(evolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      expect(ctx.dynamicCordisRunner.inventory()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ currentPackageId: firstBinding.packageId }),
        ]),
      )

      await first.ctx.fiber.dispose()
      first = undefined

      second = await mountGovernance(root, 'phase1-governance-second')
      expect(second.ctx.tianwenEvolution.getChampion()).toEqual({
        artifactId: v1.artifactId,
        revision: 1,
      })
      const rebound = await second.ctx.tianwenEvolution.rehydrateChampion(
        second.agent,
      )
      expect(rebound?.artifactId).toBe(v1.artifactId)
      expect(second.ctx.dynamicCordisRunner.inventory()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ currentPackageId: rebound?.packageId }),
        ]),
      )
      expect(second.ctx.tianwenEvolution.listEvents().at(-1)).toMatchObject({
        type: 'runtime-bound',
        artifactId: v1.artifactId,
        pluginId: rebound?.pluginId,
        packageId: rebound?.packageId,
      })
    } finally {
      if (second !== undefined) await second.ctx.fiber.dispose()
      if (first !== undefined) await first.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
