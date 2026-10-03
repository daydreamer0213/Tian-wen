import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { canonicalJson, sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, conversationReviewConsensus, conversationTaskId, parseConversationAuditedReviewChecks, type ConversationTask } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { guidanceInputDigest, guidanceStudyId, guidanceVersion, caseDesignAttemptId, parseConversationGuidanceRecord, type GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import * as taskMaterial from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { mountPersistentHarness } from '@tianwen/dsh-compat'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { conversationFeedbackAssessmentId } from '../../packages/tianwen-evolution/src/conversation-feedback.js'
import { conversationCheckedFailureSource, hasRejectedConversationCodeCheck, hasSatisfiedConversationCodeCheck } from '../../packages/tianwen-evolution/src/conversation-external-check.js'

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
const requiredCondition = 'Preserve the supplied API.'
function task(store: TaskStore, turn: number, state?: CheckState, met = turn === 3, options: { contentIdentity?: boolean, inputTurn?: number, model?: ReturnType<typeof sha256>, requiredFailure?: boolean, condition?: string, checker?: string } = {}) {
  const taskModel = options.model ?? model, inputTurn = options.inputTurn ?? turn
  const identity = { sessionId: `counter-session-${turn}`, sessionLifecycleFingerprint: sha256(`lifecycle:${turn}`), turn: 1 }
  const taskId = conversationTaskId(identity), startSeq = turn * 10
  const source = { kind: 'task-started' as const, taskId, ...identity, startSeq, userMessageIds: [`request-${turn}`], requestDigest: sha256(`request:${turn}`), contextDigest: sha256([]), scopeKey: scope,
    consentRevision: 1, behaviorVersion: guidanceVersion(store.getConversationGuidance(scope)),
    ...(options.contentIdentity ? { requestContentDigest: sha256('same checked regression request') } : {}) }
  const admitted = { kind: 'task-admitted' as const, taskId, proof: proof(`admission:${turn}`), unavailableReason: null, qualityContract: conversationQualityContract(),
    decision: { kind: 'task' as const, objective: 'Repair the supplied code.', criteria: ['Preserve the supplied API.'], family: 'code' as const, evaluationMode: 'local-files' as const, fileOutputKind: 'files' as const, relatedTaskId: null, feedback: null } }
  const input = [{ path: 'task.ts', content: `// input ${inputTurn}\nexport const value = ${inputTurn}` }]
  const files = { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: 'files' as const, inputsDigest: sha256(input), captureSeq: startSeq + 7,
    outputPaths: ['task.ts'], entries: [{ path: 'task.ts', content: `export const value = ${turn}` }] }
  const prepared = { kind: 'task-external-check-prepared' as const, taskId, preparedSeq: startSeq + 1, requestDigest: source.requestDigest, contextDigest: source.contextDigest,
    admissionDigest: sha256(admitted), modelConfigDigest: taskModel, checkerId: options.checker ?? 'frozen-independent-check', checkerDigest: sha256('checker'), contractDigest: sha256(`contract:${turn}`), inputsDigest: sha256(input),
    ...(options.requiredFailure ? { requiredCondition: options.condition ?? requiredCondition } : {}) }
  const finish = { kind: 'task-finished' as const, taskId, endSeq: startSeq + 8, status: 'completed' as const, assistantMessageIds: [`answer-${turn}`], resultDigest: sha256(`result:${turn}`), evidenceIds: [], files }
  const checked = { kind: 'task-external-check-finished' as const, taskId, preparationDigest: sha256(prepared), resultDigest: finish.resultDigest, fileResultDigest: sha256(files),
    status: state === 'pending' || state === undefined ? 'verified' as const : state, detail: 'Only the frozen check result.',
    ...(options.requiredFailure && state === 'rejected' ? { failedRequiredConditionDigest: sha256(options.condition ?? requiredCondition) } : {}) }
  const verdict = met ? 'met' as const : 'not-met' as const
  const reviewChecks = parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({ focus, verdict, category: met ? null : 'source-fidelity', explanation: 'Checked supplied API.', evidenceQuotes: ['pilot'], proof: proof(`review:${turn}:${focus}`),
    audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(`review-material:${turn}`), units: { 'answer-1': { firstClaim: { quote: 'pilot', kind: 'source-fact', status: met ? 'supported' : 'unsupported', sourceIds: ['request-1'], explanation: 'Frozen source.' }, additionalClaims: [] } } } })))
  store.recordConversationLearning(source); store.recordConversationLearning(admitted)
  if (state !== undefined) store.recordConversationLearning(prepared)
  store.recordConversationLearning({ kind: 'task-model-observed', taskId, headerSeq: startSeq + 2, modelConfigDigest: taskModel })
  store.recordConversationLearning({ kind: 'task-file-input-captured', taskId, ...input[0]!, callId: `read:${turn}`, callSeq: startSeq + 3 })
  store.recordConversationLearning(finish)
  if (state !== undefined && state !== 'pending') store.recordConversationLearning(checked)
  store.recordConversationLearning({ kind: 'task-reviewed', taskId, admissionDigest: sha256(admitted), resultDigest: finish.resultDigest,
    ...conversationReviewConsensus(reviewChecks), reviewChecks, unavailableReason: null })
  return { value: store.listConversationTasks().find(item => item.source.taskId === taskId)!, checked, input }
}
function seeded(state?: CheckState, met = true, clock?: () => string, checkedSources = false, sourceMet = true) {
  const directory = root(), ledger = new EvolutionLedger(directory, clock === undefined ? {} : { clock })
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [task(ledger, 1, checkedSources ? 'rejected' : undefined, checkedSources ? sourceMet : undefined, { requiredFailure: checkedSources, contentIdentity: checkedSources }).value,
    task(ledger, 2, checkedSources ? 'rejected' : undefined, checkedSources ? sourceMet : undefined, { requiredFailure: checkedSources, contentIdentity: checkedSources }).value,
    task(ledger, 3, state, met, { requiredFailure: checkedSources, contentIdentity: checkedSources }).value] as const
  const failureReference = (value: ConversationTask) => ({ taskId: value.source.taskId, preparationDigest: sha256(value.externalCheckPrepared),
    outcomeDigest: sha256(value.externalCheckFinished), requiredCondition: value.externalCheckPrepared!.requiredCondition!, detail: value.externalCheckFinished!.detail })
  const checkedFailureSources = checkedSources ? [failureReference(tasks[0]), failureReference(tasks[1])] as const : undefined
  const parentSnapshot = ledger.getConversationGuidance(scope)
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `Independent ${kind} code task.`, criteria: ['Preserve the supplied API.'], qualityContract: conversationQualityContract(), files: {
      schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: directory, outputKind: 'files' as const, entries: [{ path: 'task.ts', content: `export const ${kind} = 10` }], outputPaths: ['task.ts'] } }
    return { id: kind, kind, ...material, inputDigest: guidanceInputDigest(material.prompt, material.files), materialDigest: sha256(material) }
  }
  const body: GuidanceStudyBody = { scopeKey: scope, family: 'code', failureCategory: checkedSources ? 'instruction-following' : 'source-fidelity', consentRevision: 1, parentSnapshot, parentVersion: guidanceVersion(parentSnapshot),
    sourceTaskIds: [tasks[0].source.taskId, tasks[1].source.taskId], counterexampleTaskId: tasks[2].source.taskId, modelConfigDigest: model,
    qualityContract: conversationQualityContract(), evaluationMode: 'local-files', fileOutputKind: 'files', ...(checkedFailureSources === undefined ? {} : { checkedFailureSources }), cases: [
      ...(['source1', 'source2', 'counterexample'] as const).map((kind, index) => ({ id: kind, kind, sourceTaskId: tasks[index]!.source.taskId, inputDigest: sha256(`input:${index}`), materialDigest: sha256(`material:${index}`) })),
      generated('adjacent'), generated('holdout') ] }
  const attemptBody = { scopeKey: scope, consentRevision: 1, parentVersion: body.parentVersion, sourceTaskIds: body.sourceTaskIds, counterexampleTaskId: body.counterexampleTaskId, modelConfigDigest: model, materialDigest: sha256('design material'), ...(checkedFailureSources === undefined ? {} : { checkedFailureSources }) }
  return { directory, ledger, tasks, opened: { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }, attempt: { attemptId: caseDesignAttemptId(attemptBody), ...attemptBody } }
}
function serviceFor(f: ReturnType<typeof seeded>) {
  vi.spyOn(taskMaterial, 'recoverConversationTaskMaterial').mockImplementation(async (_ctx, value) => ({ request: [], context: [], objective: 'Repair the supplied code.', criteria: ['Preserve API.'], files: {
    schemaVersion: 'tianwen.conversation-file-material.v1', cwd: f.directory, outputKind: 'files', entries: value.fileInputs!.map(({ path, content }) => ({ path, content })), outputPaths: ['task.ts'] } }))
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: {
    getLearningAnalysisConsent: () => f.ledger.getLearningAnalysisConsent(), getConversationGuidance: () => f.ledger.getConversationGuidance(scope), listConversationTasks: () => f.ledger.listConversationTasks(),
    listConversationGuidanceStudies: () => f.ledger.listConversationGuidanceStudies(), listConversationCaseDesignAttempts: () => f.ledger.listConversationCaseDesignAttempts(),
    listConversationFeedbackAssessments: (id: string) => f.ledger.listConversationFeedbackAssessments(id),
    isConversationFeedbackAssessmentActive: (id: string) => f.ledger.isConversationFeedbackAssessmentActive(id),
    listLearningIntakeStatuses: (id: string) => f.ledger.listLearningIntakeStatuses(id),
  } } })
  return service
}
const readiness = (f: ReturnType<typeof seeded>) => serviceFor(f).readiness(scope)

