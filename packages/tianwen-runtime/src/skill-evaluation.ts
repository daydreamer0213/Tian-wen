import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import {
  Service,
  SessionId,
  callConfigEquals,
  createUserMessage,
  defineTool,
  installModelSelection,
  isAgentLoopRequest,
  renderSkillContent,
  ScriptedAdapter,
} from '@tianwen/dsh-compat'
import type {
  AgentHandle,
  Context,
  GenerateOptions,
  LlmCallConfig,
  ModelSelection,
  SessionEvent,
  SkillDefinition,
  SkillRegistration,
  StreamChunk,
} from '@tianwen/dsh-compat'
import type { EvidenceRecord } from '@tianwen/evidence'
import {
  ControlledSkillActivationPreflightError,
  controlledSkillActivationRecoveredStop,
  controlledSkillTransitionPostCheck,
  parseRunControlledSkillTransitionInput,
  stoppedControlledSkillActivationReceipt,
  terminalControlledSkillActivationReceipt,
} from './controlled-skill-activation.js'
import type {
  ControlledSkillActivationRuntimeReceipt,
  ControlledSkillActivationRuntimeStop,
  RunControlledSkillTransitionInput,
} from './controlled-skill-activation.js'
import {
  CONTROLLED_SKILL_EVAL_RUBRIC,
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  controlledSkillShadowExecutionManifestDigest,
  controlledSkillTransitionExecutionManifestDigest,
  prepareControlledSkillPromotionRecommendation,
  prepareRunBinding,
  prepareRunSkillManifest,
  prepareControlledSkillEvaluationPlan,
  prepareControlledSkillShadowPlan,
  prepareSkillEvaluationPlan,
  sha256,
  STAGE4_SCRIPTED_PROVIDER,
} from '@tianwen/evolution'
import type {
  ControlledSkillActivationFailureReasonCode,
  GovernedSkillCandidateId,
  ControlledSkillEvalStopContract,
  ControlledSkillEvaluationId,
  ControlledSkillEvaluationBlindMap,
  ControlledSkillEvaluationObjective,
  ControlledSkillEvaluationObjectiveArm,
  ControlledSkillEvaluationPlan,
  ControlledSkillEvaluationResult,
  ControlledSkillEvalTaskId,
  ControlledSkillShadowId,
  ControlledSkillShadowPlan,
  ControlledSkillShadowResult,
  ControlledSkillShadowRun,
  ControlledSkillShadowTaskId,
  ControlledSkillShadowTaskInput,
  ControlledSkillTransition,
  ControlledSkillEvaluatorInconclusiveReasonCode,
  ControlledSkillEvaluatorObservation,
  ControlledSkillEvaluatorScores,
  RecordControlledSkillEvaluatorObservationInput,
  RunAcceptanceContract,
  Sha256Digest,
  SkillEvalCaseId,
  SkillEvalProtocolId,
  SkillEvaluationArmObservation,
  SkillEvaluationEnvironment,
  SkillEvaluationPlan,
  SkillEvaluationResult,
  TianwenRunId,
  OutcomeVerdict,
} from '@tianwen/evolution'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tianwenSkillEvaluation: TianwenSkillEvaluationService
  }
}

export interface ObserveSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly sessionId: string
  readonly preflight: LlmCallConfig
  readonly paired: LlmCallConfig
  readonly expectedSkillContent: string
  readonly skillName: string
  readonly requestOrdinal: number
  readonly maxModelRequests: number
}

export interface NormalizeSkillEvaluationRequestInput {
  readonly request: GenerateOptions
  readonly expectedSkillContent: string
  readonly skillName: string
}

export type SkillEvaluationRequestNormalization =
  | { readonly accepted: false; readonly reason: string }
  | {
      readonly accepted: true
      readonly injectionMessageIndex: number
      readonly fullRequestDigest: `sha256:${string}`
      readonly normalizedFirstRequestDigest: `sha256:${string}`
      readonly catalogTargetCount: 0 | 1
    }

export type SkillEvaluationRequestObservation = SkillEvaluationRequestNormalization

export type NormalizedSkillEvaluationRequestComparison =
  | {
      readonly accepted: false
      readonly reason: 'asymmetric-skill-catalog' | 'unequal-normalized-first-request'
    }
  | {
      readonly accepted: true
      readonly normalizedFirstRequestDigest: `sha256:${string}`
    }

const NORMALIZED_SESSION = '<paired-evaluation-session>'
const NORMALIZED_SKILL_CONTENT = '<selected-skill-content>'
const NORMALIZED_CATALOG_ENTRY = Object.freeze({ name: '<selected-skill-catalog-entry>' })
const STAGE4_SCRIPTED_MODEL = 'scripted' as const

export type ControlledSkillEvaluationPreflightCode =
  | 'candidate-chain-mismatch'
  | 'task-package-mismatch'
  | 'configured-route-mismatch'
  | 'retry-policy-mismatch'
  | 'tool-surface-mismatch'
  | 'session-not-empty'
  | 'persistence-unavailable'
  | 'scripted-boundary-mismatch'
  | 'root-skill-mismatch'

export class ControlledSkillEvaluationPreflightError extends Error {
  constructor(readonly code: ControlledSkillEvaluationPreflightCode) {
    super(`controlled Skill evaluation preflight failed: ${code}`)
    this.name = 'ControlledSkillEvaluationPreflightError'
  }
}

export type ControlledSkillShadowPreflightCode =
  | 'evaluation-not-eligible'
  | 'candidate-chain-mismatch'
  | 'task-package-mismatch'
  | 'configured-route-mismatch'
  | 'retry-policy-mismatch'
  | 'tool-surface-mismatch'
  | 'persistence-unavailable'
  | 'session-not-empty'
  | 'root-skill-mismatch'
  | 'scripted-boundary-mismatch'

export class ControlledSkillShadowPreflightError extends Error {
  constructor(readonly code: ControlledSkillShadowPreflightCode) {
    super(`controlled Skill Shadow preflight failed: ${code}`)
    this.name = 'ControlledSkillShadowPreflightError'
  }
}

export interface ControlledWorkspaceSnapshotEntry {
  readonly relativePath: string
  readonly contentDigest: Sha256Digest
  readonly size: number
}

export interface ControlledWorkspaceSnapshot {
  readonly schemaVersion: 'tianwen.controlled-workspace-snapshot.v1'
  readonly entries: readonly ControlledWorkspaceSnapshotEntry[]
}

export interface ControlledEvaluatorMaterialContract {
  readonly schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1'
  readonly source: 'final-completed-assistant-text' | 'recorded-decision-submission'
  readonly maxUtf8Bytes: number
}

export interface RunControlledSkillEvaluationTaskInput {
  readonly taskId: ControlledSkillEvalTaskId
  readonly goal: string
  readonly input: string
  readonly baselineWorkspaceRoot: string
  readonly candidateWorkspaceRoot: string
  readonly workspaceSnapshot: ControlledWorkspaceSnapshot
  readonly authorization: unknown
  readonly verifierContract: unknown
  readonly stopCondition: unknown
  readonly evaluatorMaterialContract: ControlledEvaluatorMaterialContract
  readonly baselineSessionId: string
  readonly candidateSessionId: string
  readonly evaluatorSessionId: string
}

export interface RunControlledSkillEvaluationArmsInput {
  readonly candidateId: GovernedSkillCandidateId
  readonly protocolId: SkillEvalProtocolId
  readonly tasks: readonly RunControlledSkillEvaluationTaskInput[]
}

export interface RunControlledSkillShadowTaskInput {
  readonly taskId: `shadow-task:${string}`
  readonly goal: string
  readonly input: string
  readonly workspaceRoot: string
  readonly workspaceSnapshot: ControlledWorkspaceSnapshot
  readonly authorization: unknown
  readonly verifierContract: unknown
  readonly stopCondition: unknown
  readonly acceptanceContract: RunAcceptanceContract
  readonly acceptanceSubject: unknown
  readonly allowedTools: readonly string[]
  readonly stopContract: ControlledSkillEvalStopContract
  readonly sessionId: string
}

export interface RunControlledSkillShadowInput {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly tasks: readonly RunControlledSkillShadowTaskInput[]
}

type ControlledOutcomeVerdictResolver = (
  sessionId: string,
) => 'met' | 'not-met' | undefined

export type ControlledSkillShadowStopReasonCode =
  | 'existing-partial-activity'
  | 'persistence-unavailable'
  | 'provider-failed'
  | 'timeout'
  | 'tool-limit-exceeded'
  | 'request-contract-mismatch'
  | 'skill-use-missing'
  | 'acceptance-subject-mismatch'
  | 'root-skill-drift'
  | 'run-fact-mismatch'

export interface ControlledSkillShadowStop {
  readonly taskId: ControlledSkillShadowTaskId
  readonly stage: 'candidate' | 'postflight'
  readonly reasonCode: ControlledSkillShadowStopReasonCode
}

export type ControlledSkillShadowRuntimeReceipt =
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1'
      readonly shadowId: ControlledSkillShadowId
      readonly state: 'terminal'
      readonly completedTaskIds: readonly ControlledSkillShadowTaskId[]
      readonly result: ControlledSkillShadowResult
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1'
      readonly shadowId: ControlledSkillShadowId
      readonly state: 'stopped'
      readonly completedTaskIds: readonly ControlledSkillShadowTaskId[]
      readonly stop: ControlledSkillShadowStop
    }

export type ControlledSkillEvaluatorPreflightCode =
  | 'task-package-mismatch'
  | 'evaluation-not-ready'
  | 'configured-route-mismatch'
  | 'retry-policy-mismatch'
  | 'persistence-unavailable'
  | 'material-mismatch'
  | 'identity-exposed'
  | 'session-not-empty'

export class ControlledSkillEvaluatorPreflightError extends Error {
  constructor(readonly code: ControlledSkillEvaluatorPreflightCode) {
    super(`controlled Skill evaluator preflight failed: ${code}`)
    this.name = 'ControlledSkillEvaluatorPreflightError'
  }
}

export interface RunControlledSkillEvaluatorTaskInput {
  readonly taskId: ControlledSkillEvalTaskId
  readonly goal: string
  readonly input: string
  readonly evaluatorMaterialContract: ControlledEvaluatorMaterialContract
}

export interface RunControlledSkillEvaluatorsInput {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly tasks: readonly RunControlledSkillEvaluatorTaskInput[]
}

export type ControlledSkillEvaluatorsStopReasonCode =
  | 'existing-partial-activity'
  | 'persistence-unavailable'
  | 'provider-failed'
  | 'timeout'
  | 'request-contract-mismatch'
  | 'identity-exposed'
  | 'score-not-submitted'
  | 'submission-invalid'
  | 'evidence-mismatch'
  | 'run-fact-mismatch'

export interface ControlledSkillEvaluatorsStop {
  readonly taskId: ControlledSkillEvalTaskId
  readonly stage: 'evaluator' | 'postflight'
  readonly reasonCode: ControlledSkillEvaluatorsStopReasonCode
}

export type ControlledSkillEvaluatorsReceipt =
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1'
      readonly evaluationId: ControlledSkillEvaluationId
      readonly state: 'terminal'
      readonly completedTaskIds: readonly ControlledSkillEvalTaskId[]
      readonly result: ControlledSkillEvaluationResult
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1'
      readonly evaluationId: ControlledSkillEvaluationId
      readonly state: 'stopped'
      readonly completedTaskIds: readonly ControlledSkillEvalTaskId[]
      readonly stop: ControlledSkillEvaluatorsStop
    }

export type ControlledSkillEvaluationArmsStopReasonCode =
  | 'existing-partial-activity'
  | 'agent-create-failed'
  | 'run-binding-failed'
  | 'agent-dispose-failed'
  | 'skill-identity-drift'
  | 'tool-surface-mismatch'
  | 'agent-context-mismatch'
  | 'persistence-unavailable'
  | 'provider-failed'
  | 'timeout'
  | 'tool-limit-exceeded'
  | 'request-contract-mismatch'
  | 'skill-use-missing'
  | 'acceptance-subject-mismatch'
  | 'evaluator-material-invalid'
  | 'workspace-drift'
  | 'root-skill-drift'
  | 'run-fact-mismatch'

export interface ControlledSkillEvaluationArmsStop {
  readonly stage: 'baseline' | 'candidate' | 'pair' | 'postflight'
  readonly taskId: ControlledSkillEvalTaskId
  readonly role: 'baseline' | 'candidate' | null
  readonly reasonCode: ControlledSkillEvaluationArmsStopReasonCode
}

export type ControlledSkillEvaluationArmsReceipt =
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1'
      readonly evaluationId: ControlledSkillEvaluationId
      readonly state: 'terminal'
      readonly completedTaskIds: readonly ControlledSkillEvalTaskId[]
      readonly result: ControlledSkillEvaluationResult
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1'
      readonly evaluationId: ControlledSkillEvaluationId
      readonly state: 'awaiting-evaluator'
      readonly completedTaskIds: readonly ControlledSkillEvalTaskId[]
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1'
      readonly evaluationId: ControlledSkillEvaluationId
      readonly state: 'stopped'
      readonly completedTaskIds: readonly ControlledSkillEvalTaskId[]
      readonly stop: ControlledSkillEvaluationArmsStop
    }

export type Stage4ScriptedFixtureEntry = readonly StreamChunk[] | Error

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function exactRuntimeKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value)
}

function isSafeSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/^[a-z]:[\\/]/iu.test(value)
    && !value.startsWith('/')
    && !value.includes('://')
}

function isLosslessJson(value: unknown, seen = new WeakSet<object>()): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isLosslessJson(item, seen))
    : (Object.getPrototypeOf(value) === Object.prototype
        || Object.getPrototypeOf(value) === null)
      && Reflect.ownKeys(value).every(key =>
        typeof key === 'string'
        && isLosslessJson((value as Record<string, unknown>)[key], seen))
  seen.delete(value)
  return valid
}

