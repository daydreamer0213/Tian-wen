import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import {
  DynamicCordisRunnerService,
  ScriptedAdapter,
  SessionId,
  SkillRegistry,
  applySkillTool,
  createUserMessage,
  defineTool,
  mountPersistentHarness,
  textResponse,
  toolCallResponse,
} from '@tianwen/dsh-compat'
import type { StreamChunk } from '@tianwen/dsh-compat'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  PUBLIC_LEDGER_EVENT_TYPES,
  sha256,
} from '../packages/tianwen-evolution/src/index.js'
import {
  ControlledSkillActivationPreflightError,
  apply,
} from '../packages/tianwen-runtime/src/index.js'

const CONTROLLED_PROVIDER = 'tianwen-controlled-scripted'
const CONTROLLED_MODEL = 'scripted'

const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_lifecycle',
  notMetErrorCode: 'LIFECYCLE_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 4,
  blocksGoal: true,
} as const

const parentSkill = {
  name: 'controlled-lifecycle-summary',
  description: 'Summarize one controlled observation.',
  whenToUse: 'When a controlled task requests a concise verified summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Controlled summary\n\nState the observation.',
} as const

const evaluationTaskDefinitions = [
  { semanticType: 'original-defect', taskType: 'original-problem' },
  { semanticType: 'adjacent-transfer', taskType: 'adjacent-transfer' },
  { semanticType: 'preserved-regression', taskType: 'regression' },
  { semanticType: 'raw-extraction-counterexample', taskType: 'counterexample' },
  { semanticType: 'safety-boundary', taskType: 'safety-authorization' },
] as const

type TransitionKind = 'promote' | 'rollback' | 'restore'

export interface ControlledSkillLifecycleDemoReceipt {
  readonly schemaVersion: 'tianwen.controlled-skill-lifecycle-demo.v1'
  readonly evidence: {
    readonly source: 'scripted-fixture'
    readonly environment: 'development-only'
    readonly defect: 'synthetic-defect'
    readonly naturalUserEvidence: 'not-claimed'
    readonly externalUserEvidence: 'not-claimed'
  }
  readonly mechanism: {
    readonly candidate: 'recorded'
    readonly evaluation: 'pass'
    readonly shadow: 'pass'
    readonly transitions: {
      readonly promote: 'verified'
      readonly rollback: 'verified'
      readonly restore: 'verified'
    }
    readonly finalPointerRevision: 4
    readonly phaseOrderVerified: true
    readonly blindIdentityVerified: true
  }
  readonly counts: {
    readonly formalSessions: 25
    readonly seedRuns: 2
    readonly evaluationArms: 10
    readonly evaluators: 5
    readonly shadowRuns: 5
    readonly transitions: 3
    readonly scriptedModelRequests: 65
    readonly toolBodies: 45
    readonly externalProviderRequests: 0
  }
  readonly isolation: {
    readonly ordinaryRootSkillUnchanged: true
    readonly legacyChampionUnchanged: true
    readonly otherControlledScopesUnchanged: true
    readonly realProductDataUntouched: true
    readonly publicEventsRedacted: true
    readonly terminalReplayNoSecondActivity: true
    readonly preflightZeroEffect: true
    readonly preflightReasonCode: 'task-package-mismatch'
    readonly fixtureCleanupComplete: true
  }
  readonly lineage: {
    readonly protocolIdDigest: `sha256:${string}`
    readonly evaluationIdDigest: `sha256:${string}`
    readonly evaluationResultDigest: `sha256:${string}`
    readonly shadowIdDigest: `sha256:${string}`
    readonly shadowResultDigest: `sha256:${string}`
    readonly transitionSetDigest: `sha256:${string}`
    readonly finalPointerDigest: `sha256:${string}`
  }
}

class LifecycleRequirementNotMet extends HarnessError {
  constructor() {
    super('controlled lifecycle requirement was not met', acceptance.notMetErrorCode)
  }
}

class ControlledLifecycleScriptedAdapter extends ScriptedAdapter {
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

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`controlled lifecycle invariant failed: ${code}`)
}

function rawDigest(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function writeWorkspace(root: string, content: string) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'brief.txt'), content, 'utf8')
  return {
    schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
    entries: [{
      relativePath: 'brief.txt',
      contentDigest: rawDigest(content),
      size: Buffer.byteLength(content, 'utf8'),
    }],
  }
}

function skillAndVerifierScript(
  id: string,
  subject: Readonly<Record<string, unknown>>,
  finalText: string,
) {
  return [
    toolCallResponse(`${id}-skill`, 'skill', { name: parentSkill.name }),
    toolCallResponse(`${id}-verify`, acceptance.toolName, { subject }),
    textResponse(finalText),
  ]
}

