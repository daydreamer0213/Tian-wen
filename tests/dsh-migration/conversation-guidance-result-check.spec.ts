import { expect, it } from 'vitest'
import { ConversationGuidanceState, baselineGuidanceSnapshot, guidanceInputDigest, guidanceStudyId, guidanceVersion, parseConversationGuidanceRecord,
  type GuidanceStudyBody, type GuidanceStudyOpened } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import type { ConversationExternalCheckOutcome } from '../../packages/tianwen-evolution/src/conversation-external-check.js'
import { conversationExternalInputsDigest } from '../../packages/tianwen-evolution/src/conversation-external-check.js'
import { hasSatisfiedGuidanceResultChecks } from '../../packages/tianwen-evolution/src/guidance-result-check.js'

const ids = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'] as const
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })
const files = (id: string) => ({ schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: 'files' as const,
  cwd: process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests/frozen' : '/tmp/tianwen-conversation-tests/frozen',
  entries: [{ path: 'input.txt', content: `Frozen input ${id}.` }, { path: 'answer.txt', content: null }], outputPaths: ['answer.txt'] })
const checks = () => ids.map(caseId => ({ caseId, checkerId: 'controlled-exact-field', checkerDigest: sha256('trusted checker'),
  contractDigest: sha256(`exact-field:${caseId}`), inputsDigest: conversationExternalInputsDigest(files(caseId).entries), requiredCondition: `Preserve the exact frozen field for ${caseId}.` }))
function opening(configured = true): GuidanceStudyOpened {
  const parentSnapshot = baselineGuidanceSnapshot('code-study-checks')
  const body = { scopeKey: parentSnapshot.scopeKey, family: 'code' as const, failureCategory: 'instruction-following' as const, consentRevision: 1,
    parentSnapshot, parentVersion: guidanceVersion(parentSnapshot), sourceTaskIds: ['one', 'two'] as const, counterexampleTaskId: 'three',
    modelConfigDigest: sha256('actual model'), evaluationMode: 'local-files' as const, fileOutputKind: 'files' as const,
    cases: ids.map((kind, index) => index < 3 ? { id: kind, kind, sourceTaskId: ['one', 'two', 'three'][index]!, materialDigest: sha256(`material:${kind}`), inputDigest: sha256(`input:${kind}`) }
      : { id: kind, kind, prompt: kind, criteria: ['Preserve the exact original value.'], files: files(kind),
        materialDigest: sha256({ prompt: kind, criteria: ['Preserve the exact original value.'], files: files(kind) }), inputDigest: guidanceInputDigest(kind, files(kind)) }),
    ...(configured ? { resultChecks: checks() } : {}) } as GuidanceStudyBody
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}
const verified: ConversationExternalCheckOutcome = { status: 'verified', detail: 'Frozen check passed.' }
function completed(options: { badCandidate?: ConversationExternalCheckOutcome, badCandidateCase?: typeof ids[number], missingCandidate?: boolean, missingBaseline?: boolean, badBaseline?: ConversationExternalCheckOutcome, badBaselineCase?: typeof ids[number], baselineUnknownCase?: typeof ids[number], counterRejected?: boolean, configured?: boolean, dev?: boolean, policy?: GuidanceStudyBody['decisionPolicy'], gain?: typeof ids[number] | 'none' } = {}) {
  const { kind: _kind, studyId: _id, ...body } = opening(options.configured !== false)
  const frozen = { ...body, ...(options.policy ? { decisionPolicy: options.policy } : options.dev ? { decisionPolicy: 'dev-paired-any-case.v1' as const } : {}) }
  const opened = { kind: 'study-opened' as const, studyId: guidanceStudyId(frozen), ...frozen }, state = new ConversationGuidanceState()
  const apply = (record: unknown) => { const parsed = parseConversationGuidanceRecord(record); state.validate(parsed); state.apply(parsed, '2026-10-01') }
  apply(opened)
  const snapshot = { ...opened.parentSnapshot, fileRules: { code: { files: 'Preserve the supplied field without alteration.' } } }
  apply({ kind: 'candidate-recorded', studyId: opened.studyId, candidateSnapshot: snapshot, proposalProof: proof('proposal') })
  for (const item of opened.cases) for (const role of ['baseline', 'candidate'] as const) {
    const output = { answer: 'Done.', files: [{ path: 'input.txt', content: `Frozen input ${item.id}.` }, { path: 'answer.txt', content: `Output ${item.id}:${role}.` }] }
    const outputDigest = sha256(output), executionProof = proof(`${item.id}:${role}:worker`)
    apply({ kind: 'study-file-trial-captured', studyId: opened.studyId, materialDigest: item.materialDigest, target: { kind: 'formal', caseId: item.id, role },
      receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: 'files', ...output, outputDigest, executionProof,
        workerMaterialDigest: 'prompt' in item ? sha256({ prompt: item.prompt, files: item.files }) : sha256(`worker material:${item.id}`) } })
    const check = checks().find(check => check.caseId === item.id)!
    const baselineFailure = { status: 'rejected' as const, detail: 'The original field was altered.', failedRequiredConditionDigest: sha256(check.requiredCondition) }
    const outcome = role === 'candidate' && item.kind === (options.badCandidateCase ?? 'holdout') ? options.badCandidate ?? verified
      : role === 'baseline' && item.kind === (options.badBaselineCase ?? options.gain ?? 'source1') && options.badBaseline ? options.badBaseline
        : role === 'baseline' && item.kind === (options.gain ?? 'source1') ? baselineFailure
        : role === 'baseline' && item.kind === 'counterexample' && options.counterRejected ? baselineFailure : verified
    const resultCheck = options.configured === false || options.missingCandidate && role === 'candidate' && item.kind === 'holdout' || options.missingBaseline && role === 'baseline' && item.kind === 'holdout' ? undefined
      : { preparationDigest: sha256({ check, materialDigest: item.materialDigest, modelConfigDigest: opened.modelConfigDigest }), outputDigest, ...outcome }
    apply({ kind: 'arm-recorded', studyId: opened.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
      behaviorVersion: role === 'baseline' ? opened.parentVersion : guidanceVersion(snapshot), executionProof, judgeProof: proof(`${item.id}:${role}:judge`), outputDigest,
      verdict: role === 'baseline' && item.kind === options.baselineUnknownCase ? 'inconclusive' : role === 'baseline' && item.kind === (options.gain ?? 'source1') ? 'not-met' : 'met', ...(resultCheck === undefined ? {} : { resultCheck }) })
  }
  const decision = state.decision(opened.studyId); apply(decision)
  return { state, opened, decision, activation: { kind: 'guidance-activated' as const, studyId: opened.studyId, expectedParentVersion: opened.parentVersion, decisionDigest: sha256(decision) } }
}