function parseControlledWorkspaceSnapshot(value: unknown): ControlledWorkspaceSnapshot {
  const source = record(value)
  if (
    source === undefined
    || !exactRuntimeKeys(source, ['schemaVersion', 'entries'])
    || source.schemaVersion !== 'tianwen.controlled-workspace-snapshot.v1'
    || !Array.isArray(source.entries)
  ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
  const entries = source.entries.map(item => {
    const entry = record(item)
    if (
      entry === undefined
      || !exactRuntimeKeys(entry, ['relativePath', 'contentDigest', 'size'])
      || typeof entry.relativePath !== 'string'
      || entry.relativePath.length === 0
      || entry.relativePath.includes('\\')
      || /^[a-z]:\//iu.test(entry.relativePath)
      || /[\u0000-\u001f\u007f]/u.test(entry.relativePath)
      || posix.isAbsolute(entry.relativePath)
      || posix.normalize(entry.relativePath) !== entry.relativePath
      || entry.relativePath.split('/').includes('..')
      || !isDigest(entry.contentDigest)
      || !Number.isSafeInteger(entry.size)
      || Number(entry.size) < 0
    ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
    return {
      relativePath: entry.relativePath,
      contentDigest: entry.contentDigest,
      size: Number(entry.size),
    }
  })
  if (entries.some((entry, index) =>
    index > 0 && entries[index - 1]!.relativePath.localeCompare(entry.relativePath) >= 0)) {
    throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
  }
  return {
    schemaVersion: 'tianwen.controlled-workspace-snapshot.v1',
    entries,
  }
}

function parseControlledMaterialContract(value: unknown): ControlledEvaluatorMaterialContract {
  const source = record(value)
  if (
    source === undefined
    || !exactRuntimeKeys(source, ['schemaVersion', 'source', 'maxUtf8Bytes'])
    || source.schemaVersion !== 'tianwen.controlled-evaluator-material-contract.v1'
    || (source.source !== 'final-completed-assistant-text'
      && source.source !== 'recorded-decision-submission')
    || !Number.isSafeInteger(source.maxUtf8Bytes)
    || Number(source.maxUtf8Bytes) < 1
    || Number(source.maxUtf8Bytes) > 65_536
  ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
  return {
    schemaVersion: 'tianwen.controlled-evaluator-material-contract.v1',
    source: source.source,
    maxUtf8Bytes: Number(source.maxUtf8Bytes),
  }
}

function parseControlledArmsInput(input: unknown): RunControlledSkillEvaluationArmsInput {
  const source = record(input)
  if (
    source === undefined
    || !exactRuntimeKeys(source, ['candidateId', 'protocolId', 'tasks'])
    || typeof source.candidateId !== 'string'
    || typeof source.protocolId !== 'string'
    || !Array.isArray(source.tasks)
    || source.tasks.length !== 5
  ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
  const workspaceRoots = new Set<string>()
  const sessionIds = new Set<string>()
  const tasks = source.tasks.map(item => {
    const task = record(item)
    if (
      task === undefined
      || !exactRuntimeKeys(task, [
        'taskId',
        'goal',
        'input',
        'baselineWorkspaceRoot',
        'candidateWorkspaceRoot',
        'workspaceSnapshot',
        'authorization',
        'verifierContract',
        'stopCondition',
        'evaluatorMaterialContract',
        'baselineSessionId',
        'candidateSessionId',
        'evaluatorSessionId',
      ])
      || typeof task.taskId !== 'string'
      || !/^eval-task:[a-z0-9][a-z0-9._-]{0,96}$/u.test(task.taskId)
      || typeof task.goal !== 'string'
      || task.goal.trim().length === 0
      || typeof task.input !== 'string'
      || task.input.trim().length === 0
      || typeof task.baselineWorkspaceRoot !== 'string'
      || typeof task.candidateWorkspaceRoot !== 'string'
      || !isAbsolute(task.baselineWorkspaceRoot)
      || !isAbsolute(task.candidateWorkspaceRoot)
      || !isSafeSessionId(task.baselineSessionId)
      || !isSafeSessionId(task.candidateSessionId)
      || !isSafeSessionId(task.evaluatorSessionId)
      || !isLosslessJson(task.authorization)
      || !isLosslessJson(task.verifierContract)
      || !isLosslessJson(task.stopCondition)
    ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
    for (const workspaceRoot of [task.baselineWorkspaceRoot, task.candidateWorkspaceRoot]) {
      const identity = process.platform === 'win32'
        ? resolve(workspaceRoot).toLowerCase()
        : resolve(workspaceRoot)
      if (workspaceRoots.has(identity)) {
        throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
      }
      workspaceRoots.add(identity)
    }
    for (const sessionId of [
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ]) {
      if (sessionIds.has(sessionId)) {
        throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
      }
      sessionIds.add(sessionId)
    }
    return {
      taskId: task.taskId as ControlledSkillEvalTaskId,
      goal: task.goal,
      input: task.input,
      baselineWorkspaceRoot: task.baselineWorkspaceRoot,
      candidateWorkspaceRoot: task.candidateWorkspaceRoot,
      workspaceSnapshot: parseControlledWorkspaceSnapshot(task.workspaceSnapshot),
      authorization: structuredClone(task.authorization),
      verifierContract: structuredClone(task.verifierContract),
      stopCondition: structuredClone(task.stopCondition),
      evaluatorMaterialContract: parseControlledMaterialContract(
        task.evaluatorMaterialContract,
      ),
      baselineSessionId: task.baselineSessionId,
      candidateSessionId: task.candidateSessionId,
      evaluatorSessionId: task.evaluatorSessionId,
    }
  })
  return {
    candidateId: source.candidateId as GovernedSkillCandidateId,
    protocolId: source.protocolId as SkillEvalProtocolId,
    tasks,
  }
}

function parseControlledShadowInput(input: unknown): RunControlledSkillShadowInput {
  const source = record(input)
  if (
    source === undefined
    || !exactRuntimeKeys(source, ['evaluationId', 'tasks'])
    || typeof source.evaluationId !== 'string'
    || !/^evaluation:[a-f0-9]{64}$/u.test(source.evaluationId)
    || !Array.isArray(source.tasks)
    || source.tasks.length !== 5
  ) throw new ControlledSkillShadowPreflightError('task-package-mismatch')
  const taskIds = new Set<string>()
  const sessionIds = new Set<string>()
  const workspaceRoots = new Set<string>()
  const tasks = source.tasks.map(item => {
    const task = record(item)
    if (
      task === undefined
      || !exactRuntimeKeys(task, [
        'taskId',
        'goal',
        'input',
        'workspaceRoot',
        'workspaceSnapshot',
        'authorization',
        'verifierContract',
        'stopCondition',
        'acceptanceContract',
        'acceptanceSubject',
        'allowedTools',
        'stopContract',
        'sessionId',
      ])
      || typeof task.taskId !== 'string'
      || !/^shadow-task:[a-z0-9][a-z0-9._-]{0,96}$/u.test(task.taskId)
      || taskIds.has(task.taskId)
      || typeof task.goal !== 'string'
      || task.goal.trim().length === 0
      || typeof task.input !== 'string'
      || task.input.trim().length === 0
      || typeof task.workspaceRoot !== 'string'
      || !isAbsolute(task.workspaceRoot)
      || !isSafeSessionId(task.sessionId)
      || sessionIds.has(task.sessionId)
      || !isLosslessJson(task.authorization)
      || !isLosslessJson(task.verifierContract)
      || !isLosslessJson(task.stopCondition)
      || !isLosslessJson(task.acceptanceSubject)
      || !Array.isArray(task.allowedTools)
      || task.allowedTools.length === 0
      || task.allowedTools.some(name =>
        typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u.test(name))
      || new Set(task.allowedTools).size !== task.allowedTools.length
    ) throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    const workspaceIdentity = process.platform === 'win32'
      ? resolve(task.workspaceRoot).toLowerCase()
      : resolve(task.workspaceRoot)
    if (workspaceRoots.has(workspaceIdentity)) {
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }
    const stopContract = record(task.stopContract)
    if (stopContract === undefined
      || !exactRuntimeKeys(stopContract, ['maxToolCalls', 'maxElapsedMs'])
      || !Number.isSafeInteger(stopContract.maxToolCalls)
      || Number(stopContract.maxToolCalls) < 1
      || Number(stopContract.maxToolCalls) > 256
      || !Number.isSafeInteger(stopContract.maxElapsedMs)
      || Number(stopContract.maxElapsedMs) < 1
      || Number(stopContract.maxElapsedMs) > 3_600_000) {
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }
    let workspaceManifest: ControlledWorkspaceSnapshot
    let acceptanceContract: RunAcceptanceContract
    try {
      workspaceManifest = parseControlledWorkspaceSnapshot(task.workspaceSnapshot)
      acceptanceContract = prepareRunBinding({
        goalRef: 'goal:controlled-skill-shadow-input-validation',
        taskRef: 'task:controlled-skill-shadow-input-validation',
        sessionId: 'session:controlled-skill-shadow-input-validation',
        scopeKey: 'scope:controlled-skill-shadow-input-validation',
        acceptanceContract: task.acceptanceContract as RunAcceptanceContract,
      }).acceptanceContract
    } catch {
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }
    taskIds.add(task.taskId)
    sessionIds.add(task.sessionId)
    workspaceRoots.add(workspaceIdentity)
    return {
      taskId: task.taskId as `shadow-task:${string}`,
      goal: task.goal,
      input: task.input,
      workspaceRoot: task.workspaceRoot,
      workspaceSnapshot: workspaceManifest,
      authorization: structuredClone(task.authorization),
      verifierContract: structuredClone(task.verifierContract),
      stopCondition: structuredClone(task.stopCondition),
      acceptanceContract,
      acceptanceSubject: structuredClone(task.acceptanceSubject),
      allowedTools: [...task.allowedTools] as string[],
      stopContract: {
        maxToolCalls: Number(stopContract.maxToolCalls),
        maxElapsedMs: Number(stopContract.maxElapsedMs),
      },
      sessionId: task.sessionId,
    }
  })
  return {
    evaluationId: source.evaluationId as ControlledSkillEvaluationId,
    tasks,
  }
}

function parseControlledEvaluatorsInput(input: unknown): RunControlledSkillEvaluatorsInput {
  const source = record(input)
  if (
    source === undefined
    || !exactRuntimeKeys(source, ['evaluationId', 'tasks'])
    || typeof source.evaluationId !== 'string'
    || !/^evaluation:[a-f0-9]{64}$/u.test(source.evaluationId)
    || !Array.isArray(source.tasks)
    || source.tasks.length !== 5
  ) throw new ControlledSkillEvaluatorPreflightError('task-package-mismatch')
  const taskIds = new Set<string>()
  const tasks = source.tasks.map(item => {
    const task = record(item)
    if (
      task === undefined
      || !exactRuntimeKeys(task, ['taskId', 'goal', 'input', 'evaluatorMaterialContract'])
      || typeof task.taskId !== 'string'
      || !/^eval-task:[a-z0-9][a-z0-9._-]{0,96}$/u.test(task.taskId)
      || taskIds.has(task.taskId)
      || typeof task.goal !== 'string'
      || task.goal.trim().length === 0
      || typeof task.input !== 'string'
      || task.input.trim().length === 0
    ) throw new ControlledSkillEvaluatorPreflightError('task-package-mismatch')
    taskIds.add(task.taskId)
    let evaluatorMaterialContract: ControlledEvaluatorMaterialContract
    try {
      evaluatorMaterialContract = parseControlledMaterialContract(task.evaluatorMaterialContract)
    } catch {
      throw new ControlledSkillEvaluatorPreflightError('task-package-mismatch')
    }
    return {
      taskId: task.taskId as ControlledSkillEvalTaskId,
      goal: task.goal,
      input: task.input,
      evaluatorMaterialContract,
    }
  })
  return {
    evaluationId: source.evaluationId as ControlledSkillEvaluationId,
    tasks,
  }
}

const CONTROLLED_EVALUATOR_DIMENSIONS = Object.freeze([
  'relevance',
  'correctnessReasoning',
  'clarityUsability',
  'scopeRestraint',
] as const)

const CONTROLLED_EVALUATOR_RUBRIC = Object.freeze({
  scoreAnchors: CONTROLLED_SKILL_EVAL_RUBRIC.scoreAnchors,
  dimensions: CONTROLLED_EVALUATOR_DIMENSIONS,
})

type ControlledEvaluatorSubmission =
  | {
      readonly status: 'scored'
      readonly insufficientMaterial: false
      readonly reasonCode: 'score-submitted'
      readonly scores: ControlledSkillEvaluatorScores
    }
  | {
      readonly status: 'inconclusive'
      readonly insufficientMaterial: true
      readonly reasonCode: ControlledSkillEvaluatorInconclusiveReasonCode
    }

function evaluatorDimensionScores(value: unknown) {
  const scores = record(value)
  if (scores === undefined || !exactRuntimeKeys(scores, CONTROLLED_EVALUATOR_DIMENSIONS)) {
    throw new TypeError('invalid controlled evaluator scores')
  }
  const result = {
    relevance: Number(scores.relevance),
    correctnessReasoning: Number(scores.correctnessReasoning),
    clarityUsability: Number(scores.clarityUsability),
    scopeRestraint: Number(scores.scopeRestraint),
  }
  if (Object.values(result).some(score => !Number.isSafeInteger(score) || score < 0 || score > 4)) {
    throw new TypeError('invalid controlled evaluator scores')
  }
  return result
}

function parseControlledEvaluatorSubmission(value: unknown): ControlledEvaluatorSubmission {
  const submission = record(value)
  if (submission === undefined) throw new TypeError('invalid controlled evaluator submission')
  if (submission.status === 'scored') {
    if (!exactRuntimeKeys(submission, [
      'status',
      'insufficientMaterial',
      'reasonCode',
      'scores',
    ]) || submission.insufficientMaterial !== false
      || submission.reasonCode !== 'score-submitted') {
      throw new TypeError('invalid controlled evaluator submission')
    }
    const scores = record(submission.scores)
    if (scores === undefined || !exactRuntimeKeys(scores, ['x', 'y'])) {
      throw new TypeError('invalid controlled evaluator submission')
    }
    return {
      status: 'scored',
      insufficientMaterial: false,
      reasonCode: 'score-submitted',
      scores: {
        x: evaluatorDimensionScores(scores.x),
        y: evaluatorDimensionScores(scores.y),
      },
    }
  }
  if (!exactRuntimeKeys(submission, [
    'status',
    'insufficientMaterial',
    'reasonCode',
  ]) || submission.status !== 'inconclusive'
    || submission.insufficientMaterial !== true
    || ![
      'material-missing',
      'identity-exposed',
      'objective-facts-incomplete',
      'provider-failed',
      'timeout',
      'score-not-submitted',
    ].includes(submission.reasonCode as string)) {
    throw new TypeError('invalid controlled evaluator submission')
  }
  return {
    status: 'inconclusive',
    insufficientMaterial: true,
    reasonCode: submission.reasonCode as ControlledSkillEvaluatorInconclusiveReasonCode,
  }
}

function serializedContainsControlledIdentity(
  serialized: string,
  identity: string,
): boolean {
  return identity.length > 0
    && (serialized.includes(identity)
      || serialized.includes(JSON.stringify(identity).slice(1, -1)))
}

function controlledForbiddenIdentityExposed(
  value: unknown,
  forbidden: ReadonlySet<string>,
): boolean {
  const serialized = JSON.stringify(value)
  return [...forbidden].some(identity =>
    serializedContainsControlledIdentity(serialized, identity))
}

function controlledIdentityExposed(
  value: unknown,
  forbidden: ReadonlySet<string>,
): boolean {
  return controlledForbiddenIdentityExposed(value, forbidden)
}

function controlledEvaluatorForbiddenIdentities(
  task: Pick<RunControlledSkillEvaluatorTaskInput, 'goal' | 'input'>,
  forbidden: ReadonlySet<string>,
): ReadonlySet<string> {
  const commonContext = JSON.stringify({ goal: task.goal, input: task.input })
  return new Set([...forbidden].filter(identity =>
    !serializedContainsControlledIdentity(commonContext, identity)))
}

function redactControlledEvaluatorCommonContext(
  value: unknown,
  context: Pick<RunControlledSkillEvaluatorTaskInput, 'goal' | 'input'>,
): unknown {
  if (typeof value === 'string') {
    return [context.goal, context.input].reduce((text, common) => text
      .replaceAll(common, '<controlled-common-context>')
      .replaceAll(
        JSON.stringify(common).slice(1, -1),
        '<controlled-common-context>',
      ), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactControlledEvaluatorCommonContext(item, context))
  }
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    redactControlledEvaluatorCommonContext(item, context),
  ]))
}

function evaluatorVisibleRequest(request: GenerateOptions) {
  return {
    system: request.system ?? null,
    messages: request.messages,
    tools: request.tools ?? [],
  }
}

function evaluatorRequestReason(
  request: GenerateOptions,
  state: ControlledEvaluatorState,
): 'request-contract-mismatch' | 'identity-exposed' | undefined {
  // The active evaluator Session owns this request. A process-local DSH marker
  // is not portable across installed host/Profile module instances.
  if (String(request.sessionId) !== state.sessionId
    || request.purpose !== undefined
    || !callConfigEquals(requestConfig(request), state.config)
    || request.tools?.length !== 1
    || request.tools[0]?.name !== 'submit_blind_evaluation') {
    return 'request-contract-mismatch'
  }
  if (request.messages.some(message => record(message.source)?.kind === 'skill-catalog')
    || controlledIdentityExposed(
      redactControlledEvaluatorCommonContext(
        evaluatorVisibleRequest(request),
        state.commonContext,
      ),
      state.forbidden,
    )) {
    return 'identity-exposed'
  }
  return undefined
}

function workspaceSnapshot(root: string): ControlledWorkspaceSnapshot {
  const entries: ControlledWorkspaceSnapshotEntry[] = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
      }
      if (stat.isDirectory()) {
        visit(path)
        continue
      }
      if (!stat.isFile()) {
        throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
      }
      const content = readFileSync(path)
      entries.push({
        relativePath: relative(root, path).split(sep).join('/'),
        contentDigest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
        size: content.byteLength,
      })
    }
  }
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
  }
  visit(root)
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return {
    schemaVersion: 'tianwen.controlled-workspace-snapshot.v1',
    entries,
  }
}

function normalizeControlledRequestOwnership(
  value: unknown,
  sessionId: string,
  workspaceRoot: string,
): unknown {
  const replacements = [
    [JSON.stringify(workspaceRoot).slice(1, -1), '<controlled-workspace>'],
    [workspaceRoot, '<controlled-workspace>'],
    [workspaceRoot.replaceAll('\\', '/'), '<controlled-workspace>'],
    [sessionId, '<controlled-session>'],
  ] as const
  if (typeof value === 'string') {
    return replacements.reduce(
      (text, [owned, normalized]) => text.replaceAll(owned, normalized),
      value,
    )
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeControlledRequestOwnership(
      item,
      sessionId,
      workspaceRoot,
    ))
  }
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    normalizeControlledRequestOwnership(item, sessionId, workspaceRoot),
  ]))
}

function isDedicatedChild(root: string, target: string): boolean {
  const child = relative(root, target)
  return child.length > 0
    && child !== '..'
    && !child.startsWith(`..${sep}`)
    && !isAbsolute(child)
}

function controlledFirstRequestDigest(
  requests: readonly GenerateOptions[],
  sessionId: string,
  config: LlmCallConfig,
  skill: SkillDefinition,
  workspaceRoot: string,
): Sha256Digest | undefined {
  // Requests reach this function only through the active controlled Session map.
  if (requests.length === 0 || requests.some(request =>
    String(request.sessionId) !== sessionId
    || request.purpose !== undefined
    || !callConfigEquals(requestConfig(request), config))) return undefined
  const first = requests[0]!
  const rendered = renderSkillContent(skill)
  if (first.messages.some(message => message.content.some(block =>
    block.type === 'text' && block.text === rendered))) return undefined
  const targetRows = first.messages.flatMap(message => catalogEntries(message) ?? [])
    .filter(entry => isTargetCatalogEntry(entry, skill.name))
  if (targetRows.length !== 1) return undefined
  return sha256(normalizeControlledRequestOwnership({
    ...first,
    sessionId: NORMALIZED_SESSION,
    messages: first.messages.map((message, index) => {
      const entries = catalogEntries(message)
      return {
        ...message,
        id: `<controlled-evaluation-message:${index}>`,
        ...(entries === undefined ? {} : {
          source: {
            ...record(message.source),
            entries: entries.map(entry =>
              isTargetCatalogEntry(entry, skill.name)
                ? NORMALIZED_CATALOG_ENTRY
                : entry),
          },
        }),
      }
    }),
  }, sessionId, workspaceRoot))
}

