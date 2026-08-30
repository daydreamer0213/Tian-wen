import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '..')
const requestedProfileName = process.env.TIANWEN_DSH_PROFILE
if (requestedProfileName !== undefined && requestedProfileName !== 'web') {
  throw new Error('TIANWEN_DSH_PROFILE must be exactly web when set')
}
const profileName = requestedProfileName ?? 'tianwen-probe'
const basePackage = '@deepseek-ai/dsh-base'
const webAppPackage = '@deepseek-ai/dsh-web-app'
const bundlePackage = '@tianwen/dsh-probe-bundle'
const bundleAdapterPackage = `${bundlePackage}/adapter`
const defaultModelPackage = '@deepseek-ai/dsh-agent-default-model'
const expectedDshVersion = '0.1.1-rc.2'
const tarballBasename = 'tianwen-dsh-probe-bundle-0.0.0.tgz'
const runtimeBundlePackage = '@tianwen/runtime-bundle'
const runtimeSpecifier = `${runtimeBundlePackage}/runtime`
const runtimeTarballBasename = 'tianwen-runtime-bundle-0.1.4.tgz'
const runtimeClientInject = [
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-locale',
]
const migrationMode = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'
const productModeValue = process.env.TIANWEN_LEARN_LOOP_PRODUCT_MODE
if (productModeValue !== undefined && productModeValue !== '1') {
  throw new Error('TIANWEN_LEARN_LOOP_PRODUCT_MODE must be exactly 1 when set')
}
const productMode = productModeValue === '1'
if (productMode && (!migrationMode || profileName !== 'web')) {
  throw new Error('Learn Loop product mode requires the Web migration Profile')
}
const windowsDataRoot = 'D:\\DevData'

