import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent, type ArtifactId } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationTaskId, type ConversationTask, type ConversationTaskAdmission } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import {
  baselineGuidanceSnapshot, guidanceInputDigest, guidanceStudyId, guidanceVersion,
  type GuidanceStudyBody, type GuidanceStudyOpened, type GuidanceCandidateRecord, type GuidanceArmRecord,
} from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { conversationFeedbackAssessmentId, type ConversationFeedbackSource, type ConversationFeedbackStarted } from '../../packages/tianwen-evolution/src/conversation-feedback.js'

const roots: string[] = []
const scope = 'workspace:guidance-ledger'
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function ledgerRoot() {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'guidance-ledger-')); roots.push(root)
  return root
}

// Synthetic native receipts exercise real ledger gates and disk replay; no model is run here.
function task(ledger: EvolutionLedger, turn: number, verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', scopeKey = scope, request = `pilot request ${turn}`, models = [sha256('scripted ledger model configuration')]): ConversationTask {
  const identity = { sessionId: 'ordinary-guidance', sessionLifecycleFingerprint: sha256('ordinary-guidance-lifecycle'), turn }
  const taskId = conversationTaskId(identity)
  const source = { kind: 'task-started' as const, taskId, ...identity, startSeq: turn * 10,
    userMessageIds: [`request-${turn}`], requestDigest: sha256(request), contextDigest: sha256([]),
    scopeKey, consentRevision: 1, behaviorVersion: guidanceVersion(ledger.getConversationGuidance(scopeKey)) }
  const admission: ConversationTaskAdmission = { kind: 'task-admitted', taskId, proof: proof(`admission:${turn}`), unavailableReason: null,
    decision: { kind: 'task', objective: 'Summarize the supplied pilot result.', criteria: ['Preserve the supplied duration.'],
      family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null } }
  const resultDigest = sha256(`answer ${turn}`)
  ledger.recordConversationLearning(source)
  ledger.recordConversationLearning(admission)
  for (const [index, modelConfigDigest] of models.entries()) ledger.recordConversationLearning({ kind: 'task-model-observed', taskId, headerSeq: turn * 10 + index, modelConfigDigest })
  ledger.recordConversationLearning({ kind: 'task-finished', taskId, endSeq: turn * 10 + 8, status: 'completed',
    assistantMessageIds: [`answer-${turn}`], resultDigest, evidenceIds: [] })
  ledger.recordConversationLearning({ kind: 'task-reviewed', taskId, admissionDigest: sha256(admission), resultDigest,
    verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: 'Original review against frozen duration criteria.',
    evidenceQuotes: verdict === 'not-met' ? ['pilot'] : [], proof: proof(`review:${turn}`), unavailableReason: null })
  return ledger.listConversationTasks().find(item => item.source.taskId === taskId)!
}

function seeded(verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', secondScope = scope, repeatRequest = false, secondModels = [sha256('scripted ledger model configuration')]) {
  const root = ledgerRoot()
  const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [task(ledger, 1, verdict), task(ledger, 2, verdict, secondScope, repeatRequest ? 'pilot request 1' : 'pilot request 2', secondModels), task(ledger, 3, 'met')] as const
  return { root, ledger, tasks }
}

function opening(tasks: readonly [ConversationTask, ConversationTask, ConversationTask], label = 'first', assessments: readonly (string | undefined)[] = []): GuidanceStudyOpened {
  const parentSnapshot = baselineGuidanceSnapshot(scope)
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `${label}: ${kind} pilot source`, criteria: ['Preserve the pilot-only qualification.'] }
    return { id: `${label}:${kind}`, kind, ...material, inputDigest: guidanceInputDigest(material.prompt), materialDigest: sha256(material) }
  }
  const body: GuidanceStudyBody = {
    scopeKey: scope, family: 'summarization', failureCategory: 'source-fidelity', consentRevision: 1,
    parentSnapshot, parentVersion: guidanceVersion(parentSnapshot), modelConfigDigest: sha256('scripted ledger model configuration'),
    sourceTaskIds: [tasks[0].source.taskId, tasks[1].source.taskId], counterexampleTaskId: tasks[2].source.taskId,
    cases: [
      ...(['source1', 'source2', 'counterexample'] as const).map((kind, index) => ({ id: `${label}:${kind}`, kind,
        inputDigest: guidanceInputDigest(`pilot request ${index + 1}`),
        sourceTaskId: tasks[index]!.source.taskId, materialDigest: sha256({ requestDigest: tasks[index]!.source.requestDigest, criteria: tasks[index]!.admission!.decision!.criteria }),
        ...(assessments[index] === undefined ? {} : { feedbackAssessmentId: assessments[index] }),
      })),
      generated('adjacent'), generated('holdout'),
    ],
  }
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}

