import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  LedgerIntegrityError,
  prepareResearchSummarySemanticReview,
  prepareRunAcceptanceContract,
  prepareRunBinding,
  type RunBindingInput,
  type RunBindingInputV2,
  type RunBindingInputV3,
} from '../../packages/tianwen-evolution/src/index.js'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'

const roots: string[] = []
const acceptance = {
  source: 'dsh-tool-result',
  toolName: 'verify_summary',
  notMetErrorCode: 'SUMMARY_REQUIREMENT_NOT_MET',
  gapDisposition: 'reusable',
  problemCategory: 'summary-omits-required-result',
  severity: 2,
  blocksGoal: false,
} as const

const qualityContract = {
  schemaVersion: 'tianwen.research-summary-semantic-contract.v1',
  rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
} as const

const semanticAcceptance = { ...acceptance, qualityContract } as const

const base: RunBindingInput = {
  goalRef: 'goal:research-preview',
  taskRef: 'task:summarize-observation',
  sessionId: 'session:run-1',
  scopeKey: 'project:tianwen/capability:research-summary',
  acceptanceContract: acceptance,
}

const digest = (character: string) =>
  `sha256:${character.repeat(64)}` as const

const completedSemanticReview = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 'tianwen.research-summary-semantic-review.v1',
  status: 'completed',
  acceptanceSubjectDigest: digest('a'),
  submissionDigest: digest('b'),
  rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
  reviewerSessionId: 'session:semantic-reviewer',
  reviewerSessionDigest: digest('c'),
  requestDigest: digest('d'),
  reviewEvidenceId: digest('f'),
  idGateVerdict: 'met',
  scores: {
    relevance: 3,
    correctnessReasoning: 3,
    clarityUsability: 3,
    scopeRestraint: 3,
    sourceFidelity: 3,
  },
  ...patch,
})

function bind(
  ledger: EvolutionLedger,
  sessionId: string,
  patch: Partial<RunBindingInput> = {},
) {
  return ledger.recordRunBinding({ ...base, sessionId, ...patch }).runId
}

function bindSemantic(
  ledger: EvolutionLedger,
  sessionId: string,
) {
  return ledger.recordRunBinding({
    ...base,
    sessionId,
    acceptanceContract: semanticAcceptance,
    acceptanceSubjectDigest: digest('a'),
  } as unknown as RunBindingInput).runId
}

function record(
  ledger: EvolutionLedger,
  runId: ReturnType<typeof bind>,
  verdict: 'met' | 'not-met' | 'inconclusive',
  marker = '1',
) {
  return ledger.recordOutcomeIntake({
    runId,
    verdict,
    sessionDigest: digest(marker),
    evidenceIds: verdict === 'inconclusive' ? [] : [digest('e')],
  })
}

