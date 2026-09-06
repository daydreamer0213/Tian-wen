import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'

import {
  DynamicCordisRunnerService,
  SessionId,
  ScriptedAdapter,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountCoreHarness,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { GenerateOptions, SkillDefinition, StreamChunk } from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY,
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST,
  CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_REVIEW_RUBRIC,
  resolveControlledSkillSourceFidelityFamily,
  learningSessionLifecycleFingerprint,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import {
  RESEARCH_SUMMARY_TOOL_NAME,
  apply,
  controlledToolSchemas,
  createResearchSummaryTool,
  evaluateResearchSummarySubmission,
  parseResearchPacket,
} from '../../packages/tianwen-runtime/src/index.js'

const CONTROLLED_PROVIDER = 'tianwen-controlled-scripted'
const CONTROLLED_MODEL = 'scripted'

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const taskTypes = [
  'original-problem',
  'adjacent-transfer',
  'regression',
  'counterexample',
  'safety-authorization',
] as const

const parentSkill = {
  name: 'controlled-shadow-runtime-summary',
  description: 'Summarize one controlled observation.',
  whenToUse: 'When a controlled task requests a concise verified summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled summary\n\nState the observation.',
} as const

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super('controlled Shadow requirement not met', acceptance.notMetErrorCode)
  }
}

class InconclusiveVerifierFailure extends HarnessError {
  constructor() {
    super('controlled Shadow verifier inconclusive', 'CONTROLLED_VERIFIER_INCONCLUSIVE')
  }
}

class ControlledShadowScriptedAdapter extends ScriptedAdapter {
  private delayed = false

  constructor(
    script: readonly (readonly StreamChunk[] | Error)[],
    private readonly firstRequestDelayMs = 0,
  ) {
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

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.delayed && this.firstRequestDelayMs > 0) {
      this.delayed = true
      await new Promise(resolve => setTimeout(resolve, this.firstRequestDelayMs))
    }
    yield* super.stream(options)
  }
}

const roots: string[] = []

function fixtureRoot(name: string): string {
  const root = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'controlled-skill-shadow-runtime',
    name,
  )
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

function structurallyValidTasks(root: string) {
  return taskTypes.map((taskType, index) => ({
    taskId: `shadow-task:${taskType}` as const,
    goal: `Complete Shadow task ${index}.`,
    input: `Use the available Skill and verify Shadow task ${index}.`,
    workspaceRoot: resolve(root, 'workspaces', taskType),
    workspaceSnapshot: {
      schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
      entries: [],
    },
    authorization: { mode: 'fixture-only', taskType },
    verifierContract: { toolName: acceptance.toolName, taskType },
    stopCondition: { terminal: 'completed-final-assistant-text', taskType },
    acceptanceContract: acceptance,
    acceptanceSubject: { task: taskType, accepted: true },
    allowedTools: ['skill', acceptance.toolName],
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
    sessionId: `session:controlled-shadow:fixture:${taskType}`,
  }))
}