function isWithin(base, candidate) {
  const child = relative(base, candidate)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function requireProbeRoot() {
  const value = process.env.TIANWEN_DSH_PROBE_ROOT
  if (value === undefined || value.trim() === '') {
    throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
  }

  const candidate = resolve(value)
  if (process.platform === 'win32') {
    const parent = resolve(windowsDataRoot)
    if (samePath(process.platform, candidate, parent) || !isWithin(parent, candidate)) {
      throw new Error(`TIANWEN_DSH_PROBE_ROOT must be a child of ${windowsDataRoot}`)
    }
    mkdirSync(parent, { recursive: true })
    mkdirSync(candidate, { recursive: true })
    const realParent = realpathSync(parent)
    const realCandidate = realpathSync(candidate)
    if (
      samePath(process.platform, realCandidate, realParent)
      || !isWithin(realParent, realCandidate)
    ) {
      throw new Error(`TIANWEN_DSH_PROBE_ROOT real path must be a child of ${windowsDataRoot}`)
    }
    return realCandidate
  }

  mkdirSync(candidate, { recursive: true })
  return realpathSync(candidate)
}

function childPath(probeRoot, ...parts) {
  const candidate = resolve(probeRoot, ...parts)
  if (!isWithin(probeRoot, candidate)) {
    throw new Error(`probe path escapes its root: ${candidate}`)
  }
  return candidate
}

function scalar(value) {
  if (
    (value.startsWith("'") && value.endsWith("'"))
    || (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function samePath(platform, left, right) {
  const resolvedLeft = resolve(left)
  const resolvedRight = resolve(right)
  return platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight
}

export function validateFixedInstallBoundary(values) {
  const fixedTarballBasename = values.tarballBasename ?? tarballBasename
  const expectedTarball = resolve(
    values.probeRoot,
    'packs',
    fixedTarballBasename,
  )
  requireAssertion(
    values.profileName === profileName,
    `profile must be exactly ${profileName}`,
  )
  requireAssertion(
    samePath(values.platform, values.probeRoot, values.realProbeRoot),
    'probe root and real path must match',
  )
  requireAssertion(
    basename(values.tarballPath) === fixedTarballBasename
    && samePath(values.platform, values.tarballPath, expectedTarball)
    && samePath(values.platform, values.realTarballPath, expectedTarball),
    `tarball path and real path must equal ${expectedTarball}`,
  )
  requireAssertion(
    values.producedByCurrentRun === true,
    'tarball must be produced by the current verifier run',
  )
  const expectedUpstreamArgs = [
    ...(values.profileName === 'web' ? ['--allow-build=koffi'] : []),
    'add',
    '--offline',
    values.tarballPath,
  ]
  requireAssertion(
    JSON.stringify(values.upstreamArgs) === JSON.stringify(expectedUpstreamArgs),
    'upstream DSH plugin argv must be the fixed offline add command',
  )
  const shellMetacharacter = /[\s&|<>^()%!"'`;,\r\n]/u
  for (const value of [
    values.profileName,
    values.probeRoot,
    values.tarballPath,
    ...values.upstreamArgs,
  ]) {
    requireAssertion(
      !shellMetacharacter.test(value),
      `fixed install value contains a shell metacharacter: ${value}`,
    )
  }
  return {
    tianwenOuterShell: false,
    upstreamDshWindowsPluginInstallShell: values.platform === 'win32',
    scope: 'fixed-offline-profile-install-only',
    userOrModelControlledArguments: false,
  }
}

export function parseAuthoredPatch(source) {
  const lines = source
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter(line => line !== '')
  requireAssertion(lines.length === 15, 'Bundle patch must contain exactly three operations')

  const modelId = /^- id: ([a-z0-9-]+)$/u.exec(lines[0] ?? '')?.[1]
  const provider = /^ {4}provider: ([a-z0-9-]+)$/u.exec(lines[2] ?? '')?.[1]
  const model = /^ {4}model: ([a-z0-9-]+)$/u.exec(lines[3] ?? '')?.[1]
  const adapterId = /^ {4}- id: ([a-z0-9-]+)$/u.exec(lines[5] ?? '')?.[1]
  const adapterName = /^ {6}name: (.+)$/u.exec(lines[6] ?? '')?.[1]
  const compositionId = /^ {4}- id: ([a-z0-9-]+)$/u.exec(lines[7] ?? '')?.[1]
  const compositionName = /^ {6}name: (.+)$/u.exec(lines[8] ?? '')?.[1]
  const expectedCompositionLines = [
    "      disabled: !!js process.env.TIANWEN_COMPOSITION_PROBE_RECEIPT === undefined || process.env.TIANWEN_COMPOSITION_PROBE_RECEIPT === '' || process.env.TIANWEN_COMPOSITION_PROBE_STOP === undefined || process.env.TIANWEN_COMPOSITION_PROBE_STOP === '' || (process.env.TIANWEN_COMPOSITION_PROBE_SURFACE !== 'headless' && process.env.TIANWEN_COMPOSITION_PROBE_SURFACE !== 'web')",
    '      config:',
    '        receiptPath: !!js process.env.TIANWEN_COMPOSITION_PROBE_RECEIPT',
    '        stopPath: !!js process.env.TIANWEN_COMPOSITION_PROBE_STOP',
    '        surface: !!js process.env.TIANWEN_COMPOSITION_PROBE_SURFACE',
    "        exitAfterReceipt: !!js process.env.TIANWEN_COMPOSITION_PROBE_EXIT_AFTER_RECEIPT === 'true'",
  ]
  requireAssertion(
    modelId === 'agent-default-model'
    && lines[1] === '  config:'
    && provider === 'tianwen-probe'
    && model === 'scripted'
    && lines[4] === '- insert:'
    && adapterId === 'tianwen-probe-adapter'
    && adapterName !== undefined
    && scalar(adapterName) === bundleAdapterPackage,
    'Bundle patch differs from the authorized model and adapter operations',
  )
  requireAssertion(
    compositionId === 'tianwen-composition-probe'
    && compositionName !== undefined
    && scalar(compositionName) === '@tianwen/dsh-probe-bundle/composition'
    && JSON.stringify(lines.slice(9)) === JSON.stringify(expectedCompositionLines),
    'Bundle patch differs from the authorized disabled composition probe operation',
  )
  return {
    defaultModel: { provider, model },
    insertedAdapter: {
      id: adapterId,
      name: scalar(adapterName),
    },
    insertedCompositionProbe: {
      id: compositionId,
      name: scalar(compositionName),
      disabledByDefault: true,
    },
  }
}

export function parseRuntimePatch(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n').filter(line => line !== '')
  requireAssertion(
    JSON.stringify(lines) === JSON.stringify([
      '- insert:', '    - id: tianwen-runtime',
      "      name: '@tianwen/runtime-bundle/runtime'",
      '    - id: tianwen-web-bridge',
      "      name: '@tianwen/runtime-bundle'",
    ]),
    'Runtime patch differs from the two authorized operations',
  )
  return {
    insertedRuntime: { id: 'tianwen-runtime', name: runtimeSpecifier },
    insertedWebBridge: { id: 'tianwen-web-bridge', name: runtimeBundlePackage },
  }
}

function dumpedRows(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- id: ([a-z0-9-]+)$/u.exec(lines[index] ?? '')
    if (match !== null) {
      starts.push({ id: match[1], index })
    }
  }
  return starts.map((start, index) => ({
    id: start.id,
    lines: lines.slice(
      start.index,
      starts[index + 1]?.index ?? lines.length,
    ),
  }))
}

function dumpedRow(source, id) {
  const matches = dumpedRows(source).filter(row => row.id === id)
  requireAssertion(matches.length === 1, `dump must contain exactly one ${id} row`)
  return matches[0]
}

function rowValue(row, pattern, label) {
  const matches = row.lines
    .map(line => pattern.exec(line)?.[1])
    .filter(value => value !== undefined)
  requireAssertion(matches.length === 1, `${row.id} must contain exactly one ${label}`)
  return scalar(matches[0])
}

export function parseDumpedDefaultModel(source) {
  const row = dumpedRow(source, 'agent-default-model')
  const configIndex = row.lines.indexOf('  config:')
  requireAssertion(configIndex >= 0, 'agent-default-model must contain config')
  const provider = rowValue(
    { ...row, lines: row.lines.slice(configIndex + 1) },
    /^ {4}provider: (.+)$/u,
    'provider',
  )
  const model = rowValue(
    { ...row, lines: row.lines.slice(configIndex + 1) },
    /^ {4}model: (.+)$/u,
    'model',
  )
  const name = rowValue(row, /^ {2}name: (.+)$/u, 'name')
  requireAssertion(
    name === defaultModelPackage
    && provider === 'tianwen-probe'
    && model === 'scripted',
    'agent-default-model does not contain the scripted Tianwen route',
  )
  return { id: row.id, name, provider, model }
}

function parseDumpedAdapter(source) {
  const row = dumpedRow(source, 'tianwen-probe-adapter')
  const name = rowValue(row, /^ {2}name: (.+)$/u, 'name')
  requireAssertion(
    name === bundleAdapterPackage,
    'dumped Tianwen adapter uses the wrong public package export',
  )
  return { id: row.id, name }
}

export async function resolveAndImportBundleExports(packageManifestPath) {
  const anchor = realpathSync(packageManifestPath)
  const requireFromAnchor = createRequire(anchor)
  const rootResolved = requireFromAnchor.resolve(bundlePackage)
  const adapterResolved = requireFromAnchor.resolve(bundleAdapterPackage)
  const rootModule = await import(pathToFileURL(rootResolved).href)
  const adapterModule = await import(pathToFileURL(adapterResolved).href)
  requireAssertion(
    rootModule.name === 'tianwen-probe'
    && typeof rootModule.apply === 'function',
    'public Bundle root export has the wrong identity',
  )
  requireAssertion(
    adapterModule.name === 'tianwen-probe-adapter'
    && JSON.stringify(adapterModule.inject) === JSON.stringify(['llm'])
    && typeof adapterModule.apply === 'function',
    'public Bundle adapter export has the wrong Cordis plugin fields',
  )
  return {
    rootSpecifier: bundlePackage,
    rootResolved,
    rootIdentity: rootModule.name,
    rootApply: typeof rootModule.apply,
    adapterSpecifier: bundleAdapterPackage,
    adapterResolved,
    adapterName: adapterModule.name,
    adapterInject: adapterModule.inject,
    adapterApply: typeof adapterModule.apply,
  }
}

export async function resolveAndImportRuntimeBundle(profileManifestPath) {
  const requireFromProfile = createRequire(realpathSync(profileManifestPath))
  const runtimeResolved = requireFromProfile.resolve(runtimeSpecifier)
  const runtimeRoot = realpathSync(resolve(dirname(runtimeResolved), '..'))
  const runtimeManifestPath = resolve(runtimeRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'))
  const authoredManifest = JSON.parse(readFileSync(
    resolve(repoRoot, 'packages/tianwen-runtime-bundle/package.json'),
    'utf8',
  ))
  const requiredPeers = Object.fromEntries(Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => manifest.peerDependenciesMeta?.[name]?.optional !== true))
  const authoredRequiredPeers = Object.fromEntries(Object.entries(authoredManifest.peerDependencies ?? {})
    .filter(([name]) => authoredManifest.peerDependenciesMeta?.[name]?.optional !== true))
  requireAssertion(
    JSON.stringify(requiredPeers) === JSON.stringify(authoredRequiredPeers)
    && requiredPeers['@deepseek-ai/cordis'] === '4.0.1'
    && Object.entries(requiredPeers).every(([name, version]) => (
      name === '@deepseek-ai/cordis' || version === expectedDshVersion
    )),
    'Runtime Bundle external manifest differs from the build contract',
  )
  const requireFromRuntime = createRequire(runtimeManifestPath)
  const cordisResolved = requireFromRuntime.resolve('@deepseek-ai/cordis')
  await import(pathToFileURL(cordisResolved).href)
  const module = await import(pathToFileURL(runtimeResolved).href)
  requireAssertion(module.name === 'tianwen-runtime', 'wrong Runtime identity')
  requireAssertion(module.SUPPORTED_DSH_VERSION === '0.1.1-rc.2', 'wrong DSH version')
  requireAssertion(JSON.stringify(module.inject) === JSON.stringify([]), 'wrong inject')
  requireAssertion(typeof module.apply === 'function', 'Runtime apply is unavailable')
  return { specifier: runtimeSpecifier, resolved: runtimeResolved, name: 'tianwen-runtime', inject: module.inject, supportedDshVersion: module.SUPPORTED_DSH_VERSION, externalSpecifiers: Object.keys(requiredPeers).sort(), externalResolved: { '@deepseek-ai/cordis': cordisResolved } }
}

function pnpmCommand(args) {
  if (process.platform !== 'win32') {
    return { executable: 'pnpm', args }
  }
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  )
  const version = manifest.packageManager.split('@').at(-1)
  const corepackHome = process.env.COREPACK_HOME
    ?? 'D:\\DevData\\corepack-home'
  const executable = resolve(
    corepackHome,
    'v1',
    'pnpm',
    version,
    'bin',
    'pnpm.mjs',
  )
  if (!existsSync(executable)) {
    throw new Error(`exact pnpm executable is unavailable: ${executable}`)
  }
  return {
    executable: process.execPath,
    args: [executable, ...args],
  }
}

function prepareChildCorepack(probeRoot) {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  )
  const version = manifest.packageManager.split('@').at(-1)
  const sourceHome = process.env.COREPACK_HOME
    ?? (process.platform === 'win32'
      ? 'D:\\DevData\\corepack-home'
      : childPath(probeRoot, 'shared-corepack-home'))
  const source = resolve(sourceHome, 'v1', 'pnpm', version)
  const corepackHome = childPath(probeRoot, 'corepack-home')
  const target = childPath(corepackHome, 'v1', 'pnpm', version)
  if (!existsSync(source)) {
    throw new Error(`exact pnpm runtime is unavailable: ${source}`)
  }
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }
  const metadata = JSON.parse(readFileSync(resolve(target, '.corepack'), 'utf8'))
  if (
    metadata.locator?.name !== 'pnpm'
    || metadata.locator?.reference !== version
  ) {
    throw new Error(`copied Corepack runtime is not pnpm ${version}`)
  }
  writeFileSync(
    childPath(corepackHome, 'lastKnownGood.json'),
    `${JSON.stringify({
      pnpm: `${version}+${metadata.hash}`,
    }, null, 2)}\n`,
    'utf8',
  )
  return corepackHome
}

function runtimeEnvironment(
  probeRoot,
  dshHome,
  virtualStore,
  offline,
  corepackHome,
) {
  const temp = childPath(probeRoot, 'temp')
  const pnpmHome = childPath(probeRoot, 'pnpm-home')
  const store = childPath(probeRoot, 'pnpm-store')
  const pnpmCache = childPath(probeRoot, 'pnpm-cache')
  const npmCache = childPath(probeRoot, 'npm-cache')
  const appData = childPath(probeRoot, 'app-data')
  const localAppData = childPath(probeRoot, 'local-app-data')
  const disposableUserProfile = childPath(probeRoot, 'user-profile')

  for (const path of [
    temp,
    pnpmHome,
    corepackHome,
    store,
    pnpmCache,
    npmCache,
    appData,
    localAppData,
    disposableUserProfile,
    virtualStore,
    dshHome,
  ]) {
    mkdirSync(path, { recursive: true })
  }

  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  const pathEntries = [
    dirname(process.execPath),
    pnpmHome,
    systemRoot === undefined ? undefined : resolve(systemRoot, 'System32'),
  ].filter(Boolean)
  const env = {
    APPDATA: appData,
    CI: 'true',
    COREPACK_HOME: corepackHome,
    COREPACK_DEFAULT_TO_LATEST: '0',
    COREPACK_ENABLE_NETWORK: '0',
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    LOCALAPPDATA: localAppData,
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_CACHE: npmCache,
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    PATH: pathEntries.join(delimiter),
    PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
    PNPM_CONFIG_CACHE_DIR: pnpmCache,
    PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0',
    PNPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com/',
    PNPM_CONFIG_STORE_DIR: store,
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PNPM_CONFIG_VIRTUAL_STORE_DIR: virtualStore,
    PNPM_HOME: pnpmHome,
    PNPM_STORE_DIR: store,
    TEMP: temp,
    TMP: temp,
    TIANWEN_DSH_PROBE_ROOT: probeRoot,
    USERPROFILE: disposableUserProfile,
  }
  if (offline) {
    env.NPM_CONFIG_OFFLINE = 'true'
    env.PNPM_CONFIG_OFFLINE = 'true'
  }
  for (const key of ['ComSpec', 'PATHEXT', 'SystemRoot', 'WINDIR']) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]
    }
  }
  return env
}

