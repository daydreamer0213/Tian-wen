import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'
import { parseGoalTaskContentReviewPlan } from '../../packages/tianwen-runtime-bundle/src/goal-task-acceptance-contract.js'
import type { GoalTaskOutcomeMaterial } from '../../packages/tianwen-runtime-bundle/src/goal-task-material.js'
import { goalTaskContentReviewMaterial } from '../../packages/tianwen-runtime-bundle/src/goal-task-content-review.js'
import { projectClaimEvidence } from '../../packages/tianwen-runtime-bundle/src/conversation-claim-review.js'

const reply = (seq: number, text: string, surfaceOp = 'append') => ({ seq, type: 'assistant/message', surfaceOp,
  data: { message: { id: `reply-${seq}`, role: 'assistant', content: [{ type: 'text', text }] } } }) as unknown as SessionEvent
const files = { schemaVersion: 'tianwen.conversation-file-material.v1' as const, cwd: 'D:/DevData/delivery-control',
  outputKind: 'chat' as const, outputPaths: [], entries: [{ path: 'record.txt', content: 'pending' }] }
function material(events: SessionEvent[], legacy = false, fileMode = false) {
  const snapshot = { goal: { id: 'goal', objective: 'Report the original status.', context: null,
    successCriteria: 'Bare JSON only.', workspaceRoot: files.cwd }, task: { id: 'task', objective: 'Return the status.' } }
  return { sourceKind: 'native-goal-task', source: { type: 'command/run', data: { args: 'Original status is pending.' } },
    requirementsSnapshot: snapshot, preparation: { preparedSeq: 3, requiredCondition: 'Bare JSON only.',
      contentReview: { protocol: 'tianwen.goal-task-content-review.v1', ...(legacy ? {} : { deliveryPolicy: 'native-terminal.v1' }),
        ...(fileMode ? { files } : {}) } }, result: { materialDigest: sha256(events), endSeq: 20 }, events } as unknown as GoalTaskOutcomeMaterial
}
const capture = (answer: string) => { const output = { answer, files: files.entries }; return { ...output, outputDigest: sha256(output) } }

describe('native content review terminal delivery', () => {
  it('marks the last delivery while retaining intermediate claims for grounding and the complete original trace', () => {
    const original = material([reply(4, 'I invented 777 customers.'), reply(5, '{"status":"pending"}')])
    const before = sha256(original), view = goalTaskContentReviewMaterial(original)
    expect(view.source.nativeGoal).toMatchObject({ delivery: { protocol: 'native-terminal.v1', messageId: 'reply-5', seq: 5 } })
    expect(projectClaimEvidence(view).items.filter(item => item.role === 'answer').map(item => item.text))
      .toEqual(['I invented 777 customers.', '{"status":"pending"}'])
    expect(sha256(original)).toBe(before)
  })
  it('binds file-to-chat capture to the terminal answer and refuses a concatenated or substituted answer', () => {
    const original = material([reply(4, 'Reading the record.'), reply(5, '{"status":"pending"}')], false, true)
    expect(goalTaskContentReviewMaterial(original, capture('{"status":"pending"}')).fileResult?.answer).toBe('{"status":"pending"}')
    expect(projectClaimEvidence(goalTaskContentReviewMaterial(original, capture('{"status":"pending"}'))).items
      .filter(item => item.role === 'answer').map(item => item.text)).toEqual(['Reading the record.', '{"status":"pending"}'])
    for (const answer of ['Reading the record.{"status":"pending"}', '{"status":"passed"}']) {
      expect(() => goalTaskContentReviewMaterial(original, capture(answer))).toThrow('terminal delivery differs')
    }
  })
  it('does not fall back to an earlier correct answer when the actual delivery is wrong or has only a tool block', () => {
    const toolOnly = { ...reply(6, ''), data: { message: { id: 'reply-6', role: 'assistant', content: [{ type: 'tool_use', id: 'tool', name: 'test', input: {} }] } } } as unknown as SessionEvent
    for (const last of [reply(6, 'wrong'), reply(6, '   '), toolOnly]) {
      const original = material([reply(4, '{"status":"pending"}'), last], false, true)
      expect(() => goalTaskContentReviewMaterial(original, capture('{"status":"pending"}'))).toThrow('terminal delivery differs')
    }
  })
  it('refuses a substituted delivery marker instead of selecting an earlier convenient answer', () => {
    const view = goalTaskContentReviewMaterial(material([reply(4, 'pending'), reply(5, 'wrong')]))
    expect(() => projectClaimEvidence({ ...view, source: { ...view.source, nativeGoal: { ...view.source.nativeGoal,
      delivery: { protocol: 'native-terminal.v1', messageId: 'reply-4', seq: 4 } } } })).toThrow('invalid-judgment')
  })
  it('uses the SDK nonempty append delivery after preparation, ignoring replace and empty-content events', () => {
    const empty = { ...reply(7, ''), data: { message: { id: 'reply-7', role: 'assistant', content: [] } } } as unknown as SessionEvent
    const view = goalTaskContentReviewMaterial(material([reply(2, 'old'), reply(4, 'pending'), reply(6, 'replacement', 'replace'), empty]))
    expect(view.source.nativeGoal).toMatchObject({ delivery: { messageId: 'reply-4', seq: 4 } })
    expect(() => goalTaskContentReviewMaterial(material([reply(2, 'old'), empty]))).toThrow('terminal delivery unavailable')
  })
  it('keeps historical whole-transcript material and captured answers unchanged when the frozen policy is absent', () => {
    const original = material([reply(4, 'Reading.'), reply(5, 'pending')], true, true)
    const view = goalTaskContentReviewMaterial(original, capture('Reading.pending'))
    expect(view.source.nativeGoal).not.toHaveProperty('delivery')
    expect(view.conversation.map(message => message.id)).toEqual(['reply-4', 'reply-5'])
    expect(view.fileResult).toEqual(capture('Reading.pending'))
  })
  it('parses only the explicitly frozen policy without upgrading historical preparations', () => {
    const legacy = { protocol: 'tianwen.goal-task-content-review.v1' }
    expect(parseGoalTaskContentReviewPlan(legacy)).toEqual(legacy)
    expect(parseGoalTaskContentReviewPlan({ ...legacy, deliveryPolicy: 'native-terminal.v1' })).toEqual({ ...legacy, deliveryPolicy: 'native-terminal.v1' })
    for (const value of [undefined, null, 'whole-transcript', 'native-terminal.v2']) {
      expect(() => parseGoalTaskContentReviewPlan({ ...legacy, deliveryPolicy: value })).toThrow()
    }
  })
})
