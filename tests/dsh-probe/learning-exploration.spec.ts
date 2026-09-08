import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  classifyLearningExploration,
  parseConversationLearningExplorationRequest,
  prepareLearningExploration,
  prepareConversationLearningExploration,
} from '../../packages/tianwen-evolution/src/learning-exploration.js'

const sourceRunId = `run:${'1'.repeat(64)}` as const
const context = {
  analysisId: `analysis:${'2'.repeat(64)}` as const,
  sourceRunId,
  parentVersionId: `skill-version:${'3'.repeat(64)}` as const,
  sourceSubjectDigest: sha256('frozen packet'),
  environmentDigest: sha256('same model, configuration, tools and runtime'),
}
function proposal() {
  return {
    sourceRunId,
    hypothesis: 'A short explicit checklist may prevent the observed omission.',
    alternative: 'The omission is not affected by this task instruction.',
    temporaryInstruction: 'Before submitting, check that all decision items are represented.',
    expectedIfHypothesis: { control: 'not-met' as const, treatment: 'met' as const },
    expectedIfAlternative: { control: 'not-met' as const, treatment: 'not-met' as const },
  }
}

const sourceTaskId = `conversation-task:${'4'.repeat(64)}` as const
const conversationContext = {
  studyId: `guidance-study:${'5'.repeat(64)}` as const,
  sourceTaskId,
  parentVersion: sha256('frozen guidance version'),
  sourceMaterialDigest: sha256('frozen conversation material'),
  environmentDigest: sha256('same conversation model, configuration, tools and runtime'),
  qualityContractDigest: sha256('conversation-task-quality.v1'),
  proposalProof: {
    sessionId: 'frozen-guidance-session',
    sessionDigest: sha256('frozen-guidance-session'),
    requestDigest: sha256('frozen-guidance-request'),
  },
}
function conversationProposal() {
  return {
    sourceTaskId,
    hypothesis: 'A compact review instruction may retain the requested source boundaries.',
    alternative: 'The observed source loss is independent of this temporary instruction.',
    temporaryInstruction: 'Before responding, confirm each source boundary is represented.',
    expectedIfHypothesis: { control: 'not-met' as const, treatment: 'met' as const },
    expectedIfAlternative: { control: 'not-met' as const, treatment: 'not-met' as const },
  }
}