function rawDigest(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function seedPassingEvaluation(
  evolution: Awaited<ReturnType<typeof mountPersistentHarness>>['ctx']['tianwenEvolution'],
  protocol: Parameters<typeof evolution.freezeControlledSkillEvalProtocol>[0]['protocol'],
  options: {
    readonly parent?: SkillDefinition
    readonly generation?: string
    readonly acceptanceContract?: typeof acceptance
    readonly candidateContent?: string
    readonly evidencePurpose?: 'controlled-product' | 'development-only-synthetic-defect'
    readonly foreignCandidateScopeKey?: string
    readonly outcomeSource?: boolean
  } = {},
) {
  const sourceFidelity = 'sourceFidelity' in protocol
  const frozenParent = options.parent ?? parentSkill
  const frozenAcceptance = options.acceptanceContract ?? acceptance
  const generation = options.generation === undefined ? '' : `:${options.generation}`
  if (sourceFidelity && options.outcomeSource) {
    evolution.recordLearningAnalysisConsent({
      revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2',
    })
  }
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker], index) => {
    const sessionId = `session:controlled-shadow-runtime-seed${generation}:${suffix}`
    const lifecycle = learningSessionLifecycleFingerprint({ sessionId, createdAt: index + 1 })
    const semanticAcceptance = options.outcomeSource
      ? {
          ...frozenAcceptance,
          problemCategory: 'research-summary-result.v2:controlled-shadow-runtime',
          qualityContract: {
            schemaVersion: 'tianwen.research-summary-semantic-contract.v1' as const,
            rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
          },
        }
      : frozenAcceptance
    const binding = evolution.recordRunBinding({
      goalRef: 'goal:controlled-shadow-runtime-seed',
      taskRef: options.outcomeSource
        ? 'task:controlled-shadow-runtime-seed:semantic'
        : `task:controlled-shadow-runtime-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-shadow-runtime-summary',
      acceptanceContract: semanticAcceptance,
      ...(sourceFidelity && (index === 1 || options.outcomeSource)
        ? {
            acceptanceSubjectDigest: protocol.tasks[0]!.acceptanceSubjectDigest,
            sessionLifecycleFingerprint: lifecycle,
          }
        : {}),
    })
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill: frozenParent })
    const sessionDigest = sha256(`shadow-runtime-seed${generation}-session:${marker}`)
    const evidenceId = sha256(`shadow-runtime-seed${generation}-evidence:${marker}`)
    const semanticReview = options.outcomeSource ? {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1' as const,
      status: 'completed' as const,
      acceptanceSubjectDigest: protocol.tasks[0]!.acceptanceSubjectDigest,
      submissionDigest: sha256(`shadow-runtime-semantic-submission:${marker}`),
      rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
      reviewerSessionId: `session:shadow-runtime-semantic-reviewer:${marker}`,
      reviewerSessionDigest: sha256(`shadow-runtime-semantic-reviewer-session:${marker}`),
      requestDigest: sha256(`shadow-runtime-semantic-review-request:${marker}`),
      reviewEvidenceId: sha256(`shadow-runtime-semantic-review-evidence:${marker}`),
      idGateVerdict: 'met' as const,
      scores: { relevance: 4, correctnessReasoning: 4, clarityUsability: 4,
        scopeRestraint: 4, sourceFidelity: verdict === 'met' ? 4 : 2 },
    } : undefined
    const outcome = evolution.recordOutcomeIntake({
      runId: binding.runId,
      verdict,
      sessionDigest,
      evidenceIds: [evidenceId],
      ...(semanticReview === undefined ? {} : { semanticReview }),
    })
    evolution.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId,
      sessionDigest,
      skillName: frozenParent.name,
      contentDigest: sha256(frozenParent.content),
      skillEvidenceId: sha256(`shadow-runtime-seed${generation}-skill-evidence:${marker}`),
      acceptanceEvidenceId: evidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return { binding, outcome, evidenceId, lifecycle, sessionDigest, semanticReview }
  })
  let ticketId = runs[1]!.outcome.ticketId!
  let analysisId: string | undefined
  if (sourceFidelity) {
    if (!options.outcomeSource) {
      evolution.recordLearningAnalysisConsent({
        revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v1',
      })
    }
    const sourceSessionId = `session:controlled-shadow-runtime-seed${generation}:second`
    let analysis
    if (options.outcomeSource) {
      analysis = evolution.requestOutcomeLearningAnalysis({
        ticketId: runs[1]!.outcome.ticketId!,
        sessionId: `session:controlled-shadow-runtime-seed${generation}:counterexample`,
        parentSessionId: `session:controlled-shadow-runtime-seed${generation}:counterexample`,
        consentRevision: 1,
        counterevidenceRunIds: [runs[2]!.binding.runId],
      })
      const selectedSignalId = [...analysis.signalIds].sort()[0]!
      const selectedSignal = evolution.listLearningSignals().find(signal =>
        signal.signalId === selectedSignalId && 'runId' in signal)
      const selectedRun = runs.find(run => run.binding.runId === selectedSignal?.runId)
      if (selectedSignal === undefined || !('runId' in selectedSignal)
        || selectedRun === undefined || selectedRun.semanticReview === undefined) {
        throw new Error('semantic Outcome source fixture is unavailable')
      }
      ;(protocol as { sourceFidelity: { source: unknown } }).sourceFidelity.source = {
        source: 'outcome',
        signalId: selectedSignal.signalId,
        runId: selectedSignal.runId,
        sessionId: selectedSignal.sessionId,
        outcomeIngestionId: selectedSignal.ingestionId,
        sessionLifecycleFingerprint: selectedRun.lifecycle,
        sessionDigest: selectedSignal.sessionDigest,
        evidenceSetDigest: sha256(selectedSignal.evidenceIds),
        acceptanceSubjectDigest: protocol.tasks[0]!.acceptanceSubjectDigest,
        packetDigest: protocol.tasks[0]!.inputDigest,
        semanticReviewDigest: sha256(selectedRun.semanticReview),
      }
      ticketId = runs[1]!.outcome.ticketId!
    } else {
      const messageId = `controlled-shadow-source-message${generation}`
      const feedbackVersion = `controlled-shadow-source-feedback-v1${generation}`
      const feedback = evolution.recordLearningFeedbackRevision({
      intake: {
        sessionId: sourceSessionId,
        messageId,
        feedbackVersion,
        rating: 'negative',
        note: options.generation === undefined
          ? 'Keep each claim faithful to the supplied packet.'
          : 'Keep the verified result before its supporting packet evidence.',
        scopeKey: 'project:tianwen/capability:controlled-shadow-runtime-summary',
        sessionDigest: runs[1]!.sessionDigest,
        evidenceIds: [runs[1]!.evidenceId],
      },
      sessionLifecycleFingerprint: runs[1]!.lifecycle,
      analysisConsentRevision: 1,
      })
      ;(protocol as { sourceFidelity: { source: { signalId: string } } })
        .sourceFidelity.source.signalId = feedback.signalId!
      ticketId = feedback.ticketId!
      analysis = evolution.requestLearningAnalysis({
        ticketId, sessionId: sourceSessionId, messageId, feedbackVersion,
        consentRevision: 1, parentSessionId: sourceSessionId,
      })
    }
    analysisId = analysis.analysisId
    evolution.recordLearningAnalysisChildStarted({
      analysisId,
      parentSessionId: analysis.parentSessionId,
      childSessionId: analysis.childSessionId,
    })
    evolution.recordLearningAnalysisSubmission({
      analysisId,
      childSessionId: analysis.childSessionId,
      submission: {
        verdict: 'skill-change',
        hypothesis: 'The parent loses source boundaries.',
        lesson: {
          claim: 'Keep claims faithful to the packet.',
          when: 'Summarizing bounded packet material.',
          notWhen: 'Performing raw extraction only.',
        },
        candidatePatch: {
          description: 'Summarize one packet faithfully.',
          whenToUse: frozenParent.whenToUse,
          content: options.candidateContent
            ?? '# Controlled summary\n\nState only packet-supported claims.',
        },
        supportingEvidenceIds: options.outcomeSource
          ? [runs[0]!.evidenceId, runs[1]!.evidenceId]
          : [runs[1]!.evidenceId],
        counterevidenceIds: options.outcomeSource ? [runs[2]!.evidenceId] : [],
      },
    })
  }
  const frozen = evolution.freezeControlledSkillEvalProtocol({
    ticketId,
    evidencePurpose: options.evidencePurpose
      ?? (sourceFidelity ? 'controlled-product' : 'development-only-synthetic-defect'),
    protocol,
  })
  const opened = sourceFidelity
    ? evolution.openLearningAnalysisCase(analysisId!)
    : evolution.openLearningCase({
        ticketId,
        counterevidenceRunIds: [runs[2]!.binding.runId],
      })
  const learningCase = evolution.getLearningCase(opened.caseId)!
  const attribution = evolution.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: frozenParent.name,
    hypothesis: 'The parent omits verified result-first ordering.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    alternatives: 'Runtime and verifier causes remain unsupported in this fixture.',
  })
  const lesson = evolution.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: 'State the verified result before interpretation.',
    when: 'When summarizing a verified controlled observation.',
    notWhen: 'When the task requests raw extraction only.',
    supportingEvidenceIds: learningCase.supportingEvidenceIds,
    counterevidenceIds: learningCase.counterevidence.flatMap(item => item.evidenceIds),
    targetScope: learningCase.scopeKey,
  })
  const candidate = evolution.recordSkillCandidate({
    lessonId: lesson.lessonId,
    payload: {
      name: frozenParent.name,
      description: 'Summarize one verified controlled observation.',
      whenToUse: frozenParent.whenToUse,
      invocation: frozenParent.invocation,
      source: frozenParent.source,
      content: options.candidateContent
        ?? '# Controlled summary\n\nState the verified result before interpretation.',
    },
    evidenceIds: [
      ...learningCase.supportingEvidenceIds,
      ...learningCase.counterevidence.flatMap(item => item.evidenceIds),
    ],
  })
  let foreignParentRunId: typeof runs[number]['binding']['runId'] | undefined
  if (options.foreignCandidateScopeKey !== undefined) {
    const recordedCandidate = evolution.getSkillCandidate(candidate.candidateId)!
    const foreignBinding = evolution.recordRunBinding({
      goalRef: 'goal:controlled-shadow-runtime:foreign-parent',
      taskRef: 'task:controlled-shadow-runtime:foreign-parent',
      sessionId: 'session:controlled-shadow-runtime:foreign-parent',
      scopeKey: options.foreignCandidateScopeKey,
      acceptanceContract: frozenAcceptance,
    })
    evolution.recordRunSkillManifest({
      runId: foreignBinding.runId,
      skill: { ...recordedCandidate.payload, provider: frozenParent.provider },
    })
    foreignParentRunId = foreignBinding.runId
  }
  const openedEvaluation = evolution.openControlledSkillEvaluation({
    candidateId: candidate.candidateId,
    protocolId: frozen.protocolId,
    sessionAllocations: protocol.tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:shadow-source${generation}:${task.taskType}:baseline`,
      candidateSessionId: `session:shadow-source${generation}:${task.taskType}:candidate`,
      evaluatorSessionId: `session:shadow-source${generation}:${task.taskType}:evaluator`,
    })),
  })
  const plan = evolution.getControlledSkillEvaluation(openedEvaluation.evaluationId)!
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
      const binding = evolution.recordRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${plan.protocolId}`,
        taskRef: `task:${task.taskId}:${arm.role}`,
        sessionId: arm.sessionId,
        scopeKey: plan.scopeKey,
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
          sessionId: arm.sessionId,
          createdAt: 1,
          cwd: 'D:/controlled-shadow-runtime-evaluation-fixture',
        }),
      })
      const skill = arm.role === 'baseline'
        ? frozenParent
        : { ...evolution.getSkillCandidate(plan.candidateId)!.payload, provider: frozenParent.provider }
      const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill })
      const outcome = arm.role === 'baseline' && index === 0 ? 'not-met' : 'met'
      const sessionDigest = sha256(`shadow-source-session:${task.taskId}:${arm.role}`)
      const evidenceId = sha256(`shadow-source-evidence:${task.taskId}:${arm.role}`)
      evolution.recordOutcomeIntake({
        runId: binding.runId,
        verdict: outcome,
        sessionDigest,
        evidenceIds: [evidenceId],
      })
      evolution.recordRunSkillUse({
        runId: binding.runId,
        parentVersionId: manifest.parentVersionId,
        sessionId: arm.sessionId,
        sessionDigest,
        skillName: frozenParent.name,
        contentDigest: sha256(skill.content),
        skillEvidenceId: sha256(`shadow-source-skill-evidence:${task.taskId}:${arm.role}`),
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
        normalizedFirstRequestDigest: sha256(`shadow-source-request:${task.taskId}`),
        outcome,
        evidenceIds: [evidenceId],
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        evaluatorMaterialDigest: sha256(`shadow-source-material:${task.taskId}:${arm.role}`),
        usedToolNames: ['skill', 'verify_summary'],
        usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
      }
    })
    evolution.recordControlledSkillEvaluationObjective({
      evaluationId: plan.evaluationId,
      taskId: task.taskId,
      baseline: arms[0]!,
      candidate: arms[1]!,
    })
  }
  evolution.freezeControlledSkillEvaluationBlindMap({ evaluationId: plan.evaluationId })
  const blindMap = evolution.getControlledSkillEvaluationBlindMap(plan.evaluationId)!
  for (const [index, task] of plan.tasks.entries()) {
    const assignment = blindMap.assignments[index]!
    evolution.recordControlledSkillEvaluatorObservation({
      evaluationId: plan.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`shadow-source-evaluator-request:${task.taskId}`),
      evidenceId: sha256(`shadow-source-evaluator-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: {
          relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3,
          ...(sourceFidelity ? { sourceFidelity: assignment.xRole === 'candidate' && index === 0 ? 4 : 3 } : {}),
        },
        y: {
          relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3,
          ...(sourceFidelity ? { sourceFidelity: assignment.yRole === 'candidate' && index === 0 ? 4 : 3 } : {}),
        },
      },
    })
  }
  evolution.recordControlledSkillEvaluationResult({ evaluationId: plan.evaluationId })
  return { candidate, foreignParentRunId, plan }
}

