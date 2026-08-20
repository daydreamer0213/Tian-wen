import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import type { SessionEvent } from '@tianwen/dsh-compat'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { PUBLIC_LEDGER_EVENT_TYPES } from '../packages/tianwen-evolution/src/index.js'
import { sha256 } from '../packages/tianwen-evolution/src/learning-intake.js'
import { EvolutionLedger } from '../packages/tianwen-evolution/src/ledger.js'
import { apply } from '../packages/tianwen-runtime/src/index.js'

export interface PairedSkillEvaluationDemoResult {
  readonly schemaVersion: 'tianwen.paired-skill-evaluation-demo.v1'
  readonly execution: {
    readonly governedRuns: 3
    readonly evaluationArms: 8
    readonly sessions: 11
    readonly scriptedModelRequests: 25
    readonly toolCalls: 14
  }
  readonly learning: {
    readonly signals: 2
    readonly tickets: 1
    readonly protocols: 1
    readonly cases: 1
    readonly attributions: 1
    readonly lessons: 1
    readonly candidates: 1
    readonly evaluations: 1
    readonly results: 1
    readonly candidateStatus: 'recorded'
    readonly protocolProvenance: 'pre-candidate'
    readonly evidenceClass: 'scripted-mechanism'
    readonly verdict: 'INCONCLUSIVE'
    readonly comparison: 'not-comparable'
    readonly decision: 'needs-evidence'
    readonly reasonIncludesScriptedModelOutput: true
    readonly duplicateReplay: true
    readonly restartMatched: true
  }
  readonly isolation: {
    readonly sessionsUnchanged: true
    readonly rootSkillUnchanged: true
    readonly candidateAbsentAfterDisposal: true
    readonly dynamicCordisInventoryUnchanged: true
    readonly legacyArtifactEventsCreated: 0
    readonly artifactFilesCreated: 0
    readonly championChanged: false
    readonly publicEventsRedacted: true
  }
  readonly cost: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly cny: 0
    readonly docker: 0
    readonly persistentExternalDatabase: 0
    readonly userData: 0
  }
}

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super('synthetic summary requirement was not met', 'SUMMARY_REQUIREMENT_NOT_MET')
  }
}

