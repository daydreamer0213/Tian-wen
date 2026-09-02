import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@tianwen/dsh-compat'

const appendFault = vi.hoisted(() => ({
  enabled: false,
  failLedgerFsyncAfterReal: 0,
  failLedgerWriteAfterReal: 0,
  failLedgerWriteBeforeReal: 0,
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const paths = new Map<number, string>()
  return {
    ...actual,
    openSync(path: string, flags: string, mode?: number) {
      const descriptor = actual.openSync(path, flags, mode)
      if (appendFault.enabled) paths.set(descriptor, String(path))
      return descriptor
    },
    writeSync(
      descriptor: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position?: number | null,
    ) {
      if (
        appendFault.enabled
        && appendFault.failLedgerWriteBeforeReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerWriteBeforeReal -= 1
        throw Object.assign(new Error('forced pre-write ledger failure'), {
          code: 'EIO',
        })
      }
      const written = actual.writeSync(
        descriptor,
        buffer,
        offset,
        length,
        position,
      )
      if (
        appendFault.enabled
        && appendFault.failLedgerWriteAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerWriteAfterReal -= 1
        throw Object.assign(new Error('forced post-write ledger uncertainty'), {
          code: 'EIO',
        })
      }
      return written
    },
    fsyncSync(descriptor: number) {
      actual.fsyncSync(descriptor)
      if (
        appendFault.enabled
        && appendFault.failLedgerFsyncAfterReal > 0
        && paths.get(descriptor)?.endsWith('ledger.jsonl') === true
      ) {
        appendFault.failLedgerFsyncAfterReal -= 1
        throw Object.assign(new Error('forced post-fsync ledger uncertainty'), {
          code: 'EIO',
        })
      }
    },
  }
})

import {
  CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
  LedgerAppendNotCommittedError,
  LedgerCommitUnknownError,
  LedgerIntegrityError,
  TianwenEvolutionService,
  type LearningAnalysisSubmission,
  type LearningTicketId,
  type Sha256Digest,
  sha256,
} from '../../packages/tianwen-evolution/src/index.js'
import { resolveExplicitCorrectionProtocol } from '../../packages/tianwen-runtime-bundle/src/explicit-correction-protocol.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import {
  assertLearningAnalysisEvidenceClosure,
  learningAnalysisEvidenceClosure,
} from '../../packages/tianwen-evolution/src/learning-analysis.js'

const lifecycle = `sha256:${'a'.repeat(64)}` as const
const evidenceA = `sha256:${'1'.repeat(64)}` as const
const evidenceB = `sha256:${'2'.repeat(64)}` as const
const roots: string[] = []

function ledgerRoot(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'learning-analysis-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(root)
  return root
}

