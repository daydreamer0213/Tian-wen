import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, delimiter, dirname, isAbsolute, relative, resolve, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const DSH_VERSION = '0.1.0-rc.7'
const PREDECESSOR_DSH_VERSION = '0.1.0-rc.6'
const PNPM_VERSION = '11.20.0'
const PROFILE = 'tianwen'
const RUNTIME_PACKAGE = '@tianwen/runtime-bundle'
const PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-headless',
  RUNTIME_PACKAGE,
]
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE_POLICY = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: true
overrides:
  koffi: 3.1.4
allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': false
  '@google/genai': false
  koffi: false
  node-pty: false
  protobufjs: false
`

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
  }
  return value
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`
}

export function parseInstallerArgs(argv) {
  const dataDirCount = argv.filter(value => value === '--data-dir' || value.startsWith('--data-dir=')).length
  if (dataDirCount !== 1) throw new Error('exactly one --data-dir is required')
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      'data-dir': { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  })
  if (values['data-dir'] === undefined || values['data-dir'] === '') {
    throw new Error('--data-dir must not be empty')
  }
  return { dataDir: values['data-dir'], json: values.json }
}

export function deriveInstallPaths(dataDir, platform = process.platform) {
  if (platform === 'win32') {
    if (!win32.isAbsolute(dataDir)) throw new Error('--data-dir must be absolute')
    if (!/^[A-Za-z0-9_:\\./-]+$/u.test(dataDir)) {
      throw new Error('--data-dir contains unsupported characters')
    }
    const normalized = win32.resolve(dataDir)
    const allowed = 'D:\\DevData'
    const child = win32.relative(allowed, normalized)
    if (child === '' || child.startsWith('..') || win32.isAbsolute(child)) {
      throw new Error('--data-dir must be below D:\\DevData')
    }
    dataDir = normalized
  } else {
    if (!isAbsolute(dataDir)) throw new Error('--data-dir must be absolute')
    dataDir = resolve(dataDir)
  }

  const pathApi = platform === 'win32' ? win32 : { join: (...parts) => resolve(...parts) }
  const dshHome = pathApi.join(dataDir, 'dsh-home')
  const profileRoot = pathApi.join(dshHome, 'profiles', PROFILE)
  return {
    archivePath: pathApi.join(dataDir, 'packs', 'tianwen-runtime-bundle-0.0.0.tgz'),
    binDir: pathApi.join(profileRoot, 'node_modules', '.bin'),
    dataDir,
    dshHome,
    evolutionRoot: pathApi.join(dataDir, 'state', 'evolution'),
    hostRoot: pathApi.join(dataDir, 'dsh-host'),
    profileRoot,
    receiptPath: pathApi.join(dataDir, 'receipts', 'tianwen-install.json'),
    sessionsRoot: pathApi.join(dshHome, 'sessions'),
  }
}

function portable(path) {
  return path.replaceAll('\\', '/')
}

export function renderProfilePatch(paths) {
  return `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke

- id: session-persistence-jsonl
  config:
    root: '${portable(paths.sessionsRoot)}'
    compression: none
    packChunks: false

- id: tianwen-runtime
  config:
    evolutionRoot: '${portable(paths.evolutionRoot)}'

- id: attachment-local
  disabled: true

- id: sandbox
  disabled: true

- id: pwsh-sandbox
  disabled: true

- id: permission
  disabled: true

- id: tool-pwsh
  disabled: true

- insert:
    - id: cordis-host-runner
      name: '@deepseek-ai/dsh-cordis-host-runner'

    - id: tianwen-phase2-smoke
      name: '@tianwen/runtime-bundle/smoke'
`
}

function renderOriginalRc6ProfilePatch(paths) {
  return `- id: agent-default-model
  config:
    provider: tianwen-offline
    model: phase2-smoke

- id: session-persistence-jsonl
  config:
    root: '${portable(paths.sessionsRoot)}'
    compression: none
    packChunks: false

- id: tianwen-runtime
  config:
    evolutionRoot: '${portable(paths.evolutionRoot)}'

- insert:
    - id: cordis-host-runner
      name: '@deepseek-ai/dsh-cordis-host-runner'

    - id: tianwen-phase2-smoke
      name: '@tianwen/runtime-bundle/smoke'
`
}

