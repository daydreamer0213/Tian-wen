import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { LearningAnalysisSubmission } from '@tianwen/evolution'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { materializeLearningCandidate } from '../../packages/tianwen-runtime-bundle/src/learning-candidate.js'

const roots: string[] = []
const lifecycle = `sha256:${'a'.repeat(64)}` as const
const evidenceA = `sha256:${'1'.repeat(64)}` as const
const evidenceB = `sha256:${'2'.repeat(64)}` as const
const siblingEvidence = `sha256:${'3'.repeat(64)}` as const
const parentSkill = {
  name: 'research-summary',
  description: 'Summarize one verified research observation.',
  whenToUse: 'When a result needs a concise research summary.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'runtime',
  content: '# Research summary\n\nState the observed result before interpretation.',
} as const

function root(prefix: string): string {
  const parent = resolve(process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe', 'learning-candidate')
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

function submission(
  patch: Partial<LearningAnalysisSubmission> = {},
): LearningAnalysisSubmission {
  return {
    verdict: 'skill-change',
    hypothesis: 'The answer omitted a concrete verification step.',
    lesson: {
      claim: 'State the verification step.',
      when: 'A task changes durable state.',
      notWhen: 'The user asks only for an explanation.',
    },
    candidatePatch: {
      description: 'Require concrete verification.',
      whenToUse: 'Use after a durable change.',
      content: 'Run the bounded check and report its observed result.',
    },
    supportingEvidenceIds: [evidenceA],
    counterevidenceIds: [evidenceB],
    ...patch,
  }
}

function seeded(prefix: string, options: { readonly manifest?: boolean } = {}) {
  const ledger = new EvolutionLedger(root(prefix), {
    clock: () => '2026-09-02T00:00:00.000Z',
  })
  ledger.recordLearningAnalysisConsent({
    revision: 1,
    enabled: true,
    policyVersion: 'tianwen-auto-analysis.v1',
  })
  const binding = ledger.recordRunBinding({
    goalRef: 'goal:research-summary',
    taskRef: 'task:research-summary',
    sessionId: 'main-session',
    scopeKey: 'project:tianwen/capability:research-summary',
    acceptanceContract: {
      source: 'dsh-tool-result',
      toolName: 'verify_summary',
      notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
      gapDisposition: 'reusable',
      problemCategory: 'summary-omits-required-result',
      severity: 2,
      blocksGoal: false,
    },
    sessionLifecycleFingerprint: lifecycle,
  })
  if (options.manifest !== false) {
    ledger.recordRunSkillManifest({ runId: binding.runId, skill: parentSkill })
  }
  const intake = ledger.recordLearningFeedbackRevision({
    intake: {
      sessionId: 'main-session',
      messageId: 'assistant-message',
      feedbackVersion: 'feedback-v1',
      rating: 'negative',
      note: 'Keep the answer concrete.',
      scopeKey: 'project:tianwen/capability:research-summary',
      sessionDigest: `sha256:${'0'.repeat(64)}`,
      evidenceIds: [evidenceA, evidenceB],
    },
    sessionLifecycleFingerprint: lifecycle,
    analysisConsentRevision: 1,
  })
  const requested = ledger.requestLearningAnalysis({
    ticketId: intake.ticketId!,
    sessionId: 'main-session',
    messageId: 'assistant-message',
    feedbackVersion: 'feedback-v1',
    consentRevision: 1,
    parentSessionId: 'main-session',
  })
  ledger.recordLearningAnalysisChildStarted({
    analysisId: requested.analysisId,
    parentSessionId: requested.parentSessionId,
    childSessionId: requested.childSessionId,
  })
  return { ledger, requested, binding }
}

function submit(subject: ReturnType<typeof seeded>, value = submission()) {
  subject.ledger.recordLearningAnalysisSubmission({
    analysisId: subject.requested.analysisId,
    childSessionId: subject.requested.childSessionId,
    submission: value,
  })
}

function recordSiblingCorrection(
  subject: ReturnType<typeof seeded>,
  input: { readonly messageId: string; readonly feedbackVersion: string },
) {
  subject.ledger.recordLearningFeedbackRevision({
    intake: {
      sessionId: 'main-session',
      messageId: input.messageId,
      feedbackVersion: input.feedbackVersion,
      rating: 'negative',
      note: 'Keep the answer concrete.',
      scopeKey: 'project:tianwen/capability:research-summary',
      sessionDigest: `sha256:${'4'.repeat(64)}`,
      evidenceIds: [siblingEvidence],
    },
    sessionLifecycleFingerprint: lifecycle,
    analysisConsentRevision: 1,
  })
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('bounded explicit-correction Skill Candidate materialization', () => {
  it('leaves no-case and insufficient-evidence analyses without a Candidate', () => {
    for (const verdict of ['no-case', 'insufficient-evidence'] as const) {
      const subject = seeded(verdict)
      submit(subject, {
        verdict,
        hypothesis: 'No governed Skill change is justified.',
        supportingEvidenceIds: [],
        counterevidenceIds: [],
      })

      expect(materializeLearningCandidate(subject.ledger, subject.requested.analysisId))
        .toMatchObject({ phase: verdict })
      expect(subject.ledger.listSkillCandidates()).toEqual([])
    }
  })

  it('records one bounded Candidate from the exact bound parent manifest and replays it', () => {
    const subject = seeded('valid')
    submit(subject)

    const first = materializeLearningCandidate(subject.ledger, subject.requested.analysisId)
    const replay = materializeLearningCandidate(subject.ledger, subject.requested.analysisId)
    const candidate = subject.ledger.getSkillCandidate(first.candidateId!)

    expect(first).toMatchObject({ phase: 'candidate-ready', duplicate: false })
    expect(replay).toEqual({ ...first, duplicate: true })
    expect(candidate).toMatchObject({
      payload: {
        name: parentSkill.name,
        source: parentSkill.source,
        invocation: parentSkill.invocation,
        description: 'Require concrete verification.',
        whenToUse: 'Use after a durable change.',
        content: 'Run the bounded check and report its observed result.',
      },
      evidenceIds: [evidenceA, evidenceB],
    })
  })

  it('rejects a sibling message Evidence before it can lock the analysis running', () => {
    const subject = seeded('sibling-message')
    recordSiblingCorrection(subject, {
      messageId: 'sibling-message',
      feedbackVersion: 'feedback-v1',
    })

    expect(() => submit(subject, submission({
      supportingEvidenceIds: [siblingEvidence],
      counterevidenceIds: [],
    }))).toThrow(/Evidence closure/u)

    submit(subject)
    expect(materializeLearningCandidate(subject.ledger, subject.requested.analysisId))
      .toMatchObject({ phase: 'candidate-ready' })
  })

  it('rejects a sibling feedback-version Evidence before it can lock the analysis running', () => {
    const subject = seeded('sibling-version')
    recordSiblingCorrection(subject, {
      messageId: 'sibling-version',
      feedbackVersion: 'feedback-v2',
    })

    expect(() => submit(subject, submission({
      supportingEvidenceIds: [siblingEvidence],
      counterevidenceIds: [],
    }))).toThrow(/Evidence closure/u)

    submit(subject)
    expect(materializeLearningCandidate(subject.ledger, subject.requested.analysisId))
      .toMatchObject({ phase: 'candidate-ready' })
  })

  it('binds the Candidate to the exact Run manifest when an otherwise-equal provider differs', () => {
    const subject = seeded('exact-manifest')
    const other = subject.ledger.recordRunBinding({
      goalRef: 'goal:other-research-summary',
      taskRef: 'task:other-research-summary',
      sessionId: 'other-session',
      scopeKey: 'project:tianwen/capability:research-summary',
      acceptanceContract: {
        source: 'dsh-tool-result',
        toolName: 'verify_summary',
        notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
        gapDisposition: 'reusable',
        problemCategory: 'summary-omits-required-result',
        severity: 2,
        blocksGoal: false,
      },
      sessionLifecycleFingerprint: `sha256:${'5'.repeat(64)}`,
    })
    const otherManifest = subject.ledger.recordRunSkillManifest({
      runId: other.runId,
      skill: { ...parentSkill, provider: 'other-provider' },
    })
    const exactManifest = subject.ledger.getRunSkillManifest(subject.binding.runId)!
    submit(subject)

    const result = materializeLearningCandidate(subject.ledger, subject.requested.analysisId)
    const candidate = subject.ledger.getSkillCandidate(result.candidateId!)!

    expect(candidate.parentVersionId).toBe(exactManifest.parentVersionId)
    expect(candidate.parentVersionId).not.toBe(otherManifest.parentVersionId)
    expect(candidate.payload).toMatchObject({
      name: parentSkill.name,
      source: parentSkill.source,
      invocation: parentSkill.invocation,
    })
  })

  it('requires active supporting Evidence but retains an empty counterevidence set unchanged', () => {
    const subject = seeded('support-only')
    submit(subject, submission({ counterevidenceIds: [] }))

    const result = materializeLearningCandidate(subject.ledger, subject.requested.analysisId)

    expect(result).toMatchObject({ phase: 'candidate-ready' })
    expect(subject.ledger.getSkillCandidate(result.candidateId!)?.evidenceIds)
      .toEqual([evidenceA])
  })

  it('stops as protocol-unavailable when the exact Run lacks its parent Skill manifest', () => {
    const subject = seeded('missing-manifest', { manifest: false })
    submit(subject)

    expect(materializeLearningCandidate(subject.ledger, subject.requested.analysisId))
      .toMatchObject({ phase: 'protocol-unavailable' })
    expect(subject.ledger.listSkillCandidates()).toEqual([])
  })

  it('rejects model attempts to change frozen Skill identity fields', () => {
    const subject = seeded('frozen-fields')
    expect(() => submit(subject, {
      ...submission(),
      candidatePatch: {
        ...submission().candidatePatch!,
        name: 'other-skill',
      } as never,
    })).toThrow(/submission is invalid/u)
    expect(() => submit(subject, {
      ...submission(),
      candidatePatch: {
        ...submission().candidatePatch!,
        provider: 'other-provider',
        invocation: { modelInvocable: false, userInvocable: false },
      } as never,
    })).toThrow(/submission is invalid/u)
  })

  it('rejects oversized or wrong Evidence before it can form a Candidate', () => {
    const subject = seeded('bounded')
    expect(() => submit(subject, submission({
      candidatePatch: {
        ...submission().candidatePatch!,
        content: 'x'.repeat(16 * 1024 + 1),
      },
    }))).toThrow(/submission is invalid/u)
    expect(() => submit(subject, submission({
      supportingEvidenceIds: [`sha256:${'f'.repeat(64)}`],
      counterevidenceIds: [],
    }))).toThrow(/Evidence closure/u)
  })

  it('does not materialize a Candidate when the only explicit correction was retracted', () => {
    const subject = seeded('retracted')
    submit(subject)
    subject.ledger.recordLearningFeedbackRetraction({
      sessionId: 'main-session',
      messageId: 'assistant-message',
      retractedFeedbackVersion: 'feedback-v1',
      sessionLifecycleFingerprint: lifecycle,
    })

    expect(materializeLearningCandidate(subject.ledger, subject.requested.analysisId))
      .toMatchObject({ phase: 'invalidated' })
    expect(subject.ledger.listSkillCandidates()).toEqual([])
  })
})
