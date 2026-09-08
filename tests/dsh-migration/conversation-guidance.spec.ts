import { describe, expect, it } from 'vitest'
import {
  ConversationGuidanceState,
  baselineGuidanceSnapshot,
  guidanceInputDigest,
  guidanceStudyId,
  guidanceVersion,
  parseConversationGuidanceRecord,
  type ConversationGuidanceRecord,
  type GuidanceArmRecord,
  type GuidanceCandidateRecord,
  type GuidanceSnapshot,
  type GuidanceStudyBody,
  type GuidanceStudyOpened,
} from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, parseConversationAuditedReviewChecks, parseConversationReviewChecks } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { prepareConversationLearningExploration } from '../../packages/tianwen-evolution/src/learning-exploration.js'

const scope = 'workspace:guidance-test'
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })

function opening(label = 'first', parentSnapshot = baselineGuidanceSnapshot(scope)): GuidanceStudyOpened {
  const sourceTaskIds = [`${label}:failure-1`, `${label}:failure-2`] as const
  const counterexampleTaskId = `${label}:successful-task`
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `${label}: ${kind} prompt`, criteria: ['Retain the supplied qualification.'] }
    return { id: `${label}:${kind}`, kind, ...material, materialDigest: sha256(material), inputDigest: guidanceInputDigest(material.prompt) }
  }
  const body: GuidanceStudyBody = {
    scopeKey: scope, family: 'writing', failureCategory: 'instruction-following',
    consentRevision: 1, parentVersion: guidanceVersion(parentSnapshot), parentSnapshot,
    sourceTaskIds, counterexampleTaskId, modelConfigDigest: sha256('native-model-config'),
    cases: [
      { id: `${label}:source1`, kind: 'source1', sourceTaskId: sourceTaskIds[0], materialDigest: sha256(`${label}:frozen-1`), inputDigest: guidanceInputDigest(`${label}:request-1`) },
      { id: `${label}:source2`, kind: 'source2', sourceTaskId: sourceTaskIds[1], materialDigest: sha256(`${label}:frozen-2`), inputDigest: guidanceInputDigest(`${label}:request-2`) },
      { id: `${label}:counterexample`, kind: 'counterexample', sourceTaskId: counterexampleTaskId, materialDigest: sha256(`${label}:frozen-success`), inputDigest: guidanceInputDigest(`${label}:request-success`) },
      generated('adjacent'), generated('holdout'),
    ],
  }
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}

function candidate(opened: GuidanceStudyOpened, rule = 'Retain the qualifications explicitly requested by the user.'): GuidanceCandidateRecord {
  return { kind: 'candidate-recorded', studyId: opened.studyId,
    candidateSnapshot: { ...opened.parentSnapshot, rules: { ...opened.parentSnapshot.rules, writing: rule } },
    proposalProof: proof(`${opened.studyId}:proposer`) }
}

function arms(opened: GuidanceStudyOpened, proposed: GuidanceCandidateRecord): GuidanceArmRecord[] {
  return opened.cases.flatMap(item => (['baseline', 'candidate'] as const).map(role => ({
    kind: 'arm-recorded' as const, studyId: opened.studyId, caseId: item.id, role,
    materialDigest: item.materialDigest,
    behaviorVersion: guidanceVersion(role === 'baseline' ? opened.parentSnapshot : proposed.candidateSnapshot),
    executionProof: proof(`${opened.studyId}:${item.id}:${role}:execution`),
    judgeProof: proof(`${opened.studyId}:${item.id}:${role}:judge`),
    outputDigest: sha256(`${item.id}:${role}:actual-answer`),
    verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' as const : 'met' as const,
  })))
}

