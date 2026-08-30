import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import fsPromises from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canonicalJson,
  deriveInstallPaths,
  renderProfilePatch,
} from '../../scripts/install-tianwen.mjs'

type Listener = (...args: any[]) => void

interface ControlledWatcher {
  close: ReturnType<typeof vi.fn>
  emit(event: string, ...args: any[]): void
  on(event: string, listener: Listener): ControlledWatcher
  once(event: string, listener: Listener): ControlledWatcher
}

const controlledWatchers = vi.hoisted(() => [] as ControlledWatcher[])

const watcherGate = vi.hoisted(() => {
  let notify: (() => void) | undefined
  return {
    next() {
      return new Promise<void>(resolve => { notify = resolve })
    },
    notify() {
      notify?.()
      notify = undefined
    },
    reset() {
      notify = undefined
    },
  }
})

const realStat = fsPromises.stat
let activeStatGate: { entered: () => void, released: Promise<void> } | undefined

const statGate = {
  arm() {
    let entered: (() => void) | undefined
    let release: (() => void) | undefined
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    const released = new Promise<void>(resolve => { release = resolve })
    activeStatGate = { entered: () => entered?.(), released }
    fsPromises.stat = async (...args: Parameters<typeof realStat>) => {
      const gate = activeStatGate
      if (gate) {
        activeStatGate = undefined
        gate.entered()
        await gate.released
        statGate.reset()
      }
      return realStat(...args)
    }
    syncBuiltinESMExports()
    return {
      entered: enteredPromise,
      release: () => release?.(),
    }
  },
  reset() {
    activeStatGate = undefined
    fsPromises.stat = realStat
    syncBuiltinESMExports()
  },
}

const chokidarMock = vi.hoisted(() => ({
  watch: vi.fn(() => {
    const listeners = new Map<string, Listener[]>()
    const onceListeners = new Map<string, Listener[]>()
    const watcher: ControlledWatcher = {
      on(event, listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
        return watcher
      },
      once(event, listener) {
        onceListeners.set(event, [...(onceListeners.get(event) ?? []), listener])
        return watcher
      },
      emit(event, ...args) {
        for (const listener of listeners.get(event) ?? []) listener(...args)
        const pending = onceListeners.get(event) ?? []
        onceListeners.delete(event)
        for (const listener of pending) listener(...args)
      },
      close: vi.fn(async () => {}),
    }
    controlledWatchers.push(watcher)
    watcherGate.notify()
    return watcher
  }),
}))

vi.mock('chokidar', () => chokidarMock)

const fixtureParent = resolve(
  process.env.TIANWEN_DSH_PROBE_ROOT
    ?? (process.platform === 'win32' ? 'D:/DevData/tianwen-test-fixtures' : tmpdir()),
  'one-shot-profile',
)
const repoRoot = resolve(import.meta.dirname, '..', '..')
const require = createRequire(import.meta.url)
const dshManifestPath = realpathSync(require.resolve('@deepseek-ai/dsh/package.json'))
const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
  bin: { dsh: string }
  version: string
}
const dshBin = realpathSync(resolve(dirname(dshManifestPath), dshManifest.bin.dsh))
const modelPatch = resolve(repoRoot, 'packages/tianwen-runtime-bundle/model.patch.yml')

interface ModelReceipt {
  readonly credential: { readonly configured: boolean, readonly reference: string }
  readonly modelRequestsDelta: number
  readonly operation: string
  readonly schemaVersion: string
  readonly selection: { readonly model: string, readonly provider: string }
}