function proposed(ledger: EvolutionLedger, opened: GuidanceStudyOpened) {
  ledger.recordConversationGuidance(opened)
  const candidate: GuidanceCandidateRecord = { kind: 'candidate-recorded', studyId: opened.studyId,
    candidateSnapshot: { ...opened.parentSnapshot, rules: { summarization: `Preserve the pilot qualification for ${opened.cases[0]!.id}.` } },
    proposalProof: proof(`${opened.studyId}:proposal`) }
  ledger.recordConversationGuidance(candidate)
  const arms: GuidanceArmRecord[] = opened.cases.flatMap(item => (['baseline', 'candidate'] as const).map(role => ({
    kind: 'arm-recorded', studyId: opened.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
    behaviorVersion: guidanceVersion(role === 'baseline' ? opened.parentSnapshot : candidate.candidateSnapshot),
    executionProof: proof(`${opened.studyId}:${item.id}:${role}:execute`), judgeProof: proof(`${opened.studyId}:${item.id}:${role}:judge`),
    outputDigest: sha256(`${item.id}:${role}:actual output`), verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met',
  })))
  return { opened, candidate, arms }
}

function evaluated(ledger: EvolutionLedger, opened: GuidanceStudyOpened) {
  const value = proposed(ledger, opened)
  for (const arm of value.arms) ledger.recordConversationGuidance(arm)
  const decision = ledger.conversationGuidanceDecision(opened.studyId)
  ledger.recordConversationGuidance(decision)
  return { ...value, decision }
}

function activation(value: ReturnType<typeof evaluated>) {
  return { kind: 'guidance-activated' as const, studyId: value.opened.studyId, expectedParentVersion: value.opened.parentVersion, decisionDigest: sha256(value.decision) }
}

function nativeFeedback(ledger: EvolutionLedger, target: ConversationTask) {
  const messageId = target.completion!.assistantMessageIds[0]!
  ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId, feedbackVersion: 'feedback-v1',
    rating: 'negative', note: 'You omitted the pilot-only qualification.', scopeKey: target.source.scopeKey,
    sessionDigest: sha256(`feedback session:${target.source.taskId}`), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  const status = ledger.getLearningIntakeStatus(target.source.sessionId, messageId)!
  const source: ConversationFeedbackSource = { kind: 'native', sessionId: target.source.sessionId, messageId,
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, feedbackVersion: 'feedback-v1', feedbackFingerprint: status.feedbackFingerprint }
  return assess(ledger, target, source)
}

function assess(ledger: EvolutionLedger, target: ConversationTask, source: ConversationFeedbackSource) {
  const started: ConversationFeedbackStarted = { kind: 'feedback-assessment-started', taskId: target.source.taskId,
    assessmentId: conversationFeedbackAssessmentId({ taskId: target.source.taskId, source }), source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest,
    materialDigest: sha256({ taskId: target.source.taskId, source }), consentRevision: 1 }
  ledger.recordConversationFeedback(started)
  const result = { kind: 'feedback-assessed' as const, assessmentId: started.assessmentId, taskId: target.source.taskId,
    classification: 'attributable-problem' as const, category: 'source-fidelity' as const,
    supplementalCriteria: ['Preserve the pilot-only qualification.'], evidenceQuotes: ['pilot-only'],
    explanation: 'The later direct user feedback identifies omitted source scope.', proof: proof(`${started.assessmentId}:judge`), unavailableReason: null }
  ledger.recordConversationFeedback(result)
  return { started, result }
}

function retract(ledger: EvolutionLedger, assessment: ReturnType<typeof nativeFeedback>) {
  const source = assessment.started.source
  if (source.kind !== 'native') throw new Error('test requires a native feedback source')
  return ledger.recordLearningFeedbackRetraction({ sessionId: source.sessionId, messageId: source.messageId,
    retractedFeedbackVersion: source.feedbackVersion, sessionLifecycleFingerprint: source.sessionLifecycleFingerprint })
}

