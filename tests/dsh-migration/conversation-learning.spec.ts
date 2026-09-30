import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent } from '../../packages/tianwen-evolution/src/ledger.js'
import { canonicalJson, sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { baselineGuidanceSnapshot, guidanceVersion } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { conversationQualityContract, hasCurrentConversationQuality, parseConversationAuditedReviewChecks, parseConversationLearningRecord, parseConversationQualityContract, conversationReviewConsensus, parseConversationReviewChecks } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { conversationExternalInputsDigest, parseConversationExternalCheckOutcome } from '../../packages/tianwen-evolution/src/conversation-external-check.js'

const roots: string[] = []
function root() {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : resolve('tmp/conversation-tests'))
  mkdirSync(base, { recursive: true })
  const directory = mkdtempSync(join(base, 'ledger-'))
  roots.push(directory)
  return directory
}
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }) })

it('keeps the exact v10 quality contract readable while v11 is current', () => {
  const current = conversationQualityContract()
  const historical = { ...current, schemaVersion: 'tianwen.conversation-quality.v10' as const }
  expect(current.schemaVersion).toBe('tianwen.conversation-quality.v11')
  expect(parseConversationQualityContract(historical)).toEqual(historical)
  expect(hasCurrentConversationQuality(historical)).toBe(false)
  expect(hasCurrentConversationQuality(current)).toBe(true)
})

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
function admission(taskId: string, mode = 'text' as 'text' | 'external' | 'subjective' | 'local-files') {
  return {
    kind: 'task-admitted' as const, taskId, proof, qualityContract: conversationQualityContract(),
    decision: { kind: 'task' as const, objective: 'Summarize the supplied measurements.', criteria: ['Retain the measured percentage and pilot-only scope.'], family: 'summarization' as const, evaluationMode: mode, relatedTaskId: null, feedback: null,
      ...(mode === 'local-files' ? { fileOutputKind: 'files' as const } : {}) },
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
function externalCheckSetup() {
  const directory = root(), ledger = ledgerWithConsent(directory), source = start()
  ledger.recordConversationLearning(source)
  const initial = admission(source.taskId, 'external')
  const admitted = { ...initial, decision: { ...initial.decision, family: 'code' as const } }
  ledger.recordConversationLearning(admitted)
  const prepared = { kind: 'task-external-check-prepared' as const, taskId: source.taskId, preparedSeq: 12,
    requestDigest: source.requestDigest, contextDigest: source.contextDigest, admissionDigest: sha256(admitted), modelConfigDigest: sha256('model'),
    checkerId: 'mechanism-check', checkerDigest: sha256('checker'), contractDigest: sha256('contract'), inputsDigest: sha256([{ path: 'input.ts', content: 'before' }]) }
  const capture = { kind: 'task-file-input-captured' as const, taskId: source.taskId, callId: 'write-1', callSeq: 14, path: 'input.ts', content: 'before' }
  const files = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: 'files' as const,
    inputsDigest: prepared.inputsDigest, captureSeq: 17, outputPaths: ['input.ts'], entries: [{ path: 'input.ts', content: 'after' }] }
  const result = { kind: 'task-external-check-finished' as const, taskId: source.taskId, preparationDigest: sha256(prepared),
    resultDigest: finish(source.taskId).resultDigest, fileResultDigest: sha256(files), status: 'verified' as const, detail: 'Checked frozen output.' }
  const complete = () => {
    ledger.recordConversationLearning(prepared)
    ledger.recordConversationLearning({ kind: 'task-model-observed', taskId: source.taskId, headerSeq: 8, modelConfigDigest: prepared.modelConfigDigest })
    ledger.recordConversationLearning(capture)
    ledger.recordConversationLearning({ ...finish(source.taskId), files })
  }
  return { directory, ledger, source, prepared, capture, files, result, complete }
}
function auditedChecks(verdict: 'met' | 'not-met' | 'inconclusive' = 'met') {
  return parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({
    focus, verdict, category: verdict === 'not-met' ? 'source-fidelity' : null,
    explanation: 'Checked the frozen answer.', evidenceQuotes: ['answer'], proof: {
      sessionId: `audit:${focus}`, sessionDigest: sha256(`session:${focus}`), requestDigest: sha256(`request:${focus}`),
    }, audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256('frozen evidence'), units: { 'answer-1': { firstClaim: {
      quote: 'answer', kind: 'source-fact', status: verdict === 'met' ? 'supported' : verdict === 'not-met' ? 'unsupported' : 'uncertain',
      sourceIds: ['request-1'], explanation: 'Checked against request-1.',
    }, additionalClaims: [] } } },
  })))
}

