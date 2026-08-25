import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  LearningTicketId,
  Sha256Digest,
  ControlledSkillEvalTaskType,
  TianwenRunId,
} from '@tianwen/evolution'
import { CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1 } from '../../tianwen-evolution/dist/controlled-skill-activation.js'
import { CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST } from '../../tianwen-evolution/dist/controlled-skill-evaluation.js'
import { sha256 } from '../../tianwen-evolution/dist/learning-intake.js'

import { readControlledLifecycleManifest } from './controlled-lifecycle-contract.js'
import type {
  ControlledLifecycleManifest,
  ControlledLifecycleReceipt,
} from './controlled-lifecycle-contract.js'

const ACCEPTANCE_TOOL = 'verify_architecture_decision'
const DECISION_TOOL = 'record_architecture_decision'
const ACCEPTANCE_CONTRACT = {
  source: 'dsh-tool-result',
  toolName: ACCEPTANCE_TOOL,
  notMetErrorCode: 'ARCHITECTURE_DECISION_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'architecture-decision-semantic-mismatch',
  severity: 4,
  blocksGoal: false,
} as const
const SCOPE_KEY = 'project:tianwen/capability:controlled-architecture-decision'
const RECEIPT_EVIDENCE = {
  source: 'configured-provider-capable',
  environment: 'development-only',
  defect: 'synthetic-defect',
  naturalUserEvidence: 'not-claimed',
  externalUserEvidence: 'not-claimed',
} as const

export interface ControlledLifecycleRunnerConfig {
  readonly manifestPath: string
  readonly manifestDigest: `sha256:${string}`
}

interface ControlledLifecycleWorkspaceSnapshot {
  readonly schemaVersion: 'tianwen.controlled-workspace-snapshot.v1'
  readonly entries: readonly [{
    readonly relativePath: 'case.md'
    readonly contentDigest: `sha256:${string}`
    readonly size: number
  }]
}

export interface ControlledLifecycleSeedRun {
  readonly taskId: string
  readonly runId: TianwenRunId
  readonly sessionId: string
  readonly verdict: 'not-met' | 'met'
  readonly ticketId?: LearningTicketId
  readonly modelRequests: number
  readonly toolCalls: number
  readonly evidenceCount: 1
}

export interface ControlledLifecycleEvaluationTaskInput {
  readonly taskId: `eval-task:${string}`
  readonly goal: string
  readonly input: string
  readonly baselineWorkspaceRoot: string
  readonly candidateWorkspaceRoot: string
  readonly workspaceSnapshot: ControlledLifecycleWorkspaceSnapshot
  readonly authorization: {
    readonly standingAuthorizationDigest: `sha256:${string}`
    readonly taskId: `eval-task:${string}`
  }
  readonly verifierContract: {
    readonly toolName: typeof ACCEPTANCE_TOOL
    readonly arguments: { readonly taskId: `eval-task:${string}` }
  }
  readonly stopCondition: { readonly terminal: 'completed-final-assistant-text' }
  readonly evaluatorMaterialContract:
    ControlledLifecycleManifest['execution']['evaluatorMaterialContract']
  readonly baselineSessionId: string
  readonly candidateSessionId: string
  readonly evaluatorSessionId: string
}

export type ControlledLifecycleRunnerFailureCode =
  | 'manifest-revalidation-failed'
  | 'services-unavailable'
  | 'credential-missing'
  | 'root-drift'
  | 'selection-mismatch'
  | 'retry-policy-mismatch'
  | 'session-not-fresh'
  | 'workspace-drift'
  | 'tool-surface-mismatch'
  | 'identity-mismatch'
  | 'seed-failed'
  | 'persistence-failed'
  | 'candidate-failed'
  | 'evaluation-failed'
  | 'evaluator-failed'
  | 'shadow-failed'
  | 'transition-failed'
  | 'internal-error'

export class ControlledLifecycleRunnerError extends Error {
  constructor(
    readonly code: ControlledLifecycleRunnerFailureCode,
    readonly completedStage?: ControlledLifecycleStoppedStage,
    readonly completedRoles?: ControlledLifecycleCompletedRoles,
  ) {
    super(`controlled lifecycle runner stopped: ${code}`)
    this.name = 'ControlledLifecycleRunnerError'
  }
}

type ControlledLifecycleStoppedStage =
  | 'preflight'
  | 'seeds'
  | 'candidate'
  | 'evaluation'
  | 'evaluators'
  | 'shadow'
  | 'transitions'

interface ControlledLifecycleCompletedRoles {
  seedRuns: number
  evaluationArms: number
  evaluators: number
  shadowRuns: number
  transitions: number
}

interface DecisionSubmission {
  readonly taskId: string
  readonly choice: string
  readonly explanation: string
}

interface DecisionState {
  readonly taskId: string
  readonly expectedChoice: string
  submission?: DecisionSubmission
  verdict?: 'met' | 'not-met'
  recordAttempts: number
  verifyAttempts: number
}

interface SeedGuard {
  active: boolean
  toolCalls: number
  readonly maxToolCalls: number
  readonly allowedTools: ReadonlySet<string>
  agent?: { cancel(reason: { kind: 'hook', reason: string }): void, id: unknown }
  failed: boolean
}

interface SeedExecutionFacts {
  readonly callConfig: Awaited<ReturnType<Context['llm']['resolveCallConfig']>>
  readonly retryPolicy: ReturnType<Context['llm']['providerRetryPolicy']>
  readonly toolSchemas: ReturnType<Context['tools']['schemas']>
}

class ArchitectureDecisionNotMet extends HarnessError {
  constructor() {
    super('architecture decision did not meet the frozen requirement',
      ACCEPTANCE_CONTRACT.notMetErrorCode)
  }
}

class ArchitectureDecisionUnavailable extends HarnessError {
  constructor(code: string) {
    super('architecture decision submission is unavailable', code)
  }
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).toSorted()
  const expected = [...keys].toSorted()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function bounded(value: unknown): string | undefined {
  return typeof value === 'string'
    && value.trim().length > 0
    && Buffer.byteLength(value, 'utf8') <= 4_096
    && !value.includes('\0')
    ? value
    : undefined
}

function rawDigest(value: Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function workspaceSnapshot(root: string): ControlledLifecycleWorkspaceSnapshot {
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    if (entries.length !== 1 || entries[0]?.name !== 'case.md' || !entries[0].isFile()) {
      throw new Error('invalid workspace shape')
    }
    const path = join(root, 'case.md')
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) {
      throw new Error('invalid workspace file')
    }
    const content = readFileSync(path)
    return {
      schemaVersion: 'tianwen.controlled-workspace-snapshot.v1',
      entries: [{
        relativePath: 'case.md',
        contentDigest: rawDigest(content),
        size: content.length,
      }],
    }
  } catch {
    throw new ControlledLifecycleRunnerError('workspace-drift')
  }
}

function strictChild(child: string, parent: string): boolean {
  const segment = relative(parent, child)
  return segment.length > 0
    && !isAbsolute(segment)
    && segment !== '..'
    && !segment.startsWith(`..${sep}`)
}

