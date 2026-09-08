import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent, type ArtifactId } from '../../packages/tianwen-evolution/src/ledger.js'
import { canonicalJson, sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, conversationTaskId, conversationReviewConsensus, parseConversationAuditedReviewChecks, parseConversationReviewChecks, type ConversationLearningRecord, type ConversationQualityContract, type ConversationTask, type ConversationTaskAdmission } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import {
  ConversationGuidanceState, baselineGuidanceSnapshot, guidanceInputDigest, guidanceStudyId, guidanceVersion,
  type ConversationGuidanceRecord, type GuidanceStudyBody, type GuidanceStudyOpened, type GuidanceCandidateRecord, type GuidanceArmRecord,
  type GuidanceExplorationIntentRecord, type GuidanceExplorationArmRecord,
} from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { prepareConversationLearningExploration } from '../../packages/tianwen-evolution/src/learning-exploration.js'
import { conversationFeedbackAssessmentId, type ConversationFeedbackSource, type ConversationFeedbackStarted } from '../../packages/tianwen-evolution/src/conversation-feedback.js'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, createUserMessage, mountPersistentHarness, textResponse, toolCallResponse } from '@tianwen/dsh-compat'
import { apply as applyRuntime } from '../../packages/tianwen-runtime/src/index.js'
import { TianwenConversationObserverService } from '../../packages/tianwen-runtime-bundle/src/conversation-observer.js'
import { auditedEvidenceResponse } from './conversation-audited-response.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'

const roots: string[] = []
const scope = 'workspace:guidance-ledger'
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(`request:${id}`) })
const exactV1Quality: ConversationQualityContract = { schemaVersion: 'tianwen.conversation-quality.v1', source: 'host', criterion: 'Be faithful to user-supplied or source facts and their uncertainty, and to actual verified tool evidence. Do not invent or contradict source-dependent facts, decisions, status or completed actions. Prior assistant claims, user silence or continuation do not verify such facts. Clearly distinguish inferences, assumptions and advice from confirmed facts. Relevant general knowledge, reasonable labeled inference and advice, and user-requested fiction are allowed; this contract does not require additional tool calls.' }
const checks = (id: string, verdict: 'met' | 'not-met' | 'inconclusive') => parseConversationReviewChecks(['requirements', 'grounding'].map(focus => ({
  focus, verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: 'Original review against frozen duration criteria.',
  evidenceQuotes: ['pilot'], proof: proof(`${id}:${focus}`),
})))
const auditedChecks = (id: string, verdict: 'met' | 'not-met' | 'inconclusive', version: 'v1' | 'v2' = 'v2') => parseConversationAuditedReviewChecks(checks(id, verdict).map(check => ({ ...check,
  audit: version === 'v1'
    ? { schemaVersion: 'tianwen.claim-audit.v1', evidenceDigest: sha256(`evidence:${id}`), units: [{ answerId: 'answer-1', claims: [{ quote: 'pilot', kind: 'source-fact', status: verdict === 'met' ? 'supported' : verdict === 'not-met' ? 'unsupported' : 'uncertain', sourceIds: ['request-1'], explanation: 'Checked against frozen material.' }] }] }
    : { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(`evidence:${id}`), units: { 'answer-1': { firstClaim: { quote: 'pilot', kind: 'source-fact', status: verdict === 'met' ? 'supported' : verdict === 'not-met' ? 'unsupported' : 'uncertain', sourceIds: ['request-1'], explanation: 'Checked against frozen material.' }, additionalClaims: [] } } },
})))
const exactV2Quality: ConversationQualityContract = { schemaVersion: 'tianwen.conversation-quality.v2', source: 'host', criterion: `${exactV1Quality.criterion} The original direct-user instructions remain authoritative even if extracted criteria omit or weaken an explicit requirement. Preserve output-only restrictions, exclusions, conditions, uncertainty and who may decide or act. Distinguish the user's instructions from quoted source content. Evaluate the complete answer, including introductions, alternatives and closing offers. Two independent native checks must agree before a conclusive review; neither check may see the other's result.` }
const exactV3Quality: ConversationQualityContract = { schemaVersion: 'tianwen.conversation-quality.v3', source: 'host', criterion: `${exactV2Quality.criterion} Original-result reviews use only requirements applicable when that task ran. For newly generated method-study answers, separately identified host-frozen feedback standards apply prospectively; they do not regrade the old answer or override an explicit instruction in the evaluated user request.` }
const exactV4Quality: ConversationQualityContract = { ...exactV3Quality, schemaVersion: 'tianwen.conversation-quality.v4' }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function ledgerRoot() {
  const base = process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'guidance-ledger-')); roots.push(root)
  return root
}

