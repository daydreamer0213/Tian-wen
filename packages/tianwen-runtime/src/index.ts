import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_VERSION } from '@tianwen/dsh-compat'
import type { Context } from '@tianwen/dsh-compat'
import { TianwenEvidenceService } from '@tianwen/evidence'
import { TianwenEvolutionService } from '@tianwen/evolution'

import { TianwenLearningIntakeService } from './learning-intake.js'
import { TianwenSkillEvaluationService } from './skill-evaluation.js'

export {
  RESEARCH_PACKET_MAX_BYTES,
  RESEARCH_PACKET_MAX_ITEMS,
  RESEARCH_SUMMARY_BASE_SKILL,
  RESEARCH_SUMMARY_PROTOCOL_VERSION,
  RESEARCH_SUMMARY_SCOPE,
  RESEARCH_SUMMARY_SKILL_NAME,
  RESEARCH_SUMMARY_TOOL_NAME,
  createResearchSummaryTool,
  evaluateResearchSummarySubmission,
  normalizeResearchSummarySubmission,
  parseResearchPacket,
} from './research-summary.js'
export type {
  ResearchPacket,
  ResearchPacketItem,
  ResearchSummaryOracle,
  ResearchSummarySubmission,
  ResearchSummaryToolMode,
  ResearchSummaryToolResult,
  ResearchSummaryVerdict,
} from './research-summary.js'

export {
  ControlledSkillActivationPreflightError,
} from './controlled-skill-activation.js'
export type {
  ControlledSkillActivationPreflightCode,
  ControlledSkillActivationRuntimeReceipt,
  ControlledSkillActivationRuntimeStop,
  ControlledSkillActivationRuntimeStopReasonCode,
  RunControlledSkillTransitionInput,
  RunControlledSkillTransitionTaskInput,
} from './controlled-skill-activation.js'

export {
  compareNormalizedSkillEvaluationRequests,
  ControlledSkillEvaluatorPreflightError,
  ControlledSkillEvaluationPreflightError,
  ControlledSkillShadowPreflightError,
  TIANWEN_CONTROLLED_AGENT_PRESET,
  controlledToolSchemas,
  normalizeSkillEvaluationRequest,
  observeSkillEvaluationRequest,
} from './skill-evaluation.js'
export type {
  NormalizedSkillEvaluationRequestComparison,
  ControlledEvaluatorMaterialContract,
  ControlledSkillEvaluatorPreflightCode,
  ControlledSkillEvaluatorsReceipt,
  ControlledSkillEvaluatorsStop,
  ControlledSkillEvaluatorsStopReasonCode,
  ControlledSkillEvaluationArmsReceipt,
  ControlledSkillEvaluationArmsStop,
  ControlledSkillEvaluationArmsStopReasonCode,
  ControlledSkillEvaluationPreflightCode,
  ControlledSkillShadowPreflightCode,
  ControlledSkillShadowRuntimeReceipt,
  ControlledSkillShadowStop,
  ControlledSkillShadowStopReasonCode,
  ControlledWorkspaceSnapshot,
  ControlledWorkspaceSnapshotEntry,
  ObserveSkillEvaluationRequestInput,
  NormalizeSkillEvaluationRequestInput,
  SkillEvaluationRequestObservation,
  SkillEvaluationRequestNormalization,
  RunControlledSkillEvaluationArmsInput,
  RunControlledSkillEvaluationTaskInput,
  RunControlledSkillShadowInput,
  RunControlledSkillShadowTaskInput,
  RunControlledSkillEvaluatorTaskInput,
  RunControlledSkillEvaluatorsInput,
} from './skill-evaluation.js'
export { TianwenSkillEvaluationService } from './skill-evaluation.js'
export type {
  PairedSkillEvaluationCaseInput,
  PairedSkillEvaluationReceipt,
  RunPairedSkillEvaluationInput,
} from './skill-evaluation.js'

export {
  TianwenLearningIntakeService,
} from './learning-intake.js'
export type {
  FeedbackSnapshot,
  RuntimeLearningIntakeReceipt,
  RuntimeOutcomeIntakeReceipt,
  RuntimeGovernedRunBindingReceipt,
  RuntimeSkillUseReceipt,
  RuntimeRunBindingInput,
  RuntimeRunBindingReceipt,
} from './learning-intake.js'

export const SUPPORTED_DSH_VERSION = '0.1.1-rc.2' as const
export const name = 'tianwen-runtime'
export const inject = [] as const

export interface TianwenRuntimeConfig {
  readonly evolutionRoot?: string
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeConfig = {},
): Promise<void> {
  if (DSH_VERSION !== SUPPORTED_DSH_VERSION) {
    throw new Error(`unsupported DSH version: ${DSH_VERSION}`)
  }
  const evolutionRoot = config.evolutionRoot === undefined
    ? ctx.baseUrl === undefined
      ? undefined
      : resolve(fileURLToPath(ctx.baseUrl), 'state', 'evolution')
    : config.evolutionRoot
  if (typeof evolutionRoot !== 'string' || !isAbsolute(evolutionRoot)) {
    throw new Error('evolutionRoot must be an absolute path')
  }
  await ctx.plugin(TianwenEvidenceService)
  await ctx.plugin(TianwenEvolutionService, { root: evolutionRoot })
  await ctx.plugin(TianwenLearningIntakeService)
  await ctx.plugin(TianwenSkillEvaluationService)
}
