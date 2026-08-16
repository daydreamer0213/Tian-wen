import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { TextDecoder } from 'node:util'

import { Context } from '@deepseek-ai/cordis'
import { foldGoal } from '@deepseek-ai/dsh-goal'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { projectEvidence } from '@tianwen/evidence/projector'

const UTF8 = new TextDecoder('utf-8', { fatal: true })
const ARTIFACT_ID = /^artifact:[0-9a-f]{64}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const LEDGER_TYPES = new Set([
  'artifact-recorded',
  'evaluation-recorded',
  'approval-recorded',
  'promoted',
  'rolled-back',
  'runtime-bound',
  'activation-failed',
  'recovery-failed',
])

export interface GoalStatusInput {
  readonly goalId: string
  readonly dataDir: string
}

export interface GoalListInput {
  readonly dataDir: string
}

export interface GoalStatusProjection {
  readonly schemaVersion: 'tianwen.goal-status.v1'
  readonly goal: {
    readonly id: string
    readonly revision: number
    readonly objective: string
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly blockedReason?: {
      readonly code: string
      readonly message: string
    }
    readonly maxGoalRounds: number
    readonly roundsStarted: number
    readonly createdAt: number
    readonly updatedAt: number
  }
  readonly session: {
    readonly id: string
    readonly eventCount: number
  }
  readonly evidence: {
    readonly total: number
    readonly counts: {
      readonly complete: number
      readonly 'missing-result': number
    }
    readonly items: readonly {
      readonly toolName: string
      readonly status: 'complete' | 'missing-result'
    }[]
  }
  readonly champion: {
    readonly artifactId: string
    readonly revision: number
  } | null
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export interface GoalListProjection {
  readonly schemaVersion: 'tianwen.goal-list.v1'
  readonly goals: readonly {
    readonly id: string
    readonly objective: string
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
    readonly maxGoalRounds: number
    readonly roundsStarted: number
    readonly updatedAt: number
    readonly session: {
      readonly id: string
      readonly eventCount: number
    }
  }[]
  readonly runtime: {
    readonly activation: 'not-loaded'
    readonly modelRequests: 0
    readonly readOnly: true
  }
}

export class GoalStatusNotFoundError extends Error {
  constructor(readonly goalId: string) {
    super(`Goal not found: ${goalId}`)
    this.name = 'GoalStatusNotFoundError'
  }
}

export class GoalStatusAmbiguousError extends Error {
  constructor(readonly goalId: string) {
    super(`Goal is present in more than one Session: ${goalId}`)
    this.name = 'GoalStatusAmbiguousError'
  }
}

export class GoalStatusIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'GoalStatusIntegrityError'
  }
}

