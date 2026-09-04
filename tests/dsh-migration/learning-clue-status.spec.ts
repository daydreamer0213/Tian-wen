import { describe, expect, it } from 'vitest'
import type { LearningAnalysisStatus } from '@tianwen/evolution'
import { projectLearningAudit } from '../../packages/tianwen-runtime-bundle/src/learning-clue-status.js'

describe('main-session learning status projection', () => {
  it('filters by the exact parent without exposing feedback or another main session', () => {
    const analyses = ['main-a', 'main-b'].map((parentSessionId, index) => ({
      analysisId: `analysis:${String(index).repeat(64)}`, ticketId: `ticket:${'a'.repeat(64)}`,
      parentSessionId, childSessionId: `child-${index}`, phase: 'invalidated',
      requestedAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:01:00.000Z',
      privateNote: 'not for display',
    })) as unknown as LearningAnalysisStatus[]
    const filtered = projectLearningAudit({ analyses, sessionId: 'main-a' })
    expect(filtered.items.map(item => item.analysisId)).toEqual([analyses[0]!.analysisId])
    expect(JSON.stringify(filtered)).not.toContain('not for display')
    expect(projectLearningAudit({ analyses, sessionId: 'child-0' }).items).toEqual([])
    expect(projectLearningAudit({ analyses }).items).toHaveLength(2)
  })
})