it.each(['pending', 'rejected', 'unverifiable'] as const)('does not select model-met counterevidence with a %s prepared check', async state => {
  const f = seeded(state)
  expect(f.tasks[2].review?.verdict).toBe('met')
  expect(await readiness(f)).toEqual({ state: 'awaiting-counterexample' })
})
it('selects checked failure sources with unchanged model met only with the same configured verified counter', async () => {
  const f = seeded('verified', true, undefined, true)
  expect(f.tasks.map(value => value.review?.verdict)).toEqual(['met', 'met', 'met'])
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
})
it('persists and cold replays explicit checked failure source references without regrading original reviews', () => {
  const f = seeded('verified', true, undefined, true), before = f.ledger.listConversationTasks()
  expect(f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toEqual({ duplicate: false })
  expect(f.ledger.recordConversationGuidance(f.opened)).toEqual({ duplicate: false })
  const replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationCaseDesignAttempts()).toEqual([f.attempt])
  expect(replay.listConversationGuidanceStudies()[0]?.opened).toEqual(f.opened)
  expect(replay.listConversationTasks()).toEqual(before)
  expect(replay.isConversationGuidanceSupported(f.opened.studyId)).toBe(true)
  expect(replay.recordConversationGuidance(f.opened)).toEqual({ duplicate: true })
})
it('does not reinterpret absent-field legacy model-met records as checked failure sources', () => {
  const f = seeded('verified', true, undefined, true)
  const { kind: _kind, studyId: _id, checkedFailureSources: _references, ...body } = f.opened
  const opened = { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }
  expect(() => f.ledger.recordConversationGuidance(opened)).toThrow(/failed source reviews/)
  expect(f.ledger.listConversationGuidanceStudies()).toEqual([])
})
it.each([undefined, 'pending', 'rejected', 'unverifiable'] as const)('does not count checked failure sources without a configured verified counter: %s', async state => {
  const f = seeded(state, true, undefined, true)
  expect(await readiness(f)).toEqual({ state: 'awaiting-counterexample' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/checked failure|counterevidence/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow()
})
it.each(['preparationDigest', 'outcomeDigest', 'requiredCondition', 'detail'] as const)('rejects changed checked failure source %s without any durable study', field => {
  const f = seeded('verified', true, undefined, true)
  const { kind: _kind, studyId: _id, ...body } = f.opened
  const original = body.checkedFailureSources!
  const changed = { ...original[0], [field]: field.endsWith('Digest') ? sha256('changed') : 'Changed original evidence' }
  const changedBody = { ...body, checkedFailureSources: [changed, original[1]] as const }
  const before = readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')
  expect(() => f.ledger.recordConversationGuidance({ kind: 'study-opened', studyId: guidanceStudyId(changedBody), ...changedBody })).toThrow(/checked failure/)
  expect(readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')).toBe(before)
})
it.each(['checker', 'condition', 'duplicate-input', 'unmarked'] as const)('does not mix checked failure sources with %s', async scenario => {
  const f = seeded('verified', true, undefined, true)
  const other = task(f.ledger, 4, 'rejected', true, { requiredFailure: true, contentIdentity: scenario !== 'unmarked',
    ...(scenario === 'checker' ? { checker: 'another checker' } : {}), ...(scenario === 'condition' ? { condition: 'Another required condition.' } : {}),
    ...(scenario === 'duplicate-input' ? { inputTurn: 1 } : {}) }).value
  vi.spyOn(f.ledger, 'listConversationTasks').mockReturnValue([f.tasks[0], other, f.tasks[2]])
  expect(await readiness(f)).toEqual({ state: 'awaiting-compatible-sources' })
})
it.each(['source-positive', 'counter-negative'] as const)('honors actual durable %s feedback in new checked failure source selection and writes', async scenario => {
  const f = seeded('verified', true, undefined, true), target = f.tasks[scenario === 'source-positive' ? 0 : 2]
  f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId: target.completion!.assistantMessageIds[0]!,
    feedbackVersion: 'controlled-v1', rating: scenario === 'source-positive' ? 'positive' : 'negative', note: 'Controlled actual ledger feedback fixture.',
    scopeKey: target.source.scopeKey, sessionDigest: sha256('controlled feedback session'), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  expect(await readiness(f)).toEqual({ state: scenario === 'source-positive' ? 'awaiting-compatible-sources' : 'awaiting-counterexample' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/feedback/)
})
it.each(['source', 'counter'] as const)('waits for pending feedback before selecting checked failure sources: %s', async role => {
  const f = seeded('verified', true, undefined, true), target = f.tasks[role === 'source' ? 0 : 2], messageId = target.completion!.assistantMessageIds[0]!
  f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId, feedbackVersion: 'pending-v1',
    rating: role === 'source' ? 'negative' : 'positive', note: 'Controlled pending feedback fixture.', scopeKey: target.source.scopeKey,
    sessionDigest: sha256('pending feedback session'), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  const status = f.ledger.getLearningIntakeStatus(target.source.sessionId, messageId)!
  const source = { kind: 'native' as const, sessionId: target.source.sessionId, messageId, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint,
    feedbackVersion: 'pending-v1', feedbackFingerprint: status.feedbackFingerprint }
  f.ledger.recordConversationFeedback({ kind: 'feedback-assessment-started', taskId: target.source.taskId,
    assessmentId: conversationFeedbackAssessmentId({ taskId: target.source.taskId, source }), source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest, materialDigest: sha256('pending material'), consentRevision: 1 })
  expect(await readiness(f)).toEqual({ state: role === 'source' ? 'awaiting-compatible-sources' : 'awaiting-counterexample' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/feedback/)
})
it('preserves model not-met priority on direct checked failure source writes', () => {
  const f = seeded('verified', true, undefined, true, false)
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/review|priority/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/review|priority/)
})
it.each([true, false])('skips a counter with active empty preference and selects the next clean counter (checked sources %s)', async checkedSources => {
  const f = seeded('verified', true, undefined, checkedSources), target = f.tasks[2], messageId = target.completion!.assistantMessageIds[0]!
  f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId, feedbackVersion: 'preference-v1', rating: 'positive',
    note: 'A controlled preference without new evaluation standards.', scopeKey: target.source.scopeKey,
    sessionDigest: sha256('preference feedback session'), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  const status = f.ledger.getLearningIntakeStatus(target.source.sessionId, messageId)!
  const source = { kind: 'native' as const, sessionId: target.source.sessionId, messageId, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint,
    feedbackVersion: 'preference-v1', feedbackFingerprint: status.feedbackFingerprint }
  const assessmentId = conversationFeedbackAssessmentId({ taskId: target.source.taskId, source })
  f.ledger.recordConversationFeedback({ kind: 'feedback-assessment-started', taskId: target.source.taskId, assessmentId, source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest, materialDigest: sha256('preference material'), consentRevision: 1 })
  f.ledger.recordConversationFeedback({ kind: 'feedback-assessed', taskId: target.source.taskId, assessmentId, classification: 'preference', category: 'user-preference',
    supplementalCriteria: [], evidenceQuotes: ['controlled preference'], explanation: 'Controlled classification with no supplemental criteria.', proof: proof('preference-assessment'), unavailableReason: null })
  const before = readFileSync(join(f.directory, 'ledger.jsonl'))
  // The old study-open guard already refuses this exact counter. The new
  // initial/attempt guard must not consume the pair before that rejection.
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/feedback/)
  expect(await serviceFor(f).readiness(scope, true)).toMatchObject({ state: 'awaiting-counterexample', diagnostics: { successfulCandidates: 0 } })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(readFileSync(join(f.directory, 'ledger.jsonl'))).toEqual(before)
  vi.restoreAllMocks()
  const clean = task(f.ledger, 4, 'verified', true, { contentIdentity: true, requiredFailure: checkedSources }).value
  const service = serviceFor(f)
  Object.assign(service, { proposalClues: async () => [] })
  const selected = await (service as unknown as { select(scopeKey: string): Promise<{ counterexample: ConversationTask } | undefined> }).select(scope)
  expect(selected?.counterexample.source.taskId).toBe(clean.source.taskId)
  const { attemptId: _oldId, ...oldBody } = f.attempt
  const body = { ...oldBody, counterexampleTaskId: clean.source.taskId }
  expect(f.ledger.recordConversationCaseDesignAttempt({ ...body, attemptId: caseDesignAttemptId(body) })).toEqual({ duplicate: false })
})

function controlledCounterFeedback(f: ReturnType<typeof seeded>, classification: 'preference' | 'positive' | 'inconclusive' | 'requirement-change',
  options: { version?: string, supersedes?: string, oneOff?: boolean, unproven?: boolean } = {}) {
  const target = f.tasks[2], messageId = target.completion!.assistantMessageIds[0]!, feedbackVersion = options.version ?? 'counter-feedback-v1'
  f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId, feedbackVersion, rating: 'positive',
    note: 'Controlled counter-feedback consumer fixture; not real user feedback.', scopeKey: scope,
    sessionDigest: sha256(feedbackVersion), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1,
    ...(options.supersedes === undefined ? {} : { supersedesFeedbackVersion: options.supersedes }) })
  const status = f.ledger.getLearningIntakeStatus(target.source.sessionId, messageId)!
  const source = { kind: 'native' as const, sessionId: target.source.sessionId, messageId, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint,
    feedbackVersion, feedbackFingerprint: status.feedbackFingerprint }
  const assessmentId = conversationFeedbackAssessmentId({ taskId: target.source.taskId, source })
  f.ledger.recordConversationFeedback({ kind: 'feedback-assessment-started', taskId: target.source.taskId, assessmentId, source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest, materialDigest: sha256('counter material'), consentRevision: 1 })
  f.ledger.recordConversationFeedback({ kind: 'feedback-assessed', taskId: target.source.taskId, assessmentId, classification,
    category: classification === 'preference' ? 'user-preference' : null,
    supplementalCriteria: options.oneOff ? ['Add a title to the next reply.'] : [], evidenceQuotes: ['Controlled feedback'],
    explanation: 'Controlled feedback consumer classification.', proof: options.unproven ? null : proof('assessment:' + feedbackVersion),
    unavailableReason: options.unproven ? 'invalid-judgment' : null,
    ...(options.oneOff ? { scopeReview: { decisions: [{ criterion: 'Add a title to the next reply.', scope: 'one-off' as const,
      evidenceQuote: 'Controlled feedback' }], proof: proof('scope:' + feedbackVersion) } } : {}) })
  return assessmentId
}

it('does not spend a design pair on a one-off preference that the original study-open already rejects', async () => {
  const f = seeded('verified')
  controlledCounterFeedback(f, 'preference', { oneOff: true })
  const before = readFileSync(join(f.directory, 'ledger.jsonl'))
  expect(await readiness(f)).toEqual({ state: 'awaiting-counterexample' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/feedback/)
  expect(readFileSync(join(f.directory, 'ledger.jsonl'))).toEqual(before)
})

it.each(['positive', 'inactive'])('keeps a clean counter after a later %s feedback revision', async resolution => {
  const f = seeded('verified'), old = controlledCounterFeedback(f, 'preference')
  expect(await readiness(f)).toEqual({ state: 'awaiting-counterexample' })
  if (resolution === 'positive') controlledCounterFeedback(f, 'positive', { version: 'counter-feedback-v2', supersedes: 'counter-feedback-v1' })
  else {
    const target = f.tasks[2]
    f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId: target.completion!.assistantMessageIds[0]!,
      feedbackVersion: 'counter-feedback-v2', rating: 'positive', note: 'Controlled replacement without an assessment.', scopeKey: scope,
      sessionDigest: sha256('replacement'), evidenceIds: [target.completion!.resultDigest] },
      sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1, supersedesFeedbackVersion: 'counter-feedback-v1' })
  }
  expect(f.ledger.isConversationFeedbackAssessmentActive(old)).toBe(false)
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
  expect(f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toEqual({ duplicate: false })
})

