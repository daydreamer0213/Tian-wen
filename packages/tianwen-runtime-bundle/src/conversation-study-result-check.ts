import { conversationExternalInputsDigest, parseConversationExternalCheckOutcome, parseGuidanceCaseResultChecks, sha256,
  type ConversationExternalCheckOutcome, type ConversationFileEntry, type ConversationFileMaterial, type ConversationQualityContract,
  type GuidanceCaseResultCheck, type GuidanceStudyBody } from '@tianwen/evolution'
import type { ConversationTaskMaterial } from './conversation-task-material.js'
import { withConversationObservationCancellation } from './conversation-external-check.js'

export type ConversationStudyResultMaterial = {
  readonly criteria: readonly string[]
  readonly qualityContract?: ConversationQualityContract
  readonly files: ConversationFileMaterial
} & ({ readonly request: ConversationTaskMaterial['request'], readonly context: ConversationTaskMaterial['context'],
  readonly objective: string, readonly feedbackStandard?: ConversationTaskMaterial['feedbackStandard'] } | { readonly prompt: string })
export type ConversationStudyResultPreparation = ConversationStudyResultMaterial & {
  readonly caseId: string
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly signal: AbortSignal
}
export type ConversationStudyResultCandidate = ConversationStudyResultMaterial & {
  readonly answer: string
  readonly inputs: readonly ConversationFileEntry[]
  readonly outputs: readonly ConversationFileEntry[]
  readonly outputPaths: readonly string[]
  readonly signal: AbortSignal
}
export interface PreparedConversationStudyResultCheck {
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly requiredCondition: string
  readonly inputs: readonly ConversationFileEntry[]
  /** Trusted host code only; never execute generated code. Shared by both arms. */
  readonly evaluate: (candidate: ConversationStudyResultCandidate) => Promise<ConversationExternalCheckOutcome>
}
export interface ConversationStudyResultCheck {
  /** All applicable cases must be prepared before proposal; undefined stops this study. */
  readonly prepare: (material: ConversationStudyResultPreparation) => Promise<PreparedConversationStudyResultCheck | undefined>
}
export interface PreparedStudyResultChecks {
  readonly checks: readonly GuidanceCaseResultCheck[]
  readonly evaluators: ReadonlyMap<string, { readonly material: ConversationStudyResultMaterial, readonly evaluate: PreparedConversationStudyResultCheck['evaluate'] }>
}
export async function prepareConversationStudyResultChecks(check: ConversationStudyResultCheck, body: GuidanceStudyBody,
  materials: readonly (ConversationTaskMaterial | { readonly prompt: string, readonly criteria: readonly string[], readonly qualityContract?: ConversationQualityContract, readonly files?: ConversationFileMaterial })[],
  signal: AbortSignal): Promise<PreparedStudyResultChecks> {
  if (body.family !== 'code' || body.evaluationMode !== 'local-files' || body.fileOutputKind !== 'files' || materials.length !== 5) throw new Error('source-unavailable')
  const checks: GuidanceCaseResultCheck[] = []
  const evaluators = new Map<string, { material: ConversationStudyResultMaterial, evaluate: PreparedConversationStudyResultCheck['evaluate'] }>()
  for (const [index, value] of materials.entries()) {
    if (value.files?.outputKind !== 'files' || sha256(value) !== body.cases[index]!.materialDigest) throw new Error('source-unavailable')
    const material: ConversationStudyResultMaterial = structuredClone({
      ...('request' in value ? { request: value.request, context: value.context, objective: value.objective,
        ...(value.feedbackStandard === undefined ? {} : { feedbackStandard: value.feedbackStandard }) } : { prompt: value.prompt }),
      criteria: value.criteria, ...(value.qualityContract === undefined ? {} : { qualityContract: value.qualityContract }), files: value.files,
    })
    const prepared = await withConversationObservationCancellation(signal, () => check.prepare({ ...structuredClone(material),
      caseId: body.cases[index]!.id, modelConfigDigest: body.modelConfigDigest, signal }))
    signal.throwIfAborted()
    if (prepared === undefined || typeof prepared.evaluate !== 'function'
      || conversationExternalInputsDigest(prepared.inputs) !== conversationExternalInputsDigest(material.files.entries)) throw new Error('source-unavailable')
    checks.push({ caseId: body.cases[index]!.id, checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest,
      contractDigest: prepared.contractDigest, inputsDigest: conversationExternalInputsDigest(material.files.entries), requiredCondition: prepared.requiredCondition })
    evaluators.set(body.cases[index]!.id, { material, evaluate: prepared.evaluate })
  }
  return { checks: parseGuidanceCaseResultChecks(checks, body), evaluators }
}
export async function evaluateConversationStudyResultCheck(prepared: PreparedStudyResultChecks, caseId: string,
  output: { readonly answer: string, readonly files: readonly ConversationFileEntry[] }, signal: AbortSignal): Promise<ConversationExternalCheckOutcome> {
  try {
    const current = prepared.evaluators.get(caseId)
    const check = prepared.checks.find(check => check.caseId === caseId)
    if (current === undefined || check === undefined) throw new Error('Prepared study check unavailable; no post-answer preparation or rerun.')
    const outcome = parseConversationExternalCheckOutcome(await withConversationObservationCancellation(signal, () => current.evaluate({
      ...structuredClone(current.material), answer: output.answer, inputs: structuredClone(current.material.files.entries),
      outputs: structuredClone(output.files), outputPaths: [...current.material.files.outputPaths], signal,
    })))
    if (outcome.failedRequiredConditionDigest !== undefined && outcome.failedRequiredConditionDigest !== sha256(check.requiredCondition)) throw new Error('Check failure does not match the frozen required condition.')
    return outcome
  } catch (error) {
    signal.throwIfAborted()
    return { status: 'unverifiable', detail: (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'Study check unavailable.' }
  }
}