function rootPreflight(
  ctx: Context,
  manifest: ControlledLifecycleManifest,
  activityStarted = false,
): void {
  try {
    const declaredRoots = [
      manifest.roots.dataDir,
      manifest.roots.operationRoot,
      manifest.roots.evolutionRoot,
    ]
    for (const root of declaredRoots) {
      const stat = lstatSync(root)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid root')
    }
    const dataRoot = realpathSync(manifest.roots.dataDir)
    const operationRoot = realpathSync(manifest.roots.operationRoot)
    const evolutionRoot = realpathSync(manifest.roots.evolutionRoot)
    if (
      !strictChild(operationRoot, dataRoot)
      || !strictChild(evolutionRoot, dataRoot)
    ) throw new Error('root boundary mismatch')

    const configuredSessionsRoot = (ctx.sessionPersistence as unknown as {
      readonly config?: { readonly root?: unknown }
    }).config?.root
    const declaredSessionsRoot = resolve(manifest.roots.sessionsRoot)
    if (
      typeof configuredSessionsRoot !== 'string'
      || resolve(configuredSessionsRoot) !== declaredSessionsRoot
    ) throw new Error('session root mismatch')
    let sessionsStat: ReturnType<typeof lstatSync> | undefined
    try {
      sessionsStat = lstatSync(declaredSessionsRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || activityStarted) throw error
    }
    if (sessionsStat !== undefined && (
      !sessionsStat.isDirectory()
      || sessionsStat.isSymbolicLink()
      || !strictChild(realpathSync(declaredSessionsRoot), dataRoot)
    )) throw new Error('session root mismatch')

    const evolutionEntries = readdirSync(evolutionRoot, { withFileTypes: true })
    const expectedEntries = activityStarted ? ['artifacts', 'ledger.jsonl'] : ['artifacts']
    const artifacts = evolutionEntries.find(entry => entry.name === 'artifacts')
    const ledger = evolutionEntries.find(entry => entry.name === 'ledger.jsonl')
    if (
      evolutionEntries.map(entry => entry.name).toSorted().join(',') !== expectedEntries.join(',')
      || !artifacts?.isDirectory()
      || lstatSync(join(evolutionRoot, 'artifacts')).isSymbolicLink()
      || (activityStarted && (
        !ledger?.isFile()
        || lstatSync(join(evolutionRoot, 'ledger.jsonl')).isSymbolicLink()
      ))
    ) throw new Error('evolution root mismatch')

  } catch {
    throw new ControlledLifecycleRunnerError('root-drift')
  }
}

function workspaceRootPreflight(manifest: ControlledLifecycleManifest): void {
  try {
    const operationRoot = realpathSync(manifest.roots.operationRoot)
    const workspaceRoots = [
      ...manifest.tasks.seeds.map(task => task.workspaceRoot),
      ...manifest.tasks.evaluations.flatMap(task => [
        task.baselineWorkspaceRoot,
        task.candidateWorkspaceRoot,
      ]),
      ...manifest.tasks.shadows.map(task => task.workspaceRoot),
      ...manifest.tasks.transitions.map(task => task.workspaceRoot),
    ]
    for (const workspace of workspaceRoots) {
      const declaredStat = lstatSync(workspace)
      const actual = realpathSync(workspace)
      if (
        !declaredStat.isDirectory()
        || declaredStat.isSymbolicLink()
        || !strictChild(actual, operationRoot)
      ) throw new Error('workspace root mismatch')
    }
  } catch {
    throw new ControlledLifecycleRunnerError('workspace-drift')
  }
}

function requestCount(events: readonly { readonly type: string }[]): number {
  return events.filter(event => event.type === 'step/start').length
}

function toolCallCount(events: readonly { readonly type: string }[]): number {
  return events.filter(event => event.type === 'tool/call').length
}

function sameSkill(
  actual: Awaited<ReturnType<Context['skills']['get']>>,
  expected: ControlledLifecycleManifest['skills']['parent'],
): boolean {
  return actual !== undefined
    && actual.name === expected.name
    && actual.description === expected.description
    && actual.whenToUse === expected.whenToUse
    && actual.invocation.modelInvocable === expected.invocation.modelInvocable
    && actual.invocation.userInvocable === expected.invocation.userInvocable
    && actual.source === expected.source
    && actual.provider === expected.provider
    && actual.content === expected.content
}

function guardTool(
  execution: Readonly<{ readonly agent?: SeedGuard['agent'], readonly name: string }>,
  guard: SeedGuard,
): string | undefined {
  if (
    !guard.active
    || execution.agent !== guard.agent
    || !guard.allowedTools.has(execution.name)
  ) return 'controlled lifecycle seed tool unavailable'
  if (guard.toolCalls >= guard.maxToolCalls) {
    guard.failed = true
    guard.agent?.cancel({ kind: 'hook', reason: 'tianwen-controlled-tool-limit' })
    return 'controlled lifecycle seed tool limit exceeded'
  }
  guard.toolCalls += 1
  return undefined
}

function evaluationTasks(
  manifest: ControlledLifecycleManifest,
): readonly ControlledLifecycleEvaluationTaskInput[] {
  return manifest.tasks.evaluations.map(task => {
    const baseline = workspaceSnapshot(task.baselineWorkspaceRoot)
    const candidate = workspaceSnapshot(task.candidateWorkspaceRoot)
    if (sha256(baseline) !== sha256(candidate)) {
      throw new ControlledLifecycleRunnerError('workspace-drift')
    }
    return {
      taskId: task.taskId as `eval-task:${string}`,
      goal: task.goal,
      input: task.input,
      baselineWorkspaceRoot: task.baselineWorkspaceRoot,
      candidateWorkspaceRoot: task.candidateWorkspaceRoot,
      workspaceSnapshot: baseline,
      authorization: {
        standingAuthorizationDigest: manifest.standingAuthorizationDigest,
        taskId: task.taskId as `eval-task:${string}`,
      },
      verifierContract: {
        toolName: ACCEPTANCE_TOOL,
        arguments: { taskId: task.taskId as `eval-task:${string}` },
      },
      stopCondition: { terminal: 'completed-final-assistant-text' },
      evaluatorMaterialContract: manifest.execution.evaluatorMaterialContract,
      baselineSessionId: task.baselineSessionId,
      candidateSessionId: task.candidateSessionId,
      evaluatorSessionId: task.evaluatorSessionId,
    }
  })
}

function singleArmTask(
  manifest: ControlledLifecycleManifest,
  task: ControlledLifecycleManifest['tasks']['shadows'][number]
    | ControlledLifecycleManifest['tasks']['transitions'][number],
) {
  const taskId = task.taskId as `shadow-task:${string}` | `transition-task:${string}`
  const acceptanceSubject = { taskId }
  return {
    taskId,
    goal: task.goal,
    input: task.input,
    workspaceRoot: task.workspaceRoot,
    workspaceSnapshot: workspaceSnapshot(task.workspaceRoot),
    authorization: {
      standingAuthorizationDigest: manifest.standingAuthorizationDigest,
      taskId,
    },
    verifierContract: {
      toolName: ACCEPTANCE_TOOL,
      arguments: acceptanceSubject,
    },
    stopCondition: { terminal: 'completed-final-assistant-text' as const },
    acceptanceContract: ACCEPTANCE_CONTRACT,
    acceptanceSubject,
    allowedTools: manifest.execution.allowedTools,
    stopContract: manifest.execution.stopContract,
    sessionId: task.sessionId,
  }
}

