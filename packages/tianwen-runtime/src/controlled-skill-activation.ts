import { isAbsolute, posix } from 'node:path'
import { prepareRunBinding, sha256 } from '@tianwen/evolution'
import type {
  ControlledSkillActivationFailureReasonCode,
  ControlledSkillEvalStopContract,
  ControlledSkillShadowId,
  ControlledSkillTransition,
  ControlledSkillTransitionId,
  ControlledSkillTransitionKind,
  ControlledSkillTransitionPostCheckInput,
  ControlledSkillTransitionReceipt,
  RunAcceptanceContract,
  Sha256Digest,
  TianwenRunId,
} from '@tianwen/evolution'
import type { ControlledWorkspaceSnapshot } from './skill-evaluation.js'
import { parseResearchPacket } from './research-summary.js'

export type ControlledSkillActivationPreflightCode =
  | 'shadow-not-eligible'
  | 'pointer-mismatch'
  | 'task-package-mismatch'
  | 'configured-route-mismatch'
  | 'retry-policy-mismatch'
  | 'tool-surface-mismatch'
  | 'persistence-unavailable'
  | 'session-not-empty'
  | 'root-skill-mismatch'
  | 'scripted-boundary-mismatch'

export class ControlledSkillActivationPreflightError extends Error {
  constructor(readonly code: ControlledSkillActivationPreflightCode) {
    super(`controlled Skill activation preflight failed: ${code}`)
    this.name = 'ControlledSkillActivationPreflightError'
  }
}

export interface RunControlledSkillTransitionInput {
  readonly shadowId: ControlledSkillShadowId
  readonly kind: ControlledSkillTransitionKind
  readonly expectedRevision: number
  readonly task: RunControlledSkillTransitionTaskInput
}

export interface RunControlledSkillTransitionTaskInput {
  readonly goal: string
  readonly input: string
  readonly researchPacket?: string
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

export type ControlledSkillActivationRuntimeStopReasonCode =
  | ControlledSkillActivationFailureReasonCode
  | 'existing-partial-activity'
  | 'recovery-unknown'

export interface ControlledSkillActivationRuntimeStop {
  readonly stage: 'activation' | 'postflight' | 'recovery'
  readonly reasonCode: ControlledSkillActivationRuntimeStopReasonCode
}

export type ControlledSkillActivationRuntimeReceipt =
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-activation-runtime-receipt.v1'
      readonly transitionId: ControlledSkillTransitionId
      readonly kind: ControlledSkillTransitionKind
      readonly state: 'terminal'
      readonly completedRunId: TianwenRunId
      readonly transition: ControlledSkillTransitionReceipt
    }
  | {
      readonly schemaVersion: 'tianwen.controlled-skill-activation-runtime-receipt.v1'
      readonly transitionId: ControlledSkillTransitionId
      readonly kind: ControlledSkillTransitionKind
      readonly state: 'stopped'
      readonly transition?: ControlledSkillTransitionReceipt
      readonly stop: ControlledSkillActivationRuntimeStop
    }

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value)
}

function isLosslessJson(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isLosslessJson(item, seen))
    : (Object.getPrototypeOf(value) === Object.prototype
        || Object.getPrototypeOf(value) === null)
      && Reflect.ownKeys(value).every(key => typeof key === 'string'
        && isLosslessJson((value as Record<string, unknown>)[key], seen))
  seen.delete(value)
  return valid
}

function safeSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/^[a-z]:[\\/]/iu.test(value)
    && !value.startsWith('/')
    && !value.includes('://')
}

