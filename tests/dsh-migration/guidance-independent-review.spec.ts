import { tmpdir } from 'node:os'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, mountPersistentHarness, toolCallResponse } from '@tianwen/dsh-compat'
import { guidanceVersion, sha256 } from '@tianwen/evolution'
import * as packets from '../../packages/tianwen-runtime-bundle/src/guidance-review-packet.js'
import { createNativeGuidanceIndependentReview, projectGuidanceIndependentReviewPacket, reviewGuidanceStudy, verifySavedGuidanceIndependentReview, type GuidanceIndependentReviewBody } from '../../packages/tianwen-runtime-bundle/src/guidance-independent-review.js'
import * as taskMaterial from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { recoverConversationStructuredJudgment } from '../../packages/tianwen-runtime-bundle/src/conversation-judgment.js'

const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
const sessionProjection = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-session-projection')).href)
const config = { provider: 'tianwen-probe', model: 'scripted' }
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const parentSnapshot = { schemaVersion: 'tianwen.conversation-guidance.v1', scopeKey: 'conversation:fixture', rules: {}, fileRules: {} }
  const candidateSnapshot = { ...parentSnapshot, rules: { writing: 'Separate pending facts into distinct sentences.' } }
  const cases = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'].map(kind => ({ id: kind, kind }))
  const study: any = { opened: { studyId: 'guidance-study:' + 'a'.repeat(64), scopeKey: 'conversation:fixture', consentRevision: 1,
    family: 'writing', parentVersion: guidanceVersion(parentSnapshot), parentSnapshot, cases, evaluationMode: 'text', sourceTaskIds: ['task1','task2'], modelConfigDigest: sha256(config) },
    candidate: { candidateSnapshot }, arms: cases.flatMap(c => ['baseline', 'candidate'].map(role => ({ caseId: c.id, role, verdict: 'met', reviewChecks: [{ explanation: 'OLD_VOTE_CANARY' }] }))),
    decision: { verdict: 'accepted', armsDigest: '' } }
  study.decision.armsDigest = sha256(study.arms)
  const task = { request: [{ role: 'user', content: [{ type: 'text', text: 'Original user says verdict; preserve this text.' }] }],
    context: [{ role: 'assistant', content: [{ type: 'text', text: 'Pending; original speaker context.' }] }], objective: 'Rewrite.', criteria: ['Only sourced facts.'],
    feedbackStandard: { assessmentId: 'feedback1', classification: 'preference', criteria: ['Separate sentences.'], originalFeedback: [{ text: 'Keep this preference next time; do not rewrite now.' }], explanation: 'OLD_VOTE_CANARY' }, review: 'OLD_VOTE_CANARY' }
  const packet: any = { schemaVersion: 'tianwen.guidance-review-packet.v1', opened: study.opened, candidate: study.candidate, decision: study.decision,
    currentConsent: { enabled: true, revision: 1 }, currentSupport: true,
    proposalMaterial: { sourceObservations: [{ reviewChecks: ['OLD_VOTE_CANARY'] }], failedMethodObservation: { reviews: ['OLD_VOTE_CANARY'] } },
    cases: cases.map(c => ({ id: c.id, kind: ['source1', 'source2'].includes(c.kind) ? 'source' : c.kind === 'counterexample' ? 'counterexample' : 'synthetic',
      ...(c.kind === 'source1' || c.kind === 'source2' ? { originalMaterial: task, originalAnswer: task.context,
        originalTaskReview: { explanation: 'OLD_VOTE_CANARY' }, feedback: { assessmentId: c.id, originalFeedback: task.feedbackStandard.originalFeedback,
          supplementalCriteria: ['Separate sentences.'], studyStandard: task.feedbackStandard, rawFeedbackIncludedInStudy: true } } : {}),
      baseline: { caseId: c.id, role: 'baseline', task, answer: '原始；未定。', reviews: ['OLD_VOTE_CANARY'] },
      candidate: { caseId: c.id, role: 'candidate', task, answer: '原始。未定。', reviews: ['OLD_VOTE_CANARY'] } })) }
  return { study, packet }
}
function body(verdict: GuidanceIndependentReviewBody['verdict']): GuidanceIndependentReviewBody {
  return { verdict, sourceChecks: ['source1', 'source2', 'counterexample'].map(kind => ({ caseId: kind, kind: kind as any, verdict, reason: 'Original raw source and feedback remain faithful.' })),
    armChecks: ['source1', 'source2', 'counterexample', 'adjacent', 'holdout'].flatMap(caseId => (['baseline', 'candidate'] as const).map(role => ({ caseId, role, verdict, boundary: 'Actor, condition, certainty and commitment.', reason: 'Scripted boundary mechanism, not provider quality.' }))) }
}
function root() { const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-development-runtime' : join(tmpdir(), 'tianwen-development-runtime')); mkdirSync(base, { recursive: true }); const r = mkdtempSync(join(base, 'independent-review-')); roots.push(r); return r }
function packetMocks(packet: any) { vi.spyOn(packets, 'recoverTextGuidanceStudyReviewPacket').mockResolvedValue(packet); vi.spyOn(packets, 'recoverFileGuidanceStudyReviewPacket').mockResolvedValue(packet) }
function paths(r: string, study: any) { return join(r, 'independent-review', sha256(study.opened.studyId).slice(7)) }

it('projects complete roles, raw feedback and ten answers without nested original votes', () => {
  const { packet } = fixture(), projected: any = projectGuidanceIndependentReviewPacket(packet)
  expect(JSON.stringify(projected)).not.toContain('OLD_VOTE_CANARY')
  expect(projected.cases).toHaveLength(5)
  expect(projected.cases[0].baseline.task.request).toEqual(packet.cases[0].baseline.task.request)
  expect(projected.cases[0].baseline.task.context).toEqual(packet.cases[0].baseline.task.context)
  expect(projected.cases[0].feedback.originalFeedback).toEqual(packet.cases[0].feedback.originalFeedback)
  expect(projected.cases.map((c: any) => [c.baseline.answer, c.candidate.answer])).toEqual(packet.cases.map((c: any) => [c.baseline.answer, c.candidate.answer]))
})

it.each(['clear', 'reject', 'insufficient'] as const)('saves genuine first native %s capture and recovers without another request', async verdict => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const h = await mountPersistentHarness(r, [toolCallResponse('first-independent', 'structured_output', body(verdict))])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('independent-parent'), meta: { cwd: r }, agentOptions: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer: { mode: 'native' as const, reviewerId: 'scripted-native-review', callConfig: config } }
  let clearance: any
  try {
    clearance = await reviewGuidanceStudy(h.ctx, input)
    expect(clearance.verdict).toBe(verdict); expect(clearance.reviewer).toMatchObject({ authority: 'independent-ai', id: 'scripted-native-review', model: 'tianwen-probe:scripted' })
    expect(h.adapter.requests).toHaveLength(1)
    expect(JSON.stringify(h.adapter.requests[0]!.messages)).not.toContain('OLD_VOTE_CANARY')
    expect(JSON.stringify(h.adapter.requests[0]!.messages)).toContain('Original historical deliveries are judged only against the requests and quality contracts in force at delivery time.')
    expect(JSON.stringify(h.adapter.requests[0]!.messages)).toContain('Apply those later continuing standards only to the fresh study arms, never retroactively to old answers.')
    expect(JSON.stringify(h.adapter.requests[0]!.messages)).toContain('An established historical failure may still be a valid research source.')
    expect(await reviewGuidanceStudy(h.ctx, input)).toEqual(clearance); expect(h.adapter.requests).toHaveLength(1)
    const receipt = JSON.parse(readFileSync(join(paths(r, study), 'first-result.json'), 'utf8'))
    expect(receipt.executionKind).toBe('native'); expect(receipt.proof.sessionId).toBe(String(h.adapter.requests[0]!.sessionId))
    expect(JSON.stringify(JSON.parse(readFileSync(join(paths(r, study), 'comparison.json'), 'utf8')))).toContain('OLD_VOTE_CANARY')
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(r, [])
  try {
    expect(await reviewGuidanceStudy(cold.ctx, { ...input, parent: {} as any })).toEqual(clearance)
    expect(await verifySavedGuidanceIndependentReview(cold.ctx, { study: { ...study, activation: { diagnostic: true } }, evolutionRoot: r, clearance, signal: input.signal })).toBe(true)
    expect(cold.adapter.requests).toHaveLength(0)
  }
  finally { await cold.ctx.fiber.dispose() }
})

