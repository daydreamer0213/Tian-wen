import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { expect, it, vi } from 'vitest'
import { EvolutionLedger } from '../../packages/tianwen-evolution/src/ledger.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { conversationQualityContract, parseConversationAuditedReviewChecks, conversationReviewConsensus } from '../../packages/tianwen-evolution/src/conversation-learning.js'
import { guidanceInputDigest, guidanceFileInputIdentity, guidanceStudyId, guidanceVersion, caseDesignAttemptId } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import type { GuidanceStudyBody } from '../../packages/tianwen-evolution/src/conversation-guidance.js'
import type { GoalTaskOutcomeInput } from '../../packages/tianwen-evolution/src/goal-task-outcome.js'
import type { GoalTaskResearchSourceInput } from '../../packages/tianwen-evolution/src/goal-task-research.js'
import { goalTaskResearchProblem, isGoalTaskGuidanceRegression, parseGoalTaskResearchSourceInput } from '../../packages/tianwen-evolution/src/goal-task-research.js'
import { conversationExternalInputsDigest } from '../../packages/tianwen-evolution/src/conversation-external-check.js'
import { prepareConversationLearningExploration, parseConversationLearningExplorationRequest } from '../../packages/tianwen-evolution/src/learning-exploration.js'
import { TianwenConversationGuidanceLoopService } from '../../packages/tianwen-runtime-bundle/src/conversation-guidance-loop.js'
import * as goalSources from '../../packages/tianwen-runtime-bundle/src/goal-task-research-source.js'

const BASE = resolve('D:/DevData/tianwen-dsh-probe/goal-task-research')
const scopeKey = `conversation:${sha256({ cwd: 'D:/original-Goal' })}`
const snapshot = { schemaVersion: 'tianwen.conversation-guidance.v1' as const, scopeKey, rules: {} }
const proof = (id: string) => ({ sessionId: id, sessionDigest: sha256(id), requestDigest: sha256('request:'+id) })
const checks = (id: string, met: boolean) => parseConversationAuditedReviewChecks(['requirements', 'grounding'].map(focus => ({
  focus, verdict: met ? 'met' : 'not-met', category: met ? null : 'instruction-following', explanation: 'Isolated engineering proof fixture, not a natural review.',
  evidenceQuotes: ['literal output'], proof: proof(id+focus), audit: { schemaVersion: 'tianwen.claim-audit.v2', evidenceDigest: sha256(id),
    units: { 'answer-1': { firstClaim: { quote: 'literal output', kind: 'non-factual', status: 'permitted', sourceIds: [], explanation: 'fixture literal' }, additionalClaims: [] } } },
})))

