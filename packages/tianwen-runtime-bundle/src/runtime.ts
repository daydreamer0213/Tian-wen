import type { Context } from '@deepseek-ai/cordis'
import {
  apply as applyCore,
  inject,
  name,
  SUPPORTED_DSH_VERSION,
} from '@tianwen/runtime'

import { mountTianwenLongGoalHost } from './long-goal-host.js'
import type { TianwenLongGoalHostConfig } from './long-goal-host.js'
import { TianwenLearningConsentAgentService } from './learning-consent-agent.js'
import { TianwenLearningAnalysisChildService } from './learning-analysis-child.js'
import { TianwenMessageFeedbackBridgeService } from './message-feedback-bridge.js'

export { inject, name, SUPPORTED_DSH_VERSION }

export interface TianwenRuntimeBundleConfig extends TianwenLongGoalHostConfig {
  readonly evolutionRoot?: string
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeBundleConfig = {},
): Promise<void> {
  await applyCore(ctx, config.evolutionRoot === undefined ? {} : { evolutionRoot: config.evolutionRoot })
  ctx.plugin(TianwenLearningConsentAgentService)
  ctx.plugin(TianwenMessageFeedbackBridgeService)
  ctx.plugin(TianwenLearningAnalysisChildService, config)
  mountTianwenLongGoalHost(ctx, config)
}