function setDecisionStates(
  states: Map<string, DecisionState>,
  tasks: readonly {
    readonly taskId: string
    readonly hiddenExpectedChoice: string
    readonly sessionIds: readonly string[]
  }[],
): void {
  states.clear()
  for (const task of tasks) {
    for (const sessionId of task.sessionIds) {
      if (states.has(sessionId)) throw new ControlledLifecycleRunnerError('identity-mismatch')
      states.set(sessionId, {
        taskId: task.taskId,
        expectedChoice: task.hiddenExpectedChoice,
        recordAttempts: 0,
        verifyAttempts: 0,
      })
    }
  }
}

function requireCompletedDecisionStates(states: Map<string, DecisionState>): void {
  if ([...states.values()].some(state =>
    state.recordAttempts !== 1
    || state.verifyAttempts !== 1
    || state.submission?.taskId !== state.taskId
    || state.verdict === undefined)) {
    throw new ControlledLifecycleRunnerError('identity-mismatch')
  }
}

function allWorkspaceSnapshots(
  manifest: ControlledLifecycleManifest,
): readonly ControlledLifecycleWorkspaceSnapshot[] {
  return [
    ...manifest.tasks.seeds.map(task => workspaceSnapshot(task.workspaceRoot)),
    ...manifest.tasks.evaluations.flatMap(task => [
      workspaceSnapshot(task.baselineWorkspaceRoot),
      workspaceSnapshot(task.candidateWorkspaceRoot),
    ]),
    ...manifest.tasks.shadows.map(task => workspaceSnapshot(task.workspaceRoot)),
    ...manifest.tasks.transitions.map(task => workspaceSnapshot(task.workspaceRoot)),
  ]
}

function revalidateFrozenInputs(
  config: ControlledLifecycleRunnerConfig,
  manifestDigest: `sha256:${string}`,
  manifest: ControlledLifecycleManifest,
  expectedSnapshots: readonly ControlledLifecycleWorkspaceSnapshot[],
): void {
  try {
    readControlledLifecycleManifest(config.manifestPath, manifestDigest)
  } catch {
    throw new ControlledLifecycleRunnerError('manifest-revalidation-failed')
  }
  if (sha256(allWorkspaceSnapshots(manifest)) !== sha256(expectedSnapshots)) {
    throw new ControlledLifecycleRunnerError('workspace-drift')
  }
}

function freshEvolution(ctx: Context, root: string): boolean {
  return !existsSync(join(root, 'ledger.jsonl'))
    && !existsSync(join(root, 'champion.json'))
    && ctx.tianwenEvolution.listEvents().length === 0
    && ctx.tianwenEvolution.listLearningSignals().length === 0
    && ctx.tianwenEvolution.listLearningTickets().length === 0
    && ctx.tianwenEvolution.listLearningCases().length === 0
    && ctx.tianwenEvolution.listSkillCandidates().length === 0
    && ctx.tianwenEvolution.listControlledSkillEvalProtocols().length === 0
    && ctx.tianwenEvolution.listControlledSkillEvaluations().length === 0
    && ctx.tianwenEvolution.listControlledSkillShadows().length === 0
    && ctx.tianwenEvolution.listControlledSkillScopePointers().length === 0
    && ctx.tianwenEvolution.listControlledSkillTransitions().length === 0
}

async function readSeedExecutionFacts(
  ctx: Context,
  manifest: ControlledLifecycleManifest,
  activityStarted = false,
): Promise<SeedExecutionFacts> {
  const credentials = ctx.get('credentials') as {
    describe(reference: ReturnType<typeof credentialRef>): Promise<{ readonly configured: boolean }>
  } | undefined
  try {
    if (
      credentials === undefined
      || !(await credentials.describe(credentialRef('DEEPSEEK_API_KEY'))).configured
    ) throw new ControlledLifecycleRunnerError('credential-missing')
  } catch (error) {
    if (error instanceof ControlledLifecycleRunnerError) throw error
    throw new ControlledLifecycleRunnerError('credential-missing')
  }

  let selection: { readonly provider: string, readonly model: string }
  try {
    selection = (ctx.get('agentDefaultModel') as {
      currentSelection(): { readonly provider: string, readonly model: string }
    }).currentSelection()
  } catch {
    throw new ControlledLifecycleRunnerError('selection-mismatch')
  }
  if (
    selection.provider !== manifest.execution.providerId
    || selection.model !== manifest.execution.modelId
  ) throw new ControlledLifecycleRunnerError('selection-mismatch')

  let callConfig: SeedExecutionFacts['callConfig']
  try {
    callConfig = await ctx.llm.resolveCallConfig(selection)
  } catch {
    throw new ControlledLifecycleRunnerError('selection-mismatch')
  }
  if (
    callConfig.provider !== manifest.execution.providerId
    || callConfig.model !== manifest.execution.modelId
  ) throw new ControlledLifecycleRunnerError('selection-mismatch')

  let retryPolicy: SeedExecutionFacts['retryPolicy']
  try {
    retryPolicy = ctx.llm.providerRetryPolicy(selection.provider)
  } catch {
    throw new ControlledLifecycleRunnerError('retry-policy-mismatch')
  }
  if (retryPolicy.mode !== 'normal' || retryPolicy.maxRetries !== 0) {
    throw new ControlledLifecycleRunnerError('retry-policy-mismatch')
  }

  rootPreflight(ctx, manifest, activityStarted)
  workspaceRootPreflight(manifest)

  let toolSchemas: SeedExecutionFacts['toolSchemas']
  try {
    toolSchemas = ctx.tools.schemas()
      .filter(schema => manifest.execution.allowedTools.includes(
        schema.name as typeof manifest.execution.allowedTools[number],
      ))
      .toSorted((left, right) => left.name.localeCompare(right.name))
  } catch {
    throw new ControlledLifecycleRunnerError('tool-surface-mismatch')
  }
  if (
    toolSchemas.length !== manifest.execution.allowedTools.length
    || toolSchemas.map(schema => schema.name).join(',')
      !== [...manifest.execution.allowedTools].toSorted().join(',')
  ) throw new ControlledLifecycleRunnerError('tool-surface-mismatch')

  try {
    const skillRoots = [
      ...manifest.tasks.seeds.map(task => task.workspaceRoot),
      ...manifest.tasks.evaluations.flatMap(task => [
        task.baselineWorkspaceRoot,
        task.candidateWorkspaceRoot,
      ]),
      ...manifest.tasks.shadows.map(task => task.workspaceRoot),
      ...manifest.tasks.transitions.map(task => task.workspaceRoot),
    ]
    for (const workspaceRoot of skillRoots) {
      const rootSkill = await ctx.skills.get(manifest.skills.parent.name, {
        cwd: workspaceRoot,
      })
      if (!sameSkill(rootSkill, manifest.skills.parent)) {
        throw new ControlledLifecycleRunnerError('identity-mismatch')
      }
    }
  } catch (error) {
    if (error instanceof ControlledLifecycleRunnerError) throw error
    throw new ControlledLifecycleRunnerError('identity-mismatch')
  }

  return { callConfig, retryPolicy, toolSchemas }
}

