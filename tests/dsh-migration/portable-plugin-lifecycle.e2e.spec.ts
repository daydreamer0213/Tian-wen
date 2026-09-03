import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, relative, resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const devDataRoot = 'D:\\DevData'
const runtimePackage = '@tianwen/runtime-bundle'
const runtimeVersion = '0.1.11'
const dshPackage = '@deepseek-ai/dsh'
const dshVersion = '0.1.1-rc.2'
const pnpmEntry = 'D:\\DevData\\corepack-home\\v1\\pnpm\\11.20.0\\bin\\pnpm.mjs'
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_RUN_PORTABLE_PLUGIN_LIFECYCLE_E2E === '1'
const require = createRequire(import.meta.url)
const dshManifestPath = realpathSync(require.resolve(`${dshPackage}/package.json`))
const dshRoot = dirname(dshManifestPath)
const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as {
  bin: { dsh: string }
  name: string
  version: string
}
const dshBin = realpathSync(resolve(dshRoot, dshManifest.bin.dsh))
const requireFromDsh = createRequire(dshManifestPath)
const appBootEntry = requireFromDsh.resolve('@deepseek-ai/dsh-app-boot')

interface DshResult {
  readonly error: Error | undefined
  readonly signal: NodeJS.Signals | null
  readonly status: number | null
  readonly stderr: string
  readonly stdout: string
}

interface ScenarioSnapshot {
  readonly other: string
  readonly selected: string
  readonly state: string
}

let lifecycleRoot = ''
let runRoot = ''
let packRoot = ''
let runtimeTarball = ''
let pnpmCommandRoot = ''
let storeRoot = ''
let dshSpawnCount = 0

function requireLifecycleRoot(): string {
  const configured = process.env.TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT
  if (configured === undefined || configured === '') {
    throw new Error('TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT is required')
  }
  if (!win32.isAbsolute(configured)) {
    throw new Error('TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT must be absolute')
  }
  const normalized = win32.resolve(configured)
  const child = win32.relative(devDataRoot, normalized)
  if (child === '' || child.startsWith('..') || win32.isAbsolute(child)) {
    throw new Error(
      `TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT must be a strict child of ${devDataRoot}`,
    )
  }
  if (!existsSync(normalized) || !statSync(normalized).isDirectory()) {
    throw new Error('TIANWEN_PORTABLE_PLUGIN_LIFECYCLE_ROOT must already exist')
  }
  return normalized
}

function snapshotTree(root: string): string {
  if (!existsSync(root)) return 'missing'
  const rows: string[] = []
  const visit = (path: string): void => {
    const name = relative(root, path) || '.'
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      rows.push(JSON.stringify([
        name,
        'link',
        Buffer.from(readlinkSync(path), 'utf8').toString('base64'),
      ]))
      return
    }
    if (stat.isFile()) {
      const bytes = readFileSync(path)
      rows.push(JSON.stringify([
        name,
        'file',
        bytes.length,
        createHash('sha256').update(bytes).digest('hex'),
      ]))
      return
    }
    if (!stat.isDirectory()) {
      rows.push(JSON.stringify([name, 'other']))
      return
    }
    rows.push(JSON.stringify([name, 'directory']))
    for (const entry of readdirSync(path).sort()) visit(join(path, entry))
  }
  visit(root)
  return rows.join('\n')
}

function snapshotScenario(
  selectedRoot: string,
  otherRoot: string,
  stateRoot: string,
): ScenarioSnapshot {
  return {
    selected: snapshotTree(selectedRoot),
    other: snapshotTree(otherRoot),
    state: snapshotTree(stateRoot),
  }
}

async function initializeProfile(profileRoot: string): Promise<void> {
  const appBoot = await import(pathToFileURL(appBootEntry).href) as {
    DEFAULT_PROFILE_BUNDLES: readonly string[]
    initProfile(path: string, bundles: readonly string[]): void
  }
  appBoot.initProfile(profileRoot, appBoot.DEFAULT_PROFILE_BUNDLES)
}

async function initializeWebProfile(profileRoot: string): Promise<void> {
  const appBoot = await import(pathToFileURL(appBootEntry).href) as {
    PROFILE_TEMPLATES: Record<string, readonly string[]>
    initProfile(path: string, bundles: readonly string[]): void
  }
  appBoot.initProfile(profileRoot, appBoot.PROFILE_TEMPLATES.web)
}

