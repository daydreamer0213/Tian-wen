import { isAbsolute } from 'node:path'
import { DSH_VERSION } from '@tianwen/dsh-compat'
import type { Context } from '@tianwen/dsh-compat'
import { TianwenEvidenceService } from '@tianwen/evidence'
import { TianwenEvolutionService } from '@tianwen/evolution'

import { TianwenLearningIntakeService } from './learning-intake.js'

export {
  TianwenLearningIntakeService,
} from './learning-intake.js'
export type {
  FeedbackSnapshot,
  RuntimeLearningIntakeReceipt,
  RuntimeOutcomeIntakeReceipt,
  RuntimeRunBindingInput,
  RuntimeRunBindingReceipt,
} from './learning-intake.js'

export const SUPPORTED_DSH_VERSION = '0.1.0-rc.7' as const
export const name = 'tianwen-runtime'
export const inject = ['dynamicCordisRunner'] as const

export interface TianwenRuntimeConfig {
  readonly evolutionRoot: string
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeConfig,
): Promise<void> {
  if (DSH_VERSION !== SUPPORTED_DSH_VERSION) {
    throw new Error(`unsupported DSH version: ${DSH_VERSION}`)
  }
  if (
    typeof config.evolutionRoot !== 'string'
    || !isAbsolute(config.evolutionRoot)
  ) {
    throw new Error('evolutionRoot must be an absolute path')
  }
  await ctx.plugin(TianwenEvidenceService)
  await ctx.plugin(TianwenEvolutionService, { root: config.evolutionRoot })
  await ctx.plugin(TianwenLearningIntakeService)
}
