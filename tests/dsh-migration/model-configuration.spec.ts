import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../packages/tianwen-runtime-bundle/src/status.js', () => ({
  GoalStatusAmbiguousError: class GoalStatusAmbiguousError extends Error {},
  GoalStatusIntegrityError: class GoalStatusIntegrityError extends Error {},
  GoalStatusNotFoundError: class GoalStatusNotFoundError extends Error {},
  listGoals: vi.fn(),
  readGoalStatus: vi.fn(),
  scanDurableGoals: vi.fn(),
}))
vi.mock('@deepseek-ai/dsh-credentials', () => ({
  credentialRef: (reference: string) => ({ reference }),
}))

import {
  buildModelInvocation,
  preflightModelCommand,
} from '../../packages/tianwen-runtime-bundle/src/model.js'
import {
  apply,
  runModelCommand,
} from '../../packages/tianwen-runtime-bundle/src/model-runner.js'
import { main } from '../../packages/tianwen-runtime-bundle/src/cli.js'

const FIXTURE_BASE = resolve('D:/DevData/tianwen-model-configuration-tests')

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.DEEPSEEK_API_KEY
})

function installedDsh(dataDir: string): void {
  const root = join(dataDir, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: '@deepseek-ai/dsh', version: '0.1.0-rc.6', bin: { dsh: 'lib/bin.js' },
  })}\n`)
  writeFileSync(join(root, 'lib', 'bin.js'), 'process.exitCode = 0\n')
}

function context(options: {
  readonly catalog?: readonly { readonly id: string }[]
  readonly credential?: { readonly configured: boolean, readonly source?: string, readonly writable: boolean }
  readonly selection?: { readonly provider: string, readonly model: string }
}) {
  let selection = options.selection ?? { provider: 'tianwen-offline', model: 'phase2-smoke' }
  const agentDefaultModel = {
    currentSelection: vi.fn(() => ({ ...selection })),
    saveSelection: vi.fn(async (next: { readonly provider: string, readonly model: string }) => {
      selection = { ...next }
    }),
  }
  const llm = {
    listModels: vi.fn(async () => options.catalog ?? [
      { id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' },
    ]),
  }
  const credentials = {
    describe: vi.fn(async () => options.credential ?? {
      configured: true, source: 'env', writable: false,
    }),
  }
  return {
    agentDefaultModel,
    credentials,
    get: (service: string) => ({ agentDefaultModel, credentials, llm })[service],
    llm,
  }
}

describe('tianwen model', () => {
  it('keeps credential fixture values runtime-generated', () => {
    for (const path of [
      resolve(import.meta.dirname, 'model-configuration.spec.ts'),
      resolve(import.meta.dirname, 'tianwen-startup.e2e.spec.ts'),
    ]) {
      expect(readFileSync(path, 'utf8'))
        .not.toMatch(/const (?:SENTINEL_KEY|modelSentinel)\s*=\s*['"]/u)
    }
  })

  it.each([
    ['missing subcommand', ['model', '--data-dir', 'D:/DevData/tianwen']],
    ['unsupported model', ['model', 'use', '--model', 'other', '--data-dir', 'D:/DevData/tianwen']],
    ['model on status', ['model', 'status', '--model', 'offline', '--data-dir', 'D:/DevData/tianwen']],
    ['missing model on use', ['model', 'use', '--data-dir', 'D:/DevData/tianwen']],
    ['missing model on smoke', ['model', 'smoke', '--data-dir', 'D:/DevData/tianwen']],
    ['Flash model on smoke', ['model', 'smoke', '--model', 'deepseek-v4-flash', '--data-dir', 'D:/DevData/tianwen']],
    ['offline model on smoke', ['model', 'smoke', '--model', 'offline', '--data-dir', 'D:/DevData/tianwen']],
    ['arbitrary prompt on smoke', ['model', 'smoke', '--model', 'deepseek-v4-pro', '--objective', 'forbidden', '--data-dir', 'D:/DevData/tianwen']],
    ['Goal flag on smoke', ['model', 'smoke', '--model', 'deepseek-v4-pro', '--goal', 'goal-1', '--data-dir', 'D:/DevData/tianwen']],
    ['round flag on smoke', ['model', 'smoke', '--model', 'deepseek-v4-pro', '--max-rounds', '1', '--data-dir', 'D:/DevData/tianwen']],
    ['smoke outside D DevData', ['model', 'smoke', '--model', 'deepseek-v4-pro', '--data-dir', 'D:/outside-devdata']],
    ['relative data dir', ['model', 'status', '--data-dir', 'relative']],
    ['Goal flag', ['model', 'status', '--goal', 'goal-1', '--data-dir', 'D:/DevData/tianwen']],
    ['create flag', ['model', 'status', '--objective', 'forbidden', '--data-dir', 'D:/DevData/tianwen']],
  ])('rejects %s before launch or state changes', async (_label, args) => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'usage-'))
    const actual = args.map(value => value === 'D:/DevData/tianwen' ? dataDir : value)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await expect(main(actual)).resolves.toBe(2)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('tianwen model'))
      expect(readdirSync(dataDir)).toEqual([])
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('launches status and use through the fixed installed Profile command', async () => {
    mkdirSync(FIXTURE_BASE, { recursive: true })
    const dataDir = mkdtempSync(join(FIXTURE_BASE, 'cli-'))
    try {
      installedDsh(dataDir)
      await expect(main(['model', 'status', '--data-dir', dataDir, '--json']))
        .resolves.toBe(0)
      await expect(main([
        'model', 'use', '--model', 'deepseek-v4-pro', '--data-dir', dataDir, '--json',
      ])).resolves.toBe(0)
      await expect(main([
        'model', 'smoke', '--model', 'deepseek-v4-pro', '--data-dir', dataDir, '--json',
      ])).resolves.toBe(0)
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('builds one fixed shell-free model Profile invocation without adding secrets', () => {
    const sentinelKey = randomUUID()
    process.env.DEEPSEEK_API_KEY = sentinelKey
    const before = new Set(Object.keys(process.env))
    const invocation = buildModelInvocation(preflightModelCommand(
      'use', 'deepseek-v4-pro', 'D:\\DevData\\tianwen',
    ), true)

    expect(invocation.program).toBe(process.execPath)
    expect(invocation.args).toEqual([
      expect.stringMatching(/@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/u),
      '--profile', 'tianwen', '--patch', expect.stringMatching(/model\.patch\.yml$/u),
    ])
    expect(invocation.options).toMatchObject({ shell: false, stdio: 'inherit' })
    expect(invocation.options.env).toMatchObject({
      DSH_HOME: 'D:\\DevData\\tianwen\\dsh-home',
      TIANWEN_MODEL_JSON: 'true',
      TIANWEN_MODEL_OPERATION: 'use',
      TIANWEN_MODEL_MODEL: 'deepseek-v4-pro',
    })
    expect(invocation.options.env?.DEEPSEEK_API_KEY).toBe(sentinelKey)
    expect(Object.keys(invocation.options.env!).filter(key => !before.has(key))).toEqual([
      'DSH_HOME', 'TIANWEN_MODEL_JSON', 'TIANWEN_MODEL_MODEL', 'TIANWEN_MODEL_OPERATION',
    ])
  })

  it('accepts smoke only for DeepSeek V4 Pro below D:\\DevData', () => {
    expect(preflightModelCommand(
      'smoke', 'deepseek-v4-pro', 'D:\\DevData\\tianwen',
    )).toMatchObject({
      operation: 'smoke', model: 'deepseek-v4-pro', dataDir: 'D:\\DevData\\tianwen',
    })
    expect(() => preflightModelCommand(
      'smoke', 'deepseek-v4-pro', 'D:\\not-devdata',
    )).toThrow('dataDir must be under D:\\DevData')
  })

  it('reports the fixed offline status without catalog discovery', async () => {
    const services = context({
      selection: { provider: 'tianwen-offline', model: 'phase2-smoke' },
    })

    const receipt = await runModelCommand(services as never, {
      operation: 'status', model: undefined, json: true,
    })

    expect(services.llm.listModels).not.toHaveBeenCalled()
    expect(receipt.catalog).toEqual({
      provider: 'tianwen-offline',
      availableModels: ['phase2-smoke'],
      selectedModelAvailable: true,
    })
  })

  it('reports status without saving and copies only safe credential facts', async () => {
    const sentinelKey = randomUUID()
    process.env.DEEPSEEK_API_KEY = sentinelKey
    const services = context({
      selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      credential: { configured: true, source: 'env', writable: false },
    })
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const receipt = await runModelCommand(services as never, {
      operation: 'status', model: undefined, json: true,
    })

    expect(receipt).toEqual({
      schemaVersion: 'tianwen.model-config.v1',
      operation: 'status',
      selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      catalog: {
        provider: 'deepseek-official',
        availableModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        selectedModelAvailable: true,
      },
      credential: { reference: 'DEEPSEEK_API_KEY', configured: true, source: 'env', writable: false },
      modelRequestsDelta: 0,
    })
    expect(services.agentDefaultModel.saveSelection).not.toHaveBeenCalled()
    expect(services.llm.listModels).toHaveBeenCalledWith('deepseek-official')
    expect(JSON.stringify(receipt)).not.toContain(sentinelKey)
    expect(stderr).not.toHaveBeenCalled()
  })

  it.each([
    ['offline', { provider: 'tianwen-offline', model: 'phase2-smoke' }],
    ['deepseek-v4-flash', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }],
    ['deepseek-v4-pro', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }],
  ] as const)('uses the exact %s mapping', async (model, expected) => {
    const services = context({})
    const receipt = await runModelCommand(services as never, {
      operation: 'use', model, json: true,
    })

    expect(services.agentDefaultModel.saveSelection).toHaveBeenCalledWith(expected)
    expect(receipt.selection).toEqual(expected)
    expect(receipt.modelRequestsDelta).toBe(0)
    expect(receipt.credential).toEqual({
      reference: 'DEEPSEEK_API_KEY', configured: true, source: 'env', writable: false,
    })
    if (model === 'offline') {
      expect(services.llm.listModels).not.toHaveBeenCalled()
      expect(receipt.catalog).toEqual({
        provider: 'tianwen-offline', availableModels: ['phase2-smoke'], selectedModelAvailable: true,
      })
    } else {
      expect(services.llm.listModels).toHaveBeenCalledWith('deepseek-official')
    }
  })

  it('rejects an unavailable DeepSeek model before saving a selection', async () => {
    const services = context({ catalog: [{ id: 'deepseek-v4-flash' }] })

    await expect(runModelCommand(services as never, {
      operation: 'use', model: 'deepseek-v4-pro', json: true,
    })).rejects.toThrow('is unavailable')

    expect(services.agentDefaultModel.saveSelection).not.toHaveBeenCalled()
  })

  it('rejects an unsupported saved selection before catalog discovery', async () => {
    const services = context({
      selection: { provider: 'other-provider', model: 'other-model' },
    })

    await expect(runModelCommand(services as never, {
      operation: 'status', model: undefined, json: true,
    })).rejects.toThrow('unsupported saved model selection')

    expect(services.llm.listModels).not.toHaveBeenCalled()
    expect(services.credentials.describe).not.toHaveBeenCalled()
  })

  it('prints one safe receipt and exits through appExit', async () => {
    const sentinelKey = randomUUID()
    const services = context({})
    const exit = vi.fn()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const runnerContext = {
      get: (service: string) => service === 'appExit' ? exit : services.get(service),
    }

    apply(runnerContext as never, { operation: 'use', model: 'offline', json: true })
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))

    expect(stdout).toHaveBeenCalledTimes(1)
    expect(String(stdout.mock.calls[0]?.[0])).not.toContain(sentinelKey)
  })

  it('waits for the loader before touching model services or exiting', async () => {
    const services = context({})
    const exit = vi.fn()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    let releaseLoader: () => void
    const loader = {
      await: vi.fn(() => new Promise<void>(resolve => {
        releaseLoader = resolve
      })),
    }
    const runnerContext = {
      get: (service: string) => service === 'appExit'
        ? exit
        : service === 'loader'
          ? loader
          : services.get(service),
    }

    apply(runnerContext as never, { operation: 'use', model: 'offline', json: true })
    await Promise.resolve()

    expect(loader.await).toHaveBeenCalledTimes(1)
    expect(services.agentDefaultModel.currentSelection).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()

    releaseLoader!()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(services.agentDefaultModel.currentSelection).toHaveBeenCalledTimes(2)
  })

  it.each(['catalog', 'credential'] as const)(
    'does not print untrusted %s errors at the process boundary',
    async service => {
      const sentinelKey = randomUUID()
      const services = context({
        selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      })
      const rejection = new Error(sentinelKey)
      if (service === 'catalog') {
        services.llm.listModels.mockRejectedValue(rejection)
      } else {
        services.credentials.describe.mockRejectedValue(rejection)
      }
      const exit = vi.fn()
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const runnerContext = {
        get: (serviceName: string) => serviceName === 'appExit'
          ? exit : services.get(serviceName),
      }

      apply(runnerContext as never, { operation: 'status', model: undefined, json: true })
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))

      expect(stdout).not.toHaveBeenCalled()
      expect(String(stderr.mock.calls)).not.toContain(sentinelKey)
      expect(stderr).toHaveBeenCalledWith('tianwen model: model configuration failed\n')
    },
  )
})
