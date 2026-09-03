import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DynamicCordisRunnerService,
  SessionId,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountGoalHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'

import { apply } from '../packages/tianwen-runtime/src/index.js'
import { readNaturalRunTrialManifest } from '../packages/tianwen-runtime-bundle/src/natural-run-trial.js'
import { runGoalResume } from '../packages/tianwen-runtime-bundle/src/resume-runner.js'

const parentSkill = {
  name: 'summary-parent',
  description: 'Summarize one verified result.',
  whenToUse: 'When one verified result needs a summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Summary parent\n\nState the verified result.',
} as const

const verifierArguments = { subject: { include: ['result', 'evidence'] } } as const

export interface NaturalRunEvidenceDemoResult {
  readonly schemaVersion: 'tianwen.natural-run-evidence-demo.v1'
  readonly trial: {
    readonly status: 'settled'
    readonly goal: { readonly phase: 'complete' }
    readonly run: {
      readonly id: `run:${string}`
      readonly bindingVersion: 'v3'
      readonly parentManifestRecorded: true
      readonly skillUse: 'recorded'
    }
    readonly outcome: { readonly verdict: 'met', readonly learning: 'no-case' }
    readonly sessionUnchangedByGovernance: true
  }
  readonly execution: { readonly modelRequests: 3, readonly toolCalls: 2 }
  readonly governance: {
    readonly candidates: 0
    readonly cases: 0
    readonly evaluations: 0
    readonly shadows: 0
    readonly activePointers: 0
    readonly promotions: 0
  }
  readonly cost: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly exactCny: 'unavailable'
    readonly docker: 0
    readonly persistentExternalDatabase: 0
    readonly userData: 0
  }
}

function fixtureBaseRoot(): string {
  const defaultRoot = process.platform === 'win32'
    ? 'D:\\DevData\\tianwen-stage7-test-fixtures'
    : join(tmpdir(), 'tianwen-stage7-test-fixtures')
  return resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? defaultRoot,
    'natural-run-evidence-demo',
  )
}

function readLedgerEvents(path: string): readonly Record<string, unknown>[] {
  try {
    return readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>)
  } catch {
    return []
  }
}