it('keeps full file contents and native Goal input while excluding Goal source votes', () => {
  const { packet } = fixture(), c = packet.cases[2]
  packet.opened.evaluationMode = 'local-files'; packet.opened.fileOutputKind = 'files'
  const files = { schemaVersion: 'tianwen.conversation-file-material.v1', cwd: 'D:/fixture', outputKind: 'files', entries: [{ path: 'input.txt', content: 'Exact\r\n😀' }], outputPaths: ['input.txt'] }
  const fileResult = { answer: 'Exact answer.', files: [{ path: 'input.txt', content: 'Exact\r\n😀' }] }
  c.nativeGoalOriginal = { source: { input: { checks: ['OLD_VOTE_CANARY'] } }, material: { sourceKind: 'native-goal-task', prompt: 'Full original goal context and delegated task.', criteria: ['Exact condition.'], files },
    original: { source: { request: [{ role: 'user', content: [{ type: 'text', text: 'Original command.' }] }], context: [], objective: 'Task.', criteria: ['Condition.'], nativeGoal: { review: 'OLD_VOTE_CANARY' } },
      conversation: [{ role: 'assistant', content: [{ type: 'text', text: 'Original Goal delivery.' }] }], toolEvidence: [], fileResult } }
  c.baseline.fileResult = fileResult; c.candidate.fileResult = fileResult
  const projected: any = projectGuidanceIndependentReviewPacket(packet)
  expect(projected.cases[2].nativeGoalOriginal.material.files).toEqual(files)
  expect(projected.cases[2].nativeGoalOriginal.originalAnswer).toEqual(c.nativeGoalOriginal.original.conversation)
  expect(projected.cases[2].candidate.fileResult).toEqual(fileResult)
  expect(JSON.stringify(projected)).not.toContain('OLD_VOTE_CANARY')
})

