import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  prepareRunBinding,
  sha256,
  TianwenEvolutionService,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  ControlledSkillShadowPlan,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  EvolutionLedger,
  isPublicLedgerEvent,
  LedgerIntegrityError,
} from '../../packages/tianwen-evolution/src/ledger.js'

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const parentSkill = {
  name: 'controlled-shadow-summary',
  description: 'Summarize one controlled observation.',
  whenToUse: 'When a controlled task asks for a concise summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled summary\n\nState the observation.',
} as const

const taskTypes = [
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const

const controlledShadowServiceFacade: Pick<
  EvolutionLedger,
  | 'openControlledSkillShadow'
  | 'getControlledSkillShadow'
  | 'listControlledSkillShadows'
  | 'recordControlledSkillShadowResult'
  | 'getControlledSkillShadowResult'
  | 'listControlledSkillShadowResults'
> = TianwenEvolutionService.prototype

void controlledShadowServiceFacade

const roots: string[] = []

function fixtureRoot(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? tmpdir(),
    'controlled-skill-shadow-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function controlledProtocol() {
  return {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: taskTypes.map((taskType, index) => ({
      taskId: `eval-task:${taskType}` as const,
      taskType,
      goalDigest: sha256(`evaluation-goal:${index}`),
      inputDigest: sha256(`evaluation-input:${index}`),
      workspaceSnapshotDigest: sha256(`evaluation-workspace:${index}`),
      toolSchemaDigest: sha256(`evaluation-tools:${index}`),
      authorizationDigest: sha256(`evaluation-authorization:${index}`),
      verifierContractDigest: sha256(`evaluation-verifier:${index}`),
      stopConditionDigest: sha256(`evaluation-stop:${index}`),
      evaluatorMaterialContractDigest: sha256(`evaluation-material:${index}`),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: sha256(`evaluation-subject:${index}`),
      allowedTools: ['skill', 'verify_summary'],
      stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    })),
    execution: {
      dshVersion: '0.1.1-rc.2' as const,
      providerId: 'tianwen-shadow-scripted',
      modelId: 'scripted',
      callConfigDigest: sha256('shadow-call-config'),
      toolSchemaDigest: sha256('evaluation-tool-surface'),
      retryPolicyDigest: sha256('shadow-no-retry'),
    },
  }
}

function seedPassingEvaluation(
  root: string,
  evidencePurpose: 'controlled-product' | 'development-only-synthetic-defect' =
    'development-only-synthetic-defect',
) {
  const ledger = new EvolutionLedger(root, {
    clock: () => '2026-08-23T00:00:00.000Z',
  })
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker]) => {
    const sessionId = `session:shadow-seed:${suffix}`
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:controlled-shadow-seed',
      taskRef: `task:controlled-shadow-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-shadow-summary',
      acceptanceContract: acceptance,
    })
    const manifest = ledger.recordRunSkillManifest({
      runId: binding.runId,
      skill: parentSkill,
    })
    const sessionDigest = sha256(`shadow-seed-session:${marker}`)
    const evidenceId = sha256(`shadow-seed-evidence:${marker}`)
    const outcome = ledger.recordOutcomeIntake({
      runId: binding.runId,
      verdict,
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    ledger.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId,
      sessionDigest,
      skillName: parentSkill.name,
      contentDigest: sha256(parentSkill.content),
      skillEvidenceId: sha256(`shadow-seed-skill-evidence:${marker}`),
      acceptanceEvidenceId: evidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return { binding, outcome }
  })
  const ticketId = runs[1]!.outcome.ticketId!
  const protocol = ledger.freezeControlledSkillEvalProtocol({
    ticketId,
    evidencePurpose,
    protocol: controlledProtocol(),
  })
  const openedCase = ledger.openLearningCase({
    ticketId,
    counterevidenceRunIds: [runs[2]!.binding.runId],
  })
  const learningCase = ledger.getLearningCase(openedCase.caseId)!
  const attribution = ledger.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parentSkill.name,
    hypothesis: 'The parent omits verified result-first ordering.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    alternatives: 'Runtime and verifier causes remain unsupported in this fixture.',
  })
  const lesson = ledger.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: 'State the verified result before interpretation.',
    when: 'When summarizing a verified controlled observation.',
    notWhen: 'When the task requests raw extraction only.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    targetScope: learningCase.scopeKey,
  })
  const candidate = ledger.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: parentSkill.name,
      description: 'Summarize one verified controlled observation.',
      whenToUse: parentSkill.whenToUse,
      invocation: parentSkill.invocation,
      source: parentSkill.source,
      content: '# Controlled summary\n\nState the verified result before interpretation.',
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  const evaluation = ledger.openControlledSkillEvaluation({
    candidateId: candidate.candidateId,
    protocolId: protocol.protocolId,
    sessionAllocations: controlledProtocol().tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:controlled-evaluation:${task.taskType}:baseline`,
      candidateSessionId: `session:controlled-evaluation:${task.taskType}:candidate`,
      evaluatorSessionId: `session:controlled-evaluation:${task.taskType}:evaluator`,
    })),
  })
  const plan = ledger.getControlledSkillEvaluation(evaluation.evaluationId)!
  for (const [index, task] of plan.tasks.entries()) {
    const executionManifestDigest = sha256({
      execution: plan.execution,
      goalDigest: task.goalDigest,
      inputDigest: task.inputDigest,
      workspaceSnapshotDigest: task.workspaceSnapshotDigest,
      toolSchemaDigest: task.toolSchemaDigest,
      authorizationDigest: task.authorizationDigest,
      verifierContractDigest: task.verifierContractDigest,
      stopConditionDigest: task.stopConditionDigest,
      evaluatorMaterialContractDigest: task.evaluatorMaterialContractDigest,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      allowedTools: task.allowedTools,
      stopContract: task.stopContract,
    })
    const arms = ([task.baseline, task.candidate] as const).map(arm => {
      const binding = ledger.recordRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${plan.protocolId}`,
        taskRef: `task:${task.taskId}:${arm.role}`,
        sessionId: arm.sessionId,
        scopeKey: plan.scopeKey,
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      })
      const skill = arm.role === 'baseline'
        ? parentSkill
        : { ...ledger.getSkillCandidate(plan.candidateId)!.payload, provider: 'runtime' }
      const manifest = ledger.recordRunSkillManifest({ runId: binding.runId, skill })
      const outcome = arm.role === 'baseline' && index === 0 ? 'not-met' : 'met'
      const sessionDigest = sha256(`evaluation-session:${task.taskId}:${arm.role}`)
      const evidenceId = sha256(`evaluation-evidence:${task.taskId}:${arm.role}`)
      ledger.recordOutcomeIntake({
        runId: binding.runId,
        verdict: outcome,
        sessionDigest,
        evidenceIds: [evidenceId],
      })
      ledger.recordRunSkillUse({
        runId: binding.runId,
        parentVersionId: manifest.parentVersionId,
        sessionId: arm.sessionId,
        sessionDigest,
        skillName: parentSkill.name,
        contentDigest: sha256(skill.content),
        skillEvidenceId: sha256(`evaluation-skill-evidence:${task.taskId}:${arm.role}`),
        acceptanceEvidenceId: evidenceId,
        skillCallSeq: 10,
        skillResultSeq: 11,
        acceptanceCallSeq: 12,
      })
      return {
        role: arm.role,
        runId: binding.runId,
        sessionId: arm.sessionId,
        skillVersionId: manifest.parentVersionId,
        contentDigest: sha256(skill.content),
        executionManifestDigest,
        normalizedFirstRequestDigest: sha256(`evaluation-request:${task.taskId}`),
        outcome,
        evidenceIds: [evidenceId],
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        evaluatorMaterialDigest: sha256(`evaluation-material:${task.taskId}:${arm.role}`),
        usedToolNames: ['skill', 'verify_summary'],
        usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
      }
    })
    ledger.recordControlledSkillEvaluationObjective({
      evaluationId: plan.evaluationId,
      taskId: task.taskId,
      baseline: arms[0]!,
      candidate: arms[1]!,
    })
  }
  ledger.freezeControlledSkillEvaluationBlindMap({ evaluationId: plan.evaluationId })
  const blindMap = ledger.getControlledSkillEvaluationBlindMap(plan.evaluationId)!
  for (const [index, task] of plan.tasks.entries()) {
    const assignment = blindMap.assignments[index]!
    ledger.recordControlledSkillEvaluatorObservation({
      evaluationId: plan.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`shadow-evaluator-request:${task.taskId}`),
      evidenceId: sha256(`shadow-evaluator-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
        y: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
      },
    })
  }
  ledger.recordControlledSkillEvaluationResult({ evaluationId: plan.evaluationId })
  return {
    ledger,
    plan,
    result: ledger.getControlledSkillEvaluationResult(plan.evaluationId)!,
  }
}

