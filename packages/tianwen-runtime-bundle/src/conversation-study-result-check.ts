import { conversationExternalInputsDigest, parseConversationExternalCheckOutcome, parseGuidanceCaseResultChecks, sha256,
  type ConversationExternalCheckOutcome, type ConversationFileEntry, type ConversationFileMaterial, type ConversationQualityContract,
  type GuidanceCaseResultCheck, type GuidanceStudyBody } from '@tianwen/evolution'
import type { ConversationTaskMaterial } from './conversation-task-material.js'
import type { NativeGoalTaskStudyMaterial } from './goal-task-research-source.js'
import { withConversationObservationCancellation } from './conversation-external-check.js'

export type ConversationStudyResultMaterial = {
  readonly criteria: readonly string[]
  readonly qualityContract?: ConversationQualityContract
  readonly files: ConversationFileMaterial
} & ({ readonly request: ConversationTaskMaterial['request'], readonly context: ConversationTaskMaterial['context'],
  readonly objective: string, readonly feedbackStandard?: ConversationTaskMaterial['feedbackStandard'] } | { readonly prompt: string }
  | { readonly sourceKind: 'native-goal-task', readonly prompt: string })
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
  /** Explicit bounded isolated producer; cancellation waits for its owned cleanup. */
  readonly waitsForCancellationCleanup?: true
  readonly inputs: readonly ConversationFileEntry[]
  /** Trusted host check shared by both arms. Generated code requires an explicit, bounded isolated host producer. */
  readonly evaluate: (candidate: ConversationStudyResultCandidate) => Promise<ConversationExternalCheckOutcome>
}
export interface ConversationStudyResultCheck {
  /** Trusted host tasks, fixed before native case design. Missing input stops; no synthetic fallback. */
  readonly prepareIndependentCases?: (material: {
    readonly sources: readonly (ConversationTaskMaterial | NativeGoalTaskStudyMaterial)[]
    readonly counterexample: ConversationTaskMaterial | NativeGoalTaskStudyMaterial
    readonly modelConfigDigest: ReturnType<typeof sha256>
    readonly qualityContract: ConversationQualityContract
    readonly cwd: string
    readonly signal: AbortSignal
  }) => Promise<{
    readonly adjacent: { readonly prompt: string, readonly criteria: readonly string[], readonly files: { readonly entries: readonly ConversationFileEntry[], readonly outputPaths: readonly string[] } }
    readonly holdout: { readonly prompt: string, readonly criteria: readonly string[], readonly files: { readonly entries: readonly ConversationFileEntry[], readonly outputPaths: readonly string[] } }
  } | undefined>
  /** All applicable cases must be prepared before proposal; undefined stops this study. */
  readonly prepare: (material: ConversationStudyResultPreparation) => Promise<PreparedConversationStudyResultCheck | undefined>
}
/** Complete pre-answer material; its digest includes the original requirements. */
export type ConversationAnswerStudyMaterial = ConversationTaskMaterial | NativeGoalTaskStudyMaterial
  | { readonly prompt: string, readonly criteria: readonly string[], readonly qualityContract?: ConversationQualityContract, readonly files?: ConversationFileMaterial }