export async function runNaturalRunEvidenceDemo(): Promise<NaturalRunEvidenceDemoResult> {
  const baseRoot = fixtureBaseRoot()
  mkdirSync(baseRoot, { recursive: true })
  const root = mkdtempSync(join(baseRoot, 'trial-'))
  const sessionsRoot = join(root, 'sessions')
  const evolutionRoot = join(root, 'evolution')
  const sessionId = SessionId(`natural-evidence-${randomUUID()}`)
  const first = await mountGoalHarness(sessionsRoot, [], { goalRoundDriver: false })
  let harness: Awaited<ReturnType<typeof mountGoalHarness>> | undefined
  let disposeParent: (() => void) | undefined
  try {
    const initial = await first.ctx.agents.create({
      sessionId,
      agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
    })
    let goal: ReturnType<typeof first.ctx.goals.create>
    try {
      goal = first.ctx.goals.create(initial.agent, {
        objective: 'Verify one useful summary result.',
        maxGoalRounds: 1,
      })
      await first.ctx.sessions.flush(initial.agent.session)
    } finally {
      await initial.dispose()
    }
    await first.ctx.fiber.dispose()

    let boundBeforeFirstRequest = false
    const script = [
      () => {
        const active = harness
        const manifest = active?.ctx.tianwenEvolution.listRunSkillManifests()[0]
        boundBeforeFirstRequest = manifest !== undefined
          && active.ctx.tianwenEvolution.getRunBinding(manifest.runId)?.schemaVersion === 'tianwen.run-binding.v3'
          && active.ctx.tianwenEvolution.getRunSkillUse(manifest.runId) === undefined
        return toolCallResponse('load-parent', 'skill', { name: parentSkill.name })
      },
      toolCallResponse('verify-summary', 'verify_summary', verifierArguments),
      textResponse('The verified summary result is complete.'),
    ]
    harness = await mountGoalHarness(sessionsRoot, script, { goalRoundDriver: true })
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot })
    harness.ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'tianwen-probe', model: 'scripted' }),
    })
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'Verify one summary result.',
      parameters: { subject: { type: 'object', additionalProperties: true, required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(_args, execution) {
        const activeGoal = harness?.ctx.goals.get(execution.agent)
        if (activeGoal === undefined) throw new Error('natural demo Goal is unavailable')
        harness.ctx.goals.complete(execution.agent, activeGoal)
        return 'verified'
      },
    }))
    disposeParent = harness.ctx.skills.register(parentSkill)

    const manifestPath = join(root, 'trial-manifest.json')
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 'tianwen.natural-run-trial.v1',
      goalId: String(goal.id),
      taskRef: 'task:verify-summary',
      scopeKey: 'project:tianwen/capability:summary',
      parentSkillName: parentSkill.name,
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_summary',
        notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
        gapDisposition: 'reusable',
        problemCategory: 'summary-omits-required-result',
        severity: 2,
        blocksGoal: false,
      },
      verifierArguments,
    }), 'utf8')
    const trial = readNaturalRunTrialManifest(manifestPath)
    const receipt = await runGoalResume(harness.ctx, {
      goalId: String(goal.id),
      json: true,
      nonce: 'natural-evidence-demo',
      revision: goal.revision,
      sessionId: String(sessionId),
      trialManifestDigest: trial.manifestDigest,
      trialManifestPath: manifestPath,
    })
    const binding = harness.ctx.tianwenEvolution.getRunBinding(receipt.run.runId)
    const runManifest = harness.ctx.tianwenEvolution.getRunSkillManifest(receipt.run.runId)
    const skillUse = harness.ctx.tianwenEvolution.getRunSkillUse(receipt.run.runId)
    const ledgerEvents = readLedgerEvents(join(evolutionRoot, 'ledger.jsonl'))
    const outcome = ledgerEvents.find(event => event.type === 'outcome-intake-recorded')
    const outcomeInput = outcome?.input as { readonly verdict?: unknown } | undefined
    const noLaterGovernance = ledgerEvents.every(event => ![
      'learning-case-opened',
      'learning-candidate-recorded',
      'skill-evaluation-opened',
      'skill-evaluation-result-recorded',
      'evaluation-recorded',
    ].includes(String(event.type)))

    if (
      receipt.status !== 'settled'
      || receipt.goal.phase !== 'complete'
      || receipt.learning.decision !== 'no-case'
      || receipt.learning.skillUse !== 'recorded'
      || receipt.session.unchangedByGovernance !== true
      || receipt.usage.modelRequests !== 3
      || receipt.usage.toolCalls !== 2
      || harness.adapter.requests.length !== 3
      || !boundBeforeFirstRequest
      || binding?.schemaVersion !== 'tianwen.run-binding.v3'
      || runManifest === undefined
      || skillUse === undefined
      || outcomeInput?.verdict !== 'met'
      || !noLaterGovernance
      || harness.ctx.tianwenEvolution.listLearningCases().length !== 0
      || harness.ctx.tianwenEvolution.listSkillCandidates().length !== 0
      || harness.ctx.tianwenEvolution.listSkillEvaluations().length !== 0
      || harness.ctx.tianwenEvolution.getChampion() !== undefined
    ) throw new Error('natural Run evidence demo did not prove its fixed mechanism')

    return {
      schemaVersion: 'tianwen.natural-run-evidence-demo.v1',
      trial: {
        status: 'settled',
        goal: { phase: 'complete' },
        run: {
          id: receipt.run.runId,
          bindingVersion: 'v3',
          parentManifestRecorded: true,
          skillUse: 'recorded',
        },
        outcome: { verdict: 'met', learning: 'no-case' },
        sessionUnchangedByGovernance: true,
      },
      execution: { modelRequests: 3, toolCalls: 2 },
      governance: {
        candidates: 0,
        cases: 0,
        evaluations: 0,
        shadows: 0,
        activePointers: 0,
        promotions: 0,
      },
      cost: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        exactCny: 'unavailable',
        docker: 0,
        persistentExternalDatabase: 0,
        userData: 0,
      },
    }
  } finally {
    disposeParent?.()
    if (harness !== undefined) await harness.ctx.fiber.dispose()
    try { await first.ctx.fiber.dispose() } catch {}
    rmSync(root, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runNaturalRunEvidenceDemo())}\n`)
}
