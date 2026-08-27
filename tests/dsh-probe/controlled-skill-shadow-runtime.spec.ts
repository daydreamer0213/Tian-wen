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
import type { GenerateOptions, StreamChunk } from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import { apply } from '../../packages/tianwen-runtime/src/index.js'

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
) {
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker]) => {
    const sessionId = `session:controlled-shadow-runtime-seed:${suffix}`
    const binding = evolution.recordRunBinding({
      goalRef: 'goal:controlled-shadow-runtime-seed',
      taskRef: `task:controlled-shadow-runtime-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-shadow-runtime-summary',
      acceptanceContract: acceptance,
    })
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill: parentSkill })
    const sessionDigest = sha256(`shadow-runtime-seed-session:${marker}`)
    const evidenceId = sha256(`shadow-runtime-seed-evidence:${marker}`)
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
      skillEvidenceId: sha256(`shadow-runtime-seed-skill-evidence:${marker}`),
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
  const candidate = evolution.recordSkillCandidate({
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
  const openedEvaluation = evolution.openControlledSkillEvaluation({
    candidateId: candidate.candidateId,
    protocolId: frozen.protocolId,
    sessionAllocations: protocol.tasks.map(task => ({
      taskId: task.taskId,
      baselineSessionId: `session:shadow-source:${task.taskType}:baseline`,
      candidateSessionId: `session:shadow-source:${task.taskType}:candidate`,
      evaluatorSessionId: `session:shadow-source:${task.taskType}:evaluator`,
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
      })
      const skill = arm.role === 'baseline'
        ? parentSkill
        : { ...evolution.getSkillCandidate(plan.candidateId)!.payload, provider: 'runtime' }
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
        skillName: parentSkill.name,
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
        x: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
        y: { relevance: 3, correctnessReasoning: 3, clarityUsability: 3, scopeRestraint: 3 },
      },
    })
  }
  evolution.recordControlledSkillEvaluationResult({ evaluationId: plan.evaluationId })
  return { candidate, plan }
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