interface DurableGoalSnapshot {
  readonly inspection: Awaited<
    ReturnType<JsonlSessionPersistence['inspect']>
  >
  readonly folded: ReturnType<typeof foldGoal>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decode(path: string, label: string): string {
  try {
    return UTF8.decode(readFileSync(path))
  } catch (error) {
    throw new GoalStatusIntegrityError(`${label} is not valid UTF-8`, {
      cause: error,
    })
  }
}

function canonicalLines(path: string): readonly Record<string, unknown>[] {
  const serialized = decode(path, 'ledger.jsonl')
  if (serialized.length === 0) return []
  if (!serialized.endsWith('\n') || serialized.includes('\r')) {
    throw new GoalStatusIntegrityError(
      'ledger.jsonl must use one canonical JSON object plus LF per event',
    )
  }
  return serialized.slice(0, -1).split('\n').map(line => {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (error) {
      throw new GoalStatusIntegrityError(
        'ledger.jsonl contains invalid JSON',
        { cause: error },
      )
    }
    if (!isRecord(value) || JSON.stringify(value) !== line) {
      throw new GoalStatusIntegrityError(
        'ledger.jsonl contains a non-canonical event',
      )
    }
    if (
      typeof value.type !== 'string' ||
      !LEDGER_TYPES.has(value.type) ||
      !isCanonicalTimestamp(value.at)
    ) {
      throw new GoalStatusIntegrityError('ledger.jsonl contains an invalid event')
    }
    return value
  })
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  return required.every(key => key in value) &&
    keys.every(key => allowed.has(key))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
}

function readChampion(evolutionRoot: string): GoalStatusProjection['champion'] {
  const ledgerPath = join(evolutionRoot, 'ledger.jsonl')
  const pointerPath = join(evolutionRoot, 'champion.json')
  const hasLedger = existsSync(ledgerPath)
  const hasPointer = existsSync(pointerPath)
  if (!hasLedger && !hasPointer) return null
  if (!hasLedger) {
    throw new GoalStatusIntegrityError(
      'champion.json exists without ledger.jsonl',
    )
  }

  const artifacts = new Set<string>()
  const evaluations = new Map<string, {
    readonly receiptDigest: string
    readonly verdict: string
  }>()
  const approvals = new Map<string, string>()
  const usedApprovals = new Set<string>()
  const promoted = new Set<string>()
  let lastArtifactId: string | undefined
  let lastRevision = 0
  for (const event of canonicalLines(ledgerPath)) {
    if (event.type === 'artifact-recorded') {
      if (!exactKeys(event, ['type', 'at', 'artifact'])) {
        throw new GoalStatusIntegrityError('ledger Artifact record is invalid')
      }
      const artifact = event.artifact
      if (
        !isRecord(artifact) ||
        (
          !exactKeys(artifact, ['artifactId', 'sourceDigest', 'createdAt']) &&
          !exactKeys(artifact, [
            'artifactId',
            'parentArtifactId',
            'sourceDigest',
            'createdAt',
          ])
        ) ||
        typeof artifact.artifactId !== 'string' ||
        !ARTIFACT_ID.test(artifact.artifactId) ||
        artifacts.has(artifact.artifactId) ||
        typeof artifact.sourceDigest !== 'string' ||
        !DIGEST.test(artifact.sourceDigest) ||
        artifact.artifactId.slice('artifact:'.length) !==
          artifact.sourceDigest.slice('sha256:'.length) ||
        artifact.createdAt !== event.at ||
        (
          artifact.parentArtifactId !== undefined &&
          (
            typeof artifact.parentArtifactId !== 'string' ||
            !artifacts.has(artifact.parentArtifactId)
          )
        )
      ) {
        throw new GoalStatusIntegrityError('ledger Artifact record is invalid')
      }
      artifacts.add(artifact.artifactId)
      continue
    }
    if (event.type === 'evaluation-recorded') {
      const evaluation = event.evaluation
      if (
        !exactKeys(event, ['type', 'at', 'evaluation']) ||
        !isRecord(evaluation) ||
        !exactKeys(evaluation, ['artifactId', 'receiptDigest', 'verdict']) ||
        typeof evaluation.artifactId !== 'string' ||
        !artifacts.has(evaluation.artifactId) ||
        typeof evaluation.receiptDigest !== 'string' ||
        !DIGEST.test(evaluation.receiptDigest) ||
        !['met', 'not_met', 'inconclusive'].includes(
          String(evaluation.verdict),
        )
      ) {
        throw new GoalStatusIntegrityError('ledger Evaluation record is invalid')
      }
      evaluations.set(evaluation.artifactId, {
        receiptDigest: evaluation.receiptDigest,
        verdict: String(evaluation.verdict),
      })
      continue
    }
    if (event.type === 'approval-recorded') {
      const approval = event.approval
      if (
        !exactKeys(event, ['type', 'at', 'approval']) ||
        !isRecord(approval) ||
        !exactKeys(approval, ['artifactId', 'authority', 'approvalId']) ||
        typeof approval.artifactId !== 'string' ||
        !artifacts.has(approval.artifactId) ||
        approval.authority !== 'human' ||
        typeof approval.approvalId !== 'string' ||
        approval.approvalId.length === 0 ||
        approvals.has(approval.approvalId)
      ) {
        throw new GoalStatusIntegrityError('ledger Approval record is invalid')
      }
      approvals.set(approval.approvalId, approval.artifactId)
      continue
    }
    if (event.type === 'runtime-bound') {
      if (
        !exactKeys(event, [
          'type',
          'at',
          'artifactId',
          'pluginId',
          'packageId',
        ]) ||
        typeof event.artifactId !== 'string' ||
        !ARTIFACT_ID.test(event.artifactId) ||
        !artifacts.has(event.artifactId) ||
        !isNonEmptyString(event.pluginId) ||
        !isNonEmptyString(event.packageId)
      ) {
        throw new GoalStatusIntegrityError('ledger Runtime binding is invalid')
      }
      continue
    }
    if (event.type === 'activation-failed') {
      if (
        !exactKeys(
          event,
          ['type', 'at', 'artifactId', 'phase', 'message'],
          ['receiptDigest', 'approvalId', 'pluginId', 'packageId'],
        ) ||
        typeof event.artifactId !== 'string' ||
        !ARTIFACT_ID.test(event.artifactId) ||
        !artifacts.has(event.artifactId) ||
        !['promotion', 'rollback', 'rehydrate'].includes(String(event.phase)) ||
        !isNonEmptyString(event.message) ||
        (event.receiptDigest !== undefined &&
          (typeof event.receiptDigest !== 'string' ||
            !DIGEST.test(event.receiptDigest))) ||
        (event.approvalId !== undefined &&
          !isNonEmptyString(event.approvalId)) ||
        ((event.receiptDigest === undefined) !==
          (event.approvalId === undefined)) ||
        (event.pluginId !== undefined && !isNonEmptyString(event.pluginId)) ||
        (event.packageId !== undefined && !isNonEmptyString(event.packageId)) ||
        ((event.pluginId === undefined) !== (event.packageId === undefined))
      ) {
        throw new GoalStatusIntegrityError('ledger activation failure is invalid')
      }
      if (event.receiptDigest !== undefined && event.approvalId !== undefined) {
        const evaluation = evaluations.get(event.artifactId)
        if (
          evaluation?.verdict !== 'met' ||
          evaluation.receiptDigest !== event.receiptDigest ||
          approvals.get(event.approvalId) !== event.artifactId ||
          usedApprovals.has(event.approvalId)
        ) {
          throw new GoalStatusIntegrityError(
            'ledger activation failure authority is invalid',
          )
        }
        usedApprovals.add(event.approvalId)
      }
      continue
    }
    if (event.type === 'recovery-failed') {
      if (
        !exactKeys(event, [
          'type',
          'at',
          'artifactId',
          'previousArtifactId',
          'message',
        ]) ||
        typeof event.artifactId !== 'string' ||
        !ARTIFACT_ID.test(event.artifactId) ||
        !artifacts.has(event.artifactId) ||
        typeof event.previousArtifactId !== 'string' ||
        !ARTIFACT_ID.test(event.previousArtifactId) ||
        !artifacts.has(event.previousArtifactId) ||
        !isNonEmptyString(event.message)
      ) {
        throw new GoalStatusIntegrityError('ledger recovery failure is invalid')
      }
      continue
    }
    if (!exactKeys(event, [
      'type',
      'at',
      'artifactId',
      'revision',
      'receiptDigest',
      'approvalId',
    ])) {
      throw new GoalStatusIntegrityError('ledger Champion transition is invalid')
    }
    const evaluation = typeof event.artifactId === 'string'
      ? evaluations.get(event.artifactId)
      : undefined
    if (
      typeof event.artifactId !== 'string' ||
      !ARTIFACT_ID.test(event.artifactId) ||
      !Number.isSafeInteger(event.revision) ||
      (event.revision as number) !== lastRevision + 1 ||
      lastArtifactId === event.artifactId ||
      typeof event.receiptDigest !== 'string' ||
      !DIGEST.test(event.receiptDigest) ||
      typeof event.approvalId !== 'string' ||
      event.approvalId.length === 0 ||
      !artifacts.has(event.artifactId) ||
      evaluation?.verdict !== 'met' ||
      evaluation.receiptDigest !== event.receiptDigest ||
      approvals.get(event.approvalId) !== event.artifactId ||
      usedApprovals.has(event.approvalId) ||
      (event.type === 'promoted' && promoted.has(event.artifactId)) ||
      (
        event.type === 'rolled-back' &&
        (!promoted.has(event.artifactId) || lastArtifactId === undefined)
      )
    ) {
      throw new GoalStatusIntegrityError('ledger Champion transition is invalid')
    }
    usedApprovals.add(event.approvalId)
    promoted.add(event.artifactId)
    lastArtifactId = event.artifactId
    lastRevision = event.revision as number
  }
  if (lastArtifactId === undefined) {
    if (hasPointer) {
      throw new GoalStatusIntegrityError(
        'champion.json exists without a ledger Champion',
      )
    }
    return null
  }
  if (!hasPointer) {
    throw new GoalStatusIntegrityError(
      'champion.json is missing for the ledger Champion',
    )
  }

  const serialized = decode(pointerPath, 'champion.json')
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch (error) {
    throw new GoalStatusIntegrityError('champion.json is invalid', {
      cause: error,
    })
  }
  if (
    !isRecord(value) ||
    serialized !== `${JSON.stringify(value)}\n` ||
    !exactKeys(value, ['artifactId', 'revision']) ||
    value.artifactId !== lastArtifactId ||
    value.revision !== lastRevision
  ) {
    throw new GoalStatusIntegrityError(
      'champion.json disagrees with ledger replay',
    )
  }
  return { artifactId: lastArtifactId, revision: lastRevision }
}

async function scanDurableGoals(
  dataDir: string,
): Promise<readonly DurableGoalSnapshot[]> {
  const sessionsRoot = join(dataDir, 'dsh-home', 'sessions')
  if (!existsSync(sessionsRoot)) return []

  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    const persistence = new JsonlSessionPersistence(ctx, {
      root: sessionsRoot,
      compression: 'none',
    })
    const headers = (await persistence.list())
      .toSorted((left, right) => String(left.id).localeCompare(String(right.id)))
    const snapshots: DurableGoalSnapshot[] = []
    for (const header of headers) {
      const inspection = await persistence.inspect(header.id)
      snapshots.push({ inspection, folded: foldGoal(inspection.events) })
    }
    return snapshots
  } catch (error) {
    if (error instanceof GoalStatusIntegrityError) {
      throw error
    }
    throw new GoalStatusIntegrityError('durable Goal status is invalid', {
      cause: error,
    })
  } finally {
    await ctx.fiber.dispose()
  }
}