const callConfig = {
  provider: 'tianwen-probe',
  model: 'scripted',
  maxTokens: 256,
} as const
const parentSkill = {
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
const evaluationCases = [
  ['eval-case:problem', 'problem'],
  ['eval-case:regression', 'regression'],
  ['eval-case:counterexample', 'counterexample'],
  ['eval-case:safety', 'safety'],
] as const

function sessionDigest(events: readonly SessionEvent[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8').digest('hex')}`
}

function evaluationProtocol() {
  return {
    cases: evaluationCases.map(([caseId, category]) => ({
      caseId,
      category,
      inputDigest: sha256(`/research-summary\n${category}`),
      dataSnapshotDigest: sha256(`data:${category}`),
      acceptanceContract: acceptance,
    })),
    armOrder: 'baseline-then-candidate' as const,
    repetition: { attempts: 1, reducer: 'all-attempts-must-pass' as const },
    hardGates: ['problem', 'regression', 'counterexample', 'safety'] as const,
    softMetrics: ['model-requests', 'tool-calls'] as const,
    thresholds: { requiredCasePasses: 4 },
    budget: {
      maxModelRequestsPerArm: 3,
      maxTokensPerArm: 2_000,
      maxToolCallsPerArm: 2,
      maxElapsedMsPerArm: 10_000,
      maxCnyMilliPerArm: 0,
      maxTotalModelRequests: 24,
      maxTotalTokens: 16_000,
      maxTotalToolCalls: 16,
      maxTotalElapsedMs: 80_000,
      maxTotalCnyMilli: 0,
    },
    execution: {
      providerId: callConfig.provider,
      modelId: callConfig.model,
      toolSchemaDigest: sha256('tool-schema'),
      permissionDigest: sha256('permissions'),
      validatorContractDigest: sha256('validator'),
    },
  }
}

export async function runPairedSkillEvaluationDemo(): Promise<PairedSkillEvaluationDemoResult> {
  const fixtureParent = resolve(process.env.TIANWEN_DSH_PROBE_ROOT ?? '.')
  mkdirSync(fixtureParent, { recursive: true })
  const root = mkdtempSync(resolve(fixtureParent, '.tianwen-paired-skill-evaluation-'))
  const evolutionRoot = resolve(root, 'evolution')
  let harness: Awaited<ReturnType<typeof mountCoreHarness>> | undefined
  const handles: Array<{ dispose(): Promise<void> }> = []
  let disposeParent: (() => void) | undefined
  try {
    const script = [
      ...Array.from({ length: 3 }, (_, index) => [
        toolCallResponse(`skill-${index + 1}`, 'skill', { name: parentSkill.name }),
        toolCallResponse(`verify-${index + 1}`, 'verify_summary', { text: `governed-${index + 1}` }),
        textResponse(`governed synthetic summary ${index + 1}`),
      ]).flat(),
      ...Array.from({ length: 8 }, (_, index) => [
        toolCallResponse(`evaluation-${index + 1}`, 'verify_summary', { text: `evaluation-${index + 1}` }),
        textResponse(`evaluation synthetic summary ${index + 1}`),
      ]).flat(),
    ]
    harness = await mountCoreHarness(script)
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot })
    disposeParent = harness.ctx.skills.register(parentSkill)
    let verifierCalls = 0
    harness.ctx.tools.register(defineTool({
      name: 'verify_summary',
      description: 'verify one synthetic summary contract',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        verifierCalls += 1
        if (verifierCalls < 3) throw new SummaryRequirementNotMet()
        return 'accepted'
      },
    }))
    const inventoryBefore = harness.ctx.dynamicCordisRunner.inventory()
    const championBefore = harness.ctx.tianwenEvolution.getChampion()
    const before: string[] = []
    const after: string[] = []
    const bindings = []
    const outcomes = []
    let governedToolCalls = 0
    for (let index = 0; index < 3; index += 1) {
      const handle = await harness.ctx.agents.create({
        sessionId: SessionId(`paired-skill-evaluation-governed-${index + 1}`),
        agentOptions: callConfig,
      })
      handles.push(handle)
      const binding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        {
          goalRef: 'goal:research-preview',
          taskRef: `task:paired-skill-evaluation-governed-${index + 1}`,
          scopeKey: 'project:tianwen/capability:research-summary',
          acceptanceContract: acceptance,
        },
        parentSkill.name,
      )
      bindings.push(binding)
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: `load and verify summary ${index + 1}` }],
        source: { kind: 'user' },
      }))
      await waitForIdle(harness.ctx, handle.agent)
      before.push(sessionDigest(handle.agent.session.events))
      outcomes.push(harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      ))
      const use = harness.ctx.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      if (use.decision !== 'recorded') throw new Error('missing parent Skill use proof')
      after.push(sessionDigest(handle.agent.session.events))
      governedToolCalls += handle.agent.session.events.filter(event => event.type === 'tool/call').length
    }
    const ticketId = outcomes[1]?.ticketId
    if (ticketId === undefined) throw new Error('recurrent Ticket was not created')
    const frozenProtocol = evaluationProtocol()
    const protocol = harness.ctx.tianwenEvolution.freezeSkillEvalProtocol({
      ticketId,
      protocol: frozenProtocol,
    })
    const openedCase = harness.ctx.tianwenEvolution.openLearningCase({
      ticketId,
      counterevidenceRunIds: [bindings[2]!.runId],
    })
    const learningCase = harness.ctx.tianwenEvolution.getLearningCase(openedCase.caseId)!
    const supportingEvidenceIds = learningCase.supportingEvidenceIds
    const counterevidenceIds = learningCase.counterevidence.flatMap(item => item.evidenceIds)
    const attribution = harness.ctx.tianwenEvolution.recordAttribution({
      caseId: learningCase.caseId,
      resolution: 'dsh-skill',
      targetSkillName: learningCase.parentSkillName,
      hypothesis: 'The parent instruction omits deterministic result-first ordering.',
      supportingEvidenceIds,
      counterevidenceIds,
      alternatives: 'Tool and Runtime causes remain unsupported by this fixture.',
    })
    const lesson = harness.ctx.tianwenEvolution.recordAcceptedLesson({
      caseId: learningCase.caseId,
      attributionId: attribution.attributionId,
      claim: 'State the observed result before interpretation.',
      when: 'When summarizing a verified research observation.',
      notWhen: 'When the task requests raw extraction.',
      supportingEvidenceIds,
      counterevidenceIds,
      targetScope: learningCase.scopeKey,
    })
    const parent = harness.ctx.tianwenEvolution.getRunSkillManifest(bindings[0]!.runId)!.parent
    const candidateInput = {
      lessonId: lesson.lessonId,
      payload: {
        ...parent,
        description: 'Summarize verified observations with result-first ordering.',
        content: '# Research summary\n\nState the observed result first, then interpret it.',
      },
      evidenceIds: [...supportingEvidenceIds, ...counterevidenceIds],
    }
    const candidate = harness.ctx.tianwenEvolution.recordSkillCandidate(candidateInput)
    const candidateReplay = harness.ctx.tianwenEvolution.recordSkillCandidate(candidateInput)
    const evaluation = await harness.ctx.tianwenSkillEvaluation.run({
      candidateId: candidate.candidateId,
      protocolId: protocol.protocolId,
      environment: {
        dshVersion: '0.1.0-rc.7',
        providerId: callConfig.provider,
        modelId: callConfig.model,
        callConfigDigest: sha256(callConfig),
        toolSchemaDigest: sha256('tool-schema'),
        permissionDigest: sha256('permissions'),
        workspaceSnapshotDigest: sha256('workspace'),
        validatorContractDigest: sha256('validator'),
        budget: frozenProtocol.budget,
      },
      callConfig,
      cases: evaluationCases.map(([caseId, category]) => ({
        caseId,
        input: `/research-summary\n${category}`,
      })),
    })
    const protocolReplay = harness.ctx.tianwenEvolution.freezeSkillEvalProtocol({
      ticketId,
      protocol: frozenProtocol,
    })
    const planReplay = harness.ctx.tianwenEvolution.openSkillEvaluation({
      candidateId: candidate.candidateId,
      protocolId: protocol.protocolId,
      environment: evaluation.plan.environment,
      arms: evaluation.plan.cases.map(item => ({
        caseId: item.caseId,
        attempt: item.attempt,
        baseline: { runId: item.baseline.runId, sessionId: item.baseline.sessionId },
        candidate: { runId: item.candidate.runId, sessionId: item.candidate.sessionId },
      })),
    })
    const resultReplay = harness.ctx.tianwenEvolution.recordSkillEvaluationResult({
      evaluationId: evaluation.evaluationId,
      cases: evaluation.result.cases.map(item => ({
        caseId: item.caseId,
        attempt: item.attempt,
        baseline: item.baseline,
        candidate: item.candidate,
      })),
      baselineResolutionMatched: evaluation.result.baselineResolutionMatched,
      trustedExecution: { kind: 'scripted-adapter' },
    })
    const restarted = new EvolutionLedger(evolutionRoot)
    const publicEvents = harness.ctx.tianwenEvolution.listEvents()
    const serializedPublicEvents = JSON.stringify(publicEvents)
    const internalTypes = [
      'learning-intake-recorded',
      'run-binding-recorded',
      'outcome-intake-recorded',
      'run-skill-manifest-recorded',
      'run-skill-use-recorded',
      'learning-case-opened',
      'learning-attribution-recorded',
      'learning-lesson-recorded',
      'learning-candidate-recorded',
      'skill-eval-protocol-frozen',
      'skill-evaluation-opened',
      'skill-evaluation-result-recorded',
    ]
    const rootSkillUnchanged = (await harness.ctx.skills.get(parentSkill.name))?.content === parentSkill.content
    const fresh = await harness.ctx.agents.create({
      sessionId: SessionId('paired-skill-evaluation-fresh'),
      agentOptions: callConfig,
    })
    try {
      let freshContent: string | undefined
      await fresh.agent.ctx.inject(['skills'], async scopedCtx => {
        freshContent = (await scopedCtx.skills.get(parentSkill.name, {
          cwd: fresh.agent.session.header.cwd,
          scope: fresh.agent,
        }))?.content
      })
      if (freshContent !== parentSkill.content) {
        throw new Error('Candidate leaked into a fresh ordinary DSH Agent')
      }
    } finally {
      await fresh.dispose()
    }
    const sessionsUnchanged = before.every((value, index) => value === after[index])
    const inventoryUnchanged = JSON.stringify(inventoryBefore)
      === JSON.stringify(harness.ctx.dynamicCordisRunner.inventory())
    const championChanged = JSON.stringify(championBefore)
      !== JSON.stringify(harness.ctx.tianwenEvolution.getChampion())
    const artifactFiles = readdirSync(resolve(evolutionRoot, 'artifacts'))
    const legacyArtifactEvents = publicEvents.filter(event =>
      ['artifact-recorded', 'evaluation-recorded', 'approval-recorded',
        'promoted', 'rolled-back', 'runtime-bound'].includes(event.type))
    const publicEventsRedacted = publicEvents.every(event =>
      PUBLIC_LEDGER_EVENT_TYPES.includes(event.type))
      && internalTypes.every(type => !serializedPublicEvents.includes(type))
      && !serializedPublicEvents.includes('State the observed')
    const duplicateReplay = candidateReplay.duplicate
      && protocolReplay.duplicate
      && planReplay.duplicate
      && resultReplay.duplicate
    const restartMatched = restarted.getSkillEvalProtocol(protocol.protocolId)?.protocolId === protocol.protocolId
      && restarted.getSkillCandidate(candidate.candidateId)?.candidateId === candidate.candidateId
      && restarted.getSkillEvaluation(evaluation.evaluationId)?.evaluationId === evaluation.evaluationId
      && restarted.getSkillEvaluationResult(evaluation.evaluationId)?.evaluationId === evaluation.evaluationId
    if (
      harness.adapter.requests.length !== 25
      || verifierCalls !== 11
      || governedToolCalls !== 6
      || !sessionsUnchanged
      || !rootSkillUnchanged
      || !inventoryUnchanged
      || championChanged
      || legacyArtifactEvents.length !== 0
      || artifactFiles.length !== 0
      || !publicEventsRedacted
      || !duplicateReplay
      || !restartMatched
      || evaluation.result.evidenceClass !== 'scripted-mechanism'
      || evaluation.result.verdict !== 'INCONCLUSIVE'
      || evaluation.result.comparison !== 'not-comparable'
      || evaluation.result.decision !== 'needs-evidence'
      || !evaluation.result.reasonCodes.includes('scripted-model-output')
    ) {
      throw new Error('paired Skill evaluation demo invariant failed')
    }
    return {
      schemaVersion: 'tianwen.paired-skill-evaluation-demo.v1',
      execution: {
        governedRuns: 3,
        evaluationArms: 8,
        sessions: 11,
        scriptedModelRequests: 25,
        toolCalls: 14,
      },
      learning: {
        signals: 2,
        tickets: 1,
        protocols: 1,
        cases: 1,
        attributions: 1,
        lessons: 1,
        candidates: 1,
        evaluations: 1,
        results: 1,
        candidateStatus: 'recorded',
        protocolProvenance: 'pre-candidate',
        evidenceClass: 'scripted-mechanism',
        verdict: 'INCONCLUSIVE',
        comparison: 'not-comparable',
        decision: 'needs-evidence',
        reasonIncludesScriptedModelOutput: true,
        duplicateReplay: true,
        restartMatched: true,
      },
      isolation: {
        sessionsUnchanged: true,
        rootSkillUnchanged: true,
        candidateAbsentAfterDisposal: true,
        dynamicCordisInventoryUnchanged: true,
        legacyArtifactEventsCreated: 0,
        artifactFilesCreated: 0,
        championChanged: false,
        publicEventsRedacted: true,
      },
      cost: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        cny: 0,
        docker: 0,
        persistentExternalDatabase: 0,
        userData: 0,
      },
    }
  } finally {
    try {
      for (const handle of handles) await handle.dispose()
      disposeParent?.()
      if (harness !== undefined) await harness.ctx.fiber.dispose()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runPairedSkillEvaluationDemo(), null, 2)}\n`)
}
