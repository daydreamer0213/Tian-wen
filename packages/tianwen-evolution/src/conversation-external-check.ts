import { parseConversationFileEntries, type ConversationFileEntry } from './conversation-files.js'
import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'
import type { ConversationAdmissionDecision, ConversationTask } from './conversation-learning.js'

export interface ConversationExternalCheckPrepared {
  readonly kind: 'task-external-check-prepared'
  readonly taskId: string
  readonly preparedSeq: number
  readonly requestDigest: Sha256Digest
  readonly contextDigest: Sha256Digest
  readonly admissionDigest: Sha256Digest
  readonly modelConfigDigest: Sha256Digest
  readonly checkerId: string
  readonly checkerDigest: Sha256Digest
  readonly contractDigest: Sha256Digest
  readonly inputsDigest: Sha256Digest
  /** Explicit host snapshot, not model tool observations. Future records only. */
  readonly project?: ConversationPreparedProject
  /** Trusted pre-answer condition from the original requirement; not model supplied. */
  readonly requiredCondition?: string
}

export interface ConversationPreparedProject {
  readonly inputs: readonly ConversationFileEntry[]
  readonly outputPaths: readonly string[]
}

export function parseConversationPreparedProject(value: unknown): ConversationPreparedProject {
  const row = fields(value, ['inputs', 'outputPaths'])
  const inputs = parseConversationFileEntries(row.inputs)
  const paths = row.outputPaths
  if (inputs.length === 0 || !Array.isArray(paths) || paths.length === 0
    || new Set(paths).size !== paths.length
    || paths.some(path => typeof path !== 'string' || !inputs.some(entry => entry.path === path))
    || inputs.some(entry => !paths.includes(entry.path) && entry.content === null)) throw new TypeError('invalid prepared project permissions')
  return { inputs, outputPaths: [...paths] as string[] }
}

export interface ConversationExternalCheckOutcome {
  /** Result of this specific check, never an automatic task/learning permission. */
  readonly status: 'verified' | 'rejected' | 'unverifiable'
  readonly detail: string
  /** Only a proved failure of the prepared condition, never generic diagnostics. */
  readonly failedRequiredConditionDigest?: Sha256Digest
}

export interface ConversationExternalCheckFinished extends ConversationExternalCheckOutcome {
  readonly kind: 'task-external-check-finished'
  readonly taskId: string
  readonly preparationDigest: Sha256Digest
  readonly resultDigest: Sha256Digest
  readonly fileResultDigest: Sha256Digest | null
  /** Complete outputs independently bound to the original observed subgraph. */
  readonly projectOutputs?: readonly ConversationFileEntry[]
}

/** Trusted host withdrawal; the original check and task review remain immutable. */
export interface ConversationExternalCheckInvalidated {
  readonly kind: 'task-external-check-invalidated'
  readonly taskId: string
  readonly preparationDigest: Sha256Digest
  readonly outcomeDigest: Sha256Digest
  readonly detail: string
}

/** Explicit source references, never a replacement task verdict. */
export interface ConversationCheckedFailureSource {
  readonly taskId: string
  readonly preparationDigest: Sha256Digest
  readonly outcomeDigest: Sha256Digest
  readonly requiredCondition: string
  readonly detail: string
}
export type ConversationCheckedFailureSources = readonly [ConversationCheckedFailureSource, ConversationCheckedFailureSource]