// Synthetic native receipts exercise real ledger gates and disk replay; no model is run here.
function task(ledger: EvolutionLedger, turn: number, verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', scopeKey = scope, request = `pilot request ${turn}`, models = [sha256('scripted ledger model configuration')], qualityContract: ConversationQualityContract | null = conversationQualityContract(), legacyRoot?: string): ConversationTask {
  const identity = { sessionId: 'ordinary-guidance', sessionLifecycleFingerprint: sha256('ordinary-guidance-lifecycle'), turn }
  const taskId = conversationTaskId(identity)
  const source = { kind: 'task-started' as const, taskId, ...identity, startSeq: turn * 10,
    userMessageIds: [`request-${turn}`], requestDigest: sha256(request), contextDigest: sha256([]),
    scopeKey, consentRevision: 1, behaviorVersion: guidanceVersion(ledger.getConversationGuidance(scopeKey)) }
  const admission: ConversationTaskAdmission = { kind: 'task-admitted', taskId, proof: proof(`admission:${turn}`), unavailableReason: null,
    ...(qualityContract === null ? {} : { qualityContract }),
    decision: { kind: 'task', objective: 'Summarize the supplied pilot result.', criteria: ['Preserve the supplied duration.'],
      family: 'summarization', evaluationMode: 'text', relatedTaskId: null, feedback: null } }
  const resultDigest = sha256(`answer ${turn}`)
  const reviewChecks = ['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(qualityContract?.schemaVersion ?? '') ? auditedChecks(`review:${turn}`, verdict) : qualityContract?.schemaVersion === 'tianwen.conversation-quality.v4' ? auditedChecks(`review:${turn}`, verdict, 'v1') : checks(`review:${turn}`, verdict)
  const records: ConversationLearningRecord[] = [source, admission,
    ...models.map((modelConfigDigest, index) => ({ kind: 'task-model-observed' as const, taskId, headerSeq: turn * 10 + index, modelConfigDigest })),
    { kind: 'task-finished', taskId, endSeq: turn * 10 + 8, status: 'completed', assistantMessageIds: [`answer-${turn}`], resultDigest, evidenceIds: [] },
    { kind: 'task-reviewed', taskId, admissionDigest: sha256(admission), resultDigest,
    verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: 'Original review against frozen duration criteria.',
    evidenceQuotes: verdict === 'not-met' ? ['pilot'] : [], proof: proof(`review:${turn}`), unavailableReason: null,
    ...(['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(qualityContract?.schemaVersion ?? '') ? { ...conversationReviewConsensus(reviewChecks), reviewChecks } : {}) }]
  if (qualityContract === null || !['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(qualityContract.schemaVersion)) {
    if (legacyRoot === undefined) throw new Error('legacy fixture requires an explicit historical ledger path')
    appendFileSync(join(legacyRoot, 'ledger.jsonl'), records.map(record => `${canonicalJson({ type: 'conversation-learning-recorded', schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
    ledger = new EvolutionLedger(legacyRoot)
  } else for (const record of records) ledger.recordConversationLearning(record)
  return ledger.listConversationTasks().find(item => item.source.taskId === taskId)!
}

function seeded(verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', secondScope = scope, repeatRequest = false, secondModels = [sha256('scripted ledger model configuration')], qualityContract: ConversationQualityContract | null = conversationQualityContract()) {
  const root = ledgerRoot()
  const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [task(ledger, 1, verdict, scope, undefined, undefined, qualityContract, root), task(ledger, 2, verdict, secondScope, repeatRequest ? 'pilot request 1' : 'pilot request 2', secondModels, qualityContract, root), task(ledger, 3, 'met', scope, undefined, undefined, qualityContract, root)] as const
  return { root, ledger: qualityContract === null || !['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(qualityContract.schemaVersion) ? new EvolutionLedger(root) : ledger, tasks }
}

function opening(tasks: readonly [ConversationTask, ConversationTask, ConversationTask], label = 'first', assessments: readonly (string | undefined)[] = []): GuidanceStudyOpened {
  const parentSnapshot = baselineGuidanceSnapshot(tasks[0].source.scopeKey)
  const quality = tasks[0].admission!.qualityContract === undefined ? {} : { qualityContract: tasks[0].admission!.qualityContract }
  const generated = (kind: 'adjacent' | 'holdout') => {
    const material = { prompt: `${label}: ${kind} pilot source`, criteria: ['Preserve the pilot-only qualification.'], ...quality }
    return { id: `${label}:${kind}`, kind, ...material, inputDigest: guidanceInputDigest(material.prompt), materialDigest: sha256(material) }
  }
  const body: GuidanceStudyBody = {
    ...quality,
    scopeKey: parentSnapshot.scopeKey, family: 'summarization', failureCategory: 'source-fidelity', consentRevision: 1,
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

function proposalPlan(opened: GuidanceStudyOpened) {
  const candidate: GuidanceCandidateRecord = { kind: 'candidate-recorded', studyId: opened.studyId,
    candidateSnapshot: { ...opened.parentSnapshot, rules: { summarization: `Preserve the pilot qualification for ${opened.cases[0]!.id}.` } },
    proposalProof: proof(`${opened.studyId}:proposal`) }
  const arms: GuidanceArmRecord[] = opened.cases.flatMap(item => (['baseline', 'candidate'] as const).map(role => ({
    kind: 'arm-recorded', studyId: opened.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
    behaviorVersion: guidanceVersion(role === 'baseline' ? opened.parentSnapshot : candidate.candidateSnapshot),
    executionProof: proof(`${opened.studyId}:${item.id}:${role}:execute`), judgeProof: proof(`${opened.studyId}:${item.id}:${role}:judge`),
    outputDigest: sha256(`${item.id}:${role}:actual output`), verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met',
    ...(['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(opened.qualityContract?.schemaVersion ?? '') ? {
      reviewChecks: opened.qualityContract?.schemaVersion === 'tianwen.conversation-quality.v4'
        ? auditedChecks(`${opened.studyId}:${item.id}:${role}:judge`, role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met', 'v1')
        : ['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6'].includes(opened.qualityContract?.schemaVersion ?? '')
          ? auditedChecks(`${opened.studyId}:${item.id}:${role}:judge`, role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met')
        : checks(`${opened.studyId}:${item.id}:${role}:judge`, role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met'),
      judgeProof: proof(`${opened.studyId}:${item.id}:${role}:judge:requirements`),
    } : {}),
  })))
  return { opened, candidate, arms }
}

function explorationIntent(opened: GuidanceStudyOpened): GuidanceExplorationIntentRecord {
  const source = opened.cases[0]!
  if (!('sourceTaskId' in source)) throw new Error('fixture requires a frozen source task')
  return {
    kind: 'exploration-requested', studyId: opened.studyId,
    request: prepareConversationLearningExploration({
      sourceTaskId: source.sourceTaskId,
      hypothesis: 'The missing qualification is caused by the absent temporary instruction.',
      alternative: 'The missing qualification is caused by an unrelated source condition.',
      temporaryInstruction: 'Preserve the pilot-only qualification in the final answer.',
      expectedIfHypothesis: { control: 'not-met', treatment: 'met' },
      expectedIfAlternative: { control: 'met', treatment: 'met' },
    }, {
      studyId: opened.studyId, sourceTaskId: source.sourceTaskId, parentVersion: opened.parentVersion,
      sourceMaterialDigest: source.materialDigest, environmentDigest: opened.modelConfigDigest,
      qualityContractDigest: sha256(opened.qualityContract ?? null), proposalProof: proof(`${opened.studyId}:exploration-proposal`),
    }),
  }
}

function explorationArm(opened: GuidanceStudyOpened, arm: 'control' | 'treatment', verdict: 'met' | 'not-met'): GuidanceExplorationArmRecord {
  const source = opened.cases[0]!
  return {
    kind: 'exploration-arm-recorded', studyId: opened.studyId, arm,
    materialDigest: source.materialDigest, parentVersion: opened.parentVersion,
    executionProof: proof(`${opened.studyId}:exploration:${arm}:execution`),
    outputDigest: sha256(`${opened.studyId}:exploration:${arm}:output`),
    reviewChecks: auditedChecks(`${opened.studyId}:exploration:${arm}:review`, verdict, opened.qualityContract?.schemaVersion === 'tianwen.conversation-quality.v4' ? 'v1' : 'v2'),
  }
}

function proposed(ledger: EvolutionLedger, opened: GuidanceStudyOpened) {
  const value = proposalPlan(opened)
  ledger.recordConversationGuidance(opened)
  ledger.recordConversationGuidance(value.candidate)
  return value
}

/** Frozen old-writer fixture: emit historical records, then exercise current
 * disk replay. Never ask the current mutation API to authorize old policy. */
function historicalStudy(root: string, ledger: EvolutionLedger, opened: GuidanceStudyOpened, activated: boolean) {
  const value = proposalPlan(opened)
  const state = new ConversationGuidanceState()
  const records: ConversationGuidanceRecord[] = []
  const append = (record: ConversationGuidanceRecord) => { state.validate(record); state.apply(record, '2026-09-07T00:00:00.000Z'); records.push(record) }
  append(opened); append(value.candidate)
  for (const arm of value.arms) append(arm)
  const decision = state.decision(opened.studyId); append(decision)
  if (activated) append(activation({ ...value, decision }))
  ledger.recordArtifact(canonicalJson(opened.parentSnapshot))
  const artifact = ledger.recordArtifact(canonicalJson(value.candidate.candidateSnapshot))
  ledger.recordEvaluation({ artifactId: artifact.artifactId, receiptDigest: sha256(decision), verdict: 'met' })
  appendFileSync(join(root, 'ledger.jsonl'), records.map(record => `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
  return { ...value, decision, ledger: new EvolutionLedger(root) }
}

function evaluated(ledger: EvolutionLedger, opened: GuidanceStudyOpened) {
  const value = proposed(ledger, opened)
  for (const arm of value.arms) ledger.recordConversationGuidance(arm)
  const decision = ledger.conversationGuidanceDecision(opened.studyId)
  ledger.recordConversationGuidance(decision)
  return { ...value, decision }
}

it.each([exactV1Quality, exactV2Quality, exactV4Quality].flatMap(quality => [false, true].map(activated => ({ quality, activated }))))('replays exact $quality.schemaVersion studies without regrading or new activation: previously active $activated', ({ quality, activated }) => {
  const { root, ledger, tasks } = seeded('not-met', scope, false, undefined, quality)
  const old = historicalStudy(root, ledger, opening(tasks), activated)
  const before = old.ledger.listEvents().map(sha256)
  const oldStudy = old.ledger.listConversationGuidanceStudies()[0]!
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationTasks()).toEqual(tasks)
  expect(replay.listConversationGuidanceStudies()[0]).toEqual(oldStudy)
  expect(replay.listEvents().map(sha256)).toEqual(before)
  expect(oldStudy.arms.every(arm => arm.reviewChecks === undefined)).toBe(quality.schemaVersion === 'tianwen.conversation-quality.v1')
  if (!activated) expect(() => replay.recordConversationGuidance(activation(old))).toThrow(/quality|contract/i)
  replay.retireIncompatibleConversationGuidance(scope)
  expect(replay.getConversationGuidance(scope).rules).toEqual({})
  expect(replay.listEvents().slice(0, before.length).map(sha256)).toEqual(before)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe(activated ? 'quality-contract-changed' : undefined)
  expect(replay.listConversationGuidanceStudies()[0]?.decision).toEqual(oldStudy.decision)
})

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

it('rejects an old met counterexample in a new-contract study and leaves its original proof untouched', () => {
  const { root, ledger, tasks } = seeded()
  const old = task(ledger, 4, 'met', scope, undefined, undefined, null, root)
  const opened = opening([tasks[0], tasks[1], old])
  expect(() => new EvolutionLedger(root).recordConversationGuidance(opened)).toThrow(/quality|contract/i)
  expect(new EvolutionLedger(root).listConversationTasks().at(-1)).toEqual(old)
})

it.each([false, true])('replays immutable legacy evidence but prevents future old-policy activation (already active: %s)', active => {
  const seededValue = seeded('not-met', scope, false, undefined, null)
  const value = historicalStudy(seededValue.root, seededValue.ledger, opening(seededValue.tasks), active)
  const ledger = value.ledger
  const history = ledger.listEvents()
  expect(ledger.listConversationTasks()).toEqual(seededValue.tasks)
  expect(ledger.listConversationGuidanceStudies()[0]?.opened).not.toHaveProperty('qualityContract')
  if (!active) {
    expect(() => ledger.recordConversationGuidance(activation(value))).toThrow(/quality|contract/i)
    expect(() => ledger.recordConversationGuidance(opening(seededValue.tasks, 'new-old-policy-study'))).toThrow(/quality|contract/i)
  } else {
    ledger.retireIncompatibleConversationGuidance(scope)
    expect(ledger.getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
    expect(ledger.listConversationGuidanceStudies()[0]?.rollback).toMatchObject({ reason: 'quality-contract-changed', evidenceTaskIds: [] })
    ledger.retireIncompatibleConversationGuidance(scope)
  }
  expect(ledger.listEvents().slice(0, history.length)).toEqual(history)
  expect(ledger.listEvents()).toHaveLength(history.length + (active ? 1 : 0))
  const replay = new EvolutionLedger(seededValue.root)
  expect(replay.listConversationTasks()).toEqual(seededValue.tasks)
  expect(replay.listConversationGuidanceStudies()).toEqual(ledger.listConversationGuidanceStudies())
  expect(replay.getChampion()).toBeUndefined()
})

it('replays a historical-quality natural exploration but rejects its new mutation', () => {
  const { root, ledger, tasks } = seeded('not-met', scope, false, undefined, exactV4Quality)
  const opened = opening(tasks, 'historical-natural-exploration')
  const intent = explorationIntent(opened)
  const records: ConversationGuidanceRecord[] = []
  const state = new ConversationGuidanceState()
  const append = (record: ConversationGuidanceRecord) => { state.validate(record); state.apply(record, '2026-09-07T00:00:00.000Z'); records.push(record) }
  append(opened); append(intent)
  append(explorationArm(opened, 'control', 'not-met'))
  append(explorationArm(opened, 'treatment', 'met'))
  appendFileSync(join(root, 'ledger.jsonl'), records.map(record => `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(state.listStudies())
  expect(() => replay.recordConversationGuidance(proposalPlan(opened).candidate)).toThrow(/quality|contract/i)
  expect(replay.recordConversationGuidance(intent)).toEqual({ duplicate: true })
  expect(ledger.listConversationGuidanceStudies()).toEqual([])
})

it('requires currently enabled matching consent and active support before requesting natural exploration', () => {
  const disabled = seeded()
  const disabledStudy = opening(disabled.tasks, 'disabled-natural-exploration')
  disabled.ledger.recordConversationGuidance(disabledStudy)
  disabled.ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
  expect(() => disabled.ledger.recordConversationGuidance(explorationIntent(disabledStudy))).toThrow(/current v3 consent/i)

  const withdrawn = seeded('met')
  const assessments = [nativeFeedback(withdrawn.ledger, withdrawn.tasks[0]), nativeFeedback(withdrawn.ledger, withdrawn.tasks[1])]
  const withdrawnStudy = opening(withdrawn.tasks, 'withdrawn-natural-exploration', assessments.map(item => item.started.assessmentId))
  withdrawn.ledger.recordConversationGuidance(withdrawnStudy)
  retract(withdrawn.ledger, assessments[0]!)
  expect(() => withdrawn.ledger.recordConversationGuidance(explorationIntent(withdrawnStudy))).toThrow(/support.*absent|retracted/i)
})

it('rejects a natural exploration request after its opened parent is no longer current', () => {
  const { ledger, tasks } = seeded()
  const first = evaluated(ledger, opening(tasks, 'natural-parent-first'))
  const stale = opening(tasks, 'natural-parent-stale')
  ledger.recordConversationGuidance(stale)
  ledger.recordConversationGuidance(activation(first))
  expect(() => ledger.recordConversationGuidance(explorationIntent(stale))).toThrow(/current frozen parent|stale.*parent/i)
})

it('does not retire current-contract guidance or claim a quality migration for it', () => {
  const { ledger, tasks } = seeded()
  const value = evaluated(ledger, opening(tasks))
  ledger.recordConversationGuidance(activation(value))
  ledger.retireIncompatibleConversationGuidance(scope)
  expect(ledger.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
  expect(() => ledger.recordConversationGuidance({ kind: 'guidance-rolled-back', studyId: value.opened.studyId,
    expectedCurrentVersion: guidanceVersion(value.candidate.candidateSnapshot), reason: 'quality-contract-changed', evidenceTaskIds: [] })).toThrow(/quality|contract/i)
})

it('persists one natural control/treatment observation without changing the formal ten-arm decision', () => {
  const { root, ledger, tasks } = seeded()
  const opened = opening(tasks, 'natural-exploration')
  const intent = explorationIntent(opened)
  ledger.recordConversationGuidance(opened)
  ledger.recordConversationGuidance(intent)
  expect(() => ledger.recordConversationGuidance(proposalPlan(opened).candidate)).toThrow(/exploration|both|complete/i)
  ledger.recordConversationGuidance(explorationArm(opened, 'control', 'not-met'))
  ledger.recordConversationGuidance(explorationArm(opened, 'treatment', 'met'))
  const study = ledger.listConversationGuidanceStudies()[0]!
  expect(study.arms).toEqual([])
  expect(study.exploration).toMatchObject({
    intent,
    arms: [explorationArm(opened, 'control', 'not-met'), explorationArm(opened, 'treatment', 'met')],
    result: { observation: { control: 'not-met', treatment: 'met' }, classification: 'matches-hypothesis-prediction' },
  })
  const plan = proposalPlan(opened)
  ledger.recordConversationGuidance(plan.candidate)
  for (const arm of plan.arms) ledger.recordConversationGuidance(arm)
  const decision = ledger.conversationGuidanceDecision(opened.studyId)
  expect(decision.verdict).toBe('accepted')
  ledger.recordConversationGuidance(decision)
  expect(ledger.listConversationGuidanceStudies()[0]?.arms).toHaveLength(10)
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(ledger.listConversationGuidanceStudies())
})

it('keeps an exact natural exploration receipt idempotent after an evidence-limited stop', () => {
  const { root, ledger, tasks } = seeded()
  const opened = opening(tasks, 'stopped-natural-exploration')
  const intent = explorationIntent(opened)
  const control = explorationArm(opened, 'control', 'not-met')
  ledger.recordConversationGuidance(opened)
  ledger.recordConversationGuidance(intent)
  ledger.recordConversationGuidance(control)
  const stopped = { kind: 'study-stopped' as const, studyId: opened.studyId, reason: 'insufficient-evidence' as const,
    proposalProof: proof(`${opened.studyId}:insufficient-evidence`) }
  expect(() => ledger.recordConversationGuidance({ ...stopped, proposalProof: control.executionProof })).toThrow(/independent|session/i)
  ledger.recordConversationGuidance(stopped)
  expect(ledger.recordConversationGuidance(intent)).toEqual({ duplicate: true })
  expect(ledger.recordConversationGuidance(control)).toEqual({ duplicate: true })
  expect(() => ledger.recordConversationGuidance(explorationArm(opened, 'treatment', 'met'))).toThrow(/stopped/i)
  expect(new EvolutionLedger(root).listConversationGuidanceStudies()).toEqual(ledger.listConversationGuidanceStudies())
})

it.each(['active', 'active-loop', 'accepted', 'mixed-counter'] as const)('keeps historical proof untouched and admits future native turns without obsolete guidance: %s', async scenario => {
  const root = ledgerRoot()
  const scopeKey = `conversation:${sha256({ cwd: root })}`
  const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [
    task(ledger, 1, 'not-met', scopeKey, undefined, undefined, scenario === 'mixed-counter' ? exactV3Quality : null, root),
    task(ledger, 2, 'not-met', scopeKey, undefined, undefined, scenario === 'mixed-counter' ? exactV3Quality : null, root),
    task(ledger, 3, 'met', scopeKey, undefined, undefined, null, root),
  ] as const
  const old = scenario === 'mixed-counter' ? undefined : historicalStudy(root, ledger, opening(tasks), scenario.startsWith('active'))
  let observedBeforeAnswer = false
  const harness = await mountPersistentHarness(join(root, 'native-sessions'), [
    () => {
      expect(harness.ctx.tianwenEvolution.getConversationGuidance(scopeKey).rules).toEqual({})
      return toolCallResponse('new-admission', 'structured_output', tasks[0].admission!.decision!)
    },
    () => {
      // Disk, not merely in-memory state, already has the pre-answer contract
      // and any necessary exact-parent migration.
      const durable = new EvolutionLedger(root)
      expect(durable.getConversationGuidance(scopeKey).rules).toEqual({})
      expect(durable.listConversationTasks('new-native-conversation')[0]?.admission?.qualityContract).toEqual(conversationQualityContract())
      if (scenario.startsWith('active')) expect(durable.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe('quality-contract-changed')
      observedBeforeAnswer = true
      return textResponse('The supplied pilot takes 5 days.')
    },
    auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'The supplied duration is preserved.', evidenceQuotes: ['The supplied pilot takes 5 days.'] }),
    auditedEvidenceResponse({ verdict: 'met', category: null, explanation: 'The supplied duration is preserved.', evidenceQuotes: ['The supplied pilot takes 5 days.'] }),
  ])
  const cli = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
  const spawn = await import(pathToFileURL(cli.resolve('@deepseek-ai/dsh-subagent-spawn-in-process')).href)
  await harness.ctx.plugin(SubagentRuntime); await harness.ctx.plugin(spawn, { providerName: 'spawn' })
  await applyRuntime(harness.ctx, { evolutionRoot: root })
  await harness.ctx.plugin(TianwenConversationObserverService)
  // Active migration must also work with only the admission observer, without
  // waiting for the learning loop or a native idle event.
  if (scenario !== 'active') await harness.ctx.plugin(TianwenConversationGuidanceLoopService)
  if (scenario === 'active-loop') expect(harness.ctx.tianwenEvolution.listConversationGuidanceStudies()[0]?.rollback?.reason).toBe('quality-contract-changed')
  const inspect = vi.spyOn(harness.ctx.sessionPersistence, 'inspect')
  const handle = await harness.ctx.agents.create({ sessionId: SessionId('new-native-conversation'), meta: { cwd: root }, agentOptions: { provider: 'tianwen-probe', model: 'scripted' } })
  try {
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summarize: the supplied pilot takes 5 days.' }] }))
    await handle.agent.whenIdle(); await harness.ctx.tianwenConversationObserver.whenIdle()
    if (scenario !== 'active') await harness.ctx.tianwenConversationGuidanceLoop.whenIdle()
    expect(observedBeforeAnswer).toBe(true)
    expect(harness.adapter.requests).toHaveLength(4)
    expect(harness.ctx.tianwenEvolution.listConversationTasks().slice(0, 3)).toEqual(tasks)
    const studies = harness.ctx.tianwenEvolution.listConversationGuidanceStudies()
    expect(studies).toHaveLength(old === undefined ? 0 : 1)
    if (scenario === 'accepted') {
      expect(studies[0]?.decision).toEqual(old!.decision)
      expect(studies[0]?.activation).toBeUndefined()
      const historicalProofIds = new Set([old!.candidate.proposalProof.sessionId, ...old!.arms.flatMap(arm => [arm.executionProof.sessionId, arm.judgeProof.sessionId])])
      expect(inspect.mock.calls.some(([id]) => historicalProofIds.has(String(id)))).toBe(false)
    }
  } finally { inspect.mockRestore(); await handle.dispose(); await harness.ctx.fiber.dispose() }
}, 30_000)

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