export async function listGoals(
  input: GoalListInput,
): Promise<GoalListProjection> {
  if (!isAbsolute(input.dataDir)) {
    throw new TypeError('dataDir must be an absolute path')
  }
  const goalIds = new Set<string>()
  const goals: GoalListProjection['goals'][number][] = []
  for (const snapshot of await scanDurableGoals(resolve(input.dataDir))) {
    const folded = snapshot.folded
    const goal = folded.goal
    if (goal === undefined) continue
    if (folded.createdAt === undefined || folded.updatedAt === undefined) {
      throw new GoalStatusIntegrityError('Goal replay is incomplete')
    }
    const goalId = String(goal.id)
    if (goalIds.has(goalId)) {
      throw new GoalStatusAmbiguousError(goalId)
    }
    goalIds.add(goalId)
    goals.push({
      id: goalId,
      objective: goal.objective,
      phase: goal.phase,
      maxGoalRounds: goal.maxGoalRounds,
      roundsStarted: folded.roundsStarted,
      updatedAt: folded.updatedAt,
      session: {
        id: String(snapshot.inspection.meta.id),
        eventCount: snapshot.inspection.events.length,
      },
    })
  }
  goals.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt
    }
    if (left.id !== right.id) return left.id < right.id ? -1 : 1
    if (left.session.id === right.session.id) return 0
    return left.session.id < right.session.id ? -1 : 1
  })
  return {
    schemaVersion: 'tianwen.goal-list.v1',
    goals,
    runtime: {
      activation: 'not-loaded',
      modelRequests: 0,
      readOnly: true,
    },
  }
}