export function conversationCodeCheckIdentity(task: ConversationTask | undefined): Sha256Digest | undefined {
  const prepared = task?.externalCheckPrepared
  return prepared?.requiredCondition === undefined ? undefined : sha256({ checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, requiredCondition: prepared.requiredCondition })
}
export function conversationCheckedFailureSource(task: ConversationTask | undefined): ConversationCheckedFailureSource | undefined {
  if (!hasRejectedConversationCodeCheck(task)) return
  return { taskId: task!.source.taskId, preparationDigest: sha256(task!.externalCheckPrepared), outcomeDigest: sha256(task!.externalCheckFinished),
    requiredCondition: task!.externalCheckPrepared!.requiredCondition!, detail: task!.externalCheckFinished!.detail }
}
export function parseConversationCheckedFailureSources(value: unknown, ids: readonly [string, string]): ConversationCheckedFailureSources {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError('checked failure sources require exactly two references')
  const references = value.map((item, index) => {
    const row = fields(item, ['taskId', 'preparationDigest', 'outcomeDigest', 'requiredCondition', 'detail'])
    const taskId = text(row.taskId, 512)
    if (taskId !== ids[index]) throw new TypeError('checked failure references must match the exact source order')
    return { taskId, preparationDigest: digest(row.preparationDigest), outcomeDigest: digest(row.outcomeDigest), requiredCondition: text(row.requiredCondition, 4096), detail: text(row.detail, 4096) }
  })
  return [references[0]!, references[1]!]
}

/** Host-check applicability only; never a task verdict or learning permission. */
export function supportsConversationCodeCheck(decision: ConversationAdmissionDecision | null | undefined): boolean {
  return decision?.kind === 'task' && decision.family === 'code'
    && (decision.evaluationMode === 'external' || decision.evaluationMode === 'local-files' && decision.fileOutputKind === 'files')
}

/** A configured check may not contradict new successful counterevidence.
 * This does not establish a task verdict; unconfigured tasks keep their rules. */
export function hasSatisfiedConversationCodeCheck(task: ConversationTask | undefined): boolean {
  return task !== undefined && task.externalCheckInvalidated === undefined
    && (task.externalCheckPrepared === undefined || task.externalCheckFinished?.status === 'verified')
}
/** Negative evidence only. Legacy or unrelated checker rejection is diagnostic. */
export function hasRejectedConversationCodeCheck(task: ConversationTask | undefined): boolean {
  return task !== undefined && task.externalCheckInvalidated === undefined && task.admission?.decision?.evaluationMode === 'local-files'
    && supportsConversationCodeCheck(task.admission.decision)
    && task.externalCheckPrepared?.requiredCondition !== undefined && task.externalCheckFinished?.status === 'rejected'
    && task.externalCheckFinished.failedRequiredConditionDigest === sha256(task.externalCheckPrepared.requiredCondition)
}