it.each(['inconclusive', 'requirement-change', 'unproven'] as const)('preserves the original counter rule for %s feedback', async classification => {
  const f = seeded('verified')
  controlledCounterFeedback(f, classification === 'unproven' ? 'inconclusive' : classification, { unproven: classification === 'unproven' })
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
  expect(f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toEqual({ duplicate: false })
})

it('rejects feedback arriving after initial selection before persisting the design attempt', async () => {
  const f = seeded('verified')
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
  controlledCounterFeedback(f, 'preference')
  const before = readFileSync(join(f.directory, 'ledger.jsonl'))
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(readFileSync(join(f.directory, 'ledger.jsonl'))).toEqual(before)
})

it('preserves a historical ordinary attempt accepted before the new early feedback gate', () => {
  const f = seeded('verified')
  controlledCounterFeedback(f, 'preference')
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  const path = join(f.directory, 'ledger.jsonl')
  appendFileSync(path, canonicalJson({ type: 'conversation-case-design-attempted', schemaVersion: 'tianwen.conversation-case-design-attempt.v1',
    at: '2026-10-03T00:00:00.000Z', attempt: f.attempt }) + '\n')
  const before = readFileSync(path), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationCaseDesignAttempts(scope)).toEqual([f.attempt])
  expect(readFileSync(path)).toEqual(before)
  expect(replay.recordConversationCaseDesignAttempt(f.attempt)).toEqual({ duplicate: true })
})

