import { sha256, parseConversationFileEntries, conversationExternalInputsDigest,
  parseConversationExternalCheck, supportsConversationCodeCheck } from '../packages/tianwen-evolution/dist/index.js'

const sequence = value => Number.isSafeInteger(value) && value >= 1
const samePaths = (left, right) => sha256([...left].sort()) === sha256([...right].sort())

/** Read an already committed preparation, including later native root requests.
 * The original observer owns preparation and persistence. This function grants
 * no task verdict, consent, learning eligibility, method activation or repair.
 */
export function isDevelopmentNativePreparationCommitted(tasks, options) {
  try {
    if (!Array.isArray(tasks) || options === null || typeof options !== 'object') return false
    const { sessionId, request, nativeHeader, outputPaths, referencePaths } = options
    if (typeof sessionId !== 'string' || !sessionId.trim() || !Array.isArray(outputPaths) || outputPaths.length === 0 || !Array.isArray(referencePaths)) return false
    // Reuse original path identity and uniqueness rules; never normalize aliases.
    parseConversationFileEntries([...outputPaths, ...referencePaths].map(path => ({ path, content: null })))
    const matches = tasks.filter(task => task?.source?.sessionId === sessionId)
    if (matches.length !== 1) return false
    const task = matches[0], source = task.source, admission = task.admission
    if (source.kind !== 'task-started' || typeof source.taskId !== 'string' || !source.taskId.trim() || !sequence(source.startSeq)
      || admission?.kind !== 'task-admitted' || admission.taskId !== source.taskId || !supportsConversationCodeCheck(admission.decision)
      || task.completion !== undefined || task.reviewIntent !== undefined || task.review !== undefined
      || task.externalCheckFinished !== undefined || task.externalCheckInvalidated !== undefined) return false
    if (request?.source?.kind !== 'user' || request.role !== 'user' || typeof request.id !== 'string'
      || !Array.isArray(source.userMessageIds) || source.userMessageIds.length !== 1 || source.userMessageIds[0] !== request.id
      || sha256([request]) !== source.requestDigest) return false
    const prepared = parseConversationExternalCheck(task.externalCheckPrepared)
    if (prepared.kind !== 'task-external-check-prepared' || prepared.taskId !== source.taskId
      || prepared.preparedSeq < source.startSeq || prepared.requestDigest !== source.requestDigest
      || prepared.contextDigest !== source.contextDigest || prepared.admissionDigest !== sha256(admission)) return false
    const config = nativeHeader?.data?.header?.config
    if (nativeHeader?.type !== 'request/header' || !sequence(nativeHeader.seq) || nativeHeader.seq < source.startSeq
      || config === null || typeof config !== 'object' || Array.isArray(config) || sha256(config) !== prepared.modelConfigDigest) return false
    // Normal preparation can follow the first header. Models and captures from
    // earlier steps are valid; do not reapply the pre-submission empty-state rule.
    if (task.models !== undefined && (!Array.isArray(task.models) || task.models.some(model => model?.kind !== 'task-model-observed'
      || model.taskId !== source.taskId || !sequence(model.headerSeq) || model.headerSeq < source.startSeq
      || model.modelConfigDigest !== prepared.modelConfigDigest))) return false
    if (task.fileInputs !== undefined && (!Array.isArray(task.fileInputs) || task.fileInputs.some(input => input?.kind !== 'task-file-input-captured'
      || input.taskId !== source.taskId || !sequence(input.callSeq) || input.callSeq <= prepared.preparedSeq))) return false
    if (task.fileAncillary !== undefined && (!Array.isArray(task.fileAncillary) || task.fileAncillary.some(input => input?.taskId !== source.taskId
      || !sequence(input.callSeq) || input.callSeq <= prepared.preparedSeq))) return false
    if (prepared.project !== undefined) {
      const { inputs, outputPaths: originalOutputs } = prepared.project
      const originalReferences = inputs.filter(input => !originalOutputs.includes(input.path)).map(input => input.path)
      if (admission.decision.evaluationMode !== 'local-files' || admission.decision.fileOutputKind !== 'files'
        || conversationExternalInputsDigest(inputs) !== prepared.inputsDigest || !samePaths(originalOutputs, outputPaths)
        || !samePaths(originalReferences, referencePaths)
        || task.fileInputs?.some(input => !inputs.some(original => original.path === input.path && original.content === input.content))) return false
    }
    return true
  } catch {
    // Missing or invalid original evidence cannot be promoted or repaired here.
    return false
  }
}
