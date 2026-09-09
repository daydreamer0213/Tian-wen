import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveDesktopTarget,
  startDesktopWebHost,
} from '../../packages/tianwen-desktop-host/src/host.js'

const requireFromTest = createRequire(import.meta.url)
const dshManifestPath = requireFromTest.resolve('@deepseek-ai/dsh/package.json')
const requireFromDsh = createRequire(dshManifestPath)
const bootModulePath = requireFromDsh.resolve('@deepseek-ai/dsh-app-boot')
const toolsTargetName = '@deepseek-ai/dsh-tools'
const pwshTargetName = '@deepseek-ai/dsh-pwsh-sandbox'
const includeModulePath = requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include')
const includeManifestPath = requireFromDsh.resolve('@deepseek-ai/cordis-plugin-include/package.json')
const requireFromInclude = createRequire(includeManifestPath)
const yamlModulePath = requireFromInclude.resolve('js-yaml')
const fixtureParent = resolve(
  process.env.TIANWEN_FILE_TEST_ROOT ?? join(tmpdir(), 'tianwen-file-tests'),
  'native-observation-launch',
)
const fixtures: string[] = []
const actualStartupEnabled = process.platform === 'win32'
  && process.env.TIANWEN_RUN_NATIVE_OBSERVATION_STARTUP === '1'

interface LaunchModule {
  prepareNativeObservationLaunch(
    target: {
      nodeExecutable: string
      dshRoot: string
      dshHome: string
      dshBin: string
      profileRoot: string
    },
    environment: NodeJS.ProcessEnv,
    dependencies?: {
      nonce?: () => string
      loadNativeModules?: () => Promise<never>
    },
  ): Promise<{
    patchPath?: string
    status: { kind: string }
    verify(): Promise<boolean>
    cleanup(): Promise<void>
  }>
}

async function loadLaunchModule(): Promise<LaunchModule | undefined> {
  const url = pathToFileURL(resolve(
    'packages/tianwen-desktop-host/src/native-observation-launch.ts',
  )).href
  return import(url).catch(() => undefined) as Promise<LaunchModule | undefined>
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
}

function writeJson(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value)}\n`)
}

function createBundle(profileRoot: string, name: string, patch: string): string {
  const root = join(profileRoot, 'node_modules', ...name.split('/'))
  writeJson(join(root, 'package.json'), {
    name,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  const patchPath = join(root, 'cordis.patch.yml')
  write(patchPath, patch)
  return patchPath
}

function createFixture(): {
  root: string
  target: {
    nodeExecutable: string
    dshRoot: string
    dshHome: string
    dshBin: string
    profileRoot: string
  }
  environment: NodeJS.ProcessEnv
  paths: {
    profileManifest: string
    baseManifest: string
    basePatch: string
    runtimeManifest: string
    runtimePatch: string
    profilePatch: string
    homePatch: string
    stateRoot: string
  }
} {
  mkdirSync(fixtureParent, { recursive: true })
  const root = mkdtempSync(join(fixtureParent, 'case-'))
  fixtures.push(root)
  const dshRoot = dirname(dshManifestPath)
  const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
    bin: { dsh: string }
  }
  const dshHome = join(root, 'home')
  const profileRoot = join(dshHome, 'profiles', 'web')
  const baseBundle = '@fixture/native-base'
  const runtimeBundle = '@tianwen/runtime-bundle'
  const basePatch = createBundle(profileRoot, baseBundle, `- insert:
    - id: tools
      name: '@deepseek-ai/dsh-tools'
      config:
        mode: native
        maxParallelSubCalls: 2
      disabled: false
      inject:
        registry:
          required: true
      isolate: native-tools-scope
      intercept:
        trace: native-tools
    - id: pwsh-sandbox
      name: '@deepseek-ai/dsh-pwsh-sandbox'
      config:
        cwd: E:/base-workspace
        timeoutMs: 12000
        maxTimeoutMs: 30000
        maxOutputBytes: 4096
        maxSpillBytes: 8192
        graceMs: 250
        pwshPath: D:/PowerShell/pwsh.exe
      disabled: !!js process.platform !== 'win32'
      inject:
        - subprocess
        - sandbox
      isolate: native-pwsh-scope
      intercept:
        trace: native-pwsh
    - id: unrelated-private-provider
      name: '@fixture/private-provider'
      config:
        apiKey: do-not-copy-this-secret
    - id: agent-preset-standard
      name: '@deepseek-ai/dsh-agent-presets'
      config:
        id: standard
        tools:
          - glob
          - grep
          - skill
          - pwsh