describe('natural conversation task evidence', () => {
  it('freezes separate external check records and cold-replays them without granting a model review', () => {
    const { directory, ledger, prepared, result, complete } = externalCheckSetup()
    complete()
    expect(ledger.recordConversationLearning(prepared)).toEqual({ duplicate: true })
    expect(() => ledger.recordConversationLearning({ ...prepared, contractDigest: sha256('new contract') })).toThrow(/freeze|changed/i)
    expect(ledger.recordConversationLearning(result)).toEqual({ duplicate: false })
    expect(ledger.recordConversationLearning(result)).toEqual({ duplicate: true })
    expect(() => ledger.recordConversationLearning({ ...result, status: 'rejected' })).toThrow(/freeze|changed/i)
    expect(new EvolutionLedger(directory).listConversationTasks()).toEqual(ledger.listConversationTasks())
    expect(ledger.listConversationTasks()[0]?.review).toBeUndefined()
  })

  it.each(['requestDigest', 'contextDigest', 'admissionDigest'] as const)('rejects a prepared check with a changed %s', field => {
    const { ledger, prepared } = externalCheckSetup()
    expect(() => ledger.recordConversationLearning({ ...prepared, [field]: sha256('other task') })).toThrow(/original task/i)
  })

  it.each(['model', 'file', 'completion'] as const)('rejects check preparation after %s evidence', phase => {
    const { ledger, source, prepared, capture } = externalCheckSetup()
    if (phase === 'model') ledger.recordConversationLearning({ kind: 'task-model-observed', taskId: source.taskId, headerSeq: 8, modelConfigDigest: sha256('model') })
    else if (phase === 'file') ledger.recordConversationLearning(capture)
    else ledger.recordConversationLearning(finish(source.taskId))
    expect(() => ledger.recordConversationLearning(prepared)).toThrow(/before/i)
  })

  it.each(['preparationDigest', 'resultDigest', 'fileResultDigest'] as const)('rejects a check result with a changed %s', field => {
    const { ledger, result, complete } = externalCheckSetup()
    complete()
    expect(() => ledger.recordConversationLearning({ ...result, [field]: sha256('other result') })).toThrow(/match/i)
  })

  it('refuses conclusive external results after model drift and refuses new analysis after revocation', () => {
    const { ledger, source, result, complete } = externalCheckSetup()
    complete()
    // Separate native configuration epoch recorded within the completed span.
    // Insert before completion in a fresh fixture instead of modifying history.
    const drift = externalCheckSetup()
    drift.ledger.recordConversationLearning(drift.prepared)
    drift.ledger.recordConversationLearning({ kind: 'task-model-observed', taskId: drift.source.taskId, headerSeq: 8, modelConfigDigest: sha256('different model') })
    drift.ledger.recordConversationLearning(drift.capture)
    drift.ledger.recordConversationLearning({ ...finish(drift.source.taskId), files: drift.files })
    expect(() => drift.ledger.recordConversationLearning(drift.result)).toThrow(/changed|missing/i)
    drift.ledger.recordConversationLearning({ ...drift.result, status: 'unverifiable' })
    ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    expect(() => ledger.recordConversationLearning(result)).toThrow(/consent/i)
    expect(ledger.listConversationTasks()[0]?.externalCheckPrepared?.taskId).toBe(source.taskId)
  })

  it('requires bounded exact external result fields and an order-independent target input identity', () => {
    const { prepared, result } = externalCheckSetup()
    expect(() => parseConversationLearningRecord({ ...prepared, preparedSeq: 0 })).toThrow()
    expect(() => parseConversationLearningRecord({ ...result, met: true })).toThrow()
    for (const status of [true, null, { toString: () => 'verified' }, 'met']) expect(() => parseConversationExternalCheckOutcome({ status, detail: 'checked' })).toThrow()
    const inputs = [{ path: 'b.ts', content: null }, { path: 'a.ts', content: 'source' }]
    expect(conversationExternalInputsDigest(inputs)).toBe(sha256([{ path: 'a.ts', content: 'source' }, { path: 'b.ts', content: null }]))
    expect(conversationExternalInputsDigest([...inputs].reverse())).toBe(conversationExternalInputsDigest(inputs))
    expect(() => conversationExternalInputsDigest([])).toThrow(/inputs/i)
  })

  it.each(['prepared', 'finished'] as const)('refuses serialized external %s records appended after consent revocation', phase => {
    const state = externalCheckSetup()
    if (phase === 'finished') state.complete()
    state.ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    appendFileSync(join(state.directory, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-learning-recorded',
      schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-30T12:00:00.000Z', record: phase === 'prepared' ? state.prepared : state.result })}\n`)
    expect(() => new EvolutionLedger(state.directory)).toThrow(/consent/i)
  })
  it('rejects silent proofless completed v5 task reviews but retains explicit unavailability', () => {
    const ledger = ledgerWithConsent(), source = start(), admitted = admission(source.taskId)
    ledger.recordConversationLearning(source); ledger.recordConversationLearning(admitted); ledger.recordConversationLearning(finish(source.taskId))
    const silent = { kind: 'task-reviewed' as const, taskId: source.taskId, admissionDigest: sha256(admitted), resultDigest: sha256('answer'),
      verdict: 'inconclusive' as const, category: null, explanation: 'No result.', evidenceQuotes: [], proof: null, unavailableReason: null }
    expect(() => ledger.recordConversationLearning(silent)).toThrow(/unavailable|audit|proof|review checks/i)
    const unavailable = { ...silent, unavailableReason: 'model-unavailable' as const }
    expect(ledger.recordConversationLearning(unavailable)).toEqual({ duplicate: false })
    expect(ledger.listConversationTasks()[0]?.review).toEqual(unavailable)

    for (const [turn, decisionKind, status] of [[2, 'conversation', 'completed'], [3, 'task', 'interrupted']] as const) {
      const next = start(turn), nextAdmission = { ...admission(next.taskId), decision: { ...admission(next.taskId).decision, kind: decisionKind } }
      ledger.recordConversationLearning(next); ledger.recordConversationLearning(nextAdmission)
      ledger.recordConversationLearning({ ...finish(next.taskId, turn * 10 + 8), status })
      expect(ledger.recordConversationLearning({ ...silent, taskId: next.taskId, admissionDigest: sha256(nextAdmission) })).toEqual({ duplicate: false })
    }

    const directory = root(), replay = ledgerWithConsent(directory), replaySource = start(4), replayAdmission = admission(replaySource.taskId)
    replay.recordConversationLearning(replaySource); replay.recordConversationLearning(replayAdmission); replay.recordConversationLearning(finish(replaySource.taskId, 48))
    appendFileSync(join(directory, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-learning-recorded', schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-07T00:00:00.000Z',
      record: { ...silent, taskId: replaySource.taskId, admissionDigest: sha256(replayAdmission) } })}\n`)
    expect(() => new EvolutionLedger(directory)).toThrow(/unavailable|audit|proof|review checks/i)
  })

  it('rejects malformed and wrong-format v5 checks through task state and serialized replay', () => {
    const setup = (directory = root()) => {
      const ledger = ledgerWithConsent(directory), source = start(), admitted = admission(source.taskId)
      ledger.recordConversationLearning(source); ledger.recordConversationLearning(admitted); ledger.recordConversationLearning(finish(source.taskId))
      return { directory, ledger, source, admitted }
    }
    const value = setup(), checks = auditedChecks()
    const review = { kind: 'task-reviewed' as const, taskId: value.source.taskId, admissionDigest: sha256(value.admitted), resultDigest: sha256('answer'),
      ...conversationReviewConsensus(checks), unavailableReason: null, reviewChecks: checks }
    const legacy = checks.map(({ audit: _audit, ...check }) => check)
    const malformed = [
      { ...review, reviewChecks: legacy },
      { ...review, reviewChecks: [checks[0], legacy[1]] },
      { ...review, reviewChecks: [checks[0], { ...checks[1], audit: { ...checks[1].audit, schemaVersion: 'wrong' } }] },
    ]
    for (const record of malformed) expect(() => value.ledger.recordConversationLearning(record as never)).toThrow()

    const replay = setup()
    appendFileSync(join(replay.directory, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-learning-recorded', schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-07T00:00:00.000Z', record: malformed[2] })}\n`)
    expect(() => new EvolutionLedger(replay.directory)).toThrow()
  })
  it('rejects missing or forged v2 consensus and preserves a real disagreement as inconclusive', () => {
    const ledger = ledgerWithConsent(), source = start(), admitted = admission(source.taskId)
    ledger.recordConversationLearning(source); ledger.recordConversationLearning(admitted); ledger.recordConversationLearning(finish(source.taskId))
    const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map((focus, index) => ({ focus,
      verdict: index === 0 ? 'met' : 'not-met', category: index === 0 ? null : 'instruction-following', explanation: 'Original output restriction checked.', evidenceQuotes: ['only output'],
      proof: { sessionId: focus, sessionDigest: sha256(focus), requestDigest: sha256(`input:${focus}`) },
      audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256('task evidence'), units: { 'answer-1': { firstClaim: { quote: 'only output', kind: 'source-fact', status: index === 0 ? 'supported' : 'unsupported', sourceIds: ['request-1'], explanation: 'Checked against the request.' }, additionalClaims: [] } } } })))
    const review = { kind: 'task-reviewed' as const, taskId: source.taskId, admissionDigest: sha256(admitted), resultDigest: sha256('answer'),
      ...conversationReviewConsensus(reviewChecks), unavailableReason: null }
    expect(() => ledger.recordConversationLearning(review)).toThrow(/two independent/i)
    expect(() => ledger.recordConversationLearning({ ...review, reviewChecks, verdict: 'met' })).toThrow(/consensus/i)
    ledger.recordConversationLearning({ ...review, reviewChecks })
    expect(ledger.listConversationTasks()[0]?.review).toMatchObject({ verdict: 'inconclusive', reviewChecks })
  })
  it('retains longer native review explanations while bounding only the stored consensus summary', () => {
    const checks = auditedChecks().map((check, index) => ({ ...check,
      explanation: index === 0 ? '证'.repeat(663) + 'a' : 'b'.repeat(1285),
    }))
    expect(Buffer.byteLength(checks[0]!.explanation, 'utf8')).toBe(1990)
    const parsed = parseConversationAuditedReviewChecks(checks)
    expect(parsed[0].explanation).toBe(checks[0]!.explanation)
    expect(conversationReviewConsensus(parsed).explanation).toContain(checks[0]!.explanation)

    const longChecks = parseConversationAuditedReviewChecks(auditedChecks().map(check => ({ ...check,
      explanation: '界'.repeat(1365),
    })))
    const consensus = conversationReviewConsensus(longChecks)
    expect(Buffer.byteLength(consensus.explanation, 'utf8')).toBeLessThanOrEqual(4096)
    expect(consensus.explanation).toContain('…\nGrounding check')
    expect(longChecks.every(check => Buffer.byteLength(check.explanation, 'utf8') === 4095)).toBe(true)
    expect(() => parseConversationAuditedReviewChecks(auditedChecks().map(check => ({ ...check,
      explanation: 'x'.repeat(4097),
    })))).toThrow(/text is invalid/i)
    const source = start(), admitted = admission(source.taskId)
    const review = { kind: 'task-reviewed' as const, taskId: source.taskId, admissionDigest: sha256(admitted),
      resultDigest: sha256('answer'), ...consensus, unavailableReason: null, reviewChecks: longChecks }
    expect(parseConversationLearningRecord(review)).toEqual(review)
  })
  it('rejects a newly appended task admission without the current host contract while retaining unavailable admissions', () => {
    const ledger = ledgerWithConsent()
    const source = start()
    ledger.recordConversationLearning(source)
    const { qualityContract: _quality, ...missingContract } = admission(source.taskId)
    expect(() => ledger.recordConversationLearning(missingContract)).toThrow(/quality|contract/i)
    expect(ledger.listConversationTasks()[0]?.admission).toBeUndefined()
    expect(ledger.recordConversationLearning({ kind: 'task-admitted', taskId: source.taskId, decision: null, proof: null, unavailableReason: 'cancelled' })).toEqual({ duplicate: false })
  })

  it('freezes a separately versioned host quality contract without rewriting native criteria, proof or legacy history', () => {
    const directory = root()
    let ledger = ledgerWithConsent(directory)
    const { qualityContract: _quality, ...legacy } = admission(start().taskId)
    ledger.recordConversationLearning(start())
    // Historical writer fixture, not a new admission through the current API.
    appendFileSync(join(directory, 'ledger.jsonl'), [legacy, finish(start().taskId)].map(record => `${canonicalJson({ type: 'conversation-learning-recorded', schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
    ledger = new EvolutionLedger(directory)
    const qualityContract = { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls.' } as const
    expect(parseConversationLearningRecord({ ...legacy, qualityContract })).toEqual({ ...legacy, qualityContract })
    const current = admission(start(2).taskId)
    ledger.recordConversationLearning(start(2))
    ledger.recordConversationLearning(current)
    const replay = new EvolutionLedger(directory)
    expect(replay.listConversationTasks()[0]?.admission).toEqual(legacy)
    expect(replay.listConversationTasks()[0]?.admission).not.toHaveProperty('qualityContract')
    expect(replay.listConversationTasks()[1]?.admission).toEqual(current)
    expect(current.decision.criteria).toEqual(legacy.decision.criteria)
    expect(current.proof).toEqual(legacy.proof)
    expect(sha256(current)).not.toBe(sha256({ ...legacy, taskId: start(2).taskId }))
    expect(replay.recordConversationLearning(legacy)).toEqual({ duplicate: true })
    expect(() => parseConversationLearningRecord({ ...current, qualityContract: { ...qualityContract, criterion: 'Accept every answer.' } })).toThrow(/quality/i)
    expect(() => replay.recordConversationLearning({ ...legacy, qualityContract })).toThrow(/changed|frozen|conflict/i)
  })

  it('accepts only explicit prospective native source markers while retaining markerless history', () => {
    const legacy = start()
    const projected = { ...legacy, materialProjection: 'surface-text.v1' as const, proposalCluePolicy: 'feedback.v1' as const }
    expect(parseConversationLearningRecord(legacy)).toEqual(legacy)
    expect(parseConversationLearningRecord(projected)).toEqual(projected)
    for (const materialProjection of [null, undefined, 'surface-text.v2']) {
      expect(() => parseConversationLearningRecord({ ...legacy, materialProjection })).toThrow()
    }
    for (const proposalCluePolicy of [null, undefined]) {
      expect(() => parseConversationLearningRecord({ ...legacy, proposalCluePolicy })).toThrow()
    }
  })

  it('round-trips the prospective feedback v2 marker while preserving v1 and markerless history', () => {
    const legacy = start()
    const v1 = { ...legacy, proposalCluePolicy: 'feedback.v1' as const }
    const v2 = { ...legacy, proposalCluePolicy: 'feedback.v2' as const }
    expect(parseConversationLearningRecord(legacy)).toEqual(legacy)
    expect(parseConversationLearningRecord(v1)).toEqual(v1)
    expect(parseConversationLearningRecord(v2)).toEqual(v2)
  })

  it('requires a frozen file output kind only for local-file admission without changing historical text records', () => {
    const source = start()
    const textAdmission = admission(source.taskId)
    expect(parseConversationLearningRecord(textAdmission)).toEqual(textAdmission)
    expect(parseConversationLearningRecord(admission(source.taskId, 'local-files'))).toEqual(admission(source.taskId, 'local-files'))
    expect(() => parseConversationLearningRecord({ ...textAdmission, decision: { ...textAdmission.decision, fileOutputKind: 'chat' } })).toThrow(/decision|file|field/i)
    const local = admission(source.taskId, 'local-files')
    const { fileOutputKind: _kind, ...missingKind } = local.decision
    expect(() => parseConversationLearningRecord({ ...local, decision: missingKind })).toThrow(/output|kind|file/i)
  })

  it('accepts an explicit unavailable result review when local file evidence is incomplete', () => {
    const source = start()
    const admitted = admission(source.taskId, 'local-files')
    const record = { kind: 'task-reviewed' as const, taskId: source.taskId,
      admissionDigest: sha256(admitted), resultDigest: sha256('result'), verdict: 'inconclusive' as const,
      category: null, explanation: 'Verified local file evidence is unavailable.', evidenceQuotes: [],
      proof: null, unavailableReason: 'file-evidence-unavailable' as const }
    expect(parseConversationLearningRecord(record)).toEqual(record)
  })

  it('reserves file evidence unavailability for result reviews, not admission', () => {
    const source = start()
    expect(() => parseConversationLearningRecord({ kind: 'task-admitted', taskId: source.taskId,
      decision: null, proof: null, unavailableReason: 'file-evidence-unavailable' })).toThrow(/admission|unavailable/i)
  })

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

  it('freezes the first file preimage and rejects replacement or post-result capture', () => {
    const ledger = ledgerWithConsent()
    const source = start()
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(admission(source.taskId, 'local-files'))
    const captured = { kind: 'task-file-input-captured' as const, taskId: source.taskId,
      callId: 'write-1', callSeq: 14, path: 'input.md', content: 'original\r\n' }
    expect(ledger.recordConversationLearning(captured)).toEqual({ duplicate: false })
    expect(ledger.recordConversationLearning(captured)).toEqual({ duplicate: true })
    expect(() => ledger.recordConversationLearning({ ...captured, callId: 'write-2', content: 'rewritten\r\n' })).toThrow(/first|preimage|path|capture|freeze/i)
    expect(ledger.listConversationTasks()[0]?.fileInputs).toEqual([captured])
    ledger.recordConversationLearning(finish(source.taskId))
    expect(() => ledger.recordConversationLearning({ ...captured, callId: 'write-3', callSeq: 17, path: 'output.md', content: null })).toThrow(/before|completed|result/i)
  })

  it('persists external code files without allowing an external model success review', () => {
    const directory = root(), ledger = ledgerWithConsent(directory), source = start()
    ledger.recordConversationLearning(source)
    const admitted = admission(source.taskId, 'external')
    ledger.recordConversationLearning({ ...admitted, decision: { ...admitted.decision, family: 'code' } })
    const captured = { kind: 'task-file-input-captured' as const, taskId: source.taskId,
      callId: 'code-write', callSeq: 14, path: 'input.ts', content: 'before' }
    ledger.recordConversationLearning(captured)
    const files = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: 'files' as const,
      inputsDigest: sha256([{ path: 'input.ts', content: 'before' }]), captureSeq: 17,
      outputPaths: ['input.ts'], entries: [{ path: 'input.ts', content: 'after' }] }
    expect(() => ledger.recordConversationLearning({ ...finish(source.taskId), files: { ...files, outputKind: 'chat', outputPaths: [] } })).toThrow(/file/i)
    ledger.recordConversationLearning({ ...finish(source.taskId), files })
    const checks = auditedChecks(), consensus = conversationReviewConsensus(checks)
    const result = { ...consensus, kind: 'task-reviewed' as const, taskId: source.taskId,
      admissionDigest: sha256(ledger.listConversationTasks()[0]!.admission), resultDigest: finish(source.taskId).resultDigest,
      reviewChecks: checks, unavailableReason: null }
    expect(() => ledger.recordConversationLearning(result)).toThrow(/external/i)
    ledger.recordConversationLearning({ ...result, verdict: 'inconclusive' })
    expect(new EvolutionLedger(directory).listConversationTasks()).toEqual(ledger.listConversationTasks())
  })

  it.each(['external', 'text', 'subjective'] as const)('does not accept file evidence for a %s non-code task', mode => {
    const ledger = ledgerWithConsent(), source = start()
    ledger.recordConversationLearning(source)
    ledger.recordConversationLearning(admission(source.taskId, mode))
    expect(() => ledger.recordConversationLearning({ kind: 'task-file-input-captured', taskId: source.taskId,
      callId: 'unexpected', callSeq: 14, path: 'input.md', content: 'source' })).toThrow(/admission/i)
    expect(() => ledger.recordConversationLearning({ kind: 'task-file-evidence-unavailable', taskId: source.taskId,
      reason: 'unsupported-tool' })).toThrow(/admission/i)
    ledger.recordConversationLearning(finish(source.taskId))
    expect(ledger.listConversationTasks()[0]?.fileInputs).toBeUndefined()
  })

  it('binds file completion to the frozen kind, input digest and exact final path coverage', () => {
    const setup = (kind: 'files' | 'chat' = 'files') => {
      const ledger = ledgerWithConsent(), source = start()
      ledger.recordConversationLearning(source)
      const admitted = admission(source.taskId, 'local-files')
      ledger.recordConversationLearning({ ...admitted, decision: { ...admitted.decision, fileOutputKind: kind } })
      const captured = { kind: 'task-file-input-captured' as const, taskId: source.taskId,
        callId: `${kind}-1`, callSeq: 14, path: 'input.md', content: 'original\r\n' }
      ledger.recordConversationLearning(captured)
      const files = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: kind,
        inputsDigest: sha256([{ path: 'input.md', content: 'original\r\n' }]), captureSeq: 17,
        outputPaths: kind === 'files' ? ['input.md'] : [], entries: [{ path: 'input.md', content: kind === 'files' ? 'rewritten\r\n' : 'original\r\n' }] }
      return { ledger, source, files }
    }
    const valid = setup()
    expect(valid.ledger.recordConversationLearning({ ...finish(valid.source.taskId), files: valid.files })).toEqual({ duplicate: false })

    const wrongDigest = setup()
    expect(() => wrongDigest.ledger.recordConversationLearning({ ...finish(wrongDigest.source.taskId), files: { ...wrongDigest.files, inputsDigest: sha256('wrong') } })).toThrow(/input|digest|file/i)
    const missingFinal = setup()
    expect(() => missingFinal.ledger.recordConversationLearning({ ...finish(missingFinal.source.taskId), files: { ...missingFinal.files, entries: [{ path: 'other.md', content: 'saved' }], outputPaths: ['other.md'] } })).toThrow(/path|input|file/i)
    const absentOutput = setup()
    expect(() => absentOutput.ledger.recordConversationLearning({ ...finish(absentOutput.source.taskId), files: { ...absentOutput.files, entries: [{ path: 'input.md', content: null }] } })).toThrow(/output|missing|file/i)
    const frozenKind = setup('files')
    expect(() => frozenKind.ledger.recordConversationLearning({ ...finish(frozenKind.source.taskId), files: { ...frozenKind.files, outputKind: 'chat', outputPaths: [] } })).toThrow(/kind|file/i)
    const chat = setup('chat')
    expect(chat.ledger.recordConversationLearning({ ...finish(chat.source.taskId), files: chat.files })).toEqual({ duplicate: false })
  })

  it('parses only exact model observation fields with a positive native header sequence and a digest', () => {
    const observed = { kind: 'task-model-observed' as const, taskId: start().taskId, headerSeq: 3, modelConfigDigest: sha256('model') }
    expect(parseConversationLearningRecord(observed)).toEqual(observed)
    for (const headerSeq of [0, -1, 1.5]) expect(() => parseConversationLearningRecord({ ...observed, headerSeq })).toThrow()
    expect(() => parseConversationLearningRecord({ ...observed, modelConfigDigest: 'model A' })).toThrow()
    expect(() => parseConversationLearningRecord({ ...observed, config: { model: 'model A' } })).toThrow()
  })
})
