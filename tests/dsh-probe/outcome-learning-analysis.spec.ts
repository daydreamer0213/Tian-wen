import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/index.js'
import { RESEARCH_SUMMARY_BASE_SKILL } from '../../packages/tianwen-runtime/src/research-summary.js'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const parent = 'D:/DevData/tianwen-dsh-probe/outcome-learning-analysis'
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'ledger-'))
  roots.push(root)
  const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v2' })
  function run(sessionId: string, verdict: 'met' | 'not-met') {
    const { runId } = ledger.recordRunBinding({
      sessionId, goalRef: 'goal:summary', taskRef: 'task:summary',
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: { source: 'dsh-tool-result', toolName: 'submit_research_summary', notMetErrorCode: 'NOT_MET',
        gapDisposition: 'reusable', problemCategory: 'research-summary-result.v1:test-parent', severity: 2, blocksGoal: false },
    })
    const manifest = ledger.recordRunSkillManifest({ runId, skill: RESEARCH_SUMMARY_BASE_SKILL })
    const evidenceId = sha256({ sessionId, kind: 'acceptance' })
    const receipt = ledger.recordOutcomeIntake({ runId, verdict, sessionDigest: sha256(sessionId), evidenceIds: [evidenceId] })
    ledger.recordRunSkillUse({ runId, parentVersionId: manifest.parentVersionId, sessionId, sessionDigest: sha256(sessionId),
      skillName: RESEARCH_SUMMARY_BASE_SKILL.name, contentDigest: ledger.getRunSkillManifest(runId)!.contentDigest,
      skillEvidenceId: sha256({ sessionId, kind: 'skill' }), acceptanceEvidenceId: evidenceId,
      skillCallSeq: 1, skillResultSeq: 2, acceptanceCallSeq: 3 })
    return { runId, evidenceId, receipt }
  }
  return { ledger, root, run }
}

describe('outcome-origin learning analysis', () => {
  it('freezes repeated support and a successful counterexample without fabricating feedback', () => {
    const { ledger, root, run } = fixture()
    const a = run('main-a', 'not-met')
    const counter = run('main-success', 'met')
    const b = run('main-b', 'not-met')
    const input = { ticketId: b.receipt.ticketId!, sessionId: 'main-b', parentSessionId: 'main-b', consentRevision: 1,
      counterevidenceRunIds: [counter.runId] }
    const analysis = ledger.requestOutcomeLearningAnalysis(input)
    expect(analysis).toMatchObject({ source: 'outcome', phase: 'pending-parent' })
    expect(analysis).not.toHaveProperty('messageId')
    expect(analysis).not.toHaveProperty('feedbackVersion')
    expect(ledger.getLearningAnalysisEvidenceIds(analysis.analysisId).sort()).toEqual([a.evidenceId, b.evidenceId, counter.evidenceId].sort())
    run('main-c', 'not-met')
    expect(ledger.requestOutcomeLearningAnalysis(input)).toMatchObject({ duplicate: true, analysisId: analysis.analysisId })
    expect(new EvolutionLedger(root).getLearningAnalysis(analysis.analysisId)).toEqual(ledger.getLearningAnalysis(analysis.analysisId))
    ledger.recordLearningAnalysisChildStarted({ analysisId: analysis.analysisId, parentSessionId: 'main-b', childSessionId: analysis.childSessionId })
    const incomplete = { verdict: 'skill-change' as const, hypothesis: 'Check evidence roles before freezing the answer.',
      lesson: { claim: 'Keep decision uncertainties.', when: 'Research.', notWhen: 'Raw extraction.' },
      candidatePatch: { description: 'Summary.', whenToUse: 'Research.', content: '# Summary' },
      supportingEvidenceIds: [a.evidenceId], counterevidenceIds: [] }
    for (const submission of [incomplete, { ...incomplete, supportingEvidenceIds: [counter.evidenceId], counterevidenceIds: [a.evidenceId] }]) {
      expect(() => ledger.recordLearningAnalysisSubmission({ analysisId: analysis.analysisId, childSessionId: analysis.childSessionId, submission })).toThrow()
      expect(ledger.getLearningAnalysis(analysis.analysisId)?.submission).toBeUndefined()
    }
    ledger.recordLearningAnalysisSubmission({ analysisId: analysis.analysisId, childSessionId: analysis.childSessionId,
      submission: { verdict: 'skill-change', hypothesis: 'The repeated gap is a Skill instruction problem.',
        lesson: { claim: 'Keep decision uncertainties.', when: 'Summarizing bounded research.', notWhen: 'Raw extraction.' },
        candidatePatch: { description: 'Bounded summary.', whenToUse: 'Research packets.', content: '# Summary\nKeep decision uncertainties.' },
        supportingEvidenceIds: [a.evidenceId, b.evidenceId], counterevidenceIds: [counter.evidenceId] } })
    const opened = ledger.openLearningAnalysisCase(analysis.analysisId)
    expect(ledger.getLearningCase(opened.caseId)?.runIds.sort()).toEqual([a.runId, b.runId].sort())
    expect(new EvolutionLedger(root).getLearningCase(opened.caseId)).toEqual(ledger.getLearningCase(opened.caseId))
  })

  it('does not reuse feedback-only consent for cross-task analysis', () => {
    const { ledger, run } = fixture()
    ledger.recordLearningAnalysisConsent({ revision: 2, enabled: true, policyVersion: 'tianwen-auto-analysis.v1' })
    run('first', 'not-met')
    const second = run('second', 'not-met')
    expect(() => ledger.requestOutcomeLearningAnalysis({ ticketId: second.receipt.ticketId!, sessionId: 'second', parentSessionId: 'second',
      consentRevision: 2, counterevidenceRunIds: [] })).toThrow(/consent/i)
  })
})
