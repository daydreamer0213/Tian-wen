import type { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { SessionId } from '@tianwen/dsh-compat'
import { CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST, sha256 } from '@tianwen/evolution'
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
import {
  TianwenLearningLoopService,
  createExplicitCorrectionLearningLoopExecutor,
  type LearningLoopControlledExecutor,
} from './learning-loop-orchestrator.js'
import { TianwenMessageFeedbackBridgeService } from './message-feedback-bridge.js'

export { inject, name, SUPPORTED_DSH_VERSION }

export interface TianwenRuntimeBundleConfig extends TianwenLongGoalHostConfig {
  readonly evolutionRoot?: string
  /** Test/programmatic seam; desktop profiles use learningLoop instead. */
  readonly learningLoopExecutor?: LearningLoopControlledExecutor
  /** Serializable desktop activation for the sole audited explicit-correction protocol. */
  readonly learningLoop?: {
    readonly enabled: true
    /** Must be an absolute persistent state root. Defaults to stateRoot/learning-loop. */
    readonly workspaceRoot?: string
  }
}

function configuredLearningLoopExecutor(
  ctx: Context,
  config: TianwenRuntimeBundleConfig,
): LearningLoopControlledExecutor | undefined {
  if (config.learningLoopExecutor !== undefined) return config.learningLoopExecutor
  if (config.learningLoop?.enabled !== true) return undefined
  const configuredRoot = config.learningLoop.workspaceRoot ?? config.stateRoot
  if (configuredRoot === undefined || !isAbsolute(configuredRoot)) {
    throw new Error('learningLoop.enabled requires an absolute workspaceRoot or stateRoot')
  }
  const root = config.learningLoop.workspaceRoot ?? join(configuredRoot, 'learning-loop')
  return createExplicitCorrectionLearningLoopExecutor({
    root,
    materializeWorkspace(workspaceRoot, content) {
      if (!existsSync(workspaceRoot)) {
        mkdirSync(workspaceRoot, { recursive: true })
        writeFileSync(join(workspaceRoot, 'brief.txt'), content, 'utf8')
        return
      }
      const entries = readdirSync(workspaceRoot, { withFileTypes: true })
      if (entries.length !== 1 || !entries[0]?.isFile() || entries[0].name !== 'brief.txt'
        || readFileSync(join(workspaceRoot, 'brief.txt'), 'utf8') !== content) {
        throw new Error('controlled workspace drift')
      }
    },
    async environment() {
      const selection = (ctx.get('agentDefaultModel') as {
        currentSelection(): { readonly provider: string, readonly model: string }
      }).currentSelection()
      const callConfig = await ctx.llm.resolveCallConfig(selection)
      const retryPolicy = ctx.llm.providerRetryPolicy(selection.provider)
      const toolSchemas = ctx.tools.schemas()
        .filter(schema => schema.name === 'skill' || schema.name === 'verify_lifecycle')
        .toSorted((left, right) => left.name.localeCompare(right.name))
      if (toolSchemas.length !== 2 || toolSchemas[0]?.name !== 'skill'
        || toolSchemas[1]?.name !== 'verify_lifecycle') {
        throw new Error('controlled protocol required tool surface is unavailable')
      }
      return { callConfig, retryPolicy, toolSchemas, rubricDigest: CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST }
    },
    async deliverTerminalReport({ context, text }) {
      const child = ctx.agents.get(SessionId(String(context.status.childSessionId)))
      const parent = ctx.agents.get(SessionId(String(context.status.parentSessionId)))
      if (child === undefined || parent === undefined
        || String(child.session.header.parentSession) !== String(parent.session.id)
        || parent.session.header.parentSession !== undefined
        || parent.session.header.origin === 'subagent') {
        throw new Error('terminal report requires the exact live native child and main parent')
      }
      return String(await ctx.subagents.reportFrom(child, [{ type: 'text', text }], {
        delivery: 'next-step', signal: AbortSignal.timeout(30_000),
      }))
    },
    async findTerminalReport({ context, text }) {
      const childSessionId = String(context.status.childSessionId)
      const parent = ctx.agents.get(SessionId(String(context.status.parentSessionId)))
      if (parent === undefined || parent.session.header.parentSession !== undefined
        || parent.session.header.origin === 'subagent') return undefined
      const expected = [{ type: 'text' as const, text: `Background subagent ${childSessionId} reported:` }, {
        type: 'text' as const, text,
      }]
      const exact = (event: unknown): string | undefined => {
        if (event === null || typeof event !== 'object') return undefined
        const typed = event as { readonly type?: unknown, readonly data?: unknown }
        if (typed.type !== 'user/message' || typed.data === null || typeof typed.data !== 'object') return undefined
        const message = typed.data as {
          readonly id?: unknown
          readonly source?: { readonly kind?: unknown, readonly senderSessionId?: unknown }
          readonly content?: unknown
        }
        return message.source?.kind === 'subagent-report'
          && String(message.source.senderSessionId) === childSessionId
          && sha256(message.content) === sha256(expected)
          && typeof message.id === 'string' && message.id.length > 0
          ? message.id : undefined
      }
      const live = (parent.session as unknown as { readonly events?: readonly unknown[] }).events ?? []
      const persisted = await ctx.sessionPersistence.inspect(parent.session.id)
      return live.map(exact).find((id): id is string => id !== undefined)
        ?? persisted.events.map(exact).find((id): id is string => id !== undefined)
    },
  })
}

export async function apply(
  ctx: Context,
  config: TianwenRuntimeBundleConfig = {},
): Promise<void> {
  await applyCore(ctx, config.evolutionRoot === undefined ? {} : { evolutionRoot: config.evolutionRoot })
  ctx.plugin(TianwenLearningConsentAgentService)
  ctx.plugin(TianwenMessageFeedbackBridgeService)
  ctx.plugin(TianwenLearningAnalysisChildService, config)
  const executor = configuredLearningLoopExecutor(ctx, config)
  ctx.plugin(TianwenLearningLoopService, executor === undefined
    ? {}
    : { executor })
  mountTianwenLongGoalHost(ctx, config)
}
