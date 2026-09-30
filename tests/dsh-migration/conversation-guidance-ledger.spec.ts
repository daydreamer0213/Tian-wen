import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { EvolutionLedger, isPublicLedgerEvent, type ArtifactId } from '../../packages/tianwen-evolution/src/ledger.js'
import { canonicalJson, sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, conversationTaskId, conversationReviewConsensus, conversationTaskInputDigest, conversationRequestContentDigest, parseConversationAuditedReviewChecks, parseConversationReviewChecks, type ConversationLearningRecord, type ConversationQualityContract, type ConversationTask, type ConversationTaskAdmission } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import {
  ConversationGuidanceState, baselineGuidanceSnapshot, guidanceInputDigest, guidanceStudyId, guidanceVersion, caseDesignAttemptId, parseConversationCaseDesignAttempt, parseConversationGuidanceRecord,
  type ConversationGuidanceRecord, type GuidanceStudyBody, type GuidanceStudyOpened, type GuidanceCandidateRecord, type GuidanceArmRecord,
  type GuidanceExplorationIntentRecord, type GuidanceExplorationArmRecord, type GuidanceSourceReferenceReadRecord,
} from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { prepareConversationLearningExploration } from '../../packages/tianwen-evolution/src/learning-exploration.js'
import { conversationFileTaskInputDigest } from '../../packages/tianwen-evolution/src/conversation-files.js'
import * as taskMaterial from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
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
  const base = process.env.TIANWEN_FILE_TEST_ROOT ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests' : '/tmp/tianwen-conversation-tests')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'guidance-ledger-')); roots.push(root)
  if (process.env.TIANWEN_FILE_TEST_ROOT !== undefined) expect(root.replaceAll('\\', '/').startsWith(`${base.replaceAll('\\', '/')}/`)).toBe(true)
  return root
}

