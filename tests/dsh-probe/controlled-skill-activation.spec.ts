import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const syncAudit = vi.hoisted(() => ({
  enabled: false,
  failLedgerFsyncAfterReal: 0,
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      if (syncAudit.enabled) paths.set(descriptor, String(path))
      return descriptor
    },
    fsyncSync(descriptor: number) {
      actual.fsyncSync(descriptor)
      if (
        syncAudit.enabled
        && syncAudit.failLedgerFsyncAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        syncAudit.failLedgerFsyncAfterReal -= 1
        throw Object.assign(new Error('forced lifecycle ledger uncertainty'), {
          code: 'EIO',
        })
      }
    },
  }
})

import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1,
  controlledSkillTransitionExecutionManifestDigest,
  learningSessionLifecycleFingerprint,
  prepareControlledSkillPromotionRecommendation,
  prepareRunBinding,
  sha256,
  TianwenEvolutionService,
} from '../../packages/tianwen-evolution/src/index.js'
import type {
  BeginControlledSkillTransitionInput,
  ControlledSkillShadowPlan,
  ControlledSkillTransition,
  ControlledSkillTransitionRun,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  EvolutionLedger,
  isPublicLedgerEvent,
  LedgerCommitUnknownError,
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
  name: 'controlled-activation-summary',
  description: 'Summarize one controlled activation observation.',
  whenToUse: 'When a controlled task asks for a concise summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled activation summary\n\nState the observation.',
} as const

const taskTypes = [
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const

const controlledActivationServiceFacade: Pick<
  EvolutionLedger,
  | 'initializeControlledSkillScopePointer'
  | 'getControlledSkillScopePointer'
  | 'listControlledSkillScopePointers'
  | 'beginControlledSkillTransition'
  | 'getControlledSkillTransition'
  | 'listControlledSkillTransitions'
  | 'completeControlledSkillTransition'
  | 'getControlledSkillTransitionReceipt'
  | 'recordControlledSkillActivationFailed'
> = TianwenEvolutionService.prototype

void controlledActivationServiceFacade

const roots: string[] = []

function fixtureRoot(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-v0.1-eval-fixtures',
    'controlled-skill-activation-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(root)
  return root
}

afterEach(() => {
  syncAudit.enabled = false
  syncAudit.failLedgerFsyncAfterReal = 0
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
      goalDigest: sha256(`activation-evaluation-goal:${index}`),
      inputDigest: sha256(`activation-evaluation-input:${index}`),
      workspaceSnapshotDigest: sha256(`activation-evaluation-workspace:${index}`),
      toolSchemaDigest: sha256(`activation-evaluation-tools:${index}`),
      authorizationDigest: sha256(`activation-evaluation-authorization:${index}`),
      verifierContractDigest: sha256(`activation-evaluation-verifier:${index}`),
      stopConditionDigest: sha256(`activation-evaluation-stop:${index}`),
      evaluatorMaterialContractDigest: sha256(`activation-evaluation-material:${index}`),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: sha256(`activation-evaluation-subject:${index}`),
      allowedTools: ['skill', 'verify_summary'],
      stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    })),
    execution: {
      dshVersion: '0.1.1-rc.2' as const,
      providerId: 'tianwen-activation-scripted',
      modelId: 'scripted',
      callConfigDigest: sha256('activation-call-config'),
      toolSchemaDigest: sha256('activation-evaluation-tool-surface'),
      retryPolicyDigest: sha256('activation-no-retry'),
    },
  }
}

