import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'

import {
  DynamicCordisRunnerService,
  ScriptedAdapter,
  SessionId,
  SkillRegistry,
  applySkillTool,
  defineTool,
  mountCoreHarness,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { GenerateOptions, StreamChunk } from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  controlledSkillShadowExecutionManifestDigest,
  learningSessionLifecycleFingerprint,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import { apply } from '../../packages/tianwen-runtime/src/index.js'
import {
  controlledSkillTransitionPostCheck,
  parseRunControlledSkillTransitionInput,
} from '../../packages/tianwen-runtime/src/controlled-skill-activation.js'

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
  name: 'controlled-activation-runtime-summary',
  description: 'Summarize one controlled activation observation.',
  whenToUse: 'When a controlled task requests a concise verified summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled activation summary\n\nState the observation.',
} as const

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super('controlled activation requirement not met', acceptance.notMetErrorCode)
  }
}

class InconclusiveVerifierFailure extends HarnessError {
  constructor() {
    super('controlled activation verifier inconclusive', 'CONTROLLED_VERIFIER_INCONCLUSIVE')
  }
}

class ControlledActivationScriptedAdapter extends ScriptedAdapter {
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
    'controlled-skill-activation-runtime',
    name,
  )
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

function rawDigest(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

type EvolutionService = Awaited<ReturnType<typeof mountPersistentHarness>>['ctx']['tianwenEvolution']

function seedPassingLifecycle(
  evolution: EvolutionService,
  protocol: Parameters<EvolutionService['freezeControlledSkillEvalProtocol']>[0]['protocol'],
) {
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker]) => {
    const sessionId = `session:controlled-activation-runtime-seed:${suffix}`
    const binding = evolution.recordRunBinding({
      goalRef: 'goal:controlled-activation-runtime-seed',
      taskRef: `task:controlled-activation-runtime-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-activation-runtime-summary',
      acceptanceContract: acceptance,
    })
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill: parentSkill })
    const sessionDigest = sha256(`activation-runtime-seed-session:${marker}`)
    const evidenceId = sha256(`activation-runtime-seed-evidence:${marker}`)
    const outcome = evolution.recordOutcomeIntake({
      runId: binding.runId,
      verdict,
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    evolution.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId,
      sessionDigest,
      skillName: parentSkill.name,
      contentDigest: sha256(parentSkill.content),
      skillEvidenceId: sha256(`activation-runtime-seed-skill:${marker}`),
      acceptanceEvidenceId: evidenceId,
      skillCallSeq: 10,
      skillResultSeq: 11,
      acceptanceCallSeq: 12,
    })
    return { binding, outcome }
  })
  const ticketId = runs[1]!.outcome.ticketId!
  const frozen = evolution.freezeControlledSkillEvalProtocol({
    ticketId,
    evidencePurpose: 'development-only-synthetic-defect',
    protocol,
  })
  const opened = evolution.openLearningCase({
    ticketId,
    counterevidenceRunIds: [runs[2]!.binding.runId],
  })
  const learningCase = evolution.getLearningCase(opened.caseId)!
  const attribution = evolution.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: parentSkill.name,
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
  const candidateReceipt = evolution.recordSkillCandidate({
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
  const openedEvaluation = evolution.openControlledSkillEvaluation({
    candidateId: candidateReceipt.candidateId,
    protocolId: frozen.protocolId,
    sessionAllocations: protocol.tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:activation-runtime-source:${task.taskType}:baseline`,
      candidateSessionId: `session:activation-runtime-source:${task.taskType}:candidate`,
      evaluatorSessionId: `session:activation-runtime-source:${task.taskType}:evaluator`,
    })),
  })
  const evaluation = evolution.getControlledSkillEvaluation(openedEvaluation.evaluationId)!
  const candidate = evolution.getSkillCandidate(candidateReceipt.candidateId)!
  for (const [index, task] of evaluation.tasks.entries()) {
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
    const arms = ([task.baseline, task.candidate] as const).map(arm => {
      const binding = evolution.recordRunBinding({
        goalRef: `goal:controlled-skill-evaluation:${evaluation.protocolId}`,
        taskRef: `task:${task.taskId}:${arm.role}`,
        sessionId: arm.sessionId,
        scopeKey: evaluation.scopeKey,
        acceptanceContract: task.acceptanceContract,
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
          sessionId: arm.sessionId,
          createdAt: 1,
          cwd: 'D:/controlled-activation-runtime-evaluation-fixture',
        }),
      })
      const skill = arm.role === 'baseline'
        ? parentSkill
        : { ...candidate.payload, provider: 'runtime' }
      const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill })
      const outcome = arm.role === 'baseline' && index === 0 ? 'not-met' : 'met'
      const sessionDigest = sha256(`activation-runtime-eval-session:${task.taskId}:${arm.role}`)
      const evidenceId = sha256(`activation-runtime-eval-evidence:${task.taskId}:${arm.role}`)
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
        skillName: parentSkill.name,
        contentDigest: sha256(skill.content),
        skillEvidenceId: sha256(`activation-runtime-eval-skill:${task.taskId}:${arm.role}`),
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
        normalizedFirstRequestDigest: sha256(`activation-runtime-request:${task.taskId}`),
        outcome,
        evidenceIds: [evidenceId],
        acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        evaluatorMaterialDigest: sha256(`activation-runtime-material:${task.taskId}:${arm.role}`),
        usedToolNames: ['skill', 'verify_summary'],
        usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
      }
    })
    evolution.recordControlledSkillEvaluationObjective({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      baseline: arms[0]!,
      candidate: arms[1]!,
    })
  }
  evolution.freezeControlledSkillEvaluationBlindMap({ evaluationId: evaluation.evaluationId })
  const blindMap = evolution.getControlledSkillEvaluationBlindMap(evaluation.evaluationId)!
  for (const [index, task] of evaluation.tasks.entries()) {
    const assignment = blindMap.assignments[index]!
    evolution.recordControlledSkillEvaluatorObservation({
      evaluationId: evaluation.evaluationId,
      taskId: task.taskId,
      evaluatorSessionId: task.evaluatorSessionId,
      envelopeDigest: assignment.envelopeDigest,
      requestDigest: sha256(`activation-runtime-evaluator-request:${task.taskId}`),
      evidenceId: sha256(`activation-runtime-evaluator-evidence:${task.taskId}`),
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
        y: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
      },
    })
  }
  evolution.recordControlledSkillEvaluationResult({ evaluationId: evaluation.evaluationId })
  const shadowReceipt = evolution.openControlledSkillShadow({
    evaluationId: evaluation.evaluationId,
    tasks: taskTypes.map((taskType, index) => ({
      taskId: `shadow-task:${taskType}` as const,
      goalDigest: sha256(`activation-runtime-shadow-goal:${index}`),
      inputDigest: sha256(`activation-runtime-shadow-input:${index}`),
      workspaceSnapshotDigest: sha256(`activation-runtime-shadow-workspace:${index}`),
      toolSchemaDigest: sha256(`activation-runtime-shadow-tools:${index}`),
      authorizationDigest: sha256(`activation-runtime-shadow-authorization:${index}`),
      verifierContractDigest: sha256(`activation-runtime-shadow-verifier:${index}`),
      stopConditionDigest: sha256(`activation-runtime-shadow-stop:${index}`),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: sha256(`activation-runtime-shadow-subject:${index}`),
      allowedTools: ['skill', 'verify_summary'],
      stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
      sessionId: `session:controlled-activation-runtime-shadow:${taskType}`,
    })),
  })
  const shadow = evolution.getControlledSkillShadow(shadowReceipt.shadowId)!
  const shadowRuns = shadow.tasks.map(task => {
    const binding = evolution.recordRunBinding({
      goalRef: `goal:controlled-skill-shadow:${shadow.shadowId}`,
      taskRef: `task:${task.taskId}:candidate`,
      sessionId: task.sessionId,
      scopeKey: shadow.scopeKey,
      acceptanceContract: task.acceptanceContract,
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
        sessionId: task.sessionId,
        createdAt: 1,
        cwd: 'D:/controlled-activation-runtime-shadow-fixture',
      }),
    })
    const skill = { ...candidate.payload, provider: 'runtime' }
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill })
    const sessionDigest = sha256(`activation-runtime-shadow-session:${task.taskId}`)
    const evidenceId = sha256(`activation-runtime-shadow-evidence:${task.taskId}`)
    evolution.recordOutcomeIntake({
      runId: binding.runId,
      verdict: 'met',
      sessionDigest,
      evidenceIds: [evidenceId],
    })
    evolution.recordRunSkillUse({
      runId: binding.runId,
      parentVersionId: manifest.parentVersionId,
      sessionId: task.sessionId,
      sessionDigest,
      skillName: candidate.payload.name,
      contentDigest: sha256(candidate.payload.content),
      skillEvidenceId: sha256(`activation-runtime-shadow-skill:${task.taskId}`),
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
      executionManifestDigest: controlledSkillShadowExecutionManifestDigest(shadow, task),
      normalizedFirstRequestDigest: sha256(`activation-runtime-shadow-request:${task.taskId}`),
      outcome: 'met' as const,
      evidenceIds: [evidenceId],
      acceptanceSubjectDigest: task.acceptanceSubjectDigest,
      usedToolNames: ['skill', 'verify_summary'],
      usage: { modelRequests: 1, toolCalls: 2, elapsedMs: 500 },
    }
  })
  evolution.recordControlledSkillShadowResult({ shadowId: shadow.shadowId, runs: shadowRuns })
  evolution.initializeControlledSkillScopePointer({ shadowId: shadow.shadowId })
  return { candidate, evaluation, shadow }
}