function requireSameSeedExecutionFacts(
  expected: SeedExecutionFacts,
  actual: SeedExecutionFacts,
): void {
  if (sha256(actual.callConfig) !== sha256(expected.callConfig)) {
    throw new ControlledLifecycleRunnerError('selection-mismatch')
  }
  if (sha256(actual.retryPolicy) !== sha256(expected.retryPolicy)) {
    throw new ControlledLifecycleRunnerError('retry-policy-mismatch')
  }
  if (sha256(actual.toolSchemas) !== sha256(expected.toolSchemas)) {
    throw new ControlledLifecycleRunnerError('tool-surface-mismatch')
  }
}

async function revalidateSeedBoundary(
  ctx: Context,
  config: ControlledLifecycleRunnerConfig,
  manifest: ControlledLifecycleManifest,
  expectedSnapshots: readonly ControlledLifecycleWorkspaceSnapshot[],
  expectedFacts: SeedExecutionFacts,
): Promise<void> {
  revalidateFrozenInputs(config, config.manifestDigest, manifest, expectedSnapshots)
  requireSameSeedExecutionFacts(expectedFacts, await readSeedExecutionFacts(ctx, manifest, true))
}

async function runSeed(
  ctx: Context,
  manifest: ControlledLifecycleManifest,
  task: ControlledLifecycleManifest['tasks']['seeds'][number],
  stateByAgent: WeakMap<object, DecisionState>,
  beforeSnapshot: ControlledLifecycleWorkspaceSnapshot,
): Promise<ControlledLifecycleSeedRun> {
  const selection = {
    provider: manifest.execution.providerId,
    model: manifest.execution.modelId,
  }
  const guard: SeedGuard = {
    active: false,
    toolCalls: 0,
    maxToolCalls: manifest.execution.stopContract.maxToolCalls,
    allowedTools: new Set(manifest.execution.allowedTools),
    failed: false,
  }
  const handle = await ctx.agents.create({
    sessionId: SessionId(task.sessionId),
    meta: { cwd: task.workspaceRoot },
    agentOptions: selection,
    setup: agentCtx => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined })
      agentCtx.tools.presentAs('native')
      agentCtx.tools.restrict({ allow: manifest.execution.allowedTools })
      agentCtx.tools.guard(execution => guardTool(execution, guard))
    },
  })
  guard.agent = handle.agent
  const state: DecisionState = {
    taskId: task.taskId,
    expectedChoice: task.hiddenExpectedChoice,
    recordAttempts: 0,
    verifyAttempts: 0,
  }
  stateByAgent.set(handle.agent, state)
  try {
    const schemas = handle.agent.ctx.tools.schemas(handle.agent)
      .toSorted((left, right) => left.name.localeCompare(right.name))
    if (
      String(handle.agent.id) !== task.sessionId
      || handle.agent.session.header.cwd !== task.workspaceRoot
      || schemas.map(schema => schema.name).join(',')
        !== [...manifest.execution.allowedTools].toSorted().join(',')
    ) throw new ControlledLifecycleRunnerError('identity-mismatch')
    let resolvedSkill: Awaited<ReturnType<Context['skills']['get']>>
    await handle.agent.ctx.inject(['skills'], async agentCtx => {
      resolvedSkill = await agentCtx.skills.get(manifest.skills.parent.name, {
        cwd: task.workspaceRoot,
        scope: handle.agent,
      })
    })
    if (!sameSkill(resolvedSkill, manifest.skills.parent)) {
      throw new ControlledLifecycleRunnerError('identity-mismatch')
    }
    const acceptanceArguments = { taskId: task.taskId }
    let binding: Awaited<ReturnType<
      typeof ctx.tianwenLearningIntake.bindRunWithSkill
    >> | undefined
    await handle.agent.ctx.inject(['skills'], async agentCtx => {
      binding = await ctx.tianwenLearningIntake.bindRunWithSkill(
        handle.agent,
        {
          goalRef: `goal:controlled-real-seed:${manifest.activityLabel}`,
          taskRef: `task:${task.taskId}:baseline`,
          scopeKey: SCOPE_KEY,
          acceptanceContract: ACCEPTANCE_CONTRACT,
          acceptanceSubjectDigest: sha256(acceptanceArguments),
        },
        manifest.skills.parent.name,
        agentCtx.skills,
      )
    })
    if (binding === undefined) {
      throw new ControlledLifecycleRunnerError('identity-mismatch')
    }
    const bound = binding
    guard.active = true
    const timer = setTimeout(() => {
      if (!guard.active) return
      guard.failed = true
      guard.agent?.cancel({ kind: 'hook', reason: 'tianwen-controlled-timeout' })
    }, manifest.execution.stopContract.maxElapsedMs)
    let idleFailed = false
    try {
      handle.agent.followup(createUserMessage({
        content: [{
          type: 'text',
          text: [
            `Task ID: ${task.taskId}`,
            `Load Skill \`${manifest.skills.parent.name}\` exactly once.`,
            `Call \`${DECISION_TOOL}\` exactly once with this taskId, your choice, and a concise explanation.`,
            `Then call \`${ACCEPTANCE_TOOL}\` exactly once with this taskId.`,
            'After verifier feedback, finish naturally without calling either decision tool again.',
            '',
            task.goal,
            '',
            task.input,
          ].join('\n'),
        }],
        source: { kind: 'user' },
      }))
      await handle.agent.whenIdle()
    } catch {
      idleFailed = true
    } finally {
      guard.active = false
      clearTimeout(timer)
    }
    const terminal = handle.agent.session.events.findLast(event =>
      event.type === 'turn/start' || event.type === 'turn/end')
    if (
      idleFailed
      || guard.failed
      || terminal?.type !== 'turn/end'
      || terminal.data.reason.kind !== 'completed'
      || sha256(workspaceSnapshot(task.workspaceRoot)) !== sha256(beforeSnapshot)
    ) throw new ControlledLifecycleRunnerError('seed-failed')
    try {
      if (!await ctx.sessions.flush(handle.agent.session)) {
        throw new ControlledLifecycleRunnerError('persistence-failed')
      }
    } catch (error) {
      if (error instanceof ControlledLifecycleRunnerError) throw error
      throw new ControlledLifecycleRunnerError('persistence-failed')
    }
    let inspection: Awaited<ReturnType<typeof ctx.sessionPersistence.inspect>>
    try {
      inspection = await ctx.sessionPersistence.inspect(SessionId(task.sessionId))
    } catch {
      throw new ControlledLifecycleRunnerError('persistence-failed')
    }
    if (
      String(inspection.meta.id) !== task.sessionId
      || inspection.meta.cwd !== task.workspaceRoot
      || sha256(inspection.events) !== sha256(handle.agent.session.events)
    ) throw new ControlledLifecycleRunnerError('persistence-failed')
    const evidenceService = ctx.get('tianwenEvidence') as {
      project(session: typeof handle.agent.session): readonly {
        readonly evidenceId: Sha256Digest
        readonly source: { readonly callSeq: number }
        readonly action: {
          readonly toolName: string
          readonly argumentsDigest: Sha256Digest
        }
        readonly outcome: {
          readonly status: string
          readonly isError?: boolean
          readonly errorCode?: string
        }
      }[]
    }
    const decisionCalls = handle.agent.session.events.filter(event =>
      event.type === 'tool/call' && event.data.name === DECISION_TOOL)
    const verifierCalls = handle.agent.session.events.filter(event =>
      event.type === 'tool/call' && event.data.name === ACCEPTANCE_TOOL)
    let evidence: ReturnType<typeof evidenceService.project>
    try {
      evidence = evidenceService.project(handle.agent.session)
        .filter(item => item.action.toolName === ACCEPTANCE_TOOL)
        .sort((left, right) => left.source.callSeq - right.source.callSeq)
    } catch {
      throw new ControlledLifecycleRunnerError('seed-failed')
    }
    const finalEvidence = evidence.at(-1)
    const verdict = state.verdict === 'met'
      && finalEvidence?.outcome.status === 'complete'
      && finalEvidence.outcome.isError === false
      && finalEvidence.outcome.errorCode === undefined
      ? 'met'
      : state.verdict === 'not-met'
          && finalEvidence?.outcome.status === 'complete'
          && finalEvidence.outcome.isError === true
          && (
            finalEvidence.outcome.errorCode === undefined
            || finalEvidence.outcome.errorCode === ACCEPTANCE_CONTRACT.notMetErrorCode
          )
        ? 'not-met'
        : undefined
    if (
      decisionCalls.length !== 1
      || verifierCalls.length !== 1
      || decisionCalls[0]!.seq >= verifierCalls[0]!.seq
      || state.recordAttempts !== 1
      || state.verifyAttempts !== 1
      || state.submission?.taskId !== task.taskId
      || evidence.length !== 1
      || finalEvidence === undefined
      || finalEvidence.action.argumentsDigest !== sha256(acceptanceArguments)
      || verdict === undefined
    ) throw new ControlledLifecycleRunnerError('seed-failed')
    let hasSkillUseProof: boolean
    try {
      hasSkillUseProof = ctx.tianwenLearningIntake.hasSkillUseProof(
        handle.agent.session,
        bound.runId,
      )
    } catch {
      throw new ControlledLifecycleRunnerError('seed-failed')
    }
    if (!hasSkillUseProof) {
      throw new ControlledLifecycleRunnerError('seed-failed')
    }
    let outcome: ReturnType<typeof ctx.tianwenLearningIntake.consumeOutcome>
    let use: ReturnType<typeof ctx.tianwenLearningIntake.recordSkillUse>
    try {
      outcome = ctx.tianwenLearningIntake.consumeOutcome(
        handle.agent.session,
        bound.runId,
        { verdict, acceptanceEvidenceId: finalEvidence.evidenceId },
      )
      use = ctx.tianwenLearningIntake.recordSkillUse(
        handle.agent.session,
        bound.runId,
      )
    } catch {
      throw new ControlledLifecycleRunnerError('persistence-failed')
    }
    if (
      outcome.acceptanceEvidenceId !== finalEvidence.evidenceId
      || use.decision !== 'recorded'
      || (verdict === 'not-met'
        ? outcome.decision !== 'ticket-created' || outcome.ticketId === undefined
        : outcome.decision !== 'no-case' || outcome.ticketId !== undefined)
    ) throw new ControlledLifecycleRunnerError('seed-failed')
    return {
      taskId: task.taskId,
      runId: bound.runId,
      sessionId: task.sessionId,
      verdict,
      ...(outcome.ticketId === undefined ? {} : { ticketId: outcome.ticketId }),
      modelRequests: requestCount(handle.agent.session.events),
      toolCalls: toolCallCount(handle.agent.session.events),
      evidenceCount: 1,
    }
  } finally {
    stateByAgent.delete(handle.agent)
    await handle.dispose()
  }
}