function controlledExecutionManifestDigest(
  plan: ControlledSkillEvaluationPlan,
  task: ControlledSkillEvaluationPlan['tasks'][number],
): Sha256Digest {
  return sha256({
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
}

function controlledEvaluatorMaterial(
  events: readonly SessionEvent[],
  contract: ControlledEvaluatorMaterialContract,
): Sha256Digest | undefined {
  const text = controlledEvaluatorMaterialText(events, contract)
  return text === undefined
    ? undefined
    : sha256({
        schemaVersion: 'tianwen.controlled-evaluator-material.v1',
        text,
      })
}

function controlledEvaluatorMaterialText(
  events: readonly SessionEvent[],
  contract: ControlledEvaluatorMaterialContract,
): string | undefined {
  const turnEnd = events.findLast(event => event.type === 'turn/end')
  if (turnEnd?.type !== 'turn/end' || turnEnd.data.reason.kind !== 'completed') {
    return undefined
  }
  let text: string | undefined
  if (contract.source === 'final-completed-assistant-text') {
    const message = events.findLast(event =>
      event.type === 'assistant/message'
      && event.surfaceOp === 'append'
      && event.data.turn === turnEnd.data.turn
      && event.seq < turnEnd.seq)
    if (message?.type !== 'assistant/message') return undefined
    text = message.data.message.content
      .flatMap(block => block.type === 'text' ? [block.text] : [])
      .join('\n')
  } else {
    const calls = events.filter((event): event is SessionEvent<'tool/call'> =>
      event.type === 'tool/call'
      && event.data.name === 'record_architecture_decision'
      && event.seq < turnEnd.seq)
    if (calls.length !== 1) return undefined
    let args: unknown
    try {
      args = JSON.parse(calls[0]!.data.arguments) as unknown
    } catch {
      return undefined
    }
    const submission = record(args)
    if (
      submission === undefined
      || !exactRuntimeKeys(submission, ['taskId', 'choice', 'explanation'])
      || typeof submission.taskId !== 'string'
      || typeof submission.choice !== 'string'
      || typeof submission.explanation !== 'string'
      || submission.taskId.length === 0
      || submission.choice.length === 0
      || submission.explanation.length === 0
    ) return undefined
    const result = events.find(event =>
      event.type === 'tool/result'
      && event.seq < turnEnd.seq
      && String(event.data.message.content[0]?.toolCallId)
        === String(calls[0]!.data.callId))
    if (result?.type !== 'tool/result'
      || result.data.message.content[0]?.isError === true) return undefined
    text = JSON.stringify({
      taskId: submission.taskId,
      choice: submission.choice,
      explanation: submission.explanation,
    })
  }
  if (text.length === 0 || Buffer.byteLength(text, 'utf8') > contract.maxUtf8Bytes) {
    return undefined
  }
  return text
}

function catalogEntries(message: unknown): readonly unknown[] | undefined {
  const source = record(record(message)?.source)
  return source?.kind === 'skill-catalog' && Array.isArray(source.entries)
    ? source.entries
    : undefined
}

function isTargetCatalogEntry(entry: unknown, skillName: string): boolean {
  return record(entry)?.name === skillName
}

function normalizeRequest(
  request: GenerateOptions,
  injectionMessageIndex: number,
  skillName: string,
): unknown {
  return {
    ...request,
    sessionId: NORMALIZED_SESSION,
    messages: request.messages.map((message, index) => {
      const entries = catalogEntries(message)
      if (index !== injectionMessageIndex && entries === undefined) {
        return { ...message, id: `<paired-evaluation-message:${index}>` }
      }
      return {
        ...message,
        id: `<paired-evaluation-message:${index}>`,
        ...(index === injectionMessageIndex
          ? { content: [{ type: 'text', text: NORMALIZED_SKILL_CONTENT }] }
          : {}),
        ...(entries === undefined
          ? {}
          : {
              source: {
                ...record(message.source),
                entries: entries.map(entry =>
                  isTargetCatalogEntry(entry, skillName) ? NORMALIZED_CATALOG_ENTRY : entry),
              },
            }),
      }
    }),
  }
}

export function normalizeSkillEvaluationRequest(
  input: NormalizeSkillEvaluationRequestInput,
): SkillEvaluationRequestNormalization {
  const injectionIndexes = input.request.messages.flatMap((message, index) =>
    message.role === 'user'
    && message.content.length === 1
    && message.content[0]?.type === 'text'
    && message.content[0].text === input.expectedSkillContent
      ? [index]
      : [])
  if (injectionIndexes.length !== 1) {
    return { accepted: false, reason: 'skill-injection-mismatch' }
  }
  const catalogTargetCount = input.request.messages
    .flatMap(message => catalogEntries(message) ?? [])
    .filter(entry => isTargetCatalogEntry(entry, input.skillName)).length
  if (catalogTargetCount > 1) {
    return { accepted: false, reason: 'duplicate-skill-catalog-entry' }
  }
  return {
    accepted: true,
    injectionMessageIndex: injectionIndexes[0]!,
    fullRequestDigest: sha256(input.request),
    normalizedFirstRequestDigest: sha256(normalizeRequest(
      input.request,
      injectionIndexes[0]!,
      input.skillName,
    )),
    catalogTargetCount: catalogTargetCount === 1 ? 1 : 0,
  }
}

export function compareNormalizedSkillEvaluationRequests(
  baseline: SkillEvaluationRequestNormalization,
  candidate: SkillEvaluationRequestNormalization,
): NormalizedSkillEvaluationRequestComparison {
  if (!baseline.accepted || !candidate.accepted
    || baseline.catalogTargetCount !== candidate.catalogTargetCount) {
    return { accepted: false, reason: 'asymmetric-skill-catalog' }
  }
  if (baseline.normalizedFirstRequestDigest !== candidate.normalizedFirstRequestDigest) {
    return { accepted: false, reason: 'unequal-normalized-first-request' }
  }
  return {
    accepted: true,
    normalizedFirstRequestDigest: baseline.normalizedFirstRequestDigest,
  }
}

function requestConfig(request: GenerateOptions): LlmCallConfig {
  return {
    provider: request.provider,
    model: request.model,
    ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    ...(request.stop === undefined ? {} : { stop: request.stop }),
  }
}

function isSkillDefinition(skill: SkillRegistration): skill is SkillRegistration & SkillDefinition {
  if (
    typeof skill.name !== 'string'
    || typeof skill.description !== 'string'
    || typeof skill.content !== 'string'
    || typeof skill.source !== 'string'
    || typeof skill.provider !== 'string'
    || skill.invocation === undefined
    || typeof skill.invocation.modelInvocable !== 'boolean'
    || typeof skill.invocation.userInvocable !== 'boolean'
  ) return false
  return true
}

function sameSkillVersion(
  skill: SkillRegistration,
  expectedVersionId: SkillEvaluationPlan['parentVersionId'],
): boolean {
  if (!isSkillDefinition(skill)) return false
  return prepareRunSkillManifest({
    runId: `run:${sha256({ expectedVersionId, skill }).slice('sha256:'.length)}` as TianwenRunId,
    skill,
  }).parentVersionId === expectedVersionId
}

export function observeSkillEvaluationRequest(
  input: ObserveSkillEvaluationRequestInput,
): SkillEvaluationRequestObservation {
  if (!isAgentLoopRequest(input.request)) {
    return { accepted: false, reason: 'not-agent-loop' }
  }
  if (String(input.request.sessionId) !== input.sessionId) {
    return { accepted: false, reason: 'wrong-session' }
  }
  if (input.request.purpose !== undefined) {
    return { accepted: false, reason: 'non-ordinary-purpose' }
  }
  if (
    !Number.isSafeInteger(input.requestOrdinal)
    || input.requestOrdinal !== 1
    || input.requestOrdinal > input.maxModelRequests
  ) {
    return { accepted: false, reason: 'wrong-order-or-budget' }
  }
  const actual = requestConfig(input.request)
  if (!callConfigEquals(actual, input.preflight) || !callConfigEquals(actual, input.paired)) {
    return { accepted: false, reason: 'call-config-mismatch' }
  }
  return normalizeSkillEvaluationRequest(input)
}

export class TianwenSkillEvaluationService extends Service {
  static inject = [
    'agents',
    'llm',
    'sessions',
    'skills',
    'tianwenEvidence',
    'tianwenEvolution',
    'tianwenLearningIntake',
    'tools',
  ] as const

  constructor(ctx: Context) {
    super(ctx, 'tianwenSkillEvaluation')
    ctx.on('llm/stream', (request, next) => {
      const sessionId = String(request.sessionId)
      const evaluator = this.evaluators.get(sessionId)
      if (evaluator !== undefined) {
        const reasonCode = evaluatorRequestReason(request, evaluator)
        if (reasonCode !== undefined) {
          evaluator.reasonCode = reasonCode
          throw new Error('controlled evaluator request rejected')
        }
        evaluator.requests.push(request)
      }
      const requests = this.requests.get(sessionId)
      if (requests !== undefined) requests.push(request)
      return next()
    })
  }

  private readonly requests = new Map<string, GenerateOptions[]>()
  private readonly evaluators = new Map<string, ControlledEvaluatorState>()

  async runControlledSkillTransition(
    input: RunControlledSkillTransitionInput,
    resolveVerdict?: ControlledOutcomeVerdictResolver,
  ): Promise<ControlledSkillActivationRuntimeReceipt> {
    const parsed = parseRunControlledSkillTransitionInput(input)
    const evolution = this.ctx.tianwenEvolution
    const shadow = evolution.getControlledSkillShadow(parsed.shadowId)
    const shadowResult = evolution.getControlledSkillShadowResult(parsed.shadowId)
    const evaluation = shadow === undefined
      ? undefined
      : evolution.getControlledSkillEvaluation(shadow.evaluationId)
    const evaluationResult = shadow === undefined
      ? undefined
      : evolution.getControlledSkillEvaluationResult(shadow.evaluationId)
    const candidate = shadow === undefined
      ? undefined
      : evolution.getSkillCandidate(shadow.candidateId)
    const parentManifest = shadow === undefined
      ? undefined
      : evolution.listRunSkillManifests()
          .find(manifest => manifest.parentVersionId === shadow.parentVersionId)
    if (shadow === undefined
      || shadowResult === undefined
      || evaluation === undefined
      || evaluationResult === undefined
      || candidate === undefined
      || parentManifest === undefined
      || candidate.status !== 'recorded'
      || candidate.payload.name !== parentManifest.parent.name
      || candidate.payload.invocation.modelInvocable !== true
      || parentManifest.parent.invocation.modelInvocable !== true) {
      throw new ControlledSkillActivationPreflightError('shadow-not-eligible')
    }
    let recommendation: ReturnType<typeof prepareControlledSkillPromotionRecommendation>
    try {
      recommendation = prepareControlledSkillPromotionRecommendation(
        evaluation,
        evaluationResult,
        shadow,
        shadowResult,
        candidate,
        sha256(parentManifest.parent),
      )
    } catch {
      throw new ControlledSkillActivationPreflightError('shadow-not-eligible')
    }

    const defaultModel = this.ctx.get('agentDefaultModel') as {
      currentSelection(): ModelSelection
    } | undefined
    if (defaultModel === undefined) {
      throw new ControlledSkillActivationPreflightError('configured-route-mismatch')
    }
    let selection: ModelSelection
    let resolved: LlmCallConfig
    try {
      selection = defaultModel.currentSelection()
      resolved = await this.ctx.llm.resolveCallConfig(selection)
    } catch {
      throw new ControlledSkillActivationPreflightError('configured-route-mismatch')
    }
    if (resolved.provider !== shadow.execution.providerId
      || resolved.model !== shadow.execution.modelId
      || sha256(resolved) !== shadow.execution.callConfigDigest) {
      throw new ControlledSkillActivationPreflightError('configured-route-mismatch')
    }
    let retryPolicy: ReturnType<typeof this.ctx.llm.providerRetryPolicy>
    try {
      retryPolicy = this.ctx.llm.providerRetryPolicy(resolved.provider)
    } catch {
      throw new ControlledSkillActivationPreflightError('retry-policy-mismatch')
    }
    if (retryPolicy.mode !== 'normal'
      || retryPolicy.maxRetries !== 0
      || sha256(retryPolicy) !== shadow.execution.retryPolicyDigest) {
      throw new ControlledSkillActivationPreflightError('retry-policy-mismatch')
    }

    let actualWorkspace: ControlledWorkspaceSnapshot
    try {
      actualWorkspace = workspaceSnapshot(parsed.task.workspaceRoot)
    } catch {
      throw new ControlledSkillActivationPreflightError('task-package-mismatch')
    }
    if (sha256(actualWorkspace) !== sha256(parsed.task.workspaceSnapshot)) {
      throw new ControlledSkillActivationPreflightError('task-package-mismatch')
    }
    let schemas: ReturnType<typeof this.ctx.tools.schemas>
    try {
      schemas = this.ctx.tools.schemas()
        .filter(schema => parsed.task.allowedTools.includes(schema.name))
        .toSorted((left, right) => left.name.localeCompare(right.name))
    } catch {
      throw new ControlledSkillActivationPreflightError('tool-surface-mismatch')
    }
    if (!parsed.task.allowedTools.includes('skill')
      || !parsed.task.allowedTools.includes(parsed.task.acceptanceContract.toolName)
      || schemas.length !== parsed.task.allowedTools.length
      || schemas.some((schema, index) => schema.name !== parsed.task.allowedTools[index])) {
      throw new ControlledSkillActivationPreflightError('tool-surface-mismatch')
    }
    const postCheck = controlledSkillTransitionPostCheck(parsed.task, sha256(schemas))
    const sourceInputDigests = new Set([
      ...evaluation.tasks.map(task => task.inputDigest),
      ...shadow.tasks.map(task => task.inputDigest),
    ])
    const sourceWorkspaceDigests = new Set([
      ...evaluation.tasks.map(task => task.workspaceSnapshotDigest),
      ...shadow.tasks.map(task => task.workspaceSnapshotDigest),
    ])
    const sourceSessionIds = new Set([
      ...evaluation.tasks.flatMap(task => [
        task.baseline.sessionId,
        task.candidate.sessionId,
        task.evaluatorSessionId,
      ]),
      ...shadow.tasks.map(task => task.sessionId),
    ])
    if (sourceInputDigests.has(postCheck.inputDigest)
      || sourceWorkspaceDigests.has(postCheck.workspaceSnapshotDigest)
      || sourceSessionIds.has(postCheck.sessionId)) {
      throw new ControlledSkillActivationPreflightError('task-package-mismatch')
    }

    const persistence = this.ctx.get('sessionPersistence') as {
      list(): Promise<readonly { readonly id: string }[]>
    } | undefined
    if (persistence === undefined) {
      throw new ControlledSkillActivationPreflightError('persistence-unavailable')
    }
    let persisted: readonly { readonly id: string }[]
    try {
      persisted = await persistence.list()
    } catch {
      throw new ControlledSkillActivationPreflightError('persistence-unavailable')
    }

    const transitions = evolution.listControlledSkillTransitions()
      .filter(transition => transition.shadowId === shadow.shadowId)
    const existing = transitions.find(transition =>
      transition.kind === parsed.kind
      && transition.previousPointer.revision === parsed.expectedRevision)
    const otherTransitions = transitions.filter(transition => transition !== existing)
    if (otherTransitions.some(transition =>
      transition.postCheck.inputDigest === postCheck.inputDigest
      || transition.postCheck.workspaceSnapshotDigest === postCheck.workspaceSnapshotDigest
      || transition.postCheck.sessionId === postCheck.sessionId)) {
      throw new ControlledSkillActivationPreflightError('task-package-mismatch')
    }
    const pointer = evolution.getControlledSkillScopePointer(shadow.scopeKey)
    const expectedRevision = parsed.kind === 'promote' ? 1 : parsed.kind === 'rollback' ? 2 : 3
    const expectedPriorKinds = parsed.kind === 'promote'
      ? []
      : parsed.kind === 'rollback'
        ? ['promote']
        : ['promote', 'rollback']
    const prior = otherTransitions
      .filter(transition => transition.previousPointer.revision < parsed.expectedRevision)
      .toSorted((left, right) =>
        left.previousPointer.revision - right.previousPointer.revision)
    if (parsed.expectedRevision !== expectedRevision
      || prior.length !== expectedPriorKinds.length
      || prior.some((transition, index) =>
        transition.kind !== expectedPriorKinds[index]
        || evolution.getControlledSkillTransitionReceipt(transition.transitionId)?.state
          !== 'verified')) {
      throw new ControlledSkillActivationPreflightError('pointer-mismatch')
    }
    const previousPointer = existing?.previousPointer ?? pointer
    if (previousPointer === undefined) {
      throw new ControlledSkillActivationPreflightError('pointer-mismatch')
    }
    if (existing !== undefined) {
      const { runId: _runId, ...existingPostCheck } = existing.postCheck
      if (sha256(existingPostCheck) !== sha256(postCheck)
        || sha256(existing.source) !== sha256(recommendation.source)) {
        throw new ControlledSkillActivationPreflightError('pointer-mismatch')
      }
    }

    let rootSkill: SkillRegistration | undefined
    try {
      rootSkill = await this.ctx.skills.get(parentManifest.parent.name, {
        cwd: parsed.task.workspaceRoot,
      })
    } catch {
      throw new ControlledSkillActivationPreflightError('root-skill-mismatch')
    }
    if (rootSkill === undefined || !sameSkillVersion(rootSkill, shadow.parentVersionId)) {
      throw new ControlledSkillActivationPreflightError('root-skill-mismatch')
    }
    const targetVersionId = parsed.kind === 'rollback'
      ? shadow.parentVersionId
      : shadow.candidateVersionId
    const targetSkill = targetVersionId === shadow.candidateVersionId
      ? { ...candidate.payload, provider: parentManifest.resolvedProvider } as SkillDefinition
      : { ...parentManifest.parent, provider: parentManifest.resolvedProvider } as SkillDefinition
    const targetContentDigest = sha256(targetSkill.content)
    try {
      const targetManifest = prepareRunSkillManifest({
        runId: existing?.postCheck.runId ?? `run:${sha256({
          shadowId: parsed.shadowId,
          kind: parsed.kind,
          preflight: true,
        }).slice('sha256:'.length)}` as TianwenRunId,
        skill: targetSkill,
      })
      if (targetManifest.parentVersionId !== targetVersionId
        || targetManifest.contentDigest !== targetContentDigest) {
        throw new Error('active payload mismatch')
      }
    } catch {
      throw new ControlledSkillActivationPreflightError('pointer-mismatch')
    }

    if (resolved.provider === 'tianwen-controlled-scripted') {
      const fixtureRoot = process.env.TIANWEN_DSH_PROBE_ROOT
      if (shadow.mode !== 'isolated-test'
        || shadow.evidenceClaim !== 'controlled-synthetic-mechanism'
        || fixtureRoot === undefined
        || !isAbsolute(fixtureRoot)
        || !isDedicatedChild(fixtureRoot, parsed.task.workspaceRoot)
        || !parsed.task.sessionId.startsWith('session:controlled-activation:fixture:')) {
        throw new ControlledSkillActivationPreflightError('scripted-boundary-mismatch')
      }
    }

    const occupied = persisted.some(header => String(header.id) === parsed.task.sessionId)
      || this.ctx.sessions.get(SessionId(parsed.task.sessionId)) !== undefined
      || this.ctx.agents.get(SessionId(parsed.task.sessionId)) !== undefined
    if (existing !== undefined) {
      const receipt = evolution.getControlledSkillTransitionReceipt(existing.transitionId)
      if (receipt?.state === 'verified') {
        return terminalControlledSkillActivationReceipt(existing, receipt)
      }
      if (receipt?.state === 'recovered') {
        return stoppedControlledSkillActivationReceipt(existing.transitionId, existing.kind, {
          ...controlledSkillActivationRecoveredStop(
            receipt.reasonCode ?? 'run-fact-mismatch',
          ),
        }, receipt)
      }
      if (receipt?.state !== 'pending-post-check'
        || pointer === undefined
        || sha256(pointer) !== sha256(existing.targetPointer)) {
        throw new ControlledSkillActivationPreflightError('pointer-mismatch')
      }
      if (occupied
        || evolution.getRunSkillManifest(existing.postCheck.runId) !== undefined
        || evolution.getRunSkillUse(existing.postCheck.runId) !== undefined) {
        return stoppedControlledSkillActivationReceipt(existing.transitionId, existing.kind, {
          stage: 'activation',
          reasonCode: 'existing-partial-activity',
        }, receipt)
      }
    } else {
      const expectedActiveVersion = parsed.kind === 'rollback'
        ? shadow.candidateVersionId
        : shadow.parentVersionId
      const expectedPayloadDigest = parsed.kind === 'rollback'
        ? shadow.candidatePayloadDigest
        : shadow.parentPayloadDigest
      if (pointer === undefined
        || pointer.revision !== parsed.expectedRevision
        || pointer.activeVersionId !== expectedActiveVersion
        || pointer.payloadDigest !== expectedPayloadDigest) {
        throw new ControlledSkillActivationPreflightError('pointer-mismatch')
      }
      if (occupied) throw new ControlledSkillActivationPreflightError('session-not-empty')
    }

    let transition = existing
    if (transition === undefined) {
      let startedId: string | undefined
      try {
        startedId = evolution.beginControlledSkillTransition({
          shadowId: parsed.shadowId,
          kind: parsed.kind,
          expectedRevision: parsed.expectedRevision,
          postCheck,
        }).transitionId
      } catch {
        // Resolve a deterministic transition commit by reading its exact identity below.
      }
      transition = startedId === undefined
        ? evolution.listControlledSkillTransitions().find(item =>
            item.shadowId === parsed.shadowId
            && item.kind === parsed.kind
            && item.previousPointer.revision === parsed.expectedRevision)
        : evolution.getControlledSkillTransition(startedId as ControlledSkillTransition['transitionId'])
      if (transition === undefined) {
        throw new ControlledSkillActivationPreflightError('persistence-unavailable')
      }
    }
    const committedPointer = evolution.getControlledSkillScopePointer(shadow.scopeKey)
    const { runId: _runId, ...committedPostCheck } = transition.postCheck
    if (sha256(committedPostCheck) !== sha256(postCheck)
      || sha256(transition.source) !== sha256(recommendation.source)
      || committedPointer === undefined
      || sha256(committedPointer) !== sha256(transition.targetPointer)) {
      return this.recoverControlledSkillTransition(
        transition,
        { stage: 'postflight', reasonCode: 'pointer-drift' },
      )
    }

    const guard: ControlledArmGuardState = {
      sessionId: transition.postCheck.sessionId,
      allowedTools: new Set(transition.postCheck.allowedTools),
      maxToolCalls: transition.postCheck.stopContract.maxToolCalls,
      active: false,
      deadline: 0,
      toolCalls: 0,
      usedToolNames: new Set(),
    }
    let handle: AgentHandle | undefined
    try {
      try {
        handle = await this.ctx.agents.create({
          sessionId: SessionId(transition.postCheck.sessionId),
          meta: { cwd: parsed.task.workspaceRoot },
          agentOptions: requestAgentOptions(resolved),
          setup: async agentCtx => {
            installModelSelection(agentCtx, { current: selection, assembled: undefined })
            agentCtx.tools.presentAs('native')
            agentCtx.tools.restrict({ allow: transition!.postCheck.allowedTools })
            agentCtx.tools.guard(execution => controlledArmGuard(execution, guard))
            await agentCtx.inject(['skills'], scopedCtx => {
              scopedCtx.skills.register(targetSkill)
            })
          },
        })
      } catch {
        return this.recoverControlledSkillTransition(
          transition,
          { stage: 'activation', reasonCode: 'agent-create-failed' },
        )
      }
      guard.agent = handle.agent
      let scopedSkill: SkillDefinition | undefined
      await handle.agent.ctx.inject(['skills'], async scopedCtx => {
        scopedSkill = await scopedCtx.skills.get(targetSkill.name, {
          cwd: parsed.task.workspaceRoot,
          scope: handle!.agent,
        })
      })
      const scopedSchemas = handle.agent.ctx.tools.schemas(handle.agent)
        .toSorted((left, right) => left.name.localeCompare(right.name))
      const currentRoot = await this.ctx.skills.get(parentManifest.parent.name, {
        cwd: parsed.task.workspaceRoot,
      })
      if (scopedSkill === undefined
        || !sameSkillVersion(scopedSkill, transition.targetPointer.activeVersionId)
        || currentRoot === undefined
        || !sameSkillVersion(currentRoot, shadow.parentVersionId)
        || sha256(scopedSchemas) !== transition.postCheck.toolSchemaDigest
        || handle.agent.session.header.cwd !== parsed.task.workspaceRoot
        || sha256(handle.agent.options) !== sha256(requestAgentOptions(resolved))) {
        return this.recoverControlledSkillTransition(
          transition,
          { stage: 'postflight', reasonCode: 'root-skill-drift' },
        )
      }

      let boundRunId: TianwenRunId | undefined
      try {
        await handle.agent.ctx.inject(['skills'], async scopedCtx => {
          const binding = await this.ctx.tianwenLearningIntake.bindRunWithSkill(
            handle!.agent,
            {
              goalRef: `goal:controlled-skill-transition:${transition!.transitionId}`,
              taskRef: `task:controlled-skill-transition:${transition!.kind}:post-check`,
              scopeKey: transition!.source.scopeKey,
              acceptanceContract: transition!.postCheck.acceptanceContract,
              acceptanceSubjectDigest: transition!.postCheck.acceptanceSubjectDigest,
            },
            targetSkill.name,
            scopedCtx.skills,
          )
          boundRunId = binding.runId
        })
      } catch {
        return this.recoverControlledSkillTransition(
          transition,
          { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
        )
      }
      const binding = evolution.getRunBinding(transition.postCheck.runId)
      const manifest = evolution.getRunSkillManifest(transition.postCheck.runId)
      if (boundRunId !== transition.postCheck.runId
        || binding === undefined
        || sha256(binding) !== sha256(transition.runBinding)
        || manifest === undefined
        || manifest.parentVersionId !== transition.targetPointer.activeVersionId
        || manifest.contentDigest !== targetContentDigest) {
        return this.recoverControlledSkillTransition(
          transition,
          { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
        )
      }

      const activity = await this.runControlledActivity({
        task: parsed.task,
        planned: transition.postCheck,
        skill: targetSkill,
        handle,
        guard,
      }, transition.postCheck.runId, resolved, parsed.task.workspaceRoot, resolveVerdict)
      if (activity.activity === undefined) {
        return this.recoverControlledSkillTransition(transition, {
          stage: 'activation',
          reasonCode: activationFailureReason(activity.reasonCode),
        })
      }
      if (activity.activity.outcome !== 'met') {
        return this.recoverControlledSkillTransition(transition, {
          stage: 'activation',
          reasonCode: activity.activity.outcome === 'not-met'
            ? 'post-check-not-met'
            : 'post-check-inconclusive',
        })
      }

      try {
        const finalWorkspace = workspaceSnapshot(parsed.task.workspaceRoot)
        const finalRoot = await this.ctx.skills.get(parentManifest.parent.name, {
          cwd: parsed.task.workspaceRoot,
        })
        let finalScoped: SkillDefinition | undefined
        await handle.agent.ctx.inject(['skills'], async scopedCtx => {
          finalScoped = await scopedCtx.skills.get(targetSkill.name, {
            cwd: parsed.task.workspaceRoot,
            scope: handle!.agent,
          })
        })
        const finalPointer = evolution.getControlledSkillScopePointer(shadow.scopeKey)
        const finalBinding = evolution.getRunBinding(transition.postCheck.runId)
        const finalManifest = evolution.getRunSkillManifest(transition.postCheck.runId)
        const finalUse = evolution.getRunSkillUse(transition.postCheck.runId)
        if (sha256(finalWorkspace) !== transition.postCheck.workspaceSnapshotDigest) {
          return this.recoverControlledSkillTransition(
            transition,
            { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
          )
        }
        if (finalRoot === undefined
          || !sameSkillVersion(finalRoot, shadow.parentVersionId)
          || finalScoped === undefined
          || !sameSkillVersion(finalScoped, transition.targetPointer.activeVersionId)) {
          return this.recoverControlledSkillTransition(
            transition,
            { stage: 'postflight', reasonCode: 'root-skill-drift' },
          )
        }
        if (finalPointer === undefined
          || sha256(finalPointer) !== sha256(transition.targetPointer)) {
          return this.recoverControlledSkillTransition(
            transition,
            { stage: 'postflight', reasonCode: 'pointer-drift' },
          )
        }
        if (finalBinding === undefined
          || sha256(finalBinding) !== sha256(transition.runBinding)
          || finalManifest === undefined
          || finalManifest.parentVersionId !== transition.targetPointer.activeVersionId
          || finalManifest.contentDigest !== targetContentDigest
          || finalUse === undefined
          || finalUse.parentVersionId !== transition.targetPointer.activeVersionId
          || !activity.activity.usedToolNames.includes('skill')
          || !activity.activity.usedToolNames.includes(
            transition.postCheck.acceptanceContract.toolName,
          )
          || activity.activity.usage.modelRequests < 1
          || activity.activity.usage.toolCalls < activity.activity.usedToolNames.length
          || activity.activity.usage.toolCalls > transition.postCheck.stopContract.maxToolCalls
          || activity.activity.usage.elapsedMs > transition.postCheck.stopContract.maxElapsedMs) {
          throw new Error('controlled activation postflight mismatch')
        }
      } catch {
        return this.recoverControlledSkillTransition(
          transition,
          { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
        )
      }

      const run = {
        ...activity.activity,
        executionManifestDigest: controlledSkillTransitionExecutionManifestDigest(transition),
      }
      try {
        evolution.completeControlledSkillTransition({
          transitionId: transition.transitionId,
          run,
        })
      } catch {
        // Resolve a completion commit before deciding whether recovery is allowed.
      }
      const completed = evolution.getControlledSkillTransitionReceipt(transition.transitionId)
      if (completed?.state === 'verified') {
        return terminalControlledSkillActivationReceipt(transition, completed)
      }
      if (completed?.state === 'recovered') {
        return stoppedControlledSkillActivationReceipt(
          transition.transitionId,
          transition.kind,
          controlledSkillActivationRecoveredStop(
            completed.reasonCode ?? 'run-fact-mismatch',
          ),
          completed,
        )
      }
      return this.recoverControlledSkillTransition(
        transition,
        { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
      )
    } catch {
      return this.recoverControlledSkillTransition(
        transition,
        { stage: 'postflight', reasonCode: 'run-fact-mismatch' },
      )
    } finally {
      if (handle !== undefined) {
        this.requests.delete(String(handle.agent.id))
        try {
          await handle.dispose()
        } catch {
          // Disposal cannot rewrite an already durable verified/recovered transition.
        }
      }
    }
  }

  private recoverControlledSkillTransition(
    transition: ControlledSkillTransition,
    stop: ControlledSkillActivationRuntimeStop & {
      readonly reasonCode: ControlledSkillActivationFailureReasonCode
    },
  ): ControlledSkillActivationRuntimeReceipt {
    const evolution = this.ctx.tianwenEvolution
    try {
      evolution.recordControlledSkillActivationFailed({
        transitionId: transition.transitionId,
        reasonCode: stop.reasonCode,
      })
    } catch {
      // Resolve commit-unknown strictly by reading the governed receipt.
    }
    const receipt = evolution.getControlledSkillTransitionReceipt(transition.transitionId)
    if (receipt?.state === 'verified') {
      return terminalControlledSkillActivationReceipt(transition, receipt)
    }
    if (receipt?.state === 'recovered') {
      return stoppedControlledSkillActivationReceipt(
        transition.transitionId,
        transition.kind,
        controlledSkillActivationRecoveredStop(
          receipt.reasonCode ?? stop.reasonCode,
        ),
        receipt,
      )
    }
    return stoppedControlledSkillActivationReceipt(
      transition.transitionId,
      transition.kind,
      { stage: 'recovery', reasonCode: 'recovery-unknown' },
      receipt,
    )
  }

  async runControlledShadow(
    input: RunControlledSkillShadowInput,
    resolveVerdict?: ControlledOutcomeVerdictResolver,
  ): Promise<ControlledSkillShadowRuntimeReceipt> {
    const parsed = parseControlledShadowInput(input)
    const evaluation = this.ctx.tianwenEvolution.getControlledSkillEvaluation(
      parsed.evaluationId,
    )
    const evaluationResult = this.ctx.tianwenEvolution
      .getControlledSkillEvaluationResult(parsed.evaluationId)
    if (
      evaluation === undefined
      || evaluationResult === undefined
      || evaluationResult.mechanismVerdict !== 'pass'
      || evaluationResult.reasonCode !== 'all-gates-passed'
      || evaluationResult.shadowEligibility === 'ineligible'
    ) {
      throw new ControlledSkillShadowPreflightError('evaluation-not-eligible')
    }
    const candidate = this.ctx.tianwenEvolution.getSkillCandidate(evaluation.candidateId)
    const parentManifest = this.ctx.tianwenEvolution.listRunSkillManifests()
      .find(manifest => manifest.parentVersionId === evaluation.parentVersionId)
    if (
      candidate === undefined
      || parentManifest === undefined
      || candidate.status !== 'recorded'
      || candidate.candidateId !== evaluation.candidateId
      || candidate.parentVersionId !== evaluation.parentVersionId
      || candidate.payloadDigest !== evaluation.candidatePayloadDigest
      || sha256(parentManifest.parent) !== evaluation.parentPayloadDigest
      || candidate.payload.name !== parentManifest.parent.name
      || candidate.payload.invocation.modelInvocable !== true
      || parentManifest.parent.invocation.modelInvocable !== true
    ) throw new ControlledSkillShadowPreflightError('candidate-chain-mismatch')
    const objectives = this.ctx.tianwenEvolution
      .listControlledSkillEvaluationObjectives(evaluation.evaluationId)
    const observations = this.ctx.tianwenEvolution
      .listControlledSkillEvaluatorObservations(evaluation.evaluationId)
    if (
      objectives.length !== evaluation.tasks.length
      || observations.length !== evaluation.tasks.length
      || objectives.some((objective, index) =>
        objective.taskId !== evaluation.tasks[index]?.taskId
        || objective.objectiveVerdict !== 'pass')
      || observations.some((observation, index) =>
        observation.taskId !== evaluation.tasks[index]?.taskId
        || observation.status !== 'scored')
    ) throw new ControlledSkillShadowPreflightError('evaluation-not-eligible')

    const defaultModel = this.ctx.get('agentDefaultModel') as {
      currentSelection(): ModelSelection
    } | undefined
    if (defaultModel === undefined) {
      throw new ControlledSkillShadowPreflightError('configured-route-mismatch')
    }
    let selection: ModelSelection
    let resolved: LlmCallConfig
    try {
      selection = defaultModel.currentSelection()
      resolved = await this.ctx.llm.resolveCallConfig(selection)
    } catch {
      throw new ControlledSkillShadowPreflightError('configured-route-mismatch')
    }
    if (
      resolved.provider !== evaluation.execution.providerId
      || resolved.model !== evaluation.execution.modelId
      || sha256(resolved) !== evaluation.execution.callConfigDigest
    ) throw new ControlledSkillShadowPreflightError('configured-route-mismatch')
    let retryPolicy: ReturnType<typeof this.ctx.llm.providerRetryPolicy>
    try {
      retryPolicy = this.ctx.llm.providerRetryPolicy(resolved.provider)
    } catch {
      throw new ControlledSkillShadowPreflightError('retry-policy-mismatch')
    }
    if (
      retryPolicy.mode !== 'normal'
      || retryPolicy.maxRetries !== 0
      || sha256(retryPolicy) !== evaluation.execution.retryPolicyDigest
    ) throw new ControlledSkillShadowPreflightError('retry-policy-mismatch')

    const plannedTasks: ControlledSkillShadowTaskInput[] = []
    try {
      for (const task of parsed.tasks) {
        if (task.stopContract.maxToolCalls < 2
          || sha256(workspaceSnapshot(task.workspaceRoot))
          !== sha256(task.workspaceSnapshot)) {
          throw new ControlledSkillShadowPreflightError('task-package-mismatch')
        }
        const allowedTools = [...task.allowedTools]
          .sort((left, right) => left.localeCompare(right))
        let schemas: ReturnType<typeof this.ctx.tools.schemas>
        try {
          schemas = this.ctx.tools.schemas()
            .filter(schema => allowedTools.includes(schema.name))
            .toSorted((left, right) => left.name.localeCompare(right.name))
        } catch {
          throw new ControlledSkillShadowPreflightError('tool-surface-mismatch')
        }
        if (
          !allowedTools.includes('skill')
          || !allowedTools.includes(task.acceptanceContract.toolName)
          || schemas.length !== allowedTools.length
          || schemas.some((schema, index) => schema.name !== allowedTools[index])
        ) throw new ControlledSkillShadowPreflightError('tool-surface-mismatch')
        plannedTasks.push({
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
        })
      }
    } catch (error) {
      if (error instanceof ControlledSkillShadowPreflightError) throw error
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }

    const openInput = {
      evaluationId: evaluation.evaluationId,
      tasks: plannedTasks,
    }
    let expectedPlan: ControlledSkillShadowPlan
    try {
      expectedPlan = prepareControlledSkillShadowPlan(
        openInput,
        evaluation,
        evaluationResult,
        candidate,
        sha256(parentManifest.parent),
        objectives,
        observations,
      )
    } catch {
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }

    const persistence = this.ctx.get('sessionPersistence') as {
      list(): Promise<readonly { readonly id: string }[]>
    } | undefined
    if (persistence === undefined) {
      throw new ControlledSkillShadowPreflightError('persistence-unavailable')
    }
    let persisted: readonly { readonly id: string }[]
    try {
      persisted = await persistence.list()
    } catch {
      throw new ControlledSkillShadowPreflightError('persistence-unavailable')
    }
    const sessionIds = parsed.tasks.map(task => task.sessionId)
    const targets = new Set(sessionIds)
    const occupied = persisted.some(header => targets.has(String(header.id)))
      || sessionIds.some(id =>
        this.ctx.sessions.get(SessionId(id)) !== undefined
        || this.ctx.agents.get(SessionId(id)) !== undefined)
    const existingPlan = this.ctx.tianwenEvolution.getControlledSkillShadow(
      expectedPlan.shadowId,
    )
    if (existingPlan !== undefined && sha256(existingPlan) !== sha256(expectedPlan)) {
      throw new ControlledSkillShadowPreflightError('task-package-mismatch')
    }
    const existingResult = this.ctx.tianwenEvolution.getControlledSkillShadowResult(
      expectedPlan.shadowId,
    )
    if (existingResult !== undefined) {
      return terminalControlledShadowReceipt(
        expectedPlan,
        existingResult.runs.map(run => run.taskId),
        existingResult,
      )
    }
    const hasRunActivity = expectedPlan.tasks.some(task =>
      this.ctx.tianwenEvolution.getRunBinding(task.runId) !== undefined
      || this.ctx.tianwenEvolution.getRunSkillManifest(task.runId) !== undefined
      || this.ctx.tianwenEvolution.getRunSkillUse(task.runId) !== undefined)
    if (existingPlan !== undefined && (occupied || hasRunActivity)) {
      return stoppedControlledShadowReceipt(expectedPlan, [], {
        taskId: expectedPlan.tasks[0]!.taskId,
        stage: 'postflight',
        reasonCode: 'existing-partial-activity',
      })
    }
    if (occupied) {
      throw new ControlledSkillShadowPreflightError('session-not-empty')
    }

    const candidateSkill = {
      ...candidate.payload,
      provider: parentManifest.resolvedProvider,
    } as SkillDefinition
    try {
      const manifest = prepareRunSkillManifest({
        runId: expectedPlan.tasks[0]!.runId,
        skill: candidateSkill,
      })
      if (manifest.parentVersionId !== expectedPlan.candidateVersionId) {
        throw new ControlledSkillShadowPreflightError('candidate-chain-mismatch')
      }
      for (const task of parsed.tasks) {
        const rootSkill = await this.ctx.skills.get(parentManifest.parent.name, {
          cwd: task.workspaceRoot,
        })
        if (rootSkill === undefined
          || !sameSkillVersion(rootSkill, candidate.parentVersionId)) {
          throw new ControlledSkillShadowPreflightError('root-skill-mismatch')
        }
      }
    } catch (error) {
      if (error instanceof ControlledSkillShadowPreflightError) throw error
      throw new ControlledSkillShadowPreflightError('root-skill-mismatch')
    }

    if (resolved.provider === 'tianwen-controlled-scripted') {
      const fixtureRoot = process.env.TIANWEN_DSH_PROBE_ROOT
      if (
        expectedPlan.mode !== 'isolated-test'
        || expectedPlan.evidenceClaim !== 'controlled-synthetic-mechanism'
        || fixtureRoot === undefined
        || !isAbsolute(fixtureRoot)
        || parsed.tasks.some(task =>
          !isDedicatedChild(fixtureRoot, task.workspaceRoot)
          || !task.sessionId.startsWith('session:controlled-shadow:fixture:'))
      ) throw new ControlledSkillShadowPreflightError('scripted-boundary-mismatch')
    }

    const prepared: PreparedControlledSkillShadowRun[] = []
    const completedTaskIds: ControlledSkillShadowTaskId[] = []
    const runs: ControlledSkillShadowRun[] = []
    const agentOptions = requestAgentOptions(resolved)
    try {
      for (const [index, task] of parsed.tasks.entries()) {
        const planned = expectedPlan.tasks[index]!
        const guard: ControlledArmGuardState = {
          sessionId: planned.sessionId,
          allowedTools: new Set(planned.allowedTools),
          maxToolCalls: planned.stopContract.maxToolCalls,
          active: false,
          deadline: 0,
          toolCalls: 0,
          usedToolNames: new Set(),
        }
        const handle = await this.ctx.agents.create({
          sessionId: SessionId(planned.sessionId),
          meta: { cwd: task.workspaceRoot },
          agentOptions,
          setup: async agentCtx => {
            installModelSelection(agentCtx, {
              current: selection,
              assembled: undefined,
            })
            agentCtx.tools.presentAs('native')
            agentCtx.tools.restrict({ allow: planned.allowedTools })
            agentCtx.tools.guard(execution => controlledArmGuard(execution, guard))
            await agentCtx.inject(['skills'], scopedCtx => {
              scopedCtx.skills.register(candidateSkill)
            })
          },
        })
        guard.agent = handle.agent
        prepared.push({ task, planned, skill: candidateSkill, handle, guard })
      }

      for (const item of prepared) {
        let scopedSkill: SkillDefinition | undefined
        await item.handle.agent.ctx.inject(['skills'], async scopedCtx => {
          scopedSkill = await scopedCtx.skills.get(item.skill.name, {
            cwd: item.task.workspaceRoot,
            scope: item.handle.agent,
          })
        })
        const rootSkill = await this.ctx.skills.get(parentManifest.parent.name, {
          cwd: item.task.workspaceRoot,
        })
        const schemas = item.handle.agent.ctx.tools.schemas(item.handle.agent)
          .toSorted((left, right) => left.name.localeCompare(right.name))
        if (
          scopedSkill === undefined
          || !sameSkillVersion(scopedSkill, expectedPlan.candidateVersionId)
          || rootSkill === undefined
          || !sameSkillVersion(rootSkill, expectedPlan.parentVersionId)
          || sha256(schemas) !== item.planned.toolSchemaDigest
          || item.handle.agent.session.header.cwd !== item.task.workspaceRoot
          || sha256(item.handle.agent.options) !== sha256(agentOptions)
        ) throw new ControlledSkillShadowPreflightError('root-skill-mismatch')
      }

      try {
        this.ctx.tianwenEvolution.openControlledSkillShadow(openInput)
      } catch {
        // Resolve an exact commit-unknown write by reading the deterministic plan.
      }
      const plan = this.ctx.tianwenEvolution.getControlledSkillShadow(expectedPlan.shadowId)
      if (plan === undefined || sha256(plan) !== sha256(expectedPlan)) {
        return stoppedControlledShadowReceipt(expectedPlan, [], {
          taskId: expectedPlan.tasks[0]!.taskId,
          stage: 'postflight',
          reasonCode: 'run-fact-mismatch',
        })
      }

      for (const item of prepared) {
        let boundRunId: TianwenRunId | undefined
        await item.handle.agent.ctx.inject(['skills'], async scopedCtx => {
          const binding = await this.ctx.tianwenLearningIntake.bindRunWithSkill(
            item.handle.agent,
            {
              goalRef: `goal:controlled-skill-shadow:${plan.shadowId}`,
              taskRef: `task:${item.planned.taskId}:candidate`,
              scopeKey: plan.scopeKey,
              acceptanceContract: item.planned.acceptanceContract,
              acceptanceSubjectDigest: item.planned.acceptanceSubjectDigest,
            },
            item.skill.name,
            scopedCtx.skills,
          )
          boundRunId = binding.runId
        })
        if (
          boundRunId !== item.planned.runId
          || this.ctx.tianwenEvolution.getRunSkillManifest(item.planned.runId) === undefined
        ) return stoppedControlledShadowReceipt(plan, [], {
          taskId: item.planned.taskId,
          stage: 'postflight',
          reasonCode: 'run-fact-mismatch',
        })
      }

      for (const item of prepared) {
        const activity = await this.runControlledActivity(
          item,
          item.planned.runId,
          resolved,
          item.task.workspaceRoot,
          resolveVerdict,
        )
        if (activity.activity === undefined) {
          return stoppedControlledShadowReceipt(plan, completedTaskIds, {
            taskId: item.planned.taskId,
            stage: 'candidate',
            reasonCode: activity.reasonCode,
          })
        }
        try {
          const rootSkill = await this.ctx.skills.get(parentManifest.parent.name, {
            cwd: item.task.workspaceRoot,
          })
          let scopedSkill: SkillDefinition | undefined
          await item.handle.agent.ctx.inject(['skills'], async scopedCtx => {
            scopedSkill = await scopedCtx.skills.get(candidateSkill.name, {
              cwd: item.task.workspaceRoot,
              scope: item.handle.agent,
            })
          })
          if (
            sha256(workspaceSnapshot(item.task.workspaceRoot))
              !== item.planned.workspaceSnapshotDigest
            || rootSkill === undefined
            || !sameSkillVersion(rootSkill, plan.parentVersionId)
            || scopedSkill === undefined
            || !sameSkillVersion(scopedSkill, plan.candidateVersionId)
          ) throw new Error('controlled Shadow root drift')
        } catch {
          return stoppedControlledShadowReceipt(plan, completedTaskIds, {
            taskId: item.planned.taskId,
            stage: 'postflight',
            reasonCode: 'root-skill-drift',
          })
        }
        const run: ControlledSkillShadowRun = {
          taskId: item.planned.taskId,
          ...activity.activity,
          executionManifestDigest: controlledSkillShadowExecutionManifestDigest(
            plan,
            item.planned,
          ),
        }
        runs.push(run)
        completedTaskIds.push(item.planned.taskId)
        if (run.outcome !== 'met' || runs.length === plan.tasks.length) {
          try {
            this.ctx.tianwenEvolution.recordControlledSkillShadowResult({
              shadowId: plan.shadowId,
              runs,
            })
          } catch {
            // Resolve an exact result commit without a second model attempt.
          }
          const result = this.ctx.tianwenEvolution.getControlledSkillShadowResult(
            plan.shadowId,
          )
          if (result === undefined) {
            return stoppedControlledShadowReceipt(plan, completedTaskIds, {
              taskId: item.planned.taskId,
              stage: 'postflight',
              reasonCode: 'run-fact-mismatch',
            })
          }
          return terminalControlledShadowReceipt(plan, completedTaskIds, result)
        }
      }
      return stoppedControlledShadowReceipt(plan, completedTaskIds, {
        taskId: plan.tasks.at(-1)!.taskId,
        stage: 'postflight',
        reasonCode: 'run-fact-mismatch',
      })
    } catch (error) {
      return stoppedControlledShadowReceipt(expectedPlan, completedTaskIds, {
        taskId: expectedPlan.tasks[completedTaskIds.length]?.taskId
          ?? expectedPlan.tasks.at(-1)!.taskId,
        stage: 'postflight',
        reasonCode: error instanceof ControlledSkillShadowPreflightError
          && error.code === 'root-skill-mismatch'
          ? 'root-skill-drift'
          : 'run-fact-mismatch',
      })
    } finally {
      let disposeFailed = false
      for (const item of prepared.reverse()) {
        this.requests.delete(String(item.handle.agent.id))
        try {
          await item.handle.dispose()
        } catch {
          disposeFailed = true
        }
      }
      if (disposeFailed) {
        return stoppedControlledShadowReceipt(expectedPlan, completedTaskIds, {
          taskId: expectedPlan.tasks.at(-1)!.taskId,
          stage: 'postflight',
          reasonCode: 'run-fact-mismatch',
        })
      }
    }
  }

  async runControlledEvaluators(
    input: RunControlledSkillEvaluatorsInput,
  ): Promise<ControlledSkillEvaluatorsReceipt> {
    const parsed = parseControlledEvaluatorsInput(input)
    const plan = this.ctx.tianwenEvolution.getControlledSkillEvaluation(parsed.evaluationId)
    if (plan === undefined) {
      throw new ControlledSkillEvaluatorPreflightError('evaluation-not-ready')
    }
    if (parsed.tasks.some((task, index) => {
      const frozen = plan.tasks[index]
      return frozen === undefined
        || task.taskId !== frozen.taskId
        || sha256(task.goal) !== frozen.goalDigest
        || sha256(task.input) !== frozen.inputDigest
        || sha256(task.evaluatorMaterialContract) !== frozen.evaluatorMaterialContractDigest
    })) throw new ControlledSkillEvaluatorPreflightError('task-package-mismatch')
    let observations = this.ctx.tianwenEvolution
      .listControlledSkillEvaluatorObservations(plan.evaluationId)
    const result = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
      plan.evaluationId,
    )
    if (result !== undefined) {
      return terminalControlledEvaluatorsReceipt(
        plan,
        observations.map(observation => observation.taskId),
        result,
      )
    }
    const objectives = this.ctx.tianwenEvolution
      .listControlledSkillEvaluationObjectives(plan.evaluationId)
    const objectiveTerminal = objectives.some(objective => objective.objectiveVerdict !== 'pass')
      || (objectives.length === plan.tasks.length
        && objectives.slice(0, 2).every(objective =>
          objective.comparison !== 'candidate-better'))
    if (objectiveTerminal) {
      try {
        this.ctx.tianwenEvolution.recordControlledSkillEvaluationResult({
          evaluationId: plan.evaluationId,
        })
      } catch {
        // A commit-unknown write is resolved by the read immediately below.
      }
      const terminal = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        plan.evaluationId,
      )
      if (terminal === undefined) {
        throw new ControlledSkillEvaluatorPreflightError('evaluation-not-ready')
      }
      return terminalControlledEvaluatorsReceipt(plan, [], terminal)
    }
    if (objectives.length !== plan.tasks.length
      || objectives.some((objective, index) =>
        objective.taskId !== plan.tasks[index]?.taskId
        || objective.objectiveVerdict !== 'pass')
      || objectives.slice(0, 2).every(objective =>
        objective.comparison !== 'candidate-better')) {
      throw new ControlledSkillEvaluatorPreflightError('evaluation-not-ready')
    }

    let blindMap = this.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
      plan.evaluationId,
    )
    if (observations.some(observation => observation.status === 'inconclusive')
      || (observations.length === plan.tasks.length
        && observations.every(observation => observation.status === 'scored'))) {
      try {
        this.ctx.tianwenEvolution.recordControlledSkillEvaluationResult({
          evaluationId: plan.evaluationId,
        })
      } catch {
        // Resolve the exact result commit below without another evaluator attempt.
      }
      const terminal = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        plan.evaluationId,
      )
      if (terminal !== undefined) {
        return terminalControlledEvaluatorsReceipt(
          plan,
          observations.map(observation => observation.taskId),
          terminal,
        )
      }
    }
    if (observations.length > 0) {
      return stoppedControlledEvaluatorsReceipt(
        plan,
        observations.map(observation => observation.taskId),
        {
          taskId: plan.tasks[observations.length]?.taskId ?? plan.tasks.at(-1)!.taskId,
          stage: 'postflight',
          reasonCode: 'existing-partial-activity',
        },
      )
    }

    const defaultModel = this.ctx.get('agentDefaultModel') as {
      currentSelection(): ModelSelection
    } | undefined
    if (defaultModel === undefined) {
      throw new ControlledSkillEvaluatorPreflightError('configured-route-mismatch')
    }
    let selection: ModelSelection
    let resolved: LlmCallConfig
    try {
      selection = defaultModel.currentSelection()
      resolved = await this.ctx.llm.resolveCallConfig(selection)
    } catch {
      throw new ControlledSkillEvaluatorPreflightError('configured-route-mismatch')
    }
    if (resolved.provider !== plan.execution.providerId
      || resolved.model !== plan.execution.modelId
      || sha256(resolved) !== plan.execution.callConfigDigest) {
      throw new ControlledSkillEvaluatorPreflightError('configured-route-mismatch')
    }
    let retryPolicy: ReturnType<typeof this.ctx.llm.providerRetryPolicy>
    try {
      retryPolicy = this.ctx.llm.providerRetryPolicy(resolved.provider)
    } catch {
      throw new ControlledSkillEvaluatorPreflightError('retry-policy-mismatch')
    }
    if (retryPolicy.mode !== 'normal'
      || retryPolicy.maxRetries !== 0
      || sha256(retryPolicy) !== plan.execution.retryPolicyDigest) {
      throw new ControlledSkillEvaluatorPreflightError('retry-policy-mismatch')
    }

    const persistence = this.ctx.get('sessionPersistence') as {
      list(): Promise<readonly { readonly id: string }[]>
      inspect(id: SessionId): Promise<{
        readonly meta: { readonly id: string; readonly cwd?: string }
        readonly events: readonly SessionEvent[]
      }>
    } | undefined
    if (persistence === undefined) {
      throw new ControlledSkillEvaluatorPreflightError('persistence-unavailable')
    }
    let persisted: readonly { readonly id: string }[]
    try {
      persisted = await persistence.list()
    } catch {
      throw new ControlledSkillEvaluatorPreflightError('persistence-unavailable')
    }
    const persistedIds = new Set(persisted.map(header => String(header.id)))
    const candidate = this.ctx.tianwenEvolution.getSkillCandidate(plan.candidateId)
    const parentManifest = this.ctx.tianwenEvolution.listRunSkillManifests()
      .find(manifest => manifest.parentVersionId === plan.parentVersionId)
    if (candidate === undefined || parentManifest === undefined) {
      throw new ControlledSkillEvaluatorPreflightError('evaluation-not-ready')
    }
    const forbidden = new Set<string>([
      plan.evaluationId,
      plan.protocolId,
      plan.candidateId,
      plan.parentVersionId,
      plan.parentPayloadDigest,
      plan.candidatePayloadDigest,
      plan.scopeKey,
      plan.execution.providerId,
      plan.execution.modelId,
      parentManifest.parent.name,
      parentManifest.parent.content,
      candidate.payload.name,
      candidate.payload.content,
      ...objectives.flatMap(objective => [
        objective.baseline.runId,
        objective.baseline.sessionId,
        objective.baseline.skillVersionId,
        objective.baseline.contentDigest,
        objective.candidate.runId,
        objective.candidate.sessionId,
        objective.candidate.skillVersionId,
        objective.candidate.contentDigest,
      ]),
    ])
    const materials = new Map<ControlledSkillEvalTaskId, ControlledEvaluatorPairMaterial>()
    for (const [index, objective] of objectives.entries()) {
      const task = parsed.tasks[index]!
      let baselineMaterial: ControlledEvaluatorMaterial | undefined
      let candidateMaterial: ControlledEvaluatorMaterial | undefined
      let evaluatorWorkspaceRoot: string | undefined
      for (const role of ['baseline', 'candidate'] as const) {
        const arm = objective[role]
        if (!persistedIds.has(arm.sessionId)) {
          throw new ControlledSkillEvaluatorPreflightError('material-mismatch')
        }
        let inspection: Awaited<ReturnType<typeof persistence.inspect>>
        try {
          inspection = await persistence.inspect(SessionId(arm.sessionId))
        } catch {
          throw new ControlledSkillEvaluatorPreflightError('persistence-unavailable')
        }
        const text = controlledEvaluatorMaterialText(
          inspection.events,
          task.evaluatorMaterialContract,
        )
        if (String(inspection.meta.id) !== arm.sessionId
          || inspection.meta.cwd === undefined
          || text === undefined
          || sha256({
            schemaVersion: 'tianwen.controlled-evaluator-material.v1',
            text,
          }) !== arm.evaluatorMaterialDigest) {
          throw new ControlledSkillEvaluatorPreflightError('material-mismatch')
        }
        forbidden.add(inspection.meta.cwd)
        const roleWorkspaceRoot = dirname(inspection.meta.cwd)
        if (evaluatorWorkspaceRoot === undefined) {
          evaluatorWorkspaceRoot = roleWorkspaceRoot
        } else if (evaluatorWorkspaceRoot !== roleWorkspaceRoot) {
          throw new ControlledSkillEvaluatorPreflightError('material-mismatch')
        }
        const material = { text, digest: arm.evaluatorMaterialDigest }
        if (role === 'baseline') baselineMaterial = material
        else candidateMaterial = material
      }
      if (baselineMaterial === undefined
        || candidateMaterial === undefined
        || evaluatorWorkspaceRoot === undefined) {
        throw new ControlledSkillEvaluatorPreflightError('material-mismatch')
      }
      materials.set(task.taskId, {
        baseline: baselineMaterial,
        candidate: candidateMaterial,
        workspaceRoot: evaluatorWorkspaceRoot,
      })
    }
    if (parsed.tasks.some(task => controlledIdentityExposed({
      x: materials.get(task.taskId)!.baseline.text,
      y: materials.get(task.taskId)!.candidate.text,
    }, controlledEvaluatorForbiddenIdentities(task, forbidden)))) {
      throw new ControlledSkillEvaluatorPreflightError('identity-exposed')
    }

    const evaluatorSessionIds = plan.tasks.map(task => task.evaluatorSessionId)
    const evaluatorOccupied = evaluatorSessionIds.some(sessionId =>
      persistedIds.has(sessionId)
      || this.ctx.sessions.get(SessionId(sessionId)) !== undefined
      || this.ctx.agents.get(SessionId(sessionId)) !== undefined)
    if (evaluatorOccupied) {
      if (blindMap !== undefined) {
        return stoppedControlledEvaluatorsReceipt(plan, [], {
          taskId: plan.tasks[0]!.taskId,
          stage: 'postflight',
          reasonCode: 'existing-partial-activity',
        })
      }
      throw new ControlledSkillEvaluatorPreflightError('session-not-empty')
    }

    try {
      this.ctx.tianwenEvolution.freezeControlledSkillEvaluationBlindMap({
        evaluationId: plan.evaluationId,
      })
    } catch {
      // The deterministic map may already have committed; verify by reading it.
    }
    blindMap = this.ctx.tianwenEvolution.getControlledSkillEvaluationBlindMap(
      plan.evaluationId,
    )
    if (blindMap === undefined) {
      return stoppedControlledEvaluatorsReceipt(plan, [], {
        taskId: plan.tasks[0]!.taskId,
        stage: 'postflight',
        reasonCode: 'run-fact-mismatch',
      })
    }

    const prepared: PreparedControlledEvaluator[] = []
    const completedTaskIds: ControlledSkillEvalTaskId[] = []
    const inheritedTools = this.ctx.tools.schemas().map(schema => schema.name)
    const agentOptions = requestAgentOptions(resolved)
    try {
      for (const [index, task] of parsed.tasks.entries()) {
        const planned = plan.tasks[index]!
        const objective = objectives[index]!
        const assignment = blindMap.assignments[index]!
        const material = materials.get(task.taskId)!
        if (assignment.taskId !== task.taskId
          || assignment.evaluatorSessionId !== planned.evaluatorSessionId
          || assignment.envelopeDigest !== controlledBlindEnvelopeDigest(objective, assignment)) {
          return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
            taskId: task.taskId,
            stage: 'postflight',
            reasonCode: 'run-fact-mismatch',
          })
        }
        const envelope = controlledEvaluatorEnvelope(
          task,
          objective,
          assignment,
          material,
        )
        const state: ControlledEvaluatorState = {
          sessionId: planned.evaluatorSessionId,
          config: resolved,
          forbidden: controlledEvaluatorForbiddenIdentities(task, forbidden),
          commonContext: { goal: task.goal, input: task.input },
          requests: [],
          active: false,
          deadline: 0,
          bodyCalls: 0,
        }
        const handle = await this.ctx.agents.create({
          sessionId: SessionId(planned.evaluatorSessionId),
          meta: { cwd: material.workspaceRoot },
          agentOptions,
          setup: agentCtx => {
            installModelSelection(agentCtx, { current: selection, assembled: undefined })
            agentCtx.tools.presentAs('native')
            if (inheritedTools.length > 0) agentCtx.tools.restrict({ deny: inheritedTools })
            agentCtx.tools.register(controlledEvaluatorTool(state))
            agentCtx.tools.guard(execution => controlledEvaluatorGuard(execution, state))
          },
        })
        state.agent = handle.agent
        const schemas = handle.agent.ctx.tools.schemas(handle.agent)
        if (handle.agent.session.header.cwd !== material.workspaceRoot
          || sha256(handle.agent.options) !== sha256(agentOptions)
          || schemas.length !== 1
          || schemas[0]?.name !== 'submit_blind_evaluation') {
          await handle.dispose()
          return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
            taskId: task.taskId,
            stage: 'postflight',
            reasonCode: 'run-fact-mismatch',
          })
        }
        prepared.push({
          evaluationId: plan.evaluationId,
          task,
          planned,
          assignment,
          envelope,
          handle,
          state,
        })
      }

      for (const evaluator of prepared) {
        const run = await this.runControlledEvaluator(evaluator)
        if (run.observation === undefined) {
          return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
            taskId: evaluator.task.taskId,
            stage: 'evaluator',
            reasonCode: run.reasonCode,
          })
        }
        try {
          this.ctx.tianwenEvolution.recordControlledSkillEvaluatorObservation(
            run.observation,
          )
        } catch {
          return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
            taskId: evaluator.task.taskId,
            stage: 'postflight',
            reasonCode: 'run-fact-mismatch',
          })
        }
        observations = this.ctx.tianwenEvolution
          .listControlledSkillEvaluatorObservations(plan.evaluationId)
        const durable = observations.at(-1)
        if (durable?.taskId !== evaluator.task.taskId) {
          return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
            taskId: evaluator.task.taskId,
            stage: 'postflight',
            reasonCode: 'run-fact-mismatch',
          })
        }
        completedTaskIds.push(evaluator.task.taskId)
        if (durable.status === 'inconclusive') {
          this.ctx.tianwenEvolution.recordControlledSkillEvaluationResult({
            evaluationId: plan.evaluationId,
          })
          const terminal = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
            plan.evaluationId,
          )
          if (terminal === undefined) {
            return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
              taskId: evaluator.task.taskId,
              stage: 'postflight',
              reasonCode: 'run-fact-mismatch',
            })
          }
          return terminalControlledEvaluatorsReceipt(plan, completedTaskIds, terminal)
        }
      }
      this.ctx.tianwenEvolution.recordControlledSkillEvaluationResult({
        evaluationId: plan.evaluationId,
      })
      const terminal = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        plan.evaluationId,
      )
      if (terminal === undefined) {
        return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
          taskId: plan.tasks.at(-1)!.taskId,
          stage: 'postflight',
          reasonCode: 'run-fact-mismatch',
        })
      }
      return terminalControlledEvaluatorsReceipt(plan, completedTaskIds, terminal)
    } catch {
      return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
        taskId: plan.tasks[completedTaskIds.length]?.taskId ?? plan.tasks.at(-1)!.taskId,
        stage: 'postflight',
        reasonCode: 'run-fact-mismatch',
      })
    } finally {
      let disposeFailed = false
      for (const evaluator of prepared.reverse()) {
        this.evaluators.delete(evaluator.state.sessionId)
        try {
          await evaluator.handle.dispose()
        } catch {
          disposeFailed = true
        }
      }
      if (disposeFailed) {
        return stoppedControlledEvaluatorsReceipt(plan, completedTaskIds, {
          taskId: plan.tasks.at(-1)!.taskId,
          stage: 'postflight',
          reasonCode: 'run-fact-mismatch',
        })
      }
    }
  }

  private async runControlledEvaluator(
    prepared: PreparedControlledEvaluator,
  ): Promise<ControlledEvaluatorRunResult> {
    const state = prepared.state
    const session = prepared.handle.agent.session
    this.evaluators.set(state.sessionId, state)
    const startedAt = Date.now()
    state.active = true
    state.deadline = startedAt + prepared.planned.stopContract.maxElapsedMs
    const timer = setTimeout(() => {
      if (state.active) cancelControlledEvaluator(state, 'timeout')
    }, prepared.planned.stopContract.maxElapsedMs)
    let idleFailed = false
    try {
      prepared.handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: JSON.stringify(prepared.envelope) }],
        source: { kind: 'user' },
      }))
      await prepared.handle.agent.whenIdle()
    } catch {
      idleFailed = true
    } finally {
      state.active = false
      clearTimeout(timer)
    }
    try {
      if (!await this.ctx.sessions.flush(session)) {
        return { reasonCode: 'persistence-unavailable' }
      }
    } catch {
      return { reasonCode: 'persistence-unavailable' }
    }
    if (state.reasonCode !== undefined) return { reasonCode: state.reasonCode }
    const terminal = session.events.findLast(event =>
      event.type === 'turn/start' || event.type === 'turn/end')
    if (idleFailed || terminal?.type !== 'turn/end'
      || terminal.data.reason.kind !== 'completed') {
      return { reasonCode: 'provider-failed' }
    }
    if (state.submission === undefined || state.submissionDigest === undefined) {
      return { reasonCode: state.bodyCalls > 0 ? 'submission-invalid' : 'score-not-submitted' }
    }
    const request = state.requests[0]
    if (request === undefined) return { reasonCode: 'request-contract-mismatch' }
    const evidence = this.ctx.tianwenEvidence.project(session)
      .filter(item => item.action.toolName === 'submit_blind_evaluation')
      .sort((left, right) => left.source.callSeq - right.source.callSeq)
      .at(-1)
    if (evidence === undefined
      || evidence.outcome.status !== 'complete'
      || evidence.outcome.isError !== false
      || evidence.action.argumentsDigest !== state.submissionDigest) {
      return { reasonCode: 'evidence-mismatch' }
    }
    return {
      observation: {
        evaluationId: prepared.evaluationId,
        taskId: prepared.task.taskId,
        evaluatorSessionId: state.sessionId,
        envelopeDigest: prepared.assignment.envelopeDigest,
        requestDigest: sha256(request),
        evidenceId: evidence.evidenceId,
        ...state.submission,
      },
    }
  }

  async runControlledArms(
    input: RunControlledSkillEvaluationArmsInput,
    resolveVerdict?: ControlledOutcomeVerdictResolver,
  ): Promise<ControlledSkillEvaluationArmsReceipt> {
    const parsed = parseControlledArmsInput(input)
    const candidate = this.ctx.tianwenEvolution.getSkillCandidate(parsed.candidateId)
    const protocol = this.ctx.tianwenEvolution.getControlledSkillEvalProtocol(
      parsed.protocolId,
    )
    const learningCase = candidate === undefined
      ? undefined
      : this.ctx.tianwenEvolution.getLearningCase(candidate.caseId)
    const parentManifest = candidate === undefined
      ? undefined
      : this.ctx.tianwenEvolution.listRunSkillManifests()
          .find(manifest => manifest.parentVersionId === candidate.parentVersionId)
    if (
      candidate === undefined
      || protocol === undefined
      || learningCase === undefined
      || parentManifest === undefined
      || candidate.status !== 'recorded'
      || candidate.payload.name !== parentManifest.parent.name
      || candidate.payload.invocation.modelInvocable !== true
      || parentManifest.parent.invocation.modelInvocable !== true
    ) throw new ControlledSkillEvaluationPreflightError('candidate-chain-mismatch')

    const protocolTasks = protocol.protocol.tasks
    if (
      protocolTasks.length !== parsed.tasks.length
      || parsed.tasks.some((task, index) => {
        const frozen = protocolTasks[index]
        return frozen === undefined
          || task.taskId !== frozen.taskId
          || sha256(task.goal) !== frozen.goalDigest
          || sha256(task.input) !== frozen.inputDigest
          || sha256(task.workspaceSnapshot) !== frozen.workspaceSnapshotDigest
          || sha256(task.authorization) !== frozen.authorizationDigest
          || sha256(task.verifierContract) !== frozen.verifierContractDigest
          || sha256(task.stopCondition) !== frozen.stopConditionDigest
          || sha256(task.evaluatorMaterialContract) !== frozen.evaluatorMaterialContractDigest
          || frozen.stopContract.maxToolCalls < 2
      })
    ) throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')

    try {
      for (const task of parsed.tasks) {
        for (const root of [task.baselineWorkspaceRoot, task.candidateWorkspaceRoot]) {
          if (sha256(workspaceSnapshot(root)) !== sha256(task.workspaceSnapshot)) {
            throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
          }
        }
      }
    } catch (error) {
      if (error instanceof ControlledSkillEvaluationPreflightError) throw error
      throw new ControlledSkillEvaluationPreflightError('task-package-mismatch')
    }

    let expectedPlan: ControlledSkillEvaluationPlan
    try {
      expectedPlan = prepareControlledSkillEvaluationPlan({
        candidateId: parsed.candidateId,
        protocolId: parsed.protocolId,
        sessionAllocations: parsed.tasks.map(task => ({
          taskId: task.taskId,
          baselineSessionId: task.baselineSessionId,
          candidateSessionId: task.candidateSessionId,
          evaluatorSessionId: task.evaluatorSessionId,
        })),
      }, candidate, learningCase, protocol, sha256(parentManifest.parent))
    } catch {
      throw new ControlledSkillEvaluationPreflightError('candidate-chain-mismatch')
    }

    const defaultModel = this.ctx.get('agentDefaultModel') as {
      currentSelection(): ModelSelection
    } | undefined
    if (defaultModel === undefined) {
      throw new ControlledSkillEvaluationPreflightError('configured-route-mismatch')
    }
    let selection: ModelSelection
    let resolved: LlmCallConfig
    try {
      selection = defaultModel.currentSelection()
      resolved = await this.ctx.llm.resolveCallConfig(selection)
    } catch {
      throw new ControlledSkillEvaluationPreflightError('configured-route-mismatch')
    }
    if (
      resolved.provider !== protocol.protocol.execution.providerId
      || resolved.model !== protocol.protocol.execution.modelId
      || sha256(resolved) !== protocol.protocol.execution.callConfigDigest
    ) throw new ControlledSkillEvaluationPreflightError('configured-route-mismatch')

    let retryPolicy: ReturnType<typeof this.ctx.llm.providerRetryPolicy>
    try {
      retryPolicy = this.ctx.llm.providerRetryPolicy(resolved.provider)
    } catch {
      throw new ControlledSkillEvaluationPreflightError('retry-policy-mismatch')
    }
    if (
      retryPolicy.mode !== 'normal'
      || retryPolicy.maxRetries !== 0
      || sha256(retryPolicy) !== protocol.protocol.execution.retryPolicyDigest
    ) throw new ControlledSkillEvaluationPreflightError('retry-policy-mismatch')

    let toolRows: readonly { readonly taskId: ControlledSkillEvalTaskId; readonly toolSchemaDigest: Sha256Digest }[]
    try {
      toolRows = parsed.tasks.map((task, index) => {
        const frozen = protocolTasks[index]!
        const schemas = this.ctx.tools.schemas()
          .filter(schema => frozen.allowedTools.includes(schema.name))
          .toSorted((left, right) => left.name.localeCompare(right.name))
        if (
          schemas.length !== frozen.allowedTools.length
          || schemas.some((schema, schemaIndex) => schema.name !== frozen.allowedTools[schemaIndex])
          || sha256(schemas) !== frozen.toolSchemaDigest
        ) throw new ControlledSkillEvaluationPreflightError('tool-surface-mismatch')
        return { taskId: task.taskId, toolSchemaDigest: sha256(schemas) }
      })
    } catch {
      throw new ControlledSkillEvaluationPreflightError('tool-surface-mismatch')
    }
    if (sha256(toolRows) !== protocol.protocol.execution.toolSchemaDigest) {
      throw new ControlledSkillEvaluationPreflightError('tool-surface-mismatch')
    }

    const persistence = this.ctx.get('sessionPersistence') as {
      list(): Promise<readonly { readonly id: string }[]>
    } | undefined
    if (persistence === undefined) {
      throw new ControlledSkillEvaluationPreflightError('persistence-unavailable')
    }
    let persisted: readonly { readonly id: string }[]
    try {
      persisted = await persistence.list()
    } catch {
      throw new ControlledSkillEvaluationPreflightError('persistence-unavailable')
    }
    const sessionIds = parsed.tasks.flatMap(task => [
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ])
    const targets = new Set(sessionIds)
    const occupied = persisted.some(header => targets.has(String(header.id)))
      || sessionIds.some(id =>
        this.ctx.sessions.get(SessionId(id)) !== undefined
        || this.ctx.agents.get(SessionId(id)) !== undefined)
    const existingPlan = this.ctx.tianwenEvolution.getControlledSkillEvaluation(
      expectedPlan.evaluationId,
    )
    if (existingPlan !== undefined && sha256(existingPlan) !== sha256(expectedPlan)) {
      throw new ControlledSkillEvaluationPreflightError('candidate-chain-mismatch')
    }
    if (existingPlan !== undefined) {
      const objectives = this.ctx.tianwenEvolution
        .listControlledSkillEvaluationObjectives(existingPlan.evaluationId)
      const result = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
        existingPlan.evaluationId,
      )
      const replayed = replayedControlledReceipt(existingPlan, objectives, result)
      if (replayed !== undefined) return replayed
      if (occupied || objectives.length > 0) {
        return stoppedControlledReceipt(
          existingPlan,
          objectives.map(objective => objective.taskId),
          {
            stage: 'postflight',
            taskId: existingPlan.tasks[objectives.length]?.taskId
              ?? existingPlan.tasks.at(-1)!.taskId,
            role: null,
            reasonCode: 'existing-partial-activity',
          },
        )
      }
    }
    if (occupied) {
      throw new ControlledSkillEvaluationPreflightError('session-not-empty')
    }

    const candidateSkill = {
      ...candidate.payload,
      provider: parentManifest.resolvedProvider,
    } as SkillDefinition
    try {
      prepareRunSkillManifest({
        runId: `run:${sha256({
          candidateId: candidate.candidateId,
          preflight: true,
        }).slice('sha256:'.length)}` as TianwenRunId,
        skill: candidateSkill,
      })
      for (const task of parsed.tasks) {
        for (const cwd of [task.baselineWorkspaceRoot, task.candidateWorkspaceRoot]) {
          const skill = await this.ctx.skills.get(parentManifest.parent.name, { cwd })
          if (skill === undefined || !sameSkillVersion(skill, candidate.parentVersionId)) {
            throw new ControlledSkillEvaluationPreflightError('root-skill-mismatch')
          }
        }
      }
    } catch (error) {
      if (error instanceof ControlledSkillEvaluationPreflightError) throw error
      throw new ControlledSkillEvaluationPreflightError('root-skill-mismatch')
    }

    if (resolved.provider === 'tianwen-controlled-scripted') {
      const fixtureRoot = process.env.TIANWEN_DSH_PROBE_ROOT
      if (
        protocol.evidencePurpose !== 'development-only-synthetic-defect'
        || fixtureRoot === undefined
        || !isAbsolute(fixtureRoot)
        || parsed.tasks.some(task =>
          !isDedicatedChild(fixtureRoot, task.baselineWorkspaceRoot)
          || !isDedicatedChild(fixtureRoot, task.candidateWorkspaceRoot)
          || !task.baselineSessionId.startsWith('session:controlled-eval:fixture:')
          || !task.candidateSessionId.startsWith('session:controlled-eval:fixture:')
          || !task.evaluatorSessionId.startsWith('session:controlled-eval:fixture:'))
      ) throw new ControlledSkillEvaluationPreflightError('scripted-boundary-mismatch')
    }

    const completedTaskIds: ControlledSkillEvalTaskId[] = []
    const agentOptions = requestAgentOptions(resolved)
    try {
      const opened = this.ctx.tianwenEvolution.openControlledSkillEvaluation({
        candidateId: parsed.candidateId,
        protocolId: parsed.protocolId,
        sessionAllocations: parsed.tasks.map(task => ({
          taskId: task.taskId,
          baselineSessionId: task.baselineSessionId,
          candidateSessionId: task.candidateSessionId,
          evaluatorSessionId: task.evaluatorSessionId,
        })),
      })
      const plan = this.ctx.tianwenEvolution.getControlledSkillEvaluation(
        opened.evaluationId,
      )
      if (plan === undefined || sha256(plan) !== sha256(expectedPlan)) {
        return stoppedControlledReceipt(expectedPlan, [], {
          stage: 'postflight',
          taskId: expectedPlan.tasks[0]!.taskId,
          role: null,
          reasonCode: 'run-fact-mismatch',
        })
      }

      const runArm = async (
        task: RunControlledSkillEvaluationTaskInput,
        planned: ControlledSkillEvaluationPlan['tasks'][number],
        role: 'baseline' | 'candidate',
        skill: SkillDefinition,
      ): Promise<ControlledArmRunResult> => {
        const planArm = planned[role]
        const cwd = role === 'baseline'
          ? task.baselineWorkspaceRoot
          : task.candidateWorkspaceRoot
        const guard: ControlledArmGuardState = {
          sessionId: planArm.sessionId,
          allowedTools: new Set(planned.allowedTools),
          maxToolCalls: planned.stopContract.maxToolCalls,
          active: false,
          deadline: 0,
          toolCalls: 0,
          usedToolNames: new Set(),
        }
        let handle: AgentHandle
        try {
          handle = await this.ctx.agents.create({
            sessionId: SessionId(planArm.sessionId),
            meta: { cwd },
            agentOptions,
            setup: async agentCtx => {
              installModelSelection(agentCtx, {
                current: selection,
                assembled: undefined,
              })
              agentCtx.tools.presentAs('native')
              agentCtx.tools.restrict({ allow: planned.allowedTools })
              agentCtx.tools.guard(execution => controlledArmGuard(execution, guard))
              await agentCtx.inject(['skills'], scopedCtx => {
                scopedCtx.skills.register(skill)
              })
            },
          })
        } catch {
          return { reasonCode: 'agent-create-failed' }
        }
        let result: ControlledArmRunResult | undefined
        try {
          guard.agent = handle.agent
          const armHandle = handle
          const prepared: PreparedControlledSkillEvaluationArm = {
            task,
            planned,
            role,
            skill,
            handle: armHandle,
            guard,
          }
          let actualSkill: SkillDefinition | undefined
          let expectedVersionId: SkillEvaluationPlan['parentVersionId'] | undefined
          try {
            await armHandle.agent.ctx.inject(['skills'], async scopedCtx => {
              actualSkill = await scopedCtx.skills.get(skill.name, {
                cwd: armHandle.agent.session.header.cwd,
                scope: armHandle.agent,
              })
            })
            expectedVersionId = role === 'baseline'
              ? candidate.parentVersionId
              : prepareRunSkillManifest({
                  runId: planArm.runId,
                  skill: candidateSkill,
                }).parentVersionId
          } catch {
            result = { reasonCode: 'skill-identity-drift' }
          }
          if (result === undefined && (
            actualSkill === undefined
            || expectedVersionId === undefined
            || !sameSkillVersion(actualSkill, expectedVersionId)
          )) result = { reasonCode: 'skill-identity-drift' }
          if (result === undefined) {
            try {
              const schemas = armHandle.agent.ctx.tools.schemas(armHandle.agent)
                .toSorted((left, right) => left.name.localeCompare(right.name))
              if (sha256(schemas) !== planned.toolSchemaDigest) {
                result = { reasonCode: 'tool-surface-mismatch' }
              }
            } catch {
              result = { reasonCode: 'tool-surface-mismatch' }
            }
          }
          if (result === undefined && (
            armHandle.agent.session.header.cwd !== cwd
            || sha256(armHandle.agent.options) !== sha256(agentOptions)
          )) {
            result = { reasonCode: 'agent-context-mismatch' }
          }
          if (result === undefined) {
            let boundRunId: TianwenRunId | undefined
            try {
              await armHandle.agent.ctx.inject(['skills'], async scopedCtx => {
                const binding = await this.ctx.tianwenLearningIntake.bindRunWithSkill(
                  armHandle.agent,
                  {
                    goalRef: `goal:controlled-skill-evaluation:${plan.protocolId}`,
                    taskRef: `task:${planned.taskId}:${role}`,
                    scopeKey: plan.scopeKey,
                    acceptanceContract: planned.acceptanceContract,
                    acceptanceSubjectDigest: planned.acceptanceSubjectDigest,
                  },
                  skill.name,
                  scopedCtx.skills,
                )
                boundRunId = binding.runId
              })
            } catch {
              result = { reasonCode: 'run-binding-failed' }
            }
            if (result === undefined && boundRunId !== planArm.runId) {
              result = { reasonCode: 'run-binding-failed' }
            }
          }
          if (result === undefined) {
            try {
              result = await this.runControlledArm(prepared, plan, resolved, resolveVerdict)
            } catch {
              result = { reasonCode: 'run-fact-mismatch' }
            }
          }
        } finally {
          this.requests.delete(String(handle.agent.id))
          try {
            await handle.dispose()
          } catch {
            if (result?.arm !== undefined || result === undefined) {
              result = { reasonCode: 'agent-dispose-failed' }
            }
          }
        }
        return result ?? { reasonCode: 'run-fact-mismatch' }
      }

      const baselineSkill = {
        ...parentManifest.parent,
        provider: parentManifest.resolvedProvider,
      } as SkillDefinition

      for (const [index, planned] of plan.tasks.entries()) {
        const task = parsed.tasks[index]!
        const baselineResult = await runArm(task, planned, 'baseline', baselineSkill)
        if (baselineResult.arm === undefined) {
          return stoppedControlledReceipt(plan, completedTaskIds, {
            stage: 'baseline',
            taskId: planned.taskId,
            role: 'baseline',
            reasonCode: baselineResult.reasonCode,
          })
        }

        try {
          if (sha256(workspaceSnapshot(task.candidateWorkspaceRoot))
            !== sha256(task.workspaceSnapshot)) {
            return stoppedControlledReceipt(plan, completedTaskIds, {
              stage: 'candidate',
              taskId: planned.taskId,
              role: 'candidate',
              reasonCode: 'workspace-drift',
            })
          }
        } catch {
          return stoppedControlledReceipt(plan, completedTaskIds, {
            stage: 'candidate',
            taskId: planned.taskId,
            role: 'candidate',
            reasonCode: 'workspace-drift',
          })
        }
        const candidateResult = await runArm(task, planned, 'candidate', candidateSkill)
        if (candidateResult.arm === undefined) {
          return stoppedControlledReceipt(plan, completedTaskIds, {
            stage: 'candidate',
            taskId: planned.taskId,
            role: 'candidate',
            reasonCode: candidateResult.reasonCode,
          })
        }
        if (baselineResult.arm.normalizedFirstRequestDigest
          !== candidateResult.arm.normalizedFirstRequestDigest) {
          return stoppedControlledReceipt(plan, completedTaskIds, {
            stage: 'pair',
            taskId: planned.taskId,
            role: null,
            reasonCode: 'request-contract-mismatch',
          })
        }
        try {
          this.ctx.tianwenEvolution.recordControlledSkillEvaluationObjective({
            evaluationId: plan.evaluationId,
            taskId: planned.taskId,
            baseline: baselineResult.arm,
            candidate: candidateResult.arm,
          })
        } catch {
          return stoppedControlledReceipt(plan, completedTaskIds, {
            stage: 'pair',
            taskId: planned.taskId,
            role: null,
            reasonCode: 'run-fact-mismatch',
          })
        }
        completedTaskIds.push(planned.taskId)
        const objectives = this.ctx.tianwenEvolution
          .listControlledSkillEvaluationObjectives(plan.evaluationId)
        const objective = objectives.at(-1)!
        const earlyTerminal = objective.objectiveVerdict !== 'pass'
        const noImprovement = objectives.length === plan.tasks.length
          && objectives.slice(0, 2).every(item =>
            item.comparison !== 'candidate-better')
        if (earlyTerminal || noImprovement) {
          this.ctx.tianwenEvolution.recordControlledSkillEvaluationResult({
            evaluationId: plan.evaluationId,
          })
          const result = this.ctx.tianwenEvolution.getControlledSkillEvaluationResult(
            plan.evaluationId,
          )!
          return terminalControlledReceipt(plan, completedTaskIds, result)
        }
      }
      return {
        schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
        evaluationId: plan.evaluationId,
        state: 'awaiting-evaluator',
        completedTaskIds,
      }
    } catch (error) {
      return stoppedControlledReceipt(expectedPlan, completedTaskIds, {
        stage: 'postflight',
        taskId: expectedPlan.tasks[0]!.taskId,
        role: null,
        reasonCode: error instanceof ControlledSkillEvaluationPreflightError
          && error.code === 'root-skill-mismatch'
          ? 'root-skill-drift'
          : 'run-fact-mismatch',
      })
    }
  }

  private async runControlledArm(
    prepared: PreparedControlledSkillEvaluationArm,
    plan: ControlledSkillEvaluationPlan,
    config: LlmCallConfig,
    resolveVerdict?: ControlledOutcomeVerdictResolver,
  ): Promise<ControlledArmRunResult> {
    const runId = prepared.planned[prepared.role].runId
    const result = await this.runControlledActivity(
      prepared,
      runId,
      config,
      prepared.role === 'baseline'
        ? prepared.task.baselineWorkspaceRoot
        : prepared.task.candidateWorkspaceRoot,
      resolveVerdict,
    )
    if (result.activity === undefined) return result
    const evaluatorMaterialDigest = controlledEvaluatorMaterial(
      prepared.handle.agent.session.events,
      prepared.task.evaluatorMaterialContract,
    )
    if (evaluatorMaterialDigest === undefined) {
      return { reasonCode: 'evaluator-material-invalid' }
    }
    return {
      arm: {
        role: prepared.role,
        ...result.activity,
        executionManifestDigest: controlledExecutionManifestDigest(
          plan,
          prepared.planned,
        ),
        evaluatorMaterialDigest,
      },
    }
  }

  private async runControlledActivity(
    prepared: PreparedControlledActivity,
    runId: TianwenRunId,
    config: LlmCallConfig,
    workspaceRoot: string,
    resolveVerdict?: ControlledOutcomeVerdictResolver,
  ): Promise<ControlledActivityRunResult> {
    const session = prepared.handle.agent.session
    const requests: GenerateOptions[] = []
    this.requests.set(String(session.id), requests)
    const startedAt = Date.now()
    prepared.guard.active = true
    prepared.guard.deadline = startedAt + prepared.planned.stopContract.maxElapsedMs
    const timer = setTimeout(() => {
      if (prepared.guard.active) {
        cancelControlledArm(prepared.guard, 'timeout', Date.now())
      }
    }, prepared.planned.stopContract.maxElapsedMs)
    let idleFailed = false
    try {
      prepared.handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: prepared.task.input }],
        source: { kind: 'user' },
      }))
      await prepared.handle.agent.whenIdle()
    } catch {
      idleFailed = true
    } finally {
      prepared.guard.active = false
      clearTimeout(timer)
    }
    const elapsedMs = Math.min(
      (prepared.guard.cancelledAt ?? Date.now()) - startedAt,
      prepared.planned.stopContract.maxElapsedMs,
    )
    try {
      if (!await this.ctx.sessions.flush(session)) {
        return { reasonCode: 'persistence-unavailable' }
      }
    } catch {
      return { reasonCode: 'persistence-unavailable' }
    }

    const normalizedFirstRequestDigest = controlledFirstRequestDigest(
      requests,
      String(session.id),
      config,
      prepared.skill,
      workspaceRoot,
    )
    if (normalizedFirstRequestDigest === undefined) {
      return { reasonCode: 'request-contract-mismatch' }
    }
    if (prepared.guard.reasonCode !== undefined) {
      return { reasonCode: prepared.guard.reasonCode }
    }
    const terminal = session.events.findLast(event =>
      event.type === 'turn/start' || event.type === 'turn/end')
    if (idleFailed || terminal?.type !== 'turn/end'
      || terminal.data.reason.kind !== 'completed') {
      return { reasonCode: 'provider-failed' }
    }

    let outcome: OutcomeVerdict
    let acceptanceEvidenceId: Sha256Digest | undefined
    try {
      const evidence = this.ctx.tianwenEvidence.project(session)
        .filter(item => item.action.toolName
          === prepared.planned.acceptanceContract.toolName)
        .sort((left, right) => left.source.callSeq - right.source.callSeq)
        .at(-1)
      const controlledVerdict = resolveVerdict?.(String(session.id))
      if (resolveVerdict !== undefined
        && (controlledVerdict === undefined || evidence === undefined)) {
        return { reasonCode: 'run-fact-mismatch' }
      }
      const intake = this.ctx.tianwenLearningIntake.consumeOutcome(
        session,
        runId,
        controlledVerdict === undefined || evidence === undefined
          ? undefined
          : {
              verdict: controlledVerdict,
              acceptanceEvidenceId: evidence.evidenceId,
            },
      )
      acceptanceEvidenceId = intake.acceptanceEvidenceId
      outcome = controlledVerdict ?? outcomeFromEvidence(
        session.events,
        evidence,
        prepared.planned.acceptanceContract.notMetErrorCode,
      )
    } catch {
      return { reasonCode: idleFailed ? 'provider-failed' : 'run-fact-mismatch' }
    }
    let useRecorded = false
    let useWriteFailed = false
    try {
      const useReceipt = this.ctx.tianwenLearningIntake.recordSkillUse(session, runId)
      useRecorded = useReceipt.decision === 'recorded'
    } catch {
      // A formal write may be commit-unknown; the governed fact is checked below.
      useWriteFailed = true
    }
    const manifest = this.ctx.tianwenEvolution.getRunSkillManifest(runId)
    const use = this.ctx.tianwenEvolution.getRunSkillUse(runId)
    if (
      manifest === undefined
      || use === undefined
      || use.sessionId !== String(session.id)
      || use.parentVersionId !== manifest.parentVersionId
      || use.contentDigest !== manifest.contentDigest
    ) return {
      reasonCode: useWriteFailed && !useRecorded
        ? 'persistence-unavailable'
        : 'skill-use-missing',
    }

    const evidence = this.ctx.tianwenEvidence.project(session)
      .filter(item => item.action.toolName === prepared.planned.acceptanceContract.toolName)
      .sort((left, right) => left.source.callSeq - right.source.callSeq)
      .at(-1)
    if (
      evidence === undefined
      || acceptanceEvidenceId !== evidence.evidenceId
      || evidence.action.argumentsDigest !== prepared.planned.acceptanceSubjectDigest
      || use.acceptanceEvidenceId !== evidence.evidenceId
    ) return { reasonCode: 'acceptance-subject-mismatch' }
    const usedToolNames = [...prepared.guard.usedToolNames]
      .sort((left, right) => left.localeCompare(right))
    return {
      activity: {
        runId,
        sessionId: String(session.id),
        skillVersionId: manifest.parentVersionId,
        contentDigest: manifest.contentDigest,
        normalizedFirstRequestDigest,
        outcome,
        evidenceIds: [evidence.evidenceId],
        acceptanceSubjectDigest: prepared.planned.acceptanceSubjectDigest,
        usedToolNames,
        usage: {
          modelRequests: requests.length,
          toolCalls: prepared.guard.toolCalls,
          elapsedMs,
        },
      },
    }
  }

  async run(input: RunPairedSkillEvaluationInput): Promise<PairedSkillEvaluationReceipt> {
    const candidate = this.ctx.tianwenEvolution.getSkillCandidate(input.candidateId)
    const protocol = this.ctx.tianwenEvolution.getSkillEvalProtocol(input.protocolId)
    if (candidate === undefined || protocol === undefined || candidate.status !== 'recorded') {
      throw new Error('paired Skill evaluation requires a recorded Candidate and frozen protocol')
    }
    if (
      input.callConfig.provider !== STAGE4_SCRIPTED_PROVIDER
      || input.callConfig.model !== STAGE4_SCRIPTED_MODEL
      || input.environment.providerId !== STAGE4_SCRIPTED_PROVIDER
      || input.environment.modelId !== STAGE4_SCRIPTED_MODEL
      || protocol.protocol.execution.providerId !== STAGE4_SCRIPTED_PROVIDER
      || protocol.protocol.execution.modelId !== STAGE4_SCRIPTED_MODEL
      || input.callConfig.reasoningEffort !== undefined
      || input.callConfig.temperature !== undefined
      || input.callConfig.stop !== undefined
      || protocol.protocol.budget.maxCnyMilliPerArm !== 0
      || protocol.protocol.budget.maxTotalCnyMilli !== 0
    ) {
      throw new Error('paired Skill evaluation only supports the zero-cost scripted mechanism')
    }
    const learningCase = this.ctx.tianwenEvolution.getLearningCase(candidate.caseId)
    const parentManifest = this.ctx.tianwenEvolution.listRunSkillManifests()
      .find(manifest => manifest.parentVersionId === candidate.parentVersionId)
    if (learningCase === undefined || parentManifest === undefined
      || candidate.targetScope !== learningCase.scopeKey
      || candidate.parentVersionId !== learningCase.parentVersionId
      || candidate.payload.invocation.userInvocable !== true
      || parentManifest.parent.invocation.userInvocable !== true) {
      throw new Error('paired Skill evaluation Candidate chain is not eligible')
    }
    let rootParentMatches = false
    await this.ctx.inject(['skills'], async scopedCtx => {
      const resolved = await scopedCtx.skills.get(parentManifest.parent.name)
      rootParentMatches = resolved !== undefined
        && sameSkillVersion(resolved, parentManifest.parentVersionId)
    })
    if (!rootParentMatches) {
      throw new Error('paired Skill evaluation cannot resolve its parent from the root Skill registry')
    }
    if (
      input.callConfig.provider !== protocol.protocol.execution.providerId
      || input.callConfig.model !== protocol.protocol.execution.modelId
      || sha256(input.callConfig) !== input.environment.callConfigDigest
    ) {
      throw new Error('paired Skill evaluation call config disagrees with its protocol')
    }
    const caseInputs = new Map(input.cases.map(item => [item.caseId, item.input]))
    if (caseInputs.size !== protocol.protocol.cases.length
      || protocol.protocol.cases.some(item => caseInputs.get(item.caseId) === undefined
        || sha256(caseInputs.get(item.caseId)) !== item.inputDigest)) {
      throw new Error('paired Skill evaluation inputs disagree with the frozen protocol')
    }

    const arms = protocol.protocol.cases.flatMap(protocolCase =>
      Array.from({ length: protocol.protocol.repetition.attempts }, (_, index) => {
        const attempt = index + 1
        const baseline = plannedBinding(protocolCase.caseId, attempt, 'baseline',
          protocolCase.acceptanceContract, learningCase.scopeKey, input.protocolId)
        const candidateArm = plannedBinding(protocolCase.caseId, attempt, 'candidate',
          protocolCase.acceptanceContract, learningCase.scopeKey, input.protocolId)
        return {
          caseId: protocolCase.caseId,
          attempt,
          baseline: { runId: baseline.runId, sessionId: baseline.sessionId },
          candidate: { runId: candidateArm.runId, sessionId: candidateArm.sessionId },
        }
      }))
    const expectedPlan = prepareSkillEvaluationPlan({
      candidateId: candidate.candidateId,
      protocolId: protocol.protocolId,
      environment: input.environment,
      arms,
    }, candidate, learningCase, protocol, sha256(parentManifest.parent))
    const completed = this.ctx.tianwenEvolution.getSkillEvaluationResult(expectedPlan.evaluationId)
    if (completed !== undefined) {
      return {
        evaluationId: expectedPlan.evaluationId,
        plan: this.ctx.tianwenEvolution.getSkillEvaluation(expectedPlan.evaluationId) ?? expectedPlan,
        result: completed,
      }
    }

    const adapter = stage4ScriptedAdapter(input.scriptedFixture, new Set(arms.flatMap(arm => [
      String(arm.baseline.sessionId),
      String(arm.candidate.sessionId),
    ])))
    const disposeAdapter = this.ctx.llm.registerAdapter([STAGE4_SCRIPTED_PROVIDER], adapter)
    const prepared: PreparedSkillEvaluationArm[] = []
    try {
      for (const protocolCase of protocol.protocol.cases) {
        for (let attempt = 1; attempt <= protocol.protocol.repetition.attempts; attempt += 1) {
          for (const role of ['baseline', 'candidate'] as const) {
            const skill = role === 'baseline' ? parentManifest.parent : candidate.payload
            const registered = { ...skill, provider: parentManifest.resolvedProvider }
            const sessionId = evaluationSessionId(input.protocolId, protocolCase.caseId, attempt, role)
            const handle = await this.ctx.agents.create({
              sessionId: SessionId(sessionId),
              agentOptions: requestAgentOptions(input.callConfig),
              setup: async agentCtx => {
                await agentCtx.inject(['skills'], scopedCtx => {
                  scopedCtx.skills.register(registered as SkillRegistration)
                })
              },
            })
            let resolved = false
            await handle.agent.ctx.inject(['skills'], async scopedCtx => {
              const actual = await scopedCtx.skills.get(skill.name, {
                cwd: handle.agent.session.header.cwd,
                scope: handle.agent,
              })
              resolved = actual !== undefined
                && sameSkillVersion(actual, prepareRunSkillManifest({
                  runId: `run:${sha256({ sessionId, role }).slice('sha256:'.length)}` as TianwenRunId,
                  skill: registered,
                }).parentVersionId)
            })
            if (!resolved) {
              await handle.dispose()
              throw new Error('paired Skill evaluation failed to resolve its scoped Skill')
            }
            const surface = scopedSurface(handle)
            prepared.push({
              caseId: protocolCase.caseId,
              attempt,
              role,
              sessionId,
              handle,
              skill: registered,
              provider: parentManifest.resolvedProvider,
              skillVersionId: prepareRunSkillManifest({
                runId: `run:${sha256({
                  protocolId: input.protocolId,
                  caseId: protocolCase.caseId,
                  attempt,
                  role,
                }).slice('sha256:'.length)}` as TianwenRunId,
                skill: registered,
              }).parentVersionId,
              contentDigest: sha256(registered.content),
              ...surface,
            })
          }
        }
      }

      if (!prepared.every(arm =>
        arm.toolSchemaDigest === input.environment.toolSchemaDigest)) {
        throw new Error('paired Skill evaluation actual visible tool surface disagrees with its protocol')
      }

      const opened = this.ctx.tianwenEvolution.openSkillEvaluation({
        candidateId: candidate.candidateId,
        protocolId: protocol.protocolId,
        environment: input.environment,
        arms,
      })
      const plan = this.ctx.tianwenEvolution.getSkillEvaluation(opened.evaluationId)
      if (plan === undefined) throw new Error('paired Skill evaluation plan was not durable')

      for (const arm of prepared) {
        const planArm = findPlanArm(plan, arm.caseId, arm.attempt, arm.role)
        const protocolCase = protocol.protocol.cases.find(item => item.caseId === arm.caseId)!
        const binding = this.ctx.tianwenLearningIntake.bindRun(arm.handle.agent.session, {
          goalRef: `goal:skill-evaluation:${arm.caseId}:${arm.attempt}`,
          taskRef: `task:skill-evaluation:${arm.caseId}:${arm.attempt}:${arm.role}`,
          scopeKey: learningCase.scopeKey,
          acceptanceContract: protocolCase.acceptanceContract,
        })
        if (binding.runId !== planArm.runId) {
          throw new Error('paired Skill evaluation binding disagrees with its durable plan')
        }
        arm.runId = binding.runId
      }

      const observed = []
      for (const planCase of plan.cases) {
        const baseline = prepared.find(item => item.caseId === planCase.caseId
          && item.attempt === planCase.attempt && item.role === 'baseline')!
        const candidateArm = prepared.find(item => item.caseId === planCase.caseId
          && item.attempt === planCase.attempt && item.role === 'candidate')!
        const caseInput = caseInputs.get(planCase.caseId)!
        const baselineObservation = await this.runArm(
          baseline, planCase, caseInput, input.callConfig,
          protocol.protocol.budget,
          executionManifestDigest(plan, planCase),
        )
        const candidateObservation = await this.runArm(
          candidateArm, planCase, caseInput, input.callConfig,
          protocol.protocol.budget,
          executionManifestDigest(plan, planCase),
        )
        observed.push({
          caseId: planCase.caseId,
          attempt: planCase.attempt,
          baseline: baselineObservation,
          candidate: candidateObservation,
        })
      }
      await this.ctx.inject(['skills'], async scopedCtx => {
        const resolved = await scopedCtx.skills.get(parentManifest.parent.name)
        rootParentMatches = resolved !== undefined
          && sameSkillVersion(resolved, parentManifest.parentVersionId)
      })
      const resultReceipt = this.ctx.tianwenEvolution.recordSkillEvaluationResult({
        evaluationId: plan.evaluationId,
        cases: observed,
        baselineResolutionMatched: rootParentMatches,
      })
      const result = this.ctx.tianwenEvolution.getSkillEvaluationResult(resultReceipt.evaluationId)
      if (result === undefined) throw new Error('paired Skill evaluation result was not durable')
      return { evaluationId: plan.evaluationId, plan, result }
    } finally {
      try {
        for (const arm of prepared.reverse()) {
          this.requests.delete(arm.sessionId)
          await arm.handle.dispose()
        }
      } finally {
        disposeAdapter()
      }
    }
  }

  private async runArm(
    arm: PreparedSkillEvaluationArm,
    planCase: SkillEvaluationPlan['cases'][number],
    input: string,
    callConfig: LlmCallConfig,
    budget: SkillEvaluationPlan['environment']['budget'],
    executionManifestDigest: Sha256Digest,
  ): Promise<SkillEvaluationArmObservation> {
    if (!input.startsWith(`/${arm.skill.name}`)) {
      throw new Error('paired Skill evaluation input must use the selected /skill-name')
    }
    const startedAt = Date.now()
    const requests: GenerateOptions[] = []
    this.requests.set(arm.sessionId, requests)
    let outcomeRecorded = false
    try {
      arm.handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: input }],
        source: { kind: 'user' },
      }))
      await arm.handle.agent.whenIdle()
      const allEvidence = this.ctx.tianwenEvidence.project(arm.handle.agent.session)
      const evidence = allEvidence
        .filter(item => item.action.toolName === planCase.acceptanceContract.toolName)
      const finalEvidence = evidence.at(-1)
      const usage = observedArmUsage(requests, arm.handle.agent.session.events, startedAt)
      const withinBudget = isWithinArmBudget(usage, budget)
      const outcome = outcomeFromEvidence(
        arm.handle.agent.session.events,
        finalEvidence,
        planCase.acceptanceContract.notMetErrorCode,
      )
      if (withinBudget) {
        this.ctx.tianwenLearningIntake.consumeOutcome(arm.handle.agent.session, arm.runId!)
      } else {
        this.ctx.tianwenEvolution.recordOutcomeIntake({
          runId: arm.runId!,
          verdict: 'inconclusive',
          sessionDigest: sha256(arm.handle.agent.session.events),
          evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
        })
      }
      outcomeRecorded = true
      const expectedSkillContent = renderSkillContent({
        name: arm.skill.name,
        provider: arm.provider,
        content: arm.skill.content,
      })
      const request = requests[0]
      const observation = request === undefined
        ? { accepted: false as const, reason: 'missing-evidence' }
        : observeSkillEvaluationRequest({
          request,
          sessionId: arm.sessionId,
          preflight: callConfig,
          paired: callConfig,
          expectedSkillContent,
          skillName: arm.skill.name,
          requestOrdinal: 1,
          maxModelRequests: budget.maxModelRequestsPerArm,
        })
      const validatorSubjectDigest = finalEvidence?.action.argumentsDigest
        ?? sha256({ sessionId: arm.sessionId, missingSubject: true })
      const evaluatedSubjectDigest = validatorSubjectDigest
      return {
        role: arm.role,
        runId: arm.runId!,
        sessionId: arm.sessionId,
        skillVersionId: arm.skillVersionId,
        contentDigest: arm.contentDigest,
        executionManifestDigest,
        fullRequestDigest: observation.accepted
          ? observation.fullRequestDigest
          : sha256({ sessionId: arm.sessionId, missingRequest: true }),
        normalizedFirstRequestDigest: observation.accepted
          ? observation.normalizedFirstRequestDigest
          : sha256({ sessionId: arm.sessionId, missingRequest: true }),
        injectionProofDigest: sha256(expectedSkillContent),
        outcome: withinBudget ? outcome : 'inconclusive',
        evidenceIds: finalEvidence === undefined ? [] : [finalEvidence.evidenceId],
        validatorReceiptDigest: sha256({
          evidenceId: finalEvidence?.evidenceId ?? null,
          subjectDigest: validatorSubjectDigest,
        }),
        validatorSubjectDigest,
        evaluatedSubjectDigest,
        usage,
        ...(!observation.accepted || !withinBudget || finalEvidence === undefined
          ? { reasonCode: !withinBudget ? 'arm-budget-exhausted' as const : 'missing-evidence' as const }
          : {}),
      }
    } catch {
      const usage = observedArmUsage(requests, arm.handle.agent.session.events, startedAt)
      if (!outcomeRecorded) {
        this.ctx.tianwenEvolution.recordOutcomeIntake({
          runId: arm.runId!,
          verdict: 'inconclusive',
          sessionDigest: sha256(arm.handle.agent.session.events),
          evidenceIds: [],
        })
      }
      return inconclusiveArmObservation(
        arm,
        executionManifestDigest,
        sha256({
          name: arm.skill.name,
          provider: arm.provider,
          content: arm.skill.content,
        }),
        usage,
        isWithinArmBudget(usage, budget) ? 'missing-evidence' : 'arm-budget-exhausted',
      )
    }
  }
}

