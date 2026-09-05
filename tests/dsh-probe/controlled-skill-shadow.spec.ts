import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  learningSessionLifecycleFingerprint,
  prepareControlledSkillEvaluationBlindMap,
  prepareControlledSkillEvaluationObjective,
  prepareControlledSkillEvaluationPlan,
  prepareControlledSkillEvaluationResult,
  prepareControlledSkillEvalProtocol,
  prepareControlledSkillEvaluatorObservation,
  prepareControlledSkillPromotionRecommendation,
  prepareRunBinding,
  sha256,
  TianwenEvolutionService,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  ControlledSkillShadowPlan,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  prepareControlledSkillShadowPlan,
  prepareControlledSkillShadowResult,
  prepareControlledSkillShadowReviewObservation,
} from '../../packages/tianwen-evolution/src/controlled-skill-shadow.js'
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

function lifecycleFingerprint(sessionId: string) {
  return learningSessionLifecycleFingerprint({
    sessionId,
    createdAt: 1,
    cwd: 'D:/controlled-shadow-fixture',
  })
}

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
        sessionLifecycleFingerprint: lifecycleFingerprint(arm.sessionId),
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
  const evaluation = ledger.getControlledSkillEvaluation(evaluationId as never)!
  const input = {
    evaluationId,
    tasks: evaluation.evidencePurpose === 'controlled-product'
      ? shadowTasks().slice(0, 1)
      : shadowTasks(),
  }
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
    ...(plan.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3'
      ? { evaluatorMaterialContractDigest: plan.tasks[0].evaluatorMaterialContractDigest }
      : {}),
  })
}

function recordShadowRunFacts(
  ledger: EvolutionLedger,
  plan: ControlledSkillShadowPlan,
  outcomes: readonly ('met' | 'not-met' | 'inconclusive')[],
  options: { readonly legacyBindingIndex?: number } = {},
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
      ...(options.legacyBindingIndex === index
        ? {}
        : { sessionLifecycleFingerprint: lifecycleFingerprint(task.sessionId) }),
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
      ...(plan.schemaVersion === 'tianwen.controlled-skill-shadow-plan.v3'
        ? { evaluatorMaterialDigest: sha256(`shadow-material:${task.taskId}`) }
        : {}),
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1_000, toolCalls: 2, elapsedMs: 500 },
    }
  })
}