function shadowTasks() {
  return taskTypes.map((taskType, index) => ({
    taskId: `shadow-task:${taskType}` as const,
    goalDigest: sha256(`activation-shadow-goal:${index}`),
    inputDigest: sha256(`activation-shadow-input:${index}`),
    workspaceSnapshotDigest: sha256(`activation-shadow-workspace:${index}`),
    toolSchemaDigest: sha256(`activation-shadow-tools:${index}`),
    authorizationDigest: sha256(`activation-shadow-authorization:${index}`),
    verifierContractDigest: sha256(`activation-shadow-verifier:${index}`),
    stopConditionDigest: sha256(`activation-shadow-stop:${index}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`activation-shadow-subject:${index}`),
    allowedTools: ['skill', 'verify_summary'],
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    sessionId: `session:controlled-activation-shadow:${taskType}`,
  }))
}

function executionManifestDigest(
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

function seedPassingShadow(
  root: string,
  evidencePurpose: 'controlled-product' | 'development-only-synthetic-defect' =
    'development-only-synthetic-defect',
) {
  const ledger = new EvolutionLedger(root, {
    clock: () => '2026-08-23T06:00:00.000Z',
  })
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker]) => {
    const sessionId = `session:activation-seed:${suffix}`
    const binding = ledger.recordRunBinding({
      goalRef: 'goal:controlled-activation-seed',
      taskRef: `task:controlled-activation-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-activation-summary',
      acceptanceContract: acceptance,
    })
    const manifest = ledger.recordRunSkillManifest({
      runId: binding.runId,
      skill: parentSkill,
    })
    const sessionDigest = sha256(`activation-seed-session:${marker}`)
    const evidenceId = sha256(`activation-seed-evidence:${marker}`)
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
      skillEvidenceId: sha256(`activation-seed-skill-evidence:${marker}`),
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
  const candidateReceipt = ledger.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: parentSkill.name,
      description: 'Summarize one verified controlled observation.',
      whenToUse: parentSkill.whenToUse,
      invocation: parentSkill.invocation,
      source: parentSkill.source,
      content: '# Controlled activation summary\n\nState the verified result before interpretation.',
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  const evaluationReceipt = ledger.openControlledSkillEvaluation({
    candidateId: candidateReceipt.candidateId,
    protocolId: protocol.protocolId,
    sessionAllocations: controlledProtocol().tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:activation-evaluation:${task.taskType}:baseline`,
      candidateSessionId: `session:activation-evaluation:${task.taskType}:candidate`,
      evaluatorSessionId: `session:activation-evaluation:${task.taskType}:evaluator`,
    })),
  })
  const evaluation = ledger.getControlledSkillEvaluation(
    evaluationReceipt.evaluationId,
  )!
  const candidate = ledger.getSkillCandidate(candidateReceipt.candidateId)!
  for (const [index, task] of evaluation.tasks.entries()) {
    const manifestDigest = sha256({
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
    const arms = ([task.baseline, task.candidate] as const).map(arm => {
      const binding = ledger.recordRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${evaluation.protocolId}`,
        taskRef: `task:${task.taskId}:${arm.role}`,
        sessionId: arm.sessionId,
        scopeKey: evaluation.scopeKey,
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      })
      const skill = arm.role === 'baseline'
        ? parentSkill
        : { ...candidate.payload, provider: 'runtime' }
      const manifest = ledger.recordRunSkillManifest({ runId: binding.runId, skill })
      const outcome = arm.role === 'baseline' && index === 0 ? 'not-met' : 'met'
      const sessionDigest = sha256(`activation-evaluation-session:${task.taskId}:${arm.role}`)
      const evidenceId = sha256(`activation-evaluation-evidence:${task.taskId}:${arm.role}`)
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
        skillEvidenceId: sha256(`activation-evaluation-skill:${task.taskId}:${arm.role}`),
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
        executionManifestDigest: manifestDigest,
        normalizedFirstRequestDigest: sha256(`activation-request:${task.taskId}`),
        outcome,
        evidenceIds: [evidenceId],
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        evaluatorMaterialDigest: sha256(`activation-material:${task.taskId}:${arm.role}`),
        usedToolNames: ['skill', 'verify_summary'],
        usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
      }
    })
    ledger.recordControlledSkillEvaluationObjective({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      baseline: arms[0]!,
      candidate: arms[1]!,
    })
  }
  ledger.freezeControlledSkillEvaluationBlindMap({
    evaluationId: evaluation.evaluationId,
  })
  const blindMap = ledger.getControlledSkillEvaluationBlindMap(evaluation.evaluationId)!
  for (const [index, task] of evaluation.tasks.entries()) {
    const assignment = blindMap.assignments[index]!
    ledger.recordControlledSkillEvaluatorObservation({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`activation-evaluator-request:${task.taskId}`),
      evidenceId: sha256(`activation-evaluator-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
        y: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
      },
    })
  }
  ledger.recordControlledSkillEvaluationResult({ evaluationId: evaluation.evaluationId })
  const shadowReceipt = ledger.openControlledSkillShadow({
    evaluationId: evaluation.evaluationId,
    tasks: shadowTasks(),
  })
  const shadow = ledger.getControlledSkillShadow(shadowReceipt.shadowId)!
  const shadowRuns = shadow.tasks.map(task => {
    const binding = ledger.recordRunBinding({
      goalRef: `goal:controlled-skill-shadow:${shadow.shadowId}`,
      taskRef: `task:${task.taskId}:candidate`,
      sessionId: task.sessionId,
      scopeKey: shadow.scopeKey,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
    })
    const manifest = ledger.recordRunSkillManifest({
      runId: binding.runId,
      skill: { ...candidate.payload, provider: 'runtime' },
    })
    const sessionDigest = sha256(`activation-shadow-session:${task.taskId}`)
    const evidenceId = sha256(`activation-shadow-evidence:${task.taskId}`)
    ledger.recordOutcomeIntake({
      runId: binding.runId,
      verdict: 'met',
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    ledger.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: task.sessionId,
      sessionDigest,
      skillName: candidate.payload.name,
      contentDigest: sha256(candidate.payload.content),
      skillEvidenceId: sha256(`activation-shadow-skill:${task.taskId}`),
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
      executionManifestDigest: executionManifestDigest(shadow, task),
      normalizedFirstRequestDigest: sha256(`activation-shadow-request:${task.taskId}`),
      outcome: 'met' as const,
      evidenceIds: [evidenceId],
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
    }
  })
  ledger.recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs: shadowRuns })
  return {
    ledger,
    evaluation,
    evaluationResult: ledger.getControlledSkillEvaluationResult(evaluation.evaluationId)!,
    shadow,
    shadowResult: ledger.getControlledSkillShadowResult(shadow.shadowId)!,
    candidate,
  }
}

function postCheck(
  kind: BeginControlledSkillTransitionInput['kind'],
  expectedRevision: number,
): BeginControlledSkillTransitionInput['postCheck'] {
  return {
    goalDigest: sha256(`activation-${kind}-goal:${expectedRevision}`),
    inputDigest: sha256(`activation-${kind}-input:${expectedRevision}`),
    workspaceSnapshotDigest: sha256(`activation-${kind}-workspace:${expectedRevision}`),
    toolSchemaDigest: sha256(`activation-${kind}-tools:${expectedRevision}`),
    authorizationDigest: sha256(`activation-${kind}-authorization:${expectedRevision}`),
    verifierContractDigest: sha256(`activation-${kind}-verifier:${expectedRevision}`),
    stopConditionDigest: sha256(`activation-${kind}-stop:${expectedRevision}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`activation-${kind}-subject:${expectedRevision}`),
    allowedTools: ['skill', 'verify_summary'],
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    sessionId: `session:controlled-activation:${kind}:${expectedRevision}`,
  }
}

