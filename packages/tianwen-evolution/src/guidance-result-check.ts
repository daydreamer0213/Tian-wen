import { conversationExternalInputsDigest, parseConversationExternalCheckOutcome, type ConversationExternalCheckOutcome } from './conversation-external-check.js'
import { sha256 } from './learning-intake.js'
import type { Sha256Digest } from './ledger.js'
import type { GuidanceArmRecord, GuidanceStudy, GuidanceStudyBody } from './conversation-guidance.js'

export interface GuidanceCaseResultCheck {
  readonly caseId: string
  readonly checkerId: string
  readonly checkerDigest: Sha256Digest
  readonly contractDigest: Sha256Digest
  readonly inputsDigest: Sha256Digest
  readonly requiredCondition: string
}
export interface GuidanceArmResultCheck extends ConversationExternalCheckOutcome {
  readonly preparationDigest: Sha256Digest
  readonly outputDigest: Sha256Digest
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) throw new TypeError('invalid guidance result check fields')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || Buffer.byteLength(value, 'utf8') > max) throw new TypeError('invalid guidance result check text')
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('invalid guidance result check digest')
  return value as Sha256Digest
}
export function parseGuidanceCaseResultChecks(value: unknown, opened: Pick<GuidanceStudyBody, 'cases' | 'family' | 'evaluationMode' | 'fileOutputKind'>): readonly GuidanceCaseResultCheck[] {
  if (opened.family !== 'code' || opened.evaluationMode !== 'local-files' || opened.fileOutputKind !== 'files'
    || !Array.isArray(value) || value.length !== 5) throw new TypeError('guidance result check requires five file code cases')
  return Array.from(value, (item, index) => {
    const row = fields(item, ['caseId', 'checkerId', 'checkerDigest', 'contractDigest', 'inputsDigest', 'requiredCondition'])
    const result = { caseId: text(row.caseId, 512), checkerId: text(row.checkerId, 512), checkerDigest: digest(row.checkerDigest),
      contractDigest: digest(row.contractDigest), inputsDigest: digest(row.inputsDigest), requiredCondition: text(row.requiredCondition, 4096) }
    const task = opened.cases[index]
    if (task?.id !== result.caseId || 'prompt' in task && (task.files === undefined || conversationExternalInputsDigest(task.files.entries) !== result.inputsDigest)) {
      throw new TypeError('guidance result check does not match the exact case or frozen inputs')
    }
    return result
  })
}
export function parseGuidanceArmResultCheck(value: unknown): GuidanceArmResultCheck {
  const qualified = value !== null && typeof value === 'object' && Object.hasOwn(value, 'failedRequiredConditionDigest')
  const row = fields(value, ['preparationDigest', 'outputDigest', 'status', 'detail', ...(qualified ? ['failedRequiredConditionDigest'] : [])])
  return { preparationDigest: digest(row.preparationDigest), outputDigest: digest(row.outputDigest),
    ...parseConversationExternalCheckOutcome({ status: row.status, detail: row.detail, ...(qualified ? { failedRequiredConditionDigest: row.failedRequiredConditionDigest } : {}) }) }
}
export function guidanceResultCheckDigest(opened: Pick<GuidanceStudyBody, 'cases' | 'modelConfigDigest'>, check: GuidanceCaseResultCheck): Sha256Digest {
  const item = opened.cases.find(item => item.id === check.caseId)
  if (item === undefined) throw new TypeError('guidance result check case unavailable')
  return sha256({ check, materialDigest: item.materialDigest, modelConfigDigest: opened.modelConfigDigest })
}
export function validateGuidanceArmResultCheck(opened: GuidanceStudyBody, arm: GuidanceArmRecord): void {
  if (arm.resultCheck === undefined) return
  const check = opened.resultChecks?.find(check => check.caseId === arm.caseId)
  if (check === undefined || arm.resultCheck.preparationDigest !== guidanceResultCheckDigest(opened, check)
    || arm.resultCheck.outputDigest !== arm.outputDigest
    || arm.resultCheck.failedRequiredConditionDigest !== undefined && arm.resultCheck.failedRequiredConditionDigest !== sha256(check.requiredCondition)) {
    throw new Error('guidance result check does not match its preparation and native output')
  }
}
/** This is an additional configured evidence guard, never a model verdict. */
export function hasSatisfiedGuidanceResultChecks(study: GuidanceStudy): boolean {
  const opened = study.opened
  if (opened.resultChecks === undefined) return true
  if (study.arms.length !== 10) return false
  let sourceImproved = false
  try {
    for (const item of opened.cases) {
      const check = opened.resultChecks.find(check => check.caseId === item.id)
      const arms = study.arms.filter(arm => arm.caseId === item.id)
      if (check === undefined || arms.length !== 2) return false
      for (const role of ['baseline', 'candidate'] as const) {
        const arm = arms.find(arm => arm.role === role)
        if (arm?.resultCheck === undefined) return false
        validateGuidanceArmResultCheck(opened, arm)
        const result = arm.resultCheck
        const rejectedCondition = result.status === 'rejected' && result.failedRequiredConditionDigest === sha256(check.requiredCondition)
        if (role === 'candidate' ? result.status !== 'verified' : result.status !== 'verified' && !rejectedCondition) return false
        if (role === 'baseline' && item.kind === 'counterexample' && result.status !== 'verified') return false
        if (role === 'baseline' && ['source1', 'source2'].includes(item.kind) && rejectedCondition) sourceImproved = true
      }
    }
    return sourceImproved
  } catch { return false }
}