// Synthetic native receipts exercise real ledger gates and disk replay; no model is run here.
function task(ledger: EvolutionLedger, turn: number, verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', scopeKey = scope, request = `pilot request ${turn}`, models = [sha256('scripted ledger model configuration')], qualityContract: ConversationQualityContract | null = conversationQualityContract(), legacyRoot?: string, fileMode?: 'files' | 'chat', proposalCluePolicy: boolean | 'feedback.v2' = false, completeFiles = true, mode?: 'external' | 'subjective', family: 'summarization' | 'writing' = 'summarization', fileInputs = [{ path: 'pilot.txt', content: request }], nativeRequest = false, captureContent = true): ConversationTask {
  const identity = { sessionId: 'ordinary-guidance', sessionLifecycleFingerprint: sha256('ordinary-guidance-lifecycle'), turn }
  const taskId = conversationTaskId(identity)
  const message = nativeRequest ? createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: request }] }) : undefined
  const source = { kind: 'task-started' as const, taskId, ...identity, startSeq: turn * 10,
    userMessageIds: message === undefined ? [`request-${turn}`] : [String(message.id)], requestDigest: message === undefined ? sha256(request) : sha256([message]), contextDigest: sha256([]),
    ...(captureContent && qualityContract?.schemaVersion === conversationQualityContract().schemaVersion ? { requestContentDigest: sha256([[{ type: 'text', text: request }]]) } : {}),
    scopeKey, consentRevision: 1, behaviorVersion: guidanceVersion(ledger.getConversationGuidance(scopeKey)),
    ...(proposalCluePolicy ? { proposalCluePolicy: proposalCluePolicy === true ? 'feedback.v1' as const : proposalCluePolicy } : {}) }
  const admission: ConversationTaskAdmission = { kind: 'task-admitted', taskId, proof: proof(`admission:${turn}`), unavailableReason: null,
    ...(qualityContract === null ? {} : { qualityContract }),
    decision: { kind: 'task', objective: 'Summarize the supplied pilot result.', criteria: ['Preserve the supplied duration.'],
      family, evaluationMode: mode ?? (fileMode === undefined ? 'text' : 'local-files'), ...(fileMode === undefined ? {} : { fileOutputKind: fileMode }), relatedTaskId: null, feedback: null } }
  const resultDigest = sha256(`answer ${turn}`)
  const reviewChecks = ['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(qualityContract?.schemaVersion ?? '') ? auditedChecks(`review:${turn}`, verdict) : qualityContract?.schemaVersion === 'tianwen.conversation-quality.v4' ? auditedChecks(`review:${turn}`, verdict, 'v1') : checks(`review:${turn}`, verdict)
  const records: ConversationLearningRecord[] = [source, admission,
    ...models.map((modelConfigDigest, index) => ({ kind: 'task-model-observed' as const, taskId, headerSeq: turn * 10 + index, modelConfigDigest })),
    ...(fileMode === undefined || !completeFiles ? [] : fileInputs.map((input, index) => ({ kind: 'task-file-input-captured' as const, taskId, ...input, callSeq: turn * 10 + 2 + index, callId: index === 0 ? `read:${turn}` : `read:${turn}:${index}` }))),
    { kind: 'task-finished', taskId, endSeq: turn * 10 + 8, status: 'completed', assistantMessageIds: [`answer-${turn}`], resultDigest, evidenceIds: [],
      ...(fileMode === undefined || !completeFiles ? {} : { files: { schemaVersion: 'tianwen.conversation-file-result.v1' as const, outputKind: fileMode, inputsDigest: sha256(fileInputs), captureSeq: turn * 10 + 7, entries: fileInputs.map(input => ({ path: input.path, content: 'pilot result' })), outputPaths: fileMode === 'files' ? fileInputs.map(input => input.path) : [] } }) },
    { kind: 'task-reviewed', taskId, admissionDigest: sha256(admission), resultDigest,
    verdict, category: verdict === 'not-met' ? 'source-fidelity' : null, explanation: 'Original review against frozen duration criteria.',
    evidenceQuotes: verdict === 'not-met' ? ['pilot'] : [], proof: proof(`review:${turn}`), unavailableReason: null,
    ...(['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(qualityContract?.schemaVersion ?? '') ? { ...conversationReviewConsensus(reviewChecks), reviewChecks } : {}) }]
  if (qualityContract === null || !['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(qualityContract.schemaVersion)) {
    if (legacyRoot === undefined) throw new Error('legacy fixture requires an explicit historical ledger path')
    appendFileSync(join(legacyRoot, 'ledger.jsonl'), records.map(record => `${canonicalJson({ type: 'conversation-learning-recorded', schemaVersion: 'tianwen.conversation-learning.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
    ledger = new EvolutionLedger(legacyRoot)
  } else for (const record of records) ledger.recordConversationLearning(record)
  return ledger.listConversationTasks().find(item => item.source.taskId === taskId)!
}

function seeded(verdict: 'met' | 'not-met' | 'inconclusive' = 'not-met', secondScope = scope, repeatRequest = false, secondModels = [sha256('scripted ledger model configuration')], qualityContract: ConversationQualityContract | null = conversationQualityContract(), firstScope = scope) {
  const root = ledgerRoot()
  const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [task(ledger, 1, verdict, firstScope, undefined, undefined, qualityContract, root), task(ledger, 2, verdict, secondScope, repeatRequest ? 'pilot request 1' : 'pilot request 2', secondModels, qualityContract, root), task(ledger, 3, 'met', firstScope, undefined, undefined, qualityContract, root)] as const
  return { root, ledger: qualityContract === null || !['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(qualityContract.schemaVersion) ? new EvolutionLedger(root) : ledger, tasks }
}

it('persists consumed case-design pairs without inventing studies, and permits genuinely new source pairs', () => {
  const { root, ledger, tasks } = seeded()
  expect(new EvolutionLedger(root).listConversationCaseDesignAttempts()).toEqual([])
  const body = { scopeKey: scope, consentRevision: 1, parentVersion: tasks[0].source.behaviorVersion,
    sourceTaskIds: [tasks[0].source.taskId, tasks[1].source.taskId] as const, counterexampleTaskId: tasks[2].source.taskId,
    modelConfigDigest: sha256('scripted ledger model configuration'), materialDigest: sha256('frozen design material') }
  const attempt = { attemptId: caseDesignAttemptId(body), ...body }
  expect(ledger.recordConversationCaseDesignAttempt(attempt)).toEqual({ duplicate: false })
  expect(ledger.recordConversationCaseDesignAttempt(attempt)).toEqual({ duplicate: true })
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationCaseDesignAttempts(scope)).toEqual([attempt])
  expect(replay.listConversationGuidanceStudies()).toEqual([])
  expect(replay.listEvents().filter(isPublicLedgerEvent).some(event => String(event.type) === 'conversation-case-design-attempted')).toBe(false)
  const returned = replay.listConversationCaseDesignAttempts()[0]!
  ;(returned.sourceTaskIds as string[])[0] = 'changed caller copy'
  expect(replay.listConversationCaseDesignAttempts()).toEqual([attempt])
  for (const changed of [ { ...body, materialDigest: sha256('changed') }, { ...body, sourceTaskIds: [...body.sourceTaskIds].reverse() as [string, string] } ]) {
    expect(() => replay.recordConversationCaseDesignAttempt({ attemptId: caseDesignAttemptId(changed), ...changed })).toThrow(/already attempted/)
  }
  const newSource = task(replay, 4)
  const next = { ...body, sourceTaskIds: [tasks[1].source.taskId, newSource.source.taskId] as const }
  expect(replay.recordConversationCaseDesignAttempt({ attemptId: caseDesignAttemptId(next), ...next })).toEqual({ duplicate: false })
  expect(new EvolutionLedger(root).listConversationCaseDesignAttempts()).toHaveLength(2)
})

it('preserves historical attempt contracts on replay without allowing new writes under an obsolete contract', () => {
  const { root, ledger, tasks } = seeded('not-met', scope, false, undefined, exactV3Quality)
  const body = { scopeKey: scope, consentRevision: 1, parentVersion: tasks[0].source.behaviorVersion,
    sourceTaskIds: [tasks[0].source.taskId, tasks[1].source.taskId] as const, counterexampleTaskId: tasks[2].source.taskId,
    modelConfigDigest: sha256('scripted ledger model configuration'), materialDigest: sha256('historical frozen design material') }
  const attempt = { attemptId: caseDesignAttemptId(body), ...body }
  expect(() => ledger.recordConversationCaseDesignAttempt(attempt)).toThrow()
  appendFileSync(join(root, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-case-design-attempted', schemaVersion: 'tianwen.conversation-case-design-attempt.v1', at: new Date().toISOString(), attempt })}\n`)
  expect(new EvolutionLedger(root).listConversationCaseDesignAttempts()).toEqual([attempt])
})

it.each(['scope', 'parent', 'model', 'consent', 'disabled', 'source', 'counter', 'extra', 'identity'] as const)('rejects invalid case-design attempt %s before a durable write', scenario => {
  const { root, ledger, tasks } = seeded()
  if (scenario === 'disabled') ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
  const body = { scopeKey: scenario === 'scope' ? 'other-scope' : scope, consentRevision: scenario === 'consent' ? 2 : 1,
    parentVersion: scenario === 'parent' ? sha256('other version') : tasks[0].source.behaviorVersion,
    sourceTaskIds: [tasks[0].source.taskId, scenario === 'source' ? 'missing task' : tasks[1].source.taskId] as const,
    counterexampleTaskId: scenario === 'counter' ? tasks[0].source.taskId : tasks[2].source.taskId,
    modelConfigDigest: sha256(scenario === 'model' ? 'other model' : 'scripted ledger model configuration'), materialDigest: sha256('frozen design material') }
  const attempt = { attemptId: scenario === 'identity' ? 'changed' : caseDesignAttemptId(body), ...body, ...(scenario === 'extra' ? { extra: true } : {}) }
  expect(() => ledger.recordConversationCaseDesignAttempt(attempt)).toThrow()
  expect(new EvolutionLedger(root).listConversationCaseDesignAttempts()).toEqual([])
  expect(() => parseConversationCaseDesignAttempt({ ...attempt, consentRevision: 1.5 })).toThrow()
})

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

function fileOpening(tasks: readonly [ConversationTask, ConversationTask, ConversationTask], assessments: readonly (string | undefined)[] = [], fileMode: 'files' | 'chat' = 'files'): GuidanceStudyOpened {
  const { kind: _kind, studyId: _id, ...base } = opening(tasks, 'first', assessments)
  const body: GuidanceStudyBody = { ...base, evaluationMode: 'local-files', fileOutputKind: fileMode, cases: base.cases.map(item => {
    if (!('prompt' in item)) return item
    const files = { schemaVersion: 'tianwen.conversation-file-material.v1' as const, outputKind: fileMode, cwd: process.platform === 'win32' ? 'D:/DevData/tianwen-conversation-tests/frozen' : '/tmp/tianwen-conversation-tests/frozen', entries: [{ path: 'pilot.txt', content: 'pilot source' }], outputPaths: fileMode === 'files' ? ['pilot.txt'] : [] }
    const material = { prompt: item.prompt, criteria: item.criteria, qualityContract: item.qualityContract!, files }
    return { id: item.id, kind: item.kind, ...material, inputDigest: guidanceInputDigest(item.prompt, files), materialDigest: sha256(material) }
  }) }
  return { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }
}

// Controlled receipts verify the real rollback and replay, not natural efficacy.
function evaluateFileStudy(ledger: EvolutionLedger, opened: GuidanceStudyOpened, fileMode: 'files' | 'chat') {
  const planned = proposalPlan(opened)
  const candidate = { ...planned.candidate, candidateSnapshot: { ...opened.parentSnapshot, fileRules: { summarization: { [fileMode]: 'Preserve pilot file scope.' } } } }
  ledger.recordConversationGuidance(candidate)
  for (const arm of planned.arms) {
    const item = opened.cases.find(item => item.id === arm.caseId)!
    const output = { answer: 'pilot', files: fileMode === 'files' ? [{ path: 'pilot.txt', content: 'pilot result' }] : [] }
    ledger.recordConversationGuidance({ kind: 'study-file-trial-captured', studyId: opened.studyId, materialDigest: item.materialDigest,
      target: { kind: 'formal', caseId: item.id, role: arm.role }, receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: fileMode, ...output, outputDigest: sha256(output),
        workerMaterialDigest: 'prompt' in item ? sha256({ prompt: item.prompt, files: item.files }) : sha256(item.id), executionProof: arm.executionProof } })
    ledger.recordConversationGuidance({ ...arm, outputDigest: sha256(output), behaviorVersion: arm.role === 'baseline' ? opened.parentVersion : guidanceVersion(candidate.candidateSnapshot) })
  }
  const decision = ledger.conversationGuidanceDecision(opened.studyId); ledger.recordConversationGuidance(decision)
  return { candidate, decision }
}

function fileRegressionScene(fileMode: 'files' | 'chat' = 'files') {
  const root = ledgerRoot(); let tick = 0
  const ledger = new EvolutionLedger(root, { clock: () => new Date(Date.UTC(2026, 9, 1) + tick++ * 1000).toISOString() })
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const sources = [1, 2, 3].map(turn => task(ledger, turn, turn === 3 ? 'met' : 'not-met', scope, undefined, undefined, undefined, undefined, fileMode)) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  const opened = fileOpening(sources, [], fileMode); ledger.recordConversationGuidance(opened)
  const { candidate, decision } = evaluateFileStudy(ledger, opened, fileMode)
  ledger.recordConversationGuidance({ kind: 'guidance-activated', studyId: opened.studyId, expectedParentVersion: opened.parentVersion, decisionDigest: sha256(decision) })
  const later = (turn: number, inputs = [{ path: 'pilot.txt', content: `different input ${turn}` }], request = 'Summarize these files.', verdict: 'met' | 'not-met' = 'not-met', captureContent = true) =>
    task(ledger, turn, verdict, scope, request, undefined, undefined, undefined, fileMode, false, true, undefined, 'summarization', inputs, true, captureContent)
  const rollback = (failures: readonly ConversationTask[]) => ({ kind: 'guidance-rolled-back' as const, studyId: opened.studyId,
    expectedCurrentVersion: guidanceVersion(candidate.candidateSnapshot), reason: 'regression' as const, evidenceTaskIds: failures.map(task => task.source.taskId), evidenceInputPolicy: 'request-content.v1' as const })
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: ledger } })
  const reconcile = () => (service as unknown as { rollbackIfNeeded(scopeKey: string): void }).rollbackIfNeeded(scope)
  return { root, ledger, opened, candidate, later, rollback, reconcile }
}

it('rolls back file regression with the same request and two different captured preimages, then cold replays', () => {
  const f = fileRegressionScene(), failures = [f.later(4), f.later(5)], record = f.rollback(failures)
  expect(failures[0]!.source.requestDigest).not.toBe(failures[1]!.source.requestDigest)
  expect(failures[0]!.source.requestContentDigest).toBe(failures[1]!.source.requestContentDigest)
  f.ledger.recordConversationGuidance(record)
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  const before = readFileSync(join(f.root, 'ledger.jsonl'), 'utf8'), replay = new EvolutionLedger(f.root)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(record)
  expect(replay.recordConversationGuidance(record)).toEqual({ duplicate: true })
  expect(readFileSync(join(f.root, 'ledger.jsonl'), 'utf8')).toBe(before)
})

it('automatically reconciles two different file inputs without counting one failure twice', () => {
  const f = fileRegressionScene(); const first = f.later(4)
  f.reconcile(); f.reconcile()
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.candidate.candidateSnapshot)
  const second = f.later(5); f.reconcile()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback([first, second]))
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
})

