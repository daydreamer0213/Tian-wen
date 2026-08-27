import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

function prefetchOfflineDependencies() {
  const seedRoot = resolve(probeRoot, 'dependency-prefetch')
  const temp = resolve(probeRoot, 'temp')
  mkdirSync(seedRoot, { recursive: true })
  mkdirSync(temp, { recursive: true })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NPM_CONFIG_CACHE: resolve(probeRoot, 'npm-cache'),
    PNPM_CONFIG_AUTO_INSTALL_PEERS: 'false',
    PNPM_CONFIG_CACHE_DIR: resolve(probeRoot, 'pnpm-cache'),
    PNPM_CONFIG_STORE_DIR: resolve(probeRoot, 'pnpm-store'),
    TEMP: temp,
    TMP: temp,
  }
  delete env.NPM_CONFIG_OFFLINE
  delete env.PNPM_CONFIG_OFFLINE
  const pnpm = process.env.npm_execpath
    ?? resolve(process.env.COREPACK_HOME ?? 'D:/DevData/corepack-home', 'v1/pnpm/11.20.0/bin/pnpm.mjs')
  const dependencies = new Set<string>()
  for (const manifestPath of [
    'packages/tianwen-dsh-probe-bundle/package.json',
    'packages/tianwen-runtime-bundle/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')) as {
      dependencies: Record<string, string>
    }
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      dependencies.add(`${name}@${version}`)
    }
  }
  const result = spawnSync(process.execPath, [
    pnpm,
    '--dir', seedRoot,
    'add', ...[...dependencies].sort(),
    '--ignore-scripts',
  ], { cwd: root, encoding: 'utf8', env, shell: false, timeout: 120_000 })
  rmSync(seedRoot, { recursive: true, force: true })
  if (result.status !== 0) {
    throw new Error(`dependency prefetch failed\n${result.stdout}\n${result.stderr}`)
  }
}

describe('Tianwen Runtime Bundle Profile', () => {
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
      inject: ['dynamicCordisRunner'],
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
      tarball: expect.objectContaining({ path: expect.stringContaining('tianwen-runtime-bundle-0.0.0.tgz'), sha256: expect.any(String), executable: expect.stringMatching(/System32\\tar\.exe$/iu), argv: expect.any(Array) }),
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
    const result = verify({ TIANWEN_DSH_MIGRATION_PROFILE: undefined })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(existsSync(profileReport)).toBe(true)
    expect(existsSync(migrationReport)).toBe(false)
    const report = JSON.parse(readFileSync(profileReport, 'utf8'))
    expect(report.composition.layerOrder).toEqual(['@deepseek-ai/dsh-base', '@tianwen/dsh-probe-bundle'])
    expect(report.commands.some(command => command.label.includes('runtime'))).toBe(false)
  }, 300_000)

})