function fixture(checkedCode = false, quarantine = true, aliasedInputs = false, options: {
  separateContracts?: boolean
  changedIndex?: number
  change?: Partial<Pick<GoalTaskOutcomeInput, 'checkerId' | 'checkerDigest' | 'requiredConditionDigest'>>
  answerMode?: 'text' | 'chat'
} = {}) {
  mkdirSync(BASE, { recursive: true }); const root = mkdtempSync(join(BASE, 'ledger-'))
  let tick=0
  const ledger = new EvolutionLedger(root, { guidanceActivationQuarantine: quarantine,
    clock:()=>new Date(Date.UTC(2026,9,3)+tick++*1000).toISOString() })
  ledger.recordLearningAnalysisConsent({ enabled: true, revision: 1, policyVersion: 'tianwen-auto-analysis.v3' })
  const files = (index: number | string) => ({ schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: 'D:/original-Goal',
    outputKind: options.answerMode === 'chat' ? 'chat' as const : 'files' as const,
    entries: [{ path: 'input.txt', content: 'Original input '+index }, ...(options.answerMode === 'chat' ? [] : [{ path: 'output.txt', content: null }])],
    outputPaths: options.answerMode === 'chat' ? [] : ['output.txt'] })
  const answerMaterial = (index: number) => ({ sourceKind: 'native-goal-task', prompt: 'actual requirements-'+index,
    criteria: ['Original condition'], qualityContract: conversationQualityContract(), ...(options.answerMode === 'chat' ? { files: files(index) } : {}) })
  const sources = [1,2,3].map(index => {
    const change = index === options.changedIndex ? options.change ?? {} : {}
    const condition = change.requiredConditionDigest ?? sha256('condition')
    const outcome: GoalTaskOutcomeInput = { source: 'native-goal-task', goalId: 'original-goal', taskId: 'task-'+index, epoch: 1,
      origin: { sessionId: 'command', commandId: 'original-command', commandSeq: 1, commandDigest: sha256('command') },
      parentSessionId: 'planner', childSessionId: 'child-'+index, nativeGoalId: 'native-'+index, preparedSeq: 2, endSeq: 8,
      preparationDigest: sha256('prep-'+index), materialDigest: sha256('SDK-'+index), consentRevision: 1, modelConfigDigest: sha256('model'),
      checkerId: options.answerMode === undefined ? 'original-check' : 'tianwen.isolated-python-answer.v1', checkerDigest: sha256('check'), contractDigest: sha256(options.separateContracts ? 'original contract '+index : 'contract'),
      inputsDigest: options.answerMode !== undefined ? sha256(answerMaterial(index)) : checkedCode ? conversationExternalInputsDigest(files(index).entries) : sha256('input-'+index),
      ...change, requiredConditionDigest: condition, outcome: (checkedCode || options.answerMode !== undefined) && index < 3
        ? { status: 'rejected', detail: 'Controlled original condition failure.', failedRequiredConditionDigest: condition }
        : { status: 'verified', detail: 'functional fixture' } }
    const receipt = ledger.recordGoalTaskOutcome(outcome)
    const input: GoalTaskResearchSourceInput = { sourceKind: 'native-goal-task', sourceId: receipt.sourceId,
      outcomeInputDigest: sha256(outcome), scopeKey, family: checkedCode ? 'code' : 'writing', evaluationMode: checkedCode || options.answerMode === 'chat' ? 'local-files' : 'text', behaviorVersion: guidanceVersion(snapshot),
      ...(checkedCode || options.answerMode === 'chat' ? { fileOutputKind: files(index).outputKind, fileInputsDigest: conversationExternalInputsDigest(files(index).entries) } : {}),
      sessionLifecycleFingerprint: sha256('child-lifecycle-'+index), assistantMessageIds: ['answer-'+index],
      qualityContract: conversationQualityContract(), inputDigest: guidanceInputDigest('actual requirements-'+index),
      ...(aliasedInputs ? { inputIdentityDigest:sha256(index<3?'same canonical input':'separate counter input') } : {}),
      materialDigest: options.answerMode !== undefined ? sha256(answerMaterial(index)) : sha256('study material-'+index), reviewMaterialDigest: sha256('original review-'+index), checks: checks('source-'+index, checkedCode || options.answerMode !== undefined || index===3) }
    ledger.recordGoalTaskResearchSource(input)
    return ledger.listGoalTaskResearchSources().find(item => item.sourceId === receipt.sourceId)!
  })
  const nativeGoalSources = sources.map(source => ({ sourceId: source.sourceId, inputDigest: source.inputDigest }))
  const attemptBody = { scopeKey, consentRevision: 1, parentVersion: guidanceVersion(snapshot), sourceTaskIds: sources.slice(0,2).map(source => source.sourceId),
    counterexampleTaskId: sources[2]!.sourceId, modelConfigDigest: sha256('model'), materialDigest: sha256('case-design-original'), nativeGoalSources }
  const generated = (kind: 'adjacent'|'holdout') => {
    const material = { prompt: 'independent '+kind, criteria: ['Complete this new original request.'], qualityContract: conversationQualityContract(), ...(checkedCode || options.answerMode === 'chat' ? { files: files(kind) } : {}) }
    return { id:kind,kind,...material,inputDigest:guidanceInputDigest(material.prompt,material.files),materialDigest:sha256(material) }
  }
  const cases=[...sources.map((source,index)=>({id:['source1','source2','counterexample'][index]!,kind:['source1','source2','counterexample'][index]!,
    sourceTaskId:source.sourceId,materialDigest:source.input.materialDigest,inputDigest:source.input.inputDigest})),generated('adjacent'),generated('holdout')]
  const checkConfig: Partial<Pick<GuidanceStudyBody,'evaluationMode'|'fileOutputKind'|'resultChecks'>> = checkedCode ? { evaluationMode: 'local-files' as const, fileOutputKind: 'files' as const,
      resultChecks:cases.map((item,index)=>({caseId:item.id,checkerId:'independent-study-check',checkerDigest:sha256('study checker'),contractDigest:sha256('study contract'),
        inputsDigest:index<3?sources[index]!.input.fileInputsDigest!:conversationExternalInputsDigest(files(item.kind).entries),requiredCondition:'Original condition'})) }
      : options.answerMode === undefined ? {} : {
        ...(options.answerMode === 'chat' ? { evaluationMode: 'local-files' as const, fileOutputKind: 'chat' as const } : {}),
        resultChecks: cases.map((item,index)=>({caseId:item.id,checkerId:'tianwen.isolated-python-answer.v1',checkerDigest:sha256('study checker'),contractDigest:sha256('study contract'),
          inputKind: options.answerMode === 'text' ? 'text-material.v1' as const : 'file-chat-material.v1' as const,
          inputsDigest:item.materialDigest,requiredCondition:'Original condition',
          ...(options.answerMode === 'chat' ? {fileInputsDigest:index<3?sources[index]!.input.fileInputsDigest!:conversationExternalInputsDigest(files(item.kind).entries)} : {})}))
      }
  const body = { scopeKey, family:checkedCode ? 'code' as const : 'writing' as const, failureCategory:'instruction-following' as const, consentRevision:1,
    parentVersion:guidanceVersion(snapshot),parentSnapshot:snapshot,sourceTaskIds:attemptBody.sourceTaskIds,counterexampleTaskId:attemptBody.counterexampleTaskId,
    modelConfigDigest:sha256('model'),qualityContract:conversationQualityContract(),nativeGoalSources,caseDesignProof:proof('case-design'),cases,...checkConfig }
  return {root,ledger,sources,attemptBody,body,remove(){if(!resolve(root).startsWith(BASE+sep))throw new Error('cleanup outside owned fixture');rmSync(root,{recursive:true,force:true})}}
}

