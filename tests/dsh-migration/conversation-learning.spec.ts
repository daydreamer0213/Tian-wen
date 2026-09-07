import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { baselineGuidanceSnapshot, guidanceVersion } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { parseConversationLearningRecord } from '../../packages/tianwen-evolution/src/conversation-learning.js'

const roots: string[] = []
function root() {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : resolve('tmp/conversation-tests')
  mkdirSync(base, { recursive: true })
  const directory = mkdtempSync(join(base, 'ledger-'))
  roots.push(directory)
  return directory
}
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function start(turn = 1) {
  return {
    kind: 'task-started' as const,
    taskId: `conversation-task:${sha256({ sessionId: 'normal-chat', lifecycle: sha256('lifecycle'), turn }).slice(7)}`,
    sessionId: 'normal-chat', sessionLifecycleFingerprint: sha256('lifecycle'),
    turn, startSeq: turn * 10, userMessageIds: [`request-${turn}`],
    requestDigest: sha256(`request ${turn}`), contextDigest: sha256(`context ${turn}`),
    scopeKey: 'workspace:test', consentRevision: 1, behaviorVersion: guidanceVersion(baselineGuidanceSnapshot('workspace:test')),
  }
}
const proof = { sessionId: 'native-reviewer', sessionDigest: sha256('reviewer'), requestDigest: sha256('review request') }
function admission(taskId: string, mode = 'text' as 'text' | 'external' | 'subjective') {
  return {
    kind: 'task-admitted' as const, taskId, proof,
    decision: { kind: 'task' as const, objective: 'Summarize the supplied measurements.', criteria: ['Retain the measured percentage and pilot-only scope.'], family: 'summarization' as const, evaluationMode: mode, relatedTaskId: null, feedback: null },
    unavailableReason: null,
  }
}
function finish(taskId: string, endSeq = 18) {
  return { kind: 'task-finished' as const, taskId, endSeq, status: 'completed' as const, assistantMessageIds: ['answer-1'], resultDigest: sha256('answer'), evidenceIds: [] }
}
function ledgerWithConsent(directory = root()) {
  const ledger = new EvolutionLedger(directory)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  return ledger
}

