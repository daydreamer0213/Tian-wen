import type { LearningAnalysisPhase, LearningAnalysisStatus } from '@tianwen/evolution'

/** A deliberately narrow projection; it never copies correction text or transcripts. */
export interface LearningAuditItem {
  readonly analysisId: string
  readonly ticketId: string
  readonly phase: LearningAnalysisPhase
  readonly requestedAt: string
  readonly updatedAt: string
  readonly evidenceDigests: readonly string[]
  readonly receipts: {
    readonly candidateId?: string
    readonly evaluationId?: string
    readonly evaluationResultDigest?: string
    readonly shadowId?: string
    readonly shadowResultDigest?: string
    readonly promotionRecommendationDigest?: string
    readonly promotionTransitionId?: string
    readonly promotionTransitionReceiptDigest?: string
    readonly rollbackTransitionId?: string
    readonly rollbackTransitionReceiptDigest?: string
    readonly recoveredTransitionId?: string
    readonly recoveredTransitionReceiptDigest?: string
    readonly reportDigest?: string
    readonly reportState?: 'pending' | 'delivered'
  }
  readonly recovery: null | { readonly resumePhase: string, readonly resumedAt?: string }
}

export interface LearningAudit {
  readonly schemaVersion: 'tianwen.learning-audit.v1'
  readonly items: readonly LearningAuditItem[]
}

function receipts(status: LearningAnalysisStatus): LearningAuditItem['receipts'] {
  return {
    ...(status.candidateId === undefined ? {} : { candidateId: status.candidateId }),
    ...(status.evaluationId === undefined ? {} : { evaluationId: status.evaluationId }),
    ...(status.evaluationResultDigest === undefined ? {} : { evaluationResultDigest: status.evaluationResultDigest }),
    ...(status.shadowId === undefined ? {} : { shadowId: status.shadowId }),
    ...(status.shadowResultDigest === undefined ? {} : { shadowResultDigest: status.shadowResultDigest }),
    ...(status.promotionRecommendationDigest === undefined ? {} : { promotionRecommendationDigest: status.promotionRecommendationDigest }),
    ...(status.promotionTransitionId === undefined ? {} : { promotionTransitionId: status.promotionTransitionId }),
    ...(status.promotionTransitionReceiptDigest === undefined ? {} : { promotionTransitionReceiptDigest: status.promotionTransitionReceiptDigest }),
    ...(status.rollbackTransitionId === undefined ? {} : { rollbackTransitionId: status.rollbackTransitionId }),
    ...(status.rollbackTransitionReceiptDigest === undefined ? {} : { rollbackTransitionReceiptDigest: status.rollbackTransitionReceiptDigest }),
    ...(status.recoveredTransitionId === undefined ? {} : { recoveredTransitionId: status.recoveredTransitionId }),
    ...(status.recoveredTransitionReceiptDigest === undefined ? {} : { recoveredTransitionReceiptDigest: status.recoveredTransitionReceiptDigest }),
    ...(status.reportDelivery === undefined ? {} : {
      reportDigest: status.reportDelivery.reportDigest,
      reportState: status.reportDelivery.state,
    }),
  }
}

export function projectLearningAudit(input: { readonly analyses: readonly LearningAnalysisStatus[] }): LearningAudit {
  const items = input.analyses.map(status => ({
    analysisId: status.analysisId,
    ticketId: status.ticketId,
    phase: status.phase,
    requestedAt: status.requestedAt,
    updatedAt: status.updatedAt,
    evidenceDigests: [...new Set([
      ...(status.submission?.supportingEvidenceIds ?? []),
      ...(status.submission?.counterevidenceIds ?? []),
      ...(status.submissionDigest === undefined ? [] : [status.submissionDigest]),
    ])].sort(),
    receipts: receipts(status),
    recovery: status.resumePhase === undefined ? null : {
      resumePhase: status.resumePhase,
      ...(status.resumedAt === undefined ? {} : { resumedAt: status.resumedAt }),
    },
  } satisfies LearningAuditItem)).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.analysisId.localeCompare(right.analysisId))
  return { schemaVersion: 'tianwen.learning-audit.v1', items }
}
