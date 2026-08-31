import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, relative, resolve, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

type DirectoryState = 'missing' | 'file' | 'empty-directory' | 'nonempty-directory'
type InspectDirectory = (path: string) => DirectoryState
type UpgradeInputs = Readonly<{ oldAuthorityRoot: string, productRoot: string }>

const root = resolve(import.meta.dirname, '../..')
const devDataRoot = 'D:\\DevData'
const oldAuthoritySha = 'ceafb6bc5d842402c83a0030cb2c2c57105c0dd8'
const predecessorDshVersion = '0.1.0-rc.7'
const currentDshVersion = '0.1.1-rc.2'
const upgradeTestTimeoutMs = 7_200_000
const enabled = process.platform === 'win32'
  && process.env.TIANWEN_RUN_DSH_UPGRADE_E2E === '1'
const validEnvironment: NodeJS.ProcessEnv = {
  TIANWEN_RUN_DSH_UPGRADE_E2E: '1',
  TIANWEN_DSH_RC7_AUTHORITY_ROOT: 'D:\\DevData\\tianwen-worktrees\\tianwen-dsh-rc7-upgrade-authority',
  TIANWEN_DSH_UPGRADE_ROOT: 'D:\\DevData\\tianwen-dsh-rc2-product-migration\\real-upgrade',
}

function contractProductRoot(): string {
  const parent = process.platform === 'win32'
    ? 'D:\\DevData\\tianwen-dsh-upgrade-contract-tests'
    : join(tmpdir(), 'tianwen-dsh-upgrade-contract-tests')
  return join(parent, randomUUID())
}

function inspectDirectory(path: string): DirectoryState {
  if (!existsSync(path)) return 'missing'
  if (!statSync(path).isDirectory()) return 'file'
  return readdirSync(path).length === 0 ? 'empty-directory' : 'nonempty-directory'
}

function requireAbsoluteDirectory(
  name: string,
  environment: NodeJS.ProcessEnv,
  inspect: InspectDirectory,
): string {
  const value = environment[name]
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  if (!win32.isAbsolute(value)) throw new Error(`${name} must be absolute`)
  const normalized = win32.resolve(value)
  const state = inspect(normalized)
  if (state !== 'empty-directory' && state !== 'nonempty-directory') {
    throw new Error(`${name} must be an existing directory`)
  }
  return normalized
}

function requireFreshDevDataChild(
  name: string,
  environment: NodeJS.ProcessEnv,
  inspect: InspectDirectory,
): string {
  const value = environment[name]
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  if (!win32.isAbsolute(value)) throw new Error(`${name} must be absolute`)
  const normalized = win32.resolve(value)
  const child = win32.relative(devDataRoot, normalized)
  if (child === '' || child.startsWith('..') || win32.isAbsolute(child)) {
    throw new Error(`${name} must be a strict child of ${devDataRoot}`)
  }
  const state = inspect(normalized)
  if (state === 'file' || state === 'nonempty-directory') {
    throw new Error(`${name} must be absent or an existing empty directory`)
  }
  return normalized
}

function withValidatedUpgradeInputs(
  environment: NodeJS.ProcessEnv,
  inspect: InspectDirectory,
  operation: (inputs: UpgradeInputs) => void,
): void {
  if (environment.TIANWEN_RUN_DSH_UPGRADE_E2E !== '1') return
  const productRoot = requireFreshDevDataChild('TIANWEN_DSH_UPGRADE_ROOT', environment, inspect)
  const oldAuthorityRoot = requireAbsoluteDirectory(
    'TIANWEN_DSH_RC7_AUTHORITY_ROOT',
    environment,
    inspect,
  )
  operation({ oldAuthorityRoot, productRoot })
}

function childProcessErrorMessage(
  label: string,
  error: Error,
  stdout: string,
  stderr: string,
): string {
  return `${label}: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`
}