it.each((['dev-paired-any-case.v1', 'dev-conclusive-pair.v1'] as const).flatMap(policy => ids.map(gain => ({ policy, gain }))))('requires independently qualified $policy paired gain in $gain', ({ policy, gain }) => {
  const study = completed({ policy, gain }).state.listStudies()[0]!
  expect(hasSatisfiedGuidanceResultChecks(study)).toBe(true)
  expect(hasSatisfiedGuidanceResultChecks(completed({ gain }).state.listStudies()[0]!)).toBe(['source1', 'source2'].includes(gain))
})
it.each((['dev-paired-any-case.v1', 'dev-conclusive-pair.v1'] as const).flatMap(policy => (['none', 'unqualified', 'regression', 'unverifiable', 'missing', 'baseline-unverifiable', 'baseline-missing'] as const).map(scenario => ({ policy, scenario }))))('refuses incomplete independent $policy gain: $scenario', ({ policy, scenario }) => {
  const study = completed({ policy, gain: scenario === 'none' ? 'none' : scenario.startsWith('baseline-') ? 'source1' : 'holdout',
    ...(scenario === 'unqualified' ? { badBaseline: { status: 'rejected' as const, detail: 'Unrelated diagnostic.' } } : {}),
    ...(scenario === 'regression' ? { badCandidate: { status: 'rejected' as const, detail: 'Required field missing.' } } : {}),
    ...(scenario === 'unverifiable' ? { badCandidate: { status: 'unverifiable' as const, detail: 'Cannot inspect.' } } : {}),
    ...(scenario === 'missing' ? { missingCandidate: true } : {}),
    ...(scenario === 'baseline-unverifiable' ? { badBaselineCase: 'holdout' as const, badBaseline: { status: 'unverifiable' as const, detail: 'Cannot inspect original baseline.' } } : {}),
    ...(scenario === 'baseline-missing' ? { missingBaseline: true } : {}),
  }).state.listStudies()[0]!
  expect(hasSatisfiedGuidanceResultChecks(study)).toBe(false)
})

it.each(['dev-paired-any-case.v1', 'dev-conclusive-pair.v1'] as const)('preserves %s model uncertainty independently of verified program evidence', policy => {
  const { state, decision, activation } = completed({ policy, baselineUnknownCase: 'holdout' })
  expect(decision.verdict).toBe(policy === 'dev-conclusive-pair.v1' ? 'accepted' : 'inconclusive')
  expect(state.listStudies()[0]!.arms.find(arm => arm.caseId === 'holdout' && arm.role === 'baseline')).toMatchObject({ verdict: 'inconclusive', resultCheck: { status: 'verified' } })
  expect(hasSatisfiedGuidanceResultChecks(state.listStudies()[0]!)).toBe(true)
  if (policy === 'dev-conclusive-pair.v1') expect(() => state.validate(activation)).not.toThrow()
  else expect(() => state.validate(activation)).toThrow()
})