function inconclusiveArmObservation(
  arm: PreparedSkillEvaluationArm,
  executionManifestDigest: Sha256Digest,
  injectionProofDigest: Sha256Digest,
  usage: SkillEvaluationArmObservation['usage'],
  reasonCode: 'missing-evidence' | 'arm-budget-exhausted',
): SkillEvaluationArmObservation {
  const subjectDigest = sha256({ sessionId: arm.sessionId, missingSubject: true })
  return {
    role: arm.role,
    runId: arm.runId!,
    sessionId: arm.sessionId,
    skillVersionId: arm.skillVersionId,
    contentDigest: arm.contentDigest,
    executionManifestDigest,
    fullRequestDigest: sha256({ sessionId: arm.sessionId, missingRequest: true }),
    normalizedFirstRequestDigest: sha256({ sessionId: arm.sessionId, missingRequest: true }),
    injectionProofDigest,
    outcome: 'inconclusive',
    evidenceIds: [],
    validatorReceiptDigest: sha256({ evidenceId: null, subjectDigest }),
    validatorSubjectDigest: subjectDigest,
    evaluatedSubjectDigest: subjectDigest,
    usage,
    reasonCode,
  }
}

function observedArmUsage(
  requests: readonly GenerateOptions[],
  events: readonly SessionEvent[],
  startedAt: number,
): SkillEvaluationArmObservation['usage'] {
  return {
    modelRequests: requests.length,
    tokens: 0,
    toolCalls: events.filter(event => event.type === 'tool/result').length,
    elapsedMs: Date.now() - startedAt,
    cnyMilli: 0,
  }
}