function contained(root, candidate, label) {
  const child = relative(realpathSync(root), realpathSync(candidate))
  if (child.startsWith('..') || isAbsolute(child)) throw new Error(`${label} escapes its managed root`)
}

function inspectInstalledHost(hostRoot) {
  const packageRoot = resolve(hostRoot, 'node_modules', '@deepseek-ai', 'dsh')
  const manifestPath = resolve(packageRoot, 'package.json')
  const manifest = assertPlainObject(JSON.parse(readFileSync(manifestPath, 'utf8')), 'DSH manifest')
  const bin = assertPlainObject(manifest.bin, 'DSH bin').dsh
  if (typeof bin !== 'string' || bin === '') throw new Error('DSH manifest must expose bin.dsh')
  const executable = resolve(packageRoot, bin)
  if (!statSync(executable).isFile()) throw new Error('DSH bin target must be a file')
  contained(packageRoot, executable, 'DSH bin')
  return { executable, version: manifest.version }
}

export function validateInstalledHost(hostRoot) {
  const host = inspectInstalledHost(hostRoot)
  if (host.version !== DSH_VERSION) {
    throw new Error(`DSH host must contain exact DSH version ${DSH_VERSION}`)
  }
  return host.executable
}

function inspectProfile(paths, profileRoot = paths.profileRoot) {
  const manifestPath = resolve(profileRoot, 'package.json')
  const policyPath = resolve(profileRoot, 'pnpm-workspace.yaml')
  const patchPath = resolve(profileRoot, 'cordis.patch.yml')
  if (readFileSync(policyPath, 'utf8') !== WORKSPACE_POLICY) {
    throw new Error('managed Profile workspace policy differs from Tianwen v1')
  }
  const manifest = assertPlainObject(JSON.parse(readFileSync(manifestPath, 'utf8')), 'Profile manifest')
  const dependencies = assertPlainObject(manifest.dependencies, 'Profile dependencies')
  const dsh = assertPlainObject(manifest.dsh, 'Profile dsh')
  const profile = assertPlainObject(dsh.profile, 'Profile dsh.profile')
  if (JSON.stringify(profile.bundles) !== JSON.stringify(PROFILE_BUNDLES)) {
    throw new Error('managed Profile bundle order differs from Tianwen v1')
  }
  return {
    dependencies,
    manifestPath,
    patch: readFileSync(patchPath, 'utf8'),
  }
}

function matchesProfile(profile, dshVersion, runtime, patch) {
  return profile.dependencies['@deepseek-ai/dsh-base'] === dshVersion
    && profile.dependencies['@deepseek-ai/dsh-headless'] === dshVersion
    && profile.dependencies[RUNTIME_PACKAGE] === runtime
    && profile.patch === patch
}

function validateProfile(paths, profileRoot = paths.profileRoot) {
  const profile = inspectProfile(paths, profileRoot)
  if (profile.patch !== renderProfilePatch(paths)) {
    throw new Error('managed Profile patch differs from Tianwen v1')
  }
  if (profile.dependencies['@deepseek-ai/dsh-base'] !== DSH_VERSION
    || profile.dependencies['@deepseek-ai/dsh-headless'] !== DSH_VERSION) {
    throw new Error(`managed Profile must use DSH ${DSH_VERSION}`)
  }
  if (profile.dependencies[RUNTIME_PACKAGE] !== '0.0.0') {
    throw new Error('managed Profile must use Tianwen Runtime 0.0.0')
  }
  return profile.manifestPath
}

function directoryHasOnly(root, names) {
  return readdirSync(root, { withFileTypes: true }).every(entry => names.includes(entry.name))
}

function isFreshDataDirectory(paths) {
  if (existsSync(paths.hostRoot) || existsSync(paths.profileRoot)) return false
  if (!directoryHasOnly(paths.dataDir, ['dsh-home', 'state'])) return false
  const stateRoot = dirname(paths.evolutionRoot)
  return (!existsSync(paths.dshHome) || directoryHasOnly(paths.dshHome, ['sessions']))
    && (!existsSync(stateRoot) || directoryHasOnly(stateRoot, ['evolution']))
}

