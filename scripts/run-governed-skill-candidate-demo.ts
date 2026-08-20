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
import { apply } from '../packages/tianwen-runtime/src/index.js'
import { EvolutionLedger } from '../packages/tianwen-evolution/src/ledger.js'

export interface GovernedCandidateDemoResult {
  readonly schemaVersion: 'tianwen.governed-skill-candidate-demo.v1'
  readonly execution: {
    readonly runs: 3
    readonly sessions: 3
    readonly scriptedModelRequests: 9
    readonly toolCalls: 6
    readonly outcomes: readonly ['not-met', 'not-met', 'met']
  }
  readonly learning: {
    readonly signals: 2
    readonly tickets: 1
    readonly cases: 1
    readonly attributions: 1
    readonly lessons: 1
    readonly candidates: 1
    readonly skillManifests: 3
    readonly skillUses: 3
    readonly candidateStatus: 'recorded'
    readonly duplicateReplay: true
    readonly syntheticGovernanceContent: true
    readonly evaluated: false
    readonly shadowed: false
    readonly promoted: false
  }
  readonly isolation: {
    readonly sessionsUnchanged: true
    readonly dynamicCordisInventoryUnchanged: true
    readonly legacyArtifactEventsCreated: 0
    readonly artifactFilesCreated: 0
    readonly championChanged: false
  }
  readonly cost: {
    readonly network: 0
    readonly providerRequests: 0
    readonly paidTokens: 0
    readonly cny: 0
    readonly docker: 0
    readonly userData: 0
  }
}

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super('synthetic summary requirement was not met', 'SUMMARY_REQUIREMENT_NOT_MET')
  }
}

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

function digest(events: readonly SessionEvent[]): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(events), 'utf8').digest('hex')}`
}

export async function runGovernedSkillCandidateDemo(): Promise<GovernedCandidateDemoResult> {
  const fixtureParent = resolve(process.env.TIANWEN_DSH_PROBE_ROOT ?? '.')
  mkdirSync(fixtureParent, { recursive: true })
  const root = mkdtempSync(resolve(fixtureParent, '.tianwen-governed-candidate-'))
  const evolutionRoot = resolve(root, 'evolution')
  let harness: Awaited<ReturnType<typeof mountCoreHarness>> | undefined
  const handles: Array<{ dispose(): Promise<void> }> = []
  let disposeParent: (() => void) | undefined
  try {
    harness = await mountCoreHarness([
      toolCallResponse('skill-1', 'skill', { name: parentSkill.name }),
      toolCallResponse('verify-1', 'verify_summary', { text: 'first' }),
      textResponse('first synthetic summary complete'),
      toolCallResponse('skill-2', 'skill', { name: parentSkill.name }),
      toolCallResponse('verify-2', 'verify_summary', { text: 'second' }),
      textResponse('second synthetic summary complete'),
      toolCallResponse('skill-3', 'skill', { name: parentSkill.name }),
      toolCallResponse('verify-3', 'verify_summary', { text: 'third' }),
      textResponse('third synthetic summary complete'),
    ])
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
    let toolCalls = 0
    for (let index = 0; index < 3; index += 1) {
      const handle = await harness.ctx.agents.create({
        sessionId: SessionId(`governed-candidate-demo-${index + 1}`),
        agentOptions: { provider: 'tianwen-probe', model: 'scripted' },
      })
      handles.push(handle)
      const binding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        {
          goalRef: 'goal:research-preview',
          taskRef: `task:governed-summary-${index + 1}`,
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
      before.push(digest(handle.agent.session.events))
      outcomes.push(harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      ))
      const use = harness.ctx.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      if (use.decision !== 'recorded') throw new Error('missing Skill use proof')
      after.push(digest(handle.agent.session.events))
      toolCalls += handle.agent.session.events.filter(event =>
        event.type === 'tool/call').length
    }
    const ticketId = outcomes[1]?.ticketId
    if (ticketId === undefined) throw new Error('recurrent Ticket was not created')
    const opened = harness.ctx.tianwenEvolution.openLearningCase({
      ticketId,
      counterevidenceRunIds: [bindings[2]!.runId],
    })
    const learningCase = harness.ctx.tianwenEvolution.getLearningCase(opened.caseId)!
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
    const parent = harness.ctx.tianwenEvolution
      .getRunSkillManifest(bindings[0]!.runId)!.parent
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
    const replay = harness.ctx.tianwenEvolution.recordSkillCandidate(candidateInput)
    const restartedCandidate = new EvolutionLedger(evolutionRoot)
      .getSkillCandidate(candidate.candidateId)
    const publicEvents = harness.ctx.tianwenEvolution.listEvents()
    const artifactFiles = readdirSync(resolve(evolutionRoot, 'artifacts'))
    const sessionsUnchanged = before.every((value, index) => value === after[index])
    const inventoryUnchanged = JSON.stringify(inventoryBefore)
      === JSON.stringify(harness.ctx.dynamicCordisRunner.inventory())
    const championChanged = JSON.stringify(championBefore)
      !== JSON.stringify(harness.ctx.tianwenEvolution.getChampion())
    if (
      candidate.candidateId !== replay.candidateId
      || restartedCandidate?.candidateId !== candidate.candidateId
      || !replay.duplicate
      || harness.adapter.requests.length !== 9
      || toolCalls !== 6
      || !sessionsUnchanged
      || !inventoryUnchanged
    ) {
      throw new Error('governed Candidate demo invariant failed')
    }
    return {
      schemaVersion: 'tianwen.governed-skill-candidate-demo.v1',
      execution: {
        runs: 3,
        sessions: 3,
        scriptedModelRequests: 9,
        toolCalls: 6,
        outcomes: ['not-met', 'not-met', 'met'],
      },
      learning: {
        signals: harness.ctx.tianwenEvolution.listLearningSignals().length as 2,
        tickets: harness.ctx.tianwenEvolution.listLearningTickets().length as 1,
        cases: harness.ctx.tianwenEvolution.listLearningCases().length as 1,
        attributions: harness.ctx.tianwenEvolution.listAttributions().length as 1,
        lessons: harness.ctx.tianwenEvolution.listAcceptedLessons().length as 1,
        candidates: harness.ctx.tianwenEvolution.listSkillCandidates().length as 1,
        skillManifests: harness.ctx.tianwenEvolution.listRunSkillManifests().length as 3,
        skillUses: harness.ctx.tianwenEvolution.listRunSkillUses().length as 3,
        candidateStatus: 'recorded',
        duplicateReplay: true,
        syntheticGovernanceContent: true,
        evaluated: false,
        shadowed: false,
        promoted: false,
      },
      isolation: {
        sessionsUnchanged: true,
        dynamicCordisInventoryUnchanged: true,
        legacyArtifactEventsCreated: publicEvents.filter(event =>
          ['artifact-recorded', 'evaluation-recorded', 'approval-recorded',
            'promoted', 'rolled-back', 'runtime-bound'].includes(event.type)).length,
        artifactFilesCreated: artifactFiles.length,
        championChanged,
      },
      cost: {
        network: 0,
        providerRequests: 0,
        paidTokens: 0,
        cny: 0,
        docker: 0,
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
  process.stdout.write(`${JSON.stringify(await runGovernedSkillCandidateDemo(), null, 2)}\n`)
}
