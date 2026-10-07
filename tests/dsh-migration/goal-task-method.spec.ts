import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { goalTaskMethodMessage, parseGoalTaskMethodBinding, parseGoalTaskMethodScope, readGoalTaskMethodUsage } from '../../packages/tianwen-runtime-bundle/src/goal-task-method.js'

describe('Goal Task original method provenance', () => {
  it('rejects altered content, role, scope, version and post-request claims while preserving legacy absence', () => {
    const workspaceRoot = 'D:/original-workspace'
    const snapshot = { schemaVersion: 'tianwen.conversation-guidance.v1' as const, scopeKey: `conversation:${sha256({ cwd: workspaceRoot })}`,
      rules: { writing: 'Use only the original user facts.' } }
    const method = { protocol: 'tianwen.goal-task-method.v1' as const, scope: { family: 'writing' as const, evaluationMode: 'text' as const },
      snapshot, version: sha256(snapshot), consentRevision: 1, messageId: 'original-method', messageSeq: 3 }
    const binding = { method, epoch: 1, headerSeq: 4, requirementsSnapshot: { goal: { workspaceRoot }, task: { id: 'task' } } }
    const message = { type: 'user/message', seq: 3, data: { id: method.messageId, source: { kind: 'plugin', plugin: 'tianwen-goal-task-method' },
      content: [{ type: 'text', text: goalTaskMethodMessage('task', 1, method) }] } } as unknown as SessionEvent
    expect(readGoalTaskMethodUsage(binding, [message])).toMatchObject({ provision: 'provided', execution: 'unknown', version: method.version })
    expect(readGoalTaskMethodUsage({ ...binding, method: undefined }, [])).toBeUndefined()
    expect(() => parseGoalTaskMethodBinding({ ...method, version: sha256('different method') })).toThrow()
    expect(() => readGoalTaskMethodUsage({ ...binding, headerSeq: 3 }, [message])).toThrow()
    expect(() => readGoalTaskMethodUsage({ ...binding, requirementsSnapshot: { ...binding.requirementsSnapshot, goal: { workspaceRoot: 'D:/other' } } }, [message])).toThrow()
    for (const changed of [
      { ...message, seq: 2 },
      { ...message, data: { ...(message as any).data, source: { kind: 'user' } } },
      { ...message, data: { ...(message as any).data, content: [{ type: 'text', text: 'Forged actual use claim.' }] } },
    ]) expect(() => readGoalTaskMethodUsage(binding, [changed as SessionEvent])).toThrow()
    expect(() => readGoalTaskMethodUsage(binding, [message, message])).toThrow()
  })
  it('accepts only an explicit project task family and precise output mode', () => {
    expect(parseGoalTaskMethodScope({ family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' })).toEqual({ family: 'code', evaluationMode: 'local-files', fileOutputKind: 'files' })
    for (const value of [ { family: 'new-family', evaluationMode: 'text' }, { family: 'code', evaluationMode: 'local-files' },
      { family: 'code', evaluationMode: 'text', fileOutputKind: 'files' }, { family: 'writing', evaluationMode: 'text', method: 'arbitrary injected body' } ]) {
      expect(() => parseGoalTaskMethodScope(value)).toThrow()
    }
  })
})
