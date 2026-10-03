import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { expect, it } from 'vitest'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, parseConversationAuditedReviewChecks } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { guidanceInputDigest, guidanceStudyId, guidanceVersion, caseDesignAttemptId } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import type { GoalTaskOutcomeInput } from '../../packages/tianwen-evolution/src/goal-task-outcome.js'
import type { GoalTaskResearchSourceInput } from '../../packages/tianwen-evolution/src/goal-task-research.js'
import { conversationExternalInputsDigest } from '../../packages/tianwen-evolution/src/conversation-external-check.js'

const BASE = resolve('D:/DevData/tianwen-dsh-probe/goal-task-research')
const scopeKey = `conversation:${sha256({ cwd: 'D:/original-Goal' })}`
const snapshot = { schemaVersion: 'tianwen.conversation-guidance.v1' as const, scopeKey, rules: {} }
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256('request:'+id) })
const checks = (id: string, met: boolean) => parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({
  focus, verdict: met ? 'met' : 'not-met', category: met ? null : 'instruction-following', explanation: 'Isolated engineering proof fixture, not a natural review.',
  evidenceQuotes: ['literal output'], proof: proof(id+focus), audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(id),
    units: { 'answer-1': { firstClaim: { quote: 'literal output', kind: 'non-factual', status: 'permitted', sourceIds: [], explanation: 'fixture literal' }, additionalClaims: [] } } },
})))

