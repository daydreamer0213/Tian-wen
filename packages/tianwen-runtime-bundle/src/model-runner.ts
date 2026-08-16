import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

type ModelChoice = 'offline' | 'deepseek-v4-flash' | 'deepseek-v4-pro'
export type ModelOperation = 'status' | 'use' | 'smoke'

const MODEL_SELECTIONS = {
  offline: { provider: 'tianwen-offline', model: 'phase2-smoke' },
  'deepseek-v4-flash': {
    provider: 'deepseek-official', model: 'deepseek-v4-flash',
  },
  'deepseek-v4-pro': {
    provider: 'deepseek-official', model: 'deepseek-v4-pro',
  },
} as const

interface Selection {
  readonly model: string
  readonly provider: string
}

export interface ModelRunnerConfig {
  readonly json: boolean
  readonly model?: ModelChoice | undefined
  readonly operation: ModelOperation
}

export interface ModelConfigReceipt {
  readonly catalog: {
    readonly availableModels: string[]
    readonly provider: string
    readonly selectedModelAvailable: boolean
  }
  readonly credential: {
    readonly configured: boolean
    readonly reference: 'DEEPSEEK_API_KEY'
    readonly source?: string
    readonly writable: boolean
  }
  readonly modelRequestsDelta: 0
  readonly operation: ModelOperation
  readonly schemaVersion: 'tianwen.model-config.v1'
  readonly selection: Selection
}

const SMOKE_PROVIDER = 'deepseek-official'
const SMOKE_MODEL = 'deepseek-v4-pro'
const SMOKE_PROMPT = 'Reply with exactly TIANWEN_SMOKE_OK and nothing else.'
const SMOKE_MARKER = 'TIANWEN_SMOKE_OK'
const SMOKE_LIMITS = {
  maxOutputTokens: 64,
  maxTotalTokens: 512,
  maxCostCny: 0.01,
  timeoutMs: 90000,
} as const