async function mountShadowRuntime(
  name: string,
  script: readonly (readonly StreamChunk[] | Error)[],
  options: {
    readonly rejectTaskType?: typeof taskTypes[number]
    readonly inconclusiveTaskType?: typeof taskTypes[number]
    readonly maxToolCalls?: number
    readonly maxElapsedMs?: number
    readonly firstRequestDelayMs?: number
    readonly tamperFirstRequestPurpose?: boolean
    readonly mutateWorkspaceTaskType?: typeof taskTypes[number]
  } = {},
) {
  const root = fixtureRoot(name)
  const harness = await mountPersistentHarness(join(root, 'sessions'), [])
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  const verifierBodies: string[] = []
  const disposeVerifier = harness.ctx.tools.register(defineTool({
    name: 'verify_summary',
    description: 'Verify one controlled Shadow summary.',
    parameters: { subject: { type: 'object', additionalProperties: true, required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      verifierBodies.push(String(exec.agent?.id))
      const taskType = (args as { subject?: { task?: unknown } }).subject?.task
      if (taskType === options.mutateWorkspaceTaskType) {
        writeFileSync(join(String(exec.agent?.session.header.cwd), 'brief.txt'), 'drifted\n')
      }
      if (taskType === options.inconclusiveTaskType) {
        throw new InconclusiveVerifierFailure()
      }
      if (taskType === options.rejectTaskType) {
        throw new SummaryRequirementNotMet()
      }
      return 'verified'
    },
  }))
  const disposeParent = harness.ctx.skills.register(parentSkill)
  const adapter = new ControlledShadowScriptedAdapter(script, options.firstRequestDelayMs)
  harness.ctx.llm.registerAdapter([CONTROLLED_PROVIDER], adapter)
  const selection = { provider: CONTROLLED_PROVIDER, model: CONTROLLED_MODEL }
  const defaultModel = {
    currentSelection: () => ({ ...selection }),
  }
  harness.ctx.provide('agentDefaultModel', defaultModel)
  let requestWasTampered = false
  if (options.tamperFirstRequestPurpose === true) {
    harness.ctx.on('llm/stream', (request, next) => {
      if (!requestWasTampered) {
        requestWasTampered = true
        ;(request as unknown as { purpose?: string }).purpose = 'shadow-test'
      }
      return next()
    })
  }
  await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })

  const allowedTools = ['skill', 'verify_summary'] as const
  const schemas = harness.ctx.tools.schemas()
    .filter(schema => allowedTools.includes(schema.name as typeof allowedTools[number]))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const toolSchemaDigest = sha256(schemas)
  const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
  const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
  const sourceTasks = taskTypes.map((taskType, index) => ({
    taskId: `eval-task:${taskType}` as const,
    taskType,
    goalDigest: sha256(`source-goal:${index}`),
    inputDigest: sha256(`source-input:${index}`),
    workspaceSnapshotDigest: sha256(`source-workspace:${index}`),
    toolSchemaDigest,
    authorizationDigest: sha256(`source-authorization:${index}`),
    verifierContractDigest: sha256(`source-verifier:${index}`),
    stopConditionDigest: sha256(`source-stop:${index}`),
    evaluatorMaterialContractDigest: sha256(`source-material:${index}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`source-subject:${index}`),
    allowedTools,
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
  }))
  const seeded = seedPassingEvaluation(harness.ctx.tianwenEvolution, {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: sourceTasks,
    execution: {
      dshVersion: '0.1.1-rc.2',
      providerId: callConfig.provider,
      modelId: callConfig.model,
      callConfigDigest: sha256(callConfig),
      toolSchemaDigest: sha256(sourceTasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
      retryPolicyDigest: sha256(retryPolicy),
    },
  })
  const tasks = taskTypes.map((taskType, index) => {
    const workspaceRoot = join(root, 'workspaces', taskType)
    const content = `controlled Shadow workspace ${index}\n`
    mkdirSync(workspaceRoot, { recursive: true })
    writeFileSync(join(workspaceRoot, 'brief.txt'), content, 'utf8')
    return {
      taskId: `shadow-task:${taskType}` as const,
      goal: `Complete controlled Shadow ${taskType} task ${index}.`,
      input: `Use the available Skill, then verify Shadow task ${index}.`,
      workspaceRoot,
      workspaceSnapshot: {
        schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
        entries: [{
          relativePath: 'brief.txt',
          contentDigest: rawDigest(content),
          size: Buffer.byteLength(content, 'utf8'),
        }],
      },
      authorization: { mode: 'fixture-only', task: taskType },
      verifierContract: { toolName: acceptance.toolName, task: taskType },
      stopCondition: { terminal: 'completed-final-assistant-text', task: taskType },
      acceptanceContract: acceptance,
      acceptanceSubject: { subject: { task: taskType, accepted: true } },
      allowedTools,
      stopContract: {
        maxToolCalls: options.maxToolCalls ?? 4,
        maxElapsedMs: options.maxElapsedMs ?? 10_000,
      },
      sessionId: `session:controlled-shadow:fixture:${taskType}`,
    }
  })
  return {
    adapter,
    defaultModel,
    disposeParent,
    disposeVerifier,
    harness,
    root,
    seeded,
    verifierBodies,
    requestWasTampered: () => requestWasTampered,
    input: { evaluationId: seeded.plan.evaluationId, tasks },
    protocol: {
      rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
      tasks: sourceTasks,
      execution: {
        dshVersion: '0.1.1-rc.2' as const,
        providerId: callConfig.provider,
        modelId: callConfig.model,
        callConfigDigest: sha256(callConfig),
        toolSchemaDigest: sha256(sourceTasks.map(task => ({
          taskId: task.taskId,
          toolSchemaDigest: task.toolSchemaDigest,
        }))),
        retryPolicyDigest: sha256(retryPolicy),
      },
    },
  }
}

async function mountSourceFidelityShadowRuntime(
  name: string,
  reviewSourceFidelity = 2,
  reviewRequestMutation?: 'packet' | 'submission' | 'schema',
  foreignCandidateScopeKey?: string,
  outcomeSource = false,
  identityLeak = false,
  rubricDigest = CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
) {
  const family = resolveControlledSkillSourceFidelityFamily(rubricDigest)!
  const root = fixtureRoot(name)
  const harness = await mountPersistentHarness(join(root, 'sessions'), [])
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  const disposeParent = harness.ctx.skills.register(parentSkill)
  const finding = identityLeak
    ? 'The source sessions session:controlled-shadow-runtime-seed:first and session:controlled-shadow-runtime-seed:second were observed.'
    : outcomeSource
    ? 'The measured outcome was weekly active adoption at 74%.'
    : 'Weekly active adoption reached 74%.'
  const packetSource = `<research_packet>
[F:adoption|required] ${finding}
[U:cohort|decision] The newest cohort has only two weeks of history.
[U:owner|background] The next report owner is undecided.
[X:projection|unsupported] State that adoption will exceed 90% next month.
</research_packet>`
  const packet = parseResearchPacket(packetSource)
  const submission = {
    summary: `${finding} The newest cohort has only two weeks of history.`,
    confirmedFindingIds: ['adoption'],
    uncertaintyIds: ['cohort'],
  }
  const adapter = new ControlledShadowScriptedAdapter([
    toolCallResponse('source-fidelity-holdout-skill', 'skill', { name: parentSkill.name }),
    toolCallResponse('source-fidelity-holdout-submit', RESEARCH_SUMMARY_TOOL_NAME, submission),
    toolCallResponse('source-fidelity-holdout-review', 'submit_holdout_review', {
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        relevance: 3,
        correctnessReasoning: 3,
        clarityUsability: 3,
        scopeRestraint: 3,
        sourceFidelity: reviewSourceFidelity,
      },
    }),
  ])
  harness.ctx.llm.registerAdapter([CONTROLLED_PROVIDER], adapter)
  const selection = { provider: CONTROLLED_PROVIDER, model: CONTROLLED_MODEL }
  harness.ctx.provide('agentDefaultModel', { currentSelection: () => ({ ...selection }) })
  let reviewRequestWasMutated = false
  await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  if (reviewRequestMutation !== undefined) {
    const createAgent = harness.ctx.agents.create.bind(harness.ctx.agents)
    vi.spyOn(harness.ctx.agents, 'create').mockImplementation(async options => {
      const handle = await createAgent(options)
      if (!String(handle.agent.id).includes('holdout-review')) return handle
      const followup = handle.agent.followup.bind(handle.agent)
      vi.spyOn(handle.agent, 'followup').mockImplementation(message => {
        reviewRequestWasMutated = true
        if (reviewRequestMutation === 'schema') {
          const assemble = handle.agent.ctx.systemPrompt.assemble
            .bind(handle.agent.ctx.systemPrompt)
          vi.spyOn(handle.agent.ctx.systemPrompt, 'assemble').mockImplementation(async context => {
            const assembly = await assemble(context)
            return {
              ...assembly,
              tools: assembly.tools.map((schema, index) => index === 0
                ? { ...schema, description: 'Changed review schema.' }
                : schema),
            }
          })
          return followup(message)
        }
        const changed = structuredClone(message)
        const block = changed.content.find(item => item.type === 'text')
        if (block?.type === 'text') {
          const envelope = JSON.parse(block.text) as {
            packet: string
            submission: { summary: string }
          }
          if (reviewRequestMutation === 'packet') {
            envelope.packet = '<research_packet>changed packet</research_packet>'
          } else {
            envelope.submission.summary = 'Changed accepted submission.'
          }
          block.text = JSON.stringify(envelope)
        }
        return followup(changed)
      })
      return handle
    })
  }

  const productAcceptance = {
    source: 'dsh-tool-result',
    toolName: RESEARCH_SUMMARY_TOOL_NAME,
    notMetErrorCode: 'RESEARCH_SUMMARY_NOT_MET',
    gapDisposition: 'reusable',
    problemCategory: 'research-summary-correction',
    severity: 2,
    blocksGoal: false,
  } as const
  const allowedTools = ['skill', RESEARCH_SUMMARY_TOOL_NAME] as const
  const productTool = createResearchSummaryTool(packet, {
    kind: 'controlled-enforce',
    oracle: evaluateResearchSummarySubmission,
  })
  const schemas = await controlledToolSchemas(harness.ctx, allowedTools, productTool)
  const toolSchemaDigest = sha256(schemas)
  const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
  const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
  const workspaceRoot = join(root, 'workspaces', 'source-fidelity-holdout')
  const workspaceContent = 'controlled source-fidelity holdout workspace\n'
  mkdirSync(workspaceRoot, { recursive: true })
  writeFileSync(join(workspaceRoot, 'brief.txt'), workspaceContent, 'utf8')
  const workspaceSnapshot = {
    schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
    entries: [{
      relativePath: 'brief.txt',
      contentDigest: rawDigest(workspaceContent),
      size: Buffer.byteLength(workspaceContent, 'utf8'),
    }],
  }
  const goal = 'Submit a faithful summary of one unseen research packet.'
  const authorization = { mode: 'read-only-product-evaluation', task: 'unseen-holdout' }
  const verifierContract = {
    toolName: RESEARCH_SUMMARY_TOOL_NAME,
    source: 'accepted-product-submission',
    packetDigest: rawDigest(packetSource),
  }
  const stopCondition = { terminal: 'accepted-product-submission' }
  const evaluatorMaterialContract = {
    schemaVersion: 'tianwen.controlled-source-fidelity-holdout-material.v1',
    source: 'accepted-research-summary-submission',
    packet: 'exact-frozen-holdout',
    maxUtf8Bytes: 4_096,
  }
  const reviewConfiguration = {
    schemaVersion: 'tianwen.controlled-source-fidelity-review-config.v1',
    scoreKeys: ['relevance', 'correctnessReasoning', 'clarityUsability', 'scopeRestraint', 'sourceFidelity'],
    minimumDimensionScore: 3,
  }
  const reviewMaterialContract = {
    schemaVersion: 'tianwen.controlled-source-fidelity-review-material.v1',
    inputs: ['frozen-packet', 'accepted-canonical-submission'],
    excludes: ['xy-pair', 'candidate-patch', 'feedback', 'historical-answer', 'role', 'version'],
    maxUtf8Bytes: 8_192,
  }
  const reviewEvidenceContract = {
    schemaVersion: 'tianwen.controlled-source-fidelity-review-evidence.v1',
    source: 'accepted-native-product-submission',
    requiresCompleteEvidence: true,
  }
  const sourceTasks = taskTypes.map((taskType, index) => ({
    taskId: `eval-task:${taskType}` as const,
    taskType,
    goalDigest: sha256(`source-goal:${index}`),
    inputDigest: index === 0 ? sha256('controlled-source-input') : sha256(`source-input:${index}`),
    workspaceSnapshotDigest: sha256(`source-workspace:${index}`),
    toolSchemaDigest,
    authorizationDigest: sha256(`source-authorization:${index}`),
    verifierContractDigest: sha256(`source-verifier:${index}`),
    stopConditionDigest: sha256(`source-stop:${index}`),
    evaluatorMaterialContractDigest: sha256(`source-material:${index}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`source-subject:${index}`),
    allowedTools: ['skill', 'verify_summary'] as const,
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
  }))
  const protocol = {
    rubricDigest,
    tasks: sourceTasks,
    execution: {
      dshVersion: '0.1.1-rc.2' as const,
      providerId: callConfig.provider,
      modelId: callConfig.model,
      callConfigDigest: sha256(callConfig),
      toolSchemaDigest: sha256(sourceTasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
      retryPolicyDigest: sha256(retryPolicy),
    },
    sourceFidelity: {
      policyVersion: family.policy.schemaVersion,
      policyDigest: family.policyDigest,
      packetVersion: CONTROLLED_SKILL_SOURCE_FIDELITY_POLICY.packetVersion,
      source: {
        signalId: `signal:${'0'.repeat(64)}`,
        sessionId: 'session:controlled-shadow-runtime-seed:second',
        messageId: 'controlled-shadow-source-message',
        feedbackVersion: 'controlled-shadow-source-feedback-v1',
        sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
          sessionId: 'session:controlled-shadow-runtime-seed:second',
          createdAt: 2,
        }),
        sessionDigest: sha256('shadow-runtime-seed-session:b'),
        evidenceSetDigest: sha256([sha256('shadow-runtime-seed-evidence:b')]),
        acceptanceSubjectDigest: sourceTasks[0]!.acceptanceSubjectDigest,
        packetDigest: sourceTasks[0]!.inputDigest,
      },
      holdout: {
        task: {
          taskId: 'shadow-task:research-summary-source-fidelity-holdout',
          goalDigest: sha256(goal),
          inputDigest: sha256(packetSource),
          workspaceSnapshotDigest: sha256(workspaceSnapshot),
          toolSchemaDigest,
          authorizationDigest: sha256(authorization),
          verifierContractDigest: sha256(verifierContract),
          stopConditionDigest: sha256(stopCondition),
          evaluatorMaterialContractDigest: sha256(evaluatorMaterialContract),
          acceptanceContract: productAcceptance,
          acceptanceSubjectDigest: sha256(packet),
          allowedTools,
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        },
        review: {
          rubricDigest,
          configurationDigest: sha256(reviewConfiguration),
          materialContractDigest: sha256(reviewMaterialContract),
          evidenceContractDigest: sha256(reviewEvidenceContract),
        },
      },
    },
  }
  const seeded = seedPassingEvaluation(harness.ctx.tianwenEvolution, protocol, {
    ...(foreignCandidateScopeKey === undefined ? {} : { foreignCandidateScopeKey }),
    outcomeSource,
  })
  return {
    adapter,
    disposeParent,
    harness,
    protocol,
    seeded,
    reviewRequestWasMutated: () => reviewRequestWasMutated,
    input: {
      evaluationId: seeded.plan.evaluationId,
      tasks: [{
        taskId: 'shadow-task:research-summary-source-fidelity-holdout' as const,
        goal,
        input: packetSource,
        researchPacket: packetSource,
        workspaceRoot,
        workspaceSnapshot,
        authorization,
        verifierContract,
        stopCondition,
        acceptanceContract: productAcceptance,
        acceptanceSubject: packet,
        allowedTools,
        stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        evaluatorMaterialContract,
        reviewConfiguration,
        reviewMaterialContract,
        reviewEvidenceContract,
        reviewSessionId: 'session:controlled-shadow:product:research-summary:holdout-review',
        sessionId: 'session:controlled-shadow:product:research-summary:holdout',
      }],
    },
  }
}