it('automatically rolls back a file-to-chat method with distinct captured inputs and preserves cold recovery', () => {
  const f = fileRegressionScene('chat'), failures = [f.later(4), f.later(5)]
  f.reconcile()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(failures))
  const replay = new EvolutionLedger(f.root)
  expect(replay.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(f.rollback(failures))
})

it.each(['identical', 'read-order', 'path-case'] as const)('does not manufacture distinct file regression from %s inputs', scenario => {
  const f = fileRegressionScene(), firstInputs = [{ path: 'a.txt', content: 'first source' }, { path: 'b.txt', content: 'second source' }]
  const secondInputs = scenario === 'read-order' ? [...firstInputs].reverse() : scenario === 'path-case' ? firstInputs.map(input => ({ ...input, path: input.path.toUpperCase() })) : firstInputs
  const failures = [f.later(4, firstInputs), f.later(5, secondInputs)]
  f.reconcile()
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.candidate.candidateSnapshot)
  expect(() => f.ledger.recordConversationGuidance(f.rollback(failures))).toThrow(/distinct|regression|input/)
})

it('retains old untagged file regression replay and idempotence without migrating its bytes', () => {
  const f = fileRegressionScene(), failures = [f.later(4, undefined, 'First request'), f.later(5, undefined, 'Second request')]
  const { evidenceInputPolicy: _policy, ...legacy } = f.rollback(failures)
  const path = join(f.root, 'ledger.jsonl')
  appendFileSync(path, `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-10-01T01:00:00.000Z', record: legacy })}\n`)
  const before = readFileSync(path, 'utf8'), replay = new EvolutionLedger(f.root)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(legacy)
  expect(replay.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  expect(replay.recordConversationGuidance(legacy)).toEqual({ duplicate: true })
  expect(readFileSync(path, 'utf8')).toBe(before)
})

it('requires the new file regression policy on new writes even for different request strings', () => {
  const f = fileRegressionScene(), failures = [f.later(4, undefined, 'First request'), f.later(5, undefined, 'Second request')]
  const { evidenceInputPolicy: _policy, ...legacy } = f.rollback(failures)
  expect(() => f.ledger.recordConversationGuidance(legacy)).toThrow(/policy|input/)
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
})

it.each(['missing-inputs', 'empty-inputs', 'missing-result', 'wrong-digest', 'unavailable', 'failed', 'wrong-kind'] as const)('excludes %s from captured file regression identity and automatic rollback', scenario => {
  const f = fileRegressionScene(), first = f.later(4), second = f.later(5)
  const modified: ConversationTask = structuredClone(second)
  const invalid: ConversationTask = scenario === 'missing-inputs' ? (() => { const { fileInputs: _inputs, ...rest } = modified; return rest })()
    : scenario === 'empty-inputs' ? { ...modified, fileInputs: [] }
    : scenario === 'missing-result' ? { ...modified, completion: (() => { const { files: _files, ...rest } = modified.completion!; return rest })() }
    : scenario === 'wrong-digest' ? { ...modified, completion: { ...modified.completion!, files: { ...modified.completion!.files!, inputsDigest: sha256('wrong') } } }
    : scenario === 'unavailable' ? { ...modified, fileUnavailable: { kind: 'task-file-evidence-unavailable', taskId: modified.source.taskId, reason: 'material-unavailable' } }
    : scenario === 'failed' ? { ...modified, completion: { ...modified.completion!, status: 'failed' } }
    : { ...modified, completion: { ...modified.completion!, files: { ...modified.completion!.files!, outputKind: 'chat' } } }
  expect(conversationFileTaskInputDigest(invalid)).toBeUndefined()
  // The valid ledger refuses these inconsistent records earlier. A read-side
  // projection must still not silently fall back to the request string.
  const stored = f.ledger.listConversationTasks()
  vi.spyOn(f.ledger, 'listConversationTasks').mockReturnValue(stored.map(task => task.source.taskId === second.source.taskId ? invalid : task))
  f.reconcile()
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.candidate.candidateSnapshot)
  expect(conversationFileTaskInputDigest(first)).toMatch(/^sha256:/)
})

it('does not use candidate outputs, answer IDs or output path order as file regression inputs', () => {
  const f = fileRegressionScene(), value = f.later(4, [{ path: 'a.txt', content: 'original A' }, { path: 'b.txt', content: 'original B' }])
  const changed: ConversationTask = { ...value, completion: { ...value.completion!, assistantMessageIds: ['different-answer'], resultDigest: sha256('different-answer'),
    files: { ...value.completion!.files!, entries: value.completion!.files!.entries.map(entry => ({ ...entry, content: 'different candidate output' })), outputPaths: [...value.completion!.files!.outputPaths].reverse() } } }
  expect(conversationFileTaskInputDigest(changed)).toBe(conversationFileTaskInputDigest(value))
})

it('does not manufacture distinct file input from two real native message identities with identical content', () => {
  const f = fileRegressionScene(), first = f.later(4), second = f.later(5, first.fileInputs!.map(({ path, content }) => ({ path, content: content! })))
  const one = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summarize these files.' }] })
  const two = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Summarize these files.' }] })
  const withNativeSource = (task: ConversationTask, message: typeof one) => ({ ...task, source: { ...task.source,
    requestDigest: sha256([message]), requestContentDigest: sha256([message.content]) } })
  const a = withNativeSource(first, one), b = withNativeSource(second, two)
  expect(a.source.requestDigest).not.toBe(b.source.requestDigest)
  expect(a.source.requestContentDigest).toBe(b.source.requestContentDigest)
  expect(conversationFileTaskInputDigest(a)).toBe(conversationFileTaskInputDigest(b))
})

it('distinguishes absent input from empty captured file input', () => {
  const f = fileRegressionScene(), value = f.later(4)
  const variant = (content: string | null): ConversationTask => {
    const fileInputs = value.fileInputs!.map(input => ({ ...input, content }))
    return { ...value, fileInputs,
      completion: { ...value.completion!, files: { ...value.completion!.files!, inputsDigest: sha256(fileInputs.map(({ path, content }) => ({ path, content }))) } } }
  }
  expect(conversationFileTaskInputDigest(variant(null))).toMatch(/^sha256:/)
  expect(conversationFileTaskInputDigest(variant(null))).not.toBe(conversationFileTaskInputDigest(variant('')))
})