function sourceFidelityEvaluation() {
  const sourcePacketDigest = sha256('shadow-source-packet')
  const source = {
    signalId: 'signal:shadow-source',
    sessionId: 'session:shadow-source',
    messageId: 'message:shadow-source',
    feedbackVersion: 'feedback:shadow-source-v1',
    sessionLifecycleFingerprint: sha256('shadow-source-lifecycle'),
    sessionDigest: sha256('shadow-source-session'),
    evidenceSetDigest: sha256('shadow-source-evidence-set'),
    acceptanceSubjectDigest: sha256('evaluation-subject:0'),
    packetDigest: sourcePacketDigest,
  }
  const protocolInput = controlledProtocol()
  protocolInput.tasks[0]!.inputDigest = sourcePacketDigest
  const protocol = {
    ...protocolInput,
    rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
    sourceFidelity: {
      policyVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.schemaVersion,
      policyDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST,
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source,
      holdout: {
        task: {
          taskId: 'shadow-task:source-fidelity-holdout',
          goalDigest: sha256('source-fidelity-holdout-goal'),
          inputDigest: sha256('source-fidelity-holdout-input'),
          workspaceSnapshotDigest: sha256('source-fidelity-holdout-workspace'),
          toolSchemaDigest: sha256('source-fidelity-holdout-tools'),
          authorizationDigest: sha256('source-fidelity-holdout-authorization'),
          verifierContractDigest: sha256('source-fidelity-holdout-verifier'),
          stopConditionDigest: sha256('source-fidelity-holdout-stop'),
          evaluatorMaterialContractDigest: sha256('source-fidelity-holdout-material'),
          acceptanceContract: acceptance,
          acceptanceSubjectDigest: sha256('source-fidelity-holdout-subject'),
          allowedTools: ['skill', 'verify_summary'],
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        },
        review: {
          rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
          configurationDigest: sha256('source-fidelity-review-config'),
          materialContractDigest: sha256('source-fidelity-review-material-contract'),
          evidenceContractDigest: sha256('source-fidelity-review-evidence-contract'),
        },
      },
    },
  } as const
  const scopeKey = 'project:tianwen/capability:controlled-shadow-summary'
  const ticket = {
    ticketId: 'ticket:shadow-source-fidelity',
    problemFingerprint: sha256('shadow-source-problem'),
    status: 'open' as const,
    signalIds: [source.signalId],
  }
  const record = prepareControlledSkillEvalProtocol({
    ticketId: ticket.ticketId,
    evidencePurpose: 'controlled-product',
    protocol,
  }, ticket, [{ signalId: source.signalId, scopeKey, ...source }], 'pre-candidate')
  const candidate = {
    candidateId: `candidate:${'1'.repeat(64)}`,
    ticketId: ticket.ticketId,
    caseId: `case:${'2'.repeat(64)}`,
    lessonId: `lesson:${'3'.repeat(64)}`,
    attributionId: `attribution:${'4'.repeat(64)}`,
    parentVersionId: `skill-version:${'5'.repeat(64)}`,
    targetScope: scopeKey,
    payloadDigest: sha256('shadow-source-candidate-payload'),
    payload: { ...parentSkill, content: 'source-fidelity Candidate' },
    evidenceIds: [sha256('shadow-source-evidence')],
  } as const
  const evaluation = prepareControlledSkillEvaluationPlan({
    candidateId: candidate.candidateId,
    protocolId: record.protocolId,
    sessionAllocations: record.protocol.tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:shadow-source:${task.taskType}:baseline`,
      candidateSessionId: `session:shadow-source:${task.taskType}:candidate`,
      evaluatorSessionId: 'session:shadow-source:aggregate-review',
    })),
  }, candidate as never, {
    caseId: candidate.caseId,
    parentVersionId: candidate.parentVersionId,
    scopeKey,
  } as never, record, sha256('shadow-source-parent-payload'))
  const objectives = evaluation.tasks.map(task => {
    const executionManifestDigest = sha256({
      execution: evaluation.execution,
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
    const arm = (role: 'baseline' | 'candidate') => ({
      role,
      runId: task[role].runId,
      sessionId: task[role].sessionId,
      skillVersionId: role === 'baseline'
        ? evaluation.parentVersionId
        : `skill-version:${'6'.repeat(64)}` as const,
      contentDigest: role === 'baseline'
        ? sha256('shadow-source-content:baseline')
        : sha256(candidate.payload.content),
      executionManifestDigest,
      normalizedFirstRequestDigest: sha256(`shadow-source-request:${task.taskId}`),
      outcome: 'met' as const,
      evidenceIds: [sha256(`shadow-source-evidence:${task.taskId}:${role}`)],
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      evaluatorMaterialDigest: sha256(`shadow-source-material:${task.taskId}:${role}`),
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
    })
    return prepareControlledSkillEvaluationObjective({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      baseline: arm('baseline'),
      candidate: arm('candidate'),
    }, evaluation)
  })
  const blindMap = prepareControlledSkillEvaluationBlindMap({
    evaluationId: evaluation.evaluationId,
  }, evaluation, objectives)
  const observations = evaluation.tasks.map((task, index) => {
    const assignment = blindMap.assignments[index]!
    const scores = {
      baseline: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3,
        scopeRestraint: 3, sourceFidelity: 3 },
      candidate: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3,
        scopeRestraint: 3, sourceFidelity: index === 0 ? 4 : 3 },
    }
    return prepareControlledSkillEvaluatorObservation({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`shadow-source-review-request:${task.taskId}`),
      evidenceId: sha256(`shadow-source-review-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: { x: scores[assignment.xRole], y: scores[assignment.yRole] },
    }, evaluation, blindMap)
  })
  const result = prepareControlledSkillEvaluationResult({
    evaluationId: evaluation.evaluationId,
  }, evaluation, objectives, blindMap, observations)
  return { candidate, evaluation, result, objectives, observations }
}