function runChecked(
  label: string,
  executable: string,
  argv: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv, timeout: number },
): string {
  const result = spawnSync(executable, argv, {
    ...options,
    encoding: 'utf8',
    shell: false,
  })
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString() ?? ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString() ?? ''
  if (result.error !== undefined) {
    throw new Error(childProcessErrorMessage(label, result.error, stdout, stderr))
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited ${result.status}: ${stdout}\n${stderr}`)
  }
  return stdout
}

function assertOldAuthorityState(revision: string, trackedStatus: string): void {
  if (revision.trim() !== oldAuthoritySha) {
    throw new Error(`old authority must be exact ${oldAuthoritySha}`)
  }
  if (trackedStatus.trim() !== '') throw new Error('old authority must be clean')
}

function childEnvironment(productRoot: string): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined) throw new Error('SystemRoot is required on Windows')
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_HOME: 'D:\\DevData\\corepack-home',
    DSH_HOME: join(productRoot, 'dsh-home'),
    DSH_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_CACHE: 'D:\\DevData\\npm-cache',
    NPM_CONFIG_OFFLINE: 'true',
    PATH: [dirname(process.execPath), resolve(systemRoot, 'System32')].join(delimiter),
    PNPM_CONFIG_CACHE_DIR: 'D:\\DevData\\npm-cache',
    PNPM_CONFIG_OFFLINE: 'true',
    PNPM_CONFIG_STORE_DIR: process.env.PNPM_CONFIG_STORE_DIR ?? 'D:\\DevData\\pnpm-store',
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    SystemRoot: systemRoot,
    TEMP: 'D:\\DevData\\tianwen-installer-temp',
    TMP: 'D:\\DevData\\tianwen-installer-temp',
    WINDIR: process.env.WINDIR ?? systemRoot,
  }
  delete environment.DEEPSEEK_API_KEY
  return environment
}

function requireFile(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} is unavailable: ${path}`)
}

function runInstaller(installer: string, productRoot: string, environment: NodeJS.ProcessEnv): void {
  requireFile(installer, 'official Tianwen installer')
  const stdout = runChecked(
    'official Tianwen installer',
    process.execPath,
    [installer, '--data-dir', productRoot, '--json'],
    { cwd: resolve(dirname(installer), '..'), env: environment, timeout: 2_100_000 },
  )
  const receipt = JSON.parse(stdout) as { status?: unknown }
  expect(receipt.status).toBe('ready')
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function installPaths(productRoot: string, dshVersion = currentDshVersion) {
  const profileRoot = join(productRoot, 'dsh-home', 'profiles', 'tianwen')
  const runtimeVersion = dshVersion === predecessorDshVersion ? '0.0.0' : '0.1.8'
  return {
    archive: join(productRoot, 'packs', `tianwen-runtime-bundle-${runtimeVersion}.tgz`),
    hostManifest: join(productRoot, 'dsh-host', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    profileRoot,
    receipt: join(productRoot, 'receipts', 'tianwen-install.json'),
  }
}

function assertInstalledVersion(productRoot: string, version: string): string {
  const paths = installPaths(productRoot, version)
  const host = readJson<{ version: string, bin: { dsh: string } }>(paths.hostManifest)
  const profile = readJson<{
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }>(join(paths.profileRoot, 'package.json'))
  const base = readJson<{ version: string }>(join(
    paths.profileRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-base',
    'package.json',
  ))
  const headless = readJson<{ version: string }>(join(
    paths.profileRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-headless',
    'package.json',
  ))
  const receipt = readJson<{
    schemaVersion: string
    status: string
    dshVersion: string
    dataDir: string
    hostRoot: string
    profileRoot: string
    archivePath: string
    receiptPath: string
  }>(paths.receipt)

  expect(host.version).toBe(version)
  expect(base.version).toBe(version)
  expect(headless.version).toBe(version)
  expect(profile.dependencies['@deepseek-ai/dsh-base']).toBe(version)
  expect(profile.dependencies['@deepseek-ai/dsh-headless']).toBe(version)
  expect(profile.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-headless',
    '@tianwen/runtime-bundle',
  ])
  expect(receipt).toMatchObject({
    schemaVersion: 'tianwen.install.v1',
    status: 'ready',
    dshVersion: version,
    dataDir: productRoot,
    hostRoot: join(productRoot, 'dsh-host'),
    profileRoot: paths.profileRoot,
    archivePath: paths.archive,
    receiptPath: paths.receipt,
  })
  const dshBin = resolve(dirname(paths.hostManifest), host.bin.dsh)
  requireFile(dshBin, 'installed DSH executable')
  return dshBin
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function writeAndHashSyntheticState(productRoot: string): Readonly<Record<string, string>> {
  const sentinels = {
    evolution: join(
      productRoot,
      'state',
      'evolution',
      'upgrade-acceptance',
      'sentinel.jsonl',
    ),
    session: join(
      productRoot,
      'dsh-home',
      'sessions',
      '_upgrade_acceptance',
      'synthetic-session',
      'session.jsonl',
    ),
  }
  mkdirSync(dirname(sentinels.session), { recursive: true })
  mkdirSync(dirname(sentinels.evolution), { recursive: true })
  writeFileSync(sentinels.session, '{"type":"session","id":"synthetic-upgrade-sentinel"}\n', {
    encoding: 'utf8',
    flag: 'wx',
  })
  writeFileSync(sentinels.evolution, '{"type":"synthetic-upgrade-sentinel","revision":1}\n', {
    encoding: 'utf8',
    flag: 'wx',
  })
  return Object.fromEntries(Object.entries(sentinels).map(([name, path]) => [name, sha256(path)]))
}

function hashSyntheticState(productRoot: string): Readonly<Record<string, string>> {
  return {
    evolution: sha256(join(
      productRoot,
      'state',
      'evolution',
      'upgrade-acceptance',
      'sentinel.jsonl',
    )),
    session: sha256(join(
      productRoot,
      'dsh-home',
      'sessions',
      '_upgrade_acceptance',
      'synthetic-session',
      'session.jsonl',
    )),
  }
}

function snapshotPersistentState(productRoot: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  const visit = (path: string): void => {
    const label = relative(productRoot, path).replaceAll('\\', '/')
    snapshot[`directory:${label}`] = ''
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name))) {
      const child = join(path, entry.name)
      const childLabel = relative(productRoot, child).replaceAll('\\', '/')
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) snapshot[`file:${childLabel}`] = readFileSync(child).toString('base64')
      else snapshot[`other:${childLabel}`] = entry.isSymbolicLink() ? 'symbolic-link' : 'other'
    }
  }

  for (const path of [
    join(productRoot, 'dsh-home', 'sessions'),
    join(productRoot, 'state', 'evolution'),
  ]) {
    if (existsSync(path)) visit(path)
    else snapshot[`missing:${relative(productRoot, path).replaceAll('\\', '/')}`] = ''
  }
  return snapshot
}