function begin(
  ledger: EvolutionLedger,
  shadowId: ControlledSkillShadowPlan['shadowId'],
  kind: BeginControlledSkillTransitionInput['kind'],
  expectedRevision: number,
): ControlledSkillTransition {
  const receipt = ledger.beginControlledSkillTransition({
    shadowId,
    kind,
    expectedRevision,
    postCheck: postCheck(kind, expectedRevision),
  })
  return ledger.getControlledSkillTransition(receipt.transitionId)!
}

function recordTransitionRunFacts(
  ledger: EvolutionLedger,
  transition: ControlledSkillTransition,
): ControlledSkillTransitionRun {
  const candidate = ledger.getSkillCandidate(transition.source.candidateId)!
  const candidateActive = transition.targetPointer.activeVersionId
    === transition.source.candidateVersionId
  const skill = candidateActive
    ? { ...candidate.payload, provider: 'runtime' }
    : parentSkill
  const planned = transition.runBinding
  const binding = ledger.recordRunBinding({
    goalRef: planned.goalRef,
    taskRef: planned.taskRef,
    sessionId: planned.sessionId,
    scopeKey: planned.scopeKey,
    acceptanceContract: planned.acceptanceContract,
    acceptanceSubjectDigest: planned.acceptanceSubjectDigest,
    sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
      sessionId: planned.sessionId,
      createdAt: 1,
      cwd: 'D:/controlled-activation-fixture',
    }),
  })
  if (binding.runId !== transition.postCheck.runId) {
    throw new Error('controlled transition fixture Run identity drifted')
  }
  const manifest = ledger.recordRunSkillManifest({
    runId: transition.postCheck.runId,
    skill,
  })
  const sessionDigest = sha256(`activation-transition-session:${transition.transitionId}`)
  const evidenceId = sha256(`activation-transition-evidence:${transition.transitionId}`)
  ledger.recordOutcomeIntake({
    runId: transition.postCheck.runId,
    verdict: 'met',
    sessionDigest,
    evidenceIds: [evidenceId],
  })
  ledger.recordRunSkillUse({
    runId: transition.postCheck.runId,
    parentVersionId: manifest.parentVersionId,
    sessionId: transition.postCheck.sessionId,
    sessionDigest,
    skillName: candidate.payload.name,
    contentDigest: sha256(skill.content),
    skillEvidenceId: sha256(`activation-transition-skill:${transition.transitionId}`),
    acceptanceEvidenceId: evidenceId,
    skillCallSeq: 10,
    skillResultSeq: 11,
    acceptanceCallSeq: 12,
  })
  return {
    runId: transition.postCheck.runId,
    sessionId: transition.postCheck.sessionId,
    skillVersionId: manifest.parentVersionId,
    contentDigest: sha256(skill.content),
    executionManifestDigest: controlledSkillTransitionExecutionManifestDigest(transition),
    normalizedFirstRequestDigest: sha256(`activation-transition-request:${transition.transitionId}`),
    outcome: 'met',
    evidenceIds: [evidenceId],
    acceptanceSubjectDigest: transition.postCheck.acceptanceSubjectDigest,
    usedToolNames: ['skill', 'verify_summary'],
    usage: { modelRequests: 10_000, toolCalls: 2, elapsedMs: 500 },
  }
}