function emptyCompletedRoles(): ControlledLifecycleCompletedRoles {
  return {
    seedRuns: 0,
    evaluationArms: 0,
    evaluators: 0,
    shadowRuns: 0,
    transitions: 0,
  }
}

function refreshCompletedRunRoles(
  ctx: Context,
  manifest: ControlledLifecycleManifest,
  roles: ControlledLifecycleCompletedRoles,
): void {
  const usedSessions = new Set(ctx.tianwenEvolution.listRunSkillUses()
    .map(use => use.sessionId))
  roles.evaluationArms = manifest.tasks.evaluations.flatMap(task => [
    task.baselineSessionId,
    task.candidateSessionId,
  ]).filter(sessionId => usedSessions.has(sessionId)).length
  roles.shadowRuns = manifest.tasks.shadows
    .filter(task => usedSessions.has(task.sessionId)).length
  roles.transitions = manifest.tasks.transitions
    .filter(task => usedSessions.has(task.sessionId)).length
}

function stoppedReason(code: ControlledLifecycleRunnerFailureCode):
  Extract<ControlledLifecycleReceipt, { readonly status: 'stopped' }>['reasonCode'] {
  switch (code) {
    case 'manifest-revalidation-failed':
    case 'services-unavailable':
    case 'credential-missing':
    case 'session-not-fresh':
    case 'seed-failed':
    case 'candidate-failed':
    case 'evaluation-failed':
    case 'evaluator-failed':
    case 'shadow-failed':
    case 'transition-failed':
    case 'persistence-failed':
    case 'workspace-drift':
    case 'root-drift':
    case 'identity-mismatch':
    case 'internal-error':
      return code
    case 'selection-mismatch':
    case 'retry-policy-mismatch':
      return 'selection-mismatch'
    case 'tool-surface-mismatch':
      return 'identity-mismatch'
  }
}

function stoppedReceipt(
  manifestDigest: `sha256:${string}`,
  error: ControlledLifecycleRunnerError,
): ControlledLifecycleReceipt {
  return {
    schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
    status: 'stopped',
    evidence: RECEIPT_EVIDENCE,
    activityDigest: manifestDigest,
    completedStage: error.completedStage ?? 'preflight',
    reasonCode: stoppedReason(error.code),
    completedRoles: error.completedRoles ?? emptyCompletedRoles(),
  }
}

async function formalActivityCounts(
  ctx: Context,
  manifest: ControlledLifecycleManifest,
): Promise<{ readonly modelRequests: number, readonly toolCalls: number }> {
  let modelRequests = 0
  let toolCalls = 0
  for (const sessionId of [
    ...manifest.tasks.seeds.map(task => task.sessionId),
    ...manifest.tasks.evaluations.flatMap(task => [
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ]),
    ...manifest.tasks.shadows.map(task => task.sessionId),
    ...manifest.tasks.transitions.map(task => task.sessionId),
  ]) {
    const inspection = await ctx.sessionPersistence.inspect(SessionId(sessionId))
    modelRequests += requestCount(inspection.events)
    toolCalls += toolCallCount(inspection.events)
  }
  return { modelRequests, toolCalls }
}

