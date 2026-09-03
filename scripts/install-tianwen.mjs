import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
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

const DSH_VERSION = '0.1.1-rc.2'
const PREDECESSOR_DSH_VERSION = '0.1.0-rc.7'
const PNPM_VERSION = '11.20.0'
const PROFILE = 'tianwen'
const RUNTIME_PACKAGE = '@tianwen/runtime-bundle'
const INSTALLER_FAILURE_SCHEMA_VERSION = 'tianwen.install-failure.v1'
const INSTALLER_FAILURE_STAGE = Object.freeze({
  ARCHIVE_PUBLICATION: 'archive-publication',
  ARCHIVE_STABILITY: 'archive-stability',
  DSH_CONFIG_VALIDATION: 'dsh-config-validation',
  INSTALLER_INTERNAL: 'installer-internal',
  MANAGED_LAYOUT_PREFLIGHT: 'managed-layout-preflight',
  MANAGED_HOST_DEPLOY: 'managed-host-deploy',
  MANAGED_PROFILE_DEPLOY: 'managed-profile-deploy',
  MANAGED_PROFILE_VALIDATION: 'managed-profile-validation',
  PNPM_ENTRY_PREFLIGHT: 'pnpm-entry-preflight',
  PNPM_VERSION: 'pnpm-version',
  RECEIPT_PUBLICATION: 'receipt-publication',
  RUNTIME_BUNDLE_BUILD_1: 'runtime-bundle-build-1',
  RUNTIME_BUNDLE_BUILD_2: 'runtime-bundle-build-2',
  RUNTIME_BUNDLE_PACK_1: 'runtime-bundle-pack-1',
  RUNTIME_BUNDLE_PACK_2: 'runtime-bundle-pack-2',
  WORKSPACE_INSTALL: 'workspace-install',
})
const PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-headless',
  RUNTIME_PACKAGE,
]
const PROFILE_DEPENDENCIES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-headless',
  RUNTIME_PACKAGE,
]
const RUNTIME_BUILD_OUTPUTS = Object.freeze([
  'packages/tianwen-dsh-compat/dist',
  'packages/tianwen-evolution/dist',
  'packages/tianwen-evidence/dist',
  'packages/tianwen-runtime/dist',
  'packages/tianwen-runtime-bundle/dist',
])
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

class InstallStageError extends Error {
  constructor(stage, cause) {
    super(cause instanceof Error ? cause.message : '')
    this.stage = stage
  }
}

function installerFailureReceipt(stage) {
  return {
    schemaVersion: INSTALLER_FAILURE_SCHEMA_VERSION,
    status: 'failed',
    stage,
  }
}

function isJsonRequested(argv) {
  return argv.includes('--json') || argv.includes('--json=true')
}

function installerFailureStage(error) {
  return error instanceof InstallStageError
    ? error.stage
    : INSTALLER_FAILURE_STAGE.INSTALLER_INTERNAL
}

export function createInstallerFailureReceipt(error) {
  return installerFailureReceipt(installerFailureStage(error))
}