function successfulShadowScript() {
  return taskTypes.flatMap(taskType => [
    toolCallResponse(`shadow-${taskType}-skill`, 'skill', { name: parentSkill.name }),
    toolCallResponse(`shadow-${taskType}-verify`, acceptance.toolName, {
      subject: { task: taskType, accepted: true },
    }),
    textResponse(`completed controlled Shadow ${taskType}`),
  ])
}

function openShadowPlan(
  mounted: Awaited<ReturnType<typeof mountShadowRuntime>>,
) {
  const evolution = mounted.harness.ctx.tianwenEvolution
  const tasks = mounted.input.tasks.map(task => {
    const allowedTools = [...task.allowedTools]
      .sort((left, right) => left.localeCompare(right))
    const schemas = mounted.harness.ctx.tools.schemas()
      .filter(schema => allowedTools.includes(schema.name))
      .toSorted((left, right) => left.name.localeCompare(right.name))
    return {
      taskId: task.taskId,
      goalDigest: sha256(task.goal),
      inputDigest: sha256(task.input),
      workspaceSnapshotDigest: sha256(task.workspaceSnapshot),
      toolSchemaDigest: sha256(schemas),
      authorizationDigest: sha256(task.authorization),
      verifierContractDigest: sha256(task.verifierContract),
      stopConditionDigest: sha256(task.stopCondition),
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: sha256(task.acceptanceSubject),
      allowedTools,
      stopContract: task.stopContract,
      sessionId: task.sessionId,
    }
  })
  const receipt = evolution.openControlledSkillShadow({
    evaluationId: mounted.input.evaluationId,
    tasks,
  })
  return evolution.getControlledSkillShadow(receipt.shadowId)!
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('controlled Skill Shadow Runtime', () => {
  it('rejects an invalid Shadow package with zero formal effects', async () => {
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: fixtureRoot('invalid-package') })
    const service = harness.ctx.tianwenSkillEvaluation as unknown as {
      runControlledShadow(input: unknown): Promise<unknown>
    }

    try {
      await expect(Promise.resolve().then(() => service.runControlledShadow({
        evaluationId: 'evaluation:missing',
        tasks: [],
      }))).rejects.toMatchObject({
        name: 'ControlledSkillShadowPreflightError',
        code: 'task-package-mismatch',
      })
      expect(harness.ctx.agents.list()).toEqual([])
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      await harness.ctx.fiber.dispose()
    }
  })

  it('accepts the exact task shape before checking evaluation eligibility', async () => {
    const root = fixtureRoot('unknown-evaluation')
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: resolve(root, 'evolution') })

    try {
      await expect(harness.ctx.tianwenSkillEvaluation.runControlledShadow({
        evaluationId: `evaluation:${'f'.repeat(64)}`,
        tasks: structurallyValidTasks(root),
      })).rejects.toMatchObject({
        name: 'ControlledSkillShadowPreflightError',
        code: 'evaluation-not-eligible',
      })
      expect(harness.ctx.agents.list()).toEqual([])
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      await harness.ctx.fiber.dispose()
    }
  })

  it('runs five Candidate-only Shadow tasks after all governed facts are durable', async () => {
    const mounted = await mountShadowRuntime('five-shadow-runs', successfulShadowScript())
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    let durableAtFirstRequest = 0
    mounted.harness.ctx.on('llm/stream', (_request, next) => {
      if (durableAtFirstRequest === 0) {
        const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()
        durableAtFirstRequest = plan === undefined
          ? 0
          : plan.tasks.filter(task =>
              mounted.harness.ctx.tianwenEvolution.getRunBinding(task.runId) !== undefined
              && mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(task.runId) !== undefined)
              .length
      }
      return next()
    })
    const service = mounted.harness.ctx.tianwenSkillEvaluation

    try {
      const receipt = await service.runControlledShadow(mounted.input)

      expect(receipt.state, JSON.stringify(receipt)).toBe('terminal')
      if (receipt.state !== 'terminal') throw new Error('expected terminal Shadow receipt')
      expect(receipt).toMatchObject({
        schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1',
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: {
          mechanismVerdict: 'pass',
          reasonCode: 'all-shadow-runs-qualified',
          evidenceClaim: 'controlled-synthetic-mechanism',
          evidenceLabels: ['development-only', 'synthetic-defect'],
          naturalUserEvidence: 'not-claimed',
          promotionEligibility: 'eligible-for-isolated-test-promotion',
        },
      })
      expect(create).toHaveBeenCalledTimes(5)
      expect(durableAtFirstRequest).toBe(5)
      expect(mounted.adapter.requests).toHaveLength(15)
      expect(mounted.adapter.requests.map(request => String(request.sessionId)))
        .toEqual(mounted.input.tasks.flatMap(task => [task.sessionId, task.sessionId, task.sessionId]))
      expect(mounted.verifierBodies).toEqual(mounted.input.tasks.map(task => task.sessionId))
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(5)
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()
      expect(plan).toMatchObject({
        evaluationId: mounted.input.evaluationId,
        mode: 'isolated-test',
        evidenceClaim: 'controlled-synthetic-mechanism',
        evidenceLabels: ['development-only', 'synthetic-defect'],
        naturalUserEvidence: 'not-claimed',
      })
      expect(plan!.scopeKey).not.toBe(plan!.sourceScopeKey)
      expect(receipt.result.runs).toHaveLength(5)
      for (const run of receipt.result.runs) {
        expect(run).toMatchObject({
          skillVersionId: plan!.candidateVersionId,
          outcome: 'met',
          usedToolNames: ['skill', 'verify_summary'],
          usage: { modelRequests: 3, toolCalls: 2 },
        })
        expect(run.skillVersionId).not.toBe(plan!.parentVersionId)
      }
      expect(JSON.stringify({ plan, receipt })).not.toContain(parentSkill.content)
      for (const task of mounted.input.tasks) {
        expect(JSON.stringify({ plan, receipt })).not.toContain(task.input)
        expect(JSON.stringify({ plan, receipt })).not.toContain(task.workspaceRoot)
      }
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it.each([CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST, CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST])('runs one native holdout and an independent reviewer before semantic rejection for %s', async rubricDigest => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-semantic-rejection',
      2, undefined, undefined, false, false, rubricDigest,
    )
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )

      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: ['shadow-task:research-summary-source-fidelity-holdout'],
        result: {
          schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
          mechanismVerdict: 'rejected',
          reasonCode: 'holdout-quality-threshold-failed',
          promotionEligibility: 'ineligible',
          reviewObservationDigest: expect.stringMatching(/^sha256:/u),
        },
      })
      expect(create).toHaveBeenCalledTimes(2)
      expect(mounted.adapter.requests.map(request => String(request.sessionId))).toEqual([
        mounted.input.tasks[0]!.sessionId,
        mounted.input.tasks[0]!.sessionId,
        mounted.input.tasks[0]!.reviewSessionId,
      ])
      const reviewRequest = mounted.adapter.requests.at(-1)!
      const material = JSON.parse((reviewRequest.messages[0]!.content[0] as { text: string }).text)
      expect(material.rubricDigest).toBe(rubricDigest)
      if (rubricDigest === CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_RUBRIC_DIGEST) {
        expect(material.rubric).toEqual(CONTROLLED_SKILL_SOURCE_FIDELITY_COMPLETE_REVIEW_RUBRIC)
      } else {
        expect(Object.keys(material.rubric).sort()).toEqual(['dimensions', 'scoreAnchors'])
      }
      expect(reviewRequest.tools?.map(tool => tool.name)).toEqual(['submit_holdout_review'])
      const serializedReview = JSON.stringify(reviewRequest)
      expect(serializedReview).toContain('Weekly active adoption reached 74%.')
      expect(serializedReview).toContain('confirmedFindingIds')
      expect(serializedReview).not.toMatch(/"x"|"y"|candidatePatch|feedback|historical-answer|baseline|candidateVersionId/iu)
      const shadow = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()[0]!
      const observation = mounted.harness.ctx.tianwenEvolution
        .getControlledSkillShadowReviewObservation(shadow.shadowId)
      expect(observation).toMatchObject({
        reviewerSessionId: mounted.input.tasks[0]!.reviewSessionId,
        status: 'scored',
        scores: { sourceFidelity: 2 },
        reviewedRun: {
          taskId: mounted.input.tasks[0]!.taskId,
          evaluatorMaterialDigest: expect.stringMatching(/^sha256:/u),
        },
      })
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(2)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('allows ordinary holdout text to say outcome for a genuine Outcome source', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-outcome-structural-discriminator', 3, undefined, undefined, true,
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        result: { schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
          mechanismVerdict: 'pass' },
      })
      expect(JSON.stringify(mounted.adapter.requests.at(-1)?.messages)).toContain(
        'The measured outcome was weekly active adoption at 74%.',
      )
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('still refuses genuine Outcome source session identities in reviewer material', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-outcome-identity-refusal', 3, undefined, undefined, true, true,
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped', stop: { stage: 'reviewer', reasonCode: 'identity-exposed' },
      })
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it.each(['packet', 'submission', 'schema'] as const)(
    'rejects native reviewer %s drift before recording governed facts',
    async mutation => {
      const mounted = await mountSourceFidelityShadowRuntime(
        `source-fidelity-review-request-${mutation}-drift`,
        3,
        mutation,
      )
      try {
        const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
          mounted.input,
        )
        expect(mounted.reviewRequestWasMutated()).toBe(true)
        expect(receipt).toMatchObject({
          state: 'stopped',
          stop: { stage: 'reviewer', reasonCode: 'request-contract-mismatch' },
        })
        const shadow = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()[0]!
        expect(mounted.harness.ctx.tianwenEvolution
          .getControlledSkillShadowReviewObservation(shadow.shadowId)).toBeUndefined()
        expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
          .toEqual([])
      } finally {
        mounted.disposeParent()
        await mounted.harness.ctx.fiber.dispose()
      }
    },
  )

  it('fails closed when the native holdout reviewer Evidence is missing', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-review-evidence-missing',
      3,
    )
    const project = mounted.harness.ctx.tianwenEvidence.project.bind(
      mounted.harness.ctx.tianwenEvidence,
    )
    vi.spyOn(mounted.harness.ctx.tianwenEvidence, 'project').mockImplementation(session =>
      String(session.id) === mounted.input.tasks[0]!.reviewSessionId
        ? []
        : project(session))
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )

      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { stage: 'reviewer', reasonCode: 'evidence-mismatch' },
      })
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
      const shadow = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()[0]!
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillShadowReviewObservation(shadow.shadowId)).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a swapped accepted-material binding before recording a v3 Shadow result', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-swapped-accepted-material',
      3,
    )
    const write = mounted.harness.ctx.tianwenEvolution
      .recordControlledSkillShadowReviewObservation.bind(
        mounted.harness.ctx.tianwenEvolution,
      )
    vi.spyOn(
      mounted.harness.ctx.tianwenEvolution,
      'recordControlledSkillShadowReviewObservation',
    ).mockImplementation(input => write({
      ...input,
      acceptedMaterialDigest: sha256('stale accepted material'),
    }))
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )

      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
      })
      const shadow = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()[0]!
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillShadowReviewObservation(shadow.shadowId)).toBeUndefined()
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('resumes from a durable v3 review observation without repeating native Runs', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'source-fidelity-review-recovery',
      3,
    )
    const write = mounted.harness.ctx.tianwenEvolution.recordControlledSkillShadowResult.bind(
      mounted.harness.ctx.tianwenEvolution,
    )
    let failFirstWrite = true
    vi.spyOn(
      mounted.harness.ctx.tianwenEvolution,
      'recordControlledSkillShadowResult',
    ).mockImplementation(input => {
      if (failFirstWrite) {
        failFirstWrite = false
        throw new Error('controlled result write unavailable')
      }
      return write(input)
    })
    try {
      const first = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(first).toMatchObject({
        state: 'stopped',
        stop: { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
      })
      const requestCount = mounted.adapter.requests.length
      const shadow = mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()[0]!
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillShadowReviewObservation(shadow.shadowId)).toBeDefined()

      const replay = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )

      expect(replay).toMatchObject({
        state: 'terminal',
        result: {
          schemaVersion: 'tianwen.controlled-skill-shadow-result.v3',
          mechanismVerdict: 'pass',
          promotionEligibility: 'eligible-for-project-promotion',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(requestCount)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records the first closed Candidate not-met and does not start later tasks', async () => {
    const first = taskTypes[0]
    const mounted = await mountShadowRuntime(
      'candidate-not-met',
      successfulShadowScript().slice(0, 3),
      { rejectTaskType: first },
    )
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: [mounted.input.tasks[0]!.taskId],
        result: {
          mechanismVerdict: 'rejected',
          reasonCode: 'candidate-shadow-not-met',
          promotionEligibility: 'ineligible',
        },
      })
      expect(create).toHaveBeenCalledTimes(5)
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.verifierBodies).toEqual([mounted.input.tasks[0]!.sessionId])
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(1)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toHaveLength(1)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records the first closed Candidate inconclusive and does not start later tasks', async () => {
    const first = taskTypes[0]
    const mounted = await mountShadowRuntime(
      'candidate-inconclusive',
      successfulShadowScript().slice(0, 3),
      { inconclusiveTaskType: first },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: [mounted.input.tasks[0]!.taskId],
        result: {
          mechanismVerdict: 'inconclusive',
          reasonCode: 'candidate-shadow-inconclusive',
          promotionEligibility: 'ineligible',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.verifierBodies).toEqual([mounted.input.tasks[0]!.sessionId])
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(1)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops a Provider failure without forging a Shadow result or B fallback', async () => {
    const sentinel = 'D:/private/shadow-provider-failure'
    const mounted = await mountShadowRuntime('provider-failure', [new Error(sentinel)])
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          taskId: mounted.input.tasks[0]!.taskId,
          stage: 'candidate',
          reasonCode: 'provider-failed',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
      expect(JSON.stringify(receipt)).not.toContain(sentinel)
      expect(JSON.stringify(receipt)).not.toContain(mounted.input.tasks[0]!.workspaceRoot)
      expect(JSON.stringify(receipt)).not.toContain(mounted.input.tasks[0]!.input)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('denies tool N+1 before its body and does not forge a result', async () => {
    const first = taskTypes[0]
    const mounted = await mountShadowRuntime('tool-limit', [
      toolCallResponse('shadow-limited-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('shadow-limited-verify', acceptance.toolName, {
        subject: { task: first, accepted: true },
      }),
      toolCallResponse('shadow-limited-extra', acceptance.toolName, {
        subject: { task: first, accepted: true },
      }),
    ], { maxToolCalls: 2 })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'tool-limit-exceeded' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.verifierBodies).toEqual([mounted.input.tasks[0]!.sessionId])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('cancels a wall-clock timeout through the public Agent seam', async () => {
    const mounted = await mountShadowRuntime(
      'timeout',
      [textResponse('too late')],
      { maxElapsedMs: 20, firstRequestDelayMs: 80 },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'timeout' },
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when an observed request leaves the ordinary Agent contract', async () => {
    const mounted = await mountShadowRuntime(
      'request-contract-mismatch',
      successfulShadowScript().slice(0, 3),
      { tamperFirstRequestPurpose: true },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'request-contract-mismatch' },
      })
      expect(mounted.requestWasTampered()).toBe(true)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when actual Skill use is missing', async () => {
    const first = taskTypes[0]
    const mounted = await mountShadowRuntime('skill-use-missing', [
      toolCallResponse('shadow-no-skill-verify', acceptance.toolName, {
        subject: { task: first, accepted: true },
      }),
      textResponse('completed without loading the Skill'),
    ])
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'skill-use-missing' },
      })
      expect(mounted.adapter.requests).toHaveLength(2)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when actual acceptance Evidence disagrees with the frozen subject', async () => {
    const mounted = await mountShadowRuntime(
      'acceptance-subject-mismatch',
      successfulShadowScript().slice(0, 3),
    )
    const input = {
      ...mounted.input,
      tasks: mounted.input.tasks.map((task, index) => index === 0
        ? { ...task, acceptanceSubject: { subject: { accepted: false } } }
        : task),
    }
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(input)
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'acceptance-subject-mismatch' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops on postflight workspace drift without forging a result', async () => {
    const first = taskTypes[0]
    const mounted = await mountShadowRuntime(
      'postflight-root-drift',
      successfulShadowScript().slice(0, 3),
      { mutateWorkspaceTaskType: first },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'postflight', reasonCode: 'root-skill-drift' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when a completed Session cannot be durably flushed', async () => {
    const mounted = await mountShadowRuntime(
      'runtime-persistence-unavailable',
      successfulShadowScript().slice(0, 3),
    )
    vi.spyOn(mounted.harness.ctx.sessions, 'flush').mockResolvedValue(false)
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'candidate', reasonCode: 'persistence-unavailable' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadowResults())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('resolves a Shadow plan commit-unknown write without another model attempt', async () => {
    const mounted = await mountShadowRuntime(
      'plan-commit-unknown',
      successfulShadowScript().slice(0, 3),
      { rejectTaskType: taskTypes[0] },
    )
    const evolution = mounted.harness.ctx.tianwenEvolution
    const open = evolution.openControlledSkillShadow.bind(evolution)
    vi.spyOn(evolution, 'openControlledSkillShadow').mockImplementation(input => {
      open(input)
      throw new Error('D:/private/shadow-plan-commit-unknown')
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        result: { reasonCode: 'candidate-shadow-not-met' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(evolution.listControlledSkillShadows()).toHaveLength(1)
      expect(evolution.listControlledSkillShadowResults()).toHaveLength(1)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('continues an exact empty Shadow plan without duplicating its governed record', async () => {
    const mounted = await mountShadowRuntime(
      'existing-empty-plan',
      successfulShadowScript().slice(0, 3),
      { rejectTaskType: taskTypes[0] },
    )
    const expected = openShadowPlan(mounted)
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        shadowId: expected.shadowId,
        state: 'terminal',
        result: { reasonCode: 'candidate-shadow-not-met' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows())
        .toEqual([expected])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('refuses existing partial Run activity without a model attempt', async () => {
    const mounted = await mountShadowRuntime('existing-partial-activity', [])
    const evolution = mounted.harness.ctx.tianwenEvolution
    const plan = openShadowPlan(mounted)
    const candidate = evolution.getSkillCandidate(plan.candidateId)!
    const parent = evolution.listRunSkillManifests()
      .find(item => item.parentVersionId === plan.parentVersionId)!
    const first = plan.tasks[0]!
    const binding = evolution.recordRunBinding({
      goalRef: `goal:controlled-skill-shadow:${plan.shadowId}`,
      taskRef: `task:${first.taskId}:candidate`,
      sessionId: first.sessionId,
      scopeKey: plan.scopeKey,
      acceptanceContract: first.acceptanceContract,
      acceptanceSubjectDigest: first.acceptanceSubjectDigest,
    })
    evolution.recordRunSkillManifest({
      runId: binding.runId,
      skill: { ...candidate.payload, provider: parent.resolvedProvider },
    })
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1',
        shadowId: plan.shadowId,
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          taskId: first.taskId,
          stage: 'postflight',
          reasonCode: 'existing-partial-activity',
        },
      })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toEqual([])
      expect(evolution.listControlledSkillShadowResults()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('resolves a Shadow result commit-unknown write without another model attempt', async () => {
    const mounted = await mountShadowRuntime(
      'result-commit-unknown',
      successfulShadowScript().slice(0, 3),
      { rejectTaskType: taskTypes[0] },
    )
    const evolution = mounted.harness.ctx.tianwenEvolution
    const recordResult = evolution.recordControlledSkillShadowResult.bind(evolution)
    vi.spyOn(evolution, 'recordControlledSkillShadowResult').mockImplementation(input => {
      recordResult(input)
      throw new Error('D:/private/shadow-result-commit-unknown')
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        result: { reasonCode: 'candidate-shadow-not-met' },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(evolution.listControlledSkillShadowResults()).toHaveLength(1)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('returns an exact terminal replay without another Agent or model request', async () => {
    const mounted = await mountShadowRuntime(
      'terminal-replay',
      successfulShadowScript().slice(0, 3),
      { rejectTaskType: taskTypes[0] },
    )
    try {
      const first = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      const requestCount = mounted.adapter.requests.length
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
      const replay = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )
      expect(replay).toEqual(first)
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toHaveLength(requestCount)
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects Candidate-chain drift with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('candidate-chain-mismatch', [])
    const evolution = mounted.harness.ctx.tianwenEvolution
    const plan = evolution.getControlledSkillEvaluation(mounted.input.evaluationId)!
    const candidate = evolution.getSkillCandidate(plan.candidateId)!
    const getCandidate = evolution.getSkillCandidate.bind(evolution)
    vi.spyOn(evolution, 'getSkillCandidate').mockImplementation(candidateId =>
      candidateId === candidate.candidateId
        ? { ...candidate, payloadDigest: sha256('candidate-chain-drift') }
        : getCandidate(candidateId))
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'candidate-chain-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(evolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects workspace drift with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('task-package-mismatch', [])
    writeFileSync(join(mounted.input.tasks[0]!.workspaceRoot, 'brief.txt'), 'drifted\n')
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a stop contract that cannot call both required tools with zero effects', async () => {
    const mounted = await mountShadowRuntime('impossible-stop-contract', [], {
      maxToolCalls: 1,
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects configured-route drift with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('configured-route-mismatch', [])
    vi.spyOn(mounted.defaultModel, 'currentSelection').mockReturnValue({
      provider: 'unregistered-provider',
      model: CONTROLLED_MODEL,
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'configured-route-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects retry-policy drift with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('retry-policy-mismatch', [])
    vi.spyOn(mounted.harness.ctx.llm, 'providerRetryPolicy').mockReturnValue({
      mode: 'normal',
      maxRetries: 1,
      retryableCodes: [],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'retry-policy-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a frozen tool surface without the Skill tool with zero effects', async () => {
    const mounted = await mountShadowRuntime('tool-surface-mismatch', [])
    const input = {
      ...mounted.input,
      tasks: mounted.input.tasks.map((task, index) => index === 0
        ? { ...task, allowedTools: [acceptance.toolName] }
        : task),
    }
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(input))
        .rejects.toMatchObject({ code: 'tool-surface-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects unavailable persistence with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('persistence-unavailable', [])
    vi.spyOn(mounted.harness.ctx.sessionPersistence, 'list')
      .mockRejectedValue(new Error('D:/private/shadow-persistence-error'))
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'persistence-unavailable' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a pre-existing Shadow Session before creating an Agent or plan', async () => {
    const mounted = await mountShadowRuntime('session-not-empty', [])
    const first = mounted.input.tasks[0]!
    mounted.harness.ctx.sessions.create(SessionId(first.sessionId), {
      meta: { cwd: first.workspaceRoot },
    })
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'session-not-empty' })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects root parent Skill drift with zero Shadow effects', async () => {
    const mounted = await mountShadowRuntime('root-skill-mismatch', [])
    mounted.disposeParent()
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(
        mounted.input,
      )).rejects.toMatchObject({ code: 'root-skill-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('accepts a ledger-verified learned parent through the public Shadow preflight', async () => {
    const mounted = await mountSourceFidelityShadowRuntime(
      'trusted-parent-second-generation',
      3,
      undefined,
      'project:foreign/capability:controlled-summary',
    )
    const evolution = mounted.harness.ctx.tianwenEvolution
    try {
      const first = evolution.getSkillCandidate(mounted.seeded.candidate.candidateId)!
      const learnedParent = {
        ...first.payload,
        provider: parentSkill.provider,
      } as SkillDefinition
      const secondProtocol = {
        ...mounted.protocol,
        sourceFidelity: {
          ...mounted.protocol.sourceFidelity,
          source: {
            ...mounted.protocol.sourceFidelity.source,
            signalId: `signal:${'0'.repeat(64)}`,
            sessionId: 'session:controlled-shadow-runtime-seed:second:second',
            messageId: 'controlled-shadow-source-message:second',
            feedbackVersion: 'controlled-shadow-source-feedback-v1:second',
            sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
              sessionId: 'session:controlled-shadow-runtime-seed:second:second',
              createdAt: 2,
            }),
            sessionDigest: sha256('shadow-runtime-seed:second-session:b'),
            evidenceSetDigest: sha256([sha256('shadow-runtime-seed:second-evidence:b')]),
          },
        },
      }
      const second = seedPassingEvaluation(evolution, secondProtocol, {
        parent: learnedParent,
        generation: 'second',
        candidateContent: '# Controlled summary\n\nState the result, then its evidence.',
      })
      const learnedManifests = evolution.listRunSkillManifests()
        .filter(item => item.parentVersionId === second.plan.parentVersionId)
      expect(learnedManifests[0]?.runId).toBe(mounted.seeded.foreignParentRunId)
      expect(learnedManifests.some(item =>
        evolution.getRunBinding(item.runId)?.scopeKey === second.plan.scopeKey)).toBe(true)
      const rootManifest = evolution.listRunSkillManifests()
        .find(item => item.parentVersionId === first.parentVersionId)!
      const previousPointer = {
        schemaVersion: 'tianwen.controlled-skill-scope-pointer.v2' as const,
        scopeKey: second.plan.scopeKey,
        activeVersionId: rootManifest.parentVersionId,
        payloadDigest: sha256(rootManifest.parent),
        revision: 1,
      }
      const targetPointer = {
        ...previousPointer,
        activeVersionId: second.plan.parentVersionId,
        payloadDigest: first.payloadDigest,
        revision: 2,
      }
      const transition = {
        transitionId: `transition:${'b'.repeat(64)}`,
        source: { scopeKey: second.plan.scopeKey },
        previousPointer,
        targetPointer,
      }
      vi.spyOn(evolution, 'listControlledSkillTransitions')
        .mockReturnValue([transition] as never)
      vi.spyOn(evolution, 'getControlledSkillTransitionReceipt').mockReturnValue({
        transitionId: transition.transitionId,
        state: 'verified',
        pointer: targetPointer,
        reasonCode: null,
      } as never)
      vi.spyOn(evolution, 'getControlledSkillScopePointer').mockReturnValue(targetPointer)
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow({
        evaluationId: second.plan.evaluationId,
        tasks: mounted.input.tasks,
      })
      expect(receipt).toMatchObject({ state: 'terminal' })
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a scripted Session outside the dedicated Shadow fixture boundary', async () => {
    const mounted = await mountShadowRuntime('scripted-boundary-mismatch', [])
    const input = {
      ...mounted.input,
      tasks: mounted.input.tasks.map((task, index) => index === 0
        ? { ...task, sessionId: 'session:controlled-shadow:not-fixture:first' }
        : task),
    }
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledShadow(input))
        .rejects.toMatchObject({ code: 'scripted-boundary-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillShadows()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })
})
