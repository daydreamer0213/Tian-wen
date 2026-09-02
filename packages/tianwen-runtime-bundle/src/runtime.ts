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
import {
  TianwenLearningAnalysisChildService,
  exactLearningAnalysisLiveChild,
  exactLearningAnalysisMainParent,
  hasExactLearningAnalysisChild,
} from './learning-analysis-child.js'
import {
  TianwenLearningLoopService,
  createExplicitCorrectionLearningLoopExecutor,
  type LearningLoopExecutionContext,
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

function pendingTerminalReport(
  ctx: Context,
  expected: LearningLoopExecutionContext['status'],
  text: string,
) {
  const status = ctx.tianwenEvolution.getLearningAnalysis(expected.analysisId as never)
  const byChild = expected.childSessionId === undefined
    ? undefined
    : ctx.tianwenEvolution.getLearningAnalysisByChildSessionId(
        String(expected.childSessionId),
      )
  const reportDigest = sha256({ kind: 'terminal-governed-outcome', text })
  if (status === undefined
    || status.phase !== expected.phase
    || status.parentSessionId !== expected.parentSessionId
    || status.childSessionId !== expected.childSessionId
    || byChild?.analysisId !== status.analysisId
    || status.terminalReportDelivery?.state !== 'pending'
    || status.terminalReportDelivery.reportDigest !== reportDigest) {
    throw new Error('terminal report durable binding changed before delivery')
  }
  return status
}

async function deliverConfiguredTerminalReport(
  ctx: Context,
  input: { readonly context: LearningLoopExecutionContext, readonly text: string },
): Promise<string> {
  const status = pendingTerminalReport(ctx, input.context.status, input.text)
  const parent = ctx.agents.get(SessionId(status.parentSessionId))
  if (parent === undefined || !exactLearningAnalysisMainParent(ctx, parent, status)) {
    throw new Error('terminal report requires the exact live native main parent')
  }
  const live = ctx.agents.get(SessionId(status.childSessionId))
  if (live !== undefined) {
    if (!exactLearningAnalysisLiveChild(status, live)) {
      throw new Error('terminal report requires the exact bound native child')
    }
    return String(await ctx.subagents.reportFrom(live, [{ type: 'text', text: input.text }], {
      delivery: 'next-step', signal: AbortSignal.timeout(30_000),
    }))
  }
  const recovery = new AbortController()
  const delivery = Promise.withResolvers<string>()
  let observed = false
  const offStart = ctx.on('subagent/start', info => {
    if (String(info.id) !== status.childSessionId) return
    observed = true
    try {
      const current = pendingTerminalReport(ctx, input.context.status, input.text)
      const currentParent = ctx.agents.get(SessionId(current.parentSessionId))
      const child = ctx.agents.get(SessionId(current.childSessionId))
      if (currentParent !== parent
        || !exactLearningAnalysisMainParent(ctx, parent, current)
        || child === undefined
        || !exactLearningAnalysisLiveChild(current, child)) {
        throw new Error('terminal report recovery binding changed during child materialization')
      }
      void ctx.subagents.reportFrom(child, [{ type: 'text', text: input.text }], {
        delivery: 'next-step', signal: AbortSignal.timeout(30_000),
      }).then(messageId => delivery.resolve(String(messageId)), delivery.reject)
    } catch (error) {
      delivery.reject(error)
    } finally {
      recovery.abort(new Error('terminal report recovery prompt is not executable work'))
    }
  })
  try {
    const racedLive = ctx.agents.get(SessionId(status.childSessionId))
    if (racedLive !== undefined) {
      if (!exactLearningAnalysisLiveChild(status, racedLive)) {
        throw new Error('terminal report requires the exact bound native child')
      }
      return String(await ctx.subagents.reportFrom(
        racedLive,
        [{ type: 'text', text: input.text }],
        { delivery: 'next-step', signal: AbortSignal.timeout(30_000) },
      ))
    }
    if (!await hasExactLearningAnalysisChild(ctx, status)) {
      throw new Error('terminal report requires the exact durable native child')
    }
    if (observed) return await delivery.promise
    try {
      await ctx.subagents.followup(
        parent,
        SessionId(status.childSessionId),
        [{ type: 'text', text: 'Recover only to deliver the already-persisted Tianwen governed outcome.' }],
        {
          source: {
            kind: 'coordinator', form: 'relay', senderSessionId: parent.session.id,
          },
          signal: AbortSignal.any([recovery.signal, AbortSignal.timeout(30_000)]),
        },
      )
      if (!observed) delivery.reject(new Error('terminal report child recovery was not observed'))
    } catch (error) {
      if (!observed) delivery.reject(error)
    }
    return await delivery.promise
  } finally {
    offStart()
    recovery.abort(new Error('terminal report recovery finished'))
  }
}

export function createConfiguredLearningLoopExecutor(
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
      return deliverConfiguredTerminalReport(ctx, { context, text })
    },
    async findTerminalReport({ context, text }) {
      const status = pendingTerminalReport(ctx, context.status, text)
      const childSessionId = status.childSessionId
      const parent = ctx.agents.get(SessionId(status.parentSessionId))
      if (parent === undefined || !exactLearningAnalysisMainParent(ctx, parent, status)) {
        throw new Error('terminal report lookup requires the exact live native main parent')
      }
      if (!await hasExactLearningAnalysisChild(ctx, status)) {
        throw new Error('terminal report lookup requires the exact bound native child')
      }
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
      const messageId = live.map(exact).find((id): id is string => id !== undefined)
        ?? persisted.events.map(exact).find((id): id is string => id !== undefined)
      const rechecked = pendingTerminalReport(ctx, context.status, text)
      if (ctx.agents.get(SessionId(rechecked.parentSessionId)) !== parent
        || !exactLearningAnalysisMainParent(ctx, parent, rechecked)
        || !await hasExactLearningAnalysisChild(ctx, rechecked)) {
        throw new Error('terminal report lookup binding changed during recovery')
      }
      return messageId
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
  const executor = createConfiguredLearningLoopExecutor(ctx, config)
  ctx.plugin(TianwenLearningLoopService, executor === undefined
    ? {}
    : { executor })
  mountTianwenLongGoalHost(ctx, config)
}
