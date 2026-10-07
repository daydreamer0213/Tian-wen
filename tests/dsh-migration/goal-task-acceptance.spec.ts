import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { appendGoalTaskAcceptance, appendGoalTaskContentReview, appendTianwenAttemptStarted, bindGoalFirstLongGoalTask, commitLongGoalPlan, createContinuousLongGoal, readLongGoal } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import { parseGoalTaskAcceptanceEvent, parseGoalTaskContentReviewEvent, type GoalTaskAcceptanceBinding } from '../../packages/tianwen-runtime-bundle/src/goal-task-acceptance-contract.js'

const BASE = resolve('D:/DevData/tianwen-dsh-probe/goal-task-acceptance')
function fixture() {
  mkdirSync(BASE, { recursive: true })
  const root = mkdtempSync(join(BASE, 'control-'))
  let goal = createContinuousLongGoal({ stateRoot: root, objective: 'Original requirement', context: null, successCriteria: null,
    workspaceRoot: root, agentPreset: 'standard', controlSessionId: 'control',
    origin: { sessionId: 'control', commandId: 'cmd-original', commandSeq: 0, commandDigest: sha256('controlled-command') } })
  goal = commitLongGoalPlan({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, outcome: 'continue',
    tasks: [{ objective: 'Implement original requirement' }], consideredSettledTasks: 0 }) as LongGoalRecordV3
  const taskId = goal.tasks[0]!.id
  goal = appendTianwenAttemptStarted({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    epoch: 1, parentSessionId: goal.planner.sessionId, childSessionId: 'child', permissionFingerprint: sha256('permissions'),
    permissionMode: 'workspace-write', startedAt: new Date().toISOString() })
  goal = bindGoalFirstLongGoalTask({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    execution: { sessionId: 'child', goalId: 'goal-native' } }) as LongGoalRecordV3
  const binding: GoalTaskAcceptanceBinding = {
    epoch: 1, parentSessionId: goal.planner.sessionId, childSessionId: 'child', nativeGoalId: 'goal-native', permissionFingerprint: sha256('permissions'),
    goalDigest: sha256({ id: goal.id, objective: goal.objective, context: goal.context, successCriteria: goal.successCriteria, origin: goal.origin }),
    taskDigest: sha256(goal.tasks[0]), headerSeq: 5, preparedSeq: 6, prefixDigest: sha256('controlled-prefix'), modelConfigDigest: sha256('controlled-model'),
    checkerId: 'existing-assertion', checkerDigest: sha256('checker'), contractDigest: sha256('contract'), inputsDigest: sha256('inputs'), requiredCondition: 'Keep original required field',
  }
  const input = { stateRoot: root, longGoalId: goal.id, taskId }
  return { root, goal, binding, input, remove() {
    const target = resolve(root)
    if (!target.startsWith(`${BASE}${sep}`)) throw new Error('cleanup outside owned fixture')
    rmSync(target, { recursive: true, force: true })
  } }
}