function explorationOpening(label = 'natural'): GuidanceStudyOpened {
  const parentSnapshot = baselineGuidanceSnapshot(scope)
  const qualityContract = conversationQualityContract()
  const sourceTaskIds = [`conversation-task:${sha256(`${label}:source-1`).slice(7)}`, `conversation-task:${sha256(`${label}:source-2`).slice(7)}`] as const
  const counterexampleTaskId = `conversation-task:${sha256(`${label}:counterexample`).slice(7)}`
  const source = (kind: 'source1' | 'source2' | 'counterexample', taskId: string, request: string) => ({
    id: `${label}:${kind}`, kind, sourceTaskId: taskId, materialDigest: sha256(`${label}:${kind}:material`), inputDigest: guidanceInputDigest(request),
  })
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `${label}:${kind}:prompt`, criteria: ['Preserve the frozen qualification.'], qualityContract }
    return { id: `${label}:${kind}`, kind, ...material, materialDigest: sha256(material), inputDigest: guidanceInputDigest(material.prompt) }
  }
  const body: GuidanceStudyBody = { scopeKey: scope, family: 'writing', failureCategory: 'instruction-following', consentRevision: 1,
    parentVersion: guidanceVersion(parentSnapshot), parentSnapshot, sourceTaskIds, counterexampleTaskId,
    modelConfigDigest: sha256(`${label}:model-config`), qualityContract,
    cases: [source('source1', sourceTaskIds[0], `${label}:request-1`), source('source2', sourceTaskIds[1], `${label}:request-2`), source('counterexample', counterexampleTaskId, `${label}:request-success`), generated('adjacent'), generated('holdout')] }
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}

function explorationIntent(opened: GuidanceStudyOpened, overrides: {
  readonly requestStudyId?: `guidance-study:${string}`
  readonly sourceTaskId?: `conversation-task:${string}`
  readonly sourceMaterialDigest?: ReturnType<typeof sha256>
  readonly environmentDigest?: ReturnType<typeof sha256>
  readonly qualityContractDigest?: ReturnType<typeof sha256>
  readonly proposalProof?: ReturnType<typeof proof>
} = {}) {
  const source = opened.cases[0]!
  if (!('sourceTaskId' in source)) throw new Error('fixture requires a source task')
  const sourceTaskId = overrides.sourceTaskId ?? source.sourceTaskId as `conversation-task:${string}`
  return { kind: 'exploration-requested' as const, studyId: opened.studyId,
    request: prepareConversationLearningExploration({ sourceTaskId,
      hypothesis: 'The missing qualification follows from the absent temporary instruction.', alternative: 'The result is caused by another source condition.',
      temporaryInstruction: 'Preserve the frozen qualification.', expectedIfHypothesis: { control: 'not-met', treatment: 'met' }, expectedIfAlternative: { control: 'met', treatment: 'met' },
    }, { studyId: overrides.requestStudyId ?? opened.studyId, sourceTaskId, parentVersion: opened.parentVersion,
      sourceMaterialDigest: overrides.sourceMaterialDigest ?? source.materialDigest, environmentDigest: overrides.environmentDigest ?? opened.modelConfigDigest,
      qualityContractDigest: overrides.qualityContractDigest ?? sha256(opened.qualityContract ?? null), proposalProof: overrides.proposalProof ?? proof(`${opened.studyId}:natural-proposal`) }) }
}

function explorationArm(opened: GuidanceStudyOpened, arm: 'control' | 'treatment', verdict: 'met' | 'not-met') {
  const source = opened.cases[0]!
  const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({ focus, verdict,
    category: verdict === 'not-met' ? 'instruction-following' : null, explanation: 'Frozen quality review.', evidenceQuotes: ['pilot'],
    proof: proof(`${opened.studyId}:${arm}:${focus}`), audit: { schemaVersion: 'tianwen.claim-audit.v2' as const, evidenceDigest: sha256(`${opened.studyId}:${arm}:evidence`),
      units: { 'answer-1': { firstClaim: { quote: 'pilot', kind: 'source-fact' as const, status: verdict === 'met' ? 'supported' as const : 'unsupported' as const, sourceIds: ['request-1'], explanation: 'Frozen quality evidence.' }, additionalClaims: [] } } } })))
  return { kind: 'exploration-arm-recorded' as const, studyId: opened.studyId, arm, materialDigest: source.materialDigest, parentVersion: opened.parentVersion,
    executionProof: proof(`${opened.studyId}:${arm}:execution`), outputDigest: sha256(`${opened.studyId}:${arm}:output`), reviewChecks }
}