export function classifyManagedInstallation(paths) {
  if (!existsSync(paths.dataDir)) return 'fresh'
  if (isFreshDataDirectory(paths)) return 'fresh'
  if (!existsSync(paths.hostRoot) || !existsSync(paths.profileRoot) || !existsSync(paths.archivePath)) {
    return 'incompatible'
  }
  try {
    const host = inspectInstalledHost(paths.hostRoot)
    const profile = inspectProfile(paths)
    if (host.version === DSH_VERSION && matchesProfile(profile, DSH_VERSION, '0.0.0', renderProfilePatch(paths))) {
      return 'current'
    }
    const original = matchesProfile(
      profile,
      PREDECESSOR_DSH_VERSION,
      `file:${portable(paths.archivePath)}`,
      renderOriginalRc6ProfilePatch(paths),
    )
    const lockedDeploy = matchesProfile(
      profile,
      PREDECESSOR_DSH_VERSION,
      '0.0.0',
      renderProfilePatch(paths),
    )
    return host.version === PREDECESSOR_DSH_VERSION && (original || lockedDeploy)
      ? 'managed-rc6'
      : 'incompatible'
  } catch {
    return 'incompatible'
  }
}

function normalizeDeployedProfile(paths, profileRoot) {
  const manifestPath = resolve(profileRoot, 'package.json')
  const manifest = assertPlainObject(JSON.parse(readFileSync(manifestPath, 'utf8')), 'Profile manifest')
  manifest.dependencies = {
    '@deepseek-ai/dsh-base': DSH_VERSION,
    '@deepseek-ai/dsh-headless': DSH_VERSION,
    [RUNTIME_PACKAGE]: '0.0.0',
  }
  manifest.dsh = { profile: { bundles: [...PROFILE_BUNDLES] } }
  writeFileSync(manifestPath, canonicalJson(manifest), 'utf8')
  rmSync(resolve(profileRoot, 'pnpm-lock.yaml'), { force: true })
  writeFileSync(resolve(profileRoot, 'pnpm-workspace.yaml'), WORKSPACE_POLICY, 'utf8')
  writeFileSync(resolve(profileRoot, 'cordis.patch.yml'), renderProfilePatch(paths), 'utf8')
}

function dumpRow(source, id) {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const starts = lines.map((line, index) => ({ line, index })).filter(row => row.line === `- id: ${id}`)
  if (starts.length !== 1) throw new Error(`dump-config must contain exactly one ${id}`)
  const start = starts[0].index
  const end = lines.findIndex((line, index) => index > start && line.startsWith('- id: '))
  return lines.slice(start, end < 0 ? undefined : end)
}

