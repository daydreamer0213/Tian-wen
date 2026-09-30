import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { canonicalJson, sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, conversationReviewConsensus, conversationTaskId, parseConversationAuditedReviewChecks, type ConversationTask } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { guidanceInputDigest, guidanceStudyId, guidanceVersion, caseDesignAttemptId, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import * as taskMaterial from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { mountPersistentHarness } from '@tianwen/dsh-compat'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function root() {
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-checked-counterevidence-20261001/test-roots' : '/tmp/tianwen-checked-counterevidence-tests')
  mkdirSync(base, { recursive: true }); const value = mkdtempSync(join(base, 'counter-')); roots.push(value); return value
}
const scope = 'workspace:checked-counterevidence'
const model = sha256('scripted native model')
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })
type CheckState = 'pending' | 'verified' | 'rejected' | 'unverifiable'
type TaskStore = Pick<EvolutionLedger, 'recordConversationLearning' | 'listConversationTasks' | 'getConversationGuidance'>
function task(store: TaskStore, turn: number, state?: CheckState, met = turn === 3) {
  const identity = { sessionId: `counter-session-${turn}`, sessionLifecycleFingerprint: sha256(`lifecycle:${turn}`), turn: 1 }
  const taskId = conversationTaskId(identity), startSeq = turn * 10
  const source = { kind: 'task-started' as const, taskId, ...identity, startSeq, userMessageIds: [`request-${turn}`], requestDigest: sha256(`request:${turn}`), contextDigest: sha256([]), scopeKey: scope,
    consentRevision: 1, behaviorVersion: guidanceVersion(store.getConversationGuidance(scope)) }
  const admitted = { kind: 'task-admitted' as const, taskId, proof: proof(`admission:${turn}`), unavailableReason: null, qualityContract: conversationQualityContract(),
    decision: { kind: 'task' as const, objective: 'Repair the supplied code.', criteria: ['Preserve the supplied API.'], family: 'code' as const, evaluationMode: 'local-files' as const, fileOutputKind: 'files' as const, relatedTaskId: null, feedback: null } }
  const input = [{ path: 'task.ts', content: `// input ${turn}\nexport const value = ${turn}` }]
  const files = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: 'files' as const, inputsDigest: sha256(input), captureSeq: startSeq + 7,
    outputPaths: ['task.ts'], entries: [{ path: 'task.ts', content: `export const value = ${turn}` }] }
  const prepared = { kind: 'task-external-check-prepared' as const, taskId, preparedSeq: startSeq + 1, requestDigest: source.requestDigest, contextDigest: source.contextDigest,
    admissionDigest: sha256(admitted), modelConfigDigest: model, checkerId: 'frozen-independent-check', checkerDigest: sha256('checker'), contractDigest: sha256(`contract:${turn}`), inputsDigest: sha256(input) }
  const finish = { kind: 'task-finished' as const, taskId, endSeq: startSeq + 8, status: 'completed' as const, assistantMessageIds: [`answer-${turn}`], resultDigest: sha256(`result:${turn}`), evidenceIds: [], files }
  const checked = { kind: 'task-external-check-finished' as const, taskId, preparationDigest: sha256(prepared), resultDigest: finish.resultDigest, fileResultDigest: sha256(files),
    status: state === 'pending' || state === undefined ? 'verified' as const : state, detail: 'Only the frozen check result.' }
  const verdict = met ? 'met' as const : 'not-met' as const
  const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({ focus, verdict, category: met ? null : 'source-fidelity', explanation: 'Checked supplied API.', evidenceQuotes: ['pilot'], proof: proof(`review:${turn}:${focus}`),
    audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(`review-material:${turn}`), units: { 'answer-1': { firstClaim: { quote: 'pilot', kind: 'source-fact', status: met ? 'supported' : 'unsupported', sourceIds: ['request-1'], explanation: 'Frozen source.' }, additionalClaims: [] } } } })))
  store.recordConversationLearning(source); store.recordConversationLearning(admitted)
  if (state !== undefined) store.recordConversationLearning(prepared)
  store.recordConversationLearning({ kind: 'task-model-observed', taskId, headerSeq: startSeq + 2, modelConfigDigest: model })
  store.recordConversationLearning({ kind: 'task-file-input-captured', taskId, ...input[0]!, callId: `read:${turn}`, callSeq: startSeq + 3 })
  store.recordConversationLearning(finish)
  if (state !== undefined && state !== 'pending') store.recordConversationLearning(checked)
  store.recordConversationLearning({ kind: 'task-reviewed', taskId, admissionDigest: sha256(admitted), resultDigest: finish.resultDigest,
    ...conversationReviewConsensus(reviewChecks), reviewChecks, unavailableReason: null })
  return { value: store.listConversationTasks().find(item => item.source.taskId === taskId)!, checked, input }
}
function seeded(state?: CheckState, met = true) {
  const directory = root(), ledger = new EvolutionLedger(directory)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [task(ledger, 1).value, task(ledger, 2).value, task(ledger, 3, state, met).value] as const
  const parentSnapshot = ledger.getConversationGuidance(scope)
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `Independent ${kind} code task.`, criteria: ['Preserve the supplied API.'], qualityContract: conversationQualityContract(), files: {
      schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: directory, outputKind: 'files' as const, entries: [{ path: 'task.ts', content: `export const ${kind} = 10` }], outputPaths: ['task.ts'] } }
    return { id: kind, kind, ...material, inputDigest: guidanceInputDigest(material.prompt, material.files), materialDigest: sha256(material) }
  }
  const body: GuidanceStudyBody = { scopeKey: scope, family: 'code', failureCategory: 'source-fidelity', consentRevision: 1, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot),
    sourceTaskIds: [tasks[0].source.taskId, tasks[1].source.taskId], counterexampleTaskId: tasks[2].source.taskId, modelConfigDigest: model,
    qualityContract: conversationQualityContract(), evaluationMode: 'local-files', fileOutputKind: 'files', cases: [
      ...(['source1', 'source2', 'counterexample'] as const).map((kind, index) => ({ id: kind, kind, sourceTaskId: tasks[index]!.source.taskId, inputDigest: sha256(`input:${index}`), materialDigest: sha256(`material:${index}`) })),
      generated('adjacent'), generated('holdout') ] }
  const attemptBody = { scopeKey: scope, consentRevision: 1, parentVersion: body.parentVersion, sourceTaskIds: body.sourceTaskIds, counterexampleTaskId: body.counterexampleTaskId, modelConfigDigest: model, materialDigest: sha256('design material') }
  return { directory, ledger, tasks, opened: { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }, attempt: { attemptId: caseDesignAttemptId(attemptBody), ...attemptBody } }
}
async function readiness(f: ReturnType<typeof seeded>) {
  vi.spyOn(taskMaterial, 'recoverConversationTaskMaterial').mockImplementation(async (_ctx, value) => ({ request: [], context: [], objective: 'Repair the supplied code.', criteria: ['Preserve API.'], files: {
    schemaVersion: 'tianwen.conversation-file-material.v1', cwd: f.directory, outputKind: 'files', entries: value.fileInputs!.map(({ path, content }) => ({ path, content })), outputPaths: ['task.ts'] } }))
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: {
    getLearningAnalysisConsent: () => f.ledger.getLearningAnalysisConsent(), getConversationGuidance: () => f.ledger.getConversationGuidance(scope), listConversationTasks: () => f.ledger.listConversationTasks(),
    listConversationGuidanceStudies: () => f.ledger.listConversationGuidanceStudies(), listConversationCaseDesignAttempts: () => f.ledger.listConversationCaseDesignAttempts(), listConversationFeedbackAssessments: () => [], listLearningIntakeStatuses: () => [],
  } } })
  return service.readiness(scope)
}