function isWithinArmBudget(
  usage: SkillEvaluationArmObservation['usage'],
  budget: SkillEvaluationPlan['environment']['budget'],
): boolean {
  return usage.modelRequests <= budget.maxModelRequestsPerArm
    && usage.tokens <= budget.maxTokensPerArm
    && usage.toolCalls <= budget.maxToolCallsPerArm
    && usage.elapsedMs <= budget.maxElapsedMsPerArm
    && usage.cnyMilli <= budget.maxCnyMilliPerArm
}

function executionManifestDigest(
  plan: SkillEvaluationPlan,
  evaluationCase: SkillEvaluationPlan['cases'][number],
): Sha256Digest {
  return sha256({
    environment: plan.environment,
    case: {
      caseId: evaluationCase.caseId,
      inputDigest: evaluationCase.inputDigest,
      dataSnapshotDigest: evaluationCase.dataSnapshotDigest,
      acceptanceContract: evaluationCase.acceptanceContract,
    },
  })
}

function outcomeFromEvidence(
  events: readonly SessionEvent[],
  evidence: EvidenceRecord | undefined,
  notMetErrorCode: string,
): 'met' | 'not-met' | 'inconclusive' {
  const terminal = events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
  if (terminal?.type !== 'turn/end' || terminal.data.reason.kind !== 'completed'
    || evidence?.outcome.status !== 'complete') {
    return 'inconclusive'
  }
  if (evidence.outcome.isError === false) return 'met'
  return evidence.outcome.errorCode === notMetErrorCode ? 'not-met' : 'inconclusive'
}

