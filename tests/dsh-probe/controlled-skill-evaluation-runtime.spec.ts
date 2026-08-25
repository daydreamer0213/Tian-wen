import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import * as DshCompat from '@tianwen/dsh-compat'

import {
  DynamicCordisRunnerService,
  CallId,
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
import {
  ControlledSkillEvaluatorPreflightError,
  TianwenSkillEvaluationService,
  apply,
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

const parentSkill = {
  name: 'controlled-runtime-summary',
  description: 'Summarize one controlled observation.',
  whenToUse: 'When a controlled task requests a concise verified summary.',
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

const roots: string[] = []

class SummaryRequirementNotMet extends HarnessError {
  constructor() {
    super('controlled baseline requirement not met', acceptance.notMetErrorCode)
  }
}

class InconclusiveVerifierFailure extends HarnessError {
  constructor() {
    super('controlled verifier was inconclusive', 'CONTROLLED_VERIFIER_INCONCLUSIVE')
  }
}

function fixtureRoot(name: string): string {
  const root = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'controlled-skill-evaluation-runtime',
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

class ControlledScriptedAdapter extends ScriptedAdapter {
  private delayed = false
  private readonly delayedEvaluatorSessions = new Set<string>()

  constructor(
    script: readonly (readonly StreamChunk[] | Error)[],
    private readonly firstRequestDelayMs = 0,
    private readonly evaluatorRequestDelayMs = 0,
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
    const sessionId = String(options.sessionId)
    if (sessionId.endsWith(':evaluator')
      && !this.delayedEvaluatorSessions.has(sessionId)
      && this.evaluatorRequestDelayMs > 0) {
      this.delayedEvaluatorSessions.add(sessionId)
      await new Promise(resolve => setTimeout(resolve, this.evaluatorRequestDelayMs))
    }
    yield* super.stream(options)
  }
}

function seedControlledCandidate(
  evolution: Awaited<ReturnType<typeof mountPersistentHarness>>['ctx']['tianwenEvolution'],
  protocol: Parameters<typeof evolution.freezeControlledSkillEvalProtocol>[0]['protocol'],
) {
  const seeded = [
    ['first', 'not-met', 'a'],
    ['second', 'not-met', 'b'],
    ['counterexample', 'met', 'c'],
  ] as const
  const runs = seeded.map(([suffix, verdict, marker]) => {
    const sessionId = `session:controlled-runtime-seed:${suffix}`
    const binding = evolution.recordRunBinding({
      goalRef: 'goal:controlled-runtime-seed',
      taskRef: `task:controlled-runtime-seed:${suffix}`,
      sessionId,
      scopeKey: 'project:tianwen/capability:controlled-runtime-summary',
      acceptanceContract: acceptance,
    })
    const manifest = evolution.recordRunSkillManifest({ runId: binding.runId, skill: parentSkill })
    const sessionDigest = sha256(`seed-session:${marker}`)
    const evidenceId = sha256(`seed-evidence:${marker}`)
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
      skillEvidenceId: sha256(`seed-skill-evidence:${marker}`),
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
      description: parentSkill.description,
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
  return { candidateId: candidate.candidateId, protocolId: frozen.protocolId }
}

async function mountControlledRuntime(
  name: string,
  script: readonly (readonly StreamChunk[] | Error)[] = [],
  options: {
    readonly maxToolCalls?: number
    readonly maxElapsedMs?: number
    readonly firstRequestDelayMs?: number
    readonly rejectCandidateTaskType?: typeof taskTypes[number]
    readonly maxEvaluatorMaterialBytes?: number
    readonly tamperFirstRequestPurpose?: boolean
    readonly baselineImprovementRequired?: boolean
    readonly inconclusiveCandidateTaskType?: typeof taskTypes[number]
    readonly evaluatorRequestDelayMs?: number
    readonly tamperEvaluatorRequestIdentity?: boolean
    readonly includeConfiguredRouteContext?: boolean
    readonly includeReviewedCommonIdentityContext?: boolean
    readonly includeWorkspacePolicyContext?: boolean
    readonly includeRoleSpecificPromptDrift?: boolean
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
    description: 'Verify one controlled summary.',
    parameters: { subject: { type: 'object', additionalProperties: true, required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      verifierBodies.push(String(exec.agent?.id))
      const task = (args as { subject?: { task?: unknown } }).subject?.task
      if (String(exec.agent?.id).endsWith(':candidate')
        && task === options.inconclusiveCandidateTaskType) {
        throw new InconclusiveVerifierFailure()
      }
      if (
        (options.baselineImprovementRequired !== false
          && String(exec.agent?.id).endsWith(':baseline')
          && (task === 'original-problem' || task === 'adjacent-transfer'))
        || (String(exec.agent?.id).endsWith(':candidate')
          && task === options.rejectCandidateTaskType)
      ) {
        throw new SummaryRequirementNotMet()
      }
      return 'verified'
    },
  }))
  const disposeParent = harness.ctx.skills.register(parentSkill)
  const adapter = new ControlledScriptedAdapter(
    script,
    options.firstRequestDelayMs,
    options.evaluatorRequestDelayMs,
  )
  harness.ctx.llm.registerAdapter([CONTROLLED_PROVIDER], adapter)
  let selection = { provider: CONTROLLED_PROVIDER, model: CONTROLLED_MODEL }
  harness.ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ ...selection }),
  })
  let requestTampered = false
  if (options.tamperFirstRequestPurpose === true) {
    harness.ctx.on('llm/stream', (request, next) => {
      if (!requestTampered) {
        requestTampered = true
        ;(request as unknown as { purpose?: string }).purpose = 'controlled-test'
      }
      return next()
    })
  }
  if (options.includeWorkspacePolicyContext === true) {
    harness.ctx.systemPrompt.context({
      name: 'sandbox:policy',
      order: 110,
      text: context => {
        const cwd = context.agent?.session.header.cwd
        return cwd === undefined
          ? ''
          : `Current DSH file policy workspace: ${JSON.stringify(cwd)}.`
      },
    })
  }
  if (options.includeRoleSpecificPromptDrift === true) {
    harness.ctx.systemPrompt.context({
      name: 'test:role-specific-drift',
      order: 111,
      text: context => String(context.agent?.id).endsWith(':baseline')
        ? 'Unowned prompt fact alpha.'
        : 'Unowned prompt fact beta.',
    })
  }
  await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })
  if (options.tamperEvaluatorRequestIdentity === true) {
    harness.ctx.systemPrompt.section({
      name: 'test:controlled-evaluator-identity-leak',
      order: 999,
      text: context => String(context.agent?.id).endsWith(':evaluator')
        ? '# Controlled summary\n\nState the verified result before interpretation.'
        : '',
    })
  }
  if (options.includeConfiguredRouteContext === true) {
    harness.ctx.systemPrompt.context({
      name: 'test:configured-route-context',
      order: 998,
      text: context => String(context.agent?.id).endsWith(':evaluator')
        ? `Configured route: ${CONTROLLED_PROVIDER}/${CONTROLLED_MODEL}.`
        : '',
    })
  }

  const allowedTools = ['skill', 'verify_summary'] as const
  const toolSchemas = harness.ctx.tools.schemas()
    .filter(schema => allowedTools.includes(schema.name as typeof allowedTools[number]))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const toolSchemaDigest = sha256(toolSchemas)
  const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
  const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
  const tasks = taskTypes.map((taskType, index) => {
    const workspaceContent = `controlled workspace ${index}\n`
    const workspaceSnapshot = {
      schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
      entries: [{
        relativePath: 'brief.txt',
        contentDigest: rawDigest(workspaceContent),
        size: Buffer.byteLength(workspaceContent, 'utf8'),
      }],
    }
    const baselineWorkspaceRoot = join(root, 'workspaces', taskType, 'baseline')
    const candidateWorkspaceRoot = join(root, 'workspaces', taskType, 'candidate')
    for (const workspaceRoot of [baselineWorkspaceRoot, candidateWorkspaceRoot]) {
      mkdirSync(workspaceRoot, { recursive: true })
      writeFileSync(join(workspaceRoot, 'brief.txt'), workspaceContent, 'utf8')
    }
    const verifierArguments = { subject: { task: taskType, accepted: true } }
    const authorization = { mode: 'fixture-only', task: taskType }
    const verifierContract = { toolName: acceptance.toolName, arguments: verifierArguments }
    const stopCondition = { terminal: 'completed-final-assistant-text' }
    const evaluatorMaterialContract = {
      schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1' as const,
      source: 'final-completed-assistant-text' as const,
      maxUtf8Bytes: options.maxEvaluatorMaterialBytes ?? 4_096,
    }
    return {
      taskId: `eval-task:${taskType}` as const,
      taskType,
      goal: options.includeReviewedCommonIdentityContext === true
        ? `Compare the candidate architecture for controlled ${taskType} task ${index}.`
        : `Complete controlled ${taskType} task ${index}.`,
      input: options.includeReviewedCommonIdentityContext === true
        ? `Use ${parentSkill.name} for the shared task context, then verify task ${index}.`
        : `Use the available Skill, then verify controlled task ${index}.`,
      baselineWorkspaceRoot,
      candidateWorkspaceRoot,
      workspaceSnapshot,
      authorization,
      verifierContract,
      verifierArguments,
      stopCondition,
      evaluatorMaterialContract,
      baselineSessionId: `session:controlled-eval:fixture:${taskType}:baseline`,
      candidateSessionId: `session:controlled-eval:fixture:${taskType}:candidate`,
      evaluatorSessionId: `session:controlled-eval:fixture:${taskType}:evaluator`,
      toolSchemaDigest,
    }
  })
  const protocol = {
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    tasks: tasks.map(task => ({
      taskId: task.taskId,
      taskType: task.taskType,
      goalDigest: sha256(task.goal),
      inputDigest: sha256(task.input),
      workspaceSnapshotDigest: sha256(task.workspaceSnapshot),
      toolSchemaDigest: task.toolSchemaDigest,
      authorizationDigest: sha256(task.authorization),
      verifierContractDigest: sha256(task.verifierContract),
      stopConditionDigest: sha256(task.stopCondition),
      evaluatorMaterialContractDigest: sha256(task.evaluatorMaterialContract),
      acceptanceContract: acceptance,
      acceptanceSubjectDigest: sha256(task.verifierArguments),
      allowedTools,
      stopContract: {
        maxToolCalls: options.maxToolCalls ?? 4,
        maxElapsedMs: options.maxElapsedMs ?? 10_000,
      },
    })),
    execution: {
      dshVersion: '0.1.0-rc.7' as const,
      providerId: callConfig.provider,
      modelId: callConfig.model,
      callConfigDigest: sha256(callConfig),
      toolSchemaDigest: sha256(tasks.map(task => ({
        taskId: task.taskId,
        toolSchemaDigest: task.toolSchemaDigest,
      }))),
      retryPolicyDigest: sha256(retryPolicy),
    },
  }
  const seeded = seedControlledCandidate(harness.ctx.tianwenEvolution, protocol)
  return {
    adapter,
    disposeParent,
    disposeVerifier,
    harness,
    verifierBodies,
    requestWasTampered: () => requestTampered,
    input: {
      candidateId: seeded.candidateId,
      protocolId: seeded.protocolId,
      tasks: tasks.map(({
        taskType: _taskType,
        verifierArguments: _verifierArguments,
        toolSchemaDigest: _toolSchemaDigest,
        ...task
      }) => task),
    },
    setSelection(value: { provider: string; model: string }) { selection = value },
  }
}