function sourceFidelityShadow() {
  const seeded = sourceFidelityEvaluation()
  const plan = prepareControlledSkillShadowPlan({
    evaluationId: seeded.evaluation.evaluationId,
    holdoutSessionId: 'session:source-fidelity:holdout',
    reviewSessionId: 'session:source-fidelity:holdout-review',
  }, seeded.evaluation, seeded.result, seeded.candidate as never,
  sha256('shadow-source-parent-payload'), seeded.objectives, seeded.observations)
  const task = plan.tasks[0]!
  const run = {
    taskId: task.taskId,
    runId: task.runId,
    sessionId: task.sessionId,
    skillVersionId: plan.candidateVersionId,
    contentDigest: sha256(seeded.candidate.payload.content),
    executionManifestDigest: shadowExecutionManifestDigest(plan, task),
    normalizedFirstRequestDigest: sha256('source-fidelity-holdout-request'),
    outcome: 'met' as const,
    evidenceIds: [sha256('source-fidelity-holdout-evidence')],
    acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    evaluatorMaterialDigest: sha256('source-fidelity-holdout-accepted-material'),
    usedToolNames: ['skill', 'verify_summary'],
    usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
  }
  return { ...seeded, plan, run }
}

function seedSourceFidelityLedger(root: string) {
  const ledger = new EvolutionLedger(root, {
    clock: () => '2026-09-06T00:00:00.000Z',
  })
  const scopeKey = 'project:tianwen/capability:controlled-shadow-summary'
  const sourceSessionId = 'session:source-fidelity:accepted-source'
  const sourceMessageId = 'message:source-fidelity:accepted-source'
  const sourceFeedbackVersion = 'feedback:source-fidelity:v1'
  const sourceSessionDigest = sha256('source-fidelity:accepted-source-session')
  const sourceEvidenceId = sha256('source-fidelity:accepted-source-evidence')
  const protocol = controlledProtocol()
  const sourcePacketDigest = sha256('source-fidelity:accepted-source-packet')
  protocol.tasks[0]!.inputDigest = sourcePacketDigest
  const sourceLifecycle = lifecycleFingerprint(sourceSessionId)
  const sourceBinding = ledger.recordRunBinding({
    goalRef: 'goal:source-fidelity:accepted-source',
    taskRef: 'task:source-fidelity:accepted-source',
    sessionId: sourceSessionId,
    scopeKey,
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: protocol.tasks[0]!.acceptanceSubjectDigest,
    sessionLifecycleFingerprint: sourceLifecycle,
  })
  const sourceManifest = ledger.recordRunSkillManifest({
    runId: sourceBinding.runId,
    skill: parentSkill,
  })
  ledger.recordOutcomeIntake({
    runId: sourceBinding.runId,
    verdict: 'met',
    sessionDigest: sourceSessionDigest,
    evidenceIds: [sourceEvidenceId],
  })
  ledger.recordRunSkillUse({
    runId: sourceBinding.runId,
    parentVersionId: sourceManifest.parentVersionId,
    sessionId: sourceSessionId,
    sessionDigest: sourceSessionDigest,
    skillName: parentSkill.name,
    contentDigest: sha256(parentSkill.content),
    skillEvidenceId: sha256('source-fidelity:accepted-source-skill-evidence'),
    acceptanceEvidenceId: sourceEvidenceId,
    skillCallSeq: 10,
    skillResultSeq: 11,
    acceptanceCallSeq: 12,
  })
  ledger.recordLearningAnalysisConsent({
    revision: 1,
    enabled: true,
    policyVersion: 'tianwen-auto-analysis.v1',
  })
  const feedback = ledger.recordLearningFeedbackRevision({
    intake: {
      sessionId: sourceSessionId,
      messageId: sourceMessageId,
      feedbackVersion: sourceFeedbackVersion,
      rating: 'negative',
      note: 'Keep every summary claim faithful to the supplied source.',
      scopeKey,
      sessionDigest: sourceSessionDigest,
      evidenceIds: [sourceEvidenceId],
    },
    sessionLifecycleFingerprint: sourceLifecycle,
    analysisConsentRevision: 1,
  })
  const sourceFidelityProtocol = {
    ...protocol,
    rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
    sourceFidelity: {
      policyVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.schemaVersion,
      policyDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY_DIGEST,
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source: {
        signalId: feedback.signalId!,
        sessionId: sourceSessionId,
        messageId: sourceMessageId,
        feedbackVersion: sourceFeedbackVersion,
        sessionLifecycleFingerprint: sourceLifecycle,
        sessionDigest: sourceSessionDigest,
        evidenceSetDigest: sha256([sourceEvidenceId]),
        acceptanceSubjectDigest: protocol.tasks[0]!.acceptanceSubjectDigest,
        packetDigest: sourcePacketDigest,
      },
      holdout: {
        task: {
          taskId: 'shadow-task:source-fidelity-holdout',
          goalDigest: sha256('ledger-holdout-goal'),
          inputDigest: sha256('ledger-holdout-input'),
          workspaceSnapshotDigest: sha256('ledger-holdout-workspace'),
          toolSchemaDigest: sha256('ledger-holdout-tools'),
          authorizationDigest: sha256('ledger-holdout-authorization'),
          verifierContractDigest: sha256('ledger-holdout-verifier'),
          stopConditionDigest: sha256('ledger-holdout-stop'),
          evaluatorMaterialContractDigest: sha256('ledger-holdout-material'),
          acceptanceContract: acceptance,
          acceptanceSubjectDigest: sha256('ledger-holdout-subject'),
          allowedTools: ['skill', 'verify_summary'],
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        },
        review: {
          rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
          configurationDigest: sha256('ledger-holdout-review-config'),
          materialContractDigest: sha256('ledger-holdout-review-material'),
          evidenceContractDigest: sha256('ledger-holdout-review-evidence'),
        },
      },
    },
  } as const
  const frozen = ledger.freezeControlledSkillEvalProtocol({
    ticketId: feedback.ticketId!,
    evidencePurpose: 'controlled-product',
    protocol: sourceFidelityProtocol,
  })
  const analysis = ledger.requestLearningAnalysis({
    ticketId: feedback.ticketId!,
    sessionId: sourceSessionId,
    messageId: sourceMessageId,
    feedbackVersion: sourceFeedbackVersion,
    consentRevision: 1,
    parentSessionId: sourceSessionId,
  })
  ledger.recordLearningAnalysisChildStarted({
    analysisId: analysis.analysisId,
    parentSessionId: analysis.parentSessionId,
    childSessionId: analysis.childSessionId,
  })
  ledger.recordLearningAnalysisSubmission({
    analysisId: analysis.analysisId,
    childSessionId: analysis.childSessionId,
    submission: {
      verdict: 'skill-change',
      hypothesis: 'The parent does not explicitly preserve source claim boundaries.',
      lesson: {
        claim: 'Tie each material claim to the supplied source.',
        when: 'Summarizing bounded research material.',
        notWhen: 'Performing raw extraction only.',
      },
      candidatePatch: {
        description: 'Summarize one controlled observation with source fidelity.',
        whenToUse: parentSkill.whenToUse,
        content: '# Controlled summary\n\nState only claims supported by the supplied source.',
      },
      supportingEvidenceIds: [sourceEvidenceId],
      counterevidenceIds: [],
    },
  })
  const openedCase = ledger.openLearningAnalysisCase(analysis.analysisId)
  const learningCase = ledger.getLearningCase(openedCase.caseId)!
  const attribution = ledger.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parentSkill.name,
    hypothesis: 'The parent does not explicitly preserve source claim boundaries.',
    supportingEvidenceIds: [sourceEvidenceId],
    counterevidenceIds: [],
    alternatives: 'No non-Skill cause is accepted by this bounded analysis.',
  })
  const lesson = ledger.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: 'Tie each material claim to the supplied source.',
    when: 'Summarizing bounded research material.',
    notWhen: 'Performing raw extraction only.',
    supportingEvidenceIds: [sourceEvidenceId],
    counterevidenceIds: [],
    targetScope: scopeKey,
  })
  const candidate = ledger.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: parentSkill.name,
      description: 'Summarize one controlled observation with source fidelity.',
      whenToUse: parentSkill.whenToUse,
      invocation: parentSkill.invocation,
      source: parentSkill.source,
      content: '# Controlled summary\n\nState only claims supported by the supplied source.',
    },
    evidenceIds: [sourceEvidenceId],
  })
  const opened = ledger.openControlledSkillEvaluation({
    candidateId: candidate.candidateId,
    protocolId: frozen.protocolId,
    sessionAllocations: sourceFidelityProtocol.tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:ledger-source:${task.taskType}:baseline`,
      candidateSessionId: `session:ledger-source:${task.taskType}:candidate`,
      evaluatorSessionId: 'session:ledger-source:aggregate-review',
    })),
  })
  const plan = ledger.getControlledSkillEvaluation(opened.evaluationId)!
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
        sessionLifecycleFingerprint: lifecycleFingerprint(arm.sessionId),
      })
      const skill = arm.role === 'baseline'
        ? parentSkill
        : { ...ledger.getSkillCandidate(candidate.candidateId)!.payload, provider: 'runtime' }
      const manifest = ledger.recordRunSkillManifest({ runId: binding.runId, skill })
      const sessionDigest = sha256(`ledger-evaluation-session:${task.taskId}:${arm.role}`)
      const evidenceId = sha256(`ledger-evaluation-evidence:${task.taskId}:${arm.role}`)
      ledger.recordOutcomeIntake({
        runId: binding.runId,
        verdict: 'met',
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
        skillEvidenceId: sha256(`ledger-evaluation-skill:${task.taskId}:${arm.role}`),
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
        normalizedFirstRequestDigest: sha256(`ledger-evaluation-request:${task.taskId}`),
        outcome: 'met' as const,
        evidenceIds: [evidenceId],
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        evaluatorMaterialDigest: sha256(`ledger-evaluation-material:${task.taskId}:${arm.role}`),
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
    const scores = {
      baseline: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3,
        scopeRestraint: 3, sourceFidelity: 3 },
      candidate: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3,
        scopeRestraint: 3, sourceFidelity: index === 0 ? 4 : 3 },
    }
    ledger.recordControlledSkillEvaluatorObservation({
      evaluationId: plan.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`ledger-evaluator-request:${task.taskId}`),
      evidenceId: sha256(`ledger-evaluator-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: { x: scores[assignment.xRole], y: scores[assignment.yRole] },
    })
  }
  ledger.recordControlledSkillEvaluationResult({ evaluationId: plan.evaluationId })
  const shadowReceipt = ledger.openControlledSkillShadow({
    evaluationId: plan.evaluationId,
    holdoutSessionId: 'session:ledger-source:holdout',
    reviewSessionId: 'session:ledger-source:holdout-review',
  })
  const shadow = ledger.getControlledSkillShadow(shadowReceipt.shadowId)!
  const runs = recordShadowRunFacts(ledger, shadow, ['met'])
  return { ledger, shadow, runs }
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

  it('rejects a replayed Shadow result backed by a legacy v2 Run binding', () => {
    const root = fixtureRoot('legacy-binding')
    const seeded = seedPassingEvaluation(root)
    const shadow = openShadow(seeded.ledger, seeded.plan.evaluationId)
    const runs = recordShadowRunFacts(
      seeded.ledger,
      shadow,
      ['not-met'],
      { legacyBindingIndex: 0 },
    )

    const replay = new EvolutionLedger(root)
    expect(() => replay.recordControlledSkillShadowResult({
      shadowId: shadow.shadowId,
      runs,
    })).toThrow(/Run facts/u)
    expect(replay.getControlledSkillShadowResult(shadow.shadowId)).toBeUndefined()
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

  it('derives one v3 holdout Run and freezes the independent review Session', () => {
    const { evaluation, plan } = sourceFidelityShadow()

    expect(plan).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-shadow-plan.v3',
      evaluationId: evaluation.evaluationId,
      mode: 'project',
      review: {
        sessionId: 'session:source-fidelity:holdout-review',
        rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
        configurationDigest: evaluation.sourceFidelity.holdout.review.configurationDigest,
        materialContractDigest: evaluation.sourceFidelity.holdout.review.materialContractDigest,
        evidenceContractDigest: evaluation.sourceFidelity.holdout.review.evidenceContractDigest,
        sourcePacketDigest: evaluation.sourceFidelity.holdout.task.inputDigest,
      },
    })
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0]).toMatchObject({
      ...evaluation.sourceFidelity.holdout.task,
      sessionId: 'session:source-fidelity:holdout',
    })
    expect(plan.review.sessionId).not.toBe(plan.tasks[0]!.sessionId)
    const seeded = sourceFidelityEvaluation()
    expect(() => prepareControlledSkillShadowPlan({
      evaluationId: seeded.evaluation.evaluationId,
      holdoutSessionId: 'session:source-fidelity:another-holdout',
      reviewSessionId: seeded.evaluation.tasks[0]!.evaluatorSessionId,
    }, seeded.evaluation, seeded.result, seeded.candidate as never,
    sha256('shadow-source-parent-payload'), seeded.objectives, seeded.observations))
      .toThrow(/independent holdout Sessions/i)
  })

  it('blocks a met holdout until an exact independent observation passes all five scores', () => {
    const seeded = sourceFidelityShadow()
    expect(() => prepareControlledSkillShadowResult({
      shadowId: seeded.plan.shadowId,
      runs: [seeded.run],
    }, seeded.plan)).toThrow(/review observation is required/i)

    const reviewInput = {
      shadowId: seeded.plan.shadowId,
      reviewerSessionId: seeded.plan.review.sessionId,
      requestDigest: sha256('source-fidelity-holdout-review-request'),
      evidenceId: sha256('source-fidelity-holdout-review-evidence'),
      acceptanceEvidenceId: seeded.run.evidenceIds[0]!,
      acceptedMaterialDigest: seeded.run.evaluatorMaterialDigest,
      reviewedRun: seeded.run,
      status: 'scored' as const,
      insufficientMaterial: false as const,
      reasonCode: 'score-submitted' as const,
      scores: {
        relevance: 3,
        correctnessReasoning: 3,
        clarityUsability: 3,
        scopeRestraint: 3,
        sourceFidelity: 2,
      },
    }
    const failedReview = prepareControlledSkillShadowReviewObservation(
      reviewInput,
      seeded.plan,
    )
    expect(prepareControlledSkillShadowResult({
      shadowId: seeded.plan.shadowId,
      runs: [seeded.run],
    }, seeded.plan, failedReview)).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
      mechanismVerdict: 'rejected',
      reasonCode: 'holdout-quality-threshold-failed',
      promotionEligibility: 'ineligible',
      reviewObservationDigest: sha256(failedReview),
    })

    const passingReview = prepareControlledSkillShadowReviewObservation({
      ...reviewInput,
      scores: { ...reviewInput.scores, sourceFidelity: 3 },
    }, seeded.plan)
    const result = prepareControlledSkillShadowResult({
      shadowId: seeded.plan.shadowId,
      runs: [seeded.run],
    }, seeded.plan, passingReview)
    expect(result).toMatchObject({
      mechanismVerdict: 'pass',
      reasonCode: 'all-shadow-runs-qualified',
      promotionEligibility: 'eligible-for-project-promotion',
      reviewObservationDigest: sha256(passingReview),
    })
    expect(prepareControlledSkillPromotionRecommendation(
      seeded.evaluation,
      seeded.result,
      seeded.plan,
      result,
      seeded.candidate as never,
      sha256('shadow-source-parent-payload'),
    ).decision).toBe('promote')
  })

  it('rejects foreign, stale, insufficient and drifted v3 review evidence', () => {
    const seeded = sourceFidelityShadow()
    const input = {
      shadowId: seeded.plan.shadowId,
      reviewerSessionId: seeded.plan.review.sessionId,
      requestDigest: sha256('review-boundary-request'),
      evidenceId: sha256('review-boundary-evidence'),
      acceptanceEvidenceId: seeded.run.evidenceIds[0]!,
      acceptedMaterialDigest: seeded.run.evaluatorMaterialDigest,
      reviewedRun: seeded.run,
      status: 'scored' as const,
      insufficientMaterial: false as const,
      reasonCode: 'score-submitted' as const,
      scores: {
        relevance: 3,
        correctnessReasoning: 3,
        clarityUsability: 3,
        scopeRestraint: 3,
        sourceFidelity: 3,
      },
    }
    expect(() => prepareControlledSkillShadowReviewObservation({
      ...input,
      reviewerSessionId: 'session:foreign-reviewer',
    }, seeded.plan)).toThrow(/frozen review/i)
    expect(() => prepareControlledSkillShadowReviewObservation({
      ...input,
      acceptedMaterialDigest: sha256('drifted-prose'),
    }, seeded.plan)).toThrow(/accepted material/i)
    const { scores: _scores, ...inconclusiveInput } = input
    const inconclusive = prepareControlledSkillShadowReviewObservation({
      ...inconclusiveInput,
      status: 'inconclusive',
      insufficientMaterial: true,
      reasonCode: 'material-missing',
    }, seeded.plan)
    expect(prepareControlledSkillShadowResult({
      shadowId: seeded.plan.shadowId,
      runs: [seeded.run],
    }, seeded.plan, inconclusive)).toMatchObject({
      mechanismVerdict: 'inconclusive',
      reasonCode: 'holdout-review-inconclusive',
      promotionEligibility: 'ineligible',
    })
    const passing = prepareControlledSkillShadowReviewObservation(input, seeded.plan)
    expect(() => prepareControlledSkillShadowResult({
      shadowId: seeded.plan.shadowId,
      runs: [{ ...seeded.run, evaluatorMaterialDigest: sha256('later-prose-drift') }],
    }, seeded.plan, passing)).toThrow(/reviewed Run/i)
  })

  it('durably replays the exact semantic observation before readiness can be generated', () => {
    const root = fixtureRoot('source-fidelity-review-replay')
    const seeded = seedSourceFidelityLedger(root)
    const run = seeded.runs[0]!
    expect(() => seeded.ledger.recordControlledSkillShadowResult({
      shadowId: seeded.shadow.shadowId,
      runs: seeded.runs,
    })).toThrow(/review observation is required/i)
    expect(() => seeded.ledger.initializeControlledSkillScopePointer({
      shadowId: seeded.shadow.shadowId,
    })).toThrow(/lacks evidence/i)

    const input = {
      shadowId: seeded.shadow.shadowId,
      reviewerSessionId: seeded.shadow.review.sessionId,
      requestDigest: sha256('ledger-holdout-review-request'),
      evidenceId: sha256('ledger-holdout-review-output-evidence'),
      acceptanceEvidenceId: run.evidenceIds[0]!,
      acceptedMaterialDigest: run.evaluatorMaterialDigest,
      reviewedRun: run,
      status: 'scored' as const,
      insufficientMaterial: false as const,
      reasonCode: 'score-submitted' as const,
      scores: {
        relevance: 3,
        correctnessReasoning: 3,
        clarityUsability: 3,
        scopeRestraint: 3,
        sourceFidelity: 3,
      },
    }
    expect(seeded.ledger.recordControlledSkillShadowReviewObservation(input))
      .toEqual({ shadowId: seeded.shadow.shadowId, duplicate: false })
    expect(seeded.ledger.recordControlledSkillShadowReviewObservation(input).duplicate)
      .toBe(true)
    expect(() => seeded.ledger.recordControlledSkillShadowReviewObservation({
      ...input,
      acceptedMaterialDigest: sha256('ledger-drifted-accepted-material'),
    })).toThrow(LedgerIntegrityError)

    const replay = new EvolutionLedger(root)
    expect(replay.getControlledSkillShadowReviewObservation(seeded.shadow.shadowId))
      .toEqual(seeded.ledger.getControlledSkillShadowReviewObservation(
        seeded.shadow.shadowId,
      ))
    expect(replay.recordControlledSkillShadowResult({
      shadowId: seeded.shadow.shadowId,
      runs: seeded.runs,
    })).toEqual({ shadowId: seeded.shadow.shadowId, duplicate: false })
    expect(replay.getControlledSkillShadowResult(seeded.shadow.shadowId)).toMatchObject({
      schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
      mechanismVerdict: 'pass',
      promotionEligibility: 'eligible-for-project-promotion',
    })
    expect(replay.initializeControlledSkillScopePointer({
      shadowId: seeded.shadow.shadowId,
    }).duplicate).toBe(false)
    expect(new EvolutionLedger(root).getControlledSkillShadowResult(
      seeded.shadow.shadowId,
    )).toEqual(replay.getControlledSkillShadowResult(seeded.shadow.shadowId))
    expect(isPublicLedgerEvent(replay.listEvents().find(event =>
      event.type === 'controlled-skill-shadow-review-observation-recorded')!)).toBe(false)
  })
})