function activationFailureReason(
  reason: ControlledSkillShadowStopReasonCode,
): ControlledSkillActivationFailureReasonCode {
  switch (reason) {
    case 'persistence-unavailable':
    case 'provider-failed':
    case 'timeout':
    case 'tool-limit-exceeded':
    case 'request-contract-mismatch':
    case 'skill-use-missing':
    case 'acceptance-subject-mismatch':
    case 'root-skill-drift':
    case 'run-fact-mismatch':
      return reason
    default:
      return 'run-fact-mismatch'
  }
}

export interface PairedSkillEvaluationCaseInput {
  readonly caseId: SkillEvalCaseId
  readonly input: string
}

export interface RunPairedSkillEvaluationInput {
  readonly candidateId: GovernedSkillCandidateId
  readonly protocolId: SkillEvalProtocolId
  readonly environment: SkillEvaluationEnvironment
  readonly callConfig: LlmCallConfig
  readonly cases: readonly PairedSkillEvaluationCaseInput[]
  /** Entries are consumed only by the exact service-owned zero-cost ScriptedAdapter. */
  readonly scriptedFixture: readonly Stage4ScriptedFixtureEntry[]
}

export interface PairedSkillEvaluationReceipt {
  readonly evaluationId: SkillEvaluationPlan['evaluationId']
  readonly plan: SkillEvaluationPlan
  readonly result: SkillEvaluationResult
}