it('does not treat a successful later file task as a second regression', () => {
  const f = fileRegressionScene(), failures = [f.later(4), f.later(5, undefined, undefined, 'met')]
  f.reconcile()
  expect(f.ledger.getConversationGuidance(scope)).toEqual(f.candidate.candidateSnapshot)
  expect(() => f.ledger.recordConversationGuidance(f.rollback(failures))).toThrow(/failed tasks/)
})

it('keeps text regression request identity and forbids borrowing a file policy', () => {
  const f = seeded(), value = evaluated(f.ledger, opening(f.tasks)); f.ledger.recordConversationGuidance(activation(value))
  // Explicit later clock avoids relying on the wall-clock millisecond tick.
  const laterLedger = new EvolutionLedger(f.root, { clock: () => '2099-01-01T00:00:00.000Z' })
  const failures = [task(laterLedger, 4), task(laterLedger, 5)]
  const record = { kind: 'guidance-rolled-back' as const, studyId: value.opened.studyId, expectedCurrentVersion: guidanceVersion(value.candidate.candidateSnapshot), reason: 'regression' as const, evidenceTaskIds: failures.map(task => task.source.taskId), evidenceInputPolicy: 'request-content.v1' as const }
  expect(() => laterLedger.recordConversationGuidance({ ...record, evidenceInputPolicy: 'captured-files.v1' })).toThrow(/regression/)
  laterLedger.recordConversationGuidance(record)
  expect(new EvolutionLedger(f.root).getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
})

it.each(['unknown-policy', 'wrong-reason', 'explicit-undefined'] as const)('rejects %s file regression policy records', scenario => {
  const f = fileRegressionScene(), record = f.rollback([f.later(4), f.later(5)])
  expect(() => parseConversationGuidanceRecord(scenario === 'wrong-reason' ? { ...record, reason: 'consent-disabled' }
    : { ...record, evidenceInputPolicy: scenario === 'unknown-policy' ? 'other.v1' : undefined })).toThrow(/policy/)
})

function contentSourceScene(scenario: 'text' | 'message-id' | 'read-order' | 'path-case' | 'different-content' | 'different-files' | 'legacy') {
  const directory = ledgerRoot(), ledger = new EvolutionLedger(directory)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const inputs = [{ path: 'a.txt', content: 'first fact' }, { path: 'b.txt', content: 'second fact' }]
  const secondInputs = scenario === 'read-order' ? [...inputs].reverse() : scenario === 'path-case' ? inputs.map(input => ({ ...input, path: input.path.toUpperCase() }))
    : scenario === 'different-files' ? inputs.map(input => ({ ...input, content: `new ${input.content}` })) : inputs
  const captureContent = scenario !== 'legacy'
  const make = (turn: number, request: string, entries = inputs) => task(ledger, turn, turn === 3 ? 'met' : 'not-met', scope, request,
    undefined, undefined, undefined, scenario === 'text' ? undefined : 'files', false, true, undefined, 'summarization', entries, true, captureContent)
  const tasks = [make(1, 'Summarize the supplied facts.'), make(2, scenario === 'different-content' ? 'Write a different summary of the supplied facts.' : 'Summarize the supplied facts.', secondInputs), make(3, 'Independent successful task.')] as const
  const opened = scenario === 'text' ? opening(tasks) : fileOpening(tasks)
  const body = { scopeKey: scope, consentRevision: 1, parentVersion: opened.parentVersion, sourceTaskIds: opened.sourceTaskIds, counterexampleTaskId: opened.counterexampleTaskId,
    modelConfigDigest: opened.modelConfigDigest, materialDigest: sha256('controlled case-design material') }
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: ledger } })
  vi.spyOn(taskMaterial, 'recoverConversationTaskMaterial').mockImplementation(async (_ctx, task) => ({ request: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: task.source.taskId === tasks[2].source.taskId ? 'Independent successful task.' : task.source.taskId === tasks[1].source.taskId && scenario === 'different-content' ? 'Write a different summary of the supplied facts.' : 'Summarize the supplied facts.' }] })], context: [], objective: 'Summarize.', criteria: ['Preserve facts.'], files: {
    schemaVersion: 'tianwen.conversation-file-material.v1', cwd: directory, outputKind: 'files', entries: task.fileInputs!.map(({ path, content }) => ({ path, content })), outputPaths: task.completion!.files!.outputPaths } }))
  return { directory, ledger, tasks, opened, service, attempt: { attemptId: caseDesignAttemptId(body), ...body } }
}

it.each(['text', 'message-id', 'read-order', 'path-case'] as const)('rejects duplicate %s source contents before selection, case design and study writes', async scenario => {
  const f = contentSourceScene(scenario)
  expect(f.tasks[0].source.requestDigest).not.toBe(f.tasks[1].source.requestDigest)
  expect(conversationTaskInputDigest(f.tasks[0])).toBe(conversationTaskInputDigest(f.tasks[1]))
  expect(await f.service.readiness(scope)).toEqual({ state: 'awaiting-compatible-sources' })
  expect(() => f.ledger.recordConversationCaseDesignAttempt(f.attempt)).toThrow(/distinct task contents/)
  expect(() => f.ledger.recordConversationGuidance(f.opened)).toThrow(/distinct task contents/)
  expect(f.ledger.listConversationCaseDesignAttempts()).toEqual([])
  expect(f.ledger.listConversationGuidanceStudies()).toEqual([])
})

it.each(['different-content', 'different-files'] as const)('retains two source inputs with %s', async scenario => {
  const f = contentSourceScene(scenario)
  expect(await f.service.readiness(scope)).toEqual({ state: 'ready-to-schedule' })
  f.ledger.recordConversationCaseDesignAttempt(f.attempt)
  f.ledger.recordConversationGuidance(f.opened)
  expect(new EvolutionLedger(f.directory).listConversationGuidanceStudies()[0]?.opened).toEqual(f.opened)
})

it('deduplicates accurately recovered legacy file source content without backfilling the ledger', async () => {
  const f = contentSourceScene('legacy'), before = readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')
  expect(f.tasks.every(task => task.source.requestContentDigest === undefined)).toBe(true)
  expect(await f.service.readiness(scope)).toEqual({ state: 'awaiting-compatible-sources' })
  expect(readFileSync(join(f.directory, 'ledger.jsonl'), 'utf8')).toBe(before)
})

it('preserves a recorded duplicate-source study and decision without allowing new activation', () => {
  const f = contentSourceScene('message-id'), path = join(f.directory, 'ledger.jsonl')
  // A controlled old-rule opening uses distinct source identities; it is not
  // a newly allowed study or a regraded historical natural result.
  appendFileSync(path, `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-10-01T01:00:00.000Z', record: f.opened })}\n`)
  const ledger = new EvolutionLedger(f.directory), value = evaluateFileStudy(ledger, f.opened, 'files')
  expect(value.decision.verdict).toBe('accepted')
  const before = readFileSync(path, 'utf8'), replay = new EvolutionLedger(f.directory)
  expect(replay.isConversationGuidanceSupported(f.opened.studyId)).toBe(true)
  expect(replay.recordConversationGuidance(f.opened)).toEqual({ duplicate: true })
  expect(() => replay.recordConversationGuidance({ kind: 'guidance-activated', studyId: f.opened.studyId, expectedParentVersion: f.opened.parentVersion, decisionDigest: sha256(value.decision) })).toThrow(/distinct task contents/)
  expect(readFileSync(path, 'utf8')).toBe(before)
})

