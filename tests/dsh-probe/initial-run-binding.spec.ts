import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
} from '@tianwen/dsh-compat'
import { afterEach, describe, expect, it } from 'vitest'

import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import {
  RESEARCH_SUMMARY_BASE_SKILL,
  RESEARCH_SUMMARY_SCOPE,
  RESEARCH_SUMMARY_TOOL_NAME,
} from '../../packages/tianwen-runtime/src/research-summary.js'

const roots: string[] = []

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
    'initial-run-binding',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

function session(id: string): Session {
  const sessionId = SessionId(id)
  return Session.create(sessionId, [], {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt: 1,
    cwd: 'D:/workspace/research-summary',
  })
}

const input = {
  goalRef: 'goal:research-summary-source',
  taskRef: 'task:research-summary-source',
  scopeKey: RESEARCH_SUMMARY_SCOPE,
  acceptanceContract: {
    source: 'dsh-tool-result',
    toolName: RESEARCH_SUMMARY_TOOL_NAME,
    notMetErrorCode: 'RESEARCH_SUMMARY_NOT_MET',
    gapDisposition: 'reusable',
    problemCategory: 'research-summary-correction',
    severity: 2,
    blocksGoal: false,
  },
  acceptanceSubjectDigest: `sha256:${'a'.repeat(64)}`,
} as const

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('initial Run and Skill binding', () => {
  it('atomically binds the first opened Turn without changing Session events', async () => {
    const directory = root('atomic')
    const ctx = new Context()
    await applyRuntime(ctx, { evolutionRoot: directory })
    const source = session('initial-binding')
    source.append('turn/start', { turn: 1 })
    const before = structuredClone(source.events)

    try {
      const receipt = ctx.tianwenLearningIntake.bindInitialStepWithSkill(
        source,
        input,
        RESEARCH_SUMMARY_BASE_SKILL,
      )
      expect(receipt).toMatchObject({
        duplicate: false,
        sessionUnchanged: true,
        runId: expect.stringMatching(/^run:/u),
        parentVersionId: expect.stringMatching(/^skill-version:/u),
      })
      expect(source.events).toEqual(before)
      expect(ctx.tianwenEvolution.getRunBinding(receipt.runId)).toBeDefined()
      expect(ctx.tianwenEvolution.getRunSkillManifest(receipt.runId))
        .toMatchObject({ parentVersionId: receipt.parentVersionId })
      expect(ctx.tianwenLearningIntake.bindInitialStepWithSkill(
        source,
        input,
        RESEARCH_SUMMARY_BASE_SKILL,
      )).toMatchObject({ duplicate: true, sessionUnchanged: true })

      const restarted = new EvolutionLedger(directory)
      expect(restarted.getRunBinding(receipt.runId))
        .toEqual(ctx.tianwenEvolution.getRunBinding(receipt.runId))
      expect(restarted.getRunSkillManifest(receipt.runId))
        .toEqual(ctx.tianwenEvolution.getRunSkillManifest(receipt.runId))
      expect(restarted.listEvents().filter(event =>
        event.type === 'initial-run-skill-binding-recorded')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects before Turn one and after the first step without partial writes', async () => {
    const directory = root('boundary')
    const ctx = new Context()
    await applyRuntime(ctx, { evolutionRoot: directory })
    const beforeTurn = session('before-turn')
    const afterStep = session('after-step')
    afterStep.append('turn/start', { turn: 1 })
    afterStep.append('step/start', { turn: 1, step: 1 })

    try {
      expect(() => ctx.tianwenLearningIntake.bindInitialStepWithSkill(
        beforeTurn,
        input,
        RESEARCH_SUMMARY_BASE_SKILL,
      )).toThrow(/first opened DSH Turn/u)
      expect(() => ctx.tianwenLearningIntake.bindInitialStepWithSkill(
        afterStep,
        input,
        RESEARCH_SUMMARY_BASE_SKILL,
      )).toThrow(/before the first DSH step/u)
      expect(ctx.tianwenEvolution.getRunBindingBySessionId(String(beforeTurn.id)))
        .toBeUndefined()
      expect(ctx.tianwenEvolution.getRunBindingBySessionId(String(afterStep.id)))
        .toBeUndefined()
      expect(ctx.tianwenEvolution.listRunSkillManifests()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