describe('natural conversation task evidence', () => {
  it('retains distinct later tasks in the same native Session and restores them without legacy Run bindings', () => {
    const directory = root()
    const ledger = ledgerWithConsent(directory)
    const first = start()
    const second = start(2)
    expect(ledger.recordConversationLearning(first)).toEqual({ duplicate: false })
    ledger.recordConversationLearning(admission(first.taskId))
    ledger.recordConversationLearning(finish(first.taskId))
    ledger.recordConversationLearning(second)
    const replay = new EvolutionLedger(directory)
    expect(replay.listConversationTasks('normal-chat').map(task => task.source.turn)).toEqual([1, 2])
    expect(replay.listConversationTasks('normal-chat')[0]?.completion?.assistantMessageIds).toEqual(['answer-1'])
    expect(replay.getRunBindingBySessionId('normal-chat')).toBeUndefined()
    expect(replay.recordConversationLearning(first)).toEqual({ duplicate: true })
    expect(replay.listEvents().filter(isPublicLedgerEvent).every(event => event.type === 'artifact-recorded')).toBe(true)
    expect(JSON.stringify(replay.listEvents().filter(isPublicLedgerEvent))).not.toContain(first.taskId)
    expect(() => replay.recordConversationLearning({ ...first, requestDigest: sha256('changed') })).toThrow(/changed|conflict/i)
  })

  it('rejects post-result criteria and a review attached to a different answer', () => {
    const ledger = ledgerWithConsent()
    const source = start()
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(finish(source.taskId))
    expect(() => ledger.recordConversationLearning(admission(source.taskId))).toThrow(/before|completed/i)

    const second = start(2)
    ledger.recordConversationLearning(second)
    const admitted = admission(second.taskId)
    ledger.recordConversationLearning(admitted)
    ledger.recordConversationLearning(finish(second.taskId, 28))
    expect(() => ledger.recordConversationLearning({
      kind: 'task-reviewed', taskId: second.taskId, proof,
      admissionDigest: sha256(admitted), resultDigest: sha256('another answer'),
      verdict: 'not-met', category: 'source-fidelity', explanation: 'The pilot scope was omitted.',
      evidenceQuotes: ['production'], unavailableReason: null,
    })).toThrow(/answer|result/i)
  })

  it('does not convert a subjective model opinion into verified user satisfaction', () => {
    const ledger = ledgerWithConsent()
    const source = start()
    const admitted = admission(source.taskId, 'subjective')
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(admitted)
    ledger.recordConversationLearning(finish(source.taskId))
    expect(() => ledger.recordConversationLearning({
      kind: 'task-reviewed', taskId: source.taskId, proof,
      admissionDigest: sha256(admitted), resultDigest: sha256('answer'),
      verdict: 'met', category: null, explanation: 'The user probably likes it.',
      evidenceQuotes: [], unavailableReason: null,
    })).toThrow(/subjective|satisfaction/i)
  })

  it('persists a review attempt before execution and prevents duplicate attempts after restart', () => {
    const directory = root()
    const ledger = ledgerWithConsent(directory)
    const source = start()
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(admission(source.taskId))
    ledger.recordConversationLearning(finish(source.taskId))
    const intent = { kind: 'task-review-started' as const, taskId: source.taskId, materialDigest: sha256('frozen review material') }
    ledger.recordConversationLearning(intent)
    const replay = new EvolutionLedger(directory)
    expect(replay.listConversationTasks()[0]?.reviewIntent).toEqual(intent)
    expect(replay.recordConversationLearning(intent)).toEqual({ duplicate: true })
    expect(() => replay.recordConversationLearning({ ...intent, materialDigest: sha256('changed') })).toThrow(/conflict|changed/i)
  })

  it('requires feedback to target an earlier completed task in the same conversation lifecycle', () => {
    const ledger = ledgerWithConsent()
    const first = start()
    ledger.recordConversationLearning(first)
    ledger.recordConversationLearning(admission(first.taskId))
    ledger.recordConversationLearning(finish(first.taskId))
    const second = start(2)
    ledger.recordConversationLearning(second)
    ledger.recordConversationLearning({ ...admission(second.taskId), decision: {
      ...admission(second.taskId).decision,
      relatedTaskId: first.taskId,
      feedback: { kind: 'correction', quote: 'You omitted that this was a pilot.', category: 'source-fidelity' },
    } })
    expect(ledger.listConversationTasks()[1]?.admission?.decision?.relatedTaskId).toBe(first.taskId)
    const third = start(3)
    ledger.recordConversationLearning(third)
    expect(() => ledger.recordConversationLearning({ ...admission(third.taskId), decision: {
      ...admission(third.taskId).decision, relatedTaskId: third.taskId,
    } })).toThrow(/earlier|source|target/i)
  })

  it('retains each observed native model epoch in append order, including an earlier shared header, and deduplicates after replay', () => {
    const directory = root()
    const ledger = ledgerWithConsent(directory)
    const source = start()
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(admission(source.taskId))
    const first = { kind: 'task-model-observed' as const, taskId: source.taskId, headerSeq: 3, modelConfigDigest: sha256('model A') }
    const changed = { ...first, headerSeq: 12, modelConfigDigest: sha256('model B') }
    expect(ledger.recordConversationLearning(first)).toEqual({ duplicate: false })
    expect(ledger.recordConversationLearning(first)).toEqual({ duplicate: true })
    expect(ledger.recordConversationLearning(changed)).toEqual({ duplicate: false })
    expect(ledger.listConversationTasks()[0]?.models).toEqual([first, changed])
    ledger.recordConversationLearning(finish(source.taskId))
    const second = start(2)
    ledger.recordConversationLearning(second)
    ledger.recordConversationLearning(admission(second.taskId))
    const sharedHeader = { ...changed, taskId: second.taskId }
    expect(ledger.recordConversationLearning(sharedHeader)).toEqual({ duplicate: false })
    ledger.recordConversationLearning(finish(second.taskId, 28))
    const replay = new EvolutionLedger(directory)
    expect(replay.listConversationTasks()[0]?.models).toEqual([first, changed])
    expect(replay.listConversationTasks()[1]?.models).toEqual([sharedHeader])
    expect(replay.recordConversationLearning(first)).toEqual({ duplicate: true })
    expect(() => replay.recordConversationLearning({ ...first, modelConfigDigest: sha256('rewritten model') })).toThrow(/changed|conflict/i)
    expect(replay.listConversationTasks()[0]?.models).toEqual([first, changed])
  })

  it('rejects a model observation before admission or after the result rather than backfilling execution evidence', () => {
    const ledger = ledgerWithConsent()
    const source = start()
    const observed = { kind: 'task-model-observed' as const, taskId: source.taskId, headerSeq: 3, modelConfigDigest: sha256('model') }
    ledger.recordConversationLearning(source)
    expect(() => ledger.recordConversationLearning(observed)).toThrow(/admission|admitted/i)
    ledger.recordConversationLearning(admission(source.taskId))
    ledger.recordConversationLearning(finish(source.taskId))
    expect(() => ledger.recordConversationLearning(observed)).toThrow(/before|completed/i)
    expect(ledger.listConversationTasks()[0]?.models).toBeUndefined()
  })

  it('parses only exact model observation fields with a positive native header sequence and a digest', () => {
    const observed = { kind: 'task-model-observed' as const, taskId: start().taskId, headerSeq: 3, modelConfigDigest: sha256('model') }
    expect(parseConversationLearningRecord(observed)).toEqual(observed)
    for (const headerSeq of [0, -1, 1.5]) expect(() => parseConversationLearningRecord({ ...observed, headerSeq })).toThrow()
    expect(() => parseConversationLearningRecord({ ...observed, modelConfigDigest: 'model A' })).toThrow()
    expect(() => parseConversationLearningRecord({ ...observed, config: { model: 'model A' } })).toThrow()
  })
})