function runModelProfile(
  paths: ReturnType<typeof deriveInstallPaths>,
  operation: 'status' | 'use',
  model?: 'deepseek-v4-pro' | 'offline',
): ModelReceipt {
  const result = spawnSync(
    process.execPath,
    [dshBin, '--profile', 'tianwen', '--patch', modelPatch],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DEEPSEEK_API_KEY: randomUUID(),
        DEEPSEEK_BASE_URL: 'http://127.0.0.1:1',
        DSH_HOME: paths.dshHome,
        DSH_TELEMETRY_DISABLED: '1',
        TIANWEN_MODEL_JSON: 'true',
        TIANWEN_MODEL_OPERATION: operation,
        TIANWEN_MODEL_MODEL: model ?? '',
      },
      shell: false,
      timeout: 240_000,
      windowsHide: true,
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout ?? ''}\n${result.stderr ?? ''}`).toBe(0)
  expect(result.signal).toBeNull()
  expect(result.stderr).toBe('')
  const stdout = result.stdout.trim()
  expect(stdout).not.toBe('')
  return JSON.parse(stdout) as ModelReceipt
}

function expectReceipt(
  receipt: ModelReceipt,
  operation: 'status' | 'use',
  selection: { readonly model: string, readonly provider: string },
): void {
  expect(receipt).toMatchObject({
    schemaVersion: 'tianwen.model-config.v1',
    operation,
    selection,
    credential: { reference: 'DEEPSEEK_API_KEY', configured: true },
    modelRequestsDelta: 0,
  })
}

async function bootHmr(ctx: Context): Promise<void> {
  const { default: Hmr } = await import('@deepseek-ai/cordis-plugin-hmr')
  await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 })
}

afterEach(() => {
  statGate.reset()
  watcherGate.reset()
  controlledWatchers.splice(0)
  vi.clearAllMocks()
})

describe('one-shot Profile lifecycle', () => {
  it('settles a config registration when HMR is disposed before watcher readiness', async () => {
    mkdirSync(fixtureParent, { recursive: true })
    const fixtureRoot = mkdtempSync(join(fixtureParent, 'owner-'))
    const configPath = join(fixtureRoot, 'model.patch.yml')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(fixtureRoot).href + '/'
    try {
      await ctx.plugin(Loader)
      await ctx.plugin(Timer)
      await bootHmr(ctx)

      let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'
      const registration = ctx.hmr.registerConfig(configPath, () => {})
      void registration.then(
        () => { outcome = 'resolved' },
        () => { outcome = 'rejected' },
      )
      await vi.waitFor(() => expect(controlledWatchers).toHaveLength(2))
      await ctx.fiber.dispose()
      await Promise.resolve()

      expect(outcome).toBe('rejected')
      expect(controlledWatchers[1]!.close).toHaveBeenCalledTimes(1)
      expect(() => controlledWatchers[1]!.emit('ready')).not.toThrow()
      expect(() => controlledWatchers[1]!.emit('error', new Error('late'))).not.toThrow()
    } finally {
      await ctx.fiber.dispose()
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('does not create a config watcher after disposal pauses watch-root discovery', async () => {
    mkdirSync(fixtureParent, { recursive: true })
    const fixtureRoot = mkdtempSync(join(fixtureParent, 'root-dispose-'))
    const configPath = join(fixtureRoot, 'model.patch.yml')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(fixtureRoot).href + '/'
    try {
      await ctx.plugin(Loader)
      await ctx.plugin(Timer)
      const gate = statGate.arm()
      await bootHmr(ctx)

      const anotherWatcher = watcherGate.next()
      const registration = ctx.hmr.registerConfig(configPath, () => {})
      await gate.entered
      await ctx.fiber.dispose()
      gate.release()

      const resumed = await Promise.race([
        registration.then(
          () => 'registration resolved' as const,
          () => 'registration rejected' as const,
        ),
        anotherWatcher.then(() => 'another watcher' as const),
      ])
      expect(resumed).toBe('registration rejected')
      expect(controlledWatchers).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform !== 'win32')(
    'completes DeepSeek activation and offline recovery through four fresh Profile processes',
    () => {
      expect(dshManifest.version).toBe('0.1.1-rc.2')
      mkdirSync(fixtureParent, { recursive: true })
      const root = mkdtempSync(join(fixtureParent, 'profile-'))
      const paths = deriveInstallPaths(root)
      try {
        mkdirSync(join(paths.profileRoot, 'node_modules', '@tianwen'), { recursive: true })
        writeFileSync(join(paths.profileRoot, 'package.json'), canonicalJson({
          name: '@tianwen/profile-host',
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies: {
            '@deepseek-ai/dsh-base': '0.1.1-rc.2',
            '@deepseek-ai/dsh-headless': '0.1.1-rc.2',
            '@tianwen/runtime-bundle': '0.1.2',
          },
          dsh: {
            profile: {
              bundles: [
                '@deepseek-ai/dsh-base',
                '@deepseek-ai/dsh-headless',
                '@tianwen/runtime-bundle',
              ],
            },
          },
        }), 'utf8')
        writeFileSync(join(paths.profileRoot, 'cordis.patch.yml'), renderProfilePatch(paths), 'utf8')
        symlinkSync(
          realpathSync(resolve(repoRoot, 'packages/tianwen-runtime-bundle')),
          join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle'),
          'junction',
        )

        expectReceipt(runModelProfile(paths, 'use', 'deepseek-v4-pro'), 'use', {
          provider: 'deepseek-official', model: 'deepseek-v4-pro',
        })
        expectReceipt(runModelProfile(paths, 'status'), 'status', {
          provider: 'deepseek-official', model: 'deepseek-v4-pro',
        })
        expectReceipt(runModelProfile(paths, 'use', 'offline'), 'use', {
          provider: 'tianwen-offline', model: 'phase2-smoke',
        })
        expectReceipt(runModelProfile(paths, 'status'), 'status', {
          provider: 'tianwen-offline', model: 'phase2-smoke',
        })
        expect(existsSync(paths.sessionsRoot)).toBe(false)
        expect(existsSync(join(paths.evolutionRoot, 'ledger.jsonl'))).toBe(false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    600_000,
  )
})