it('does not spend a new ordinary design pair on the original counter native-negative veto', () => {
  const f = seeded('verified'), target = f.tasks[2]
  f.ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId: target.completion!.assistantMessageIds[0]!,
    feedbackVersion: 'negative-v1', rating: 'negative', note: 'Controlled original veto fixture.', scopeKey: scope,
    sessionDigest: sha256('negative'), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  const before = readFileSync(join(f.directory, 'ledger.jsonl'))
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/feedback/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/feedback/)
  expect(readFileSync(join(f.directory, 'ledger.jsonl'))).toEqual(before)
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
// Controlled complete records test negative-result consumption, not natural efficacy.
function checkedRegressionScene(checkedSources = false, activate = true) {
  let tick = 0
  const f = seeded(checkedSources ? 'verified' : undefined, true, () => new Date(Date.UTC(2026, 9, 1) + tick++ * 1000).toISOString(), checkedSources), ledger = f.ledger
  ledger.recordConversationGuidance(f.opened)
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
  expect(decision.verdict).toBe('accepted'); ledger.recordConversationGuidance(decision)
  if (activate) ledger.recordConversationGuidance({ kind: 'guidance-activated', studyId: f.opened.studyId, expectedParentVersion: f.opened.parentVersion, decisionDigest: sha256(decision) })
  const later = (turn: number, state?: CheckState, met = true, options: Parameters<typeof task>[4] = {}) => task(ledger, turn, state, met, { contentIdentity: true, requiredFailure: state !== undefined, ...options })
  const rollback = (values: readonly ConversationTask[], tagged = true) => ({ kind: 'guidance-rolled-back' as const, studyId: f.opened.studyId,
    expectedCurrentVersion: guidanceVersion(candidate.candidateSnapshot), reason: 'regression' as const, evidenceTaskIds: values.map(value => value.source.taskId), evidenceInputPolicy: 'request-content.v1' as const,
    ...(tagged ? { evidenceFailurePolicy: 'model-or-code-check.v1' as const } : {}) })
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: ledger } })
  const reconcile = () => (service as unknown as { rollbackIfNeeded(scopeKey: string): void }).rollbackIfNeeded(scope)
  return { ...f, candidate, later, rollback, service, reconcile }
}
it('automatically rolls back two checked rejections while preserving model met and cold receipts', () => {
  const f = checkedRegressionScene(), values = [f.later(4, 'rejected').value, f.later(5, 'rejected').value]
  f.reconcile()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(values))
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  const before = readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8'), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(values))
  for (const value of values) expect(replay.listConversationTasks().find(task => task.source.taskId === value.source.taskId)).toEqual(value)
  expect(values.map(task => task.review?.verdict)).toEqual(['met', 'met'])
  expect(replay.recordConversationGuidance(f.rollback(values))).toEqual({ duplicate: true })
  expect(readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')).toBe(before)
})
it('accepts direct tagged checked regression and mixes original model failure with a checked rejection', () => {
  const f = checkedRegressionScene(), values = [f.later(4, undefined, false).value, f.later(5, 'rejected').value]
  expect(() => f.ledger.recordConversationGuidance(f.rollback(values))).not.toThrow()
  expect(new EvolutionLedger(f.directory).listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(values))
})
it.each([undefined, 'pending', 'verified', 'unverifiable'] as const)('does not turn %s check state into a second regression', state => {
  const f = checkedRegressionScene(), first = f.later(4, 'rejected').value, second = f.later(5, state).value
  f.reconcile(); expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  expect(() => f.ledger.recordConversationGuidance(f.rollback([first, second]))).toThrow()
})
it.each(['one', 'same-input', 'wrong-model'] as const)('preserves %s boundaries for checked regression', scenario => {
  const f = checkedRegressionScene(), first = f.later(4, 'rejected').value
  const values = scenario === 'one' ? [first] : [first, f.later(5, 'rejected', true, scenario === 'same-input' ? { inputTurn: 4 } : { model: sha256('other model') }).value]
  f.reconcile(); expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  expect(() => f.ledger.recordConversationGuidance(f.rollback(values))).toThrow()
})
it('keeps untagged checked-only regression invalid while legacy model failures replay unchanged', () => {
  const f = checkedRegressionScene(), values = [f.later(4, 'rejected').value, f.later(5, 'rejected').value]
  expect(() => f.ledger.recordConversationGuidance(f.rollback(values, false))).toThrow(/failed tasks/)
  const models = [f.later(6, undefined, false).value, f.later(7, 'verified', false).value], legacy = f.rollback(models, false)
  f.ledger.recordConversationGuidance(legacy)
  const before = readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8'), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(legacy)
  expect(replay.recordConversationGuidance(legacy)).toEqual({ duplicate: true })
  expect(readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')).toBe(before)
})
it('consumes a late checked rejection offline without resuming an Agent or redoing research', async () => {
  const f = checkedRegressionScene(), first = f.later(4, 'rejected').value, pending = f.later(5, 'pending')
  Object.assign(f.service, { accepting: true, persistedWakes: new Map(), persistedWakeDirty: new Set(), ctx: { tianwenEvolution: f.ledger, agents: { get: () => undefined } } })
  const select = vi.spyOn(f.service as unknown as { select(scopeKey: string): Promise<undefined> }, 'select').mockResolvedValue(undefined)
  f.reconcile(); expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  const checked = { ...pending.checked, status: 'rejected' as const, failedRequiredConditionDigest: sha256(requiredCondition) }; f.ledger.recordConversationLearning(checked)
  const second = f.ledger.listConversationTasks().find(task => task.source.taskId === pending.value.source.taskId)!
  await (f.service as unknown as { wakeTask(task: ConversationTask): Promise<void> }).wakeTask(second)
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback([first, second]))
  expect(select).toHaveBeenCalledOnce()
})
it.each(['unknown', 'wrong-reason', 'legacy-input-policy', 'explicit-undefined'] as const)('rejects %s checked regression failure policy', scenario => {
  const f = checkedRegressionScene(), record = f.rollback([f.later(4, 'rejected').value, f.later(5, 'rejected').value])
  const changed = scenario === 'unknown' ? { ...record, evidenceFailurePolicy: 'unknown' } : scenario === 'wrong-reason' ? { ...record, reason: 'support-retracted' } : scenario === 'legacy-input-policy' ? { ...record, evidenceInputPolicy: 'captured-files.v1' } : { ...record, evidenceFailurePolicy: undefined }
  expect(() => parseConversationGuidanceRecord(changed)).toThrow()
})
it('rolls back offline original model failures before looking for new research', async () => {
  const f = checkedRegressionScene(), values = [f.later(4, undefined, false).value, f.later(5, undefined, false).value]
  Object.assign(f.service, { accepting: true, persistedWakes: new Map(), persistedWakeDirty: new Set(), ctx: { tianwenEvolution: f.ledger, agents: { get: () => undefined } } })
  vi.spyOn(f.service as unknown as { select(scopeKey: string): Promise<undefined> }, 'select').mockResolvedValue(undefined)
  await (f.service as unknown as { wakeTask(task: ConversationTask): Promise<void> }).wakeTask(values[1]!)
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(values, false))
})
it('keeps unqualified old rejected checks diagnostic even with a new failure policy', () => {
  const f = checkedRegressionScene(), values = [f.later(4, 'rejected', true, { requiredFailure: false }).value, f.later(5, 'rejected', true, { requiredFailure: false }).value]
  f.reconcile(); expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  expect(() => f.ledger.recordConversationGuidance(f.rollback(values))).toThrow()
})
it.each(['wrong-digest', 'not-rejected', 'unqualified'] as const)('rejects %s required-condition evidence before it can count as regression', scenario => {
  const f = checkedRegressionScene(), pending = f.later(4, 'pending', true, { requiredFailure: scenario !== 'unqualified' })
  const changed = { ...pending.checked, status: scenario === 'not-rejected' ? 'verified' as const : 'rejected' as const,
    failedRequiredConditionDigest: sha256(scenario === 'wrong-digest' ? 'different condition' : requiredCondition) }
  const before = readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')
  expect(() => f.ledger.recordConversationLearning(changed)).toThrow()
  expect(readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')).toBe(before)
})
it('does not mutate stopped offline learning and preserves promise rejection on rollback failure', async () => {
  const f = checkedRegressionScene(), values = [f.later(4, undefined, false).value, f.later(5, undefined, false).value]
  Object.assign(f.service, { accepting: false, ctx: { tianwenEvolution: f.ledger } })
  const wake = () => (f.service as unknown as { wakeTask(task: ConversationTask): Promise<void> }).wakeTask(values[1]!)
  await expect(wake()).resolves.toBeUndefined()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  Object.assign(f.service, { accepting: true })
  vi.spyOn(f.ledger, 'retireIncompatibleConversationGuidance').mockImplementation(() => { throw new Error('ledger failure') })
  await expect(wake()).rejects.toThrow('ledger failure')
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
      retireIncompatibleConversationGuidance: () => f.ledger.retireIncompatibleConversationGuidance(scope),
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

function invalidation(value: ConversationTask) {
  return { kind: 'task-external-check-invalidated' as const, taskId: value.source.taskId,
    preparationDigest: sha256(value.externalCheckPrepared ?? null), outcomeDigest: sha256(value.externalCheckFinished ?? null),
    detail: 'Host audit found that this check does not establish its claimed required condition.' }
}
it.each([0, 1, 2] as const)('withdraws only check %s from learning without rewriting original task history', async index => {
  const f = seeded('verified', true, undefined, true), original = f.tasks[index], record = invalidation(original)
  const path = join(f.directory, 'ledger.jsonl'), prefix = readFileSync(path)
  expect(f.ledger.recordConversationLearning(record)).toEqual({ duplicate: false })
  const current = f.ledger.listConversationTasks().find(task => task.source.taskId === original.source.taskId)!
  expect(current).toEqual({ ...original, externalCheckInvalidated: record })
  expect(hasRejectedConversationCodeCheck(current)).toBe(false)
  expect(hasSatisfiedConversationCodeCheck(current)).toBe(false)
  expect(conversationCheckedFailureSource(current)).toBeUndefined()
  expect(await readiness(f)).toEqual({ state: index === 2 ? 'awaiting-counterexample' : 'awaiting-compatible-sources' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/check|counter|source/i)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/check|counter|source/i)
  expect(readFileSync(path).subarray(0, prefix.length)).toEqual(prefix)
  const after = readFileSync(path), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationTasks()).toEqual(f.ledger.listConversationTasks())
  expect(replay.recordConversationLearning(record)).toEqual({ duplicate: true })
  expect(() => replay.recordConversationLearning({ ...record, detail: 'Different withdrawal' })).toThrow(/changed|freeze/)
  expect(readFileSync(path)).toEqual(after)
})
it.each(['taskId', 'preparationDigest', 'outcomeDigest'] as const)('rejects an invalid withdrawal binding: %s', field => {
  const f = seeded('verified', true, undefined, true), record = invalidation(f.tasks[0]), path = join(f.directory, 'ledger.jsonl'), before = readFileSync(path)
  expect(() => f.ledger.recordConversationLearning({ ...record, [field]: field === 'taskId' ? f.tasks[2].source.taskId : sha256('wrong') })).toThrow(/check|withdraw|invalidat/i)
  expect(readFileSync(path)).toEqual(before)
})
it('refuses to withdraw a missing or pending check', () => {
  const f = seeded('pending'), path = join(f.directory, 'ledger.jsonl'), before = readFileSync(path)
  expect(() => f.ledger.recordConversationLearning(invalidation(f.tasks[2]))).toThrow(/check|withdraw|invalidat/i)
  expect(() => f.ledger.recordConversationLearning(invalidation(f.tasks[0]))).toThrow(/check|withdraw|invalidat/i)
  expect(readFileSync(path)).toEqual(before)
})
it('preserves independent model failure support when its check is withdrawn', async () => {
  const f = seeded('verified', true), first = task(f.ledger, 4, 'rejected', false).value
  f.ledger.recordConversationLearning(invalidation(first))
  const current = f.ledger.listConversationTasks().find(value => value.source.taskId === first.source.taskId)!
  expect(current.review).toEqual(first.review)
  vi.spyOn(f.ledger, 'listConversationTasks').mockReturnValue([current, f.tasks[1], f.tasks[2]])
  expect(await readiness(f)).toEqual({ state: 'ready-to-schedule' })
})
it.each([0, 2] as const)('withdrawal of active study check %s rolls back through existing support governance', index => {
  const f = checkedRegressionScene(true), originalStudy = f.ledger.listConversationGuidanceStudies()[0]!, record = invalidation(f.tasks[index])
  f.ledger.recordConversationLearning(record)
  const study = f.ledger.listConversationGuidanceStudies()[0]!
  expect(f.ledger.isConversationGuidanceSupported(f.opened.studyId)).toBe(false)
  expect(study.rollback).toMatchObject({ kind: 'guidance-rolled-back', reason: 'support-retracted', evidenceTaskIds: [] })
  expect({ ...study, rollback: undefined, rolledBackAt: undefined }).toEqual({ ...originalStudy, rollback: undefined, rolledBackAt: undefined })
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  const path = join(f.directory, 'ledger.jsonl'), before = readFileSync(path), replay = new EvolutionLedger(f.directory)
  expect(replay.listConversationGuidanceStudies()).toEqual([study])
  expect(replay.recordConversationLearning(record)).toEqual({ duplicate: true })
  expect(readFileSync(path)).toEqual(before)
})
it('withdraws after consent is disabled without granting learning or changing the original verdict', () => {
  const f = seeded('verified', true, undefined, true)
  f.ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
  f.ledger.recordConversationLearning(invalidation(f.tasks[0]))
  const replay = new EvolutionLedger(f.directory)
  expect(replay.getLearningAnalysisConsent()?.enabled).toBe(false)
  expect(conversationCheckedFailureSource(replay.listConversationTasks()[0])).toBeUndefined()
  expect(replay.listConversationTasks()[0]?.review).toEqual(f.tasks[0].review)
})
it('does not count a withdrawn check as a later regression', () => {
  const f = checkedRegressionScene(), first = f.later(4, 'rejected').value, second = f.later(5, 'rejected').value
  f.ledger.recordConversationLearning(invalidation(second)); f.reconcile()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  expect(() => f.ledger.recordConversationGuidance(f.rollback([first, second]))).toThrow(/regression|failed/i)
})
it('withdrawn supporting evidence prevents adopting an already accepted study', () => {
  const f = checkedRegressionScene(true, false), path = join(f.directory, 'ledger.jsonl')
  const replay = new EvolutionLedger(f.directory)
  replay.recordConversationLearning(invalidation(f.tasks[0]))
  const before = readFileSync(path)
  expect(() => replay.recordConversationGuidance({ kind: 'guidance-activated', studyId: f.opened.studyId, expectedParentVersion: f.opened.parentVersion,
    decisionDigest: sha256(replay.listConversationGuidanceStudies()[0]!.decision) })).toThrow(/source|check/i)
  expect(readFileSync(path)).toEqual(before)
  expect(replay.listConversationGuidanceStudies()[0]?.activation).toBeUndefined()
})
it('cold recovery completes an interrupted withdrawal rollback without repeating the notification', () => {
  const f = checkedRegressionScene(true), record = invalidation(f.tasks[0])
  const interrupted = vi.spyOn(f.ledger, 'retireIncompatibleConversationGuidance').mockImplementationOnce(() => { throw new Error('simulated interruption after durable withdrawal') })
  expect(() => f.ledger.recordConversationLearning(record)).toThrow('simulated interruption')
  interrupted.mockRestore()
  const path = join(f.directory, 'ledger.jsonl'), prefix = readFileSync(path), replay = new EvolutionLedger(f.directory)
  expect(replay.isConversationGuidanceSupported(f.opened.studyId)).toBe(false)
  expect(replay.recordConversationLearning(record)).toEqual({ duplicate: true })
  expect(replay.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  expect(readFileSync(path).subarray(0, prefix.length)).toEqual(prefix)
  expect(readFileSync(path, 'utf8').split('\n').filter(line => line.includes('task-external-check-invalidated'))).toHaveLength(1)
})