function lifecycleScript() {
  const seed = [
    ...skillAndVerifierScript(
      'seed-defect',
      { phase: 'seed', kind: 'defect' },
      'completed controlled seed option one',
    ),
    ...skillAndVerifierScript(
      'seed-counterevidence',
      { phase: 'seed', kind: 'counterevidence' },
      'completed controlled seed option two',
    ),
  ]
  const arms = evaluationTaskDefinitions.flatMap(task =>
    (['baseline', 'candidate'] as const).flatMap((role, index) =>
      skillAndVerifierScript(
        `evaluation-${task.semanticType}-${role}`,
        { phase: 'evaluation', task: task.semanticType },
        `completed controlled option ${index + 1}`,
      )))
  const evaluators = evaluationTaskDefinitions.map(task => toolCallResponse(
    `evaluator-${task.semanticType}`,
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
  const shadow = evaluationTaskDefinitions.flatMap(task => skillAndVerifierScript(
    `shadow-${task.semanticType}`,
    { phase: 'shadow', task: task.semanticType },
    `completed isolated option ${task.semanticType}`,
  ))
  const transitions = (['promote', 'rollback', 'restore'] as const)
    .flatMap(kind => skillAndVerifierScript(
      `transition-${kind}`,
      { phase: 'transition', kind },
      `completed controlled transition ${kind}`,
    ))
  return [...seed, ...arms, ...evaluators, ...shadow, ...transitions]
}

function fixtureParent(): string {
  if (process.env.TIANWEN_DSH_PROBE_ROOT !== undefined) {
    return resolve(process.env.TIANWEN_DSH_PROBE_ROOT)
  }
  return process.platform === 'win32'
    ? resolve('D:\\DevData', 'tianwen-controlled-skill-lifecycle-fixtures')
    : resolve(tmpdir(), 'tianwen-controlled-skill-lifecycle-fixtures')
}

type Harness = Awaited<ReturnType<typeof mountPersistentHarness>>
type EvolutionService = Harness['ctx']['tianwenEvolution']

function governedStateDigest(evolution: EvolutionService, evaluationId: string) {
  return sha256({
    protocols: evolution.listControlledSkillEvalProtocols(),
    evaluations: evolution.listControlledSkillEvaluations(),
    objectives: evolution.listControlledSkillEvaluationObjectives(
      evaluationId as `evaluation:${string}`,
    ),
    observations: evolution.listControlledSkillEvaluatorObservations(
      evaluationId as `evaluation:${string}`,
    ),
    evaluationResult: evolution.getControlledSkillEvaluationResult(
      evaluationId as `evaluation:${string}`,
    ),
    shadows: evolution.listControlledSkillShadows(),
    shadowResults: evolution.listControlledSkillShadowResults(),
    pointers: evolution.listControlledSkillScopePointers(),
    transitions: evolution.listControlledSkillTransitions(),
    manifests: evolution.listRunSkillManifests(),
    uses: evolution.listRunSkillUses(),
    signals: evolution.listLearningSignals(),
    tickets: evolution.listLearningTickets(),
    cases: evolution.listLearningCases(),
    attributions: evolution.listAttributions(),
    lessons: evolution.listAcceptedLessons(),
    candidates: evolution.listSkillCandidates(),
    publicEvents: evolution.listEvents(),
  })
}

async function persistedToolCalls(harness: Harness): Promise<number> {
  let count = 0
  for (const header of await harness.ctx.sessionPersistence.list()) {
    const inspection = await harness.ctx.sessionPersistence.inspect(header.id)
    count += inspection.events.filter(event => event.type === 'tool/call').length
  }
  return count
}

function publicEventsAreRedacted(evolution: EvolutionService): boolean {
  const serialized = JSON.stringify(evolution.listEvents())
  return evolution.listEvents().every(event => PUBLIC_LEDGER_EVENT_TYPES.includes(event.type))
    && !serialized.includes('controlled-skill-')
    && !serialized.includes(parentSkill.content)
}

export async function runControlledSkillLifecycleDemo(): Promise<ControlledSkillLifecycleDemoReceipt> {
  const parent = fixtureParent()
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, '.tianwen-controlled-skill-lifecycle-'))
  const previousFixtureRoot = process.env.TIANWEN_DSH_PROBE_ROOT
  process.env.TIANWEN_DSH_PROBE_ROOT = root
  let harness: Harness | undefined
  let disposeParent: (() => void) | undefined
  let disposeVerifier: (() => void) | undefined
  const seedHandles = new Set<Awaited<ReturnType<Harness['ctx']['agents']['create']>>>()
  try {
    harness = await mountPersistentHarness(join(root, 'sessions'), [])
    await harness.ctx.plugin(SkillRegistry)
    await harness.ctx.plugin(applySkillTool)
    await harness.ctx.plugin(DynamicCordisRunnerService, {})

    let verifierBodies = 0
    disposeVerifier = harness.ctx.tools.register(defineTool({
      name: acceptance.toolName,
      description: 'Verify one controlled lifecycle observation.',
      parameters: {
        subject: { type: 'object', additionalProperties: true, required: true },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        verifierBodies += 1
        const subject = (args as { subject?: Record<string, unknown> }).subject
        const agentId = String(exec.agent?.id)
        if (subject?.phase === 'seed' && subject.kind === 'defect') {
          throw new LifecycleRequirementNotMet()
        }
        if (
          subject?.phase === 'evaluation'
          && agentId.endsWith(':baseline')
          && (subject.task === 'original-defect' || subject.task === 'adjacent-transfer')
        ) throw new LifecycleRequirementNotMet()
        return 'verified'
      },
    }))
    disposeParent = harness.ctx.skills.register(parentSkill)
    const adapter = new ControlledLifecycleScriptedAdapter(lifecycleScript())
    harness.ctx.llm.registerAdapter([CONTROLLED_PROVIDER], adapter)
    const selection = { provider: CONTROLLED_PROVIDER, model: CONTROLLED_MODEL }
    harness.ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ ...selection }),
    })
    await apply(harness.ctx, { evolutionRoot: join(root, 'evolution') })

    const evolution = harness.ctx.tianwenEvolution
    const championBefore = evolution.getChampion()
    const otherPointersBefore = evolution.listControlledSkillScopePointers()
    const publicEventsBefore = evolution.listEvents()
    const seedDefinitions = [
      { kind: 'defect', expectedDecision: 'ticket-created' },
      { kind: 'counterevidence', expectedDecision: 'no-case' },
    ] as const
    const seedRecords = []
    for (const [index, seed] of seedDefinitions.entries()) {
      const sessionId = `session:controlled-seed:fixture:${seed.kind}`
      const workspaceRoot = join(root, 'workspaces', 'seed', seed.kind)
      writeWorkspace(workspaceRoot, `controlled seed workspace ${index}\n`)
      const handle = await harness.ctx.agents.create({
        sessionId: SessionId(sessionId),
        meta: { cwd: workspaceRoot },
        agentOptions: selection,
      })
      seedHandles.add(handle)
      const acceptanceSubject = { subject: { phase: 'seed', kind: seed.kind } }
      const binding = await harness.ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        {
          goalRef: 'goal:controlled-skill-lifecycle-seed',
          taskRef: `task:controlled-skill-lifecycle-seed:${seed.kind}`,
          scopeKey: 'project:tianwen/capability:controlled-lifecycle-summary',
          acceptanceContract: acceptance,
          acceptanceSubjectDigest: sha256(acceptanceSubject),
        },
        parentSkill.name,
        harness.ctx.skills,
      )
      handle.agent.followup(createUserMessage({
        content: [{
          type: 'text',
          text: `Use the available Skill, then verify controlled seed ${index}.`,
        }],
        source: { kind: 'user' },
      }))
      await handle.agent.whenIdle()
      invariant(await harness.ctx.sessions.flush(handle.agent.session), 'seed-persistence')
      const outcome = harness.ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        binding.runId,
      )
      const use = harness.ctx.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        binding.runId,
      )
      invariant(use.decision === 'recorded', 'seed-skill-use')
      invariant(outcome.decision === seed.expectedDecision, 'seed-outcome')
      seedRecords.push({ binding, outcome })
      await handle.dispose()
      seedHandles.delete(handle)
    }

    const ticketId = seedRecords[0]?.outcome.ticketId
    invariant(ticketId !== undefined, 'seed-ticket')
    const counterevidenceRunId = seedRecords[1]?.binding.runId
    invariant(counterevidenceRunId !== undefined, 'seed-counterevidence')

    const allowedTools = ['skill', acceptance.toolName] as const
    const toolSchemas = harness.ctx.tools.schemas()
      .filter(schema => allowedTools.includes(schema.name as typeof allowedTools[number]))
      .toSorted((left, right) => left.name.localeCompare(right.name))
    const taskToolSchemaDigest = sha256(toolSchemas)
    const callConfig = await harness.ctx.llm.resolveCallConfig(selection)
    const retryPolicy = harness.ctx.llm.providerRetryPolicy(selection.provider)
    const evaluationTasks = evaluationTaskDefinitions.map((definition, index) => {
      const content = `controlled evaluation workspace ${index}\n`
      const baselineWorkspaceRoot = join(
        root,
        'workspaces',
        'evaluation',
        definition.semanticType,
        'baseline',
      )
      const candidateWorkspaceRoot = join(
        root,
        'workspaces',
        'evaluation',
        definition.semanticType,
        'candidate',
      )
      const workspaceSnapshot = writeWorkspace(baselineWorkspaceRoot, content)
      writeWorkspace(candidateWorkspaceRoot, content)
      const goal = `Complete controlled lifecycle task ${index}.`
      const input = `Use the available Skill, then verify lifecycle task ${index}.`
      const authorization = { mode: 'fixture-only', task: definition.semanticType }
      const verifierArguments = {
        subject: { phase: 'evaluation', task: definition.semanticType },
      }
      const verifierContract = { toolName: acceptance.toolName, arguments: verifierArguments }
      const stopCondition = { terminal: 'completed-final-assistant-text' }
      const evaluatorMaterialContract = {
        schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1' as const,
        source: 'final-completed-assistant-text' as const,
        maxUtf8Bytes: 4_096,
      }
      return {
        ...definition,
        taskId: `eval-task:lifecycle-${definition.semanticType}` as const,
        goal,
        input,
        baselineWorkspaceRoot,
        candidateWorkspaceRoot,
        workspaceSnapshot,
        authorization,
        verifierArguments,
        verifierContract,
        stopCondition,
        evaluatorMaterialContract,
        baselineSessionId: `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:baseline`,
        candidateSessionId: `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:candidate`,
        evaluatorSessionId: `session:controlled-eval:fixture:lifecycle:${definition.semanticType}:evaluator`,
      }
    })
    const protocolInput = {
      ticketId,
      evidencePurpose: 'development-only-synthetic-defect' as const,
      protocol: {
        rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
        tasks: evaluationTasks.map(task => ({
          taskId: task.taskId,
          taskType: task.taskType,
          goalDigest: sha256(task.goal),
          inputDigest: sha256(task.input),
          workspaceSnapshotDigest: sha256(task.workspaceSnapshot),
          toolSchemaDigest: taskToolSchemaDigest,
          authorizationDigest: sha256(task.authorization),
          verifierContractDigest: sha256(task.verifierContract),
          stopConditionDigest: sha256(task.stopCondition),
          evaluatorMaterialContractDigest: sha256(task.evaluatorMaterialContract),
          acceptanceContract: acceptance,
          acceptanceSubjectDigest: sha256(task.verifierArguments),
          allowedTools,
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        })),
        execution: {
          dshVersion: '0.1.0-rc.7' as const,
          providerId: callConfig.provider,
          modelId: callConfig.model,
          callConfigDigest: sha256(callConfig),
          toolSchemaDigest: sha256(evaluationTasks.map(task => ({
            taskId: task.taskId,
            toolSchemaDigest: taskToolSchemaDigest,
          }))),
          retryPolicyDigest: sha256(retryPolicy),
        },
      },
    }
    const protocol = evolution.freezeControlledSkillEvalProtocol(protocolInput)
    const protocolRecord = evolution.getControlledSkillEvalProtocol(protocol.protocolId)
    invariant(protocolRecord?.provenance === 'pre-candidate', 'pre-candidate-protocol')

    const openedCase = evolution.openLearningCase({
      ticketId,
      counterevidenceRunIds: [counterevidenceRunId],
    })
    const learningCase = evolution.getLearningCase(openedCase.caseId)
    invariant(learningCase !== undefined, 'learning-case')
    const supportingEvidenceIds = learningCase.supportingEvidenceIds
    const counterevidenceIds = learningCase.counterevidence.flatMap(item => item.evidenceIds)
    const attribution = evolution.recordAttribution({
      caseId: learningCase.caseId,
      resolution: 'dsh-skill',
      targetSkillName: parentSkill.name,
      hypothesis: 'The parent omits verified result-first ordering.',
      supportingEvidenceIds,
      counterevidenceIds,
      alternatives: 'Runtime and verifier causes remain unsupported in this fixture.',
    })
    const lesson = evolution.recordAcceptedLesson({
      caseId: learningCase.caseId,
      attributionId: attribution.attributionId,
      claim: 'State the verified result before interpretation.',
      when: 'When summarizing a verified controlled observation.',
      notWhen: 'When the task requests raw extraction only.',
      supportingEvidenceIds,
      counterevidenceIds,
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
      evidenceIds: [...supportingEvidenceIds, ...counterevidenceIds],
    })
    const candidateRecord = evolution.getSkillCandidate(candidate.candidateId)
    invariant(candidateRecord?.status === 'recorded', 'candidate')

    const armsInput = {
      candidateId: candidate.candidateId,
      protocolId: protocol.protocolId,
      tasks: evaluationTasks.map(task => ({
        taskId: task.taskId,
        goal: task.goal,
        input: task.input,
        baselineWorkspaceRoot: task.baselineWorkspaceRoot,
        candidateWorkspaceRoot: task.candidateWorkspaceRoot,
        workspaceSnapshot: task.workspaceSnapshot,
        authorization: task.authorization,
        verifierContract: task.verifierContract,
        stopCondition: task.stopCondition,
        evaluatorMaterialContract: task.evaluatorMaterialContract,
        baselineSessionId: task.baselineSessionId,
        candidateSessionId: task.candidateSessionId,
        evaluatorSessionId: task.evaluatorSessionId,
      })),
    }
    const arms = await harness.ctx.tianwenSkillEvaluation.runControlledArms(armsInput)
    invariant(
      arms.state === 'awaiting-evaluator',
      `evaluation-arms-${arms.state}-${arms.state === 'stopped' ? `${arms.stop.stage}-${arms.stop.role}-${arms.stop.reasonCode}` : 'closed'}-${adapter.requests.length}`,
    )
    const objectives = evolution.listControlledSkillEvaluationObjectives(arms.evaluationId)
    invariant(objectives.length === 5, 'objectives')
    invariant(objectives.every(item => item.objectiveVerdict === 'pass'), 'objective-pass')

    const evaluatorsInput = {
      evaluationId: arms.evaluationId,
      tasks: evaluationTasks.map(task => ({
        taskId: task.taskId,
        goal: task.goal,
        input: task.input,
        evaluatorMaterialContract: task.evaluatorMaterialContract,
      })),
    }
    const evaluators = await harness.ctx.tianwenSkillEvaluation
      .runControlledEvaluators(evaluatorsInput)
    invariant(evaluators.state === 'terminal', 'evaluators-terminal')
    invariant(evaluators.result.mechanismVerdict === 'pass', 'evaluation-pass')
    invariant(
      evaluators.result.baselineTotal === 60 && evaluators.result.candidateTotal === 60,
      'evaluation-totals',
    )
    const blindMap = evolution.getControlledSkillEvaluationBlindMap(arms.evaluationId)
    invariant(blindMap?.assignments.length === 5, 'blind-map')
    invariant(blindMap.assignments.every(assignment =>
      assignment.xRole !== assignment.yRole), 'blind-map-roles')
    invariant(
      evolution.listControlledSkillEvaluatorObservations(arms.evaluationId).length === 5,
      'evaluator-observations',
    )

    const shadowTasks = evaluationTaskDefinitions.map((definition, index) => {
      const workspaceRoot = join(root, 'workspaces', 'shadow', definition.semanticType)
      const workspaceSnapshot = writeWorkspace(
        workspaceRoot,
        `controlled isolated Shadow workspace ${index}\n`,
      )
      return {
        taskId: `shadow-task:lifecycle-${definition.semanticType}` as const,
        goal: `Complete isolated lifecycle Shadow task ${index}.`,
        input: `Use the available Skill, then verify isolated lifecycle task ${index}.`,
        workspaceRoot,
        workspaceSnapshot,
        authorization: { mode: 'fixture-only', task: definition.semanticType },
        verifierContract: { toolName: acceptance.toolName, phase: 'shadow' },
        stopCondition: { terminal: 'completed-final-assistant-text' },
        acceptanceContract: acceptance,
        acceptanceSubject: {
          subject: { phase: 'shadow', task: definition.semanticType },
        },
        allowedTools,
        stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
        sessionId: `session:controlled-shadow:fixture:lifecycle:${definition.semanticType}`,
      }
    })
    const shadowInput = { evaluationId: arms.evaluationId, tasks: shadowTasks }
    const shadow = await harness.ctx.tianwenSkillEvaluation.runControlledShadow(shadowInput)
    invariant(shadow.state === 'terminal', 'shadow-terminal')
    invariant(shadow.result.mechanismVerdict === 'pass', 'shadow-pass')
    invariant(
      shadow.result.promotionEligibility === 'eligible-for-isolated-test-promotion',
      'shadow-eligibility',
    )
    invariant(shadow.result.runs.length === 5, 'shadow-runs')
    const shadowPlan = evolution.getControlledSkillShadow(shadow.shadowId)
    invariant(shadowPlan?.mode === 'isolated-test', 'shadow-mode')
    const initialized = evolution.initializeControlledSkillScopePointer({
      shadowId: shadow.shadowId,
    })
    invariant(initialized.revision === 1, 'pointer-revision-one')
    const initialPointer = evolution.getControlledSkillScopePointer(shadowPlan.scopeKey)
    invariant(
      initialPointer?.activeVersionId === shadowPlan.parentVersionId,
      'initial-pointer-parent',
    )

    const transitionInput = (kind: TransitionKind, expectedRevision: number) => {
      const workspaceRoot = join(root, 'workspaces', 'transition', kind)
      const workspaceSnapshot = writeWorkspace(
        workspaceRoot,
        `controlled transition ${kind} workspace\n`,
      )
      return {
        shadowId: shadow.shadowId,
        kind,
        expectedRevision,
        task: {
          goal: `Verify the active lifecycle ${kind} pointer.`,
          input: `Use the available Skill, then verify lifecycle ${kind}.`,
          workspaceRoot,
          workspaceSnapshot,
          authorization: { mode: 'fixture-only', kind },
          verifierContract: { toolName: acceptance.toolName, kind },
          stopCondition: { terminal: 'completed-final-assistant-text' },
          acceptanceContract: acceptance,
          acceptanceSubject: { subject: { phase: 'transition', kind } },
          allowedTools,
          stopContract: { maxToolCalls: 4, maxElapsedMs: 10_000 },
          sessionId: `session:controlled-activation:fixture:lifecycle:${kind}`,
        },
      }
    }
    const promoteInput = transitionInput('promote', 1)
    const rollbackInput = transitionInput('rollback', 2)
    const restoreInput = transitionInput('restore', 3)
    const promote = await harness.ctx.tianwenSkillEvaluation
      .runControlledSkillTransition(promoteInput)
    const rollback = await harness.ctx.tianwenSkillEvaluation
      .runControlledSkillTransition(rollbackInput)
    const restore = await harness.ctx.tianwenSkillEvaluation
      .runControlledSkillTransition(restoreInput)
    const transitions = [promote, rollback, restore]
    invariant(transitions.every(item => item.state === 'terminal'), 'transition-terminal')
    invariant(transitions.every(item => item.transition.state === 'verified'), 'transition-verified')
    invariant(
      transitions.map(item => item.transition.pointer.revision).join(',') === '2,3,4',
      'pointer-sequence',
    )
    invariant(
      transitions.map(item => item.transition.pointer.activeVersionId).join(',')
        === [
          shadowPlan.candidateVersionId,
          shadowPlan.parentVersionId,
          shadowPlan.candidateVersionId,
        ].join(','),
      'pointer-candidate-parent-candidate',
    )
    const pointer = evolution.getControlledSkillScopePointer(shadowPlan.scopeKey)
    invariant(pointer?.revision === 4, 'final-pointer-revision')
    invariant(pointer.activeVersionId === shadowPlan.candidateVersionId, 'final-pointer-candidate')

    const expectedRequestSessions = [
      ...seedDefinitions.flatMap(seed => Array(3).fill(
        `session:controlled-seed:fixture:${seed.kind}`,
      )),
      ...evaluationTasks.flatMap(task => [
        ...Array(3).fill(task.baselineSessionId),
        ...Array(3).fill(task.candidateSessionId),
      ]),
      ...evaluationTasks.map(task => task.evaluatorSessionId),
      ...shadowTasks.flatMap(task => Array(3).fill(task.sessionId)),
      ...[promoteInput, rollbackInput, restoreInput]
        .flatMap(input => Array(3).fill(input.task.sessionId)),
    ]
    invariant(adapter.requests.length === 65, 'scripted-request-count')
    invariant(
      JSON.stringify(adapter.requests.map(request => String(request.sessionId)))
        === JSON.stringify(expectedRequestSessions),
      'phase-order',
    )

    const evaluatorRequests = adapter.requests.filter(request =>
      evaluationTasks.some(task => task.evaluatorSessionId === String(request.sessionId)))
    invariant(evaluatorRequests.length === 5, 'evaluator-request-count')
    const evaluatorMessages = JSON.stringify(evaluatorRequests.map(request => request.messages))
    invariant(evaluatorRequests.every(request =>
      request.tools?.map(tool => tool.name).join(',') === 'submit_blind_evaluation'),
    'evaluator-tool-surface')
    invariant(!evaluatorMessages.includes(parentSkill.name), 'blind-skill-name')
    invariant(!evaluatorMessages.includes(parentSkill.content), 'blind-skill-content')
    invariant(!evaluatorMessages.includes(candidate.candidateId), 'blind-candidate')
    invariant(!evaluatorMessages.includes('candidatePassRules'), 'blind-pass-rules')
    invariant(!evaluatorMessages.includes('baseline'), 'blind-baseline-role')
    invariant(!evaluatorMessages.includes('candidate'), 'blind-candidate-role')
    for (const request of evaluatorRequests) {
      const message = request.messages.findLast(item => item.role === 'user')
      const block = message?.content.find(item => item.type === 'text')
      invariant(block?.type === 'text', 'blind-envelope-text')
      const envelope = JSON.parse(block.text) as Record<string, unknown>
      invariant(
        Object.keys(envelope).sort().join(',') === 'goal,input,rubric,rubricDigest,taskId,x,y',
        'blind-envelope-keys',
      )
    }

    const sessionHeaders = await harness.ctx.sessionPersistence.list()
    const toolBodies = await persistedToolCalls(harness)
    invariant(sessionHeaders.length === 25, 'formal-session-count')
    invariant(toolBodies === 45, 'tool-body-count')
    invariant(verifierBodies === 20, 'verifier-body-count')
    invariant(harness.adapter.requests.length === 0, 'external-provider-count')
    invariant(harness.ctx.sessions.list().length === 0, 'live-session-leak')
    for (const task of evaluationTasks) {
      const inspection = await harness.ctx.sessionPersistence.inspect(
        SessionId(task.evaluatorSessionId),
      )
      invariant(
        inspection.meta.cwd === dirname(task.baselineWorkspaceRoot),
        'evaluator-workspace',
      )
    }

    const replaySnapshot = {
      requests: adapter.requests.length,
      verifierBodies,
      toolBodies,
      sessions: sessionHeaders.map(header => String(header.id)).sort(),
      state: governedStateDigest(evolution, arms.evaluationId),
    }
    const armsReplay = await harness.ctx.tianwenSkillEvaluation.runControlledArms(armsInput)
    const armsTerminalReplay = await harness.ctx.tianwenSkillEvaluation
      .runControlledArms(armsInput)
    const evaluatorsReplay = await harness.ctx.tianwenSkillEvaluation
      .runControlledEvaluators(evaluatorsInput)
    const shadowReplay = await harness.ctx.tianwenSkillEvaluation.runControlledShadow(shadowInput)
    const restoreReplay = await harness.ctx.tianwenSkillEvaluation
      .runControlledSkillTransition(restoreInput)
    invariant(JSON.stringify(armsReplay) === JSON.stringify({
      ...arms,
      state: 'terminal',
      result: evaluators.result,
    }), 'arms-replay')
    invariant(
      JSON.stringify(armsTerminalReplay) === JSON.stringify(armsReplay),
      'arms-terminal-replay',
    )
    invariant(JSON.stringify(evaluatorsReplay) === JSON.stringify(evaluators), 'evaluators-replay')
    invariant(JSON.stringify(shadowReplay) === JSON.stringify(shadow), 'shadow-replay')
    invariant(JSON.stringify(restoreReplay) === JSON.stringify(restore), 'transition-replay')
    invariant(adapter.requests.length === replaySnapshot.requests, 'replay-request')
    invariant(verifierBodies === replaySnapshot.verifierBodies, 'replay-tool-body')
    invariant(await persistedToolCalls(harness) === replaySnapshot.toolBodies, 'replay-tool-events')
    invariant(
      JSON.stringify((await harness.ctx.sessionPersistence.list())
        .map(header => String(header.id)).sort()) === JSON.stringify(replaySnapshot.sessions),
      'replay-sessions',
    )
    invariant(
      governedStateDigest(evolution, arms.evaluationId) === replaySnapshot.state,
      'replay-ledger',
    )

    const preflightBase = transitionInput('promote', 3)
    const preflightWorkspaceRoot = join(root, 'workspaces', 'preflight-rejection')
    const preflightInput = {
      ...preflightBase,
      task: {
        ...preflightBase.task,
        workspaceRoot: preflightWorkspaceRoot,
        workspaceSnapshot: writeWorkspace(
          preflightWorkspaceRoot,
          'controlled preflight rejection workspace\n',
        ),
        sessionId: 'session:controlled-activation:fixture:lifecycle:preflight-rejection',
      },
    }
    const preflightSnapshot = {
      requests: adapter.requests.length,
      verifierBodies,
      sessions: (await harness.ctx.sessionPersistence.list()).length,
      liveSessions: harness.ctx.sessions.list().length,
      state: governedStateDigest(evolution, arms.evaluationId),
    }
    let preflightReasonCode: string | undefined
    try {
      await harness.ctx.tianwenSkillEvaluation.runControlledSkillTransition(preflightInput)
    } catch (error) {
      if (error instanceof ControlledSkillActivationPreflightError) {
        preflightReasonCode = error.code
      }
    }
    invariant(
      preflightReasonCode === 'task-package-mismatch',
      `preflight-reason-${preflightReasonCode ?? 'none'}`,
    )
    invariant(adapter.requests.length === preflightSnapshot.requests, 'preflight-request')
    invariant(verifierBodies === preflightSnapshot.verifierBodies, 'preflight-tool-body')
    invariant(
      (await harness.ctx.sessionPersistence.list()).length === preflightSnapshot.sessions,
      'preflight-session',
    )
    invariant(harness.ctx.sessions.list().length === preflightSnapshot.liveSessions, 'preflight-agent')
    invariant(
      governedStateDigest(evolution, arms.evaluationId) === preflightSnapshot.state,
      'preflight-ledger',
    )

    const rootSkill = await harness.ctx.skills.get(parentSkill.name)
    invariant(rootSkill?.content === parentSkill.content, 'ordinary-root-skill')
    invariant(
      JSON.stringify(evolution.getChampion()) === JSON.stringify(championBefore),
      'legacy-champion',
    )
    invariant(
      JSON.stringify(evolution.listControlledSkillScopePointers()
        .filter(item => item.scopeKey !== shadowPlan.scopeKey))
        === JSON.stringify(otherPointersBefore),
      'other-controlled-scopes',
    )
    invariant(publicEventsAreRedacted(evolution), 'public-events-redacted')
    invariant(
      JSON.stringify(evolution.listEvents()) === JSON.stringify(publicEventsBefore),
      'public-events-unchanged',
    )

    const result = evaluators.result
    const shadowResult = shadow.result
    const transitionRecords = evolution.listControlledSkillTransitions()
    invariant(transitionRecords.length === 3, 'transition-record-count')
    invariant(evolution.listLearningSignals().length === 3, 'ledger-signal-count')
    invariant(evolution.listLearningTickets().length === 1, 'ledger-ticket-count')
    invariant(evolution.listLearningCases().length === 1, 'ledger-case-count')
    invariant(evolution.listAttributions().length === 1, 'ledger-attribution-count')
    invariant(evolution.listAcceptedLessons().length === 1, 'ledger-lesson-count')
    invariant(evolution.listSkillCandidates().length === 1, 'ledger-candidate-count')
    invariant(evolution.listControlledSkillEvalProtocols().length === 1, 'ledger-protocol-count')
    invariant(evolution.listControlledSkillEvaluations().length === 1, 'ledger-evaluation-count')
    invariant(evolution.listControlledSkillShadows().length === 1, 'ledger-shadow-count')
    invariant(evolution.listControlledSkillShadowResults().length === 1, 'ledger-shadow-result-count')
    invariant(evolution.listControlledSkillScopePointers().length === 1, 'ledger-pointer-count')
    invariant(evolution.listRunSkillManifests().length === 20, 'ledger-manifest-count')
    invariant(evolution.listRunSkillUses().length === 20, 'ledger-use-count')
    return {
      schemaVersion: 'tianwen.controlled-skill-lifecycle-demo.v1',
      evidence: {
        source: 'scripted-fixture',
        environment: 'development-only',
        defect: 'synthetic-defect',
        naturalUserEvidence: 'not-claimed',
        externalUserEvidence: 'not-claimed',
      },
      mechanism: {
        candidate: 'recorded',
        evaluation: 'pass',
        shadow: 'pass',
        transitions: {
          promote: 'verified',
          rollback: 'verified',
          restore: 'verified',
        },
        finalPointerRevision: 4,
        phaseOrderVerified: true,
        blindIdentityVerified: true,
      },
      counts: {
        formalSessions: 25,
        seedRuns: 2,
        evaluationArms: 10,
        evaluators: 5,
        shadowRuns: 5,
        transitions: 3,
        scriptedModelRequests: 65,
        toolBodies: 45,
        externalProviderRequests: 0,
      },
      isolation: {
        ordinaryRootSkillUnchanged: true,
        legacyChampionUnchanged: true,
        otherControlledScopesUnchanged: true,
        realProductDataUntouched: true,
        publicEventsRedacted: true,
        terminalReplayNoSecondActivity: true,
        preflightZeroEffect: true,
        preflightReasonCode: 'task-package-mismatch',
        fixtureCleanupComplete: true,
      },
      lineage: {
        protocolIdDigest: sha256(protocol.protocolId),
        evaluationIdDigest: sha256(arms.evaluationId),
        evaluationResultDigest: sha256(result),
        shadowIdDigest: sha256(shadow.shadowId),
        shadowResultDigest: sha256(shadowResult),
        transitionSetDigest: sha256(transitionRecords.map(item => item.transitionId)),
        finalPointerDigest: sha256(pointer),
      },
    }
  } catch (error) {
    if (error instanceof Error
      && error.message.startsWith('controlled lifecycle invariant failed:')) {
      throw error
    }
    throw new Error('controlled Skill lifecycle demo failed')
  } finally {
    let cleanupFailed = false
    for (const handle of seedHandles) {
      try {
        await handle.dispose()
      } catch {
        cleanupFailed = true
      }
    }
    try {
      disposeParent?.()
    } catch {
      cleanupFailed = true
    }
    try {
      disposeVerifier?.()
    } catch {
      cleanupFailed = true
    }
    if (harness !== undefined) {
      try {
        await harness.ctx.fiber.dispose()
      } catch {
        cleanupFailed = true
      }
    }
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      cleanupFailed = true
    } finally {
      if (previousFixtureRoot === undefined) delete process.env.TIANWEN_DSH_PROBE_ROOT
      else process.env.TIANWEN_DSH_PROBE_ROOT = previousFixtureRoot
    }
    if (cleanupFailed) {
      throw new Error('controlled Skill lifecycle fixture cleanup failed')
    }
  }
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runControlledSkillLifecycleDemo())}\n`)
  } catch (error) {
    const message = error instanceof Error
      && error.message.startsWith('controlled lifecycle invariant failed:')
      ? error.message
      : 'controlled Skill lifecycle demo failed'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