function root(prefix: string): string {
  const parent = resolve(
    process.env.TIANWEN_DSH_PROBE_ROOT ?? '.dsh-probe',
    'outcome-intake-ledgers',
  )
  mkdirSync(parent, { recursive: true })
  const value = mkdtempSync(join(parent, `${prefix}-`))
  roots.push(value)
  return value
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('Outcome read projection', () => {
  it('reads the immutable result after restart without exposing mutable ledger state', () => {
    const directory = root('read-projection')
    const ledger = new EvolutionLedger(directory)
    const runId = bind(ledger, 'outcome-projection')
    expect(ledger.getOutcomeIntake(runId)).toBeUndefined()
    record(ledger, runId, 'met')
    const result = ledger.getOutcomeIntake(runId)!
    expect(result.input).toEqual({
      runId, verdict: 'met', sessionDigest: digest('1'), evidenceIds: [digest('e')],
    })
    const before = ledger.listEvents()
    ;(result.input.evidenceIds as string[]).push(digest('b'))
    expect(ledger.getOutcomeIntake(runId)?.input.evidenceIds).toEqual([digest('e')])
    const reopened = new EvolutionLedger(directory)
    expect(reopened.getOutcomeIntake(runId)).toEqual(ledger.getOutcomeIntake(runId))
    expect(ledger.listEvents()).toEqual(before)
  })
})

describe('Research-summary semantic Outcome', () => {
  it('requires independent proof bound to the subject, rubric, and fixed verdict', () => {
    const ledger = new EvolutionLedger(root('semantic-invalid'))
    const runId = bindSemantic(ledger, 'session:semantic-invalid')
    const source = {
      runId,
      sessionDigest: digest('1'),
      evidenceIds: [digest('e')],
    }
    for (const verdict of ['met', 'not-met', 'inconclusive'] as const) {
      expect(() => ledger.recordOutcomeIntake({
        ...source,
        verdict,
      } as Parameters<EvolutionLedger['recordOutcomeIntake']>[0]))
        .toThrow(LedgerIntegrityError)
    }

    const valid = completedSemanticReview()
    const invalid = [
      { ...source, verdict: 'met', semanticReview: { ...valid, acceptanceSubjectDigest: digest('9') } },
      { ...source, verdict: 'met', semanticReview: { ...valid, rubricDigest: digest('9') } },
      { ...source, verdict: 'not-met', semanticReview: valid },
      {
        ...source,
        verdict: 'met',
        semanticReview: {
          ...valid,
          scores: { ...valid.scores, sourceFidelity: 2 },
        },
      },
      {
        ...source,
        verdict: 'met',
        semanticReview: { ...valid, idGateVerdict: 'not-met' },
      },
      {
        ...source,
        verdict: 'met',
        semanticReview: { ...valid, scores: { ...valid.scores, sourceFidelity: 2.5 } },
      },
      {
        ...source,
        verdict: 'met',
        semanticReview: {
          ...valid,
          reviewerSessionId: 'session:semantic-invalid',
        },
      },
      {
        ...source,
        verdict: 'met',
        semanticReview: {
          ...valid,
          reviewerSessionDigest: source.sessionDigest,
        },
      },
      {
        ...source,
        verdict: 'met',
        semanticReview: {
          ...valid,
          reviewEvidenceId: source.evidenceIds[0],
        },
      },
    ]
    for (const input of invalid) {
      expect(() => ledger.recordOutcomeIntake(
        input as Parameters<EvolutionLedger['recordOutcomeIntake']>[0],
      )).toThrow(LedgerIntegrityError)
    }
  })

  it('uses the five-dimension semantic grade without weakening ID gates', () => {
    const ledger = new EvolutionLedger(root('semantic-grade'))
    const cases = [
      {
        sessionId: 'session:semantic-score-2',
        verdict: 'not-met',
        review: completedSemanticReview({
          scores: {
            relevance: 3,
            correctnessReasoning: 3,
            clarityUsability: 3,
            scopeRestraint: 3,
            sourceFidelity: 2,
          },
        }),
        decision: 'signal-recorded',
      },
      {
        sessionId: 'session:semantic-score-3',
        verdict: 'met',
        review: completedSemanticReview(),
        decision: 'no-case',
      },
      {
        sessionId: 'session:semantic-id-failure',
        verdict: 'not-met',
        review: completedSemanticReview({ idGateVerdict: 'not-met' }),
        decision: 'ticket-created',
      },
      {
        sessionId: 'session:semantic-downgrade',
        verdict: 'inconclusive',
        review: completedSemanticReview(),
        decision: 'continue-observing',
      },
    ] as const

    for (const item of cases) {
      const runId = bindSemantic(ledger, item.sessionId)
      expect(ledger.recordOutcomeIntake({
        runId,
        verdict: item.verdict,
        sessionDigest: digest('1'),
        evidenceIds: item.verdict === 'inconclusive' ? [] : [digest('e')],
        semanticReview: item.review,
      } as Parameters<EvolutionLedger['recordOutcomeIntake']>[0]))
        .toMatchObject({ decision: item.decision })
      expect(ledger.getOutcomeIntake(runId)).toMatchObject({
        schemaVersion: 'tianwen.outcome-intake.v2',
        input: { verdict: item.verdict, semanticReview: item.review },
      })
    }
  })

  it('allows only outer inconclusive for an explicit inconclusive proof', () => {
    const ledger = new EvolutionLedger(root('semantic-inconclusive'))
    const semanticReview = {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1',
      status: 'inconclusive',
      reasonCode: 'review-not-completed',
      attempt: null,
    } as const
    const firstRun = bindSemantic(ledger, 'session:semantic-inconclusive-ok')
    expect(ledger.recordOutcomeIntake({
      runId: firstRun,
      verdict: 'inconclusive',
      sessionDigest: digest('1'),
      evidenceIds: [],
      semanticReview,
    } as Parameters<EvolutionLedger['recordOutcomeIntake']>[0]))
      .toMatchObject({ decision: 'continue-observing' })

    const secondRun = bindSemantic(ledger, 'session:semantic-inconclusive-fail')
    expect(() => ledger.recordOutcomeIntake({
      runId: secondRun,
      verdict: 'not-met',
      sessionDigest: digest('2'),
      evidenceIds: [digest('e')],
      semanticReview,
    } as Parameters<EvolutionLedger['recordOutcomeIntake']>[0]))
      .toThrow(LedgerIntegrityError)
    expect(ledger.listLearningSignals()).toEqual([])
  })

  it('replays v2 proof exactly and rejects proof tampering', () => {
    const directory = root('semantic-replay')
    const ledger = new EvolutionLedger(directory)
    const runId = bindSemantic(ledger, 'session:semantic-replay')
    const input = {
      runId,
      verdict: 'met' as const,
      sessionDigest: digest('1'),
      evidenceIds: [digest('e')],
      semanticReview: completedSemanticReview(),
    } as Parameters<EvolutionLedger['recordOutcomeIntake']>[0]
    ledger.recordOutcomeIntake(input)
    expect(ledger.recordOutcomeIntake(structuredClone(input)))
      .toMatchObject({ duplicate: true })
    for (const semanticReview of [
      { ...input.semanticReview, requestDigest: digest('9') },
      { ...input.semanticReview, reviewerSessionId: 'session:another-reviewer' },
      {
        ...input.semanticReview,
        scores: { ...input.semanticReview.scores, relevance: 4 },
      },
    ]) {
      expect(() => ledger.recordOutcomeIntake({ ...input, semanticReview }))
        .toThrow(LedgerIntegrityError)
    }
    expect(new EvolutionLedger(directory).getOutcomeIntake(runId))
      .toEqual(ledger.getOutcomeIntake(runId))

    const path = join(directory, 'ledger.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    const event = JSON.parse(lines.at(-1)!) as {
      input: { semanticReview: { requestDigest: string } }
    }
    event.input.semanticReview.requestDigest = digest('9')
    lines[lines.length - 1] = JSON.stringify(event)
    writeFileSync(path, `${lines.join('\n')}\n`)
    expect(() => new EvolutionLedger(directory)).toThrow(LedgerIntegrityError)
  })
})

describe('Tianwen Run binding', () => {
  it('prepares the explicit research-summary quality contract and requires its subject', () => {
    expect(prepareRunAcceptanceContract(semanticAcceptance))
      .toEqual(semanticAcceptance)
    expect(() => prepareRunAcceptanceContract({
      ...semanticAcceptance,
      qualityContract: {
        ...qualityContract,
        rubricDigest: digest('0'),
      },
    })).toThrow(/rubric/i)
    expect(() => prepareRunBinding({
      ...base,
      acceptanceContract: semanticAcceptance,
    } as unknown as RunBindingInput)).toThrow(/acceptanceSubjectDigest/i)

    const prepared = prepareRunBinding({
      ...base,
      acceptanceContract: semanticAcceptance,
      acceptanceSubjectDigest: digest('a'),
    } as unknown as RunBindingInput)
    expect(prepared).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v2',
      acceptanceContract: semanticAcceptance,
      acceptanceSubjectDigest: digest('a'),
    })
  })

  it('strictly prepares completed and explicit inconclusive semantic reviews', () => {
    const completed = completedSemanticReview()
    expect(prepareResearchSummarySemanticReview(completed)).toEqual(completed)
    const noAttempt = {
      schemaVersion: 'tianwen.research-summary-semantic-review.v1',
      status: 'inconclusive',
      reasonCode: 'review-not-completed',
      attempt: null,
    }
    expect(prepareResearchSummarySemanticReview(noAttempt)).toEqual(noAttempt)
    const incompleteAttempt = {
      ...noAttempt,
      reasonCode: 'review-invalid',
      attempt: {
        acceptanceSubjectDigest: digest('a'),
        submissionDigest: digest('b'),
        rubricDigest: CONTROLLED_SKILL_SOURCE_FIDELITY_RUBRIC_DIGEST,
        reviewerSessionId: 'session:semantic-reviewer',
        requestDigest: digest('d'),
        reviewerSessionDigest: null,
      },
    }
    expect(prepareResearchSummarySemanticReview(incompleteAttempt))
      .toEqual(incompleteAttempt)

    for (const malformed of [
      null,
      undefined,
      { ...completed, submissionDigest: undefined },
      { ...completed, scores: { ...completed.scores, sourceFidelity: 5 } },
      { ...completed, scores: { ...completed.scores, relevance: 2.5 } },
      { ...completed, unexpected: true },
    ]) {
      expect(() => prepareResearchSummarySemanticReview(malformed)).toThrow()
    }
  })

  it('prepares a stable immutable Run identity', () => {
    const first = prepareRunBinding(base)
    expect(prepareRunBinding(structuredClone(base))).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v1',
      goalRef: base.goalRef,
      taskRef: base.taskRef,
      sessionId: base.sessionId,
      scopeKey: base.scopeKey,
      acceptanceContract: acceptance,
    })
    expect(first.runId).toMatch(/^run:[a-f0-9]{64}$/u)
    expect(first.acceptanceContractDigest)
      .toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(first.runId)
      .toBe('run:651b90b41f091d26d593a60659738d971b37b667f7788a462ff21362c9cc0af2')
  })

  it('keeps the legacy Outcome event and digest byte-for-byte compatible', () => {
    const directory = root('legacy-event')
    const ledger = new EvolutionLedger(directory)
    const runId = bind(ledger, base.sessionId)
    record(ledger, runId, 'met')
    const event = ledger.getOutcomeIntake(runId)!

    expect(event.schemaVersion).toBe('tianwen.outcome-intake.v1')
    expect(event.inputDigest)
      .toBe('sha256:2d8088b98cd17ee94c60edf5485971516b2f54a9b1631e69bcb86c25e77f30f7')
    expect(Object.keys(event.input)).toEqual([
      'runId', 'verdict', 'sessionDigest', 'evidenceIds',
    ])
    expect(prepareRunBinding(base).runId)
      .toBe('run:651b90b41f091d26d593a60659738d971b37b667f7788a462ff21362c9cc0af2')
    expect(new EvolutionLedger(directory).getOutcomeIntake(runId)).toEqual(event)
  })

  it('binds a v2 verifier subject outside the reusable acceptance contract', () => {
    const subjectA = digest('a')
    const subjectB = digest('b')
    const v2: RunBindingInputV2 = {
      ...base,
      acceptanceSubjectDigest: subjectA,
    }
    const v1 = prepareRunBinding(base)
    const first = prepareRunBinding(v2)
    const changedSubject = prepareRunBinding({
      ...v2,
      acceptanceSubjectDigest: subjectB,
    })

    expect(prepareRunAcceptanceContract(acceptance)).toEqual(acceptance)
    expect(first).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v2',
      acceptanceSubjectDigest: subjectA,
      acceptanceContractDigest: v1.acceptanceContractDigest,
    })
    expect(first.runId).not.toBe(v1.runId)
    expect(changedSubject.runId).not.toBe(first.runId)
    expect(changedSubject.acceptanceContractDigest)
      .toBe(first.acceptanceContractDigest)
    expect(() => prepareRunBinding({
      ...v2,
      acceptanceSubjectDigest: 'sha256:not-a-digest',
    } as unknown as RunBindingInputV2)).toThrow(/acceptanceSubjectDigest/i)

    const ledgerRoot = root('v2-binding')
    const ledger = new EvolutionLedger(ledgerRoot)
    expect(ledger.recordRunBinding(v2)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(v2)).toMatchObject({ duplicate: true })
    expect(new EvolutionLedger(ledgerRoot).getRunBinding(first.runId))
      .toEqual(first)
    expect(() => ledger.recordRunBinding({
      ...v2,
      acceptanceSubjectDigest: subjectB,
    })).toThrow(LedgerIntegrityError)
  })

  it('persists and exactly replays a v3 Session lifecycle identity', () => {
    const ledgerRoot = root('v3-binding')
    const v3: RunBindingInputV3 = {
      ...base,
      acceptanceSubjectDigest: digest('a'),
      sessionLifecycleFingerprint: digest('f'),
    }
    const prepared = prepareRunBinding(v3)
    const ledger = new EvolutionLedger(ledgerRoot)

    expect(prepared).toMatchObject({
      schemaVersion: 'tianwen.run-binding.v3',
      acceptanceSubjectDigest: digest('a'),
      sessionLifecycleFingerprint: digest('f'),
    })
    expect(prepared.runId).toBe(prepareRunBinding({
      ...base,
      acceptanceSubjectDigest: digest('a'),
    }).runId)
    expect(ledger.recordRunBinding(v3)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(structuredClone(v3)))
      .toMatchObject({ runId: prepared.runId, duplicate: true })
    expect(new EvolutionLedger(ledgerRoot).getRunBinding(prepared.runId))
      .toEqual(prepared)
    expect(() => ledger.recordRunBinding({
      ...v3,
      sessionLifecycleFingerprint: digest('e'),
    })).toThrow(LedgerIntegrityError)
  })

  it('rejects a tampered v3 lifecycle fingerprint on reload', () => {
    const ledgerRoot = root('v3-binding-tamper')
    const ledger = new EvolutionLedger(ledgerRoot)
    ledger.recordRunBinding({
      ...base,
      sessionLifecycleFingerprint: digest('f'),
    } satisfies RunBindingInputV3)
    const path = join(ledgerRoot, 'ledger.jsonl')
    const event = JSON.parse(readFileSync(path, 'utf8')) as {
      binding: { sessionLifecycleFingerprint: string }
    }
    event.binding.sessionLifecycleFingerprint = digest('e')
    writeFileSync(path, `${JSON.stringify(event)}\n`)

    expect(() => new EvolutionLedger(ledgerRoot)).toThrow(LedgerIntegrityError)
  })

  it('keeps different v2 subjects in the same reusable recurrence group', () => {
    const ledger = new EvolutionLedger(root('v2-recurrence'))
    const firstRun = ledger.recordRunBinding({
      ...base,
      sessionId: 'session:v2-subject-a',
      acceptanceSubjectDigest: digest('a'),
    }).runId
    const secondRun = ledger.recordRunBinding({
      ...base,
      sessionId: 'session:v2-subject-b',
      acceptanceSubjectDigest: digest('b'),
    }).runId

    expect(record(ledger, firstRun, 'not-met', 'a'))
      .toMatchObject({ decision: 'signal-recorded' })
    expect(record(ledger, secondRun, 'not-met', 'b'))
      .toMatchObject({ decision: 'ticket-created' })
  })

  it('replays the same binding and rejects a changed binding for one Session', () => {
    const ledger = new EvolutionLedger(root('binding'))
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: false })
    expect(ledger.recordRunBinding(base)).toMatchObject({ duplicate: true })
    expect(() => ledger.recordRunBinding({
      ...base,
      scopeKey: 'project:other/capability:research-summary',
    })).toThrow(LedgerIntegrityError)
  })

  it('records one Signal first and creates one Ticket on the second Run', () => {
    const ledger = new EvolutionLedger(root('recurrence'))
    const firstRun = bind(ledger, 'session:run-1')
    const secondRun = bind(ledger, 'session:run-2')
    const first = ledger.recordOutcomeIntake({
      runId: firstRun,
      verdict: 'not-met',
      sessionDigest: digest('1'),
      evidenceIds: [digest('2')],
    })
    expect(first).toMatchObject({
      decision: 'signal-recorded',
      duplicate: false,
    })
    expect(first.ticketId).toBeUndefined()
    expect(ledger.listLearningSignals()).toHaveLength(1)
    expect(ledger.listLearningTickets()).toEqual([])

    const secondInput = {
      runId: secondRun,
      verdict: 'not-met' as const,
      sessionDigest: digest('3'),
      evidenceIds: [digest('4')],
    }
    const second = ledger.recordOutcomeIntake(secondInput)
    expect(second).toMatchObject({
      decision: 'ticket-created',
      duplicate: false,
    })
    expect(ledger.listLearningSignals()).toHaveLength(2)
    expect(ledger.listLearningTickets()).toMatchObject([{
      ticketId: second.ticketId,
      status: 'open',
      signalIds: [first.signalId, second.signalId],
    }])
    expect(ledger.recordOutcomeIntake(secondInput))
      .toMatchObject({ duplicate: true })
  })

  it('triages met, inconclusive, observe, and ordinary correction outcomes', () => {
    const ledger = new EvolutionLedger(root('triage'))
    expect(record(ledger, bind(ledger, 'session:met'), 'met'))
      .toMatchObject({ decision: 'no-case' })
    expect(record(
      ledger,
      bind(ledger, 'session:inconclusive'),
      'inconclusive',
      '2',
    )).toMatchObject({ decision: 'continue-observing' })
    expect(record(
      ledger,
      bind(ledger, 'session:observe', {
        acceptanceContract: {
          source: acceptance.source,
          toolName: acceptance.toolName,
          notMetErrorCode: acceptance.notMetErrorCode,
          gapDisposition: 'observe',
        },
      }),
      'not-met',
      '3',
    )).toMatchObject({ decision: 'continue-observing' })
    expect(record(
      ledger,
      bind(ledger, 'session:ordinary', {
        acceptanceContract: {
          source: acceptance.source,
          toolName: acceptance.toolName,
          notMetErrorCode: acceptance.notMetErrorCode,
          gapDisposition: 'ordinary-correction',
        },
      }),
      'not-met',
      '4',
    )).toMatchObject({ decision: 'ordinary-correction' })
    expect(ledger.listLearningSignals()).toEqual([])
  })

  it('merges a third distinct Run into the existing Ticket', () => {
    const ledger = new EvolutionLedger(root('third-run'))
    const receipts = ['1', '2', '3'].map(marker => record(
      ledger,
      bind(ledger, `session:${marker}`),
      'not-met',
      marker,
    ))
    expect(receipts.map(item => item.decision)).toEqual([
      'signal-recorded',
      'ticket-created',
      'ticket-merged',
    ])
    expect(ledger.listLearningTickets()[0]?.signalIds).toEqual(
      receipts.map(item => item.signalId),
    )
  })

  it('does not merge different scopes, categories, errors, or contracts', () => {
    const ledger = new EvolutionLedger(root('fingerprints'))
    const patches: Partial<RunBindingInput>[] = [
      { scopeKey: 'project:other/capability:research-summary' },
      {
        acceptanceContract: {
          ...acceptance,
          problemCategory: 'different-category',
        },
      },
      {
        acceptanceContract: {
          ...acceptance,
          notMetErrorCode: 'DIFFERENT_ERROR',
        },
      },
      {
        acceptanceContract: {
          ...acceptance,
          toolName: 'verify_different_contract',
        },
      },
    ]
    record(ledger, bind(ledger, 'session:base'), 'not-met', '0')
    for (const [index, patch] of patches.entries()) {
      expect(record(
        ledger,
        bind(ledger, `session:different-${index}`, patch),
        'not-met',
        String(index + 1),
      )).toMatchObject({ decision: 'signal-recorded' })
    }
    expect(ledger.listLearningTickets()).toEqual([])
  })

  it.each([
    { severity: 4 as const, blocksGoal: false },
    { severity: 2 as const, blocksGoal: true },
  ])('creates an immediate Ticket for trusted gates: %o', gate => {
    const ledger = new EvolutionLedger(root('immediate'))
    const runId = bind(ledger, 'session:immediate', {
      acceptanceContract: { ...acceptance, ...gate },
    })
    expect(record(ledger, runId, 'not-met')).toMatchObject({
      decision: 'ticket-created',
    })
    expect(ledger.listLearningTickets()).toHaveLength(1)
  })

  it('rejects changed Outcome replay content for one Run ingestion', () => {
    const ledger = new EvolutionLedger(root('changed-replay'))
    const runId = bind(ledger, 'session:changed')
    const input = {
      runId,
      verdict: 'not-met' as const,
      sessionDigest: digest('1'),
      evidenceIds: [digest('2')],
    }
    ledger.recordOutcomeIntake(input)
    for (const changed of [
      { ...input, verdict: 'met' as const },
      { ...input, evidenceIds: [digest('3')] },
      { ...input, sessionDigest: digest('4') },
    ]) {
      expect(() => ledger.recordOutcomeIntake(changed))
        .toThrow(LedgerIntegrityError)
    }
  })

  it('replays bindings, Signals, Tickets, and ordering from disk', () => {
    const ledgerRoot = root('reload')
    const ledger = new EvolutionLedger(ledgerRoot)
    record(ledger, bind(ledger, 'session:reload-1'), 'not-met', '1')
    record(ledger, bind(ledger, 'session:reload-2'), 'not-met', '2')
    const events = ledger.listEvents()
    const signals = ledger.listLearningSignals()
    const tickets = ledger.listLearningTickets()
    const reloaded = new EvolutionLedger(ledgerRoot)
    expect(reloaded.listEvents()).toEqual(events)
    expect(reloaded.listLearningSignals()).toEqual(signals)
    expect(reloaded.listLearningTickets()).toEqual(tickets)
  })

  it('fails closed on a malformed Outcome event', () => {
    const ledgerRoot = root('malformed')
    const ledger = new EvolutionLedger(ledgerRoot)
    bind(ledger, 'session:malformed')
    appendFileSync(join(ledgerRoot, 'ledger.jsonl'), `${JSON.stringify({
      schemaVersion: 'tianwen.outcome-intake.v1',
      type: 'outcome-intake-recorded',
      at: '2026-08-20T00:00:00.000Z',
      input: {},
    })}\n`)
    expect(() => new EvolutionLedger(ledgerRoot)).toThrow(LedgerIntegrityError)
  })
})