function childEnvironment(
  dshHome: string,
  store = storeRoot,
): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined) throw new Error('SystemRoot is required')
  const tempRoot = join(runRoot, 'temp')
  mkdirSync(tempRoot, { recursive: true })
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_HOME: join(lifecycleRoot, 'corepack-home'),
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_CACHE: join(lifecycleRoot, 'npm-cache'),
    NPM_CONFIG_OFFLINE: 'true',
    PATH: [pnpmCommandRoot, dirname(process.execPath), resolve(systemRoot, 'System32')]
      .join(delimiter),
    PNPM_CONFIG_CACHE_DIR: join(lifecycleRoot, 'npm-cache'),
    PNPM_CONFIG_CONFIRM_MODULES_PURGE: 'false',
    PNPM_CONFIG_OFFLINE: 'true',
    PNPM_CONFIG_STORE_DIR: store,
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    SystemRoot: systemRoot,
    TEMP: tempRoot,
    TMP: tempRoot,
    WINDIR: process.env.WINDIR ?? systemRoot,
  }
  delete environment.DEEPSEEK_API_KEY
  return environment
}

function runDshPlugin(
  dshHome: string,
  args: string[],
  store = storeRoot,
): DshResult {
  dshSpawnCount += 1
  const result = spawnSync(
    process.execPath,
    [dshBin, 'plugin', ...args],
    {
      cwd: runRoot,
      encoding: 'utf8',
      env: childEnvironment(dshHome, store),
      shell: false,
      timeout: 600_000,
      windowsHide: true,
    },
  )
  return {
    error: result.error,
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function expectSuccess(result: DshResult): void {
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function expectRuntimeInstalled(profileRoot: string): void {
  const profile = readJson<{
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }>(join(profileRoot, 'package.json'))
  expect(profile.dependencies?.[runtimePackage]).toBeTypeOf('string')
  expect(profile.dsh?.profile?.bundles?.filter(
    bundle => bundle === runtimePackage,
  )).toHaveLength(1)
  expect(profile.dsh?.profile?.bundles?.[0]).toBe('@deepseek-ai/dsh-base')

  const installed = readJson<{
    dsh?: { bundle?: { patch?: string } }
    name: string
    version: string
  }>(join(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'))
  expect(installed).toMatchObject({
    name: runtimePackage,
    version: runtimeVersion,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  expect(readFileSync(join(profileRoot, 'pnpm-workspace.yaml'), 'utf8'))
    .toMatch(/^allowBuilds:\r?\n  koffi: true$/mu)
}

function expectRuntimeRemoved(profileRoot: string): void {
  const profile = readJson<{
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }>(join(profileRoot, 'package.json'))
  expect(profile.dependencies?.[runtimePackage]).toBeUndefined()
  expect(profile.dsh?.profile?.bundles).not.toContain(runtimePackage)
  expect(existsSync(join(
    profileRoot,
    'node_modules',
    '@tianwen',
    'runtime-bundle',
  ))).toBe(false)
}

beforeAll(() => {
  if (!enabled) return
  lifecycleRoot = requireLifecycleRoot()
  packRoot = join(lifecycleRoot, 'packs')
  runtimeTarball = join(packRoot, 'tianwen-runtime-bundle-0.1.11.tgz')
  storeRoot = join(lifecycleRoot, 'pnpm-store')
  expect(dshManifest).toMatchObject({ name: dshPackage, version: dshVersion })
  expect(readdirSync(packRoot).filter(name => name.endsWith('.tgz'))).toEqual([
    'tianwen-runtime-bundle-0.1.11.tgz',
  ])
  expect(statSync(runtimeTarball).isFile()).toBe(true)
  expect(statSync(storeRoot).isDirectory()).toBe(true)

  const runsRoot = join(lifecycleRoot, 'runs')
  mkdirSync(runsRoot, { recursive: true })
  runRoot = mkdtempSync(join(runsRoot, 'lifecycle-'))
  pnpmCommandRoot = join(runRoot, 'command-bin')
  mkdirSync(pnpmCommandRoot, { recursive: true })
  writeFileSync(
    join(pnpmCommandRoot, 'pnpm.cmd'),
    `@echo off\r\n"${process.execPath}" "${pnpmEntry}" %*\r\n`,
  )
}, 30_000)

describe.runIf(enabled)('portable native DSH plugin lifecycle', () => {
  it('adds to only the selected existing Profile and removes wiring without state loss', async () => {
    const dshHome = join(runRoot, 'existing-home')
    const selectedRoot = join(dshHome, 'profiles', 'selected')
    const otherRoot = join(dshHome, 'profiles', 'other')
    const stateRoot = join(selectedRoot, 'state')
    await initializeProfile(selectedRoot)
    await initializeProfile(otherRoot)
    const userPatch = readFileSync(join(selectedRoot, 'cordis.patch.yml'))

    const beforeAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    const add = runDshPlugin(dshHome, [
      '--profile', 'selected', '--allow-build=koffi',
      'add', '--offline', runtimeTarball,
    ])
    expectSuccess(add)
    const afterAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    expect(afterAdd.selected).not.toBe(beforeAdd.selected)
    expect(afterAdd.other).toBe(beforeAdd.other)
    expect(afterAdd.state).toBe(beforeAdd.state)
    expect(readFileSync(join(selectedRoot, 'cordis.patch.yml'))).toEqual(userPatch)
    expectRuntimeInstalled(selectedRoot)

    mkdirSync(join(stateRoot, 'evolution', 'artifacts'), { recursive: true })
    writeFileSync(
      join(stateRoot, 'evolution', 'artifacts', 'preserved.json'),
      '{"preserved":true}\n',
    )
    const beforeRemove = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    const remove = runDshPlugin(dshHome, [
      '--profile', 'selected', 'remove', runtimePackage,
    ])
    expectSuccess(remove)
    const afterRemove = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    expect(afterRemove.selected).not.toBe(beforeRemove.selected)
    expect(afterRemove.other).toBe(beforeRemove.other)
    expect(afterRemove.state).toBe(beforeRemove.state)
    expect(readFileSync(join(selectedRoot, 'cordis.patch.yml'))).toEqual(userPatch)
    expectRuntimeRemoved(selectedRoot)
  }, 1_200_000)

  it('attributes missing-Profile initialization to the exact DSH command', async () => {
    const dshHome = join(runRoot, 'missing-home')
    const selectedRoot = join(dshHome, 'profiles', 'missing')
    const otherRoot = join(dshHome, 'profiles', 'control')
    const stateRoot = join(selectedRoot, 'state')
    await initializeProfile(otherRoot)

    const beforeAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    const add = runDshPlugin(dshHome, [
      '--profile', 'missing', '--allow-build=koffi',
      'add', '--offline', runtimeTarball,
    ])
    expectSuccess(add)
    const afterAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    expect(beforeAdd.selected).toBe('missing')
    expect(afterAdd.selected).not.toBe('missing')
    expect(afterAdd.other).toBe(beforeAdd.other)
    expect(afterAdd.state).toBe(beforeAdd.state)
    expect(add.stderr.split(/\r?\n/u).filter(
      line => line.startsWith('dsh: initialized profile '),
    )).toEqual([
      `dsh: initialized profile missing at ${selectedRoot}`,
    ])
    expectRuntimeInstalled(selectedRoot)
  }, 1_200_000)

  it('reports one invalid offline add failure without retry or package wiring', async () => {
    const dshHome = join(runRoot, 'invalid-home')
    const selectedRoot = join(dshHome, 'profiles', 'invalid')
    const otherRoot = join(dshHome, 'profiles', 'control')
    const stateRoot = join(selectedRoot, 'state')
    const invalidTarball = join(packRoot, 'missing-runtime-bundle.tgz')
    await initializeProfile(selectedRoot)
    await initializeProfile(otherRoot)
    expect(existsSync(invalidTarball)).toBe(false)

    const beforeAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    const manifestBefore = readFileSync(join(selectedRoot, 'package.json'))
    const patchBefore = readFileSync(join(selectedRoot, 'cordis.patch.yml'))
    const spawnCountBefore = dshSpawnCount
    const failure = runDshPlugin(dshHome, [
      '--profile', 'invalid', '--allow-build=koffi',
      'add', '--offline', invalidTarball,
    ])
    expect(dshSpawnCount - spawnCountBefore).toBe(1)
    expect(failure.error).toBeUndefined()
    expect(failure.status).not.toBe(0)
    expect(failure.stderr.match(/dsh: pnpm failed in profile directory/gu))
      .toHaveLength(1)
    const afterAdd = snapshotScenario(selectedRoot, otherRoot, stateRoot)
    expect(afterAdd.selected).not.toBe(beforeAdd.selected)
    expect(afterAdd.other).toBe(beforeAdd.other)
    expect(afterAdd.state).toBe(beforeAdd.state)
    expect(readFileSync(join(selectedRoot, 'package.json'))).toEqual(manifestBefore)
    expect(readFileSync(join(selectedRoot, 'cordis.patch.yml'))).toEqual(patchBefore)
    expect(readdirSync(selectedRoot).sort()).toEqual([
      'cordis.patch.yml',
      'package.json',
      'pnpm-workspace.yaml',
    ])
    expect(readFileSync(join(selectedRoot, 'pnpm-workspace.yaml'), 'utf8'))
      .toMatch(/^allowBuilds:\r?\n  koffi: true$/mu)
    expectRuntimeRemoved(selectedRoot)
  }, 1_200_000)

  it('mutates workspace policy and disables automatic existing-Profile preparation', async () => {
    const dshHome = join(runRoot, 'existing-web-failure-home')
    const selectedRoot = join(dshHome, 'profiles', 'web')
    const controlRoot = join(dshHome, 'profiles', 'control')
    const stateRoot = join(selectedRoot, 'state')
    await initializeWebProfile(selectedRoot)
    await initializeProfile(controlRoot)
    mkdirSync(stateRoot, { recursive: true })
    writeFileSync(join(stateRoot, 'preserved.json'), '{"preserved":true}\n')

    const lock = spawnSync(
      process.execPath,
      [pnpmEntry, 'install', '--offline', '--lockfile-only', '--ignore-scripts'],
      {
        cwd: selectedRoot,
        encoding: 'utf8',
        env: childEnvironment(dshHome),
        shell: false,
        timeout: 600_000,
        windowsHide: true,
      },
    )
    expect(lock.error).toBeUndefined()
    expect(lock.signal).toBeNull()
    expect(lock.status, `${lock.stdout ?? ''}\n${lock.stderr ?? ''}`).toBe(0)

    const protectedFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      'cordis.patch.yml',
      'pnpm-lock.yaml',
    ] as const
    const protectedBefore = Object.fromEntries(protectedFiles.map(name => [
      name,
      readFileSync(join(selectedRoot, name)),
    ])) as Record<typeof protectedFiles[number], Buffer>
    const selectedManifestBefore = readJson<{
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }>(join(selectedRoot, 'package.json'))
    const runtimeDeclarationBefore = {
      dependency: selectedManifestBefore.dependencies?.[runtimePackage],
      bundles: selectedManifestBefore.dsh?.profile?.bundles?.filter(
        bundle => bundle === runtimePackage,
      ) ?? [],
    }
    expect(selectedManifestBefore.dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
    expect(runtimeDeclarationBefore).toEqual({ dependency: undefined, bundles: [] })
    const controlBefore = snapshotTree(controlRoot)
    const stateBefore = snapshotTree(stateRoot)

    const emptyStore = join(runRoot, 'empty-store-existing-web-failure')
    mkdirSync(emptyStore)
    expect(readdirSync(emptyStore)).toEqual([])

    const spawnCountBefore = dshSpawnCount
    const failure = runDshPlugin(dshHome, [
      '--profile', 'web', '--allow-build=koffi',
      'add', runtimeTarball,
    ], emptyStore)

    expect(dshSpawnCount - spawnCountBefore).toBe(1)
    expect(failure.error).toBeUndefined()
    expect(failure.signal).toBeNull()
    expect(failure.status).not.toBeNull()
    expect(failure.status, `${failure.stdout}\n${failure.stderr}`).not.toBe(0)
    expect(readFileSync(join(selectedRoot, 'package.json')))
      .toEqual(protectedBefore['package.json'])
    expect(readFileSync(join(selectedRoot, 'cordis.patch.yml')))
      .toEqual(protectedBefore['cordis.patch.yml'])
    expect(readFileSync(join(selectedRoot, 'pnpm-lock.yaml')))
      .toEqual(protectedBefore['pnpm-lock.yaml'])
    expect(readFileSync(join(selectedRoot, 'pnpm-workspace.yaml')))
      .not.toEqual(protectedBefore['pnpm-workspace.yaml'])
    expect(readFileSync(join(selectedRoot, 'pnpm-workspace.yaml'), 'utf8'))
      .toMatch(/(?:^|\r?\n)allowBuilds:\r?\n  koffi: true(?:\r?\n|$)/u)

    const selectedManifestAfter = readJson<{
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }>(join(selectedRoot, 'package.json'))
    expect({
      dependency: selectedManifestAfter.dependencies?.[runtimePackage],
      bundles: selectedManifestAfter.dsh?.profile?.bundles?.filter(
        bundle => bundle === runtimePackage,
      ) ?? [],
    }).toEqual(runtimeDeclarationBefore)
    expect(snapshotTree(controlRoot)).toBe(controlBefore)
    expect(snapshotTree(stateRoot)).toBe(stateBefore)
  }, 1_200_000)
})
