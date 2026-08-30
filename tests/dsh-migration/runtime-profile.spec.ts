import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertNoRuntimeForbiddenReferences } from '../../scripts/verify-dsh-profile.mjs'

const root = resolve(import.meta.dirname, '../..')
const enabled = process.env.TIANWEN_DSH_MIGRATION_PROFILE === '1'
const probeParent = process.env.TIANWEN_DSH_PROBE_ROOT
  ?? 'D:/DevData/tianwen-test-fixtures'
const probeRoot = resolve(probeParent, 'runtime-profile')
const migrationReport = `${probeRoot}/migration-profile-report.json`
const profileReport = `${probeRoot}/profile-report.json`

function verify(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [resolve(root, 'scripts/verify-dsh-profile.mjs')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TIANWEN_DSH_PROBE_ROOT: probeRoot, ...env }, shell: false, timeout: 240_000,
  })
}

function dependencyPreparationEnvironment(selectedRoot: string, source: NodeJS.ProcessEnv) {
  const paths = {
    appData: resolve(selectedRoot, 'app-data'),
    localAppData: resolve(selectedRoot, 'local-app-data'),
    npmCache: resolve(selectedRoot, 'npm-cache'),
    npmConfig: resolve(selectedRoot, 'npm-config'),
    npmPrefix: resolve(selectedRoot, 'npm-prefix'),
    pnpmCache: resolve(selectedRoot, 'pnpm-cache'),
    pnpmHome: resolve(selectedRoot, 'pnpm-home'),
    pnpmStore: resolve(selectedRoot, 'pnpm-store'),
    temp: resolve(selectedRoot, 'temp'),
    userProfile: resolve(selectedRoot, 'user-profile'),
    xdgCache: resolve(selectedRoot, 'xdg-cache'),
    xdgConfig: resolve(selectedRoot, 'xdg-config'),
    xdgData: resolve(selectedRoot, 'xdg-data'),
  }
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
  const userConfig = resolve(paths.npmConfig, 'user.npmrc')
  const globalConfig = resolve(paths.npmConfig, 'global.npmrc')
  writeFileSync(userConfig, '', 'utf8')
  writeFileSync(globalConfig, '', 'utf8')
  const systemRoot = source.SystemRoot ?? source.WINDIR
  if (process.platform === 'win32' && systemRoot === undefined) {
    throw new Error('SystemRoot is required for dependency preparation')
  }
  return {
    APPDATA: paths.appData,
    CI: 'true',
    ComSpec: systemRoot === undefined ? undefined : resolve(systemRoot, 'System32/cmd.exe'),
    HOME: paths.userProfile,
    LOCALAPPDATA: paths.localAppData,
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_CACHE: paths.npmCache,
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_PREFIX: paths.npmPrefix,
    NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com/',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_USERCONFIG: userConfig,
    PATH: [dirname(process.execPath), systemRoot === undefined ? undefined : resolve(systemRoot, 'System32')]
      .filter(value => value !== undefined)
      .join(delimiter),
    PATHEXT: source.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    PNPM_CONFIG_AUTO_INSTALL_PEERS: 'false',
    PNPM_CONFIG_CACHE_DIR: paths.pnpmCache,
    PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
    PNPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com/',
    PNPM_CONFIG_STORE_DIR: paths.pnpmStore,
    PNPM_HOME: paths.pnpmHome,
    SystemRoot: systemRoot,
    TEMP: paths.temp,
    TMP: paths.temp,
    USERPROFILE: paths.userProfile,
    WINDIR: systemRoot,
    XDG_CACHE_HOME: paths.xdgCache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    XDG_DATA_HOME: paths.xdgData,
  }
}

function retainedPnpm(source: NodeJS.ProcessEnv) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    packageManager?: string
  }
  if (manifest.packageManager !== 'pnpm@11.20.0') {
    throw new Error('dependency preparation requires packageManager pnpm@11.20.0')
  }
  const configuredCorepackHome = source.COREPACK_HOME ?? 'D:/DevData/corepack-home'
  if (!isAbsolute(configuredCorepackHome)) throw new Error('COREPACK_HOME must be absolute')
  const corepackHome = resolve(configuredCorepackHome)
  let actualCorepackHome = corepackHome
  if (process.platform === 'win32') {
    const approvedCorepackHome = realpathSync('D:/DevData/corepack-home')
    actualCorepackHome = realpathSync(corepackHome)
    if (actualCorepackHome.toLowerCase() !== approvedCorepackHome.toLowerCase()) {
      throw new Error('COREPACK_HOME must be the approved D:/DevData/corepack-home')
    }
  }
  const pnpmRoot = realpathSync(resolve(corepackHome, 'v1/pnpm/11.20.0'))
  const pnpmRootChild = relative(actualCorepackHome, pnpmRoot)
  if (pnpmRootChild === '' || pnpmRootChild.startsWith('..') || isAbsolute(pnpmRootChild)) {
    throw new Error('retained pnpm root must stay under COREPACK_HOME')
  }
  const metadata = JSON.parse(readFileSync(resolve(pnpmRoot, '.corepack'), 'utf8')) as {
    locator?: { name?: string, reference?: string }
    bin?: { pnpm?: string }
  }
  if (metadata.locator?.name !== 'pnpm'
    || metadata.locator.reference !== '11.20.0'
    || metadata.bin?.pnpm !== './bin/pnpm.mjs') {
    throw new Error('retained Corepack pnpm metadata does not match pnpm@11.20.0')
  }
  const pnpm = realpathSync(resolve(pnpmRoot, 'bin/pnpm.mjs'))
  const pnpmChild = relative(pnpmRoot, pnpm)
  if (pnpmChild.startsWith('..') || isAbsolute(pnpmChild) || !statSync(pnpm).isFile()) {
    throw new Error('retained pnpm executable must be a file under its exact package')
  }
  return pnpm
}

