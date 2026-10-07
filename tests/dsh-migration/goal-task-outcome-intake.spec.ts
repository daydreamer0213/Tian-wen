import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import type { ConversationExternalCheckOutcome } from '../../packages/tianwen-evolution/src/conversation-external-check.js'

const BASE = resolve('D:/DevData/tianwen-dsh-probe/goal-task-outcome-intake')
function input(outcome: ConversationExternalCheckOutcome = { status: 'verified', detail: 'Original check passed.' }) {
  return { source: 'native-goal-task' as const, goalId: 'long-goal', taskId: 'task', epoch: 1,
    origin: { sessionId: 'direct-control', commandId: 'original-command', commandSeq: 2, commandDigest: sha256('command') },
    parentSessionId: 'planner', childSessionId: 'actual-child', nativeGoalId: 'native-goal',
    preparedSeq: 6, endSeq: 12, preparationDigest: sha256('preparation'), materialDigest: sha256('actual-sdk-events'),
    consentRevision: 1, modelConfigDigest: sha256('model'), checkerId: 'original-check', checkerDigest: sha256('checker'),
    contractDigest: sha256('contract'), inputsDigest: sha256('inputs'), requiredConditionDigest: sha256('original condition'), outcome }
}
function fixture() {
  mkdirSync(BASE, { recursive: true })
  const root = mkdtempSync(join(BASE, 'ledger-'))
  const ledger = new EvolutionLedger(root)
  return { root, ledger, enable() { ledger.recordLearningAnalysisConsent({ enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' }) },
    remove() { if (!resolve(root).startsWith(BASE + sep)) throw new Error('cleanup outside owned fixture'); rmSync(root, { recursive: true, force: true }) } }
}

describe('native Goal Task outcome in the existing Evolution ledger', () => {
  it.each([
    [{ status: 'verified', detail: 'passed' }, 'checked-success'],
    [{ status: 'rejected', detail: 'original condition failed', failedRequiredConditionDigest: sha256('original condition') }, 'checked-failure'],
    [{ status: 'rejected', detail: 'No proof of which condition failed.' }, 'unqualified-rejection'],
    [{ status: 'unverifiable', detail: 'check unavailable' }, 'unverifiable'],
  ] as const)('preserves %s as %s without claiming feedback, a study or activation', (outcome, classification) => {
    const f = fixture()
    try {
      f.enable()
      const original = input(outcome)
      const receipt = f.ledger.recordGoalTaskOutcome(original)
      expect(receipt).toMatchObject({ duplicate: false, classification })
      expect(f.ledger.listGoalTaskOutcomes()).toEqual([expect.objectContaining({ input: original, classification, sourceId: receipt.sourceId })])
      expect(f.ledger.listConversationTasks()).toHaveLength(0)
      expect(f.ledger.listLearningSignals()).toHaveLength(0)
      expect(f.ledger.listLearningTickets()).toHaveLength(0)
      expect(f.ledger.listConversationGuidanceStudies()).toHaveLength(0)
      expect(f.ledger.listEvents().filter(isPublicLedgerEvent)).toHaveLength(0)
    } finally { f.remove() }
  })
  it('requires exact current enabled v3 consent and rejects wrong original condition before mutation', () => {
    const f = fixture()
    try {
      expect(typeof f.ledger.recordGoalTaskOutcome).toBe('function')
      expect(() => f.ledger.recordGoalTaskOutcome(input())).toThrow()
      f.enable()
      const before = readFileSync(join(f.root, 'ledger.jsonl'), 'utf8')
      expect(() => f.ledger.recordGoalTaskOutcome({ ...input(), consentRevision: 2 })).toThrow()
      expect(() => f.ledger.recordGoalTaskOutcome(input({ status: 'rejected', detail: 'different', failedRequiredConditionDigest: sha256('new condition') }))).toThrow()
      expect(() => f.ledger.recordGoalTaskOutcome({ ...input(), source: 'dsh-tool-result' } as never)).toThrow()
      expect(readFileSync(join(f.root, 'ledger.jsonl'), 'utf8')).toBe(before)
      f.ledger.recordLearningAnalysisConsent({ enabled: false, revision: 2, policyVersion: 'tianwen-auto-analysis.v3' })
      expect(() => f.ledger.recordGoalTaskOutcome(input())).toThrow()
    } finally { f.remove() }
  })
  it('cold reads exact immutable records, deduplicates and rejects a changed result for the same attempt', () => {
    const f = fixture()
    try {
      f.enable()
      const original = input()
      const receipt = f.ledger.recordGoalTaskOutcome(original)
      const before = readFileSync(join(f.root, 'ledger.jsonl'), 'utf8')
      const cold = new EvolutionLedger(f.root)
      expect(cold.listGoalTaskOutcomes()).toEqual(f.ledger.listGoalTaskOutcomes())
      expect(cold.recordGoalTaskOutcome(original)).toEqual({ ...receipt, duplicate: true })
      expect(() => cold.recordGoalTaskOutcome({ ...original, materialDigest: sha256('changed') })).toThrow()
      expect(readFileSync(join(f.root, 'ledger.jsonl'), 'utf8')).toBe(before)
      const copy = cold.listGoalTaskOutcomes()[0]!
      ;(copy.input as { taskId: string }).taskId = 'changed by caller'
      expect(cold.listGoalTaskOutcomes()[0]!.input.taskId).toBe('task')
    } finally { f.remove() }
  })
})