function snapshotManagedFiles(productRoot: string): Readonly<Record<string, string>> {
  const paths = installPaths(productRoot)
  const files = [
    paths.hostManifest,
    join(paths.profileRoot, 'package.json'),
    join(paths.profileRoot, 'pnpm-workspace.yaml'),
    join(paths.profileRoot, 'cordis.patch.yml'),
    join(paths.profileRoot, 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json'),
    join(paths.profileRoot, 'node_modules', '@deepseek-ai', 'dsh-headless', 'package.json'),
    join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle', 'package.json'),
    join(paths.profileRoot, 'node_modules', '@tianwen', 'runtime-bundle', 'dist', 'cli.js'),
    paths.archive,
    paths.receipt,
  ]
  return Object.fromEntries(files.map(path => [relative(productRoot, path), readFileSync(path).toString('base64')]))
}

function matchingChildren(rootPath: string, prefixes: readonly string[]): string[] {
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) return []
  return readdirSync(rootPath)
    .filter(name => prefixes.some(prefix => name.startsWith(prefix)))
    .map(name => join(rootPath, name))
}

function findRuntimeStagedCopies(runtimeRoot: string): string[] {
  if (!existsSync(runtimeRoot) || !statSync(runtimeRoot).isDirectory()) return []
  const found: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()
        && /\.copy-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(entry.name)) {
        found.push(child)
      }
    }
  }
  visit(runtimeRoot)
  return found
}

function findInstallerResidue(productRoot: string): string[] {
  const runtimeRoot = join(
    productRoot,
    'dsh-home',
    'profiles',
    'tianwen',
    'node_modules',
    '@tianwen',
    'runtime-bundle',
  )
  return [
    ...matchingChildren(productRoot, ['.dsh-host-backup-']),
    ...matchingChildren(join(productRoot, 'packs'), ['.install-', '.tianwen-backup-']),
    ...matchingChildren(
      join(productRoot, 'dsh-home', 'profiles'),
      ['.tianwen-backup-'],
    ),
    ...matchingChildren(
      join(productRoot, 'receipts'),
      ['tianwen-install.json.tmp-'],
    ),
    ...findRuntimeStagedCopies(runtimeRoot),
  ].map(path => relative(productRoot, path)).sort()
}