interface SmokeTimer {
  readonly clearTimeout: (timeout: ReturnType<typeof setTimeout>) => void
  readonly setTimeout: (callback: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>
}

const DEFAULT_SMOKE_TIMER: SmokeTimer = { clearTimeout, setTimeout }

type ModelSmokeFailureCode =
  | 'credential-missing'
  | 'duplicate-finish'
  | 'duplicate-usage'
  | 'missing-finish'
  | 'missing-usage'
  | 'provider-error'
  | 'selection-mismatch'
  | 'timeout'
  | 'token-budget-exceeded'
  | 'unexpected-reasoning'
  | 'unexpected-response'
  | 'unexpected-tool-call'

interface ModelSmokeReceiptBase {
  readonly limits: typeof SMOKE_LIMITS
  readonly markerMatched: boolean
  readonly model: typeof SMOKE_MODEL
  readonly provider: typeof SMOKE_PROVIDER
  readonly requestCount: 0 | 1
  readonly schemaVersion: 'tianwen.model-smoke.v1'
  readonly timestamp: string
}

export type ModelSmokeReceipt =
  | (ModelSmokeReceiptBase & {
    readonly status: 'passed'
    readonly markerMatched: true
    readonly requestCount: 1
    readonly finishKind: 'stop'
    readonly usage: {
      readonly cacheReadTokens?: number
      readonly cacheWriteTokens?: number
      readonly estimatedCostCny: number
      readonly inputTokens: number
      readonly outputTokens: number
      readonly reasoningTokens?: number
      readonly totalTokens: number
    }
  })
  | (ModelSmokeReceiptBase & {
    readonly failureCode: ModelSmokeFailureCode
    readonly status: 'failed'
  })

function requireConfig(config: ModelRunnerConfig): void {
  if (
    (config.operation !== 'status' && config.operation !== 'use' && config.operation !== 'smoke') ||
    (config.operation === 'status' && config.model !== undefined) ||
    (config.operation === 'use' && config.model === undefined) ||
    (config.operation === 'smoke' && config.model !== 'deepseek-v4-pro')
  ) throw new Error('invalid Tianwen model invocation')
}

function services(ctx: Context) {
  const agentDefaultModel = ctx.get('agentDefaultModel') as unknown as {
    currentSelection(): Selection
    saveSelection(selection: Selection): Promise<void>
  } | undefined
  const credentials = ctx.get('credentials') as unknown as {
    describe(reference: ReturnType<typeof credentialRef>): Promise<{
      configured: boolean
      source?: string
      writable: boolean
    }>
  } | undefined
  const llm = ctx.get('llm') as unknown as {
    listModels(provider: string): Promise<readonly { readonly id: string }[]>
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  } | undefined
  if (agentDefaultModel === undefined || credentials === undefined || llm === undefined) {
    throw new Error('Tianwen Profile model services are unavailable')
  }
  return { agentDefaultModel, credentials, llm }
}

function smokeFailure(
  failureCode: ModelSmokeFailureCode,
  requestCount: 0 | 1,
  timestamp: string,
): ModelSmokeReceipt {
  return {
    schemaVersion: 'tianwen.model-smoke.v1',
    status: 'failed',
    failureCode,
    provider: SMOKE_PROVIDER,
    model: SMOKE_MODEL,
    requestCount,
    markerMatched: false,
    limits: SMOKE_LIMITS,
    timestamp,
  }
}

function validUsage(usage: TokenUsage): boolean {
  return [usage.inputTokens, usage.outputTokens].every(value =>
    Number.isSafeInteger(value) && value >= 0,
  ) && [
    usage.cacheReadTokens,
    usage.cacheWriteTokens,
    usage.reasoningTokens,
  ].every(value => value === undefined || (Number.isSafeInteger(value) && value >= 0))
}

export async function runModelSmoke(
  ctx: Context,
  signal?: AbortSignal,
  now: () => number = Date.now,
  timer: SmokeTimer = DEFAULT_SMOKE_TIMER,
): Promise<ModelSmokeReceipt> {
  const startedAt = now()
  const timestamp = new Date(startedAt).toISOString()
  const failure = (failureCode: ModelSmokeFailureCode, requestCount: 0 | 1) =>
    smokeFailure(failureCode, requestCount, timestamp)
  const { agentDefaultModel, credentials, llm } = services(ctx)
  const selection = agentDefaultModel.currentSelection()
  if (selection.provider !== SMOKE_PROVIDER || selection.model !== SMOKE_MODEL) {
    return failure('selection-mismatch', 0)
  }
  if (!(await credentials.describe(credentialRef('DEEPSEEK_API_KEY'))).configured) {
    return failure('credential-missing', 0)
  }

  const deadline = new AbortController()
  const abort = () => deadline.abort()
  const timeout = timer.setTimeout(abort, SMOKE_LIMITS.timeoutMs)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })

  const options: GenerateOptions = {
    provider: SMOKE_PROVIDER,
    model: SMOKE_MODEL,
    reasoningEffort: ReasoningEffortId('off'),
    maxTokens: SMOKE_LIMITS.maxOutputTokens,
    messages: [createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: SMOKE_PROMPT }],
    })],
    signal: deadline.signal,
  }
  Object.assign(options, { tools: undefined, system: undefined })

  let text = ''
  let usage: TokenUsage | undefined
  let finished = false
  try {
    const stream = llm.stream(options)
    if (deadline.signal.aborted) return failure('timeout', 1)
    for await (const chunk of stream) {
      if (deadline.signal.aborted) {
        return failure('timeout', 1)
      }
      if (finished) return failure('duplicate-finish', 1)
      if (chunk.type === 'text-delta') {
        text += chunk.text
      } else if (chunk.type === 'usage') {
        if (usage !== undefined) return failure('duplicate-usage', 1)
        if (!validUsage(chunk.usage)) return failure('provider-error', 1)
        usage = chunk.usage
      } else if (chunk.type === 'finish') {
        finished = true
        if (chunk.reason.kind === 'error') return failure('provider-error', 1)
        if (chunk.reason.kind === 'aborted') return failure('timeout', 1)
        if (chunk.reason.kind !== 'stop') return failure('unexpected-response', 1)
      } else if (chunk.type === 'reasoning-delta' ||
        (chunk.type === 'block-end' && chunk.block.type === 'reasoning')) {
        return failure('unexpected-reasoning', 1)
      } else if (chunk.type === 'tool-call-delta' ||
        (chunk.type === 'block-end' && chunk.block.type === 'tool-call')) {
        return failure('unexpected-tool-call', 1)
      } else if (chunk.type === 'block-start' && chunk.blockType !== 'text') {
        return failure('unexpected-response', 1)
      } else if (chunk.type === 'block-end' && chunk.block.type !== 'text') {
        return failure('unexpected-response', 1)
      }
    }
    if (deadline.signal.aborted) return failure('timeout', 1)
  } catch {
    return failure(deadline.signal.aborted ? 'timeout' : 'provider-error', 1)
  } finally {
    timer.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }

  if (!finished) return failure('missing-finish', 1)
  if (usage === undefined) return failure('missing-usage', 1)
  if (text !== SMOKE_MARKER) return failure('unexpected-response', 1)
  const totalTokens = usage.inputTokens + usage.outputTokens +
    (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  if (totalTokens > SMOKE_LIMITS.maxTotalTokens) {
    return failure('token-budget-exceeded', 1)
  }
  const estimatedCostCny = (
    usage.inputTokens * 3 +
    (usage.cacheReadTokens ?? 0) * 0.025 +
    (usage.cacheWriteTokens ?? 0) * 3 +
    usage.outputTokens * 6
  ) / 1_000_000
  return {
    schemaVersion: 'tianwen.model-smoke.v1',
    status: 'passed',
    provider: SMOKE_PROVIDER,
    model: SMOKE_MODEL,
    requestCount: 1,
    markerMatched: true,
    timestamp,
    finishKind: 'stop',
    limits: SMOKE_LIMITS,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
      ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
      ...usage.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens },
      totalTokens,
      estimatedCostCny,
    },
  }
}

