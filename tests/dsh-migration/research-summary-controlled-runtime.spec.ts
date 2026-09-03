import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  DynamicCordisRunnerService,
  ScriptedAdapter,
  SkillRegistry,
  applySkillTool,
  mountPersistentHarness,
  toolCallResponse,
  type StreamChunk,
} from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  RESEARCH_SUMMARY_TOOL_NAME,
  apply,
  createResearchSummaryTool,
  evaluateResearchSummarySubmission,
  parseResearchPacket,
} from '../../packages/tianwen-runtime/src/index.js'
import {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'

const PROVIDER = 'tianwen-controlled-scripted'
const MODEL = 'scripted'
const roots: string[] = []

class ProductAdapter extends ScriptedAdapter {
  constructor(script: readonly (readonly StreamChunk[] | Error)[]) {
    super(script.map(entry => Array.isArray(entry) ? [...entry] : entry))
  }

  override providerRetryPolicy() {
    return {
      mode: 'normal' as const,
      maxRetries: 0,
      retryableCodes: [],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    }
  }

}

function rootFor(name: string): string {
  const root = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-probe-task7',
    'research-summary-controlled-runtime',
    name,
  )
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

function writeWorkspace(root: string, content: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'brief.txt'), content, 'utf8')
}

function validSubmission(source: string) {
  const packet = parseResearchPacket(source)
  const findings = packet.items.filter(item =>
    item.kind === 'finding' && item.priority === 'required')
  const uncertainties = packet.items.filter(item =>
    item.kind === 'uncertainty' && item.priority === 'decision')
  return {
    summary: [...findings, ...uncertainties].map(item => item.text).join(' '),
    confirmedFindingIds: findings.map(item => item.id),
    uncertaintyIds: uncertainties.map(item => item.id),
  }
}

