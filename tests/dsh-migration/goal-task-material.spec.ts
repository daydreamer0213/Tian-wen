import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { readGoalTaskAcceptanceMaterial, readGoalTaskOutcomeMaterial } from '../../packages/tianwen-runtime-bundle/src/goal-task-material.js'
import { appendGoalTaskAcceptance, appendTianwenAttemptStarted, bindGoalFirstLongGoalTask, commitLongGoalPlan,
  createContinuousLongGoal } from '../../packages/tianwen-runtime-bundle/src/long-goal.js'
import type { LongGoalRecordV3 } from '../../packages/tianwen-runtime-bundle/src/long-goal-contract.js'
import type { GoalTaskAcceptanceBinding } from '../../packages/tianwen-runtime-bundle/src/goal-task-acceptance-contract.js'

const BASE = resolve('D:/DevData/tianwen-dsh-probe/goal-task-material')
function fixture(options: { legacy?: boolean; large?: boolean } = {}) {
  mkdirSync(BASE, { recursive: true })
  const root = mkdtempSync(join(BASE, 'control-'))
  const command = { type: 'command/run', seq: 0, data: { commandId: 'original-command', name: 'goal', source: { kind: 'user' }, args: 'Original requirement' } } as unknown as SessionEvent
  let goal = createContinuousLongGoal({ stateRoot: root, objective: 'Original requirement',
    context: options.large ? 'x'.repeat(512 * 1024) : 'Original context', successCriteria: 'Original success criterion', workspaceRoot: root,
    agentPreset: 'standard', controlSessionId: 'control',
    origin: { sessionId: 'control', commandId: 'original-command', commandSeq: 0, commandDigest: sha256(command) } })
  goal = commitLongGoalPlan({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, outcome: 'continue',
    tasks: [{ objective: 'Implement original requirement' }], consideredSettledTasks: 0 }) as LongGoalRecordV3
  const taskId = goal.tasks[0]!.id
  goal = appendTianwenAttemptStarted({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    epoch: 1, parentSessionId: goal.planner.sessionId, childSessionId: 'child', permissionFingerprint: sha256('permission'),
    permissionMode: 'workspace-write', startedAt: new Date().toISOString() })
  goal = bindGoalFirstLongGoalTask({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    execution: { sessionId: 'child', goalId: 'native-goal' } }) as LongGoalRecordV3
  const config = { provider: 'scripted', model: 'control' }
  const events = [
    { type: 'sandbox/mode', seq: 0, data: { mode: 'workspace-write' } },
    { type: 'request/header', seq: 1, data: { header: { config } } },
    { type: 'request/context', seq: 2, data: { request: 'Original native request' } },
    { type: 'tool/result', seq: 3, data: { value: 'Original tool result' } },
    { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'text', text: 'Original answer' }] } } },
    { type: 'turn/end', seq: 5, data: { reason: { kind: 'completed' } } },
  ] as unknown as SessionEvent[]
  const binding: GoalTaskAcceptanceBinding = {
    epoch: 1, parentSessionId: goal.planner.sessionId, childSessionId: 'child', nativeGoalId: 'native-goal', permissionFingerprint: sha256('permission'),
    goalDigest: sha256({ id: goal.id, objective: goal.objective, context: goal.context, successCriteria: goal.successCriteria, origin: goal.origin }),
    taskDigest: sha256(goal.tasks[0]), headerSeq: 1, preparedSeq: 2, prefixDigest: sha256(events.slice(0, 3)), modelConfigDigest: sha256(config),
    checkerId: 'original-assertion', checkerDigest: sha256('checker'), contractDigest: sha256('contract'), inputsDigest: sha256('inputs'),
    requiredCondition: 'Original criterion is met.', learningConsentRevision: 1,
    ...(options.legacy ? {} : { requirementsSnapshot: { goal: { id: goal.id, objective: goal.objective, context: goal.context,
      successCriteria: goal.successCriteria, workspaceRoot: root, origin: goal.origin! }, task: goal.tasks[0]!, permissionMode: 'workspace-write' as const } }),
  }
  goal = appendGoalTaskAcceptance({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    event: { type: 'task-acceptance-prepared', taskId, binding } })
  goal = appendGoalTaskAcceptance({ stateRoot: root, longGoalId: goal.id, expectedRevision: goal.revision, taskId,
    event: { type: 'task-acceptance-finished', taskId, epoch: 1, preparationDigest: sha256(binding), endSeq: 5,
      materialDigest: sha256(events), outcome: { status: 'verified', detail: 'Independent control assertion passed.' } } })
  let consent = { enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' }
  const logs = new Map([['control', { meta: { id: 'control', createdAt: 1 }, events: [command] }],
    ['child', { meta: { id: 'child', createdAt: 2, parentSession: goal.planner.sessionId, cwd: root }, events }]])
  const calls: string[] = []
  let afterRead: ((id: string) => void) | undefined
  const ctx = { sessionPersistence: { async inspect(id: string) {
    calls.push(String(id))
    const log = logs.get(String(id)); if (log === undefined) throw new Error('native log unavailable')
    const saved = structuredClone(log); afterRead?.(String(id)); return saved
  } }, tianwenEvolution: { getLearningAnalysisConsent() { return consent } } } as unknown as Context
  const reference = { stateRoot: root, goalId: goal.id, taskId, epoch: 1 }
  const path = join(root, 'long-goals', `${goal.id}.json`)
  return { root, path, goal, binding, logs, calls, ctx, reference,
    revoke() { consent = { ...consent, enabled: false, revision: 2 } },
    afterRead(fn: (id: string) => void) { afterRead = fn },
    remove() { const target = resolve(root); if (!target.startsWith(`${BASE}${sep}`)) throw new Error('cleanup outside owned fixture'); rmSync(target, { recursive: true, force: true }) },
  }
}