it('persists a clearly programmatic first host result and never trusts self-declared native/human authority', async () => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  let calls = 0
  const reviewer = async (input: any) => {
    calls++; expect(readFileSync(join(paths(r, study), 'attempt.json'), 'utf8')).toContain(input.attemptId)
    expect(JSON.stringify(input.material)).not.toContain('OLD_VOTE_CANARY')
    return { value: body('clear'), reviewer: { id: 'trusted-host-fixture', model: 'scripted-programmatic-no-native-proof', authority: 'human' } }
  }
  const ctx: any = {}, input = { study, parent: { session: { id: 'program-parent' } } as any, signal: new AbortController().signal, evolutionRoot: r, reviewer }
  const first = await reviewGuidanceStudy(ctx, input)
  expect(first.reviewer.authority).toBe('independent-ai')
  expect(JSON.parse(readFileSync(join(paths(r, study), 'first-result.json'), 'utf8'))).toMatchObject({ executionKind: 'programmatic', proof: null })
  expect(await reviewGuidanceStudy(ctx, { ...input, parent: {} as any })).toEqual(first)
  expect(await verifySavedGuidanceIndependentReview(ctx, { study, evolutionRoot: r, clearance: first, signal: input.signal })).toBe(true)
  expect(calls).toBe(1)
})

it.each(['callback-failure', 'forged-proof', 'wrong-case', 'candidate-reject'] as const)('preserves a failed programmatic first attempt without another invocation: %s', async failure => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet); let calls = 0
  const reviewer = async () => {
    calls++; if (failure === 'callback-failure') throw new Error('first callback failed')
    const value = body('clear')
    if (failure === 'wrong-case') (value.armChecks[0] as any).caseId = 'unbound-case'
    if (failure === 'candidate-reject') (value.armChecks[1] as any).verdict = 'reject'
    return { value, reviewer: { id: 'host', model: 'scripted' }, ...(failure === 'forged-proof' ? { proof: { sessionId: 'fake', sessionDigest: sha256('fake'), requestDigest: sha256('fake') } } : {}) }
  }
  const input = { study, parent: { session: { id: 'program-parent' } } as any, signal: new AbortController().signal, evolutionRoot: r, reviewer }
  await expect(reviewGuidanceStudy({} as any, input)).rejects.toThrow()
  await expect(reviewGuidanceStudy({} as any, input)).rejects.toThrow()
  expect(calls).toBe(1); expect(readdirSync(paths(r, study))).not.toContain('clearance.json')
})