it.each([undefined, 'captured-files.v1'] as const)('retains %s regression meaning despite optional new source content fields', policy => {
  const f = fileRegressionScene(), inputs = [{ path: 'pilot.txt', content: 'same captured fact' }], failures = [f.later(4, inputs), f.later(5, inputs)]
  expect(failures[0]!.source.requestDigest).not.toBe(failures[1]!.source.requestDigest)
  expect(conversationTaskInputDigest(failures[0]!)).toBe(conversationTaskInputDigest(failures[1]!))
  const { evidenceInputPolicy: _current, ...base } = f.rollback(failures), record = { ...base, ...(policy === undefined ? {} : { evidenceInputPolicy: policy }) }
  const path = join(f.root, 'ledger.jsonl')
  appendFileSync(path, `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-10-01T01:00:00.000Z', record })}\n`)
  const before = readFileSync(path, 'utf8'), replay = new EvolutionLedger(f.root)
  expect(replay.getConversationGuidance(scope)).toEqual(f.opened.parentSnapshot)
  expect(replay.listConversationGuidanceStudies()[0]?.rollback).toEqual(record)
  expect(replay.recordConversationGuidance(record)).toEqual({ duplicate: true })
  expect(readFileSync(path, 'utf8')).toBe(before)
})

it('requires new complete content evidence for regression without borrowing missing historical identities', () => {
  const f = fileRegressionScene(), failures = [f.later(4, undefined, undefined, undefined, false), f.later(5)]
  expect(conversationTaskInputDigest(failures[0]!)).toBeUndefined()
  f.reconcile()
  expect(f.ledger.listConversationGuidanceStudies()[0]?.rollback).toBeUndefined()
  expect(() => f.ledger.recordConversationGuidance(f.rollback(failures))).toThrow(/distinct later failed tasks/)
})

it('deduplicates identical text contents with real message IDs before rolling back on a genuinely different later input', () => {
  const f = seeded(), value = evaluated(f.ledger, opening(f.tasks)); f.ledger.recordConversationGuidance(activation(value))
  const ledger = new EvolutionLedger(f.root, { clock: () => '2099-01-01T00:00:00.000Z' })
  const later = (turn: number, request = 'Same summary task.') => task(ledger, turn, 'not-met', scope, request, undefined, undefined, undefined, undefined, false, true, undefined, 'summarization', undefined, true)
  const first = later(4), repeated = later(5)
  expect(first.source.requestDigest).not.toBe(repeated.source.requestDigest)
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: ledger } })
  const reconcile = () => (service as unknown as { rollbackIfNeeded(scopeKey: string): void }).rollbackIfNeeded(scope)
  reconcile()
  expect(ledger.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
  const distinct = later(6, 'Different summary task.'); reconcile()
  expect(ledger.listConversationGuidanceStudies()[0]?.rollback).toMatchObject({ evidenceInputPolicy: 'request-content.v1', evidenceTaskIds: [first.source.taskId, distinct.source.taskId] })
  expect(new EvolutionLedger(f.root).getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
})

it('retains complete content blocks and message boundaries rather than folding them to plain text', () => {
  const one = [{ content: [{ type: 'text', text: 'ab' }] }]
  expect(conversationRequestContentDigest(one)).not.toBe(conversationRequestContentDigest([{ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }]))
  expect(conversationRequestContentDigest(one)).not.toBe(conversationRequestContentDigest([{ content: [{ type: 'text', text: 'a' }] }, { content: [{ type: 'text', text: 'b' }] }]))
  expect(conversationRequestContentDigest(one)).not.toBe(conversationRequestContentDigest([{ content: [{ type: 'text', text: 'ab ' }] }]))
})