it('requires ten arms, activates their exact evaluation, and replays a data artifact without changing the plugin Champion', () => {
  const { root, ledger, tasks } = seeded()
  const value = proposed(ledger, opening(tasks))
  for (const arm of value.arms.slice(0, 9)) ledger.recordConversationGuidance(arm)
  expect(() => ledger.conversationGuidanceDecision(value.opened.studyId)).toThrow(/ten|complete|arms/i)
  expect(ledger.getConversationGuidance(scope).rules).toEqual({})
  ledger.recordConversationGuidance(value.arms[9]!)
  const decision = ledger.conversationGuidanceDecision(value.opened.studyId)
  expect(decision.verdict).toBe('accepted')
  expect(() => ledger.recordConversationGuidance({ ...decision, armsDigest: sha256('unrelated arm receipts') })).toThrow(/digest|receipt|decision/i)
  ledger.recordConversationGuidance(decision)
  const artifactId = `artifact:${guidanceVersion(value.candidate.candidateSnapshot).slice(7)}` as ArtifactId
  expect(ledger.listEvents().filter(event => event.type === 'evaluation-recorded').map(event => event.evaluation))
    .toEqual([{ artifactId, receiptDigest: sha256(decision), verdict: 'met' }])
  const activated = activation({ ...value, decision })
  ledger.recordConversationGuidance(activated)
  expect(ledger.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
  expect(ledger.getConversationGuidance('workspace:unrelated').rules).toEqual({})
  expect(JSON.parse(ledger.readSource(artifactId))).toEqual(value.candidate.candidateSnapshot)
  expect(ledger.getChampion()).toBeUndefined()
  expect(() => ledger.promote(artifactId)).toThrow(/approval/i)
  expect(new Set(ledger.listEvents().filter(isPublicLedgerEvent).map(event => event.type))).toEqual(new Set(['artifact-recorded', 'evaluation-recorded']))
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(ledger.listConversationGuidanceStudies())
  expect(replay.listConversationTasks()).toEqual(tasks)
  expect(replay.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
  const count = replay.listEvents().length
  expect(replay.recordConversationGuidance(activated)).toEqual({ duplicate: true })
  expect(replay.recordConversationGuidance(decision)).toEqual({ duplicate: true })
  expect(replay.listEvents()).toHaveLength(count)
  expect(replay.getChampion()).toBeUndefined()
  expect(replay.listRunSkillUses()).toEqual([])
})

it('cannot activate a decided study until its missing exact shared evaluation receipt is repaired after replay', () => {
  const { root, ledger, tasks } = seeded()
  const value = proposed(ledger, opening(tasks))
  for (const arm of value.arms) ledger.recordConversationGuidance(arm)
  const decision = ledger.conversationGuidanceDecision(value.opened.studyId)
  const fault = vi.spyOn(ledger, 'recordEvaluation').mockImplementationOnce(() => { throw new Error('simulated evaluation receipt append failure') })
  expect(() => ledger.recordConversationGuidance(decision)).toThrow('simulated evaluation receipt append failure')
  fault.mockRestore()
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()[0]?.decision).toEqual(decision)
  const activated = activation({ ...value, decision })
  expect(() => replay.recordConversationGuidance(activated)).toThrow(/exact shared evaluation/i)
  const artifactId = `artifact:${guidanceVersion(value.candidate.candidateSnapshot).slice(7)}` as ArtifactId
  replay.recordEvaluation({ artifactId, receiptDigest: sha256('another accepted study'), verdict: 'met' })
  expect(() => replay.recordConversationGuidance(activated)).toThrow(/exact shared evaluation/i)
  expect(replay.getConversationGuidance(scope).rules).toEqual({})
  expect(replay.recordConversationGuidance(decision)).toEqual({ duplicate: true })
  replay.recordConversationGuidance(activated)
  expect(new EvolutionLedger(root).getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
})

it('rejects both opening and activation under a stale consent revision even when v3 remains enabled', () => {
  const { ledger, tasks } = seeded()
  const value = evaluated(ledger, opening(tasks))
  ledger.recordLearningAnalysisConsent({ revision: 2, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  expect(() => ledger.recordConversationGuidance(opening(tasks, 'late'))).toThrow(/current v3 consent/i)
  expect(() => ledger.recordConversationGuidance(activation(value))).toThrow(/current v3 consent/i)
  expect(ledger.getConversationGuidance(scope).rules).toEqual({})
})

it('rejects otherwise valid support borrowed from another workspace scope', () => {
  const { ledger, tasks } = seeded('not-met', 'workspace:other')
  expect(() => ledger.recordConversationGuidance(opening(tasks))).toThrow(/compatible task support/i)
  expect(ledger.listConversationGuidanceStudies()).toEqual([])
})

it('rejects a stale parent after a competing study activates without replacing its current guidance', () => {
  const { ledger, tasks } = seeded()
  const first = evaluated(ledger, opening(tasks, 'first'))
  const stale = evaluated(ledger, opening(tasks, 'stale'))
  ledger.recordConversationGuidance(activation(first))
  expect(() => ledger.recordConversationGuidance(activation(stale))).toThrow(/stale.*parent|current parent/i)
  expect(() => ledger.recordConversationGuidance(opening(tasks, 'later'))).toThrow(/parent.*current/i)
  expect(ledger.getConversationGuidance(scope)).toEqual(first.candidate.candidateSnapshot)
})

it('rejects met or inconclusive sources without supplemental evidence, missing support, and repeated identical requests', () => {
  for (const verdict of ['met', 'inconclusive'] as const) {
    const { ledger, tasks } = seeded(verdict)
    expect(() => ledger.recordConversationGuidance(opening(tasks))).toThrow(/failed source reviews/i)
  }
  const absent = seeded()
  const missing = { ...absent.tasks[0], source: { ...absent.tasks[0].source, taskId: 'absent-source-task' } }
  expect(() => absent.ledger.recordConversationGuidance(opening([missing, absent.tasks[1], absent.tasks[2]]))).toThrow(/compatible task support/i)
  const repeated = seeded('not-met', scope, true)
  expect(() => repeated.ledger.recordConversationGuidance(opening(repeated.tasks))).toThrow(/distinct requests/i)
})

it('keeps original met reviews immutable while supplemental feedback supports activation and real retraction permits rollback', () => {
  const { root, ledger, tasks } = seeded('met')
  const original = structuredClone(tasks)
  const assessments = [nativeFeedback(ledger, tasks[0]), nativeFeedback(ledger, tasks[1])]
  const value = evaluated(ledger, opening(tasks, 'feedback', assessments.map(item => item.started.assessmentId)))
  ledger.recordConversationGuidance(activation(value))
  expect(ledger.listConversationTasks()).toEqual(original)
  expect(ledger.listConversationFeedbackAssessments().map(item => item.result?.supplementalCriteria)).toEqual([
    ['Preserve the pilot-only qualification.'], ['Preserve the pilot-only qualification.'],
  ])
  const rollback = { kind: 'guidance-rolled-back' as const, studyId: value.opened.studyId,
    expectedCurrentVersion: guidanceVersion(value.candidate.candidateSnapshot), reason: 'support-retracted' as const, evidenceTaskIds: [] }
  expect(() => ledger.recordConversationGuidance(rollback)).toThrow(/actually invalidated/i)
  const retracted = assessments[0]!
  retract(ledger, retracted)
  expect(ledger.isConversationFeedbackAssessmentActive(retracted.started.assessmentId)).toBe(false)
  ledger.recordConversationGuidance(rollback)
  expect(ledger.getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
  expect(ledger.listConversationTasks()).toEqual(original)
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(ledger.listConversationGuidanceStudies())
  expect(replay.listConversationFeedbackAssessments()).toEqual(ledger.listConversationFeedbackAssessments())
  expect(replay.listConversationTasks()).toEqual(original)
  expect(replay.getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
  expect(replay.isConversationFeedbackAssessmentActive(retracted.started.assessmentId)).toBe(false)
  expect(replay.recordConversationGuidance(rollback)).toEqual({ duplicate: true })
})

it('rechecks frozen feedback support at activation and refuses a completed study after that support is withdrawn', () => {
  const { root, ledger, tasks } = seeded('met')
  const assessments = [nativeFeedback(ledger, tasks[0]), nativeFeedback(ledger, tasks[1])]
  const value = evaluated(ledger, opening(tasks, 'withdraw-before-activation', assessments.map(item => item.started.assessmentId)))
  retract(ledger, assessments[1]!)
  expect(() => ledger.recordConversationGuidance(activation(value))).toThrow(/support.*absent|retracted/i)
  expect(ledger.getConversationGuidance(scope).rules).toEqual({})
  const replay = new EvolutionLedger(root)
  expect(() => replay.recordConversationGuidance(activation(value))).toThrow(/support.*absent|retracted/i)
  expect(replay.listConversationGuidanceStudies()[0]?.activation).toBeUndefined()
})

it('persists natural correction support beside the exact original met answer without rewriting its frozen criteria', () => {
  const { root, ledger, tasks } = seeded('met')
  const assessmentIds = tasks.slice(0, 2).map((target, index) => {
    const turn = index + 4
    const identity = { sessionId: target.source.sessionId, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, turn }
    const taskId = conversationTaskId(identity)
    ledger.recordConversationLearning({ ...target.source, ...identity, taskId, startSeq: turn * 10,
      userMessageIds: [`feedback-message-${turn}`], requestDigest: sha256(`user correction ${turn}`) })
    const admission: ConversationTaskAdmission = { kind: 'task-admitted', taskId, proof: proof(`correction-admission:${turn}`), unavailableReason: null,
      decision: { kind: 'conversation', objective: 'Correct the omitted pilot scope.', criteria: [], family: 'summarization', evaluationMode: 'text',
        relatedTaskId: target.source.taskId, feedback: { kind: 'correction', quote: 'You omitted the pilot-only qualification.', category: 'source-fidelity' } } }
    ledger.recordConversationLearning(admission)
    return assess(ledger, target, { kind: 'natural', sourceTaskId: taskId, sourceAdmissionDigest: sha256(admission) }).started.assessmentId
  })
  const value = evaluated(ledger, opening(tasks, 'natural-feedback', assessmentIds))
  ledger.recordConversationGuidance(activation(value))
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationTasks().slice(0, 3)).toEqual(tasks)
  expect(replay.listConversationFeedbackAssessments().map(item => item.started.source.kind)).toEqual(['natural', 'natural'])
  expect(assessmentIds.every(id => replay.isConversationFeedbackAssessmentActive(id))).toBe(true)
  expect(replay.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
})

it.each([
  { label: 'negative feedback on the met counterexample', targetIndex: 2, rating: 'negative' as const },
  { label: 'positive feedback on a not-met source without an assessment', targetIndex: 0, rating: 'positive' as const },
])('rejects contradictory active native feedback at both opening and activation: $label', ({ targetIndex, rating }) => {
  const { ledger, tasks } = seeded()
  const value = evaluated(ledger, opening(tasks, 'before-contradictory-feedback'))
  const target = tasks[targetIndex]!
  const messageId = target.completion!.assistantMessageIds[0]!
  ledger.recordLearningFeedbackRevision({
    intake: { sessionId: target.source.sessionId, messageId, feedbackVersion: 'contradictory-feedback-v1', rating,
      note: rating === 'negative' ? 'This answer omitted the pilot-only scope.' : 'This answer is correct; the pilot-only scope is preserved.',
      scopeKey: target.source.scopeKey, sessionDigest: sha256(`contradictory feedback:${target.source.taskId}`), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1,
  })
  expect(ledger.getLearningIntakeStatus(target.source.sessionId, messageId)).toMatchObject({
    state: 'active', rating, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint,
  })
  expect(ledger.listConversationFeedbackAssessments(target.source.taskId)).toEqual([])
  expect.soft(() => ledger.recordConversationGuidance(opening(tasks, 'after-contradictory-feedback'))).toThrow(/feedback|support|counterevidence/i)
  expect.soft(() => ledger.recordConversationGuidance(activation(value))).toThrow(/feedback|support|counterevidence/i)
  expect.soft(ledger.getConversationGuidance(scope).rules).toEqual({})
  expect(ledger.listConversationTasks()).toEqual(tasks)
})

it.each(['absent', 'v2', 'disabled'] as const)('rejects natural task collection without current scoped v3 consent: %s', mode => {
  const ledger = new EvolutionLedger(ledgerRoot())
  if (mode !== 'absent') ledger.recordLearningAnalysisConsent({ revision: 1, enabled: mode === 'v2', policyVersion: mode === 'v2' ? 'tianwen-auto-analysis.v2' : 'tianwen-auto-analysis.v3' })
  expect(() => task(ledger, 1)).toThrow(/consent/i)
  expect(ledger.listConversationTasks()).toEqual([])
})

it.each([[], [sha256('different model')], [sha256('scripted ledger model configuration'), sha256('changed mid-turn')]])('rejects source tasks whose native model identity is missing, incompatible or mixed: %j', (...models) => {
  const { ledger, tasks } = seeded('not-met', scope, false, models)
  expect(() => ledger.recordConversationGuidance(opening(tasks))).toThrow(/model/i)
})

it('retains an unavailable feedback result but refuses a conclusive result after consent is disabled', () => {
  const { ledger, tasks } = seeded('met')
  const original = ledger.recordConversationFeedback.bind(ledger)
  const intercept = vi.spyOn(ledger, 'recordConversationFeedback').mockImplementation(input => {
    if (input.kind === 'feedback-assessed') ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
    return original(input)
  })
  expect(() => nativeFeedback(ledger, tasks[0])).toThrow(/consent/i)
  intercept.mockRestore()
  const started = ledger.listConversationFeedbackAssessments()[0]!.started
  expect(() => ledger.recordConversationFeedback({ kind: 'feedback-assessed', taskId: started.taskId, assessmentId: started.assessmentId,
    classification: 'inconclusive', category: null, supplementalCriteria: [], explanation: 'Analysis cancelled.', evidenceQuotes: [], proof: null, unavailableReason: 'cancelled' })).not.toThrow()
})