it.each(['unique', 'ambiguous'] as const)('recovers native capture before receipt from the old parent only, %s child', async mode => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const h = await mountPersistentHarness(r, [toolCallResponse('first-gap', 'structured_output', body('clear')), ...(mode === 'ambiguous' ? [toolCallResponse('second-gap', 'structured_output', body('clear'))] : [])])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('gap-old-parent'), meta: { cwd: r }, agentOptions: config })
  const reviewer = createNativeGuidanceIndependentReview(h.ctx, { mode: 'native', reviewerId: 'gap-reviewer', callConfig: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer }
  let first: any
  try {
    first = await reviewGuidanceStudy(h.ctx, input)
    if (mode === 'ambiguous') {
      const attempt = JSON.parse(readFileSync(join(paths(r, study), 'attempt.json'), 'utf8'))
      const material = JSON.parse(readFileSync(join(paths(r, study), attempt.materialFile), 'utf8'))
      await reviewer({ attemptId: attempt.attemptId, parent: handle.agent, signal: input.signal, instruction: attempt.instruction, material, callConfig: attempt.callConfig })
    }
    for (const name of ['first-result.json', 'clearance.json', 'comparison.json']) unlinkSync(join(paths(r, study), name))
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(r, []); await cold.ctx.plugin(sessionProjection.default); await cold.ctx.plugin(SubagentRuntime)
  try {
    if (mode === 'unique') {
      expect(await verifySavedGuidanceIndependentReview(cold.ctx, { study, evolutionRoot: r, clearance: first, signal: input.signal })).toBe(true)
      expect(readdirSync(paths(r, study))).not.toContain('first-result.json')
      expect(await reviewGuidanceStudy(cold.ctx, { ...input, parent: {} as any, reviewer: { mode: 'native', reviewerId: 'gap-reviewer', callConfig: config } })).toEqual(first)
    } else {
      await expect(reviewGuidanceStudy(cold.ctx, { ...input, parent: {} as any })).rejects.toThrow('no unique native child')
      await expect(reviewGuidanceStudy(cold.ctx, { ...input, parent: {} as any })).rejects.toThrow('no unique native child')
    }
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose() }
})

it('rejects missing attempt in a managed directory, but imposes no native receipt on unrelated host permits', async () => {
  const r = root(), { study } = fixture(), input = { study, evolutionRoot: r, clearance: {} as any, signal: new AbortController().signal }
  expect(await verifySavedGuidanceIndependentReview({} as any, input)).toBe(false)
  mkdirSync(paths(r, study), { recursive: true }); writeFileSync(join(paths(r, study), 'first-result.json'), '{}')
  await expect(verifySavedGuidanceIndependentReview({} as any, input)).rejects.toThrow('no first attempt')
})

it('does not truncate oversized full blind material or invoke a callback', async () => {
  const r = root(), { study, packet } = fixture(); packet.cases[4].candidate.answer = 'x'.repeat(512 * 1024); packetMocks(packet)
  const reviewer = vi.fn()
  await expect(reviewGuidanceStudy({} as any, { study, parent: {} as any, signal: new AbortController().signal, evolutionRoot: r, reviewer })).rejects.toThrow('material-too-large')
  expect(reviewer).not.toHaveBeenCalled(); expect(readdirSync(paths(r, study))).not.toContain('attempt.json')
})