export async function runControlledLifecycle(
  ctx: Context,
  config: ControlledLifecycleRunnerConfig,
): Promise<Extract<ControlledLifecycleReceipt, { readonly status: 'passed' }>> {
  let prepared: ReturnType<typeof readControlledLifecycleManifest>
  try {
    prepared = readControlledLifecycleManifest(config.manifestPath, config.manifestDigest)
  } catch {
    throw new ControlledLifecycleRunnerError('manifest-revalidation-failed')
  }
  const manifest = prepared.manifest
  const loader = ctx.get('loader') as { await(): Promise<void> } | undefined
  if (
    loader === undefined
    || ctx.get('agentDefaultModel') === undefined
    || ctx.get('credentials') === undefined
    || ctx.get('tianwenEvidence') === undefined
    || ctx.get('tianwenEvolution') === undefined
    || ctx.get('tianwenLearningIntake') === undefined
    || ctx.get('tianwenSkillEvaluation') === undefined
  ) throw new ControlledLifecycleRunnerError('services-unavailable')
  try {
    await loader.await()
  } catch {
    throw new ControlledLifecycleRunnerError('services-unavailable')
  }
  if (!freshEvolution(ctx, manifest.roots.evolutionRoot)) {
    throw new ControlledLifecycleRunnerError('session-not-fresh')
  }
  rootPreflight(ctx, manifest)
  workspaceRootPreflight(manifest)
  const persisted = await ctx.sessionPersistence.list()
  if (
    persisted.length !== 0
    || ctx.agents.list().length !== 0
    || ctx.sessions.list().length !== 0
  ) throw new ControlledLifecycleRunnerError('session-not-fresh')
  const allSnapshots = allWorkspaceSnapshots(manifest)
  if (allSnapshots.length !== 20) {
    throw new ControlledLifecycleRunnerError('workspace-drift')
  }

  const progress = emptyCompletedRoles()
  const stateByAgent = new WeakMap<object, DecisionState>()
  const stateBySessionId = new Map<string, DecisionState>()
  const resolveVerdict = (sessionId: string) => stateBySessionId.get(sessionId)?.verdict
  const disposeDecision = ctx.tools.register(defineTool({
    name: DECISION_TOOL,
    description: 'Record the first architecture decision for this controlled task.',
    parameters: {
      taskId: { type: 'string', required: true },
      choice: { type: 'string', required: true },
      explanation: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const state = exec.agent === undefined
        ? undefined
        : stateByAgent.get(exec.agent) ?? stateBySessionId.get(String(exec.agent.id))
      if (state === undefined) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_CONTEXT_MISSING')
      }
      state.recordAttempts += 1
      if (state.recordAttempts !== 1 || state.submission !== undefined) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_ALREADY_RECORDED')
      }
      if (!exactObject(args, ['taskId', 'choice', 'explanation'])) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_INVALID')
      }
      const taskId = bounded(args.taskId)
      const choice = bounded(args.choice)
      const explanation = bounded(args.explanation)
      if (taskId !== state.taskId || choice === undefined || explanation === undefined) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_INVALID')
      }
      state.submission = { taskId, choice, explanation }
      return 'recorded'
    },
  }))
  const disposeVerifier = ctx.tools.register(defineTool({
    name: ACCEPTANCE_TOOL,
    description: 'Verify the first recorded architecture decision for this controlled task.',
    parameters: { taskId: { type: 'string', required: true } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const state = exec.agent === undefined
        ? undefined
        : stateByAgent.get(exec.agent) ?? stateBySessionId.get(String(exec.agent.id))
      if (state === undefined) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_CONTEXT_MISSING')
      }
      state.verifyAttempts += 1
      if (state.verifyAttempts !== 1) {
        throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_ALREADY_VERIFIED')
      }
      if (
        !exactObject(args, ['taskId'])
        || args.taskId !== state.taskId
        || state.submission === undefined
      ) throw new ArchitectureDecisionUnavailable('ARCHITECTURE_DECISION_INCONCLUSIVE')
      if (state.submission.choice !== state.expectedChoice) {
        state.verdict = 'not-met'
        throw new ArchitectureDecisionNotMet()
      }
      state.verdict = 'met'
      return 'verified'
    },
  }))
  const disposeParent = ctx.skills.register(manifest.skills.parent)
  let lastClosedStage: ControlledLifecycleStoppedStage = 'preflight'
  try {
    const initialFacts = await readSeedExecutionFacts(ctx, manifest)
    const tasks = evaluationTasks(manifest)
    const first = await runSeed(
      ctx, manifest, manifest.tasks.seeds[0]!, stateByAgent, allSnapshots[0]!,
    )
    progress.seedRuns = 1
    if (first.verdict !== 'not-met' || first.ticketId === undefined) {
      throw new ControlledLifecycleRunnerError('seed-failed')
    }
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    const second = await runSeed(
      ctx, manifest, manifest.tasks.seeds[1]!, stateByAgent, allSnapshots[1]!,
    )
    progress.seedRuns = 2
    if (second.verdict !== 'met' || second.ticketId !== undefined) {
      throw new ControlledLifecycleRunnerError('seed-failed')
    }
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    lastClosedStage = 'seeds'
    let protocol
    let candidate
    try {
      protocol = ctx.tianwenEvolution.freezeControlledSkillEvalProtocol({
        ticketId: first.ticketId,
        evidencePurpose: 'development-only-synthetic-defect',
        protocol: {
          rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
          tasks: tasks.map(task => ({
            taskId: task.taskId,
            taskType: manifest.tasks.evaluations.find(item => item.taskId === task.taskId)!
              .taskType as ControlledSkillEvalTaskType,
            goalDigest: sha256(task.goal),
            inputDigest: sha256(task.input),
            workspaceSnapshotDigest: sha256(task.workspaceSnapshot),
            toolSchemaDigest: sha256(initialFacts.toolSchemas),
            authorizationDigest: sha256(task.authorization),
            verifierContractDigest: sha256(task.verifierContract),
            stopConditionDigest: sha256(task.stopCondition),
            evaluatorMaterialContractDigest: sha256(task.evaluatorMaterialContract),
            acceptanceContract: ACCEPTANCE_CONTRACT,
            acceptanceSubjectDigest: sha256(task.verifierContract.arguments),
            allowedTools: manifest.execution.allowedTools,
            stopContract: manifest.execution.stopContract,
          })),
          execution: {
            dshVersion: manifest.execution.dshVersion,
            providerId: initialFacts.callConfig.provider,
            modelId: initialFacts.callConfig.model,
            callConfigDigest: sha256(initialFacts.callConfig),
            toolSchemaDigest: sha256(tasks.map(task => ({
              taskId: task.taskId,
              toolSchemaDigest: sha256(initialFacts.toolSchemas),
            }))),
            retryPolicyDigest: sha256(initialFacts.retryPolicy),
          },
        },
      })
      const protocolRecord = ctx.tianwenEvolution.getControlledSkillEvalProtocol(
        protocol.protocolId,
      )
      if (protocolRecord?.provenance !== 'pre-candidate') {
        throw new ControlledLifecycleRunnerError('candidate-failed')
      }
      const opened = ctx.tianwenEvolution.openLearningCase({
        ticketId: first.ticketId,
        counterevidenceRunIds: [second.runId],
      })
      const learningCase = ctx.tianwenEvolution.getLearningCase(opened.caseId)
      if (learningCase === undefined) {
        throw new ControlledLifecycleRunnerError('candidate-failed')
      }
      const supportingEvidenceIds = learningCase.supportingEvidenceIds
      const counterevidenceIds = learningCase.counterevidence
        .flatMap(item => item.evidenceIds)
      const attribution = ctx.tianwenEvolution.recordAttribution({
        caseId: learningCase.caseId,
        resolution: 'dsh-skill',
        targetSkillName: manifest.skills.parent.name,
        hypothesis: 'Interface-first reasoning can collapse governed Run semantics into convenient local interfaces.',
        supportingEvidenceIds,
        counterevidenceIds,
        alternatives: 'The met counterexample keeps already-sufficient DSH Agent behavior outside new coordination.',
      })
      const lesson = ctx.tianwenEvolution.recordAcceptedLesson({
        caseId: learningCase.caseId,
        attributionId: attribution.attributionId,
        claim: 'Derive the product contract first, then reuse or minimally bind the sufficient public interface.',
        when: 'When an architecture decision maps governed product meaning onto available interfaces.',
        notWhen: 'When a purely local implementation choice is already satisfied by a standard primitive.',
        supportingEvidenceIds,
        counterevidenceIds,
        targetScope: learningCase.scopeKey,
      })
      const { provider: _provider, ...candidatePayload } = manifest.skills.candidate
      candidate = ctx.tianwenEvolution.recordSkillCandidate({
        lessonId: lesson.lessonId,
        payload: candidatePayload,
        evidenceIds: [...supportingEvidenceIds, ...counterevidenceIds],
      })
    } catch (error) {
      if (error instanceof ControlledLifecycleRunnerError) throw error
      throw new ControlledLifecycleRunnerError('candidate-failed')
    }
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    lastClosedStage = 'candidate'
    setDecisionStates(stateBySessionId, manifest.tasks.evaluations.map(task => ({
      taskId: task.taskId,
      hiddenExpectedChoice: task.hiddenExpectedChoice,
      sessionIds: [task.baselineSessionId, task.candidateSessionId],
    })))
    let arms
    try {
      arms = await ctx.tianwenSkillEvaluation.runControlledArms({
        candidateId: candidate.candidateId,
        protocolId: protocol.protocolId,
        tasks,
      }, resolveVerdict)
      refreshCompletedRunRoles(ctx, manifest, progress)
      if (arms.state === 'awaiting-evaluator') {
        requireCompletedDecisionStates(stateBySessionId)
      }
    } catch {
      refreshCompletedRunRoles(ctx, manifest, progress)
      throw new ControlledLifecycleRunnerError('evaluation-failed')
    } finally {
      stateBySessionId.clear()
    }
    if (arms.state === 'terminal') {
      lastClosedStage = 'evaluation'
      throw new ControlledLifecycleRunnerError('evaluation-failed')
    }
    if (
      arms.state !== 'awaiting-evaluator'
      || arms.completedTaskIds.length !== manifest.tasks.evaluations.length
    ) throw new ControlledLifecycleRunnerError('evaluation-failed')
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    lastClosedStage = 'evaluation'

    let evaluators
    try {
      evaluators = await ctx.tianwenSkillEvaluation.runControlledEvaluators({
        evaluationId: arms.evaluationId,
        tasks: tasks.map(task => ({
          taskId: task.taskId,
          goal: task.goal,
          input: task.input,
          evaluatorMaterialContract: task.evaluatorMaterialContract,
        })),
      })
      progress.evaluators = evaluators.completedTaskIds.length
    } catch {
      progress.evaluators = ctx.tianwenEvolution
        .listControlledSkillEvaluatorObservations(arms.evaluationId).length
      throw new ControlledLifecycleRunnerError('evaluator-failed')
    }
    if (evaluators.state !== 'terminal') {
      throw new ControlledLifecycleRunnerError('evaluator-failed')
    }
    if (
      evaluators.completedTaskIds.length !== manifest.tasks.evaluations.length
      || evaluators.result.mechanismVerdict !== 'pass'
      || evaluators.result.reasonCode !== 'all-gates-passed'
    ) {
      lastClosedStage = 'evaluators'
      throw new ControlledLifecycleRunnerError('evaluator-failed')
    }
    for (const task of manifest.tasks.evaluations) {
      const inspection = await ctx.sessionPersistence.inspect(SessionId(task.evaluatorSessionId))
      if (
        inspection.meta.cwd !== undefined
        || inspection.events.filter(event => event.type === 'tool/call').length !== 1
      ) throw new ControlledLifecycleRunnerError('identity-mismatch')
    }
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    lastClosedStage = 'evaluators'

    const shadowTasks = manifest.tasks.shadows.map(task => ({
      ...singleArmTask(manifest, task),
      taskId: task.taskId as `shadow-task:${string}`,
    }))
    setDecisionStates(stateBySessionId, manifest.tasks.shadows.map(task => ({
      taskId: task.taskId,
      hiddenExpectedChoice: task.hiddenExpectedChoice,
      sessionIds: [task.sessionId],
    })))
    let shadow
    try {
      shadow = await ctx.tianwenSkillEvaluation.runControlledShadow({
        evaluationId: arms.evaluationId,
        tasks: shadowTasks,
      }, resolveVerdict)
      refreshCompletedRunRoles(ctx, manifest, progress)
      if (shadow.state === 'terminal' && shadow.result.mechanismVerdict === 'pass') {
        requireCompletedDecisionStates(stateBySessionId)
      }
    } catch {
      refreshCompletedRunRoles(ctx, manifest, progress)
      throw new ControlledLifecycleRunnerError('shadow-failed')
    } finally {
      stateBySessionId.clear()
    }
    if (shadow.state !== 'terminal') {
      throw new ControlledLifecycleRunnerError('shadow-failed')
    }
    if (
      shadow.completedTaskIds.length !== manifest.tasks.shadows.length
      || shadow.result.mechanismVerdict !== 'pass'
      || shadow.result.reasonCode !== 'all-shadow-runs-qualified'
      || shadow.result.promotionEligibility !== 'eligible-for-isolated-test-promotion'
    ) {
      lastClosedStage = 'shadow'
      throw new ControlledLifecycleRunnerError('shadow-failed')
    }
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    lastClosedStage = 'shadow'

    const shadowPlan = ctx.tianwenEvolution.getControlledSkillShadow(shadow.shadowId)
    if (shadowPlan === undefined || shadowPlan.mode !== 'isolated-test') {
      throw new ControlledLifecycleRunnerError('transition-failed')
    }
    let initialized
    try {
      initialized = ctx.tianwenEvolution.initializeControlledSkillScopePointer({
        shadowId: shadow.shadowId,
      })
    } catch {
      throw new ControlledLifecycleRunnerError('transition-failed')
    }
    let pointer = ctx.tianwenEvolution.getControlledSkillScopePointer(shadowPlan.scopeKey)
    if (
      initialized.revision !== 1
      || initialized.duplicate
      || pointer?.revision !== 1
      || pointer.activeVersionId !== shadowPlan.parentVersionId
    ) throw new ControlledLifecycleRunnerError('transition-failed')
    await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)

    const transitionReceipts = []
    for (const [index, task] of manifest.tasks.transitions.entries()) {
      await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
      setDecisionStates(stateBySessionId, [{
        taskId: task.taskId,
        hiddenExpectedChoice: task.hiddenExpectedChoice,
        sessionIds: [task.sessionId],
      }])
      const { taskId: _taskId, ...postCheckTask } = singleArmTask(manifest, task)
      let transition
      try {
        transition = await ctx.tianwenSkillEvaluation.runControlledSkillTransition({
          shadowId: shadow.shadowId,
          kind: task.kind,
          expectedRevision: index + 1,
          task: {
            ...postCheckTask,
            authorization: CONTROLLED_SKILL_LIFECYCLE_AUTHORIZATION_V1,
          },
        }, resolveVerdict)
        refreshCompletedRunRoles(ctx, manifest, progress)
        if (transition.state === 'terminal') requireCompletedDecisionStates(stateBySessionId)
      } catch {
        refreshCompletedRunRoles(ctx, manifest, progress)
        throw new ControlledLifecycleRunnerError('transition-failed')
      } finally {
        stateBySessionId.clear()
      }
      const expectedVersionId = task.kind === 'rollback'
        ? shadowPlan.parentVersionId
        : shadowPlan.candidateVersionId
      if (
        transition.state !== 'terminal'
        || transition.transition.state !== 'verified'
        || transition.transition.pointer.revision !== index + 2
        || transition.transition.pointer.activeVersionId !== expectedVersionId
      ) throw new ControlledLifecycleRunnerError('transition-failed')
      transitionReceipts.push(transition)
      await revalidateSeedBoundary(ctx, config, manifest, allSnapshots, initialFacts)
    }
    lastClosedStage = 'transitions'

    pointer = ctx.tianwenEvolution.getControlledSkillScopePointer(shadowPlan.scopeKey)
    const persisted = await ctx.sessionPersistence.list()
    const expectedSessionIds = prepared.sessionIds.toSorted()
    const actualSessionIds = persisted.map(header => String(header.id)).toSorted()
    const manifests = ctx.tianwenEvolution.listRunSkillManifests()
    const uses = ctx.tianwenEvolution.listRunSkillUses()
    const rootSkill = await ctx.skills.get(manifest.skills.parent.name)
    if (
      pointer?.revision !== 4
      || pointer.activeVersionId !== shadowPlan.candidateVersionId
      || actualSessionIds.length !== 25
      || actualSessionIds.join('\n') !== expectedSessionIds.join('\n')
      || ctx.agents.list().length !== 0
      || ctx.sessions.list().length !== 0
      || manifests.length !== 20
      || uses.length !== 20
      || new Set(manifests.map(item => item.runId)).size !== 20
      || new Set(uses.map(item => item.runId)).size !== 20
      || manifests.map(item => item.runId).toSorted().join('\n')
        !== uses.map(item => item.runId).toSorted().join('\n')
      || new Set(uses.map(item => item.acceptanceEvidenceId)).size !== 20
      || !sameSkill(rootSkill, manifest.skills.parent)
      || ctx.tianwenEvolution.getChampion() !== undefined
      || ctx.tianwenEvolution.listControlledSkillScopePointers().length !== 1
      || ctx.tianwenEvolution.listEvents().length !== 0
    ) throw new ControlledLifecycleRunnerError('identity-mismatch')
    const counts = await formalActivityCounts(ctx, manifest)
    const protocolRecord = ctx.tianwenEvolution.getControlledSkillEvalProtocol(protocol.protocolId)
    if (protocolRecord === undefined) throw new ControlledLifecycleRunnerError('identity-mismatch')
    return {
      schemaVersion: 'tianwen.controlled-real-skill-lifecycle.v1',
      status: 'passed',
      evidence: RECEIPT_EVIDENCE,
      digests: {
        activity: prepared.manifestDigest,
        installedArchive: manifest.installedArchiveDigest,
        manifest: prepared.manifestDigest,
        protocol: sha256(protocolRecord),
        evaluation: sha256(evaluators.result),
        shadow: sha256(shadow.result),
        transitionSet: sha256(transitionReceipts.map(item => item.transition)),
        finalPointer: sha256(pointer),
      },
      mechanism: {
        evaluation: 'pass',
        evaluationReason: 'all-gates-passed',
        shadow: 'pass',
        shadowEligibility: 'eligible-for-isolated-test-promotion',
        transitions: {
          promote: 'verified',
          rollback: 'verified',
          restore: 'verified',
        },
      },
      counts: {
        formalSessions: 25,
        roles: {
          seedRuns: 2,
          evaluationArms: 10,
          evaluators: 5,
          shadowRuns: 5,
          transitions: 3,
        },
        modelRequests: counts.modelRequests,
        toolCalls: counts.toolCalls,
        acceptanceEvidence: 20,
      },
      pointer: {
        revision: 4,
        versionDigest:
          `sha256:${pointer.activeVersionId.slice('skill-version:'.length)}`,
      },
      isolation: {
        ordinaryRootSkillUnchanged: true,
        legacyChampionUnchanged: true,
        otherControlledScopesUnchanged: true,
        realProductDataUntouched: true,
      },
    }
  } catch (error) {
    const failure = error instanceof ControlledLifecycleRunnerError
      ? error
      : new ControlledLifecycleRunnerError('internal-error')
    try {
      refreshCompletedRunRoles(ctx, manifest, progress)
    } catch {
      // Preserve the last facts already observed by this runner.
    }
    throw new ControlledLifecycleRunnerError(
      failure.code,
      failure.completedStage ?? lastClosedStage,
      failure.completedRoles ?? { ...progress },
    )
  } finally {
    disposeParent()
    disposeVerifier()
    disposeDecision()
  }
}

export const name = 'tianwen-controlled-lifecycle-runner'
export const inject = [
  'agentDefaultModel', 'agents', 'credentials', 'llm', 'loader', 'sessionPersistence',
  'sessions', 'skills', 'tianwenEvidence', 'tianwenEvolution', 'tianwenLearningIntake',
  'tianwenSkillEvaluation', 'tools',
] as const

export function apply(ctx: Context, config: ControlledLifecycleRunnerConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) {
    throw new Error('tianwen-controlled-lifecycle-runner: appExit is unavailable')
  }
  void runControlledLifecycle(ctx, config).then(
    receipt => {
      process.stdout.write(`${JSON.stringify(receipt)}\n`)
      exit(0)
    },
    error => {
      const failure = error instanceof ControlledLifecycleRunnerError
        ? error
        : new ControlledLifecycleRunnerError('internal-error')
      process.stdout.write(`${JSON.stringify(stoppedReceipt(config.manifestDigest, failure))}\n`)
      exit(1)
    },
  )
}
