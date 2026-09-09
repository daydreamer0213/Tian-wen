import { describe, expect, it } from 'vitest'
import { ConversationGuidanceState, baselineGuidanceSnapshot, guidanceInputDigest, guidanceRule, guidanceStudyId, guidanceVersion, parseConversationGuidanceRecord, parseGuidanceSnapshot,
  type GuidanceStudyOpened, type GuidanceStudyBody, type GuidanceCandidateRecord, type GuidanceArmRecord, type GuidanceFileTrialRecord } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import type { ConversationFileMaterial } from '../../packages/tianwen-evolution/src/conversation-files.js'

const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })
const files: ConversationFileMaterial = { schemaVersion: 'tianwen.conversation-file-material.v1', outputKind: 'files', cwd: process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests/frozen' : '/tmp/tianwen-conversation-tests/frozen', entries: [{ path: 'source.txt', content: 'Original facts.' }, { path: 'answer.txt', content: null }], outputPaths: ['answer.txt'] }
const parent = { ...baselineGuidanceSnapshot('file-domain'), rules: { writing: 'Preserve text guidance.' }, fileRules: { writing: { chat: 'Preserve file chat guidance.' } } }
function opening(): GuidanceStudyOpened {
  const body: GuidanceStudyBody = { scopeKey: parent.scopeKey, family: 'writing', failureCategory: 'source-fidelity', consentRevision: 1,
    parentSnapshot: parent, parentVersion: guidanceVersion(parent), modelConfigDigest: sha256('model'), sourceTaskIds: ['one', 'two'], counterexampleTaskId: 'three',
    evaluationMode: 'local-files', fileOutputKind: 'files',
    cases: [ ...(['source1', 'source2', 'counterexample'] as const).map((kind, i) => ({ id: kind, kind, sourceTaskId: ['one', 'two', 'three'][i]!, materialDigest: sha256(kind), inputDigest: sha256(`input:${kind}`) })),
      ...(['adjacent', 'holdout'] as const).map(kind => { const material = { prompt: kind, criteria: ['Retain original facts.'], files }; return { id: kind, kind, ...material, materialDigest: sha256(material), inputDigest: guidanceInputDigest(kind, files) } }) ] }
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}
function proposed() {
  const state = new ConversationGuidanceState()
  // This fixture represents an already inherited snapshot, using normal activation.
  const opened = opening()
  const base = baselineGuidanceSnapshot(parent.scopeKey)
  const body = { ...opened, parentSnapshot: base, parentVersion: guidanceVersion(base) }
  const { kind: _kind, studyId: _id, ...identity } = body
  const initial = { ...body, studyId: guidanceStudyId(identity) }
  state.validate(initial); state.apply(initial, '2026-09-09')
  const candidate: GuidanceCandidateRecord = { kind: 'candidate-recorded', studyId: initial.studyId, candidateSnapshot: { ...base, fileRules: { writing: { files: 'Preserve the original facts in the output.' } } }, proposalProof: proof('proposal') }
  state.validate(candidate); state.apply(candidate, '2026-09-09')
  return { state, opened: initial, candidate }
}
function captured(opened: GuidanceStudyOpened, caseId = 'source1', role: 'baseline' | 'candidate' = 'baseline'): GuidanceFileTrialRecord {
  const result = { answer: 'Done.', files: [{ path: 'source.txt', content: 'Original facts.' }, { path: 'answer.txt', content: 'Original facts.' }] }
  return { kind: 'study-file-trial-captured', studyId: opened.studyId, materialDigest: opened.cases.find(item => item.id === caseId)!.materialDigest,
    target: { kind: 'formal', caseId, role }, receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: 'files', ...result, outputDigest: sha256(result), workerMaterialDigest: sha256('frozen-worker'), executionProof: proof(`${caseId}:${role}:execution`) } }
}
function arm(opened: GuidanceStudyOpened, receipt: GuidanceFileTrialRecord): GuidanceArmRecord {
  if (receipt.target.kind !== 'formal') throw new Error('formal fixture')
  return { kind: 'arm-recorded', studyId: opened.studyId, caseId: receipt.target.caseId, role: receipt.target.role, materialDigest: receipt.materialDigest,
    behaviorVersion: opened.parentVersion, executionProof: receipt.receipt.executionProof, judgeProof: proof('judge'), outputDigest: receipt.receipt.outputDigest, verdict: 'met' }
}