describe('original Goal Task learning material', () => {
  it('returns exact original source, requirements, check and full native events without rewriting records', async () => {
    const f = fixture()
    try {
      const before = readFileSync(f.path)
      const raw = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      const material = await readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: raw.outcomeInput! })
      expect(material).toEqual(raw)
      expect(material.requirementsSnapshot).toEqual(f.binding.requirementsSnapshot)
      expect(material.events).toEqual(f.logs.get('child')!.events)
      expect(f.calls).toEqual(['control', 'child', 'control', 'child'])
      ;(material.events as SessionEvent[]).pop()
      expect((await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)).events).toHaveLength(6)
      expect(readFileSync(f.path)).toEqual(before)
    } finally { f.remove() }
  })
  it('recovers frozen requirements after later Goal context and Task resolution changes', async () => {
    const f = fixture()
    try {
      const original = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      writeFileSync(f.path, JSON.stringify({ ...f.goal, context: 'Later context', tasks: f.goal.tasks.map(task => ({ ...task, resolution: 'abandoned' })) }))
      const changedRecord = readFileSync(f.path)
      expect(await readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: original.outcomeInput! })).toEqual(original)
      expect(readFileSync(f.path)).toEqual(changedRecord)
    } finally { f.remove() }
  })
  it('keeps legacy snapshots absent instead of substituting current requirements', async () => {
    const f = fixture({ legacy: true })
    try {
      const before = readFileSync(f.path)
      const original = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      expect(original).not.toHaveProperty('requirementsSnapshot')
      expect(await readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: original.outcomeInput! })).toEqual(original)
      expect(readFileSync(f.path)).toEqual(before)
    } finally { f.remove() }
  })
  it.each(['missing', 'prefix', 'result', 'cwd', 'source'] as const)('refuses changed or unavailable original native evidence: %s', async mode => {
    const f = fixture()
    try {
      const original = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      if (mode === 'missing') f.logs.delete('child')
      else if (mode === 'source') f.logs.get('control')!.events[0] = { ...f.logs.get('control')!.events[0]!, seq: 99 }
      else if (mode === 'cwd') Object.assign(f.logs.get('child')!.meta, { cwd: 'D:/other' })
      else { const offset = mode === 'prefix' ? 2 : 4; f.logs.get('child')!.events[offset] = { ...f.logs.get('child')!.events[offset]!, seq: 99 } }
      await expect(readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: original.outcomeInput! })).rejects.toThrow()
    } finally { f.remove() }
  })
  it('refuses a different ledger result and revocation during native reads', async () => {
    const f = fixture()
    try {
      const original = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      await expect(readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: { ...original.outcomeInput!, contractDigest: sha256('other-contract') } })).rejects.toThrow('differs from original')
      f.afterRead(id => { if (id === 'child') f.revoke() })
      await expect(readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: original.outcomeInput! })).rejects.toThrow('consent unavailable')
      const calls = f.calls.length
      await expect(readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: original.outcomeInput! })).rejects.toThrow('consent unavailable')
      expect(f.calls).toHaveLength(calls)
    } finally { f.remove() }
  })
  it('refuses oversized research material losslessly while keeping result intake available', async () => {
    const f = fixture({ large: true })
    try {
      const before = readFileSync(f.path)
      const material = await readGoalTaskAcceptanceMaterial(f.ctx, f.reference)
      expect(material.requirementsSnapshot!.goal.context).toHaveLength(512 * 1024)
      await expect(readGoalTaskOutcomeMaterial(f.ctx, { stateRoot: f.root, outcome: material.outcomeInput! })).rejects.toThrow('material-too-large')
      expect(readFileSync(f.path)).toEqual(before)
    } finally { f.remove() }
  })
})
