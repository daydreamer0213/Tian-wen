import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

type ModelChoice = 'offline' | 'deepseek-v4-flash' | 'deepseek-v4-pro'
type ModelOperation = 'status' | 'use'

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

function requireConfig(config: ModelRunnerConfig): void {
  if (
    (config.operation !== 'status' && config.operation !== 'use') ||
    (config.operation === 'status' && config.model !== undefined) ||
    (config.operation === 'use' && config.model === undefined)
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
  } | undefined
  if (agentDefaultModel === undefined || credentials === undefined || llm === undefined) {
    throw new Error('Tianwen Profile model services are unavailable')
  }
  return { agentDefaultModel, credentials, llm }
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
    return runModelCommand(ctx, config)
  })().then(receipt => {
    process.stdout.write(config.json
      ? `${JSON.stringify(receipt)}\n`
      : formatModelConfigText(receipt))
    exit(0)
  }, error => {
    process.stderr.write(`tianwen model: ${SAFE_MODEL_ERROR}\n`)
    exit(1)
  })
}
