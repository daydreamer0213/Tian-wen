import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { renderGuidanceReviewMarkdown, verifyGuidanceReviewPacket } from '../../scripts/render-guidance-review-packet.mjs'

function fixture() {
  const arm = (caseId: string, role: string) => ({ caseId, role, answer: `${role} answer for ${caseId}` + '\n```quoted',
    task: { request: `Source request for ${caseId}`, criteria: ['Keep the scope'], sourceMetadata: { type: 'reasoning', text: 'USER SOURCE FACT' }, context: [{ role: 'assistant', content: [{ type: 'reasoning', text: 'PRIVATE CONTEXT REASONING' }, { type: 'text', text: 'Visible context' }] }] },
    reviews: [0, 1].map(index => ({ focus: `review ${index + 1}`, verdict: 'met', explanation: `Check ${caseId} ${role} ${index + 1}`, evidenceQuotes: ['quote'] })) })
  const cases = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'].map((id, index) => ({ id,
    kind: index < 2 ? 'source' : index === 2 ? 'counterexample' : 'synthetic',
    ...(index < 3 ? { originalMaterial: { request: `Original request for ${id}`, criteria: ['Accuracy'], context: [{ role: 'assistant', content: [{ type: 'reasoning', text: 'PRIVATE CONTEXT REASONING' }, { type: 'text', text: 'Visible context' }] }] },
      originalAnswer: [{ role: 'assistant', content: [{ type: 'reasoning', text: 'PRIVATE REASONING' }, { type: 'text', text: `Original answer for ${id}` }] }],
      originalTaskReview: { verdict: 'met', explanation: `Original review ${id}`, reviewChecks: [{ verdict: 'met', explanation: 'First check' }, { verdict: 'met', explanation: 'Second check' }] } } : {}),
    ...(index === 0 ? { feedback: { originalFeedback: { quote: 'Your own suggestion, not ours' }, supplementalCriteria: ['Keep the speaker'],
      studyStandard: { criteria: ['Changed speaker'] }, rawFeedbackIncludedInStudy: false } } : {}),
    baseline: arm(id, 'baseline'), candidate: arm(id, 'candidate') }))
  const packet = { schemaVersion: 'tianwen.guidance-review-packet.v1', reviewStatus: 'diagnostic-historical',
    opened: { studyId: 'guidance-study:test', family: 'summarization', failureCategory: 'source-fidelity', parentVersion: 'sha256:parent', sourceTaskIds: ['SOURCE BINDING MARKER'] },
    candidate: { candidateSnapshot: { rules: { summarization: 'Preserve source limits.' } } },
    decision: { verdict: 'accepted' }, activation: { kind: 'guidance-activated' }, proposalMaterial: { sources: ['PROPOSAL MATERIAL MARKER'] },
    currentConsent: { enabled: false, revision: 2 }, currentSupport: { state: 'supported' }, cases }
  const bytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`)
  const manifest = { schemaVersion: 'tianwen.guidance-review-export.v1', studyId: packet.opened.studyId,
    reviewStatus: packet.reviewStatus, packetSha256: createHash('sha256').update(bytes).digest('hex') }
  return { packet, bytes, manifest }
}

it('renders all source and trial content without exposing model reasoning or treating historical evidence as approval', () => {
  const { bytes, manifest } = fixture()
  const packet = verifyGuidanceReviewPacket(bytes, manifest)
  const markdown = renderGuidanceReviewMarkdown(packet, manifest)
  expect(markdown).toContain('diagnostic-historical')
  expect(markdown).toContain('不能用于新方法放行')
  expect(markdown).toContain('Your own suggestion, not ours')
  expect(markdown).toContain('Changed speaker')
  expect(markdown).toContain('SOURCE BINDING MARKER')
  expect(markdown).toContain('PROPOSAL MATERIAL MARKER')
  expect(markdown).toContain('Original answer for source1')
  for (const id of ['source1', 'source2', 'counterexample', 'adjacent', 'holdout']) {
    expect(markdown).toContain(`baseline answer for ${id}`)
    expect(markdown).toContain(`candidate answer for ${id}`)
    expect(markdown).toContain(`Check ${id} candidate 2`)
  }
  expect(markdown).not.toContain('PRIVATE REASONING')
  expect(markdown).not.toContain('PRIVATE CONTEXT REASONING')
  expect(markdown).toContain('USER SOURCE FACT')
  expect(markdown).toContain('````')
})

it('rejects changed packet bytes or mismatched manifest identity before rendering', () => {
  const { packet, bytes, manifest } = fixture()
  expect(() => verifyGuidanceReviewPacket(Buffer.concat([bytes, Buffer.from(' ')]), manifest)).toThrow(/SHA-256/)
  expect(() => verifyGuidanceReviewPacket(bytes, { ...manifest, studyId: 'guidance-study:other' })).toThrow(/identity/)
  const forged = { ...packet, reviewStatus: 'approved' }
  const forgedBytes = Buffer.from(`${JSON.stringify(forged)}\n`)
  expect(() => verifyGuidanceReviewPacket(forgedBytes, { ...manifest, reviewStatus: 'approved',
    packetSha256: createHash('sha256').update(forgedBytes).digest('hex') })).toThrow(/identity/)
})

it('labels a new unactivated accepted study as awaiting independent review', () => {
  const { packet, manifest } = fixture()
  const { activation: _activation, ...unactivated } = packet
  const pending = { ...unactivated, reviewStatus: 'unreviewed' }
  const bytes = Buffer.from(`${JSON.stringify(pending)}\n`)
  const pendingManifest = { ...manifest, reviewStatus: 'unreviewed', packetSha256: createHash('sha256').update(bytes).digest('hex') }
  const markdown = renderGuidanceReviewMarkdown(verifyGuidanceReviewPacket(bytes, pendingManifest), pendingManifest)
  expect(markdown).toContain('待独立审查，不代表方法已获放行')
  expect(markdown).not.toContain('历史诊断，不能用于新方法放行')
})
it('renders explicit native Goal provenance and file packets without granting approval or exposing reasoning',()=>{
  const {packet,manifest}=fixture()
  const native={...packet,schemaVersion:'tianwen.file-guidance-review-packet.v1',fileOutputKind:'files',
    cases:packet.cases.map((item,index)=>({...item,
      baseline:{...item.baseline,answer:'Done.',fileResult:{answer:'Done.',files:[{path:'output.md',content:'BASELINE_ACTUAL_FILE'}],outputDigest:'baseline-digest'}},
      candidate:{...item.candidate,answer:'Done.',fileResult:{answer:'Done.',files:[{path:'output.md',content:'CANDIDATE_ACTUAL_FILE'}],outputDigest:'candidate-digest'}},
      ...(index<3?{nativeGoalOriginal:{sourceKind:'native-goal-task',source:{sourceId:'goal-task-result:original'},
      material:{prompt:'ORIGINAL COMMAND AND PLANNER REQUIREMENTS'},original:{conversation:[{role:'assistant',content:[{type:'reasoning',text:'PRIVATE NATIVE REASONING'},
        {type:'text',text:'ORIGINAL NATIVE ANSWER'}]}]}}}:{})}))}
  const bytes=Buffer.from(JSON.stringify(native))
  const bound={...manifest,packetSha256:createHash('sha256').update(bytes).digest('hex')}
  const rendered=renderGuidanceReviewMarkdown(verifyGuidanceReviewPacket(bytes,bound),bound)
  expect(rendered).toContain('原生 Goal 子任务来源与冻结要求')
  expect(rendered).toContain('ORIGINAL NATIVE ANSWER')
  expect(rendered).not.toContain('PRIVATE NATIVE REASONING')
  expect(rendered).toContain('不能用于新方法放行')
  expect(rendered).toContain('BASELINE_ACTUAL_FILE')
  expect(rendered).toContain('CANDIDATE_ACTUAL_FILE')
})