export async function readGoalStatus(
  input: GoalStatusInput,
): Promise<GoalStatusProjection> {
  if (!isAbsolute(input.dataDir)) {
    throw new TypeError('dataDir must be an absolute path')
  }
  if (input.goalId.length === 0) {
    throw new TypeError('goalId must not be empty')
  }
  const dataDir = resolve(input.dataDir)
  try {
    const matches = (await scanDurableGoals(dataDir))
      .filter(snapshot => String(snapshot.folded.goal?.id) === input.goalId)
    if (matches.length === 0) {
      throw new GoalStatusNotFoundError(input.goalId)
    }
    if (matches.length > 1) {
      throw new GoalStatusAmbiguousError(input.goalId)
    }
    const snapshot = matches[0]!
    const folded = snapshot.folded
    const goal = folded.goal
    if (
      goal === undefined ||
      folded.createdAt === undefined ||
      folded.updatedAt === undefined
    ) {
      throw new GoalStatusIntegrityError('Goal replay is incomplete')
    }
    const { inspection } = snapshot
    const evidence = projectEvidence(inspection.meta.id, inspection.events)
    const complete = evidence.filter(
      record => record.outcome.status === 'complete',
    ).length

    return {
      schemaVersion: 'tianwen.goal-status.v1',
      goal: {
        id: String(goal.id),
        revision: goal.revision,
        objective: goal.objective,
        phase: goal.phase,
        ...(goal.blockedReason === undefined ? {} : {
          blockedReason: {
            code: goal.blockedReason.code,
            message: goal.blockedReason.message,
          },
        }),
        maxGoalRounds: goal.maxGoalRounds,
        roundsStarted: folded.roundsStarted,
        createdAt: folded.createdAt,
        updatedAt: folded.updatedAt,
      },
      session: {
        id: String(inspection.meta.id),
        eventCount: inspection.events.length,
      },
      evidence: {
        total: evidence.length,
        counts: {
          complete,
          'missing-result': evidence.length - complete,
        },
        items: evidence.map(record => ({
          toolName: record.action.toolName,
          status: record.outcome.status,
        })),
      },
      champion: readChampion(join(dataDir, 'state', 'evolution')),
      runtime: {
        activation: 'not-loaded',
        modelRequests: 0,
        readOnly: true,
      },
    }
  } catch (error) {
    if (
      error instanceof GoalStatusNotFoundError ||
      error instanceof GoalStatusAmbiguousError ||
      error instanceof GoalStatusIntegrityError
    ) {
      throw error
    }
    throw new GoalStatusIntegrityError('durable Goal status is invalid', {
      cause: error,
    })
  }
}