it('selects compatible file sources through the ledger and cold replays private target-bound receipts', () => {
  const root = ledgerRoot(); const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const tasks = [1, 2, 3].map(turn => task(ledger, turn, turn === 3 ? 'met' : 'not-met', scope, undefined, undefined, undefined, undefined, 'files')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  const opened = fileOpening(tasks)
  ledger.recordConversationGuidance(opened)
  const candidate = { ...proposalPlan(opened).candidate, candidateSnapshot: { ...opened.parentSnapshot, fileRules: { summarization: { files: 'Preserve the pilot duration in files.' } } } }
  ledger.recordConversationGuidance(candidate)
  const output = { answer: 'pilot', files: [{ path: 'pilot.txt', content: 'pilot result' }] }
  const receipt = { kind: 'study-file-trial-captured' as const, studyId: opened.studyId, materialDigest: opened.cases[0]!.materialDigest,
    target: { kind: 'formal' as const, caseId: opened.cases[0]!.id, role: 'baseline' as const }, receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1' as const, outputKind: 'files' as const, ...output, outputDigest: sha256(output), workerMaterialDigest: sha256('original worker'), executionProof: proof('native-file-execution') } }
  ledger.recordConversationGuidance(receipt)
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()[0]!.fileTrials).toEqual([receipt])
  expect(replay.listConversationGuidanceStudies()[0]!.arms).toEqual([])
  expect(replay.recordConversationGuidance(receipt)).toEqual({ duplicate: true })
  expect(replay.listEvents().filter(isPublicLedgerEvent).some(event => event.type === 'conversation-guidance-recorded')).toBe(false)
  const arm = { ...proposalPlan(opened).arms[0]!, executionProof: receipt.receipt.executionProof, outputDigest: receipt.receipt.outputDigest }
  replay.recordConversationGuidance(arm)
  expect(new EvolutionLedger(root).listConversationGuidanceStudies()[0]!.arms).toEqual([arm])
  const mixed = task(replay, 4, 'not-met', scope, undefined, undefined, undefined, undefined, 'chat')
  expect(() => replay.recordConversationGuidance(fileOpening([tasks[0], mixed, tasks[2]]))).toThrow(/compatible/)
  replay.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
  expect(() => replay.recordConversationGuidance({ ...receipt, target: { ...receipt.target, role: 'candidate' }, receipt: { ...receipt.receipt, executionProof: proof('new-session') } })).toThrow(/consent/)
})

it('withdraws inherited file guidance through the actual later text head with verified ancestor invalidation', () => {
  const root = ledgerRoot(); const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const initialTextTasks = [1, 2, 3].map(turn => task(ledger, turn, turn === 3 ? 'met' : 'not-met')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  const initialText = evaluated(ledger, opening(initialTextTasks, 'initial-text')); ledger.recordConversationGuidance(activation(initialText))
  const tasks = [4, 5, 6].map(turn => task(ledger, turn, 'met', scope, undefined, undefined, undefined, undefined, 'files')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  const assessments = [nativeFeedback(ledger, tasks[0]), nativeFeedback(ledger, tasks[1])]
  const { kind: _fileKind, studyId: _fileId, ...fileBody } = fileOpening(tasks, assessments.map(item => item.started.assessmentId))
  const fileIdentity = { ...fileBody, parentSnapshot: ledger.getConversationGuidance(scope), parentVersion: guidanceVersion(ledger.getConversationGuidance(scope)) }
  const opened: GuidanceStudyOpened = { kind: 'study-opened', studyId: guidanceStudyId(fileIdentity), ...fileIdentity }
  ledger.recordConversationGuidance(opened)
  const planned = proposalPlan(opened)
  const candidate = { ...planned.candidate, candidateSnapshot: { ...opened.parentSnapshot, fileRules: { summarization: { files: 'Preserve pilot file scope.' } } } }
  ledger.recordConversationGuidance(candidate)
  for (const arm of planned.arms) {
    const item = opened.cases.find(item => item.id === arm.caseId)!
    const output = { answer: 'pilot', files: [{ path: 'pilot.txt', content: 'pilot result' }] }
    ledger.recordConversationGuidance({ kind: 'study-file-trial-captured', studyId: opened.studyId, materialDigest: item.materialDigest,
      target: { kind: 'formal', caseId: item.id, role: arm.role }, receipt: { schemaVersion: 'tianwen.conversation-file-trial-receipt.v1', outputKind: 'files', ...output, outputDigest: sha256(output),
        workerMaterialDigest: 'prompt' in item ? sha256({ prompt: item.prompt, files: item.files }) : sha256(item.id), executionProof: arm.executionProof } })
    ledger.recordConversationGuidance({ ...arm, outputDigest: sha256(output), behaviorVersion: arm.role === 'baseline' ? opened.parentVersion : guidanceVersion(candidate.candidateSnapshot) })
  }
  const decision = ledger.conversationGuidanceDecision(opened.studyId); ledger.recordConversationGuidance(decision)
  ledger.recordConversationGuidance({ kind: 'guidance-activated', studyId: opened.studyId, expectedParentVersion: opened.parentVersion, decisionDigest: sha256(decision) })
  expect(ledger.getConversationGuidance(scope).rules).toEqual(initialText.candidate.candidateSnapshot.rules)
  const textTasks = [7, 8, 9].map(turn => task(ledger, turn, turn === 9 ? 'met' : 'not-met')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  expect(() => ledger.recordConversationGuidance({ kind: 'guidance-rolled-back', studyId: opened.studyId, expectedCurrentVersion: guidanceVersion(candidate.candidateSnapshot), reason: 'regression', evidenceTaskIds: textTasks.slice(0, 2).map(task => task.source.taskId) })).toThrow(/regression/)
  const { kind: _kind, studyId: _id, ...textBody } = opening(textTasks, 'text')
  const body = { ...textBody, parentSnapshot: ledger.getConversationGuidance(scope), parentVersion: guidanceVersion(ledger.getConversationGuidance(scope)) }
  const text = evaluated(ledger, { kind: 'study-opened', studyId: guidanceStudyId(body), ...body }); ledger.recordConversationGuidance(activation(text))
  expect(ledger.getConversationGuidance(scope).fileRules?.summarization?.files).toBe('Preserve pilot file scope.')
  expect(() => ledger.recordConversationGuidance({ kind: 'guidance-rolled-back', studyId: text.opened.studyId, expectedCurrentVersion: guidanceVersion(text.candidate.candidateSnapshot), reason: 'ancestor-invalidated', ancestorStudyId: opened.studyId, evidenceTaskIds: [] })).toThrow(/actually invalidated/)
  retract(ledger, assessments[0]!)
  ledger.retireIncompatibleConversationGuidance(scope)
  expect(ledger.getConversationGuidance(scope)).toEqual(initialText.candidate.candidateSnapshot)
  expect(ledger.listConversationGuidanceStudies().map(study => study.rollback?.reason)).toEqual([undefined, 'support-retracted', 'ancestor-invalidated'])
  expect(new EvolutionLedger(root).getConversationGuidance(scope)).toEqual(initialText.candidate.candidateSnapshot)
})

function proposalPlan(opened: GuidanceStudyOpened) {
  const candidate: GuidanceCandidateRecord = { kind: 'candidate-recorded', studyId: opened.studyId,
    candidateSnapshot: { ...opened.parentSnapshot, rules: { summarization: `Preserve the pilot qualification for ${opened.cases[0]!.id}.` } },
    proposalProof: proof(`${opened.studyId}:proposal`) }
  const arms: GuidanceArmRecord[] = opened.cases.flatMap(item => (['baseline', 'candidate'] as const).map(role => ({
    kind: 'arm-recorded', studyId: opened.studyId, caseId: item.id, role, materialDigest: item.materialDigest,
    behaviorVersion: guidanceVersion(role === 'baseline' ? opened.parentSnapshot : candidate.candidateSnapshot),
    executionProof: proof(`${opened.studyId}:${item.id}:${role}:execute`), judgeProof: proof(`${opened.studyId}:${item.id}:${role}:judge`),
    outputDigest: sha256(`${item.id}:${role}:actual output`), verdict: role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met',
    ...(['tianwen.conversation-quality.v2', 'tianwen.conversation-quality.v3', 'tianwen.conversation-quality.v4', 'tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(opened.qualityContract?.schemaVersion ?? '') ? {
      reviewChecks: opened.qualityContract?.schemaVersion === 'tianwen.conversation-quality.v4'
        ? auditedChecks(`${opened.studyId}:${item.id}:${role}:judge`, role === 'baseline' && item.kind === 'source1' ? 'not-met' : 'met', 'v1')
        : ['tianwen.conversation-quality.v5', 'tianwen.conversation-quality.v6', 'tianwen.conversation-quality.v7', 'tianwen.conversation-quality.v8', 'tianwen.conversation-quality.v9', 'tianwen.conversation-quality.v10', 'tianwen.conversation-quality.v11'].includes(opened.qualityContract?.schemaVersion ?? '')
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

it('quarantines new activation writes while retaining accepted decisions and historical active replay', () => {
  const { root, ledger, tasks } = seeded()
  const value = evaluated(ledger, opening(tasks, 'quarantine'))
  expect(value.decision.verdict).toBe('accepted')
  const held = new EvolutionLedger(root, { guidanceActivationQuarantine: true })
  expect(held.listConversationGuidanceStudies()[0]?.decision).toEqual(value.decision)
  expect(held.getConversationGuidance(scope)).toEqual(value.opened.parentSnapshot)
  expect(() => held.recordConversationGuidance(activation(value))).toThrow(/quarantin/i)
  expect(new EvolutionLedger(root, { guidanceActivationQuarantine: true }).listConversationGuidanceStudies()[0]?.activation).toBeUndefined()

  ledger.recordConversationGuidance(activation(value))
  const replay = new EvolutionLedger(root, { guidanceActivationQuarantine: true })
  expect(replay.getConversationGuidance(scope)).toEqual(value.candidate.candidateSnapshot)
  expect(replay.recordConversationGuidance(activation(value))).toEqual({ duplicate: true })
})

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

it('rejects a new study that cites a historical preference without a continuing-scope proof', () => {
  const { ledger, tasks } = seeded()
  const target = tasks[0]
  ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId,
    messageId: target.completion!.assistantMessageIds[0]!, feedbackVersion: 'future-v1', rating: 'negative',
    note: 'For future summaries, use two sentences.', scopeKey: target.source.scopeKey,
    sessionDigest: sha256('future session'), evidenceIds: [target.completion!.resultDigest] },
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1 })
  const status = ledger.getLearningIntakeStatus(target.source.sessionId, target.completion!.assistantMessageIds[0]!)!
  const source: ConversationFeedbackSource = { kind: 'native', sessionId: target.source.sessionId,
    sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, messageId: target.completion!.assistantMessageIds[0]!,
    feedbackVersion: 'future-v1', feedbackFingerprint: status.feedbackFingerprint }
  const started: ConversationFeedbackStarted = { kind: 'feedback-assessment-started', taskId: target.source.taskId,
    assessmentId: conversationFeedbackAssessmentId({ taskId: target.source.taskId, source }), source,
    admissionDigest: sha256(target.admission), resultDigest: target.completion!.resultDigest,
    materialDigest: sha256('frozen preference'), consentRevision: 1 }
  ledger.recordConversationFeedback(started)
  ledger.recordConversationFeedback({ kind: 'feedback-assessed', assessmentId: started.assessmentId, taskId: started.taskId,
    classification: 'preference', category: 'user-preference', supplementalCriteria: ['Use two sentences for future summaries.'],
    explanation: 'The user asks for a future style.', evidenceQuotes: ['future summaries'],
    proof: proof('preference-judge'), unavailableReason: null })
  expect(() => ledger.recordConversationGuidance(opening(tasks, 'unverified-scope', [started.assessmentId])))
    .toThrow(/verified continuing feedback scope/)
})

it('requires a current marked incomplete local-file task and its exact active feedback assessment for a proposal clue', () => {
  const root = ledgerRoot(); const ledger = new EvolutionLedger(root)
  ledger.recordLearningAnalysisConsent({ revision: 1, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  const sources = [1, 2, 3].map(turn => task(ledger, turn, turn === 3 ? 'met' : 'not-met', scope, undefined, undefined, undefined, undefined, 'files')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask]
  const unmarked = task(ledger, 4, 'inconclusive', scope, 'incomplete clue request', undefined, undefined, undefined, 'files', false, false)
  const marked = task(ledger, 5, 'inconclusive', scope, 'marked incomplete clue request', undefined, undefined, undefined, 'files', true, false)
  const unmarkedAssessment = nativeFeedback(ledger, unmarked)
  const markedAssessment = nativeFeedback(ledger, marked)
  const withClue = (target: ConversationTask, assessment: ReturnType<typeof nativeFeedback>) => {
    const { kind: _kind, studyId: _studyId, ...base } = fileOpening(sources)
    const proposalClues = [{ taskId: target.source.taskId, assessmentId: assessment.started.assessmentId,
      assessmentDigest: sha256(assessment.result), materialDigest: assessment.started.materialDigest }]
    const body = { ...base, proposalClues }
    return { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }
  }
  expect(() => ledger.recordConversationGuidance(withClue(unmarked, unmarkedAssessment))).toThrow(/clue|marker|support/i)
  const opened = withClue(marked, markedAssessment)
  expect(ledger.recordConversationGuidance(opened)).toEqual({ duplicate: false })
  expect(ledger.isConversationGuidanceSupported(opened.studyId)).toBe(true)
  retract(ledger, markedAssessment)
  expect(ledger.isConversationGuidanceSupported(opened.studyId)).toBe(false)
})

it.each(['text-study', 'file-study', 'v1-external', 'unmarked', 'complete-text', 'complete-file', 'subjective', 'family', 'scope', 'model', 'category', 'consent', 'pending', 'positive'] as const)('validates v2 external clue compatibility on disk replay: %s', scenario => {
  const { root, ledger, tasks } = seeded()
  const fileStudy = scenario === 'file-study'
  const sources = fileStudy ? [10, 11, 12].map(turn => task(ledger, turn, turn === 12 ? 'met' : 'not-met', scope, undefined, undefined, undefined, undefined, 'files')) as unknown as readonly [ConversationTask, ConversationTask, ConversationTask] : tasks
  const target = task(ledger, 20, 'inconclusive', scenario === 'scope' ? 'other-scope' : scope, 'external feedback clue', scenario === 'model' ? [sha256('different model')] : undefined, undefined, undefined,
    scenario === 'complete-file' ? 'files' : undefined, scenario === 'unmarked' ? false : scenario === 'v1-external' ? true : 'feedback.v2', true,
    scenario === 'complete-file' || scenario === 'complete-text' ? undefined : scenario === 'subjective' ? 'subjective' : 'external', scenario === 'family' ? 'writing' : 'summarization')
  const assessment = nativeFeedback(ledger, target)
  const { kind: _kind, studyId: _id, ...base } = fileStudy ? fileOpening(sources) : opening(sources)
  const body = { ...base, ...(scenario === 'category' ? { failureCategory: 'user-preference' as const } : {}), ...(scenario === 'consent' ? { consentRevision: 2 } : {}), proposalClues: [{ taskId: target.source.taskId, assessmentId: assessment.started.assessmentId, assessmentDigest: sha256(assessment.result), materialDigest: assessment.started.materialDigest }] }
  if (scenario === 'pending' || scenario === 'positive') {
    const messageId = target.completion!.assistantMessageIds[0]!
    ledger.recordLearningFeedbackRevision({ intake: { sessionId: target.source.sessionId, messageId, feedbackVersion: 'feedback-v2', rating: scenario === 'positive' ? 'positive' : 'negative', note: 'Replacement feedback.', scopeKey: scope, sessionDigest: sha256('replacement'), evidenceIds: [target.completion!.resultDigest] }, sessionLifecycleFingerprint: target.source.sessionLifecycleFingerprint, analysisConsentRevision: 1, supersedesFeedbackVersion: 'feedback-v1' })
    const status = ledger.getLearningIntakeStatus(target.source.sessionId, messageId)!
    const source = { ...assessment.started.source, feedbackVersion: 'feedback-v2', feedbackFingerprint: status.feedbackFingerprint }
    const started = { ...assessment.started, source, assessmentId: conversationFeedbackAssessmentId({ taskId: target.source.taskId, source }) }
    ledger.recordConversationFeedback(started)
    if (scenario === 'positive') ledger.recordConversationFeedback({ ...assessment.result, assessmentId: started.assessmentId, classification: 'positive', category: null, supplementalCriteria: [], proof: proof('replacement-positive') })
  }
  const opened = { kind: 'study-opened' as const, studyId: guidanceStudyId(body), ...body }
  if (scenario === 'text-study' || fileStudy) {
    expect(ledger.recordConversationGuidance(opened)).toEqual({ duplicate: false })
    expect(new EvolutionLedger(root).isConversationGuidanceSupported(opened.studyId)).toBe(true)
  } else expect(() => new EvolutionLedger(root).recordConversationGuidance(opened)).toThrow()
})

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

const naturalSourceScope = `conversation:${sha256({ cwd: 'source-ledger-fixture' })}`
function sourceSeeded(verdict: 'met' | 'not-met' = 'not-met', quality = conversationQualityContract()) {
  return seeded(verdict, naturalSourceScope, false, undefined, quality, naturalSourceScope)
}
function sourceRead(opened: GuidanceStudyOpened): GuidanceSourceReferenceReadRecord {
  const definition = { name: 'source-audit', provider: 'test-reviewed-source', source: 'bundled',
    description: 'Separate findings from unknowns.', content: 'Preserve stated uncertainty.',
    invocation: { modelInvocable: true, userInvocable: true }, metadata: { fixture: true } }
  return { kind: 'source-reference-read', studyId: opened.studyId, definition,
    reference: { name: definition.name, provider: definition.provider, digest: sha256(definition),
      origin: 'https://example.invalid/test-fixture', revision: 'fixture-v1', license: 'MIT', reviewedAt: '2026-09-08T00:00:00.000Z',
      kind: 'self-contained-text', runtime: '0.1.1-rc.2', scopeKey: opened.scopeKey,
      purpose: 'conversation-method-reference', environmentDigest: sha256('fixture-root') },
    selectionProof: proof(`${opened.studyId}:source-selection`) }
}
function sourceCandidate(opened: GuidanceStudyOpened, status: 'adapted' | 'not-used' = 'adapted'): GuidanceCandidateRecord {
  return { ...proposalPlan(opened).candidate, sourceUse: { readDigest: sha256(sourceRead(opened)), status, rationale: 'Considered the frozen reference.' } }
}

it.each(['adapted', 'not-used'] as const)('persists natural source %s evidence and still requires ten formal arms', status => {
  const { root, ledger, tasks } = sourceSeeded()
  const opened = opening(tasks, `source-${status}`), read = sourceRead(opened), candidate = sourceCandidate(opened, status)
  ledger.recordConversationGuidance(opened)
  expect(ledger.recordConversationGuidance(read)).toEqual({ duplicate: false })
  expect(ledger.recordConversationGuidance(read)).toEqual({ duplicate: true })
  expect(() => ledger.recordConversationGuidance({ ...read, selectionProof: proof('replacement') })).toThrow(/freeze/i)
  const replacement = { ...read.definition, content: 'Another reviewed rule.' }
  expect(() => ledger.recordConversationGuidance({ ...read, definition: replacement, reference: { ...read.reference, digest: sha256(replacement) } })).toThrow(/freeze/i)
  ledger.recordConversationGuidance(candidate)
  const arms = proposalPlan(opened).arms
  for (const arm of arms.slice(0, 9)) ledger.recordConversationGuidance(arm)
  expect(() => ledger.conversationGuidanceDecision(opened.studyId)).toThrow(/ten|complete/i)
  ledger.recordConversationGuidance(arms[9]!)
  const decision = ledger.conversationGuidanceDecision(opened.studyId)
  expect(decision.verdict).toBe('accepted')
  ledger.recordConversationGuidance(decision)
  ledger.recordLearningAnalysisConsent({ revision: 2, enabled: false, policyVersion: 'tianwen-auto-analysis.v3' })
  const history = ledger.listEvents(), studies = ledger.listConversationGuidanceStudies()
  expect(ledger.recordConversationGuidance(read)).toEqual({ duplicate: true })
  expect(ledger.recordConversationGuidance(candidate)).toEqual({ duplicate: true })
  expect(ledger.listEvents()).toEqual(history)
  const replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(studies)
  expect(replay.listEvents()).toEqual(history)
  expect(studies[0]?.sourceReference).toEqual(read)
  expect(studies[0]?.candidate?.sourceUse?.status).toBe(status)
  expect(replay.getChampion()).toBeUndefined()
})

it('persists completed exploration then source read without reducing the formal ten-arm gate', () => {
  const { root, ledger, tasks } = sourceSeeded()
  const opened = opening(tasks, 'completed-exploration-before-source'), read = sourceRead(opened), candidate = sourceCandidate(opened)
  for (const record of [opened, explorationIntent(opened), explorationArm(opened, 'control', 'not-met'), explorationArm(opened, 'treatment', 'met')]) {
    ledger.recordConversationGuidance(record)
  }
  expect(ledger.listConversationGuidanceStudies()[0]?.exploration?.result).toBeDefined()
  ledger.recordConversationGuidance(read)
  ledger.recordConversationGuidance(candidate)
  const arms = proposalPlan(opened).arms
  for (const arm of arms.slice(0, 9)) ledger.recordConversationGuidance(arm)
  expect(() => ledger.conversationGuidanceDecision(opened.studyId)).toThrow(/ten|complete/i)
  ledger.recordConversationGuidance(arms[9]!)
  const decision = ledger.conversationGuidanceDecision(opened.studyId)
  expect(decision.verdict).toBe('accepted')
  ledger.recordConversationGuidance(decision)
  const history = ledger.listEvents(), studies = ledger.listConversationGuidanceStudies(), replay = new EvolutionLedger(root)
  expect(replay.listConversationGuidanceStudies()).toEqual(studies)
  expect(replay.listEvents()).toEqual(history)
  expect(replay.recordConversationGuidance(read)).toEqual({ duplicate: true })
  expect(replay.listEvents()).toEqual(history)
  expect(studies[0]?.sourceReference).toEqual(read)
  expect(studies[0]?.candidate?.sourceUse?.readDigest).toBe(sha256(read))
})

it.each(['source-read', 'source-candidate'] as const)('rechecks real support withdrawal for %s', step => {
  const { root, ledger, tasks } = sourceSeeded('met')
  const assessments = [nativeFeedback(ledger, tasks[0]), nativeFeedback(ledger, tasks[1])]
  const opened = opening(tasks, `withdraw-${step}`, assessments.map(item => item.started.assessmentId))
  ledger.recordConversationGuidance(opened)
  if (step === 'source-candidate') ledger.recordConversationGuidance(sourceRead(opened))
  retract(ledger, assessments[0]!)
  const history = ledger.listEvents()
  const record = step === 'source-read' ? sourceRead(opened) : sourceCandidate(opened)
  expect(() => ledger.recordConversationGuidance(record)).toThrow(/support.*absent|retracted/i)
  const replay = new EvolutionLedger(root)
  expect(() => replay.recordConversationGuidance(record)).toThrow(/support.*absent|retracted/i)
  expect(replay.listEvents()).toEqual(history)
  appendFileSync(join(root, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-08T00:00:00.000Z', record })}\n`)
  expect(() => new EvolutionLedger(root)).toThrow(/support.*absent|retracted/i)
})

it.each(['source-read', 'source-candidate'] as const)('rechecks disabled and changed enabled consent for %s', step => {
  for (const enabled of [false, true]) {
    const { root, ledger, tasks } = sourceSeeded()
    const opened = opening(tasks, `consent-${step}-${enabled}`), read = sourceRead(opened)
    ledger.recordConversationGuidance(opened)
    if (step === 'source-candidate') ledger.recordConversationGuidance(read)
    ledger.recordLearningAnalysisConsent({ revision: 2, enabled, policyVersion: 'tianwen-auto-analysis.v3' })
    const history = ledger.listEvents()
    const record = step === 'source-read' ? read : sourceCandidate(opened)
    expect(() => ledger.recordConversationGuidance(record)).toThrow(/current v3 consent/i)
    if (step === 'source-candidate') expect(ledger.recordConversationGuidance(read)).toEqual({ duplicate: true })
    const replay = new EvolutionLedger(root)
    expect(() => replay.recordConversationGuidance(record)).toThrow(/current v3 consent/i)
    expect(replay.listEvents()).toEqual(history)
    appendFileSync(join(root, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-08T00:00:00.000Z', record })}\n`)
    expect(() => new EvolutionLedger(root)).toThrow(/current v3 consent/i)
  }
})

it.each(['source-read', 'source-candidate'] as const)('rejects stale parent for %s after a competing activation', step => {
  const { root, ledger, tasks } = sourceSeeded()
  const first = evaluated(ledger, opening(tasks, 'source-parent-winner'))
  const stale = opening(tasks, `source-parent-stale-${step}`)
  ledger.recordConversationGuidance(stale)
  if (step === 'source-candidate') ledger.recordConversationGuidance(sourceRead(stale))
  ledger.recordConversationGuidance(activation(first))
  const history = ledger.listEvents()
  const record = step === 'source-read' ? sourceRead(stale) : sourceCandidate(stale)
  expect(() => ledger.recordConversationGuidance(record)).toThrow(/current frozen parent|stale.*parent/i)
  const replay = new EvolutionLedger(root)
  expect(() => replay.recordConversationGuidance(record)).toThrow(/current frozen parent|stale.*parent/i)
  expect(replay.listEvents()).toEqual(history)
  appendFileSync(join(root, 'ledger.jsonl'), `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-08T00:00:00.000Z', record })}\n`)
  expect(() => new EvolutionLedger(root)).toThrow(/current frozen parent|stale.*parent/i)
})

it.each(['opened', 'read', 'candidate', 'explored-candidate'] as const)('replays frozen historical source stage %s with zero new events and blocks new old-quality mutations', stage => {
  const { root, ledger, tasks } = sourceSeeded('not-met', exactV4Quality)
  const opened = opening(tasks, `historical-source-${stage}`), read = sourceRead(opened), candidate = sourceCandidate(opened)
  const records: ConversationGuidanceRecord[] = [opened]
  if (stage !== 'opened') records.push(read)
  if (stage === 'explored-candidate') records.push(explorationIntent(opened), explorationArm(opened, 'control', 'not-met'), explorationArm(opened, 'treatment', 'met'))
  if (stage === 'candidate' || stage === 'explored-candidate') records.push(candidate)
  const state = new ConversationGuidanceState()
  for (const record of records) { state.validate(record); state.apply(record, '2026-09-07T00:00:00.000Z') }
  appendFileSync(join(root, 'ledger.jsonl'), records.map(record => `${canonicalJson({ type: 'conversation-guidance-recorded', schemaVersion: 'tianwen.conversation-guidance-record.v1', at: '2026-09-07T00:00:00.000Z', record })}\n`).join(''))
  const replay = new EvolutionLedger(root), history = replay.listEvents()
  expect(replay.listConversationGuidanceStudies()).toEqual(state.listStudies())
  expect(history).toHaveLength(ledger.listEvents().length + records.length)
  if (stage === 'opened') expect(() => replay.recordConversationGuidance(read)).toThrow(/quality|contract/i)
  if (stage === 'read') expect(() => replay.recordConversationGuidance(candidate)).toThrow(/quality|contract/i)
  if (stage !== 'opened') expect(replay.recordConversationGuidance(read)).toEqual({ duplicate: true })
  if (stage === 'candidate' || stage === 'explored-candidate') expect(replay.recordConversationGuidance(candidate)).toEqual({ duplicate: true })
  expect(replay.listEvents()).toEqual(history)
  expect(new EvolutionLedger(root).listEvents()).toEqual(history)
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

  const staleRevision = seeded()
  const staleRevisionStudy = opening(staleRevision.tasks, 'stale-revision-natural-exploration')
  staleRevision.ledger.recordConversationGuidance(staleRevisionStudy)
  staleRevision.ledger.recordLearningAnalysisConsent({ revision: 2, enabled: true, policyVersion: 'tianwen-auto-analysis.v3' })
  expect(() => staleRevision.ledger.recordConversationGuidance(explorationIntent(staleRevisionStudy))).toThrow(/current v3 consent/i)

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
      return toolCallResponse('new-admission', 'structured_output', { decision: tasks[0].admission!.decision! })
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
