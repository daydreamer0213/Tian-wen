import { describe, expect, it } from 'vitest'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import {
  classifyLearningExploration,
  prepareLearningExploration,
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
  ] as const)('classifies %j only against the frozen predictions', (observed, expected) => {
    expect(classifyLearningExploration(prepareLearningExploration(proposal(), context), observed)).toBe(expected)
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
