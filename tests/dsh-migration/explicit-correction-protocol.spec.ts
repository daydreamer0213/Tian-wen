import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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
    const tasks = protocol!.buildEvaluationTasks({ root, toolSchemaDigest: 'sha256:tool-surface' })

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

  it('fails closed when frozen execution inputs, sessions, or workspaces drift', () => {
    const protocol = resolveExplicitCorrectionProtocol(EXPLICIT_CORRECTION_PROTOCOL_SCOPE)!
    const root = fixtureRoot()
    const tasks = protocol.buildEvaluationTasks({ root, toolSchemaDigest: 'sha256:tool-surface' })
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