function shadowTasks() {
  return taskTypes.map((taskType, index) => ({
    taskId: `shadow-task:${taskType}` as const,
    goalDigest: sha256(`shadow-goal:${index}`),
    inputDigest: sha256(`shadow-input:${index}`),
    workspaceSnapshotDigest: sha256(`shadow-workspace:${index}`),
    toolSchemaDigest: sha256(`shadow-tools:${index}`),
    authorizationDigest: sha256(`shadow-authorization:${index}`),
    verifierContractDigest: sha256(`shadow-verifier:${index}`),
    stopConditionDigest: sha256(`shadow-stop:${index}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`shadow-subject:${index}`),
    allowedTools: ['skill', 'verify_summary'],
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    sessionId: `session:controlled-shadow:${taskType}`,
  }))
}

function openShadow(
  ledger: EvolutionLedger,
  evaluationId: string,
): ControlledSkillShadowPlan {
  const input = { evaluationId, tasks: shadowTasks() }
  const receipt = (ledger as unknown as {
    openControlledSkillShadow(input: typeof input): { shadowId: string; duplicate: boolean }
  }).openControlledSkillShadow(input)
  return (ledger as unknown as {
    getControlledSkillShadow(shadowId: string): ControlledSkillShadowPlan | undefined
  }).getControlledSkillShadow(receipt.shadowId)!
}

function shadowExecutionManifestDigest(
  plan: ControlledSkillShadowPlan,
  task: ControlledSkillShadowPlan['tasks'][number],
) {
  return sha256({
    execution: plan.execution,
    goalDigest: task.goalDigest,
    inputDigest: task.inputDigest,
    workspaceSnapshotDigest: task.workspaceSnapshotDigest,
    toolSchemaDigest: task.toolSchemaDigest,
    authorizationDigest: task.authorizationDigest,
    verifierContractDigest: task.verifierContractDigest,
    stopConditionDigest: task.stopConditionDigest,
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    allowedTools: task.allowedTools,
    stopContract: task.stopContract,
  })
}

function recordShadowRunFacts(
  ledger: EvolutionLedger,
  plan: ControlledSkillShadowPlan,
  outcomes: readonly ('met' | 'not-met' | 'inconclusive')[],
) {
  const candidate = ledger.getSkillCandidate(plan.candidateId)!
  return plan.tasks.slice(0, outcomes.length).map((task, index) => {
    const binding = ledger.recordRunBinding({
      goalRef: `goal:controlled-skill-shadow:${plan.shadowId}`,
      taskRef: `task:${task.taskId}:candidate`,
      sessionId: task.sessionId,
      scopeKey: plan.scopeKey,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    })
    expect(binding.runId).toBe(task.runId)
    const manifest = ledger.recordRunSkillManifest({
      runId: task.runId,
      skill: { ...candidate.payload, provider: 'runtime' },
    })
    const sessionDigest = sha256(`shadow-session:${task.taskId}`)
    const evidenceId = sha256(`shadow-evidence:${task.taskId}`)
    ledger.recordOutcomeIntake({
      runId: task.runId,
      verdict: outcomes[index]!,
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    ledger.recordRunSkillUse({
      runId: task.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: task.sessionId,
      sessionDigest,
      skillName: candidate.payload.name,
      contentDigest: sha256(candidate.payload.content),
      skillEvidenceId: sha256(`shadow-skill-evidence:${task.taskId}`),
      acceptanceEvidenceId: evidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return {
      taskId: task.taskId,
      runId: task.runId,
      sessionId: task.sessionId,
      skillVersionId: manifest.parentVersionId,
      contentDigest: sha256(candidate.payload.content),
      executionManifestDigest: shadowExecutionManifestDigest(plan, task),
      normalizedFirstRequestDigest: sha256(`shadow-request:${task.taskId}`),
      outcome: outcomes[index]!,
      evidenceIds: [evidenceId],
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1_000, toolCalls: 2, elapsedMs: 500 },
    }
  })
}

describe('controlled Skill Shadow governance', () => {
  it('routes Shadow opening through the governed ledger', () => {
    const ledger = new EvolutionLedger(fixtureRoot('missing-evaluation'))

    expect(() => (ledger as unknown as {
      openControlledSkillShadow(input: unknown): unknown
    }).openControlledSkillShadow({
      evaluationId: 'evaluation:missing',
      tasks: [],
    })).toThrow(LedgerIntegrityError)
  })

  it('opens a derived isolated Shadow plan with five deterministic Candidate Runs', () => {
    const root = fixtureRoot('isolated-plan')
    const { ledger, plan: evaluation, result } = seedPassingEvaluation(root)
    const input = { evaluationId: evaluation.evaluationId, tasks: shadowTasks() }

    const receipt = (ledger as unknown as {
      openControlledSkillShadow(input: typeof input): { shadowId: string; duplicate: boolean }
      getControlledSkillShadow(shadowId: string): Record<string, unknown> | undefined
    }).openControlledSkillShadow(input)
    const shadow = (ledger as unknown as {
      getControlledSkillShadow(shadowId: string): Record<string, unknown> | undefined
    }).getControlledSkillShadow(receipt.shadowId)!

    expect(receipt).toEqual({ shadowId: receipt.shadowId, duplicate: false })
    expect(shadow).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-shadow-plan.v2',
      shadowId: receipt.shadowId,
      evaluationId: evaluation.evaluationId,
      evaluationPlanDigest: sha256(evaluation),
      evaluationResultDigest: sha256(result),
      candidateId: evaluation.candidateId,
      parentVersionId: evaluation.parentVersionId,
      parentPayloadDigest: evaluation.parentPayloadDigest,
      candidatePayloadDigest: evaluation.candidatePayloadDigest,
      sourceScopeKey: evaluation.scopeKey,
      mode: 'isolated-test',
      evidenceClaim: 'controlled-synthetic-mechanism',
      evidenceLabels: ['development-only', 'synthetic-defect'],
      naturalUserEvidence: 'not-claimed',
    })
    expect(String(shadow.scopeKey)).toMatch(/^scope:controlled-skill-isolated:sha256:[a-f0-9]{64}$/u)
    const tasks = shadow.tasks as Array<ReturnType<typeof shadowTasks>[number] & {
      runId: string
    }>
    expect(tasks).toHaveLength(5)
    expect(new Set(tasks.map(task => task.sessionId)).size).toBe(5)
    for (const task of tasks) {
      expect(task.runId).toBe(prepareRunBinding({
        goalRef: `goal:controlled-skill-shadow:${receipt.shadowId}`,
        taskRef: `task:${task.taskId}:candidate`,
        sessionId: task.sessionId,
        scopeKey: String(shadow.scopeKey),
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      }).runId)
    }
  })

  it('records a pass only after five qualified Candidate Shadow Runs', () => {
    const root = fixtureRoot('pass-result')
    const { ledger, plan: evaluation } = seedPassingEvaluation(root)
    const shadow = openShadow(ledger, evaluation.evaluationId)
    const runs = recordShadowRunFacts(ledger, shadow, taskTypes.map(() => 'met'))

    const receipt = (ledger as unknown as {
      recordControlledSkillShadowResult(input: unknown): {
        shadowId: string
        duplicate: boolean
      }
      getControlledSkillShadowResult(shadowId: string): Record<string, unknown> | undefined
    }).recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs })
    const result = (ledger as unknown as {
      getControlledSkillShadowResult(shadowId: string): Record<string, unknown> | undefined
    }).getControlledSkillShadowResult(shadow.shadowId)

    expect(receipt).toEqual({ shadowId: shadow.shadowId, duplicate: false })
    expect(result).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-shadow-result.v2',
      shadowId: shadow.shadowId,
      planDigest: sha256(shadow),
      evaluationId: evaluation.evaluationId,
      evaluationPlanDigest: shadow.evaluationPlanDigest,
      evaluationResultDigest: shadow.evaluationResultDigest,
      runs,
      mechanismVerdict: 'pass',
      reasonCode: 'all-shadow-runs-qualified',
      evidenceClaim: 'controlled-synthetic-mechanism',
      evidenceLabels: ['development-only', 'synthetic-defect'],
      naturalUserEvidence: 'not-claimed',
      promotionEligibility: 'eligible-for-isolated-test-promotion',
    })
  })

  it('derives project mode and freezes the Shadow-specific tool aggregate', () => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(
      fixtureRoot('project-plan'),
      'controlled-product',
    )

    const shadow = openShadow(ledger, evaluation.evaluationId)

    expect(shadow).toMatchObject({
      mode: 'project',
      sourceScopeKey: evaluation.scopeKey,
      scopeKey: evaluation.scopeKey,
      evidenceClaim: 'controlled-product',
      evidenceLabels: [],
      naturalUserEvidence: 'not-claimed',
    })
    expect(shadow.execution).toEqual({
      ...evaluation.execution,
      toolSchemaDigest: sha256(shadow.tasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
    })
    expect(shadow.execution.toolSchemaDigest).not.toBe(evaluation.execution.toolSchemaDigest)

    const runs = recordShadowRunFacts(ledger, shadow, taskTypes.map(() => 'met'))
    ledger.recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs })
    expect(ledger.getControlledSkillShadowResult(shadow.shadowId)).toMatchObject({
      mechanismVerdict: 'pass',
      promotionEligibility: 'eligible-for-project-promotion',
      evidenceClaim: 'controlled-product',
      evidenceLabels: [],
      naturalUserEvidence: 'not-claimed',
    })
  })

  it('rejects caller-authored identity and B/C task reuse without writing a Shadow event', () => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(fixtureRoot('plan-boundary'))
    const before = ledger.listEvents().length
    const input = { evaluationId: evaluation.evaluationId, tasks: shadowTasks() }

    expect(() => ledger.openControlledSkillShadow({
      ...input,
      mode: 'project',
    } as never)).toThrow(LedgerIntegrityError)
    expect(() => ledger.openControlledSkillShadow({
      evaluationId: evaluation.evaluationId,
      tasks: input.tasks.map((task, index) => index === 0
        ? { ...task, inputDigest: evaluation.tasks[0]!.inputDigest }
        : task),
    })).toThrow(LedgerIntegrityError)
    expect(ledger.listEvents()).toHaveLength(before)
  })

  it('rejects non-canonical task keys and model caps without writing a Shadow event', () => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(
      fixtureRoot('task-exact-keys'),
    )
    const tasks = shadowTasks()
    const before = ledger.listEvents().length

    expect(() => ledger.openControlledSkillShadow({
      evaluationId: evaluation.evaluationId,
      tasks: tasks.map((task, index) => index === 0
        ? { ...task, runId: 'run:caller-authored' }
        : task),
    } as never)).toThrow(LedgerIntegrityError)
    expect(() => ledger.openControlledSkillShadow({
      evaluationId: evaluation.evaluationId,
      tasks: tasks.map((task, index) => index === 0
        ? {
            ...task,
            stopContract: { ...task.stopContract, maxModelRequests: 1 },
          }
        : task),
    } as never)).toThrow(LedgerIntegrityError)
    expect(ledger.listEvents()).toHaveLength(before)
  })

  it('replays exact plans, rejects conflicts, clones reads, and keeps the event private', () => {
    const root = fixtureRoot('plan-replay')
    const { ledger, plan: evaluation } = seedPassingEvaluation(root)
    const input = { evaluationId: evaluation.evaluationId, tasks: shadowTasks() }
    const opened = ledger.openControlledSkillShadow(input)
    const plan = ledger.getControlledSkillShadow(opened.shadowId)!
    expect(plan.execution.dshVersion).toBe('0.1.1-rc.2')

    expect(ledger.openControlledSkillShadow(input)).toEqual({
      shadowId: opened.shadowId,
      duplicate: true,
    })
    expect(() => ledger.openControlledSkillShadow({
      ...input,
      tasks: input.tasks.map((task, index) => index === 0
        ? { ...task, goalDigest: sha256('conflicting-shadow-goal') }
        : task),
    })).toThrow(LedgerIntegrityError)
    ;(plan.tasks as Array<{ taskId: string }>)[0]!.taskId = 'shadow-task:mutated'
    expect(ledger.getControlledSkillShadow(opened.shadowId)!.tasks[0]!.taskId)
      .toBe('shadow-task:original-problem')

    const replay = new EvolutionLedger(root)
    expect(replay.getControlledSkillShadow(opened.shadowId))
      .toEqual(ledger.getControlledSkillShadow(opened.shadowId))
    const event = replay.listEvents().find(item => item.type === 'controlled-skill-shadow-opened')!
    expect(isPublicLedgerEvent(event)).toBe(false)
    const serializedShadowEvents = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(line => line.includes('controlled-skill-shadow-'))
      .join('\n')
    expect(serializedShadowEvents).not.toContain(parentSkill.content)
    expect(serializedShadowEvents)
      .not.toMatch(/prompt|credential|workspaceRoot|modelRequests/u)
  })

  it.each([
    ['not-met', 'rejected', 'candidate-shadow-not-met'],
    ['inconclusive', 'inconclusive', 'candidate-shadow-inconclusive'],
  ] as const)('records the first closed %s prefix as terminal', (
    outcome,
    mechanismVerdict,
    reasonCode,
  ) => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(
      fixtureRoot(`early-${outcome}`),
    )
    const shadow = openShadow(ledger, evaluation.evaluationId)
    const runs = recordShadowRunFacts(ledger, shadow, [outcome])

    ledger.recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs })

    expect(ledger.getControlledSkillShadowResult(shadow.shadowId)).toMatchObject({
      runs,
      mechanismVerdict,
      reasonCode,
      promotionEligibility: 'ineligible',
      naturalUserEvidence: 'not-claimed',
    })
  })

  it('refuses an all-met partial prefix and a row after terminal', () => {
    const partial = seedPassingEvaluation(fixtureRoot('partial-result'))
    const partialShadow = openShadow(partial.ledger, partial.plan.evaluationId)
    const partialRuns = recordShadowRunFacts(partial.ledger, partialShadow, ['met', 'met'])
    expect(() => partial.ledger.recordControlledSkillShadowResult({
      shadowId: partialShadow.shadowId,
      runs: partialRuns,
    })).toThrow(/incomplete/u)
    expect(partial.ledger.getControlledSkillShadowResult(partialShadow.shadowId))
      .toBeUndefined()

    const terminal = seedPassingEvaluation(fixtureRoot('terminal-suffix'))
    const terminalShadow = openShadow(terminal.ledger, terminal.plan.evaluationId)
    const terminalRuns = recordShadowRunFacts(
      terminal.ledger,
      terminalShadow,
      ['not-met', 'met'],
    )
    expect(() => terminal.ledger.recordControlledSkillShadowResult({
      shadowId: terminalShadow.shadowId,
      runs: terminalRuns,
    })).toThrow(/terminal run/u)
  })

  it('rejects a run row that disagrees with durable Candidate content', () => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(fixtureRoot('run-drift'))
    const shadow = openShadow(ledger, evaluation.evaluationId)
    const runs = recordShadowRunFacts(ledger, shadow, ['not-met'])

    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs: [{ ...runs[0]!, contentDigest: sha256('parent-content') }],
    })).toThrow(/Run facts/u)
    expect(ledger.getControlledSkillShadowResult(shadow.shadowId)).toBeUndefined()
  })

  it('rejects caller verdicts, unauthorized tools, and tool/time overruns', () => {
    const { ledger, plan: evaluation } = seedPassingEvaluation(
      fixtureRoot('result-boundary'),
    )
    const shadow = openShadow(ledger, evaluation.evaluationId)
    const runs = recordShadowRunFacts(ledger, shadow, ['not-met'])
    const before = ledger.listEvents().length

    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs,
      verdict: 'pass',
    } as never)).toThrow(LedgerIntegrityError)
    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs: [{ ...runs[0]!, usedToolNames: ['shell', ...runs[0]!.usedToolNames] }],
    })).toThrow(/violates its plan/u)
    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs: [{
        ...runs[0]!,
        usage: { ...runs[0]!.usage, toolCalls: 5 },
      }],
    })).toThrow(/violates its plan/u)
    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs: [{
        ...runs[0]!,
        usage: { ...runs[0]!.usage, elapsedMs: 10_001 },
      }],
    })).toThrow(/violates its plan/u)
    expect(ledger.listEvents()).toHaveLength(before)
  })

  it('replays and clones a terminal result with exact duplicate-first semantics', () => {
    const root = fixtureRoot('result-replay')
    const { ledger, plan: evaluation } = seedPassingEvaluation(root)
    const shadow = openShadow(ledger, evaluation.evaluationId)
    const runs = recordShadowRunFacts(ledger, shadow, ['inconclusive'])
    ledger.recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs })

    expect(ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs,
    })).toEqual({ shadowId: shadow.shadowId, duplicate: true })
    expect(() => ledger.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs: [{
        ...runs[0]!,
        normalizedFirstRequestDigest: sha256('conflicting-request'),
      }],
    })).toThrow(LedgerIntegrityError)
    const result = ledger.getControlledSkillShadowResult(shadow.shadowId)!
    ;(result.runs as Array<{ taskId: string }>)[0]!.taskId = 'shadow-task:mutated'
    const replay = new EvolutionLedger(root)
    expect(replay.getControlledSkillShadowResult(shadow.shadowId))
      .toEqual(ledger.getControlledSkillShadowResult(shadow.shadowId))
    expect(replay.listControlledSkillShadowResults()).toHaveLength(1)
    expect(isPublicLedgerEvent(replay.listEvents().find(item =>
      item.type === 'controlled-skill-shadow-result-recorded')!)).toBe(false)
    const serializedShadowEvents = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(line => line.includes('controlled-skill-shadow-'))
      .join('\n')
    expect(serializedShadowEvents).not.toContain(parentSkill.content)
    expect(serializedShadowEvents).not.toMatch(/prompt|credential|workspaceRoot/u)
  })

  it('exposes the six controlled Shadow methods through the product service facade', async () => {
    const evolution = await import('../../packages/tianwen-evolution/src/index.js') as {
      prepareControlledSkillShadowPlan?: unknown
      prepareControlledSkillShadowResult?: unknown
    }
    const facade = TianwenEvolutionService.prototype as unknown as Record<string, unknown>

    expect(evolution.prepareControlledSkillShadowPlan).toBeTypeOf('function')
    expect(evolution.prepareControlledSkillShadowResult).toBeTypeOf('function')
    for (const method of [
      'openControlledSkillShadow',
      'getControlledSkillShadow',
      'listControlledSkillShadows',
      'recordControlledSkillShadowResult',
      'getControlledSkillShadowResult',
      'listControlledSkillShadowResults',
    ]) expect(facade[method]).toBeTypeOf('function')
  })
})