async function deepseekCatalog(llm: ReturnType<typeof services>['llm']): Promise<string[]> {
  return (await llm.listModels('deepseek-official')).map(model => model.id)
}

async function catalogForSelection(
  selection: Selection,
  llm: ReturnType<typeof services>['llm'],
): Promise<ModelConfigReceipt['catalog']> {
  if (
    selection.provider === MODEL_SELECTIONS.offline.provider &&
    selection.model === MODEL_SELECTIONS.offline.model
  ) {
    return {
      provider: selection.provider,
      availableModels: [selection.model],
      selectedModelAvailable: true,
    }
  }
  if (
    selection.provider !== MODEL_SELECTIONS['deepseek-v4-flash'].provider ||
    (
      selection.model !== MODEL_SELECTIONS['deepseek-v4-flash'].model &&
      selection.model !== MODEL_SELECTIONS['deepseek-v4-pro'].model
    )
  ) throw new Error('unsupported saved model selection')
  const availableModels = await deepseekCatalog(llm)
  return {
    provider: MODEL_SELECTIONS['deepseek-v4-flash'].provider,
    availableModels,
    selectedModelAvailable: availableModels.includes(selection.model),
  }
}

export async function runModelCommand(
  ctx: Context,
  config: ModelRunnerConfig,
): Promise<ModelConfigReceipt> {
  requireConfig(config)
  const { agentDefaultModel, credentials, llm } = services(ctx)
  let selection = agentDefaultModel.currentSelection()
  let catalog: ModelConfigReceipt['catalog']

  if (config.operation === 'use') {
    const requested = MODEL_SELECTIONS[config.model!]
    if (config.model === 'offline') {
      catalog = {
        provider: requested.provider,
        availableModels: [requested.model],
        selectedModelAvailable: true,
      }
    } else {
      const availableModels = await deepseekCatalog(llm)
      if (!availableModels.includes(requested.model)) {
        throw new Error(`DeepSeek model ${requested.model} is unavailable`)
      }
      catalog = {
        provider: requested.provider,
        availableModels,
        selectedModelAvailable: true,
      }
    }
    await agentDefaultModel.saveSelection(requested)
    selection = agentDefaultModel.currentSelection()
  } else {
    catalog = await catalogForSelection(selection, llm)
  }

  const described = await credentials.describe(credentialRef('DEEPSEEK_API_KEY'))
  return {
    schemaVersion: 'tianwen.model-config.v1',
    operation: config.operation,
    selection: { ...selection },
    catalog,
    credential: {
      reference: 'DEEPSEEK_API_KEY',
      configured: described.configured,
      ...described.source === undefined ? {} : { source: described.source },
      writable: described.writable,
    },
    modelRequestsDelta: 0,
  }
}

function formatModelConfigText(receipt: ModelConfigReceipt): string {
  return [
    `Model: ${receipt.selection.provider}/${receipt.selection.model}`,
    `Credential ${receipt.credential.reference}: ${receipt.credential.configured ? 'configured' : 'not configured'}`,
    'No model request sent.',
    '',
  ].join('\n')
}

export const name = 'tianwen-model-runner'
export const inject = ['agentDefaultModel', 'credentials', 'llm'] as const
const SAFE_MODEL_ERROR = 'model configuration failed'

export function apply(ctx: Context, config: ModelRunnerConfig): void {
  const exit = ctx.get('appExit') as ((code: number) => void) | undefined
  if (exit === undefined) throw new Error('tianwen-model-runner: appExit is unavailable')
  void (async () => {
    await ctx.get('loader')?.await()
    return config.operation === 'smoke'
      ? runModelSmoke(ctx)
      : runModelCommand(ctx, config)
  })().then(receipt => {
    if (config.operation === 'smoke') {
      const smokeReceipt = receipt as ModelSmokeReceipt
      process.stdout.write(`${JSON.stringify(smokeReceipt)}\n`)
      exit(smokeReceipt.status === 'passed' ? 0 : 1)
      return
    }
    const configReceipt = receipt as ModelConfigReceipt
    process.stdout.write(config.json
      ? `${JSON.stringify(configReceipt)}\n`
      : formatModelConfigText(configReceipt))
    exit(0)
  }, error => {
    process.stderr.write(`tianwen model: ${SAFE_MODEL_ERROR}\n`)
    exit(1)
  })
}