it.each(['wrong-source', 'missing-arm', 'candidate-reject'] as const)('rejects invalid %s before the original native child corrects its own body', async invalid => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const bad = body('clear'), good = body('clear')
  if (invalid === 'wrong-source') (bad.sourceChecks[0] as any).kind = 'source2'
  if (invalid === 'missing-arm') (bad as any).armChecks = bad.armChecks.slice(0, 9)
  if (invalid === 'candidate-reject') (bad.armChecks[1] as any).verdict = 'reject'
  let correction = ''
  const h = await mountPersistentHarness(r, [toolCallResponse('bad-independent', 'structured_output', bad), request => {
    correction = JSON.stringify(request.messages); return toolCallResponse('correct-independent', 'structured_output', good)
  }])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('correction-parent'), meta: { cwd: r }, agentOptions: config })
  try {
    const clearance = await reviewGuidanceStudy(h.ctx, { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r,
      reviewer: { mode: 'native', reviewerId: 'correction-scripted', callConfig: config } })
    expect(clearance.verdict).toBe('clear'); expect(correction).toContain('host has not repaired or captured this submission')
    expect(h.adapter.requests).toHaveLength(2)
    expect(h.adapter.requests[0]!.sessionId).toBe(h.adapter.requests[1]!.sessionId)
    const saved = await h.ctx.sessionPersistence.inspect(h.adapter.requests[0]!.sessionId!)
    expect(saved.events.filter(e => e.type === 'tool/call').map(e => e.data.arguments)).toEqual([JSON.stringify(bad), JSON.stringify(good)])
    expect(saved.events.filter(e => e.type === 'tool/result').some(e => e.data.message.content[0]?.isError === true)).toBe(true)
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it.each([false, true])('recovers the configured source model without silent resolution drift: %s', async drift => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  vi.spyOn(taskMaterial, 'recoverConversationTaskModel').mockResolvedValue(config)
  const h = await mountPersistentHarness(r, drift ? [] : [toolCallResponse('source-route', 'structured_output', body('clear'))])
  Object.defineProperty(h.ctx, 'tianwenEvolution', { configurable: true, value: { listConversationTasks: () => [{ source: { taskId: 'task1' } }] } })
  if (drift) vi.spyOn(h.ctx.llm, 'resolveCallConfig').mockResolvedValue({ ...config, model: 'other-scripted' })
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('source-config-parent'), meta: { cwd: r }, agentOptions: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer: { mode: 'native' as const, reviewerId: 'source-route-scripted' } }
  try {
    if (drift) { await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow('source native model configuration drift'); expect(h.adapter.requests).toHaveLength(0) }
    else { const result = await reviewGuidanceStudy(h.ctx, input); expect(result.reviewer.model).toBe('tianwen-probe:scripted'); expect(h.adapter.requests).toHaveLength(1) }
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it('preserves an invalid-only native first attempt and never reruns it', async () => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const bad: any = body('clear'); bad.armChecks = []
  const h = await mountPersistentHarness(r, [toolCallResponse('invalid-only', 'structured_output', bad)])
  await h.ctx.plugin(sessionProjection.default); await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('invalid-only-parent'), meta: { cwd: r }, agentOptions: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer: { mode: 'native' as const, reviewerId: 'invalid-only-scripted', callConfig: config } }
  try {
    await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow()
    const requests = h.adapter.requests.length
    await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow('no second review')
    expect(h.adapter.requests).toHaveLength(requests); expect(readdirSync(paths(r, study))).not.toContain('clearance.json')
    const child = await h.ctx.sessionPersistence.inspect(h.adapter.requests[0]!.sessionId!)
    expect(child.events.filter(e => e.type === 'tool/call').map(e => e.data.arguments)).toContain(JSON.stringify(bad))
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})

it('rejects changes to saved material, first result, or study binding without a new callback', async () => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const reviewer = vi.fn(async () => ({ value: body('clear'), reviewer: { id: 'host', model: 'scripted-programmatic' } }))
  const input = { study, parent: { session: { id: 'tamper-parent' } } as any, signal: new AbortController().signal, evolutionRoot: r, reviewer }
  const first = await reviewGuidanceStudy({} as any, input), dir = paths(r, study)
  await expect(reviewGuidanceStudy({} as any, { ...input, study: { ...study, decision: { ...study.decision, explanation: 'changed' } } })).rejects.toThrow('binding changed')
  const receiptPath = join(dir, 'first-result.json'), originalReceipt = readFileSync(receiptPath, 'utf8'), changed = JSON.parse(originalReceipt)
  changed.value.armChecks[0].reason = 'changed first result'
  writeFileSync(receiptPath, JSON.stringify(changed))
  await expect(verifySavedGuidanceIndependentReview({} as any, { study, evolutionRoot: r, clearance: first, signal: input.signal })).rejects.toThrow('differs from first result')
  writeFileSync(receiptPath, originalReceipt)
  const attempt = JSON.parse(readFileSync(join(dir, 'attempt.json'), 'utf8')), blindPath = join(dir, attempt.materialFile), blind = JSON.parse(readFileSync(blindPath, 'utf8'))
  blind.cases[0].candidate.answer = 'changed answer'; writeFileSync(blindPath, JSON.stringify(blind))
  await expect(reviewGuidanceStudy({} as any, input)).rejects.toThrow('saved material changed')
  expect(reviewer).toHaveBeenCalledTimes(1)
})