`)
  const runtimePatch = createBundle(profileRoot, runtimeBundle, `- insert:
    - id: tianwen-runtime
      name: '@tianwen/runtime-bundle/runtime'
`)
  const profileManifest = join(profileRoot, 'package.json')
  writeJson(profileManifest, {
    name: '@fixture/web-profile',
    dsh: { profile: { bundles: [baseBundle, runtimeBundle] } },
    dependencies: { [baseBundle]: '1.0.0', [runtimeBundle]: '0.1.23' },
  })
  const profilePatch = join(profileRoot, 'cordis.patch.yml')
  write(profilePatch, `- id: tools
  config:
    mode: both
    maxParallelSubCalls: !!js Number(process.env.TIANWEN_MAX_PARALLEL)
`)
  const homePatch = join(dshHome, 'cordis.patch.yml')
  write(homePatch, `- id: pwsh-sandbox
  config:
    cwd: E:/home-workspace
    timeoutMs: 15000
    maxTimeoutMs: 35000
    maxOutputBytes: 5000
    maxSpillBytes: 9000
    graceMs: 300
    pwshPath: D:/Configured/pwsh.exe
  disabled: false
`)
  const stateRoot = join(root, 'state', 'learning-loop')
  return {
    root,
    target: {
      nodeExecutable: process.execPath,
      dshRoot,
      dshHome,
      dshBin: join(dshRoot, dshManifest.bin.dsh),
      profileRoot,
    },
    environment: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      TIANWEN_LEARNING_LOOP_ROOT: stateRoot,
    },
    paths: {
      profileManifest,
      baseManifest: join(dirname(basePatch), 'package.json'),
      basePatch,
      runtimeManifest: join(dirname(runtimePatch), 'package.json'),
      runtimePatch,
      profilePatch,
      homePatch,
      stateRoot,
    },
  }
}

function copyRuntimePackage(targetRoot: string): void {
  const sourceRoot = resolve('packages/tianwen-runtime-bundle')
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8')) as {
    files: string[]
  }
  write(targetRoot + '/package.json', readFileSync(join(sourceRoot, 'package.json'), 'utf8'))
  for (const entry of manifest.files) {
    const source = join(sourceRoot, entry)
    if (!existsSync(source)) continue
    const target = join(targetRoot, entry)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }
}

async function waitForJson(path: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    await new Promise<void>(resolveWait => { setTimeout(resolveWait, 50) })
  }
  throw new Error('native observation startup receipt did not appear')
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Tianwen native observation launch preparation', () => {
  it('uses native bundle, profile, and home composition to render only two lossless observer rows', async () => {
    const launch = await loadLaunchModule()
    expect(launch, 'native observation launch helper is not implemented').toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()

    const prepared = await launch.prepareNativeObservationLaunch(
      fixture.target,
      fixture.environment,
    )

    expect(prepared.status).toEqual({ kind: 'observed' })
    expect(prepared.patchPath).toBeDefined()
    const [{ entryListSchema }, yaml] = await Promise.all([
      import(pathToFileURL(includeModulePath).href) as Promise<{ entryListSchema: unknown }>,
      import(pathToFileURL(yamlModulePath).href) as Promise<{
        load(source: string, options: { schema: unknown }): unknown
      }>,
    ])
    const patch = yaml.load(readFileSync(prepared.patchPath!, 'utf8'), {
      schema: entryListSchema,
    })
    expect(patch).toEqual([
      { id: 'tools', name: '@deepseek-ai/dsh-tools', disabled: true },
      { id: 'pwsh-sandbox', name: '@deepseek-ai/dsh-pwsh-sandbox', disabled: true },
      {
        insert: [
          {
            id: 'tianwen-native-tools-observer',
            name: '@tianwen/runtime-bundle/native-tools-observer',
            config: {
              mode: 'both',
              maxParallelSubCalls: {
                __jsExpr: 'Number(process.env.TIANWEN_MAX_PARALLEL)',
              },
            },
            disabled: false,
            inject: { registry: { required: true } },
            isolate: 'native-tools-scope',
            intercept: { trace: 'native-tools' },
          },
          {
            id: 'tianwen-native-pwsh-observer',
            name: '@tianwen/runtime-bundle/native-pwsh-observer',
            config: {
              cwd: 'E:/home-workspace',
              timeoutMs: 15000,
              maxTimeoutMs: 35000,
              maxOutputBytes: 5000,
              maxSpillBytes: 9000,
              graceMs: 300,
              pwshPath: 'D:/Configured/pwsh.exe',
            },
            disabled: false,
            inject: ['subprocess', 'sandbox'],
            isolate: 'native-pwsh-scope',
            intercept: { trace: 'native-pwsh' },
          },
        ],
      },
    ])
    const rendered = readFileSync(prepared.patchPath!, 'utf8')
    expect(rendered).not.toContain('unrelated-private-provider')
    expect(rendered).not.toContain('do-not-copy-this-secret')
    const boot = await import(pathToFileURL(bootModulePath).href) as {
      loadOverlayPatches(binName: string, path: string): Array<Record<string, unknown>>
      composeEntries(layers: Array<Array<Record<string, unknown>>>): Array<Record<string, unknown>>
    }
    const finalEntries = boot.composeEntries([
      boot.loadOverlayPatches('tianwen-test', fixture.paths.basePatch),
      boot.loadOverlayPatches('tianwen-test', fixture.paths.runtimePatch),
      boot.loadOverlayPatches('tianwen-test', fixture.paths.profilePatch),
      boot.loadOverlayPatches('tianwen-test', fixture.paths.homePatch),
      patch as Array<Record<string, unknown>>,
    ])
    expect(finalEntries.filter(entry => entry.name === toolsTargetName)).toEqual([
      expect.objectContaining({ id: 'tools', disabled: true }),
    ])
    expect(finalEntries.filter(entry => entry.name === pwshTargetName)).toEqual([
      expect.objectContaining({ id: 'pwsh-sandbox', disabled: true }),
    ])
    expect(finalEntries.filter(entry => entry.name === '@tianwen/runtime-bundle/native-tools-observer'))
      .toHaveLength(1)
    expect(finalEntries.filter(entry => entry.name === '@tianwen/runtime-bundle/native-pwsh-observer'))
      .toHaveLength(1)
    expect(finalEntries.find(entry => entry.id === 'agent-preset-standard')).toEqual({
      id: 'agent-preset-standard',
      name: '@deepseek-ai/dsh-agent-presets',
      config: { id: 'standard', tools: ['glob', 'grep', 'skill', 'pwsh'] },
    })
    await prepared.cleanup()
  })

  it.each([
    ['missing target', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.basePatch, readFileSync(fixture.paths.basePatch, 'utf8')
        .replace(/    - id: tools[\s\S]*?(?=    - id: pwsh-sandbox)/u, ''))
    }],
    ['duplicate target', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, `${readFileSync(fixture.paths.homePatch, 'utf8')}- insert:\n    - id: tools\n      name: '@deepseek-ai/dsh-tools'\n`)
    }],
    ['custom target name', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.basePatch, readFileSync(fixture.paths.basePatch, 'utf8')
        .replace(toolsTargetName, '@fixture/custom-tools'))
    }],
    ['unknown config key', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.profilePatch, `${readFileSync(fixture.paths.profilePatch, 'utf8')}    apiKey: do-not-copy-this-secret\n`)
    }],
    ['invalid tools scalar', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.profilePatch, readFileSync(fixture.paths.profilePatch, 'utf8')
        .replace('mode: both', 'mode: sequential'))
    }],
    ['invalid pwsh scalar', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, readFileSync(fixture.paths.homePatch, 'utf8')
        .replace('timeoutMs: 15000', 'timeoutMs: -1'))
    }],
    ['unserviceable pwsh timer scalar', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, readFileSync(fixture.paths.homePatch, 'utf8')
        .replace('graceMs: 300', 'graceMs: 2147483648'))
    }],
    ['unknown outer key', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, `${readFileSync(fixture.paths.homePatch, 'utf8')}  privateMetadata: do-not-copy-this-secret\n`)
    }],
    ['group target', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.profilePatch, `${readFileSync(fixture.paths.profilePatch, 'utf8')}  group: true\n`)
    }],
    ['unrepresentable config metadata', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, readFileSync(fixture.paths.homePatch, 'utf8')
        .replace('    cwd: E:/home-workspace', '    cwd:\n      private: do-not-copy-this-secret'))
    }],
    ['invalid patch input', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.profilePatch, '- id: [not valid')
    }],
    ['oversize aggregate input', (fixture: ReturnType<typeof createFixture>) => {
      write(fixture.paths.homePatch, `${readFileSync(fixture.paths.homePatch, 'utf8')}#${'x'.repeat(1024 * 1024)}\n`)
    }],
  ] as const)('uses bounded stock fallback for %s without exposing selected or unrelated data', async (_label, mutate) => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    mutate(fixture)

    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment)

    expect(prepared.status).toEqual({ kind: 'stock', reason: 'observation-unavailable' })
    expect(prepared.patchPath).toBeUndefined()
    expect(JSON.stringify(prepared.status)).not.toContain('do-not-copy-this-secret')
    expect(await prepared.verify()).toBe(true)
    await prepared.cleanup()
  })

  it.each([
    ['Profile manifest', (fixture: ReturnType<typeof createFixture>) => fixture.paths.profileManifest],
    ['bundle manifest', (fixture: ReturnType<typeof createFixture>) => fixture.paths.baseManifest],
    ['bundle patch', (fixture: ReturnType<typeof createFixture>) => fixture.paths.basePatch],
    ['Profile patch', (fixture: ReturnType<typeof createFixture>) => fixture.paths.profilePatch],
    ['home patch', (fixture: ReturnType<typeof createFixture>) => fixture.paths.homePatch],
    ['generated overlay', (fixture: ReturnType<typeof createFixture>, patchPath?: string) => patchPath!],
  ] as const)('rejects %s drift before an observed launch', async (_label, selectPath) => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment)
    expect(prepared.status).toEqual({ kind: 'observed' })
    const path = selectPath(fixture, prepared.patchPath)
    write(path, `${readFileSync(path, 'utf8')}\n`)

    expect(await prepared.verify()).toBe(false)
    await prepared.cleanup()
  })

  it('binds absent optional Profile and home patches against appearing before launch', async () => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    rmSync(fixture.paths.profilePatch)
    rmSync(fixture.paths.homePatch)
    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment)
    expect(prepared.status).toEqual({ kind: 'observed' })

    write(fixture.paths.homePatch, '- id: tools\n  disabled: true\n')

    expect(await prepared.verify()).toBe(false)
    await prepared.cleanup()
  })

  it('keeps one launch snapshot fixed and recomposes changed raw rows on the next launch', async () => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    const first = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment)
    expect(first.status).toEqual({ kind: 'observed' })
    write(fixture.paths.homePatch, readFileSync(fixture.paths.homePatch, 'utf8')
      .replace('E:/home-workspace', 'E:/next-launch-workspace'))
    expect(await first.verify()).toBe(false)

    const second = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment)
    expect(second.status).toEqual({ kind: 'observed' })
    expect(readFileSync(second.patchPath!, 'utf8')).toContain('E:/next-launch-workspace')
    expect(readFileSync(first.patchPath!, 'utf8')).toContain('E:/home-workspace')
    await Promise.all([first.cleanup(), second.cleanup()])
  })

  it('keeps the private overlay in one owned launch folder and cleans only that folder idempotently', async () => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment, {
      nonce: () => 'fixed-launch',
    })
    const launchRoot = join(fixture.paths.stateRoot, 'native-observation-launch')
    const sibling = join(launchRoot, 'keep.txt')
    write(sibling, 'keep')
    expect(relative(launchRoot, prepared.patchPath!)).toBe(join('launch-fixed-launch', 'observation.patch.yml'))
    if (process.platform !== 'win32') {
      expect(statSync(prepared.patchPath!).mode & 0o777).toBe(0o600)
    }

    await Promise.all([prepared.cleanup(), prepared.cleanup()])

    expect(existsSync(dirname(prepared.patchPath!))).toBe(false)
    expect(readFileSync(sibling, 'utf8')).toBe('keep')
  })

  it('does not claim or delete a pre-existing launch folder on a nonce collision', async () => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()
    const existing = join(
      fixture.paths.stateRoot,
      'native-observation-launch',
      'launch-fixed-launch',
    )
    const marker = join(existing, 'owned-by-someone-else.txt')
    write(marker, 'keep')

    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment, {
      nonce: () => 'fixed-launch',
    })

    expect(prepared.status).toEqual({ kind: 'stock', reason: 'observation-unavailable' })
    expect(readFileSync(marker, 'utf8')).toBe('keep')
  })

  it('does not expose native loading failures or create a partial overlay', async () => {
    const launch = await loadLaunchModule()
    expect(launch).toBeDefined()
    if (launch === undefined) return
    const fixture = createFixture()

    const prepared = await launch.prepareNativeObservationLaunch(fixture.target, fixture.environment, {
      loadNativeModules: async () => { throw new Error('do-not-copy-this-secret') },
    })

    expect(prepared.status).toEqual({ kind: 'stock', reason: 'observation-unavailable' })
    expect(JSON.stringify(prepared.status)).not.toContain('do-not-copy-this-secret')
    expect(prepared.patchPath).toBeUndefined()
  })

  it.skipIf(!actualStartupEnabled)(
    'starts the actual Desktop Web product with both native observers and one directory receipt',
    async () => {
      mkdirSync(fixtureParent, { recursive: true })
      const root = mkdtempSync(join(fixtureParent, 'actual-startup-'))
      fixtures.push(root)
      const dshRoot = dirname(dshManifestPath)
      const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
        bin: { dsh: string }
      }
      const dshHome = join(root, 'home')
      const profileRoot = join(dshHome, 'profiles', 'web')
      const runtimeRoot = join(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
      const probeRoot = join(profileRoot, 'node_modules', '@fixture', 'observation-probe')
      const receiptPath = join(root, 'observation-startup-receipt.json')
      copyRuntimePackage(runtimeRoot)
      writeJson(join(probeRoot, 'package.json'), {
        name: '@fixture/observation-probe',
        version: '1.0.0',
        type: 'module',
        main: './probe.mjs',
        dependencies: { '@tianwen/runtime-bundle': '0.1.23' },
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      })
      write(join(probeRoot, 'cordis.patch.yml'), `- insert:
    - id: tianwen-native-observation-startup-probe
      name: '@fixture/observation-probe'
      config:
        receiptPath: !!js process.env.TIANWEN_OBSERVATION_PROBE_RECEIPT
`)
      write(join(probeRoot, 'probe.mjs'), `import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { NativeObservedToolRuntime } from '@tianwen/runtime-bundle/native-tools-observer'
import { NativeObservedPwshExecutor } from '@tianwen/runtime-bundle/native-pwsh-observer'

export const name = 'tianwen-native-observation-startup-probe'
export const inject = ['loader', 'tools', 'shell', 'sandboxPolicy', 'agentPresets', 'tianwenNativeToolObservation']

async function collect(ctx, config) {
  const names = ['glob', 'grep', 'skill', 'pwsh']
  const scope = await ctx.agentPresets.standingKeyFor('standard')
  const definitions = Object.fromEntries(names.map(name => [name, ctx.tools.get(name, scope)]))
  const captured = await ctx.tianwenNativeToolObservation.capture(
    { taskId: 'desktop-startup', sessionId: 'desktop-startup-session', callId: 'desktop-startup-directory' },
    () => ctx.shell.run(ctx.shell.resolve({ command: 'Get-Location' })),
  )
  const receipt = {
    schemaVersion: 'tianwen.native-observation-startup.v1',
    providers: {
      toolsObserver: ctx.registry.has(NativeObservedToolRuntime),
      stockTools: ctx.registry.has(Object.getPrototypeOf(NativeObservedToolRuntime)),
      pwshObserver: ctx.registry.has(NativeObservedPwshExecutor),
      stockPwsh: ctx.registry.has(Object.getPrototypeOf(NativeObservedPwshExecutor)),
    },
    config: {
      toolMode: ctx.tools.defaultMode,
      maxParallelSubCalls: ctx.tools.maxParallelSubCalls,
      pwsh: ctx.shell.config,
    },
    declarations: ctx.tools.schemas(scope).filter(schema => names.includes(schema.name)).map(schema => schema.name).sort(),
    registrations: Object.fromEntries(names.map(name => [name, ctx.tools.nativeRegistration(definitions[name])])),
    directory: {
      resultExitCode: captured.result.exitCode,
      receipt: captured.receipt,
      diagnostic: captured.result.exitCode === 0 ? undefined : {
        exitCode: captured.result.exitCode,
        signal: captured.result.signal,
        timedOut: captured.result.timedOut,
        aborted: captured.result.aborted,
        stdoutTruncated: captured.result.stdout.truncated,
        stderrTruncated: captured.result.stderr.truncated,
        stderrText: captured.result.stderr.text,
        sandbox: captured.result.sandbox,
      },
    },
  }
  mkdirSync(dirname(config.receiptPath), { recursive: true })
  const staged = config.receiptPath + '.' + process.pid + '.' + randomUUID() + '.tmp'
  writeFileSync(staged, JSON.stringify(receipt) + '\\n', 'utf8')
  renameSync(staged, config.receiptPath)
}

export function apply(ctx, config) {
  setTimeout(() => {
    void collect(ctx, config).catch(error => {
      mkdirSync(dirname(config.receiptPath), { recursive: true })
      writeFileSync(config.receiptPath, JSON.stringify({
        schemaVersion: 'tianwen.native-observation-startup.v1',
        probeError: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'unknown probe error',
        },
      }) + '\\n', 'utf8')
    })
  }, 0)
}
`)
      writeJson(join(profileRoot, 'package.json'), {
        name: '@fixture/desktop-web-profile',
        dependencies: {
          '@tianwen/runtime-bundle': '0.1.23',
          '@fixture/observation-probe': '1.0.0',
        },
        dsh: {
          profile: {
            bundles: [
              '@deepseek-ai/dsh-base',
              '@deepseek-ai/dsh-web-app',
              '@tianwen/runtime-bundle',
              '@fixture/observation-probe',
            ],
          },
        },
      })
      write(join(profileRoot, 'cordis.patch.yml'), `- id: tools
  config:
    mode: native
    maxParallelSubCalls: 3
  disabled: false

- id: pwsh-sandbox
  config:
    cwd: ${resolve('.').replaceAll('\\', '/')}
    timeoutMs: 15000
    maxTimeoutMs: 20000
    maxOutputBytes: 8192
    maxSpillBytes: 16384
    graceMs: 500
  disabled: false
`)
      const target = resolveDesktopTarget({
        nodeExecutable: process.execPath,
        dshRoot,
        dshHome,
      })
      const changedEnvironment = new Map<string, string | undefined>()
      for (const key of Object.keys(process.env)) {
        if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN)$/iu.test(key)
          || /^(?:DEEPSEEK|OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE_AI|AZURE_OPENAI|AWS_BEDROCK|GROQ|MISTRAL|COHERE|TOGETHER|XAI|MOONSHOT|DASHSCOPE|ARK)_/iu.test(key)) {
          changedEnvironment.set(key, process.env[key])
          delete process.env[key]
        }
      }
      changedEnvironment.set('TIANWEN_OBSERVATION_PROBE_RECEIPT', process.env.TIANWEN_OBSERVATION_PROBE_RECEIPT)
      process.env.TIANWEN_OBSERVATION_PROBE_RECEIPT = receiptPath
      changedEnvironment.set('DSH_PERMISSION_MODE', process.env.DSH_PERMISSION_MODE)
      process.env.DSH_PERMISSION_MODE = 'danger-full-access'
      let host: Awaited<ReturnType<typeof startDesktopWebHost>> | undefined
      try {
        host = await startDesktopWebHost(target)
        expect(host.observation).toEqual({ kind: 'observed' })
        const receipt = await waitForJson(receiptPath)
        if ('probeError' in receipt) {
          throw new Error(`native startup probe failed: ${JSON.stringify(receipt.probeError)}`)
        }
        const directory = receipt.directory as { resultExitCode?: unknown, diagnostic?: unknown } | undefined
        if (directory?.resultExitCode !== 0) {
          throw new Error(`native directory probe failed: ${JSON.stringify(directory?.diagnostic)}`)
        }
        expect(receipt).toMatchObject({
          schemaVersion: 'tianwen.native-observation-startup.v1',
          providers: {
            toolsObserver: true,
            stockTools: false,
            pwshObserver: true,
            stockPwsh: false,
          },
          config: {
            toolMode: 'native',
            maxParallelSubCalls: 3,
            pwsh: {
              cwd: resolve('.').replaceAll('\\', '/'),
              timeoutMs: 15000,
              maxTimeoutMs: 20000,
              maxOutputBytes: 8192,
              maxSpillBytes: 16384,
              graceMs: 500,
            },
          },
          declarations: ['glob', 'grep', 'pwsh', 'skill'],
          registrations: {
            glob: { package: '@deepseek-ai/dsh-tool-fs-search', version: '0.1.1-rc.2' },
            grep: { package: '@deepseek-ai/dsh-tool-fs-search', version: '0.1.1-rc.2' },
            skill: { package: '@deepseek-ai/dsh-tool-skill', version: '0.1.1-rc.2' },
            pwsh: { package: '@deepseek-ai/dsh-tool-pwsh', version: '0.1.1-rc.2' },
          },
          directory: {
            resultExitCode: 0,
            receipt: {
              schemaVersion: 'tianwen.native-pwsh-directory.v1',
              identity: {
                taskId: 'desktop-startup',
                sessionId: 'desktop-startup-session',
                callId: 'desktop-startup-directory',
              },
            },
          },
        })
        const launchRoot = join(dshHome, '..', 'state', 'learning-loop', 'native-observation-launch')
        expect(readdirSync(launchRoot)).toHaveLength(1)
        await host.stop()
        host = undefined
        expect(readdirSync(launchRoot)).toEqual([])
      } finally {
        await host?.stop()
        for (const [key, value] of changedEnvironment) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    },
    120_000,
  )
})
