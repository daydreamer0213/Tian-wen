import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  LearningTicket,
  OutcomeLearningSignal,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  prepareControlledSkillEvaluationPlan,
  prepareControlledSkillEvalProtocol,
  prepareRunBinding,
  TianwenEvolutionService,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  EvolutionLedger,
  isPublicLedgerEvent,
  LedgerIntegrityError,
} from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const parent = {
  name: 'controlled-research-summary',
  description: 'Summarize one controlled research observation.',
  whenToUse: 'When a controlled task asks for a concise research summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled research summary\n\nState the observation.',
} as const

const taskTypes = [
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const

const roots: string[] = []

const controlledObjectiveServiceFacade: Pick<
  EvolutionLedger,
  | 'recordControlledSkillEvaluationObjective'
  | 'getControlledSkillEvaluationObjective'
  | 'listControlledSkillEvaluationObjectives'
> = TianwenEvolutionService.prototype

function fixtureRoot(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? tmpdir(),
    'controlled-skill-evaluation-ledgers',
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

function digest(value: string) {
  return sha256(value)
}

function ticketFacts(scopeKey = 'project:tianwen/capability:research-summary') {
  const signals = ['first', 'second'].map((suffix): OutcomeLearningSignal => ({
    signalId: `signal:${suffix}`,
    ingestionId: digest(`ingestion:${suffix}`),
    runId: `run:${digest(`run:${suffix}`).slice('sha256:'.length)}`,
    sessionId: `session:${suffix}`,
    scopeKey,
    problemFingerprint: digest('shared-problem'),
    problemCategory: 'summary-omits-required-result',
    failureSignature: digest(`failure:${suffix}`),
    severity: 2,
    blocksGoal: false,
    sessionDigest: digest(`session:${suffix}`),
    evidenceIds: [digest(`evidence:${suffix}`)],
  }))
  const ticket: LearningTicket = {
    ticketId: 'ticket:controlled-evaluation',
    problemFingerprint: digest('shared-problem'),
    status: 'open',
    signalIds: signals.map(signal => signal.signalId),
  }
  return { ticket, signals }
}

function controlledProtocol() {
  return {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: taskTypes.map((taskType, index) => ({
      taskId: `eval-task:${taskType}`,
      taskType,
      goalDigest: digest(`goal:${index}`),
      inputDigest: digest(`input:${index}`),
      workspaceSnapshotDigest: digest(`workspace:${index}`),
      toolSchemaDigest: digest(`tools:${index}`),
      authorizationDigest: digest(`authorization:${index}`),
      verifierContractDigest: digest(`verifier:${index}`),
      stopConditionDigest: digest(`stop:${index}`),
      evaluatorMaterialContractDigest: digest(`evaluator-material:${index}`),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: digest(`subject:${index}`),
      allowedTools: ['skill', 'verify_summary'],
      stopContract: {
        maxToolCalls: 4,
        maxElapsedMs: 10_000,
      },
    })),
    execution: {
      dshVersion: '0.1.0-rc.7',
      providerId: 'tianwen-v0.1-eval-scripted',
      modelId: 'scripted',
      callConfigDigest: digest('call-config'),
      toolSchemaDigest: digest('visible-tools'),
      retryPolicyDigest: digest('no-retry'),
    },
  } as const
}

function seedOpenTicket(ledger: EvolutionLedger) {
  const receipts = ['first', 'second'].map((suffix, index) => {
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:controlled-evaluation-seed',
      taskRef: `task:controlled-evaluation-${suffix}`,
      sessionId: `session:controlled-evaluation-${suffix}`,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: acceptance,
    })
    return ledger.recordOutcomeIntake({
      runId: binding.runId,
      verdict: 'not-met',
      sessionDigest: digest(`seed-session:${index}`),
      evidenceIds: [digest(`seed-evidence:${index}`)],
    })
  })
  return receipts[1]!.ticketId!
}