describe('controlled Skill activation governance', () => {
  it('routes scope pointer initialization through the governed ledger', () => {
    const ledger = new EvolutionLedger(fixtureRoot('missing-shadow'))

    expect(() => (ledger as unknown as {
      initializeControlledSkillScopePointer(input: unknown): unknown
    }).initializeControlledSkillScopePointer({
      shadowId: `shadow:${'a'.repeat(64)}`,
    })).toThrow(LedgerIntegrityError)
  })

  it.each([
    ['development-only-synthetic-defect', 'isolated-test'],
    ['controlled-product', 'project'],
  ] as const)('initializes B at revision 1 for %s evidence', (evidencePurpose, mode) => {
    const seeded = seedPassingShadow(fixtureRoot(`initialize-${mode}`), evidencePurpose)
    const recommendation = prepareControlledSkillPromotionRecommendation(
      seeded.evaluation,
      seeded.evaluationResult,
      seeded.shadow,
      seeded.shadowResult,
      seeded.candidate,
      seeded.shadow.parentPayloadDigest,
    )

    const receipt = seeded.ledger.initializeControlledSkillScopePointer({
      shadowId: seeded.shadow.shadowId,
    })
    const pointer = seeded.ledger.getControlledSkillScopePointer(seeded.shadow.scopeKey)

    expect(seeded.shadow.mode).toBe(mode)
    expect(recommendation).toMatchObject({
      decision: 'promote',
      source: {
        shadowId: seeded.shadow.shadowId,
        scopeKey: seeded.shadow.scopeKey,
        mode,
      },
    })
    expect(receipt).toEqual({
      scopeKey: seeded.shadow.scopeKey,
      revision: 1,
      duplicate: false,
    })
    expect(pointer).toEqual({
      schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2',
      scopeKey: seeded.shadow.scopeKey,
      activeVersionId: seeded.shadow.parentVersionId,
      payloadDigest: seeded.shadow.parentPayloadDigest,
      revision: 1,
    })
    expect(seeded.ledger.initializeControlledSkillScopePointer({
      shadowId: seeded.shadow.shadowId,
    })).toEqual({ ...receipt, duplicate: true })
    const event = seeded.ledger.listEvents().find(item =>
      item.type === 'controlled-skill-pointer-initialized')
    expect(event).toMatchObject({
      initialization: {
        authorizationDigest: sha256(CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1),
        recommendationDigest: sha256(recommendation),
      },
    })
    expect(event === undefined ? true : isPublicLedgerEvent(event)).toBe(false)
  })

  it('derives and verifies the only B1 to C2 to B3 to C4 transition sequence', () => {
    const { ledger, shadow } = seedPassingShadow(
      fixtureRoot('successful-sequence'),
      'controlled-product',
    )
    ledger.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })

    const transitions: ControlledSkillTransition[] = []
    for (const [kind, expectedRevision] of [
      ['promote', 1],
      ['rollback', 2],
      ['restore', 3],
    ] as const) {
      const input = {
        shadowId: shadow.shadowId,
        kind,
        expectedRevision,
        postCheck: postCheck(kind, expectedRevision),
      }
      const opened = ledger.beginControlledSkillTransition(input)
      const transition = ledger.getControlledSkillTransition(opened.transitionId)!
      transitions.push(transition)
      const expectedBinding = prepareRunBinding({
        goalRef: `goal:controlled-skill-transition:${transition.transitionId}`,
        taskRef: `task:controlled-skill-transition:${kind}:post-check`,
        sessionId: transition.postCheck.sessionId,
        scopeKey: shadow.scopeKey,
        acceptanceContract: transition.postCheck.acceptanceContract,
        acceptanceSubjectDigest: transition.postCheck.acceptanceSubjectDigest,
      })
      expect(transition.runBinding).toEqual(expectedBinding)
      expect(transition.postCheck.runId).toBe(expectedBinding.runId)
      expect(ledger.getRunBinding(expectedBinding.runId)).toBeUndefined()
      expect(ledger.beginControlledSkillTransition(structuredClone(input))).toEqual({
        transitionId: transition.transitionId,
        duplicate: true,
      })
      expect(ledger.getControlledSkillTransitionReceipt(transition.transitionId))
        .toMatchObject({ state: 'pending-post-check', pointer: transition.targetPointer })

      const run = recordTransitionRunFacts(ledger, transition)
      expect(ledger.getRunBinding(expectedBinding.runId)).toMatchObject({
        ...expectedBinding,
        schemaVersion: 'tianwen.run-binding.v3',
        sessionLifecycleFingerprint: expect.stringMatching(
          /^sha256:[0-9a-f]{64}$/u,
        ),
      })
      expect(ledger.completeControlledSkillTransition({
        transitionId: transition.transitionId,
        run,
      })).toEqual({
        transitionId: transition.transitionId,
        state: 'verified',
        duplicate: false,
      })
      expect(ledger.completeControlledSkillTransition({
        transitionId: transition.transitionId,
        run: structuredClone(run),
      })).toEqual({
        transitionId: transition.transitionId,
        state: 'verified',
        duplicate: true,
      })
      expect(ledger.getControlledSkillTransitionReceipt(transition.transitionId))
        .toMatchObject({ state: 'verified', reasonCode: null })
    }

    expect(transitions.map(item => [
      item.kind,
      item.previousPointer.activeVersionId,
      item.targetPointer.activeVersionId,
      item.targetPointer.revision,
    ])).toEqual([
      ['promote', shadow.parentVersionId, shadow.candidateVersionId, 2],
      ['rollback', shadow.candidateVersionId, shadow.parentVersionId, 3],
      ['restore', shadow.parentVersionId, shadow.candidateVersionId, 4],
    ])
    expect(ledger.getControlledSkillScopePointer(shadow.scopeKey)).toEqual(
      transitions[2]!.targetPointer,
    )
    expect(ledger.listEvents().filter(item =>
      item.type === 'controlled-skill-transition-verified')).toHaveLength(3)
  })

  it('requires verified prior work and exact compare-and-set inputs', () => {
    const { ledger, shadow } = seedPassingShadow(fixtureRoot('transition-gates'))
    ledger.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
    const promote = begin(ledger, shadow.shadowId, 'promote', 1)
    const before = ledger.listEvents().length

    expect(() => ledger.beginControlledSkillTransition({
      shadowId: shadow.shadowId,
      kind: 'rollback',
      expectedRevision: 2,
      postCheck: postCheck('rollback', 2),
    })).toThrow(/not verified/u)
    expect(() => ledger.beginControlledSkillTransition({
      shadowId: shadow.shadowId,
      kind: 'rollback',
      expectedRevision: 1,
      postCheck: postCheck('rollback', 1),
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.beginControlledSkillTransition({
      shadowId: shadow.shadowId,
      kind: 'promote',
      expectedRevision: 1,
      postCheck: postCheck('promote', 1),
      verdict: 'met',
    } as never)).toThrow(LedgerIntegrityError)
    expect(() => ledger.beginControlledSkillTransition({
      shadowId: shadow.shadowId,
      kind: 'promote',
      expectedRevision: 1,
      postCheck: {
        ...postCheck('promote', 1),
        inputDigest: sha256('conflicting-transition-input'),
      },
    })).toThrow(/changed/u)
    expect(ledger.listEvents()).toHaveLength(before)
    expect(ledger.getControlledSkillTransitionReceipt(promote.transitionId))
      .toMatchObject({ state: 'pending-post-check' })
  })

  it('verifies only a minimal met projection backed by durable Run facts', () => {
    const { ledger, shadow } = seedPassingShadow(fixtureRoot('verification-facts'))
    ledger.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
    const transition = begin(ledger, shadow.shadowId, 'promote', 1)
    const candidate = ledger.getSkillCandidate(transition.source.candidateId)!
    const projected: ControlledSkillTransitionRun = {
      runId: transition.postCheck.runId,
      sessionId: transition.postCheck.sessionId,
      skillVersionId: transition.targetPointer.activeVersionId,
      contentDigest: sha256(candidate.payload.content),
      executionManifestDigest: controlledSkillTransitionExecutionManifestDigest(transition),
      normalizedFirstRequestDigest: sha256('activation-projected-request'),
      outcome: 'met',
      evidenceIds: [sha256('activation-projected-evidence')],
      acceptanceSubjectDigest: transition.postCheck.acceptanceSubjectDigest,
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: Number.MAX_SAFE_INTEGER, toolCalls: 2, elapsedMs: 500 },
    }
    expect(() => ledger.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run: projected,
    })).toThrow(/Run facts/u)

    const run = recordTransitionRunFacts(ledger, transition)
    const invalid = [
      { ...run, usage: { ...run.usage, modelRequests: 0 } },
      { ...run, usage: { ...run.usage, toolCalls: 0 } },
      { ...run, usage: { ...run.usage, toolCalls: 1 } },
      { ...run, evidenceIds: [sha256('wrong-transition-evidence')] },
      { ...run, acceptanceSubjectDigest: sha256('wrong-transition-subject') },
      { ...run, usedToolNames: ['shell', 'skill', 'verify_summary'] },
      { ...run, usage: { ...run.usage, toolCalls: 5 } },
      { ...run, usage: { ...run.usage, elapsedMs: 10_001 } },
      { ...run, outcome: 'not-met' as const },
      { ...run, executionManifestDigest: sha256('wrong-transition-manifest') },
    ]
    for (const value of invalid) {
      expect(() => ledger.completeControlledSkillTransition({
        transitionId: transition.transitionId,
        run: value,
      })).toThrow(LedgerIntegrityError)
    }
    expect(() => ledger.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run,
      verdict: 'met',
    } as never)).toThrow(LedgerIntegrityError)
    expect(ledger.listEvents().filter(item =>
      item.type === 'controlled-skill-transition-verified')).toHaveLength(0)

    const unboundedModelRequests = {
      ...run,
      usage: { ...run.usage, modelRequests: Number.MAX_SAFE_INTEGER },
    }
    ledger.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run: unboundedModelRequests,
    })
    expect(() => ledger.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run: { ...unboundedModelRequests, normalizedFirstRequestDigest: sha256('conflicting-request') },
    })).toThrow(/verification changed/u)
  })

  it('atomically restores the previous pointer and blocks later transitions after failure', () => {
    const { ledger, shadow } = seedPassingShadow(fixtureRoot('failure-recovery'))
    ledger.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
    const transition = begin(ledger, shadow.shadowId, 'promote', 1)

    const receipt = ledger.recordControlledSkillActivationFailed({
      transitionId: transition.transitionId,
      reasonCode: 'provider-failed',
    })
    const recovered = ledger.getControlledSkillScopePointer(shadow.scopeKey)

    expect(receipt).toEqual({
      transitionId: transition.transitionId,
      state: 'recovered',
      duplicate: false,
    })
    expect(recovered).toEqual({
      ...transition.previousPointer,
      revision: transition.targetPointer.revision + 1,
    })
    expect(ledger.getControlledSkillTransitionReceipt(transition.transitionId))
      .toEqual({
        transitionId: transition.transitionId,
        state: 'recovered',
        pointer: recovered,
        reasonCode: 'provider-failed',
      })
    expect(ledger.recordControlledSkillActivationFailed({
      transitionId: transition.transitionId,
      reasonCode: 'provider-failed',
    })).toEqual({ ...receipt, duplicate: true })
    expect(() => ledger.recordControlledSkillActivationFailed({
      transitionId: transition.transitionId,
      reasonCode: 'timeout',
    })).toThrow(/failure changed/u)
    expect(() => ledger.recordControlledSkillActivationFailed({
      transitionId: transition.transitionId,
      reasonCode: 'provider-failed',
      error: 'raw provider output',
    } as never)).toThrow(LedgerIntegrityError)
    expect(() => ledger.beginControlledSkillTransition({
      shadowId: shadow.shadowId,
      kind: 'restore',
      expectedRevision: recovered!.revision,
      postCheck: postCheck('restore', recovered!.revision),
    })).toThrow(/stopped after recovery/u)
    expect(ledger.listEvents().filter(item =>
      item.type === 'controlled-skill-activation-failed')).toHaveLength(1)
  })

  it('refuses non-pass or stale facts instead of accepting caller recommendation', () => {
    const seeded = seedPassingShadow(fixtureRoot('freshness'))

    expect(() => prepareControlledSkillPromotionRecommendation(
      seeded.evaluation,
      seeded.evaluationResult,
      seeded.shadow,
      { ...seeded.shadowResult, mechanismVerdict: 'rejected' },
      seeded.candidate,
      seeded.shadow.parentPayloadDigest,
    )).toThrow(/fresh passing evidence/u)
    expect(() => prepareControlledSkillPromotionRecommendation(
      seeded.evaluation,
      seeded.evaluationResult,
      { ...seeded.shadow, candidatePayloadDigest: sha256('stale-candidate') },
      seeded.shadowResult,
      seeded.candidate,
      seeded.shadow.parentPayloadDigest,
    )).toThrow(/fresh passing evidence/u)
    expect(() => seeded.ledger.initializeControlledSkillScopePointer({
      shadowId: seeded.shadow.shadowId,
      recommendation: 'promote',
    } as never)).toThrow(LedgerIntegrityError)
  })

  it('replays and clones private lifecycle facts without writing champion.json', () => {
    const root = fixtureRoot('replay-privacy')
    const { ledger, shadow } = seedPassingShadow(root)
    ledger.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
    const transition = begin(ledger, shadow.shadowId, 'promote', 1)
    ledger.recordControlledSkillActivationFailed({
      transitionId: transition.transitionId,
      reasonCode: 'persistence-unavailable',
    })
    const expectedPointer = ledger.getControlledSkillScopePointer(shadow.scopeKey)!
    const exposed = ledger.getControlledSkillScopePointer(shadow.scopeKey)!
    ;(exposed as { revision: number }).revision = 99
    const exposedTransition = ledger.getControlledSkillTransition(transition.transitionId)!
    ;(exposedTransition.postCheck.allowedTools as string[]).push('mutated')

    const replay = new EvolutionLedger(root)
    expect(replay.getControlledSkillScopePointer(shadow.scopeKey)).toEqual(expectedPointer)
    expect(replay.getControlledSkillTransition(transition.transitionId)).toEqual(transition)
    expect(replay.listControlledSkillScopePointers()).toEqual([expectedPointer])
    expect(replay.listControlledSkillTransitions()).toEqual([transition])
    expect(replay.listEvents().filter(isPublicLedgerEvent)).toEqual([])
    expect(existsSync(join(root, 'champion.json'))).toBe(false)
    const lifecycle = readFileSync(join(root, 'ledger.jsonl'), 'utf8')
      .split('\n')
      .filter(line => line.includes('controlled-skill-pointer-')
        || line.includes('controlled-skill-promoted')
        || line.includes('controlled-skill-activation-failed'))
      .join('\n')
    expect(lifecycle).not.toContain(parentSkill.content)
    expect(lifecycle).not.toMatch(
      /raw provider output|prompt|workspaceRoot|toolArgs|toolResult|credential/u,
    )
  })

  it('resolves initialize, transition, verification, and recovery commit uncertainty by replay', () => {
    const verifiedRoot = fixtureRoot('commit-unknown-verified')
    const seeded = seedPassingShadow(verifiedRoot)
    const initializeInput = { shadowId: seeded.shadow.shadowId }
    syncAudit.enabled = true
    syncAudit.failLedgerFsyncAfterReal = 1
    expect(() => seeded.ledger.initializeControlledSkillScopePointer(initializeInput))
      .toThrow(LedgerCommitUnknownError)

    const afterInitialize = new EvolutionLedger(verifiedRoot)
    expect(afterInitialize.initializeControlledSkillScopePointer(initializeInput).duplicate)
      .toBe(true)
    const transitionInput = {
      shadowId: seeded.shadow.shadowId,
      kind: 'promote' as const,
      expectedRevision: 1,
      postCheck: postCheck('promote', 1),
    }
    syncAudit.failLedgerFsyncAfterReal = 1
    expect(() => afterInitialize.beginControlledSkillTransition(transitionInput))
      .toThrow(LedgerCommitUnknownError)

    const afterTransition = new EvolutionLedger(verifiedRoot)
    const duplicate = afterTransition.beginControlledSkillTransition(transitionInput)
    expect(duplicate.duplicate).toBe(true)
    const transition = afterTransition.getControlledSkillTransition(duplicate.transitionId)!
    const run = recordTransitionRunFacts(afterTransition, transition)
    syncAudit.failLedgerFsyncAfterReal = 1
    expect(() => afterTransition.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run,
    })).toThrow(LedgerCommitUnknownError)

    const afterVerification = new EvolutionLedger(verifiedRoot)
    expect(afterVerification.getControlledSkillTransitionReceipt(transition.transitionId))
      .toMatchObject({ state: 'verified' })
    expect(afterVerification.completeControlledSkillTransition({
      transitionId: transition.transitionId,
      run,
    }).duplicate).toBe(true)

    const recoveredRoot = fixtureRoot('commit-unknown-recovered')
    const recoveredSeed = seedPassingShadow(recoveredRoot)
    recoveredSeed.ledger.initializeControlledSkillScopePointer({
      shadowId: recoveredSeed.shadow.shadowId,
    })
    const failedTransition = begin(
      recoveredSeed.ledger,
      recoveredSeed.shadow.shadowId,
      'promote',
      1,
    )
    const failureInput = {
      transitionId: failedTransition.transitionId,
      reasonCode: 'timeout' as const,
    }
    syncAudit.failLedgerFsyncAfterReal = 1
    expect(() => recoveredSeed.ledger.recordControlledSkillActivationFailed(failureInput))
      .toThrow(LedgerCommitUnknownError)

    const afterFailure = new EvolutionLedger(recoveredRoot)
    expect(afterFailure.getControlledSkillTransitionReceipt(failedTransition.transitionId))
      .toMatchObject({ state: 'recovered', reasonCode: 'timeout' })
    expect(afterFailure.recordControlledSkillActivationFailed(failureInput).duplicate).toBe(true)
  })

  it('exposes only thin controlled activation methods through the product service', () => {
    const facade = TianwenEvolutionService.prototype as unknown as Record<string, unknown>
    for (const method of [
      'initializeControlledSkillScopePointer',
      'getControlledSkillScopePointer',
      'listControlledSkillScopePointers',
      'beginControlledSkillTransition',
      'getControlledSkillTransition',
      'listControlledSkillTransitions',
      'completeControlledSkillTransition',
      'getControlledSkillTransitionReceipt',
      'recordControlledSkillActivationFailed',
    ]) expect(facade[method]).toBeTypeOf('function')
  })
})
