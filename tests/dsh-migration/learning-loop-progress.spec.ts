import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@tianwen/dsh-compat'

import {
  LedgerIntegrityError,
  sha256,
  type LearningAnalysisProgressBinding,
  type LearningTicketId,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import {
  createExplicitCorrectionLearningLoopExecutor,
  learningLoopProgressReport,
  nextLearningLoopProgress,
  TianwenLearningLoopService,
} from '../../packages/tianwen-runtime-bundle/src/learning-loop-orchestrator.js'

const roots: string[] = []
const lifecycle = `sha256:${'a'.repeat(64)}` as const

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? 'D:/DevData/tianwen-dsh-probe',
    'learning-loop-progress',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

function seed(prefix: string) {
  let now = '2026-09-03T00:00:00.000Z'
  const ledgerRoot = root(prefix)
  const ledger = new EvolutionLedger(ledgerRoot, { clock: () => now })
  ledger.recordLearningAnalysisConsent({
    revision: 1,
    enabled: true,
    policyVersion: 'tianwen-auto-analysis.v1',
  })
  const intake = ledger.recordLearningFeedbackRevision({
    intake: {
      sessionId: 'main-session',
      messageId: 'assistant-message',
      feedbackVersion: 'feedback-v1',
      rating: 'negative',
      note: 'Keep the answer concrete.',
      scopeKey: 'project:tianwen/capability:research-summary',
      sessionDigest: `sha256:${'0'.repeat(64)}`,
      evidenceIds: [`sha256:${'1'.repeat(64)}`],
    },
    sessionLifecycleFingerprint: lifecycle,
    analysisConsentRevision: 1,
  })
  const requested = ledger.requestLearningAnalysis({
    ticketId: intake.ticketId as LearningTicketId,
    sessionId: 'main-session', messageId: 'assistant-message',
    feedbackVersion: 'feedback-v1', consentRevision: 1,
    parentSessionId: 'main-session',
  })
  now = '2026-09-03T00:00:01.000Z'
  ledger.recordLearningAnalysisChildStarted({
    analysisId: requested.analysisId,
    parentSessionId: requested.parentSessionId,
    childSessionId: requested.childSessionId,
  })
  return {
    ledger,
    ledgerRoot,
    requested,
    setNow(value: string) { now = value },
  }
}

function binding(
  analysisId: LearningAnalysisProgressBinding['analysisId'],
  kind: LearningAnalysisProgressBinding['kind'],
  phase: LearningAnalysisProgressBinding['phase'],
  elapsedBucket: number,
): LearningAnalysisProgressBinding {
  return {
    analysisId,
    kind,
    phase,
    elapsedBucket,
    reportDigest: sha256({ kind, phase, elapsedBucket }),
  }
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe('main-chat learning progress', () => {
  it('persists one bounded milestone cursor and replays its exact delivery', () => {
    const seeded = seed('milestone')
    const progress = binding(seeded.requested.analysisId, 'analysis-started', 'running', 0)

    expect(seeded.ledger.recordLearningAnalysisProgressIntent(progress)).toMatchObject({
      duplicate: false,
      progressCursors: [{ ...progress, state: 'pending' }],
    })
    expect(seeded.ledger.recordLearningAnalysisProgressIntent(progress))
      .toMatchObject({ duplicate: true })
    seeded.setNow('2026-09-03T00:00:02.000Z')
    expect(seeded.ledger.recordLearningAnalysisProgressDelivered({
      ...progress,
      reportMessageId: 'progress-message-1',
    })).toMatchObject({
      duplicate: false,
      progressCursors: [{ ...progress, state: 'delivered', reportMessageId: 'progress-message-1' }],
    })

    expect(new EvolutionLedger(seeded.ledgerRoot).getLearningAnalysis(
      seeded.requested.analysisId,
    )).toEqual(seeded.ledger.getLearningAnalysis(seeded.requested.analysisId))
    expect(seeded.ledger.requestLearningAnalysis({
      ticketId: seeded.requested.ticketId,
      sessionId: seeded.requested.sessionId,
      messageId: seeded.requested.messageId,
      feedbackVersion: seeded.requested.feedbackVersion,
      consentRevision: seeded.requested.consentRevision,
      parentSessionId: seeded.requested.parentSessionId,
    })).toMatchObject({ duplicate: true })
  })

  it('stores no report body, prompt, path, or other unbounded progress material', () => {
    const seeded = seed('bounded-shape')
    const progress = binding(seeded.requested.analysisId, 'analysis-started', 'running', 0)
    const invalid = [
      { ...progress, text: 'private feedback note' },
      { ...progress, prompt: 'open the child task' },
      { ...progress, path: 'D:/private/workspace' },
      { ...progress, note: 'raw user correction' },
    ]

    for (const value of invalid) {
      expect(() => seeded.ledger.recordLearningAnalysisProgressIntent(value as never))
        .toThrow(LedgerIntegrityError)
    }
    expect(() => seeded.ledger.recordLearningAnalysisProgressIntent(
      binding(seeded.requested.analysisId, 'liveness', 'running', 0),
    )).toThrow(/bucket/u)
    expect(seeded.ledger.listEvents().filter(event =>
      event.type.startsWith('learning-analysis-progress-'))).toHaveLength(0)
  })

  it('deduplicates liveness by bucket and permits a phase change within that bucket', () => {
    const seeded = seed('liveness')
    const running = binding(seeded.requested.analysisId, 'liveness', 'running', 1)
    seeded.ledger.recordLearningAnalysisProgressIntent(running)
    seeded.ledger.recordLearningAnalysisProgressDelivered({
      ...running,
      reportMessageId: 'liveness-running',
    })
    expect(seeded.ledger.recordLearningAnalysisProgressIntent(running))
      .toMatchObject({ duplicate: true })

    seeded.ledger.recordLearningAnalysisFailed({
      analysisId: seeded.requested.analysisId,
      resumePhase: 'running',
    })
    const failed = binding(seeded.requested.analysisId, 'liveness', 'failed', 1)
    expect(seeded.ledger.recordLearningAnalysisProgressIntent(failed))
      .toMatchObject({ duplicate: false, progressCursors: [{ kind: 'liveness', phase: 'failed' }] })
    expect(seeded.ledger.getLearningAnalysis(seeded.requested.analysisId)?.progressCursors)
      .toHaveLength(1)
  })

  it('stops a pending progress delivery when a terminal result wins the race', () => {
    const seeded = seed('terminal-race')
    const progress = binding(seeded.requested.analysisId, 'analysis-started', 'running', 0)
    seeded.ledger.recordLearningAnalysisProgressIntent(progress)
    seeded.ledger.recordLearningAnalysisSubmission({
      analysisId: seeded.requested.analysisId,
      childSessionId: seeded.requested.childSessionId,
      submission: {
        verdict: 'no-case',
        hypothesis: 'No reusable correction was identified.',
        supportingEvidenceIds: [],
        counterevidenceIds: [],
      },
    })

    expect(() => seeded.ledger.recordLearningAnalysisProgressDelivered({
      ...progress,
      reportMessageId: 'too-late-progress',
    })).toThrow(/terminal/u)
  })

  it('derives short public text without child navigation or approval affordances', () => {
    const statuses = [
      learningLoopProgressReport({ analysisId: `analysis:${'1'.repeat(64)}`, phase: 'running' }, 'analysis-started', 0),
      learningLoopProgressReport({ analysisId: `analysis:${'1'.repeat(64)}`, phase: 'candidate-ready' }, 'candidate-evaluating', 0),
      learningLoopProgressReport({ analysisId: `analysis:${'1'.repeat(64)}`, phase: 'shadow-ready' }, 'liveness', 2),
      learningLoopProgressReport({
        analysisId: `analysis:${'1'.repeat(64)}`,
        phase: 'failed',
        resumePhase: 'candidate-ready',
      }, 'liveness', 1),
    ]
    expect(statuses.map(item => item.text)).toEqual([
      'Tianwen 已开始分析这条反馈，后续进度会继续在当前对话更新。',
      'Tianwen 已形成候选改进，正在进行受控验证。',
      'Tianwen 学习仍在进行：已完成 3/4 个阶段，正在验证启用结果。',
      'Tianwen 学习暂时中断：受控环境暂不可用，候选改进尚未启用；将在下一次可用时自动重试。',
    ])
    expect(JSON.stringify(statuses)).not.toMatch(/child|task|approve|批准|打开|路径|feedback note/iu)
  })

  it('selects milestone and liveness buckets without polling completed work', () => {
    const analysisId = `analysis:${'1'.repeat(64)}` as const
    const base = {
      analysisId,
      phase: 'running',
      requestedAt: '2026-09-03T00:00:00.000Z',
      childStartedAt: '2026-09-03T00:00:01.000Z',
    }
    expect(nextLearningLoopProgress(base, Date.parse('2026-09-03T00:00:01.000Z')))
      .toEqual({ kind: 'analysis-started', phase: 'running', elapsedBucket: 0 })
    const started = {
      ...binding(analysisId, 'analysis-started', 'running', 0),
      state: 'delivered' as const,
      reportMessageId: 'started',
    }
    expect(nextLearningLoopProgress({
      ...base,
      progressCursors: [started],
      progressUpdatedAt: '2026-09-03T00:00:01.000Z',
    }, Date.parse('2026-09-03T00:02:01.000Z'))).toEqual({
      kind: 'liveness', phase: 'running', elapsedBucket: 1,
    })
    const liveness = {
      ...binding(analysisId, 'liveness', 'running', 1),
      state: 'delivered' as const,
      reportMessageId: 'liveness-1',
    }
    expect(nextLearningLoopProgress({
      ...base,
      progressCursors: [started, liveness],
      progressUpdatedAt: '2026-09-03T00:02:01.000Z',
    }, Date.parse('2026-09-03T00:04:01.000Z'))).toEqual({
      kind: 'liveness', phase: 'running', elapsedBucket: 2,
    })
    expect(nextLearningLoopProgress({ ...base, phase: 'promoted' }, Number.MAX_SAFE_INTEGER))
      .toBeUndefined()
    expect(nextLearningLoopProgress({
      ...base,
      phase: 'failed',
      resumePhase: 'running',
      progressCursors: [started],
      progressUpdatedAt: '2026-09-03T00:00:01.000Z',
    }, Date.parse('2026-09-03T00:00:02.000Z'))).toEqual({
      kind: 'liveness', phase: 'failed', elapsedBucket: 1,
    })
  })

  it('recovers a pending milestone delivery without rerunning learning work', async () => {
    const seeded = seed('delivery-restart')
    const contextFor = (ledger: EvolutionLedger) => ({
      ctx: {
        tianwenEvolution: {
          recordLearningAnalysisProgressIntent: (
            input: LearningAnalysisProgressBinding,
          ) => ledger.recordLearningAnalysisProgressIntent(input),
          recordLearningAnalysisProgressDelivered: (
            input: LearningAnalysisProgressBinding & { readonly reportMessageId: string },
          ) => ledger.recordLearningAnalysisProgressDelivered(input),
        },
      } as never,
      status: ledger.getLearningAnalysis(seeded.requested.analysisId)!,
    })
    const failedDelivery = createExplicitCorrectionLearningLoopExecutor({
      root: root('unused-workspace'),
      materializeWorkspace() {},
      async environment() { throw new Error('not used by progress') },
      async deliverTerminalReport() { throw new Error('not used by progress') },
      async deliverProgressReport() { throw new Error('parent offline') },
    })
    await expect(failedDelivery.progress?.(
      contextFor(seeded.ledger),
      { kind: 'analysis-started', phase: 'running', elapsedBucket: 0 },
    )).rejects.toThrow(/parent offline/u)
    const pending = seeded.ledger.getLearningAnalysis(seeded.requested.analysisId)
      ?.progressCursors?.[0]
    expect(pending).toMatchObject({ kind: 'analysis-started', state: 'pending' })

    const replay = new EvolutionLedger(seeded.ledgerRoot)
    const recovered = createExplicitCorrectionLearningLoopExecutor({
      root: root('unused-recovery-workspace'),
      materializeWorkspace() {},
      async environment() { throw new Error('not used by progress') },
      async deliverTerminalReport() { throw new Error('not used by progress') },
      async findProgressReport() { return 'persisted-progress-message' },
      async deliverProgressReport() { throw new Error('must recover without redelivery') },
    })
    await recovered.progress?.(contextFor(replay), {
      kind: pending!.kind,
      phase: pending!.phase,
      elapsedBucket: pending!.elapsedBucket,
      reportDigest: pending!.reportDigest,
    })
    expect(replay.getLearningAnalysis(seeded.requested.analysisId)?.progressCursors)
      .toMatchObject([{ state: 'delivered', reportMessageId: 'persisted-progress-message' }])
  })

  it('uses the timer only to wake active liveness reporting and stops at terminal', async () => {
    const ctx = new Context()
    const analysisId = `analysis:${'1'.repeat(64)}`
    let now = Date.parse('2026-09-03T00:00:01.000Z')
    let status = {
      analysisId,
      phase: 'running',
      requestedAt: '2026-09-03T00:00:00.000Z',
      childStartedAt: '2026-09-03T00:00:01.000Z',
      parentSessionId: 'main-session',
      childSessionId: 'child-session',
    } as Record<string, unknown> & { analysisId: string, phase: string }
    const callbacks: Array<() => void> = []
    const progress = vi.fn(async (_context, input: {
      readonly kind: 'analysis-started' | 'candidate-evaluating' | 'liveness'
      readonly phase: string
      readonly elapsedBucket: number
    }) => {
      const report = learningLoopProgressReport(status as never, input.kind, input.elapsedBucket)
      const cursor = {
        analysisId,
        ...input,
        reportDigest: report.digest,
        state: 'delivered' as const,
        reportMessageId: `message-${progress.mock.calls.length}`,
      }
      const previous = (status.progressCursors as Array<typeof cursor> | undefined) ?? []
      status = {
        ...status,
        progressCursors: [...previous.filter(item => item.kind !== cursor.kind), cursor],
        progressUpdatedAt: new Date(now).toISOString(),
      }
    })
    ctx.provide('agents', { get: () => undefined, list: () => [] } as never)
    ctx.provide('tianwenLearningAnalysisChild', { start: vi.fn() } as never)
    ctx.provide('tianwenEvolution', {
      getLearningAnalysis: () => status,
      listLearningAnalyses: () => [status],
      hasLearningAnalysisActiveSupport: () => true,
      getLearningAnalysisConsent: () => ({ enabled: true, revision: 1 }),
      getLearningIntakeStatus: () => undefined,
    } as never)
    const service = new TianwenLearningLoopService(ctx, {
      executor: {
        freezeProtocol: vi.fn(),
        materializeCandidate: vi.fn(),
        evaluate: vi.fn(),
        promote: vi.fn(),
        rollback: vi.fn(),
        report: vi.fn(),
        progress,
      },
      timer: {
        now: () => now,
        setTimeout(callback) {
          callbacks.push(callback)
          return callback
        },
        clearTimeout: vi.fn(),
      },
    })
    try {
      await Promise.all([
        service.schedule(analysisId),
        service.schedule(analysisId),
      ])
      expect(progress).toHaveBeenCalledWith(expect.anything(), {
        kind: 'analysis-started', phase: 'running', elapsedBucket: 0,
      })
      expect(progress).toHaveBeenCalledTimes(1)
      expect(callbacks).toHaveLength(1)

      now = Date.parse('2026-09-03T00:02:01.001Z')
      callbacks.shift()!()
      await vi.waitFor(() => expect(progress).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(callbacks).toHaveLength(1))
      expect(progress.mock.calls[1]?.[1]).toEqual({
        kind: 'liveness', phase: 'running', elapsedBucket: 1,
      })

      status = { ...status, phase: 'promoted' }
      callbacks.shift()!()
      await vi.waitFor(() => expect(callbacks).toHaveLength(0))
      expect(progress).toHaveBeenCalledTimes(2)
      expect(callbacks).toHaveLength(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