interface ControlledEvaluatorMaterial {
  readonly text: string
  readonly digest: Sha256Digest
}

interface ControlledEvaluatorPairMaterial {
  readonly baseline: ControlledEvaluatorMaterial
  readonly candidate: ControlledEvaluatorMaterial
  readonly workspaceRoot: string
}

interface ControlledEvaluatorEnvelopeArm {
  readonly materialText: string
  readonly outcome: OutcomeVerdict
  readonly materialDigest: Sha256Digest
  readonly evidenceSetDigest: Sha256Digest
}

interface ControlledEvaluatorEnvelope {
  readonly taskId: ControlledSkillEvalTaskId
  readonly goal: string
  readonly input: string
  readonly rubricDigest: Sha256Digest
  readonly rubric: typeof CONTROLLED_EVALUATOR_RUBRIC
  readonly x: ControlledEvaluatorEnvelopeArm
  readonly y: ControlledEvaluatorEnvelopeArm
}

interface ControlledEvaluatorState {
  readonly sessionId: string
  readonly config: LlmCallConfig
  readonly forbidden: ReadonlySet<string>
  readonly commonContext: Pick<RunControlledSkillEvaluatorTaskInput, 'goal' | 'input'>
  readonly requests: GenerateOptions[]
  agent?: AgentHandle['agent']
  active: boolean
  deadline: number
  bodyCalls: number
  pendingSubmission?: ControlledEvaluatorSubmission
  submission?: ControlledEvaluatorSubmission
  submissionDigest?: Sha256Digest
  reasonCode?: 'timeout' | 'request-contract-mismatch' | 'identity-exposed' | 'submission-invalid'
}