function successfulArmScript() {
  return taskTypes.flatMap(taskType =>
    (['baseline', 'candidate'] as const).flatMap(role => [
      toolCallResponse(`${taskType}-${role}-skill`, 'skill', {
        name: parentSkill.name,
      }),
      toolCallResponse(`${taskType}-${role}-verify`, acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      textResponse(`completed ${taskType} ${role}`),
    ]))
}

function blindSafeArmScript() {
  return taskTypes.flatMap(taskType =>
    (['baseline', 'candidate'] as const).flatMap((role, index) => [
      toolCallResponse(`${taskType}-${role}-blind-skill`, 'skill', {
        name: parentSkill.name,
      }),
      toolCallResponse(`${taskType}-${role}-blind-verify`, acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      textResponse(`completed ${taskType} option ${index + 1}`),
    ]))
}

function successfulEvaluatorScript() {
  return taskTypes.map(taskType => toolCallResponse(
    `${taskType}-blind-score`,
    'submit_blind_evaluation',
    {
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: {
          relevance: 3,
          correctnessReasoning: 3,
          clarityUsability: 3,
          scopeRestraint: 3,
        },
        y: {
          relevance: 3,
          correctnessReasoning: 3,
          clarityUsability: 3,
          scopeRestraint: 3,
        },
      },
    },
  ))
}

function evaluatorSubmission(
  status: 'scored' | 'inconclusive' = 'scored',
) {
  return status === 'scored'
    ? {
        status: 'scored' as const,
        insufficientMaterial: false as const,
        reasonCode: 'score-submitted' as const,
        scores: {
          x: {
            relevance: 3,
            correctnessReasoning: 3,
            clarityUsability: 3,
            scopeRestraint: 3,
          },
          y: {
            relevance: 3,
            correctnessReasoning: 3,
            clarityUsability: 3,
            scopeRestraint: 3,
          },
        },
      }
    : {
        status: 'inconclusive' as const,
        insufficientMaterial: true as const,
        reasonCode: 'material-missing' as const,
      }
}

function twoEvaluatorSubmissions(): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: CallId('blind-score-first'),
        name: 'submit_blind_evaluation',
        arguments: JSON.stringify(evaluatorSubmission()),
      },
    },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 1,
      block: {
        type: 'tool-call',
        id: CallId('blind-score-second'),
        name: 'submit_blind_evaluation',
        arguments: JSON.stringify(evaluatorSubmission()),
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function evaluatorInput(
  input: Awaited<ReturnType<typeof mountControlledRuntime>>['input'],
  evaluationId: string,
) {
  return {
    evaluationId,
    tasks: input.tasks.map(task => ({
      taskId: task.taskId,
      goal: task.goal,
      input: task.input,
      evaluatorMaterialContract: task.evaluatorMaterialContract,
    })),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('controlled Skill evaluation Runtime', () => {
  it('declares common runtime capabilities without requiring controlled-only prerequisites', () => {
    expect(TianwenSkillEvaluationService.inject).toEqual([
      'agents',
      'llm',
      'sessions',
      'skills',
      'tianwenEvidence',
      'tianwenEvolution',
      'tianwenLearningIntake',
      'tools',
    ])
  })

  it('reuses the public DSH model-selection installer through compat', async () => {
    const compat = await import('@tianwen/dsh-compat') as unknown as {
      installModelSelection?: unknown
    }
    expect(compat.installModelSelection).toBeTypeOf('function')
  })

  it('loads controlled Runtime dependencies from the public compat subpath', async () => {
    const runtime = await import('@tianwen/dsh-compat/runtime') as unknown as {
      defineTool?: unknown
      installModelSelection?: unknown
    }
    expect(runtime.defineTool).toBeTypeOf('function')
    expect(runtime.installModelSelection).toBeTypeOf('function')
  })

  it('rejects an invalid evaluator package before creating evaluator activity', async () => {
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: fixtureRoot('invalid-evaluator-package') })
    const service = harness.ctx.tianwenSkillEvaluation as unknown as {
      runControlledEvaluators(input: unknown): Promise<unknown>
    }

    try {
      const operation = Promise.resolve().then(() => service.runControlledEvaluators({
        evaluationId: 'evaluation:missing',
        tasks: [],
      }))
      await expect(operation).rejects.toBeInstanceOf(ControlledSkillEvaluatorPreflightError)
      await expect(operation).rejects.toMatchObject({
        name: 'ControlledSkillEvaluatorPreflightError',
        code: 'task-package-mismatch',
      })
      expect(harness.ctx.agents.list()).toEqual([])
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      await harness.ctx.fiber.dispose()
    }
  })

  it('rejects evaluator task fact drift before creating an evaluator Agent', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-task-drift',
      successfulArmScript(),
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
      const input = evaluatorInput(mounted.input, arms.evaluationId)
      input.tasks[0] = { ...input.tasks[0]!, goal: 'changed after protocol freeze' }

      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(input))
        .rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects evaluator activity before all objective pairs pass', async () => {
    const mounted = await mountControlledRuntime('evaluator-objective-gate')
    try {
      const opened = mounted.harness.ctx.tianwenEvolution.openControlledSkillEvaluation({
        candidateId: mounted.input.candidateId,
        protocolId: mounted.input.protocolId,
        sessionAllocations: mounted.input.tasks.map(task => ({
          taskId: task.taskId,
          baselineSessionId: task.baselineSessionId,
          candidateSessionId: task.candidateSessionId,
          evaluatorSessionId: task.evaluatorSessionId,
        })),
      })
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')

      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, opened.evaluationId),
      )).rejects.toMatchObject({ code: 'evaluation-not-ready' })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        opened.evaluationId,
      )).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('replays an objective-only terminal result without creating an evaluator Agent', async () => {
    const firstTask = taskTypes[0]
    const script = (['baseline', 'candidate'] as const).flatMap(role => [
      toolCallResponse(`evaluator-terminal-${role}-skill`, 'skill', { name: parentSkill.name }),
      toolCallResponse(`evaluator-terminal-${role}-verify`, acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse(`${role} complete`),
    ])
    const mounted = await mountControlledRuntime(
      'evaluator-objective-terminal',
      script,
      { rejectCandidateTaskType: firstTask },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('terminal')
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1',
        evaluationId: arms.evaluationId,
        state: 'terminal',
        completedTaskIds: [],
        result: arms.state === 'terminal' ? arms.result : undefined,
      })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toHaveLength(6)
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('runs five independent blind evaluators and records the revealed result', async () => {
    const mounted = await mountControlledRuntime(
      'five-blind-evaluators',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
      const inspect = vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1',
        evaluationId: arms.evaluationId,
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: {
          mechanismVerdict: 'pass',
          reasonCode: 'all-gates-passed',
          baselineTotal: 60,
          candidateTotal: 60,
        },
      })
      expect(create).toHaveBeenCalledTimes(5)
      expect(inspect).toHaveBeenCalledTimes(10)
      expect(mounted.adapter.requests).toHaveLength(35)
      const evaluatorRequests = mounted.adapter.requests.slice(30)
      expect(evaluatorRequests.map(request => String(request.sessionId))).toEqual(
        mounted.input.tasks.map(task => task.evaluatorSessionId),
      )
      expect(evaluatorRequests.every(request =>
        request.tools?.map(tool => tool.name).join(',') === 'submit_blind_evaluation'))
        .toBe(true)
      expect(evaluatorRequests.some(request => request.messages.some(message =>
        (message.source as { kind?: string }).kind === 'skill-catalog'))).toBe(false)
      const serializedRequests = JSON.stringify(evaluatorRequests)
      expect(serializedRequests).not.toContain('candidatePassRules')
      expect(serializedRequests).not.toContain(parentSkill.name)
      expect(serializedRequests).not.toContain(mounted.input.candidateId)
      for (const task of mounted.input.tasks) {
        expect(serializedRequests).not.toContain(task.baselineWorkspaceRoot)
        expect(serializedRequests).not.toContain(task.candidateWorkspaceRoot)
      }
      const observations = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)
      expect(observations).toHaveLength(5)
      expect(observations.map(observation => observation.requestDigest)).toEqual(
        evaluatorRequests.map(request => sha256(request)),
      )
      expect(observations.every(observation => observation.status === 'scored')).toBe(true)
      const blindMap = mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )!
      const objectives = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(arms.evaluationId)
      for (const [index, request] of evaluatorRequests.entries()) {
        const message = request.messages.findLast(item => item.role === 'user')!
        const block = message.content.find(item => item.type === 'text')!
        const envelope = JSON.parse(block.type === 'text' ? block.text : '') as Record<string, any>
        const task = mounted.input.tasks[index]!
        const assignment = blindMap.assignments[index]!
        const objective = objectives[index]!
        expect(Object.keys(envelope).sort()).toEqual([
          'goal', 'input', 'rubric', 'rubricDigest', 'taskId', 'x', 'y',
        ])
        expect(Object.keys(envelope.rubric).sort()).toEqual(['dimensions', 'scoreAnchors'])
        expect(envelope).toMatchObject({
          taskId: task.taskId,
          goal: task.goal,
          input: task.input,
          rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
          x: {
            materialText: `completed ${taskTypes[index]} option ${assignment.xRole === 'baseline' ? 1 : 2}`,
            outcome: objective[assignment.xRole].outcome,
            materialDigest: objective[assignment.xRole].evaluatorMaterialDigest,
            evidenceSetDigest: sha256(objective[assignment.xRole].evidenceIds),
          },
          y: {
            materialText: `completed ${taskTypes[index]} option ${assignment.yRole === 'baseline' ? 1 : 2}`,
            outcome: objective[assignment.yRole].outcome,
            materialDigest: objective[assignment.yRole].evaluatorMaterialDigest,
            evidenceSetDigest: sha256(objective[assignment.yRole].evidenceIds),
          },
        })
      }
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(15)
      for (const task of mounted.input.tasks) {
        const inspection = await mounted.harness.ctx.sessionPersistence.inspect(
          SessionId(task.evaluatorSessionId),
        )
        expect(inspection.meta.cwd).toBe(dirname(task.baselineWorkspaceRoot))
      }
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('keeps reviewed common task identity visible while blinding arm material', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-reviewed-common-context',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
      { includeReviewedCommonIdentityContext: true },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: { mechanismVerdict: 'pass', reasonCode: 'all-gates-passed' },
      })
      const evaluatorRequests = mounted.adapter.requests.slice(30)
      expect(evaluatorRequests).toHaveLength(5)
      for (const request of evaluatorRequests) {
        const message = request.messages.findLast(item => item.role === 'user')!
        const block = message.content.find(item => item.type === 'text')!
        const envelope = JSON.parse(block.type === 'text' ? block.text : '') as {
          input: string
          x: { materialText: string }
          y: { materialText: string }
        }
        expect(envelope.input).toContain(parentSkill.name)
        expect(envelope.x.materialText).not.toMatch(/\b(?:baseline|candidate)\b/iu)
        expect(envelope.y.materialText).not.toMatch(/\b(?:baseline|candidate)\b/iu)
      }
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not treat ordinary baseline or candidate words as machine identity', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-arm-role-identity',
      [...successfulArmScript(), ...successfulEvaluatorScript()],
      { includeReviewedCommonIdentityContext: true },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        result: { mechanismVerdict: 'pass', reasonCode: 'all-gates-passed' },
      })
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )).toBeDefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('keeps the shared configured route visible to both blind arms', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-common-route',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
      { includeConfiguredRouteContext: true },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        result: { mechanismVerdict: 'pass', reasonCode: 'all-gates-passed' },
      })
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects an actual evaluator request identity leak before the Provider', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-request-identity',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
      { tamperEvaluatorRequestIdentity: true },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'evaluator',
          taskId: mounted.input.tasks[0]!.taskId,
          reasonCode: 'identity-exposed',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('re-reads all execution material and rejects a persisted digest drift', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-material-drift',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const inspect = mounted.harness.ctx.sessionPersistence.inspect.bind(
        mounted.harness.ctx.sessionPersistence,
      )
      let changed = false
      vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')
        .mockImplementation(async sessionId => {
          const inspection = await inspect(sessionId)
          if (changed) return inspection
          changed = true
          const clone = structuredClone(inspection) as typeof inspection & {
            events: Array<Record<string, unknown>>
          }
          const message = clone.events.findLast(event => event.type === 'assistant/message') as {
            data: { message: { content: unknown[] } }
          }
          message.data.message.content = [{ type: 'text', text: 'tampered durable material' }]
          return clone as typeof inspection
        })
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')

      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )).rejects.toMatchObject({ code: 'material-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects evaluator activity when a persisted arm leaves the pair workspace', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-pair-workspace-drift',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const inspect = mounted.harness.ctx.sessionPersistence.inspect.bind(
        mounted.harness.ctx.sessionPersistence,
      )
      const candidateSessionId = mounted.input.tasks[0]!.candidateSessionId
      vi.spyOn(mounted.harness.ctx.sessionPersistence, 'inspect')
        .mockImplementation(async sessionId => {
          const inspection = await inspect(sessionId)
          if (String(sessionId) !== candidateSessionId) return inspection
          return {
            ...inspection,
            meta: {
              ...inspection.meta,
              cwd: join(inspection.meta.cwd!, '..', 'other-pair', 'candidate'),
            },
          }
        })
      const create = vi.spyOn(mounted.harness.ctx.agents, 'create')

      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )).rejects.toMatchObject({ code: 'material-mismatch' })
      expect(create).not.toHaveBeenCalled()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a non-fresh evaluator Session before freezing the blind map', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-session-not-fresh',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      mounted.harness.ctx.sessions.create(
        SessionId(mounted.input.tasks[0]!.evaluatorSessionId),
      )

      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )).rejects.toMatchObject({ code: 'session-not-empty' })
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
        arms.evaluationId,
      )).toBeUndefined()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records a submitted inconclusive observation and stops later evaluators', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-inconclusive',
      [
        ...blindSafeArmScript(),
        toolCallResponse(
          'blind-inconclusive',
          'submit_blind_evaluation',
          evaluatorSubmission('inconclusive'),
        ),
      ],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: [mounted.input.tasks[0]!.taskId],
        result: {
          mechanismVerdict: 'inconclusive',
          reasonCode: 'material-missing',
          baselineTotal: null,
          candidateTotal: null,
        },
      })
      expect(mounted.adapter.requests).toHaveLength(31)
      const observations = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)
      expect(observations).toEqual([expect.objectContaining({
        taskId: mounted.input.tasks[0]!.taskId,
        status: 'inconclusive',
        insufficientMaterial: true,
        reasonCode: 'material-missing',
      })])
      expect(JSON.stringify(observations)).not.toContain('scores')
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not forge an observation for Provider failure and stops partial replay', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-provider-failure',
      [...blindSafeArmScript(), new Error('D:/private/evaluator-provider-failure')],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const input = evaluatorInput(mounted.input, arms.evaluationId)

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'evaluator', reasonCode: 'provider-failed' },
      })
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
      expect(JSON.stringify(receipt)).not.toContain('evaluator-provider-failure')
      const requests = mounted.adapter.requests.length

      const replay = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        input,
      )
      expect(replay).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'postflight', reasonCode: 'existing-partial-activity' },
      })
      expect(mounted.adapter.requests).toHaveLength(requests)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not forge an observation when the evaluator submits no score', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-no-submit',
      [...blindSafeArmScript(), textResponse('no score submitted')],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'evaluator', reasonCode: 'score-not-submitted' },
      })
      expect(mounted.adapter.requests).toHaveLength(31)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not forge an observation after the evaluator wall-clock timeout', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-timeout',
      [...blindSafeArmScript(), textResponse('too late')],
      { maxElapsedMs: 100, evaluatorRequestDelayMs: 250 },
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'evaluator', reasonCode: 'timeout' },
      })
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a second submit call before its tool body records an observation', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-second-submit',
      [...blindSafeArmScript(), twoEvaluatorSubmissions()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'evaluator', reasonCode: 'submission-invalid' },
      })
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects extra evaluator submission fields without recording an observation', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-invalid-submit',
      [
        ...blindSafeArmScript(),
        toolCallResponse(
          'blind-invalid-score',
          'submit_blind_evaluation',
          { ...evaluatorSubmission(), prose: 'controller must not accept this' },
        ),
      ],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: { stage: 'evaluator', reasonCode: 'submission-invalid' },
      })
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId)).toEqual([])
      expect(JSON.stringify(receipt)).not.toContain('controller must not accept this')
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('continues from an exact blind-map commit-unknown write with empty evaluator Sessions', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-map-commit-unknown',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const freeze = mounted.harness.ctx.tianwenEvolution
        .freezeControlledSkillEvaluationBlindMap.bind(mounted.harness.ctx.tianwenEvolution)
      vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'freezeControlledSkillEvaluationBlindMap')
        .mockImplementation(input => {
          freeze(input)
          throw new Error('commit outcome unknown')
        })

      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
        evaluatorInput(mounted.input, arms.evaluationId),
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: { mechanismVerdict: 'pass' },
      })
      expect(mounted.adapter.requests).toHaveLength(35)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('replays a committed result after its write outcome was unknown', async () => {
    const mounted = await mountControlledRuntime(
      'evaluator-result-commit-unknown',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const recordResult = mounted.harness.ctx.tianwenEvolution
        .recordControlledSkillEvaluationResult.bind(mounted.harness.ctx.tianwenEvolution)
      vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordControlledSkillEvaluationResult')
        .mockImplementation(input => {
          recordResult(input)
          throw new Error('commit outcome unknown')
        })
      const input = evaluatorInput(mounted.input, arms.evaluationId)

      const unknown = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(input)
      expect(unknown).toMatchObject({
        state: 'stopped',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        stop: { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
      })
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        arms.evaluationId,
      )).toMatchObject({ mechanismVerdict: 'pass' })
      const requests = mounted.adapter.requests.length

      const replay = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(input)
      expect(replay).toMatchObject({
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: { mechanismVerdict: 'pass' },
      })
      expect(mounted.adapter.requests).toHaveLength(requests)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects an invalid task package before creating formal activity', async () => {
    const harness = await mountCoreHarness([])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})
    await apply(harness.ctx, { evolutionRoot: fixtureRoot('invalid-task-package') })
    const create = vi.spyOn(harness.ctx.agents, 'create')
    const bindRun = vi.spyOn(harness.ctx.tianwenEvolution, 'recordRunBinding')
    const service = harness.ctx.tianwenSkillEvaluation as unknown as {
      runControlledArms(input: unknown): Promise<unknown>
    }

    try {
      await expect(Promise.resolve().then(() => service.runControlledArms({
        candidateId: 'candidate:missing',
        protocolId: 'protocol:missing',
        tasks: [],
      }))).rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(harness.ctx.sessions.list()).toEqual([])
      expect(harness.adapter.requests).toEqual([])
      expect(harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
      expect(bindRun).not.toHaveBeenCalled()
    } finally {
      await harness.ctx.fiber.dispose()
    }
  })

  it('rejects configured route drift with no formal effects', async () => {
    const mounted = await mountControlledRuntime('configured-route-mismatch')
    mounted.setSelection({ provider: 'unregistered-provider', model: CONTROLLED_MODEL })
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    const bindRun = vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')

    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'configured-route-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(bindRun).not.toHaveBeenCalled()
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects workspace drift with no formal effects', async () => {
    const mounted = await mountControlledRuntime('workspace-mismatch')
    writeFileSync(
      join(mounted.input.tasks[0]!.baselineWorkspaceRoot, 'brief.txt'),
      'changed after protocol freeze\n',
      'utf8',
    )
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    const bindRun = vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')

    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(bindRun).not.toHaveBeenCalled()
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a hidden Windows absolute path in a workspace manifest', async () => {
    const mounted = await mountControlledRuntime('workspace-hidden-absolute')
    const input = {
      ...mounted.input,
      tasks: mounted.input.tasks.map((task, index) => index === 0
        ? {
            ...task,
            workspaceSnapshot: {
              ...task.workspaceSnapshot,
              entries: task.workspaceSnapshot.entries.map((entry, entryIndex) =>
                entryIndex === 0 ? { ...entry, relativePath: 'C:/private/brief.txt' } : entry),
            },
          }
        : task),
    }
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(input))
        .rejects.toMatchObject({ code: 'task-package-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a pre-existing controlled Session with no formal effects', async () => {
    const mounted = await mountControlledRuntime('session-not-empty')
    const first = mounted.input.tasks[0]!
    mounted.harness.ctx.sessions.create(SessionId(first.baselineSessionId), {
      meta: { cwd: first.baselineWorkspaceRoot },
    })
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    const bindRun = vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')

    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'session-not-empty' })
      expect(create).not.toHaveBeenCalled()
      expect(bindRun).not.toHaveBeenCalled()
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a scripted Session outside the dedicated fixture identity boundary', async () => {
    const mounted = await mountControlledRuntime('scripted-boundary-mismatch')
    const input = {
      ...mounted.input,
      tasks: mounted.input.tasks.map((task, index) => index === 0
        ? { ...task, evaluatorSessionId: 'session:controlled-eval:not-fixture:evaluator' }
        : task),
    }
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    const bindRun = vi.spyOn(mounted.harness.ctx.tianwenEvolution, 'recordRunBinding')

    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(input))
        .rejects.toMatchObject({ code: 'scripted-boundary-mismatch' })
      expect(create).not.toHaveBeenCalled()
      expect(bindRun).not.toHaveBeenCalled()
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects a Candidate chain mismatch with zero formal effects', async () => {
    const mounted = await mountControlledRuntime('candidate-chain')
    const manifests = mounted.harness.ctx.tianwenEvolution.listRunSkillManifests().length
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms({
        ...mounted.input,
        candidateId: `candidate:${'f'.repeat(64)}`,
      })).rejects.toMatchObject({ code: 'candidate-chain-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations())
        .toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listRunSkillManifests())
        .toHaveLength(manifests)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects retry-policy drift with zero formal effects', async () => {
    const mounted = await mountControlledRuntime('retry-drift')
    vi.spyOn(mounted.harness.ctx.llm, 'providerRetryPolicy').mockReturnValue({
      mode: 'normal',
      maxRetries: 1,
      retryableCodes: [],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'retry-policy-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects tool-surface drift with zero formal effects', async () => {
    const mounted = await mountControlledRuntime('tool-drift')
    mounted.disposeVerifier()
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'tool-surface-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.verifierBodies).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects unavailable persistence with zero formal effects', async () => {
    const mounted = await mountControlledRuntime('persistence-unavailable')
    vi.spyOn(mounted.harness.ctx.sessionPersistence, 'list')
      .mockRejectedValue(new Error('D:/private/persistence-must-not-leak'))
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'persistence-unavailable' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations())
        .toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('rejects root Skill drift with zero formal effects', async () => {
    const mounted = await mountControlledRuntime('root-skill-drift')
    mounted.disposeParent()
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).rejects.toMatchObject({ code: 'root-skill-mismatch' })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(mounted.adapter.requests).toEqual([])
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations())
        .toEqual([])
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('binds only the first Run before one provider failure and does not start C', async () => {
    const sentinel = 'D:/private/sk-provider-error-must-not-leak'
    const mounted = await mountControlledRuntime('provider-failure', [new Error(sentinel)])
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    let boundAtFirstRequest = 0
    let liveAtFirstRequest = 0
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (String(request.sessionId) === mounted.input.tasks[0]!.baselineSessionId) {
        liveAtFirstRequest = mounted.harness.ctx.agents.list().length
        const plan = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()[0]
        boundAtFirstRequest = plan === undefined
          ? 0
          : plan.tasks.flatMap(task => [task.baseline.runId, task.candidate.runId])
              .filter(runId =>
                mounted.harness.ctx.tianwenEvolution.getRunBinding(runId) !== undefined
                && mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(runId) !== undefined)
              .length
      }
      return next()
    })

    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      const first = mounted.input.tasks[0]!
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
        evaluationId: expect.stringMatching(/^evaluation:/u),
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          taskId: first.taskId,
          role: 'baseline',
          reasonCode: 'provider-failed',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(plan).toBeDefined()
      expect(create).toHaveBeenCalledTimes(1)
      expect(boundAtFirstRequest).toBe(1)
      expect(liveAtFirstRequest).toBe(1)
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(mounted.adapter.requests[0]!.sessionId).toBe(first.baselineSessionId)
      expect(mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluationObjectives(
        plan!.evaluationId,
      )).toEqual([])
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      const persistedIds = (await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id))
      expect(persistedIds).toContain(first.baselineSessionId)
      expect(persistedIds).not.toContain(first.candidateSessionId)
      const boundRunIds = plan!.tasks.flatMap(task => [task.baseline.runId, task.candidate.runId])
        .filter(runId =>
          mounted.harness.ctx.tianwenEvolution.getRunBinding(runId) !== undefined
          || mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(runId) !== undefined)
      expect(boundRunIds).toEqual([plan!.tasks[0]!.baseline.runId])
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(JSON.stringify(receipt)).not.toContain(sentinel)
      expect(JSON.stringify(receipt)).not.toContain(first.baselineWorkspaceRoot)
      expect(JSON.stringify(receipt)).not.toContain(first.input)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('replays plan and Run commit-unknown writes without a second model attempt', async () => {
    const mounted = await mountControlledRuntime(
      'commit-unknown',
      [new Error('commit-unknown provider stop')],
    )
    const evolution = mounted.harness.ctx.tianwenEvolution
    const candidate = evolution.getSkillCandidate(mounted.input.candidateId)!
    const parent = evolution.listRunSkillManifests()
      .find(item => item.parentVersionId === candidate.parentVersionId)!
    evolution.openControlledSkillEvaluation({
      candidateId: mounted.input.candidateId,
      protocolId: mounted.input.protocolId,
      sessionAllocations: mounted.input.tasks.map(task => ({
        taskId: task.taskId,
        baselineSessionId: task.baselineSessionId,
        candidateSessionId: task.candidateSessionId,
        evaluatorSessionId: task.evaluatorSessionId,
      })),
    })
    const [plan] = evolution.listControlledSkillEvaluations()
    for (const task of plan!.tasks) {
      for (const role of ['baseline', 'candidate'] as const) {
        const arm = task[role]
        const binding = evolution.recordRunBinding({
          goalRef: `goal:controlled-skill-evaluation:${plan!.protocolId}`,
          taskRef: `task:${task.taskId}:${role}`,
          sessionId: arm.sessionId,
          scopeKey: plan!.scopeKey,
          acceptanceContract: task.acceptanceContract,
          acceptanceSubjectDigest: task.acceptanceSubjectDigest,
        })
        expect(binding.runId).toBe(arm.runId)
        evolution.recordRunSkillManifest({
          runId: arm.runId,
          skill: role === 'baseline'
            ? { ...parent.parent, provider: parent.resolvedProvider }
            : { ...candidate.payload, provider: parent.resolvedProvider },
        })
      }
    }
    const manifestCount = evolution.listRunSkillManifests().length
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        stop: { reasonCode: 'provider-failed', role: 'baseline' },
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(evolution.listControlledSkillEvaluations()).toHaveLength(1)
      expect(evolution.listRunSkillManifests()).toHaveLength(manifestCount)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('runs five ordinary B/C pairs and returns awaiting-evaluator', async () => {
    const mounted = await mountControlledRuntime('five-pairs', successfulArmScript())
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toEqual({
        schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
        evaluationId: expect.stringMatching(/^evaluation:/u),
        state: 'awaiting-evaluator',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
      })
      expect(mounted.adapter.requests).toHaveLength(30)
      const objectives = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(receipt.evaluationId)
      expect(objectives).toHaveLength(5)
      for (const [index, objective] of objectives.entries()) {
        expect(objective).toMatchObject({
          objectiveVerdict: 'pass',
          baseline: {
            outcome: index < 2 ? 'not-met' : 'met',
            usedToolNames: ['skill', 'verify_summary'],
            usage: { modelRequests: 3, toolCalls: 2 },
          },
          candidate: {
            outcome: 'met',
            usedToolNames: ['skill', 'verify_summary'],
            usage: { modelRequests: 3, toolCalls: 2 },
          },
        })
        expect(objective.baseline.skillVersionId)
          .not.toBe(objective.candidate.skillVersionId)
      }
      expect(mounted.harness.ctx.sessions.list()).toEqual([])
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(10)

      const first = objectives[0]!.baseline
      const inspection = await mounted.harness.ctx.sessionPersistence.inspect(
        SessionId(first.sessionId),
      )
      const turnEnd = inspection.events.findLast(event => event.type === 'turn/end')
      const message = inspection.events.findLast(event =>
        event.type === 'assistant/message'
        && event.surfaceOp === 'append'
        && event.data.turn === (turnEnd?.type === 'turn/end' ? turnEnd.data.turn : -1))
      const text = message?.type === 'assistant/message'
        ? message.data.message.content.flatMap(block =>
            block.type === 'text' ? [block.text] : []).join('\n')
        : ''
      expect(first.evaluatorMaterialDigest).toBe(sha256({
        schemaVersion: 'tianwen.controlled-evaluator-material.v1',
        text,
      }))
      const privateState = JSON.stringify({
        plan: mounted.harness.ctx.tianwenEvolution
          .getControlledSkillEvaluation(receipt.evaluationId),
        objectives,
      })
      for (const task of mounted.input.tasks) {
        expect(privateState).not.toContain(task.input)
        expect(privateState).not.toContain(task.baselineWorkspaceRoot)
        expect(privateState).not.toContain(task.candidateWorkspaceRoot)
      }
      expect(privateState).not.toContain('completed original-problem baseline')
      expect(JSON.stringify(receipt)).not.toContain('completed original-problem baseline')

      const repeated = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(repeated).toEqual(receipt)
      expect(mounted.adapter.requests).toHaveLength(30)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('accepts arm requests owned by active controlled Sessions across module identities', async () => {
    const agentLoopIdentity = vi.spyOn(DshCompat, 'isAgentLoopRequest')
      .mockReturnValue(false)
    const mounted = await mountControlledRuntime(
      'owned-arm-requests-across-module-identities',
      successfulArmScript(),
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms).toMatchObject({
        state: 'awaiting-evaluator',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
      })
      expect(agentLoopIdentity).not.toHaveBeenCalled()
    } finally {
      agentLoopIdentity.mockRestore()
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('accepts evaluator requests owned by active controlled Sessions across module identities', async () => {
    const mounted = await mountControlledRuntime(
      'owned-evaluator-requests-across-module-identities',
      [...blindSafeArmScript(), ...successfulEvaluatorScript()],
    )
    try {
      const arms = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(arms.state).toBe('awaiting-evaluator')
      const agentLoopIdentity = vi.spyOn(DshCompat, 'isAgentLoopRequest')
        .mockReturnValue(false)
      try {
        const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledEvaluators(
          evaluatorInput(mounted.input, arms.evaluationId),
        )
        expect(receipt).toMatchObject({
          state: 'terminal',
          completedTaskIds: mounted.input.tasks.map(task => task.taskId),
          result: { mechanismVerdict: 'pass', reasonCode: 'all-gates-passed' },
        })
        expect(agentLoopIdentity).not.toHaveBeenCalled()
      } finally {
        agentLoopIdentity.mockRestore()
      }
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('compares paired request semantics across distinct controlled workspace contexts', async () => {
    const mounted = await mountControlledRuntime(
      'paired-request-workspace-context',
      successfulArmScript(),
      { includeWorkspacePolicyContext: true },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'awaiting-evaluator',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
      })
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('still rejects unowned prompt drift between a controlled pair', async () => {
    const mounted = await mountControlledRuntime(
      'paired-request-unowned-context-drift',
      successfulArmScript(),
      { includeRoleSpecificPromptDrift: true },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'pair',
          role: null,
          reasonCode: 'request-contract-mismatch',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(6)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records the five-objective no-improvement terminal result', async () => {
    const mounted = await mountControlledRuntime(
      'no-improvement',
      successfulArmScript(),
      { baselineImprovementRequired: false },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
        result: {
          mechanismVerdict: 'rejected',
          reasonCode: 'original-or-adjacent-not-improved',
          objectiveSetDigest: expect.stringMatching(/^sha256:/u),
          blindMapDigest: null,
          evaluatorSetDigest: null,
        },
      })
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(receipt.evaluationId)).toHaveLength(5)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops after a Candidate provider failure without forging an objective', async () => {
    let boundAtCandidateRequest = 0
    let liveAtCandidateRequest = 0
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-provider-failure', [
      toolCallResponse('b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
      new Error('D:/private/candidate-provider-error'),
    ])
    const create = vi.spyOn(mounted.harness.ctx.agents, 'create')
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (String(request.sessionId) === mounted.input.tasks[0]!.candidateSessionId) {
        liveAtCandidateRequest = mounted.harness.ctx.agents.list().length
        const plan = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()[0]
        boundAtCandidateRequest = plan === undefined
          ? 0
          : plan.tasks.flatMap(task => [task.baseline.runId, task.candidate.runId])
              .filter(runId =>
                mounted.harness.ctx.tianwenEvolution.getRunBinding(runId) !== undefined
                && mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(runId) !== undefined)
              .length
      }
      return next()
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'provider-failed',
        },
      })
      expect(create).toHaveBeenCalledTimes(2)
      expect(boundAtCandidateRequest).toBe(2)
      expect(liveAtCandidateRequest).toBe(1)
      expect(mounted.harness.ctx.agents.list()).toEqual([])
      expect(mounted.adapter.requests).toHaveLength(4)
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(plan!.evaluationId)).toEqual([])
      const boundRunIds = plan!.tasks.flatMap(task => [task.baseline.runId, task.candidate.runId])
        .filter(runId =>
          mounted.harness.ctx.tianwenEvolution.getRunBinding(runId) !== undefined
          || mounted.harness.ctx.tianwenEvolution.getRunSkillManifest(runId) !== undefined)
      expect(boundRunIds).toEqual([
        plan!.tasks[0]!.baseline.runId,
        plan!.tasks[0]!.candidate.runId,
      ])
      expect((await mounted.harness.ctx.sessionPersistence.list())
        .map(header => String(header.id)).toSorted()).toEqual([
          mounted.input.tasks[0]!.baselineSessionId,
          mounted.input.tasks[0]!.candidateSessionId,
        ].toSorted())
      expect(JSON.stringify(receipt)).not.toContain('candidate-provider-error')
      const repeated = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(repeated).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'postflight',
          role: null,
          reasonCode: 'existing-partial-activity',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(4)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports the candidate Agent creation phase instead of collapsing it into Run facts', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-create-failure', [
      toolCallResponse('create-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('create-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    const originalCreate = mounted.harness.ctx.agents.create.bind(mounted.harness.ctx.agents)
    let createCalls = 0
    vi.spyOn(mounted.harness.ctx.agents, 'create').mockImplementation(async (...args) => {
      createCalls += 1
      if (createCalls === 2) throw new Error('candidate create sentinel')
      return originalCreate(...args)
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'agent-create-failed',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.baseline.runId,
      )).toBeDefined()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.agents.list()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports the candidate Run binding phase before any candidate model request', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-binding-failure', [
      toolCallResponse('bind-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('bind-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    const intake = mounted.harness.ctx.tianwenLearningIntake
    const originalBind = intake.bindRunWithSkill.bind(intake)
    let bindCalls = 0
    vi.spyOn(intake, 'bindRunWithSkill').mockImplementation(async (...args) => {
      bindCalls += 1
      if (bindCalls === 2) throw new Error('candidate binding sentinel')
      return originalBind(...args)
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'run-binding-failed',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.harness.ctx.agents.list()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports candidate Skill identity drift before Run binding', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-skill-identity-drift', [
      toolCallResponse('skill-drift-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('skill-drift-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    const originalGet = mounted.harness.ctx.skills.get.bind(mounted.harness.ctx.skills)
    const candidateSessionId = mounted.input.tasks[0]!.candidateSessionId
    vi.spyOn(mounted.harness.ctx.skills, 'get').mockImplementation((name, options) =>
      String(options?.scope?.id) === candidateSessionId
        ? Promise.resolve(undefined)
        : originalGet(name, options))
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).resolves.toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'skill-identity-drift',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports candidate tool-surface drift before Run binding', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-tool-surface-drift', [
      toolCallResponse('tool-drift-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('tool-drift-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    const originalSchemas = mounted.harness.ctx.tools.schemas.bind(mounted.harness.ctx.tools)
    const candidateSessionId = mounted.input.tasks[0]!.candidateSessionId
    vi.spyOn(mounted.harness.ctx.tools, 'schemas').mockImplementation(scope => {
      const schemas = originalSchemas(scope)
      return String(scope?.id) === candidateSessionId ? schemas.slice(1) : schemas
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).resolves.toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'tool-surface-mismatch',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports candidate Agent context drift before Run binding', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-context-drift', [
      toolCallResponse('context-drift-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('context-drift-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    const first = mounted.input.tasks[0]!
    const originalCreate = mounted.harness.ctx.agents.create.bind(mounted.harness.ctx.agents)
    vi.spyOn(mounted.harness.ctx.agents, 'create').mockImplementation(request =>
      originalCreate(String(request.sessionId) === first.candidateSessionId
        ? { ...request, meta: { cwd: first.baselineWorkspaceRoot } }
        : request))
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).resolves.toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'agent-context-mismatch',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeUndefined()
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('reports candidate Agent disposal after its governed facts close', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-dispose-failure', [
      toolCallResponse('dispose-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('dispose-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
      toolCallResponse('dispose-c-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('dispose-c-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('candidate complete'),
    ])
    const originalCreate = mounted.harness.ctx.agents.create.bind(mounted.harness.ctx.agents)
    let createCalls = 0
    vi.spyOn(mounted.harness.ctx.agents, 'create').mockImplementation(async (...args) => {
      createCalls += 1
      const handle = await originalCreate(...args)
      if (createCalls !== 2) return handle
      return {
        agent: handle.agent,
        async dispose() {
          await handle.dispose()
          throw new Error('candidate dispose sentinel')
        },
      }
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'agent-dispose-failed',
        },
      })
      const [plan] = mounted.harness.ctx.tianwenEvolution.listControlledSkillEvaluations()
      expect(mounted.harness.ctx.tianwenEvolution.getRunBinding(
        plan!.tasks[0]!.candidate.runId,
      )).toBeDefined()
      expect(mounted.adapter.requests).toHaveLength(6)
      expect(mounted.harness.ctx.agents.list()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not let candidate disposal overwrite an earlier execution failure', async () => {
    const firstTask = taskTypes[0]
    const mounted = await mountControlledRuntime('candidate-provider-and-dispose-failure', [
      toolCallResponse('provider-dispose-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('provider-dispose-b-verify', acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse('baseline complete'),
      new Error('candidate provider sentinel'),
    ])
    const originalCreate = mounted.harness.ctx.agents.create.bind(mounted.harness.ctx.agents)
    let createCalls = 0
    vi.spyOn(mounted.harness.ctx.agents, 'create').mockImplementation(async (...args) => {
      createCalls += 1
      const handle = await originalCreate(...args)
      if (createCalls !== 2) return handle
      return {
        agent: handle.agent,
        async dispose() {
          await handle.dispose()
          throw new Error('candidate dispose sentinel')
        },
      }
    })
    try {
      await expect(mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )).resolves.toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'provider-failed',
        },
      })
      expect(mounted.harness.ctx.agents.list()).toEqual([])
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records and returns an early terminal Candidate hard-gate result', async () => {
    const firstTask = taskTypes[0]
    const script = (['baseline', 'candidate'] as const).flatMap(role => [
      toolCallResponse(`${role}-skill`, 'skill', { name: parentSkill.name }),
      toolCallResponse(`${role}-verify`, acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse(`${role} complete`),
    ])
    const mounted = await mountControlledRuntime(
      'candidate-hard-gate',
      script,
      { rejectCandidateTaskType: firstTask },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: [mounted.input.tasks[0]!.taskId],
        result: {
          mechanismVerdict: 'rejected',
          reasonCode: 'candidate-objective-hard-gate-failed',
          objectiveSetDigest: null,
          blindMapDigest: null,
          evaluatorSetDigest: null,
        },
      })
      expect(mounted.adapter.requests).toHaveLength(6)
      expect(mounted.harness.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        receipt.evaluationId,
      )).toEqual(receipt.state === 'terminal' ? receipt.result : undefined)
      const repeated = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(repeated).toEqual(receipt)
      expect(mounted.adapter.requests).toHaveLength(6)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('records a complete inconclusive pair before stopping', async () => {
    const firstTask = taskTypes[0]
    const script = (['baseline', 'candidate'] as const).flatMap(role => [
      toolCallResponse(`inconclusive-${role}-skill`, 'skill', { name: parentSkill.name }),
      toolCallResponse(`inconclusive-${role}-verify`, acceptance.toolName, {
        subject: { task: firstTask, accepted: true },
      }),
      textResponse(`${role} material remains available`),
    ])
    const mounted = await mountControlledRuntime(
      'objective-inconclusive',
      script,
      { inconclusiveCandidateTaskType: firstTask },
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'terminal',
        completedTaskIds: [mounted.input.tasks[0]!.taskId],
        result: {
          mechanismVerdict: 'inconclusive',
          reasonCode: 'objective-inconclusive',
        },
      })
      const objective = mounted.harness.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(receipt.evaluationId)[0]!
      expect(objective).toMatchObject({
        objectiveVerdict: 'inconclusive',
        baseline: { outcome: 'not-met' },
        candidate: { outcome: 'inconclusive' },
      })
      expect(mounted.adapter.requests).toHaveLength(6)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('continues from frozen Skill definitions after the ambient root registration ends', async () => {
    const mounted = await mountControlledRuntime(
      'frozen-skill-after-root-dispose',
      successfulArmScript(),
    )
    let baselineRequests = 0
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (String(request.sessionId) === mounted.input.tasks[0]!.baselineSessionId) {
        baselineRequests += 1
        if (baselineRequests === 3) mounted.disposeParent()
      }
      return next()
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'awaiting-evaluator',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
      })
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(10)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not start C after its unused workspace drifts during B', async () => {
    const taskType = taskTypes[0]
    const mounted = await mountControlledRuntime('workspace-drift-before-c', [
      toolCallResponse('workspace-b-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('workspace-b-verify', acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      textResponse('baseline complete'),
    ])
    let baselineRequests = 0
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (String(request.sessionId) === mounted.input.tasks[0]!.baselineSessionId) {
        baselineRequests += 1
        if (baselineRequests === 3) {
          writeFileSync(
            join(mounted.input.tasks[0]!.candidateWorkspaceRoot, 'brief.txt'),
            'contaminated before C\n',
            'utf8',
          )
        }
      }
      return next()
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'candidate',
          role: 'candidate',
          reasonCode: 'workspace-drift',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('does not replace frozen Skill authority with a final ambient root lookup', async () => {
    const mounted = await mountControlledRuntime('root-drift-postflight', successfulArmScript())
    const last = mounted.input.tasks.at(-1)!.candidateSessionId
    let lastRequests = 0
    mounted.harness.ctx.on('llm/stream', (request, next) => {
      if (String(request.sessionId) === last) {
        lastRequests += 1
        if (lastRequests === 3) mounted.disposeParent()
      }
      return next()
    })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'awaiting-evaluator',
        completedTaskIds: mounted.input.tasks.map(task => task.taskId),
      })
      expect(mounted.adapter.requests).toHaveLength(30)
      expect(await mounted.harness.ctx.sessionPersistence.list()).toHaveLength(10)
    } finally {
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when acceptance Evidence is bound to another subject', async () => {
    const taskType = taskTypes[0]
    const mounted = await mountControlledRuntime('acceptance-subject', [
      toolCallResponse('subject-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('subject-verify', acceptance.toolName, {
        subject: { task: taskType, accepted: false },
      }),
      textResponse('completed with the wrong subject'),
    ])
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          role: 'baseline',
          reasonCode: 'acceptance-subject-mismatch',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when an observed Agent request leaves the ordinary contract', async () => {
    const taskType = taskTypes[0]
    const mounted = await mountControlledRuntime('request-contract', [
      toolCallResponse('request-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('request-verify', acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      textResponse('request complete'),
    ], { tamperFirstRequestPurpose: true })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          role: 'baseline',
          reasonCode: 'request-contract-mismatch',
        },
      })
      expect(mounted.requestWasTampered()).toBe(true)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('stops when final evaluator material exceeds its frozen bound', async () => {
    const taskType = taskTypes[0]
    const mounted = await mountControlledRuntime('material-bound', [
      toolCallResponse('material-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('material-verify', acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      textResponse('too long'),
    ], { maxEvaluatorMaterialBytes: 1 })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          role: 'baseline',
          reasonCode: 'evaluator-material-invalid',
        },
      })
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('denies tool N+1 before its body and does not start C', async () => {
    const taskType = taskTypes[0]
    const mounted = await mountControlledRuntime('tool-limit', [
      toolCallResponse('limited-skill', 'skill', { name: parentSkill.name }),
      toolCallResponse('limited-verify', acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
      toolCallResponse('limited-extra', acceptance.toolName, {
        subject: { task: taskType, accepted: true },
      }),
    ], { maxToolCalls: 2 })
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          taskId: mounted.input.tasks[0]!.taskId,
          role: 'baseline',
          reasonCode: 'tool-limit-exceeded',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(3)
      expect(mounted.verifierBodies).toEqual([
        mounted.input.tasks[0]!.baselineSessionId,
      ])
      const persisted = (await mounted.harness.ctx.sessionPersistence.list())
        .map(item => String(item.id))
      expect(persisted).toContain(mounted.input.tasks[0]!.baselineSessionId)
      expect(persisted).not.toContain(mounted.input.tasks[0]!.candidateSessionId)
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })

  it('cancels a wall-clock timeout through the public Agent seam', async () => {
    const mounted = await mountControlledRuntime(
      'timeout',
      [textResponse('too late')],
      { maxElapsedMs: 20, firstRequestDelayMs: 80 },
    )
    const outcomeIntake = vi.spyOn(
      mounted.harness.ctx.tianwenLearningIntake,
      'consumeOutcome',
    )
    try {
      const receipt = await mounted.harness.ctx.tianwenSkillEvaluation.runControlledArms(
        mounted.input,
      )
      expect(receipt).toMatchObject({
        state: 'stopped',
        completedTaskIds: [],
        stop: {
          stage: 'baseline',
          taskId: mounted.input.tasks[0]!.taskId,
          role: 'baseline',
          reasonCode: 'timeout',
        },
      })
      expect(mounted.adapter.requests).toHaveLength(1)
      expect(mounted.verifierBodies).toEqual([])
      expect(outcomeIntake).not.toHaveBeenCalled()
    } finally {
      mounted.disposeParent()
      await mounted.harness.ctx.fiber.dispose()
    }
  })
})