function runPnpm(label, args, env, commands) {
  const command = pnpmCommand(args)
  const result = spawnSync(
    command.executable,
    command.args,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    },
  )
  const exitCode = result.status ?? 1
  commands.push({
    label,
    argv: [command.executable, ...command.args],
    exitCode,
    shell: false,
  })
  if (result.error !== undefined) {
    throw result.error
  }
  if (exitCode !== 0) {
    throw new Error(
      `${label} failed with exit code ${exitCode}\n`
      + `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function requireAssertion(value, message) {
  if (!value) {
    throw new Error(message)
  }
}

export function assertNoRuntimeForbiddenReferences(sources) {
  const forbidden = /dsh-probe-bundle|[\\/]adapter|@deepseek-ai[\\/]dsh[\\/]src/u
  requireAssertion(sources.every(source => !forbidden.test(source.toString('utf8'))), 'Runtime Bundle contains forbidden probe or private references')
}

function tarballFiles(path) {
  const candidate = process.platform === 'win32'
    ? resolve(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe')
    : (existsSync('/usr/bin/tar') ? '/usr/bin/tar' : '/bin/tar')
  const executable = realpathSync(candidate)
  requireAssertion(statSync(executable).isFile(), 'fixed tar executable is not a file')
  const argv = ['-tzf', path]
  const result = spawnSync(executable, argv, { encoding: 'utf8', shell: false })
  requireAssertion(result.status === 0, 'Runtime tarball cannot be listed')
  return { executable, argv, files: result.stdout.replaceAll('\r\n', '\n').split('\n').filter(Boolean).map(name => name.replace(/^package\//u, '')).sort() }
}

function pinWebProfileKoffi(profileRoot) {
  const workspacePath = resolve(profileRoot, 'pnpm-workspace.yaml')
  const before = readFileSync(workspacePath, 'utf8').replaceAll('\r\n', '\n')
  const nodeLinker = /^nodeLinker: .+$/mu.exec(before)?.[0]
  const allowBuilds = /^allowBuilds:\n(?:  .+\n)*/mu.exec(before)?.[0]
  let after
  if (/^overrides:/mu.test(before)) {
    after = /^  koffi: .+$/mu.test(before)
      ? before.replace(/^  koffi: .+$/mu, '  koffi: 3.1.4')
      : before.replace(/^overrides:\n/mu, 'overrides:\n  koffi: 3.1.4\n')
  } else {
    const insertion = 'overrides:\n  koffi: 3.1.4\n'
    after = /^allowBuilds:/mu.test(before)
      ? before.replace(/^allowBuilds:/mu, `${insertion}allowBuilds:`)
      : `${before.trimEnd()}\n${insertion}`
  }
  requireAssertion(nodeLinker !== undefined && after.includes(nodeLinker), 'Web Profile nodeLinker policy changed')
  requireAssertion(allowBuilds === undefined || after.includes(allowBuilds), 'Web Profile allowBuilds policy changed')
  requireAssertion((after.match(/^  koffi: 3\.1\.4$/gmu) ?? []).length === 1, 'Web Profile Koffi override is not exact')
  writeFileSync(workspacePath, after, 'utf8')
  return { package: 'koffi', version: '3.1.4', workspacePath }
}

async function main() {
  const reportBasename = migrationMode
    ? 'migration-profile-report.json'
    : 'profile-report.json'
  const probeRoot = requireProbeRoot()
  const reportPath = childPath(probeRoot, reportBasename)
  rmSync(reportPath, { force: true })
  const packsRoot = childPath(probeRoot, 'packs')
  const dshHome = childPath(probeRoot, 'home')
  const workspaceVirtualStore = childPath(probeRoot, 'workspace-virtual-store')
  const profileVirtualStore = childPath(probeRoot, 'profile-virtual-store')
  const childCorepackHome = prepareChildCorepack(probeRoot)
  const childCorepackState = JSON.parse(readFileSync(
    childPath(childCorepackHome, 'lastKnownGood.json'),
    'utf8',
  ))
  const tarball = childPath(
    packsRoot,
    tarballBasename,
  )
  const runtimeTarball = childPath(packsRoot, runtimeTarballBasename)
  const profileRoot = childPath(dshHome, 'profiles', profileName)
  const commands = []

  requireAssertion(
    process.platform !== 'win32'
      || isWithin(probeRoot, resolve(workspaceVirtualStore)),
    'workspace virtual store must stay under the selected probe root',
  )
  requireAssertion(
    childCorepackState.pnpm?.startsWith('11.20.0+sha512.') === true,
    'profile Corepack must stay pinned to pnpm 11.20.0',
  )

  rmSync(dshHome, { recursive: true, force: true })
  rmSync(packsRoot, { recursive: true, force: true })
  mkdirSync(packsRoot, { recursive: true })
  const dshInstallAnchor = realpathSync(resolve(
    repoRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'package.json',
  ))
  const requireFromDshInstall = createRequire(dshInstallAnchor)
  const appBootEntry = requireFromDshInstall.resolve('@deepseek-ai/dsh-app-boot')
  const appBoot = await import(pathToFileURL(appBootEntry).href)
  let webKoffiPolicy
  if (profileName === 'web') {
    appBoot.initProfile(profileRoot, appBoot.PROFILE_TEMPLATES.web)
    webKoffiPolicy = pinWebProfileKoffi(profileRoot)
  }
  const workspaceEnv = runtimeEnvironment(
    probeRoot,
    dshHome,
    workspaceVirtualStore,
    true,
    childCorepackHome,
  )
  const profileEnv = runtimeEnvironment(
    probeRoot,
    dshHome,
    profileVirtualStore,
    true,
    childCorepackHome,
  )
  if (profileName === 'web') profileEnv.PNPM_CONFIG_IGNORE_SCRIPTS = 'false'
  let producedByCurrentRun = false
  let upstreamArgs
  let installBoundary
  if (!productMode) {
    runPnpm(
      'build-bundle',
      ['--filter', bundlePackage, 'build'],
      workspaceEnv,
      commands,
    )
  }
  if (migrationMode) {
    runPnpm('build-runtime-bundle', ['--filter', `${runtimeBundlePackage}...`, 'build'], workspaceEnv, commands)
    runPnpm('pack-runtime-bundle', ['--filter', runtimeBundlePackage, 'pack', '--pack-destination', packsRoot], workspaceEnv, commands)
    requireAssertion(existsSync(runtimeTarball), `runtime tarball is missing: ${runtimeTarball}`)
  }
  if (!productMode) {
    const tarballExistedBeforePack = existsSync(tarball)
    runPnpm(
      'pack-bundle',
      [
        '--filter',
        bundlePackage,
        'pack',
        '--pack-destination',
        packsRoot,
      ],
      workspaceEnv,
      commands,
    )
    requireAssertion(existsSync(tarball), `tarball is missing: ${tarball}`)
    requireAssertion(statSync(tarball).isFile(), `tarball is not a file: ${tarball}`)
    const realTarball = realpathSync(tarball)
    producedByCurrentRun = !tarballExistedBeforePack
    upstreamArgs = [
      ...(profileName === 'web' ? ['--allow-build=koffi'] : []),
      'add',
      '--offline',
      tarball,
    ]
    installBoundary = validateFixedInstallBoundary({
      platform: process.platform,
      probeRoot,
      realProbeRoot: realpathSync(probeRoot),
      profileName,
      tarballPath: tarball,
      realTarballPath: realTarball,
      producedByCurrentRun,
      upstreamArgs,
    })
    runPnpm(
      'plugin-add',
      [
        'exec',
        'dsh',
        'plugin',
        '--profile',
        profileName,
        ...upstreamArgs,
      ],
      profileEnv,
      commands,
    )
  }
  if (migrationMode) {
    const runtimeArgs = [
      ...(profileName === 'web' ? ['--allow-build=koffi'] : []),
      'add',
      '--offline',
      runtimeTarball,
    ]
    const runtimeInstallBoundary = validateFixedInstallBoundary({ platform: process.platform, probeRoot, realProbeRoot: realpathSync(probeRoot), profileName, tarballBasename: runtimeTarballBasename, tarballPath: runtimeTarball, realTarballPath: realpathSync(runtimeTarball), producedByCurrentRun: true, upstreamArgs: runtimeArgs })
    runPnpm('plugin-add-runtime', ['exec', 'dsh', 'plugin', '--profile', profileName, ...runtimeArgs], profileEnv, commands)
    if (productMode) {
      producedByCurrentRun = true
      upstreamArgs = runtimeArgs
      installBoundary = runtimeInstallBoundary
    }
  }
  requireAssertion(upstreamArgs !== undefined && installBoundary !== undefined, 'install boundary was not recorded')
  const dump = runPnpm(
    'dump-config',
    ['exec', 'dsh', '--profile', profileName, '--dump-config'],
    profileEnv,
    commands,
  ).stdout

  const profileManifestPath = childPath(profileRoot, 'package.json')
  requireAssertion(
    existsSync(profileManifestPath),
    `profile manifest is missing: ${profileManifestPath}`,
  )
  const profileManifest = JSON.parse(
    readFileSync(profileManifestPath, 'utf8'),
  )
  const profilesModuleFallback = childPath(dshHome, 'profiles', 'node_modules')
  requireAssertion(
    !existsSync(profilesModuleFallback),
    'dump-config must not materialize the Profile module fallback',
  )
  appBoot.healProfilesModuleFallback(dshInstallAnchor, dshHome)
  const requireFromProfile = createRequire(profileManifestPath)
  for (const packageName of profileManifest.dsh?.profile?.bundles ?? []) {
    if (packageName !== basePackage && packageName !== webAppPackage) continue
    appBoot.healProfilesModuleFallback(realpathSync(
      requireFromProfile.resolve(`${packageName}/package.json`),
    ), dshHome)
  }
  requireAssertion(
    existsSync(profilesModuleFallback),
    'Profile module fallback was not prepared for executable import checks',
  )

  const publicExportEvidence = productMode
    ? undefined
    : await resolveAndImportBundleExports(profileManifestPath)
  const runtimeBundle = migrationMode ? await resolveAndImportRuntimeBundle(profileManifestPath) : undefined
  const bundleNames = profileManifest.dsh?.profile?.bundles ?? []
  const baseIndex = bundleNames.indexOf(basePackage)
  const bundleIndex = bundleNames.indexOf(bundlePackage)
  if (migrationMode) {
    const expectedBundleNames = productMode
      ? [basePackage, webAppPackage, runtimeBundlePackage]
      : profileName === 'web'
      ? [basePackage, webAppPackage, bundlePackage, runtimeBundlePackage]
      : [basePackage, bundlePackage, runtimeBundlePackage]
    requireAssertion(JSON.stringify(bundleNames) === JSON.stringify(expectedBundleNames), 'Profile bundle order is wrong')
    const runtimeRoot = childPath(profileRoot, 'node_modules', '@tianwen', 'runtime-bundle')
    const runtimeFiles = []
    const collect = (path, prefix = '') => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        if (entry.isDirectory()) collect(resolve(path, entry.name), name)
        else runtimeFiles.push(name)
      }
    }
    collect(runtimeRoot)
    runtimeFiles.sort()
    const allowedRuntimeFiles = [
      'LICENSE',
      'controlled-lifecycle.patch.yml',
      'cordis.patch.yml',
      'create.patch.yml',
      'dist/cli.js',
      'dist/client.js',
      'dist/controlled-lifecycle-runner.js',
      'dist/create-runner.js',
      'dist/goal-first-runner.js',
      'dist/index.d.ts',
      'dist/index.js',
      'dist/model-runner.js',
      'dist/resume-runner.js',
      'dist/runtime.js',
      'dist/smoke.js',
      'dist/status.d.ts',
      'dist/status.js',
      'goal-first.patch.yml',
      'model.patch.yml',
      'package.json',
      'resume.patch.yml',
    ]
    requireAssertion(JSON.stringify(runtimeFiles) === JSON.stringify(allowedRuntimeFiles), 'installed Runtime Bundle file set is not exact')
    const runtimePatchPath = resolve(runtimeRoot, 'cordis.patch.yml')
    const metaPath = resolve(repoRoot, 'packages/tianwen-runtime-bundle/dist/runtime.meta.json')
    const runtimeTextFiles = allowedRuntimeFiles.map(file => readFileSync(resolve(runtimeRoot, file)))
    assertNoRuntimeForbiddenReferences([readFileSync(metaPath), ...runtimeTextFiles])
    const tarball = tarballFiles(runtimeTarball)
    const packedFiles = tarball.files
    requireAssertion(JSON.stringify(packedFiles) === JSON.stringify(allowedRuntimeFiles), 'Runtime tarball file set is not exact')
    if (bundleNames.includes(webAppPackage)) {
      const runtimeManifest = JSON.parse(readFileSync(resolve(runtimeRoot, 'package.json'), 'utf8'))
      requireAssertion(
        runtimeManifest.exports?.['./client']?.default === './dist/client.js'
        && runtimeManifest.exports?.['./package.json'] === './package.json'
        && JSON.stringify(runtimeManifest.dsh?.client?.inject) === JSON.stringify(runtimeClientInject)
        && runtimeManifest.dsh?.client?.platform === 'web'
        && existsSync(resolve(runtimeRoot, 'dist/client.js'))
        && packedFiles.includes('dist/client.js'),
        'Runtime Web client metadata or artifact is wrong',
      )
      runtimeBundle.client = {
        export: runtimeManifest.exports['./client'].default,
        manifestExport: runtimeManifest.exports['./package.json'],
        inject: runtimeManifest.dsh.client.inject,
        platform: runtimeManifest.dsh.client.platform,
        installedArtifact: 'dist/client.js',
        packedArtifact: 'dist/client.js',
        browserCodeImportedByVerifier: false,
      }
    }
    const authoredRuntimePatch = parseRuntimePatch(readFileSync(resolve(repoRoot, 'packages/tianwen-runtime-bundle/cordis.patch.yml'), 'utf8'))
    const installedRuntimePatch = parseRuntimePatch(readFileSync(resolve(runtimeRoot, 'cordis.patch.yml'), 'utf8'))
    requireAssertion(JSON.stringify(authoredRuntimePatch) === JSON.stringify(installedRuntimePatch), 'installed Runtime patch differs from authored patch')
    const runtimeRow = dumpedRow(dump, 'tianwen-runtime')
    requireAssertion(
      rowValue(runtimeRow, /^ {2}name: (.+)$/u, 'name') === runtimeSpecifier
      && !runtimeRow.lines.some(line => /^ {4}evolutionRoot:/u.test(line)),
      'dumped Runtime row is wrong',
    )
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    const external = [...new Set(meta.outputs['dist/runtime.js'].imports.filter(item => item.external && !item.path.startsWith('node:')).map(item => item.path))].sort()
    requireAssertion(
      JSON.stringify(external) === JSON.stringify([
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-agent',
        '@deepseek-ai/dsh-goal',
        '@deepseek-ai/dsh-llm',
        '@deepseek-ai/dsh-session',
        '@deepseek-ai/dsh-session-persistence-jsonl',
        '@deepseek-ai/dsh-skill',
        '@deepseek-ai/dsh-tools',
      ])
      && external.every(specifier => runtimeBundle.externalSpecifiers.includes(specifier)),
      'Runtime metafile external closure differs from the runtime entry contract',
    )
    runtimeBundle.install = { tarball: { path: runtimeTarball, sha256: sha256(readFileSync(runtimeTarball)), files: packedFiles, executable: tarball.executable, argv: tarball.argv }, files: runtimeFiles, forbiddenReferences: { passed: true }, external }
  }

  const requireFromDsh = createRequire(realpathSync(resolve(
    repoRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'package.json',
  )))
  const resolvedBaseManifestPath = requireFromDsh.resolve(
    `${basePackage}/package.json`,
  )
  requireAssertion(
    existsSync(resolvedBaseManifestPath),
    `resolved base manifest is missing: ${resolvedBaseManifestPath}`,
  )
  const resolvedBaseManifest = JSON.parse(
    readFileSync(resolvedBaseManifestPath, 'utf8'),
  )

  let probeComposition = {}
  if (!productMode) {
    const installedBundleRoot = childPath(
      profileRoot,
      'node_modules',
      '@tianwen',
      'dsh-probe-bundle',
    )
    const expectedBundleFiles = [
      'package.json',
      'cordis.patch.yml',
      'dist/index.js',
      'dist/index.d.ts',
      'dist/adapter.js',
      'dist/adapter.d.ts',
    ]
    const packageFilesPresent = Object.fromEntries(
      expectedBundleFiles.map(path => [
        path,
        existsSync(resolve(installedBundleRoot, path)),
      ]),
    )

    const authoredPatch = parseAuthoredPatch(readFileSync(
      resolve(repoRoot, 'packages/tianwen-dsh-probe-bundle/cordis.patch.yml'),
      'utf8',
    ))
    const installedPatch = parseAuthoredPatch(readFileSync(
      resolve(installedBundleRoot, 'cordis.patch.yml'),
      'utf8',
    ))
    requireAssertion(
      JSON.stringify(installedPatch) === JSON.stringify(authoredPatch),
      'installed Bundle patch differs from the authored patch',
    )
    const dumpedDefaultModel = parseDumpedDefaultModel(dump)
    const dumpedAdapter = parseDumpedAdapter(dump)
    const baseLayerOffset = dump.indexOf(basePackage)
    const bundleLayerOffset = dump.indexOf(bundlePackage)
    const assertions = {
      adapterPackagePresent:
        dumpedAdapter.name === bundleAdapterPackage,
      adapterRowPresent:
        dumpedAdapter.id === 'tianwen-probe-adapter',
      authoredPatchExactlyThreeOperations:
        authoredPatch.defaultModel.provider === 'tianwen-probe'
        && authoredPatch.defaultModel.model === 'scripted'
        && authoredPatch.insertedAdapter.id === 'tianwen-probe-adapter'
        && authoredPatch.insertedAdapter.name === bundleAdapterPackage
        && authoredPatch.insertedCompositionProbe.id === 'tianwen-composition-probe'
        && authoredPatch.insertedCompositionProbe.name === '@tianwen/dsh-probe-bundle/composition'
        && authoredPatch.insertedCompositionProbe.disabledByDefault === true,
      baseBeforeBundle:
        baseIndex >= 0
        && bundleIndex > baseIndex
        && baseLayerOffset >= 0
        && bundleLayerOffset > baseLayerOffset,
      baseResolvedExactRc6:
        resolvedBaseManifest.version === expectedDshVersion,
      bundleLayerPresent: bundleLayerOffset >= 0,
      defaultModelProviderBoundToRow:
        dumpedDefaultModel.provider === 'tianwen-probe',
      defaultModelScriptedBoundToRow:
        dumpedDefaultModel.model === 'scripted',
      installedBundleComplete:
        Object.values(packageFilesPresent).every(Boolean),
      installedPatchMatchesAuthoredPatch:
        JSON.stringify(installedPatch) === JSON.stringify(authoredPatch),
      publicAdapterExportImported:
        publicExportEvidence.adapterName === 'tianwen-probe-adapter',
      publicRootExportImported:
        publicExportEvidence.rootIdentity === 'tianwen-probe',
    }
    for (const [name, passed] of Object.entries(assertions)) {
      requireAssertion(passed, `profile assertion failed: ${name}`)
    }
    probeComposition = {
      bundlePackage,
      bundleSpecifier: profileManifest.dependencies[bundlePackage],
      packageFilesPresent,
      authoredPatch,
      dumpedDefaultModel,
      dumpedAdapter,
      publicExports: publicExportEvidence,
      assertions,
    }
  }

  const primaryTarball = productMode ? runtimeTarball : tarball

  const report = {
    schemaVersion: 'tianwen.dsh_profile_probe.v1',
    profile: profileName,
    paths: {
      probeRoot,
      dshHome,
      profileRoot,
      packsRoot,
      profileVirtualStore,
      workspaceVirtualStore,
      corepackHome: childCorepackHome,
      pnpmHome: childPath(probeRoot, 'pnpm-home'),
      pnpmCache: childPath(probeRoot, 'pnpm-cache'),
      pnpmStore: childPath(probeRoot, 'pnpm-store'),
      npmCache: childPath(probeRoot, 'npm-cache'),
      appData: childPath(probeRoot, 'app-data'),
      localAppData: childPath(probeRoot, 'local-app-data'),
      userProfile: childPath(probeRoot, 'user-profile'),
      temp: childPath(probeRoot, 'temp'),
    },
    commands,
    tarball: {
      path: primaryTarball,
      sha256: sha256(readFileSync(primaryTarball)),
    },
    composition: {
      layerOrder: bundleNames,
      basePackage,
      baseResolutionAuthority: '@deepseek-ai/dsh public dependency closure',
      baseResolvedVersion: resolvedBaseManifest.version,
      ...probeComposition,
      dumpConfigSha256: sha256(Buffer.from(dump, 'utf8')),
      ...(migrationMode ? { runtimeBundle, runtimeInstall: runtimeBundle.install } : {}),
    },
    forbiddenEffects: {
      interactiveAppStarts: 0,
      modelRequests: 0,
      paidModelRequests: 0,
      liveWebRequests: 0,
      dockerInvocations: 0,
    },
    executionBoundary: {
      ...installBoundary,
      dependencyReplay: 'offline',
      corepackNetwork: 'disabled',
      packageManager: 'pnpm@11.20.0',
      credentialVariablesPassed: [],
      fixedProfile: profileName,
      fixedTarballBasename: basename(primaryTarball),
      fixedTarballPath: primaryTarball,
      fixedUpstreamPluginArgv: upstreamArgs,
      allowedBuildPackages: profileName === 'web' ? ['koffi'] : [],
      ...(webKoffiPolicy === undefined ? {} : { dependencyOverride: webKoffiPolicy }),
      tarballProducedByCurrentRun: producedByCurrentRun,
    },
  }
  const temporaryReportPath = `${reportPath}.tmp`
  writeFileSync(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  renameSync(temporaryReportPath, reportPath)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

if (
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    process.stderr.write(`verify-dsh-profile: ${message}\n`)
    process.exitCode = 1
  }
}