function fixture(checkedCode = false) {
  mkdirSync(BASE, { recursive: true }); const root = mkdtempSync(join(BASE, 'ledger-'))
  const ledger = new EvolutionLedger(root, { guidanceActivationQuarantine: true })
  ledger.recordLearningAnalysisConsent({ enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' })
  const files = (index: number | string) => ({ schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: 'D:/original-Goal',
    outputKind: 'files' as const, entries: [{ path: 'input.txt', content: 'Original input '+index }, { path: 'output.txt', content: null }], outputPaths: ['output.txt'] })
  const sources = [1,2,3].map(index => {
    const outcome: GoalTaskOutcomeInput = { source: 'native-goal-task', goalId: 'original-goal', taskId: 'task-'+index, epoch: 1,
      origin: { sessionId: 'command', commandId: 'original-command', commandSeq: 1, commandDigest: sha256('command') },
      parentSessionId: 'planner', childSessionId: 'child-'+index, nativeGoalId: 'native-'+index, preparedSeq: 2, endSeq: 8,
      preparationDigest: sha256('prep-'+index), materialDigest: sha256('SDK-'+index), consentRevision: 1, modelConfigDigest: sha256('model'),
      checkerId: 'original-check', checkerDigest: sha256('check'), contractDigest: sha256('contract'), inputsDigest: checkedCode ? conversationExternalInputsDigest(files(index).entries) : sha256('input-'+index),
      requiredConditionDigest: sha256('condition'), outcome: checkedCode && index < 3
        ? { status: 'rejected', detail: 'Controlled original condition failure.', failedRequiredConditionDigest: sha256('condition') }
        : { status: 'verified', detail: 'functional fixture' } }
    const receipt = ledger.recordGoalTaskOutcome(outcome)
    const input: GoalTaskResearchSourceInput = { sourceKind: 'native-goal-task', sourceId: receipt.sourceId,
      outcomeInputDigest: sha256(outcome), scopeKey, family: checkedCode ? 'code' : 'writing', evaluationMode: checkedCode ? 'local-files' : 'text', behaviorVersion: guidanceVersion(snapshot),
      ...(checkedCode ? { fileOutputKind: 'files' as const, fileInputsDigest: outcome.inputsDigest } : {}),
      sessionLifecycleFingerprint: sha256('child-lifecycle-'+index), assistantMessageIds: ['answer-'+index],
      qualityContract: conversationQualityContract(), inputDigest: guidanceInputDigest('actual requirements-'+index),
      materialDigest: sha256('study material-'+index), reviewMaterialDigest: sha256('original review-'+index), checks: checks('source-'+index, checkedCode || index===3) }
    ledger.recordGoalTaskResearchSource(input)
    return ledger.listGoalTaskResearchSources().find(item => item.sourceId === receipt.sourceId)!
  })
  const nativeGoalSources = sources.map(source => ({ sourceId: source.sourceId, inputDigest: source.inputDigest }))
  const attemptBody = { scopeKey, consentRevision: 1, parentVersion: guidanceVersion(snapshot), sourceTaskIds: sources.slice(0,2).map(source => source.sourceId),
    counterexampleTaskId: sources[2]!.sourceId, modelConfigDigest: sha256('model'), materialDigest: sha256('case-design-original'), nativeGoalSources }
  const generated = (kind: 'adjacent'|'holdout') => {
    const material = { prompt: 'independent '+kind, criteria: ['Complete this new original request.'], qualityContract: conversationQualityContract(), ...(checkedCode ? { files: files(kind) } : {}) }
    return { id:kind,kind,...material,inputDigest:guidanceInputDigest(material.prompt,material.files),materialDigest:sha256(material) }
  }
  const cases=[...sources.map((source,index)=>({id:['source1','source2','counterexample'][index]!,kind:['source1','source2','counterexample'][index]!,
    sourceTaskId:source.sourceId,materialDigest:source.input.materialDigest,inputDigest:source.input.inputDigest})),generated('adjacent'),generated('holdout')]
  const body = { scopeKey, family:checkedCode ? 'code' as const : 'writing' as const, failureCategory:'instruction-following' as const, consentRevision:1,
    parentVersion:guidanceVersion(snapshot),parentSnapshot:snapshot,sourceTaskIds:attemptBody.sourceTaskIds,counterexampleTaskId:attemptBody.counterexampleTaskId,
    modelConfigDigest:sha256('model'),qualityContract:conversationQualityContract(),nativeGoalSources,caseDesignProof:proof('case-design'),
    cases, ...(checkedCode ? { evaluationMode: 'local-files' as const, fileOutputKind: 'files' as const,
      resultChecks:cases.map((item,index)=>({caseId:item.id,checkerId:'independent-study-check',checkerDigest:sha256('study checker'),contractDigest:sha256('study contract'),
        inputsDigest:index<3?sources[index]!.input.fileInputsDigest!:conversationExternalInputsDigest(files(item.kind).entries),requiredCondition:'Original condition'})) } : {}) }
  return {root,ledger,sources,attemptBody,body,remove(){if(!resolve(root).startsWith(BASE+sep))throw new Error('cleanup outside owned fixture');rmSync(root,{recursive:true,force:true})}}
}

it('consumes explicit native Goal source references in the original attempt and study owner without ConversationTask fabrication',()=>{
  const f=fixture()
  try {
    const attempt={...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)}
    expect(f.ledger.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:false})
    const opened={kind:'study-opened',...f.body,studyId:guidanceStudyId(f.body as never)}
    expect(f.ledger.recordConversationGuidance(opened as never)).toEqual({duplicate:false})
    expect(f.ledger.isConversationGuidanceSupported(opened.studyId)).toBe(true)
    expect(f.ledger.listConversationTasks()).toHaveLength(0)
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    const cold=new EvolutionLedger(f.root,{guidanceActivationQuarantine:true})
    expect(cold.listGoalTaskResearchSources()).toEqual(f.ledger.listGoalTaskResearchSources())
    expect(cold.listConversationGuidanceStudies()).toEqual(f.ledger.listConversationGuidanceStudies())
    expect(cold.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:true})
    expect(cold.recordConversationGuidance(opened as never)).toEqual({duplicate:true})
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    expect(cold.isConversationGuidanceActivationQuarantined()).toBe(true)
  }finally{f.remove()}
})