it.each(['wrong-parent', 'wrong-attempt'] as const)('rejects a genuine saved native proof from %s without another request', async mismatch => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const h = await mountPersistentHarness(r, [toolCallResponse('original-proof', 'structured_output', body('clear')), toolCallResponse('other-valid-proof', 'structured_output', body('clear'))])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('proof-original-parent'), meta: { cwd: r }, agentOptions: config })
  const other = await h.ctx.agents.create({ sessionId: SessionId('proof-different-parent'), meta: { cwd: r }, agentOptions: config })
  const reviewer = createNativeGuidanceIndependentReview(h.ctx, { mode: 'native', reviewerId: 'proof-binding-scripted', callConfig: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer }
  try {
    const first = await reviewGuidanceStudy(h.ctx, input), dir = paths(r, study)
    const original = JSON.parse(readFileSync(join(dir, 'first-result.json'), 'utf8')), attempt = JSON.parse(readFileSync(join(dir, 'attempt.json'), 'utf8'))
    const material = JSON.parse(readFileSync(join(dir, attempt.materialFile), 'utf8'))
    // These are two real installed-SDK captures; only lineage/attempt differs.
    const alternate = await reviewer({ attemptId: mismatch === 'wrong-attempt' ? attempt.attemptId + '-different' : attempt.attemptId,
      parent: mismatch === 'wrong-parent' ? other.agent : handle.agent, signal: input.signal, instruction: attempt.instruction, material, callConfig: config })
    expect((await recoverConversationStructuredJudgment(h.ctx, alternate.proof!, alternate.value)).material).toEqual(material)
    const transplanted = { ...original, proof: alternate.proof }
    const evidenceRoot = process.env.TIANWEN_REPAIR_EVIDENCE_ROOT
    if (evidenceRoot !== undefined) {
      const evidenceDir = join(evidenceRoot, mismatch); mkdirSync(evidenceDir, { recursive: true })
      for (const [name, value] of Object.entries({ attempt, original, transplanted,
        originalNativeSession: await h.ctx.sessionPersistence.inspect(SessionId(original.proof.sessionId)),
        alternateNativeSession: await h.ctx.sessionPersistence.inspect(SessionId(alternate.proof!.sessionId)) })) {
        // Preserve the first reproduction; later green runs do not overwrite it.
        try { writeFileSync(join(evidenceDir, name + '.json'), JSON.stringify(value), { flag: 'wx' }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      }
    }
    writeFileSync(join(dir, 'first-result.json'), JSON.stringify(transplanted))
    const count = h.adapter.requests.length
    await expect(verifySavedGuidanceIndependentReview(h.ctx, { study, evolutionRoot: r, clearance: first, signal: input.signal })).rejects.toThrow(mismatch === 'wrong-parent' ? 'native parent changed' : 'native attempt changed')
    await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow(mismatch === 'wrong-parent' ? 'native parent changed' : 'native attempt changed')
    expect(h.adapter.requests).toHaveLength(count)
    writeFileSync(join(dir, 'first-result.json'), JSON.stringify(original))
    expect(await verifySavedGuidanceIndependentReview(h.ctx, { study, evolutionRoot: r, clearance: first, signal: input.signal })).toBe(true)
    expect(h.adapter.requests).toHaveLength(count)
  } finally { await other.dispose(); await handle.dispose(); await h.ctx.fiber.dispose() }
})

it('recognizes a genuine native factory across two independently loaded module entries and restores its first proof', async () => {
  const moduleA = await import('../../packages/tianwen-runtime-bundle/src/guidance-independent-review.js')
  vi.resetModules()
  const moduleB = await import('../../packages/tianwen-runtime-bundle/src/guidance-independent-review.js')
  const packetB = await import('../../packages/tianwen-runtime-bundle/src/guidance-review-packet.js')
  expect(moduleA.createNativeGuidanceIndependentReview).not.toBe(moduleB.createNativeGuidanceIndependentReview)
  expect(moduleA.reviewGuidanceStudy).not.toBe(moduleB.reviewGuidanceStudy)
  const r = root(), { study, packet } = fixture()
  vi.spyOn(packetB, 'recoverTextGuidanceStudyReviewPacket').mockResolvedValue(packet)
  const h = await mountPersistentHarness(r, [toolCallResponse('cross-entry-original', 'structured_output', body('clear'))])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('cross-entry-parent'), meta: { cwd: r }, agentOptions: config })
  const callbackA = moduleA.createNativeGuidanceIndependentReview(h.ctx, { mode: 'native', reviewerId: 'cross-entry-scripted', callConfig: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer: callbackA }
  const saveEvidence = (name: string, value: unknown) => {
    const evidenceRoot = process.env.TIANWEN_CROSS_ENTRY_EVIDENCE_ROOT
    if (evidenceRoot === undefined) return
    mkdirSync(evidenceRoot, { recursive: true })
    try { writeFileSync(join(evidenceRoot, name + '.json'), JSON.stringify(value), { flag: 'wx' }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  let first: any
  try {
    try { first = await moduleB.reviewGuidanceStudy(h.ctx, input) }
    catch (error) {
      // Save the genuine earliest failure, not a fabricated SDK proof.
      saveEvidence('first-red-attempt', JSON.parse(readFileSync(join(paths(r, study), 'attempt.json'), 'utf8')))
      saveEvidence('first-red-failure', { message: error instanceof Error ? error.message : String(error), sdkRequests: h.adapter.requests.length,
        savedFiles: readdirSync(paths(r, study)), independentModuleFunctions: moduleA.reviewGuidanceStudy !== moduleB.reviewGuidanceStudy })
      throw error
    }
    expect(first.reviewer).toMatchObject({ authority: 'independent-ai', id: 'cross-entry-scripted', model: 'tianwen-probe:scripted' })
    const receipt = JSON.parse(readFileSync(join(paths(r, study), 'first-result.json'), 'utf8'))
    expect(receipt.executionKind).toBe('native'); expect(receipt.proof.sessionId).toBe(String(h.adapter.requests[0]!.sessionId))
    expect(h.adapter.requests).toHaveLength(1)
    saveEvidence('first-green-attempt', JSON.parse(readFileSync(join(paths(r, study), 'attempt.json'), 'utf8')))
    saveEvidence('first-green-receipt', receipt)
    saveEvidence('first-green-native-session', await h.ctx.sessionPersistence.inspect(SessionId(receipt.proof.sessionId)))
    expect(await moduleB.reviewGuidanceStudy(h.ctx, input)).toEqual(first)
    expect(h.adapter.requests).toHaveLength(1)
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
  const cold = await mountPersistentHarness(r, [])
  try {
    expect(await moduleB.reviewGuidanceStudy(cold.ctx, { ...input, parent: {} as any })).toEqual(first)
    expect(await moduleB.verifySavedGuidanceIndependentReview(cold.ctx, { study, evolutionRoot: r, clearance: first, signal: input.signal })).toBe(true)
    expect(cold.adapter.requests).toHaveLength(0)
  } finally { await cold.ctx.fiber.dispose(); vi.resetModules() }
})

it('does not promote an ordinary host wrapper that returns a genuine native proof', async () => {
  const r = root(), { study, packet } = fixture(); packetMocks(packet)
  const h = await mountPersistentHarness(r, [toolCallResponse('plain-wrapper-native', 'structured_output', body('clear'))])
  await h.ctx.plugin(SubagentRuntime); await h.ctx.plugin(spawn, { providerName: 'spawn' })
  const handle = await h.ctx.agents.create({ sessionId: SessionId('plain-wrapper-parent'), meta: { cwd: r }, agentOptions: config })
  const native = createNativeGuidanceIndependentReview(h.ctx, { mode: 'native', reviewerId: 'wrapped-scripted', callConfig: config })
  const ordinary = (input: Parameters<typeof native>[0]) => native({ ...input, callConfig: config })
  const input = { study, parent: handle.agent, signal: new AbortController().signal, evolutionRoot: r, reviewer: ordinary }
  try {
    await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow('programmatic independent reviewer cannot claim native proof')
    const receipt = JSON.parse(readFileSync(join(paths(r, study), 'first-result.json'), 'utf8'))
    expect(receipt.executionKind).toBe('programmatic')
    expect((await recoverConversationStructuredJudgment(h.ctx, receipt.proof, receipt.value)).material).toEqual(projectGuidanceIndependentReviewPacket(packet))
    expect(h.adapter.requests).toHaveLength(1)
    await expect(reviewGuidanceStudy(h.ctx, input)).rejects.toThrow('programmatic independent reviewer cannot claim native proof')
    expect(h.adapter.requests).toHaveLength(1); expect(readdirSync(paths(r, study))).not.toContain('clearance.json')
  } finally { await handle.dispose(); await h.ctx.fiber.dispose() }
})