function prefetchOfflineDependencies() {
  const seedRoot = resolve(probeRoot, 'dependency-prefetch')
  mkdirSync(seedRoot, { recursive: true })
  const env = dependencyPreparationEnvironment(probeRoot, process.env)
  const pnpm = retainedPnpm(process.env)
  const dependencies = new Set<string>()
  for (const manifestPath of [
    'packages/tianwen-dsh-probe-bundle/package.json',
    'packages/tianwen-runtime-bundle/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      dependencies.add(`${name}@${version}`)
    }
  }
  try {
    const result = spawnSync(process.execPath, [
      pnpm,
      '--dir', seedRoot,
      'add', ...[...dependencies].sort(),
      '--ignore-scripts',
    ], { cwd: root, encoding: 'utf8', env, shell: false, timeout: 120_000 })
    if (result.status !== 0) {
      throw new Error(`dependency prefetch failed\n${result.stdout}\n${result.stderr}`)
    }
  } finally {
    rmSync(seedRoot, { recursive: true, force: true })
  }
}

describe('Tianwen Runtime Bundle Profile', () => {
  it('contains dependency preparation despite contaminated user and npm environments', () => {
    const selectedRoot = resolve(probeRoot, 'dependency-preparation-env-contract')
    rmSync(selectedRoot, { recursive: true, force: true })
    try {
      const env = dependencyPreparationEnvironment(selectedRoot, {
        APPDATA: 'C:/contaminated/app-data',
        COREPACK_HOME: 'D:/DevData/corepack-home',
        LOCALAPPDATA: 'C:/contaminated/local-app-data',
        NPM_CONFIG_USERCONFIG: 'C:/contaminated/.npmrc',
        NPM_TOKEN: 'credential-marker',
        SystemRoot: process.env.SystemRoot,
        USERPROFILE: 'C:/contaminated/user-profile',
        WINDIR: process.env.WINDIR,
      })
      expect(env).toMatchObject({
        APPDATA: resolve(selectedRoot, 'app-data'),
        LOCALAPPDATA: resolve(selectedRoot, 'local-app-data'),
        NPM_CONFIG_GLOBALCONFIG: resolve(selectedRoot, 'npm-config/global.npmrc'),
        NPM_CONFIG_USERCONFIG: resolve(selectedRoot, 'npm-config/user.npmrc'),
        PNPM_HOME: resolve(selectedRoot, 'pnpm-home'),
        USERPROFILE: resolve(selectedRoot, 'user-profile'),
      })
      expect(env).not.toHaveProperty('NPM_TOKEN')
      expect(env).not.toHaveProperty('npm_execpath')
      expect(readFileSync(env.NPM_CONFIG_USERCONFIG!, 'utf8')).toBe('')
      expect(readFileSync(env.NPM_CONFIG_GLOBALCONFIG!, 'utf8')).toBe('')
      expect(retainedPnpm({
        COREPACK_HOME: 'D:/DevData/corepack-home',
        npm_execpath: 'C:/contaminated/pnpm.cjs',
      })).toBe(realpathSync('D:/DevData/corepack-home/v1/pnpm/11.20.0/bin/pnpm.mjs'))
    } finally {
      rmSync(selectedRoot, { recursive: true, force: true })
    }
  })

  it('keeps the real migration Profile gate opt-in', () => {
    expect(existsSync(resolve(root, 'scripts/verify-dsh-profile.mjs'))).toBe(true)
  })

  it('rejects forbidden references in full Runtime manifest and metafile', () => {
    expect(() => assertNoRuntimeForbiddenReferences(['{"optionalDependencies":{"probe":"@tianwen/dsh-probe-bundle/adapter"}}'])).toThrow()
    expect(() => assertNoRuntimeForbiddenReferences(['{"inputs":{"probe/adapter.ts":{}}}'])).toThrow()
  })

  it.runIf(enabled)('leaves an authorized stale report untouched when root validation fails', () => {
    mkdirSync(probeRoot, { recursive: true })
    writeFileSync(migrationReport, '{"stale":true}\n')
    const result = verify({
      TIANWEN_DSH_MIGRATION_PROFILE: '1',
      TIANWEN_DSH_PROBE_ROOT: '',
    })
    expect(result.status).toBe(1)
    expect(existsSync(migrationReport)).toBe(true)
  })

  it.runIf(enabled)('invalidates a stale migration report before early setup failure', () => {
    mkdirSync(probeRoot, { recursive: true })
    writeFileSync(migrationReport, '{"stale":true}\n')
    const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: '1', COREPACK_HOME: 'D:/DevData/missing-corepack' })
    expect(result.status).not.toBe(0)
    expect(existsSync(migrationReport)).toBe(false)
  })

  it.runIf(enabled)('installs and imports the Runtime Bundle through public DSH', () => {
    prefetchOfflineDependencies()
    const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: '1' })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const report = JSON.parse(readFileSync(
      migrationReport,
      'utf8',
    ))
    expect(report.composition.layerOrder).toEqual([
      '@deepseek-ai/dsh-base',
      '@tianwen/dsh-probe-bundle',
      '@tianwen/runtime-bundle',
    ])
    expect(report.composition.runtimeBundle).toMatchObject({
      specifier: '@tianwen/runtime-bundle/runtime',
      name: 'tianwen-runtime',
      inject: [],
      supportedDshVersion: '0.1.1-rc.2',
      externalSpecifiers: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-agent',
        '@deepseek-ai/dsh-credentials',
        '@deepseek-ai/dsh-goal',
        '@deepseek-ai/dsh-llm',
        '@deepseek-ai/dsh-session',
        '@deepseek-ai/dsh-session-persistence-jsonl',
        '@deepseek-ai/dsh-skill',
        '@deepseek-ai/dsh-system-prompt',
        '@deepseek-ai/dsh-tools',
      ],
    })
    expect(report.paths).toMatchObject({
      probeRoot,
      dshHome: resolve(probeRoot, 'home'),
      profileRoot: resolve(probeRoot, 'home', 'profiles', 'tianwen-probe'),
      packsRoot: resolve(probeRoot, 'packs'),
      profileVirtualStore: resolve(probeRoot, 'profile-virtual-store'),
      workspaceVirtualStore: resolve(probeRoot, 'workspace-virtual-store'),
      corepackHome: resolve(probeRoot, 'corepack-home'),
      pnpmHome: resolve(probeRoot, 'pnpm-home'),
      pnpmCache: resolve(probeRoot, 'pnpm-cache'),
      pnpmStore: resolve(probeRoot, 'pnpm-store'),
      npmCache: resolve(probeRoot, 'npm-cache'),
      appData: resolve(probeRoot, 'app-data'),
      localAppData: resolve(probeRoot, 'local-app-data'),
      userProfile: resolve(probeRoot, 'user-profile'),
      temp: resolve(probeRoot, 'temp'),
    })
    expect(report.forbiddenEffects).toEqual({
      interactiveAppStarts: 0,
      modelRequests: 0,
      paidModelRequests: 0,
      liveWebRequests: 0,
      dockerInvocations: 0,
    })
    expect(report.composition.runtimeInstall).toMatchObject({
      tarball: expect.objectContaining({ path: expect.stringContaining('tianwen-runtime-bundle-0.1.3.tgz'), sha256: expect.any(String), executable: expect.stringMatching(/System32\\tar\.exe$/iu), argv: expect.any(Array) }),
      files: [
        'LICENSE',
        'controlled-lifecycle.patch.yml',
        'cordis.patch.yml',
        'create.patch.yml',
        'dist/cli.js',
        'dist/controlled-lifecycle-runner.js',
        'dist/create-runner.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/model-runner.js',
        'dist/resume-runner.js',
        'dist/runtime.js',
        'dist/smoke.js',
        'dist/status.d.ts',
        'dist/status.js',
        'model.patch.yml',
        'package.json',
        'resume.patch.yml',
      ],
      forbiddenReferences: { passed: true },
    })
    expect(report.commands.find(command => command.label === 'build-runtime-bundle')?.argv).toContain('@tianwen/runtime-bundle...')
  }, 300_000)

  it.runIf(!enabled)('keeps default Profile installation free of the Runtime layer', () => {
    rmSync(migrationReport, { force: true })
    prefetchOfflineDependencies()
    const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: undefined })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(existsSync(profileReport)).toBe(true)
    expect(existsSync(migrationReport)).toBe(false)
    const report = JSON.parse(readFileSync(profileReport, 'utf8'))
    expect(report.composition.layerOrder).toEqual(['@deepseek-ai/dsh-base', '@tianwen/dsh-probe-bundle'])
    expect(report.commands.some(command => command.label.includes('runtime'))).toBe(false)
  }, 300_000)

})