it.each(['pending', 'rejected', 'unverifiable'] as const)('does not select model-met counterevidence with a %s prepared check', async state => {
  const f = seeded(state)
  expect(f.tasks[2].review?.verdict).toBe('met')
  expect(await readiness(f)).toEqual({ state: 'awaiting-counterexample' })
})
it.each([undefined, 'verified'] as const)('retains successful counterevidence when check state is %s', async state => {
  const f = seeded(state)
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
  expect(f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toEqual({ duplicate: false })
  expect(f.ledger.recordConversationGuidance(f.opened)).toEqual({ duplicate: false })
})
it('does not promote a verified check over a non-met model review', async () => {
  expect(await readiness(seeded('verified', false))).toEqual({ state: 'awaiting-counterexample' })
})
it('keeps a rejected check as problem evidence without turning it into successful counterevidence', async () => {
  const f = seeded('verified')
  // Replace the first problem source with a different, valid checked failure.
  const failure = task(f.ledger, 4, 'rejected', false).value
  vi.spyOn(f.ledger, 'listConversationTasks').mockReturnValue([failure, f.tasks[1], f.tasks[2]])
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
})
it.each(['pending', 'rejected', 'unverifiable'] as const)('rejects direct new design/study writes for %s checked counterevidence', state => {
  const f = seeded(state)
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/counterevidence|counterexample|check/i)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/counterevidence|counterexample|check/i)
  expect(f.ledger.listConversationCaseDesignAttempts()).toEqual([])
  expect(f.ledger.listConversationGuidanceStudies()).toEqual([])
})
it('cold replays an old contradictory study without changing its bytes or grandfathering a new write', () => {
  const f = seeded('rejected'), path = join(f.directory, 'ledger.jsonl')
  // This exact pre-change event was legal. Replay is historical; new writes are separately gated.
  appendFileSync(path, `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-10-01T01:00:00.000Z', record: f.opened })}\n`)
  const before = readFileSync(path, 'utf8'), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationGuidanceStudies()[0]?.opened).toEqual(f.opened)
  expect(replay.recordConversationGuidance(f.opened)).toEqual({ duplicate: true })
  expect(readFileSync(path, 'utf8')).toBe(before)
  const { kind: _kind, studyId: _id, ...body } = f.opened
  const nextBody = { ...body, cases: body.cases.map(item => ({ ...item, id: `next:${item.id}` })) }
  expect(() => replay.recordConversationGuidance({ kind: 'study-opened', studyId: guidanceStudyId(nextBody), ...nextBody })).toThrow(/counterevidence|counterexample|check/i)
})
it.each(['pending', 'rejected', 'unverifiable'] as const)('preserves old accepted research but forbids new activation with a %s counter check', state => {
  const f = seeded(state), path = join(f.directory, 'ledger.jsonl')
  appendFileSync(path, `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-10-01T01:00:00.000Z', record: f.opened })}\n`)
  const ledger = new EvolutionLedger(f.directory)
  const candidate = { kind: 'candidate-recorded' as const, studyId: f.opened.studyId,
    candidateSnapshot: { ...f.opened.parentSnapshot, fileRules: { code: { files: 'Preserve the supplied API.' } } }, proposalProof: proof('proposal') }
  ledger.recordConversationGuidance(candidate)
  for (const item of f.opened.cases) for (const role of ['baseline', 'candidate'] as const) {
    const output = { answer: 'pilot', files: [{ path: 'task.ts', content: 'export const value = 1' }] }
    const executionProof = proof(`execution:${item.id}:${role}`), verdict = role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met'
    const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({ focus, verdict, category: verdict === 'not-met' ? 'source-fidelity' : null,
      explanation: 'Frozen scripted check.', evidenceQuotes: ['pilot'], proof: proof(`arm:${item.id}:${role}:${focus}`), audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(`arm:${item.id}:${role}`),
        units: { 'answer-1': { firstClaim: { quote: 'pilot', kind: 'source-fact', status: verdict === 'met' ? 'supported' : 'unsupported', sourceIds: ['request-1'], explanation: 'Frozen script.' }, additionalClaims: [] } } } })))
    ledger.recordConversationGuidance({ kind: 'study-file-trial-captured', studyId: f.opened.studyId, materialDigest: item.materialDigest,
      target: { kind: 'formal', caseId: item.id, role }, receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: 'files', ...output, outputDigest: sha256(output), workerMaterialDigest: 'prompt' in item ? sha256({ prompt: item.prompt, files: item.files }) : sha256('worker'), executionProof } })
    ledger.recordConversationGuidance({ kind: 'arm-recorded', studyId: f.opened.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
      behaviorVersion: guidanceVersion(role === 'baseline' ? f.opened.parentSnapshot : candidate.candidateSnapshot), executionProof, judgeProof: reviewChecks[0]!.proof, outputDigest: sha256(output), verdict, reviewChecks })
  }
  const decision = ledger.conversationGuidanceDecision(f.opened.studyId)
  expect(decision.verdict).toBe('accepted')
  ledger.recordConversationGuidance(decision)
  const before = readFileSync(path, 'utf8'), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationGuidanceStudies()[0]?.decision).toEqual(decision)
  expect(replay.isConversationGuidanceSupported(f.opened.studyId)).toBe(true)
  expect(() => replay.recordConversationGuidance({ kind: 'guidance-activated', studyId: f.opened.studyId, expectedParentVersion: f.opened.parentVersion, decisionDigest: sha256(decision) })).toThrow(/counterevidence|counterexample|check/i)
  expect(readFileSync(path, 'utf8')).toBe(before)
})
it.each(['verified', 'rejected', 'unverifiable'] as const)('emits one durable late %s event and wakes the existing task lane', async state => {
  const directory = root(), harness = await mountPersistentHarness(join(directory, 'sessions'), [])
  await harness.ctx.plugin(SubagentRuntime)
  await applyRuntime(harness.ctx, { evolutionRoot: join(directory, 'evolution') })
  harness.ctx.tianwenEvolution.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const observed: string[] = []
  const wake = vi.spyOn(TianwenConversationGuidanceLoopService.prototype as unknown as { wakeTask(task: ConversationTask): Promise<void> }, 'wakeTask').mockResolvedValue(undefined)
  try {
    await harness.ctx.plugin(TianwenConversationGuidanceLoopService)
    const pending = task(harness.ctx.tianwenEvolution, 3, 'pending')
    await Promise.resolve(); wake.mockClear()
    harness.ctx.on('tianwen/conversation-code-check-finished', (taskId: string) => {
      expect(harness.ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === taskId)?.externalCheckFinished?.status).toBe(state)
      observed.push(taskId)
    })
    const checked = { ...pending.checked, status: state }
    harness.ctx.tianwenEvolution.recordConversationLearning(checked)
    harness.ctx.tianwenEvolution.recordConversationLearning(checked)
    expect(observed).toEqual([pending.value.source.taskId])
    expect(wake).toHaveBeenCalledOnce()
    expect(wake).toHaveBeenCalledWith(expect.objectContaining({ externalCheckFinished: checked }))
  } finally { await harness.ctx.fiber.dispose() }
})
it.each(['verified', 'rejected', 'unverifiable'] as const)('rescans a persisted pending snapshot when %s arrives during file recovery', async state => {
  const f = seeded('pending')
  let release!: () => void, reached!: () => void
  const paused = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { reached = resolve })
  let first = true
  vi.spyOn(taskMaterial, 'recoverConversationTaskMaterial').mockImplementation(async (_ctx, value) => {
    if (first) { first = false; reached(); await paused }
    return { request: [], context: [], objective: 'Repair the API.', criteria: ['Preserve API.'], files: {
      schemaVersion: 'tianwen.conversation-file-material.v1', cwd: f.directory, outputKind: 'files', entries: value.fileInputs!.map(({ path, content }) => ({ path, content })), outputPaths: ['task.ts'] } }
  })
  vi.spyOn(taskMaterial, 'recoverConversationTaskModel').mockResolvedValue({ provider: 'scripted', model: 'model' })
  const resumed = { agent: { session: { id: 'source-resumed' } }, dispose: vi.fn(async () => {}) }
  const resume = vi.fn(async () => resumed)
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { accepting: true, lanes: new Map(), persistedWakes: new Map(), persistedWakeDirty: new Set(), ctx: {
    agents: { get: () => undefined, list: () => [], resume }, tianwenEvolution: {
      getLearningAnalysisConsent: () => f.ledger.getLearningAnalysisConsent(), getConversationGuidance: () => f.ledger.getConversationGuidance(scope), listConversationTasks: () => f.ledger.listConversationTasks(),
      listConversationGuidanceStudies: () => [], listConversationCaseDesignAttempts: () => [], listConversationFeedbackAssessments: () => [], listLearningIntakeStatuses: () => [],
    } } })
  const schedule = vi.spyOn(service, 'schedule').mockResolvedValue(undefined)
  vi.spyOn(service as unknown as { proposalClues(): Promise<readonly []> }, 'proposalClues').mockResolvedValue([])
  const wake = service as unknown as { wakeTask(task: ConversationTask): Promise<void> }
  const pending = wake.wakeTask(f.tasks[2])
  try {
    await started
    const counter = f.tasks[2], checked = { kind: 'task-external-check-finished' as const, taskId: counter.source.taskId,
      preparationDigest: sha256(counter.externalCheckPrepared), resultDigest: counter.completion!.resultDigest, fileResultDigest: sha256(counter.completion!.files), status: state, detail: 'Frozen result received.' }
    f.ledger.recordConversationLearning(checked)
    for (let index = 0; index < 3; index++) expect(wake.wakeTask(f.ledger.listConversationTasks()[2]!)).toBe(pending)
    release(); await pending
    expect(resume).toHaveBeenCalledTimes(state === 'verified' ? 1 : 0)
    expect(schedule).toHaveBeenCalledTimes(state === 'verified' ? 1 : 0)
    if (state === 'verified') expect(schedule).toHaveBeenCalledWith(resumed.agent)
    expect(resumed.dispose).toHaveBeenCalledTimes(state === 'verified' ? 1 : 0)
    await service.whenIdle()
  } finally { release(); await pending }
})
