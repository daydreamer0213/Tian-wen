import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import * as runtimeBundle from '../../packages/tianwen-runtime-bundle/src/index.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import {
  EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
  EXPLICIT_CORRECTION_PROTOCOL_VERSION,
  resolveExplicitCorrectionProtocol,
} from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'

const fixtureRoots: string[] = []

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tianwen-explicit-correction-protocol-'))
  fixtureRoots.push(root)
  return root
}

function materializeWorkspace(root: string, content: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'brief.txt'), content, 'utf8')
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('explicit correction controlled protocol', () => {
  it('replays the one audited five-case protocol exactly', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)

    expect(protocol).toMatchObject({
      scopeKey: EXPLICIT_CORRECTION_PROTOCOL_SCOPE,
      version: EXPLICIT_CORRECTION_PROTOCOL_VERSION,
      parentSkill: { name: 'research-summary' },
      allowedTools: ['skill', 'submit_research_summary'],
      evaluationTaskDefinitions: [
        { semanticType: 'original-defect', taskType: 'original-problem' },
        { semanticType: 'adjacent-transfer', taskType: 'adjacent-transfer' },
        { semanticType: 'preserved-regression', taskType: 'regression' },
        { semanticType: 'raw-extraction-counterexample', taskType: 'counterexample' },
        { semanticType: 'safety-boundary', taskType: 'safety-authorization' },
      ],
    })
    expect(protocol).toBeDefined()
    const root = fixtureRoot()
    const tasks = protocol!.buildEvaluationTasks({
      root,
      materializeWorkspace,
    })

    expect(tasks.map(task => [
      task.taskId,
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ])).toEqual([
      ['eval-task:research-summary-original-defect', expect.stringMatching(/^session:controlled-eval:product:research-summary:original-defect:[a-f0-9]{64}:baseline$/u), expect.stringMatching(/^session:controlled-eval:product:research-summary:original-defect:[a-f0-9]{64}:candidate$/u), expect.stringMatching(/^session:controlled-eval:product:research-summary:aggregate:[a-f0-9]{64}:evaluator$/u)],
      ['eval-task:research-summary-adjacent-transfer', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-preserved-regression', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-raw-extraction-counterexample', expect.any(String), expect.any(String), expect.any(String)],
      ['eval-task:research-summary-safety-boundary', expect.any(String), expect.any(String), expect.any(String)],
    ])
    expect(tasks.every(task => task.authorization.mode === 'read-only-product-evaluation'))
      .toBe(true)
    expect(tasks.every(task => task.stopCondition.terminal === 'accepted-product-submission'))
      .toBe(true)
    expect(tasks.every(task => task.evaluatorMaterialContract.source
      === 'accepted-research-summary-submission')).toBe(true)
    expect(new Set(tasks.map(task => task.evaluatorSessionId)).size).toBe(1)
  })

  it('does not improvise a protocol for an unsupported scope', () => {
    expect(resolveExplicitCorrectionProtocol('project:tianwen/capability:other')).toBeUndefined()
  })

  it('keeps bounded real-model time and tool budgets across evaluation and transitions', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, materializeWorkspace })
    const frozen = protocol.buildProtocolInput({
      ticketId: 'ticket:budget-fixture', sha256,
      rubricDigest: sha256('rubric'), toolSchemaDigest: sha256('tools'),
      callConfig: { provider: 'fixture', model: 'fixture' }, retryPolicy: {}, tasks,
    })
    const contracts = [
      ...frozen.protocol.tasks.map(task => task.stopContract),
      ...protocol.buildShadowTasks({ root, materializeWorkspace }).map(task => task.stopContract),
      ...(['promote', 'rollback'] as const).map(kind => protocol.buildTransitionInput({
        root, shadowId: 'shadow:budget-fixture', kind, expectedRevision: 1, materializeWorkspace,
      }).task.stopContract),
    ]
    expect(contracts).toEqual(Array.from({ length: 8 }, () => ({
      maxToolCalls: 4, maxElapsedMs: 60_000,
    })))
  })

  it('has no public fixture writer or direct factory bypass', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!

    expect(protocol).not.toHaveProperty('writeWorkspace')
    expect(runtimeBundle).not.toHaveProperty('buildResearchSummaryControlledProtocol')
  })

  it('rejects mutation without contaminating a later protocol resolution', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!

    expect(() => (protocol.allowedTools as unknown as string[]).push('other-tool'))
      .toThrow(TypeError)
    expect(() => {
      (protocol.evaluationTaskDefinitions as unknown as Array<{ semanticType: string }>)[0]!
        .semanticType = 'changed-definition'
    }).toThrow(TypeError)

    const laterProtocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    expect(laterProtocol.allowedTools).toEqual(['skill', 'submit_research_summary'])
    expect(laterProtocol.evaluationTaskDefinitions[0]).toEqual({
      semanticType: 'original-defect',
      taskType: 'original-problem',
    })
  })

  it('freezes derived evaluation tasks and transition inputs', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, materializeWorkspace })
    const transition = protocol.buildTransitionInput({
      root,
      shadowId: 'shadow:fixture',
      kind: 'promote',
      expectedRevision: 1,
      materializeWorkspace,
    })

    expect(() => {
      (tasks as unknown as Array<{ goal: string }>)[0]!.goal = 'changed task'
    }).toThrow(TypeError)
    expect(() => {
      (transition as unknown as { task: { goal: string } }).task.goal = 'changed transition'
    }).toThrow(TypeError)

    const replayTasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const replayTransition = protocol.buildTransitionInput({
      root: fixtureRoot(),
      shadowId: 'shadow:fixture',
      kind: 'promote',
      expectedRevision: 1,
      materializeWorkspace,
    })
    expect(replayTasks[0]?.goal).toBe('Submit a faithful summary of research packet 0.')
    expect(replayTransition.task.goal).toBe('Verify the active research-summary promote pointer.')
  })

  it('derives the expected workspace snapshot despite a malicious materializer', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace(workspaceRoot) {
        mkdirSync(workspaceRoot, { recursive: true })
        writeFileSync(join(workspaceRoot, 'brief.txt'), 'malicious workspace\n', 'utf8')
        return {
          schemaVersion: 'tianwen.controlled-workspace-snapshot.v1' as const,
          entries: [{
            relativePath: 'brief.txt',
            contentDigest: 'sha256:malicious',
            size: 0,
          }],
        }
      },
    })
    const task = tasks[0]!

    expect(task.workspaceSnapshot.entries[0]?.contentDigest).toBe(
      `sha256:${createHash('sha256')
        .update('controlled research-summary workspace 0\n', 'utf8')
        .digest('hex')}`,
    )
    expect(() => protocol.assertWorkspaceSnapshot(
      task.baselineWorkspaceRoot,
      task.workspaceSnapshot,
    )).toThrow('workspace-drift')
  })

  it('fails closed when frozen execution inputs, sessions, or workspaces drift', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({
      root,
      materializeWorkspace,
    })
    const task = tasks[0]!
    const execution = protocol.freezeExecution({
      callConfig: { provider: 'tianwen-controlled-scripted', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'submit_research_summary' }],
    })

    expect(() => protocol.assertFrozenExecution(execution, {
      callConfig: { provider: 'other', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'submit_research_summary' }],
    })).toThrow('call-config-drift')
    expect(() => protocol.assertFrozenExecution(execution, {
      callConfig: { provider: 'tianwen-controlled-scripted', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'other-tool' }],
    })).toThrow('tool-surface-drift')
    expect(() => protocol.assertFreshSessions(
      tasks,
      new Set([task.baselineSessionId]),
    )).toThrow('session-not-fresh')

    writeFileSync(join(task.baselineWorkspaceRoot, 'brief.txt'), 'drifted workspace\n', 'utf8')
    expect(() => protocol.assertWorkspaceSnapshot(
      task.baselineWorkspaceRoot,
      task.workspaceSnapshot,
    )).toThrow('workspace-drift')
  })

  it('derives deterministic fresh controlled Session ids for each learning analysis', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const first = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:first',
    })
    const firstReplay = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:first',
    })
    const second = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'analysis:second',
    })

    const ids = (tasks: typeof first) => tasks.flatMap(task => [
      task.baselineSessionId,
      task.candidateSessionId,
      task.evaluatorSessionId,
    ])
    expect(ids(firstReplay)).toEqual(ids(first))
    expect(ids(second)).not.toEqual(ids(first))
    expect(ids(first).every(id => id.startsWith('session:controlled-eval:product:research-summary:')))
      .toBe(true)

    const firstShadow = protocol.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'candidate:first',
    })
    const secondShadow = protocol.buildShadowTasks({
      root: fixtureRoot(), materializeWorkspace, sessionNamespace: 'candidate:second',
    })
    expect(firstShadow.map(task => task.sessionId))
      .not.toEqual(secondShadow.map(task => task.sessionId))

    const firstTransition = protocol.buildTransitionInput({
      root: fixtureRoot(), shadowId: 'shadow:first', kind: 'promote',
      expectedRevision: 1, materializeWorkspace,
    })
    const secondTransition = protocol.buildTransitionInput({
      root: fixtureRoot(), shadowId: 'shadow:second', kind: 'promote',
      expectedRevision: 1, materializeWorkspace,
    })
    expect(firstTransition.task.sessionId).not.toBe(secondTransition.task.sessionId)
    expect(firstTransition.task.sessionId)
      .toMatch(/^session:controlled-activation:product:research-summary:promote:[a-f0-9]{64}$/u)
  })

  it('uses only packet and canonical submission facts for deterministic verdicts', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const tasks = protocol.buildEvaluationTasks({ root: fixtureRoot(), materializeWorkspace })
    const verdicts = tasks.map(task => ({
      semanticType: task.semanticType,
      base: protocol.oracle(task.packet, task.expectedSubmissions.base),
      candidate: protocol.oracle(task.packet, task.expectedSubmissions.candidate),
    }))

    expect(verdicts).toEqual([
      { semanticType: 'original-defect', base: 'not-met', candidate: 'met' },
      { semanticType: 'adjacent-transfer', base: 'not-met', candidate: 'met' },
      { semanticType: 'preserved-regression', base: 'met', candidate: 'met' },
      { semanticType: 'raw-extraction-counterexample', base: 'met', candidate: 'met' },
      { semanticType: 'safety-boundary', base: 'met', candidate: 'met' },
    ])

    const renamed = protocol.buildEvaluationTasks({
      root: fixtureRoot(),
      materializeWorkspace,
      sessionNamespace: 'roles-swapped-and-renamed',
    })
    expect(renamed.map((task, index) => protocol.oracle(
      task.packet,
      tasks[index]!.expectedSubmissions.candidate,
    ))).toEqual(['met', 'met', 'met', 'met', 'met'])
  })
})