describe('bounded learning exploration contract', () => {
  it('freezes one reproducible pair without modifying source inputs', () => {
    const input = proposal()
    const request = prepareLearningExploration(input, context)
    expect(prepareLearningExploration(input, context)).toEqual(request)
    expect(request.controlSessionId).not.toBe(request.treatmentSessionId)
    expect(request.parentVersionId).toBe(context.parentVersionId)
    expect(request.sourceSubjectDigest).toBe(context.sourceSubjectDigest)
    input.temporaryInstruction = 'changed after admission'
    const changed = prepareLearningExploration(input, context)
    input.expectedIfHypothesis.treatment = 'not-met' as 'met'
    expect(request.proposal.temporaryInstruction).not.toBe(input.temporaryInstruction)
    expect(request.proposal.expectedIfHypothesis.treatment).toBe('met')
    expect(Object.isFrozen(request.proposal.expectedIfHypothesis)).toBe(true)
    expect(changed.explorationId).toBe(request.explorationId)
    expect(changed.requestDigest).not.toBe(request.requestDigest)
    expect(request.metric).toBe('research-summary-required-id-coverage.v1')
    expect(request.requestDigest).toBe('sha256:042240f48341928ead9798a81826db11ab93b57525c218bc9fa7c8505283e500')
  })

  it.each(['research-summary-source-fidelity.v1', 'research-summary-source-fidelity.v2'] as const)('freezes %s into only new request digests', metric => {
    const legacy = prepareLearningExploration(proposal(), context)
    const semantic = prepareLearningExploration(proposal(), {
      ...context,
      metric,
    })
    expect(semantic.metric).toBe(metric)
    expect(semantic.requestDigest).not.toBe(legacy.requestDigest)
    expect(semantic.explorationId).toBe(legacy.explorationId)
    const other = prepareLearningExploration(proposal(), { ...context, metric: metric === 'research-summary-source-fidelity.v1' ? 'research-summary-source-fidelity.v2' : 'research-summary-source-fidelity.v1' })
    expect(other.requestDigest).not.toBe(semantic.requestDigest)
    expect(() => prepareLearningExploration(proposal(), { ...context, metric: 'research-summary-source-fidelity.v99' as never })).toThrow(/metric/)
  })

  it('requires a source-bound, distinguishable proposal', () => {
    expect(() => prepareLearningExploration({ ...proposal(), sourceRunId: `run:${'4'.repeat(64)}` }, context)).toThrow(/source/i)
    expect(() => prepareLearningExploration({ ...proposal(), expectedIfAlternative: proposal().expectedIfHypothesis }, context)).toThrow(/distinguish/i)
    expect(() => prepareLearningExploration({ ...proposal(), alternative: proposal().hypothesis }, context)).toThrow(/alternative/i)
  })

  it.each([
    [{ control: 'not-met', treatment: 'met' }, 'matches-hypothesis-prediction'],
    [{ control: 'not-met', treatment: 'not-met' }, 'matches-alternative-prediction'],
    [{ control: 'met', treatment: 'met' }, 'not-distinguished'],
    [{ control: 'inconclusive', treatment: 'met' }, 'inconclusive'],
    [{ control: 'not-met', treatment: 'inconclusive' }, 'inconclusive'],
  ] as const)('classifies %j from each source only against the frozen predictions', (observed, expected) => {
    for (const request of [
      prepareLearningExploration(proposal(), context),
      prepareConversationLearningExploration(conversationProposal(), conversationContext),
    ]) expect(classifyLearningExploration(request, observed)).toBe(expected)
  })

  it('rejects unsupported fields and malformed bounded input', () => {
    for (const input of [
      { ...proposal(), approved: true },
      { ...proposal(), temporaryInstruction: ' ' },
      { ...proposal(), hypothesis: 'x'.repeat(4097) },
      { ...proposal(), expectedIfHypothesis: { control: 'not-met', treatment: 'passed' } },
      { ...proposal(), expectedIfHypothesis: { control: 'not-met', treatment: 'met', confidence: 1 } },
    ]) expect(() => prepareLearningExploration(input, context)).toThrow()
    expect(() => prepareLearningExploration(proposal(), { ...context, environmentDigest: 'unknown' as never })).toThrow(/environmentDigest/)
  })
})