function dumpValue(lines, key) {
  const values = lines
    .map((line, index) => {
      const match = new RegExp(`^( {2,})${key}: (.+)$`, 'u').exec(line)
      if (match === null) return undefined
      if (match[2] !== '>-') return match[2]
      return new RegExp(`^ {${match[1].length + 2},}(\\S.*)$`, 'u')
        .exec(lines[index + 1] ?? '')?.[1] ?? match[2]
    })
    .filter(value => value !== undefined)
  if (values.length !== 1) throw new Error(`dump-config must contain exactly one ${key}`)
  return values[0].replace(/^['"]|['"]$/gu, '')
}

export function validateDump(source, paths) {
  const expected = [
    ['agent-default-model', 'provider', 'tianwen-offline'],
    ['agent-default-model', 'model', 'phase2-smoke'],
    ['session-persistence-jsonl', 'root', portable(paths.sessionsRoot)],
    ['session-persistence-jsonl', 'compression', 'none'],
    ['session-persistence-jsonl', 'packChunks', 'false'],
    ['cordis-host-runner', 'name', '@deepseek-ai/dsh-cordis-host-runner'],
    ['tianwen-runtime', 'evolutionRoot', portable(paths.evolutionRoot)],
    ['tianwen-phase2-smoke', 'name', '@tianwen/runtime-bundle/smoke'],
  ]
  for (const [id, key, value] of expected) {
    if (dumpValue(dumpRow(source, id), key) !== value) {
      throw new Error(`dump-config ${id}.${key} differs from Tianwen v1`)
    }
  }
}

function resolveInstalledCli(profileManifestPath, repoRoot) {
  const requireFromProfile = createRequire(realpathSync(profileManifestPath))
  const runtimeEntry = requireFromProfile.resolve(`${RUNTIME_PACKAGE}/runtime`)
  const runtimeRoot = resolve(dirname(runtimeEntry), '..')
  const manifest = assertPlainObject(
    JSON.parse(readFileSync(resolve(runtimeRoot, 'package.json'), 'utf8')),
    'Runtime Bundle manifest',
  )
  const bin = assertPlainObject(manifest.bin, 'Runtime Bundle bin').tianwen
  if (typeof bin !== 'string' || bin === '') throw new Error('Runtime Bundle must expose bin.tianwen')
  const cli = resolve(runtimeRoot, bin)
  if (!statSync(cli).isFile()) throw new Error('installed Tianwen CLI must be a file')
  const launcher = resolve(
    dirname(profileManifestPath),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tianwen.CMD' : 'tianwen',
  )
  if (!statSync(launcher).isFile()) throw new Error('Profile must expose the Tianwen command')
  const installed = realpathSync(cli)
  const sourceChild = relative(realpathSync(repoRoot), installed)
  if (sourceChild === '' || (!sourceChild.startsWith('..') && !isAbsolute(sourceChild))) {
    throw new Error('installed Tianwen CLI must not resolve into the source worktree')
  }
  return installed
}

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function previousArchiveDigest(paths) {
  if (!existsSync(paths.receiptPath)) return undefined
  try {
    const receipt = assertPlainObject(
      JSON.parse(readFileSync(paths.receiptPath, 'utf8')),
      'install receipt',
    )
    if (receipt.schemaVersion !== 'tianwen.install.v1'
      || receipt.status !== 'ready'
      || receipt.dataDir !== paths.dataDir
      || receipt.profileRoot !== paths.profileRoot
      || receipt.archivePath !== paths.archivePath
      || typeof receipt.archiveDigest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(receipt.archiveDigest)) return undefined
    return receipt.archiveDigest
  } catch {
    return undefined
  }
}

export function createInstallReceipt(paths, { archiveDigest, cliPath }) {
  return {
    archiveDigest,
    archivePath: paths.archivePath,
    binDir: paths.binDir,
    cliPath,
    dataDir: paths.dataDir,
    dshVersion: DSH_VERSION,
    hostRoot: paths.hostRoot,
    pnpmVersion: PNPM_VERSION,
    profileBundles: [...PROFILE_BUNDLES],
    profileRoot: paths.profileRoot,
    receiptPath: paths.receiptPath,
    schemaVersion: 'tianwen.install.v1',
    status: 'ready',
  }
}

function childEnvironment(paths, source) {
  const systemRoot = source.SystemRoot ?? source.WINDIR
  if (process.platform === 'win32' && systemRoot === undefined) {
    throw new Error('SystemRoot is required on Windows')
  }
  const temp = 'D:\\DevData\\tianwen-installer-temp'
  mkdirSync(temp, { recursive: true })
  const configuredDPath = (value, fallback, label) => {
    if (value === undefined || value === '') return fallback
    const normalized = win32.resolve(value)
    const child = win32.relative('D:\\DevData', normalized)
    if (child === '' || child.startsWith('..') || win32.isAbsolute(child)) {
      throw new Error(`${label} must stay below D:\\DevData`)
    }
    return normalized
  }
  const packageCache = configuredDPath(
    source.PNPM_CONFIG_CACHE_DIR ?? source.NPM_CONFIG_CACHE,
    'D:\\DevData\\npm-cache',
    'package cache',
  )
  return {
    CI: 'true',
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_HOME: 'D:\\DevData\\corepack-home',
    ComSpec: source.ComSpec,
    DSH_HOME: paths.dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_CACHE: packageCache,
    NPM_CONFIG_OFFLINE: 'true',
    PATH: process.platform === 'win32'
      ? [dirname(process.execPath), resolve(systemRoot, 'System32')].join(delimiter)
      : source.PATH,
    PATHEXT: source.PATHEXT,
    PNPM_CONFIG_OFFLINE: 'true',
    PNPM_CONFIG_CACHE_DIR: packageCache,
    PNPM_CONFIG_STORE_DIR: configuredDPath(
      source.PNPM_CONFIG_STORE_DIR,
      'D:\\DevData\\pnpm-store',
      'PNPM_CONFIG_STORE_DIR',
    ),
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    SystemRoot: systemRoot,
    TEMP: temp,
    TMP: temp,
    WINDIR: source.WINDIR ?? systemRoot,
  }
}

function pnpmEntry(source) {
  if (source.npm_execpath !== undefined && /(?:^|[\\/])pnpm\.(?:c?js|mjs)$/iu.test(source.npm_execpath)) {
    return resolve(source.npm_execpath)
  }
  return resolve(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
}

function runFixed(executable, argv, { cwd, env, runner, timeout = 120_000 }) {
  const result = runner(executable, argv, {
    cwd,
    encoding: 'utf8',
    env,
    shell: false,
    timeout,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
    throw new Error(`child command failed (${result.status}): ${detail}`)
  }
  return { stderr: result.stderr ?? '', stdout: result.stdout ?? '' }
}

function assertManagedDataDir(paths) {
  if (process.platform !== 'win32') return
  const allowed = realpathSync('D:\\DevData')
  const actual = realpathSync(paths.dataDir)
  const child = relative(allowed, actual)
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('--data-dir resolves outside D:\\DevData')
  }
}

function ensureManagedDataDir(paths) {
  mkdirSync(paths.dataDir, { recursive: true })
  assertManagedDataDir(paths)
}

export function installTianwen({
  dataDir,
  env: source = process.env,
  platform = process.platform,
  repoRoot = REPO_ROOT,
  runner = spawnSync,
} = {}) {
  const paths = deriveInstallPaths(dataDir, platform)
  const installation = classifyManagedInstallation(paths)
  if (installation === 'incompatible') {
    if (existsSync(paths.hostRoot) && existsSync(paths.profileRoot)) {
      validateInstalledHost(paths.hostRoot)
      validateProfile(paths)
    }
    throw new Error('existing data directory is not a complete managed Tianwen installation')
  }
  if (installation === 'managed-rc6') {
    throw new Error('managed DSH rc.6 installation requires an explicit migration')
  }
  if (installation === 'fresh') ensureManagedDataDir(paths)
  else assertManagedDataDir(paths)
  mkdirSync(dirname(paths.receiptPath), { recursive: true })

  const hostExists = existsSync(paths.hostRoot)
  const profileExists = existsSync(paths.profileRoot)
  const installedArchiveDigest = previousArchiveDigest(paths)
  let dshBin
  if (hostExists) dshBin = validateInstalledHost(paths.hostRoot)
  if (profileExists) validateProfile(paths)

  const env = childEnvironment(paths, source)
  const pnpm = pnpmEntry(source)
  if (!statSync(pnpm).isFile()) throw new Error(`exact pnpm entry is unavailable: ${pnpm}`)
  const invokePnpm = (args, timeout) => runFixed(
    process.execPath,
    [pnpm, ...args],
    { cwd: repoRoot, env, runner, timeout },
  )
  const version = invokePnpm(['--version']).stdout.trim()
  if (version !== PNPM_VERSION) throw new Error(`pnpm ${PNPM_VERSION} is required, got ${version}`)

  invokePnpm(['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--trust-lockfile'], 300_000)
  if (!hostExists) {
    mkdirSync(dirname(paths.hostRoot), { recursive: true })
    try {
      invokePnpm([
        '--config.inject-workspace-packages=true',
        '--filter', '@tianwen/dsh-host',
        'deploy', '--prod', paths.hostRoot,
      ], 900_000)
      dshBin = validateInstalledHost(paths.hostRoot)
    } catch (error) {
      rmSync(paths.hostRoot, { force: true, recursive: true })
      throw error
    }
  }

  const packsRoot = dirname(paths.archivePath)
  const archiveStages = [randomUUID(), randomUUID()]
    .map(id => resolve(packsRoot, `.install-${process.pid}-${id}`))
  const stagedArchives = archiveStages.map(stage => resolve(stage, basename(paths.archivePath)))
  const stagedArchive = stagedArchives[0]
  let archiveDigest
  let archiveBackup
  let archivePublished = false
  let profileBackup
  let profileChanged = false
  try {
    for (const [index, archiveStage] of archiveStages.entries()) {
      mkdirSync(archiveStage, { recursive: true })
      invokePnpm(['--filter', `${RUNTIME_PACKAGE}...`, 'build'], 300_000)
      invokePnpm([
        '--filter', RUNTIME_PACKAGE, 'pack', '--skip-manifest-obfuscation',
        '--pack-destination', archiveStage,
      ], 300_000)
      if (!existsSync(stagedArchives[index]) || !statSync(stagedArchives[index]).isFile()) {
        throw new Error('Runtime Bundle archive was not created')
      }
    }
    const archiveDigests = stagedArchives.map(sha256File)
    if (archiveDigests[0] !== archiveDigests[1]) {
      throw new Error('Runtime Bundle archive is not stable across consecutive builds')
    }
    archiveDigest = archiveDigests[0]
    profileChanged = !profileExists || installedArchiveDigest !== archiveDigest
    if (profileChanged) {
      const profilesRoot = dirname(paths.profileRoot)
      const id = `${process.pid}-${randomUUID()}`
      profileBackup = profileExists
        ? resolve(profilesRoot, `.tianwen-backup-${id}`)
        : undefined
      mkdirSync(profilesRoot, { recursive: true })
      if (profileBackup !== undefined) renameSync(paths.profileRoot, profileBackup)
      invokePnpm([
        '--config.inject-workspace-packages=true',
        '--filter', '@tianwen/profile-host',
        'deploy', '--prod', paths.profileRoot,
      ], 900_000)
      normalizeDeployedProfile(paths, paths.profileRoot)
      const deployedManifest = validateProfile(paths)
      resolveInstalledCli(deployedManifest, repoRoot)
    }

    const profileManifestPath = validateProfile(paths)
    const dump = runFixed(process.execPath, [dshBin, '--profile', PROFILE, '--dump-config'], {
      cwd: repoRoot,
      env,
      runner,
    })
    validateDump(dump.stdout, paths)
    const cliPath = resolveInstalledCli(profileManifestPath, repoRoot)
    const receipt = createInstallReceipt(paths, {
      archiveDigest,
      cliPath,
    })
    if (existsSync(paths.archivePath)) {
      archiveBackup = resolve(packsRoot, `.tianwen-backup-${process.pid}-${randomUUID()}.tgz`)
      renameSync(paths.archivePath, archiveBackup)
    }
    renameSync(stagedArchive, paths.archivePath)
    archivePublished = true
    const receiptStage = `${paths.receiptPath}.tmp-${process.pid}-${randomUUID()}`
    try {
      writeFileSync(receiptStage, canonicalJson(receipt), { encoding: 'utf8', flag: 'wx' })
      renameSync(receiptStage, paths.receiptPath)
    } finally {
      rmSync(receiptStage, { force: true })
    }
    if (profileBackup !== undefined) {
      try {
        rmSync(profileBackup, { force: true, recursive: true })
      } catch {
        // A stale backup is harmless after the Profile and receipt are committed.
      }
    }
    if (archiveBackup !== undefined) {
      try {
        rmSync(archiveBackup, { force: true })
      } catch {
        // A stale backup is harmless after the archive and receipt are committed.
      }
    }
    return receipt
  } catch (error) {
    if (archivePublished) rmSync(paths.archivePath, { force: true })
    if (archiveBackup !== undefined && existsSync(archiveBackup)) {
      renameSync(archiveBackup, paths.archivePath)
    }
    if (profileChanged) {
      rmSync(paths.profileRoot, { force: true, recursive: true })
      if (profileBackup !== undefined && existsSync(profileBackup)) {
        renameSync(profileBackup, paths.profileRoot)
      }
    }
    throw error
  } finally {
    for (const archiveStage of archiveStages) {
      rmSync(archiveStage, { force: true, recursive: true })
    }
  }
}

async function main() {
  try {
    const options = parseInstallerArgs(process.argv.slice(2))
    const receipt = installTianwen(options)
    process.stdout.write(options.json
      ? canonicalJson(receipt)
      : `Tianwen is ready. Add ${receipt.binDir} to PATH.\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Error: ${message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