describe('local file guidance domain contracts', () => {
  it('keeps historical snapshot bytes and input hashes, and distinguishes actual file inputs', () => {
    const old = baselineGuidanceSnapshot('legacy')
    expect(parseGuidanceSnapshot(old)).toEqual({ schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey: 'legacy', rules: {} })
    expect(guidanceVersion(old)).toBe(sha256(old))
    expect(guidanceInputDigest('  A\n B ')).toBe(sha256('A B'))
    expect(parseGuidanceSnapshot(parent)).toEqual(parent)
    expect(guidanceInputDigest('same request', files)).not.toBe(guidanceInputDigest('same request', { ...files, entries: [{ path: 'source.txt', content: 'Different facts.' }, files.entries[1]!] }))
    expect(guidanceInputDigest('  same\nrequest ', files)).toBe(guidanceInputDigest('same request', files))
  })
  it('selects only the evaluated family, mode and output kind without fallback', () => {
    expect(guidanceRule(parent, 'writing', 'text')).toBe('Preserve text guidance.')
    expect(guidanceRule(parent, 'writing', 'local-files', 'chat')).toBe('Preserve file chat guidance.')
    expect(guidanceRule(parent, 'writing', 'local-files', 'files')).toBeUndefined()
    expect(guidanceRule(parent, 'writing', 'local-files')).toBeUndefined()
    expect(guidanceRule(parent, 'writing', 'external')).toBeUndefined()
    expect(guidanceRule(parent, 'writing', 'subjective')).toBeUndefined()
  })
  it('freezes file contracts and rejects missing or mismatched generated material', () => {
    const opened = opening()
    expect(parseConversationGuidanceRecord(opened)).toEqual(opened)
    expect(() => parseConversationGuidanceRecord({ ...opened, fileOutputKind: 'chat' })).toThrow()
    const { fileOutputKind: _output, ...missing } = opened
    expect(() => parseConversationGuidanceRecord(missing)).toThrow()
    const generated = opened.cases[3]!
    expect('files' in generated && generated.files).toEqual(files)
    expect(() => parseConversationGuidanceRecord({ ...opened, cases: opened.cases.map(item => item === generated ? { ...item, files: undefined } : item) })).toThrow()
  })
  it('allows only its selected file rule to change while preserving map presence', () => {
    const { state, opened, candidate } = proposed()
    expect(candidate.candidateSnapshot.rules).toEqual({})
    const other = new ConversationGuidanceState(); other.apply(opened, '2026-09-09')
    expect(() => other.validate({ ...candidate, candidateSnapshot: { ...candidate.candidateSnapshot, rules: { writing: 'Changed text.' } } })).toThrow()
    expect(() => other.validate({ ...candidate, candidateSnapshot: { ...candidate.candidateSnapshot, fileRules: { writing: { files: 'Accepted.', chat: 'Unevaluated.' } } } })).toThrow()
    expect(state.listStudies()[0]!.candidate).toEqual(candidate)
    const inherited = opening(); const inheritedState = new ConversationGuidanceState(); inheritedState.apply(inherited, '2026-09-09')
    const inheritedCandidate = { ...candidate, studyId: inherited.studyId, candidateSnapshot: { ...parent, fileRules: { writing: { ...parent.fileRules.writing, files: 'A tested file method.' } } } }
    expect(() => inheritedState.validate(inheritedCandidate)).not.toThrow()
    expect(() => inheritedState.validate({ ...inheritedCandidate, candidateSnapshot: { ...inheritedCandidate.candidateSnapshot, rules: {} } })).toThrow()
  })
  it('reserves a receipt before review and lets only its exact target consume it', () => {
    const { state, opened } = proposed()
    const receipt = captured(opened)
    const early = new ConversationGuidanceState(); early.apply(opened, '2026-09-09')
    expect(() => early.validate(receipt)).toThrow(/formal target/)
    expect(() => state.validate({ ...receipt, materialDigest: sha256('different material') })).toThrow(/target/)
    expect(() => state.validate({ ...receipt, receipt: { ...receipt.receipt, outputKind: 'chat' } })).toThrow(/mode/)
    expect(() => state.validate(arm(opened, receipt))).toThrow(/receipt/)
    state.validate(receipt); state.apply(receipt, '2026-09-09')
    expect(state.existing(receipt)).toEqual(receipt)
    expect(state.listStudies()[0]!.arms).toHaveLength(0)
    expect(() => state.validate({ ...arm(opened, receipt), outputDigest: sha256('changed') })).toThrow(/receipt/)
    expect(() => state.validate({ ...arm(opened, receipt), executionProof: proof('different proof') })).toThrow(/receipt/)
    expect(() => state.validate({ ...arm(opened, receipt), caseId: 'source2', materialDigest: opened.cases[1]!.materialDigest })).toThrow(/receipt/)
    expect(() => state.validate(captured(opened, 'source2'))).not.toThrow()
    expect(() => state.validate({ ...captured(opened, 'source2'), receipt: receipt.receipt })).toThrow(/Session/)
    expect(() => state.validate({ ...arm(opened, receipt), judgeProof: receipt.receipt.executionProof })).toThrow(/Session/)
    const other = captured(opened, 'source2'); state.validate(other); state.apply(other, '2026-09-09')
    expect(() => state.validate({ ...arm(opened, receipt), judgeProof: other.receipt.executionProof })).toThrow(/Session/)
    state.validate(arm(opened, receipt)); state.apply(arm(opened, receipt), '2026-09-09')
    expect(state.listStudies()[0]!.arms).toHaveLength(1)
    expect(state.listStudies()[0]!.fileTrials).toEqual([receipt, other])
  })
  it('peels a later text activation only for its actual invalidated file ancestor', () => {
    const { state, opened, candidate } = proposed()
    const apply = (record: Parameters<typeof state.validate>[0]) => { state.validate(record); state.apply(record, '2026-09-09') }
    for (const item of opened.cases) for (const role of ['baseline', 'candidate'] as const) {
      const receipt = captured(opened, item.id, role)
      const worker = 'prompt' in item ? { ...receipt, receipt: { ...receipt.receipt, workerMaterialDigest: sha256({ prompt: item.prompt, files: item.files }) } } : receipt
      apply(worker)
      apply({ ...arm(opened, worker), behaviorVersion: role === 'baseline' ? opened.parentVersion : guidanceVersion(candidate.candidateSnapshot), judgeProof: proof(`judge:${item.id}:${role}`), verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met' })
    }
    const decision = state.decision(opened.studyId); apply(decision)
    apply({ kind: 'guidance-activated', studyId: opened.studyId, expectedParentVersion: opened.parentVersion, decisionDigest: sha256(decision) })
    const { kind: _kind, studyId: _id, evaluationMode: _mode, fileOutputKind: _output, ...prior } = opened
    const body = { ...prior, parentSnapshot: state.snapshot(opened.scopeKey), parentVersion: guidanceVersion(state.snapshot(opened.scopeKey)), cases: prior.cases.map(item => {
      if (!('prompt' in item)) return item
      const material = { prompt: item.prompt, criteria: item.criteria }
      return { id: item.id, kind: item.kind, ...material, materialDigest: sha256(material), inputDigest: guidanceInputDigest(item.prompt) }
    }) }
    const next: GuidanceStudyOpened = { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }; apply(next)
    const snapshot = { ...body.parentSnapshot, rules: { writing: 'A later text rule.' } }
    apply({ kind: 'candidate-recorded', studyId: next.studyId, candidateSnapshot: snapshot, proposalProof: proof('text-proposal') })
    for (const item of next.cases) for (const role of ['baseline', 'candidate'] as const) apply({ kind: 'arm-recorded', studyId: next.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
      behaviorVersion: role === 'baseline' ? next.parentVersion : guidanceVersion(snapshot), executionProof: proof(`text:${item.id}:${role}`), judgeProof: proof(`text-judge:${item.id}:${role}`), outputDigest: sha256('text'), verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met' })
    const textDecision = state.decision(next.studyId); apply(textDecision)
    apply({ kind: 'guidance-activated', studyId: next.studyId, expectedParentVersion: next.parentVersion, decisionDigest: sha256(textDecision) })
    expect(state.activeStudyChain(opened.scopeKey).map(study => study.opened.studyId)).toEqual([next.studyId, opened.studyId])
    const rollback = { kind: 'guidance-rolled-back' as const, studyId: next.studyId, expectedCurrentVersion: guidanceVersion(snapshot), reason: 'ancestor-invalidated' as const, ancestorStudyId: opened.studyId, evidenceTaskIds: [] }
    expect(() => apply({ ...rollback, ancestorStudyId: next.studyId })).toThrow(/ancestor/)
    apply(rollback)
    apply({ kind: 'guidance-rolled-back', studyId: opened.studyId, expectedCurrentVersion: guidanceVersion(candidate.candidateSnapshot), reason: 'support-retracted', evidenceTaskIds: [] })
    expect(state.snapshot(opened.scopeKey)).toEqual(baselineGuidanceSnapshot(opened.scopeKey))
  })
})