function seedCandidateWithControlledProtocol(ledger: EvolutionLedger) {
  const seeded = [
    ['candidate-first', 'not-met', 'a'],
    ['candidate-second', 'not-met', 'b'],
    ['candidate-counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, character]) => {
    const sessionId = `session:${suffix}`
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:controlled-evaluation-seed',
      taskRef: `task:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: acceptance,
    })
    const manifest = ledger.recordRunSkillManifest({ runId: binding.runId, skill: parent })
    const sessionDigest = digest(`candidate-session:${character}`)
    const evidenceId = digest(`candidate-evidence:${character}`)
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
      skillName: parent.name,
      contentDigest: digest(parent.content),
      skillEvidenceId: digest(`candidate-skill-evidence:${character}`),
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
    evidencePurpose: 'development-only-synthetic-defect',
    protocol: controlledProtocol(),
  })
  const opened = ledger.openLearningCase({
    ticketId,
    counterevidenceRunIds: [runs[2]!.binding.runId],
  })
  const learningCase = ledger.getLearningCase(opened.caseId)!
  const attribution = ledger.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parent.name,
    hypothesis: 'The synthetic parent omits result-first ordering.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    alternatives: 'Runtime and verifier causes remain unsupported in the fixture.',
  })
  const lesson = ledger.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: 'State the verified result before interpretation.',
    when: 'When summarizing a verified research observation.',
    notWhen: 'When the task requests raw extraction only.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    targetScope: learningCase.scopeKey,
  })
  const candidate = ledger.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: parent.name,
      description: 'Summarize one verified controlled observation.',
      whenToUse: parent.whenToUse,
      invocation: parent.invocation,
      source: parent.source,
      content: '# Controlled research summary\n\nState the verified result before interpretation.',
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  return {
    candidateId: candidate.candidateId,
    protocolId: protocol.protocolId,
  }
}

function controlledSessionAllocations() {
  return controlledProtocol().tasks.map(task => ({
    taskId: task.taskId,
    baselineSessionId: `session:controlled-eval:${task.taskType}:baseline`,
    candidateSessionId: `session:controlled-eval:${task.taskType}:candidate`,
    evaluatorSessionId: `session:controlled-eval:${task.taskType}:evaluator`,
  }))
}

function recordControlledTaskFacts(
  ledger: EvolutionLedger,
  plan: NonNullable<ReturnType<EvolutionLedger['getControlledSkillEvaluation']>>,
  taskIndex: number,
  outcomes: {
    readonly baseline: 'met' | 'not-met' | 'inconclusive'
    readonly candidate: 'met' | 'not-met' | 'inconclusive'
  },
  options: {
    readonly skipUseRole?: 'baseline' | 'candidate'
  } = {},
) {
  const task = plan.tasks[taskIndex]!
  const candidate = ledger.getSkillCandidate(plan.candidateId)!
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
  const normalizedFirstRequestDigest = digest(`objective:${task.taskId}:request`)
  const arms = ([task.baseline, task.candidate] as const).map(arm => {
    const binding = ledger.recordRunBinding({
      goalRef: `goal:controlled-skill-evaluation:${plan.protocolId}`,
      taskRef: `task:${task.taskId}:${arm.role}`,
      sessionId: arm.sessionId,
      scopeKey: plan.scopeKey,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    })
    expect(binding.runId).toBe(arm.runId)
    const skill = arm.role === 'baseline'
      ? parent
      : { ...candidate.payload, provider: 'runtime' }
    const manifest = ledger.recordRunSkillManifest({ runId: arm.runId, skill })
    const outcome = outcomes[arm.role]
    const sessionDigest = digest(`objective:${task.taskId}:${arm.role}:session`)
    const evidenceId = digest(`objective:${task.taskId}:${arm.role}:evidence`)
    ledger.recordOutcomeIntake({
      runId: arm.runId,
      verdict: outcome,
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    if (options.skipUseRole !== arm.role) {
      ledger.recordRunSkillUse({
        runId: arm.runId,
        parentVersionId: manifest.parentVersionId,
        sessionId: arm.sessionId,
        sessionDigest,
        skillName: parent.name,
        contentDigest: digest(skill.content),
        skillEvidenceId: digest(`objective:${task.taskId}:${arm.role}:skill-evidence`),
        acceptanceEvidenceId: evidenceId,
        skillCallSeq: 10,
        skillResultSeq: 11,
        acceptanceCallSeq: 12,
      })
    }
    return {
      role: arm.role,
      runId: arm.runId,
      sessionId: arm.sessionId,
      skillVersionId: manifest.parentVersionId,
      contentDigest: digest(skill.content),
      executionManifestDigest,
      normalizedFirstRequestDigest,
      outcome,
      evidenceIds: [evidenceId],
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      evaluatorMaterialDigest: digest(`objective:${task.taskId}:${arm.role}:material`),
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
    }
  })
  return {
    evaluationId: plan.evaluationId,
    taskId: task.taskId,
    baseline: arms[0]!,
    candidate: arms[1]!,
  }
}

function openControlledObjectiveLedger(prefix: string) {
  const ledger = new EvolutionLedger(fixtureRoot(prefix), {
    clock: () => '2026-08-22T16:20:00.000Z',
  })
  const seeded = seedCandidateWithControlledProtocol(ledger)
  const receipt = ledger.openControlledSkillEvaluation({
    candidateId: seeded.candidateId,
    protocolId: seeded.protocolId,
    sessionAllocations: controlledSessionAllocations(),
  })
  return {
    ledger,
    plan: ledger.getControlledSkillEvaluation(receipt.evaluationId)!,
  }
}

describe('controlled five-task Skill evaluation protocol', () => {
  it('exposes controlled objective operations through the product service', () => {
    expect(typeof controlledObjectiveServiceFacade.recordControlledSkillEvaluationObjective)
      .toBe('function')
    expect(typeof controlledObjectiveServiceFacade.getControlledSkillEvaluationObjective)
      .toBe('function')
    expect(typeof controlledObjectiveServiceFacade.listControlledSkillEvaluationObjectives)
      .toBe('function')
  })

  it('derives one deterministic development-only protocol with permanent evidence labels', () => {
    const { ticket, signals } = ticketFacts()
    const input = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'development-only-synthetic-defect',
      protocol: controlledProtocol(),
    } as const

    const first = prepareControlledSkillEvalProtocol(input, ticket, signals, 'pre-candidate')
    const replay = prepareControlledSkillEvalProtocol(
      structuredClone(input),
      structuredClone(ticket),
      structuredClone(signals),
      'pre-candidate',
    )

    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-eval-protocol.v2',
      ticketId: ticket.ticketId,
      scopeKey: 'project:tianwen/capability:research-summary',
      provenance: 'pre-candidate',
      evidencePurpose: 'development-only-synthetic-defect',
      evidenceLabels: ['development-only', 'synthetic-defect'],
    })
    expect(first.protocolId).toMatch(/^eval-protocol:[a-f0-9]{64}$/u)
    expect(first.protocol.tasks.map(task => task.taskType)).toEqual(taskTypes)
  })

  it('keeps controlled product evidence unlabeled instead of inheriting synthetic proof', () => {
    const { ticket, signals } = ticketFacts()
    const prepared = prepareControlledSkillEvalProtocol({
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    }, ticket, signals, 'pre-candidate')

    expect(prepared.evidencePurpose).toBe('controlled-product')
    expect(prepared.evidenceLabels).toEqual([])
  })

  it('rejects a changed rubric, incomplete matrix, extra raw prompt, or mismatched Ticket scope', () => {
    const { ticket, signals } = ticketFacts()
    const valid = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    } as const
    const changedRubric = structuredClone(valid)
    changedRubric.protocol.rubricDigest = digest('caller-rubric')
    const incomplete = structuredClone(valid)
    incomplete.protocol.tasks.pop()
    const rawPrompt = structuredClone(valid) as unknown as Record<string, unknown>
    ;(rawPrompt.protocol as { tasks: Array<Record<string, unknown>> }).tasks[0]!.prompt = 'private task text'

    expect(() => prepareControlledSkillEvalProtocol(changedRubric, ticket, signals, 'pre-candidate'))
      .toThrow(/rubric/i)
    expect(() => prepareControlledSkillEvalProtocol(incomplete, ticket, signals, 'pre-candidate'))
      .toThrow(/five tasks/i)
    expect(() => prepareControlledSkillEvalProtocol(rawPrompt as never, ticket, signals, 'pre-candidate'))
      .toThrow(/unexpected field/i)
    expect(() => prepareControlledSkillEvalProtocol(valid, ticket, [
      signals[0]!,
      { ...signals[1]!, scopeKey: 'project:another-scope' },
    ], 'pre-candidate')).toThrow(/scope/i)
  })

  it('rejects duplicate tools, unsafe execution identifiers, and invalid stop contracts', () => {
    const { ticket, signals } = ticketFacts()
    const base = {
      ticketId: ticket.ticketId,
      evidencePurpose: 'controlled-product',
      protocol: controlledProtocol(),
    } as const
    const duplicateTools = structuredClone(base)
    duplicateTools.protocol.tasks[0]!.allowedTools = ['skill', 'skill']
    const unsafeProvider = structuredClone(base)
    unsafeProvider.protocol.execution.providerId = 'https://provider.invalid?token=secret'
    const unbounded = structuredClone(base)
    unbounded.protocol.tasks[0]!.stopContract.maxToolCalls = 10_000
    const legacyLimits = structuredClone(base) as unknown as {
      protocol: { tasks: Array<Record<string, unknown>> }
    }
    const legacyTask = legacyLimits.protocol.tasks[0]!
    legacyTask.limits = {
      maxModelRequests: 3,
      maxToolCalls: 4,
      maxElapsedMs: 10_000,
    }
    delete legacyTask.stopContract
    const modelRequestLimit = structuredClone(base) as unknown as {
      protocol: { tasks: Array<{ stopContract: Record<string, unknown> }> }
    }
    modelRequestLimit.protocol.tasks[0]!.stopContract.maxModelRequests = 3

    expect(() => prepareControlledSkillEvalProtocol(duplicateTools, ticket, signals, 'pre-candidate'))
      .toThrow(/allowed tools/i)
    expect(() => prepareControlledSkillEvalProtocol(unsafeProvider, ticket, signals, 'pre-candidate'))
      .toThrow(/providerId/i)
    expect(() => prepareControlledSkillEvalProtocol(unbounded, ticket, signals, 'pre-candidate'))
      .toThrow(/maxToolCalls/i)
    expect(() => prepareControlledSkillEvalProtocol(legacyLimits as never, ticket, signals, 'pre-candidate'))
      .toThrow(/unexpected field: limits/i)
    expect(() => prepareControlledSkillEvalProtocol(modelRequestLimit as never, ticket, signals, 'pre-candidate'))
      .toThrow(/unexpected field: maxModelRequests/i)
  })

  it('persists, replays, and keeps the v2 protocol out of public ledger events', () => {
    const path = fixtureRoot('protocol')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:00:00.000Z' })
    const ticketId = seedOpenTicket(ledger)
    const input = {
      ticketId,
      evidencePurpose: 'development-only-synthetic-defect',
      protocol: controlledProtocol(),
    } as const

    const first = ledger.freezeControlledSkillEvalProtocol(input)
    const duplicate = ledger.freezeControlledSkillEvalProtocol(structuredClone(input))
    const stored = ledger.getControlledSkillEvalProtocol(first.protocolId)

    expect(first).toMatchObject({ duplicate: false, provenance: 'pre-candidate' })
    expect(duplicate).toEqual({ ...first, duplicate: true })
    expect(stored?.evidenceLabels).toEqual(['development-only', 'synthetic-defect'])
    expect(ledger.listEvents().filter(isPublicLedgerEvent)).toEqual([])

    const lines = readFileSync(join(path, 'ledger.jsonl'), 'utf8').trimEnd().split('\n')
    expect(lines.some(line => line.includes('controlled-skill-eval-protocol-frozen'))).toBe(true)

    const replay = new EvolutionLedger(path)
    expect(replay.getControlledSkillEvalProtocol(first.protocolId)).toEqual(stored)
    expect(replay.listControlledSkillEvalProtocols()).toEqual([stored])
    expect(replay.listEvents().filter(isPublicLedgerEvent)).toEqual([])
  })

  it('replays retrospective protocols but refuses to open them as formal evaluations', () => {
    const path = fixtureRoot('retrospective-protocol')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:05:00.000Z' })
    const seeded = seedCandidateWithControlledProtocol(ledger)
    const protocol = structuredClone(controlledProtocol())
    protocol.tasks[0]!.inputDigest = digest('retrospective-input')
    const retrospective = ledger.freezeControlledSkillEvalProtocol({
      ticketId: ledger.getSkillCandidate(seeded.candidateId)!.ticketId,
      evidencePurpose: 'development-only-synthetic-defect',
      protocol,
    })
    const stored = ledger.getControlledSkillEvalProtocol(retrospective.protocolId)

    expect(retrospective.provenance).toBe('retrospective')
    expect(new EvolutionLedger(path).getControlledSkillEvalProtocol(retrospective.protocolId))
      .toEqual(stored)
    expect(() => {
      ledger.openControlledSkillEvaluation({
        candidateId: seeded.candidateId,
        protocolId: retrospective.protocolId,
        sessionAllocations: controlledSessionAllocations(),
      })
    }).toThrow(LedgerIntegrityError)
    expect(ledger.listEvents().filter(event =>
      event.type === 'controlled-skill-evaluation-opened')).toEqual([])
  })

  it('opens one immutable five-task plan with ten execution and five evaluator Sessions', () => {
    const path = fixtureRoot('plan')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:10:00.000Z' })
    const seeded = seedCandidateWithControlledProtocol(ledger)
    const input = {
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      sessionAllocations: controlledSessionAllocations(),
    } as const

    const first = ledger.openControlledSkillEvaluation(input)
    const duplicate = ledger.openControlledSkillEvaluation(structuredClone(input))
    const plan = ledger.getControlledSkillEvaluation(first.evaluationId)

    expect(first).toEqual({ evaluationId: plan?.evaluationId, duplicate: false })
    expect(duplicate).toEqual({ ...first, duplicate: true })
    expect(plan).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-evaluation-plan.v2',
      evidencePurpose: 'development-only-synthetic-defect',
      evidenceLabels: ['development-only', 'synthetic-defect'],
      protocolProvenance: 'pre-candidate',
    })
    expect(plan?.tasks).toHaveLength(5)
    expect(new Set(plan?.tasks.flatMap(task => [
      task.baseline.sessionId,
      task.candidate.sessionId,
      task.evaluatorSessionId,
    ])).size).toBe(15)
    expect(new Set(plan?.tasks.flatMap(task => [
      task.baseline.runId,
      task.candidate.runId,
    ])).size).toBe(10)
    expect(plan?.tasks.flatMap(task => [
      task.baseline.runId,
      task.candidate.runId,
    ])).toEqual(plan?.tasks.flatMap(task => [
      prepareRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${seeded.protocolId}`,
        taskRef: `task:${task.taskId}:baseline`,
        sessionId: task.baseline.sessionId,
        scopeKey: 'project:tianwen/capability:research-summary',
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      }).runId,
      prepareRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${seeded.protocolId}`,
        taskRef: `task:${task.taskId}:candidate`,
        sessionId: task.candidate.sessionId,
        scopeKey: 'project:tianwen/capability:research-summary',
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      }).runId,
    ]))

    const exposed = plan as unknown as {
      tasks: Array<{ baseline: { sessionId: string } }>
    }
    exposed.tasks[0]!.baseline.sessionId = 'session:mutated-clone'
    expect(ledger.getControlledSkillEvaluation(first.evaluationId)?.tasks[0]?.baseline.sessionId)
      .toBe(input.sessionAllocations[0]!.baselineSessionId)

    const replay = new EvolutionLedger(path)
    expect(replay.getControlledSkillEvaluation(first.evaluationId))
      .toEqual(ledger.getControlledSkillEvaluation(first.evaluationId))
    expect(replay.listEvents().filter(isPublicLedgerEvent)).toEqual([])
  })

  it('changes only the affected Run identity when one Session or acceptance subject changes', () => {
    const path = fixtureRoot('plan-identities')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:15:00.000Z' })
    const seeded = seedCandidateWithControlledProtocol(ledger)
    const input = {
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      sessionAllocations: controlledSessionAllocations(),
    } as const
    const firstReceipt = ledger.openControlledSkillEvaluation(input)
    const first = ledger.getControlledSkillEvaluation(firstReceipt.evaluationId)!

    const changedSession = structuredClone(input)
    changedSession.sessionAllocations[0]!.baselineSessionId += ':changed'
    const changedReceipt = ledger.openControlledSkillEvaluation(changedSession)
    const changed = ledger.getControlledSkillEvaluation(changedReceipt.evaluationId)!
    const runIds = (plan: typeof first) => plan.tasks.flatMap(task => [
      task.baseline.runId,
      task.candidate.runId,
    ])

    expect(runIds(changed)[0]).not.toBe(runIds(first)[0])
    expect(runIds(changed).slice(1)).toEqual(runIds(first).slice(1))

    const candidate = ledger.getSkillCandidate(seeded.candidateId)!
    const learningCase = ledger.getLearningCase(candidate.caseId)!
    const protocol = ledger.getControlledSkillEvalProtocol(seeded.protocolId)!
    const changedProtocol = structuredClone(protocol)
    ;(changedProtocol.protocol.tasks[0] as { acceptanceSubjectDigest: string })
      .acceptanceSubjectDigest = digest('changed-subject')
    const changedSubject = prepareControlledSkillEvaluationPlan(
      input,
      candidate,
      learningCase,
      changedProtocol,
      sha256(parent),
    )

    expect(runIds(changedSubject).slice(0, 2)).not.toEqual(runIds(first).slice(0, 2))
    expect(runIds(changedSubject).slice(2)).toEqual(runIds(first).slice(2))
    expect(() => prepareControlledSkillEvaluationPlan(
      input,
      candidate,
      learningCase,
      { ...protocol, scopeKey: 'project:another-scope' },
      sha256(parent),
    )).toThrow(/chain/i)
  })

  it('rejects caller-authored Run identity and the legacy arm input', () => {
    const path = fixtureRoot('plan-input')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:16:00.000Z' })
    const seeded = seedCandidateWithControlledProtocol(ledger)
    const input = {
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      sessionAllocations: controlledSessionAllocations(),
    }
    const callerRun = structuredClone(input) as unknown as {
      sessionAllocations: Array<Record<string, unknown>>
    }
    callerRun.sessionAllocations[0]!.runId = `run:${'a'.repeat(64)}`
    const legacyArms = {
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      arms: controlledSessionAllocations().map(row => ({
        taskId: row.taskId,
        baseline: { runId: `run:${'a'.repeat(64)}`, sessionId: row.baselineSessionId },
        candidate: { runId: `run:${'b'.repeat(64)}`, sessionId: row.candidateSessionId },
        evaluatorSessionId: row.evaluatorSessionId,
      })),
    }
    const candidate = ledger.getSkillCandidate(seeded.candidateId)!
    const learningCase = ledger.getLearningCase(candidate.caseId)!
    const protocol = ledger.getControlledSkillEvalProtocol(seeded.protocolId)!
    const prepare = (value: unknown) => prepareControlledSkillEvaluationPlan(
      value as never,
      candidate,
      learningCase,
      protocol,
      sha256(parent),
    )

    expect(() => prepare(callerRun))
      .toThrow(/unexpected field: runId/i)
    expect(() => prepare(legacyArms))
      .toThrow(/unexpected field: arms/i)
  })

  it('records and replays one objective task pair with an idempotent receipt', () => {
    const path = fixtureRoot('objective')
    const ledger = new EvolutionLedger(path, { clock: () => '2026-08-22T16:20:00.000Z' })
    const seeded = seedCandidateWithControlledProtocol(ledger)
    const opened = ledger.openControlledSkillEvaluation({
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      sessionAllocations: controlledSessionAllocations(),
    })
    const plan = ledger.getControlledSkillEvaluation(opened.evaluationId)!
    const input = recordControlledTaskFacts(ledger, plan, 0, {
      baseline: 'not-met',
      candidate: 'met',
    })

    const first = ledger.recordControlledSkillEvaluationObjective(input)
    const duplicate = ledger.recordControlledSkillEvaluationObjective(structuredClone(input))
    const stored = ledger.getControlledSkillEvaluationObjective(
      plan.evaluationId,
      plan.tasks[0]!.taskId,
    )

    expect(first).toEqual({
      evaluationId: plan.evaluationId,
      taskId: plan.tasks[0]!.taskId,
      duplicate: false,
    })
    expect(duplicate).toEqual({ ...first, duplicate: true })
    expect(stored).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-evaluation-objective.v2',
      comparison: 'candidate-better',
      candidateHardGate: 'pass',
      objectiveVerdict: 'pass',
    })
    expect(ledger.listControlledSkillEvaluationObjectives(plan.evaluationId)).toEqual([stored])
    const exposed = ledger.getControlledSkillEvaluationObjective(
      plan.evaluationId,
      plan.tasks[0]!.taskId,
    )!
    const mutableTools = exposed.baseline.usedToolNames as string[]
    mutableTools.push('mutated-clone')
    expect(ledger.getControlledSkillEvaluationObjective(
      plan.evaluationId,
      plan.tasks[0]!.taskId,
    )).toEqual(stored)
    expect(ledger.listEvents().filter(event =>
      event.type === 'controlled-skill-evaluation-objective-recorded')).toHaveLength(1)
    expect(ledger.listEvents().filter(isPublicLedgerEvent)).toEqual([])

    const replay = new EvolutionLedger(path)
    expect(replay.getControlledSkillEvaluationObjective(
      plan.evaluationId,
      plan.tasks[0]!.taskId,
    )).toEqual(stored)
    expect(replay.recordControlledSkillEvaluationObjective(input).duplicate).toBe(true)
    expect(replay.listEvents().filter(isPublicLedgerEvent)).toEqual([])
  })

  it('enforces protocol order, conflicting duplicates, and terminal objective stop', () => {
    const { ledger, plan } = openControlledObjectiveLedger('objective-order')
    const second = recordControlledTaskFacts(ledger, plan, 1, {
      baseline: 'not-met',
      candidate: 'met',
    })
    expect(() => ledger.recordControlledSkillEvaluationObjective(second))
      .toThrow(/protocol task order/i)

    const first = recordControlledTaskFacts(ledger, plan, 0, {
      baseline: 'met',
      candidate: 'not-met',
    })
    expect(ledger.recordControlledSkillEvaluationObjective(first).duplicate).toBe(false)
    expect(ledger.getControlledSkillEvaluationObjective(plan.evaluationId, first.taskId))
      .toMatchObject({
        comparison: 'baseline-better',
        candidateHardGate: 'rejected',
        objectiveVerdict: 'rejected',
      })
    expect(ledger.recordControlledSkillEvaluationObjective(structuredClone(first)).duplicate)
      .toBe(true)
    expect(() => ledger.recordControlledSkillEvaluationObjective({
      ...first,
      candidate: {
        ...first.candidate,
        evaluatorMaterialDigest: digest('conflicting-evaluator-material'),
      },
    })).toThrow(/objective changed/i)
    expect(() => ledger.recordControlledSkillEvaluationObjective(second))
      .toThrow(/protocol task order/i)
    expect(ledger.listControlledSkillEvaluationObjectives(plan.evaluationId)).toHaveLength(1)
  })

  it('reduces tie and inconclusive objective outcomes without continuing after terminal', () => {
    const firstRun = openControlledObjectiveLedger('objective-reducers')
    const tie = recordControlledTaskFacts(firstRun.ledger, firstRun.plan, 0, {
      baseline: 'met',
      candidate: 'met',
    })
    firstRun.ledger.recordControlledSkillEvaluationObjective(tie)
    expect(firstRun.ledger.getControlledSkillEvaluationObjective(
      firstRun.plan.evaluationId,
      tie.taskId,
    )).toMatchObject({
      comparison: 'tie',
      candidateHardGate: 'pass',
      objectiveVerdict: 'pass',
    })
    const inconclusiveBaseline = recordControlledTaskFacts(
      firstRun.ledger,
      firstRun.plan,
      1,
      { baseline: 'inconclusive', candidate: 'met' },
    )
    firstRun.ledger.recordControlledSkillEvaluationObjective(inconclusiveBaseline)
    expect(firstRun.ledger.getControlledSkillEvaluationObjective(
      firstRun.plan.evaluationId,
      inconclusiveBaseline.taskId,
    )).toMatchObject({
      comparison: 'not-comparable',
      candidateHardGate: 'pass',
      objectiveVerdict: 'inconclusive',
    })
    const afterInconclusive = recordControlledTaskFacts(
      firstRun.ledger,
      firstRun.plan,
      2,
      { baseline: 'not-met', candidate: 'met' },
    )
    expect(() => firstRun.ledger.recordControlledSkillEvaluationObjective(afterInconclusive))
      .toThrow(/protocol task order/i)

    const secondRun = openControlledObjectiveLedger('objective-candidate-inconclusive')
    const inconclusiveCandidate = recordControlledTaskFacts(
      secondRun.ledger,
      secondRun.plan,
      0,
      { baseline: 'met', candidate: 'inconclusive' },
    )
    secondRun.ledger.recordControlledSkillEvaluationObjective(inconclusiveCandidate)
    expect(secondRun.ledger.getControlledSkillEvaluationObjective(
      secondRun.plan.evaluationId,
      inconclusiveCandidate.taskId,
    )).toMatchObject({
      comparison: 'not-comparable',
      candidateHardGate: 'inconclusive',
      objectiveVerdict: 'inconclusive',
    })

    const thirdRun = openControlledObjectiveLedger('objective-rejected-priority')
    const rejectedPriority = recordControlledTaskFacts(
      thirdRun.ledger,
      thirdRun.plan,
      0,
      { baseline: 'inconclusive', candidate: 'not-met' },
    )
    thirdRun.ledger.recordControlledSkillEvaluationObjective(rejectedPriority)
    expect(thirdRun.ledger.getControlledSkillEvaluationObjective(
      thirdRun.plan.evaluationId,
      rejectedPriority.taskId,
    )).toMatchObject({
      comparison: 'not-comparable',
      candidateHardGate: 'rejected',
      objectiveVerdict: 'rejected',
    })
  })

  it('rejects invalid objective facts but does not cap model requests', () => {
    const { ledger, plan } = openControlledObjectiveLedger('objective-contract')
    const valid = recordControlledTaskFacts(ledger, plan, 0, {
      baseline: 'not-met',
      candidate: 'met',
    })
    const invalidInputs = [
      {
        ...valid,
        baseline: { ...valid.baseline, runId: valid.candidate.runId },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          acceptanceSubjectDigest: digest('wrong-subject'),
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          skillVersionId: valid.candidate.skillVersionId,
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          evidenceIds: [digest('wrong-evidence')],
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          usedToolNames: ['not_allowed', 'skill', 'verify_summary'],
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          usedToolNames: ['verify_summary', 'skill'],
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          usage: { ...valid.baseline.usage, toolCalls: 5 },
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          usage: { ...valid.baseline.usage, elapsedMs: 10_001 },
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          usage: { ...valid.baseline.usage, modelRequests: -1 },
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          normalizedFirstRequestDigest: digest('asymmetric-request'),
        },
      },
      {
        ...valid,
        baseline: {
          ...valid.baseline,
          executionManifestDigest: digest('wrong-execution-manifest'),
        },
      },
      {
        ...valid,
        baseline: Object.assign({}, valid.baseline, { maxModelRequests: 1 }),
      },
      Object.assign({}, valid, { aggregate: true }),
    ]
    for (const input of invalidInputs) {
      expect(() => ledger.recordControlledSkillEvaluationObjective(input)).toThrow()
    }
    expect(ledger.listControlledSkillEvaluationObjectives(plan.evaluationId)).toEqual([])

    const unboundedModelUsage = {
      ...valid,
      baseline: {
        ...valid.baseline,
        usage: {
          ...valid.baseline.usage,
          modelRequests: Number.MAX_SAFE_INTEGER,
        },
      },
    }
    expect(ledger.recordControlledSkillEvaluationObjective(unboundedModelUsage).duplicate)
      .toBe(false)

    const missingUse = openControlledObjectiveLedger('objective-missing-use')
    const missingUseInput = recordControlledTaskFacts(
      missingUse.ledger,
      missingUse.plan,
      0,
      { baseline: 'not-met', candidate: 'met' },
      { skipUseRole: 'baseline' },
    )
    expect(() => missingUse.ledger.recordControlledSkillEvaluationObjective(missingUseInput))
      .toThrow(/Run facts/i)
  })

})
