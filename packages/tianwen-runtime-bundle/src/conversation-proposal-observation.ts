import type { Context } from '@deepseek-ai/cordis'
import { conversationTaskInputDigest, sha256, type ConversationTask } from '@tianwen/evolution'
import { recoverConversationTaskAnswer, recoverConversationTaskMaterial, conversationTaskResultFiles } from './conversation-task-material.js'

/** Historical results for the proposer only; never part of study worker inputs. */
export async function recoverConversationProposalObservation(ctx: Context, task: ConversationTask) {
  const original = await recoverConversationTaskMaterial(ctx, task)
  if (task.admission?.decision?.evaluationMode === 'local-files' && original.files === undefined) throw new Error('source-unavailable')
  const deliveries = await recoverConversationTaskAnswer(ctx, task)
  const files = original.files === undefined ? undefined : conversationTaskResultFiles(task)
  if (original.files !== undefined && files === undefined) throw new Error('source-unavailable')
  const answer = deliveries.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('')
  const output = files === undefined ? undefined : { answer, files }
  return structuredClone({ sourceId: task.source.taskId, sourceInputDigest: conversationTaskInputDigest(task) ?? task.source.requestDigest,
    resultDigest: task.completion!.resultDigest, deliveries, acceptance: task.externalCheckFinished ?? null,
    review: task.review ?? null, reviewChecks: task.review?.reviewChecks ?? [],
    ...(output === undefined ? {} : { fileResult: { ...output, outputDigest: sha256(output) } }) })
}
