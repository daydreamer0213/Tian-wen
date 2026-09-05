import type {
  GovernedSkillCandidateId,
  LearningAnalysisId,
  LearningAnalysisPhase,
  TianwenRunId,
  LearningAnalysisSubmission,
} from '@tianwen/evolution'

type LearningCandidateHost = {
  getLearningAnalysis(analysisId: LearningAnalysisId): {
    readonly analysisId: LearningAnalysisId
    readonly phase: LearningAnalysisPhase
    readonly candidateId?: GovernedSkillCandidateId
    readonly submission?: {
      readonly verdict: 'no-case' | 'insufficient-evidence' | 'skill-change'
      readonly hypothesis: string
      readonly lesson?: {
        readonly claim: string
        readonly when: string
        readonly notWhen: string
      }
      readonly candidatePatch?: {
        readonly description: string
        readonly whenToUse: string
        readonly content: string
      }
      readonly supportingEvidenceIds: readonly `sha256:${string}`[]
      readonly counterevidenceIds: readonly `sha256:${string}`[]
      readonly reuseSource?: LearningAnalysisSubmission['reuseSource']
    }
  } | undefined
  openLearningAnalysisCase(analysisId: LearningAnalysisId): {
    readonly caseId: `case:${string}`
  }
  getLearningCase(caseId: `case:${string}`): {
    readonly caseId: `case:${string}`
    readonly parentSkillName: string
    readonly parentVersionId: `skill-version:${string}`
    readonly scopeKey: string
    readonly runIds: readonly TianwenRunId[]
  } | undefined
  getRunSkillManifest(runId: TianwenRunId): {
    readonly parentVersionId: `skill-version:${string}`
    readonly resolvedProvider: string
    readonly parent: {
      readonly name: string
      readonly description: string
      readonly whenToUse?: string
      readonly invocation: {
        readonly modelInvocable: boolean
        readonly userInvocable: boolean
      }
      readonly source: string
      readonly content: string
    }
  } | undefined
  recordAttribution(input: {
    readonly caseId: `case:${string}`
    readonly resolution: 'dsh-skill'
    readonly targetSkillName: string
    readonly hypothesis: string
    readonly supportingEvidenceIds: readonly `sha256:${string}`[]
    readonly counterevidenceIds: readonly `sha256:${string}`[]
    readonly alternatives: string
  }): { readonly attributionId: `attribution:${string}` }
  recordAcceptedLesson(input: {
    readonly caseId: `case:${string}`
    readonly attributionId: `attribution:${string}`
    readonly claim: string
    readonly when: string
    readonly notWhen: string
    readonly supportingEvidenceIds: readonly `sha256:${string}`[]
    readonly counterevidenceIds: readonly `sha256:${string}`[]
    readonly targetScope: string
  }): { readonly lessonId: `lesson:${string}` }
  recordSkillCandidate(input: {
    readonly lessonId: `lesson:${string}`
    readonly payload: {
      readonly name: string
      readonly description: string
      readonly whenToUse?: string
      readonly invocation: {
        readonly modelInvocable: boolean
        readonly userInvocable: boolean
      }
      readonly source: string
      readonly content: string
    }
    readonly evidenceIds: readonly `sha256:${string}`[]
  }): { readonly candidateId: GovernedSkillCandidateId }
  recordLearningAnalysisCandidateReady(input: {
    readonly analysisId: LearningAnalysisId
    readonly candidateId: GovernedSkillCandidateId
  }): { readonly phase: 'candidate-ready'; readonly candidateId: GovernedSkillCandidateId; readonly duplicate: boolean }
  recordLearningAnalysisProtocolUnavailable(analysisId: LearningAnalysisId): {
    readonly phase: 'protocol-unavailable'
    readonly duplicate: boolean
  }
}

export interface LearningCandidateMaterialization {
  readonly phase: LearningAnalysisPhase
  readonly candidateId?: GovernedSkillCandidateId
  readonly duplicate: boolean
}

/** Materialize only host-derived fields after the untrusted analysis is durable. */
export function materializeLearningCandidate(
  host: LearningCandidateHost,
  analysisId: LearningAnalysisId,
): LearningCandidateMaterialization {
  const status = host.getLearningAnalysis(analysisId)
  if (status === undefined) throw new Error('unknown learning analysis')
  if (status.phase !== 'running' || status.submission?.verdict !== 'skill-change') {
    return {
      phase: status.phase,
      ...(status.phase === 'candidate-ready' ? { candidateId: status.candidateId } : {}),
      duplicate: true,
    }
  }
  const submission = status.submission
  const lesson = submission.lesson
  const patch = submission.candidatePatch
  if (lesson === undefined || patch === undefined) {
    throw new Error('durable skill-change submission is incomplete')
  }
  let opened: ReturnType<LearningCandidateHost['openLearningAnalysisCase']>
  try {
    opened = host.openLearningAnalysisCase(analysisId)
  } catch (error) {
    try {
      const unavailable = host.recordLearningAnalysisProtocolUnavailable(analysisId)
      return { phase: unavailable.phase, duplicate: unavailable.duplicate }
    } catch {
      throw error
    }
  }
  const learningCase = host.getLearningCase(opened.caseId)
  const runId = learningCase?.runIds[0]
  const parentManifest = runId === undefined
    ? undefined
    : host.getRunSkillManifest(runId)
  if (
    learningCase === undefined
    || parentManifest === undefined
    || parentManifest.parentVersionId !== learningCase.parentVersionId
  ) {
    const unavailable = host.recordLearningAnalysisProtocolUnavailable(analysisId)
    return { phase: unavailable.phase, duplicate: unavailable.duplicate }
  }
  const payload = {
    ...parentManifest.parent,
    description: patch.description,
    whenToUse: patch.whenToUse,
    content: patch.content,
  }
  if (
    payload.name !== parentManifest.parent.name
    || payload.source !== parentManifest.parent.source
    || JSON.stringify(payload.invocation) !== JSON.stringify(parentManifest.parent.invocation)
  ) throw new Error('learning Candidate escaped the allowed Skill fields')
  const attribution = host.recordAttribution({
    caseId: learningCase.caseId,
    resolution: 'dsh-skill',
    targetSkillName: learningCase.parentSkillName,
    hypothesis: submission.hypothesis,
    supportingEvidenceIds: submission.supportingEvidenceIds,
    counterevidenceIds: submission.counterevidenceIds,
    alternatives: submission.reuseSource === undefined
      ? 'No non-Skill cause is accepted by this bounded analysis.'
      : `Narrow adaptation of an inspected source; original parent and scope preserved. ${JSON.stringify(submission.reuseSource)}`,
  })
  const accepted = host.recordAcceptedLesson({
    caseId: learningCase.caseId,
    attributionId: attribution.attributionId,
    claim: lesson.claim,
    when: lesson.when,
    notWhen: lesson.notWhen,
    supportingEvidenceIds: submission.supportingEvidenceIds,
    counterevidenceIds: submission.counterevidenceIds,
    targetScope: learningCase.scopeKey,
  })
  const candidate = host.recordSkillCandidate({
    lessonId: accepted.lessonId,
    payload,
    evidenceIds: [
      ...submission.supportingEvidenceIds,
      ...submission.counterevidenceIds,
    ],
  })
  const ready = host.recordLearningAnalysisCandidateReady({
    analysisId,
    candidateId: candidate.candidateId,
  })
  return {
    phase: ready.phase,
    candidateId: ready.candidateId,
    duplicate: ready.duplicate,
  }
}