function seededLedger(prefix: string): {
  readonly ledger: EvolutionLedger
  readonly root: string
  readonly ticketId: LearningTicketId
} {
  const root = ledgerRoot(prefix)
  const ledger = new EvolutionLedger(root, {
    clock: () => '2026-09-02T00:00:00.000Z',
  })
  ledger.recordLearningAnalysisConsent({
    revision: 1,
    enabled: true,
    policyVersion: 'tianwen-auto-analysis.v1',
  })
  const receipt = ledger.recordLearningFeedbackRevision({
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
  return { ledger, root, ticketId: receipt.ticketId! }
}

function requestInput(ticketId: LearningTicketId) {
  return {
    ticketId,
    sessionId: 'main-session',
    messageId: 'assistant-message',
    feedbackVersion: 'feedback-v1',
    consentRevision: 1,
    parentSessionId: 'main-session',
  } as const
}

function skillChange(
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

function explicitProtocolInput(root: string, ticketId: LearningTicketId) {
  const protocol = resolveExplicitCorrectionProtocol('project:tianwen/capability:research-summary')!
  const materializeWorkspace = (workspaceRoot: string, content: string) => {
    mkdirSync(workspaceRoot, { recursive: true })
    writeFileSync(join(workspaceRoot, 'brief.txt'), content, 'utf8')
  }
  const tasks = protocol.buildEvaluationTasks({
    root: join(root, 'controlled-workspace'), materializeWorkspace,
  })
  const callConfig = { provider: 'controlled-test', model: 'controlled-test' }
  const toolSchemas = [{ name: 'skill' }, { name: 'verify_lifecycle' }]
  return protocol.buildProtocolInput({
    ticketId, sha256, rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST,
    callConfig, retryPolicy: { attempts: 1 }, toolSchemaDigest: sha256(toolSchemas), tasks,
  })
}

afterEach(() => {
  appendFault.enabled = false
  appendFault.failLedgerFsyncAfterReal = 0
  appendFault.failLedgerWriteAfterReal = 0
  appendFault.failLedgerWriteBeforeReal = 0
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('durable explicit-correction analysis lifecycle', () => {
  it('rejects direct protocol freezing without the exact enabled consent authority', () => {
    const root = ledgerRoot('protocol-consent-authority')
    const ledger = new EvolutionLedger(root, { clock: () => '2026-09-02T00:00:00.000Z' })
    const withoutConsent = ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'main-session', messageId: 'assistant-message', feedbackVersion: 'feedback-v1',
        rating: 'negative', note: 'Keep the answer concrete.',
        scopeKey: 'project:tianwen/capability:research-summary', sessionDigest: `sha256:${'0'.repeat(64)}`,
        evidenceIds: [evidenceA],
      },
      sessionLifecycleFingerprint: lifecycle,
    })
    expect(() => ledger.freezeControlledSkillEvalProtocol(
      explicitProtocolInput(root, withoutConsent.ticketId!),
    )).toThrow(/controlled Skill evaluation protocol input is invalid/u)

    const { ledger: consented, root: consentedRoot, ticketId } = seededLedger('protocol-consent-disabled')
    expect(() => consented.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'other-session', messageId: 'other-message', feedbackVersion: 'feedback-wrong-revision',
        rating: 'negative', note: 'Keep the answer concrete.',
        scopeKey: 'project:tianwen/capability:research-summary', sessionDigest: `sha256:${'9'.repeat(64)}`,
        evidenceIds: [evidenceA],
      },
      sessionLifecycleFingerprint: lifecycle, analysisConsentRevision: 99,
    })).toThrow(/references consent that was not enabled/u)
    consented.recordLearningAnalysisConsent({
      revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v1',
    })
    expect(() => consented.freezeControlledSkillEvalProtocol(
      explicitProtocolInput(consentedRoot, ticketId),
    )).toThrow(/controlled Skill evaluation protocol input is invalid/u)
  })
  it('excludes cross-session, session-digest, Outcome, and retracted Evidence from analysis closure', () => {
    const sessionDigest = `sha256:${'0'.repeat(64)}` as Sha256Digest
    const outcomeEvidence = `sha256:${'7'.repeat(64)}` as Sha256Digest
    const closure = learningAnalysisEvidenceClosure('main-session', [
      {
        sessionId: 'main-session',
        sessionDigest,
        evidenceIds: [evidenceA],
        source: 'explicit-correction',
        active: true,
      },
      {
        sessionId: 'second-session',
        sessionDigest: `sha256:${'3'.repeat(64)}`,
        evidenceIds: [evidenceB],
        source: 'explicit-correction',
        active: true,
      },
      {
        sessionId: 'main-session',
        sessionDigest: `sha256:${'4'.repeat(64)}`,
        evidenceIds: [`sha256:${'5'.repeat(64)}`],
        source: 'explicit-correction',
        active: false,
      },
      {
        sessionId: 'main-session',
        sessionDigest: `sha256:${'6'.repeat(64)}`,
        evidenceIds: [outcomeEvidence],
        source: 'outcome',
        active: true,
      },
    ])

    expect([...closure]).toEqual([evidenceA])
    expect(() => assertLearningAnalysisEvidenceClosure(skillChange({
      supportingEvidenceIds: [evidenceB],
      counterevidenceIds: [],
    }), closure)).toThrow(/Evidence closure/u)
    expect(() => assertLearningAnalysisEvidenceClosure(skillChange({
      supportingEvidenceIds: [sessionDigest],
      counterevidenceIds: [],
    }), closure)).toThrow(/Evidence closure/u)
    expect(() => assertLearningAnalysisEvidenceClosure(skillChange({
      supportingEvidenceIds: [outcomeEvidence],
      counterevidenceIds: [],
    }), closure)).toThrow(/Evidence closure/u)
  })

  it('reserves deterministic analysis and child identities before child start', () => {
    const { ledger, root, ticketId } = seededLedger('request')

    const first = ledger.requestLearningAnalysis(requestInput(ticketId))
    const replay = ledger.requestLearningAnalysis(requestInput(ticketId))

    expect(first).toMatchObject({
      analysisId: 'analysis:8c44888a7dd4961558fb94543c892d8c390d7917947ad64dc5d574fa47ee8dbb',
      childSessionId: 'tianwen-analysis-8c44888a7dd4961558fb94543c892d8c390d7917947ad64dc5d574fa47ee8dbb',
      phase: 'pending-parent',
      duplicate: false,
    })
    expect(replay).toEqual({ ...first, duplicate: true })
    expect(new EvolutionLedger(root).getLearningAnalysis(first.analysisId))
      .toEqual(ledger.getLearningAnalysis(first.analysisId))
    expect(ledger.listEvents().filter(event =>
      event.type === 'learning-analysis-requested')).toHaveLength(1)
  })

  it('binds only the reserved native child and accepts one exact structured submission', () => {
    const { ledger, root, ticketId } = seededLedger('submit')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })).toThrow(/running/u)
    expect(() => ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: 'different-child',
    })).toThrow(LedgerIntegrityError)

    const started = ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    expect(started).toMatchObject({ phase: 'running', duplicate: false })

    const submitted = ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })
    expect(submitted).toMatchObject({
      phase: 'running',
      submission: skillChange(),
      submittedAt: '2026-09-02T00:00:00.000Z',
      duplicate: false,
    })
    expect(ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })).toEqual({ ...submitted, duplicate: true })
    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({ hypothesis: 'Changed result.' }),
    })).toThrow(/changed/u)
    expect(new EvolutionLedger(root).getLearningAnalysisByChildSessionId(
      requested.childSessionId,
    )).toEqual(ledger.getLearningAnalysis(requested.analysisId))
  })

  it.each([
    ['no-case', 'no-case'],
    ['insufficient-evidence', 'insufficient-evidence'],
  ] as const)('records %s as a terminal model result', (verdict, phase) => {
    const { ledger, ticketId } = seededLedger(`terminal-${verdict}`)
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })

    expect(ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: {
        verdict,
        hypothesis: verdict === 'no-case'
          ? 'The correction does not identify a reusable change.'
          : 'The available evidence cannot support a safe change.',
        supportingEvidenceIds: verdict === 'no-case' ? [] : [evidenceA],
        counterevidenceIds: [],
      },
    })).toMatchObject({ phase, duplicate: false })
  })

  it('rejects untrusted submissions outside the exact schema, text, and Evidence closure', () => {
    const { ledger, ticketId } = seededLedger('invalid-submission')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    const submit = (submission: unknown) => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: submission as LearningAnalysisSubmission,
    })

    expect(() => submit({ ...skillChange(), extra: true }))
      .toThrow(LedgerIntegrityError)
    expect(() => submit({ ...skillChange(), hypothesis: ' \n\t ' }))
      .toThrow(LedgerIntegrityError)
    expect(() => submit({ ...skillChange(), hypothesis: 'bad\0text' }))
      .toThrow(LedgerIntegrityError)
    expect(() => submit({ ...skillChange(), hypothesis: '\ud800' }))
      .toThrow(LedgerIntegrityError)
    expect(() => submit({ ...skillChange(), lesson: undefined }))
      .toThrow(LedgerIntegrityError)
    expect(() => submit({
      verdict: 'no-case',
      hypothesis: 'No reusable case.',
      lesson: skillChange().lesson,
      supportingEvidenceIds: [],
      counterevidenceIds: [],
    })).toThrow(LedgerIntegrityError)
    expect(() => submit(skillChange({
      supportingEvidenceIds: [`sha256:${'f'.repeat(64)}`],
    }))).toThrow(/Evidence closure/u)
    expect(() => submit(skillChange({
      supportingEvidenceIds: [evidenceA, evidenceA],
    }))).toThrow(LedgerIntegrityError)
    expect(ledger.getLearningAnalysis(requested.analysisId)?.submission)
      .toBeUndefined()
  })

  it('requires the exact active correction and its captured enabled consent', () => {
    const { ledger, ticketId } = seededLedger('request-guards')

    expect(() => ledger.requestLearningAnalysis({
      ...requestInput(ticketId),
      feedbackVersion: 'wrong-version',
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.requestLearningAnalysis({
      ...requestInput(ticketId),
      consentRevision: 2,
    })).toThrow(LedgerIntegrityError)
    expect(() => ledger.requestLearningAnalysis({
      ...requestInput(ticketId),
      parentSessionId: 'not-the-feedback-main-session',
    })).toThrow(LedgerIntegrityError)

    ledger.recordLearningAnalysisConsent({
      revision: 2,
      enabled: false,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    expect(ledger.requestLearningAnalysis(requestInput(ticketId))).toMatchObject({
      phase: 'pending-parent',
    })
  })

  it.each(['write', 'fsync'] as const)(
    'reconciles a durably appended analysis request after %s uncertainty',
    failure => {
      const { ledger, root, ticketId } = seededLedger(`recover-${failure}`)
      appendFault.enabled = true
      if (failure === 'write') appendFault.failLedgerWriteAfterReal = 1
      else appendFault.failLedgerFsyncAfterReal = 1

      const receipt = ledger.requestLearningAnalysis(requestInput(ticketId))

      expect(receipt.duplicate).toBe(false)
      expect(new EvolutionLedger(root).requestLearningAnalysis(
        requestInput(ticketId),
      ).duplicate).toBe(true)
      expect(readFileSync(join(root, 'ledger.jsonl'), 'utf8')
        .split('\n').filter(line => line.includes('learning-analysis-requested')))
        .toHaveLength(1)
    },
  )

  it('resumes each missing lifecycle step after restart without another identity', () => {
    const seeded = seededLedger('restart-steps')
    const requested = seeded.ledger.requestLearningAnalysis(
      requestInput(seeded.ticketId),
    )
    const afterRequest = new EvolutionLedger(seeded.root)
    afterRequest.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    const afterStart = new EvolutionLedger(seeded.root)
    afterStart.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })

    const recovered = new EvolutionLedger(seeded.root)
    expect(recovered.getLearningAnalysis(requested.analysisId)).toMatchObject({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })
    expect(recovered.listEvents().filter(event => event.type.startsWith(
      'learning-analysis-',
    )).map(event => event.type)).toEqual([
      'learning-analysis-consent-recorded',
      'learning-analysis-requested',
      'learning-analysis-child-started',
      'learning-analysis-submitted',
    ])
  })

  it('reconciles durable child-start and submission writes before returning', () => {
    const seeded = seededLedger('later-write-recovery')
    const requested = seeded.ledger.requestLearningAnalysis(
      requestInput(seeded.ticketId),
    )
    appendFault.enabled = true
    appendFault.failLedgerFsyncAfterReal = 1
    expect(seeded.ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })).toMatchObject({ phase: 'running', duplicate: false })
    appendFault.failLedgerFsyncAfterReal = 1
    expect(seeded.ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })).toMatchObject({ submission: skillChange(), duplicate: false })

    const replay = new EvolutionLedger(seeded.root)
    expect(replay.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    }).duplicate).toBe(true)
    expect(replay.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    }).duplicate).toBe(true)
  })

  it('keeps analysis events off the public service event stream and preserves formalWrite recovery semantics', async () => {
    const seeded = seededLedger('service-recovery')
    const ctx = new Context()
    await ctx.plugin(TianwenEvolutionService, { root: seeded.root })
    try {
      appendFault.enabled = true
      appendFault.failLedgerFsyncAfterReal = 1
      const requested = ctx.tianwenEvolution.requestLearningAnalysis(
        requestInput(seeded.ticketId),
      )
      expect(requested.duplicate).toBe(false)
      expect(ctx.tianwenEvolution.listEvents()).toEqual([])

      appendFault.failLedgerWriteBeforeReal = 1
      expect(() => ctx.tianwenEvolution.recordLearningAnalysisChildStarted({
        analysisId: requested.analysisId,
        parentSessionId: requested.parentSessionId,
        childSessionId: requested.childSessionId,
      })).toThrow(LedgerAppendNotCommittedError)
      expect(ctx.tianwenEvolution.blocked).toBe(false)
      ctx.tianwenEvolution.recordLearningAnalysisChildStarted({
        analysisId: requested.analysisId,
        parentSessionId: requested.parentSessionId,
        childSessionId: requested.childSessionId,
      })

      appendFault.failLedgerFsyncAfterReal = 2
      expect(() => ctx.tianwenEvolution.recordLearningAnalysisSubmission({
        analysisId: requested.analysisId,
        childSessionId: requested.childSessionId,
        submission: skillChange(),
      })).toThrow(LedgerCommitUnknownError)
      expect(ctx.tianwenEvolution.blocked).toBe(true)
      expect(ctx.tianwenEvolution.getLearningAnalysis(
        requested.analysisId,
      )?.submission).toBeUndefined()
      expect(new EvolutionLedger(seeded.root).getLearningAnalysis(
        requested.analysisId,
      )?.submission).toEqual(skillChange())
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps a non-appended analysis write retryable and blocks true commit-unknown', () => {
    const first = seededLedger('not-appended')
    appendFault.enabled = true
    appendFault.failLedgerWriteBeforeReal = 1
    expect(() => first.ledger.requestLearningAnalysis(
      requestInput(first.ticketId),
    )).toThrow(LedgerAppendNotCommittedError)
    expect(first.ledger.requestLearningAnalysis(requestInput(first.ticketId)).duplicate)
      .toBe(false)

    const uncertain = seededLedger('commit-unknown')
    appendFault.failLedgerFsyncAfterReal = 2
    expect(() => uncertain.ledger.requestLearningAnalysis(
      requestInput(uncertain.ticketId),
    )).toThrow(LedgerCommitUnknownError)
    expect(() => uncertain.ledger.requestLearningAnalysis(
      requestInput(uncertain.ticketId),
    )).toThrow(/fresh replay/u)
    expect(new EvolutionLedger(uncertain.root).requestLearningAnalysis(
      requestInput(uncertain.ticketId),
    ).duplicate).toBe(true)
  })

  it('invalidates an old analysis after unsupported supersession without deleting history', () => {
    const { ledger, root, ticketId } = seededLedger('superseded')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'main-session',
        messageId: 'assistant-message',
        feedbackVersion: 'feedback-v2',
        rating: 'negative',
        note: 'Use a completely different workflow.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest: `sha256:${'0'.repeat(64)}`,
        evidenceIds: [evidenceA],
      },
      sessionLifecycleFingerprint: lifecycle,
      supersedesFeedbackVersion: 'feedback-v1',
      analysisConsentRevision: 1,
    })

    expect(ledger.getLearningAnalysis(requested.analysisId)?.phase)
      .toBe('invalidated')
    expect(ledger.listEvents().map(event => event.type)).toContain(
      'learning-analysis-invalidated',
    )
    expect(new EvolutionLedger(root).getLearningAnalysis(requested.analysisId))
      .toEqual(ledger.getLearningAnalysis(requested.analysisId))
  })

  it('does not treat a superseding revision in the same feedback lineage as independent support', () => {
    const { ledger, ticketId } = seededLedger('same-lineage-superseded')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    const replacement = ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'main-session',
        messageId: 'assistant-message',
        feedbackVersion: 'feedback-v2',
        rating: 'negative',
        note: 'KEEP THE ANSWER CONCRETE.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest: `sha256:${'0'.repeat(64)}`,
        evidenceIds: [evidenceB],
      },
      sessionLifecycleFingerprint: lifecycle,
      supersedesFeedbackVersion: 'feedback-v1',
      analysisConsentRevision: 1,
    })

    expect(replacement.ticketId).toBe(ticketId)
    expect(ledger.listLearningTickets().find(ticket =>
      ticket.ticketId === ticketId)?.status).toBe('open')
    expect(ledger.getLearningAnalysis(requested.analysisId)?.phase)
      .toBe('invalidated')
  })

  it('keeps an analysis when another active Signal independently supports its Ticket', () => {
    const { ledger, ticketId } = seededLedger('independent-support')
    ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'second-session',
        messageId: 'second-message',
        feedbackVersion: 'feedback-second',
        rating: 'negative',
        note: 'KEEP THE ANSWER CONCRETE.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest: `sha256:${'3'.repeat(64)}`,
        evidenceIds: [`sha256:${'4'.repeat(64)}`],
      },
      sessionLifecycleFingerprint: `sha256:${'b'.repeat(64)}`,
      analysisConsentRevision: 1,
    })
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    ledger.recordLearningFeedbackRetraction({
      sessionId: 'main-session',
      messageId: 'assistant-message',
      retractedFeedbackVersion: 'feedback-v1',
      sessionLifecycleFingerprint: lifecycle,
    })

    expect(ledger.getLearningAnalysis(requested.analysisId)?.phase)
      .toBe('pending-parent')
    expect(ledger.listLearningTickets().find(ticket =>
      ticket.ticketId === ticketId)?.status).toBe('open')
  })

  it('invalidates the only-supported analysis on retraction and rejects later child start', () => {
    const { ledger, ticketId } = seededLedger('retracted')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    ledger.recordLearningFeedbackRetraction({
      sessionId: 'main-session',
      messageId: 'assistant-message',
      retractedFeedbackVersion: 'feedback-v1',
      sessionLifecycleFingerprint: lifecycle,
    })

    expect(ledger.getLearningAnalysis(requested.analysisId)?.phase)
      .toBe('invalidated')
    expect(() => ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })).toThrow(/pending-parent/u)
  })

  it('rejects a tampered analysis binding during cold replay', () => {
    const { ledger, root, ticketId } = seededLedger('tampered-replay')
    ledger.requestLearningAnalysis(requestInput(ticketId))
    const path = join(root, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const requestedIndex = lines.findIndex(line =>
      line.includes('learning-analysis-requested'))
    const event = JSON.parse(lines[requestedIndex]!) as {
      binding: { childSessionId: string }
    }
    event.binding.childSessionId = 'attacker-reserved-child'
    lines[requestedIndex] = JSON.stringify(event)
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')

    expect(() => new EvolutionLedger(root)).toThrow(LedgerIntegrityError)
  })

  it('admits only Evidence from an active explicit correction in the analysis Session', () => {
    const { ledger, ticketId } = seededLedger('active-evidence-closure')
    const crossSessionEvidence = `sha256:${'9'.repeat(64)}` as Sha256Digest
    const retractedEvidence = `sha256:${'8'.repeat(64)}` as Sha256Digest
    const outcomeEvidence = `sha256:${'7'.repeat(64)}` as Sha256Digest
    ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'second-session',
        messageId: 'second-message',
        feedbackVersion: 'feedback-second',
        rating: 'negative',
        note: 'KEEP THE ANSWER CONCRETE.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest: `sha256:${'3'.repeat(64)}`,
        evidenceIds: [crossSessionEvidence],
      },
      sessionLifecycleFingerprint: `sha256:${'b'.repeat(64)}`,
      analysisConsentRevision: 1,
    })
    ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'retracted-session',
        messageId: 'retracted-message',
        feedbackVersion: 'feedback-retracted',
        rating: 'negative',
        note: 'KEEP THE ANSWER CONCRETE.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest: `sha256:${'4'.repeat(64)}`,
        evidenceIds: [retractedEvidence],
      },
      sessionLifecycleFingerprint: `sha256:${'c'.repeat(64)}`,
      analysisConsentRevision: 1,
    })
    ledger.recordLearningFeedbackRetraction({
      sessionId: 'retracted-session',
      messageId: 'retracted-message',
      retractedFeedbackVersion: 'feedback-retracted',
      sessionLifecycleFingerprint: `sha256:${'c'.repeat(64)}`,
    })
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })

    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [crossSessionEvidence],
        counterevidenceIds: [],
      }),
    })).toThrow(/Evidence closure/u)
    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [`sha256:${'0'.repeat(64)}`],
        counterevidenceIds: [],
      }),
    })).toThrow(/Evidence closure/u)
    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [retractedEvidence],
        counterevidenceIds: [],
      }),
    })).toThrow(/Evidence closure/u)
    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [outcomeEvidence],
        counterevidenceIds: [],
      }),
    })).toThrow(/Evidence closure/u)
    expect(ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [evidenceA],
        counterevidenceIds: [],
      }),
    })).toMatchObject({ duplicate: false, phase: 'running' })
  })

  it('rejects a session digest reused as its own analysis evidence at ledger level', () => {
    const { ledger } = seededLedger('self-session-digest-evidence')
    const sessionDigest = `sha256:${'d'.repeat(64)}` as Sha256Digest
    const feedback = ledger.recordLearningFeedbackRevision({
      intake: {
        sessionId: 'main-session',
        messageId: 'assistant-self-digest',
        feedbackVersion: 'feedback-self-digest',
        rating: 'negative',
        note: 'Keep the answer concrete.',
        scopeKey: 'project:tianwen/capability:research-summary',
        sessionDigest,
        evidenceIds: [sessionDigest, evidenceA],
      },
      sessionLifecycleFingerprint: lifecycle,
      analysisConsentRevision: 1,
    })
    const requested = ledger.requestLearningAnalysis({
      ticketId: feedback.ticketId!,
      sessionId: 'main-session',
      messageId: 'assistant-self-digest',
      feedbackVersion: 'feedback-self-digest',
      consentRevision: 1,
      parentSessionId: 'main-session',
    })
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })

    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [sessionDigest],
        counterevidenceIds: [],
      }),
    })).toThrow(/Evidence closure/u)
    expect(ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange({
        supportingEvidenceIds: [evidenceA],
        counterevidenceIds: [],
      }),
    })).toMatchObject({ duplicate: false, phase: 'running' })
  })

  it('rejects live lifecycle transitions whose timestamp goes backwards', () => {
    let now = '2026-09-02T00:00:00.000Z'
    const root = ledgerRoot('backwards-live')
    const ledger = new EvolutionLedger(root, { clock: () => now })
    ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    const feedback = ledger.recordLearningFeedbackRevision({
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
    const requested = ledger.requestLearningAnalysis(requestInput(feedback.ticketId!))

    now = '2026-09-01T23:59:59.999Z'
    expect(() => ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })).toThrow(/timestamp/u)

    now = '2026-09-02T00:00:00.001Z'
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    now = '2026-09-02T00:00:00.000Z'
    expect(() => ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId,
      childSessionId: requested.childSessionId,
      submission: skillChange(),
    })).toThrow(/timestamp/u)
  })

  it('rejects a cold-replayed lifecycle whose event timestamps go backwards', () => {
    let now = '2026-09-02T00:00:00.000Z'
    const root = ledgerRoot('backwards-cold-replay')
    const ledger = new EvolutionLedger(root, { clock: () => now })
    ledger.recordLearningAnalysisConsent({
      revision: 1,
      enabled: true,
      policyVersion: 'tianwen-auto-analysis.v1',
    })
    const feedback = ledger.recordLearningFeedbackRevision({
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
    const requested = ledger.requestLearningAnalysis(requestInput(feedback.ticketId!))
    now = '2026-09-02T00:00:00.001Z'
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    const path = join(root, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const childIndex = lines.findIndex(line =>
      line.includes('learning-analysis-child-started'))
    const child = JSON.parse(lines[childIndex]!) as { at: string }
    child.at = '2026-09-01T23:59:59.999Z'
    lines[childIndex] = JSON.stringify(child)
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')

    expect(() => new EvolutionLedger(root)).toThrow(/timestamp/u)
  })

  it('durably records an infrastructure failure with the exact retry phase', () => {
    const { ledger, root, ticketId } = seededLedger('failed-retry-phase')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))

    expect(ledger.recordLearningAnalysisFailed({
      analysisId: requested.analysisId,
      resumePhase: 'pending-parent',
    })).toMatchObject({
      phase: 'failed',
      resumePhase: 'pending-parent',
      duplicate: false,
    })
    expect(new EvolutionLedger(root).getLearningAnalysis(
      requested.analysisId,
    )).toMatchObject({ phase: 'failed', resumePhase: 'pending-parent' })
  })

  it('appends one exact resume before retrying the saved durable phase', () => {
    const { ledger, root, ticketId } = seededLedger('failed-resume')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisFailed({
      analysisId: requested.analysisId,
      resumePhase: 'pending-parent',
    })

    const restarted = new EvolutionLedger(root)
    const resumed = restarted.recordLearningAnalysisResumed({
      analysisId: requested.analysisId,
      resumePhase: 'pending-parent',
    })
    expect(resumed).toMatchObject({
      phase: 'pending-parent',
      duplicate: false,
    })
    expect(resumed).not.toHaveProperty('resumePhase')
    expect(restarted.recordLearningAnalysisResumed({
      analysisId: requested.analysisId,
      resumePhase: 'pending-parent',
    })).toMatchObject({ phase: 'pending-parent', duplicate: true })
    expect(restarted.listEvents().filter(event =>
      event.type === 'learning-analysis-resumed')).toHaveLength(1)

    expect(restarted.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId,
      parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })).toMatchObject({ phase: 'running', duplicate: false })
  })

  it('rejects a resume that changes the durable retry phase', () => {
    const { ledger, ticketId } = seededLedger('failed-resume-drift')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisFailed({
      analysisId: requested.analysisId,
      resumePhase: 'pending-parent',
    })

    expect(() => ledger.recordLearningAnalysisResumed({
      analysisId: requested.analysisId,
      resumePhase: 'running',
    })).toThrow(/retry phase/u)
    expect(ledger.getLearningAnalysis(requested.analysisId))
      .toMatchObject({ phase: 'failed', resumePhase: 'pending-parent' })
  })

  it('keeps the terminal governed report separate from the preliminary child report across restart', () => {
    const { ledger, root, ticketId } = seededLedger('terminal-report')
    const requested = ledger.requestLearningAnalysis(requestInput(ticketId))
    ledger.recordLearningAnalysisChildStarted({
      analysisId: requested.analysisId, parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId,
    })
    ledger.recordLearningAnalysisSubmission({
      analysisId: requested.analysisId, childSessionId: requested.childSessionId,
      submission: skillChange(),
    })
    const preliminary = {
      analysisId: requested.analysisId, parentSessionId: requested.parentSessionId,
      childSessionId: requested.childSessionId, reportDigest: `sha256:${'1'.repeat(64)}` as Sha256Digest,
    }
    const terminal = { ...preliminary, reportDigest: `sha256:${'2'.repeat(64)}` as Sha256Digest }
    ledger.recordLearningAnalysisReportIntent(preliminary)
    ledger.recordLearningAnalysisReportDelivered({ ...preliminary, reportMessageId: 'preliminary-message' })
    ledger.recordLearningAnalysisTerminalReportIntent(terminal)
    const restarted = new EvolutionLedger(root)
    expect(restarted.getLearningAnalysis(requested.analysisId)).toMatchObject({
      reportDelivery: { state: 'delivered', reportMessageId: 'preliminary-message' },
      terminalReportDelivery: { state: 'pending', reportDigest: terminal.reportDigest },
    })
    restarted.recordLearningAnalysisTerminalReportDelivered({ ...terminal, reportMessageId: 'terminal-message' })
    expect(restarted.recordLearningAnalysisTerminalReportDelivered({ ...terminal, reportMessageId: 'terminal-message' }))
      .toMatchObject({ duplicate: true, terminalReportDelivery: { state: 'delivered' } })
  })
})