type TransitionKind = 'promote' | 'rollback' | 'restore'

function successfulScript(kinds: readonly TransitionKind[]) {
  return kinds.flatMap(kind => [
    toolCallResponse(`activation-${kind}-skill`, 'skill', { name: parentSkill.name }),
    toolCallResponse(`activation-${kind}-verify`, acceptance.toolName, {
      subject: { kind, accepted: true },
    }),
    textResponse(`completed controlled activation ${kind}`),
  ])
}

async function mountActivationRuntime(
  name: string,
  script: readonly (readonly StreamChunk[] | Error)[],
  options: {
    readonly rejectKind?: TransitionKind
    readonly inconclusiveKind?: TransitionKind
    readonly mutateWorkspaceKind?: TransitionKind
    readonly driftRootKind?: TransitionKind
    readonly driftPointerKind?: TransitionKind
    readonly firstRequestDelayMs?: number
    readonly tamperFirstRequestPurpose?: boolean
  } = {},
) {
  const root = fixtureRoot(name)
  const harness = await mountPersistentHarness(join(root, 'sessions'), [])
  await harness.ctx.plugin(SkillRegistry)
  await harness.ctx.plugin(applySkillTool)
  await harness.ctx.plugin(DynamicCordisRunnerService, {})
  const verifierBodies: string[] = []
  let pointerDrifted = false
  let disposeParent: (() => void) | undefined
  const disposeVerifier = harness.ctx.tools.register(defineTool({
    name: acceptance.toolName,
    description: 'Verify one controlled activation result.',
    parameters: { subject: { type: 'object', additionalProperties: true, required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      verifierBodies.push(String(exec.agent?.id))
      const kind = (args as { subject?: { kind?: TransitionKind } }).subject?.kind
      if (kind === options.mutateWorkspaceKind) {
        writeFileSync(join(String(exec.agent?.session.header.cwd), 'brief.txt'), 'drifted\n')
      }
      if (kind === options.driftRootKind) disposeParent?.()
      if (kind === options.driftPointerKind) pointerDrifted = true
      if (kind === options.inconclusiveKind) throw new InconclusiveVerifierFailure()
      if (kind === options.rejectKind) throw new SummaryRequirementNotMet()
      return 'verified'
    },
  }))
  disposeParent = harness.ctx.skills.register(parentSkill)
  const adapter = new ControlledActivationScriptedAdapter(
    script,
    options.firstRequestDelayMs,
  )
  harness.ctx.llm.registerAdapter([CONTROLLED_PROVIDER], adapter)
  const selection = { provider: CONTROLLED_PROVIDER, model: CONTROLLED_MODEL }
  const defaultModel = { currentSelection: () => ({ ...selection }) }
  harness.ctx.provide('agentDefaultModel', defaultModel)
  let requestWasTampered = false
  if (options.tamperFirstRequestPurpose === true) {
    harness.ctx.on('llm/stream', (request, next) => {
      if (!requestWasTampered) {
        requestWasTampered = true
        ;(request as unknown as { purpose?: string }).purpose = 'activation-test'
      }
      return next()
    })
  }
  await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })

  const allowedTools = ['skill', acceptance.toolName] as const
  const schemas = harness.ctx.tools.schemas()
    .filter(schema => allowedTools.includes(schema.name as typeof allowedTools[number]))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
  const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
  const protocolTasks = taskTypes.map((taskType, index) => ({
    taskId: `eval-task:${taskType}` as const,
    taskType,
    goalDigest: sha256(`activation-runtime-source-goal:${index}`),
    inputDigest: sha256(`activation-runtime-source-input:${index}`),
    workspaceSnapshotDigest: sha256(`activation-runtime-source-workspace:${index}`),
    toolSchemaDigest: sha256(schemas),
    authorizationDigest: sha256(`activation-runtime-source-authorization:${index}`),
    verifierContractDigest: sha256(`activation-runtime-source-verifier:${index}`),
    stopConditionDigest: sha256(`activation-runtime-source-stop:${index}`),
    evaluatorMaterialContractDigest: sha256(`activation-runtime-source-material:${index}`),
    acceptanceContract: acceptance,
    acceptanceSubjectDigest: sha256(`activation-runtime-source-subject:${index}`),
    allowedTools,
    stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
  }))
  const seeded = seedPassingLifecycle(harness.ctx.tianwenEvolution, {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: protocolTasks,
    execution: {
      dshVersion: '0.1.1-rc.2',
      providerId: callConfig.provider,
      modelId: callConfig.model,
      callConfigDigest: sha256(callConfig),
      toolSchemaDigest: sha256(protocolTasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
      retryPolicyDigest: sha256(retryPolicy),
    },
  })
  if (options.driftPointerKind !== undefined) {
    const getPointer = harness.ctx.tianwenEvolution.getControlledSkillScopePointer
      .bind(harness.ctx.tianwenEvolution)
    vi.spyOn(harness.ctx.tianwenEvolution, 'getControlledSkillScopePointer')
      .mockImplementation(scopeKey => {
        const pointer = getPointer(scopeKey)
        if (!pointerDrifted || pointer === undefined) return pointer
        pointerDrifted = false
        return { ...pointer, revision: pointer.revision + 1 }
      })
  }

  const input = (kind: TransitionKind, expectedRevision: number) => {
    const workspaceRoot = join(root, 'workspaces', kind)
    const content = `controlled activation ${kind} workspace\n`
    mkdirSync(workspaceRoot, { recursive: true })
    writeFileSync(join(workspaceRoot, 'brief.txt'), content, 'utf8')
    return {
      shadowId: seeded.shadow.shadowId,
      kind,
      expectedRevision,
      task: {
        goal: `Verify the active ${kind} pointer.`,
        input: `Use the available Skill, then verify the ${kind} result.`,
        workspaceRoot,
        workspaceSnapshot: {
          schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
          entries: [{
            relativePath: 'brief.txt',
            contentDigest: rawDigest(content),
            size: Buffer.byteLength(content, 'utf8'),
          }],
        },
        authorization: { mode: 'fixture-only', kind },
        verifierContract: { toolName: acceptance.toolName, kind },
        stopCondition: { terminal: 'completed-final-assistant-text', kind },
        acceptanceContract: acceptance,
        acceptanceSubject: { subject: { kind, accepted: true } },
        allowedTools: [acceptance.toolName, 'skill'],
        stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        sessionId: `session:controlled-activation:fixture:${kind}`,
      },
    }
  }
  return {
    adapter,
    defaultModel,
    disposeParent: () => disposeParent?.(),
    disposeVerifier,
    harness,
    input,
    requestWasTampered: () => requestWasTampered,
    root,
    seeded,
    verifierBodies,
  }
}

