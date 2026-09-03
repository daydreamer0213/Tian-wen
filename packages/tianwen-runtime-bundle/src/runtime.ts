import type { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { SessionId } from '@tianwen/dsh-compat'
import { CONTROLLED_SKILL_EVAL_RUBRIC_DIGEST, sha256 } from '@tianwen/evolution'
import {
  RESEARCH_SUMMARY_TOOL_NAME,
  apply as applyCore,
  createResearchSummaryTool,
  evaluateResearchSummarySubmission,
  inject,
  name,
  parseResearchPacket,
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
import { TianwenResearchSummaryAdmissionService } from './research-summary-admission.js'

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

function exactTerminalReportMessageId(
  event: unknown,
  childSessionId: string,
  text: string,
  expectedMessageId?: string,
): string | undefined {
  if (event === null || typeof event !== 'object') return undefined
  const typed = event as { readonly type?: unknown, readonly data?: unknown }
  if (typed.type !== 'user/message' || typed.data === null || typeof typed.data !== 'object') {
    return undefined
  }
  const message = typed.data as {
    readonly id?: unknown
    readonly source?: { readonly kind?: unknown, readonly senderSessionId?: unknown }
    readonly content?: unknown
  }
  const expected = [{ type: 'text' as const, text: `Background subagent ${childSessionId} reported:` }, {
    type: 'text' as const, text,
  }]
  return message.source?.kind === 'subagent-report'
    && String(message.source.senderSessionId) === childSessionId
    && sha256(message.content) === sha256(expected)
    && typeof message.id === 'string' && message.id.length > 0
    && (expectedMessageId === undefined || message.id === expectedMessageId)
    ? message.id : undefined
}

async function confirmTerminalReportPersisted(
  ctx: Context,
  input: { readonly context: LearningLoopExecutionContext, readonly text: string },
  parent: NonNullable<ReturnType<Context['agents']['get']>>,
  messageId: string,
): Promise<string> {
  const status = pendingTerminalReport(ctx, input.context.status, input.text)
  if (ctx.agents.get(SessionId(status.parentSessionId)) !== parent
    || !exactLearningAnalysisMainParent(ctx, parent, status)
    || !await hasExactLearningAnalysisChild(ctx, status)
    || !parent.session.events.some(event => exactTerminalReportMessageId(
      event, status.childSessionId, input.text, messageId,
    ) !== undefined)) {
    throw new Error('terminal report accepted message lacks the exact live binding')
  }
  try {
    if (!await ctx.sessions.flush(parent.session)) {
      throw new Error('parent session flush was not durable')
    }
  } catch (error) {
    throw new Error('terminal report parent persistence failed', { cause: error })
  }
  const persisted = await ctx.sessionPersistence.readFrom(parent.session.id, 0)
  const persistedMessageId = persisted.events.map(event => exactTerminalReportMessageId(
    event, status.childSessionId, input.text, messageId,
  )).find((id): id is string => id !== undefined)
  const rechecked = pendingTerminalReport(ctx, input.context.status, input.text)
  if (persistedMessageId === undefined
    || ctx.agents.get(SessionId(rechecked.parentSessionId)) !== parent
    || !exactLearningAnalysisMainParent(ctx, parent, rechecked)
    || !await hasExactLearningAnalysisChild(ctx, rechecked)) {
    throw new Error('terminal report was not durably confirmed for the exact binding')
  }
  return persistedMessageId
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
  const liveMessageId = parent.session.events.map(event => exactTerminalReportMessageId(
    event, status.childSessionId, input.text,
  )).find((id): id is string => id !== undefined)
  if (liveMessageId !== undefined) {
    return confirmTerminalReportPersisted(ctx, input, parent, liveMessageId)
  }
  const live = ctx.agents.get(SessionId(status.childSessionId))
  if (live !== undefined) {
    if (!exactLearningAnalysisLiveChild(status, live)) {
      throw new Error('terminal report requires the exact bound native child')
    }
    const messageId = String(await ctx.subagents.reportFrom(live, [{ type: 'text', text: input.text }], {
      delivery: 'next-step', signal: AbortSignal.timeout(30_000),
    }))
    return confirmTerminalReportPersisted(ctx, input, parent, messageId)
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
      const messageId = String(await ctx.subagents.reportFrom(
        racedLive,
        [{ type: 'text', text: input.text }],
        { delivery: 'next-step', signal: AbortSignal.timeout(30_000) },
      ))
      return confirmTerminalReportPersisted(ctx, input, parent, messageId)
    }
    if (!await hasExactLearningAnalysisChild(ctx, status)) {
      throw new Error('terminal report requires the exact durable native child')
    }
    if (observed) {
      const messageId = await delivery.promise
      return await confirmTerminalReportPersisted(ctx, input, parent, messageId)
    }
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
    const messageId = await delivery.promise
    return await confirmTerminalReportPersisted(ctx, input, parent, messageId)
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
      const rootSchemas = ctx.tools.schemas()
      if (rootSchemas.some(schema => schema.name === RESEARCH_SUMMARY_TOOL_NAME)) {
        throw new Error('controlled product submission tool must remain Agent-scoped')
      }
      const productTool = createResearchSummaryTool(parseResearchPacket(`<research_packet>
[F:schema|required] Freeze the product submission schema.
</research_packet>`), {
        kind: 'controlled-enforce',
        oracle: evaluateResearchSummarySubmission,
      })
      const toolSchemas = [
        ...rootSchemas.filter(schema => schema.name === 'skill'),
        {
          name: productTool.name,
          description: productTool.description,
          parameters: structuredClone(productTool.parameters),
        },
      ]
        .toSorted((left, right) => left.name.localeCompare(right.name))
      if (toolSchemas.length !== 2 || toolSchemas[0]?.name !== 'skill'
        || toolSchemas[1]?.name !== RESEARCH_SUMMARY_TOOL_NAME) {
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
      const persisted = await ctx.sessionPersistence.readFrom(parent.session.id, 0)
      const messageId = persisted.events.map(event => exactTerminalReportMessageId(
        event, childSessionId, text,
      )).find((id): id is string => id !== undefined)
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
  ctx.plugin(TianwenResearchSummaryAdmissionService)
  ctx.plugin(TianwenLearningConsentAgentService)
  ctx.plugin(TianwenMessageFeedbackBridgeService)
  ctx.plugin(TianwenLearningAnalysisChildService, config)
  const executor = createConfiguredLearningLoopExecutor(ctx, config)
  ctx.plugin(TianwenLearningLoopService, executor === undefined
    ? {}
    : { executor })
  mountTianwenLongGoalHost(ctx, config)
}