interface PreparedControlledEvaluator {
  readonly evaluationId: ControlledSkillEvaluationId
  readonly task: RunControlledSkillEvaluatorTaskInput
  readonly planned: ControlledSkillEvaluationPlan['tasks'][number]
  readonly assignment: ControlledSkillEvaluationBlindMap['assignments'][number]
  readonly envelope: ControlledEvaluatorEnvelope
  readonly handle: AgentHandle
  readonly state: ControlledEvaluatorState
}

type ControlledEvaluatorRunResult =
  | { readonly observation: RecordControlledSkillEvaluatorObservationInput; readonly reasonCode?: never }
  | { readonly observation?: never; readonly reasonCode: ControlledSkillEvaluatorsStopReasonCode }

function controlledBlindEnvelopeDigest(
  objective: ControlledSkillEvaluationObjective,
  assignment: ControlledSkillEvaluationBlindMap['assignments'][number],
): Sha256Digest {
  const arm = (role: 'baseline' | 'candidate') => ({
    evaluatorMaterialDigest: objective[role].evaluatorMaterialDigest,
    outcome: objective[role].outcome,
    evidenceSetDigest: sha256(objective[role].evidenceIds),
  })
  return sha256({
    domain: 'tianwen.controlled-blind-envelope.v1',
    taskId: objective.taskId,
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    x: arm(assignment.xRole),
    y: arm(assignment.yRole),
  })
}

function controlledEvaluatorEnvelope(
  task: RunControlledSkillEvaluatorTaskInput,
  objective: ControlledSkillEvaluationObjective,
  assignment: ControlledSkillEvaluationBlindMap['assignments'][number],
  material: ControlledEvaluatorPairMaterial,
): ControlledEvaluatorEnvelope {
  const arm = (role: 'baseline' | 'candidate'): ControlledEvaluatorEnvelopeArm => ({
    materialText: material[role].text,
    outcome: objective[role].outcome,
    materialDigest: material[role].digest,
    evidenceSetDigest: sha256(objective[role].evidenceIds),
  })
  return {
    taskId: task.taskId,
    goal: task.goal,
    input: task.input,
    rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    rubric: CONTROLLED_EVALUATOR_RUBRIC,
    x: arm(assignment.xRole),
    y: arm(assignment.yRole),
  }
}

function controlledEvaluatorTool(state: ControlledEvaluatorState) {
  const dimension = {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      relevance: { type: 'integer' as const, enum: [0, 1, 2, 3, 4], required: true as const },
      correctnessReasoning: {
        type: 'integer' as const,
        enum: [0, 1, 2, 3, 4],
        required: true as const,
      },
      clarityUsability: {
        type: 'integer' as const,
        enum: [0, 1, 2, 3, 4],
        required: true as const,
      },
      scopeRestraint: {
        type: 'integer' as const,
        enum: [0, 1, 2, 3, 4],
        required: true as const,
      },
    },
  }
  return defineTool({
    name: 'submit_blind_evaluation',
    description: 'Submit one blind X/Y score or an allowed insufficient-material result.',
    parameters: {
      status: { type: 'string', enum: ['scored', 'inconclusive'], required: true },
      insufficientMaterial: { type: 'boolean', required: true },
      reasonCode: {
        type: 'string',
        enum: [
          'score-submitted',
          'material-missing',
          'identity-exposed',
          'objective-facts-incomplete',
          'provider-failed',
          'timeout',
          'score-not-submitted',
        ],
        required: true,
      },
      scores: {
        type: 'object',
        additionalProperties: false,
        properties: {
          x: { ...dimension, required: true },
          y: { ...dimension, required: true },
        },
      },
    },
    output: {
      schema: { type: 'string', enum: ['evaluation-submitted'] },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const submission = state.pendingSubmission
      if (submission === undefined || sha256(args) !== sha256(submission)) {
        cancelControlledEvaluator(state, 'submission-invalid')
        throw new Error('controlled evaluator submission rejected')
      }
      state.submission = submission
      state.submissionDigest = sha256(submission)
      exec.concludeTurn()
      return 'evaluation-submitted'
    },
  })
}

function controlledEvaluatorGuard(
  execution: Readonly<{
    readonly agent?: AgentHandle['agent']
    readonly name: string
    readonly arguments: unknown
  }>,
  state: ControlledEvaluatorState,
): string | undefined {
  if (execution.agent !== state.agent
    || String(execution.agent?.id) !== state.sessionId
    || execution.name !== 'submit_blind_evaluation'
    || !state.active) {
    return 'controlled evaluator tool unavailable'
  }
  if (Date.now() >= state.deadline) {
    cancelControlledEvaluator(state, 'timeout')
    return 'controlled evaluator deadline exceeded'
  }
  if (state.bodyCalls >= 1) {
    cancelControlledEvaluator(state, 'submission-invalid')
    return 'controlled evaluator already submitted'
  }
  try {
    state.pendingSubmission = parseControlledEvaluatorSubmission(execution.arguments)
  } catch {
    cancelControlledEvaluator(state, 'submission-invalid')
    return 'controlled evaluator submission invalid'
  }
  state.bodyCalls = 1
  return undefined
}

function cancelControlledEvaluator(
  state: ControlledEvaluatorState,
  reasonCode: 'timeout' | 'submission-invalid',
): void {
  if (state.reasonCode !== undefined || !state.active) return
  state.reasonCode = reasonCode
  state.agent?.cancel({
    kind: 'hook',
    reason: reasonCode === 'timeout'
      ? 'tianwen-controlled-evaluator-timeout'
      : 'tianwen-controlled-evaluator-submission-invalid',
  })
}

interface PreparedControlledSkillEvaluationArm {
  readonly task: RunControlledSkillEvaluationTaskInput
  readonly planned: ControlledSkillEvaluationPlan['tasks'][number]
  readonly role: 'baseline' | 'candidate'
  readonly skill: SkillDefinition
  readonly handle: AgentHandle
  readonly guard: ControlledArmGuardState
}

interface PreparedControlledSkillShadowRun {
  readonly task: RunControlledSkillShadowTaskInput
  readonly planned: ControlledSkillShadowPlan['tasks'][number]
  readonly skill: SkillDefinition
  readonly handle: AgentHandle
  readonly guard: ControlledArmGuardState
}

interface PreparedControlledActivity {
  readonly task: { readonly input: string }
  readonly planned: {
    readonly acceptanceContract: RunAcceptanceContract
    readonly acceptanceSubjectDigest: Sha256Digest
    readonly stopContract: ControlledSkillEvalStopContract
  }
  readonly skill: SkillDefinition
  readonly handle: AgentHandle
  readonly guard: ControlledArmGuardState
}

interface ControlledArmGuardState {
  readonly sessionId: string
  readonly allowedTools: ReadonlySet<string>
  readonly maxToolCalls: number
  readonly usedToolNames: Set<string>
  agent?: AgentHandle['agent']
  active: boolean
  deadline: number
  toolCalls: number
  reasonCode?: 'timeout' | 'tool-limit-exceeded'
  cancelledAt?: number
}

function cancelControlledArm(
  state: ControlledArmGuardState,
  reasonCode: 'timeout' | 'tool-limit-exceeded',
  at: number,
): void {
  if (state.reasonCode !== undefined || !state.active) return
  state.reasonCode = reasonCode
  state.cancelledAt = at
  state.agent?.cancel({
    kind: 'hook',
    reason: reasonCode === 'timeout'
      ? 'tianwen-controlled-timeout'
      : 'tianwen-controlled-tool-limit',
  })
}

function controlledArmGuard(
  execution: Readonly<{
    readonly agent?: AgentHandle['agent']
    readonly name: string
  }>,
  state: ControlledArmGuardState,
): string | undefined {
  if (execution.agent !== state.agent
    || String(execution.agent?.id) !== state.sessionId) {
    return 'controlled evaluation tool identity mismatch'
  }
  if (!state.active || !state.allowedTools.has(execution.name)) {
    return 'controlled evaluation tool unavailable'
  }
  const now = Date.now()
  if (now >= state.deadline) {
    cancelControlledArm(state, 'timeout', now)
    return 'controlled evaluation deadline exceeded'
  }
  if (state.toolCalls >= state.maxToolCalls) {
    cancelControlledArm(state, 'tool-limit-exceeded', now)
    return 'controlled evaluation tool limit exceeded'
  }
  state.toolCalls += 1
  state.usedToolNames.add(execution.name)
  return undefined
}

type ControlledActivityRun = Omit<
  ControlledSkillShadowRun,
  'taskId' | 'executionManifestDigest'
>

type ControlledActivityRunResult =
  | { readonly activity: ControlledActivityRun; readonly reasonCode?: never }
  | {
      readonly activity?: never
      readonly reasonCode: ControlledSkillShadowStopReasonCode
    }

type ControlledArmRunResult =
  | { readonly arm: ControlledSkillEvaluationObjectiveArm; readonly reasonCode?: never }
  | {
      readonly arm?: never
      readonly reasonCode: ControlledSkillEvaluationArmsStopReasonCode
    }

function stoppedControlledReceipt(
  plan: ControlledSkillEvaluationPlan,
  completedTaskIds: readonly ControlledSkillEvalTaskId[],
  stop: ControlledSkillEvaluationArmsStop,
): ControlledSkillEvaluationArmsReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
    evaluationId: plan.evaluationId,
    state: 'stopped',
    completedTaskIds,
    stop,
  }
}

function stoppedControlledShadowReceipt(
  plan: ControlledSkillShadowPlan,
  completedTaskIds: readonly ControlledSkillShadowTaskId[],
  stop: ControlledSkillShadowStop,
): ControlledSkillShadowRuntimeReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1',
    shadowId: plan.shadowId,
    state: 'stopped',
    completedTaskIds,
    stop,
  }
}

function terminalControlledShadowReceipt(
  plan: ControlledSkillShadowPlan,
  completedTaskIds: readonly ControlledSkillShadowTaskId[],
  result: ControlledSkillShadowResult,
): ControlledSkillShadowRuntimeReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-shadow-runtime-receipt.v1',
    shadowId: plan.shadowId,
    state: 'terminal',
    completedTaskIds,
    result,
  }
}

function terminalControlledReceipt(
  plan: ControlledSkillEvaluationPlan,
  completedTaskIds: readonly ControlledSkillEvalTaskId[],
  result: ControlledSkillEvaluationResult,
): ControlledSkillEvaluationArmsReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
    evaluationId: plan.evaluationId,
    state: 'terminal',
    completedTaskIds,
    result,
  }
}

function terminalControlledEvaluatorsReceipt(
  plan: ControlledSkillEvaluationPlan,
  completedTaskIds: readonly ControlledSkillEvalTaskId[],
  result: ControlledSkillEvaluationResult,
): ControlledSkillEvaluatorsReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1',
    evaluationId: plan.evaluationId,
    state: 'terminal',
    completedTaskIds,
    result,
  }
}

function stoppedControlledEvaluatorsReceipt(
  plan: ControlledSkillEvaluationPlan,
  completedTaskIds: readonly ControlledSkillEvalTaskId[],
  stop: ControlledSkillEvaluatorsStop,
): ControlledSkillEvaluatorsReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-evaluators-receipt.v1',
    evaluationId: plan.evaluationId,
    state: 'stopped',
    completedTaskIds,
    stop,
  }
}

function replayedControlledReceipt(
  plan: ControlledSkillEvaluationPlan,
  objectives: readonly ControlledSkillEvaluationObjective[],
  result: ControlledSkillEvaluationResult | undefined,
): ControlledSkillEvaluationArmsReceipt | undefined {
  const completedTaskIds = objectives.map(objective => objective.taskId)
  if (result !== undefined) {
    return terminalControlledReceipt(plan, completedTaskIds, result)
  }
  if (
    objectives.length === plan.tasks.length
    && objectives.every(objective => objective.objectiveVerdict === 'pass')
  ) {
    return {
      schemaVersion: 'tianwen.controlled-skill-evaluation-arms-receipt.v1',
      evaluationId: plan.evaluationId,
      state: 'awaiting-evaluator',
      completedTaskIds,
    }
  }
  return undefined
}

interface PreparedSkillEvaluationArm {
  readonly caseId: SkillEvalCaseId
  readonly attempt: number
  readonly role: 'baseline' | 'candidate'
  readonly sessionId: string
  readonly handle: AgentHandle
  readonly skill: SkillRegistration
  readonly provider: string
  readonly skillVersionId: SkillEvaluationArmObservation['skillVersionId']
  readonly contentDigest: Sha256Digest
  readonly toolSchemaDigest: Sha256Digest
  runId?: TianwenRunId
}

class Stage4ScriptedAdapter extends ScriptedAdapter {
  constructor(
    entries: Stage4ScriptedFixtureEntry[],
    private readonly allowedSessionIds: ReadonlySet<string>,
  ) {
    super(entries)
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.allowedSessionIds.has(String(options.sessionId))) {
      throw new Error('paired Skill evaluation scripted route rejects non-arm Session')
    }
    yield* super.stream(options)
  }
}

function stage4ScriptedAdapter(
  entries: readonly Stage4ScriptedFixtureEntry[],
  allowedSessionIds: ReadonlySet<string>,
): ScriptedAdapter {
  if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) && !(entry instanceof Error))) {
    throw new Error('paired Skill evaluation requires static scripted fixture entries')
  }
  return new Stage4ScriptedAdapter(
    entries.map(entry => Array.isArray(entry) ? [...entry] : entry),
    allowedSessionIds,
  )
}

function scopedSurface(handle: AgentHandle): {
  readonly toolSchemaDigest: Sha256Digest
} {
  const schemas = handle.agent.ctx.tools.schemas(handle.agent)
    .toSorted((left, right) => left.name.localeCompare(right.name))
  return {
    toolSchemaDigest: sha256(schemas),
  }
}

function requestAgentOptions(config: LlmCallConfig) {
  return {
    provider: config.provider,
    model: config.model,
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
  }
}

function evaluationSessionId(
  protocolId: SkillEvalProtocolId,
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
): string {
  return `session:skill-eval:${protocolId.slice(-12)}:${caseId}:${attempt}:${role}`
}

function plannedBinding(
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
  acceptanceContract: SkillEvaluationPlan['cases'][number]['acceptanceContract'],
  scopeKey: string,
  protocolId: SkillEvalProtocolId,
) {
  const sessionId = evaluationSessionId(protocolId, caseId, attempt, role)
  return prepareRunBinding({
    goalRef: `goal:skill-evaluation:${caseId}:${attempt}`,
    taskRef: `task:skill-evaluation:${caseId}:${attempt}:${role}`,
    sessionId,
    scopeKey,
    acceptanceContract,
  })
}

function findPlanArm(
  plan: SkillEvaluationPlan,
  caseId: SkillEvalCaseId,
  attempt: number,
  role: 'baseline' | 'candidate',
) {
  const evaluationCase = plan.cases.find(item => item.caseId === caseId && item.attempt === attempt)
  if (evaluationCase === undefined) throw new Error('paired Skill evaluation plan row is missing')
  return evaluationCase[role]
}
