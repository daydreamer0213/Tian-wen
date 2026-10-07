import type { Context } from '@deepseek-ai/cordis'
import { sha256 } from '../packages/tianwen-evolution/src/index.js'
import { recoverConversationTaskAnswer, recoverConversationTaskMaterial, recoverConversationTaskModel } from '../packages/tianwen-runtime-bundle/src/conversation-task-material.js'
import { verifyCapturedFileFactTable, type FileFactVerification } from './learning-result-verifier-probe.js'

export type NativeFileFactDiagnostic =
  | { readonly availability: 'unavailable'; readonly reason: string }
  | { readonly availability: 'recovered'; readonly requirementCoverage: 'unestablished'; readonly verification: FileFactVerification;
    readonly binding: { readonly taskId: string; readonly requestDigest: string; readonly contextDigest: string;
      readonly admissionDigest: string; readonly resultDigest: string } }

/** Read-only experiment, not registered in production. No task verdict or activation permission.
 * Identity comes from the recorded task; completeness of its derived criteria is not established. */
export async function recoverNativeFileFactDiagnostic(ctx: Context, taskId: string): Promise<NativeFileFactDiagnostic> {
  const recorded = ctx.tianwenEvolution.listConversationTasks().find(task => task.source.taskId === taskId)
  if (recorded === undefined) return { availability: 'unavailable', reason: 'recorded-task-required' }
  const task = structuredClone(recorded)
  if (task.source.materialProjection !== 'surface-text.v1' || task.admission?.decision?.evaluationMode !== 'local-files'
    || task.admission.decision.fileOutputKind !== 'chat' || task.completion?.status !== 'completed') {
    return { availability: 'unavailable', reason: 'supported-completed-file-chat-required' }
  }
  try {
    const material = await recoverConversationTaskMaterial(ctx, task)
    const answer = await recoverConversationTaskAnswer(ctx, task)
    await recoverConversationTaskModel(ctx, task)
    if (material.files?.outputKind !== 'chat') return { availability: 'unavailable', reason: 'frozen-file-material-required' }
    const blocks = answer.flatMap(message => message.content)
    let verification: FileFactVerification = { status: 'unverifiable', reason: 'single-canonical-json-answer-required' }
    if (blocks.length === 1 && blocks[0]!.type === 'text') {
      const text = blocks[0]!.text.trim()
      try {
        const value: unknown = JSON.parse(text)
        // Reject duplicate fields and selected snippets; this is a deliberately narrow input format.
        if (JSON.stringify(value) === text) verification = verifyCapturedFileFactTable(value, material.files.entries)
      } catch { /* Prose is outside the experiment's supported input format. */ }
    }
    const current = ctx.tianwenEvolution.listConversationTasks().find(item => item.source.taskId === taskId)
    if (sha256(current) !== sha256(task)) return { availability: 'unavailable', reason: 'recorded-task-changed' }
    return { availability: 'recovered', requirementCoverage: 'unestablished', verification, binding: {
      taskId, requestDigest: task.source.requestDigest, contextDigest: task.source.contextDigest,
      admissionDigest: sha256(task.admission), resultDigest: task.completion.resultDigest,
    } }
  } catch { return { availability: 'unavailable', reason: 'native-evidence-unavailable-or-changed' } }
}