function beginPendingTransition(
  mounted: Awaited<ReturnType<typeof mountActivationRuntime>>,
  kind: TransitionKind = 'promote',
  expectedRevision = 1,
) {
  const input = mounted.input(kind, expectedRevision)
  const parsed = parseRunControlledSkillTransitionInput(input)
  const schemas = mounted.harness.ctx.tools.schemas()
    .filter(schema => parsed.task.allowedTools.includes(schema.name))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const receipt = mounted.harness.ctx.tianwenEvolution.beginControlledSkillTransition({
    shadowId: parsed.shadowId,
    kind: parsed.kind,
    expectedRevision: parsed.expectedRevision,
    postCheck: controlledSkillTransitionPostCheck(parsed.task, sha256(schemas)),
  })
  return {
    input,
    transition: mounted.harness.ctx.tianwenEvolution
      .getControlledSkillTransition(receipt.transitionId)!,
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function structurallyValidInput(root: string) {
  return {
    shadowId: `shadow:${'f'.repeat(64)}` as const,
    kind: 'promote' as const,
    expectedRevision: 1,
    task: {
      goal: 'Verify the active controlled Skill.',
      input: 'Use the available Skill, then verify the result.',
      workspaceRoot: resolve(root, 'workspace'),
      workspaceSnapshot: {
        schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
        entries: [],
      },
      authorization: { mode: 'fixture-only' },
      verifierContract: { toolName: acceptance.toolName },
      stopCondition: { terminal: 'completed-final-assistant-text' },
      acceptanceContract: acceptance,
      acceptanceSubject: { subject: { accepted: true } },
      allowedTools: ['verify_summary', 'skill'],
      stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
      sessionId: 'session:controlled-activation:fixture:structural',
    },
  }
}

describe('controlled Skill activation Runtime', () => {
  it('rejects an invalid transition package through the governed Runtime entry', async () => {
    const root = resolve(
      process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
      'controlled-skill-activation-runtime',
      'invalid-package',
    )
    rmSync(root, { recursive: true, force: true })
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: root })
    const service = harness.ctx.tianwenSkillEvaluation as unknown as {
      runControlledSkillTransition(input: unknown): Promise<unknown>
    }

    try {
      await expect(Promise.resolve().then(() => service.runControlledSkillTransition({})))
        .rejects.toMatchObject({
          name: 'ControlledSkillActivationPreflightError',
          code: 'task-package-mismatch',
        })
      expect(harness.ctx.agents.list()).toEqual([])
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillTransitions()).toEqual([])
    } finally {
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('validates the exact nested task before checking Shadow eligibility', async () => {
    const root = resolve(
      process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
      'controlled-skill-activation-runtime',
      'exact-task',
    )
    rmSync(root, { recursive: true, force: true })
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: root })
    const input = structurallyValidInput(root)

    try {
      await expect(harness.ctx.tianwenSkillEvaluation.runControlledSkillTransition(input))
        .rejects.toMatchObject({ code: 'shadow-not-eligible' })
      await expect(harness.ctx.tianwenSkillEvaluation.runControlledSkillTransition({
        ...input,
        task: { ...input.task, runId: `run:${'a'.repeat(64)}` },
      } as never)).rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(harness.ctx.agents.list()).toEqual([])
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillTransitions()).toEqual([])
    } finally {
      await harness.ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects all ten preflight classes with zero activation effects', async () => {
    const mounted = await mountActivationRuntime('zero-effect-preflights', [])
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    const evolution = mounted.harness.ctx.tianwenEvolution
    const input = mounted.input('promote', 1)
    const expectZeroEffect = async (
      candidate: unknown,
      code: string,
    ) => {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(candidate as never))
        .rejects.toMatchObject({ code })
      expect(create).not.toHaveBeenCalled()
      expect(evolution.listControlledSkillTransitions()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
    }

    try {
      await expectZeroEffect({ ...input, shadowId: `shadow:${'e'.repeat(64)}` }, 'shadow-not-eligible')
      await expectZeroEffect({ ...input, expectedRevision: 2 }, 'pointer-mismatch')
      await expectZeroEffect({
        ...input,
        task: {
          ...input.task,
          sessionId: mounted.seeded.evaluation.tasks[0]!.baseline.sessionId,
        },
      }, 'task-package-mismatch')

      const route = vi.spyOn(mounted.defaultModel, 'currentSelection')
        .mockReturnValueOnce({ provider: 'missing-provider', model: 'missing-model' })
      await expectZeroEffect(input, 'configured-route-mismatch')
      route.mockRestore()

      const retry = vi.spyOn(mounted.harness.ctx.llm, 'providerRetryPolicy').mockReturnValueOnce({
        mode: 'normal',
        maxRetries: 1,
        retryableCodes: [],
        initialDelayMs: 500,
        maxDelayMs: 10_000,
        jitterRatio: 0.1,
      })
      await expectZeroEffect(input, 'retry-policy-mismatch')
      retry.mockRestore()

      await expectZeroEffect({
        ...input,
        task: { ...input.task, allowedTools: [...input.task.allowedTools, 'missing_tool'] },
      }, 'tool-surface-mismatch')
      vi.spyOn(mounted.harness.ctx.sessionPersistence, 'list')
        .mockRejectedValueOnce(new Error('D:/private/persistence-list-error'))
      await expectZeroEffect(input, 'persistence-unavailable')
      await expectZeroEffect({
        ...input,
        task: {
          ...input.task,
          sessionId: 'session:controlled-activation:non-fixture:promote',
        },
      }, 'scripted-boundary-mismatch')

      mounted.harness.ctx.sessions.create(SessionId(input.task.sessionId), {
        meta: { cwd: input.task.workspaceRoot },
      })
      await expectZeroEffect(input, 'session-not-empty')
      mounted.disposeParent()
      await expectZeroEffect(input, 'root-skill-mismatch')
    } finally {
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not resume a pending transition after any post-begin Run activity', async () => {
    const mounted = await mountActivationRuntime('pending-manifest-partial', successfulScript(['promote']))
    const { input, transition } = beginPendingTransition(mounted)
    const session = mounted.harness.ctx.sessions.create(
      SessionId(transition.postCheck.sessionId),
      { meta: { cwd: input.task.workspaceRoot } },
    )
    mounted.harness.ctx.tianwenEvolution.recordRunBinding({
      goalRef: transition.runBinding.goalRef,
      taskRef: transition.runBinding.taskRef,
      sessionId: transition.runBinding.sessionId,
      scopeKey: transition.runBinding.scopeKey,
      acceptanceContract: transition.runBinding.acceptanceContract,
      acceptanceSubjectDigest:
        transition.runBinding.acceptanceSubjectDigest,
      sessionLifecycleFingerprint: learningSessionLifecycleFingerprint({
        sessionId: String(session.id),
        createdAt: session.header.createdAt,
        ...(session.header.cwd === undefined ? {} : { cwd: session.header.cwd }),
      }),
    })
    mounted.harness.ctx.tianwenEvolution.recordRunSkillManifest({
      runId: transition.postCheck.runId,
      skill: { ...mounted.seeded.candidate.payload, provider: 'runtime' },
    })
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')

    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { stage: 'activation', reasonCode: 'existing-partial-activity' },
      })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution
        .getControlledSkillTransitionReceipt(transition.transitionId)?.state)
        .toBe('pending-post-check')
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('resolves transition, completion, and recovery commit-unknown writes without a second activity', async () => {
    const beginUnknown = await mountActivationRuntime(
      'begin-commit-unknown',
      successfulScript(['promote']),
    )
    try {
      const evolution = beginUnknown.harness.ctx.tianwenEvolution
      const begin = evolution.beginControlledSkillTransition.bind(evolution)
      vi.spyOn(evolution, 'beginControlledSkillTransition').mockImplementationOnce(value => {
        begin(value)
        throw new Error('D:/private/begin-commit-unknown')
      })
      const receipt = await beginUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(beginUnknown.input('promote', 1))
      expect(receipt).toMatchObject({ state: 'terminal' })
      expect(beginUnknown.adapter.requests).toHaveLength(3)
      expect(JSON.stringify(receipt)).not.toContain('D:/private')
    } finally {
      beginUnknown.disposeParent()
      beginUnknown.disposeVerifier()
      await beginUnknown.harness.ctx.fiber.dispose()
    }

    const completeUnknown = await mountActivationRuntime(
      'complete-commit-unknown',
      successfulScript(['promote']),
    )
    try {
      const evolution = completeUnknown.harness.ctx.tianwenEvolution
      const create = vi.spyOn(completeUnknown.harness.ctx.agents, 'create')
      const complete = evolution.completeControlledSkillTransition.bind(evolution)
      vi.spyOn(evolution, 'completeControlledSkillTransition').mockImplementationOnce(value => {
        complete(value)
        throw new Error('D:/private/complete-commit-unknown')
      })
      const input = completeUnknown.input('promote', 1)
      const receipt = await completeUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(receipt.state).toBe('terminal')
      expect(completeUnknown.adapter.requests).toHaveLength(3)
      const replay = await completeUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(replay).toEqual(receipt)
      expect(create).toHaveBeenCalledTimes(1)
      expect(completeUnknown.adapter.requests).toHaveLength(3)
      expect(JSON.stringify(receipt)).not.toContain('D:/private')
    } finally {
      completeUnknown.disposeParent()
      completeUnknown.disposeVerifier()
      await completeUnknown.harness.ctx.fiber.dispose()
    }

    const failureUnknown = await mountActivationRuntime(
      'failure-commit-unknown',
      successfulScript(['promote']),
      { rejectKind: 'promote' },
    )
    try {
      const evolution = failureUnknown.harness.ctx.tianwenEvolution
      const create = vi.spyOn(failureUnknown.harness.ctx.agents, 'create')
      const fail = evolution.recordControlledSkillActivationFailed.bind(evolution)
      const write = vi.spyOn(evolution, 'recordControlledSkillActivationFailed')
        .mockImplementationOnce(value => {
          fail(value)
          throw new Error('D:/private/failure-commit-unknown')
        })
      const input = failureUnknown.input('promote', 1)
      const receipt = await failureUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { reasonCode: 'post-check-not-met' },
        transition: { state: 'recovered' },
      })
      expect(write).toHaveBeenCalledTimes(1)
      expect(failureUnknown.adapter.requests).toHaveLength(3)
      const replay = await failureUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(replay).toEqual(receipt)
      expect(create).toHaveBeenCalledTimes(1)
      expect(write).toHaveBeenCalledTimes(1)
      expect(failureUnknown.adapter.requests).toHaveLength(3)
      expect(JSON.stringify(receipt)).not.toContain('D:/private')
    } finally {
      failureUnknown.disposeParent()
      failureUnknown.disposeVerifier()
      await failureUnknown.harness.ctx.fiber.dispose()
    }

    const pending = await mountActivationRuntime(
      'pending-zero-activity',
      successfulScript(['promote']),
    )
    try {
      const { input } = beginPendingTransition(pending)
      const create = vi.spyOn(pending.harness.ctx.agents, 'create')
      const receipt = await pending.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(receipt).toMatchObject({ state: 'terminal' })
      expect(create).toHaveBeenCalledTimes(1)
      expect(pending.adapter.requests).toHaveLength(3)
    } finally {
      pending.disposeParent()
      pending.disposeVerifier()
      await pending.harness.ctx.fiber.dispose()
    }
  })

  it('fails closed when completion or recovery cannot be proven durable', async () => {
    const completionMissing = await mountActivationRuntime(
      'completion-not-committed',
      successfulScript(['promote']),
    )
    try {
      const evolution = completionMissing.harness.ctx.tianwenEvolution
      vi.spyOn(evolution, 'completeControlledSkillTransition')
        .mockImplementationOnce(() => {
          throw new Error('D:/private/completion-not-committed')
        })
      const recover = vi.spyOn(evolution, 'recordControlledSkillActivationFailed')
      const receipt = await completionMissing.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(completionMissing.input('promote', 1))
      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
        transition: { state: 'recovered' },
      })
      expect(recover).toHaveBeenCalledTimes(1)
      expect(completionMissing.adapter.requests).toHaveLength(3)
      expect(JSON.stringify(receipt)).not.toContain('D:/private')
    } finally {
      completionMissing.disposeParent()
      completionMissing.disposeVerifier()
      await completionMissing.harness.ctx.fiber.dispose()
    }

    const recoveryUnknown = await mountActivationRuntime(
      'recovery-unknown',
      successfulScript(['promote']),
      { rejectKind: 'promote' },
    )
    try {
      const evolution = recoveryUnknown.harness.ctx.tianwenEvolution
      const recover = vi.spyOn(evolution, 'recordControlledSkillActivationFailed')
        .mockImplementationOnce(() => {
          throw new Error('D:/private/recovery-not-committed')
        })
      const input = recoveryUnknown.input('promote', 1)
      const receipt = await recoveryUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { stage: 'recovery', reasonCode: 'recovery-unknown' },
        transition: { state: 'pending-post-check' },
      })
      expect(recover).toHaveBeenCalledTimes(1)
      expect(recoveryUnknown.adapter.requests).toHaveLength(3)
      const retry = await recoveryUnknown.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(input)
      expect(retry).toMatchObject({
        state: 'stopped',
        stop: { reasonCode: 'existing-partial-activity' },
      })
      expect(recover).toHaveBeenCalledTimes(1)
      expect(recoveryUnknown.adapter.requests).toHaveLength(3)
      expect(JSON.stringify([receipt, retry])).not.toContain('D:/private')
    } finally {
      recoveryUnknown.disposeParent()
      recoveryUnknown.disposeVerifier()
      await recoveryUnknown.harness.ctx.fiber.dispose()
    }
  })

  it('runs pointer-first promote, rollback, and restore as scoped C-B-C activities', async () => {
    const mounted = await mountActivationRuntime(
      'successful-c-b-c',
      successfulScript(['promote', 'rollback', 'restore']),
    )
    const createAgent = mounted.harness.ctx.agents.create.bind(mounted.harness.ctx.agents)
    const durableBeforeAgent: number[] = []
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create').mockImplementation(async options => {
      const transition = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillTransitions().at(-1)
      const pointer = transition === undefined
        ? undefined
        : mounted.harness.ctx.tianwenEvolution
            .getControlledSkillScopePointer(transition.source.scopeKey)
      if (transition !== undefined && pointer?.revision === transition.targetPointer.revision) {
        durableBeforeAgent.push(pointer.revision)
      }
      return createAgent(options)
    })
    const durableBeforeRequest: number[] = []
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      const transition = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillTransitions()
        .find(item => item.postCheck.sessionId === String(request.sessionId))
      if (transition !== undefined && !durableBeforeRequest.includes(transition.targetPointer.revision)) {
        const pointer = mounted.harness.ctx.tianwenEvolution
          .getControlledSkillScopePointer(transition.source.scopeKey)
        if (pointer?.revision === transition.targetPointer.revision
          && mounted.harness.ctx.tianwenEvolution.getRunBinding(transition.postCheck.runId)
          && mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(transition.postCheck.runId)) {
          durableBeforeRequest.push(pointer.revision)
        }
      }
      return next()
    })
    const evolution = mounted.harness.ctx.tianwenEvolution
    const complete = vi.spyOn(evolution, 'completeControlledSkillTransition')

    try {
      const promote = await mounted.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(mounted.input('promote', 1))
      const promoteTransition = evolution.listControlledSkillTransitions()[0]!
      expect(evolution.getRunBinding(promoteTransition.postCheck.runId))
        .toMatchObject({
          ...promoteTransition.runBinding,
          schemaVersion: 'tianwen.run-binding.v3',
          sessionLifecycleFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u,
          ),
        })
      const rollback = await mounted.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(mounted.input('rollback', 2))
      const restore = await mounted.harness.ctx.tianwenSkillEvaluation
        .runControlledSkillTransition(mounted.input('restore', 3))

      expect([promote, rollback, restore].map(receipt => receipt.state))
        .toEqual(['terminal', 'terminal', 'terminal'])
      expect([promote, rollback, restore].map(receipt => receipt.transition.pointer.revision))
        .toEqual([2, 3, 4])
      expect(durableBeforeAgent).toEqual([2, 3, 4])
      expect(durableBeforeRequest).toEqual([2, 3, 4])
      expect(create).toHaveBeenCalledTimes(3)
      expect(mounted.adapter.requests).toHaveLength(9)
      expect(mounted.verifierBodies).toEqual([
        mounted.input('promote', 1).task.sessionId,
        mounted.input('rollback', 2).task.sessionId,
        mounted.input('restore', 3).task.sessionId,
      ])
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(3)
      expect(evolution.listControlledSkillTransitions()).toHaveLength(3)
      expect(complete).toHaveBeenCalledTimes(3)
      for (const [call] of complete.mock.calls) {
        expect(call.run.usedToolNames).toEqual(['skill', acceptance.toolName])
        expect(call.run.usage).toMatchObject({ modelRequests: 3, toolCalls: 2 })
        expect(call.run.usage.toolCalls).toBeGreaterThanOrEqual(call.run.usedToolNames.length)
      }
      const transitions = evolution.listControlledSkillTransitions()
      expect(transitions.map(item => item.targetPointer.activeVersionId)).toEqual([
        mounted.seeded.shadow.candidateVersionId,
        mounted.seeded.shadow.parentVersionId,
        mounted.seeded.shadow.candidateVersionId,
      ])
      for (const transition of transitions) {
        expect(evolution.getRunBinding(transition.postCheck.runId)).toMatchObject({
          ...transition.runBinding,
          schemaVersion: 'tianwen.run-binding.v3',
          sessionLifecycleFingerprint: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u,
          ),
        })
        expect(evolution.getRunSkillManifest(transition.postCheck.runId)?.parentVersionId)
          .toBe(transition.targetPointer.activeVersionId)
        expect(evolution.getRunSkillUse(transition.postCheck.runId)?.parentVersionId)
          .toBe(transition.targetPointer.activeVersionId)
      }
      const pointer = evolution.getControlledSkillScopePointer(mounted.seeded.shadow.scopeKey)
      expect(pointer).toMatchObject({
        activeVersionId: mounted.seeded.shadow.candidateVersionId,
        revision: 4,
      })
      for (const kind of ['promote', 'rollback', 'restore'] as const) {
        const task = mounted.input(kind, kind === 'promote' ? 1 : kind === 'rollback' ? 2 : 3).task
        expect(JSON.stringify([promote, rollback, restore])).not.toContain(task.input)
        expect(JSON.stringify([promote, rollback, restore])).not.toContain(task.workspaceRoot)
      }
      expect(JSON.stringify([promote, rollback, restore])).not.toContain(parentSkill.content)
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
    } finally {
      mounted.disposeParent()
      mounted.disposeVerifier()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it.each([
    'missing',
    'legacy-v1',
    'legacy-v2',
    'missing-fingerprint',
    'tampered-fingerprint',
    'plan-field-drift',
  ] as const)(
    'rejects a %s actual activation binding before model activity',
    async fault => {
      const mounted = await mountActivationRuntime(
        `binding-${fault}`,
        successfulScript(['promote']),
      )
      const input = mounted.input('promote', 1)
      const evolution = mounted.harness.ctx.tianwenEvolution
      const read = evolution.getRunBinding.bind(evolution)
      vi.spyOn(evolution, 'getRunBinding').mockImplementation(runId => {
        const binding = read(runId)
        if (binding?.sessionId !== input.task.sessionId) return binding
        if (fault === 'missing') return undefined
        if (fault === 'legacy-v2') {
          const {
            sessionLifecycleFingerprint: _fingerprint,
            schemaVersion: _schemaVersion,
            ...legacy
          } = binding as Extract<typeof binding, {
            schemaVersion: 'tianwen.run-binding.v3'
          }>
          return {
            ...legacy,
            schemaVersion: 'tianwen.run-binding.v2',
          }
        }
        if (fault === 'legacy-v1') {
          const {
            sessionLifecycleFingerprint: _fingerprint,
            acceptanceSubjectDigest: _subject,
            schemaVersion: _schemaVersion,
            ...legacy
          } = binding as Extract<typeof binding, {
            schemaVersion: 'tianwen.run-binding.v3'
          }>
          return {
            ...legacy,
            schemaVersion: 'tianwen.run-binding.v1',
          }
        }
        if (fault === 'missing-fingerprint') {
          const {
            sessionLifecycleFingerprint: _fingerprint,
            ...malformed
          } = binding as Extract<typeof binding, {
            schemaVersion: 'tianwen.run-binding.v3'
          }>
          return malformed as typeof binding
        }
        if (fault === 'tampered-fingerprint') {
          return {
            ...binding,
            sessionLifecycleFingerprint: `sha256:${'f'.repeat(64)}`,
          }
        }
        return { ...binding, scopeKey: `${binding.scopeKey}:drift` }
      })

      try {
        await expect(mounted.harness.ctx.tianwenSkillEvaluation
          .runControlledSkillTransition(input)).resolves.toMatchObject({
          state: 'stopped',
          stop: { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
        })
        expect(mounted.adapter.requests).toEqual([])
      } finally {
        mounted.disposeParent()
        mounted.disposeVerifier()
        await mounted.harness.ctx.fiber.dispose()
      }
    },
  )

  it('atomically restores the previous pointer for every bounded post-begin failure class', async () => {
    const cases = [
      { name: 'agent-create', fault: 'agent-create', expected: 'agent-create-failed' },
      { name: 'binding', fault: 'binding', expected: 'run-fact-mismatch' },
      { name: 'provider', fault: 'none', script: [new Error('D:/private/provider-error')], expected: 'provider-failed' },
      { name: 'timeout', fault: 'timeout', expected: 'timeout' },
      { name: 'tool-limit', fault: 'tool-limit', expected: 'tool-limit-exceeded' },
      { name: 'request', fault: 'request', expected: 'request-contract-mismatch' },
      { name: 'persistence', fault: 'persistence', expected: 'persistence-unavailable' },
      { name: 'skill-use', fault: 'skill-use', expected: 'skill-use-missing' },
      { name: 'evidence', fault: 'evidence', expected: 'acceptance-subject-mismatch' },
      { name: 'workspace', fault: 'workspace', expected: 'run-fact-mismatch' },
      { name: 'root', fault: 'root', expected: 'root-skill-drift' },
      { name: 'pointer', fault: 'pointer', expected: 'pointer-drift' },
      { name: 'not-met', fault: 'not-met', expected: 'post-check-not-met' },
      { name: 'inconclusive', fault: 'inconclusive', expected: 'post-check-inconclusive' },
    ] as const

    for (const item of cases) {
      const ordinary = successfulScript(['promote'])
      const script = item.script ?? (item.fault === 'tool-limit'
        ? [
            toolCallResponse('limit-skill-1', 'skill', { name: parentSkill.name }),
            toolCallResponse('limit-verify-1', acceptance.toolName, {
              subject: { kind: 'promote', accepted: true },
            }),
            toolCallResponse('limit-skill-2', 'skill', { name: parentSkill.name }),
            toolCallResponse('limit-verify-2', acceptance.toolName, {
              subject: { kind: 'promote', accepted: true },
            }),
            toolCallResponse('limit-skill-3', 'skill', { name: parentSkill.name }),
          ]
        : item.fault === 'evidence'
          ? [
              toolCallResponse('evidence-skill', 'skill', { name: parentSkill.name }),
              toolCallResponse('evidence-verify', acceptance.toolName, {
                subject: { kind: 'wrong', accepted: true },
              }),
              textResponse('completed mismatched evidence'),
            ]
          : ordinary)
      const mounted = await mountActivationRuntime(`failure-${item.name}`, script, {
        ...(item.fault === 'timeout' ? { firstRequestDelayMs: 30 } : {}),
        ...(item.fault === 'request' ? { tamperFirstRequestPurpose: true } : {}),
        ...(item.fault === 'workspace' ? { mutateWorkspaceKind: 'promote' as const } : {}),
        ...(item.fault === 'root' ? { driftRootKind: 'promote' as const } : {}),
        ...(item.fault === 'pointer' ? { driftPointerKind: 'promote' as const } : {}),
        ...(item.fault === 'not-met' ? { rejectKind: 'promote' as const } : {}),
        ...(item.fault === 'inconclusive' ? { inconclusiveKind: 'promote' as const } : {}),
      })
      const input = mounted.input('promote', 1)
      if (item.fault === 'timeout') {
        input.task.stopContract.maxElapsedMs = 1
      } else if (item.fault === 'agent-create') {
        vi.spyOn(mounted.harness.ctx.agents, 'create')
          .mockRejectedValueOnce(new Error('D:/private/agent-create-error'))
      } else if (item.fault === 'binding') {
        vi.spyOn(mounted.harness.ctx.tianwenLearningIntake, 'bindRunWithSkill')
          .mockRejectedValueOnce(new Error('D:/private/binding-error'))
      } else if (item.fault === 'persistence') {
        vi.spyOn(mounted.harness.ctx.sessions, 'flush').mockResolvedValueOnce(false)
      } else if (item.fault === 'skill-use') {
        vi.spyOn(mounted.harness.ctx.tianwenLearningIntake, 'recordSkillUse')
          .mockReturnValueOnce({
            decision: 'recorded',
            parentVersionId: mounted.seeded.shadow.candidateVersionId,
            skillCallSeq: 1,
            duplicate: false,
            sessionUnchanged: true,
          })
      }
      const evolution = mounted.harness.ctx.tianwenEvolution
      const before = evolution.getControlledSkillScopePointer(mounted.seeded.shadow.scopeKey)
      const requestsBefore = mounted.adapter.requests.length

      try {
        const receipt = await mounted.harness.ctx.tianwenSkillEvaluation
          .runControlledSkillTransition(input)
        expect(receipt, item.name).toMatchObject({
          state: 'stopped',
          stop: { reasonCode: item.expected },
          transition: { state: 'recovered', reasonCode: item.expected },
        })
        expect(evolution.getControlledSkillScopePointer(mounted.seeded.shadow.scopeKey), item.name)
          .toEqual({ ...before!, revision: before!.revision + 2 })
        expect(evolution.listControlledSkillTransitions(), item.name).toHaveLength(1)
        expect(mounted.adapter.requests.length, item.name).toBeGreaterThanOrEqual(requestsBefore)
        expect(JSON.stringify(receipt), item.name).not.toContain('D:/private')
      } finally {
        mounted.disposeParent()
        mounted.disposeVerifier()
        await mounted.harness.ctx.fiber.dispose()
      }
    }
  })
})