function workspaceSnapshot(value: unknown): ControlledWorkspaceSnapshot {
  const source = record(value)
  if (source === undefined
    || !exactKeys(source, ['schemaVersion', 'entries'])
    || source.schemaVersion !== 'tianwen.controlled-workspace-snapshot.v1'
    || !Array.isArray(source.entries)) {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  const entries = source.entries.map(value => {
    const entry = record(value)
    if (entry === undefined
      || !exactKeys(entry, ['relativePath', 'contentDigest', 'size'])
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
      || Number(entry.size) < 0) {
      throw new ControlledSkillActivationPreflightError('task-package-mismatch')
    }
    return {
      relativePath: entry.relativePath,
      contentDigest: entry.contentDigest,
      size: Number(entry.size),
    }
  })
  if (entries.some((entry, index) => index > 0
    && entries[index - 1]!.relativePath.localeCompare(entry.relativePath) >= 0)) {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  return { schemaVersion: 'tianwen.controlled-workspace-snapshot.v1', entries }
}

function parseTask(value: unknown): RunControlledSkillTransitionTaskInput {
  const task = record(value)
  if (task === undefined || !exactKeys(task, [
    'goal',
    'input',
    ...('researchPacket' in task ? ['researchPacket'] : []),
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
    || typeof task.goal !== 'string'
    || task.goal.trim().length === 0
    || typeof task.input !== 'string'
    || task.input.trim().length === 0
    || ('researchPacket' in task && typeof task.researchPacket !== 'string')
    || typeof task.workspaceRoot !== 'string'
    || !isAbsolute(task.workspaceRoot)
    || !isLosslessJson(task.authorization)
    || !isLosslessJson(task.verifierContract)
    || !isLosslessJson(task.stopCondition)
    || !isLosslessJson(task.acceptanceSubject)
    || !Array.isArray(task.allowedTools)
    || !safeSessionId(task.sessionId)) {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  const allowedTools = [...task.allowedTools]
  if (allowedTools.length === 0
    || allowedTools.some(name => typeof name !== 'string'
      || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u.test(name))
    || new Set(allowedTools).size !== allowedTools.length) {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  const stop = record(task.stopContract)
  if (stop === undefined
    || !exactKeys(stop, ['maxToolCalls', 'maxElapsedMs'])
    || !Number.isSafeInteger(stop.maxToolCalls)
    || Number(stop.maxToolCalls) < 2
    || Number(stop.maxToolCalls) > 256
    || !Number.isSafeInteger(stop.maxElapsedMs)
    || Number(stop.maxElapsedMs) < 1
    || Number(stop.maxElapsedMs) > 3_600_000) {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  let acceptanceContract: RunAcceptanceContract
  try {
    if ('researchPacket' in task) parseResearchPacket(task.researchPacket as string)
    acceptanceContract = prepareRunBinding({
      goalRef: 'goal:controlled-skill-activation-input-validation',
      taskRef: 'task:controlled-skill-activation-input-validation',
      sessionId: 'session:controlled-skill-activation-input-validation',
      scopeKey: 'scope:controlled-skill-activation-input-validation',
      acceptanceContract: task.acceptanceContract as RunAcceptanceContract,
    }).acceptanceContract
  } catch {
    throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  }
  return {
    goal: task.goal,
    input: task.input,
    ...('researchPacket' in task ? { researchPacket: task.researchPacket as string } : {}),
    workspaceRoot: task.workspaceRoot,
    workspaceSnapshot: workspaceSnapshot(task.workspaceSnapshot),
    authorization: structuredClone(task.authorization),
    verifierContract: structuredClone(task.verifierContract),
    stopCondition: structuredClone(task.stopCondition),
    acceptanceContract,
    acceptanceSubject: structuredClone(task.acceptanceSubject),
    allowedTools: allowedTools.toSorted((left, right) => left.localeCompare(right)),
    stopContract: {
      maxToolCalls: Number(stop.maxToolCalls),
      maxElapsedMs: Number(stop.maxElapsedMs),
    },
    sessionId: task.sessionId,
  }
}

export function parseRunControlledSkillTransitionInput(
  input: unknown,
): RunControlledSkillTransitionInput {
  const source = record(input)
  if (
    source === undefined
    || !exactKeys(source, ['shadowId', 'kind', 'expectedRevision', 'task'])
    || typeof source.shadowId !== 'string'
    || !/^shadow:[a-f0-9]{64}$/u.test(source.shadowId)
    || (source.kind !== 'promote' && source.kind !== 'rollback' && source.kind !== 'restore')
    || !Number.isSafeInteger(source.expectedRevision)
    || Number(source.expectedRevision) < 1
  ) throw new ControlledSkillActivationPreflightError('task-package-mismatch')
  return {
    shadowId: source.shadowId as ControlledSkillShadowId,
    kind: source.kind,
    expectedRevision: Number(source.expectedRevision),
    task: parseTask(source.task),
  }
}

export function controlledSkillTransitionPostCheck(
  task: RunControlledSkillTransitionTaskInput,
  toolSchemaDigest: Sha256Digest,
): ControlledSkillTransitionPostCheckInput {
  return {
    goalDigest: sha256(task.goal),
    inputDigest: sha256(task.input),
    workspaceSnapshotDigest: sha256(task.workspaceSnapshot),
    toolSchemaDigest,
    authorizationDigest: sha256(task.authorization),
    verifierContractDigest: sha256(task.verifierContract),
    stopConditionDigest: sha256(task.stopCondition),
    acceptanceContract: task.acceptanceContract,
    acceptanceSubjectDigest: sha256(task.acceptanceSubject),
    allowedTools: task.allowedTools,
    stopContract: task.stopContract,
    sessionId: task.sessionId,
  }
}

export function terminalControlledSkillActivationReceipt(
  transition: ControlledSkillTransition,
  receipt: ControlledSkillTransitionReceipt,
): ControlledSkillActivationRuntimeReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-activation-runtime-receipt.v1',
    transitionId: transition.transitionId,
    kind: transition.kind,
    state: 'terminal',
    completedRunId: transition.postCheck.runId,
    transition: receipt,
  }
}

export function stoppedControlledSkillActivationReceipt(
  transitionId: ControlledSkillTransitionId,
  kind: ControlledSkillTransitionKind,
  stop: ControlledSkillActivationRuntimeStop,
  transition?: ControlledSkillTransitionReceipt,
): ControlledSkillActivationRuntimeReceipt {
  return {
    schemaVersion: 'tianwen.controlled-skill-activation-runtime-receipt.v1',
    transitionId,
    kind,
    state: 'stopped',
    ...(transition === undefined ? {} : { transition }),
    stop,
  }
}

export function controlledSkillActivationRecoveredStop(
  reasonCode: ControlledSkillActivationFailureReasonCode,
): ControlledSkillActivationRuntimeStop {
  return {
    stage: reasonCode === 'root-skill-drift'
      || reasonCode === 'pointer-drift'
      || reasonCode === 'run-fact-mismatch'
      ? 'postflight'
      : 'activation',
    reasonCode,
  }
}