function atInstallStage(stage, operation) {
  try {
    return operation()
  } catch (error) {
    if (error instanceof InstallStageError) throw error
    throw new InstallStageError(stage, error)
  }
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
    archivePath: pathApi.join(dataDir, 'packs', 'tianwen-runtime-bundle-0.1.10.tgz'),
    binDir: pathApi.join(profileRoot, 'node_modules', '.bin'),
    dataDir,
    dshHome,
    evolutionRoot: pathApi.join(dataDir, 'state', 'evolution'),
    learningLoopRoot: pathApi.join(dataDir, 'state', 'learning-loop'),
    stateRoot: pathApi.join(dataDir, 'state'),
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
    stateRoot: '${portable(paths.stateRoot)}'
    sessionsRoot: '${portable(paths.sessionsRoot)}'
    learningLoop:
      enabled: true
      workspaceRoot: '${portable(paths.learningLoopRoot)}'

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

function renderPredecessorProfilePatch(paths) {
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

function renderLockedPredecessorProfilePatch(paths) {
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

function contained(root, candidate, label) {
  const child = relative(realpathSync(root), realpathSync(candidate))
  if (child.startsWith('..') || isAbsolute(child)) throw new Error(`${label} escapes its managed root`)
}

function inspectInstalledHost(hostRoot) {
  const packageRoot = resolve(hostRoot, 'node_modules', '@deepseek-ai', 'dsh')
  contained(hostRoot, packageRoot, 'DSH package')
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
  return JSON.stringify(Object.keys(profile.dependencies).sort()) === JSON.stringify(PROFILE_DEPENDENCIES)
    && profile.dependencies['@deepseek-ai/dsh-base'] === dshVersion
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
  if (profile.dependencies[RUNTIME_PACKAGE] !== '0.1.10') {
    throw new Error('managed Profile must use Tianwen Runtime 0.1.10')
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

function predecessorArchivePath(paths) {
  const currentBasename = 'tianwen-runtime-bundle-0.1.10.tgz'
  if (!paths.archivePath.endsWith(currentBasename)) {
    throw new Error('current Runtime archive path is invalid')
  }
  return `${paths.archivePath.slice(0, -currentBasename.length)}tianwen-runtime-bundle-0.0.0.tgz`
}

function runtimePredecessorArchivePath(paths) {
  const currentBasename = 'tianwen-runtime-bundle-0.1.10.tgz'
  if (!paths.archivePath.endsWith(currentBasename)) {
    throw new Error('current Runtime archive path is invalid')
  }
  return `${paths.archivePath.slice(0, -currentBasename.length)}tianwen-runtime-bundle-0.1.9.tgz`
}

function matchesPredecessorReceipt(paths, archivePath, dshVersion) {
  if (!existsSync(paths.receiptPath) || !statSync(paths.receiptPath).isFile()) return false
  try {
    const receipt = assertPlainObject(
      JSON.parse(readFileSync(paths.receiptPath, 'utf8')),
      'install receipt',
    )
    return receipt.schemaVersion === 'tianwen.install.v1'
      && receipt.status === 'ready'
      && receipt.dshVersion === dshVersion
      && receipt.pnpmVersion === PNPM_VERSION
      && receipt.dataDir === paths.dataDir
      && receipt.binDir === paths.binDir
      && receipt.cliPath === realpathSync(resolve(
        paths.profileRoot,
        'node_modules',
        '@tianwen',
        'runtime-bundle',
        'dist',
        'cli.js',
      ))
      && receipt.hostRoot === paths.hostRoot
      && receipt.profileRoot === paths.profileRoot
      && receipt.archivePath === archivePath
      && receipt.receiptPath === paths.receiptPath
      && JSON.stringify(receipt.profileBundles) === JSON.stringify(PROFILE_BUNDLES)
      && receipt.archiveDigest === sha256File(archivePath)
  } catch {
    return false
  }
}

export function classifyManagedInstallation(paths) {
  if (!existsSync(paths.dataDir)) return 'fresh'
  if (isFreshDataDirectory(paths)) return 'fresh'
  if (!existsSync(paths.hostRoot) || !existsSync(paths.profileRoot)) {
    return 'incompatible'
  }
  try {
    const host = inspectInstalledHost(paths.hostRoot)
    const profile = inspectProfile(paths)
    if (host.version === DSH_VERSION
      && existsSync(paths.archivePath)
      && statSync(paths.archivePath).isFile()
      && matchesProfile(profile, DSH_VERSION, '0.1.10', renderProfilePatch(paths))) {
      return 'current'
    }
    if (existsSync(paths.archivePath)) return 'incompatible'
    const archivePath = predecessorArchivePath(paths)
    const runtimeArchivePath = runtimePredecessorArchivePath(paths)
    if (host.version === DSH_VERSION) {
      return existsSync(runtimeArchivePath)
        && statSync(runtimeArchivePath).isFile()
        && matchesProfile(profile, DSH_VERSION, '0.1.9', renderProfilePatch(paths))
        && matchesPredecessorReceipt(paths, runtimeArchivePath, DSH_VERSION)
        ? 'managed-runtime-predecessor'
        : 'incompatible'
    }
    if (existsSync(runtimeArchivePath)
      || !existsSync(archivePath)
      || !statSync(archivePath).isFile()) return 'incompatible'
    const original = matchesProfile(
      profile,
      PREDECESSOR_DSH_VERSION,
      `file:${portable(archivePath)}`,
      renderPredecessorProfilePatch(paths),
    )
    const lockedDeploy = matchesProfile(
      profile,
      PREDECESSOR_DSH_VERSION,
      '0.0.0',
      renderLockedPredecessorProfilePatch(paths),
    )
    return host.version === PREDECESSOR_DSH_VERSION
      && (original || lockedDeploy)
      && matchesPredecessorReceipt(paths, archivePath, PREDECESSOR_DSH_VERSION)
      ? 'managed-predecessor'
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
    [RUNTIME_PACKAGE]: '0.1.10',
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
    ['tianwen-runtime', 'stateRoot', portable(paths.stateRoot)],
    ['tianwen-runtime', 'sessionsRoot', portable(paths.sessionsRoot)],
    ['tianwen-runtime', 'enabled', 'true'],
    ['tianwen-runtime', 'workspaceRoot', portable(paths.learningLoopRoot)],
    ['tianwen-web-bridge', 'name', '@tianwen/runtime-bundle'],
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

function sameFileIdentity(left, right) {
  const leftStat = statSync(left, { bigint: true })
  const rightStat = statSync(right, { bigint: true })
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino
}

function runtimePublishedPaths(repoRoot) {
  const runtimeRoot = resolve(repoRoot, 'packages', 'tianwen-runtime-bundle')
  const manifest = assertPlainObject(
    JSON.parse(readFileSync(resolve(runtimeRoot, 'package.json'), 'utf8')),
    'Runtime Bundle manifest',
  )
  if (!Array.isArray(manifest.files)
    || manifest.files.length === 0
    || manifest.files.some(path => typeof path !== 'string' || path === '')) {
    throw new Error('Runtime Bundle manifest must expose a non-empty files array')
  }
  if (new Set(manifest.files).size !== manifest.files.length) {
    throw new Error('Runtime Bundle manifest files must be unique')
  }
  for (const path of manifest.files) {
    const child = relative(runtimeRoot, resolve(runtimeRoot, path))
    if (child === '' || child.startsWith('..') || isAbsolute(child)) {
      throw new Error('Runtime Bundle manifest file escapes its package root')
    }
  }
  return [...manifest.files]
}

function hasSourceLinkedRuntimePublication(repoRoot, profileRoot) {
  const sourceRoot = resolve(repoRoot, 'packages', 'tianwen-runtime-bundle')
  const installedRoot = resolve(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
  let linked = false
  for (const path of runtimePublishedPaths(repoRoot)) {
    const source = resolve(sourceRoot, path)
    const installed = resolve(installedRoot, path)
    if (!existsSync(source) || !existsSync(installed)) continue
    if (!statSync(source).isFile() || !statSync(installed).isFile()) {
      throw new Error('Runtime Bundle publication entries must be regular files')
    }
    if (sameFileIdentity(source, installed)) linked = true
  }
  return linked
}

function isolateRuntimeBuildOutputs(repoRoot) {
  for (const path of RUNTIME_BUILD_OUTPUTS) {
    const output = resolve(repoRoot, path)
    const child = relative(repoRoot, output)
    if (child === '' || child.startsWith('..') || isAbsolute(child)) {
      throw new Error('Runtime build output escapes its repository root')
    }
    rmSync(output, { force: true, recursive: true })
  }
}

function materializeRuntimeBundlePublication(profileRoot, repoRoot) {
  const sourceRoot = resolve(repoRoot, 'packages', 'tianwen-runtime-bundle')
  const installedRoot = resolve(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
  const publishedPaths = runtimePublishedPaths(repoRoot)
  const installedManifest = assertPlainObject(
    JSON.parse(readFileSync(resolve(installedRoot, 'package.json'), 'utf8')),
    'installed Runtime Bundle manifest',
  )
  if (JSON.stringify(installedManifest.files) !== JSON.stringify(publishedPaths)) {
    throw new Error('installed Runtime Bundle files differ from the workspace manifest')
  }
  const candidatePublication = [...publishedPaths, 'package.json']
  const copyReplace = (source, installed) => {
    const stagedCopy = `${installed}.copy-${process.pid}-${randomUUID()}`
    try {
      copyFileSync(source, stagedCopy)
      rmSync(installed, { force: true })
      renameSync(stagedCopy, installed)
    } finally {
      rmSync(stagedCopy, { force: true })
    }
  }
  for (const path of candidatePublication) {
    const installed = resolve(installedRoot, path)
    const child = relative(installedRoot, installed)
    if (child === '' || child.startsWith('..') || isAbsolute(child)
      || !statSync(installed).isFile()) {
      throw new Error('installed Runtime Bundle publication must contain only regular files')
    }
    copyReplace(installed, installed)
  }
  const licenseSource = resolve(repoRoot, 'LICENSE')
  contained(repoRoot, licenseSource, 'Runtime Bundle LICENSE')
  if (!statSync(licenseSource).isFile()) {
    throw new Error('Runtime Bundle LICENSE must be a regular file')
  }
  const installedLicense = resolve(installedRoot, 'LICENSE')
  const licenseChild = relative(installedRoot, installedLicense)
  if (licenseChild === '' || licenseChild.startsWith('..') || isAbsolute(licenseChild)) {
    throw new Error('installed Runtime Bundle LICENSE escapes its package root')
  }
  copyReplace(licenseSource, installedLicense)
  const publication = [...candidatePublication, 'LICENSE']
  for (const path of publication) {
    const installed = resolve(installedRoot, path)
    const installedStat = statSync(installed, { bigint: true })
    if (!installedStat.isFile() || installedStat.nlink !== 1n) {
      throw new Error('installed Runtime Bundle publication must have independent file identity')
    }
    const source = path === 'LICENSE' ? licenseSource : resolve(sourceRoot, path)
    if (existsSync(source)) {
      if (!statSync(source).isFile() || sameFileIdentity(source, installed)) {
        throw new Error('installed Runtime Bundle publication must not share workspace file identity')
      }
    }
  }
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

function runFixed(executable, argv, { cwd, env, runner, timeout }) {
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
  const paths = atInstallStage(
    INSTALLER_FAILURE_STAGE.MANAGED_LAYOUT_PREFLIGHT,
    () => deriveInstallPaths(dataDir, platform),
  )
  const installation = atInstallStage(
    INSTALLER_FAILURE_STAGE.MANAGED_LAYOUT_PREFLIGHT,
    () => classifyManagedInstallation(paths),
  )
  atInstallStage(INSTALLER_FAILURE_STAGE.MANAGED_LAYOUT_PREFLIGHT, () => {
    if ((installation === 'managed-predecessor' || installation === 'managed-runtime-predecessor')
      && hasSourceLinkedRuntimePublication(repoRoot, paths.profileRoot)) {
      throw new Error('managed predecessor Runtime publication must not be source-linked')
    }
    if (installation === 'incompatible') {
      if (existsSync(paths.hostRoot) && existsSync(paths.profileRoot)) {
        validateInstalledHost(paths.hostRoot)
        validateProfile(paths)
      }
      throw new Error('existing data directory is not a complete managed Tianwen installation')
    }
    if (installation === 'fresh') ensureManagedDataDir(paths)
    else assertManagedDataDir(paths)
    mkdirSync(dirname(paths.receiptPath), { recursive: true })
  })

  const hostExists = existsSync(paths.hostRoot)
  const profileExists = existsSync(paths.profileRoot)
  const migratingDshPredecessor = installation === 'managed-predecessor'
  const migratingRuntimePredecessor = installation === 'managed-runtime-predecessor'
  const migratingPredecessor = migratingDshPredecessor || migratingRuntimePredecessor
  const hostNeedsDeploy = !hostExists || migratingDshPredecessor
  let installedArchiveDigest
  let dshBin
  const sourceLinkedProfile = atInstallStage(INSTALLER_FAILURE_STAGE.MANAGED_LAYOUT_PREFLIGHT, () => {
    installedArchiveDigest = previousArchiveDigest(paths)
    if (hostExists && !migratingDshPredecessor) dshBin = validateInstalledHost(paths.hostRoot)
    if (profileExists && !migratingPredecessor) validateProfile(paths)
    return profileExists
      && !migratingPredecessor
      && hasSourceLinkedRuntimePublication(repoRoot, paths.profileRoot)
  })

  const env = atInstallStage(
    INSTALLER_FAILURE_STAGE.PNPM_ENTRY_PREFLIGHT,
    () => childEnvironment(paths, source),
  )
  const packEnv = { ...env, UV_THREADPOOL_SIZE: '1' }
  const pnpm = atInstallStage(INSTALLER_FAILURE_STAGE.PNPM_ENTRY_PREFLIGHT, () => {
    const entry = pnpmEntry(source)
    if (!statSync(entry).isFile()) throw new Error(`exact pnpm entry is unavailable: ${entry}`)
    return entry
  })
  const invokePnpm = (args, timeout, childEnv = env) => runFixed(
    process.execPath,
    [pnpm, ...args],
    { cwd: repoRoot, env: childEnv, runner, timeout },
  )
  atInstallStage(INSTALLER_FAILURE_STAGE.PNPM_VERSION, () => {
    const actual = invokePnpm(['--version'], 120_000).stdout.trim()
    if (actual !== PNPM_VERSION) {
      throw new Error(`pnpm ${PNPM_VERSION} is required, got ${actual}`)
    }
  })

  atInstallStage(
    INSTALLER_FAILURE_STAGE.WORKSPACE_INSTALL,
    () => invokePnpm(['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--trust-lockfile'], 0),
  )
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
  let hostBackup
  try {
    if (hostNeedsDeploy) {
      atInstallStage(INSTALLER_FAILURE_STAGE.MANAGED_HOST_DEPLOY, () => {
        const hostsRoot = dirname(paths.hostRoot)
        const id = `${process.pid}-${randomUUID()}`
        hostBackup = migratingDshPredecessor ? resolve(hostsRoot, `.dsh-host-backup-${id}`) : undefined
        mkdirSync(hostsRoot, { recursive: true })
        if (hostBackup !== undefined) renameSync(paths.hostRoot, hostBackup)
        invokePnpm([
          '--config.inject-workspace-packages=true',
          '--filter', '@tianwen/dsh-host',
          'deploy', '--prod', paths.hostRoot,
        ], 0)
        dshBin = validateInstalledHost(paths.hostRoot)
      })
    }
    for (const [index, archiveStage] of archiveStages.entries()) {
      const buildStage = index === 0
        ? INSTALLER_FAILURE_STAGE.RUNTIME_BUNDLE_BUILD_1
        : INSTALLER_FAILURE_STAGE.RUNTIME_BUNDLE_BUILD_2
      const packStage = index === 0
        ? INSTALLER_FAILURE_STAGE.RUNTIME_BUNDLE_PACK_1
        : INSTALLER_FAILURE_STAGE.RUNTIME_BUNDLE_PACK_2
      atInstallStage(buildStage, () => {
        mkdirSync(archiveStage, { recursive: true })
        if (index === 0) isolateRuntimeBuildOutputs(repoRoot)
        invokePnpm(['--filter', `${RUNTIME_PACKAGE}...`, 'build'], 300_000)
      })
      atInstallStage(packStage, () => {
        invokePnpm([
          '--filter', RUNTIME_PACKAGE, 'pack', '--skip-manifest-obfuscation',
          '--pack-destination', archiveStage,
        ], 300_000, packEnv)
        if (!existsSync(stagedArchives[index]) || !statSync(stagedArchives[index]).isFile()) {
          throw new Error('Runtime Bundle archive was not created')
        }
      })
    }
    archiveDigest = atInstallStage(INSTALLER_FAILURE_STAGE.ARCHIVE_STABILITY, () => {
      const archiveDigests = stagedArchives.map(sha256File)
      if (archiveDigests[0] !== archiveDigests[1]) {
        throw new Error('Runtime Bundle archive is not stable across consecutive builds')
      }
      return archiveDigests[0]
    })
    profileChanged = migratingPredecessor
      || !profileExists
      || installedArchiveDigest !== archiveDigest
      || sourceLinkedProfile
    if (profileChanged) {
      atInstallStage(INSTALLER_FAILURE_STAGE.MANAGED_PROFILE_DEPLOY, () => {
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
        ], 0)
        materializeRuntimeBundlePublication(paths.profileRoot, repoRoot)
        normalizeDeployedProfile(paths, paths.profileRoot)
      })
      atInstallStage(INSTALLER_FAILURE_STAGE.MANAGED_PROFILE_VALIDATION, () => {
        const deployedManifest = validateProfile(paths)
        resolveInstalledCli(deployedManifest, repoRoot)
      })
    }

    const profileManifestPath = atInstallStage(
      INSTALLER_FAILURE_STAGE.MANAGED_PROFILE_VALIDATION,
      () => validateProfile(paths),
    )
    const dump = atInstallStage(INSTALLER_FAILURE_STAGE.DSH_CONFIG_VALIDATION, () => runFixed(
      process.execPath,
      [dshBin, '--profile', PROFILE, '--dump-config'],
      { cwd: repoRoot, env, runner, timeout: 0 },
    ))
    atInstallStage(INSTALLER_FAILURE_STAGE.DSH_CONFIG_VALIDATION, () => validateDump(dump.stdout, paths))
    const cliPath = atInstallStage(
      INSTALLER_FAILURE_STAGE.MANAGED_PROFILE_VALIDATION,
      () => resolveInstalledCli(profileManifestPath, repoRoot),
    )
    const receipt = atInstallStage(INSTALLER_FAILURE_STAGE.ARCHIVE_PUBLICATION, () => {
      const nextReceipt = createInstallReceipt(paths, {
        archiveDigest,
        cliPath,
      })
      if (existsSync(paths.archivePath)) {
        archiveBackup = resolve(packsRoot, `.tianwen-backup-${process.pid}-${randomUUID()}.tgz`)
        renameSync(paths.archivePath, archiveBackup)
      }
      renameSync(stagedArchive, paths.archivePath)
      archivePublished = true
      return nextReceipt
    })
    atInstallStage(INSTALLER_FAILURE_STAGE.RECEIPT_PUBLICATION, () => {
      const receiptStage = `${paths.receiptPath}.tmp-${process.pid}-${randomUUID()}`
      try {
        writeFileSync(receiptStage, canonicalJson(receipt), { encoding: 'utf8', flag: 'wx' })
        renameSync(receiptStage, paths.receiptPath)
      } finally {
        rmSync(receiptStage, { force: true })
      }
    })
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
    if (hostBackup !== undefined) {
      try {
        rmSync(hostBackup, { force: true, recursive: true })
      } catch {
        // A stale backup is harmless after the host and receipt are committed.
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
    if (hostNeedsDeploy) {
      rmSync(paths.hostRoot, { force: true, recursive: true })
      if (hostBackup !== undefined && existsSync(hostBackup)) {
        renameSync(hostBackup, paths.hostRoot)
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
  const argv = process.argv.slice(2)
  const json = isJsonRequested(argv)
  try {
    let options
    try {
      options = parseInstallerArgs(argv)
    } catch {
      throw new InstallStageError(INSTALLER_FAILURE_STAGE.MANAGED_LAYOUT_PREFLIGHT)
    }
    const receipt = installTianwen(options)
    process.stdout.write(options.json
      ? canonicalJson(receipt)
      : `Tianwen is ready. Add ${receipt.binDir} to PATH.\n`)
  } catch (error) {
    const receipt = createInstallerFailureReceipt(error)
    if (json) process.stdout.write(canonicalJson(receipt))
    else process.stderr.write(`Tianwen installer failed at ${receipt.stage}.\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