function runUpgradeAcceptance({ oldAuthorityRoot, productRoot }: UpgradeInputs): void {
  const environment = childEnvironment(productRoot)
  const oldInstaller = join(oldAuthorityRoot, 'scripts', 'install-tianwen.mjs')
  const currentInstaller = join(root, 'scripts', 'install-tianwen.mjs')
  requireFile(oldInstaller, 'old official Tianwen installer')
  requireFile(currentInstaller, 'candidate official Tianwen installer')

  const authorityHead = runChecked(
    'old authority revision check',
    'git',
    ['-C', oldAuthorityRoot, 'rev-parse', '--verify', 'HEAD'],
    { cwd: oldAuthorityRoot, env: process.env, timeout: 30_000 },
  ).trim()
  const authorityStatus = runChecked(
    'old authority tracked status check',
    'git',
    ['-C', oldAuthorityRoot, 'status', '--porcelain', '--untracked-files=no'],
    { cwd: oldAuthorityRoot, env: process.env, timeout: 30_000 },
  )
  assertOldAuthorityState(authorityHead, authorityStatus)

  runInstaller(oldInstaller, productRoot, environment)
  expect(assertInstalledVersion(productRoot, predecessorDshVersion)).toBeTypeOf('string')
  const stateBefore = writeAndHashSyntheticState(productRoot)

  runInstaller(currentInstaller, productRoot, environment)
  const dshBin = assertInstalledVersion(productRoot, currentDshVersion)
  const persistentStateBeforeDump = snapshotPersistentState(productRoot)
  const dump = runChecked(
    'current Profile dump',
    process.execPath,
    [dshBin, '--profile', 'tianwen', '--dump-config'],
    { cwd: root, env: environment, timeout: 120_000 },
  )
  expect(dump.length).toBeGreaterThan(0)
  expect(snapshotPersistentState(productRoot)).toEqual(persistentStateBeforeDump)
  const boot = runChecked(
    'current offline Profile boot',
    process.execPath,
    [dshBin, '--profile', 'tianwen', 'run the Tianwen phase 2 smoke task'],
    { cwd: root, env: environment, timeout: 180_000 },
  )
  expect(boot.trim()).toBe('TIANWEN_PHASE2_OK')
  expect(hashSyntheticState(productRoot)).toEqual(stateBefore)

  const firstCurrentSnapshot = snapshotManagedFiles(productRoot)
  runInstaller(currentInstaller, productRoot, environment)
  expect(snapshotManagedFiles(productRoot)).toEqual(firstCurrentSnapshot)
  expect(hashSyntheticState(productRoot)).toEqual(stateBefore)
  expect(findInstallerResidue(productRoot)).toEqual([])
}

const invalidInputs = [
  ['missing product root', { ...validEnvironment, TIANWEN_DSH_UPGRADE_ROOT: undefined }, () => 'empty-directory'],
  ['relative product root', { ...validEnvironment, TIANWEN_DSH_UPGRADE_ROOT: 'relative\\product' }, () => 'empty-directory'],
  ['drive root', { ...validEnvironment, TIANWEN_DSH_UPGRADE_ROOT: 'D:\\' }, () => 'empty-directory'],
  ['DevData root', { ...validEnvironment, TIANWEN_DSH_UPGRADE_ROOT: 'D:\\DevData' }, () => 'empty-directory'],
  ['another drive', { ...validEnvironment, TIANWEN_DSH_UPGRADE_ROOT: 'C:\\upgrade' }, () => 'empty-directory'],
  ['existing non-empty target', validEnvironment, (path: string) => path.endsWith('real-upgrade') ? 'nonempty-directory' : 'empty-directory'],
  ['file target', validEnvironment, (path: string) => path.endsWith('real-upgrade') ? 'file' : 'empty-directory'],
  ['missing old authority', { ...validEnvironment, TIANWEN_DSH_RC7_AUTHORITY_ROOT: undefined }, () => 'empty-directory'],
  ['relative old authority', { ...validEnvironment, TIANWEN_DSH_RC7_AUTHORITY_ROOT: 'relative\\authority' }, () => 'empty-directory'],
  ['non-directory old authority', validEnvironment, (path: string) => path.includes('rc7-upgrade-authority') ? 'file' : 'empty-directory'],
] satisfies ReadonlyArray<readonly [string, NodeJS.ProcessEnv, InspectDirectory]>