function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('invalid external check fields')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > max) throw new TypeError('invalid external check text')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('invalid external check digest')
  return value as Sha256Digest
}
export function conversationExternalInputsDigest(value: readonly ConversationFileEntry[]): Sha256Digest {
  const entries = parseConversationFileEntries(value)
  if (entries.length === 0) throw new TypeError('external check requires frozen target inputs')
  return sha256([...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
export function parseConversationExternalCheckOutcome(value: unknown): ConversationExternalCheckOutcome {
  const qualified = value !== null && typeof value === 'object' && Object.hasOwn(value, 'failedRequiredConditionDigest')
  const row = fields(value, ['status', 'detail', ...(qualified ? ['failedRequiredConditionDigest'] : [])])
  if (typeof row.status !== 'string' || !['verified', 'rejected', 'unverifiable'].includes(row.status)) throw new TypeError('invalid external check status')
  if (qualified && row.status !== 'rejected') throw new TypeError('failed required condition requires rejection')
  return { status: row.status as ConversationExternalCheckOutcome['status'], detail: text(row.detail, 4096),
    ...(qualified ? { failedRequiredConditionDigest: digest(row.failedRequiredConditionDigest) } : {}) }
}
export function parseConversationExternalCheck(value: unknown): ConversationExternalCheckPrepared | ConversationExternalCheckFinished | ConversationExternalCheckInvalidated {
  const kind = (value as { kind?: unknown } | null)?.kind
  if (kind === 'task-external-check-invalidated') {
    const row = fields(value, ['kind', 'taskId', 'preparationDigest', 'outcomeDigest', 'detail'])
    return { kind, taskId: text(row.taskId, 512), preparationDigest: digest(row.preparationDigest), outcomeDigest: digest(row.outcomeDigest), detail: text(row.detail, 4096) }
  }
  if (kind === 'task-external-check-prepared') {
    const qualified = Object.hasOwn(value as object, 'requiredCondition')
    const project = Object.hasOwn(value as object, 'project')
    const row = fields(value, ['kind', 'taskId', 'preparedSeq', 'requestDigest', 'contextDigest', 'admissionDigest', 'modelConfigDigest', 'checkerId', 'checkerDigest', 'contractDigest', 'inputsDigest', ...(qualified ? ['requiredCondition'] : []), ...(project ? ['project'] : [])])
    if (!Number.isSafeInteger(row.preparedSeq) || (row.preparedSeq as number) < 1) throw new TypeError('invalid external check boundary')
    return { kind, taskId: text(row.taskId, 512), preparedSeq: row.preparedSeq as number,
      requestDigest: digest(row.requestDigest), contextDigest: digest(row.contextDigest), admissionDigest: digest(row.admissionDigest),
      modelConfigDigest: digest(row.modelConfigDigest), checkerId: text(row.checkerId, 512), checkerDigest: digest(row.checkerDigest),
      contractDigest: digest(row.contractDigest), inputsDigest: digest(row.inputsDigest), ...(qualified ? { requiredCondition: text(row.requiredCondition, 4096) } : {}),
      ...(project ? { project: parseConversationPreparedProject(row.project) } : {}) }
  }
  if (kind !== 'task-external-check-finished') throw new TypeError('invalid external check kind')
  const qualified = Object.hasOwn(value as object, 'failedRequiredConditionDigest')
  const project = Object.hasOwn(value as object, 'projectOutputs')
  const row = fields(value, ['kind', 'taskId', 'preparationDigest', 'resultDigest', 'fileResultDigest', 'status', 'detail', ...(qualified ? ['failedRequiredConditionDigest'] : []), ...(project ? ['projectOutputs'] : [])])
  return { kind, taskId: text(row.taskId, 512), preparationDigest: digest(row.preparationDigest), resultDigest: digest(row.resultDigest),
    fileResultDigest: row.fileResultDigest === null ? null : digest(row.fileResultDigest),
    ...(project ? { projectOutputs: parseConversationFileEntries(row.projectOutputs) } : {}),
    ...parseConversationExternalCheckOutcome({ status: row.status, detail: row.detail, ...(qualified ? { failedRequiredConditionDigest: row.failedRequiredConditionDigest } : {}) }) }
}

export function validateConversationExternalCheck(record: ConversationExternalCheckPrepared | ConversationExternalCheckFinished | ConversationExternalCheckInvalidated, task: ConversationTask): void {
  const decision = task.admission?.decision
  if (!supportsConversationCodeCheck(decision)) throw new Error('external check requires file code admission')
  if (record.kind === 'task-external-check-invalidated') {
    if (record.taskId !== task.source.taskId || task.externalCheckPrepared === undefined || task.externalCheckFinished === undefined
      || record.preparationDigest !== sha256(task.externalCheckPrepared) || record.outcomeDigest !== sha256(task.externalCheckFinished)) {
      throw new Error('check invalidation requires the exact completed preparation and outcome')
    }
    return
  }
  if (record.kind === 'task-external-check-prepared') {
    if (task.completion !== undefined || (task.models?.length ?? 0) > 0 || (task.fileInputs?.length ?? 0) > 0
      || task.fileUnavailable !== undefined || (task.fileAncillary?.length ?? 0) > 0) throw new Error('external check must be prepared before the candidate or file execution')
    if (record.preparedSeq < task.source.startSeq || record.requestDigest !== task.source.requestDigest
      || record.contextDigest !== task.source.contextDigest || record.admissionDigest !== sha256(task.admission)) throw new Error('external check preparation does not match the original task')
    if (record.project !== undefined && (decision?.evaluationMode !== 'local-files' || decision.fileOutputKind !== 'files'
      || conversationExternalInputsDigest(parseConversationPreparedProject(record.project).inputs) !== record.inputsDigest)) throw new Error('prepared project does not match original inputs or admission')
    return
  }
  const prepared = task.externalCheckPrepared, completion = task.completion
  if (prepared === undefined || completion === undefined || record.preparationDigest !== sha256(prepared)
    || record.resultDigest !== completion.resultDigest || record.fileResultDigest !== (completion.files === undefined ? null : sha256(completion.files))) {
    throw new Error('external check result does not match its preparation and task result')
  }
  if (record.failedRequiredConditionDigest !== undefined && (record.status !== 'rejected' || prepared.requiredCondition === undefined
    || record.failedRequiredConditionDigest !== sha256(prepared.requiredCondition))) throw new Error('failed required condition does not match its pre-answer contract')
  if (record.status === 'unverifiable') {
    if (record.projectOutputs !== undefined) throw new Error('unverifiable check cannot publish checked project outputs')
    return
  }
  if (completion.status !== 'completed' || completion.files?.outputKind !== 'files' || task.fileUnavailable !== undefined
    || (task.models?.length ?? 0) === 0 || task.models!.some(model => model.modelConfigDigest !== prepared.modelConfigDigest)
    || (task.fileInputs?.length ?? 0) === 0 || task.fileInputs!.some(input => input.callSeq <= prepared.preparedSeq)
    || prepared.preparedSeq >= completion.endSeq) throw new Error('external check cannot conclude from changed or missing task evidence')
  if (prepared.project === undefined) {
    if (record.projectOutputs !== undefined || conversationExternalInputsDigest(task.fileInputs!.map(({ path, content }) => ({ path, content }))) !== prepared.inputsDigest) throw new Error('external check cannot conclude from changed or missing task evidence')
  } else {
    validateConversationPreparedProjectObservation(task)
    const outputs = parseConversationFileEntries(record.projectOutputs)
    const { inputs, outputPaths } = prepared.project
    if (sha256(outputs.map(entry => entry.path)) !== sha256(inputs.map(entry => entry.path))
      || outputs.some(entry => outputPaths.includes(entry.path) ? entry.content === null : entry.content !== inputs.find(input => input.path === entry.path)?.content)
      || completion.files!.entries.some(entry => outputs.find(output => output.path === entry.path)?.content !== entry.content)) throw new Error('checked project outputs do not match original task files')
  }
}

/** Validate actual tool-captured preimages and permissions without inventing reads. */
export function validateConversationPreparedProjectObservation(task: ConversationTask): void {
  const prepared = task.externalCheckPrepared!, project = parseConversationPreparedProject(prepared.project), result = task.completion?.files
  const observed = task.fileInputs?.map(({ path, content }) => ({ path, content }))
  if (conversationExternalInputsDigest(project.inputs) !== prepared.inputsDigest || result?.outputKind !== 'files'
    || observed === undefined || observed.length === 0 || result.inputsDigest !== sha256(observed)
    || observed.some(entry => !project.inputs.some(input => input.path === entry.path && input.content === entry.content))
    || sha256([...result.outputPaths].sort()) !== sha256([...project.outputPaths].sort())
    || sha256(result.entries.map(entry => entry.path)) !== sha256(observed.map(entry => entry.path))
    || result.entries.some(entry => !project.outputPaths.includes(entry.path) && entry.content !== project.inputs.find(input => input.path === entry.path)?.content)
    || project.outputPaths.some(path => result.entries.find(entry => entry.path === path)?.content == null)) throw new Error('prepared project and actual native observations differ')
}

/** Durable complete graph; no filesystem reads, checker rerun or history augmentation. */
export function conversationTaskCheckedProject(task: ConversationTask): { readonly inputs: readonly ConversationFileEntry[], readonly outputs: readonly ConversationFileEntry[], readonly outputPaths: readonly string[] } | undefined {
  if (task.externalCheckPrepared?.project === undefined || task.externalCheckFinished === undefined || task.externalCheckFinished.status === 'unverifiable') return
  validateConversationExternalCheck(task.externalCheckFinished, task)
  return structuredClone({ inputs: task.externalCheckPrepared.project.inputs, outputs: task.externalCheckFinished.projectOutputs!, outputPaths: task.externalCheckPrepared.project.outputPaths })
}