function append(state: ConversationGuidanceState, input: ConversationGuidanceRecord) {
  const record = parseConversationGuidanceRecord(input)
  state.validate(record)
  state.apply(record, '2026-09-07T00:00:00.000Z')
  return record
}

function evaluated(state: ConversationGuidanceState, opened = opening(), change?: (records: GuidanceArmRecord[]) => void) {
  append(state, opened)
  const proposed = candidate(opened)
  append(state, proposed)
  const records = arms(opened, proposed)
  change?.(records)
  for (const record of records) append(state, record)
  const decision = state.decision(opened.studyId)
  append(state, decision)
  return { opened, proposed, records, decision }
}

function activate(state: ConversationGuidanceState, value: ReturnType<typeof evaluated>) {
  return append(state, { kind: 'guidance-activated', studyId: value.opened.studyId,
    expectedParentVersion: value.opened.parentVersion, decisionDigest: sha256(value.decision) })
}

describe('natural guidance domain governance', () => {
  it('derives a bounded exploration observation only from two independent frozen review receipts', () => {
    const state = new ConversationGuidanceState()
    const opened = explorationOpening()
    const intent = explorationIntent(opened)
    append(state, opened)
    append(state, intent)
    expect(() => append(state, candidate(opened))).toThrow(/exploration|both|arms/i)
    const control = explorationArm(opened, 'control', 'not-met')
    append(state, control)
    expect(() => append(state, { ...control, arm: 'treatment', executionProof: control.executionProof })).toThrow(/independent|session/i)
    append(state, explorationArm(opened, 'treatment', 'met'))
    const exploration = state.listStudies()[0]!.exploration
    expect(exploration?.result).toEqual({ observation: { control: 'not-met', treatment: 'met' }, classification: 'matches-hypothesis-prediction' })
    append(state, candidate(opened))
    expect(state.listStudies()[0]?.arms).toEqual([])
  })

  it('rejects recomputed valid requests that bind the wrong study, source, model or quality', () => {
    const wrong = [
      (opened: GuidanceStudyOpened) => explorationIntent(opened, { requestStudyId: `guidance-study:${'a'.repeat(64)}` }),
      (opened: GuidanceStudyOpened) => {
        const counterexample = opened.cases.find(item => item.kind === 'counterexample')!
        if (!('sourceTaskId' in counterexample)) throw new Error('fixture requires a counterexample source')
        return explorationIntent(opened, { sourceTaskId: counterexample.sourceTaskId as `conversation-task:${string}`, sourceMaterialDigest: counterexample.materialDigest })
      },
      (opened: GuidanceStudyOpened) => explorationIntent(opened, { sourceMaterialDigest: sha256('other source material') }),
      (opened: GuidanceStudyOpened) => explorationIntent(opened, { environmentDigest: sha256('other model configuration') }),
      (opened: GuidanceStudyOpened) => explorationIntent(opened, { qualityContractDigest: sha256('other frozen quality') }),
    ]
    for (const make of wrong) {
      const state = new ConversationGuidanceState()
      const opened = explorationOpening(`frozen-natural-${wrong.indexOf(make)}`)
      append(state, opened)
      expect(() => append(state, make(opened))).toThrow(/request|source|frozen|study/i)
    }
    const state = new ConversationGuidanceState()
    const opened = explorationOpening('replaced-natural')
    const intent = explorationIntent(opened)
    append(state, opened); append(state, intent)
    const control = explorationArm(opened, 'control', 'not-met')
    append(state, control)
    expect(() => append(state, { ...control, outputDigest: sha256('replacement receipt') })).toThrow(/immutable|history|conflicts/i)
    expect(() => append(state, { ...explorationArm(opened, 'treatment', 'met'), parentVersion: sha256('other parent') })).toThrow(/intent|frozen|parent/i)
  })

  it('reserves natural exploration Sessions across different studies', () => {
    const state = new ConversationGuidanceState()
    const first = explorationOpening('cross-study-first')
    const second = explorationOpening('cross-study-second')
    append(state, first); append(state, second)
    const intent = explorationIntent(first)
    append(state, intent)
    expect(() => append(state, explorationIntent(second, { proposalProof: intent.request.proposalProof }))).toThrow(/independent|Session/i)
  })

  it('requires an independent proof for a stopped insufficient-evidence finding and reserves it', () => {
    const state = new ConversationGuidanceState()
    const opened = explorationOpening('insufficient-natural')
    const intent = explorationIntent(opened)
    append(state, opened)
    expect(() => parseConversationGuidanceRecord({ kind: 'study-stopped', studyId: opened.studyId, reason: 'insufficient-evidence' })).toThrow(/fields/i)
    append(state, intent)
    const control = explorationArm(opened, 'control', 'not-met')
    append(state, control)
    expect(() => append(state, { kind: 'study-stopped', studyId: opened.studyId, reason: 'insufficient-evidence', proposalProof: control.executionProof })).toThrow(/independent|Session/i)
    append(state, { kind: 'study-stopped', studyId: opened.studyId, reason: 'insufficient-evidence', proposalProof: proof(`${opened.studyId}:insufficient`) })
    expect(() => append(state, explorationArm(opened, 'treatment', 'met'))).toThrow(/stopped/i)
  })

  it('binds both independent case contracts before proposal without changing legacy case hashes', () => {
    const legacy = opening()
    expect(parseConversationGuidanceRecord(legacy)).toEqual(legacy)
    const { kind: _kind, studyId: _id, ...oldBody } = legacy
    const qualityContract = conversationQualityContract()
    const cases = legacy.cases.map(item => {
      if ('sourceTaskId' in item) return item
      const material = { prompt: item.prompt, criteria: item.criteria, qualityContract }
      return { ...item, ...material, materialDigest: sha256(material) }
    })
    const body = { ...oldBody, qualityContract, cases }
    const opened = { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }
    expect(parseConversationGuidanceRecord(opened)).toEqual(opened)
    expect(opened.studyId).not.toBe(legacy.studyId)
    const mixed = { ...body, cases: [...cases.slice(0, 4), legacy.cases[4]!] }
    expect(() => parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(mixed), ...mixed })).toThrow(/quality|contract/i)
    expect(parseConversationGuidanceRecord(legacy)).toEqual(legacy)
  })

  it('requires both native checks for v5 arms and rejects a forged consensus', () => {
    const { kind: _kind, studyId: _id, ...body } = opening()
    const qualityContract = conversationQualityContract()
    const currentBody = { ...body, qualityContract, cases: body.cases.map(item => {
      if ('sourceTaskId' in item) return item
      const material = { prompt: item.prompt, criteria: item.criteria, qualityContract }
      return { ...item, ...material, materialDigest: sha256(material) }
    }) }
    const opened = { kind: 'study-opened' as const, studyId: guidanceStudyId(currentBody), ...currentBody }
    const state = new ConversationGuidanceState(), proposed = candidate(opened)
    append(state, opened); append(state, proposed)
    const arm = arms(opened, proposed)[0]!
    expect(() => append(state, arm)).toThrow(/two independent/i)
    const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({ focus, verdict: 'not-met', category: 'instruction-following',
      explanation: 'Output constraint violated.', evidenceQuotes: ['extra output'], proof: focus === 'requirements' ? arm.judgeProof : proof('separate-grounding'),
      audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256('arm evidence'), units: { 'answer-1': { firstClaim: { quote: 'extra output', kind: 'source-fact', status: 'unsupported', sourceIds: [], explanation: 'The requested restriction was violated.' }, additionalClaims: [] } } } })))
    const legacyChecks = reviewChecks.map(({ audit: _audit, ...check }) => check)
    expect(() => append(state, { ...arm, reviewChecks: legacyChecks })).toThrow(/audit/i)
    expect(() => append(state, { ...arm, reviewChecks: [reviewChecks[0], legacyChecks[1]] })).toThrow(/audit/i)
    expect(() => append(state, { ...arm, reviewChecks: [reviewChecks[0], { ...reviewChecks[1], audit: { ...reviewChecks[1].audit, evidenceDigest: sha256('other evidence') } }] })).toThrow(/digest/i)
    expect(() => append(state, { ...arm, reviewChecks, verdict: 'met' })).toThrow(/consensus/i)
    append(state, { ...arm, reviewChecks })
    expect(state.listStudies()[0]?.arms[0]?.reviewChecks).toEqual(reviewChecks)
  })

  it('records a policy migration rollback without claiming user withdrawal or new regression evidence', () => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state)
    activate(state, value)
    const rollback = { kind: 'guidance-rolled-back' as const, studyId: value.opened.studyId,
      expectedCurrentVersion: guidanceVersion(value.proposed.candidateSnapshot), reason: 'quality-contract-changed' as const, evidenceTaskIds: [] }
    append(state, rollback)
    expect(state.snapshot(scope)).toEqual(value.opened.parentSnapshot)
    expect(state.listStudies()[0]?.rollback).toEqual(rollback)
    expect(() => parseConversationGuidanceRecord({ ...rollback, evidenceTaskIds: ['invented failure'] })).toThrow(/quality|contract|evidence/i)
  })

  it('activates only an independently evaluated single-family improvement and leaves another scope untouched', () => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state)
    expect(value.decision.verdict).toBe('accepted')
    expect(state.snapshot(scope).rules).toEqual({})
    activate(state, value)
    expect(state.snapshot(scope).rules.writing).toBe('Retain the qualifications explicitly requested by the user.')
    expect(state.snapshot('workspace:other').rules).toEqual({})
  })

  it.each([
    ['candidate fails holdout', 9, 'not-met', 'rejected'],
    ['judge cannot determine candidate holdout', 9, 'inconclusive', 'inconclusive'],
    ['baseline counterexample was unsuccessful', 4, 'not-met', 'rejected'],
    ['no original failure was reproduced', 0, 'met', 'rejected'],
  ] as const)('derives %s without accepting a caller pass assertion', (_name, index, verdict, expected) => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state, opening(), records => { records[index] = { ...records[index]!, verdict } })
    expect(value.decision.verdict).toBe(expected)
    expect(() => activate(state, value)).toThrow(/accepted|decision/i)
  })

  it('requires all ten arms and an exact canonical receipt set before deciding', () => {
    const state = new ConversationGuidanceState()
    const opened = opening()
    const proposed = candidate(opened)
    append(state, opened)
    append(state, proposed)
    const records = arms(opened, proposed)
    for (const record of records.slice(0, 9)) append(state, record)
    expect(() => state.decision(opened.studyId)).toThrow(/complete|ten|arms/i)
    expect(() => append(state, { kind: 'study-decided', studyId: opened.studyId, armsDigest: sha256(records), verdict: 'accepted' })).toThrow(/complete|ten|arms/i)
    append(state, records[9]!)
    const decision = state.decision(opened.studyId)
    expect(() => append(state, { ...decision, armsDigest: sha256('invented receipts') })).toThrow(/digest|receipt|decision/i)
    expect(() => append(state, { ...decision, verdict: 'rejected' })).toThrow(/derived|decision/i)
    append(state, decision)
  })

  it('rejects stale parent activation after another study changes the same workspace snapshot', () => {
    const state = new ConversationGuidanceState()
    const first = evaluated(state, opening('first'))
    const stale = evaluated(state, opening('stale'))
    activate(state, first)
    expect(() => activate(state, stale)).toThrow(/parent|current|stale/i)
    expect(state.snapshot(scope)).toEqual(first.proposed.candidateSnapshot)
  })

  it('rolls back only the active study to its exact frozen parent', () => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state)
    activate(state, value)
    const rollback = { kind: 'guidance-rolled-back' as const, studyId: value.opened.studyId,
      expectedCurrentVersion: guidanceVersion(value.proposed.candidateSnapshot), reason: 'consent-disabled' as const, evidenceTaskIds: [] }
    expect(() => append(state, { ...rollback, expectedCurrentVersion: value.opened.parentVersion })).toThrow(/current|version/i)
    append(state, rollback)
    expect(state.snapshot(scope)).toEqual(value.opened.parentSnapshot)
    expect(state.existing(rollback)).toEqual(rollback)
    expect(() => append(state, rollback)).toThrow(/immutable|history|existing/i)
  })

  it('requires attributable new task evidence for a regression rollback', () => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state)
    activate(state, value)
    const rollback = { kind: 'guidance-rolled-back' as const, studyId: value.opened.studyId,
      expectedCurrentVersion: guidanceVersion(value.proposed.candidateSnapshot), reason: 'regression' as const, evidenceTaskIds: [] as string[] }
    expect(() => append(state, rollback)).toThrow(/evidence|regression/i)
    expect(() => append(state, { ...rollback, evidenceTaskIds: [value.opened.sourceTaskIds[0]] })).toThrow(/source|new|regression/i)
    append(state, { ...rollback, evidenceTaskIds: ['new-post-activation-task'] })
    expect(state.snapshot(scope).rules).toEqual({})
  })

  it('rejects reused execution, evaluator or proposer Sessions and mismatched frozen arm material', () => {
    const state = new ConversationGuidanceState()
    const opened = opening()
    const proposed = candidate(opened)
    append(state, opened)
    append(state, proposed)
    const [first, second] = arms(opened, proposed)
    expect(() => append(state, { ...first!, judgeProof: first!.executionProof })).toThrow(/session|independent/i)
    expect(() => append(state, { ...first!, executionProof: proposed.proposalProof })).toThrow(/session|independent/i)
    expect(() => append(state, { ...first!, materialDigest: sha256('different criteria') })).toThrow(/material|frozen/i)
    expect(() => append(state, { ...first!, behaviorVersion: sha256('different guidance') })).toThrow(/behavior|version/i)
    append(state, first!)
    expect(() => append(state, { ...second!, executionProof: first!.judgeProof })).toThrow(/session|independent/i)
  })

  it('freezes cases before candidate creation and permits exactly the specified family change', () => {
    const state = new ConversationGuidanceState()
    const opened = opening()
    const proposed = candidate(opened)
    expect(() => append(state, proposed)).toThrow(/unknown|opened/i)
    append(state, opened)
    expect(() => append(state, { ...proposed, candidateSnapshot: opened.parentSnapshot })).toThrow(/change|different/i)
    expect(() => append(state, { ...proposed, candidateSnapshot: { ...proposed.candidateSnapshot,
      rules: { writing: 'A valid writing lesson.', code: 'An unrelated code lesson.' } } })).toThrow(/family|scope/i)
    append(state, proposed)
    const changed = { ...opened, modelConfigDigest: sha256('another config') }
    expect(() => append(state, changed)).toThrow(/identity|history|immutable/i)
  })

  it('strictly rejects invented fields, false generated material digests and duplicate sources', () => {
    const opened = opening()
    expect(() => parseConversationGuidanceRecord({ ...opened, execute: 'arbitrary code' })).toThrow(/fields/i)
    const generated = opened.cases[3]!
    const changed = { ...opened, cases: [...opened.cases.slice(0, 3), { ...generated, materialDigest: sha256('wrong') }, opened.cases[4]!] }
    expect(() => parseConversationGuidanceRecord(changed)).toThrow(/material|digest/i)
    expect(() => parseConversationGuidanceRecord({ ...opened, sourceTaskIds: [opened.sourceTaskIds[0], opened.sourceTaskIds[0]] })).toThrow(/distinct|source/i)
    expect(() => parseConversationGuidanceRecord({ ...candidate(opened), candidateSnapshot: {
      schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey: scope, rules: { writing: 'x'.repeat(4097) },
    } })).toThrow(/text|length/i)
  })

  it('replays immutable records and protects the projection from caller mutations', () => {
    const state = new ConversationGuidanceState()
    const value = evaluated(state)
    const activation = activate(state, value)
    const history = [value.opened, value.proposed, ...value.records, value.decision, activation]
    const replay = new ConversationGuidanceState()
    for (const record of history) append(replay, record)
    const obtained = replay.snapshot(scope)
    ;(obtained.rules as Partial<Record<string, string>>).writing = 'caller changed this'
    const listed = replay.listStudies()
    ;(listed[0]!.opened.parentSnapshot as { rules: object }).rules = { writing: 'caller changed history' }
    expect(replay.snapshot(scope).rules.writing).toBe('Retain the qualifications explicitly requested by the user.')
    expect(replay.existing(value.opened)).toEqual(value.opened)
    expect(replay.listStudies(scope, 1)).toHaveLength(1)
    expect(() => append(replay, { ...value.records[0]!, verdict: 'met' })).toThrow(/immutable|history|existing/i)
    expect(() => replay.listStudies(scope, 0)).toThrow(/limit/i)
  })

  it('can roll back the restored parent after reverting a later improvement', () => {
    const state = new ConversationGuidanceState()
    const first = evaluated(state)
    activate(state, first)
    const nextOpened = opening('next', state.snapshot(scope))
    append(state, nextOpened)
    const next = candidate(nextOpened, 'Retain all requested qualifications and clearly separate estimates from facts.')
    append(state, next)
    for (const record of arms(nextOpened, next)) append(state, record)
    const nextDecision = state.decision(nextOpened.studyId)
    append(state, nextDecision)
    append(state, { kind: 'guidance-activated', studyId: nextOpened.studyId,
      expectedParentVersion: nextOpened.parentVersion, decisionDigest: sha256(nextDecision) })
    append(state, { kind: 'guidance-rolled-back', studyId: nextOpened.studyId,
      expectedCurrentVersion: guidanceVersion(next.candidateSnapshot), reason: 'support-retracted', evidenceTaskIds: [] })
    append(state, { kind: 'guidance-rolled-back', studyId: first.opened.studyId,
      expectedCurrentVersion: guidanceVersion(first.proposed.candidateSnapshot), reason: 'consent-disabled', evidenceTaskIds: [] })
    expect(state.snapshot(scope).rules).toEqual({})
  })

  it('allows repeated real source material but requires the generated holdout to be unseen', () => {
    const opened = opening()
    const { kind: _kind, studyId: _id, ...body } = opened
    const cases = body.cases.map((item, index) => index === 1 ? { ...item, materialDigest: body.cases[0]!.materialDigest, inputDigest: body.cases[0]!.inputDigest } : item)
    const repeated = { ...body, cases }
    const parsed = parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(repeated), ...repeated })
    expect(parsed.kind).toBe('study-opened')
    const holdout = body.cases[4]!
    const leaked = { ...body, cases: body.cases.map((item, index) => index === 3 ? { ...holdout, id: item.id, kind: 'adjacent' as const } : item) }
    expect(() => parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(leaked), ...leaked })).toThrow(/holdout|distinct|unseen/i)
  })

  it.each([[0, 3], [1, 3], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4]])('rejects copied case %s at generated case %s despite different material wrappers or criteria', (index, target) => {
    const { kind: _kind, studyId: _id, ...body } = opening()
    const original = body.cases[index]!
    const request = 'Write A report.'
    const sourceMaterial = { request, context: 'Original context', objective: 'A qualified report', criteria: ['Keep the qualification.'] }
    const adjacentMaterial = { prompt: request, criteria: ['Keep the qualification.'] }
    const holdoutMaterial = { prompt: '  Write Ａ \n report.  ', criteria: ['Use complete sentences.'] }
    const prior = original.kind === 'adjacent'
      ? { ...original, ...adjacentMaterial, materialDigest: sha256(adjacentMaterial), inputDigest: sha256(request) }
      : { ...original, materialDigest: sha256(sourceMaterial), inputDigest: sha256(request) }
    const holdout = { ...body.cases[target]!, ...holdoutMaterial, materialDigest: sha256(holdoutMaterial), inputDigest: sha256(request) }
    expect(prior.materialDigest).not.toBe(holdout.materialDigest)
    const leaked = { ...body, cases: body.cases.map((item, position) => position === index ? prior : position === target ? holdout : item) }
    expect(() => parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(leaked), ...leaked }))
      .toThrow(/distinct|holdout|unseen/i)
  })

  it('normalizes compatibility characters and whitespace without changing the full material binding', () => {
    expect(guidanceInputDigest('  Write Ａ \n\t report.  ')).toBe(sha256('Write A report.'))
    const { kind: _kind, studyId: _id, ...body } = opening()
    const material = { prompt: '  Write Ａ \n\t report.  ', criteria: ['Keep the qualification.'] }
    const cases = body.cases.map((item, index) => index === 4
      ? { ...item, ...material, materialDigest: sha256(material), inputDigest: sha256('Write A report.') } : item)
    const valid = { ...body, cases }
    expect(parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(valid), ...valid }).kind).toBe('study-opened')
  })

  it.each([0, 3])('requires a well-formed input digest on case %s', index => {
    const opened = opening()
    const { inputDigest: _digest, ...missing } = opened.cases[index]!
    for (const item of [missing, { ...missing, inputDigest: 'not-a-digest' }]) {
      expect(() => parseConversationGuidanceRecord({ ...opened,
        cases: opened.cases.map((original, position) => position === index ? item : original),
      })).toThrow(/fields|digest/i)
    }
  })

  it.each([3, 4])('rejects a forged generated input digest at case %s even with valid full material', index => {
    const opened = opening()
    expect(() => parseConversationGuidanceRecord({ ...opened,
      cases: opened.cases.map((item, position) => position === index ? { ...item, inputDigest: sha256('unrelated text') } : item),
    })).toThrow(/input digest/i)
  })

  it('durably stops an unfinished study without deciding missing arms or allowing another model result', () => {
    const state = new ConversationGuidanceState()
    const opened = opening()
    const proposed = candidate(opened)
    const firstArm = arms(opened, proposed)[0]!
    append(state, opened)
    append(state, proposed)
    append(state, firstArm)
    const stop = { kind: 'study-stopped' as const, studyId: opened.studyId, reason: 'cancelled' as const }
    append(state, stop)
    expect(state.listStudies()[0]?.stopped).toEqual(stop)
    expect(() => state.decision(opened.studyId)).toThrow(/stopped|complete|ten/i)
    expect(() => append(state, arms(opened, proposed)[1]!)).toThrow(/stopped/i)
    expect(() => append(state, { kind: 'guidance-activated', studyId: opened.studyId,
      expectedParentVersion: opened.parentVersion, decisionDigest: sha256('no decision') })).toThrow(/stopped/i)
    const replay = new ConversationGuidanceState()
    for (const record of [opened, proposed, firstArm, stop]) append(replay, record)
    expect(replay.existing(stop)).toEqual(stop)
    expect(replay.snapshot(scope).rules).toEqual({})
    const completed = new ConversationGuidanceState()
    const value = evaluated(completed)
    expect(() => append(completed, { ...stop, studyId: value.opened.studyId })).toThrow(/decided|terminal/i)
  })
})