describe('conversation learning exploration request contract', () => {
  it('freezes a source-bound stable pair while proposal, proof, and source changes alter only the request digest', () => {
    const input = conversationProposal()
    const proof = { ...conversationContext.proposalProof }
    const request = prepareConversationLearningExploration(input, { ...conversationContext, proposalProof: proof })
    expect(prepareConversationLearningExploration(conversationProposal(), conversationContext)).toEqual(request)
    input.temporaryInstruction = 'changed after preparation'
    input.expectedIfHypothesis.treatment = 'not-met' as 'met'
    proof.sessionId = 'changed after preparation'
    expect(request.proposal.temporaryInstruction).not.toBe(input.temporaryInstruction)
    expect(request.proposal.expectedIfHypothesis.treatment).toBe('met')
    expect(request.proposalProof.sessionId).toBe('frozen-guidance-session')
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.proposal)).toBe(true)
    expect(Object.isFrozen(request.proposal.expectedIfHypothesis)).toBe(true)
    expect(Object.isFrozen(request.proposalProof)).toBe(true)

    const changedProposal = prepareConversationLearningExploration({ ...conversationProposal(), temporaryInstruction: 'Use a different temporary review instruction.' }, conversationContext)
    const changedProof = prepareConversationLearningExploration(conversationProposal(), { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, requestDigest: sha256('changed proof') } })
    const changedSourceTaskId = `conversation-task:${'6'.repeat(64)}` as const
    const changedSource = prepareConversationLearningExploration({ ...conversationProposal(), sourceTaskId: changedSourceTaskId }, { ...conversationContext, sourceTaskId: changedSourceTaskId })
    expect(changedProposal.explorationId).toBe(request.explorationId)
    expect(changedProof.explorationId).toBe(request.explorationId)
    expect(changedSource.explorationId).toBe(request.explorationId)
    expect(changedProposal.requestDigest).not.toBe(request.requestDigest)
    expect(changedProof.requestDigest).not.toBe(request.requestDigest)
    expect(changedSource.requestDigest).not.toBe(request.requestDigest)
  })

  it('derives a different exploration identity for each guidance study and round-trips only canonical requests', () => {
    const request = prepareConversationLearningExploration(conversationProposal(), conversationContext)
    const otherStudy = prepareConversationLearningExploration(conversationProposal(), { ...conversationContext, studyId: `guidance-study:${'7'.repeat(64)}` })
    expect(otherStudy.explorationId).not.toBe(request.explorationId)
    expect(parseConversationLearningExplorationRequest(JSON.parse(JSON.stringify(request)))).toEqual(request)
  })

  it('rejects unsupported or malformed persisted natural requests', () => {
    const request = prepareConversationLearningExploration(conversationProposal(), conversationContext)
    for (const persisted of [
      { ...request, unexpected: true },
      Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'proposalProof')),
      { ...request, metric: 'conversation-task-quality.v2' },
      { ...request, sourceKind: 'run' },
      { ...request, schemaVersion: 'tianwen.learning-exploration-request.v1' },
      { ...request, explorationId: `exploration:${'8'.repeat(64)}` },
      { ...request, requestDigest: sha256('tampered request') },
      { ...request, proposal: { ...request.proposal, hypothesis: 'tampered but plausible' } },
    ]) expect(() => parseConversationLearningExplorationRequest(persisted)).toThrow()
  })

  it('rejects source mismatch, indistinguishable explanations or predictions, and malformed host identities or proof', () => {
    expect(() => prepareConversationLearningExploration({ ...conversationProposal(), sourceTaskId: `conversation-task:${'8'.repeat(64)}` }, conversationContext)).toThrow(/source/i)
    expect(() => prepareConversationLearningExploration({ ...conversationProposal(), alternative: conversationProposal().hypothesis }, conversationContext)).toThrow(/alternative/i)
    expect(() => prepareConversationLearningExploration({ ...conversationProposal(), expectedIfAlternative: conversationProposal().expectedIfHypothesis }, conversationContext)).toThrow(/distinguish/i)
    for (const context of [
      { ...conversationContext, studyId: 'study:unknown' },
      { ...conversationContext, sourceTaskId: 'conversation-task:upperCASE' },
      { ...conversationContext, parentVersion: 'unknown' },
      { ...conversationContext, sourceMaterialDigest: 'unknown' },
      { ...conversationContext, environmentDigest: 'unknown' },
      { ...conversationContext, qualityContractDigest: 'unknown' },
      { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, sessionId: ' ' } },
      { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, sessionId: `ok\0not-ok` } },
      { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, sessionId: '😀'.repeat(129) } },
      { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, sessionDigest: 'unknown' } },
      { ...conversationContext, proposalProof: { ...conversationContext.proposalProof, requestDigest: 'unknown' } },
    ]) expect(() => prepareConversationLearningExploration(conversationProposal(), context)).toThrow()
  })

  it('keeps the shared hypothesis boundary at 4096 UTF-8 bytes', () => {
    expect(() => prepareConversationLearningExploration({ ...conversationProposal(), hypothesis: '😀'.repeat(1025) }, conversationContext)).toThrow(/hypothesis/)
  })
})