function blindScore(taskId: string) {
  const dimensions = {
    relevance: 3,
    correctnessReasoning: 3,
    clarityUsability: 3,
    scopeRestraint: 3,
  }
  return toolCallResponse(`${taskId}-blind-score`, 'submit_blind_evaluation', {
    status: 'scored',
    insufficientMaterial: false,
    reasonCode: 'score-submitted',
    scores: { x: dimensions, y: dimensions },
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('research-summary controlled product Runtime', () => {
  it('derives every arm verdict from one scoped accepted product submission', async () => {
    const root = rootFor('paired-product-verdicts')
    const protocol = resolveExplicitCorrectionProtocol(
      EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
    )!
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace: writeWorkspace,
      sessionNamespace: 'product-verdicts',
    })
    const shadowTasks = protocol.buildShadowTasks({
      root,
      materializeWorkspace: writeWorkspace,
      sessionNamespace: 'product-shadow',
    })
    const transitionSubmission = validSubmission(tasks.find(task =>
      task.semanticType === 'safety-boundary')!.packet.source)
    const script = [
      ...tasks.flatMap(task =>
      (['base', 'candidate'] as const).flatMap(role => [
        toolCallResponse(`${task.semanticType}-${role}-skill`, 'skill', {
          name: protocol.parentSkill.name,
        }),
        toolCallResponse(
          `${task.semanticType}-${role}-submit`,
          RESEARCH_SUMMARY_TOOL_NAME,
          task.expectedSubmissions[role],
        ),
      ])),
      ...tasks.map(task => blindScore(task.taskId)),
      ...shadowTasks.flatMap(task => [
        toolCallResponse(`${task.taskId}-skill`, 'skill', {
          name: protocol.parentSkill.name,
        }),
        toolCallResponse(`${task.taskId}-submit`, RESEARCH_SUMMARY_TOOL_NAME,
          validSubmission(task.researchPacket)),
      ]),
      toolCallResponse('transition-skill', 'skill', {
        name: protocol.parentSkill.name,
      }),
      toolCallResponse('transition-submit', RESEARCH_SUMMARY_TOOL_NAME,
        transitionSubmission),
    ]
    const harness = await mountPersistentHarness(join(root, 'sessions'), [])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    const disposeParent = harness.ctx.skills.register(protocol.parentSkill)
    const adapter = new ProductAdapter(script)
    harness.ctx.llm.registerAdapter([PROVIDER], adapter)
    const selection = { provider: PROVIDER, model: MODEL }
    harness.ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ ...selection }),
    })
    await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })

    try {
      const acceptance = protocol.acceptance
      const seeds = [
        ['first', 'not-met', 'a'],
        ['second', 'not-met', 'b'],
        ['counterexample', 'met', 'c'],
      ] as const
      const runs = seeds.map(([suffix, verdict, marker]) => {
        const sessionId = `session:research-summary-product-seed:${suffix}`
        const binding = harness.ctx.tianwenEvolution.recordRunBinding({
          goalRef: 'goal:research-summary-product-seed',
          taskRef: `task:research-summary-product-seed:${suffix}`,
          sessionId,
          scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
          acceptanceContract: acceptance,
        })
        const manifest = harness.ctx.tianwenEvolution.recordRunSkillManifest({
          runId: binding.runId,
          skill: protocol.parentSkill,
        })
        const sessionDigest = sha256(`product-seed-session:${marker}`)
        const evidenceId = sha256(`product-seed-evidence:${marker}`)
        const outcome = harness.ctx.tianwenEvolution.recordOutcomeIntake({
          runId: binding.runId,
          verdict,
          sessionDigest,
          evidenceIds: [evidenceId],
        })
        harness.ctx.tianwenEvolution.recordRunSkillUse({
          runId: binding.runId,
          parentVersionId: manifest.parentVersionId,
          sessionId,
          sessionDigest,
          skillName: protocol.parentSkill.name,
          contentDigest: sha256(protocol.parentSkill.content),
          skillEvidenceId: sha256(`product-seed-skill-evidence:${marker}`),
          acceptanceEvidenceId: evidenceId,
          skillCallSeq: 10,
          skillResultSeq: 11,
          acceptanceCallSeq: 12,
        })
        return { binding, outcome }
      })
      const representative = createResearchSummaryTool(tasks[0]!.packet, {
        kind: 'controlled-enforce',
        oracle: evaluateResearchSummarySubmission,
      })
      const toolSchemas = [
        ...harness.ctx.tools.schemas().filter(schema => schema.name === 'skill'),
        {
          name: representative.name,
          description: representative.description,
          parameters: structuredClone(representative.parameters),
        },
      ].toSorted((left, right) => left.name.localeCompare(right.name))
      const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
      const retryPolicy = harness.ctx.llm.providerRetryPolicy(PROVIDER)
      const frozen = harness.ctx.tianwenEvolution.freezeControlledSkillEvalProtocol(
        protocol.buildProtocolInput({
          ticketId: runs[1]!.outcome.ticketId!,
          sha256,
          rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
          callConfig,
          retryPolicy,
          toolSchemaDigest: sha256(toolSchemas),
          tasks,
        }),
      )
      const opened = harness.ctx.tianwenEvolution.openLearningCase({
        ticketId: runs[1]!.outcome.ticketId!,
        counterevidenceRunIds: [runs[2]!.binding.runId],
      })
      const learningCase = harness.ctx.tianwenEvolution.getLearningCase(opened.caseId)!
      const attribution = harness.ctx.tianwenEvolution.recordAttribution({
        caseId: learningCase.caseId,
        resolution: 'dsh-skill',
        targetSkillName: protocol.parentSkill.name,
        hypothesis: 'Decision-relevant uncertainties were omitted.',
        supportingEvidenceIds: learningCase.supportingEvidenceIds,
        counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
        alternatives: 'No other cause is supported by this bounded product case.',
      })
      const lesson = harness.ctx.tianwenEvolution.recordAcceptedLesson({
        caseId: learningCase.caseId,
        attributionId: attribution.attributionId,
        claim: 'Include decision-relevant uncertainty without promoting background uncertainty.',
        when: 'When a research packet marks uncertainty as decision-relevant.',
        notWhen: 'When uncertainty is marked as background.',
        supportingEvidenceIds: learningCase.supportingEvidenceIds,
        counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
        targetScope: learningCase.scopeKey,
      })
      const candidate = harness.ctx.tianwenEvolution.recordSkillCandidate({
        lessonId: lesson.lessonId,
        payload: {
          name: protocol.parentSkill.name,
          description: protocol.parentSkill.description,
          whenToUse: protocol.parentSkill.whenToUse,
          invocation: protocol.parentSkill.invocation,
          source: protocol.parentSkill.source,
          content: `${protocol.parentSkill.content}\n\nInclude every uncertainty marked \`decision\` in \`uncertaintyIds\`.`,
        },
        evidenceIds: [
          ...learningCase.supportingEvidenceIds,
          ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
        ],
      })

      expect(harness.ctx.tools.schemas().map(schema => schema.name))
        .not.toContain(RESEARCH_SUMMARY_TOOL_NAME)

      const receipt = await harness.ctx.tianwenSkillEvaluation.runControlledArms(
        protocol.buildArmsInput(candidate.candidateId, frozen.protocolId, tasks),
      )
      expect(receipt.state).toBe('awaiting-evaluator')
      const objectives = harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(receipt.evaluationId)
      expect(objectives.map(objective => objective.baseline.outcome))
        .toEqual(['not-met', 'not-met', 'met', 'met', 'met'])
      expect(objectives.map(objective => objective.candidate.outcome))
        .toEqual(['met', 'met', 'met', 'met', 'met'])
      expect(objectives.flatMap(objective => [
        objective.baseline.usedToolNames,
        objective.candidate.usedToolNames,
      ])).toEqual(Array.from({ length: 10 }, () => [
        'skill',
        RESEARCH_SUMMARY_TOOL_NAME,
      ]))
      expect(harness.ctx.tools.schemas().map(schema => schema.name))
        .not.toContain(RESEARCH_SUMMARY_TOOL_NAME)

      const evaluators = await harness.ctx.tianwenSkillEvaluation
        .runControlledEvaluators(protocol.buildEvaluatorsInput(
          receipt.evaluationId,
          tasks,
        ))
      expect(evaluators.state).toBe('terminal')
      expect(evaluators.result?.mechanismVerdict).toBe('pass')
      const shadow = await harness.ctx.tianwenSkillEvaluation.runControlledShadow({
        evaluationId: receipt.evaluationId,
        tasks: shadowTasks,
      })
      expect(shadow.state).toBe('terminal')
      expect(shadow.result?.mechanismVerdict).toBe('pass')
      const pointer = harness.ctx.tianwenEvolution.initializeControlledSkillScopePointer({
        shadowId: shadow.shadowId,
      })
      const transitionInput = protocol.buildTransitionInput({
        root,
        shadowId: shadow.shadowId,
        kind: 'promote',
        expectedRevision: pointer.revision,
        materializeWorkspace: writeWorkspace,
      })
      const transition = await harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(transitionInput)
      expect(transition.state).toBe('terminal')
      expect(transition.transition.state).toBe('verified')
      expect(harness.ctx.tools.schemas().map(schema => schema.name))
        .not.toContain(RESEARCH_SUMMARY_TOOL_NAME)

      const firstBaseline = await harness.ctx.sessionPersistence.inspect(
        tasks[0]!.baselineSessionId as never,
      )
      const submissionCall = firstBaseline.events.find(event =>
        event.type === 'tool/call'
        && event.data.name === RESEARCH_SUMMARY_TOOL_NAME)
      const submissionResult = submissionCall?.type === 'tool/call'
        ? firstBaseline.events.find(event =>
            event.type === 'tool/result'
            && String(event.data.message.content[0]?.toolCallId)
              === String(submissionCall.data.callId))
        : undefined
      expect(submissionResult).toBeDefined()
      expect(submissionResult?.type === 'tool/result'
        && submissionResult.data.message.content[0]?.isError).toBe(false)
      expect(JSON.stringify(firstBaseline.events)).not.toContain(
        'final-completed-assistant-text',
      )
    } finally {
      disposeParent()
      await harness.ctx.fiber.dispose()
    }
  })
})