describe('Goal Task acceptance durable boundaries', () => {
  it('persists content review once under its exact original result and rejects substituted starts or finishes', () => {
    const f = fixture()
    try {
      const binding = { ...f.binding, contentReview: { protocol: 'tianwen.goal-task-content-review.v1' as const },
        requirementsSnapshot: { goal: { id: f.goal.id, objective: f.goal.objective, context: f.goal.context,
          successCriteria: f.goal.successCriteria, workspaceRoot: f.goal.workspaceRoot, origin: f.goal.origin! }, task: f.goal.tasks[0]!, permissionMode: 'workspace-write' as const } }
      let saved = appendGoalTaskAcceptance({ ...f.input, expectedRevision: f.goal.revision, event: { type: 'task-acceptance-prepared', taskId: f.input.taskId, binding } })
      const start = { type: 'task-content-review-started' as const, taskId: f.input.taskId, epoch: 1,
        preparationDigest: sha256(binding), materialDigest: sha256('original material'), reviewMaterialDigest: sha256('review view') }
      expect(() => appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: start })).toThrow()
      saved = appendGoalTaskAcceptance({ ...f.input, expectedRevision: saved.revision, event: { type: 'task-acceptance-finished', taskId: f.input.taskId,
        epoch: 1, preparationDigest: sha256(binding), endSeq: 10, materialDigest: start.materialDigest, outcome: { status: 'verified', detail: 'Functional only.' } } })
      for (const changed of [{ ...start, epoch: 2 }, { ...start, preparationDigest: sha256('other') }, { ...start, materialDigest: sha256('other') }]) {
        expect(() => appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: changed })).toThrow()
        expect(readLongGoal(f.root, f.goal.id)).toEqual(saved)
      }
      saved = appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: start })
      expect(() => appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: start })).toThrow()
      const finish = { type: 'task-content-review-finished' as const, taskId: f.input.taskId, epoch: 1, startDigest: sha256(start),
        result: { status: 'unverifiable' as const, detail: 'Interrupted, no regrade.' } }
      expect(() => appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: { ...finish, startDigest: sha256('other start') } })).toThrow()
      for (const changed of [{ ...start, arbitrary: true }, { ...finish, result: { status: 'reviewed', checks: [] } },
        { ...finish, result: { ...finish.result, qualifyingStudy: true } }]) expect(() => parseGoalTaskContentReviewEvent(changed)).toThrow()
      saved = appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: finish })
      expect(readLongGoal(f.root, f.goal.id)).toEqual(saved)
      expect(() => appendGoalTaskContentReview({ ...f.input, expectedRevision: saved.revision, event: finish })).toThrow()
    } finally { f.remove() }
  })
  it('freezes small original requirements, rejects substituted snapshots and retains legacy exact parsing', () => {
    const f = fixture()
    try {
      const snapshot = { goal: { id: f.goal.id, objective: f.goal.objective, context: f.goal.context,
        successCriteria: f.goal.successCriteria, workspaceRoot: f.goal.workspaceRoot, origin: f.goal.origin! },
        task: f.goal.tasks[0]!, permissionMode: 'workspace-write' as const }
      const event = { type: 'task-acceptance-prepared' as const, taskId: f.input.taskId,
        binding: { ...f.binding, requirementsSnapshot: snapshot } }
      expect(parseGoalTaskAcceptanceEvent(event)).toEqual(event)
      for (const changed of [
        { ...snapshot, task: { ...snapshot.task, objective: 'replacement task' } },
        { ...snapshot, goal: { ...snapshot.goal, objective: 'replacement goal' } },
        { ...snapshot, goal: { ...snapshot.goal, context: 'later context' } },
        { ...snapshot, goal: { ...snapshot.goal, extra: 'unowned source' } },
        { ...snapshot, permissionMode: 'other-mode' },
      ]) expect(() => parseGoalTaskAcceptanceEvent({ ...event, binding: { ...event.binding, requirementsSnapshot: changed } })).toThrow()
      for (const changed of [
        { ...snapshot, goal: { ...snapshot.goal, workspaceRoot: 'D:/other-workspace' } },
        { ...snapshot, permissionMode: 'danger-full-access' as const },
      ]) expect(() => appendGoalTaskAcceptance({ ...f.input, expectedRevision: f.goal.revision,
        event: { ...event, binding: { ...event.binding, requirementsSnapshot: changed } } })).toThrow()
      expect(readLongGoal(f.root, f.goal.id)).toEqual(f.goal)
      const saved = appendGoalTaskAcceptance({ ...f.input, expectedRevision: f.goal.revision, event })
      expect(readLongGoal(f.root, f.goal.id)).toEqual(saved)
      expect(parseGoalTaskAcceptanceEvent({ ...event, binding: f.binding })).toEqual({ ...event, binding: f.binding })
    } finally { f.remove() }
  })
  it('rejects a prepared contract for a different native Goal without changing the original record', () => {
    const f = fixture()
    try {
      expect(() => appendGoalTaskAcceptance({ ...f.input, expectedRevision: f.goal.revision,
        event: { type: 'task-acceptance-prepared', taskId: f.input.taskId, binding: { ...f.binding, nativeGoalId: 'other-goal' } } })).toThrow()
      expect(readLongGoal(f.root, f.goal.id)).toEqual(f.goal)
    } finally { f.remove() }
  })
  it('preserves exact preparation/result on cold read and rejects duplicates or a different failed condition', () => {
    const f = fixture()
    try {
      const prepared = appendGoalTaskAcceptance({ ...f.input, expectedRevision: f.goal.revision,
        event: { type: 'task-acceptance-prepared', taskId: f.input.taskId, binding: f.binding } })
      const event = { type: 'task-acceptance-finished' as const, taskId: f.input.taskId, epoch: 1, preparationDigest: sha256(f.binding),
        endSeq: 10, materialDigest: sha256('actual-output-control'), outcome: { status: 'rejected' as const, detail: 'Original field absent.', failedRequiredConditionDigest: sha256(f.binding.requiredCondition) } }
      expect(() => appendGoalTaskAcceptance({ ...f.input, expectedRevision: prepared.revision,
        event: { ...event, outcome: { ...event.outcome, failedRequiredConditionDigest: sha256('another condition') } } })).toThrow()
      const finished = appendGoalTaskAcceptance({ ...f.input, expectedRevision: prepared.revision, event })
      expect(readLongGoal(f.root, f.goal.id)).toEqual(finished)
      expect(() => appendGoalTaskAcceptance({ ...f.input, expectedRevision: finished.revision, event })).toThrow()
      expect(readLongGoal(f.root, f.goal.id)).toEqual(finished)
    } finally { f.remove() }
  })
})