it('rejects changed original Goal source bindings and an unbound result without mutating the ledger',()=>{
  const f=fixture()
  try{
    const bytes=readFileSync(join(f.root,'ledger.jsonl')), source=f.sources[0]!
    expect(f.ledger.recordGoalTaskResearchSource(source.input)).toEqual({sourceId:source.sourceId,duplicate:true})
    for(const input of [{...source.input,materialDigest:sha256('changed')},{...source.input,sourceId:'goal-task-result:'+ 'a'.repeat(64)},
      {...source.input,sourceKind:'conversation-task'}, {...source.input,checks:[source.input.checks[0],source.input.checks[0]]}]){
      expect(()=>f.ledger.recordGoalTaskResearchSource(input as never)).toThrow()
    }
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it('rejects an older audit coverage protocol under the current original quality contract',()=>{
  const f=fixture()
  try {
    const old=f.sources[0]!, outcome={...old.outcome.input,taskId:'new-original-task'}
    const receipt=f.ledger.recordGoalTaskOutcome(outcome)
    const legacy=old.input.checks.map(check=>({...check,audit:{schemaVersion:'tianwen.claim-audit.v1',evidenceDigest:sha256('legacy coverage'),
      units:[{answerId:'answer-1',claims:[{quote:'literal output',kind:'non-factual',status:'permitted',sourceIds:[],explanation:'legacy fixture'}]}]}}))
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(()=>f.ledger.recordGoalTaskResearchSource({...old.input,sourceId:receipt.sourceId,outcomeInputDigest:sha256(outcome),checks:legacy} as never)).toThrow()
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it.each(['problem-positive','counter-negative','other-lifecycle','other-message'] as const)('preserves original native feedback veto without inventing attribution: %s', mode => {
  const f=fixture()
  try {
    const source=f.sources[mode === 'counter-negative' ? 2 : 0]!
    f.ledger.recordLearningFeedbackRevision({sessionLifecycleFingerprint: mode === 'other-lifecycle' ? sha256('a different lifecycle') : source.input.sessionLifecycleFingerprint,
      analysisConsentRevision:1,intake:{sessionId:source.outcome.input.childSessionId,messageId:mode === 'other-message' ? 'unrelated-answer' : source.input.assistantMessageIds[0]!,
        feedbackVersion:'engineering-feedback-v1',rating:mode === 'counter-negative' ? 'negative' : 'positive',scopeKey,
        sessionDigest:sha256('original native SDK'),evidenceIds:[]}})
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    const attempt={...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)}
    if(mode === 'problem-positive' || mode === 'counter-negative') {
      expect(()=>f.ledger.recordConversationCaseDesignAttempt(attempt as never)).toThrow(/feedback/)
      expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    } else expect(f.ledger.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:false})
  }finally{f.remove()}
})

it('keeps the bounded original program failure branch and requires independently prepared study checks',()=>{
  const f=fixture(true)
  try {
    expect(f.sources.slice(0,2).every(source=>source.outcome.classification==='checked-failure' && source.input.checks.every(check=>check.verdict==='met'))).toBe(true)
    const attempt={...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)}
    f.ledger.recordConversationCaseDesignAttempt(attempt as never)
    const {resultChecks,...withoutChecks}=f.body
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(()=>f.ledger.recordConversationGuidance({kind:'study-opened',...withoutChecks,studyId:guidanceStudyId(withoutChecks as never)} as never)).toThrow(/independent prepared program checks/)
    const changed={...f.body,resultChecks:resultChecks!.map((check,index)=>index===0?{...check,inputsDigest:sha256('changed original input')}:check)}
    expect(()=>f.ledger.recordConversationGuidance({kind:'study-opened',...changed,studyId:guidanceStudyId(changed as never)} as never)).toThrow(/inputs/)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    const opened={kind:'study-opened',...f.body,studyId:guidanceStudyId(f.body as never)}
    expect(f.ledger.recordConversationGuidance(opened as never)).toEqual({duplicate:false})
    expect(new EvolutionLedger(f.root,{guidanceActivationQuarantine:true}).listConversationGuidanceStudies()).toEqual(f.ledger.listConversationGuidanceStudies())
  }finally{f.remove()}
})

it('does not turn a different Goal Task identity into different actual requirements',()=>{
  const f=fixture()
  try {
    const original=f.sources[0]!, outcome={...original.outcome.input,taskId:'another-task-same-actual-input'}
    const receipt=f.ledger.recordGoalTaskOutcome(outcome)
    f.ledger.recordGoalTaskResearchSource({...original.input,sourceId:receipt.sourceId,outcomeInputDigest:sha256(outcome)})
    const repeated=f.ledger.listGoalTaskResearchSources().find(source=>source.sourceId===receipt.sourceId)!
    const body={...f.attemptBody,sourceTaskIds:[original.sourceId,repeated.sourceId],nativeGoalSources:[
      {sourceId:original.sourceId,inputDigest:original.inputDigest},{sourceId:repeated.sourceId,inputDigest:repeated.inputDigest},f.attemptBody.nativeGoalSources[2]!]}
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(()=>f.ledger.recordConversationCaseDesignAttempt({...body,attemptId:caseDesignAttemptId(body as never)} as never)).toThrow(/distinct/)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})