it.each(['text','chat'] as const)('admits bound original %s answer failures into an independently checked native study despite met reviews', mode=>{
  const f=fixture(false,true,false,{answerMode:mode,separateContracts:true})
  try {
    expect(f.sources.slice(0,2).map(goalTaskResearchProblem)).toEqual([
      {category:'instruction-following',checkedFailure:true},{category:'instruction-following',checkedFailure:true}])
    if(mode==='chat') expect(f.sources[0]!.input.fileInputsDigest).not.toBe(f.sources[0]!.outcome.input.inputsDigest)
    const attempt={...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)}
    expect(f.ledger.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:false})
    const {resultChecks: _checks,...withoutChecks}=f.body
    expect(()=>f.ledger.recordConversationGuidance({kind:'study-opened',...withoutChecks,studyId:guidanceStudyId(withoutChecks as never)} as never)).toThrow(/independent prepared program checks/)
    const changed={...f.body,resultChecks:f.body.resultChecks!.map((check,index)=>index===0?{...check,inputsDigest:sha256('changed material')}:check)}
    expect(()=>f.ledger.recordConversationGuidance({kind:'study-opened',...changed,studyId:guidanceStudyId(changed as never)} as never)).toThrow(/inputs/)
    const opened={kind:'study-opened',...f.body,studyId:guidanceStudyId(f.body as never)}
    expect(f.ledger.recordConversationGuidance(opened as never)).toEqual({duplicate:false})
    const bytes=readFileSync(join(f.root,'ledger.jsonl')),cold=new EvolutionLedger(f.root,{guidanceActivationQuarantine:true})
    expect(cold.listConversationGuidanceStudies()).toEqual(f.ledger.listConversationGuidanceStudies())
    expect(cold.isConversationGuidanceSupported(opened.studyId)).toBe(true)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it.each(['text','chat'] as const)('selects original checked %s failures in original older/newer source order',async mode=>{
  const f=fixture(false,true,false,{answerMode:mode,separateContracts:true})
  const recovery=vi.spyOn(goalSources,'recoverGoalTaskResearchSource').mockResolvedValue({} as never)
  try {
    const service=Object.create(TianwenConversationGuidanceLoopService.prototype)
    Object.assign(service,{ctx:{tianwenEvolution:f.ledger},sourceConfig:{goalStateRoot:'controlled-state'}})
    const selection=await service.scanGoal(scopeKey)
    expect(selection.state).toBe('ready-to-schedule')
    expect(selection.group.sources.map((source:any)=>source.sourceId)).toEqual(f.sources.slice(0,2).map(source=>source.sourceId))
    expect(selection.group.counterexample).toEqual(f.sources[2])
  }finally{recovery.mockRestore();f.remove()}
})

it.each(['text','chat'] as const)('uses original full %s material binding for checked regression and rejects unsupported answers', mode=>{
  const f=fixture(false,true,false,{answerMode:mode})
  try {
    const old=f.sources[0]!,source={...old,input:{...old.input,inputIdentityDigest:sha256('distinct original input')}}
    const scope={scopeKey,family:source.input.family,evaluationMode:source.input.evaluationMode,fileOutputKind:source.input.fileOutputKind,
      qualityContract:conversationQualityContract(),consentRevision:1,modelConfigDigest:sha256('model'),expectedVersion:source.input.behaviorVersion,activatedAt:'2026-10-02T00:00:00.000Z'}
    expect(isGoalTaskGuidanceRegression(source,scope)).toBe(true)
    const invalid=[{...source,input:{...source.input,materialDigest:sha256('changed material')}},
      {...source,outcome:{...source.outcome,input:{...source.outcome.input,checkerId:'unknown-answer-check'}}},
      {...source,outcome:{...source.outcome,classification:'checked-success' as const}},
      {...source,outcome:{...source.outcome,classification:'unverifiable' as const}}]
    for(const changed of invalid) {
      expect(goalTaskResearchProblem(changed)).toBeUndefined()
      expect(isGoalTaskGuidanceRegression(changed,scope)).toBe(false)
    }
    const changed={...source,outcome:{...source.outcome,input:{...source.outcome.input,inputsDigest:sha256('unbound check input')}}}
    expect(goalTaskResearchProblem(changed)).toBeUndefined()
    expect(isGoalTaskGuidanceRegression(changed,scope)).toBe(false)
  }finally{f.remove()}
})

it('groups original Goal program failures by checker and condition while retaining each independent contract',()=>{
  const f=fixture(true,true,false,{separateContracts:true})
  try {
    expect(new Set(f.sources.map(source=>source.outcome.input.contractDigest)).size).toBe(3)
    expect(new Set(f.sources.map(source=>source.outcome.input.inputsDigest)).size).toBe(3)
    const attempt={...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)}
    expect(f.ledger.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:false})
    const opened={kind:'study-opened',...f.body,studyId:guidanceStudyId(f.body as never)}
    expect(f.ledger.recordConversationGuidance(opened as never)).toEqual({duplicate:false})
    expect(f.ledger.isConversationGuidanceSupported(opened.studyId)).toBe(true)
    const bytes=readFileSync(join(f.root,'ledger.jsonl')),cold=new EvolutionLedger(f.root,{guidanceActivationQuarantine:true})
    expect(cold.listGoalTaskResearchSources()).toEqual(f.sources)
    expect(cold.listConversationGuidanceStudies()).toEqual(f.ledger.listConversationGuidanceStudies())
    expect(cold.recordConversationCaseDesignAttempt(attempt as never)).toEqual({duplicate:true})
    expect(cold.recordConversationGuidance(opened as never)).toEqual({duplicate:true})
    expect(cold.isConversationGuidanceSupported(opened.studyId)).toBe(true)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it.each([2,3])('rejects a different original Goal checker or condition on source %s despite separate contracts',index=>{
  for(const change of [{checkerId:'other-check'},{checkerDigest:sha256('other checker')},{requiredConditionDigest:sha256('other condition')}]) {
    const f=fixture(true,true,false,{separateContracts:true,changedIndex:index,change})
    try {
      const bytes=readFileSync(join(f.root,'ledger.jsonl'))
      expect(()=>f.ledger.recordConversationCaseDesignAttempt({...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)} as never)).toThrow(/same original checker and condition/)
      expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    }finally{f.remove()}
  }
})

it.each(['same-condition','different-checker','different-condition','different-counter'] as const)(
  'selects only compatible independent original Goal contracts: %s',async mode=>{
    const f=fixture(true,true,false,{separateContracts:true,
      ...(mode==='same-condition'?{}:{changedIndex:mode==='different-counter'?3:2,
        change:mode==='different-checker'?{checkerDigest:sha256('other checker')}:{requiredConditionDigest:sha256('other condition')}})})
    // This isolates source selection from the separately tested native restoration.
    // It supplies no model response and never alters a persisted original source.
    const recovery=vi.spyOn(goalSources,'recoverGoalTaskResearchSource').mockResolvedValue({} as never)
    try {
      const service=Object.create(TianwenConversationGuidanceLoopService.prototype)
      Object.assign(service,{ctx:{tianwenEvolution:f.ledger},sourceConfig:{goalStateRoot:'controlled-state'}})
      const bytes=readFileSync(join(f.root,'ledger.jsonl')),selection=await service.scanGoal(scopeKey)
      expect(selection.state).toBe(mode==='same-condition'?'ready-to-schedule':mode==='different-counter'?'awaiting-counterexample':'awaiting-compatible-sources')
      expect(recovery).toHaveBeenCalledTimes(3)
      if(mode==='same-condition') {
        expect(selection.group.sources.map((source:any)=>source.sourceId).sort()).toEqual(f.sources.slice(0,2).map(source=>source.sourceId).sort())
        expect(selection.group.counterexample).toEqual(f.sources[2])
      } else expect(selection.group).toBeUndefined()
      expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    }finally{recovery.mockRestore();f.remove()}
  },
)

it('does not open an original native study from two task identifiers for the same canonical file input',()=>{
  const f=fixture(true,true,true)
  try {
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(()=>f.ledger.recordConversationCaseDesignAttempt({...f.attemptBody,attemptId:caseDesignAttemptId(f.attemptBody as never)} as never)).toThrow(/distinct/)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

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

it('retains explicit native Goal identity in one bounded original exploration and its cold ledger',()=>{
  const f=fixture()
  try {
    const opened={kind:'study-opened' as const,...f.body,studyId:guidanceStudyId(f.body as never)}
    f.ledger.recordConversationGuidance(opened as never)
    const sourceTaskId=f.sources[0]!.sourceId
    const proposal={sourceTaskId,hypothesis:'The original constraint is missed without the temporary instruction.',alternative:'The answer already satisfies the original constraint.',
      temporaryInstruction:'Preserve every explicit original constraint.',expectedIfHypothesis:{control:'not-met',treatment:'met'},expectedIfAlternative:{control:'met',treatment:'met'}}
    const context={sourceKind:'native-goal-task' as const,studyId:opened.studyId,sourceTaskId,parentVersion:opened.parentVersion,
      sourceMaterialDigest:opened.cases[0]!.materialDigest,environmentDigest:opened.modelConfigDigest,
      qualityContractDigest:sha256(opened.qualityContract),proposalProof:proof('native-bounded-exploration')}
    const request=prepareConversationLearningExploration(proposal,context)
    expect(request.sourceKind).toBe('native-goal-task')
    expect(request.schemaVersion).toBe('tianwen.learning-exploration-request.v3')
    expect(request.metric).toBe('native-goal-task-quality.v1')
    expect(parseConversationLearningExplorationRequest(request)).toEqual(request)
    expect(()=>prepareConversationLearningExploration(proposal,{...context,sourceKind:'conversation-task'})).toThrow()
    expect(()=>parseConversationLearningExplorationRequest({...request,sourceKind:'conversation-task'})).toThrow()
    const intent={kind:'exploration-requested' as const,studyId:opened.studyId,request}
    expect(f.ledger.recordConversationGuidance(intent)).toEqual({duplicate:false})
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    const cold=new EvolutionLedger(f.root,{guidanceActivationQuarantine:true})
    expect(cold.listConversationGuidanceStudies()).toEqual(f.ledger.listConversationGuidanceStudies())
    expect(cold.recordConversationGuidance(intent)).toEqual({duplicate:true})
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

function nativeRegressionScene() {
  const f=fixture(false,false)
  const opened={kind:'study-opened' as const,...f.body,studyId:guidanceStudyId(f.body as never)}
  f.ledger.recordConversationGuidance(opened as never)
  const candidate={kind:'candidate-recorded' as const,studyId:opened.studyId,candidateSnapshot:{...snapshot,rules:{writing:'Preserve every original constraint.'}},proposalProof:proof('regression-candidate')}
  f.ledger.recordConversationGuidance(candidate)
  for(const item of opened.cases) for(const role of ['baseline','candidate'] as const) {
    const met=role==='candidate'||!['source1','source2'].includes(item.kind)
    const reviewChecks=checks(item.id+role,met),review=conversationReviewConsensus(reviewChecks)
    f.ledger.recordConversationGuidance({kind:'arm-recorded',studyId:opened.studyId,caseId:item.id,role,materialDigest:item.materialDigest,
      behaviorVersion:role==='baseline'?opened.parentVersion:guidanceVersion(candidate.candidateSnapshot),executionProof:proof(item.id+role+'execute'),
      judgeProof:review.proof!,outputDigest:sha256(item.id+role+'actual output'),verdict:review.verdict,reviewChecks})
  }
  const decision=f.ledger.conversationGuidanceDecision(opened.studyId)
  expect(decision.verdict).toBe('accepted');f.ledger.recordConversationGuidance(decision)
  const activate=()=>f.ledger.recordConversationGuidance({kind:'guidance-activated',studyId:opened.studyId,expectedParentVersion:opened.parentVersion,decisionDigest:sha256(decision)})
  const later=(index:number,change:{identity?:string,metadata?:Record<string,unknown>,outcome?:Record<string,unknown>,met?:boolean,legacy?:boolean}={})=>{
    const old=f.sources[0]!
    const outcome={...old.outcome.input,goalId:'future-goal',taskId:'future-'+index,childSessionId:'future-child-'+index,...change.outcome}
    const receipt=f.ledger.recordGoalTaskOutcome(outcome as GoalTaskOutcomeInput)
    const input={...old.input,sourceId:receipt.sourceId,outcomeInputDigest:sha256(outcome),behaviorVersion:guidanceVersion(candidate.candidateSnapshot),
      inputDigest:sha256('raw-input-'+index),...(change.legacy?{}:{inputIdentityDigest:sha256(change.identity??'actual-input-'+index)}),
      materialDigest:sha256('future-material-'+index),reviewMaterialDigest:sha256('future-review-'+index),
      checks:checks('future-'+index,change.met??false),...change.metadata}
    const publish=()=>{f.ledger.recordGoalTaskResearchSource(input as GoalTaskResearchSourceInput);return f.ledger.listGoalTaskResearchSources().find(source=>source.sourceId===receipt.sourceId)!}
    return {publish,outcome:receipt}
  }
  const rollback=(evidence:ReturnType<ReturnType<typeof later>['publish']>[])=>({kind:'guidance-rolled-back' as const,studyId:opened.studyId,
    expectedCurrentVersion:guidanceVersion(candidate.candidateSnapshot),reason:'regression' as const,evidenceTaskIds:evidence.map(source=>source.sourceId),
    evidenceInputPolicy:'native-goal-task-input.v1' as const,nativeGoalEvidence:evidence.map(source=>({sourceId:source.sourceId,inputDigest:source.inputDigest}))})
  const service=Object.create(TianwenConversationGuidanceLoopService.prototype)
  Object.assign(service,{ctx:{tianwenEvolution:f.ledger}})
  const reconcile=()=>service.rollbackIfNeeded(scopeKey)
  return {...f,opened,candidate,activate,later,rollback,reconcile}
}

it('rolls back two distinct later native Goal failures and cold restores the original version without ConversationTask fabrication',()=>{
  const f=nativeRegressionScene()
  try {
    f.activate();const failures=[f.later(4).publish(),f.later(5).publish()]
    const record=f.rollback(failures)
    expect(f.ledger.recordConversationGuidance(record as never)).toEqual({duplicate:false})
    expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(snapshot)
    expect(f.ledger.listConversationTasks()).toHaveLength(0)
    const bytes=readFileSync(join(f.root,'ledger.jsonl')),cold=new EvolutionLedger(f.root,{guidanceActivationQuarantine:true})
    expect(cold.getConversationGuidance(scopeKey)).toEqual(snapshot)
    expect(cold.recordConversationGuidance(record as never)).toEqual({duplicate:true})
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it('automatically reconciles native Goal regression using the original owner with no models or root Agent',()=>{
  const f=nativeRegressionScene()
  try {
    f.activate();const first=f.later(4,{identity:'same actual input'}).publish();f.reconcile()
    expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(f.candidate.candidateSnapshot)
    f.later(5,{identity:'same actual input'}).publish();f.reconcile()
    expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(f.candidate.candidateSnapshot)
    const distinct=f.later(6).publish();f.reconcile()
    expect(f.ledger.listConversationGuidanceStudies()[0]!.rollback).toEqual(f.rollback([first,distinct]))
    expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(snapshot)
  }finally{f.remove()}
})

it('rejects a late-published pre-activation original outcome as future regression evidence',()=>{
  const f=nativeRegressionScene()
  try {
    const old=f.later(4);f.activate()
    const sources=[old.publish(),f.later(5).publish()],bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(()=>f.ledger.recordConversationGuidance(f.rollback(sources) as never)).toThrow(/regression/)
    f.reconcile();expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(f.candidate.candidateSnapshot)
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it.each(['same-input','legacy-input','success','wrong-version','wrong-scope','wrong-family','wrong-model'] as const)(
  'does not retract an active method for ineligible native Goal regression evidence: %s', mode => {
    const f=nativeRegressionScene()
    try {
      f.activate()
      const first=f.later(4,{identity:'first actual input'}).publish()
      const second=f.later(5, mode==='same-input'?{identity:'first actual input'}:mode==='legacy-input'?{legacy:true}
        :mode==='success'?{met:true}:mode==='wrong-version'?{metadata:{behaviorVersion:guidanceVersion(snapshot)}}
        :mode==='wrong-scope'?{metadata:{scopeKey:`conversation:${sha256('another workspace')}`}}
        :mode==='wrong-family'?{metadata:{family:'code'}}:{outcome:{modelConfigDigest:sha256('another model')}}).publish()
      const bytes=readFileSync(join(f.root,'ledger.jsonl'))
      expect(()=>f.ledger.recordConversationGuidance(f.rollback([first,second]) as never)).toThrow(/regression/)
      f.reconcile()
      expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(f.candidate.candidateSnapshot)
      expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
    } finally { f.remove() }
  },
)

it('requires exact original native rollback references and an explicit matching input policy, without changing old records',()=>{
  const f=nativeRegressionScene()
  try {
    f.activate();const sources=[f.later(4).publish(),f.later(5).publish()]
    const record=f.rollback(sources),bytes=readFileSync(join(f.root,'ledger.jsonl'))
    const {nativeGoalEvidence:_refs,...missingRefs}=record
    const {evidenceInputPolicy:_policy,...missingPolicy}=record
    for(const invalid of [missingRefs,missingPolicy,{...record,evidenceInputPolicy:'request-content.v1'},
      {...record,nativeGoalEvidence:[record.nativeGoalEvidence[0],{...record.nativeGoalEvidence[1],inputDigest:sha256('wrong original source')}]},
      {...record,nativeGoalEvidence:[record.nativeGoalEvidence[1],record.nativeGoalEvidence[0]]},
      {...record,evidenceTaskIds:[record.evidenceTaskIds[0],record.evidenceTaskIds[0]]},
      {...record,evidenceFailurePolicy:'model-or-code-check.v1'}]) expect(()=>f.ledger.recordConversationGuidance(invalid as never)).toThrow()
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  } finally { f.remove() }
})

it('uses canonical original file identity and retains the bounded original code failure rule and exact rollback scope',()=>{
  const files={schemaVersion:'tianwen.conversation-file-material.v1' as const,cwd:'D:/original-Goal',outputKind:'files' as const,
    entries:[{path:'Input.txt',content:'Actual original bytes'},{path:'Second.txt',content:'Second original input'},
      {path:'Out.txt',content:null},{path:'Other.txt',content:null}],outputPaths:['Out.txt','Other.txt']}
  const alias={...files,entries:[...files.entries].reverse().map(entry=>({...entry,path:entry.path.toLowerCase()})),outputPaths:['other.txt','out.txt']}
  expect(guidanceInputDigest('original request',files)).not.toBe(guidanceInputDigest('original request',alias))
  expect(guidanceFileInputIdentity('original request',files)).toBe(guidanceFileInputIdentity('original request',alias))
  expect(guidanceFileInputIdentity('different request',alias)).not.toBe(guidanceFileInputIdentity('original request',files))
  expect(guidanceFileInputIdentity('original request',{...files,entries:files.entries.map((entry,index)=>index===0?{...entry,content:'Changed actual bytes'}:entry)}))
    .not.toBe(guidanceFileInputIdentity('original request',files))
  const f=fixture(true)
  try {
    const original=f.sources[0]!,source={...original,input:{...original.input,inputIdentityDigest:guidanceFileInputIdentity('original request',files)}}
    const scope={scopeKey,family:'code' as const,evaluationMode:'local-files',fileOutputKind:'files' as const,
      qualityContract:conversationQualityContract(),consentRevision:1,modelConfigDigest:sha256('model'),expectedVersion:source.input.behaviorVersion,activatedAt:'2026-10-02T00:00:00.000Z'}
    expect(isGoalTaskGuidanceRegression(source,scope)).toBe(true)
    expect(isGoalTaskGuidanceRegression({...source,input:{...source.input,fileInputsDigest:sha256('different checked file inputs')}},scope)).toBe(false)
    for(const change of [{family:'writing'},{evaluationMode:'text'},{fileOutputKind:'chat'},
      {consentRevision:2},{modelConfigDigest:sha256('another original model')},{qualityContract:undefined},
      {activatedAt:source.outcome.at}]) expect(isGoalTaskGuidanceRegression(source,{...scope,...change} as never)).toBe(false)
    expect(isGoalTaskGuidanceRegression({...source,outcome:{...source.outcome,classification:'unverifiable'}},scope)).toBe(false)
    expect(isGoalTaskGuidanceRegression({...source,input:{...source.input,checks:checks('inconclusive',true).map(check=>({...check,verdict:'inconclusive',category:null})) as never}},scope)).toBe(false)
    const bytes=readFileSync(join(f.root,'ledger.jsonl'))
    expect(parseGoalTaskResearchSourceInput(original.input)).toEqual(original.input)
    for(const identity of [undefined,'not-a-digest']) expect(()=>parseGoalTaskResearchSourceInput({...original.input,inputIdentityDigest:identity})).toThrow()
    expect(readFileSync(join(f.root,'ledger.jsonl'))).toEqual(bytes)
  }finally{f.remove()}
})

it.each(['consent-disabled','support-retracted'] as const)('retains original native method withdrawal independently of future failures: %s',reason=>{
  const f=nativeRegressionScene()
  try {
    f.activate()
    if(reason==='consent-disabled') f.ledger.recordLearningAnalysisConsent({enabled:false,revision:2,policyVersion:'tianwen-auto-analysis.v3'})
    else {
      const source=f.sources[0]!
      f.ledger.recordLearningFeedbackRevision({sessionLifecycleFingerprint:source.input.sessionLifecycleFingerprint,analysisConsentRevision:1,
        intake:{sessionId:source.outcome.input.childSessionId,messageId:source.input.assistantMessageIds[0]!,feedbackVersion:'engineering-withdrawal-control',
          rating:'positive',scopeKey,sessionDigest:sha256('original SDK'),evidenceIds:[]}})
    }
    f.reconcile()
    expect(f.ledger.listConversationGuidanceStudies()[0]!.rollback).toMatchObject({reason,evidenceTaskIds:[]})
    expect(f.ledger.listConversationGuidanceStudies()[0]!.rollback?.nativeGoalEvidence).toBeUndefined()
    expect(f.ledger.getConversationGuidance(scopeKey)).toEqual(snapshot)
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
