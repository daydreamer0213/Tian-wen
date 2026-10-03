import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-commands'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { GoalTaskOutcomeInput } from '@tianwen/evolution'
import { sha256 } from '@tianwen/evolution/learning-intake'
import type { GoalTaskAcceptanceBinding, GoalTaskAcceptanceEvent, GoalTaskRequirementsSnapshot } from './goal-task-acceptance-contract.js'
import { readLongGoal, readTianwenTaskAttemptProjection } from './long-goal.js'
import { sandboxModeFromEvents } from './permission-attempt.js'
import { readGoalTaskMethodUsage } from './goal-task-method.js'

type Finished = Extract<GoalTaskAcceptanceEvent, { type: 'task-acceptance-finished' }>
export interface GoalTaskOutcomeMaterial {
  readonly sourceKind: 'native-goal-task'
  /** Missing for old preparations. This does not certify referenced external file contents. */
  readonly requirementsSnapshot?: GoalTaskRequirementsSnapshot
  readonly source: Extract<SessionEvent, { type: 'command/run' }>
  readonly preparation: GoalTaskAcceptanceBinding
  readonly result: Finished
  readonly events: readonly SessionEvent[]
  readonly outcomeInput?: GoalTaskOutcomeInput
  readonly methodUsage?: NonNullable<ReturnType<typeof readGoalTaskMethodUsage>>
}

/** Original SDK material verifier shared by result intake and the research reader. No model/tool calls. */
export async function readGoalTaskAcceptanceMaterial(ctx: Context, input: {
  readonly stateRoot: string; readonly goalId: string; readonly taskId: string; readonly epoch: number
}): Promise<GoalTaskOutcomeMaterial> {
  const goal = readLongGoal(input.stateRoot, input.goalId)
  if (goal.schemaVersion !== 'tianwen.long-goal.v3' || goal.origin === undefined) throw new Error('original Goal origin unavailable')
  const prepared = goal.tianwenEvents?.find(event => event.type === 'task-acceptance-prepared'
    && event.taskId === input.taskId && event.binding.epoch === input.epoch)
  const result = goal.tianwenEvents?.find(event => event.type === 'task-acceptance-finished'
    && event.taskId === input.taskId && event.epoch === input.epoch)
  if (prepared?.type !== 'task-acceptance-prepared' || result?.type !== 'task-acceptance-finished') throw new Error('original Goal Task acceptance unavailable')
  const b = prepared.binding, snapshot = b.requirementsSnapshot
  const origin = snapshot?.goal.origin ?? goal.origin
  const control = await ctx.sessionPersistence.inspect(SessionId(origin.sessionId))
  const source = control.events.find(event => event.seq === origin.commandSeq)
  if (control.meta.parentSession !== undefined || control.meta.origin === 'subagent'
    || source?.type !== 'command/run' || source.data.name !== 'goal' || source.data.source.kind !== 'user'
    || String(source.data.commandId) !== origin.commandId || sha256(source) !== origin.commandDigest
    || source.data.args?.trim() !== (snapshot?.goal.objective ?? goal.objective)) throw new Error('original direct-user Goal command binding unavailable')
  const saved = await ctx.sessionPersistence.inspect(SessionId(b.childSessionId))
  const events = saved.events.filter(event => event.seq <= result.endSeq)
  const end = events.at(-1), header = events.find(event => event.seq === b.headerSeq)
  const attempt = readTianwenTaskAttemptProjection(goal, input.taskId).attempts.find(item => item.epoch === b.epoch)
  if (attempt?.childSessionId !== b.childSessionId || attempt.parentSessionId !== b.parentSessionId
    || attempt.permissionFingerprint !== b.permissionFingerprint || sandboxModeFromEvents(events, false) !== attempt.permissionMode
    || String(saved.meta.parentSession) !== b.parentSessionId || saved.meta.cwd !== (snapshot?.goal.workspaceRoot ?? goal.workspaceRoot)
    || snapshot !== undefined && (snapshot.goal.id !== goal.id || snapshot.permissionMode !== attempt.permissionMode)
    || end?.type !== 'turn/end' || end.seq !== result.endSeq || sha256(events) !== result.materialDigest
    || sha256(events.filter(event => event.seq <= b.preparedSeq)) !== b.prefixDigest
    || header?.type !== 'request/header' || sha256(header.data.header.config) !== b.modelConfigDigest) {
    throw new Error('Goal Task outcome original native material changed')
  }
  const outcomeInput: GoalTaskOutcomeInput | undefined = b.learningConsentRevision === undefined ? undefined : {
    source: 'native-goal-task', goalId: goal.id, taskId: input.taskId, epoch: b.epoch, origin: structuredClone(origin),
    parentSessionId: b.parentSessionId, childSessionId: b.childSessionId, nativeGoalId: b.nativeGoalId,
    preparedSeq: b.preparedSeq, endSeq: result.endSeq, preparationDigest: result.preparationDigest, materialDigest: result.materialDigest,
    consentRevision: b.learningConsentRevision, modelConfigDigest: b.modelConfigDigest, checkerId: b.checkerId, checkerDigest: b.checkerDigest,
    contractDigest: b.contractDigest, inputsDigest: b.inputsDigest, requiredConditionDigest: sha256(b.requiredCondition), outcome: structuredClone(result.outcome),
  }
  const methodUsage = readGoalTaskMethodUsage(b, events)
  return structuredClone({ sourceKind: 'native-goal-task', ...(methodUsage === undefined ? {} : { methodUsage }), ...(snapshot === undefined ? {} : { requirementsSnapshot: snapshot }),
    source, preparation: b, result, events, ...(outcomeInput === undefined ? {} : { outcomeInput }) })
}

/** Lossless learning read, bounded by the existing 512KiB semantic-material budget. */
export async function readGoalTaskOutcomeMaterial(ctx: Context, input: {
  readonly stateRoot: string; readonly outcome: GoalTaskOutcomeInput
}): Promise<GoalTaskOutcomeMaterial> {
  const outcome = structuredClone(input.outcome)
  const authorized = () => {
    const consent = ctx.tianwenEvolution.getLearningAnalysisConsent()
    if (consent?.enabled !== true || consent.policyVersion !== 'tianwen-auto-analysis.v3' || consent.revision !== outcome.consentRevision) {
      throw new Error('Goal Task learning material consent unavailable')
    }
  }
  authorized()
  const material = await readGoalTaskAcceptanceMaterial(ctx, { stateRoot: input.stateRoot,
    goalId: outcome.goalId, taskId: outcome.taskId, epoch: outcome.epoch })
  if (material.outcomeInput === undefined || sha256(material.outcomeInput) !== sha256(outcome)) throw new Error('Goal Task learning source differs from original result')
  if (Buffer.byteLength(JSON.stringify(material), 'utf8') > 512 * 1024) throw new Error('material-too-large')
  authorized()
  return material
}