export interface PreparedConversationAnswerStudyResultCheck {
  readonly checkerId: string
  readonly checkerDigest: ReturnType<typeof sha256>
  readonly contractDigest: ReturnType<typeof sha256>
  readonly inputsDigest: ReturnType<typeof sha256>
  readonly requiredCondition: string
  readonly waitsForCancellationCleanup?: true
  readonly evaluate: (candidate: { readonly material: ConversationAnswerStudyMaterial, readonly answer: string,
    readonly files: readonly ConversationFileEntry[], readonly signal: AbortSignal }) => Promise<ConversationExternalCheckOutcome>
}
export interface ConversationAnswerStudyResultCheck {
  /** Complete host cases fixed before native design; absence preserves original pre-proposal preparation. */
  readonly prepareIndependentCases?: (input: {
    readonly sources: readonly (ConversationTaskMaterial | NativeGoalTaskStudyMaterial)[]
    readonly counterexample: ConversationTaskMaterial | NativeGoalTaskStudyMaterial
    readonly modelConfigDigest: ReturnType<typeof sha256>
    readonly qualityContract: ConversationQualityContract
    readonly cwd?: string
    readonly signal: AbortSignal
  }) => Promise<{
    readonly adjacent: { readonly prompt: string, readonly criteria: readonly string[], readonly files?: { readonly entries: readonly ConversationFileEntry[], readonly outputPaths: readonly string[] } }
    readonly holdout: { readonly prompt: string, readonly criteria: readonly string[], readonly files?: { readonly entries: readonly ConversationFileEntry[], readonly outputPaths: readonly string[] } }
  } | undefined>
  /** No complete independent contract means stop this study, never a model fallback. */
  readonly prepare: (input: { readonly material: ConversationAnswerStudyMaterial, readonly caseId: string,
    readonly modelConfigDigest: ReturnType<typeof sha256>, readonly signal: AbortSignal }) => Promise<PreparedConversationAnswerStudyResultCheck | undefined>
}
export interface PreparedStudyResultChecks {
  readonly checks: readonly GuidanceCaseResultCheck[]
  readonly evaluators: ReadonlyMap<string, { readonly material: ConversationStudyResultMaterial, readonly evaluate: PreparedConversationStudyResultCheck['evaluate'], readonly waitsForCancellationCleanup?: true }>
  readonly answerEvaluators?: ReadonlyMap<string, { readonly material: ConversationAnswerStudyMaterial,
    readonly evaluate: PreparedConversationAnswerStudyResultCheck['evaluate'], readonly waitsForCancellationCleanup?: true }>
}
export async function prepareConversationAnswerStudyResultChecks(check: ConversationAnswerStudyResultCheck, body: GuidanceStudyBody,
  materials: readonly ConversationAnswerStudyMaterial[], signal: AbortSignal): Promise<PreparedStudyResultChecks> {
  const fileChat = body.evaluationMode === 'local-files' && body.fileOutputKind === 'chat'
  if (materials.length !== 5 || (!fileChat && (body.evaluationMode !== undefined || body.fileOutputKind !== undefined))) throw new Error('source-unavailable')
  const preparedChecks: GuidanceCaseResultCheck[] = []
  const answerEvaluators = new Map<string, { material: ConversationAnswerStudyMaterial,
    evaluate: PreparedConversationAnswerStudyResultCheck['evaluate'], waitsForCancellationCleanup?: true }>()
  for (const [index, value] of materials.entries()) {
    const item = body.cases[index]
    if (item === undefined || sha256(value) !== item.materialDigest || (fileChat ? value.files?.outputKind !== 'chat' : value.files !== undefined)) throw new Error('source-unavailable')
    const material = structuredClone(value)
    const prepared = await withConversationObservationCancellation(signal, () => check.prepare({ material: structuredClone(material),
      caseId: item.id, modelConfigDigest: body.modelConfigDigest, signal }))
    signal.throwIfAborted()
    if (prepared === undefined || typeof prepared.evaluate !== 'function' || prepared.inputsDigest !== item.materialDigest) throw new Error('source-unavailable')
    preparedChecks.push({ inputKind: fileChat ? 'file-chat-material.v1' : 'text-material.v1', caseId: item.id,
      checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest, contractDigest: prepared.contractDigest,
      inputsDigest: prepared.inputsDigest, requiredCondition: prepared.requiredCondition,
      ...(fileChat ? { fileInputsDigest: conversationExternalInputsDigest(material.files!.entries) } : {}) })
    answerEvaluators.set(item.id, { material, evaluate: prepared.evaluate,
      ...(prepared.waitsForCancellationCleanup === true ? { waitsForCancellationCleanup: true } : {}) })
  }
  return { checks: parseGuidanceCaseResultChecks(preparedChecks, body), evaluators: new Map(), answerEvaluators }
}
export async function prepareConversationStudyResultChecks(check: ConversationStudyResultCheck, body: GuidanceStudyBody,
  materials: readonly (ConversationTaskMaterial | { readonly prompt: string, readonly criteria: readonly string[], readonly qualityContract?: ConversationQualityContract, readonly files?: ConversationFileMaterial })[],
  signal: AbortSignal): Promise<PreparedStudyResultChecks> {
  if (body.family !== 'code' || body.evaluationMode !== 'local-files' || body.fileOutputKind !== 'files' || materials.length !== 5) throw new Error('source-unavailable')
  const checks: GuidanceCaseResultCheck[] = []
  const evaluators = new Map<string, { material: ConversationStudyResultMaterial, evaluate: PreparedConversationStudyResultCheck['evaluate'], waitsForCancellationCleanup?: true }>()
  for (const [index, value] of materials.entries()) {
    if (value.files?.outputKind !== 'files' || sha256(value) !== body.cases[index]!.materialDigest) throw new Error('source-unavailable')
    const material: ConversationStudyResultMaterial = structuredClone({
      ...('request' in value ? { request: value.request, context: value.context, objective: value.objective,
        ...(value.feedbackStandard === undefined ? {} : { feedbackStandard: value.feedbackStandard }) } : { prompt: value.prompt,
          ...('sourceKind' in value ? { sourceKind: value.sourceKind as 'native-goal-task' } : {}) }),
      criteria: value.criteria, ...(value.qualityContract === undefined ? {} : { qualityContract: value.qualityContract }), files: value.files,
    })
    const prepared = await withConversationObservationCancellation(signal, () => check.prepare({ ...structuredClone(material),
      caseId: body.cases[index]!.id, modelConfigDigest: body.modelConfigDigest, signal }))
    signal.throwIfAborted()
    if (prepared === undefined || typeof prepared.evaluate !== 'function'
      || conversationExternalInputsDigest(prepared.inputs) !== conversationExternalInputsDigest(material.files.entries)) throw new Error('source-unavailable')
    checks.push({ caseId: body.cases[index]!.id, checkerId: prepared.checkerId, checkerDigest: prepared.checkerDigest,
      contractDigest: prepared.contractDigest, inputsDigest: conversationExternalInputsDigest(material.files.entries), requiredCondition: prepared.requiredCondition })
    evaluators.set(body.cases[index]!.id, { material, evaluate: prepared.evaluate,
      ...(prepared.waitsForCancellationCleanup === true ? { waitsForCancellationCleanup: true } : {}) })
  }
  return { checks: parseGuidanceCaseResultChecks(checks, body), evaluators }
}
export async function evaluateConversationStudyResultCheck(prepared: PreparedStudyResultChecks, caseId: string,
  output: { readonly answer: string, readonly files: readonly ConversationFileEntry[] }, signal: AbortSignal): Promise<ConversationExternalCheckOutcome> {
  try {
    const current = prepared.evaluators.get(caseId)
    const answerCheck = prepared.answerEvaluators?.get(caseId)
    const check = prepared.checks.find(check => check.caseId === caseId)
    if (current === undefined && answerCheck === undefined || check === undefined) throw new Error('Prepared study check unavailable; no post-answer preparation or rerun.')
    const outcome = parseConversationExternalCheckOutcome(await withConversationObservationCancellation(signal, () => answerCheck !== undefined
      ? answerCheck.evaluate({ material: structuredClone(answerCheck.material), answer: output.answer, files: structuredClone(output.files), signal })
      : current!.evaluate({
      ...structuredClone(current!.material), answer: output.answer, inputs: structuredClone(current!.material.files.entries),
      outputs: structuredClone(output.files), outputPaths: [...current!.material.files.outputPaths], signal,
    }), (answerCheck ?? current)?.waitsForCancellationCleanup === true))
    if (outcome.failedRequiredConditionDigest !== undefined && outcome.failedRequiredConditionDigest !== sha256(check.requiredCondition)) throw new Error('Check failure does not match the frozen required condition.')
    return outcome
  } catch (error) {
    signal.throwIfAborted()
    return { status: 'unverifiable', detail: (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'Study check unavailable.' }
  }
}
