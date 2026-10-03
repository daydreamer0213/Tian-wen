import { afterEach, expect, it, vi } from 'vitest'
import { conversationQualityContract, type ConversationTask } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { guidanceVersion } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import * as material from '../../packages/tianwen-runtime-bundle/src/conversation-task-material.js'

afterEach(() => vi.restoreAllMocks())
const scope = 'conversation:diagnostic-workspace'
const snapshot = { schemaVersion: 'tianwen.conversation-guidance.v1' as const, scopeKey: scope, rules: {} }
const version = guidanceVersion(snapshot)
const task = (id: string, verdict = 'inconclusive'): ConversationTask => ({
  source: { taskId: id, scopeKey: scope, sessionId: id, sessionLifecycleFingerprint: sha256(id), consentRevision: 1,
    behaviorVersion: version, requestDigest: sha256(id), requestContentDigest: sha256(id) },
  admission: { decision: { kind: 'task', family: 'code', evaluationMode: 'text', feedback: null }, qualityContract: conversationQualityContract() },
  completion: { status: 'completed', assistantMessageIds: [] }, models: [{ modelConfigDigest: sha256('same-model') }],
  review: { verdict, category: verdict === 'not-met' ? 'instruction-following' : null,
    proof: verdict === 'inconclusive' ? null : { sessionId: id, sessionDigest: sha256(id), requestDigest: sha256(id) } },
} as unknown as ConversationTask)

function fixture(tasks: ConversationTask[]) {
  const evolution = {
    getLearningAnalysisConsent: () => ({ enabled: true, policyVersion: 'tianwen-auto-analysis.v3', revision: 1 }),
    getConversationGuidance: () => snapshot,
    listConversationTasks: () => tasks,
    listConversationGuidanceStudies: () => [] as { opened: { sourceTaskIds: string[] } }[],
    listConversationCaseDesignAttempts: () => [] as { sourceTaskIds: string[] }[],
    listConversationFeedbackAssessments: () => [],
    listLearningIntakeStatuses: () => [],
    recordConversationGuidance: vi.fn(),
  }
  const service = Object.create(TianwenConversationGuidanceLoopService.prototype) as TianwenConversationGuidanceLoopService
  Object.assign(service, { ctx: { tianwenEvolution: evolution } })
  return { service, evolution, diagnostics: () => service.readiness(scope, true) }
}

const changes = {
  consentRevision: (t: any) => { t.source.consentRevision = 0 },
  behaviorVersion: (t: any) => { t.source.behaviorVersion = sha256('old-version') },
  qualityContract: (t: any) => { delete t.admission.qualityContract },
  feedbackTurn: (t: any) => { t.admission.decision.feedback = { kind: 'requirement-change' } },
  family: (t: any) => { t.admission.decision.kind = 'non-task' },
  evaluationMode: (t: any) => { t.admission.decision.evaluationMode = 'external' },
  completion: (t: any) => { t.completion.status = 'failed' },
  modelConfiguration: (t: any) => { t.models.push({ modelConfigDigest: sha256('mixed-model') }) },
}
it.each(Object.entries(changes))('explains the first original %s exclusion without changing default readiness', async (reason, change) => {
  const excluded = structuredClone(task('excluded')); change(excluded)
  const outside = structuredClone(task('outside')) as any; outside.source.scopeKey = 'other-workspace'
  const tasks = [excluded, task('eligible'), outside], original = structuredClone(tasks)
  const f = fixture(tasks)
  expect(await f.service.readiness(scope)).toEqual({ state: 'awaiting-compatible-sources' })
  const result = await f.diagnostics()
  expect(result).toMatchObject({ state: 'awaiting-compatible-sources', diagnostics: {
    observedTasks: 2, eligibleTasks: 1, problemSources: 0, successfulCandidates: 0,
    hasCompatibleProblemPair: false, hasUnattemptedProblemPair: false, exclusions: { [reason]: 1 },
  } })
  expect(Object.values(result.diagnostics!.exclusions).reduce((a, b) => a + b, 0)).toBe(1)
  expect(tasks).toEqual(original); expect(f.evolution.recordConversationGuidance).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toContain('excluded'); expect(JSON.stringify(result)).not.toContain('mixed-model')
})