it('keeps model accepted but refuses activation when the independent candidate check rejects', () => {
  const { state, decision, activation } = completed({ badCandidate: { status: 'rejected', detail: 'Required value missing.' } })
  expect(decision.verdict).toBe('accepted')
  expect(() => state.validate(activation)).toThrow(/result check/)
})
it.each(['missing', 'unverifiable', 'unqualified-baseline'] as const)('does not activate with incomplete independent evidence: %s', scenario => {
  const { state, activation, decision } = completed(scenario === 'missing' ? { missingCandidate: true }
    : scenario === 'unverifiable' ? { badCandidate: { status: 'unverifiable', detail: 'Native output unavailable.' } }
      : { badBaseline: { status: 'rejected', detail: 'Compiler diagnostic only.' } })
  expect(decision.verdict).toBe('accepted')
  expect(() => state.validate(activation)).toThrow(/result check/)
})
it('permits one independently failed source baseline and verified other source without a new two-baseline requirement', () => {
  const { state, activation } = completed()
  expect(() => state.validate(activation)).not.toThrow()
})
it('preserves historical no-check shapes and original accepted activation', () => {
  const { state, activation } = completed({ configured: false })
  expect(() => state.validate(activation)).not.toThrow()
  expect(state.listStudies()[0]!.opened).not.toHaveProperty('resultChecks')
  expect(state.listStudies()[0]!.arms.every(arm => !Object.hasOwn(arm, 'resultCheck'))).toBe(true)
})
it('does not use independently failed counter baseline as protected successful counterevidence', () => {
  const { state, decision, activation } = completed({ counterRejected: true })
  expect(decision.verdict).toBe('accepted')
  expect(() => state.validate(activation)).toThrow(/result check/)
})
it.each(([undefined, 'dev-paired-any-case.v1', 'dev-conclusive-pair.v1'] as const).flatMap(policy => (['preparation', 'output', 'condition'] as const).map(field => ({ policy, field }))))('rejects a switched independent arm $field binding for $policy', ({ policy, field }) => {
  const study = completed({ policy }).state.listStudies()[0]!, state = new ConversationGuidanceState()
  const apply = (record: Parameters<typeof state.validate>[0]) => { state.validate(record); state.apply(record, '2026-10-01') }
  apply(study.opened); apply(study.candidate!)
  for (const receipt of study.fileTrials!) apply(receipt)
  for (const arm of study.arms.slice(0, -1)) apply(arm)
  const arm = study.arms.at(-1)!, result = arm.resultCheck!
  const changed = field === 'preparation' ? { ...result, preparationDigest: study.arms[0]!.resultCheck!.preparationDigest }
    : field === 'output' ? { ...result, outputDigest: study.arms[0]!.outputDigest }
      : { ...result, status: 'rejected' as const, failedRequiredConditionDigest: sha256('unrelated diagnostic') }
  expect(() => state.validate({ ...arm, resultCheck: changed })).toThrow(/result check/)
})
it('cold restores exact configured results and still refuses a contradictory accepted activation', () => {
  const original = completed({ badCandidate: { status: 'rejected', detail: 'Required value missing.' } })
  const study = original.state.listStudies()[0]!, cold = new ConversationGuidanceState()
  const records = [study.opened, study.candidate!, ...study.fileTrials!, ...study.arms, study.decision!]
  for (const record of records) { cold.validate(record); cold.apply(record, '2026-10-01') }
  expect(cold.listStudies()[0]).toEqual(study)
  expect(() => cold.validate(original.activation)).toThrow(/result check/)
})

it('allows a partial stop for an original functional candidate failure despite met model reviews', () => {
  const source = completed({ badCandidateCase: 'source1', badCandidate: { status: 'rejected', detail: 'Required value missing.' } }).state.listStudies()[0]!
  const state = new ConversationGuidanceState(), records = [source.opened, source.candidate!, ...source.fileTrials!.slice(0, 2), ...source.arms.slice(0, 2)]
  for (const record of records) { state.validate(record); state.apply(record, '2026-10-01') }
  expect(state.listStudies()[0]!.arms[1]).toMatchObject({ verdict: 'met', resultCheck: { status: 'rejected' } })
  const stop = parseConversationGuidanceRecord({ kind: 'study-stopped', studyId: source.opened.studyId, reason: 'candidate-failed' })
  state.validate(stop); state.apply(stop, '2026-10-01')
  expect(state.listStudies()[0]!.stopped).toEqual(stop)
  expect(() => state.decision(source.opened.studyId)).toThrow(/stopped/)
  expect(hasSatisfiedGuidanceResultChecks(state.listStudies()[0]!)).toBe(false)
})
it('refuses incomplete, duplicated and output-inapplicable preparation', () => {
  const opened = opening()
  for (const altered of [checks().slice(1), [checks()[0]!, ...checks().slice(0, 4)]]) {
    const { studyId: _id, kind: _kind, ...body } = { ...opened, resultChecks: altered }
    expect(() => parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(body), ...body })).toThrow(/result check/)
  }
  const { studyId: _id, kind: _kind, ...body } = { ...opened, family: 'writing' as const }
  expect(() => parseConversationGuidanceRecord({ kind: 'study-opened', studyId: guidanceStudyId(body), ...body })).toThrow(/result check/)
})
