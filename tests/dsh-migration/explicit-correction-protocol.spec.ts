import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import * as runtimeBundle from '../../packages/tianwen-runtime-bundle/src/index.js'
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
      allowedTools: ['skill', 'verify_lifecycle'],
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
      ['eval-task:lifecycle-original-defect', 'session:controlled-eval:fixture:lifecycle:original-defect:baseline', 'session:controlled-eval:fixture:lifecycle:original-defect:candidate', 'session:controlled-eval:fixture:lifecycle:original-defect:evaluator'],
      ['eval-task:lifecycle-adjacent-transfer', 'session:controlled-eval:fixture:lifecycle:adjacent-transfer:baseline', 'session:controlled-eval:fixture:lifecycle:adjacent-transfer:candidate', 'session:controlled-eval:fixture:lifecycle:adjacent-transfer:evaluator'],
      ['eval-task:lifecycle-preserved-regression', 'session:controlled-eval:fixture:lifecycle:preserved-regression:baseline', 'session:controlled-eval:fixture:lifecycle:preserved-regression:candidate', 'session:controlled-eval:fixture:lifecycle:preserved-regression:evaluator'],
      ['eval-task:lifecycle-raw-extraction-counterexample', 'session:controlled-eval:fixture:lifecycle:raw-extraction-counterexample:baseline', 'session:controlled-eval:fixture:lifecycle:raw-extraction-counterexample:candidate', 'session:controlled-eval:fixture:lifecycle:raw-extraction-counterexample:evaluator'],
      ['eval-task:lifecycle-safety-boundary', 'session:controlled-eval:fixture:lifecycle:safety-boundary:baseline', 'session:controlled-eval:fixture:lifecycle:safety-boundary:candidate', 'session:controlled-eval:fixture:lifecycle:safety-boundary:evaluator'],
    ])
  })

  it('does not improvise a protocol for an unsupported scope', () => {
    expect(resolveExplicitCorrectionProtocol('project:tianwen/capability:other')).toBeUndefined()
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
    expect(laterProtocol.allowedTools).toEqual(['skill', 'verify_lifecycle'])
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
    expect(replayTasks[0]?.goal).toBe('Complete controlled lifecycle task 0.')
    expect(replayTransition.task.goal).toBe('Verify the active lifecycle promote pointer.')
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
        .update('controlled evaluation workspace 0\n', 'utf8')
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
      toolSchemas: [{ name: 'skill' }, { name: 'verify_lifecycle' }],
    })

    expect(() => protocol.assertFrozenExecution(execution, {
      callConfig: { provider: 'other', model: 'scripted' },
      retryPolicy: { mode: 'normal', maxRetries: 0 },
      toolSchemas: [{ name: 'skill' }, { name: 'verify_lifecycle' }],
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
})