it('counts only the earliest gate when several original conditions fail', async () => {
  const excluded = structuredClone(task('excluded')); changes.consentRevision(excluded); changes.evaluationMode(excluded)
  const result = await fixture([excluded]).diagnostics()
  expect(result.diagnostics!.exclusions.consentRevision).toBe(1)
  expect(result.diagnostics!.exclusions.evaluationMode).toBe(0)
})

it('distinguishes unrecoverable file material from eligible completed inconclusive work', async () => {
  const broken = task('broken') as any, readable = task('readable') as any
  for (const t of [broken, readable]) Object.assign(t.admission.decision, { evaluationMode: 'local-files', fileOutputKind: 'files' })
  const recover = vi.spyOn(material, 'recoverConversationTaskMaterial').mockImplementation(async (_ctx, t) => {
    if (t.source.taskId === 'broken') throw new Error('PRIVATE filesystem detail')
    return { files: { outputKind: 'files' } } as material.ConversationTaskMaterial
  })
  const result = await fixture([broken, readable]).diagnostics()
  expect(result).toMatchObject({ diagnostics: { observedTasks: 2, eligibleTasks: 1, problemSources: 0, exclusions: { fileMaterial: 1 } } })
  expect(recover).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain('PRIVATE')
})

it('reports paired, unused and successful-candidate facts while preserving attempt and study precedence', async () => {
  const f = fixture([task('one', 'not-met'), task('two', 'not-met'), task('counter', 'met')])
  expect(await f.diagnostics()).toMatchObject({ state: 'ready-to-schedule', diagnostics: {
    observedTasks: 3, eligibleTasks: 3, problemSources: 2, successfulCandidates: 1,
    hasCompatibleProblemPair: true, hasUnattemptedProblemPair: true,
  } })
  vi.spyOn(f.evolution, 'listConversationCaseDesignAttempts').mockReturnValue([{ sourceTaskIds: ['one', 'two'] }])
  expect(await f.diagnostics()).toMatchObject({ state: 'already-attempted', diagnostics: { hasCompatibleProblemPair: true, hasUnattemptedProblemPair: false } })
  vi.spyOn(f.evolution, 'listConversationGuidanceStudies').mockReturnValue([{ opened: { sourceTaskIds: ['one', 'two'] } }])
  expect(await f.diagnostics()).toMatchObject({ state: 'already-studied', diagnostics: { hasUnattemptedProblemPair: false } })
  expect(f.evolution.recordConversationGuidance).not.toHaveBeenCalled()
})

it.each(['same-input', 'different-model', 'different-policy'])('does not call %s problems a compatible pair', async kind => {
  const one = task('one', 'not-met'), two = structuredClone(task('two', 'not-met')) as any
  if (kind === 'same-input') two.source.requestContentDigest = one.source.requestContentDigest
  if (kind === 'different-model') two.models[0].modelConfigDigest = sha256('different-model')
  if (kind === 'different-policy') two.source.admissionPolicy = 'different-policy'
  expect(await fixture([one, two]).diagnostics()).toMatchObject({ state: 'awaiting-compatible-sources', diagnostics: { problemSources: 2, hasCompatibleProblemPair: false } })
})

it('does not count a met review with a rejected independent check as a successful candidate', async () => {
  const counter = task('counter', 'met') as any
  counter.externalCheckPrepared = { checkerId: 'checker' }
  counter.externalCheckFinished = { status: 'rejected' }
  expect(await fixture([task('one', 'not-met'), task('two', 'not-met'), counter]).diagnostics())
    .toMatchObject({ state: 'awaiting-counterexample', diagnostics: { successfulCandidates: 0, hasUnattemptedProblemPair: true } })
})

it('does not fabricate empty diagnostics when analysis is disabled', async () => {
  const f = fixture([task('one')])
  vi.spyOn(f.evolution, 'getLearningAnalysisConsent').mockReturnValue({ enabled: false, policyVersion: 'tianwen-auto-analysis.v3', revision: 1 })
  const list = vi.spyOn(f.evolution, 'listConversationTasks')
  expect(await f.diagnostics()).toEqual({ state: 'analysis-disabled' }); expect(list).not.toHaveBeenCalled()
})