describe('Tianwen managed product upgrade acceptance boundary', () => {
  it('accepts the exact clean old authority when ignored dependencies are absent from tracked status', () => {
    expect(() => assertOldAuthorityState(`${oldAuthoritySha}\n`, '')).not.toThrow()
  })

  it('uses the Runtime archive that belongs to each managed product generation', () => {
    const productRoot = contractProductRoot()
    const predecessorPaths = installPaths(productRoot, predecessorDshVersion)
    const currentPaths = installPaths(productRoot, currentDshVersion)

    expect(predecessorPaths.archive).toBe(join(
      productRoot,
      'packs',
      'tianwen-runtime-bundle-0.0.0.tgz',
    ))
    expect(currentPaths.archive).toBe(join(
      productRoot,
      'packs',
      'tianwen-runtime-bundle-0.1.8.tgz',
    ))
  })

  it('rejects tracked old-authority changes before the first installer', () => {
    expect(() => assertOldAuthorityState(oldAuthoritySha, ' M scripts/install-tianwen.mjs\n'))
      .toThrow(/old authority must be clean/u)
  })

  it('detects added state directories, files, and changed bytes recursively', () => {
    const productRoot = contractProductRoot()
    const session = join(productRoot, 'dsh-home', 'sessions', 'existing', 'session.jsonl')
    try {
      mkdirSync(dirname(session), { recursive: true })
      writeFileSync(session, 'before\n', 'utf8')
      const before = snapshotPersistentState(productRoot)

      const nested = join(productRoot, 'state', 'evolution', 'added', 'nested')
      mkdirSync(nested, { recursive: true })
      const afterDirectory = snapshotPersistentState(productRoot)
      expect(afterDirectory).not.toEqual(before)

      writeFileSync(join(nested, 'ledger.jsonl'), 'added\n', 'utf8')
      const afterFile = snapshotPersistentState(productRoot)
      expect(afterFile).not.toEqual(afterDirectory)

      writeFileSync(session, 'after\n', 'utf8')
      expect(snapshotPersistentState(productRoot)).not.toEqual(afterFile)
    } finally {
      rmSync(productRoot, { recursive: true, force: true })
    }
  })

  it('finds nested Runtime Bundle staged-copy residue', () => {
    const productRoot = contractProductRoot()
    const staged = join(
      productRoot,
      'dsh-home',
      'profiles',
      'tianwen',
      'node_modules',
      '@tianwen',
      'runtime-bundle',
      'dist',
      'nested',
      `chunk.js.copy-4321-${randomUUID()}`,
    )
    try {
      mkdirSync(dirname(staged), { recursive: true })
      writeFileSync(staged, 'staged copy\n', 'utf8')

      expect(findInstallerResidue(productRoot)).toEqual([relative(productRoot, staged)])
    } finally {
      rmSync(productRoot, { recursive: true, force: true })
    }
  })

  it('keeps the outer timeout above every bounded child-process budget', () => {
    expect(upgradeTestTimeoutMs).toBeGreaterThan(6_660_000)
  })

  it('keeps child stdout and stderr when a process reports an execution error', () => {
    const message = childProcessErrorMessage(
      'candidate installer',
      new Error('spawn timed out'),
      'partial stdout',
      'partial stderr',
    )

    expect(message).toContain('spawn timed out')
    expect(message).toContain('partial stdout')
    expect(message).toContain('partial stderr')
  })

  it('does nothing unless the exact opt-in value is enabled', () => {
    let operations = 0

    withValidatedUpgradeInputs({}, () => 'missing', () => { operations += 1 })
    withValidatedUpgradeInputs({ TIANWEN_RUN_DSH_UPGRADE_E2E: 'true' }, () => 'missing', () => {
      operations += 1
    })

    expect(operations).toBe(0)
  })

  it.each(invalidInputs)('rejects %s before the upgrade operation', (_label, environment, inspect) => {
    let operations = 0

    expect(() => withValidatedUpgradeInputs(environment, inspect, () => { operations += 1 }))
      .toThrow()
    expect(operations).toBe(0)
  })

  it.each(['missing', 'empty-directory'] as const)(
    'accepts a %s product target only after validating both controller roots',
    (productState) => {
      const seen: UpgradeInputs[] = []
      const inspect: InspectDirectory = path => path.endsWith('real-upgrade')
        ? productState
        : 'nonempty-directory'

      withValidatedUpgradeInputs(validEnvironment, inspect, inputs => { seen.push(inputs) })

      expect(seen).toEqual([{
        oldAuthorityRoot: validEnvironment.TIANWEN_DSH_RC7_AUTHORITY_ROOT,
        productRoot: validEnvironment.TIANWEN_DSH_UPGRADE_ROOT,
      }])
    },
  )
})

describe('Tianwen real DSH 0.1.0-rc.7 product upgrade', () => {
  it.runIf(enabled)(
    'upgrades once, preserves synthetic state, and replays the current installer once',
    () => withValidatedUpgradeInputs(process.env, inspectDirectory, runUpgradeAcceptance),
    upgradeTestTimeoutMs,
  )
})
